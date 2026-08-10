import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  BrowserCaptureAdapterError,
  PINNED_BEHANCE_RUBRIC,
  completeBrowserCaptureWorkOrder,
  createBrowserCaptureWorkOrder,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/browser-capture-adapter.mjs";

const POLICY_URL = new URL(
  "../../skills/detail-page-maker-skill/policies/behance-commerce-v0.1.json",
  import.meta.url,
);

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

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc >>> 1) ^
        (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, data])),
  );
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function createPng(width, height) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const scanlines = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function createFixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "browser-capture-adapter-"),
  );
  const projectRoot = path.join(root, "project");
  const allowedOutputRoot = path.join(root, "qa-captures");
  const outputRoot = path.join(
    allowedOutputRoot,
    "studio-rev-fixture",
  );
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(allowedOutputRoot, { recursive: true }),
  ]);
  const rubricDefinition = JSON.parse(
    await readFile(POLICY_URL, "utf8"),
  );
  const revisionBody = {
    schema_version: "1.0",
    revision_id: "studio-rev-fixture",
    revision_kind: "committed",
    mutable: false,
    artifact_id: "studio-artifact-fixture",
    artifact_sha256: "a".repeat(64),
    html_sha256: "b".repeat(64),
    hero_assurance_manifest_sha256: "d".repeat(64),
    hero_assurance_validation_receipt_sha256:
      "e".repeat(64),
    hero_commercial_validation_receipt_sha256:
      "f".repeat(64),
    hero_identity_validation_receipt_sha256:
      "2".repeat(64),
    hero_assurance_bundle_sha256: "1".repeat(64),
    hero_assurance_member_id: "hero-assurance.json",
    hero_assurance_member_locator:
      "studio/revisions/studio-rev-fixture/hero-assurance.json",
    hero_assurance_member_sha256: "1".repeat(64),
    hero_assurance_member_size_bytes: 1024,
    rubric_sha256: rubricDefinition.rubric_sha256,
  };
  const revision = {
    ...revisionBody,
    commit_sha256: canonicalSha256(revisionBody),
    committed_at: "2026-07-30T10:00:00.000Z",
  };
  const url =
    "http://127.0.0.1:4173/studio/studio-rev-fixture";
  const htmlManifestBody = {
    schema_version: "1.0",
    artifact_type: "page.html_revision",
    artifact_id: "html-artifact-fixture",
    revision_id: revision.revision_id,
    revision_commit_sha256: revision.commit_sha256,
    html_sha256: revision.html_sha256,
    render_url: url,
  };
  const htmlManifest = {
    ...htmlManifestBody,
    manifest_sha256: canonicalSha256(htmlManifestBody),
  };
  const browserHarness = {
    executable: "browser-harness",
    version: "0.1.0-test",
    code_sha256: "c".repeat(64),
  };
  const input = {
    revision,
    htmlManifest,
    url,
    rubricDefinition,
    browserHarness,
    projectRoot,
    allowedOutputRoot,
    outputRoot,
  };
  return {
    root,
    projectRoot,
    allowedOutputRoot,
    outputRoot,
    rubricDefinition,
    revision,
    htmlManifest,
    browserHarness,
    url,
    input,
  };
}

async function writeCapturesAndObserve(fixture, planned) {
  await mkdir(fixture.outputRoot, { recursive: true });
  const captures = [];
  for (const expected of planned.work_order.captures) {
    const physicalWidth =
      expected.viewport.width *
      expected.viewport.device_scale_factor;
    const height =
      (1100 + expected.viewport.width) *
      expected.viewport.device_scale_factor;
    const bytes = createPng(physicalWidth, height);
    await writeFile(
      path.join(fixture.outputRoot, expected.relative_path),
      bytes,
    );
    const digest = sha256(bytes);
    captures.push({
      capture_id: expected.capture_id,
      capture_set_id: expected.capture_set_id,
      relative_path: expected.relative_path,
      viewport: structuredClone(expected.viewport),
      full_page: true,
      background_focus: false,
      recording_locator: path.join(
        fixture.root,
        "recordings",
        planned.work_order.recording.name,
      ),
      png_sha256: digest,
      png_bytes: bytes.length,
      png_width: physicalWidth,
      png_height: height,
      no_overflow: {
        status: "PASS",
        viewport_width: expected.viewport.width,
        document_client_width: expected.viewport.width,
        document_scroll_width: expected.viewport.width,
        body_scroll_width: expected.viewport.width,
        offender_count: 0,
        offenders: [],
        focus_observed: false,
      },
      stable_frame: {
        status: "PASS",
        sample_interval_ms: 250,
        first_png_sha256: digest,
        second_png_sha256: digest,
        reduced_motion: true,
        web_animations_paused: true,
        css_transitions_disabled: true,
      },
    });
  }
  return {
    schema_version: "1.0",
    receipt_type: "browser_harness.capture_execution",
    work_order_sha256:
      planned.work_order.work_order_sha256,
    command_plan_sha256:
      planned.command_plan.command_plan_sha256,
    capture_set_id: planned.work_order.capture_set_id,
    subject: structuredClone(planned.work_order.subject),
    browser_harness: structuredClone(
      planned.work_order.browser_harness,
    ),
    recording: {
      required: true,
      name: planned.work_order.recording.name,
      locator: captures[0].recording_locator,
    },
    captures,
    completed_at: "2026-07-30T11:00:00.000Z",
  };
}

function expectCode(code) {
  return (error) => {
    assert.ok(error instanceof BrowserCaptureAdapterError);
    assert.equal(error.code, code);
    return true;
  };
}

test("immutable Studio+HTML+rubric에 고정된 deterministic Browser Harness WorkOrder를 만든다", async () => {
  const fixture = await createFixture();
  try {
    const first = createBrowserCaptureWorkOrder(fixture.input);
    const second = createBrowserCaptureWorkOrder(fixture.input);
    assert.deepEqual(second, first);

    const workOrder = first.work_order;
    assert.equal(
      workOrder.subject.revision_commit_sha256,
      fixture.revision.commit_sha256,
    );
    assert.equal(
      workOrder.subject.html_manifest_sha256,
      fixture.htmlManifest.manifest_sha256,
    );
    assert.equal(
      workOrder.subject.html_sha256,
      fixture.revision.html_sha256,
    );
    assert.deepEqual(
      workOrder.captures.map(
        (capture) => capture.viewport.width,
      ),
      [320, 360, 780, 390],
    );
    assert.deepEqual(
      workOrder.captures.map((capture) => ({
        width: capture.viewport.width,
        device_scale_factor:
          capture.viewport.device_scale_factor,
        purpose: capture.viewport.purpose,
      })),
      [
        {
          width: 320,
          device_scale_factor: 1,
          purpose: "hidden_overflow_qa",
        },
        {
          width: 360,
          device_scale_factor: 1,
          purpose: "hidden_overflow_qa",
        },
        {
          width: 780,
          device_scale_factor: 1,
          purpose: "hidden_overflow_qa",
        },
        {
          width: 390,
          device_scale_factor: 2,
          purpose: "authoring_and_delivery",
        },
      ],
    );
    assert.equal(
      workOrder.captures.every(
        (capture) =>
          capture.full_page === true &&
          capture.background_focus === false &&
          capture.recording_required === true,
      ),
      true,
    );
    assert.equal(workOrder.shared_consumers.length, 6);
    assert.deepEqual(
      new Set(
        workOrder.shared_consumers.map(
          (consumer) => consumer.capture_set_id,
        ),
      ),
      new Set([workOrder.capture_set_id]),
    );
    assert.deepEqual(
      workOrder.shared_consumers.map(
        (consumer) => consumer.consumer,
      ),
      [
        "CommercialQaAgent",
        "EvidenceQaAgent",
        "IdentityQaAgent",
        "VisualQaAgent",
        "MotionQaAgent",
        "TechnicalQaAgent",
      ],
    );
    assert.deepEqual(
      workOrder.rubric_binding,
      PINNED_BEHANCE_RUBRIC,
    );

    const [versionProbe, captureCommand] =
      first.command_plan.commands;
    assert.deepEqual(
      {
        command: versionProbe.command,
        argv: versionProbe.argv,
        shell: versionProbe.shell,
      },
      {
        command: "browser-harness",
        argv: ["--version"],
        shell: false,
      },
    );
    assert.equal(captureCommand.command, "browser-harness");
    assert.equal(captureCommand.shell, false);
    assert.deepEqual(captureCommand.env, { BH_RECORD: "1" });
    assert.match(
      captureCommand.stdin,
      /start_recording\(/,
    );
    assert.match(
      captureCommand.stdin,
      /"Target\.createTarget"/,
    );
    assert.match(
      captureCommand.stdin,
      /new_background_tab\(URL\)/,
    );
    assert.match(
      captureCommand.stdin,
      /captureBeyondViewport=True/,
    );
    assert.match(
      captureCommand.stdin,
      /document\.hasFocus\(\)/,
    );
    assert.match(
      captureCommand.stdin,
      /ANIMATION_STABLE_FRAME_MISMATCH/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
test("실제 PNG bytes와 viewport·recording·overflow·stable frame을 검증해 공유 capture-set artifact를 만든다", async () => {
  const fixture = await createFixture();
  try {
    const planned = createBrowserCaptureWorkOrder(fixture.input);
    const observedExecution = await writeCapturesAndObserve(
      fixture,
      planned,
    );
    const result = await completeBrowserCaptureWorkOrder({
      planned,
      observedExecution,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.stage_id, "G4Q_RENDER_CAPTURE");
    assert.equal(result.output_artifacts.length, 1);
    const artifact = result.output_artifacts[0];
    assert.equal(artifact.type, "qa.render_capture_set");
    assert.equal(
      artifact.artifact_type,
      "qa.render_capture_set",
    );
    assert.match(
      artifact.manifest_sha256,
      /^[a-f0-9]{64}$/,
    );
    assert.equal(artifact.captures.length, 4);
    assert.equal(
      artifact.member_manifest.policy,
      "materialized",
    );
    assert.deepEqual(
      artifact.member_manifest.members.map((member) => ({
        member_id: member.member_id,
        root_id: member.root_id,
        locator: member.locator,
      })),
      artifact.captures
        .map((capture) => ({
          member_id: capture.capture_id,
          root_id: "allowed_output",
          locator: path.posix.join(
            "studio-rev-fixture",
            capture.relative_path,
          ),
        }))
        .sort((left, right) =>
          left.member_id.localeCompare(right.member_id),
        ),
    );
    assert.equal(
      artifact.member_manifest.members.every(
        (member) =>
          /^[a-f0-9]{64}$/.test(member.sha256) &&
          Number.isSafeInteger(member.size_bytes),
      ),
      true,
    );
    assert.deepEqual(
      artifact.captures.map(
        (capture) => capture.png_width,
      ),
      [320, 360, 780, 780],
    );
    assert.equal(
      artifact.captures.every(
        (capture) =>
          capture.png_height >= 900 &&
          capture.no_overflow.status === "PASS" &&
          capture.stable_frame.status === "PASS" &&
          /^[a-f0-9]{64}$/.test(capture.png_sha256),
      ),
      true,
    );
    assert.deepEqual(
      new Set(
        artifact.consumers.map(
          (consumer) => consumer.capture_set_id,
        ),
      ),
      new Set([artifact.capture_set_id]),
    );
    assert.equal(
      result.execution_receipt.browser_harness.code_sha256,
      fixture.browserHarness.code_sha256,
    );
    assert.equal(result.execution_receipt.verdict, "PASS");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("mutable·변조 revision, 다른 HTML/URL, 다른 rubric policy를 계획 전에 차단한다", async (t) => {
  const fixture = await createFixture();
  try {
    await t.test("mutable revision", () => {
      const input = structuredClone(fixture.input);
      input.revision.mutable = true;
      assert.throws(
        () => createBrowserCaptureWorkOrder(input),
        expectCode("IMMUTABLE_STUDIO_REVISION_REQUIRED"),
      );
    });

    await t.test("revision commit hash mismatch", () => {
      const input = structuredClone(fixture.input);
      input.revision.artifact_id = "tampered";
      assert.throws(
        () => createBrowserCaptureWorkOrder(input),
        expectCode("REVISION_COMMIT_HASH_MISMATCH"),
      );
    });

    await t.test("HTML manifest hash mismatch", () => {
      const input = structuredClone(fixture.input);
      input.htmlManifest.html_sha256 = "d".repeat(64);
      assert.throws(
        () => createBrowserCaptureWorkOrder(input),
        expectCode("HTML_MANIFEST_HASH_MISMATCH"),
      );
    });

    await t.test("different revision-bound HTML", () => {
      const input = structuredClone(fixture.input);
      const body = structuredClone(input.htmlManifest);
      delete body.manifest_sha256;
      body.revision_id = "studio-rev-other";
      input.htmlManifest = {
        ...body,
        manifest_sha256: canonicalSha256(body),
      };
      assert.throws(
        () => createBrowserCaptureWorkOrder(input),
        expectCode("HTML_REVISION_BINDING_MISMATCH"),
      );
    });

    await t.test("different URL", () => {
      const input = structuredClone(fixture.input);
      input.url = "http://127.0.0.1:4173/studio/other";
      assert.throws(
        () => createBrowserCaptureWorkOrder(input),
        expectCode("HTML_REVISION_BINDING_MISMATCH"),
      );
    });

    await t.test("rubric policy hash pin mismatch", () => {
      const input = structuredClone(fixture.input);
      input.rubricDefinition.rubric_version =
        "behance-commerce-v0.2";
      const body = structuredClone(input.rubricDefinition);
      delete body.rubric_sha256;
      input.rubricDefinition.rubric_sha256 =
        canonicalSha256(body);
      assert.throws(
        () => createBrowserCaptureWorkOrder(input),
        expectCode("RUBRIC_POLICY_PIN_MISMATCH"),
      );
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("output·capture 경로 탈출과 계획 뒤 subject 변조를 차단한다", async (t) => {
  const fixture = await createFixture();
  try {
    await t.test("output root escape", () => {
      const input = {
        ...fixture.input,
        outputRoot: path.join(fixture.root, "outside"),
      };
      assert.throws(
        () => createBrowserCaptureWorkOrder(input),
        expectCode("OUTPUT_PATH_ESCAPE"),
      );
    });

    await t.test("capture relative path escape", async () => {
      const planned = createBrowserCaptureWorkOrder(
        fixture.input,
      );
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      observed.captures[0].relative_path = "../escape.png";
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("CAPTURE_PATH_ESCAPE"),
      );
    });

    await t.test("different observed revision", async () => {
      const planned = createBrowserCaptureWorkOrder(
        fixture.input,
      );
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      observed.subject.revision_id = "studio-rev-other";
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("CAPTURE_EXECUTION_SUBJECT_MISMATCH"),
      );
    });

    await t.test("tampered WorkOrder", async () => {
      const planned = structuredClone(
        createBrowserCaptureWorkOrder(fixture.input),
      );
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      planned.work_order.subject.revision_id =
        "studio-rev-other";
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("CAPTURE_PLAN_HASH_MISMATCH"),
      );
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("누락 viewport와 중복 capture를 exact set 검증으로 차단한다", async (t) => {
  const fixture = await createFixture();
  try {
    const planned = createBrowserCaptureWorkOrder(fixture.input);

    await t.test("missing 390 viewport", async () => {
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      observed.captures = observed.captures.filter(
        (capture) => capture.viewport.width !== 390,
      );
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("CAPTURE_SET_INCOMPLETE"),
      );
    });

    await t.test("duplicate capture", async () => {
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      observed.captures[1] = structuredClone(
        observed.captures[0],
      );
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("DUPLICATE_RENDER_CAPTURE"),
      );
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("PNG hash·dimension·recording·harness·overflow·stable-frame 증거를 각각 fail-closed 검증한다", async (t) => {
  const fixture = await createFixture();
  try {
    const planned = createBrowserCaptureWorkOrder(fixture.input);

    await t.test("PNG hash mismatch", async () => {
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      observed.captures[0].png_sha256 = "f".repeat(64);
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("CAPTURE_FILE_HASH_MISMATCH"),
      );
    });

    await t.test("PNG dimension mismatch", async () => {
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      const capture = observed.captures[0];
      const wrong = createPng(capture.png_width - 1, capture.png_height);
      await writeFile(
        path.join(fixture.outputRoot, capture.relative_path),
        wrong,
      );
      capture.png_sha256 = sha256(wrong);
      capture.png_bytes = wrong.length;
      capture.png_width = 359;
      capture.stable_frame.first_png_sha256 =
        capture.png_sha256;
      capture.stable_frame.second_png_sha256 =
        capture.png_sha256;
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("CAPTURE_DIMENSION_MISMATCH"),
      );
    });

    await t.test("latest recording locator", async () => {
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      observed.recording.locator =
        path.join(fixture.root, "recordings", "latest");
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("EXACT_RECORDING_LOCATOR_REQUIRED"),
      );
    });

    await t.test("browser harness mismatch", async () => {
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      observed.browser_harness.code_sha256 =
        "d".repeat(64);
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("BROWSER_HARNESS_ATTESTATION_MISMATCH"),
      );
    });

    await t.test("overflow evidence failure", async () => {
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      observed.captures[0].no_overflow.body_scroll_width =
        361;
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode("NO_OVERFLOW_EVIDENCE_FAILED"),
      );
    });

    await t.test("stable frame evidence failure", async () => {
      const observed = await writeCapturesAndObserve(
        fixture,
        planned,
      );
      observed.captures[0].stable_frame.second_png_sha256 =
        "e".repeat(64);
      await assert.rejects(
        completeBrowserCaptureWorkOrder({
          planned,
          observedExecution: observed,
        }),
        expectCode(
          "ANIMATION_STABLE_FRAME_EVIDENCE_FAILED",
        ),
      );
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
