// Active Studio v1 HTTP runtime.
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createWorkflowEngine,
  WorkflowEngineError,
} from "../orchestration/workflow-engine.mjs";
import { ArtifactRecordStoreError } from "../orchestration/artifact-record-store.mjs";
import {
  createFileStateStore,
  StateStoreError,
} from "../orchestration/file-state-store.mjs";
import { BrowserCaptureAdapterError } from "../orchestration/adapters/browser-capture-adapter.mjs";
import { StudioCommitAdapterError } from "../orchestration/adapters/studio-commit-adapter.mjs";
import { RubricLoopError } from "../orchestration/rubric-loop.mjs";
import {
  createStudioG4Pipeline,
  StudioG4PipelineError,
} from "./studio-g4-pipeline.mjs";
import {
  listProjectBackups,
  markWingExportCompleted,
  readProjectOutputState,
  restoreProjectBackup,
  saveProjectOutput,
} from "./project-output-runtime.mjs";
import {
  CloudflarePagesUploaderError,
  loadCloudflarePagesConfig,
  preflightCloudflarePagesConnection,
  uploadCloudflarePagesExport,
} from "./cloudflare-pages-uploader.mjs";

const MIME_BY_EXTENSION = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const ASSET_STATES = ["pending", "approved", "rejected"];
const ASSET_KINDS = ["image", "gif"];
const IMAGE_EXTENSIONS = new Set([".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const STUDIO_CAPABILITY_COOKIE = "detail_page_studio_capability";
const STUDIO_CAPABILITY_HEADER = "x-detail-page-studio-capability";
const WORKFLOW_APPROVAL_NOTICE = Object.freeze({
  substitutesStageApproval: false,
  ledgerScope: "asset-file-only",
  planOncePolicy: Object.freeze({
    policyId:
      "policy.approval.plan-once-with-actual-photos.v1",
    substitutesRepeatedUserConfirmation: true,
    requiresVerifiedActualPhotos: true,
    requiresManualG1PlanApproval: true,
    qaBypassAllowed: false,
  }),
  requiredStages: Object.freeze([
    "G2U_APPROVAL",
    "G3U_APPROVAL",
    "G4U_APPROVAL",
    "G5U_APPROVAL",
  ]),
});

class StudioV1Error extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function resolveInside(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new StudioV1Error(
      "PATH_OUTSIDE_PROJECT",
      "프로젝트 밖의 파일에는 접근할 수 없습니다.",
      403,
    );
  }
  return target;
}

function authorityHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function requestPathname(requestTarget) {
  if (!requestTarget.startsWith("/")) {
    throw new StudioV1Error(
      "REQUEST_TARGET_INVALID",
      "상대 경로 요청만 허용됩니다.",
      400,
    );
  }
  const rawPathname = requestTarget.split("?", 1)[0];
  let probe = rawPathname;
  let decoded = rawPathname;
  for (let depth = 0; depth < 4; depth += 1) {
    if (/%(?:2f|5c)/i.test(probe)) {
      throw new StudioV1Error(
        "ENCODED_PATH_SEPARATOR",
        "인코딩된 경로 구분자는 허용되지 않습니다.",
        403,
      );
    }
    try {
      decoded = decodeURIComponent(probe);
    } catch {
      throw new StudioV1Error(
        "PATH_ENCODING_INVALID",
        "URL 경로 인코딩이 올바르지 않습니다.",
        400,
      );
    }
    if (
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      decoded.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      throw new StudioV1Error(
        "PATH_TRAVERSAL_BLOCKED",
        "상위 경로 접근은 허용되지 않습니다.",
        403,
      );
    }
    if (decoded === probe) break;
    probe = decoded;
  }
  return decodeURIComponent(rawPathname);
}

function isOpaqueAuthoringSubresource(request, expectedOrigin, pathname) {
  if (
    !["GET", "HEAD"].includes(request.method || "") ||
    pathname.startsWith("/api/v1/")
  ) {
    return false;
  }
  const destination = request.headers["sec-fetch-dest"];
  if (
    typeof destination !== "string" ||
    !["font", "image", "script", "style"].includes(
      destination.toLowerCase(),
    )
  ) {
    return false;
  }
  const referer = request.headers.referer;
  if (typeof referer !== "string") {
    return (
      destination.toLowerCase() === "script" &&
      pathname === "/app.js"
    );
  }
  try {
    const refererUrl = new URL(referer);
    return (
      refererUrl.origin === expectedOrigin &&
      refererUrl.pathname === "/authoring.html"
    );
  } catch {
    return false;
  }
}

function assertBoundRequest(request, expectedOrigin, pathname) {
  const expected = new URL(expectedOrigin);
  const hostHeader = request.headers.host;
  if (
    typeof hostHeader !== "string" ||
    hostHeader.toLowerCase() !== expected.host.toLowerCase()
  ) {
    throw new StudioV1Error(
      "HOST_NOT_ALLOWED",
      "서버가 바인딩한 Host 요청만 허용됩니다.",
      403,
    );
  }
  const opaqueAuthoringSubresource = isOpaqueAuthoringSubresource(
    request,
    expected.origin,
    pathname,
  );
  const origin = request.headers.origin;
  if (
    origin !== undefined &&
    (typeof origin !== "string" ||
      (origin !== expected.origin &&
        !(opaqueAuthoringSubresource && origin === "null")))
  ) {
    throw new StudioV1Error(
      "CROSS_ORIGIN_REQUEST_BLOCKED",
      "교차 출처 요청은 허용되지 않습니다.",
      403,
    );
  }
  const fetchSite = request.headers["sec-fetch-site"];
  if (
    fetchSite !== undefined &&
    (typeof fetchSite !== "string" ||
      (!["none", "same-origin"].includes(fetchSite.toLowerCase()) &&
        !(
          opaqueAuthoringSubresource &&
          ["cross-site", "same-site"].includes(
            fetchSite.toLowerCase(),
          )
        )))
  ) {
    throw new StudioV1Error(
      "CROSS_SITE_REQUEST_BLOCKED",
      "교차 사이트 요청은 허용되지 않습니다.",
      403,
    );
  }
}

function parseCookies(request) {
  const cookies = new Map();
  for (const part of String(request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

function secretMatches(candidate, expected) {
  if (typeof candidate !== "string") return false;
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return (
    candidateBytes.length === expectedBytes.length &&
    timingSafeEqual(candidateBytes, expectedBytes)
  );
}

function assertStudioCapability(request, capabilityToken) {
  const headerToken = request.headers[STUDIO_CAPABILITY_HEADER];
  const cookieToken = parseCookies(request).get(STUDIO_CAPABILITY_COOKIE);
  if (
    !secretMatches(headerToken, capabilityToken) &&
    !secretMatches(cookieToken, capabilityToken)
  ) {
    throw new StudioV1Error(
      "STUDIO_CAPABILITY_REQUIRED",
      "유효한 Studio 세션 capability가 필요합니다.",
      401,
    );
  }
}

async function resolveExistingInside(root, relativePath) {
  const target = resolveInside(root, relativePath);
  if (!(await exists(target))) return target;
  const [canonicalRoot, canonicalTarget] = await Promise.all([
    realpath(root),
    realpath(target),
  ]);
  const relative = path.relative(canonicalRoot, canonicalTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new StudioV1Error(
      "STATIC_PATH_OUTSIDE_ROOT",
      "정적 파일 루트 밖의 파일에는 접근할 수 없습니다.",
      403,
    );
  }
  return canonicalTarget;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  const body = await readFile(filePath);
  return createHash("sha256").update(body).digest("hex");
}

function sha256Bytes(value) {
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
  return sha256Bytes(JSON.stringify(canonicalize(value)));
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isAllowedAssetFile(fileName, kind) {
  const extension = path.extname(fileName).toLowerCase();
  return kind === "gif" ? extension === ".gif" : IMAGE_EXTENSIONS.has(extension);
}

function assetRecord(projectRoot, filePath, status, kind) {
  const relativePath = toPosix(path.relative(projectRoot, filePath));
  return {
    id: relativePath,
    fileName: path.basename(filePath),
    relativePath,
    previewUrl: `/${relativePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    status,
    kind,
  };
}

async function listAssets(projectRoot) {
  const assets = [];
  for (const status of ASSET_STATES) {
    for (const kind of ASSET_KINDS) {
      const directory = path.join(
        projectRoot,
        ".detail-page",
        "generation",
        status,
        kind,
      );
      if (!(await exists(directory))) continue;
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (
          !entry.isFile() ||
          entry.name.startsWith(".") ||
          !isAllowedAssetFile(entry.name, kind)
        ) {
          continue;
        }
        assets.push(
          assetRecord(
            projectRoot,
            path.join(directory, entry.name),
            status,
            kind,
          ),
        );
      }
    }
  }
  return assets.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "ko"),
  );
}

async function readManifest(projectRoot) {
  const manifestPath = path.join(
    projectRoot,
    ".detail-page",
    "generation",
    "asset-manifest.json",
  );
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    return {
      schemaVersion: 1,
      studioVersion: 1,
      defaultGifMethod: "hybrid",
      assets: [],
      ...parsed,
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    };
  } catch {
    return {
      schemaVersion: 1,
      studioVersion: 1,
      defaultGifMethod: "hybrid",
      assets: [],
    };
  }
}

async function writeManifest(projectRoot, manifest) {
  const directory = path.join(projectRoot, ".detail-page", "generation");
  const target = path.join(directory, "asset-manifest.json");
  const temporary = path.join(directory, ".asset-manifest.json.tmp");
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

function parsePendingAssetPath(relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  const match = normalized.match(
    /^\.detail-page\/generation\/pending\/(image|gif)\/([^/]+)$/,
  );
  if (!match) {
    throw new StudioV1Error(
      "PENDING_ASSET_PATH_REQUIRED",
      "pending의 이미지 또는 GIF 파일만 결정할 수 있습니다.",
    );
  }
  return { normalized, kind: match[1], fileName: match[2] };
}

async function decideAsset(projectRoot, payload) {
  if (payload?.confirmedByUser !== true) {
    throw new StudioV1Error(
      "USER_CONFIRMATION_REQUIRED",
      "사용자의 명시적인 승인 또는 반려 확인이 필요합니다.",
      409,
    );
  }
  if (!["approved", "rejected"].includes(payload?.decision)) {
    throw new StudioV1Error(
      "ASSET_DECISION_INVALID",
      "결정은 approved 또는 rejected여야 합니다.",
    );
  }
  const { normalized, kind, fileName } = parsePendingAssetPath(
    payload.relativePath,
  );
  if (!isAllowedAssetFile(fileName, kind)) {
    throw new StudioV1Error(
      "ASSET_FILE_TYPE_INVALID",
      "image에는 PNG·JPG·WEBP·SVG, gif에는 GIF 파일만 사용할 수 있습니다.",
    );
  }
  if (
    kind === "gif" &&
    !/^\d{2,}-[a-z0-9-]+-(?:imagegen-seq|heygenframe|hybrid)-v\d{2,}\.gif$/i.test(
      fileName,
    )
  ) {
    throw new StudioV1Error(
      "GIF_FILE_NAME_INVALID",
      "GIF 파일명에는 순번, 역할, 생성 방식, 버전을 기록하세요. 예: 03-flex-hybrid-v01.gif",
      409,
    );
  }
  const source = resolveInside(projectRoot, normalized);
  if (!(await exists(source))) {
    throw new StudioV1Error(
      "PENDING_ASSET_NOT_FOUND",
      "승인 대기 파일을 찾을 수 없습니다.",
      404,
    );
  }
  const targetRelative = `.detail-page/generation/${payload.decision}/${kind}/${fileName}`;
  const target = resolveInside(projectRoot, targetRelative);
  if (await exists(target)) {
    throw new StudioV1Error(
      "TARGET_EXISTS",
      "같은 이름의 대상 파일이 이미 있습니다. 새 버전 파일명을 사용하세요.",
      409,
    );
  }

  await mkdir(path.dirname(target), { recursive: true });
  await rename(source, target);
  const decidedAt = new Date().toISOString();
  const digest = await sha256(target);
  const record = {
    id: `${kind}:${fileName}`,
    fileName,
    kind,
    method: /-(imagegen-seq|heygenframe|hybrid)-v\d+/i.exec(fileName)?.[1] || null,
    sourcePath: normalized,
    relativePath: targetRelative,
    status: payload.decision,
    sha256: digest,
    approvedBy:
      payload.decision === "approved" ? "local-user" : null,
    rejectedBy:
      payload.decision === "rejected" ? "local-user" : null,
    decidedAt,
    note: String(payload.note || "").trim() || null,
  };

  const manifest = await readManifest(projectRoot);
  manifest.assets = manifest.assets.filter(
    (item) => item?.relativePath !== normalized && item?.id !== record.id,
  );
  manifest.assets.push(record);
  manifest.updatedAt = decidedAt;
  await writeManifest(projectRoot, manifest);
  await appendFile(
    path.join(
      projectRoot,
      ".detail-page",
      "generation",
      "approval-ledger.ndjson",
    ),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );

  return {
    ...assetRecord(projectRoot, target, payload.decision, kind),
    sha256: digest,
    decidedAt,
    workflowApprovalSubstitute: false,
  };
}

async function readProject(projectRoot) {
  try {
    return JSON.parse(
      await readFile(path.join(projectRoot, "project.json"), "utf8"),
    );
  } catch (error) {
    throw new StudioV1Error(
      "PROJECT_JSON_INVALID",
      "project.json을 읽을 수 없습니다.",
      error?.code === "ENOENT" ? 404 : 409,
    );
  }
}

function projectRefFromProject(project, agentSessionId = "studio-v1") {
  const camelDigest = project?.inputDigest;
  const snakeDigest = project?.input_digest;
  if (
    camelDigest &&
    snakeDigest &&
    String(camelDigest) !== String(snakeDigest)
  ) {
    throw new StudioV1Error(
      "WORKFLOW_PROJECT_DIGEST_CONFLICT",
      "project.json의 inputDigest와 input_digest가 서로 다릅니다.",
      409,
    );
  }
  const inputDigest = camelDigest ?? snakeDigest;
  if (
    !project?.id ||
    !/^[a-f0-9]{64}$/.test(String(inputDigest || ""))
  ) {
    throw new StudioV1Error(
      "WORKFLOW_PROJECT_REF_INVALID",
      "workflow에는 project.json의 id와 SHA-256 inputDigest 또는 input_digest가 필요합니다.",
      409,
    );
  }
  return {
    project_id: project.id,
    input_digest: inputDigest,
    agent_session_id: agentSessionId,
  };
}

async function workflowProjectRef(
  projectRoot,
  agentSessionId = "studio-v1",
) {
  return projectRefFromProject(
    await readProject(projectRoot),
    agentSessionId,
  );
}

export function inspectActivePublishLineageFreshness(
  graph,
  publishApprovalArtifactId,
) {
  const artifacts = Array.isArray(graph?.artifacts)
    ? graph.artifacts
    : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const artifactById = new Map(
    artifacts
      .filter((artifact) => artifact?.artifact_id)
      .map((artifact) => [artifact.artifact_id, artifact]),
  );
  if (
    !publishApprovalArtifactId ||
    !artifactById.has(publishApprovalArtifactId)
  ) {
    return {
      fresh: false,
      active_artifact_ids: [],
      blocking_stale_artifact_ids: [],
      unresolved_artifact_ids: publishApprovalArtifactId
        ? [publishApprovalArtifactId]
        : [],
    };
  }

  const incoming = new Map();
  for (const edge of edges) {
    if (!edge?.from || !edge?.to) {
      continue;
    }
    const dependencies = incoming.get(edge.to) ?? [];
    dependencies.push(edge.from);
    incoming.set(edge.to, dependencies);
  }

  const activeArtifactIds = new Set();
  const blockingStaleArtifactIds = new Set();
  const unresolvedArtifactIds = new Set();
  const pending = [publishApprovalArtifactId];
  while (pending.length > 0) {
    const artifactId = pending.pop();
    if (activeArtifactIds.has(artifactId)) {
      continue;
    }
    activeArtifactIds.add(artifactId);
    const artifact = artifactById.get(artifactId);
    if (!artifact) {
      unresolvedArtifactIds.add(artifactId);
      continue;
    }
    if (artifact.status === "stale") {
      blockingStaleArtifactIds.add(artifactId);
    }
    for (const dependencyId of incoming.get(artifactId) ?? []) {
      pending.push(dependencyId);
    }
  }

  return {
    fresh:
      blockingStaleArtifactIds.size === 0 &&
      unresolvedArtifactIds.size === 0,
    active_artifact_ids: [...activeArtifactIds].sort(),
    blocking_stale_artifact_ids: [
      ...blockingStaleArtifactIds,
    ].sort(),
    unresolved_artifact_ids: [...unresolvedArtifactIds].sort(),
  };
}

async function inspectWorkflowGate(projectRoot, workflowEngine) {
  try {
    const projectRef = await workflowProjectRef(
      projectRoot,
      "studio-v1-gate",
    );
    const workflow = await workflowEngine.inspect(projectRef);
    const stateIntegrity =
      workflow?.state_integrity?.status ?? "unknown";
    const publishApprovalStatus =
      workflow?.publish_approval?.status ?? "missing";
    const state =
      stateIntegrity === "verified"
        ? await createFileStateStore(projectRoot).load(
            workflow?.project_id,
          )
        : null;
    const lineageFreshness = state
      ? inspectActivePublishLineageFreshness(
          state.graph,
          workflow?.publish_approval?.artifact_id,
        )
      : {
          fresh: false,
          active_artifact_ids: [],
          blocking_stale_artifact_ids: [],
          unresolved_artifact_ids: [],
        };
    return {
      available: true,
      workflow,
      publishApproved:
        stateIntegrity === "verified" &&
        workflow?.stages?.G5U_APPROVAL?.status === "approved" &&
        workflow?.publish_approval?.valid === true,
      stateIntegrity,
      publishApprovalStatus,
      fresh: lineageFreshness.fresh,
      lineageFreshness,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      workflow: null,
      publishApproved: false,
      stateIntegrity: "unavailable",
      publishApprovalStatus: "unavailable",
      fresh: false,
      lineageFreshness: {
        fresh: false,
        active_artifact_ids: [],
        blocking_stale_artifact_ids: [],
        unresolved_artifact_ids: [],
      },
      error: {
        code: error?.code || "WORKFLOW_INSPECT_FAILED",
        message:
          error instanceof StudioV1Error ||
          error instanceof WorkflowEngineError
            ? error.message
            : "persistent workflow 상태를 읽을 수 없습니다.",
      },
    };
  }
}

async function workflowGraphDigest(projectRoot, workflow) {
  const state = await createFileStateStore(projectRoot).load(
    workflow?.project_id,
  );
  const seal = state?._state_seal;
  const graphProofDigest =
    seal?.algorithm === "hmac-sha256"
      ? seal.payload_hmac_sha256
      : seal?.algorithm === "sha256"
        ? seal.payload_sha256
        : null;
  if (
    !state ||
    state.input_digest !== workflow?.input_digest ||
    seal?.status !== "verified" ||
    !/^[a-f0-9]{64}$/.test(String(graphProofDigest || ""))
  ) {
    throw new StudioV1Error(
      "WORKFLOW_GRAPH_PROOF_UNAVAILABLE",
      "sealed workflow graph proof를 만들 수 없습니다.",
      409,
    );
  }
  return graphProofDigest;
}

async function readWorkflowArtifactRecord(projectRoot, artifact) {
  if (!artifact?.record_locator || !artifact?.record_sha256) {
    throw new StudioV1Error(
      "PUBLISH_QA_RECORD_REQUIRED",
      "게시 QA artifact의 immutable record가 필요합니다.",
      409,
    );
  }
  const recordPath = resolveInside(
    projectRoot,
    artifact.record_locator,
  );
  const bytes = await readFile(recordPath);
  const digest = sha256Bytes(bytes);
  if (digest !== artifact.record_sha256) {
    throw new StudioV1Error(
      "PUBLISH_QA_RECORD_INTEGRITY_MISMATCH",
      "게시 QA artifact record bytes가 workflow hash와 다릅니다.",
      409,
    );
  }
  let record;
  try {
    record = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new StudioV1Error(
      "PUBLISH_QA_RECORD_JSON_INVALID",
      "게시 QA artifact record를 읽을 수 없습니다.",
      409,
    );
  }
  if (
    record?.artifact?.artifact_id !== artifact.artifact_id ||
    record?.artifact?.manifest_sha256 !==
      artifact.manifest_sha256
  ) {
    throw new StudioV1Error(
      "PUBLISH_QA_RECORD_SUBJECT_MISMATCH",
      "게시 QA record와 workflow artifact가 다릅니다.",
      409,
    );
  }
  return record;
}

async function inspectPublishQuality(projectRoot, workflow) {
  const candidates = (workflow?.artifacts ?? []).filter(
    (artifact) =>
      artifact.type === "qa.validation_receipt" &&
      artifact.status === "fresh" &&
      artifact.produced_by_stage === "G5_PUBLISH_QA",
  );
  if (candidates.length !== 1) {
    return {
      valid: false,
      status: candidates.length === 0 ? "missing" : "ambiguous",
      score: null,
      qualityMetrics: null,
      recordSha256: null,
      blockers: [
        candidates.length === 0
          ? "G5 publish QA validation receipt 없음"
          : "G5 publish QA validation receipt가 하나로 고정되지 않음",
      ],
    };
  }
  try {
    const record = await readWorkflowArtifactRecord(
      projectRoot,
      candidates[0],
    );
    const receipt =
      record.artifact.validation_receipt ?? record.artifact;
    const metrics = receipt?.quality_metrics ?? {};
    const hardFailures = Array.isArray(receipt?.hard_failures)
      ? receipt.hard_failures
      : [];
    const blockers = [
      ...(receipt?.verdict === "PASS"
        ? []
        : ["G5 publish QA verdict가 PASS가 아님"]),
      ...(Number(receipt?.score) >= 97
        ? []
        : ["상용 QA 97점 미만"]),
      ...(Number(metrics.behance_quality_score) >= 90
        ? []
        : ["Behance quality 90점 미만"]),
      ...(Number(metrics.critical_dimension_min_score) >= 85
        ? []
        : ["critical dimension 85점 미만"]),
      ...(Number(metrics.deterministic_hard_failure_count) === 0
        ? []
        : ["deterministic hard failure가 0이 아님"]),
      ...(hardFailures.length === 0
        ? []
        : [`hard failure ${hardFailures.length}개`]),
    ];
    return {
      valid: blockers.length === 0,
      status: blockers.length === 0 ? "verified" : "blocked",
      artifactId: candidates[0].artifact_id,
      score: Number(receipt?.score),
      qualityMetrics: {
        behance_quality_score: Number(
          metrics.behance_quality_score,
        ),
        critical_dimension_min_score: Number(
          metrics.critical_dimension_min_score,
        ),
        deterministic_hard_failure_count: Number(
          metrics.deterministic_hard_failure_count,
        ),
      },
      recordSha256: candidates[0].record_sha256,
      blockers,
    };
  } catch (error) {
    return {
      valid: false,
      status: "unavailable",
      score: null,
      qualityMetrics: null,
      recordSha256: null,
      blockers: [
        `G5 publish QA record 검증 실패: ${error?.code ?? "UNKNOWN"}`,
      ],
    };
  }
}

async function gateStatus(projectRoot, workflowEngine) {
  const assets = await listAssets(projectRoot);
  const manifest = await readManifest(projectRoot);
  const rawPendingCount = assets.filter(
    (asset) => asset.status === "pending",
  ).length;
  const rawMissingRequired = manifest.assets.filter(
    (asset) => asset?.required === true && asset?.status !== "approved",
  );
  let project;
  try {
    project = await readProject(projectRoot);
  } catch {
    project = {};
  }
  const workflowGate = await inspectWorkflowGate(
    projectRoot,
    workflowEngine,
  );
  const fastPath =
    workflowGate.workflow?.workflow_flags
      ?.plan_once_fast_path;
  const fastPathStageIds = new Set(
    fastPath?.auto_approved_stage_ids ?? [],
  );
  const planOnceAssetApproval =
    fastPath?.policy_id ===
      "policy.approval.plan-once-with-actual-photos.v1" &&
    fastPath?.actual_product_photos_verified === true &&
    fastPath?.manual_plan_approval_verified === true &&
    ["G2U_APPROVAL", "G3U_APPROVAL"].every(
      (stageId) =>
        fastPathStageIds.has(stageId) &&
        workflowGate.workflow?.stages?.[stageId]?.status ===
          "approved",
    );
  const pendingCount = planOnceAssetApproval
    ? 0
    : rawPendingCount;
  const missingRequired = planOnceAssetApproval
    ? []
    : rawMissingRequired;
  const finalQaPassed =
    project?.finalQa?.status === "passed" &&
    Number(project?.finalQa?.score || 0) >= 97;
  const exportAllowed = pendingCount === 0 && missingRequired.length === 0;
  const workflowPublishApproved = workflowGate.publishApproved;
  const workflowFresh = workflowGate.fresh;
  const publishQuality = workflowGate.workflow
    ? await inspectPublishQuality(
        projectRoot,
        workflowGate.workflow,
      )
    : {
        valid: false,
        status: "unavailable",
        score: null,
        qualityMetrics: null,
        recordSha256: null,
        blockers: ["persistent workflow를 읽지 못해 G5 QA를 검증할 수 없음"],
      };
  const graphDigest =
    workflowGate.workflow &&
    workflowGate.stateIntegrity === "verified"
    ? await workflowGraphDigest(
        projectRoot,
        workflowGate.workflow,
      )
    : null;
  const publishExportAllowed =
    exportAllowed &&
    publishQuality.valid &&
    workflowPublishApproved &&
    workflowFresh;
  return {
    studioVersion: 1,
    pendingCount,
    rawPendingCount,
    missingRequiredCount: missingRequired.length,
    rawMissingRequiredCount: rawMissingRequired.length,
    planOnceAssetApproval,
    exportAllowed,
    finalQaPassed,
    finalQaScore: Number(project?.finalQa?.score || 0),
    userPublishApproved: workflowPublishApproved,
    legacyUserPublishApproved:
      project?.finalQa?.userApproved === true,
    workflowPublishApproved,
    workflowFresh,
    workflowActiveArtifactCount:
      workflowGate.lineageFreshness?.active_artifact_ids?.length ??
      0,
    workflowBlockingStaleArtifactIds:
      workflowGate.lineageFreshness
        ?.blocking_stale_artifact_ids ?? [],
    workflowUnresolvedArtifactIds:
      workflowGate.lineageFreshness?.unresolved_artifact_ids ?? [],
    workflowStateIntegrity: workflowGate.stateIntegrity,
    workflowPublishApprovalStatus:
      workflowGate.publishApprovalStatus,
    workflowStageStatus:
      workflowGate.workflow?.stages?.G5U_APPROVAL?.status ?? null,
    workflowError: workflowGate.error,
    workflowApproval: WORKFLOW_APPROVAL_NOTICE,
    workflowGraphDigest: graphDigest,
    workflowPublishApprovalSubjectDigest:
      workflowGate.workflow?.publish_approval
        ?.subject_artifact_set_digest ?? null,
    publishQualityStatus: publishQuality.status,
    publishQualityArtifactId:
      publishQuality.artifactId ?? null,
    publishQualityRecordSha256:
      publishQuality.recordSha256,
    publishQaScore: publishQuality.score,
    publishQualityMetrics:
      publishQuality.qualityMetrics,
    publishExportAllowed,
    htmlExportAllowed: publishExportAllowed,
    coupangWingExportAllowed: publishExportAllowed,
    coupangWingBlockers: [
      ...(pendingCount > 0 ? [`승인 대기 에셋 ${pendingCount}개`] : []),
      ...(missingRequired.length > 0
        ? [`필수 미승인 에셋 ${missingRequired.length}개`]
        : []),
      ...publishQuality.blockers,
      ...(workflowGate.available
        ? []
        : [
            `persistent workflow 확인 실패: ${workflowGate.error?.code ?? "UNKNOWN"}`,
          ]),
      ...(workflowGate.stateIntegrity === "verified"
        ? []
        : [
            `persistent workflow state integrity 미검증: ${workflowGate.stateIntegrity}`,
          ]),
      ...(workflowGate.workflow?.stages?.G5U_APPROVAL?.status === "approved"
        ? []
        : ["persistent workflow G5U_APPROVAL 승인 없음"]),
      ...(workflowGate.publishApprovalStatus === "verified"
        ? []
        : [
            `persistent workflow publish approval artifact 미검증: ${workflowGate.publishApprovalStatus}`,
          ]),
      ...(workflowFresh
        ? []
        : [
            "현재 publish approval 계보에 stale 또는 확인 불가 artifact가 있음",
          ]),
    ],
  };
}

function assertPublishExportAllowed(
  gate,
  exportKind,
  blockedCode = "PUBLISH_EXPORT_BLOCKED",
) {
  if (!gate.publishExportAllowed) {
    throw new StudioV1Error(
      blockedCode,
      `${exportKind} 내보내기 잠김: ${gate.coupangWingBlockers.join(", ")}`,
      409,
    );
  }
  if (
    !gate.workflowGraphDigest ||
    !gate.workflowPublishApprovalSubjectDigest ||
    !gate.publishQualityRecordSha256
  ) {
    throw new StudioV1Error(
      "PUBLISH_EXPORT_PROOF_INCOMPLETE",
      `${exportKind} 내보내기의 graph·approval·QA proof가 불완전합니다.`,
      409,
    );
  }
  return gate;
}

async function resolveApprovedStudioRevision(
  projectRoot,
  workflow,
) {
  const candidates = (workflow?.artifacts ?? []).filter(
    (artifact) =>
      artifact.type === "studio.committed_revision" &&
      artifact.status === "fresh" &&
      artifact.produced_by_stage === "G4C_STUDIO_COMMIT",
  );
  if (candidates.length !== 1) {
    throw new StudioV1Error(
      "APPROVED_STUDIO_REVISION_AMBIGUOUS",
      "내보낼 fresh immutable Studio revision이 하나여야 합니다.",
      409,
    );
  }
  const revisionsRoot = path.join(
    projectRoot,
    "studio",
    "revisions",
  );
  const entries = await readdir(revisionsRoot, {
    withFileTypes: true,
  }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const revisionRoot = path.join(revisionsRoot, entry.name);
    try {
      const revision = JSON.parse(
        await readFile(
          path.join(revisionRoot, "revision.json"),
          "utf8",
        ),
      );
      if (revision.artifact_id === candidates[0].artifact_id) {
        matches.push({ revisionRoot, revision });
      }
    } catch {
      continue;
    }
  }
  if (matches.length !== 1) {
    throw new StudioV1Error(
      "APPROVED_STUDIO_REVISION_NOT_FOUND",
      "workflow artifact와 일치하는 immutable revision directory를 찾을 수 없습니다.",
      409,
    );
  }
  const { revisionRoot, revision } = matches[0];
  const {
    commit_sha256: suppliedCommitSha256,
    committed_at: _committedAt,
    ...revisionBody
  } = revision;
  const actualCommitSha256 = canonicalSha256(revisionBody);
  if (
    suppliedCommitSha256 !== actualCommitSha256 ||
    candidates[0].manifest_sha256 !== actualCommitSha256
  ) {
    throw new StudioV1Error(
      "APPROVED_STUDIO_REVISION_TAMPERED",
      "immutable Studio revision hash가 workflow artifact와 다릅니다.",
      409,
    );
  }
  const indexPath = path.join(revisionRoot, "index.html");
  if ((await sha256(indexPath)) !== revision.html_sha256) {
    throw new StudioV1Error(
      "APPROVED_STUDIO_HTML_TAMPERED",
      "immutable Studio revision의 index.html bytes가 바뀌었습니다.",
      409,
    );
  }
  return {
    graphArtifact: candidates[0],
    revisionRoot,
    revision,
  };
}

function assertSamePublishProof(initialGate, finalGate) {
  if (
    finalGate.workflowGraphDigest !==
      initialGate.workflowGraphDigest ||
    finalGate.workflowPublishApprovalSubjectDigest !==
      initialGate.workflowPublishApprovalSubjectDigest ||
    finalGate.publishQualityRecordSha256 !==
      initialGate.publishQualityRecordSha256
  ) {
    throw new StudioV1Error(
      "PUBLISH_PROOF_DRIFT",
      "전달본 생성 중 graph·approval·QA proof가 바뀌었습니다.",
      409,
    );
  }
}

async function runGeneralHtmlExport({
  projectRoot,
  workflowEngine,
  gate,
  baseUrl,
}) {
  assertPublishExportAllowed(gate, "일반 HTML");
  const projectRef = await workflowProjectRef(
    projectRoot,
    "studio-v1-html-export",
  );
  const workflow = await workflowEngine.inspect(projectRef);
  if (
    (await workflowGraphDigest(projectRoot, workflow)) !==
    gate.workflowGraphDigest
  ) {
    throw new StudioV1Error(
      "PUBLISH_GRAPH_DRIFT",
      "export gate 확인 뒤 workflow graph가 바뀌었습니다.",
      409,
    );
  }
  const approved = await resolveApprovedStudioRevision(
    projectRoot,
    workflow,
  );
  const proof = {
    revision_id: approved.revision.revision_id,
    revision_commit_sha256:
      approved.revision.commit_sha256,
    workflow_graph_digest: gate.workflowGraphDigest,
    publish_approval_subject_digest:
      gate.workflowPublishApprovalSubjectDigest,
    publish_quality_record_sha256:
      gate.publishQualityRecordSha256,
  };
  const finalGateBeforeWrite = assertPublishExportAllowed(
    await gateStatus(projectRoot, workflowEngine),
    "일반 HTML",
  );
  assertSamePublishProof(gate, finalGateBeforeWrite);
  const approvedHtml = await readFile(
    path.join(approved.revisionRoot, "index.html"),
    "utf8",
  );
  const saved = await saveProjectOutput(projectRoot, {
      html: approvedHtml,
      immutableMediaRoot: path.join(
        approved.revisionRoot,
        "media",
      ),
      exportManifest: {
        schema_version: "2.0",
        export_type: "public-detail-page-html",
        ...proof,
        publish_quality: {
          score: gate.publishQaScore,
          ...gate.publishQualityMetrics,
        },
      },
      validateBeforeCommit: async () => {
        const finalGateAfterWrite = assertPublishExportAllowed(
          await gateStatus(projectRoot, workflowEngine),
          "일반 HTML",
        );
        assertSamePublishProof(gate, finalGateAfterWrite);
      },
    });
  return {
    status: "ready",
    revision_id: approved.revision.revision_id,
    output_path: saved.output_path,
    manifest_path: saved.export_manifest_path,
    download_url: `${baseUrl}/output/detail-page.html`,
    manifest: saved.export_manifest,
    wing_export_required: true,
  };
}

function normalizeCdnBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new StudioV1Error(
      "CDN_BASE_URL_INVALID",
      "쿠팡 Wing CDN 기본 주소는 유효한 HTTPS 주소여야 합니다.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new StudioV1Error(
      "CDN_BASE_URL_INVALID",
      "CDN 기본 주소는 인증정보·쿼리·해시가 없는 HTTPS 주소여야 합니다.",
    );
  }
  return parsed.href.replace(/\/+$/, "");
}

function exportTimestamp(now = new Date()) {
  return now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "")
    .replaceAll("-", "")
    .replace("T", "-")
    .replace("Z", "");
}

function safeProjectKey(value) {
  return (
    String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9가-힣-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "product"
  );
}

export function createWingExportIdentity({
  projectRoot,
  cdnBaseUrl,
  projectKey,
  now = new Date(),
  nonce = randomUUID().slice(0, 8),
}) {
  const normalizedCdnBaseUrl = normalizeCdnBaseUrl(cdnBaseUrl);
  const normalizedProjectKey = safeProjectKey(
    projectKey || path.basename(projectRoot),
  );
  const exportId = `wing-${exportTimestamp(now)}-${nonce}`;
  return {
    exportId,
    projectKey: normalizedProjectKey,
    cdnBaseUrl: `${normalizedCdnBaseUrl}/${encodeURIComponent(
      normalizedProjectKey,
    )}/${encodeURIComponent(exportId)}`,
    outputRoot: resolveInside(
      projectRoot,
      path.join("output", "wing", exportId),
    ),
  };
}

async function runCoupangWingExport({
  projectRoot,
  pageUrl,
  cdnBaseUrl,
  productName,
  projectKey,
  identity: providedIdentity,
}) {
  const identity =
    providedIdentity ||
    createWingExportIdentity({
      projectRoot,
      cdnBaseUrl,
      projectKey,
    });
  const {
    cdnBaseUrl: normalizedCdnBaseUrl,
    exportId,
    outputRoot,
  } = identity;
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  const exporter = await readFile(
    new URL("./coupang-wing-export.py", import.meta.url),
    "utf8",
  );
  const recordingName = `${path.basename(projectRoot)}-${exportId}`.replace(
    /[^a-zA-Z0-9_-]+/g,
    "-",
  );
  const child = spawn("browser-harness", [], {
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    env: {
      ...process.env,
      WING_PAGE_URL: pageUrl,
      WING_EXPORT_ROOT: outputRoot,
      WING_CDN_BASE_URL: normalizedCdnBaseUrl,
      WING_PRODUCT_NAME: productName,
      WING_RECORDING_NAME: recordingName,
      WING_EXPORT_ID: exportId,
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
    stdout += chunk;
    if (stdout.length > 4_000_000) stdout = stdout.slice(-4_000_000);
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (stderr.length > 4_000_000) stderr = stderr.slice(-4_000_000);
  });
  child.stdin.end(exporter);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0) {
    await writeFile(
      path.join(outputRoot, "export-error.log"),
      `${stdout}\n${stderr}`,
      "utf8",
    );
    throw new StudioV1Error(
      "COUPANG_WING_EXPORT_FAILED",
      "쿠팡 Wing WebP 변환에 실패했습니다. export-error.log를 확인하세요.",
      500,
    );
  }
  const resultLine = stdout
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.startsWith("WING_EXPORT_RESULT "));
  if (!resultLine) {
    await writeFile(
      path.join(outputRoot, "export-error.log"),
      `${stdout}\n${stderr}`,
      "utf8",
    );
    throw new StudioV1Error(
      "COUPANG_WING_EXPORT_RESULT_MISSING",
      "쿠팡 Wing 내보내기 결과를 읽지 못했습니다.",
      500,
    );
  }
  const result = JSON.parse(
    resultLine.slice("WING_EXPORT_RESULT ".length),
  );
  const relativeOutputRoot = toPosix(
    path.relative(projectRoot, outputRoot),
  );
  return {
    ...result,
    exportId,
    projectKey: identity.projectKey,
    cdnBaseUrl: normalizedCdnBaseUrl,
    relativeOutputRoot,
    previewUrl: `/${relativeOutputRoot}/preview-local-780.html`,
    wingHtmlUrl: `/${relativeOutputRoot}/coupang-wing-detail-780.html`,
  };
}

function wingExportJobPath(projectRoot, exportId) {
  return resolveInside(
    projectRoot,
    path.join(
      ".detail-page",
      "workflow",
      "jobs",
      `${exportId}.json`,
    ),
  );
}

async function updateWingExportJob(
  projectRoot,
  exportId,
  patch,
) {
  const jobPath = wingExportJobPath(projectRoot, exportId);
  await mkdir(path.dirname(jobPath), { recursive: true });
  let current = {};
  try {
    current = JSON.parse(await readFile(jobPath, "utf8"));
  } catch {
    current = {};
  }
  const updatedAt = new Date().toISOString();
  const next = {
    ...current,
    ...patch,
    id: exportId,
    updatedAt,
    history: [
      ...(Array.isArray(current.history) ? current.history : []),
      {
        status: patch.status || current.status || "unknown",
        at: updatedAt,
        ...(patch.error ? { error: patch.error } : {}),
      },
    ],
  };
  const temporaryPath = `${jobPath}.tmp-${randomUUID()}`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, jobPath);
  return next;
}

export async function publishCoupangWingToCloudflare({
  projectRoot,
  pageUrl,
  productName,
  projectKey,
  cloudflareRunner,
  fetchImpl = fetch,
  preflightImpl = preflightCloudflarePagesConnection,
  renderImpl = runCoupangWingExport,
  uploadImpl = uploadCloudflarePagesExport,
  verifyImpl = verifyCdnWingExport,
  validateBeforeCommit,
}) {
  const connection = await preflightImpl({
    projectRoot,
    runner: cloudflareRunner,
  });
  const identity = createWingExportIdentity({
    projectRoot,
    cdnBaseUrl: connection.publicBaseUrl,
    projectKey,
  });
  const commonJob = {
    projectKey: identity.projectKey,
    cdnBaseUrl: identity.cdnBaseUrl,
    provider: "cloudflare-pages",
    pagesProject: connection.pagesProject,
    remoteVerification: "pending",
  };
  await updateWingExportJob(projectRoot, identity.exportId, {
    ...commonJob,
    status: "preparing",
    preparedAt: new Date().toISOString(),
  });
  let phase = "preparing";
  try {
    const rendered = await renderImpl({
      projectRoot,
      pageUrl,
      cdnBaseUrl: connection.publicBaseUrl,
      productName,
      projectKey: identity.projectKey,
      identity,
    });
    phase = "generated";
    await updateWingExportJob(projectRoot, identity.exportId, {
      ...commonJob,
      status: phase,
      generatedAt: new Date().toISOString(),
      relativeOutputRoot: rendered.relativeOutputRoot,
      result: rendered,
    });
    phase = "uploading";
    await updateWingExportJob(projectRoot, identity.exportId, {
      status: phase,
      uploadStartedAt: new Date().toISOString(),
    });
    const uploaded = await uploadImpl({
      projectRoot,
      exportRoot: identity.outputRoot,
      projectKey: identity.projectKey,
      exportId: identity.exportId,
      runner: cloudflareRunner,
      fetchImpl,
    });
    phase = "verifying";
    await updateWingExportJob(projectRoot, identity.exportId, {
      status: phase,
      uploadedAt: new Date().toISOString(),
      upload: uploaded,
    });
    if (validateBeforeCommit) await validateBeforeCommit();
    const verified = await verifyImpl(
      projectRoot,
      identity.exportId,
      {
        fetchImpl,
        validateBeforeCommit,
        expectedPublicBaseUrl: connection.publicBaseUrl,
      },
    );
    phase = "completed";
    await updateWingExportJob(projectRoot, identity.exportId, {
      status: phase,
      completedAt: new Date().toISOString(),
      remoteVerification: "passed",
      verification: verified,
    });
    return {
      ...rendered,
      status: "completed",
      remoteVerification: "passed",
      upload: uploaded,
      verification: verified,
    };
  } catch (error) {
    const failureState =
      error instanceof CloudflarePagesUploaderError
        ? error.state
        : phase === "preparing"
          ? "render_failed"
          : phase === "verifying"
            ? "verification_failed"
            : `${phase}_failed`;
    await updateWingExportJob(projectRoot, identity.exportId, {
      status: failureState,
      failedAt: new Date().toISOString(),
      remoteVerification: "failed",
      error: {
        code: error.code || "COUPANG_WING_PUBLISH_FAILED",
        message: error.message,
        state: failureState,
      },
    });
    throw error;
  }
}

export async function verifyCdnWingExport(
  projectRoot,
  exportId,
  {
    fetchImpl = fetch,
    validateBeforeCommit,
    expectedPublicBaseUrl,
  } = {},
) {
  if (!/^wing-[a-zA-Z0-9-]+$/.test(String(exportId || ""))) {
    throw new StudioV1Error(
      "WING_EXPORT_ID_INVALID",
      "유효한 Wing exportId가 필요합니다.",
    );
  }
  const outputRoot = resolveInside(
    projectRoot,
    path.join("output", "wing", exportId),
  );
  const manifestPath = path.join(outputRoot, "cdn-upload-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const publicBaseUrl =
    expectedPublicBaseUrl ||
    (await loadCloudflarePagesConfig(projectRoot)).publicBaseUrl;
  const normalizedProjectKey = safeProjectKey(manifest.project_key);
  const expectedNamespaceUrl =
    `${normalizeCdnBaseUrl(publicBaseUrl)}/${encodeURIComponent(
      normalizedProjectKey,
    )}/${encodeURIComponent(exportId)}`;
  if (
    manifest.export_id !== exportId ||
    manifest.project_key !== normalizedProjectKey ||
    manifest.cdn_base_url !== expectedNamespaceUrl
  ) {
    throw new StudioV1Error(
      "WING_CDN_NAMESPACE_MISMATCH",
      "Wing manifest namespace가 프로젝트 Cloudflare config와 일치하지 않습니다.",
      409,
    );
  }
  const checks = [];
  for (const asset of manifest.assets || []) {
    if (
      typeof asset.filename !== "string" ||
      path.basename(asset.filename) !== asset.filename ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}\.webp$/i.test(
        asset.filename,
      )
    ) {
      throw new StudioV1Error(
        "WING_CDN_ASSET_FILENAME_INVALID",
        "Wing asset 파일명이 안전한 WebP 파일명이 아닙니다.",
        409,
      );
    }
    const expectedUrl =
      `${expectedNamespaceUrl}/${encodeURIComponent(asset.filename)}`;
    if (asset.cdn_url !== expectedUrl) {
      throw new StudioV1Error(
        "WING_CDN_ASSET_URL_MISMATCH",
        "Wing asset URL이 config 기반 namespace와 일치하지 않습니다.",
        409,
      );
    }
    const response = await fetchImpl(asset.cdn_url, {
      method: "GET",
      redirect: "manual",
      headers: { "Cache-Control": "no-cache" },
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const mime = String(response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const digest = sha256Bytes(bytes);
    const cacheControl = String(
      response.headers.get("cache-control") || "",
    );
    const check = {
      url: asset.cdn_url,
      status: response.status,
      mime,
      bytes: bytes.length,
      sha256: digest,
      cacheControl,
      passed:
        response.status === 200 &&
        mime === "image/webp" &&
        bytes.length === asset.bytes &&
        digest === asset.sha256 &&
        /(?:^|,)\s*max-age=31536000\s*(?:,|$)/i.test(cacheControl) &&
        /(?:^|,)\s*immutable\s*(?:,|$)/i.test(cacheControl),
    };
    checks.push(check);
  }
  if (!checks.length || checks.some((check) => !check.passed)) {
    manifest.remote_verification = {
      status: "failed",
      checked_at: new Date().toISOString(),
      checks,
    };
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    throw new StudioV1Error(
      "WING_REMOTE_VERIFICATION_FAILED",
      "CDN 원격 파일의 HTTP·MIME·크기·해시·immutable cache 검증에 실패했습니다.",
      409,
    );
  }
  manifest.remote_verification = {
    status: "passed",
    checked_at: new Date().toISOString(),
    checks,
  };
  const manifestBytes = Buffer.from(
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  if (validateBeforeCommit) await validateBeforeCommit();
  await writeFile(manifestPath, manifestBytes);
  const wingHtml = await readFile(
    path.join(outputRoot, "coupang-wing-detail-780.html"),
    "utf8",
  );
  await markWingExportCompleted(projectRoot, {
    exportId,
    cdnHtml: wingHtml,
    manifestSha256: sha256Bytes(manifestBytes),
  });
  return {
    status: "completed",
    exportId,
    remoteVerification: "passed",
    manifestPath: toPosix(path.relative(projectRoot, manifestPath)),
    outputPath: `output/wing/${exportId}/detail-page.html`,
  };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 20_000_000) {
      throw new StudioV1Error("JSON_TOO_LARGE", "요청이 너무 큽니다.", 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new StudioV1Error("JSON_INVALID", "JSON 요청을 읽을 수 없습니다.");
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

async function serveFile(response, filePath, extraHeaders = {}) {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new StudioV1Error("FILE_NOT_FOUND", "파일이 없습니다.", 404);
  }
  const body = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type":
      MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(body);
}

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? { file: "cmd", args: ["/c", "start", "", url] }
      : process.platform === "darwin"
        ? { file: "open", args: [url] }
        : { file: "xdg-open", args: [url] };
  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function resolvePageDirectory(projectRoot) {
  const legacyPageDirectory = path.join(projectRoot, "detail-page");
  if (await exists(path.join(legacyPageDirectory, "studio.html"))) {
    return legacyPageDirectory;
  }
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "assets",
    "studio-v1-runtime",
  );
}

async function readStudioHtml(projectRoot, pageDirectory) {
  let project = {};
  try {
    project = JSON.parse(
      await readFile(path.join(projectRoot, "project.json"), "utf8"),
    );
  } catch {
    project = {};
  }
  const productName = String(
    project?.name || path.basename(projectRoot),
  );
  const projectKey = String(
    project?.productId ||
      project?.id ||
      path.basename(projectRoot),
  );
  return (
    await readFile(path.join(pageDirectory, "studio.html"), "utf8")
  )
    .replaceAll("{{PRODUCT_NAME}}", productName)
    .replaceAll("{{PROJECT_KEY}}", projectKey);
}

function serveHtml(response, html, extraHeaders = {}) {
  const body = Buffer.from(html, "utf8");
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(body);
}

export async function startStudioV1Server({
  projectRoot,
  port = 8896,
  host = "127.0.0.1",
  open = true,
  cloudflareRunner,
  wingFetchImpl = fetch,
  cloudflarePreflightImpl = preflightCloudflarePagesConnection,
  wingRenderImpl = runCoupangWingExport,
  cloudflareUploadImpl = uploadCloudflarePagesExport,
  wingVerifyImpl = verifyCdnWingExport,
}) {
  const root = path.resolve(projectRoot);
  const rootInfo = await stat(root);
  if (!rootInfo.isDirectory()) {
    throw new Error(`프로젝트 폴더가 아닙니다: ${root}`);
  }
  const pageDirectory = await resolvePageDirectory(root);
  const studioHtml = await readStudioHtml(root, pageDirectory);
  const currentAuthoringPath = path.join(
    root,
    ".detail-page",
    "authoring",
    "detail-page.html",
  );
  const authoringPath = (await exists(currentAuthoringPath))
    ? currentAuthoringPath
    : path.join(root, "output", "detail-page.html");
  const workflowEngine = createWorkflowEngine({ projectRoot: root });
  const capabilityToken = randomBytes(32).toString("base64url");
  const capabilityCookie =
    `${STUDIO_CAPABILITY_COOKIE}=${capabilityToken}; Path=/; HttpOnly; SameSite=Strict`;
  let wingExportInProgress = false;
  let server;
  const baseUrlFor = () => {
    const address = server?.address();
    const actualPort =
      typeof address === "object" && address ? address.port : port;
    return `http://${authorityHost(host)}:${actualPort}`;
  };
  const studioPipeline = createStudioG4Pipeline({
    projectRoot: root,
    workflowEngine,
    projectRefFor: (agentSessionId) =>
      workflowProjectRef(root, agentSessionId),
    baseUrlFor,
  });
  server = http.createServer(async (request, response) => {
    try {
      const pathname = requestPathname(request.url || "/");
      const expectedOrigin = baseUrlFor();
      assertBoundRequest(request, expectedOrigin, pathname);
      const url = new URL(request.url || "/", expectedOrigin);
      if (pathname.startsWith("/api/v1/")) {
        assertStudioCapability(request, capabilityToken);
      }

      if (request.method === "GET" && pathname === "/api/v1/assets") {
        sendJson(response, 200, {
          assets: await listAssets(root),
          workflowApproval: WORKFLOW_APPROVAL_NOTICE,
        });
        return;
      }
      if (request.method === "GET" && pathname === "/api/v1/gate") {
        sendJson(response, 200, {
          ...(await gateStatus(root, workflowEngine)),
          output: await readProjectOutputState(root),
        });
        return;
      }
      if (
        request.method === "GET" &&
        pathname === "/api/v1/cloudflare-pages/status"
      ) {
        try {
          sendJson(response, 200, {
            connected: true,
            connection: await cloudflarePreflightImpl({
              projectRoot: root,
              runner: cloudflareRunner,
            }),
          });
        } catch (error) {
          if (!(error instanceof CloudflarePagesUploaderError)) throw error;
          sendJson(response, 200, {
            connected: false,
            error: {
              code: error.code,
              message: error.message,
              state: error.state,
            },
          });
        }
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/output/save"
      ) {
        const payload = await readJson(request);
        sendJson(
          response,
          200,
          await saveProjectOutput(root, { html: payload.html }),
        );
        return;
      }
      if (
        request.method === "GET" &&
        pathname === "/api/v1/output/backups"
      ) {
        sendJson(response, 200, {
          backups: await listProjectBackups(root),
        });
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/output/restore"
      ) {
        const payload = await readJson(request);
        sendJson(
          response,
          200,
          await restoreProjectBackup(root, payload.backup_id),
        );
        return;
      }
      if (
        request.method === "GET" &&
        pathname === "/api/v1/studio/session"
      ) {
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) {
          throw new StudioV1Error(
            "STUDIO_SESSION_ID_REQUIRED",
            "session_id가 필요합니다.",
          );
        }
        sendJson(response, 200, {
          session: await studioPipeline.inspectSession(sessionId),
        });
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/studio/working/import"
      ) {
        sendJson(
          response,
          200,
          await studioPipeline.importWorking(
            await readJson(request),
          ),
        );
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/studio/working/save"
      ) {
        sendJson(
          response,
          200,
          await studioPipeline.saveWorking(
            await readJson(request),
          ),
        );
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/studio/commit"
      ) {
        sendJson(
          response,
          200,
          await studioPipeline.commitAndPlanCapture(
            await readJson(request),
          ),
        );
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/studio/capture/complete"
      ) {
        sendJson(
          response,
          200,
          await studioPipeline.completeCaptureAndOpenApproval(
            await readJson(request),
          ),
        );
        return;
      }
      if (request.method === "GET" && pathname === "/api/v1/workflow") {
        const projectRef = await workflowProjectRef(
          root,
          "studio-v1-inspect",
        );
        sendJson(response, 200, {
          projectRef: {
            project_id: projectRef.project_id,
            input_digest: projectRef.input_digest,
          },
          workflow: await workflowEngine.inspect(projectRef),
          workflowApproval: WORKFLOW_APPROVAL_NOTICE,
        });
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/workflow/advance"
      ) {
        const payload = await readJson(request);
        const projectRef = await workflowProjectRef(
          root,
          "studio-v1-advance",
        );
        const result = await workflowEngine.advance(projectRef, {
          until: payload.until ?? "next_user_gate",
        });
        sendJson(response, 200, {
          result,
          workflow: await workflowEngine.inspect(projectRef),
        });
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/workflow/decision"
      ) {
        const payload = await readJson(request);
        if (!payload.challenge_id) {
          throw new StudioV1Error(
            "CHALLENGE_ID_REQUIRED",
            "challenge_id가 필요합니다.",
          );
        }
        const projectRef = await workflowProjectRef(
          root,
          "studio-v1-user",
        );
        const result = await workflowEngine.decide(
          payload.challenge_id,
          {
            project_ref: projectRef,
            nonce: payload.nonce,
            subject_artifact_set_digest:
              payload.subject_artifact_set_digest,
            decision: payload.decision,
            reason: payload.reason,
            decided_by: "local-user",
            approval_channel: "studio-v1",
          },
        );
        sendJson(response, 200, {
          result,
          workflow: await workflowEngine.inspect(projectRef),
        });
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/assets/decision"
      ) {
        const asset = await decideAsset(root, await readJson(request));
        sendJson(response, 200, {
          asset,
          workflowApproval: WORKFLOW_APPROVAL_NOTICE,
          gate: await gateStatus(root, workflowEngine),
        });
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/exports/html"
      ) {
        await readJson(request);
        const gate = assertPublishExportAllowed(
          await gateStatus(root, workflowEngine),
          "일반 HTML",
          "HTML_EXPORT_BLOCKED",
        );
        const result = await runGeneralHtmlExport({
          projectRoot: root,
          workflowEngine,
          gate,
          baseUrl: baseUrlFor(),
        });
        sendJson(response, 200, { result, gate });
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/exports/coupang-wing"
      ) {
        if (wingExportInProgress) {
          throw new StudioV1Error(
            "COUPANG_WING_EXPORT_IN_PROGRESS",
            "쿠팡 Wing 내보내기가 이미 진행 중입니다.",
            409,
          );
        }
        const gate = assertPublishExportAllowed(
          await gateStatus(root, workflowEngine),
          "쿠팡 Wing",
          "COUPANG_WING_EXPORT_BLOCKED",
        );
        await readJson(request);
        let project = {};
        try {
          project = JSON.parse(
            await readFile(path.join(root, "project.json"), "utf8"),
          );
        } catch {
          project = {};
        }
        const address = server.address();
        const actualPort =
          typeof address === "object" && address ? address.port : port;
        wingExportInProgress = true;
        try {
          const result = await publishCoupangWingToCloudflare({
            projectRoot: root,
            pageUrl: `http://${host}:${actualPort}/authoring.html`,
            productName: project?.name || path.basename(root),
            projectKey:
              project?.productId || project?.id || path.basename(root),
            cloudflareRunner,
            fetchImpl: wingFetchImpl,
            preflightImpl: cloudflarePreflightImpl,
            renderImpl: wingRenderImpl,
            uploadImpl: cloudflareUploadImpl,
            verifyImpl: wingVerifyImpl,
            validateBeforeCommit: async () => {
              const finalGate = assertPublishExportAllowed(
                await gateStatus(root, workflowEngine),
                "쿠팡 Wing",
                "COUPANG_WING_EXPORT_BLOCKED",
              );
              assertSamePublishProof(gate, finalGate);
            },
          });
          sendJson(response, 200, { result, gate });
        } finally {
          wingExportInProgress = false;
        }
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        throw new StudioV1Error(
          "METHOD_NOT_ALLOWED",
          "지원하지 않는 요청 방식입니다.",
          405,
        );
      }

      if (pathname === "/" || pathname === "/studio.html") {
        serveHtml(
          response,
          studioHtml,
          { "Set-Cookie": capabilityCookie },
        );
        return;
      }
      if (pathname === "/authoring.html") {
        await serveFile(
          response,
          await resolveExistingInside(root, path.relative(root, authoringPath)),
        );
        return;
      }
      if (pathname.startsWith("/output/")) {
        await serveFile(
          response,
          await resolveExistingInside(
            root,
            pathname.replace(/^\/+/, ""),
          ),
        );
        return;
      }
      if (pathname.startsWith("/.detail-page/generation/")) {
        await serveFile(
          response,
          await resolveExistingInside(
            root,
            pathname.replace(/^\/+/, ""),
          ),
        );
        return;
      }
      if (
        pathname.startsWith("/studio/revisions/") ||
        pathname.startsWith("/.detail-page/workflow/revisions/")
      ) {
        await serveFile(
          response,
          await resolveExistingInside(
            root,
            pathname.replace(/^\/+/, ""),
          ),
        );
        return;
      }
      const pageFile = await resolveExistingInside(
        pageDirectory,
        pathname.replace(/^\/+/, ""),
      );
      if (pathname !== "/" && (await exists(pageFile))) {
        await serveFile(response, pageFile);
        return;
      }

      sendJson(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: "요청한 Studio 파일을 찾을 수 없습니다.",
        },
      });
    } catch (error) {
      const isWorkflowError = error instanceof WorkflowEngineError;
      const isStateStoreError = error instanceof StateStoreError;
      const isArtifactRecordError = error instanceof ArtifactRecordStoreError;
      const isStudioPipelineError =
        error instanceof StudioG4PipelineError;
      const isStudioContractError =
        error instanceof BrowserCaptureAdapterError ||
        error instanceof StudioCommitAdapterError ||
        error instanceof RubricLoopError;
      const isCloudflareError =
        error instanceof CloudflarePagesUploaderError;
      const status =
        error instanceof StudioV1Error
          ? error.status
          : isStudioPipelineError
            ? error.status
            : isCloudflareError ||
                isWorkflowError ||
                isStateStoreError ||
                isArtifactRecordError ||
                isStudioContractError
            ? 409
            : 500;
      sendJson(response, status, {
        error: {
          code:
            error instanceof StudioV1Error
              ? error.code
              : isCloudflareError ||
                  isStudioPipelineError ||
                  isWorkflowError ||
                  isStateStoreError ||
                  isArtifactRecordError ||
                  isStudioContractError
                ? error.code
                : "INTERNAL_SERVER_ERROR",
          message:
            error instanceof StudioV1Error
              ? error.message
              : isCloudflareError ||
                  isStudioPipelineError ||
                  isWorkflowError ||
                  isStateStoreError ||
                  isArtifactRecordError ||
                  isStudioContractError
                ? error.message
                : "Studio v1 서버에서 오류가 발생했습니다.",
          ...(isCloudflareError ? { state: error.state } : {}),
        },
      });
      if (
        !(error instanceof StudioV1Error) &&
        !(error instanceof StudioG4PipelineError) &&
        !(error instanceof WorkflowEngineError) &&
        !(error instanceof StateStoreError) &&
        !(error instanceof ArtifactRecordStoreError) &&
        !(error instanceof BrowserCaptureAdapterError) &&
        !(error instanceof StudioCommitAdapterError) &&
        !(error instanceof RubricLoopError) &&
        !(error instanceof CloudflarePagesUploaderError)
      ) {
        console.error(error);
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : port;
  const url = `http://${authorityHost(host)}:${actualPort}/studio.html`;
  if (open) openBrowser(url);
  return {
    server,
    url,
    projectRoot: root,
    capabilityToken,
    capabilityHeader: STUDIO_CAPABILITY_HEADER,
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
  if (!args.project) {
    console.error("--project 경로가 필요합니다.");
    process.exitCode = 1;
  } else {
    const result = await startStudioV1Server({
      projectRoot: args.project,
      port: Number(args.port || 8896),
      open: args["no-open"] !== true,
    });
    console.log(`Detail Page Studio v1: ${result.url}`);
    console.log(`Project: ${result.projectRoot}`);
  }
}
