import { createHash, randomUUID } from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDER = "dmk-extractor";
const ADAPTER_ID = "DmkExtractorAdapter";
const EXPECTED_STAGE_ID = "G0A_SUPPLIER";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXPECTED_OUTPUT_TYPES = Object.freeze([
  "evidence.supplier_snapshot",
  "receipt.importer",
]);
const SUPPORTED_SCHEMA_VERSIONS = new Set(["1.0"]);
const REQUIRED_ARTIFACT_KINDS = new Set([
  "assembled_seller_detail_page",
  "browser_harness_recording",
  "product_thumbnail",
  "sanitized_public_reviews",
  "structured_product_page",
]);

export class DmkBundleImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DmkBundleImportError";
    this.code = code;
    this.details = details;
  }
}

function assertWorkOrder(workOrder, projectRef) {
  if (
    workOrder?.stage_id !== EXPECTED_STAGE_ID ||
    workOrder?.runner_contract?.adapter_id !== ADAPTER_ID ||
    workOrder?.runner_contract?.skill_id !== PROVIDER
  ) {
    throw new DmkBundleImportError(
      "WORK_ORDER_MISMATCH",
      "Dmk adapter에는 leased G0A_SUPPLIER/DmkExtractorAdapter WorkOrder가 필요합니다.",
    );
  }
  if (
    !workOrder.work_order_id ||
    !workOrder.project_id ||
    workOrder.project_id !== projectRef?.project_id ||
    workOrder.assigned_agent_session_id !==
      projectRef?.agent_session_id
  ) {
    throw new DmkBundleImportError(
      "WORK_ORDER_SESSION_MISMATCH",
      "WorkOrder project와 assigned agent session이 projectRef와 정확히 일치해야 합니다.",
    );
  }
  if (
    !SHA256_PATTERN.test(String(workOrder.input_set_digest ?? "")) ||
    typeof workOrder.fencing_token !== "string" ||
    workOrder.fencing_token.length === 0 ||
    !Number.isSafeInteger(workOrder.attempt) ||
    workOrder.attempt < 1
  ) {
    throw new DmkBundleImportError(
      "WORK_ORDER_LEASE_PROOF_REQUIRED",
      "WorkOrder에는 exact input digest, fencing token, attempt가 필요합니다.",
    );
  }
  const expected = [...EXPECTED_OUTPUT_TYPES].sort();
  const actual = [...(workOrder.expected_output_types ?? [])].sort();
  if (
    expected.length !== actual.length ||
    expected.some((type, index) => type !== actual[index])
  ) {
    throw new DmkBundleImportError(
      "WORK_ORDER_OUTPUT_MISMATCH",
      "WorkOrder의 expected output type이 dmk importer 계약과 다릅니다.",
      { expected, actual },
    );
  }
  if (
    !Array.isArray(workOrder.input_artifacts) ||
    workOrder.input_artifacts.length !== 1 ||
    workOrder.input_artifacts[0]?.type !== "project.intake"
  ) {
    throw new DmkBundleImportError(
      "WORK_ORDER_INPUT_MISMATCH",
      "G0A_SUPPLIER WorkOrder는 exact project.intake 하나를 입력으로 가져야 합니다.",
    );
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readJson(filePath, code) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    throw new DmkBundleImportError(code, `필수 JSON을 읽을 수 없습니다: ${filePath}`, {
      cause: error?.code,
      path: filePath,
    });
  }

  try {
    return JSON.parse(source);
  } catch {
    throw new DmkBundleImportError(code, `올바른 JSON이 아닙니다: ${filePath}`, {
      path: filePath,
    });
  }
}

function assertProductId(actual, expected, locator) {
  if (String(actual ?? "") !== expected) {
    throw new DmkBundleImportError(
      "PRODUCT_ID_MISMATCH",
      `${locator}의 상품번호가 기대값과 다릅니다.`,
      {
        expected_product_id: expected,
        actual_product_id: String(actual ?? ""),
        locator,
      },
    );
  }
}

export function canonicalizeDmkSupplierUrl(
  value,
  expectedProductId = null,
) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DmkBundleImportError(
      "SUPPLIER_URL_REQUIRED",
      "공급처 URL은 비어 있을 수 없습니다.",
    );
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new DmkBundleImportError(
      "INVALID_SUPPLIER_URL",
      "공급처 URL 형식이 올바르지 않습니다.",
      { supplier_url: value },
    );
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    hostname !== "domeggook.com"
  ) {
    throw new DmkBundleImportError(
      "INVALID_SUPPLIER_URL",
      "도매꾹 상품 URL만 공급처 URL로 사용할 수 있습니다.",
      { supplier_url: value },
    );
  }
  const pathProductId = parsed.pathname
    .split("/")
    .filter(Boolean)
    .findLast((segment) => /^\d+$/.test(segment));
  const queryProductId = [
    "itemNo",
    "item_no",
    "goodsNo",
    "goods_no",
    "productId",
    "product_id",
  ]
    .map((key) => parsed.searchParams.get(key))
    .find((candidate) => /^\d+$/.test(String(candidate ?? "")));
  const productId = String(pathProductId ?? queryProductId ?? "");
  if (
    !productId ||
    (expectedProductId !== null &&
      productId !== String(expectedProductId))
  ) {
    throw new DmkBundleImportError(
      "SUPPLIER_URL_PRODUCT_MISMATCH",
      "공급처 URL의 상품번호가 요청 상품번호와 일치하지 않습니다.",
      {
        expected_product_id:
          expectedProductId === null
            ? null
            : String(expectedProductId),
        actual_product_id: productId || null,
        supplier_url: value,
      },
    );
  }
  return {
    product_id: productId,
    canonical_url: `https://domeggook.com/${productId}`,
  };
}

function resolveArtifactPath(bundleRoot, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath)
  ) {
    throw new DmkBundleImportError(
      "INVALID_ARTIFACT_PATH",
      "manifest artifact 경로는 POSIX 상대 경로여야 합니다.",
      { path: relativePath },
    );
  }

  const normalized = path.posix.normalize(relativePath);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new DmkBundleImportError(
      "INVALID_ARTIFACT_PATH",
      "manifest artifact 경로가 bundle 밖을 가리킵니다.",
      { path: relativePath },
    );
  }

  const absolutePath = path.resolve(bundleRoot, ...normalized.split("/"));
  const relativeToRoot = path.relative(bundleRoot, absolutePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new DmkBundleImportError(
      "INVALID_ARTIFACT_PATH",
      "manifest artifact 경로가 bundle 밖을 가리킵니다.",
      { path: relativePath },
    );
  }
  return absolutePath;
}

function mimeFromPath(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".json":
      return "application/json";
    case ".jsonl":
      return "application/x-ndjson";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

async function validateArtifact(bundleRoot, entry) {
  if (!entry || typeof entry !== "object") {
    throw new DmkBundleImportError(
      "INVALID_MANIFEST",
      "manifest artifact 항목이 객체가 아닙니다.",
    );
  }
  if (!entry.kind || !Number.isSafeInteger(entry.size_bytes)) {
    throw new DmkBundleImportError(
      "INVALID_MANIFEST",
      "manifest artifact의 kind 또는 size_bytes가 없습니다.",
      { path: entry.path },
    );
  }
  if (!/^[a-f0-9]{64}$/i.test(String(entry.sha256 ?? ""))) {
    throw new DmkBundleImportError(
      "INVALID_MANIFEST",
      "manifest artifact의 SHA-256 형식이 잘못되었습니다.",
      { path: entry.path },
    );
  }

  const absolutePath = resolveArtifactPath(bundleRoot, entry.path);
  let fileInfo;
  try {
    const linkInfo = await lstat(absolutePath);
    if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) {
      throw new DmkBundleImportError(
        "INVALID_ARTIFACT_FILE",
        "artifact는 bundle 내부의 일반 파일이어야 합니다.",
        { path: entry.path },
      );
    }
    fileInfo = await stat(absolutePath);
  } catch (error) {
    if (error instanceof DmkBundleImportError) throw error;
    throw new DmkBundleImportError(
      "ARTIFACT_MISSING",
      "manifest에 기록된 artifact 파일이 없습니다.",
      { path: entry.path },
    );
  }

  const bytes = await readFile(absolutePath);
  const actualSha256 = sha256(bytes);
  if (
    fileInfo.size !== entry.size_bytes ||
    actualSha256 !== entry.sha256.toLowerCase()
  ) {
    throw new DmkBundleImportError(
      "ARTIFACT_INTEGRITY_MISMATCH",
      "artifact 크기 또는 SHA-256이 manifest와 다릅니다.",
      {
        path: entry.path,
        expected_size_bytes: entry.size_bytes,
        actual_size_bytes: fileInfo.size,
        expected_sha256: entry.sha256.toLowerCase(),
        actual_sha256: actualSha256,
      },
    );
  }

  return {
    source_path: entry.path,
    kind: entry.kind,
    object_sha256: actualSha256,
    bytes: fileInfo.size,
    mime: mimeFromPath(entry.path),
    rights: "evidence_reference",
    rights_decision_id: null,
    production_use_allowed: false,
  };
}

function sourceRightsObservation(entry, page, index) {
  const raw =
    entry?.rights_observation ??
    entry?.rights?.observation ??
    entry?.rights ??
    page?.image_usage_observation ??
    null;
  const text =
    raw === null || raw === undefined
      ? null
      : typeof raw === "string"
        ? raw
        : JSON.stringify(raw);
  const locator =
    entry?.rights_observation !== undefined ||
    entry?.rights !== undefined
      ? `manifest.json#/artifacts/${index}/rights`
      : "page.json#/image_usage_observation";
  return { text, locator };
}

function supplierMemberId(file) {
  const pathDigest = sha256(Buffer.from(file.source_path, "utf8")).slice(
    0,
    8,
  );
  return `supplier-file-${file.object_sha256.slice(0, 12)}-${pathDigest}`;
}

export async function importDmkBundle({
  bundleRoot,
  expectedProductId,
  expectedSupplierUrl,
}) {
  const root = path.resolve(String(bundleRoot ?? ""));
  const expected = String(expectedProductId ?? "").trim();
  if (!expected) {
    throw new DmkBundleImportError(
      "EXPECTED_PRODUCT_ID_REQUIRED",
      "expectedProductId가 필요합니다.",
    );
  }
  const requestedSupplier = canonicalizeDmkSupplierUrl(
    expectedSupplierUrl,
    expected,
  );

  const manifestPath = path.join(root, "manifest.json");
  let manifestBytes;
  try {
    manifestBytes = await readFile(manifestPath);
  } catch {
    throw new DmkBundleImportError(
      "PARTIAL_BUNDLE",
      "정상 manifest.json이 없는 partial bundle은 가져올 수 없습니다.",
      { bundle_root: root },
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new DmkBundleImportError(
      "PARTIAL_BUNDLE",
      "manifest.json이 올바른 JSON이 아니므로 partial bundle로 처리합니다.",
      { bundle_root: root },
    );
  }

  if (
    manifest.artifact_type !== "dmk_extractor_snapshot" ||
    !SUPPORTED_SCHEMA_VERSIONS.has(String(manifest.schema_version)) ||
    manifest.browser_mode !== "isolated_headless_browser_harness" ||
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length === 0
  ) {
    throw new DmkBundleImportError(
      "INVALID_MANIFEST",
      "지원되는 dmk-extractor 정상 manifest 계약이 아닙니다.",
      {
        artifact_type: manifest.artifact_type,
        schema_version: manifest.schema_version,
        browser_mode: manifest.browser_mode,
      },
    );
  }

  assertProductId(manifest.product_id, expected, "manifest.json#/product_id");
  const canonicalSupplier = canonicalizeDmkSupplierUrl(
    manifest.canonical_supplier_url,
    expected,
  );
  if (
    canonicalSupplier.canonical_url !==
    requestedSupplier.canonical_url
  ) {
    throw new DmkBundleImportError(
      "SUPPLIER_URL_MISMATCH",
      "bundle의 canonical 공급처 URL이 요청 공급처 URL과 일치하지 않습니다.",
      {
        expected_supplier_url: requestedSupplier.canonical_url,
        actual_supplier_url: canonicalSupplier.canonical_url,
      },
    );
  }
  for (const [locator, value] of [
    ["manifest.json#/requested_url", manifest.requested_url],
    ["manifest.json#/final_url", manifest.final_url],
  ]) {
    const observed = canonicalizeDmkSupplierUrl(value, expected);
    if (observed.canonical_url !== canonicalSupplier.canonical_url) {
      throw new DmkBundleImportError(
        "SUPPLIER_URL_MISMATCH",
        `${locator}이 canonical 공급처 URL과 일치하지 않습니다.`,
        { locator, supplier_url: value },
      );
    }
  }

  const paths = new Set();
  const kinds = new Set();
  const files = [];
  for (const entry of manifest.artifacts) {
    if (paths.has(entry?.path)) {
      throw new DmkBundleImportError(
        "INVALID_MANIFEST",
        "manifest에 중복 artifact 경로가 있습니다.",
        { path: entry?.path },
      );
    }
    paths.add(entry?.path);
    kinds.add(entry?.kind);
    files.push(await validateArtifact(root, entry));
  }

  const missingKinds = [...REQUIRED_ARTIFACT_KINDS].filter(
    (kind) => !kinds.has(kind),
  );
  if (missingKinds.length > 0) {
    throw new DmkBundleImportError(
      "INCOMPLETE_BUNDLE",
      "dmk portable bundle 필수 artifact가 없습니다.",
      { missing_kinds: missingKinds },
    );
  }

  const page = await readJson(path.join(root, "page.json"), "INVALID_PAGE");
  const reviews = await readJson(
    path.join(root, "reviews", "reviews.json"),
    "INVALID_REVIEWS",
  );
  assertProductId(page.product_id, expected, "page.json#/product_id");
  assertProductId(
    reviews.product_id,
    expected,
    "reviews/reviews.json#/product_id",
  );
  for (const [locator, value] of [
    ["page.json#/requested_url", page.requested_url],
    ["page.json#/final_url", page.final_url],
    [
      "reviews/reviews.json#/source_page_url",
      reviews.source_page_url,
    ],
  ]) {
    const observed = canonicalizeDmkSupplierUrl(value, expected);
    if (observed.canonical_url !== canonicalSupplier.canonical_url) {
      throw new DmkBundleImportError(
        "SUPPLIER_URL_MISMATCH",
        `${locator}이 canonical 공급처 URL과 일치하지 않습니다.`,
        { locator, supplier_url: value },
      );
    }
  }

  files.forEach((file, index) => {
    file.member_id = supplierMemberId(file);
    file.source_provider = PROVIDER;
    file.rights_observation = sourceRightsObservation(
      manifest.artifacts[index],
      page,
      index,
    );
    const isIdentityMedia = file.kind === "product_thumbnail";
    file.source_kind = "supplier_same_sku";
    file.same_sku_verified = true;
    file.classification = isIdentityMedia
      ? "identity_reference"
      : "evidence_reference";
  });

  const sourceManifestSha256 = sha256(manifestBytes);
  const digest12 = sourceManifestSha256.slice(0, 12);
  const artifact = {
    schema_version: "2.0-draft",
    artifact_id: `art-supplier-${digest12}`,
    artifact_type: "supplier.snapshot",
    source_provider: PROVIDER,
    product_id: expected,
    requested_supplier_url: requestedSupplier.canonical_url,
    canonical_supplier_url: canonicalSupplier.canonical_url,
    manifest_sha256: sourceManifestSha256,
    source_bundle_path: root,
    files,
    member_ids: files.map((file) => file.member_id),
    validation_receipt_ids: [`validation-dmk-bundle-${digest12}`],
    consumers: ["G0R_RIGHTS"],
  };
  const normalizedManifestSha256 = sha256(
    Buffer.from(JSON.stringify(artifact), "utf8"),
  );
  const adapterSha256 = sha256(
    await readFile(fileURLToPath(import.meta.url)),
  );

  return {
    schema_version: "2.0-draft",
    stage_id: "G0_SUPPLIER",
    status: "completed",
    provider_status: "VALID",
    outputs: [artifact],
    importer_receipt: {
      schema_version: "2.0-draft",
      importer_receipt_id: `import-dmk-${digest12}`,
      provider: PROVIDER,
      provider_version: String(manifest.schema_version),
      provider_skill_sha256: null,
      source_bundle_path: root,
      source_manifest_sha256: sourceManifestSha256,
      importer_name: "DmkExtractorAdapter",
      importer_code_sha256: adapterSha256,
      normalized_artifact_id: artifact.artifact_id,
      normalized_manifest_sha256: normalizedManifestSha256,
      provider_status: "VALID",
      requested_supplier_url: requestedSupplier.canonical_url,
      canonical_supplier_url: canonicalSupplier.canonical_url,
      provider_warnings: [
        {
          code: "RIGHTS_NOT_PROVEN",
          severity: "warning",
          source_locator: "page.json#/image_usage_observation",
          observation: page.image_usage_observation ?? null,
        },
      ],
      file_mappings: files.map((file) => ({
        source_path: file.source_path,
        object_sha256: file.object_sha256,
        normalized_member_id: file.member_id,
        rights: file.rights,
        production_use_allowed: false,
      })),
      validation_receipt_ids: artifact.validation_receipt_ids,
      imported_at: new Date().toISOString(),
    },
  };
}

export function buildDmkRightsSubject(imported) {
  const supplier = imported?.outputs?.[0];
  const receipt = imported?.importer_receipt;
  if (!supplier || !receipt) {
    throw new DmkBundleImportError(
      "INVALID_IMPORTED_RESULT",
      "검증된 dmk importer 결과가 필요합니다.",
    );
  }
  const sourceBundlePath = String(
    supplier.source_bundle_path ?? "",
  ).replaceAll("\\", "/");
  const materializedInProject =
    sourceBundlePath.length > 0 &&
    !path.posix.isAbsolute(sourceBundlePath) &&
    !/^[A-Za-z]:/.test(sourceBundlePath) &&
    path.posix.normalize(sourceBundlePath) === sourceBundlePath &&
    sourceBundlePath
      .split("/")
      .every((part) => part && part !== "." && part !== "..");
  const memberManifest = materializedInProject
    ? {
        schema_version: "1.0",
        policy: "materialized",
        members: supplier.files
          .map((file) => ({
            member_id: file.member_id,
            root_id: "project",
            locator: path.posix.join(
              sourceBundlePath,
              file.source_path,
            ),
            sha256: file.object_sha256,
            size_bytes: file.bytes,
          }))
          .sort((left, right) =>
            left.member_id.localeCompare(right.member_id),
          ),
      }
    : {
        schema_version: "1.0",
        policy: "inline_or_virtual",
        members: [],
      };
  return {
    artifact_id: supplier.artifact_id,
    type: "evidence.supplier_snapshot",
    manifest_sha256: receipt.normalized_manifest_sha256,
    member_ids: [...supplier.member_ids],
    member_manifest: memberManifest,
    payload: structuredClone(supplier),
  };
}

function withBundleLocator(imported, locator) {
  const relocated = structuredClone(imported);
  relocated.outputs[0].source_bundle_path = locator;
  relocated.importer_receipt.source_bundle_path = locator;
  relocated.importer_receipt.normalized_manifest_sha256 = sha256(
    Buffer.from(JSON.stringify(relocated.outputs[0]), "utf8"),
  );
  return relocated;
}

export async function materializeDmkBundle({
  bundleRoot,
  projectRoot,
  expectedProductId,
  expectedSupplierUrl,
  captureId,
}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(captureId || ""))) {
    throw new DmkBundleImportError(
      "INVALID_CAPTURE_ID",
      "captureId에는 영문자, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.",
    );
  }
  const source = path.resolve(String(bundleRoot ?? ""));
  const root = path.resolve(String(projectRoot ?? ""));
  const relativeLocator = path.posix.join(
    ".detail-page",
    "evidence",
    "supplier",
    "dmk",
    captureId,
  );
  const destination = path.resolve(
    root,
    ...relativeLocator.split("/"),
  );
  const relativeToProject = path.relative(root, destination);
  if (
    relativeToProject.startsWith("..") ||
    path.isAbsolute(relativeToProject)
  ) {
    throw new DmkBundleImportError(
      "INVALID_MATERIALIZATION_TARGET",
      "bundle 대상 경로가 projectRoot 밖을 가리킵니다.",
    );
  }

  const sourceImport = await importDmkBundle({
    bundleRoot: source,
    expectedProductId,
    expectedSupplierUrl,
  });
  try {
    await access(destination);
    const existing = await importDmkBundle({
      bundleRoot: destination,
      expectedProductId,
      expectedSupplierUrl,
    });
    if (
      existing.importer_receipt.source_manifest_sha256 !==
      sourceImport.importer_receipt.source_manifest_sha256
    ) {
      throw new DmkBundleImportError(
        "MATERIALIZATION_CONFLICT",
        "같은 captureId에 다른 source bundle이 이미 있습니다.",
        { destination },
      );
    }
    return withBundleLocator(existing, relativeLocator);
  } catch (error) {
    if (
      error instanceof DmkBundleImportError &&
      error.code === "MATERIALIZATION_CONFLICT"
    ) {
      throw error;
    }
    if (error?.code !== "ENOENT") throw error;
  }

  const parent = path.dirname(destination);
  const staging = path.join(
    parent,
    `.import-${captureId}-${randomUUID()}`,
  );
  await mkdir(parent, { recursive: true });
  try {
    await cp(source, staging, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    const staged = await importDmkBundle({
      bundleRoot: staging,
      expectedProductId,
      expectedSupplierUrl,
    });
    if (
      staged.importer_receipt.source_manifest_sha256 !==
      sourceImport.importer_receipt.source_manifest_sha256
    ) {
      throw new DmkBundleImportError(
        "MATERIALIZATION_INTEGRITY_MISMATCH",
        "복사된 bundle의 manifest hash가 원본과 다릅니다.",
      );
    }
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  const materialized = await importDmkBundle({
    bundleRoot: destination,
    expectedProductId,
    expectedSupplierUrl,
  });
  return withBundleLocator(materialized, relativeLocator);
}

export function buildDmkWorkflowEnvelope({
  imported,
  workOrder,
  projectRef,
}) {
  assertWorkOrder(workOrder, projectRef);
  const supplier = imported?.outputs?.[0];
  const receipt = imported?.importer_receipt;
  const rightsSubject = buildDmkRightsSubject(imported);
  const receiptSha256 = sha256(
    Buffer.from(JSON.stringify(receipt), "utf8"),
  );
  return {
    project_ref: structuredClone(projectRef),
    producer_agent_session_id:
      workOrder.assigned_agent_session_id,
    input_set_digest: workOrder.input_set_digest,
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: [
      {
        ...rightsSubject,
      },
      {
        artifact_id: receipt.importer_receipt_id,
        type: "receipt.importer",
        manifest_sha256: receiptSha256,
        member_ids: ["importer-receipt.json"],
        payload: structuredClone(receipt),
      },
    ],
    execution_receipt: {
      execution_id: `execution-${workOrder.work_order_id}`,
      adapter_id: ADAPTER_ID,
      adapter_version: "1.0.0",
      adapter_code_sha256: receipt.importer_code_sha256,
    },
  };
}
