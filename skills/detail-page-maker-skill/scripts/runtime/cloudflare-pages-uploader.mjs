import { spawn } from "node:child_process";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONFIG_RELATIVE_PATH = path.join(
  ".detail-page",
  "cloudflare-pages.json",
);
const DEFAULT_RUNTIME_ROOT = path.join(
  ".agents",
  "runtime",
  "cloudflare-pages",
);
const DEFAULT_RUNTIME_LOCK_FILENAME = "wrangler-runtime-lock.json";
const DEFAULT_BOOTSTRAP_RECEIPT_PATH = path.join(
  ".detail-page",
  "cloudflare-pages-bootstrap.json",
);
const DEPLOY_INDEX_FILENAME = "deploy-index.json";
const LOCK_DIRECTORY_NAME =
  "cloudflare-pages-publish-locks-v2";
const OWNER_DIRECTORY_NAME = "detail-page-maker";
const OWNER_RECORD_FILENAME = "cloudflare-pages-writer-v1.json";
const OWNER_DIGEST_CONTEXT = "detail-page-maker/cloudflare-pages-owner/v1";
const BOOTSTRAP_RECEIPT_CONTEXT =
  "detail-page-maker/cloudflare-pages-bootstrap-receipt/v1";
const RUNTIME_TREE_CONTEXT = "detail-page-maker/wrangler-runtime-tree/v1";
const WRANGLER_EXECUTION_POLICY_ID =
  "node-permission-register-hooks-memory-v1";
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_RETRY_MS = 50;
const LOCK_STALE_MS = 15 * 60_000;
const LOCK_HEARTBEAT_MS = 5_000;
const WEBP_MIME = "image/webp";
const IMMUTABLE_CACHE_RE = /(?:^|,)\s*immutable\s*(?:,|$)/i;
const MAX_AGE_CACHE_RE = /(?:^|,)\s*max-age=31536000\s*(?:,|$)/i;
const SHA256_RE = /^[a-f0-9]{64}$/;
const EXPORT_ID_RE = /^wing-[a-zA-Z0-9-]{8,120}$/;
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9가-힣][a-zA-Z0-9가-힣._-]{0,119}$/u;
const PAGES_PROJECT_RE = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/;
const PUBLISHER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const WRITER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{15,159}$/;

export class CloudflarePagesUploaderError extends Error {
  constructor(code, message, { state = "failed", cause, details } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "CloudflarePagesUploaderError";
    this.code = code;
    this.state = state;
    this.details = details ? redactSecrets(details) : undefined;
  }
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sameCanonicalPath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32"
      ? resolved.toLowerCase()
      : resolved;
  };
  return normalize(left) === normalize(right);
}

function defaultMachineStateRoot(environment = process.env) {
  if (process.platform === "win32") {
    const localAppData = String(environment.LOCALAPPDATA || "").trim();
    return path.resolve(
      localAppData || path.join(os.homedir(), "AppData", "Local"),
      OWNER_DIRECTORY_NAME,
    );
  }
  const xdgStateHome = String(environment.XDG_STATE_HOME || "").trim();
  return path.resolve(
    xdgStateHome || path.join(os.homedir(), ".local", "state"),
    OWNER_DIRECTORY_NAME,
  );
}

function ownerSecretBytes(value) {
  if (Buffer.isBuffer(value)) {
    if (value.length < 32) {
      throw new CloudflarePagesUploaderError(
        "WRITER_OWNER_PROVIDER_INVALID",
        "writer owner secret은 256-bit 이상이어야 합니다.",
        { state: "config_invalid" },
      );
    }
    return Buffer.from(value);
  }
  let bytes;
  try {
    bytes = Buffer.from(String(value || ""), "base64url");
  } catch {
    bytes = Buffer.alloc(0);
  }
  if (bytes.length < 32) {
    throw new CloudflarePagesUploaderError(
      "WRITER_OWNER_PROVIDER_INVALID",
      "writer owner secret은 256-bit 이상이어야 합니다.",
      { state: "config_invalid" },
    );
  }
  return bytes;
}

async function assertSecureMachineDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new CloudflarePagesUploaderError(
      "WRITER_OWNER_STORE_INVALID",
      "machine-local writer owner 저장소는 일반 디렉터리여야 합니다.",
      { state: "config_invalid" },
    );
  }
  const canonical = await realpath(directory);
  if (!sameCanonicalPath(canonical, directory)) {
    throw new CloudflarePagesUploaderError(
      "WRITER_OWNER_STORE_INVALID",
      "machine-local writer owner 저장소에는 symlink/reparse 경로를 사용할 수 없습니다.",
      { state: "config_invalid" },
    );
  }
  return directory;
}

export async function defaultCloudflareOwnerProvider({
  stateRoot = defaultMachineStateRoot(),
} = {}) {
  const ownerRoot = await assertSecureMachineDirectory(path.resolve(stateRoot));
  const ownerPath = path.join(ownerRoot, OWNER_RECORD_FILENAME);
  const readExisting = async () => {
    const ownerStat = await lstat(ownerPath);
    if (!ownerStat.isFile() || ownerStat.isSymbolicLink()) {
      throw new CloudflarePagesUploaderError(
        "WRITER_OWNER_STORE_INVALID",
        "machine-local writer owner record는 일반 파일이어야 합니다.",
        { state: "config_invalid" },
      );
    }
    const canonical = await realpath(ownerPath);
    if (!sameCanonicalPath(canonical, ownerPath)) {
      throw new CloudflarePagesUploaderError(
        "WRITER_OWNER_STORE_INVALID",
        "machine-local writer owner record에는 symlink/reparse를 사용할 수 없습니다.",
        { state: "config_invalid" },
      );
    }
    const raw = await readJsonFile(
      ownerPath,
      "WRITER_OWNER_STORE_INVALID",
      "config_invalid",
    );
    if (
      raw?.schema_version !== "1.0" ||
      !WRITER_ID_RE.test(String(raw?.writer_id || ""))
    ) {
      throw new CloudflarePagesUploaderError(
        "WRITER_OWNER_STORE_INVALID",
        "machine-local writer owner record 형식이 유효하지 않습니다.",
        { state: "config_invalid" },
      );
    }
    return {
      writerId: raw.writer_id,
      secret: ownerSecretBytes(raw.secret),
      stateRoot: ownerRoot,
    };
  };
  try {
    return await readExisting();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const record = {
    schema_version: "1.0",
    writer_id: `writer-${randomUUID()}`,
    secret: randomBytes(32).toString("base64url"),
    created_at: new Date().toISOString(),
  };
  let handle;
  try {
    handle = await open(ownerPath, "wx", 0o600);
    await handle.writeFile(stableJson(record), "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error?.code !== "EEXIST") {
      throw uploaderError(
        error,
        "WRITER_OWNER_STORE_INVALID",
        "machine-local writer owner record를 안전하게 만들 수 없습니다.",
        "config_invalid",
      );
    }
  }
  return readExisting();
}

async function resolveWriterOwner(config, ownerProvider) {
  if (typeof ownerProvider !== "function") {
    throw new CloudflarePagesUploaderError(
      "WRITER_OWNER_PROVIDER_INVALID",
      "secure writer owner provider가 필요합니다.",
      { state: "config_invalid" },
    );
  }
  let material;
  try {
    material = await ownerProvider({
      pagesProject: config.pagesProject,
      publicBaseUrl: config.publicBaseUrl,
      publisherId: config.publisherId,
    });
  } catch {
    throw new CloudflarePagesUploaderError(
      "WRITER_OWNER_PROVIDER_FAILED",
      "secure writer owner provider에서 배포 주체를 확인할 수 없습니다.",
      { state: "config_invalid" },
    );
  }
  const writerId = String(material?.writerId || "");
  if (!WRITER_ID_RE.test(writerId)) {
    throw new CloudflarePagesUploaderError(
      "WRITER_OWNER_PROVIDER_INVALID",
      "secure writer owner provider의 writerId가 유효하지 않습니다.",
      { state: "config_invalid" },
    );
  }
  const secret = ownerSecretBytes(material?.secret);
  const digest = deriveCloudflareWriterOwnerDigest({
    pagesProject: config.pagesProject,
    publicBaseUrl: config.publicBaseUrl,
    productionBranch: config.productionBranch,
    publisherId: config.publisherId,
    wranglerVersion: config.wranglerVersion,
    wranglerEntrySha256: config.wranglerEntrySha256,
    wranglerRuntimeTreeSha256: config.wranglerRuntimeTreeSha256,
    runtimeRootPin: config.runtimeRootPin,
    runtimeLockPin: config.runtimeLockPin,
    bootstrapReceiptPathPin: config.bootstrapReceiptPathPin,
    executionPolicyId: config.executionPolicyId,
    writerId,
    ownerSecret: secret,
  });
  if (digest !== config.writerOwnerDigestPin) {
    secret.fill(0);
    throw new CloudflarePagesUploaderError(
      "WRITER_OWNER_CONFIG_MISMATCH",
      "config에 고정한 writer_owner_digest가 이 머신의 HMAC-derived owner와 다릅니다. writer 이전 대신 새 Pages project/base URL을 사용해야 합니다.",
      {
        state: "config_invalid",
        details: {
          expected: config.writerOwnerDigestPin,
          actual: digest,
        },
      },
    );
  }
  const receiptSecret = Buffer.from(secret);
  secret.fill(0);
  return {
    writerOwnerDigest: digest,
    verifyBootstrapReceiptSignature(receipt) {
      const actual = String(receipt?.owner_hmac_sha256 || "").toLowerCase();
      if (!SHA256_RE.test(actual)) return false;
      const expected = bootstrapReceiptHmac(receipt, receiptSecret);
      return timingSafeEqual(
        Buffer.from(actual, "hex"),
        Buffer.from(expected, "hex"),
      );
    },
    machineStateRoot:
      material?.stateRoot && path.isAbsolute(material.stateRoot)
        ? path.resolve(material.stateRoot)
        : defaultMachineStateRoot(),
  };
}

export function deriveCloudflareWriterOwnerDigest({
  pagesProject,
  publicBaseUrl,
  productionBranch = "main",
  publisherId,
  wranglerVersion,
  wranglerEntrySha256,
  wranglerRuntimeTreeSha256,
  runtimeRootPin = portableRelativePath(DEFAULT_RUNTIME_ROOT),
  runtimeLockPin = portableRelativePath(DEFAULT_RUNTIME_LOCK_FILENAME),
  bootstrapReceiptPathPin = portableRelativePath(
    DEFAULT_BOOTSTRAP_RECEIPT_PATH,
  ),
  executionPolicyId = WRANGLER_EXECUTION_POLICY_ID,
  writerId,
  ownerSecret,
}) {
  const secret = ownerSecretBytes(ownerSecret);
  const binding = {
    schema_version: "1.0",
    provider: "cloudflare-pages",
    pages_project: String(pagesProject || ""),
    public_base_url: normalizePublicBaseUrl(publicBaseUrl),
    production_branch: String(productionBranch || ""),
    publisher_id: String(publisherId || ""),
    wrangler_version: String(wranglerVersion || ""),
    wrangler_entry_sha256: String(wranglerEntrySha256 || "").toLowerCase(),
    wrangler_runtime_tree_sha256: String(
      wranglerRuntimeTreeSha256 || "",
    ).toLowerCase(),
    runtime_root: String(runtimeRootPin || ""),
    wrangler_runtime_lock: String(runtimeLockPin || ""),
    bootstrap_receipt_path: String(bootstrapReceiptPathPin || ""),
    execution_policy_id: String(executionPolicyId || ""),
    writer_id: String(writerId || ""),
  };
  try {
    return createHmac("sha256", secret)
      .update(OWNER_DIGEST_CONTEXT, "utf8")
      .update("\n", "utf8")
      .update(stableJson(binding), "utf8")
      .digest("hex");
  } finally {
    secret.fill(0);
  }
}

function bootstrapReceiptPayload(receipt) {
  return {
    schema_version: receipt?.schema_version,
    receipt_type: receipt?.receipt_type,
    pages_project: receipt?.pages_project,
    public_base_url: receipt?.public_base_url,
    publisher_id: receipt?.publisher_id,
    writer_owner_digest: receipt?.writer_owner_digest,
    expected_remote_index_status:
      receipt?.expected_remote_index_status,
    expected_generation: receipt?.expected_generation,
    expected_deployment_count: receipt?.expected_deployment_count,
    authorized_by: receipt?.authorized_by,
    authorized_at: receipt?.authorized_at,
  };
}

function bootstrapReceiptHmac(receipt, secret) {
  return createHmac("sha256", secret)
    .update(BOOTSTRAP_RECEIPT_CONTEXT, "utf8")
    .update("\n", "utf8")
    .update(stableJson(bootstrapReceiptPayload(receipt)), "utf8")
    .digest("hex");
}

export function signCloudflarePagesBootstrapReceipt(receipt, ownerSecret) {
  const secret = ownerSecretBytes(ownerSecret);
  try {
    return bootstrapReceiptHmac(receipt, secret);
  } finally {
    secret.fill(0);
  }
}

function resolveInside(root, relativePath, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new CloudflarePagesUploaderError(
      "PATH_OUTSIDE_PROJECT",
      `${label} 경로가 프로젝트 밖을 가리킵니다.`,
      { state: "config_invalid" },
    );
  }
  return resolved;
}

function assertSafeSegment(value, label) {
  const normalized = String(value || "").normalize("NFKC");
  if (
    !SAFE_SEGMENT_RE.test(normalized) ||
    normalized === "." ||
    normalized === ".."
  ) {
    throw new CloudflarePagesUploaderError(
      "NAMESPACE_INVALID",
      `${label} 값이 안전한 CDN 경로 조각이 아닙니다.`,
      { state: "config_invalid" },
    );
  }
  return normalized;
}

function normalizePublicBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new CloudflarePagesUploaderError(
      "PUBLIC_BASE_URL_INVALID",
      "Cloudflare Pages 공개 기본 주소가 유효하지 않습니다.",
      { state: "config_invalid" },
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new CloudflarePagesUploaderError(
      "PUBLIC_BASE_URL_INVALID",
      "공개 기본 주소는 인증정보·쿼리·해시가 없는 HTTPS 주소여야 합니다.",
      { state: "config_invalid" },
    );
  }
  return parsed.href.replace(/\/+$/, "");
}

function normalizeAssetFilename(value) {
  const filename = String(value || "").normalize("NFKC");
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}\.webp$/i.test(filename) ||
    path.basename(filename) !== filename
  ) {
    throw new CloudflarePagesUploaderError(
      "ASSET_FILENAME_INVALID",
      "Wing asset 파일명이 안전한 WebP 파일명이 아닙니다.",
      { state: "generated_invalid", details: { filename } },
    );
  }
  return filename;
}

function joinPublicUrl(baseUrl, ...segments) {
  return `${baseUrl}/${segments
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function redactSecrets(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /(?:token|authorization|api[_-]?key|secret|password)/i.test(key)
          ? "[REDACTED]"
          : redactSecrets(item),
      ]),
    );
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/\bBearer\s+[^\s"',]+/gi, "Bearer [REDACTED]")
    .replace(
      /((?:CLOUDFLARE_(?:API_TOKEN|API_KEY)|Authorization)\s*[=:]\s*)[^\s"',]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /("(?:token|access_token|refresh_token|apiToken|api_key|secret)"\s*:\s*")[^"]+(")/gi,
      "$1[REDACTED]$2",
    );
}

function uploaderError(error, code, message, state, details) {
  if (error instanceof CloudflarePagesUploaderError) return error;
  const safeCause =
    error instanceof Error
      ? new Error(redactSecrets(error.message))
      : undefined;
  return new CloudflarePagesUploaderError(code, message, {
    state,
    cause: safeCause,
    details,
  });
}

async function readJsonFile(filename, code, state) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    throw uploaderError(
      error,
      code,
      `${path.basename(filename)} JSON을 읽을 수 없습니다.`,
      state,
    );
  }
}

async function assertRegularFile(filename, code, state) {
  let stat;
  try {
    stat = await lstat(filename);
  } catch (error) {
    throw uploaderError(
      error,
      code,
      `필수 파일이 없습니다: ${path.basename(filename)}`,
      state,
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new CloudflarePagesUploaderError(
      code,
      `일반 파일만 사용할 수 있습니다: ${path.basename(filename)}`,
      { state },
    );
  }
  return stat;
}

async function assertNoSymlinkComponents(
  root,
  target,
  {
    code = "SYMLINK_FORBIDDEN",
    state = "runtime_invalid",
    label = "경로",
  } = {},
) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new CloudflarePagesUploaderError(
      code,
      `${label}가 허용된 루트 밖을 가리킵니다.`,
      { state },
    );
  }
  const components = relative
    ? relative.split(path.sep).filter(Boolean)
    : [];
  let current = resolvedRoot;
  for (const component of ["", ...components]) {
    if (component) current = path.join(current, component);
    let componentStat;
    try {
      componentStat = await lstat(current);
    } catch (error) {
      throw uploaderError(
        error,
        code,
        `${label} 구성 요소를 확인할 수 없습니다.`,
        state,
        { path: current },
      );
    }
    if (componentStat.isSymbolicLink()) {
      throw new CloudflarePagesUploaderError(
        code,
        `${label}에는 symlink를 사용할 수 없습니다.`,
        { state, details: { path: current } },
      );
    }
  }
}

export async function loadCloudflarePagesConfig(projectRoot) {
  const configPath = resolveInside(
    projectRoot,
    CONFIG_RELATIVE_PATH,
    "Cloudflare config",
  );
  const raw = await readJsonFile(
    configPath,
    "CLOUDFLARE_CONFIG_INVALID",
    "config_invalid",
  );
  if (
    raw.schema_version !== "1.0" ||
    raw.provider !== "cloudflare-pages"
  ) {
    throw new CloudflarePagesUploaderError(
      "CLOUDFLARE_CONFIG_INVALID",
      "Cloudflare config의 schema_version/provider가 지원되지 않습니다.",
      { state: "config_invalid" },
    );
  }
  const pagesProject = String(raw.pages_project || "").trim();
  if (!PAGES_PROJECT_RE.test(pagesProject)) {
    throw new CloudflarePagesUploaderError(
      "PAGES_PROJECT_INVALID",
      "Cloudflare Pages 프로젝트 이름이 유효하지 않습니다.",
      { state: "config_invalid" },
    );
  }
  const productionBranch = String(raw.production_branch || "main").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/.test(productionBranch)) {
    throw new CloudflarePagesUploaderError(
      "PAGES_BRANCH_INVALID",
      "Cloudflare Pages production branch가 유효하지 않습니다.",
      { state: "config_invalid" },
    );
  }
  const wranglerVersion = String(raw.wrangler_version || "").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(wranglerVersion)) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_VERSION_INVALID",
      "wrangler_version은 정확히 고정된 semver여야 합니다.",
      { state: "config_invalid" },
    );
  }
  const wranglerEntrySha256 = String(
    raw.wrangler_entry_sha256 || "",
  ).toLowerCase();
  if (!SHA256_RE.test(wranglerEntrySha256)) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_ENTRY_SHA256_INVALID",
      "wrangler_entry_sha256는 Wrangler entrypoint 실제 bytes의 64자리 SHA-256이어야 합니다.",
      { state: "config_invalid" },
    );
  }
  const wranglerRuntimeTreeSha256 = String(
    raw.wrangler_runtime_tree_sha256 || "",
  ).toLowerCase();
  if (!SHA256_RE.test(wranglerRuntimeTreeSha256)) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_RUNTIME_TREE_SHA256_INVALID",
      "wrangler_runtime_tree_sha256는 전체 runtime tree의 64자리 SHA-256이어야 합니다.",
      { state: "config_invalid" },
    );
  }
  const publisherId = String(raw.publisher_id || "").normalize("NFKC");
  if (!PUBLISHER_ID_RE.test(publisherId)) {
    throw new CloudflarePagesUploaderError(
      "PUBLISHER_ID_INVALID",
      "publisher_id는 배포 주체를 고정하는 안전한 식별자여야 합니다.",
      { state: "config_invalid" },
    );
  }
  const writerOwnerDigestPin = String(
    raw.writer_owner_digest || "",
  ).toLowerCase();
  if (!SHA256_RE.test(writerOwnerDigestPin)) {
    throw new CloudflarePagesUploaderError(
      "WRITER_OWNER_DIGEST_PIN_INVALID",
      "writer_owner_digest는 이 머신에서 파생해 config에 고정한 64자리 HMAC digest여야 합니다.",
      { state: "config_invalid" },
    );
  }
  if (raw.owner_migration_receipt_path !== undefined) {
    throw new CloudflarePagesUploaderError(
      "PAGES_OWNER_MIGRATION_FORBIDDEN",
      "정상 uploader는 writer owner 이전을 지원하지 않습니다. 새 Pages project/base URL을 사용하세요.",
      { state: "config_invalid" },
    );
  }
  const runtimeRoot = resolveInside(
    projectRoot,
    raw.runtime_root || DEFAULT_RUNTIME_ROOT,
    "Wrangler runtime",
  );
  const runtimeLockPath = resolveInside(
    runtimeRoot,
    raw.wrangler_runtime_lock || DEFAULT_RUNTIME_LOCK_FILENAME,
    "Wrangler runtime integrity lock",
  );
  const bootstrapReceiptPath = resolveInside(
    projectRoot,
    raw.bootstrap_receipt_path || DEFAULT_BOOTSTRAP_RECEIPT_PATH,
    "Cloudflare bootstrap receipt",
  );
  const runtimeRootPin = portableRelativePath(
    path.relative(path.resolve(projectRoot), runtimeRoot),
  );
  const runtimeLockPin = portableRelativePath(
    path.relative(runtimeRoot, runtimeLockPath),
  );
  const bootstrapReceiptPathPin = portableRelativePath(
    path.relative(path.resolve(projectRoot), bootstrapReceiptPath),
  );
  return {
    configPath,
    pagesProject,
    publicBaseUrl: normalizePublicBaseUrl(raw.public_base_url),
    productionBranch,
    wranglerVersion,
    wranglerEntrySha256,
    wranglerRuntimeTreeSha256,
    publisherId,
    writerOwnerDigestPin,
    runtimeRoot,
    runtimeRootPin,
    runtimeLockPath,
    runtimeLockPin,
    bootstrapReceiptPath,
    bootstrapReceiptPathPin,
    executionPolicyId: WRANGLER_EXECUTION_POLICY_ID,
  };
}

export function createCloudflarePagesNamespace({
  publicBaseUrl,
  projectKey,
  exportId,
}) {
  const safeProjectKey = assertSafeSegment(projectKey, "projectKey");
  if (!EXPORT_ID_RE.test(String(exportId || ""))) {
    throw new CloudflarePagesUploaderError(
      "EXPORT_ID_INVALID",
      "Wing exportId가 유효하지 않습니다.",
      { state: "config_invalid" },
    );
  }
  const safeExportId = String(exportId);
  return {
    projectKey: safeProjectKey,
    exportId: safeExportId,
    namespace: `${safeProjectKey}/${safeExportId}`,
    namespaceUrl: joinPublicUrl(
      normalizePublicBaseUrl(publicBaseUrl),
      safeProjectKey,
      safeExportId,
    ),
  };
}

function positiveIntegerOption(value, fallback, label) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CloudflarePagesUploaderError(
      "PAGES_PUBLISH_LOCK_CONFIG_INVALID",
      `${label}은 양의 정수여야 합니다.`,
      { state: "config_invalid" },
    );
  }
  return parsed;
}

function lockTiming(options = {}) {
  const timeoutMs = positiveIntegerOption(
    options.timeoutMs,
    LOCK_TIMEOUT_MS,
    "lock timeoutMs",
  );
  const retryMs = positiveIntegerOption(
    options.retryMs,
    LOCK_RETRY_MS,
    "lock retryMs",
  );
  const staleMs = positiveIntegerOption(
    options.staleMs,
    LOCK_STALE_MS,
    "lock staleMs",
  );
  const heartbeatMs = positiveIntegerOption(
    options.heartbeatMs,
    LOCK_HEARTBEAT_MS,
    "lock heartbeatMs",
  );
  if (heartbeatMs * 2 >= staleMs) {
    throw new CloudflarePagesUploaderError(
      "PAGES_PUBLISH_LOCK_CONFIG_INVALID",
      "lock heartbeatMs는 staleMs의 절반보다 작아야 합니다.",
      { state: "config_invalid" },
    );
  }
  return { timeoutMs, retryMs, staleMs, heartbeatMs };
}

async function pagesPublishLockPath(config, options = {}) {
  const configuredLockRoot = options.lockRoot
    ? path.resolve(options.lockRoot)
    : path.join(
        config.machineStateRoot || defaultMachineStateRoot(),
        "locks",
        LOCK_DIRECTORY_NAME,
      );
  const lockRoot = await assertSecureMachineDirectory(
    path.resolve(configuredLockRoot),
  );
  const lockKeySha256 = sha256Bytes(
    Buffer.from(
      `${config.pagesProject}\0${config.publicBaseUrl}`,
      "utf8",
    ),
  );
  return {
    lockKeySha256,
    lockPath: resolveInside(
      lockRoot,
      `${lockKeySha256}.lock`,
      "Pages publish lock file",
    ),
  };
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function readLockRecord(lockPath) {
  const lockStat = await lstat(lockPath);
  if (!lockStat.isFile() || lockStat.isSymbolicLink()) {
    throw new CloudflarePagesUploaderError(
      "PAGES_PUBLISH_LOCK_PATH_INVALID",
      "Pages publish lock은 symlink가 아닌 일반 파일이어야 합니다.",
      { state: "concurrent_conflict" },
    );
  }
  let record = null;
  let bytes = null;
  try {
    bytes = await readFile(lockPath);
    record = JSON.parse(bytes.toString("utf8"));
  } catch {
    // An old malformed lock may only be removed after its mtime is stale.
  }
  return { lockStat, record, bytes };
}

async function removeStalePublishLock(lockPath, staleMs) {
  let observed;
  try {
    observed = await readLockRecord(lockPath);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  if (Date.now() - observed.lockStat.mtimeMs < staleMs) return false;
  if (
    observed.record?.hostname === os.hostname() &&
    processIsAlive(Number(observed.record?.pid))
  ) {
    return false;
  }
  let current;
  try {
    current = await readLockRecord(lockPath);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  const unchanged =
    current.lockStat.mtimeMs === observed.lockStat.mtimeMs &&
    current.lockStat.size === observed.lockStat.size &&
    Buffer.compare(current.bytes || Buffer.alloc(0), observed.bytes || Buffer.alloc(0)) === 0;
  if (!unchanged) return false;
  try {
    await unlink(lockPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    return false;
  }
}

function waitFor(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function acquirePagesPublishLock(config, options = {}) {
  const timing = lockTiming(options);
  const { lockKeySha256, lockPath } =
    await pagesPublishLockPath(config, options);
  const startedAt = Date.now();
  const nonce = randomUUID();
  let handle;
  while (!handle) {
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw uploaderError(
          error,
          "PAGES_PUBLISH_LOCK_FAILED",
          "Pages publish lock을 만들 수 없습니다.",
          "concurrent_conflict",
        );
      }
      const removed = await removeStalePublishLock(
        lockPath,
        timing.staleMs,
      );
      if (removed) continue;
      if (Date.now() - startedAt >= timing.timeoutMs) {
        throw new CloudflarePagesUploaderError(
          "PAGES_PUBLISH_LOCK_TIMEOUT",
          "같은 Cloudflare Pages snapshot 배포가 진행 중입니다. 잠시 후 다시 시도하세요.",
          {
            state: "concurrent_conflict",
            details: {
              pagesProject: config.pagesProject,
              publicBaseUrl: config.publicBaseUrl,
              retryable: true,
              timeoutMs: timing.timeoutMs,
            },
          },
        );
      }
      await waitFor(
        Math.min(
          timing.retryMs,
          Math.max(1, timing.timeoutMs - (Date.now() - startedAt)),
        ),
      );
    }
  }
  const record = {
    schema_version: "1.0",
    lock_key_sha256: lockKeySha256,
    nonce,
    pid: process.pid,
    hostname: os.hostname(),
    writer_owner_digest: config.writerOwnerDigest,
    created_at: new Date().toISOString(),
  };
  try {
    await handle.writeFile(stableJson(record), "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
    throw uploaderError(
      error,
      "PAGES_PUBLISH_LOCK_FAILED",
      "Pages publish lock 기록을 봉인할 수 없습니다.",
      "concurrent_conflict",
    );
  }
  const heartbeat = setInterval(() => {
    const now = new Date();
    handle.utimes(now, now).catch(() => {});
  }, timing.heartbeatMs);
  heartbeat.unref?.();

  const assertOwned = async () => {
    let current;
    try {
      current = await readLockRecord(lockPath);
    } catch (error) {
      throw uploaderError(
        error,
        "PAGES_PUBLISH_LOCK_LOST",
        "Pages publish lock 소유권을 확인할 수 없습니다.",
        "concurrent_conflict",
      );
    }
    if (
      current.record?.nonce !== nonce ||
      current.record?.lock_key_sha256 !== lockKeySha256
    ) {
      throw new CloudflarePagesUploaderError(
        "PAGES_PUBLISH_LOCK_LOST",
        "Pages publish lock 소유권을 잃었습니다. 배포를 재시도하세요.",
        {
          state: "concurrent_conflict",
          details: { retryable: true },
        },
      );
    }
  };
  const release = async () => {
    clearInterval(heartbeat);
    await handle.close().catch(() => {});
    let current;
    try {
      current = await readLockRecord(lockPath);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (current.record?.nonce !== nonce) return;
    try {
      await unlink(lockPath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw uploaderError(
          error,
          "PAGES_PUBLISH_LOCK_RELEASE_FAILED",
          "Pages publish lock을 안전하게 해제하지 못했습니다.",
          "concurrent_conflict",
        );
      }
    }
  };
  return { assertOwned, release };
}

async function withPagesPublishLock(
  config,
  operation,
  options = {},
) {
  const lock = await acquirePagesPublishLock(config, options);
  let operationError;
  try {
    await lock.assertOwned();
    return await operation(lock);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await lock.release();
    } catch (releaseError) {
      if (!operationError) throw releaseError;
    }
  }
}

function portableRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function runtimeTreeDigest(files) {
  const hash = createHash("sha256");
  hash.update(RUNTIME_TREE_CONTEXT, "utf8");
  hash.update("\n", "utf8");
  for (const file of files) {
    hash.update(file.path, "utf8");
    hash.update("\0", "utf8");
    hash.update(String(file.bytes), "utf8");
    hash.update("\0", "utf8");
    hash.update(file.sha256, "utf8");
    hash.update("\n", "utf8");
  }
  return hash.digest("hex");
}

async function scanWranglerRuntimeTree(runtimeRoot) {
  const treeRoot = path.join(runtimeRoot, "node_modules");
  const treeRootStat = await assertRegularDirectory(
    treeRoot,
    "WRANGLER_RUNTIME_TREE_INVALID",
    "runtime_invalid",
  );
  if (treeRootStat.isSymbolicLink()) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_RUNTIME_TREE_INVALID",
      "Wrangler runtime tree에는 symlink/reparse를 사용할 수 없습니다.",
      { state: "runtime_invalid" },
    );
  }
  const canonicalRoot = await realpath(treeRoot);
  if (!sameCanonicalPath(canonicalRoot, treeRoot)) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_RUNTIME_TREE_INVALID",
      "Wrangler runtime tree root는 canonical 일반 디렉터리여야 합니다.",
      { state: "runtime_invalid" },
    );
  }
  const files = [];
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      const targetStat = await lstat(target);
      if (targetStat.isSymbolicLink()) {
        throw new CloudflarePagesUploaderError(
          "WRANGLER_RUNTIME_TREE_INVALID",
          "Wrangler runtime tree에는 symlink/reparse를 사용할 수 없습니다.",
          {
            state: "runtime_invalid",
            details: {
              path: portableRelativePath(path.relative(treeRoot, target)),
            },
          },
        );
      }
      if (!targetStat.isDirectory() && !targetStat.isFile()) {
        throw new CloudflarePagesUploaderError(
          "WRANGLER_RUNTIME_TREE_INVALID",
          "Wrangler runtime tree에는 일반 파일과 디렉터리만 허용됩니다.",
          {
            state: "runtime_invalid",
            details: {
              path: portableRelativePath(path.relative(treeRoot, target)),
            },
          },
        );
      }
      const canonicalTarget = await realpath(target);
      const canonicalRelative = path.relative(
        canonicalRoot,
        canonicalTarget,
      );
      if (
        canonicalRelative === ".." ||
        canonicalRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(canonicalRelative)
      ) {
        throw new CloudflarePagesUploaderError(
          "WRANGLER_RUNTIME_TREE_INVALID",
          "Wrangler runtime tree의 canonical path가 tree root를 벗어납니다.",
          { state: "runtime_invalid" },
        );
      }
      if (targetStat.isDirectory()) {
        await visit(target);
        continue;
      }
      const bytes = await readFile(target);
      files.push({
        path: portableRelativePath(path.relative(treeRoot, target)),
        bytes: bytes.length,
        sha256: sha256Bytes(bytes),
      });
    }
  };
  await visit(treeRoot);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    schema_version: "1.0",
    root: "node_modules",
    algorithm: "sha256",
    file_count: files.length,
    files,
    tree_sha256: runtimeTreeDigest(files),
  };
}

async function assertRegularDirectory(directory, code, state) {
  let directoryStat;
  try {
    directoryStat = await lstat(directory);
  } catch (error) {
    throw uploaderError(
      error,
      code,
      `필수 디렉터리가 없습니다: ${path.basename(directory)}`,
      state,
    );
  }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new CloudflarePagesUploaderError(
      code,
      `일반 디렉터리만 사용할 수 있습니다: ${path.basename(directory)}`,
      { state },
    );
  }
  return directoryStat;
}

export async function buildWranglerRuntimeIntegrityManifest({
  runtimeRoot,
}) {
  return scanWranglerRuntimeTree(path.resolve(runtimeRoot));
}

function validateRuntimeLockManifest(raw) {
  if (
    raw?.schema_version !== "1.0" ||
    raw?.root !== "node_modules" ||
    raw?.algorithm !== "sha256" ||
    !Number.isSafeInteger(raw?.file_count) ||
    raw.file_count < 1 ||
    !Array.isArray(raw?.files) ||
    raw.files.length !== raw.file_count ||
    !SHA256_RE.test(String(raw?.tree_sha256 || ""))
  ) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_RUNTIME_LOCK_INVALID",
      "Wrangler runtime integrity lock 형식이 유효하지 않습니다.",
      { state: "runtime_invalid" },
    );
  }
  const seen = new Set();
  const files = raw.files.map((file) => {
    const portablePath = String(file?.path || "");
    const normalized = path.posix.normalize(portablePath);
    const bytes = Number(file?.bytes);
    const sha256 = String(file?.sha256 || "").toLowerCase();
    if (
      !portablePath ||
      portablePath.includes("\\") ||
      normalized !== portablePath ||
      normalized === "." ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      path.posix.isAbsolute(normalized) ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      !SHA256_RE.test(sha256) ||
      seen.has(portablePath)
    ) {
      throw new CloudflarePagesUploaderError(
        "WRANGLER_RUNTIME_LOCK_INVALID",
        "Wrangler runtime integrity lock의 file entry가 유효하지 않습니다.",
        { state: "runtime_invalid" },
      );
    }
    seen.add(portablePath);
    return { path: portablePath, bytes, sha256 };
  });
  const sortedFiles = [...files].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  if (
    files.some(
      (file, index) => file.path !== sortedFiles[index]?.path,
    ) ||
    runtimeTreeDigest(files) !== raw.tree_sha256
  ) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_RUNTIME_LOCK_INVALID",
      "Wrangler runtime integrity lock의 정렬 또는 root hash가 유효하지 않습니다.",
      { state: "runtime_invalid" },
    );
  }
  return {
    schema_version: "1.0",
    root: "node_modules",
    algorithm: "sha256",
    file_count: files.length,
    files,
    tree_sha256: raw.tree_sha256,
  };
}

async function verifyWranglerRuntimeIntegrity(config, projectRoot) {
  await assertNoSymlinkComponents(projectRoot, config.runtimeLockPath, {
    code: "WRANGLER_SYMLINK_FORBIDDEN",
    state: "runtime_invalid",
    label: "Wrangler runtime integrity lock",
  });
  await assertRegularFile(
    config.runtimeLockPath,
    "WRANGLER_RUNTIME_LOCK_MISSING",
    "runtime_missing",
  );
  const locked = validateRuntimeLockManifest(
    await readJsonFile(
      config.runtimeLockPath,
      "WRANGLER_RUNTIME_LOCK_INVALID",
      "runtime_invalid",
    ),
  );
  const actual = await scanWranglerRuntimeTree(config.runtimeRoot);
  if (
    locked.tree_sha256 !== config.wranglerRuntimeTreeSha256 ||
    actual.tree_sha256 !== config.wranglerRuntimeTreeSha256 ||
    stableJson(locked.files) !== stableJson(actual.files)
  ) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_RUNTIME_TREE_SHA256_MISMATCH",
      "Wrangler runtime 전체 dependency tree가 config/lock의 고정 hash와 다릅니다.",
      {
        state: "runtime_invalid",
        details: {
          expected: config.wranglerRuntimeTreeSha256,
          lock: locked.tree_sha256,
          actual: actual.tree_sha256,
        },
      },
    );
  }
  return actual;
}

async function resolvePinnedWrangler(config, projectRoot) {
  const runtimeIntegrity = await verifyWranglerRuntimeIntegrity(
    config,
    projectRoot,
  );
  const packagePath = path.join(
    config.runtimeRoot,
    "node_modules",
    "wrangler",
    "package.json",
  );
  await assertNoSymlinkComponents(projectRoot, packagePath, {
    code: "WRANGLER_SYMLINK_FORBIDDEN",
    state: "runtime_invalid",
    label: "Wrangler package",
  });
  await assertRegularFile(
    packagePath,
    "WRANGLER_NOT_INSTALLED",
    "runtime_missing",
  );
  const packageJson = await readJsonFile(
    packagePath,
    "WRANGLER_PACKAGE_INVALID",
    "runtime_invalid",
  );
  if (packageJson.version !== config.wranglerVersion) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_VERSION_MISMATCH",
      "프로젝트 로컬 Wrangler 버전이 config의 pinned 버전과 다릅니다.",
      {
        state: "runtime_invalid",
        details: {
          expected: config.wranglerVersion,
          actual: packageJson.version,
        },
      },
    );
  }
  const binRelative =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.wrangler;
  if (!binRelative) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_PACKAGE_INVALID",
      "프로젝트 로컬 Wrangler entrypoint를 찾을 수 없습니다.",
      { state: "runtime_invalid" },
    );
  }
  const packageRoot = path.dirname(packagePath);
  const entrypoint = resolveInside(packageRoot, binRelative, "Wrangler entrypoint");
  await assertNoSymlinkComponents(projectRoot, entrypoint, {
    code: "WRANGLER_SYMLINK_FORBIDDEN",
    state: "runtime_invalid",
    label: "Wrangler entrypoint",
  });
  await assertRegularFile(
    entrypoint,
    "WRANGLER_NOT_INSTALLED",
    "runtime_missing",
  );
  const entrypointBytes = await readFile(entrypoint);
  const entrypointSha256 = sha256Bytes(entrypointBytes);
  if (entrypointSha256 !== config.wranglerEntrySha256) {
    throw new CloudflarePagesUploaderError(
      "WRANGLER_ENTRY_SHA256_MISMATCH",
      "프로젝트 로컬 Wrangler entrypoint bytes가 config의 SHA-256과 다릅니다.",
      {
        state: "runtime_invalid",
        details: {
          expected: config.wranglerEntrySha256,
          actual: entrypointSha256,
        },
      },
    );
  }
  return {
    entrypoint,
    version: packageJson.version,
    entrypointSha256,
    runtimeTreeSha256: runtimeIntegrity.tree_sha256,
    config,
    projectRoot,
  };
}

function keyringEnvironment(source = process.env) {
  const allowedKeys = [
    "APPDATA",
    "HOME",
    "LANG",
    "LC_ALL",
    "LOCALAPPDATA",
    "NODE_EXTRA_CA_CERTS",
    "PATH",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "XDG_CONFIG_HOME",
  ];
  const env = Object.fromEntries(
    allowedKeys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
  env.CLOUDFLARE_AUTH_USE_KEYRING = "true";
  env.NO_COLOR = "1";
  return env;
}

async function sealedWranglerLauncher() {
  const {
    lstatSync,
    readFileSync,
    readdirSync,
    realpathSync,
  } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { builtinModules, registerHooks } = await import("node:module");
  const pathModule = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const pathApi = pathModule.default;
  const runtimeTreeContext =
    "detail-page-maker/wrangler-runtime-tree/v1";
  const sha256 = (bytes) =>
    createHash("sha256").update(bytes).digest("hex");
  const fail = (message) => {
    const error = new Error(message);
    error.code = "WRANGLER_SEALED_RUNTIME_INVALID";
    throw error;
  };
  const samePath = (left, right) => {
    const normalize = (value) => {
      const resolved = pathApi.resolve(value);
      return process.platform === "win32"
        ? resolved.toLowerCase()
        : resolved;
    };
    return normalize(left) === normalize(right);
  };
  const [
    treeRootArgument,
    lockPathArgument,
    entryRelativeArgument,
    expectedTreeSha256,
    expectedEntrySha256,
    ...wranglerArguments
  ] = process.argv.slice(1);
  if (
    typeof registerHooks !== "function" ||
    !/^[a-f0-9]{64}$/.test(String(expectedTreeSha256 || "")) ||
    !/^[a-f0-9]{64}$/.test(String(expectedEntrySha256 || ""))
  ) {
    fail("Node module.registerHooks 또는 pinned runtime digest가 유효하지 않습니다.");
  }
  const treeRoot = pathApi.resolve(String(treeRootArgument || ""));
  const lockPath = pathApi.resolve(String(lockPathArgument || ""));
  const treeStat = lstatSync(treeRoot);
  const lockStat = lstatSync(lockPath);
  if (
    !treeStat.isDirectory() ||
    treeStat.isSymbolicLink() ||
    !samePath(realpathSync(treeRoot), treeRoot) ||
    !lockStat.isFile() ||
    lockStat.isSymbolicLink() ||
    !samePath(realpathSync(lockPath), lockPath)
  ) {
    fail("Wrangler runtime tree/lock은 canonical 일반 경로여야 합니다.");
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    fail("Wrangler runtime integrity lock을 읽을 수 없습니다.");
  }
  if (
    lock?.schema_version !== "1.0" ||
    lock?.root !== "node_modules" ||
    lock?.algorithm !== "sha256" ||
    !Number.isSafeInteger(lock?.file_count) ||
    lock.file_count < 1 ||
    !Array.isArray(lock?.files) ||
    lock.files.length !== lock.file_count ||
    lock.tree_sha256 !== expectedTreeSha256
  ) {
    fail("Wrangler runtime integrity lock pin이 유효하지 않습니다.");
  }
  const lockedFiles = [];
  const lockedByPath = new Map();
  for (const item of lock.files) {
    const portablePath = String(item?.path || "");
    const normalized = pathApi.posix.normalize(portablePath);
    const bytes = Number(item?.bytes);
    const digest = String(item?.sha256 || "").toLowerCase();
    if (
      !portablePath ||
      portablePath.includes("\\") ||
      normalized !== portablePath ||
      normalized === "." ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      pathApi.posix.isAbsolute(normalized) ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(digest) ||
      lockedByPath.has(portablePath)
    ) {
      fail("Wrangler runtime integrity lock file entry가 유효하지 않습니다.");
    }
    const normalizedItem = { path: portablePath, bytes, sha256: digest };
    lockedFiles.push(normalizedItem);
    lockedByPath.set(portablePath, normalizedItem);
  }
  const sortedLocked = [...lockedFiles].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  if (
    lockedFiles.some(
      (item, index) => item.path !== sortedLocked[index]?.path,
    )
  ) {
    fail("Wrangler runtime integrity lock은 canonical 정렬이어야 합니다.");
  }
  const treeDigest = (files) => {
    const hash = createHash("sha256");
    hash.update(runtimeTreeContext, "utf8");
    hash.update("\n", "utf8");
    for (const file of files) {
      hash.update(file.path, "utf8");
      hash.update("\0", "utf8");
      hash.update(String(file.bytes), "utf8");
      hash.update("\0", "utf8");
      hash.update(file.sha256, "utf8");
      hash.update("\n", "utf8");
    }
    return hash.digest("hex");
  };
  if (treeDigest(lockedFiles) !== expectedTreeSha256) {
    fail("Wrangler runtime integrity lock root hash가 config pin과 다릅니다.");
  }
  const sourceByPath = new Map();
  const actualFiles = [];
  const visit = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = pathApi.join(directory, entry.name);
      const stat = lstatSync(target);
      if (
        stat.isSymbolicLink() ||
        (!stat.isDirectory() && !stat.isFile())
      ) {
        fail("Wrangler runtime tree에는 symlink/reparse나 특수 파일을 사용할 수 없습니다.");
      }
      const canonical = realpathSync(target);
      const canonicalRelative = pathApi.relative(treeRoot, canonical);
      if (
        canonicalRelative === ".." ||
        canonicalRelative.startsWith(`..${pathApi.sep}`) ||
        pathApi.isAbsolute(canonicalRelative)
      ) {
        fail("Wrangler runtime canonical path가 tree root를 벗어납니다.");
      }
      if (stat.isDirectory()) {
        visit(target);
        continue;
      }
      const portablePath = pathApi
        .relative(treeRoot, target)
        .split(pathApi.sep)
        .join("/");
      const source = readFileSync(target);
      const actual = {
        path: portablePath,
        bytes: source.length,
        sha256: sha256(source),
      };
      actualFiles.push(actual);
      sourceByPath.set(portablePath, source);
    }
  };
  visit(treeRoot);
  actualFiles.sort((left, right) => left.path.localeCompare(right.path));
  if (
    actualFiles.length !== lockedFiles.length ||
    treeDigest(actualFiles) !== expectedTreeSha256
  ) {
    fail("Wrangler runtime tree가 sealed launcher 시작 시점에 변조되었습니다.");
  }
  for (let index = 0; index < actualFiles.length; index += 1) {
    const actual = actualFiles[index];
    const locked = lockedFiles[index];
    if (
      actual.path !== locked.path ||
      actual.bytes !== locked.bytes ||
      actual.sha256 !== locked.sha256
    ) {
      fail("Wrangler runtime file set/bytes가 integrity lock과 다릅니다.");
    }
  }
  const entryRelative = String(entryRelativeArgument || "");
  const entryLock = lockedByPath.get(entryRelative);
  if (
    !entryLock ||
    entryLock.sha256 !== expectedEntrySha256 ||
    sourceByPath.get(entryRelative)?.length !== entryLock.bytes
  ) {
    fail("Wrangler entrypoint가 pinned runtime manifest와 다릅니다.");
  }

  const builtinSet = new Set(
    builtinModules.flatMap((name) => [
      name,
      name.startsWith("node:") ? name.slice(5) : `node:${name}`,
    ]),
  );
  const sealedScheme = "detail-page-sealed:";
  const sealedUrlForPortable = (portablePath) =>
    `${sealedScheme}/${portablePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
  const portableFromSealedUrl = (url) => {
    const parsed = new URL(String(url));
    if (
      parsed.protocol !== sealedScheme ||
      parsed.host ||
      parsed.search ||
      parsed.hash
    ) {
      fail("sealed module URL이 유효하지 않습니다.");
    }
    const portablePath = parsed.pathname
      .replace(/^\/+/, "")
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    const normalized = pathApi.posix.normalize(portablePath);
    if (
      !portablePath ||
      normalized !== portablePath ||
      normalized === "." ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      pathApi.posix.isAbsolute(normalized) ||
      !lockedByPath.has(portablePath)
    ) {
      fail("sealed module URL이 pinned manifest member가 아닙니다.");
    }
    return portablePath;
  };
  const filenameFromPortable = (portablePath) =>
    pathApi.join(treeRoot, ...portablePath.split("/"));
  const portableFromFilename = (filename) => {
    const relative = pathApi.relative(treeRoot, pathApi.resolve(filename));
    if (
      relative === ".." ||
      relative.startsWith(`..${pathApi.sep}`) ||
      pathApi.isAbsolute(relative)
    ) {
      fail("Wrangler가 pinned runtime 밖의 module을 해석하려 했습니다.");
    }
    return relative.split(pathApi.sep).join("/");
  };
  const packageJsonByDirectory = new Map();
  for (const [portablePath, source] of sourceByPath) {
    if (
      portablePath !== "package.json" &&
      !portablePath.endsWith("/package.json")
    ) {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(source.toString("utf8"));
    } catch {
      fail("pinned runtime의 package.json이 유효하지 않습니다.");
    }
    packageJsonByDirectory.set(
      pathApi.posix.dirname(portablePath) === "."
        ? ""
        : pathApi.posix.dirname(portablePath),
      { portablePath, parsed },
    );
  }
  const assertPinnedFileUnchanged = (portablePath) => {
    const locked = lockedByPath.get(portablePath);
    const sealed = sourceByPath.get(portablePath);
    let current;
    try {
      current = readFileSync(filenameFromPortable(portablePath));
    } catch {
      fail("pinned runtime file을 다시 확인할 수 없습니다.");
    }
    if (
      !locked ||
      !sealed ||
      current.length !== locked.bytes ||
      sha256(current) !== locked.sha256 ||
      sealed.length !== locked.bytes ||
      sha256(sealed) !== locked.sha256
    ) {
      fail("pinned runtime file bytes가 memory seal과 다릅니다.");
    }
  };
  const packageAt = (directoryPortable) => {
    const normalized =
      directoryPortable && directoryPortable !== "."
        ? pathApi.posix.normalize(directoryPortable)
        : "";
    const item = packageJsonByDirectory.get(normalized);
    if (item) assertPinnedFileUnchanged(item.portablePath);
    return item?.parsed || null;
  };
  const directoryExistsPinned = (directoryPortable) => {
    const prefix = directoryPortable ? `${directoryPortable}/` : "";
    for (const portablePath of lockedByPath.keys()) {
      if (portablePath.startsWith(prefix)) return true;
    }
    return false;
  };
  const nearestPackageDirectory = (fromPortable) => {
    let directory = pathApi.posix.dirname(fromPortable);
    while (directory && directory !== ".") {
      if (packageJsonByDirectory.has(directory)) {
        packageAt(directory);
        return directory;
      }
      const parent = pathApi.posix.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    if (packageJsonByDirectory.has("")) {
      packageAt("");
      return "";
    }
    return null;
  };
  const formatForPortable = (portablePath) => {
    const extension = pathApi.posix.extname(portablePath).toLowerCase();
    if (extension === ".node") {
      fail("native addon은 permission-sealed Wrangler에서 허용하지 않습니다.");
    }
    if (extension === ".wasm") {
      fail("WASM/WASI module은 permission-sealed Wrangler에서 허용하지 않습니다.");
    }
    if (extension === ".mjs") return "module";
    if (extension === ".cjs") return "commonjs";
    if (extension === ".json") return "json";
    if (extension === ".mts") return "module-typescript";
    if (extension === ".cts") return "commonjs-typescript";
    const packageDirectory = nearestPackageDirectory(portablePath);
    const packageJson =
      packageDirectory === null ? null : packageAt(packageDirectory);
    const isModule = packageJson?.type === "module";
    if (extension === ".ts") {
      return isModule ? "module-typescript" : "commonjs-typescript";
    }
    if (extension === ".js" || extension === "") {
      return isModule ? "module" : "commonjs";
    }
    fail(`지원하지 않는 pinned module 확장자입니다: ${extension || "(none)"}`);
  };
  const resolveAsFileOrDirectory = (
    candidatePortable,
    seen = new Set(),
  ) => {
    const normalized = pathApi.posix.normalize(candidatePortable);
    if (
      !normalized ||
      normalized === "." ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      pathApi.posix.isAbsolute(normalized)
    ) {
      fail("module candidate가 pinned runtime 밖을 가리킵니다.");
    }
    if (seen.has(normalized)) {
      fail("package main resolution cycle이 있습니다.");
    }
    seen.add(normalized);
    const fileCandidates = [
      normalized,
      `${normalized}.js`,
      `${normalized}.mjs`,
      `${normalized}.cjs`,
      `${normalized}.json`,
    ];
    for (const portablePath of fileCandidates) {
      if (lockedByPath.has(portablePath)) {
        return portablePath;
      }
    }
    if (directoryExistsPinned(normalized)) {
      const packageJson = packageAt(normalized);
      if (typeof packageJson?.main === "string" && packageJson.main) {
        const mainTarget = pathApi.posix.normalize(
          pathApi.posix.join(normalized, packageJson.main),
        );
        return resolveAsFileOrDirectory(mainTarget, seen);
      }
      for (const indexName of [
        "index.js",
        "index.mjs",
        "index.cjs",
        "index.json",
      ]) {
        const portablePath = pathApi.posix.join(normalized, indexName);
        if (lockedByPath.has(portablePath)) return portablePath;
      }
    }
    fail(`pinned manifest에서 module을 찾을 수 없습니다: ${normalized}`);
  };
  const conditionsFor = (context) =>
    new Set([...(context?.conditions || []), "default"]);
  const selectConditionalTarget = (
    target,
    conditions,
    patternValue = null,
  ) => {
    if (target === null) {
      fail("package exports/imports가 이 module을 명시적으로 차단합니다.");
    }
    if (typeof target === "string") {
      return patternValue === null
        ? target
        : target.replaceAll("*", patternValue);
    }
    if (Array.isArray(target)) {
      let lastError;
      for (const candidate of target) {
        try {
          return selectConditionalTarget(
            candidate,
            conditions,
            patternValue,
          );
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || fail("package target array가 비어 있습니다.");
    }
    if (target && typeof target === "object") {
      for (const [condition, candidate] of Object.entries(target)) {
        if (condition === "default" || conditions.has(condition)) {
          return selectConditionalTarget(
            candidate,
            conditions,
            patternValue,
          );
        }
      }
    }
    fail("현재 condition에 맞는 package target이 없습니다.");
  };
  const mappedPackageTarget = (
    mapping,
    requestKey,
    conditions,
  ) => {
    if (
      !mapping ||
      typeof mapping !== "object" ||
      Array.isArray(mapping)
    ) {
      return null;
    }
    if (Object.hasOwn(mapping, requestKey)) {
      return selectConditionalTarget(
        mapping[requestKey],
        conditions,
      );
    }
    const patterns = Object.keys(mapping)
      .filter((key) => key.includes("*"))
      .map((key) => {
        const [prefix, suffix] = key.split("*");
        return { key, prefix, suffix };
      })
      .filter(
        ({ prefix, suffix }) =>
          requestKey.startsWith(prefix) &&
          requestKey.endsWith(suffix) &&
          requestKey.length >= prefix.length + suffix.length,
      )
      .sort(
        (left, right) =>
          right.prefix.length - left.prefix.length ||
          right.suffix.length - left.suffix.length,
      );
    if (patterns.length === 0) return null;
    const selected = patterns[0];
    const patternValue = requestKey.slice(
      selected.prefix.length,
      requestKey.length - selected.suffix.length,
    );
    return selectConditionalTarget(
      mapping[selected.key],
      conditions,
      patternValue,
    );
  };
  const resolvePackageEntry = (
    packageDirectory,
    subpath,
    context,
  ) => {
    const packageJson = packageAt(packageDirectory);
    const requestKey = subpath ? `./${subpath}` : ".";
    if (packageJson && packageJson.exports !== undefined) {
      const exportsValue = packageJson.exports;
      let target;
      if (
        exportsValue &&
        typeof exportsValue === "object" &&
        !Array.isArray(exportsValue) &&
        Object.keys(exportsValue).some((key) => key.startsWith("."))
      ) {
        target = mappedPackageTarget(
          exportsValue,
          requestKey,
          conditionsFor(context),
        );
        if (target === null) {
          fail(`package exports에 허용되지 않은 subpath입니다: ${requestKey}`);
        }
      } else {
        if (requestKey !== ".") {
          fail(`package exports에 허용되지 않은 subpath입니다: ${requestKey}`);
        }
        target = selectConditionalTarget(
          exportsValue,
          conditionsFor(context),
        );
      }
      if (!target.startsWith("./")) {
        fail("package exports target은 package 내부 상대 경로여야 합니다.");
      }
      const targetPortable = pathApi.posix.normalize(
        pathApi.posix.join(packageDirectory, target),
      );
      if (
        packageDirectory &&
        targetPortable !== packageDirectory &&
        !targetPortable.startsWith(`${packageDirectory}/`)
      ) {
        fail("package exports target이 package root를 벗어납니다.");
      }
      return resolveAsFileOrDirectory(targetPortable);
    }
    if (subpath) {
      return resolveAsFileOrDirectory(
        pathApi.posix.join(packageDirectory, subpath),
      );
    }
    if (typeof packageJson?.main === "string" && packageJson.main) {
      return resolveAsFileOrDirectory(
        pathApi.posix.join(packageDirectory, packageJson.main),
      );
    }
    return resolveAsFileOrDirectory(
      pathApi.posix.join(packageDirectory, "index"),
    );
  };
  const splitPackageSpecifier = (specifier) => {
    const parts = specifier.split("/");
    if (specifier.startsWith("@")) {
      if (parts.length < 2) fail("scoped package 이름이 유효하지 않습니다.");
      return {
        packageName: `${parts[0]}/${parts[1]}`,
        subpath: parts.slice(2).join("/"),
      };
    }
    return {
      packageName: parts[0],
      subpath: parts.slice(1).join("/"),
    };
  };
  const findPackageDirectory = (packageName, parentPortable) => {
    const selfDirectory = nearestPackageDirectory(parentPortable);
    if (
      selfDirectory !== null &&
      packageAt(selfDirectory)?.name === packageName
    ) {
      return selfDirectory;
    }
    let current = pathApi.posix.dirname(parentPortable);
    while (current && current !== ".") {
      const candidate = pathApi.posix.join(
        current,
        "node_modules",
        packageName,
      );
      if (directoryExistsPinned(candidate)) return candidate;
      const parent = pathApi.posix.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    if (directoryExistsPinned(packageName)) return packageName;
    fail(`pinned runtime에서 bare package를 찾을 수 없습니다: ${packageName}`);
  };
  const resolveImportsSpecifier = (
    specifier,
    parentPortable,
    context,
    resolvePinnedSpecifier,
  ) => {
    const packageDirectory = nearestPackageDirectory(parentPortable);
    if (packageDirectory === null) {
      fail("package imports를 해석할 parent package가 없습니다.");
    }
    const packageJson = packageAt(packageDirectory);
    const target = mappedPackageTarget(
      packageJson?.imports,
      specifier,
      conditionsFor(context),
    );
    if (target === null) {
      fail(`package imports에 없는 specifier입니다: ${specifier}`);
    }
    if (target.startsWith("./")) {
      const targetPortable = pathApi.posix.normalize(
        pathApi.posix.join(packageDirectory, target),
      );
      if (
        packageDirectory &&
        targetPortable !== packageDirectory &&
        !targetPortable.startsWith(`${packageDirectory}/`)
      ) {
        fail("package imports target이 package root를 벗어납니다.");
      }
      return resolveAsFileOrDirectory(targetPortable);
    }
    return resolvePinnedSpecifier(
      target,
      context,
      parentPortable,
    );
  };
  const resolvePinnedSpecifier = (
    specifier,
    context,
    parentPortable = entryRelative,
  ) => {
    if (String(specifier).startsWith(sealedScheme)) {
      return portableFromSealedUrl(specifier);
    }
    if (String(specifier).startsWith("file:")) {
      return resolveAsFileOrDirectory(
        portableFromFilename(fileURLToPath(specifier)),
      );
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(String(specifier))) {
      fail(`허용되지 않은 module URL scheme입니다: ${specifier}`);
    }
    if (
      String(specifier).startsWith("./") ||
      String(specifier).startsWith("../")
    ) {
      return resolveAsFileOrDirectory(
        pathApi.posix.join(
          pathApi.posix.dirname(parentPortable),
          String(specifier),
        ),
      );
    }
    if (pathApi.isAbsolute(String(specifier))) {
      return resolveAsFileOrDirectory(
        portableFromFilename(String(specifier)),
      );
    }
    if (String(specifier).startsWith("#")) {
      return resolveImportsSpecifier(
        String(specifier),
        parentPortable,
        context,
        resolvePinnedSpecifier,
      );
    }
    const { packageName, subpath } = splitPackageSpecifier(
      String(specifier),
    );
    const packageDirectory = findPackageDirectory(
      packageName,
      parentPortable,
    );
    return resolvePackageEntry(packageDirectory, subpath, context);
  };
  const cjsCache = new Map();
  const cjsGlobalKey =
    "detail-page-maker/sealed-commonjs-runtime/v1";
  const executeCommonJs = (portablePath) => {
    if (cjsCache.has(portablePath)) {
      return cjsCache.get(portablePath).exports;
    }
    assertPinnedFileUnchanged(portablePath);
    const format = formatForPortable(portablePath);
    const source = sourceByPath.get(portablePath);
    if (format === "json") {
      let parsed;
      try {
        parsed = JSON.parse(source.toString("utf8"));
      } catch {
        fail(`sealed JSON module이 유효하지 않습니다: ${portablePath}`);
      }
      cjsCache.set(portablePath, { exports: parsed });
      return parsed;
    }
    if (format !== "commonjs" && format !== "commonjs-typescript") {
      fail(`CommonJS require가 ESM module을 요청했습니다: ${portablePath}`);
    }
    const filename = filenameFromPortable(portablePath);
    const moduleRecord = {
      exports: {},
      filename,
      id: filename,
      loaded: false,
      parent: null,
      children: [],
      paths: [],
    };
    cjsCache.set(portablePath, moduleRecord);
    const memoryRequire = (specifier) => {
      const normalizedSpecifier = String(specifier);
      if (builtinSet.has(normalizedSpecifier)) {
        const builtinName = normalizedSpecifier.startsWith("node:")
          ? normalizedSpecifier.slice(5)
          : normalizedSpecifier;
        const builtin = process.getBuiltinModule(builtinName);
        if (!builtin) {
          fail(`Node builtin을 로드할 수 없습니다: ${normalizedSpecifier}`);
        }
        return builtin;
      }
      const childPortable = resolvePinnedSpecifier(
        normalizedSpecifier,
        { conditions: ["node", "require", "default"] },
        portablePath,
      );
      const childExports = executeCommonJs(childPortable);
      const childRecord = cjsCache.get(childPortable);
      if (childRecord && !moduleRecord.children.includes(childRecord)) {
        childRecord.parent ||= moduleRecord;
        moduleRecord.children.push(childRecord);
      }
      return childExports;
    };
    memoryRequire.resolve = (specifier) => {
      const normalizedSpecifier = String(specifier);
      if (builtinSet.has(normalizedSpecifier)) {
        return normalizedSpecifier.startsWith("node:")
          ? normalizedSpecifier
          : `node:${normalizedSpecifier}`;
      }
      return filenameFromPortable(
        resolvePinnedSpecifier(
          normalizedSpecifier,
          { conditions: ["node", "require", "default"] },
          portablePath,
        ),
      );
    };
    memoryRequire.cache = Object.create(null);
    memoryRequire.main = null;
    let code = source.toString("utf8");
    if (code.startsWith("#!")) {
      code = code.replace(/^#![^\r\n]*(?:\r?\n|$)/, "");
    }
    let compiled;
    try {
      compiled = new Function(
        "exports",
        "require",
        "module",
        "__filename",
        "__dirname",
        `${code}\n//# sourceURL=${filename.replaceAll("\\", "/")}`,
      );
    } catch {
      cjsCache.delete(portablePath);
      fail(`sealed CommonJS module을 compile할 수 없습니다: ${portablePath}`);
    }
    try {
      compiled.call(
        moduleRecord.exports,
        moduleRecord.exports,
        memoryRequire,
        moduleRecord,
        filename,
        pathApi.dirname(filename),
      );
      moduleRecord.loaded = true;
      return moduleRecord.exports;
    } catch (error) {
      cjsCache.delete(portablePath);
      throw error;
    }
  };
  globalThis[Symbol.for(cjsGlobalKey)] = {
    exportsFor(portablePath) {
      return executeCommonJs(portablePath);
    },
  };
  const commonJsEsmWrapper = (portablePath) => {
    const exportsValue = executeCommonJs(portablePath);
    const names =
      exportsValue &&
      (typeof exportsValue === "object" ||
        typeof exportsValue === "function")
        ? Object.keys(exportsValue).filter(
            (name) =>
              name !== "default" &&
              /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name),
          )
        : [];
    return [
      `const value = globalThis[Symbol.for(${JSON.stringify(cjsGlobalKey)})].exportsFor(${JSON.stringify(portablePath)});`,
      "export default value;",
      ...names.map(
        (name) =>
          `export const ${name} = value[${JSON.stringify(name)}];`,
      ),
      "",
    ].join("\n");
  };
  const relativeFromRuntimeUrl = (url) => {
    if (String(url).startsWith(sealedScheme)) {
      return portableFromSealedUrl(url);
    }
    if (!String(url).startsWith("file:")) return null;
    const filename = fileURLToPath(url);
    const relative = pathApi.relative(treeRoot, filename);
    if (
      relative === ".." ||
      relative.startsWith(`..${pathApi.sep}`) ||
      pathApi.isAbsolute(relative)
    ) {
      fail("Wrangler가 pinned runtime 밖의 module을 로드하려 했습니다.");
    }
    const portablePath = relative.split(pathApi.sep).join("/");
    if (!lockedByPath.has(portablePath)) {
      fail("Wrangler가 manifest에 없는 module을 로드하려 했습니다.");
    }
    return portablePath;
  };
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (builtinSet.has(String(specifier))) {
        const resolved = nextResolve(specifier, context);
        if (!String(resolved.url).startsWith("node:")) {
          fail("Node builtin resolution이 node: URL을 반환하지 않았습니다.");
        }
        return resolved;
      }
      let parentPortable = entryRelative;
      if (
        String(context?.parentURL || "").startsWith("file:") ||
        String(context?.parentURL || "").startsWith(sealedScheme)
      ) {
        try {
          parentPortable = relativeFromRuntimeUrl(context.parentURL);
        } catch (error) {
          if (
            !String(specifier).startsWith("file:") &&
            !String(specifier).startsWith(sealedScheme)
          ) {
            throw error;
          }
        }
      }
      const portablePath = resolvePinnedSpecifier(
        String(specifier),
        context,
        parentPortable,
      );
      assertPinnedFileUnchanged(portablePath);
      const sourceFormat = formatForPortable(portablePath);
      return {
        url: sealedUrlForPortable(portablePath),
        format:
          sourceFormat === "commonjs" ||
          sourceFormat === "commonjs-typescript"
            ? "module"
            : sourceFormat,
        shortCircuit: true,
      };
    },
    load(url, context, nextLoad) {
      if (String(url).startsWith("node:")) {
        return nextLoad(url, context);
      }
      const portablePath = relativeFromRuntimeUrl(url);
      const source = sourceByPath.get(portablePath);
      const locked = lockedByPath.get(portablePath);
      let currentOriginal;
      try {
        currentOriginal = readFileSync(
          pathApi.join(treeRoot, ...portablePath.split("/")),
        );
      } catch {
        fail("loaded Wrangler module의 원본 runtime file을 다시 확인할 수 없습니다.");
      }
      if (
        !source ||
        source.length !== locked.bytes ||
        sha256(source) !== locked.sha256 ||
        currentOriginal.length !== locked.bytes ||
        sha256(currentOriginal) !== locked.sha256
      ) {
        fail("loaded Wrangler module bytes가 pinned manifest와 다릅니다.");
      }
      if (portablePath.endsWith(".node")) {
        fail("native addon은 permission-sealed Wrangler에서 허용하지 않습니다.");
      }
      const sourceFormat = formatForPortable(portablePath);
      if (
        sourceFormat === "commonjs" ||
        sourceFormat === "commonjs-typescript"
      ) {
        return {
          format: "module",
          source: commonJsEsmWrapper(portablePath),
          shortCircuit: true,
        };
      }
      return {
        format: sourceFormat,
        source: Buffer.from(source),
        shortCircuit: true,
      };
    },
  });
  const entrypoint = pathApi.join(
    treeRoot,
    ...entryRelative.split("/"),
  );
  process.argv = [process.execPath, entrypoint, ...wranglerArguments];
  await import(sealedUrlForPortable(entryRelative));
}

const SEALED_WRANGLER_LAUNCHER_SOURCE =
  `(${sealedWranglerLauncher.toString()})().catch((error) => {` +
  "process.stderr.write(`[sealed-wrangler] ${error?.code || \"ERROR\"}: ${error?.message || String(error)}\\n`);" +
  "process.exitCode = 1;" +
  "});";

export async function defaultWranglerRunner({
  command,
  args,
  cwd,
  env,
  timeoutMs = 120_000,
  secureRuntime,
  onStderr,
}) {
  let spawnArgs = args;
  if (secureRuntime) {
    const runtimeTreeRoot = path.join(
      secureRuntime.runtimeRoot,
      "node_modules",
    );
    const entryRelative = portableRelativePath(
      path.relative(runtimeTreeRoot, secureRuntime.entrypoint),
    );
    if (
      command !== process.execPath ||
      args?.[0] !== secureRuntime.entrypoint ||
      !entryRelative ||
      entryRelative === ".." ||
      entryRelative.startsWith("../") ||
      path.posix.isAbsolute(entryRelative)
    ) {
      throw new CloudflarePagesUploaderError(
        "WRANGLER_SEALED_RUNTIME_INVALID",
        "sealed Wrangler launcher invocation이 pinned entrypoint와 일치하지 않습니다.",
        { state: "runtime_invalid" },
      );
    }
    spawnArgs = [
      "--permission",
      `--allow-fs-read=${path.resolve(secureRuntime.runtimeRoot)}`,
      `--allow-fs-read=${path.resolve(cwd)}`,
      "--input-type=module",
      "--eval",
      SEALED_WRANGLER_LAUNCHER_SOURCE,
      "--",
      runtimeTreeRoot,
      secureRuntime.runtimeLockPath,
      entryRelative,
      secureRuntime.runtimeTreeSha256,
      secureRuntime.entrypointSha256,
      ...args.slice(1),
    ];
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, spawnArgs, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (current, chunk) =>
      `${current}${chunk}`.slice(-1_000_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
      try {
        onStderr?.(String(chunk));
      } catch {
        // Observer callbacks never control the child lifecycle.
      }
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new CloudflarePagesUploaderError(
            "WRANGLER_TIMEOUT",
            "Wrangler 실행 시간이 제한을 초과했습니다.",
            { state: "upload_failed" },
          ),
        );
        return;
      }
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new CloudflarePagesUploaderError(
            "WRANGLER_TIMEOUT",
            "Wrangler 실행 시간이 제한을 초과했습니다.",
            { state: "upload_failed" },
          ),
        );
        return;
      }
      resolve({
        exitCode: Number(exitCode),
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr),
      });
    });
  });
}

async function runWrangler(
  runtime,
  argv,
  {
    projectRoot,
    runner,
    state = "upload_failed",
    failureCode = "WRANGLER_FAILED",
  },
) {
  let result;
  try {
    const runtimeIntegrity = await verifyWranglerRuntimeIntegrity(
      runtime.config,
      runtime.projectRoot || projectRoot,
    );
    result = await runner({
      command: process.execPath,
      args: [runtime.entrypoint, ...argv],
      cwd: projectRoot,
      env: keyringEnvironment(),
      shell: false,
      timeoutMs: 120_000,
      secureRuntime: {
        runtimeRoot: runtime.config.runtimeRoot,
        runtimeLockPath: runtime.config.runtimeLockPath,
        entrypoint: runtime.entrypoint,
        entrypointSha256: runtime.entrypointSha256,
        runtimeTreeSha256: runtimeIntegrity.tree_sha256,
      },
    });
  } catch (error) {
    throw uploaderError(
      error,
      failureCode,
      "프로젝트 로컬 Wrangler 실행에 실패했습니다.",
      state,
    );
  }
  const safeResult = redactSecrets(result || {});
  if (Number(result?.exitCode) !== 0) {
    throw new CloudflarePagesUploaderError(
      failureCode,
      "프로젝트 로컬 Wrangler가 실패 상태를 반환했습니다.",
      {
        state,
        details: {
          argv,
          exitCode: result?.exitCode,
          stdout: safeResult.stdout,
          stderr: safeResult.stderr,
        },
      },
    );
  }
  return safeResult;
}

function parseWranglerJson(stdout, code, state) {
  const text = String(stdout || "").trim();
  const candidates = [
    text,
    ...text.split(/\r?\n/).reverse(),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Wrangler may print a short banner before its JSON result.
    }
  }
  throw new CloudflarePagesUploaderError(
    code,
    "Wrangler JSON 결과를 해석할 수 없습니다.",
    { state, details: { stdout: text } },
  );
}

function unwrapList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  if (Array.isArray(value?.projects)) return value.projects;
  if (Array.isArray(value?.deployments)) return value.deployments;
  return null;
}

async function assertCloudflareReady({
  projectRoot,
  config,
  runtime,
  runner,
}) {
  await runWrangler(runtime, ["whoami", "--json"], {
    projectRoot,
    runner,
    state: "auth_required",
    failureCode: "CLOUDFLARE_AUTH_REQUIRED",
  });
  const projectResult = await runWrangler(
    runtime,
    ["pages", "project", "list", "--json"],
    {
      projectRoot,
      runner,
      state: "config_invalid",
      failureCode: "PAGES_PROJECT_LIST_FAILED",
    },
  );
  const projects = unwrapList(
    parseWranglerJson(
      projectResult.stdout,
      "PAGES_PROJECT_LIST_INVALID",
      "config_invalid",
    ),
  );
  if (
    !projects ||
    !projects.some(
      (project) =>
        String(project?.name || project?.project_name || "") ===
        config.pagesProject,
    )
  ) {
    throw new CloudflarePagesUploaderError(
      "PAGES_PROJECT_MISSING",
      "config에 지정한 Cloudflare Pages 프로젝트가 없습니다.",
      { state: "config_invalid" },
    );
  }
}

async function cloudflarePagesContext({
  projectRoot,
  runner,
  ownerProvider = defaultCloudflareOwnerProvider,
}) {
  const loadedConfig = await loadCloudflarePagesConfig(projectRoot);
  const owner = await resolveWriterOwner(loadedConfig, ownerProvider);
  const config = {
    ...loadedConfig,
    ...owner,
  };
  const runtime = await resolvePinnedWrangler(config, projectRoot);
  await assertCloudflareReady({
    projectRoot,
    config,
    runtime,
    runner,
  });
  return { config, runtime };
}

export async function preflightCloudflarePagesConnection({
  projectRoot,
  runner = defaultWranglerRunner,
  ownerProvider = defaultCloudflareOwnerProvider,
}) {
  try {
    const { config, runtime } = await cloudflarePagesContext({
      projectRoot: path.resolve(projectRoot),
      runner,
      ownerProvider,
    });
    return {
      status: "connected",
      state: "connected",
      provider: "cloudflare-pages",
      pagesProject: config.pagesProject,
      publicBaseUrl: config.publicBaseUrl,
      productionBranch: config.productionBranch,
      wranglerVersion: runtime.version,
      wranglerEntrySha256: runtime.entrypointSha256,
      wranglerRuntimeTreeSha256: runtime.runtimeTreeSha256,
      publisherId: config.publisherId,
      writerOwnerDigest: config.writerOwnerDigest,
      credentials: "os-keyring",
    };
  } catch (error) {
    throw uploaderError(
      error,
      "CLOUDFLARE_PREFLIGHT_FAILED",
      "Cloudflare Pages 연결 사전 검증에 실패했습니다.",
      "preflight_failed",
    );
  }
}

async function readResponseBytes(response) {
  return Buffer.from(await response.arrayBuffer());
}

function normalizedMime(response) {
  return String(response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function cacheIsImmutable(response) {
  const value = String(response.headers.get("cache-control") || "");
  return IMMUTABLE_CACHE_RE.test(value) && MAX_AGE_CACHE_RE.test(value);
}

async function fetchNoRedirect(fetchImpl, url, purpose) {
  try {
    return await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: { "Cache-Control": "no-cache" },
    });
  } catch (error) {
    throw uploaderError(
      error,
      "CDN_REQUEST_FAILED",
      `${purpose} 중 CDN 요청에 실패했습니다.`,
      "verification_failed",
      { url },
    );
  }
}

function validateIndexedAsset(asset, publicBaseUrl) {
  const filename = normalizeAssetFilename(asset?.filename);
  const projectKey = assertSafeSegment(asset?.project_key, "project_key");
  const exportId = String(asset?.export_id || "");
  if (!EXPORT_ID_RE.test(exportId)) {
    throw new CloudflarePagesUploaderError(
      "REMOTE_INDEX_INVALID",
      "원격 deploy-index에 유효하지 않은 export_id가 있습니다.",
      { state: "preservation_failed" },
    );
  }
  const bytes = Number(asset?.bytes);
  const sha256 = String(asset?.sha256 || "").toLowerCase();
  if (
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    !SHA256_RE.test(sha256) ||
    asset?.mime_type !== WEBP_MIME
  ) {
    throw new CloudflarePagesUploaderError(
      "REMOTE_INDEX_INVALID",
      "원격 deploy-index asset 무결성 정보가 유효하지 않습니다.",
      { state: "preservation_failed" },
    );
  }
  const expectedUrl = joinPublicUrl(
    publicBaseUrl,
    projectKey,
    exportId,
    filename,
  );
  if (asset.url !== expectedUrl) {
    throw new CloudflarePagesUploaderError(
      "REMOTE_INDEX_INVALID",
      "원격 deploy-index URL이 config의 공개 주소와 일치하지 않습니다.",
      { state: "preservation_failed" },
    );
  }
  return {
    project_key: projectKey,
    export_id: exportId,
    filename,
    mime_type: WEBP_MIME,
    bytes,
    sha256,
    url: expectedUrl,
  };
}

async function loadOptionalAuthorizationReceipt(
  receiptPath,
  provided,
  label,
) {
  if (provided !== undefined && provided !== null) return provided;
  try {
    const receiptStat = await lstat(receiptPath);
    if (!receiptStat.isFile() || receiptStat.isSymbolicLink()) {
      throw new CloudflarePagesUploaderError(
        "PUBLISH_AUTHORIZATION_RECEIPT_INVALID",
        `${label}은 일반 JSON 파일이어야 합니다.`,
        { state: "preservation_failed" },
      );
    }
    const canonical = await realpath(receiptPath);
    if (!sameCanonicalPath(canonical, receiptPath)) {
      throw new CloudflarePagesUploaderError(
        "PUBLISH_AUTHORIZATION_RECEIPT_INVALID",
        `${label}에는 symlink/reparse를 사용할 수 없습니다.`,
        { state: "preservation_failed" },
      );
    }
    return await readJsonFile(
      receiptPath,
      "PUBLISH_AUTHORIZATION_RECEIPT_INVALID",
      "preservation_failed",
    );
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertReceiptApprover(receipt) {
  const authorizedBy = String(receipt?.authorized_by || "").trim();
  const authorizedAt = String(receipt?.authorized_at || "").trim();
  if (
    authorizedBy.length < 3 ||
    authorizedBy.length > 160 ||
    !Number.isFinite(Date.parse(authorizedAt))
  ) {
    throw new CloudflarePagesUploaderError(
      "PUBLISH_AUTHORIZATION_RECEIPT_INVALID",
      "Cloudflare publish authorization receipt의 승인 정보가 유효하지 않습니다.",
      { state: "preservation_failed" },
    );
  }
}

function assertBootstrapReceipt(receipt, config) {
  if (!receipt) {
    throw new CloudflarePagesUploaderError(
      "PAGES_BOOTSTRAP_AUTHORIZATION_REQUIRED",
      "첫 Cloudflare Pages snapshot은 typed bootstrap receipt 없이는 게시할 수 없습니다.",
      { state: "preservation_failed" },
    );
  }
  assertReceiptApprover(receipt);
  if (
    receipt.schema_version !== "1.0" ||
    receipt.receipt_type !== "cloudflare-pages-bootstrap" ||
    receipt.pages_project !== config.pagesProject ||
    normalizePublicBaseUrl(receipt.public_base_url) !==
      config.publicBaseUrl ||
    receipt.publisher_id !== config.publisherId ||
    receipt.writer_owner_digest !== config.writerOwnerDigest ||
    receipt.expected_remote_index_status !== 404 ||
    receipt.expected_generation !== 0 ||
    receipt.expected_deployment_count !== 0 ||
    !config.verifyBootstrapReceiptSignature(receipt)
  ) {
    throw new CloudflarePagesUploaderError(
      "PAGES_BOOTSTRAP_AUTHORIZATION_INVALID",
      "bootstrap receipt의 target·owner pin·빈 원격 상태·machine-local HMAC 서명이 유효하지 않습니다.",
      { state: "preservation_failed" },
    );
  }
}

function emptyDeployIndex(config) {
  return {
    schema_version: "1.1",
    provider: "cloudflare-pages",
    pages_project: config.pagesProject,
    public_base_url: config.publicBaseUrl,
    publisher_id: config.publisherId,
    writer_owner_digest: config.writerOwnerDigest,
    generation: 0,
    exports: [],
  };
}

function flattenIndexAssets(index) {
  return index.exports.flatMap((entry) =>
    entry.assets.map((asset) => ({
      ...asset,
      project_key: entry.project_key,
      export_id: entry.export_id,
    })),
  );
}

function validateDeployIndex(raw, config) {
  const remoteOwnerDigest =
    typeof raw?.writer_owner_digest === "string" &&
    SHA256_RE.test(raw.writer_owner_digest)
      ? raw.writer_owner_digest
      : null;
  if (
    raw?.publisher_id !== config.publisherId ||
    remoteOwnerDigest !== config.writerOwnerDigest
  ) {
    throw new CloudflarePagesUploaderError(
      remoteOwnerDigest
        ? "DEPLOY_INDEX_OWNER_MISMATCH"
        : "DEPLOY_INDEX_OWNER_MISSING",
      "원격 deploy-index의 writer owner가 현재 machine-local owner와 다릅니다.",
      {
        state: "preservation_failed",
        details: {
          expectedPublisherId: config.publisherId,
          actualPublisherId: raw?.publisher_id,
          expectedWriterOwnerDigest: config.writerOwnerDigest,
          actualWriterOwnerDigest: remoteOwnerDigest,
        },
      },
    );
  }
  if (
    !["1.0", "1.1"].includes(raw?.schema_version) ||
    raw?.provider !== "cloudflare-pages" ||
    raw?.pages_project !== config.pagesProject ||
    normalizePublicBaseUrl(raw?.public_base_url) !== config.publicBaseUrl ||
    !PUBLISHER_ID_RE.test(String(raw?.publisher_id || "")) ||
    (raw.schema_version === "1.1" && !remoteOwnerDigest) ||
    !Number.isSafeInteger(raw?.generation) ||
    raw.generation < 1 ||
    !Array.isArray(raw?.exports)
  ) {
    throw new CloudflarePagesUploaderError(
      "REMOTE_INDEX_INVALID",
      "원격 deploy-index가 현재 Cloudflare config와 일치하지 않습니다.",
      { state: "preservation_failed" },
    );
  }
  const seenNamespaces = new Set();
  const exports = raw.exports.map((entry) => {
    const projectKey = assertSafeSegment(entry?.project_key, "project_key");
    const exportId = String(entry?.export_id || "");
    if (!EXPORT_ID_RE.test(exportId) || !Array.isArray(entry?.assets)) {
      throw new CloudflarePagesUploaderError(
        "REMOTE_INDEX_INVALID",
        "원격 deploy-index export 항목이 유효하지 않습니다.",
        { state: "preservation_failed" },
      );
    }
    const namespace = `${projectKey}/${exportId}`;
    if (seenNamespaces.has(namespace)) {
      throw new CloudflarePagesUploaderError(
        "REMOTE_INDEX_INVALID",
        "원격 deploy-index에 중복 namespace가 있습니다.",
        { state: "preservation_failed" },
      );
    }
    seenNamespaces.add(namespace);
    return {
      project_key: projectKey,
      export_id: exportId,
      namespace,
      assets: entry.assets.map((asset) =>
        validateIndexedAsset(
          {
            ...asset,
            project_key: projectKey,
            export_id: exportId,
          },
          config.publicBaseUrl,
        ),
      ),
    };
  });
  return {
    schema_version: raw.schema_version,
    provider: "cloudflare-pages",
    pages_project: config.pagesProject,
    public_base_url: config.publicBaseUrl,
    publisher_id: raw.publisher_id,
    writer_owner_digest: remoteOwnerDigest,
    generation: raw.generation,
    exports,
  };
}

async function remoteDeployIndex({
  projectRoot,
  config,
  runtime,
  runner,
  fetchImpl,
  bootstrapReceipt,
}) {
  const indexUrl = joinPublicUrl(
    config.publicBaseUrl,
    DEPLOY_INDEX_FILENAME,
  );
  const response = await fetchNoRedirect(
    fetchImpl,
    indexUrl,
    "deploy-index 확인",
  );
  if (response.status === 200) {
    const indexBytes = await readResponseBytes(response);
    let raw;
    try {
      raw = JSON.parse(indexBytes.toString("utf8"));
    } catch (error) {
      throw uploaderError(
        error,
        "REMOTE_INDEX_INVALID",
        "원격 deploy-index JSON이 유효하지 않습니다.",
        "preservation_failed",
      );
    }
    const indexSha256 = sha256Bytes(indexBytes);
    const index = validateDeployIndex(raw, config);
    return {
      index,
      indexUrl,
      existed: true,
      indexBytes,
      indexSha256,
      generation: index.generation,
    };
  }
  if (response.status !== 404) {
    throw new CloudflarePagesUploaderError(
      "REMOTE_INDEX_UNAVAILABLE",
      "원격 deploy-index를 안전하게 확인할 수 없습니다.",
      {
        state: "preservation_failed",
        details: { url: indexUrl, status: response.status },
      },
    );
  }
  const deploymentsResult = await runWrangler(
    runtime,
    [
      "pages",
      "deployment",
      "list",
      "--project-name",
      config.pagesProject,
      "--json",
    ],
    {
      projectRoot,
      runner,
      state: "preservation_failed",
      failureCode: "PAGES_DEPLOYMENT_LIST_FAILED",
    },
  );
  const deployments = unwrapList(
    parseWranglerJson(
      deploymentsResult.stdout,
      "PAGES_DEPLOYMENT_LIST_INVALID",
      "preservation_failed",
    ),
  );
  if (!deployments) {
    throw new CloudflarePagesUploaderError(
      "PAGES_DEPLOYMENT_LIST_INVALID",
      "Pages deployment 목록 형식을 확인할 수 없습니다.",
      { state: "preservation_failed" },
    );
  }
  if (deployments.length > 0) {
    throw new CloudflarePagesUploaderError(
      "REMOTE_INDEX_MISSING",
      "기존 Pages deployment가 있지만 deploy-index가 없어 이전 경로 보존을 증명할 수 없습니다.",
      { state: "preservation_failed" },
    );
  }
  assertBootstrapReceipt(bootstrapReceipt, config);
  const index = emptyDeployIndex(config);
  return {
    index,
    indexUrl,
    existed: false,
    indexBytes: null,
    indexSha256: null,
    generation: 0,
  };
}

async function assertRemoteIndexUnchanged({
  config,
  fetchImpl,
  snapshot,
}) {
  const response = await fetchNoRedirect(
    fetchImpl,
    snapshot.indexUrl,
    "배포 직전 deploy-index CAS 확인",
  );
  if (!snapshot.existed) {
    if (response.status === 404) return;
    let actualGeneration = null;
    let actualSha256 = null;
    if (response.status === 200) {
      const bytes = await readResponseBytes(response);
      actualSha256 = sha256Bytes(bytes);
      try {
        actualGeneration = validateDeployIndex(
          JSON.parse(bytes.toString("utf8")),
          config,
        ).generation;
      } catch (error) {
        if (
          error instanceof CloudflarePagesUploaderError &&
          error.code === "DEPLOY_INDEX_OWNER_MISMATCH"
        ) {
          throw error;
        }
      }
    }
    throw new CloudflarePagesUploaderError(
      "DEPLOY_INDEX_CONFLICT",
      "배포 준비 중 원격 deploy-index가 생성되었습니다. 최신 snapshot으로 재시도하세요.",
      {
        state: "concurrent_conflict",
        details: {
          retryable: true,
          expectedStatus: 404,
          actualStatus: response.status,
          expectedGeneration: 0,
          actualGeneration,
          actualSha256,
        },
      },
    );
  }
  if (response.status !== 200) {
    throw new CloudflarePagesUploaderError(
      "DEPLOY_INDEX_CONFLICT",
      "배포 준비 중 원격 deploy-index 상태가 바뀌었습니다. 최신 snapshot으로 재시도하세요.",
      {
        state: "concurrent_conflict",
        details: {
          retryable: true,
          expectedStatus: 200,
          actualStatus: response.status,
          expectedGeneration: snapshot.generation,
        },
      },
    );
  }
  const currentBytes = await readResponseBytes(response);
  const currentSha256 = sha256Bytes(currentBytes);
  let currentIndex;
  try {
    currentIndex = validateDeployIndex(
      JSON.parse(currentBytes.toString("utf8")),
      config,
    );
  } catch (error) {
    if (error instanceof CloudflarePagesUploaderError) throw error;
    throw new CloudflarePagesUploaderError(
      "DEPLOY_INDEX_CONFLICT",
      "배포 준비 중 원격 deploy-index bytes가 유효하지 않게 바뀌었습니다.",
      {
        state: "concurrent_conflict",
        details: { retryable: true, actualSha256: currentSha256 },
      },
    );
  }
  if (
    currentSha256 !== snapshot.indexSha256 ||
    currentIndex.generation !== snapshot.generation ||
    currentIndex.publisher_id !== snapshot.index.publisher_id ||
    currentIndex.writer_owner_digest !==
      snapshot.index.writer_owner_digest
  ) {
    throw new CloudflarePagesUploaderError(
      "DEPLOY_INDEX_CONFLICT",
      "배포 준비 중 원격 deploy-index bytes/generation이 바뀌었습니다. 최신 snapshot으로 재시도하세요.",
      {
        state: "concurrent_conflict",
        details: {
          retryable: true,
          expectedSha256: snapshot.indexSha256,
          actualSha256: currentSha256,
          expectedGeneration: snapshot.generation,
          actualGeneration: currentIndex.generation,
        },
      },
    );
  }
}

async function localExportAssets({
  exportRoot,
  namespace,
  config,
}) {
  const manifestPath = path.join(exportRoot, "cdn-upload-manifest.json");
  const manifest = await readJsonFile(
    manifestPath,
    "WING_MANIFEST_INVALID",
    "generated_invalid",
  );
  if (
    manifest.export_id !== namespace.exportId ||
    manifest.project_key !== namespace.projectKey ||
    manifest.cdn_base_url !== namespace.namespaceUrl ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length === 0
  ) {
    throw new CloudflarePagesUploaderError(
      "WING_MANIFEST_INVALID",
      "Wing manifest가 config 기반 namespace와 일치하지 않습니다.",
      { state: "generated_invalid" },
    );
  }
  const assets = [];
  for (const asset of manifest.assets) {
    const filename = normalizeAssetFilename(asset?.filename);
    const filenamePath = resolveInside(
      path.join(exportRoot, "assets"),
      filename,
      "Wing asset",
    );
    const stat = await assertRegularFile(
      filenamePath,
      "WING_ASSET_INVALID",
      "generated_invalid",
    );
    const bytes = await readFile(filenamePath);
    const digest = sha256Bytes(bytes);
    const expectedUrl = joinPublicUrl(
      config.publicBaseUrl,
      namespace.projectKey,
      namespace.exportId,
      filename,
    );
    if (
      asset.mime_type !== WEBP_MIME ||
      Number(asset.bytes) !== stat.size ||
      asset.sha256 !== digest ||
      asset.cdn_url !== expectedUrl
    ) {
      throw new CloudflarePagesUploaderError(
        "WING_ASSET_INVALID",
        "Wing asset의 MIME·크기·SHA·CDN URL이 실제 bytes와 일치하지 않습니다.",
        {
          state: "generated_invalid",
          details: { filename },
        },
      );
    }
    assets.push({
      filename,
      sourcePath: filenamePath,
      mime_type: WEBP_MIME,
      bytes: stat.size,
      sha256: digest,
      url: expectedUrl,
    });
  }
  return { manifestPath, assets };
}

async function assertNamespaceAvailable(fetchImpl, assets) {
  for (const asset of assets) {
    const response = await fetchNoRedirect(
      fetchImpl,
      asset.url,
      "새 namespace 충돌 확인",
    );
    if (response.status === 200) {
      throw new CloudflarePagesUploaderError(
        "CDN_NAMESPACE_EXISTS",
        "새 export namespace에 이미 공개 파일이 있어 덮어쓸 수 없습니다.",
        {
          state: "namespace_conflict",
          details: { url: asset.url },
        },
      );
    }
    if (response.status !== 404 && response.status !== 410) {
      throw new CloudflarePagesUploaderError(
        "CDN_NAMESPACE_PREFLIGHT_FAILED",
        "새 export namespace의 비어 있음 상태를 증명할 수 없습니다.",
        {
          state: "namespace_conflict",
          details: { url: asset.url, status: response.status },
        },
      );
    }
  }
}

async function verifiedRemoteBytes(fetchImpl, asset, purpose) {
  const response = await fetchNoRedirect(fetchImpl, asset.url, purpose);
  const bytes = await readResponseBytes(response);
  const actual = {
    status: response.status,
    mime: normalizedMime(response),
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
    cacheControl: String(response.headers.get("cache-control") || ""),
  };
  const passed =
    response.status === 200 &&
    actual.mime === WEBP_MIME &&
    actual.bytes === asset.bytes &&
    actual.sha256 === asset.sha256 &&
    cacheIsImmutable(response);
  if (!passed) {
    throw new CloudflarePagesUploaderError(
      "CDN_ASSET_VERIFICATION_FAILED",
      `${purpose} 중 HTTP·MIME·크기·SHA·cache 검증에 실패했습니다.`,
      {
        state: "verification_failed",
        details: { url: asset.url, expected: asset, actual },
      },
    );
  }
  return { bytes, check: { url: asset.url, ...actual, passed: true } };
}

async function copyPastAssets({
  projectRoot,
  stagingRoot,
  oldIndex,
  fetchImpl,
}) {
  for (const asset of flattenIndexAssets(oldIndex)) {
    const destination = resolveInside(
      stagingRoot,
      path.join(asset.project_key, asset.export_id, asset.filename),
      "staged prior asset",
    );
    await mkdir(path.dirname(destination), { recursive: true });
    const localCandidate = resolveInside(
      projectRoot,
      path.join(
        "output",
        "wing",
        asset.export_id,
        "assets",
        asset.filename,
      ),
      "prior local asset",
    );
    let localBytes = null;
    try {
      const stat = await lstat(localCandidate);
      if (stat.isFile() && !stat.isSymbolicLink()) {
        const candidateBytes = await readFile(localCandidate);
        if (
          candidateBytes.length === asset.bytes &&
          sha256Bytes(candidateBytes) === asset.sha256
        ) {
          localBytes = candidateBytes;
        }
      }
    } catch {
      // A missing local copy is restored from the already verified public URL.
    }
    if (localBytes) {
      await writeFile(destination, localBytes, { flag: "wx" });
      continue;
    }
    const downloaded = await verifiedRemoteBytes(
      fetchImpl,
      asset,
      "이전 namespace 복원",
    );
    await writeFile(destination, downloaded.bytes, { flag: "wx" });
  }
}

function nextDeployIndex(oldIndex, namespace, assets, config) {
  if (
    oldIndex.exports.some(
      (entry) => entry.namespace === namespace.namespace,
    )
  ) {
    throw new CloudflarePagesUploaderError(
      "CDN_NAMESPACE_EXISTS",
      "deploy-index에 새 export namespace가 이미 존재합니다.",
      { state: "namespace_conflict" },
    );
  }
  const entry = {
    project_key: namespace.projectKey,
    export_id: namespace.exportId,
    namespace: namespace.namespace,
    assets: assets.map(({ filename, mime_type, bytes, sha256, url }) => ({
      filename,
      mime_type,
      bytes,
      sha256,
      url,
    })),
  };
  return {
    ...oldIndex,
    schema_version: "1.1",
    publisher_id: config.publisherId,
    writer_owner_digest: config.writerOwnerDigest,
    generation: oldIndex.generation + 1,
    exports: [...oldIndex.exports, entry].sort((left, right) =>
      left.namespace.localeCompare(right.namespace),
    ),
  };
}

function headersFile(index) {
  const projectKeys = [
    ...new Set(index.exports.map((entry) => entry.project_key)),
  ].sort();
  return `${projectKeys
    .map(
      (projectKey) =>
        `/${encodeURIComponent(projectKey)}/*\n` +
        "  Cache-Control: public, max-age=31536000, immutable\n" +
        "  Access-Control-Allow-Origin: *\n",
    )
    .join("\n")}\n/${DEPLOY_INDEX_FILENAME}\n  Cache-Control: no-store\n`;
}

async function stageDeployment({
  projectRoot,
  namespace,
  assets,
  oldIndex,
  fetchImpl,
  config,
}) {
  const stagingParent = resolveInside(
    projectRoot,
    path.join(".detail-page", "cloudflare-pages", "staging"),
    "Pages staging",
  );
  await mkdir(stagingParent, { recursive: true });
  const stagingRoot = await mkdtemp(
    path.join(stagingParent, `${namespace.exportId}-${randomUUID().slice(0, 8)}-`),
  );
  await copyPastAssets({
    projectRoot,
    stagingRoot,
    oldIndex,
    fetchImpl,
  });
  for (const asset of assets) {
    const destination = resolveInside(
      stagingRoot,
      path.join(
        namespace.projectKey,
        namespace.exportId,
        asset.filename,
      ),
      "staged new asset",
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(asset.sourcePath, destination, fsConstants.COPYFILE_EXCL);
  }
  const deployIndex = nextDeployIndex(
    oldIndex,
    namespace,
    assets,
    config,
  );
  const deployIndexBytes = Buffer.from(stableJson(deployIndex), "utf8");
  await Promise.all([
    writeFile(
      path.join(stagingRoot, DEPLOY_INDEX_FILENAME),
      deployIndexBytes,
      { flag: "wx" },
    ),
    writeFile(path.join(stagingRoot, "_headers"), headersFile(deployIndex), {
      flag: "wx",
    }),
  ]);
  return {
    stagingRoot,
    deployIndex,
    deployIndexBytes,
    deployIndexSha256: sha256Bytes(deployIndexBytes),
  };
}

async function mapLimit(items, limit, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function verifyDeployment(
  fetchImpl,
  config,
  staged,
  newAssetCount,
) {
  const assets = flattenIndexAssets(staged.deployIndex);
  const checks = await mapLimit(assets, 8, async (asset) => {
    const result = await verifiedRemoteBytes(
      fetchImpl,
      asset,
      "배포 후 CDN 검증",
    );
    return result.check;
  });
  const indexUrl = joinPublicUrl(
    config.publicBaseUrl,
    DEPLOY_INDEX_FILENAME,
  );
  const indexResponse = await fetchNoRedirect(
    fetchImpl,
    indexUrl,
    "배포 후 deploy-index 검증",
  );
  const indexBytes = await readResponseBytes(indexResponse);
  const actualIndexSha256 = sha256Bytes(indexBytes);
  if (
    indexResponse.status !== 200 ||
    actualIndexSha256 !== staged.deployIndexSha256
  ) {
    throw new CloudflarePagesUploaderError(
      "DEPLOY_INDEX_VERIFICATION_FAILED",
      "배포 후 deploy-index bytes가 staging과 일치하지 않습니다.",
      {
        state: "verification_failed",
        details: {
          url: indexUrl,
          status: indexResponse.status,
          expectedSha256: staged.deployIndexSha256,
          actualSha256: actualIndexSha256,
        },
      },
    );
  }
  let verifiedIndex;
  try {
    verifiedIndex = validateDeployIndex(
      JSON.parse(indexBytes.toString("utf8")),
      config,
    );
  } catch (error) {
    throw uploaderError(
      error,
      "DEPLOY_INDEX_VERIFICATION_FAILED",
      "배포 후 deploy-index owner/generation을 검증할 수 없습니다.",
      "verification_failed",
    );
  }
  if (
    verifiedIndex.publisher_id !== config.publisherId ||
    verifiedIndex.writer_owner_digest !==
      config.writerOwnerDigest ||
    verifiedIndex.generation !== staged.deployIndex.generation
  ) {
    throw new CloudflarePagesUploaderError(
      "DEPLOY_INDEX_VERIFICATION_FAILED",
      "배포 후 deploy-index가 이 publisher의 generation이 아닙니다.",
      {
        state: "verification_failed",
        details: {
          expectedPublisherId: config.publisherId,
          actualPublisherId: verifiedIndex.publisher_id,
          expectedWriterOwnerDigest: config.writerOwnerDigest,
          actualWriterOwnerDigest:
            verifiedIndex.writer_owner_digest,
          expectedGeneration: staged.deployIndex.generation,
          actualGeneration: verifiedIndex.generation,
        },
      },
    );
  }
  return {
    checkedAt: new Date().toISOString(),
    assetCount: checks.length,
    previousAssetCount: checks.length - newAssetCount,
    checks,
    deployIndex: {
      url: indexUrl,
      sha256: staged.deployIndexSha256,
      publisherId: verifiedIndex.publisher_id,
      writerOwnerDigest: verifiedIndex.writer_owner_digest,
      generation: verifiedIndex.generation,
      passed: true,
    },
  };
}

export async function uploadCloudflarePagesExport({
  projectRoot,
  exportRoot,
  projectKey,
  exportId,
  runner = defaultWranglerRunner,
  fetchImpl = fetch,
  lockOptions,
  ownerProvider = defaultCloudflareOwnerProvider,
  bootstrapReceipt,
  migrationReceipt,
}) {
  try {
    if (migrationReceipt !== undefined && migrationReceipt !== null) {
      throw new CloudflarePagesUploaderError(
        "PAGES_OWNER_MIGRATION_FORBIDDEN",
        "정상 uploader는 writer owner 이전을 수행하지 않습니다. 새 Pages project/base URL을 사용하세요.",
        { state: "config_invalid" },
      );
    }
    const resolvedProjectRoot = path.resolve(projectRoot);
    const resolvedExportRoot = resolveInside(
      resolvedProjectRoot,
      path.relative(resolvedProjectRoot, path.resolve(exportRoot)),
      "Wing export root",
    );
    const { config, runtime } = await cloudflarePagesContext({
      projectRoot: resolvedProjectRoot,
      runner,
      ownerProvider,
    });
    const resolvedBootstrapReceipt =
      await loadOptionalAuthorizationReceipt(
        config.bootstrapReceiptPath,
        bootstrapReceipt,
        "Cloudflare bootstrap receipt",
      );
    const namespace = createCloudflarePagesNamespace({
      publicBaseUrl: config.publicBaseUrl,
      projectKey,
      exportId,
    });
    const generated = await localExportAssets({
      exportRoot: resolvedExportRoot,
      namespace,
      config,
    });
    const publish = await withPagesPublishLock(
      config,
      async (lock) => {
        await assertNamespaceAvailable(fetchImpl, generated.assets);
        const remoteSnapshot = await remoteDeployIndex({
          projectRoot: resolvedProjectRoot,
          config,
          runtime,
          runner,
          fetchImpl,
          bootstrapReceipt: resolvedBootstrapReceipt,
        });
        await lock.assertOwned();
        const staged = await stageDeployment({
          projectRoot: resolvedProjectRoot,
          namespace,
          assets: generated.assets,
          oldIndex: remoteSnapshot.index,
          fetchImpl,
          config,
        });
        await lock.assertOwned();
        await assertNamespaceAvailable(fetchImpl, generated.assets);
        await assertRemoteIndexUnchanged({
          config,
          fetchImpl,
          snapshot: remoteSnapshot,
        });
        await lock.assertOwned();
        await runWrangler(
          runtime,
          [
            "pages",
            "deploy",
            staged.stagingRoot,
            "--project-name",
            config.pagesProject,
            "--branch",
            config.productionBranch,
            "--commit-dirty=true",
          ],
          {
            projectRoot: resolvedProjectRoot,
            runner,
            state: "upload_failed",
            failureCode: "PAGES_DEPLOY_FAILED",
          },
        );
        await lock.assertOwned();
        const verification = await verifyDeployment(
          fetchImpl,
          config,
          staged,
          generated.assets.length,
        );
        await lock.assertOwned();
        return {
          remoteSnapshot,
          staged,
          verification,
        };
      },
      lockOptions,
    );
    return {
      status: "completed",
      state: "completed",
      provider: "cloudflare-pages",
      pagesProject: config.pagesProject,
      publisherId: config.publisherId,
      writerOwnerDigest: config.writerOwnerDigest,
      generation: publish.staged.deployIndex.generation,
      projectKey: namespace.projectKey,
      exportId: namespace.exportId,
      namespace: namespace.namespace,
      namespaceUrl: namespace.namespaceUrl,
      assetCount: generated.assets.length,
      previousExportCount: publish.remoteSnapshot.index.exports.length,
      deployIndexSha256: publish.staged.deployIndexSha256,
      stagingRoot: publish.staged.stagingRoot,
      verification: publish.verification,
    };
  } catch (error) {
    throw uploaderError(
      error,
      "CLOUDFLARE_PAGES_UPLOAD_FAILED",
      "Cloudflare Pages Wing 업로드를 완료하지 못했습니다.",
      "failed",
    );
  }
}
