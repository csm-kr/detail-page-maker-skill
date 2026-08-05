import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadCloudflarePagesConfig,
  preflightCloudflarePagesConnection,
  uploadCloudflarePagesExport,
} from "./runtime/cloudflare-pages-uploader.mjs";
import { runLeanQa } from "./lean-studio-server.mjs";

const LEAN_WING_RENDERER = String.raw`
import base64
import hashlib
import io
import json
import math
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, features

PAGE_URL = os.environ["WING_PAGE_URL"]
OUTPUT_ROOT = Path(os.environ["WING_EXPORT_ROOT"]).resolve()
CDN_BASE_URL = os.environ["WING_CDN_BASE_URL"].rstrip("/")
EXPORT_ID = os.environ["WING_EXPORT_ID"]
PROJECT_KEY = os.environ["WING_PROJECT_KEY"]
PRODUCT_NAME = os.environ.get("WING_PRODUCT_NAME", "product").strip() or "product"
ASSET_ROOT = OUTPUT_ROOT / "assets"
WIDTH = 780
VIEWPORT_HEIGHT = 1200
MAX_ASSET_BYTES = 10 * 1024 * 1024

def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()

def capture(rect):
    result = cdp(
        "Page.captureScreenshot",
        format="png",
        fromSurface=True,
        captureBeyondViewport=True,
        clip={
            "x": round(rect["x"]),
            "y": round(rect["y"]),
            "width": WIDTH,
            "height": math.ceil(rect["height"]),
            "scale": 1,
        },
    )
    image = Image.open(io.BytesIO(base64.b64decode(result["data"]))).convert("RGB")
    if image.width != WIDTH:
        image = image.resize((WIDTH, image.height), Image.Resampling.LANCZOS)
    return image

def encode_static(image, target):
    for quality in (90, 84, 78, 72):
        image.save(target, format="WEBP", quality=quality, method=6)
        if target.stat().st_size < MAX_ASSET_BYTES:
            return quality
    raise RuntimeError(f"Static WebP exceeds 10MiB: {target.name}")

def encode_motion(frames, duration, target):
    if not features.check("webp"):
        raise RuntimeError("Pillow WebP support is required")
    for quality in (80, 72, 64, 56):
        frames[0].save(
            target,
            format="WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=[duration] * len(frames),
            loop=0,
            quality=quality,
            method=6,
            minimize_size=True,
            allow_mixed=True,
        )
        with Image.open(target) as encoded:
            frame_count = int(getattr(encoded, "n_frames", 1))
        if frame_count < 2:
            raise RuntimeError(f"Animated WebP was flattened: {target.name}")
        if target.stat().st_size < MAX_ASSET_BYTES:
            return quality, frame_count
    raise RuntimeError(f"Animated WebP exceeds 10MiB: {target.name}")

def wing_html(assets, local=False):
    lines = ['<div align="center">']
    for asset in assets:
        source = f"assets/{asset['filename']}" if local else asset["cdn_url"]
        alt = asset["alt"].replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
        lines.append(f'  <img src="{source}" width="780" alt="{alt}"><br>')
    lines.append("</div>")
    return "\n".join(lines) + "\n"

def main():
    if not CDN_BASE_URL.startswith("https://"):
        raise RuntimeError("WING_CDN_BASE_URL must start with https://")
    ASSET_ROOT.mkdir(parents=True, exist_ok=False)
    recording = None
    target_id = None
    try:
        recording = start_recording(
            f"lean-wing-{EXPORT_ID}",
            title=f"{PRODUCT_NAME} 780px Wing export",
        )
        new_tab(PAGE_URL)
        wait_for_load()
        target_id = current_tab()["targetId"]
        cdp(
            "Emulation.setDeviceMetricsOverride",
            width=WIDTH,
            height=VIEWPORT_HEIGHT,
            deviceScaleFactor=1,
            mobile=False,
        )
        js("""(() => {
          document.documentElement.style.scrollBehavior = 'auto';
          document.querySelectorAll('img').forEach(image => {
            image.loading = 'eager';
            image.removeAttribute('loading');
          });
          const style = document.createElement('style');
          style.textContent =
            'html,body{margin:0!important;padding:0!important;width:780px!important;' +
            'max-width:780px!important;overflow-x:hidden!important}' +
            '#detailPage{margin:0!important;width:780px!important;max-width:780px!important;' +
            'box-shadow:none!important}';
          document.head.append(style);
        })()""")
        loaded = False
        for _ in range(300):
            loaded = js("Array.from(document.images).every(image => image.complete && image.naturalWidth > 0)")
            if loaded:
                break
            time.sleep(0.1)
        if not loaded:
            raise RuntimeError("Images did not finish loading")
        catalog = js("""(() => {
          const root = document.querySelector('#detailPage') || document.querySelector('main') || document.body;
          let sections = Array.from(root.querySelectorAll(':scope > section'));
          if (!sections.length) sections = [root];
          return sections.filter(section => {
            const style = getComputedStyle(section);
            return !section.hidden && style.display !== 'none';
          }).map((section, index) => {
            section.dataset.leanWingIndex = String(index);
            const sources = Array.from(section.querySelectorAll('img')).map(image =>
              image.closest('[data-motion-src]')?.getAttribute('data-motion-src') ||
              image.currentSrc || image.getAttribute('src') || ''
            );
            return {
              index,
              heading: section.querySelector('h1,h2,h3')?.textContent.replace(/\\s+/g, ' ').trim() || '',
              alt: section.querySelector('img[alt]')?.getAttribute('alt') || '',
              animated: sources.some(source => /\\.gif(?:[?#]|$)|\\/gifs\\/.*\\.webp(?:[?#]|$)/i.test(source)),
            };
          });
        })()""")
        if not catalog:
            raise RuntimeError("No visible sections found")
        results = []
        for order, item in enumerate(catalog, 1):
            rect = js(f"""(() => {{
              const selected = document.querySelector('[data-lean-wing-index={json.dumps(str(item['index']))}]');
              document.querySelectorAll('[data-lean-wing-index]').forEach(section => {{
                section.style.display = section === selected ? '' : 'none';
              }});
              selected.hidden = false;
              selected.style.boxSizing = 'border-box';
              selected.style.width = '780px';
              selected.style.maxWidth = '780px';
              document.querySelectorAll('details').forEach(details => details.open = true);
              window.scrollTo(0, 0);
              const box = selected.getBoundingClientRect();
              return {{x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height}};
            }})()""")
            if round(rect["width"]) != WIDTH:
                raise RuntimeError(f"Section is not 780px wide: {order}: {rect['width']}")
            target = ASSET_ROOT / f"section-{order:02d}.webp"
            if item["animated"]:
                frame_duration = 125
                frames = []
                for _ in range(16):
                    frames.append(capture(rect))
                    time.sleep(frame_duration / 1000)
                quality, frame_count = encode_motion(frames, frame_duration, target)
                kind = "animated"
                duration_ms = frame_duration * frame_count
            else:
                frame = capture(rect)
                quality = encode_static(frame, target)
                frame_count = 1
                duration_ms = 0
            alt = re.sub(r"\\s+", " ", item["heading"] or item["alt"] or f"{PRODUCT_NAME} detail image {order}").strip()[:120]
            result = {
                "order": order,
                "filename": target.name,
                "kind": kind if item["animated"] else "static",
                "format": "webp",
                "mime_type": "image/webp",
                "width": WIDTH,
                "height": frames[0].height if item["animated"] else frame.height,
                "frames": frame_count,
                "duration_ms": duration_ms,
                "quality": quality,
                "bytes": target.stat().st_size,
                "sha256": digest(target),
                "cdn_url": f"{CDN_BASE_URL}/{target.name}",
                "alt": alt,
            }
            results.append(result)
            print(f"WING_ASSET_OK {order:02d} {result['kind']} 780x{result['height']}", flush=True)
        production_html = wing_html(results, local=False)
        local_html = wing_html(results, local=True)
        (OUTPUT_ROOT / "coupang-wing-detail-780.html").write_text(production_html, encoding="utf-8")
        (OUTPUT_ROOT / "preview-local-780.html").write_text(local_html, encoding="utf-8")
        manifest = {
            "schema_version": "2.0",
            "export_id": EXPORT_ID,
            "project_key": PROJECT_KEY,
            "product": PRODUCT_NAME,
            "delivery_format": "coupang-wing-image-only-html",
            "render_profile": {"css_width": WIDTH, "device_scale_factor": 1},
            "cdn_base_url": CDN_BASE_URL,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "assets": results,
            "local_qa": {
                "asset_count": len(results),
                "all_width_780": all(asset["width"] == WIDTH for asset in results),
                "all_under_10mb": all(asset["bytes"] < MAX_ASSET_BYTES for asset in results),
                "animated_count": sum(asset["kind"] == "animated" for asset in results),
            },
            "remote_verification": {"status": "pending"},
        }
        (OUTPUT_ROOT / "cdn-upload-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print("WING_EXPORT_RESULT " + json.dumps({
            "export_id": EXPORT_ID,
            "asset_count": len(results),
            "static_count": sum(asset["kind"] == "static" for asset in results),
            "animated_count": sum(asset["kind"] == "animated" for asset in results),
            "cdn_base_url": CDN_BASE_URL,
            "recording": recording,
        }, ensure_ascii=False), flush=True)
    finally:
        if recording is not None:
            stop_recording()
        if target_id is not None:
            try:
                cdp("Target.closeTarget", targetId=target_id)
            except Exception:
                pass

main()
`;

export class LeanWingError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = "LeanWingError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function safeProjectKey(value) {
  return (
    String(value || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "product"
  );
}

function exportTimestamp(now) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, "$1Z");
}

function normalizeNonce(value) {
  const nonce = String(value || randomUUID().slice(0, 8)).toLowerCase();
  if (!/^[a-z0-9]{4,24}$/.test(nonce)) {
    throw new LeanWingError("EXPORT_NONCE_INVALID", "export nonce가 올바르지 않습니다.");
  }
  return nonce;
}

function resolveInside(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new LeanWingError("PATH_OUTSIDE_PROJECT", "Wing 경로가 프로젝트 밖을 가리킵니다.", 403);
  }
  return target;
}

export function createLeanWingIdentity({
  projectRoot,
  publicBaseUrl,
  projectKey,
  now = new Date(),
  nonce,
}) {
  const parsed = new URL(publicBaseUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new LeanWingError("CDN_BASE_URL_INVALID", "Cloudflare public_base_url은 인증 정보 없는 HTTPS URL이어야 합니다.");
  }
  const normalizedProjectKey = safeProjectKey(projectKey || path.basename(projectRoot));
  const exportId = `wing-${exportTimestamp(now)}-${normalizeNonce(nonce)}`;
  const namespaceUrl = `${parsed.href.replace(/\/+$/, "")}/${normalizedProjectKey}/${exportId}`;
  return {
    exportId,
    projectKey: normalizedProjectKey,
    namespace: `${normalizedProjectKey}/${exportId}`,
    namespaceUrl,
    outputRoot: resolveInside(projectRoot, path.join("output", "wing", exportId)),
  };
}

async function assertCanonicalReady(projectRoot) {
  const canonicalPath = resolveInside(projectRoot, path.join("output", "detail-page.html"));
  const bytes = await readFile(canonicalPath).catch(() => null);
  if (!bytes?.length) {
    throw new LeanWingError("CANONICAL_HTML_MISSING", "output/detail-page.html이 필요합니다.", 404);
  }
  const html = bytes.toString("utf8");
  const qa = await runLeanQa(projectRoot, html);
  if (qa.status !== "PASS") {
    throw new LeanWingError("LEAN_QA_FAILED", "Wing 내보내기 전 lean QA가 실패했습니다.", 422, qa);
  }
  return { canonicalPath, html, bytes, sha256: sha256(bytes), qa };
}

async function reserveOutputRoot(outputRoot) {
  await mkdir(path.dirname(outputRoot), { recursive: true });
  try {
    await mkdir(outputRoot, { recursive: false });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new LeanWingError(
        "EXPORT_NAMESPACE_EXISTS",
        "이미 존재하는 Wing export namespace는 덮어쓸 수 없습니다.",
        409,
      );
    }
    throw error;
  }
}

async function writeDryRunManifest({ identity, source, config, now }) {
  await reserveOutputRoot(identity.outputRoot);
  const body = {
    schema_version: "1.0",
    mode: "dry-run",
    status: "planned",
    export_id: identity.exportId,
    project_key: identity.projectKey,
    namespace: identity.namespace,
    namespace_url: identity.namespaceUrl,
    source: {
      path: "output/detail-page.html",
      bytes: source.bytes.length,
      sha256: source.sha256,
    },
    render_profile: { css_width: 780, device_scale_factor: 1 },
    provider: "cloudflare-pages",
    pages_project: config.pagesProject,
    generated_at: now.toISOString(),
    note: "No browser render, upload, or remote mutation was performed.",
  };
  const manifest = { ...body, manifest_sha256: sha256(Buffer.from(JSON.stringify(body), "utf8")) };
  const manifestPath = path.join(identity.outputRoot, "manifest.json");
  try {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    await rm(identity.outputRoot, { recursive: true, force: true });
    throw error;
  }
  return {
    status: "dry-run",
    export_id: identity.exportId,
    namespace: identity.namespace,
    namespace_url: identity.namespaceUrl,
    manifest_path: path.relative(projectRootFrom(identity.outputRoot), manifestPath).split(path.sep).join("/"),
    source_sha256: source.sha256,
    qa: source.qa,
  };
}

function projectRootFrom(outputRoot) {
  return path.resolve(outputRoot, "..", "..", "..");
}

async function renderWing780({
  projectRoot,
  pageUrl,
  productName,
  identity,
  spawnImpl = spawn,
}) {
  await reserveOutputRoot(identity.outputRoot);
  const child = spawnImpl("browser-harness", [], {
    cwd: projectRoot,
    env: {
      ...process.env,
      BH_AGENT_WORKSPACE: path.join(projectRoot, ".detail-page", "browser-harness"),
      BH_RECORD: "1",
      WING_PAGE_URL: pageUrl,
      WING_EXPORT_ROOT: identity.outputRoot,
      WING_CDN_BASE_URL: identity.namespaceUrl,
      WING_PRODUCT_NAME: productName,
      WING_EXPORT_ID: identity.exportId,
      WING_PROJECT_KEY: identity.projectKey,
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout = `${stdout}${chunk}`.slice(-4_000_000);
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4_000_000);
  });
  child.stdin.end(LEAN_WING_RENDERER);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0) {
    await writeFile(path.join(identity.outputRoot, "export-error.log"), `${stdout}\n${stderr}`, "utf8");
    throw new LeanWingError(
      "WING_RENDER_FAILED",
      "780px Wing WebP 변환에 실패했습니다. export-error.log를 확인하세요.",
      500,
    );
  }
  const resultLine = stdout.split(/\r?\n/).reverse().find((line) => line.startsWith("WING_EXPORT_RESULT "));
  if (!resultLine) {
    throw new LeanWingError("WING_RENDER_RESULT_MISSING", "Wing 렌더 결과를 읽지 못했습니다.", 500);
  }
  return JSON.parse(resultLine.slice("WING_EXPORT_RESULT ".length));
}

async function verifyRemoteExport({ projectRoot, identity, fetchImpl, sourceSha256 }) {
  const canonical = await assertCanonicalReady(projectRoot);
  if (canonical.sha256 !== sourceSha256) {
    throw new LeanWingError("SOURCE_CHANGED_DURING_EXPORT", "Wing 게시 중 정본 HTML이 변경되었습니다.", 409);
  }
  const manifestPath = path.join(identity.outputRoot, "cdn-upload-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.export_id !== identity.exportId ||
    manifest.project_key !== identity.projectKey ||
    manifest.cdn_base_url !== identity.namespaceUrl ||
    manifest.render_profile?.css_width !== 780 ||
    manifest.render_profile?.device_scale_factor !== 1
  ) {
    throw new LeanWingError("WING_MANIFEST_MISMATCH", "Wing manifest의 780px namespace 계약이 일치하지 않습니다.", 409);
  }
  const checks = [];
  for (const asset of manifest.assets || []) {
    const response = await fetchImpl(asset.cdn_url, {
      method: "GET",
      redirect: "manual",
      headers: { "Cache-Control": "no-cache" },
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const mime = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    const cacheControl = String(response.headers.get("cache-control") || "");
    const check = {
      url: asset.cdn_url,
      status: response.status,
      bytes: bytes.length,
      sha256: sha256(bytes),
      mime,
      cache_control: cacheControl,
    };
    check.passed =
      check.status === 200 &&
      check.mime === "image/webp" &&
      check.bytes === asset.bytes &&
      check.sha256 === asset.sha256 &&
      /(?:^|,)\s*max-age=31536000\s*(?:,|$)/i.test(cacheControl) &&
      /(?:^|,)\s*immutable\s*(?:,|$)/i.test(cacheControl);
    checks.push(check);
  }
  if (!checks.length || checks.some((check) => !check.passed)) {
    throw new LeanWingError("WING_REMOTE_VERIFICATION_FAILED", "CDN HTTP·MIME·용량·해시·cache 검증에 실패했습니다.", 409, { checks });
  }
  manifest.remote_verification = {
    status: "passed",
    checked_at: new Date().toISOString(),
    checks,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const wingHtml = await readFile(path.join(identity.outputRoot, "coupang-wing-detail-780.html"));
  await Promise.all([
    atomicWrite(manifestPath, manifestBytes),
    atomicWrite(path.join(identity.outputRoot, "detail-page.html"), wingHtml),
  ]);
  return {
    status: "passed",
    manifest_path: path.relative(projectRoot, manifestPath).split(path.sep).join("/"),
    manifest_sha256: sha256(manifestBytes),
    wing_html_path: `output/wing/${identity.exportId}/detail-page.html`,
    checks,
  };
}

async function atomicWrite(target, bytes) {
  const temporary = `${target}.tmp-${randomUUID()}`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function runLeanWingExport({
  projectRoot,
  mode = "dry-run",
  confirm,
  pageUrl,
  productName,
  projectKey,
  now = new Date(),
  nonce,
  fetchImpl = fetch,
  spawnImpl = spawn,
  preflightImpl = preflightCloudflarePagesConnection,
  uploadImpl = uploadCloudflarePagesExport,
} = {}) {
  if (!projectRoot) throw new LeanWingError("PROJECT_REQUIRED", "projectRoot가 필요합니다.");
  if (!["dry-run", "publish"].includes(mode)) {
    throw new LeanWingError("MODE_INVALID", "mode는 dry-run 또는 publish여야 합니다.");
  }
  const root = path.resolve(projectRoot);
  const source = await assertCanonicalReady(root);
  const config = await loadCloudflarePagesConfig(root);
  const identity = createLeanWingIdentity({
    projectRoot: root,
    publicBaseUrl: config.publicBaseUrl,
    projectKey,
    now,
    nonce,
  });
  if (mode === "dry-run") {
    return writeDryRunManifest({ identity, source, config, now });
  }
  if (confirm !== "PUBLISH_CDN") {
    throw new LeanWingError(
      "PUBLISH_CONFIRMATION_REQUIRED",
      '실제 CDN 게시를 위해 confirm: "PUBLISH_CDN"이 필요합니다.',
    );
  }

  let localStudio = null;
  try {
    if (!pageUrl) {
      const { startLeanStudioServer } = await import("./lean-studio-server.mjs");
      localStudio = await startLeanStudioServer({ projectRoot: root });
      pageUrl = `${localStudio.url}output/detail-page.html`;
    }
    const page = new URL(pageUrl);
    if (!["http:", "https:"].includes(page.protocol)) {
      throw new LeanWingError("PAGE_URL_INVALID", "Wing render page URL은 HTTP(S)여야 합니다.");
    }
    const connection = await preflightImpl({ projectRoot: root });
    if (connection.publicBaseUrl.replace(/\/+$/, "") !== config.publicBaseUrl.replace(/\/+$/, "")) {
      throw new LeanWingError("CLOUDFLARE_PREFLIGHT_MISMATCH", "Cloudflare preflight URL이 config와 다릅니다.", 409);
    }
    const rendered = await renderWing780({
      projectRoot: root,
      pageUrl: page.href,
      productName: productName || path.basename(root),
      identity,
      spawnImpl,
    });
    const beforeUpload = await assertCanonicalReady(root);
    if (beforeUpload.sha256 !== source.sha256) {
      throw new LeanWingError("SOURCE_CHANGED_DURING_EXPORT", "Wing 렌더 중 정본 HTML이 변경되었습니다.", 409);
    }
    const uploaded = await uploadImpl({
      projectRoot: root,
      exportRoot: identity.outputRoot,
      projectKey: identity.projectKey,
      exportId: identity.exportId,
      fetchImpl,
    });
    const verification = await verifyRemoteExport({
      projectRoot: root,
      identity,
      fetchImpl,
      sourceSha256: source.sha256,
    });
    return {
      status: "completed",
      export_id: identity.exportId,
      namespace: identity.namespace,
      namespace_url: identity.namespaceUrl,
      source_sha256: source.sha256,
      rendered,
      uploaded,
      verification,
    };
  } finally {
    if (localStudio) await localStudio.close();
  }
}

function parseArgs(argv) {
  const options = { mode: "dry-run" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") options.projectRoot = argv[++index];
    else if (arg === "--publish") options.mode = "publish";
    else if (arg === "--confirm-publish") options.confirm = "PUBLISH_CDN";
    else if (arg === "--page-url") options.pageUrl = argv[++index];
    else if (arg === "--product-name") options.productName = argv[++index];
    else if (arg === "--project-key") options.projectKey = argv[++index];
    else throw new LeanWingError("ARGUMENT_INVALID", `알 수 없는 인자: ${arg}`);
  }
  return options;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runLeanWingExport(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR [${error.code || "LEAN_WING_ERROR"}] ${error.message}\n`);
    process.exitCode = 1;
  }
}
