import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  assertStudioDownstreamEligible,
} from "../production-contracts.mjs";
import {
  verifyMaterializedHeroAssurance,
} from "../materialized-hero-assurance.mjs";
import {
  assertRubricDefinition,
} from "../rubric-loop.mjs";
import DETAIL_PAGE_FLOW_POLICY from "../../../policies/detail-page-flow-v1.json" with { type: "json" };

const SHA256 = /^[a-f0-9]{64}$/;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export async function verifyBrowserCaptureHeroAssurance({
  projectRoot,
  revisionArtifact,
} = {}) {
  return verifyMaterializedHeroAssurance({
    projectRoot,
    revisionArtifact,
    consumerStage: "G4Q_RUBRIC",
  });
}
const REQUIRED_VIEWPORTS = Object.freeze([
  ...DETAIL_PAGE_FLOW_POLICY.canvas.hidden_responsive_qa_widths_px
    .filter(
      (width) =>
        width !== DETAIL_PAGE_FLOW_POLICY.canvas.authoring_width_css_px,
    )
    .map((width) =>
      Object.freeze({
        width,
        height: 900,
        device_scale_factor: 1,
        purpose: "hidden_overflow_qa",
      }),
    ),
  Object.freeze({
    width: DETAIL_PAGE_FLOW_POLICY.canvas.authoring_width_css_px,
    height: 900,
    device_scale_factor:
      DETAIL_PAGE_FLOW_POLICY.canvas.delivery_asset_width_px /
      DETAIL_PAGE_FLOW_POLICY.canvas.authoring_width_css_px,
    purpose: "authoring_and_delivery",
  }),
]);
const QA_CONSUMERS = Object.freeze(
  DETAIL_PAGE_FLOW_POLICY.orchestration.independent_qa_lanes.map(
    (qaRole) =>
      Object.freeze({
        qa_role: qaRole,
        consumer:
          `${qaRole[0].toUpperCase()}${qaRole.slice(1)}QaAgent`,
      }),
  ),
);

export const PINNED_BEHANCE_RUBRIC = Object.freeze({
  rubric_id: "behance-commerce",
  rubric_version: "behance-commerce-v0.1",
  rubric_sha256:
    "2dde69f994ffaf32518fa6f66d586559d36a2cfc61835a3695877e100fac4c55",
  policy_id: "policy.qa.behance-commerce.v0.1",
  policy_sha256:
    "66a11c24f43fd1c66fa17e1dadf7aa79dd5663eae4bc5b1d09d8fba9e3de4e65",
  source_snapshot_id: "behance-detail-page-2026-07-30-s01-s08",
  source_snapshot_sha256:
    "9db5fcded9c2ef114875836c31e9a0cdef2c24081547dc2747f8959f1d7c43c6",
});

export class BrowserCaptureAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BrowserCaptureAdapterError";
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalSha256(value) {
  return sha256(canonicalJson(value));
}

function clone(value) {
  return structuredClone(value);
}

function assertSha256(value, field, code = "INVALID_INPUT_DIGEST") {
  if (!SHA256.test(String(value ?? ""))) {
    throw new BrowserCaptureAdapterError(
      code,
      `${field}는 SHA-256이어야 합니다.`,
      { field, value },
    );
  }
}

function assertNonEmptyString(value, field, code) {
  if (typeof value !== "string" || value.length === 0) {
    throw new BrowserCaptureAdapterError(
      code,
      `${field}가 필요합니다.`,
      { field },
    );
  }
  return value;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function assertAbsoluteDirectoryPath(value, field) {
  const text = assertNonEmptyString(
    value,
    field,
    "ABSOLUTE_PATH_REQUIRED",
  );
  if (!path.isAbsolute(text)) {
    throw new BrowserCaptureAdapterError(
      "ABSOLUTE_PATH_REQUIRED",
      `${field}는 절대 경로여야 합니다.`,
      { field, path: text },
    );
  }
  return path.resolve(text);
}

function resolveOutputRoots(allowedOutputRoot, outputRoot) {
  const allowed = assertAbsoluteDirectoryPath(
    allowedOutputRoot,
    "allowed_output_root",
  );
  const output = assertAbsoluteDirectoryPath(
    outputRoot,
    "output_root",
  );
  if (!isWithin(allowed, output)) {
    throw new BrowserCaptureAdapterError(
      "OUTPUT_PATH_ESCAPE",
      "capture output_root는 허용된 output root 내부여야 합니다.",
      {
        allowed_output_root: allowed,
        output_root: output,
      },
    );
  }
  return { allowed, output };
}

async function materializedCaptureLocator(workOrder, absolutePath) {
  const [target, projectRoot, allowedOutputRoot] = await Promise.all([
    realpath(path.resolve(absolutePath)),
    realpath(path.resolve(workOrder.project_root)),
    realpath(path.resolve(workOrder.allowed_output_root)),
  ]);
  const [rootId, root] = isWithin(projectRoot, target)
    ? ["project", projectRoot]
    : ["allowed_output", allowedOutputRoot];
  if (!isWithin(root, target) || target === root) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_PATH_ESCAPE",
      "검증된 capture가 project/allowed output root 밖을 가리킵니다.",
      { path: target, root },
    );
  }
  return {
    root_id: rootId,
    locator: path.relative(root, target).split(path.sep).join("/"),
  };
}

function canonicalRelativePath(value, field = "relative_path") {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value === "." ||
    value === ".." ||
    value.startsWith("../")
  ) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_PATH_ESCAPE",
      `${field}는 output root 내부 canonical POSIX 상대 경로여야 합니다.`,
      { field, path: value },
    );
  }
  return value;
}

function canonicalUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value ?? ""));
  } catch {
    throw new BrowserCaptureAdapterError(
      "INVALID_CAPTURE_URL",
      "capture URL은 유효한 HTTP(S) URL이어야 합니다.",
      { url: value },
    );
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new BrowserCaptureAdapterError(
      "INVALID_CAPTURE_URL",
      "capture URL은 credential·fragment가 없는 HTTP(S) URL이어야 합니다.",
      { url: value },
    );
  }
  return parsed.href;
}

function assertImmutableRevision(revision) {
  try {
    assertStudioDownstreamEligible(revision, "G4Q_RUBRIC");
  } catch (error) {
    throw new BrowserCaptureAdapterError(
      "IMMUTABLE_STUDIO_REVISION_REQUIRED",
      "G4 capture에는 immutable Studio commit이 필요합니다.",
      { cause: error?.code ?? error?.message },
    );
  }
  assertNonEmptyString(
    revision?.revision_id,
    "revision.revision_id",
    "IMMUTABLE_STUDIO_REVISION_REQUIRED",
  );
  assertSha256(
    revision?.html_sha256,
    "revision.html_sha256",
    "IMMUTABLE_STUDIO_REVISION_REQUIRED",
  );
  assertSha256(
    revision?.rubric_sha256,
    "revision.rubric_sha256",
    "IMMUTABLE_STUDIO_REVISION_REQUIRED",
  );
  const {
    commit_sha256: suppliedCommitSha256,
    committed_at: committedAt,
    ...revisionBody
  } = revision;
  const actualCommitSha256 = canonicalSha256(revisionBody);
  if (suppliedCommitSha256 !== actualCommitSha256) {
    throw new BrowserCaptureAdapterError(
      "REVISION_COMMIT_HASH_MISMATCH",
      "Studio revision body와 commit SHA-256이 다릅니다.",
      {
        revision_id: revision.revision_id,
        expected_commit_sha256: suppliedCommitSha256,
        actual_commit_sha256: actualCommitSha256,
      },
    );
  }
  return {
    revision_id: revision.revision_id,
    revision_commit_sha256: suppliedCommitSha256,
    revision_artifact_id: revision.artifact_id,
    revision_artifact_sha256: revision.artifact_sha256,
    html_sha256: revision.html_sha256,
    rubric_sha256: revision.rubric_sha256,
    committed_at: committedAt,
  };
}

function assertHtmlManifest(htmlManifest, revisionSubject, url) {
  const manifestSha256 = htmlManifest?.manifest_sha256;
  assertSha256(
    manifestSha256,
    "html_manifest.manifest_sha256",
    "INVALID_HTML_MANIFEST",
  );
  assertNonEmptyString(
    htmlManifest?.artifact_id,
    "html_manifest.artifact_id",
    "INVALID_HTML_MANIFEST",
  );
  const { manifest_sha256: _manifestSha256, ...manifestBody } =
    htmlManifest;
  const actualManifestSha256 = canonicalSha256(manifestBody);
  if (manifestSha256 !== actualManifestSha256) {
    throw new BrowserCaptureAdapterError(
      "HTML_MANIFEST_HASH_MISMATCH",
      "HTML manifest body와 manifest SHA-256이 다릅니다.",
      {
        expected_manifest_sha256: manifestSha256,
        actual_manifest_sha256: actualManifestSha256,
      },
    );
  }
  const expected = {
    revision_id: revisionSubject.revision_id,
    revision_commit_sha256:
      revisionSubject.revision_commit_sha256,
    html_sha256: revisionSubject.html_sha256,
    render_url: url,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (htmlManifest?.[field] !== expectedValue) {
      throw new BrowserCaptureAdapterError(
        "HTML_REVISION_BINDING_MISMATCH",
        "HTML manifest가 exact Studio revision·HTML·URL에 묶이지 않았습니다.",
        {
          field,
          expected: expectedValue,
          actual: htmlManifest?.[field],
        },
      );
    }
  }
  return {
    artifact_id: htmlManifest.artifact_id,
    manifest_sha256: manifestSha256,
  };
}

function assertRubricBinding(rubricDefinition, revisionSubject) {
  let verified;
  try {
    verified = assertRubricDefinition(rubricDefinition);
  } catch (error) {
    throw new BrowserCaptureAdapterError(
      "INVALID_RUBRIC_POLICY",
      "rubric definition 자체 검증에 실패했습니다.",
      { cause: error?.code ?? error?.message },
    );
  }
  const actual = {
    rubric_id: verified.rubric_id,
    rubric_version:
      verified.rubric_version ?? verified.version,
    rubric_sha256: verified.rubric_sha256,
    policy_id: verified.policy?.policy_id,
    policy_sha256: verified.policy?.sha256,
    source_snapshot_id: verified.source_snapshot?.snapshot_id,
    source_snapshot_sha256: verified.source_snapshot?.sha256,
  };
  for (const [field, expected] of Object.entries(
    PINNED_BEHANCE_RUBRIC,
  )) {
    if (actual[field] !== expected) {
      throw new BrowserCaptureAdapterError(
        "RUBRIC_POLICY_PIN_MISMATCH",
        "capture는 현재 고정된 Behance rubric policy hash만 사용할 수 있습니다.",
        { field, expected, actual: actual[field] },
      );
    }
  }
  if (revisionSubject.rubric_sha256 !== actual.rubric_sha256) {
    throw new BrowserCaptureAdapterError(
      "REVISION_RUBRIC_HASH_MISMATCH",
      "Studio revision의 rubric hash가 capture rubric과 다릅니다.",
      {
        revision_rubric_sha256: revisionSubject.rubric_sha256,
        capture_rubric_sha256: actual.rubric_sha256,
      },
    );
  }
  return actual;
}

function assertBrowserHarness(browserHarness) {
  if (
    browserHarness?.executable !== "browser-harness" ||
    typeof browserHarness?.version !== "string" ||
    browserHarness.version.length === 0
  ) {
    throw new BrowserCaptureAdapterError(
      "BROWSER_HARNESS_ATTESTATION_REQUIRED",
      "browser-harness executable과 version이 필요합니다.",
    );
  }
  assertSha256(
    browserHarness.code_sha256,
    "browser_harness.code_sha256",
    "BROWSER_HARNESS_ATTESTATION_REQUIRED",
  );
  return {
    executable: "browser-harness",
    version: browserHarness.version,
    code_sha256: browserHarness.code_sha256,
  };
}

function pythonString(value) {
  return JSON.stringify(String(value));
}

function capturePython({
  subject,
  workOrderSha256,
  captureSetId,
  url,
  outputRoot,
  recordingName,
  captures,
  browserHarness,
}) {
  const specifications = captures.map((capture) => ({
    capture_id: capture.capture_id,
    relative_path: capture.relative_path,
    viewport: capture.viewport,
  }));
  return `from pathlib import Path
import base64
from datetime import datetime, timezone
import hashlib
import json
import struct
import subprocess
import time
import browser_harness.helpers as _bh_helpers


def _g4_send_with_large_capture_timeout(request):
    connection, token = _bh_helpers.ipc.connect(
        _bh_helpers.NAME,
        timeout=120.0,
    )
    try:
        response = _bh_helpers.ipc.request(connection, token, request)
    finally:
        connection.close()
    if "error" in response:
        raise RuntimeError(response["error"])
    return response


_bh_helpers._send = _g4_send_with_large_capture_timeout

URL = ${pythonString(url)}
OUTPUT_ROOT = Path(${pythonString(outputRoot)})
RECORDING_NAME = ${pythonString(recordingName)}
WORK_ORDER_SHA256 = ${pythonString(workOrderSha256)}
CAPTURE_SET_ID = ${pythonString(captureSetId)}
SUBJECT = json.loads(${pythonString(JSON.stringify(subject))})
BROWSER_HARNESS = json.loads(${pythonString(JSON.stringify(browserHarness))})
SPECS = json.loads(${pythonString(JSON.stringify(specifications))})

OUTPUT_ROOT.mkdir(parents=True, exist_ok=False)
recording_locator = start_recording(
    RECORDING_NAME,
    title="G4 deterministic Studio render capture",
)
observations = []


def _attach_without_focus(target_id):
    wrapped = switch_tab
    inner = (
        wrapped.__closure__[0].cell_contents
        if wrapped.__closure__
        else wrapped
    )
    private = inner.__globals__
    session_id = cdp(
        "Target.attachToTarget",
        targetId=target_id,
        flatten=True,
    )["sessionId"]
    private["_send"]({
        "meta": "set_session",
        "session_id": session_id,
        "target_id": target_id,
    })
    private["_mark_tab"]()
    return session_id


def new_background_tab(url="about:blank"):
    previous = current_tab()["targetId"]
    target_id = cdp(
        "Target.createTarget",
        url="about:blank",
        background=True,
    )["targetId"]
    _attach_without_focus(target_id)
    if url != "about:blank":
        goto_url(url)
        wait_for_load()
    return {
        "targetId": target_id,
        "previousTargetId": previous,
    }


def close_background_tab(context):
    cdp("Target.closeTarget", targetId=context["targetId"])
    _attach_without_focus(context["previousTargetId"])


capture_context = None
try:
    capture_context = new_background_tab(URL)
    if js("document.hasFocus()"):
        raise RuntimeError("BACKGROUND_FOCUS_VIOLATION")
    page_identity = js("""(() => ({
      href: location.href,
      sectionCount:
        document.querySelectorAll("[data-section-id]").length,
      heroFound:
        document.querySelector(
          '[data-section-id="section-hero"]'
        ) !== null,
      imageCount: document.images.length,
    }))()""")
    if (
        page_identity["href"] != URL or
        page_identity["sectionCount"] < 1 or
        not page_identity["heroFound"] or
        page_identity["imageCount"] < 1
    ):
        raise RuntimeError("DETAIL_PAGE_IDENTITY_MISMATCH")
    for spec in SPECS:
        viewport = spec["viewport"]
        cdp(
            "Emulation.setDeviceMetricsOverride",
            width=viewport["width"],
            height=viewport["height"],
            deviceScaleFactor=viewport["device_scale_factor"],
            mobile=False,
        )
        actual_dpr = float(js("devicePixelRatio"))
        zoom_factor = actual_dpr / viewport["device_scale_factor"]
        if abs(zoom_factor - 1) > 0.001:
            cdp(
                "Emulation.setDeviceMetricsOverride",
                width=round(viewport["width"] * zoom_factor),
                height=round(viewport["height"] * zoom_factor),
                deviceScaleFactor=(
                    viewport["device_scale_factor"] / zoom_factor
                ),
                mobile=False,
            )
        normalized_viewport = js("""({
          innerWidth,
          innerHeight,
          devicePixelRatio,
        })""")
        if (
            abs(
                normalized_viewport["innerWidth"] -
                viewport["width"]
            ) > 1 or
            normalized_viewport["innerHeight"] != viewport["height"] or
            abs(
                normalized_viewport["devicePixelRatio"] -
                viewport["device_scale_factor"]
            ) > 0.001
        ):
            raise RuntimeError("VIEWPORT_NORMALIZATION_FAILED")
        cdp(
            "Emulation.setEmulatedMedia",
            media="screen",
            features=[
                {"name": "prefers-reduced-motion", "value": "reduce"}
            ],
        )
        motion_freeze = js("""(() => {
          document.documentElement.style.scrollBehavior = "auto";
          let style = document.querySelector("[data-g4-stable-capture]");
          if (!style) {
            style = document.createElement("style");
            style.dataset.g4StableCapture = "true";
            style.textContent =
              "*,*::before,*::after{" +
              "animation-play-state:paused!important;" +
              "transition:none!important;" +
              "caret-color:transparent!important}";
            document.head.append(style);
          }
          document.getAnimations().forEach((animation) => {
            animation.pause();
            try { animation.currentTime = 0; } catch (_) {}
          });
          const motionFrames = Array.from(
            document.querySelectorAll("[data-motion-src]")
          );
          const posterFrames = Array.from(
            document.querySelectorAll("[data-poster-src]")
          );
          let posterImagePinnedCount = 0;
          let motionPosterPinnedCount = 0;
          posterFrames.forEach((frame) => {
            const wasMotionFrame =
              frame.hasAttribute("data-motion-src");
            const image = frame.querySelector("img");
            if (image && frame.dataset.posterSrc) {
              image.removeAttribute("srcset");
              image.src = frame.dataset.posterSrc;
              frame.removeAttribute("data-motion-src");
              frame.classList.remove("is-playing");
              frame.classList.add("is-fallback");
              posterImagePinnedCount += 1;
              if (wasMotionFrame) motionPosterPinnedCount += 1;
            }
          });
          Array.from(document.images).forEach((image) => {
            image.loading = "eager";
          });
          window.scrollTo(0, 0);
          return {
            motion_frame_count: motionFrames.length,
            poster_frame_count: posterFrames.length,
            poster_image_pinned_count: posterImagePinnedCount,
            poster_pinned_count: motionPosterPinnedCount,
            unfrozen_motion_frame_count:
              motionFrames.length - motionPosterPinnedCount,
          };
        })()""")
        js("""(async () => {
          await Promise.allSettled(
            Array.from(document.images).map((image) => image.decode())
          );
          return true;
        })()""")
        for _ in range(2):
            page_height = int(js("""Math.max(
              document.documentElement.scrollHeight,
              document.body ? document.body.scrollHeight : 0
            )"""))
            step = max(1, viewport["height"] // 2)
            for y in range(0, page_height + step, step):
                js(f"window.scrollTo(0, {min(y, page_height)})")
                time.sleep(0.03)
        js("window.scrollTo(0, 0)")
        ready = False
        for _ in range(100):
            ready = js("""(() =>
              document.fonts.status === "loaded" &&
              Array.from(document.images).every((image) =>
                image.complete &&
                (image.naturalWidth > 0 || image.currentSrc === "")
              )
            )()""")
            if ready:
                break
            time.sleep(0.1)
        if not ready:
            raise RuntimeError("PAGE_RESOURCES_NOT_STABLE")
        runtime_motion = js("""(() => {
          const animatedImagePattern = /[.](?:apng|gif)(?:[?#]|$)/i;
          const runningAnimations = document.getAnimations().filter(
            (animation) => animation.playState === "running"
          );
          const playingMedia = Array.from(
            document.querySelectorAll("video,audio")
          ).filter((media) => !media.paused && !media.ended);
          const animatedRasterImages = Array.from(document.images).filter(
            (image) => animatedImagePattern.test(
              image.currentSrc || image.src || ""
            )
          );
          return {
            remaining_motion_target_count:
              document.querySelectorAll("[data-motion-src]").length,
            playing_motion_frame_count:
              document.querySelectorAll(
                "[data-poster-src].is-playing"
              ).length,
            running_web_animation_count: runningAnimations.length,
            playing_media_count: playingMedia.length,
            animated_raster_image_count: animatedRasterImages.length,
          };
        })()""")
        motion_freeze.update(runtime_motion)
        actual_motion_detected = (
            motion_freeze["unfrozen_motion_frame_count"] > 0 or
            motion_freeze["remaining_motion_target_count"] > 0 or
            motion_freeze["playing_motion_frame_count"] > 0 or
            motion_freeze["running_web_animation_count"] > 0 or
            motion_freeze["playing_media_count"] > 0 or
            motion_freeze["animated_raster_image_count"] > 0
        )
        motion_freeze["actual_motion_detected"] = actual_motion_detected
        if actual_motion_detected:
            print(json.dumps({
                "viewport": viewport,
                "motion_freeze": motion_freeze,
            }))
            raise RuntimeError("ACTUAL_MOTION_PRESENT")
        metrics = js("""(() => {
          const root = document.documentElement;
          const body = document.body;
          const width = window.innerWidth;
          const offenders = Array.from(document.querySelectorAll("body *"))
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                section_id:
                  element.closest("[data-section-id]")?.dataset.sectionId ||
                  null,
                left: rect.left,
                right: rect.right,
              };
            })
            .filter((item) => item.left < -0.5 || item.right > width + 0.5)
            .slice(0, 20);
          return {
            viewport_width: width,
            document_client_width: root.clientWidth,
            document_scroll_width: root.scrollWidth,
            body_scroll_width: body ? body.scrollWidth : root.scrollWidth,
            offender_count: offenders.length,
            offenders,
            focus_observed: document.hasFocus(),
          };
        })()""")
        if metrics["focus_observed"]:
            raise RuntimeError("BACKGROUND_FOCUS_VIOLATION")
        if (
            metrics["document_scroll_width"] >
                metrics["document_client_width"] or
            metrics["body_scroll_width"] > viewport["width"] or
            metrics["offender_count"] != 0
        ):
            print(json.dumps({
                "viewport": viewport,
                "metrics": metrics,
            }))
            raise RuntimeError("MOBILE_OVERFLOW")
        metrics["observed_viewport_width"] = metrics["viewport_width"]
        metrics["viewport_width"] = viewport["width"]
        page_height = int(js("""Math.max(
          document.documentElement.scrollHeight,
          document.body ? document.body.scrollHeight : 0
        )"""))
        max_surface_height_physical = 16384
        use_tiled_capture = (
            page_height * viewport["device_scale_factor"] >
                max_surface_height_physical
        )
        tile_stability = []
        warmup_capture_count = 0
        if use_tiled_capture:
            tile_root = (
                OUTPUT_ROOT /
                (".tiles-" + spec["capture_id"])
            )
            tile_root.mkdir(parents=False, exist_ok=False)
            tile_specs = []
            y = 0
            tile_index = 0
            while y < page_height:
                tile_height = min(1500, page_height - y)
                capture_params = {
                    "format": "png",
                    "fromSurface": True,
                    "captureBeyondViewport": True,
                    "clip": {
                        "x": 0,
                        "y": y,
                        "width": viewport["width"],
                        "height": tile_height,
                        "scale": 1,
                    },
                }
                # The clip is expressed in document coordinates. Keeping the
                # viewport at the origin avoids a compositor re-rasterization
                # between the two stability samples.
                js("window.scrollTo(0, 0)")
                for _ in range(1):
                    cdp("Page.captureScreenshot", **capture_params)
                    warmup_capture_count += 1
                    time.sleep(0.25)
                first_tile = base64.b64decode(
                    cdp(
                        "Page.captureScreenshot",
                        **capture_params,
                    )["data"]
                )
                time.sleep(0.25)
                second_tile = base64.b64decode(
                    cdp(
                        "Page.captureScreenshot",
                        **capture_params,
                    )["data"]
                )
                if (
                    first_tile[:8] != b"\\x89PNG\\r\\n\\x1a\\n" or
                    second_tile[:8] != b"\\x89PNG\\r\\n\\x1a\\n"
                ):
                    raise RuntimeError("INVALID_TILE_PNG")
                tile_png_width, tile_png_height = struct.unpack(
                    ">II",
                    first_tile[16:24],
                )
                first_tile_sha = hashlib.sha256(
                    first_tile
                ).hexdigest()
                second_tile_sha = hashlib.sha256(
                    second_tile
                ).hexdigest()
                tile_measurement = {
                    "tile_index": tile_index,
                    "y_css_px": y,
                    "height_css_px": tile_height,
                    "png_width": tile_png_width,
                    "png_height": tile_png_height,
                    "first_png_sha256": first_tile_sha,
                    "second_png_sha256": second_tile_sha,
                }
                if first_tile_sha == second_tile_sha:
                    tile_measurement.update({
                        "exact_match": True,
                        "different_pixels": 0,
                        "total_pixels":
                            tile_png_width * tile_png_height,
                        "different_pixel_ratio": 0,
                        "significant_pixel_ratio": 0,
                        "severe_pixel_ratio": 0,
                        "max_channel_delta": 0,
                    })
                else:
                    first_temp = tile_root / ".first-temp.png"
                    second_temp = tile_root / ".second-temp.png"
                    first_temp.write_bytes(first_tile)
                    second_temp.write_bytes(second_tile)
                    compare_script = """
                      const sharp = require("sharp");
                      const firstPath = process.argv[1];
                      const secondPath = process.argv[2];
                      (async () => {
                        const first = await sharp(firstPath)
                          .raw().toBuffer({resolveWithObject: true});
                        const second = await sharp(secondPath)
                          .raw().toBuffer({resolveWithObject: true});
                        if (
                          first.info.width !== second.info.width ||
                          first.info.height !== second.info.height ||
                          first.info.channels !== second.info.channels
                        ) {
                          throw new Error("TILE_DIMENSION_MISMATCH");
                        }
                        let differentPixels = 0;
                        let significantPixels = 0;
                        let severePixels = 0;
                        let maxChannelDelta = 0;
                        const channels = first.info.channels;
                        for (
                          let offset = 0;
                          offset < first.data.length;
                          offset += channels
                        ) {
                          let changed = false;
                          let pixelMaxDelta = 0;
                          for (
                            let channel = 0;
                            channel < channels;
                            channel += 1
                          ) {
                            const delta = Math.abs(
                              first.data[offset + channel] -
                              second.data[offset + channel]
                            );
                            if (delta > 0) changed = true;
                            if (delta > maxChannelDelta) {
                              maxChannelDelta = delta;
                            }
                            if (delta > pixelMaxDelta) {
                              pixelMaxDelta = delta;
                            }
                          }
                          if (changed) differentPixels += 1;
                          if (pixelMaxDelta > 4) {
                            significantPixels += 1;
                          }
                          if (pixelMaxDelta > 12) severePixels += 1;
                        }
                        const totalPixels =
                          first.info.width * first.info.height;
                        process.stdout.write(JSON.stringify({
                          different_pixels: differentPixels,
                          total_pixels: totalPixels,
                          different_pixel_ratio:
                            differentPixels / totalPixels,
                          significant_pixel_ratio:
                            significantPixels / totalPixels,
                          severe_pixel_ratio:
                            severePixels / totalPixels,
                          max_channel_delta: maxChannelDelta,
                        }));
                      })().catch((error) => {
                        process.stderr.write(String(error));
                        process.exit(1);
                      });
                    """
                    comparison = json.loads(
                        subprocess.run(
                            [
                                "node",
                                "-e",
                                compare_script,
                                str(first_temp),
                                str(second_temp),
                            ],
                            check=True,
                            capture_output=True,
                            text=True,
                        ).stdout
                    )
                    first_temp.unlink()
                    second_temp.unlink()
                    tile_measurement.update({
                        "exact_match": False,
                        **comparison,
                    })
                    if (
                        comparison["different_pixel_ratio"] > 0.15 or
                        comparison["significant_pixel_ratio"] > 0.005 or
                        comparison["severe_pixel_ratio"] > 0.00025 or
                        comparison["max_channel_delta"] > 20
                    ):
                        (
                            OUTPUT_ROOT / "debug-first-tile.png"
                        ).write_bytes(first_tile)
                        (
                            OUTPUT_ROOT / "debug-second-tile.png"
                        ).write_bytes(second_tile)
                        print(json.dumps({
                            "unstable_tile": tile_measurement,
                        }))
                        raise RuntimeError(
                            "ANIMATION_STABLE_TILE_MISMATCH"
                        )
                tile_stability.append(tile_measurement)
                tile_path = (
                    tile_root / f"tile-{tile_index:03d}.png"
                )
                tile_path.write_bytes(first_tile)
                tile_specs.append(str(tile_path))
                y += tile_height
                tile_index += 1
            output_path = OUTPUT_ROOT / spec["relative_path"]
            stitch_script = """
              const sharp = require("sharp");
              const output = process.argv[1];
              const tiles = JSON.parse(process.argv[2]);
              (async () => {
                const metadata = await Promise.all(
                  tiles.map((tile) => sharp(tile).metadata())
                );
                const width = metadata[0].width;
                const height = metadata.reduce(
                  (total, item) => total + item.height,
                  0
                );
                let top = 0;
                const layers = tiles.map((tile, index) => {
                  const layer = {input: tile, left: 0, top};
                  top += metadata[index].height;
                  return layer;
                });
                await sharp({
                  create: {
                    width,
                    height,
                    channels: 3,
                    background: {r: 255, g: 255, b: 255},
                  },
                }).composite(layers).png().toFile(output);
              })().catch((error) => {
                process.stderr.write(String(error));
                process.exit(1);
              });
            """
            subprocess.run(
                [
                    "node",
                    "-e",
                    stitch_script,
                    str(output_path),
                    json.dumps(tile_specs),
                ],
                check=True,
            )
            first_png = output_path.read_bytes()
            second_png = first_png
            for tile_path in tile_root.iterdir():
                tile_path.unlink()
            tile_root.rmdir()
        else:
            cdp(
                "Page.captureScreenshot",
                format="png",
                fromSurface=True,
                captureBeyondViewport=True,
            )
            warmup_capture_count = 1
            time.sleep(0.25)
            first = cdp(
                "Page.captureScreenshot",
                format="png",
                fromSurface=True,
                captureBeyondViewport=True,
            )
            time.sleep(0.25)
            second = cdp(
                "Page.captureScreenshot",
                format="png",
                fromSurface=True,
                captureBeyondViewport=True,
            )
            first_png = base64.b64decode(first["data"])
            second_png = base64.b64decode(second["data"])
        expected_png_width = (
            viewport["width"] *
            viewport["device_scale_factor"]
        )
        first_png_width = struct.unpack(">I", first_png[16:20])[0]
        second_png_width = struct.unpack(">I", second_png[16:20])[0]
        if (
            first_png_width != expected_png_width or
            second_png_width != expected_png_width
        ):
            if (
                first_png_width != second_png_width or
                first_png_width <= 0 or
                expected_png_width / first_png_width < 0.5 or
                expected_png_width / first_png_width > 2
            ):
                raise RuntimeError("CAPTURE_WIDTH_NORMALIZATION_FAILED")
            first_source = OUTPUT_ROOT / ".first-width-source.png"
            second_source = OUTPUT_ROOT / ".second-width-source.png"
            first_output = OUTPUT_ROOT / ".first-width-normalized.png"
            second_output = OUTPUT_ROOT / ".second-width-normalized.png"
            first_source.write_bytes(first_png)
            second_source.write_bytes(second_png)
            width_script = """
              const sharp = require("sharp");
              const input = process.argv[1];
              const output = process.argv[2];
              const expectedWidth = Number(process.argv[3]);
              (async () => {
                const image = sharp(input);
                const metadata = await image.metadata();
                if (
                  metadata.width <= 0 ||
                  expectedWidth / metadata.width < 0.5 ||
                  expectedWidth / metadata.width > 2
                ) {
                  throw new Error("CAPTURE_WIDTH_RATIO_INVALID");
                }
                const normalized = image.resize({
                  width: expectedWidth,
                  kernel: "lanczos3",
                });
                await normalized.png().toFile(output);
              })().catch((error) => {
                process.stderr.write(String(error));
                process.exit(1);
              });
            """
            for source, output in (
                (first_source, first_output),
                (second_source, second_output),
            ):
                subprocess.run(
                    [
                        "node",
                        "-e",
                        width_script,
                        str(source),
                        str(output),
                        str(expected_png_width),
                    ],
                    check=True,
                )
            first_png = first_output.read_bytes()
            second_png = second_output.read_bytes()
            for temporary in (
                first_source,
                second_source,
                first_output,
                second_output,
            ):
                temporary.unlink()
        first_sha256 = hashlib.sha256(first_png).hexdigest()
        second_sha256 = hashlib.sha256(second_png).hexdigest()
        if first_sha256 != second_sha256:
            raise RuntimeError("ANIMATION_STABLE_FRAME_MISMATCH")
        if first_png[:8] != b"\\x89PNG\\r\\n\\x1a\\n":
            raise RuntimeError("INVALID_PNG")
        png_width, png_height = struct.unpack(">II", first_png[16:24])
        output_path = OUTPUT_ROOT / spec["relative_path"]
        output_path.write_bytes(first_png)
        observations.append({
            "capture_id": spec["capture_id"],
            "capture_set_id": CAPTURE_SET_ID,
            "relative_path": spec["relative_path"],
            "viewport": viewport,
            "full_page": True,
            "background_focus": False,
            "recording_locator": str(recording_locator),
            "png_sha256": first_sha256,
            "png_bytes": len(first_png),
            "png_width": png_width,
            "png_height": png_height,
            "no_overflow": {
                "status": "PASS",
                **metrics,
            },
            "stable_frame": {
                "status": "PASS",
                "sample_interval_ms": 250,
                "first_png_sha256": first_sha256,
                "second_png_sha256": second_sha256,
                "reduced_motion": True,
                "web_animations_paused": True,
                "css_transitions_disabled": True,
                "viewport_normalization": {
                    "site_zoom_factor": zoom_factor,
                    **normalized_viewport,
                },
                "motion_freeze": motion_freeze,
                "warmup_capture_count": warmup_capture_count,
                "perceptual_tiled_frame": {
                    "used": use_tiled_capture,
                    "surface_height_limit_physical_px":
                        max_surface_height_physical,
                    "page_height_css_px": page_height,
                    "tile_height_css_px": 1500,
                    "different_pixel_ratio_max": 0.15,
                    "significant_pixel_ratio_max": 0.005,
                    "significant_delta_threshold": 4,
                    "severe_pixel_ratio_max": 0.00025,
                    "severe_delta_threshold": 12,
                    "max_channel_delta_max": 20,
                    "tiles": tile_stability,
                },
            },
        })
finally:
    if capture_context:
        close_background_tab(capture_context)
    stop_recording()

receipt = {
    "schema_version": "1.0",
    "receipt_type": "browser_harness.capture_execution",
    "work_order_sha256": WORK_ORDER_SHA256,
    "capture_set_id": CAPTURE_SET_ID,
    "subject": SUBJECT,
    "browser_harness": BROWSER_HARNESS,
    "recording": {
        "required": True,
        "name": RECORDING_NAME,
        "locator": str(recording_locator),
    },
    "captures": observations,
    "completed_at": datetime.now(timezone.utc).isoformat(),
}
(OUTPUT_ROOT / "execution-observations.json").write_text(
    json.dumps(receipt, ensure_ascii=False, indent=2) + "\\n",
    encoding="utf-8",
)
print(json.dumps(receipt, ensure_ascii=False))
`;
}

function assertPlannedEnvelope(planned) {
  const workOrder = planned?.work_order;
  const commandPlan = planned?.command_plan;
  if (
    workOrder?.adapter !== "BrowserHarnessRenderCaptureAdapter" ||
    commandPlan?.adapter !== "BrowserHarnessRenderCaptureAdapter"
  ) {
    throw new BrowserCaptureAdapterError(
      "BROWSER_CAPTURE_PLAN_REQUIRED",
      "BrowserHarnessRenderCaptureAdapter 계획이 필요합니다.",
    );
  }
  const {
    work_order_sha256: suppliedWorkOrderSha256,
    ...workOrderBody
  } = workOrder;
  const {
    command_plan_sha256: suppliedCommandPlanSha256,
    ...commandPlanBody
  } = commandPlan;
  const actualWorkOrderSha256 = canonicalSha256(workOrderBody);
  const actualCommandPlanSha256 = canonicalSha256(commandPlanBody);
  if (
    suppliedWorkOrderSha256 !== actualWorkOrderSha256 ||
    suppliedCommandPlanSha256 !== actualCommandPlanSha256 ||
    planned?.planning_receipt?.work_order_sha256 !==
      actualWorkOrderSha256 ||
    planned?.planning_receipt?.command_plan_sha256 !==
      actualCommandPlanSha256
  ) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_PLAN_HASH_MISMATCH",
      "capture WorkOrder 또는 command plan이 계획 뒤 변경됐습니다.",
    );
  }
  return { workOrder, commandPlan };
}

export function createBrowserCaptureWorkOrder({
  revision,
  htmlManifest,
  url,
  rubricDefinition,
  browserHarness,
  projectRoot,
  allowedOutputRoot,
  outputRoot,
} = {}) {
  const project = assertAbsoluteDirectoryPath(
    projectRoot,
    "project_root",
  );
  const roots = resolveOutputRoots(
    allowedOutputRoot,
    outputRoot,
  );
  const resolvedUrl = canonicalUrl(url);
  const revisionSubject = assertImmutableRevision(revision);
  const manifestSubject = assertHtmlManifest(
    htmlManifest,
    revisionSubject,
    resolvedUrl,
  );
  const rubricBinding = assertRubricBinding(
    rubricDefinition,
    revisionSubject,
  );
  const harnessBinding = assertBrowserHarness(browserHarness);
  const subject = {
    revision_id: revisionSubject.revision_id,
    revision_commit_sha256:
      revisionSubject.revision_commit_sha256,
    revision_artifact_id:
      revisionSubject.revision_artifact_id,
    revision_artifact_sha256:
      revisionSubject.revision_artifact_sha256,
    html_artifact_id: manifestSubject.artifact_id,
    html_manifest_sha256: manifestSubject.manifest_sha256,
    html_sha256: revisionSubject.html_sha256,
    render_url: resolvedUrl,
  };
  const captureSetDigest = canonicalSha256({
    subject,
    rubric_binding: rubricBinding,
    viewports: REQUIRED_VIEWPORTS,
  });
  const captureSetId =
    `render-capture-set-${captureSetDigest.slice(0, 20)}`;
  const recordingName =
    `g4-${revisionSubject.revision_id}-${captureSetDigest.slice(0, 10)}`;
  const captures = REQUIRED_VIEWPORTS.map((viewport) => ({
    capture_id:
      `capture-${captureSetDigest.slice(0, 12)}-${viewport.width}`,
    capture_set_id: captureSetId,
    relative_path: `viewport-${viewport.width}.png`,
    viewport: clone(viewport),
    full_page: true,
    background_focus: false,
    recording_required: true,
    stable_frame_required: true,
    no_overflow_required: true,
  }));
  const consumers = QA_CONSUMERS.map((consumer) => ({
    ...clone(consumer),
    capture_set_id: captureSetId,
  }));
  const workOrderBody = {
    schema_version: "1.0",
    work_order_type: "qa.render_capture",
    adapter: "BrowserHarnessRenderCaptureAdapter",
    stage_id: "G4Q_RENDER_CAPTURE",
    capture_set_id: captureSetId,
    subject,
    rubric_binding: rubricBinding,
    browser_harness: harnessBinding,
    execution_contract: {
      browser_mode: "local_cdp_background",
      focus: false,
      full_page: true,
      recording_required: true,
      reduced_motion: true,
      stable_frame_interval_ms: 250,
      exact_viewport_widths: REQUIRED_VIEWPORTS.map(
        (viewport) => viewport.width,
      ),
    },
    project_root: project,
    allowed_output_root: roots.allowed,
    output_root: roots.output,
    recording: {
      required: true,
      name: recordingName,
      latest_locator_forbidden: true,
    },
    captures,
    shared_consumers: consumers,
  };
  const workOrderSha256 = canonicalSha256(workOrderBody);
  const workOrder = {
    ...workOrderBody,
    work_order_sha256: workOrderSha256,
  };
  const script = capturePython({
    subject,
    workOrderSha256,
    captureSetId,
    url: resolvedUrl,
    outputRoot: roots.output,
    recordingName,
    captures,
    browserHarness: harnessBinding,
  });
  const commandPlanBody = {
    schema_version: "1.0",
    command_plan_type: "browser_harness.capture",
    adapter: "BrowserHarnessRenderCaptureAdapter",
    work_order_sha256: workOrderSha256,
    capture_set_id: captureSetId,
    subject: clone(subject),
    browser_harness: clone(harnessBinding),
    commands: [
      {
        step_id: "browser-harness-version-attestation",
        kind: "command",
        command: "browser-harness",
        argv: ["--version"],
        cwd: project,
        shell: false,
        expected_version: harnessBinding.version,
        expected_code_sha256: harnessBinding.code_sha256,
      },
      {
        step_id: "deterministic-full-page-capture",
        kind: "command",
        command: "browser-harness",
        argv: [],
        cwd: project,
        env: { BH_RECORD: "1" },
        shell: false,
        stdin_encoding: "utf8",
        stdin: script,
        stdin_sha256: sha256(script),
        output_receipt_relative_path:
          "execution-observations.json",
      },
    ],
  };
  const commandPlanSha256 = canonicalSha256(commandPlanBody);
  const commandPlan = {
    ...commandPlanBody,
    command_plan_sha256: commandPlanSha256,
  };
  return Object.freeze({
    schema_version: "1.0",
    work_order: workOrder,
    command_plan: commandPlan,
    planning_receipt: {
      schema_version: "1.0",
      receipt_type: "qa.render_capture.command_plan",
      adapter: "BrowserHarnessRenderCaptureAdapter",
      work_order_sha256: workOrderSha256,
      command_plan_sha256: commandPlanSha256,
      capture_set_id: captureSetId,
      subject: clone(subject),
      rubric_binding: clone(rubricBinding),
      browser_harness: clone(harnessBinding),
    },
  });
}

function parsePng(bytes, locator) {
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes.indexOf(Buffer.from("IDAT"), 24) === -1 ||
    bytes.indexOf(Buffer.from("IEND"), 24) === -1
  ) {
    throw new BrowserCaptureAdapterError(
      "INVALID_CAPTURE_PNG",
      "capture 파일은 IHDR·IDAT·IEND가 있는 PNG여야 합니다.",
      { locator },
    );
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1) {
    throw new BrowserCaptureAdapterError(
      "INVALID_CAPTURE_PNG",
      "PNG 폭과 높이는 양수여야 합니다.",
      { locator, width, height },
    );
  }
  return { width, height };
}

async function resolveSafeCaptureRoot(workOrder) {
  const allowedLexical = path.resolve(
    workOrder.allowed_output_root,
  );
  const outputLexical = path.resolve(workOrder.output_root);
  if (!isWithin(allowedLexical, outputLexical)) {
    throw new BrowserCaptureAdapterError(
      "OUTPUT_PATH_ESCAPE",
      "completion output_root가 허용 경로를 벗어났습니다.",
    );
  }
  let allowedInfo;
  let outputInfo;
  try {
    [allowedInfo, outputInfo] = await Promise.all([
      lstat(allowedLexical),
      lstat(outputLexical),
    ]);
  } catch (error) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_ROOT_MISSING",
      "capture output root를 찾을 수 없습니다.",
      { cause: error?.code },
    );
  }
  if (
    !allowedInfo.isDirectory() ||
    allowedInfo.isSymbolicLink() ||
    !outputInfo.isDirectory() ||
    outputInfo.isSymbolicLink()
  ) {
    throw new BrowserCaptureAdapterError(
      "UNSAFE_CAPTURE_ROOT",
      "capture root는 symlink가 아닌 디렉터리여야 합니다.",
    );
  }
  const [allowedReal, outputReal] = await Promise.all([
    realpath(allowedLexical),
    realpath(outputLexical),
  ]);
  if (!isWithin(allowedReal, outputReal)) {
    throw new BrowserCaptureAdapterError(
      "OUTPUT_PATH_ESCAPE",
      "capture output root의 실제 경로가 허용 경로를 벗어났습니다.",
    );
  }
  return outputReal;
}

async function readCaptureFile(root, relativePath) {
  const relative = canonicalRelativePath(relativePath);
  const absolute = path.resolve(root, ...relative.split("/"));
  if (!isWithin(root, absolute)) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_PATH_ESCAPE",
      "capture 파일이 output root를 벗어났습니다.",
      { relative_path: relative },
    );
  }
  let info;
  try {
    info = await lstat(absolute);
  } catch (error) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_FILE_MISSING",
      "예정된 PNG capture 파일이 없습니다.",
      { relative_path: relative, cause: error?.code },
    );
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new BrowserCaptureAdapterError(
      "UNSAFE_CAPTURE_FILE",
      "capture는 symlink가 아닌 일반 파일이어야 합니다.",
      { relative_path: relative },
    );
  }
  const resolved = await realpath(absolute);
  if (!isWithin(root, resolved)) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_PATH_ESCAPE",
      "capture 파일의 실제 경로가 output root를 벗어났습니다.",
      { relative_path: relative },
    );
  }
  const bytes = await readFile(resolved);
  return { bytes, absolute_path: resolved };
}

function sameSubject(actual, expected) {
  return canonicalJson(actual) === canonicalJson(expected);
}

function assertExecutionEnvelope(observed, workOrder, commandPlan) {
  if (
    observed?.schema_version !== "1.0" ||
    observed?.receipt_type !==
      "browser_harness.capture_execution" ||
    observed?.work_order_sha256 !==
      workOrder.work_order_sha256 ||
    (observed?.command_plan_sha256 !== undefined &&
      observed.command_plan_sha256 !==
        commandPlan.command_plan_sha256) ||
    observed?.capture_set_id !== workOrder.capture_set_id ||
    !sameSubject(observed?.subject, workOrder.subject)
  ) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_EXECUTION_SUBJECT_MISMATCH",
      "완료 evidence가 exact WorkOrder·revision·HTML에 묶이지 않았습니다.",
    );
  }
  if (
    observed?.browser_harness?.version !==
      workOrder.browser_harness.version ||
    observed?.browser_harness?.code_sha256 !==
      workOrder.browser_harness.code_sha256
  ) {
    throw new BrowserCaptureAdapterError(
      "BROWSER_HARNESS_ATTESTATION_MISMATCH",
      "실행 browser-harness version/code hash가 계획과 다릅니다.",
    );
  }
  const locator = observed?.recording?.locator;
  if (
    observed?.recording?.required !== true ||
    observed?.recording?.name !== workOrder.recording.name ||
    typeof locator !== "string" ||
    locator.length === 0 ||
    /(?:^|[\\/])latest(?:$|[\\/])/i.test(locator) ||
    /recordings\s+--latest/i.test(locator)
  ) {
    throw new BrowserCaptureAdapterError(
      "EXACT_RECORDING_LOCATOR_REQUIRED",
      "실행 당시 start_recording이 반환한 exact locator가 필요합니다.",
    );
  }
  if (
    typeof observed?.completed_at !== "string" ||
    Number.isNaN(Date.parse(observed.completed_at))
  ) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_COMPLETION_TIME_REQUIRED",
      "completion receipt에는 ISO completed_at이 필요합니다.",
    );
  }
  return locator;
}

function indexObservedCaptures(observed, workOrder) {
  if (!Array.isArray(observed?.captures)) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_SET_INCOMPLETE",
      "completion captures가 필요합니다.",
    );
  }
  const ids = new Set();
  const widths = new Set();
  const paths = new Set();
  for (const capture of observed.captures) {
    const captureId = String(capture?.capture_id ?? "");
    const width = capture?.viewport?.width;
    const relativePath = canonicalRelativePath(
      capture?.relative_path,
    );
    if (
      ids.has(captureId) ||
      widths.has(width) ||
      paths.has(relativePath)
    ) {
      throw new BrowserCaptureAdapterError(
        "DUPLICATE_RENDER_CAPTURE",
        "capture ID·viewport·파일 경로는 중복될 수 없습니다.",
        { capture_id: captureId, width, relative_path: relativePath },
      );
    }
    ids.add(captureId);
    widths.add(width);
    paths.add(relativePath);
  }
  const expectedIds = new Set(
    workOrder.captures.map((capture) => capture.capture_id),
  );
  if (
    observed.captures.length !== workOrder.captures.length ||
    [...expectedIds].some((captureId) => !ids.has(captureId))
  ) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_SET_INCOMPLETE",
      "숨은 320·360 overflow QA와 390 CSS/DPR2 delivery capture가 모두 한 번씩 필요합니다.",
      {
        expected_capture_ids: [...expectedIds],
        actual_capture_ids: [...ids],
      },
    );
  }
  return new Map(
    observed.captures.map((capture) => [
      capture.capture_id,
      capture,
    ]),
  );
}

function assertViewportEvidence(
  observed,
  expected,
  recordingLocator,
  actualPng,
) {
  if (
    canonicalJson(observed?.viewport) !==
      canonicalJson(expected.viewport) ||
    observed?.capture_set_id !== expected.capture_set_id ||
    observed?.relative_path !== expected.relative_path ||
    observed?.full_page !== true ||
    observed?.background_focus !== false ||
    observed?.recording_locator !== recordingLocator
  ) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_CONTRACT_MISMATCH",
      "capture가 viewport·full-page·background·recording 계약과 다릅니다.",
      { capture_id: expected.capture_id },
    );
  }
  const expectedWidth =
    expected.viewport.width *
    expected.viewport.device_scale_factor;
  const minimumHeight =
    expected.viewport.height *
    expected.viewport.device_scale_factor;
  if (
    actualPng.width !== expectedWidth ||
    actualPng.height < minimumHeight ||
    observed.png_width !== actualPng.width ||
    observed.png_height !== actualPng.height
  ) {
    throw new BrowserCaptureAdapterError(
      "CAPTURE_DIMENSION_MISMATCH",
      "실제 PNG 크기가 viewport/full-page 증거와 다릅니다.",
      {
        capture_id: expected.capture_id,
        expected_width: expectedWidth,
        minimum_height: minimumHeight,
        actual_width: actualPng.width,
        actual_height: actualPng.height,
      },
    );
  }
}

function assertOverflowEvidence(observed, expected) {
  const evidence = observed?.no_overflow;
  const viewportWidth = expected.viewport.width;
  if (
    evidence?.status !== "PASS" ||
    evidence?.focus_observed !== false ||
    evidence?.viewport_width !== viewportWidth ||
    !Number.isFinite(evidence?.document_client_width) ||
    !Number.isFinite(evidence?.document_scroll_width) ||
    !Number.isFinite(evidence?.body_scroll_width) ||
    evidence.document_scroll_width >
      evidence.document_client_width ||
    evidence.body_scroll_width > viewportWidth ||
    evidence.offender_count !== 0 ||
    !Array.isArray(evidence.offenders) ||
    evidence.offenders.length !== 0
  ) {
    throw new BrowserCaptureAdapterError(
      "NO_OVERFLOW_EVIDENCE_FAILED",
      "viewport별 no-overflow DOM 측정이 PASS여야 합니다.",
      { capture_id: expected.capture_id },
    );
  }
}

function assertStableFrameEvidence(observed, actualSha256) {
  const evidence = observed?.stable_frame;
  if (
    evidence?.status !== "PASS" ||
    evidence?.sample_interval_ms !== 250 ||
    evidence?.first_png_sha256 !== actualSha256 ||
    evidence?.second_png_sha256 !== actualSha256 ||
    evidence?.reduced_motion !== true ||
    evidence?.web_animations_paused !== true ||
    evidence?.css_transitions_disabled !== true
  ) {
    throw new BrowserCaptureAdapterError(
      "ANIMATION_STABLE_FRAME_EVIDENCE_FAILED",
      "두 시점의 동일 PNG와 reduced-motion·animation freeze 증거가 필요합니다.",
      { capture_id: observed?.capture_id },
    );
  }
}

export async function completeBrowserCaptureWorkOrder({
  planned,
  observedExecution,
} = {}) {
  const { workOrder, commandPlan } =
    assertPlannedEnvelope(planned);
  const recordingLocator = assertExecutionEnvelope(
    observedExecution,
    workOrder,
    commandPlan,
  );
  const observedById = indexObservedCaptures(
    observedExecution,
    workOrder,
  );
  const captureRoot = await resolveSafeCaptureRoot(workOrder);
  const verifiedCaptures = [];
  for (const expected of workOrder.captures) {
    const observed = observedById.get(expected.capture_id);
    const file = await readCaptureFile(
      captureRoot,
      observed.relative_path,
    );
    const actualSha256 = sha256(file.bytes);
    const png = parsePng(file.bytes, file.absolute_path);
    if (
      observed.png_sha256 !== actualSha256 ||
      observed.png_bytes !== file.bytes.length
    ) {
      throw new BrowserCaptureAdapterError(
        "CAPTURE_FILE_HASH_MISMATCH",
        "실제 PNG bytes/hash가 completion evidence와 다릅니다.",
        {
          capture_id: expected.capture_id,
          expected_sha256: observed.png_sha256,
          actual_sha256: actualSha256,
          expected_bytes: observed.png_bytes,
          actual_bytes: file.bytes.length,
        },
      );
    }
    assertViewportEvidence(
      observed,
      expected,
      recordingLocator,
      png,
    );
    assertOverflowEvidence(observed, expected);
    assertStableFrameEvidence(observed, actualSha256);
    verifiedCaptures.push({
      capture_id: expected.capture_id,
      capture_set_id: workOrder.capture_set_id,
      viewport: clone(expected.viewport),
      full_page: true,
      relative_path: expected.relative_path,
      locator: file.absolute_path,
      png_sha256: actualSha256,
      png_bytes: file.bytes.length,
      png_width: png.width,
      png_height: png.height,
      recording_locator: recordingLocator,
      no_overflow: clone(observed.no_overflow),
      stable_frame: clone(observed.stable_frame),
    });
  }
  const receiptBody = {
    schema_version: "1.0",
    receipt_type: "qa.render_capture.execution",
    adapter: "BrowserHarnessRenderCaptureAdapter",
    work_order_sha256: workOrder.work_order_sha256,
    command_plan_sha256: commandPlan.command_plan_sha256,
    capture_set_id: workOrder.capture_set_id,
    subject: clone(workOrder.subject),
    rubric_binding: clone(workOrder.rubric_binding),
    browser_harness: clone(workOrder.browser_harness),
    recording: {
      required: true,
      name: workOrder.recording.name,
      locator: recordingLocator,
    },
    capture_ids: verifiedCaptures.map(
      (capture) => capture.capture_id,
    ),
    completed_at: observedExecution.completed_at,
    verdict: "PASS",
  };
  const executionReceipt = {
    ...receiptBody,
    execution_receipt_sha256: canonicalSha256(receiptBody),
  };
  const artifactBody = {
    schema_version: "2.0-draft",
    artifact_type: "qa.render_capture_set",
    type: "qa.render_capture_set",
    capture_set_id: workOrder.capture_set_id,
    subject: clone(workOrder.subject),
    rubric_binding: clone(workOrder.rubric_binding),
    browser_harness: clone(workOrder.browser_harness),
    recording_locator: recordingLocator,
    captures: verifiedCaptures,
    member_ids: verifiedCaptures.map(
      (capture) => capture.capture_id,
    ),
    member_manifest: {
      schema_version: "1.0",
      policy: "materialized",
      members: (
        await Promise.all(
          verifiedCaptures.map(async (capture) => ({
          member_id: capture.capture_id,
          ...(await materializedCaptureLocator(
            workOrder,
            capture.locator,
          )),
          sha256: capture.png_sha256,
          size_bytes: capture.png_bytes,
          })),
        )
      )
        .sort((left, right) =>
          left.member_id.localeCompare(right.member_id),
        ),
    },
    consumers: clone(workOrder.shared_consumers),
    validation_receipt_ids: [
      executionReceipt.execution_receipt_sha256,
    ],
  };
  const artifactManifestSha256 = canonicalSha256(artifactBody);
  const artifact = {
    ...artifactBody,
    artifact_id:
      `art-render-capture-${artifactManifestSha256.slice(0, 20)}`,
    manifest_sha256: artifactManifestSha256,
  };
  return Object.freeze({
    schema_version: "1.0",
    stage_id: "G4Q_RENDER_CAPTURE",
    status: "completed",
    output_artifacts: [artifact],
    execution_receipt: executionReceipt,
  });
}
