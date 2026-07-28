import { createHash, randomUUID } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DomainError,
  approveAssetVersion,
  approveFinalQa,
  approveModelSsot,
  createCheckpoint,
  createJob,
  createRevision,
  lockAssembly,
  projectSummary,
  recordAssetQa,
  recordFinalQa,
  registerAssetVersion,
  saveHtmlLayer,
  startDetailPageReview,
  updateSupplierSource,
  updateJobState,
} from "./studio-domain.mjs";
import { createProjectStore } from "./project-store.mjs";
import {
  buildDetailPageReview,
  publicOutputViolations,
} from "./studio-detail-page-review.mjs";
import { cloneProductionRoadmap } from "../assets/studio-runtime/studio-roadmap.js";

const MIME_BY_EXTENSION = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const EXTENSION_BY_MIME = {
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
};

const PRODUCT_SSOT_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const PRODUCT_SSOT_WRITE_PHASES = new Set([
  "asset_production",
  "asset_review",
  "assembly_ready",
]);

function runtimeRoot() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "assets",
    "studio-runtime",
  );
}

function installedSkillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function resolveInside(root, relativePath) {
  const base = path.resolve(root);
  const target = path.resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new DomainError(
      "PATH_OUTSIDE_PROJECT",
      "프로젝트 밖 경로에는 접근할 수 없습니다.",
      403,
    );
  }
  return target;
}

function safeIdentifier(value, prefix = "asset") {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || `${prefix}-${randomUUID().slice(0, 8)}`;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertCustomerOutputPolicy(html, state) {
  const layerValues = [
    ...Object.values(state.html?.layerState || {}),
    ...Object.values(state.html?.viewportOverrides || {}).flatMap((value) =>
      Object.values(value || {}),
    ),
  ];
  const editedText = layerValues
    .map((value) => value?.text)
    .filter((value) => typeof value === "string")
    .join(" ");
  const violations = [
    ...new Set([
      ...publicOutputViolations(html),
      ...publicOutputViolations(`<main>${editedText}</main>`),
    ]),
  ];
  if (violations.length) {
    throw new DomainError(
      "PUBLIC_OUTPUT_METADATA_EXPOSED",
      "고객 화면에 제작자용 메타데이터가 남아 있습니다.",
      409,
      violations,
    );
  }
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([a-z0-9+/=\s]+)$/i,
  );
  if (!match) {
    throw new DomainError(
      "DATA_URL_INVALID",
      "지원하는 base64 데이터 URL이 필요합니다.",
    );
  }
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
  };
}

function safeDisplayName(value, fallback) {
  const name = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 240);
  return name || fallback;
}

async function readProductManifest(projectRoot) {
  const manifestPath = resolveInside(
    projectRoot,
    "product/product-manifest.json",
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) {
    throw new DomainError(
      "PRODUCT_MANIFEST_UNSUPPORTED",
      `지원하지 않는 product manifest schema: ${manifest.schemaVersion}`,
      500,
    );
  }
  manifest.ssot = Array.isArray(manifest.ssot) ? manifest.ssot : [];
  return manifest;
}

async function readProductionRoadmap(projectRoot) {
  const fallback = cloneProductionRoadmap();
  const roadmapPath = resolveInside(
    projectRoot,
    "planning/commercial-roadmap.json",
  );
  let projectRoadmap;
  try {
    projectRoadmap = JSON.parse(await readFile(roadmapPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return attachMotionPreviewReviews(projectRoot, fallback);
    }
    throw new DomainError(
      "PRODUCTION_ROADMAP_INVALID",
      `프로젝트 commercial roadmap을 읽을 수 없습니다: ${error.message}`,
      500,
    );
  }
  if (
    projectRoadmap.schemaVersion !== 1 ||
    (projectRoadmap.pages && !Array.isArray(projectRoadmap.pages)) ||
    (projectRoadmap.gifs && !Array.isArray(projectRoadmap.gifs)) ||
    (projectRoadmap.assets && !Array.isArray(projectRoadmap.assets))
  ) {
    throw new DomainError(
      "PRODUCTION_ROADMAP_UNSUPPORTED",
      "planning/commercial-roadmap.json의 schemaVersion 또는 배열 형식이 올바르지 않습니다.",
      500,
    );
  }
  const mergedRoadmap = {
    ...fallback,
    ...projectRoadmap,
    gate: {
      ...fallback.gate,
      ...(projectRoadmap.gate || {}),
    },
    groups: projectRoadmap.groups || fallback.groups,
    assets: projectRoadmap.assets || fallback.assets,
    pages: projectRoadmap.pages || fallback.pages,
    gifs: projectRoadmap.gifs || fallback.gifs,
  };
  return attachMotionPreviewReviews(projectRoot, mergedRoadmap);
}

async function writeProductManifest(projectRoot, manifest) {
  const manifestPath = resolveInside(
    projectRoot,
    "product/product-manifest.json",
  );
  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(tempPath, manifestPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeProjectJsonAtomic(projectRoot, relativePath, value) {
  const targetPath = resolveInside(projectRoot, relativePath);
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readMotionPreviewRoadmap(projectRoot) {
  const relativePath = "hyperframes/gif-roadmap.json";
  try {
    const roadmap = JSON.parse(
      await readFile(resolveInside(projectRoot, relativePath), "utf8"),
    );
    return {
      ...roadmap,
      schemaVersion: roadmap.schemaVersion || 1,
      gifs: Array.isArray(roadmap.gifs) ? roadmap.gifs : [],
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { schemaVersion: 1, gifs: [] };
    }
    throw new DomainError(
      "MOTION_ROADMAP_INVALID",
      `HyperFrames GIF 로드맵을 읽을 수 없습니다: ${error.message}`,
      500,
    );
  }
}

async function attachMotionPreviewReviews(projectRoot, roadmap) {
  const motionRoadmap = await readMotionPreviewRoadmap(projectRoot);
  return {
    ...roadmap,
    previewReviews: Object.fromEntries(
      (motionRoadmap?.gifs || []).map((gif) => [
        gif.id,
        {
          status: gif.status || "planned",
          feedback: gif.previewFeedback || "",
          approvedAt: gif.previewApprovedAt || null,
          approvedBy: gif.previewApprovedBy || null,
        },
      ]),
    ),
  };
}

async function updateMotionPreviewReview(
  projectRoot,
  { gifId, decision, feedback = "" },
) {
  const productionRoadmap = await readProductionRoadmap(projectRoot);
  const productionGif = productionRoadmap.gifs.find((gif) => gif.id === gifId);
  if (!productionGif) {
    throw new DomainError(
      "MOTION_PREVIEW_NOT_FOUND",
      `GIF 프리뷰를 찾을 수 없습니다: ${gifId}`,
      404,
    );
  }
  const roadmap = await readMotionPreviewRoadmap(projectRoot);
  let gif = roadmap.gifs.find((item) => item.id === gifId);
  if (!gif) {
    gif = {
      number: productionGif.number,
      id: productionGif.id,
      outputAssetId: productionGif.outputAssetId,
      name: productionGif.name,
      status: "planned",
      project: `hyperframes/projects/${productionGif.id}`,
    };
    roadmap.gifs.push(gif);
  }
  const now = new Date().toISOString();
  if (decision === "approved") {
    gif.status = "preview_approved";
    gif.previewFeedback = "";
    gif.previewApprovedAt = now;
    gif.previewApprovedBy = "user";
  } else {
    const note = String(feedback || "").trim();
    if (note.length < 2) {
      throw new DomainError(
        "MOTION_PREVIEW_FEEDBACK_REQUIRED",
        "변경할 내용을 두 글자 이상 적어 주세요.",
      );
    }
    gif.status = "changes_requested";
    gif.previewFeedback = note.slice(0, 1000);
    gif.previewApprovedAt = null;
    gif.previewApprovedBy = null;
  }
  await writeProjectJsonAtomic(
    projectRoot,
    "hyperframes/gif-roadmap.json",
    roadmap,
  );
  return {
    id: gif.id,
    status: gif.status,
    feedback: gif.previewFeedback || "",
    approvedAt: gif.previewApprovedAt || null,
  };
}

async function registerProductSsotFiles(projectRoot, files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new DomainError(
      "PRODUCT_SSOT_FILES_REQUIRED",
      "등록할 실제품 사진을 한 장 이상 선택해 주세요.",
    );
  }
  if (files.length > 20) {
    throw new DomainError(
      "PRODUCT_SSOT_FILE_LIMIT_EXCEEDED",
      "실제품 사진은 한 번에 최대 20장까지 등록할 수 있습니다.",
      413,
    );
  }

  let totalBytes = 0;
  const prepared = files.map((file, index) => {
    const parsed = parseDataUrl(file?.dataUrl);
    if (!PRODUCT_SSOT_MIME_TYPES.has(parsed.mime)) {
      throw new DomainError(
        "PRODUCT_SSOT_FILE_TYPE_UNSUPPORTED",
        `실제품 원본으로 지원하지 않는 파일 형식입니다: ${parsed.mime}`,
      );
    }
    if (parsed.buffer.length === 0) {
      throw new DomainError(
        "PRODUCT_SSOT_FILE_EMPTY",
        "빈 실제품 사진은 등록할 수 없습니다.",
      );
    }
    if (parsed.buffer.length > 25 * 1024 * 1024) {
      throw new DomainError(
        "PRODUCT_SSOT_FILE_TOO_LARGE",
        "실제품 사진 한 장은 25MB 이하여야 합니다.",
        413,
      );
    }
    totalBytes += parsed.buffer.length;
    return {
      ...parsed,
      originalFileName: safeDisplayName(
        file?.fileName,
        `실제품-사진-${index + 1}`,
      ),
    };
  });
  if (totalBytes > 80 * 1024 * 1024) {
    throw new DomainError(
      "PRODUCT_SSOT_BATCH_TOO_LARGE",
      "실제품 사진 전체 용량은 한 번에 80MB 이하여야 합니다.",
      413,
    );
  }

  const manifest = await readProductManifest(projectRoot);
  if (manifest.ssotLock?.status === "locked") {
    throw new DomainError(
      "PRODUCT_SSOT_LOCKED",
      `${manifest.ssotLock.revisionId || "현재 개정판"}에 잠긴 제품 SSOT에는 사진을 추가할 수 없습니다.`,
      409,
    );
  }
  const uploadedAt = new Date().toISOString();
  const variantColor = manifest.metadata?.variant?.color || null;
  const createdDirectories = [];
  const items = prepared.map((file) => {
    const id = `ssot-user-${randomUUID().slice(0, 12)}`;
    const relativePath = toPosix(
      path.join(
        "product",
        "ssot",
        "user",
        id,
        `original${EXTENSION_BY_MIME[file.mime]}`,
      ),
    );
    return {
      id,
      originalFileName: file.originalFileName,
      path: relativePath,
      sha256: sha256(file.buffer),
      mime: file.mime,
      sizeBytes: file.buffer.length,
      provenance: "user-captured-same-sku",
      role: "identity-primary",
      allowedUse: "reference-only",
      referencePurpose: "product-identity",
      requiresDerivedAsset: true,
      identityStatus: "pending-review",
      variantColor,
      uploadedAt,
    };
  });

  try {
    for (let index = 0; index < items.length; index += 1) {
      const filePath = resolveInside(projectRoot, items[index].path);
      const directory = path.dirname(filePath);
      await mkdir(directory, { recursive: true });
      createdDirectories.push(directory);
      await writeFile(filePath, prepared[index].buffer);
    }
    manifest.ssot.push(...items);
    await writeProductManifest(projectRoot, manifest);
    return items;
  } catch (error) {
    for (const directory of createdDirectories.reverse()) {
      await rm(directory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    throw error;
  }
}

function requiredIdentityText(value, fieldName, maxLength = 120) {
  const text = safeDisplayName(value, "");
  if (!text) {
    throw new DomainError(
      "PRODUCT_SSOT_IDENTITY_REQUIRED",
      `${fieldName}을(를) 입력해 주세요.`,
    );
  }
  return text.slice(0, maxLength);
}

function normalizeSupplierConflict(value) {
  if (!value || typeof value !== "object") return null;
  const observedLabelText = safeDisplayName(value.observedLabelText, "");
  if (!observedLabelText) return null;
  return {
    source: safeDisplayName(value.source, "supplier-bundle"),
    observedLabelText,
    decision: "excluded-from-product-identity-reference",
    reason: safeDisplayName(
      value.reason,
      "사용자가 직접 촬영한 동일 SKU 원본과 라벨 문구가 다릅니다.",
    ),
  };
}

async function lockProductSsot(projectRoot, body, currentRevisionId) {
  if (body?.confirmedByUser !== true) {
    throw new DomainError(
      "PRODUCT_SSOT_CONFIRMATION_REQUIRED",
      "실제품 사진에서 라벨과 색상을 확인한 뒤 잠가 주세요.",
    );
  }

  const labelText = requiredIdentityText(body.labelText, "제품 라벨 문구", 80);
  const variantColor = requiredIdentityText(body.variantColor, "제품 색상", 40);
  const revisionId = requiredIdentityText(
    body.revisionId || currentRevisionId,
    "개정판",
    40,
  ).toLowerCase();
  if (revisionId !== String(currentRevisionId || "").toLowerCase()) {
    throw new DomainError(
      "PRODUCT_SSOT_REVISION_MISMATCH",
      `현재 개정판 ${currentRevisionId}에서만 제품 SSOT를 잠글 수 있습니다.`,
      409,
    );
  }

  const manifest = await readProductManifest(projectRoot);
  if (manifest.ssotLock?.status === "locked") {
    const sameDecision =
      manifest.ssotLock.labelText === labelText &&
      manifest.ssotLock.variantColor === variantColor &&
      manifest.ssotLock.revisionId === revisionId;
    if (!sameDecision) {
      throw new DomainError(
        "PRODUCT_SSOT_LOCK_CONFLICT",
        "이미 다른 동일성 결정으로 잠긴 제품 SSOT입니다.",
        409,
      );
    }
    return {
      created: false,
      lock: manifest.ssotLock,
      items: manifest.ssot,
    };
  }
  if (manifest.ssot.length === 0) {
    throw new DomainError(
      "PRODUCT_SSOT_EMPTY",
      "잠글 실제품 사진을 먼저 등록해 주세요.",
      409,
    );
  }

  const itemVerification = await Promise.all(
    manifest.ssot.map(async (item) => {
      const buffer = await readFile(resolveInside(projectRoot, item.path));
      const actualSha256 = sha256(buffer);
      if (actualSha256 !== item.sha256) {
        throw new DomainError(
          "PRODUCT_SSOT_HASH_MISMATCH",
          `등록 후 변경된 실제품 사진이 있습니다: ${item.originalFileName}`,
          409,
        );
      }
      return {
        id: item.id,
        originalFileName: item.originalFileName,
        path: item.path,
        sha256: actualSha256,
        verified: true,
      };
    }),
  );

  const lockedAt = new Date().toISOString();
  const qaReportPath = toPosix(
    path.join(
      "qa",
      "reports",
      `product-ssot-identity-review-${safeIdentifier(revisionId, "revision")}.json`,
    ),
  );
  const supplierConflict = normalizeSupplierConflict(body.supplierConflict);
  const lock = {
    status: "locked",
    revisionId,
    labelText,
    variantColor,
    lockedAt,
    lockedBy: "local-user",
    basis: "user-confirmed-user-captured-same-sku",
    itemIds: manifest.ssot.map((item) => item.id),
    qaReportPath,
    ...(supplierConflict ? { supplierConflict } : {}),
  };
  const report = {
    schemaVersion: 1,
    reportType: "product-ssot-identity-review",
    status: "passed",
    revisionId,
    lockedAt,
    decision: {
      labelText,
      variantColor,
      basis: lock.basis,
      confirmedBy: "local-user",
      notes: safeDisplayName(body.notes, ""),
    },
    items: itemVerification,
    hardFailures: [],
    warnings: supplierConflict
      ? [
          {
            code: "SUPPLIER_LABEL_CONFLICT",
            ...supplierConflict,
          },
        ]
      : [],
  };

  manifest.metadata = manifest.metadata || {};
  manifest.metadata.identityLabelText = labelText;
  manifest.metadata.variant = {
    ...(manifest.metadata.variant || {}),
    color: variantColor,
    status: "user-confirmed",
  };
  manifest.ssot = manifest.ssot.map((item) => ({
    ...item,
    identityStatus: "locked",
    identityLabelText: labelText,
    variantColor,
    lockedAt,
    lockRevisionId: revisionId,
    qaReportPath,
  }));
  manifest.ssotLock = lock;

  try {
    await writeProjectJsonAtomic(projectRoot, qaReportPath, report);
    await writeProductManifest(projectRoot, manifest);
  } catch (error) {
    await rm(resolveInside(projectRoot, qaReportPath), { force: true }).catch(
      () => undefined,
    );
    throw error;
  }

  return {
    created: true,
    lock,
    items: manifest.ssot,
  };
}

async function readJsonBody(request, maxBytes = 80 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new DomainError(
        "REQUEST_TOO_LARGE",
        "업로드 요청이 허용 크기를 초과했습니다.",
        413,
      );
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainError("JSON_INVALID", "JSON 요청을 읽을 수 없습니다.");
  }
}

function sendJson(response, status, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function serveFile(response, filePath, cache = false) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new DomainError("FILE_NOT_FOUND", "파일이 없습니다.", 404);
  const body = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type":
      MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": cache ? "public, max-age=3600" : "no-store",
  });
  response.end(body);
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function persistJobFile(projectRoot, job) {
  const directory = resolveInside(projectRoot, ".studio/jobs");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, `${safeIdentifier(job.id, "job")}.json`),
    `${JSON.stringify(job, null, 2)}\n`,
    "utf8",
  );
}

function startGodTiboBatchWorker({
  studioUrl,
  jobIds,
  concurrency,
  size,
}) {
  const scriptPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "god-tibo-batch-worker.mjs",
  );
  const child = spawn(
    process.execPath,
    [
      scriptPath,
      "--studio-url",
      studioUrl,
      "--jobs",
      jobIds.join(","),
      "--concurrency",
      String(concurrency),
      "--size",
      size,
    ],
    {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    },
  );
  child.on("error", (error) => {
    console.error(`god-tibo-gpt-image2-skill 실행기 시작 실패: ${error.message}`);
  });
  child.unref();
  return child.pid || null;
}

function currentSelection(state, assetId) {
  const revision = state.revisions.find(
    (item) => item.id === state.currentRevisionId,
  );
  return revision?.assetSelections?.[assetId] || null;
}

function exportLayerRuntime(state) {
  const payload = JSON.stringify({
    layerState: state.html.layerState,
    viewportOverrides: state.html.viewportOverrides,
  }).replace(/</g, "\\u003c");
  return `<script id="detail-page-layer-state">
(() => {
  const state = ${payload};
  const apply = (target, value) => {
    if (!target || !value) return;
    if (typeof value.text === "string") target.innerHTML = value.text;
    if (value.styles && typeof value.styles === "object") Object.assign(target.style, value.styles);
  };
  Object.entries(state.layerState || {}).forEach(([id, value]) => apply(document.querySelector('[data-layer-id="' + CSS.escape(id) + '"]'), value));
  const width = window.innerWidth <= 340 ? "320" : window.innerWidth <= 520 ? "390" : "800";
  Object.entries(state.viewportOverrides?.[width] || {}).forEach(([id, value]) => apply(document.querySelector('[data-layer-id="' + CSS.escape(id) + '"]'), value));
})();
</script>`;
}

async function inlineProjectMedia(projectRoot, htmlPath, html) {
  const htmlDirectory = path.dirname(htmlPath);
  const matches = [...html.matchAll(/\bsrc=(["'])([^"']+)\1/gi)];
  let output = html;
  for (const match of matches) {
    const source = match[2];
    if (
      /^(?:data:|https?:|blob:|#|\/\/)/i.test(source) ||
      source.includes("{{")
    ) {
      continue;
    }
    const clean = source.split(/[?#]/)[0];
    const target = resolveInside(projectRoot, path.relative(projectRoot, path.resolve(htmlDirectory, clean)));
    try {
      const buffer = await readFile(target);
      const mime =
        MIME_BY_EXTENSION[path.extname(target).toLowerCase()]?.split(";")[0] ||
        "application/octet-stream";
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      output = output.replace(match[0], `src=${match[1]}${dataUrl}${match[1]}`);
    } catch {
      // Broken media is caught by final QA. Preserve the original reference in drafts.
    }
  }
  return output;
}

async function buildSingleHtml(projectRoot, state, { draft }) {
  const entry = resolveInside(projectRoot, state.html.entry);
  let html = await readFile(entry, "utf8");
  html = await inlineProjectMedia(projectRoot, entry, html);
  const additions = [
    exportLayerRuntime(state),
    draft
      ? `<div style="position:fixed;z-index:2147483647;top:12px;right:12px;padding:9px 13px;border-radius:8px;background:#f7b955;color:#172033;font:800 12px/1.2 sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.22)">검토용 초안</div>`
      : "",
  ].join("");
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${additions}</body>`);
  } else {
    html += additions;
  }
  return html;
}

async function runTar({ cwd, output }) {
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", output, "-C", cwd, "."], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput || `tar exited with ${code}`));
    });
  });
}

async function buildProjectBundle(projectRoot, state) {
  const stagingRoot = resolveInside(
    projectRoot,
    `.studio/export-staging/${randomUUID()}`,
  );
  const projectStage = path.join(stagingRoot, "project");
  const runtimeStage = path.join(stagingRoot, "runtime");
  await mkdir(projectStage, { recursive: true });
  await mkdir(runtimeStage, { recursive: true });
  const projectEntries = [
    "project.json",
    "product",
    "assets",
    "hyperframes",
    "html",
    "qa",
    "revisions",
    ".studio/jobs",
    ".studio/checkpoints",
    ".studio/events.ndjson",
    ".studio/lock.json",
  ];
  for (const entry of projectEntries) {
    const source = resolveInside(projectRoot, entry);
    try {
      await access(source);
      await cp(source, path.join(projectStage, entry), { recursive: true });
    } catch {
      // Optional project entries are omitted when they do not exist yet.
    }
  }
  await cp(
    path.join(installedSkillRoot(), "assets", "studio-runtime"),
    path.join(runtimeStage, "assets", "studio-runtime"),
    { recursive: true },
  );
  await cp(
    path.join(installedSkillRoot(), "scripts"),
    path.join(runtimeStage, "scripts"),
    { recursive: true },
  );
  const exportDirectory = resolveInside(
    projectRoot,
    state.phase === "published" ? "exports/published" : "exports/drafts",
  );
  await mkdir(exportDirectory, { recursive: true });
  const archivePath = path.join(
    exportDirectory,
    `${safeIdentifier(state.name, "detail-page")}-${state.currentRevisionId}-studio-project.tar.gz`,
  );
  try {
    await runTar({ cwd: stagingRoot, output: archivePath });
  } finally {
    const verifiedStagingBase = resolveInside(
      projectRoot,
      ".studio/export-staging",
    );
    if (stagingRoot.startsWith(`${verifiedStagingBase}${path.sep}`)) {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }
  return archivePath;
}

export async function startStudioServer({
  projectRoot,
  port = 8896,
  host = "127.0.0.1",
  open = true,
}) {
  const root = path.resolve(projectRoot);
  await access(path.join(root, "project.json"));
  const store = createProjectStore(root);
  const clients = new Set();
  let productManifestQueue = Promise.resolve();

  function queueProductManifest(operation) {
    const queued = productManifestQueue.then(operation);
    productManifestQueue = queued.catch(() => undefined);
    return queued;
  }

  function publish(event, state) {
    const payload = `event: project\ndata: ${JSON.stringify({
      event,
      project: projectSummary(state),
    })}\n\n`;
    clients.forEach((response) => response.write(payload));
  }

  async function mutate(type, payload, command) {
    const result = await store.mutate(type, payload, command);
    publish(result.event, result.state);
    return result;
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (request.method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          projectRoot: root,
          now: new Date().toISOString(),
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
        clients.add(response);
        request.on("close", () => clients.delete(response));
        return;
      }

      if (request.method === "GET" && pathname === "/api/project") {
        sendJson(response, 200, projectSummary(await store.load()));
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/project/source"
      ) {
        const body = await readJsonBody(request);
        const result = await mutate("project.source_updated", body, (state) =>
          updateSupplierSource(state, body),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "GET" && pathname === "/api/assets") {
        sendJson(response, 200, projectSummary(await store.load()).assetList);
        return;
      }

      if (
        request.method === "GET" &&
        pathname === "/api/production-roadmap"
      ) {
        sendJson(response, 200, await readProductionRoadmap(root));
        return;
      }

      const motionPreviewApprovalMatch = pathname.match(
        /^\/api\/motion-previews\/([^/]+)\/approve$/,
      );
      if (request.method === "POST" && motionPreviewApprovalMatch) {
        const body = await readJsonBody(request);
        if (body.confirmedByUser !== true) {
          throw new DomainError(
            "USER_CONFIRMATION_REQUIRED",
            "사용자 확인 후 GIF 프리뷰를 승인할 수 있습니다.",
            409,
          );
        }
        sendJson(
          response,
          200,
          await updateMotionPreviewReview(root, {
            gifId: decodeURIComponent(motionPreviewApprovalMatch[1]),
            decision: "approved",
          }),
        );
        return;
      }

      const motionPreviewFeedbackMatch = pathname.match(
        /^\/api\/motion-previews\/([^/]+)\/feedback$/,
      );
      if (request.method === "POST" && motionPreviewFeedbackMatch) {
        const body = await readJsonBody(request);
        if (body.confirmedByUser !== true) {
          throw new DomainError(
            "USER_CONFIRMATION_REQUIRED",
            "사용자 확인 후 GIF 변경 요청을 저장할 수 있습니다.",
            409,
          );
        }
        sendJson(
          response,
          200,
          await updateMotionPreviewReview(root, {
            gifId: decodeURIComponent(motionPreviewFeedbackMatch[1]),
            decision: "changes_requested",
            feedback: body.feedback,
          }),
        );
        return;
      }

      if (request.method === "GET" && pathname === "/api/product/ssot") {
        await productManifestQueue;
        const manifest = await readProductManifest(root);
        sendJson(response, 200, {
          count: manifest.ssot.length,
          items: manifest.ssot,
          lock: manifest.ssotLock || null,
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/jobs") {
        sendJson(response, 200, Object.values((await store.load()).jobs));
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/product/ssot/register"
      ) {
        const state = await store.load();
        if (!PRODUCT_SSOT_WRITE_PHASES.has(state.phase)) {
          throw new DomainError(
            "ASSET_STAGE_LOCKED",
            "조립된 버전에는 실제품 사진을 추가할 수 없습니다. 새 개정판을 만들어 주세요.",
            409,
          );
        }
        const body = await readJsonBody(request, 120 * 1024 * 1024);
        const items = await queueProductManifest(() =>
          registerProductSsotFiles(root, body.files),
        );
        sendJson(response, 201, {
          count: items.length,
          items,
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/product/ssot/lock"
      ) {
        const state = await store.load();
        if (!PRODUCT_SSOT_WRITE_PHASES.has(state.phase)) {
          throw new DomainError(
            "ASSET_STAGE_LOCKED",
            "조립된 버전에서는 제품 SSOT를 잠글 수 없습니다. 새 개정판을 만들어 주세요.",
            409,
          );
        }
        const body = await readJsonBody(request);
        const result = await queueProductManifest(() =>
          lockProductSsot(root, body, state.currentRevisionId),
        );
        sendJson(response, result.created ? 201 : 200, {
          lock: result.lock,
          items: result.items,
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/product/ssot/generation-jobs"
      ) {
        const body = await readJsonBody(request);
        await productManifestQueue;
        const manifest = await readProductManifest(root);
        const state = await store.load();
        if (manifest.ssotLock?.status !== "locked") {
          throw new DomainError(
            "PRODUCT_SSOT_LOCK_REQUIRED",
            "실제품 사진의 라벨과 색상을 잠근 뒤 에셋 제작을 요청해 주세요.",
            409,
          );
        }
        if (manifest.ssotLock.revisionId !== state.currentRevisionId) {
          throw new DomainError(
            "PRODUCT_SSOT_REVISION_MISMATCH",
            "현재 개정판에 잠긴 제품 SSOT가 필요합니다.",
            409,
          );
        }
        const name = requiredIdentityText(body.name, "에셋 이름", 120);
        const role = safeIdentifier(
          requiredIdentityText(body.role, "에셋 역할", 80),
          "product-asset",
        );
        const prompt = String(body.prompt || "").trim().slice(0, 4000);
        if (!prompt) {
          throw new DomainError(
            "PRODUCT_ASSET_PROMPT_REQUIRED",
            "제작할 장면과 용도를 입력해 주세요.",
          );
        }
        const payload = {
          type: "imagegen.generate.product-ssot",
          assetId: null,
          scope: `product-ssot:${role}`,
          prompt,
          sourceRefs: manifest.ssot.map((item) => item.path),
          target: {
            name,
            role,
            kind: "image",
            required: true,
          },
          confirmedByUser: body.confirmedByUser,
        };
        const result = await mutate("job.created", payload, (current) =>
          createJob(current, payload),
        );
        await persistJobFile(root, result.result);
        sendJson(response, 201, result.result);
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/product/ssot/batch-generation-jobs"
      ) {
        const body = await readJsonBody(request);
        await productManifestQueue;
        const manifest = await readProductManifest(root);
        const state = await store.load();
        if (manifest.ssotLock?.status !== "locked") {
          throw new DomainError(
            "PRODUCT_SSOT_LOCK_REQUIRED",
            "실제품 사진의 라벨과 색상을 잠근 뒤 전체 에셋 제작을 요청해 주세요.",
            409,
          );
        }
        if (manifest.ssotLock.revisionId !== state.currentRevisionId) {
          throw new DomainError(
            "PRODUCT_SSOT_REVISION_MISMATCH",
            "현재 개정판에 잠긴 제품 SSOT가 필요합니다.",
            409,
          );
        }
        if (!Array.isArray(body.targets) || body.targets.length === 0) {
          throw new DomainError(
            "PRODUCT_ASSET_TARGETS_REQUIRED",
            "한 개 이상의 에셋 제작 대상을 선택해 주세요.",
          );
        }
        if (body.targets.length > 40) {
          throw new DomainError(
            "PRODUCT_ASSET_TARGETS_LIMIT",
            "한 번에 최대 40개 에셋까지 제작할 수 있습니다.",
          );
        }
        const modelLock =
          state.modelSsot?.status === "locked" ? state.modelSsot : null;
        const modelAsset = modelLock
          ? state.assets[modelLock.assetId]
          : null;
        const modelVersion = modelAsset?.versions.find(
          (version) => version.number === Number(modelLock?.version),
        );
        const modelLockIsValid =
          Boolean(modelLock) &&
          Boolean(modelVersion) &&
          modelVersion.path === modelLock.path &&
          modelVersion.sha256 === modelLock.sha256;
        if (
          body.targets.some((target) => target.requiresModel === true) &&
          !modelLockIsValid
        ) {
          throw new DomainError(
            "MODEL_SSOT_REQUIRED",
            "착용·사용 예시를 만들기 전에 모델 후보를 비교하고 한 명을 모델 SSOT로 승인해 주세요.",
            409,
          );
        }
        const requestedProvider = body.execution?.provider;
        const provider =
          requestedProvider === "queue"
            ? "queue"
            : "god-tibo-gpt-image2-skill";
        const requestedConcurrency = Number(body.execution?.concurrency || 8);
        const concurrency = Number.isInteger(requestedConcurrency)
          ? Math.min(8, Math.max(1, requestedConcurrency))
          : 8;
        const allowedSizes = new Set([
          "1024x1024",
          "1024x1536",
          "1536x1024",
          "2048x1152",
          "2160x3840",
          "3840x2160",
        ]);
        const size = allowedSizes.has(body.execution?.size)
          ? body.execution.size
          : "1024x1536";
        const autoStart =
          provider === "god-tibo-gpt-image2-skill" &&
          body.execution?.autoStart === true;
        const batchId = `batch-${randomUUID()}`;
        const seenRoles = new Set();
        const payloads = body.targets.map((target) => {
          const name = requiredIdentityText(target.name, "에셋 이름", 120);
          const role = safeIdentifier(
            requiredIdentityText(target.role, "에셋 역할", 80),
            "product-asset",
          );
          const prompt = String(target.prompt || "").trim().slice(0, 4000);
          if (!prompt) {
            throw new DomainError(
              "PRODUCT_ASSET_PROMPT_REQUIRED",
              `${name}의 제작 장면과 용도를 입력해 주세요.`,
            );
          }
          if (seenRoles.has(role)) {
            throw new DomainError(
              "PRODUCT_ASSET_ROLE_DUPLICATED",
              `중복된 에셋 역할입니다: ${role}`,
            );
          }
          seenRoles.add(role);
          const requiresModel = target.requiresModel === true;
          const requestedSourceMode = String(target.sourceMode || "").trim();
          const sourceMode = requiresModel
            ? "product-and-model-ssot"
            : new Set([
                  "product-ssot",
                  "scene-reference",
                  "model-candidate",
                ]).has(requestedSourceMode)
              ? requestedSourceMode
              : "product-ssot";
          const sourceRefs =
            sourceMode === "scene-reference" ||
            sourceMode === "model-candidate"
              ? []
              : [
                  ...manifest.ssot.map((item) => item.path),
                  ...(requiresModel ? [modelVersion.path] : []),
                ];
          return {
            type: "imagegen.generate.product-ssot",
            assetId: null,
            scope: `product-ssot:${role}`,
            prompt,
            sourceRefs,
            target: {
              name,
              role,
              kind: "image",
              required: target.required !== false,
              roadmapId: String(target.roadmapId || role).slice(0, 120),
              group: String(target.group || "").slice(0, 80),
              purpose: String(target.purpose || "").slice(0, 500),
              pageNumbers: Array.isArray(target.pageNumbers)
                ? target.pageNumbers
                    .map(Number)
                    .filter(
                      (number) =>
                        Number.isInteger(number) &&
                        number >= 1 &&
                      number <= 14,
                    )
                : [],
              sourceMode,
              requiresModel,
              dependencies: requiresModel ? [modelLock.assetId] : [],
            },
            executor: {
              provider,
              concurrency,
              size,
              batchId,
            },
            confirmedByUser: body.confirmedByUser,
          };
        });
        const result = await mutate(
          "jobs.batch_created",
          {
            count: payloads.length,
            targets: payloads.map((payload) => payload.target),
          },
          (current) => payloads.map((payload) => createJob(current, payload)),
        );
        await Promise.all(
          result.result.map((job) => persistJobFile(root, job)),
        );
        const runnerPid = autoStart
          ? startGodTiboBatchWorker({
              studioUrl: new URL("/", url).href,
              jobIds: result.result.map((job) => job.id),
              concurrency,
              size,
            })
          : null;
        sendJson(response, 201, {
          batchId,
          count: result.result.length,
          jobs: result.result,
          execution: {
            provider,
            concurrency,
            size,
            autoStarted: Boolean(runnerPid),
            runnerPid,
          },
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/jobs") {
        const body = await readJsonBody(request);
        const result = await mutate("job.created", body, (state) =>
          createJob(state, body),
        );
        await persistJobFile(root, result.result);
        sendJson(response, 201, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/assets/register") {
        const body = await readJsonBody(request);
        const parsed = parseDataUrl(body.dataUrl);
        const requestedProvenance = String(body.provenance || "").trim();
        const provenance = new Set([
          "imagegen-derived",
          "hyperframes-derived",
          "generated-derived",
        ]).has(requestedProvenance)
          ? requestedProvenance
          : String(body.prompt || "").trim()
            ? "imagegen-derived"
            : Array.isArray(body.layers) && body.layers.length > 0
              ? "hyperframes-derived"
              : "raw-upload-reference";
        const referenceOnly = provenance === "raw-upload-reference";
        const extension =
          EXTENSION_BY_MIME[parsed.mime] ||
          path.extname(body.fileName || "").toLowerCase() ||
          ".bin";
        const assetId = safeIdentifier(
          body.assetId || `asset-${body.role || body.name || randomUUID()}`,
        );
        const current = await store.load();
        const nextVersion =
          (current.assets[assetId]?.versions || []).reduce(
            (max, version) => Math.max(max, version.number),
            0,
          ) + 1;
        const relativePath = toPosix(
          path.join(
            "asset",
            referenceOnly && !current.assets[assetId]
              ? "input/studio-v2"
              : "generated/pending/studio-v2",
            assetId,
            `v${nextVersion}${extension}`,
          ),
        );
        const filePath = resolveInside(root, relativePath);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, parsed.buffer);
        const payload = {
          assetId,
          name: body.name || body.fileName || assetId,
          role: body.role || assetId,
          kind:
            body.kind ||
            (parsed.mime === "image/gif"
              ? "gif"
              : parsed.mime.startsWith("video/")
                ? "video"
                : "image"),
          required: body.required !== false,
          approvalMode: body.approvalMode || "individual",
          dependencies: body.dependencies || [],
          versionPath: relativePath,
          sha256: sha256(parsed.buffer),
          mime: parsed.mime,
          sourceRefs: body.sourceRefs || [],
          prompt: body.prompt || "",
          layers: body.layers || [],
          provenance,
          allowedUse: referenceOnly
            ? "reference-only"
            : "final-consumable",
          derivedFrom: body.derivedFrom || body.sourceRefs || [],
        };
        const result = await mutate("asset.registered", payload, (state) => {
          const registered = registerAssetVersion(state, payload);
          const qaJob = referenceOnly
            ? null
            : createJob(state, {
                type: "qa.visual",
                assetId,
                version: registered.version.number,
                scope: "asset",
                confirmedByUser: true,
              });
          return { registered, qaJob };
        });
        if (result.result.qaJob) {
          await persistJobFile(root, result.result.qaJob);
        }
        sendJson(response, 201, {
          asset: result.result.registered.asset,
          version: result.result.registered.version,
          qaJob: result.result.qaJob,
        });
        return;
      }

      const assetJobMatch = pathname.match(/^\/api\/assets\/([^/]+)\/jobs$/);
      if (request.method === "POST" && assetJobMatch) {
        const assetId = assetJobMatch[1];
        const body = await readJsonBody(request);
        const executor =
          ["god-tibo-gpt-image2-skill", "god-tibo-imagen"].includes(
            body.executor?.provider,
          )
            ? {
                provider: "god-tibo-gpt-image2-skill",
                concurrency: 1,
                size: body.executor.size || "1024x1536",
              }
            : body.executor?.provider === "queue"
              ? {
                  provider: "queue",
                  concurrency: 1,
                  size: body.executor.size || "1024x1536",
                }
              : null;
        const payload = {
          ...body,
          assetId,
          executor,
          confirmedByUser: body.confirmedByUser === true,
        };
        const result = await mutate("job.created", payload, (state) =>
          createJob(state, payload),
        );
        await persistJobFile(root, result.result);
        if (
          executor?.provider === "god-tibo-gpt-image2-skill" &&
          body.executor?.autoStart === true
        ) {
          startGodTiboBatchWorker({
            studioUrl: new URL("/", url).href,
            jobIds: [result.result.id],
            concurrency: 1,
            size: executor.size,
          });
        }
        sendJson(response, 201, result.result);
        return;
      }

      const jobStateMatch = pathname.match(
        /^\/api\/jobs\/([^/]+)\/(start|complete|fail|cancel)$/,
      );
      if (request.method === "POST" && jobStateMatch) {
        const [, jobId, action] = jobStateMatch;
        const body = await readJsonBody(request);
        const status =
          action === "start"
            ? "running"
            : action === "complete"
              ? "completed"
            : action === "fail"
              ? "failed"
              : "cancelled";
        const result = await mutate(`job.${status}`, { jobId, ...body }, (state) =>
          updateJobState(state, {
            jobId,
            status,
            error: body.error || null,
            result: body.result || null,
          }),
        );
        await persistJobFile(root, result.result);
        sendJson(response, 200, result.result);
        return;
      }

      const qaMatch = pathname.match(/^\/api\/assets\/([^/]+)\/qa$/);
      if (request.method === "POST" && qaMatch) {
        const assetId = qaMatch[1];
        const body = await readJsonBody(request);
        const payload = { ...body, assetId };
        const result = await mutate("asset.qa_recorded", payload, (state) =>
          recordAssetQa(state, payload),
        );
        sendJson(response, 200, result.result);
        return;
      }

      const approvalMatch = pathname.match(
        /^\/api\/assets\/([^/]+)\/approve$/,
      );
      if (request.method === "POST" && approvalMatch) {
        const assetId = approvalMatch[1];
        const body = await readJsonBody(request);
        const payload = { ...body, assetId };
        const result = await mutate("asset.approval_recorded", payload, (state) =>
          approveAssetVersion(state, payload),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/model/ssot/approve"
      ) {
        const body = await readJsonBody(request);
        const result = await mutate(
          "model.ssot_approved",
          body,
          (state) => approveModelSsot(state, body),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/detail-page/start"
      ) {
        const body = await readJsonBody(request);
        const state = await store.load();
        const roadmap = await readProductionRoadmap(root);
        const review = buildDetailPageReview({ state, roadmap });
        const payload = {
          ...body,
          sections: review.sections,
        };
        startDetailPageReview(structuredClone(state), payload);
        await mkdir(resolveInside(root, "html"), { recursive: true });
        await mkdir(resolveInside(root, "planning"), { recursive: true });
        await writeFile(
          resolveInside(root, "html/index.html"),
          review.html,
          "utf8",
        );
        await writeFile(
          resolveInside(root, "planning/commercial-max-page-specs.json"),
          `${JSON.stringify(review.specs, null, 2)}\n`,
          "utf8",
        );
        const result = await mutate(
          "detail_page.review_started",
          body,
          (currentState) => startDetailPageReview(currentState, payload),
        );
        await writeFile(
          resolveInside(root, ".studio/lock.json"),
          `${JSON.stringify(result.result.assembly, null, 2)}\n`,
          "utf8",
        );
        sendJson(response, 201, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/assembly/lock") {
        const body = await readJsonBody(request);
        const result = await mutate("assembly.locked", body, (state) =>
          lockAssembly(state, body),
        );
        await writeFile(
          resolveInside(root, ".studio/lock.json"),
          `${JSON.stringify(result.result, null, 2)}\n`,
          "utf8",
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/revisions") {
        const body = await readJsonBody(request);
        const result = await mutate("revision.created", body, (state) =>
          createRevision(state, body),
        );
        sendJson(response, 201, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/html/layers") {
        const body = await readJsonBody(request);
        const result = await mutate("html.layer_saved", body, (state) =>
          saveHtmlLayer(state, body),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/checkpoints") {
        const body = await readJsonBody(request);
        const result = await mutate("html.checkpoint_created", body, (state) =>
          createCheckpoint(state, body),
        );
        await writeFile(
          resolveInside(
            root,
            `.studio/checkpoints/${safeIdentifier(result.result.id, "checkpoint")}.json`,
          ),
          `${JSON.stringify(result.result, null, 2)}\n`,
          "utf8",
        );
        sendJson(response, 201, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/qa/final") {
        const body = await readJsonBody(request);
        const state = await store.load();
        const html = await buildSingleHtml(root, state, { draft: true });
        assertCustomerOutputPolicy(html, state);
        const result = await mutate("qa.final_recorded", body, (state) =>
          recordFinalQa(state, body),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/qa/final/approve") {
        const body = await readJsonBody(request);
        const result = await mutate("qa.final_approved", body, (state) =>
          approveFinalQa(state, body),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/export/draft") {
        const state = await store.load();
        const html = await buildSingleHtml(root, state, { draft: true });
        assertCustomerOutputPolicy(html, state);
        const filePath = resolveInside(
          root,
          `exports/drafts/${safeIdentifier(state.name, "detail-page")}-${state.currentRevisionId}-draft.html`,
        );
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, html, "utf8");
        sendJson(response, 201, {
          path: toPosix(path.relative(root, filePath)),
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/export/publish") {
        const state = await store.load();
        if (
          state.finalQa.status !== "passed" ||
          state.finalQa.score < 97 ||
          state.finalQa.hardFailures.length > 0 ||
          !state.finalQa.userApproved
        ) {
          throw new DomainError(
            "PUBLISH_GATE_FAILED",
            "게시용 HTML은 97점 이상·하드 실패 0건·사용자 최종 승인이 필요합니다.",
            409,
          );
        }
        const html = await buildSingleHtml(root, state, { draft: false });
        assertCustomerOutputPolicy(html, state);
        const filePath = resolveInside(
          root,
          `exports/published/${safeIdentifier(state.name, "detail-page")}-${state.currentRevisionId}.html`,
        );
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, html, "utf8");
        sendJson(response, 201, {
          path: toPosix(path.relative(root, filePath)),
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/export/project") {
        const state = await store.load();
        const archivePath = await buildProjectBundle(root, state);
        sendJson(response, 201, {
          path: toPosix(path.relative(root, archivePath)),
        });
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/project/")) {
        const relative = pathname.slice("/project/".length);
        await serveFile(response, resolveInside(root, relative));
        return;
      }

      if (request.method === "GET") {
        const relative =
          pathname === "/" || pathname === "/studio.html"
            ? "studio.html"
            : pathname.replace(/^\/+/, "");
        await serveFile(response, resolveInside(runtimeRoot(), relative), true);
        return;
      }

      sendJson(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: "요청한 Studio 경로가 없습니다.",
        },
      });
    } catch (error) {
      const status = error instanceof DomainError ? error.status : 500;
      sendJson(response, status, {
        error: {
          code:
            error instanceof DomainError
              ? error.code
              : "INTERNAL_SERVER_ERROR",
          message:
            error instanceof DomainError
              ? error.message
              : "Studio 서버에서 오류가 발생했습니다.",
          details: error instanceof DomainError ? error.details : undefined,
        },
      });
      if (!(error instanceof DomainError)) console.error(error);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}/studio.html`;
  if (open) openBrowser(url);
  return {
    server,
    url,
    projectRoot: root,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = args.project;
  if (!projectRoot) {
    console.error("--project 경로가 필요합니다.");
    process.exitCode = 1;
  } else {
    const result = await startStudioServer({
      projectRoot,
      port: Number(args.port || 8896),
      open: args["no-open"] !== true,
    });
    console.log(`Detail Page Studio: ${result.url}`);
    console.log(`Project: ${result.projectRoot}`);
  }
}
