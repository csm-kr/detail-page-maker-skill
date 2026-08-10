import { createHash, randomUUID } from "node:crypto";
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  importCoupangBundle,
} from "../market-evidence.mjs";

const ADAPTER_ID = "CoupangExtractorAdapter";
const EXPECTED_STAGE_ID = "G1A_MARKET";
const EXPECTED_OUTPUT_TYPES = Object.freeze([
  "evidence.market_snapshot",
  "receipt.importer",
]);
const CAPTURE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class CoupangBundleAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CoupangBundleAdapterError";
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function receiptBytes(receipt) {
  return Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

function canonicalRelativeLocator(value, field) {
  const locator = String(value ?? "").replaceAll("\\", "/");
  if (
    !locator ||
    path.posix.isAbsolute(locator) ||
    /^[A-Za-z]:/.test(locator) ||
    path.posix.normalize(locator) !== locator ||
    locator.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new CoupangBundleAdapterError(
      "INVALID_MATERIALIZED_LOCATOR",
      `${field}는 project 내부 canonical POSIX 상대 경로여야 합니다.`,
      { field, locator: value ?? null },
    );
  }
  return locator;
}

function resolveProjectLocator(projectRoot, locator) {
  const root = path.resolve(String(projectRoot ?? ""));
  const canonical = canonicalRelativeLocator(locator, "locator");
  const target = path.resolve(root, ...canonical.split("/"));
  const relative = path.relative(root, target);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new CoupangBundleAdapterError(
      "MATERIALIZATION_PATH_ESCAPE",
      "materialized locator가 projectRoot 밖을 가리킵니다.",
      { locator: canonical },
    );
  }
  return target;
}

function assertWorkOrder(workOrder, projectRef) {
  if (
    workOrder?.stage_id !== EXPECTED_STAGE_ID ||
    workOrder?.runner_contract?.adapter_id !== ADAPTER_ID ||
    workOrder?.runner_contract?.skill_id !== "coupang-extractor"
  ) {
    throw new CoupangBundleAdapterError(
      "WORK_ORDER_MISMATCH",
      "Coupang adapter에는 leased G1A_MARKET/CoupangExtractorAdapter WorkOrder가 필요합니다.",
    );
  }
  if (
    !workOrder.work_order_id ||
    !workOrder.project_id ||
    workOrder.project_id !== projectRef?.project_id ||
    workOrder.assigned_agent_session_id !==
      projectRef?.agent_session_id
  ) {
    throw new CoupangBundleAdapterError(
      "WORK_ORDER_SESSION_MISMATCH",
      "WorkOrder project와 assigned agent session이 projectRef와 정확히 일치해야 합니다.",
    );
  }
  if (
    !SHA256_PATTERN.test(String(workOrder.input_set_digest ?? "")) ||
    !workOrder.fencing_token ||
    !Number.isSafeInteger(workOrder.attempt) ||
    workOrder.attempt < 1
  ) {
    throw new CoupangBundleAdapterError(
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
    throw new CoupangBundleAdapterError(
      "WORK_ORDER_OUTPUT_MISMATCH",
      "WorkOrder expected output type이 Coupang importer 계약과 다릅니다.",
      { expected, actual },
    );
  }
  if (
    !Array.isArray(workOrder.input_artifacts) ||
    workOrder.input_artifacts.length !== 1 ||
    workOrder.input_artifacts[0]?.type !==
      "market.competitor_selection"
  ) {
    throw new CoupangBundleAdapterError(
      "WORK_ORDER_INPUT_MISMATCH",
      "G1A_MARKET WorkOrder는 exact market.competitor_selection 하나를 입력으로 가져야 합니다.",
    );
  }
}

function assertImportedResult(imported) {
  const market = imported?.outputs?.[0];
  const receipt = imported?.importer_receipt;
  if (
    imported?.provider_status !== "READY" ||
    imported?.status !== "completed"
  ) {
    throw new CoupangBundleAdapterError(
      "COUPANG_PROVIDER_NOT_READY",
      "PARTIAL/HOLD Coupang bundle은 persistent G1A 결과로 commit할 수 없습니다.",
      {
        provider_status: imported?.provider_status ?? null,
        status: imported?.status ?? null,
      },
    );
  }
  if (
    !market ||
    market.artifact_type !== "market.competitor_evidence" ||
    market.rights !== "research_reference_only" ||
    market.production_use_allowed !== false ||
    !receipt ||
    receipt.provider !== "coupang-extractor" ||
    receipt.importer_name !== ADAPTER_ID ||
    receipt.provider_status !== "READY" ||
    receipt.normalized_artifact_id !== market.artifact_id
  ) {
    throw new CoupangBundleAdapterError(
      "INVALID_IMPORTED_RESULT",
      "full validation을 통과한 READY Coupang importer 결과가 필요합니다.",
    );
  }
  const normalizedManifestSha256 = sha256(canonicalJson(market));
  if (
    receipt.normalized_manifest_sha256 !==
    normalizedManifestSha256
  ) {
    throw new CoupangBundleAdapterError(
      "NORMALIZED_MANIFEST_MISMATCH",
      "Coupang normalized artifact가 importer receipt와 다릅니다.",
      {
        expected: receipt.normalized_manifest_sha256,
        actual: normalizedManifestSha256,
      },
    );
  }
  const mappings = new Map(
    (receipt.file_mappings ?? []).map((mapping) => [
      mapping.source_path,
      mapping,
    ]),
  );
  if (
    !Array.isArray(market.files) ||
    market.files.length === 0 ||
    mappings.size !== market.files.length ||
    market.files.some((file) => {
      const mapping = mappings.get(file.source_path);
      return (
        !mapping ||
        mapping.object_sha256 !== file.object_sha256 ||
        mapping.production_use_allowed !== false ||
        mapping.rights !== "research_reference_only"
      );
    })
  ) {
    throw new CoupangBundleAdapterError(
      "IMPORTER_FILE_MAPPING_MISMATCH",
      "ImporterReceipt가 검증된 market file 전부를 정확히 매핑해야 합니다.",
    );
  }
  return { market, receipt };
}

function relocatedImport(imported, materialization) {
  const relocated = structuredClone(imported);
  relocated.outputs[0].source_bundle_path =
    materialization.bundle_locator;
  relocated.importer_receipt.source_bundle_path =
    materialization.bundle_locator;
  relocated.importer_receipt.normalized_manifest_sha256 = sha256(
    canonicalJson(relocated.outputs[0]),
  );
  relocated.materialization = structuredClone(materialization);
  return relocated;
}

function materializationBase(captureId) {
  if (!CAPTURE_ID_PATTERN.test(String(captureId ?? ""))) {
    throw new CoupangBundleAdapterError(
      "INVALID_CAPTURE_ID",
      "captureId에는 영문자, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.",
    );
  }
  return path.posix.join(
    ".detail-page",
    "evidence",
    "market",
    "coupang",
    String(captureId),
  );
}

async function buildMaterialization({
  projectRoot,
  baseLocator,
  imported,
  receiptLocator,
  adapterCodeSha256,
}) {
  const bundleLocator = path.posix.join(baseLocator, "bundle");
  const manifestLocator = path.posix.join(
    bundleLocator,
    "manifest.json",
  );
  const manifestPath = resolveProjectLocator(
    projectRoot,
    manifestLocator,
  );
  const manifestInfo = await lstat(manifestPath);
  if (manifestInfo.isSymbolicLink() || !manifestInfo.isFile()) {
    throw new CoupangBundleAdapterError(
      "INVALID_MATERIALIZED_MANIFEST",
      "materialized manifest는 symlink가 아닌 regular file이어야 합니다.",
    );
  }
  const manifestBytes = await readFile(manifestPath);
  if (
    sha256(manifestBytes) !==
    imported.importer_receipt.source_manifest_sha256
  ) {
    throw new CoupangBundleAdapterError(
      "MATERIALIZATION_INTEGRITY_MISMATCH",
      "materialized manifest bytes가 importer source digest와 다릅니다.",
    );
  }
  return {
    schema_version: "1.0",
    adapter_code_sha256: adapterCodeSha256,
    base_locator: baseLocator,
    bundle_locator: bundleLocator,
    receipt_locator: receiptLocator,
    bundle_members: [
      {
        member_id: `market-manifest-${sha256(manifestBytes).slice(0, 16)}`,
        root_id: "project",
        locator: manifestLocator,
        sha256: sha256(manifestBytes),
        size_bytes: manifestInfo.size,
      },
      ...imported.outputs[0].files.map((file) => ({
        member_id:
          imported.importer_receipt.file_mappings.find(
            (mapping) =>
              mapping.source_path === file.source_path,
          )?.normalized_member_id ??
          `market-file-${file.object_sha256.slice(0, 16)}`,
        root_id: "project",
        locator: path.posix.join(
          bundleLocator,
          file.source_path,
        ),
        sha256: file.object_sha256,
        size_bytes: file.bytes,
      })),
    ].sort((left, right) =>
      left.member_id.localeCompare(right.member_id),
    ),
  };
}

function assertStoredReceipt(stored, imported) {
  const expected = imported.importer_receipt;
  const fields = [
    "importer_receipt_id",
    "provider",
    "provider_version",
    "source_bundle_path",
    "source_manifest_sha256",
    "importer_name",
    "importer_code_sha256",
    "normalized_artifact_id",
    "normalized_manifest_sha256",
    "provider_status",
    "selection_receipt_id",
    "candidate_set_digest",
  ];
  if (
    fields.some((field) => stored?.[field] !== expected?.[field]) ||
    canonicalJson(stored?.file_mappings ?? null) !==
      canonicalJson(expected?.file_mappings ?? null) ||
    canonicalJson(stored?.validation_receipt_ids ?? null) !==
      canonicalJson(expected?.validation_receipt_ids ?? null)
  ) {
    throw new CoupangBundleAdapterError(
      "MATERIALIZED_RECEIPT_CONFLICT",
      "기존 importer receipt가 현재 검증된 portable bundle과 다릅니다.",
    );
  }
}

async function attachReceiptMaterialization(
  projectRoot,
  relocated,
  receiptLocator,
  { allowExisting },
) {
  const receiptPath = resolveProjectLocator(projectRoot, receiptLocator);
  await mkdir(path.dirname(receiptPath), { recursive: true });
  let bytes;
  if (allowExisting) {
    let info;
    try {
      info = await lstat(receiptPath);
      bytes = await readFile(receiptPath);
    } catch (error) {
      throw new CoupangBundleAdapterError(
        "MATERIALIZED_RECEIPT_MISSING",
        "기존 materialized bundle의 importer receipt가 없습니다.",
        { cause: error?.code, receipt_locator: receiptLocator },
      );
    }
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new CoupangBundleAdapterError(
        "INVALID_MATERIALIZED_RECEIPT",
        "materialized importer receipt는 regular file이어야 합니다.",
      );
    }
    let stored;
    try {
      stored = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new CoupangBundleAdapterError(
        "INVALID_MATERIALIZED_RECEIPT",
        "materialized importer receipt JSON이 올바르지 않습니다.",
      );
    }
    assertStoredReceipt(stored, relocated);
    relocated.importer_receipt = stored;
  } else {
    bytes = receiptBytes(relocated.importer_receipt);
    await writeFile(receiptPath, bytes, { flag: "wx" });
  }
  relocated.materialization.receipt_member = {
    member_id: "importer-receipt.json",
    root_id: "project",
    locator: receiptLocator,
    sha256: sha256(bytes),
    size_bytes: bytes.length,
  };
  return relocated;
}

export async function materializeCoupangBundle({
  bundleRoot,
  projectRoot,
  selection,
  candidateId,
  captureId,
}) {
  const source = path.resolve(String(bundleRoot ?? ""));
  const project = path.resolve(String(projectRoot ?? ""));
  const adapterCodeSha256 = sha256(
    await readFile(fileURLToPath(import.meta.url)),
  );
  const baseLocator = materializationBase(captureId);
  const bundleLocator = path.posix.join(baseLocator, "bundle");
  const receiptLocator = path.posix.join(
    baseLocator,
    "importer-receipt.json",
  );
  const destination = resolveProjectLocator(project, bundleLocator);
  const sourceImport = await importCoupangBundle({
    bundleRoot: source,
    selection,
    candidateId,
  });
  assertImportedResult(sourceImport);

  let destinationExists = false;
  try {
    await access(destination);
    destinationExists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (!destinationExists) {
    const parent = path.dirname(destination);
    const staging = path.join(
      parent,
      `.bundle-${String(captureId)}-${randomUUID()}`,
    );
    await mkdir(parent, { recursive: true });
    try {
      await cp(source, staging, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      const staged = await importCoupangBundle({
        bundleRoot: staging,
        selection,
        candidateId,
      });
      assertImportedResult(staged);
      if (
        staged.importer_receipt.source_manifest_sha256 !==
        sourceImport.importer_receipt.source_manifest_sha256
      ) {
        throw new CoupangBundleAdapterError(
          "MATERIALIZATION_INTEGRITY_MISMATCH",
          "복사한 Coupang bundle의 source manifest가 원본과 다릅니다.",
        );
      }
      await rename(staging, destination);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  const materializedImport = await importCoupangBundle({
    bundleRoot: destination,
    selection,
    candidateId,
  });
  assertImportedResult(materializedImport);
  if (
    materializedImport.importer_receipt.source_manifest_sha256 !==
    sourceImport.importer_receipt.source_manifest_sha256
  ) {
    throw new CoupangBundleAdapterError(
      "MATERIALIZATION_CONFLICT",
      "같은 captureId에 다른 Coupang source bundle이 이미 있습니다.",
      { bundle_locator: bundleLocator },
    );
  }
  const materialization = await buildMaterialization({
    projectRoot: project,
    baseLocator,
    imported: materializedImport,
    receiptLocator,
    adapterCodeSha256,
  });
  const relocated = relocatedImport(
    materializedImport,
    materialization,
  );
  return attachReceiptMaterialization(
    project,
    relocated,
    receiptLocator,
    { allowExisting: destinationExists },
  );
}

export function buildCoupangWorkflowEnvelope({
  imported,
  workOrder,
  projectRef,
}) {
  assertWorkOrder(workOrder, projectRef);
  const { market, receipt } = assertImportedResult(imported);
  const materialization = imported?.materialization;
  if (
    materialization?.schema_version !== "1.0" ||
    !SHA256_PATTERN.test(
      String(materialization.adapter_code_sha256 ?? ""),
    ) ||
    !Array.isArray(materialization.bundle_members) ||
    materialization.bundle_members.length !==
      market.files.length + 1 ||
    !materialization.receipt_member
  ) {
    throw new CoupangBundleAdapterError(
      "MATERIALIZED_IMPORT_REQUIRED",
      "G1A persistent commit에는 bundle 전체와 importer receipt의 materialized member record가 필요합니다.",
    );
  }
  const expectedReceiptBytes = receiptBytes(receipt);
  if (
    materialization.receipt_member.sha256 !==
      sha256(expectedReceiptBytes) ||
    materialization.receipt_member.size_bytes !==
      expectedReceiptBytes.length
  ) {
    throw new CoupangBundleAdapterError(
      "MATERIALIZED_RECEIPT_MISMATCH",
      "importer receipt payload와 materialized receipt bytes가 다릅니다.",
    );
  }
  const bundleMemberIds = materialization.bundle_members.map(
    (member) => member.member_id,
  );
  const receiptMember = structuredClone(
    materialization.receipt_member,
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
        artifact_id: market.artifact_id,
        type: "evidence.market_snapshot",
        manifest_sha256: receipt.normalized_manifest_sha256,
        member_ids: bundleMemberIds,
        member_manifest: {
          schema_version: "1.0",
          policy: "materialized",
          members: structuredClone(
            materialization.bundle_members,
          ),
        },
        payload: structuredClone(market),
      },
      {
        artifact_id: receipt.importer_receipt_id,
        type: "receipt.importer",
        manifest_sha256: receiptMember.sha256,
        member_ids: [receiptMember.member_id],
        member_manifest: {
          schema_version: "1.0",
          policy: "materialized",
          members: [receiptMember],
        },
        payload: structuredClone(receipt),
      },
    ],
    execution_receipt: {
      execution_id: `execution-${workOrder.work_order_id}`,
      adapter_id: ADAPTER_ID,
      adapter_version: "1.0.0",
      adapter_code_sha256:
        materialization.adapter_code_sha256,
    },
  };
}
