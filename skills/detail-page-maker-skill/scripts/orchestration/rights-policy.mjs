import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const RIGHTS_CLASSIFICATIONS = Object.freeze([
  "evidence_reference",
  "identity_reference",
  "production_licensed",
  "unknown",
]);

const CLASSIFICATION_SET = new Set(RIGHTS_CLASSIFICATIONS);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const COMMERCIAL_SCOPE_PATTERN =
  /(?:상업|광고|마케팅|판매\s*(?:목적|용|상세)|상세페이지|제작|commercial|advertis|marketing|production|product\s*detail)/i;
const PERMISSION_PATTERN =
  /(?:허용|승인|(?:사용|이용)\s*가능|permission|permit|authoriz|licen[cs](?:e|ed))/i;

export class RightsPolicyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RightsPolicyError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new RightsPolicyError(code, message, details);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nonEmpty(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("RIGHTS_FIELD_REQUIRED", `${field} is required`, { field });
  }
  return value.trim();
}

function exactSha256(value, field) {
  if (!SHA256_PATTERN.test(String(value || ""))) {
    fail("INVALID_RIGHTS_HASH", `${field} must be a SHA-256`, { field });
  }
  return String(value).toLowerCase();
}

function normalizeActor(actor, role) {
  return {
    agent_id: nonEmpty(actor?.agent_id, `${role}.agent_id`),
    agent_session_id: nonEmpty(
      actor?.agent_session_id,
      `${role}.agent_session_id`,
    ),
  };
}

function normalizePolicy(policy) {
  return {
    policy_id: nonEmpty(policy?.policy_id, "policy.policy_id"),
    policy_sha256: exactSha256(
      policy?.policy_sha256,
      "policy.policy_sha256",
    ),
  };
}

function normalizeObservation(file, memberId) {
  const observation = file?.rights_observation;
  const normalized =
    observation && typeof observation === "object"
      ? {
          text:
            observation.text === null
              ? null
              : nonEmpty(
                  observation.text,
                  `files[${memberId}].rights_observation.text`,
                ),
          locator: nonEmpty(
            observation.locator,
            `files[${memberId}].rights_observation.locator`,
          ),
        }
      : null;
  if (!normalized) {
    fail(
      "RIGHTS_OBSERVATION_REQUIRED",
      "Every supplier member needs its source rights observation and locator",
      { member_id: memberId },
    );
  }
  return normalized;
}

function normalizeSupplierArtifact(supplierArtifact) {
  if (!supplierArtifact || typeof supplierArtifact !== "object") {
    fail("INVALID_SUPPLIER_ARTIFACT", "supplier_artifact is required");
  }
  const payload =
    supplierArtifact.payload &&
    typeof supplierArtifact.payload === "object"
      ? supplierArtifact.payload
      : supplierArtifact;
  const artifactId = nonEmpty(
    supplierArtifact.artifact_id ?? payload.artifact_id,
    "supplier_artifact.artifact_id",
  );
  const artifactType =
    supplierArtifact.type ??
    payload.type ??
    payload.artifact_type;
  if (
    artifactType !== "evidence.supplier_snapshot" &&
    artifactType !== "supplier.snapshot"
  ) {
    fail(
      "INVALID_SUPPLIER_ARTIFACT",
      "Rights review accepts only a supplier snapshot artifact",
      { artifact_type: artifactType },
    );
  }
  const manifestSha256 = exactSha256(
    supplierArtifact.manifest_sha256 ?? payload.manifest_sha256,
    "supplier_artifact.manifest_sha256",
  );
  const memberIds = supplierArtifact.member_ids ?? payload.member_ids;
  const files = payload.files;
  if (
    !Array.isArray(memberIds) ||
    !Array.isArray(files) ||
    memberIds.length === 0 ||
    memberIds.length !== files.length
  ) {
    fail(
      "INVALID_SUPPLIER_ARTIFACT",
      "supplier snapshot files and member_ids must be non-empty and 1:1",
      {
        member_count: memberIds?.length ?? null,
        file_count: files?.length ?? null,
      },
    );
  }
  const normalizedMemberIds = memberIds.map((memberId) =>
    nonEmpty(memberId, "supplier_artifact.member_ids[]"),
  );
  if (new Set(normalizedMemberIds).size !== normalizedMemberIds.length) {
    fail(
      "DUPLICATE_SUPPLIER_MEMBER",
      "supplier snapshot member_ids must be unique",
    );
  }
  const normalizedFiles = files.map((file, index) => {
    const memberId = normalizedMemberIds[index];
    if (file?.member_id && file.member_id !== memberId) {
      fail(
        "SUPPLIER_MEMBER_ALIGNMENT_MISMATCH",
        "file.member_id must match member_ids at the same position",
        {
          expected_member_id: memberId,
          actual_member_id: file.member_id,
          index,
        },
      );
    }
    return {
      member_id: memberId,
      object_sha256: exactSha256(
        file?.object_sha256,
        `files[${memberId}].object_sha256`,
      ),
      source_path: nonEmpty(
        file?.source_path,
        `files[${memberId}].source_path`,
      ),
      kind: nonEmpty(file?.kind, `files[${memberId}].kind`),
      rights: file?.rights ?? null,
      rights_observation: normalizeObservation(file, memberId),
    };
  });
  return {
    artifact_id: artifactId,
    manifest_sha256: manifestSha256,
    source_provider: String(
      payload.source_provider ?? payload.provider ?? "",
    ).toLowerCase(),
    rights: payload.rights ?? null,
    member_ids: normalizedMemberIds,
    files: normalizedFiles,
  };
}

function isReviewAsset(file) {
  return (
    /review/i.test(file.kind) ||
    /(?:^|\/)reviews?(?:\/|\.|$)/i.test(file.source_path)
  );
}

function isResearchOnlyAsset(subject, file) {
  const classifications = [
    subject.rights,
    file.rights,
  ]
    .filter((value) => value !== null && value !== undefined)
    .map((value) =>
      typeof value === "string"
        ? value.toLowerCase()
        : canonicalJson(value).toLowerCase(),
    );
  return (
    subject.source_provider.includes("coupang") ||
    classifications.some((value) =>
      /research[_ -]?(?:reference[_ -]?)?only/.test(value),
    )
  );
}

function normalizeLicenseEvidence(value, memberId) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.exact_text !== "string" ||
    value.exact_text.trim().length === 0 ||
    typeof value.locator !== "string" ||
    value.locator.trim().length === 0 ||
    typeof value.evidence_artifact_id !== "string" ||
    value.evidence_artifact_id.trim().length === 0 ||
    !SHA256_PATTERN.test(String(value.evidence_sha256 || ""))
  ) {
    fail(
      "LICENSE_EVIDENCE_INSUFFICIENT",
      "production_licensed requires exact text, locator, evidence artifact, and SHA-256",
      { member_id: memberId },
    );
  }
  const exactText = value.exact_text.trim();
  const locator = value.locator.trim();
  if (
    !COMMERCIAL_SCOPE_PATTERN.test(exactText) ||
    !PERMISSION_PATTERN.test(exactText)
  ) {
    fail(
      "LICENSE_EVIDENCE_INSUFFICIENT",
      "License text must explicitly permit commercial/advertising/production use",
      { member_id: memberId, locator },
    );
  }
  return {
    exact_text: exactText,
    locator,
    evidence_artifact_id: value.evidence_artifact_id.trim(),
    evidence_sha256: String(value.evidence_sha256).toLowerCase(),
  };
}

function receiptUnsigned(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receipt_sha256;
  return copy;
}

function decisionReceipt({
  subject,
  file,
  decision,
  policy,
  producer,
  reviewer,
  reviewedAt,
}) {
  const classification = String(decision?.classification ?? "");
  if (!CLASSIFICATION_SET.has(classification)) {
    fail(
      "INVALID_RIGHTS_CLASSIFICATION",
      "Unsupported rights classification",
      { member_id: file.member_id, classification },
    );
  }
  if (typeof decision.production_use_allowed !== "boolean") {
    fail(
      "PRODUCTION_USE_DECISION_REQUIRED",
      "production_use_allowed must be an explicit boolean",
      { member_id: file.member_id },
    );
  }
  const promotionRequested =
    classification === "production_licensed" ||
    decision.production_use_allowed === true;
  if (isReviewAsset(file) && promotionRequested) {
    fail(
      "REVIEW_ASSET_PROMOTION_FORBIDDEN",
      "Supplier or competitor reviews can never become production assets",
      { member_id: file.member_id, source_path: file.source_path },
    );
  }
  if (isResearchOnlyAsset(subject, file) && promotionRequested) {
    fail(
      "RESEARCH_ASSET_PROMOTION_FORBIDDEN",
      "Coupang and research-only assets can never become production assets",
      { member_id: file.member_id, source_path: file.source_path },
    );
  }
  if (
    decision.production_use_allowed === true &&
    classification !== "production_licensed"
  ) {
    fail(
      "PRODUCTION_USE_CLASSIFICATION_MISMATCH",
      "Only production_licensed can set production_use_allowed=true",
      { member_id: file.member_id, classification },
    );
  }
  const licenseEvidence =
    classification === "production_licensed"
      ? normalizeLicenseEvidence(decision.license_evidence, file.member_id)
      : null;
  const core = {
    schema_version: "1.0",
    receipt_type: "RightsDecisionReceipt",
    supplier_artifact_id: subject.artifact_id,
    supplier_manifest_sha256: subject.manifest_sha256,
    member_id: file.member_id,
    object_sha256: file.object_sha256,
    source_path: file.source_path,
    source_kind: file.kind,
    source_provider: subject.source_provider,
    source_rights: file.rights ?? subject.rights,
    rights_observation: file.rights_observation,
    classification,
    production_use_allowed: decision.production_use_allowed,
    license_evidence: licenseEvidence,
    policy,
    producer,
    reviewer,
    reviewed_at: reviewedAt,
  };
  const receiptId = `rights-decision-${sha256(canonicalJson(core)).slice(
    0,
    24,
  )}`;
  const unsigned = { ...core, receipt_id: receiptId };
  return {
    ...unsigned,
    receipt_sha256: sha256(canonicalJson(unsigned)),
  };
}

function setUnsigned(rightsSet) {
  const copy = structuredClone(rightsSet);
  delete copy.artifact_id;
  delete copy.manifest_sha256;
  return copy;
}

export function createRightsDecisionSet({
  supplier_artifact: supplierArtifact,
  decisions,
  policy,
  producer,
  reviewer,
  reviewed_at: reviewedAt,
}) {
  const subject = normalizeSupplierArtifact(supplierArtifact);
  const policyLock = normalizePolicy(policy);
  const normalizedProducer = normalizeActor(producer, "producer");
  const normalizedReviewer = normalizeActor(reviewer, "reviewer");
  if (
    normalizedProducer.agent_session_id ===
    normalizedReviewer.agent_session_id
  ) {
    fail(
      "RIGHTS_SELF_REVIEW_FORBIDDEN",
      "Rights producer and reviewer sessions must be different",
    );
  }
  const timestamp = nonEmpty(reviewedAt, "reviewed_at");
  if (Number.isNaN(Date.parse(timestamp))) {
    fail("INVALID_RIGHTS_REVIEW_TIME", "reviewed_at must be an ISO date");
  }
  if (!Array.isArray(decisions)) {
    fail("RIGHTS_COVERAGE_MISMATCH", "decisions must cover every member");
  }
  const decisionsByMember = new Map();
  for (const decision of decisions) {
    const memberId = nonEmpty(decision?.member_id, "decisions[].member_id");
    if (decisionsByMember.has(memberId)) {
      fail(
        "DUPLICATE_RIGHTS_DECISION",
        "Each supplier member can have only one rights decision",
        { member_id: memberId },
      );
    }
    decisionsByMember.set(memberId, decision);
  }
  const missing = subject.member_ids.filter(
    (memberId) => !decisionsByMember.has(memberId),
  );
  const extra = [...decisionsByMember.keys()].filter(
    (memberId) => !subject.member_ids.includes(memberId),
  );
  if (
    missing.length > 0 ||
    extra.length > 0 ||
    decisions.length !== subject.member_ids.length
  ) {
    fail(
      "RIGHTS_COVERAGE_MISMATCH",
      "Rights decisions must cover supplier members exactly 1:1",
      { missing_member_ids: missing, extra_member_ids: extra },
    );
  }
  const receipts = subject.files
    .map((file) => {
      const decision = decisionsByMember.get(file.member_id);
      const decisionHash = exactSha256(
        decision?.object_sha256,
        `decisions[${file.member_id}].object_sha256`,
      );
      if (decisionHash !== file.object_sha256) {
        fail(
          "RIGHTS_MEMBER_HASH_MISMATCH",
          "Rights decision hash does not match the supplier member",
          {
            member_id: file.member_id,
            expected_sha256: file.object_sha256,
            received_sha256: decisionHash,
          },
        );
      }
      return decisionReceipt({
        subject,
        file,
        decision,
        policy: policyLock,
        producer: normalizedProducer,
        reviewer: normalizedReviewer,
        reviewedAt: timestamp,
      });
    })
    .sort((left, right) =>
      left.member_id.localeCompare(right.member_id, "en"),
    );
  const productionAllowedCount = receipts.filter(
    (receipt) => receipt.production_use_allowed,
  ).length;
  const productionRightsStatus =
    productionAllowedCount === 0
      ? "HOLD"
      : productionAllowedCount === receipts.length
        ? "ALLOWED"
        : "PARTIAL";
  const unsignedSet = {
    schema_version: "1.0",
    artifact_type: "decision.rights_set",
    supplier_artifact_id: subject.artifact_id,
    supplier_manifest_sha256: subject.manifest_sha256,
    policy: policyLock,
    producer: normalizedProducer,
    reviewer: normalizedReviewer,
    reviewed_at: timestamp,
    rights_decision_receipt_ids: receipts.map(
      (receipt) => receipt.receipt_id,
    ),
    rights_decision_receipts: receipts,
    summary: {
      member_count: receipts.length,
      reviewed_count: receipts.length,
      production_allowed_count: productionAllowedCount,
      production_blocked_count:
        receipts.length - productionAllowedCount,
    },
    production_rights_status: productionRightsStatus,
  };
  const manifestSha256 = sha256(canonicalJson(unsignedSet));
  return {
    ...unsignedSet,
    artifact_id: `rights-set-${manifestSha256.slice(0, 24)}`,
    manifest_sha256: manifestSha256,
  };
}

export function assertRightsDecisionSet(
  rightsSet,
  supplierArtifact = undefined,
) {
  if (
    !rightsSet ||
    rightsSet.artifact_type !== "decision.rights_set" ||
    !Array.isArray(rightsSet.rights_decision_receipts) ||
    rightsSet.rights_decision_receipts.length === 0
  ) {
    fail("INVALID_RIGHTS_SET", "decision.rights_set is invalid");
  }
  const actualSetHash = sha256(canonicalJson(setUnsigned(rightsSet)));
  if (
    rightsSet.manifest_sha256 !== actualSetHash ||
    rightsSet.artifact_id !==
      `rights-set-${actualSetHash.slice(0, 24)}`
  ) {
    fail(
      "RIGHTS_SET_HASH_MISMATCH",
      "Rights set content does not match its manifest hash",
    );
  }
  const receiptIds = [];
  const memberIds = [];
  const policy = normalizePolicy(rightsSet.policy);
  const producer = normalizeActor(rightsSet.producer, "producer");
  const reviewer = normalizeActor(rightsSet.reviewer, "reviewer");
  if (producer.agent_session_id === reviewer.agent_session_id) {
    fail(
      "RIGHTS_SELF_REVIEW_FORBIDDEN",
      "Rights producer and reviewer sessions must be different",
    );
  }
  for (const receipt of rightsSet.rights_decision_receipts) {
    const expectedReceiptSha = sha256(
      canonicalJson(receiptUnsigned(receipt)),
    );
    if (
      receipt.receipt_sha256 !== expectedReceiptSha ||
      receipt.receipt_id !==
        `rights-decision-${sha256(
          canonicalJson(
            (() => {
              const core = receiptUnsigned(receipt);
              delete core.receipt_id;
              return core;
            })(),
          ),
        ).slice(0, 24)}`
    ) {
      fail(
        "RIGHTS_RECEIPT_HASH_MISMATCH",
        "RightsDecisionReceipt hash does not match its contents",
        { member_id: receipt.member_id },
      );
    }
    if (
      receipt.supplier_artifact_id !== rightsSet.supplier_artifact_id ||
      receipt.supplier_manifest_sha256 !==
        rightsSet.supplier_manifest_sha256 ||
      canonicalJson(receipt.policy) !== canonicalJson(policy) ||
      canonicalJson(receipt.producer) !== canonicalJson(producer) ||
      canonicalJson(receipt.reviewer) !== canonicalJson(reviewer) ||
      receipt.reviewed_at !== rightsSet.reviewed_at
    ) {
      fail(
        "RIGHTS_RECEIPT_SET_MISMATCH",
        "Embedded receipt is not bound to the aggregate subject, actors, and policy",
        { member_id: receipt.member_id },
      );
    }
    if (
      !CLASSIFICATION_SET.has(receipt.classification) ||
      typeof receipt.production_use_allowed !== "boolean" ||
      (receipt.production_use_allowed === true &&
        receipt.classification !== "production_licensed")
    ) {
      fail(
        "INVALID_RIGHTS_CLASSIFICATION",
        "Embedded receipt has an invalid production classification",
        { member_id: receipt.member_id },
      );
    }
    if (receipt.classification === "production_licensed") {
      normalizeLicenseEvidence(
        receipt.license_evidence,
        receipt.member_id,
      );
    } else if (receipt.license_evidence !== null) {
      fail(
        "RIGHTS_RECEIPT_SET_MISMATCH",
        "Non-licensed receipt cannot carry license evidence",
        { member_id: receipt.member_id },
      );
    }
    const promotionRequested =
      receipt.classification === "production_licensed" ||
      receipt.production_use_allowed === true;
    if (
      promotionRequested &&
      (isReviewAsset({
        kind: receipt.source_kind,
        source_path: receipt.source_path,
      }) ||
        String(receipt.source_provider || "")
          .toLowerCase()
          .includes("coupang") ||
        /research[_ -]?(?:reference[_ -]?)?only/.test(
          typeof receipt.source_rights === "string"
            ? receipt.source_rights.toLowerCase()
            : String(
                canonicalJson(receipt.source_rights) ?? "",
              ).toLowerCase(),
        ))
    ) {
      fail(
        "RESEARCH_ASSET_PROMOTION_FORBIDDEN",
        "Review or research-only receipt cannot authorize production",
        { member_id: receipt.member_id },
      );
    }
    receiptIds.push(receipt.receipt_id);
    memberIds.push(receipt.member_id);
  }
  if (
    new Set(receiptIds).size !== receiptIds.length ||
    new Set(memberIds).size !== memberIds.length
  ) {
    fail(
      "DUPLICATE_RIGHTS_DECISION",
      "Rights set contains duplicate receipt or member identities",
    );
  }
  if (
    canonicalJson(receiptIds) !==
    canonicalJson(rightsSet.rights_decision_receipt_ids)
  ) {
    fail(
      "RIGHTS_RECEIPT_SET_MISMATCH",
      "Rights set receipt IDs do not match embedded receipts",
    );
  }
  const productionAllowedCount =
    rightsSet.rights_decision_receipts.filter(
      (receipt) => receipt.production_use_allowed,
    ).length;
  const expectedStatus =
    productionAllowedCount === 0
      ? "HOLD"
      : productionAllowedCount ===
          rightsSet.rights_decision_receipts.length
        ? "ALLOWED"
        : "PARTIAL";
  if (
    rightsSet.summary?.member_count !== memberIds.length ||
    rightsSet.summary?.reviewed_count !== memberIds.length ||
    rightsSet.summary?.production_allowed_count !==
      productionAllowedCount ||
    rightsSet.summary?.production_blocked_count !==
      memberIds.length - productionAllowedCount ||
    rightsSet.production_rights_status !== expectedStatus
  ) {
    fail(
      "RIGHTS_SUMMARY_MISMATCH",
      "Rights set summary does not match its member decisions",
    );
  }
  if (supplierArtifact) {
    const subject = normalizeSupplierArtifact(supplierArtifact);
    if (
      rightsSet.supplier_artifact_id !== subject.artifact_id ||
      rightsSet.supplier_manifest_sha256 !== subject.manifest_sha256
    ) {
      fail(
        "RIGHTS_SUBJECT_MISMATCH",
        "Rights set is not bound to the supplied exact artifact",
      );
    }
    const byMember = new Map(
      subject.files.map((file) => [file.member_id, file.object_sha256]),
    );
    if (
      byMember.size !== rightsSet.rights_decision_receipts.length ||
      rightsSet.rights_decision_receipts.some(
        (receipt) =>
          byMember.get(receipt.member_id) !== receipt.object_sha256,
      )
    ) {
      fail(
        "RIGHTS_COVERAGE_MISMATCH",
        "Rights set no longer covers the exact supplier members",
      );
    }
  }
  return rightsSet;
}

const RIGHTS_POLICY_CODE_SHA256 = sha256(
  readFileSync(fileURLToPath(import.meta.url)),
);

export function buildG0RRightsWorkflowEnvelope({
  rightsSet,
  workOrder,
  projectRef,
}) {
  assertRightsDecisionSet(rightsSet);
  if (
    workOrder?.stage_id !== "G0R_RIGHTS" ||
    workOrder?.assigned_agent_session_id !==
      projectRef?.agent_session_id ||
    workOrder.assigned_agent_session_id !==
      rightsSet.reviewer.agent_session_id
  ) {
    fail(
      "RIGHTS_WORK_ORDER_MISMATCH",
      "G0R work order must be assigned to the recorded reviewer session",
    );
  }
  const expectedOutputTypes = [
    ...(workOrder.expected_output_types ?? []),
  ].sort();
  if (
    expectedOutputTypes.length !== 1 ||
    expectedOutputTypes[0] !== "decision.rights_set"
  ) {
    fail(
      "RIGHTS_WORK_ORDER_OUTPUT_MISMATCH",
      "G0R work order must produce decision.rights_set",
    );
  }
  if (workOrder.gate_policy_id !== rightsSet.policy.policy_id) {
    fail(
      "RIGHTS_POLICY_MISMATCH",
      "G0R work order policy differs from the rights set policy",
    );
  }
  const supplierInput = (workOrder.input_artifacts ?? []).filter(
    (artifact) => artifact.type === "evidence.supplier_snapshot",
  );
  if (
    supplierInput.length !== 1 ||
    supplierInput[0].artifact_id !== rightsSet.supplier_artifact_id ||
    supplierInput[0].manifest_sha256 !==
      rightsSet.supplier_manifest_sha256
  ) {
    fail(
      "RIGHTS_SUBJECT_MISMATCH",
      "G0R work order must contain the exact reviewed supplier snapshot",
    );
  }
  return {
    project_ref: structuredClone(projectRef),
    producer_agent_session_id:
      workOrder.assigned_agent_session_id,
    input_set_digest: exactSha256(
      workOrder.input_set_digest,
      "work_order.input_set_digest",
    ),
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: [
      {
        artifact_id: rightsSet.artifact_id,
        type: "decision.rights_set",
        manifest_sha256: rightsSet.manifest_sha256,
        member_ids: [...rightsSet.rights_decision_receipt_ids],
        payload: structuredClone(rightsSet),
      },
    ],
    execution_receipt: {
      execution_id: `execution-${workOrder.work_order_id}`,
      adapter_id: "RightsPolicyAdapter",
      adapter_version: "1.0.0",
      adapter_code_sha256: RIGHTS_POLICY_CODE_SHA256,
    },
  };
}

export class RightsPolicyAdapter {
  constructor({ policy }) {
    this.policy = normalizePolicy(policy);
    Object.freeze(this);
  }

  review(input) {
    return createRightsDecisionSet({
      ...input,
      policy: this.policy,
    });
  }

  buildEnvelope(input) {
    if (
      input?.rightsSet?.policy?.policy_id !== this.policy.policy_id ||
      input?.rightsSet?.policy?.policy_sha256 !==
        this.policy.policy_sha256
    ) {
      fail(
        "RIGHTS_POLICY_MISMATCH",
        "Adapter policy does not match the rights set",
      );
    }
    return buildG0RRightsWorkflowEnvelope(input);
  }
}
