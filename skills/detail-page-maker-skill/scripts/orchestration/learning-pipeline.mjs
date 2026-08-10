import { createHash } from "node:crypto";

export const ACTIVE_RULE_REFERENCES = Object.freeze([
  "references/commercial.md",
  "references/taste.md",
  "references/motion.md",
]);

const SOURCE_TYPES = new Set(["behance", "motion", "hyperframes", "feedback"]);
const MOTION_CATEGORIES = new Set(["gif", "motion", "animation"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const PATH_PATTERNS = [
  /\b[a-z]:[\\/][^\s"'`]+/i,
  /(?:^|[\s("'`])(?:\/Users\/|\/home\/|\/tmp\/|\.{0,2}\/)[^\s"'`)]+/i,
  /\b(?:file:\/\/|\\\\)[^\s"'`]+/i,
  /(?:^|[\s("'`])(?:[\w.-]+[\\/])+\w[\w.-]*\.(?:md|json|html?|png|jpe?g|gif|webp|svg|mp4|mov|mjs|js|ps1)\b/i,
];
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s"'`)]+/i;
const SCANNED_TEXT_KEYS = new Set([
  "title",
  "rule_text",
  "observation",
  "recommendation",
  "rationale",
  "before_after",
  "risk_if_reused",
  "next_validation",
  "proposed_rule_text",
]);

export class LearningPipelineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "LearningPipelineError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new LearningPipelineError(code, message, details);
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
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assertString(value, name) {
  const normalized = normalizedText(value);
  if (!normalized) {
    fail("INVALID_LEARNING_CANDIDATE", `${name} must be a non-empty string`, {
      field: name,
    });
  }
  return normalized;
}

function assertHash(value, name) {
  if (!HASH_PATTERN.test(String(value || ""))) {
    fail("INVALID_SHA256", `${name} must be a 64 character SHA-256`, {
      field: name,
    });
  }
  return String(value).toLowerCase();
}

function normalizeLock(lock, kind) {
  if (!lock || typeof lock !== "object") {
    fail("INVALID_VERSION_LOCK", `${kind} lock is required`, { kind });
  }
  const idKey = kind === "policy" ? "policy_id" : "rubric_id";
  return Object.freeze({
    [idKey]: assertString(lock[idKey], idKey),
    version: assertString(lock.version, `${kind}.version`),
    sha256: assertHash(lock.sha256, `${kind}.sha256`),
  });
}

function sameLock(left, right, kind) {
  const idKey = kind === "policy" ? "policy_id" : "rubric_id";
  return (
    left?.[idKey] === right?.[idKey] &&
    left?.version === right?.version &&
    left?.sha256 === right?.sha256
  );
}

function assertFrozenLocks(subject, context = {}) {
  const expectedPolicy = normalizeLock(subject.policy, "policy");
  const expectedRubric = normalizeLock(subject.rubric, "rubric");
  const suppliedPolicy = normalizeLock(
    context.policy || expectedPolicy,
    "policy",
  );
  const suppliedRubric = normalizeLock(
    context.rubric || expectedRubric,
    "rubric",
  );
  if (!sameLock(expectedPolicy, suppliedPolicy, "policy")) {
    fail(
      "POLICY_VERSION_MISMATCH",
      "Review must use the policy version and hash fixed at intake",
      { expected: expectedPolicy, received: suppliedPolicy },
    );
  }
  if (!sameLock(expectedRubric, suppliedRubric, "rubric")) {
    fail(
      "RUBRIC_VERSION_MISMATCH",
      "Review must use the rubric version and hash fixed at intake",
      { expected: expectedRubric, received: suppliedRubric },
    );
  }
  return { policy: expectedPolicy, rubric: expectedRubric };
}

function normalizedSourceType(sourceType) {
  const value = normalizedText(sourceType).toLowerCase();
  if (!SOURCE_TYPES.has(value)) {
    fail("UNSUPPORTED_LEARNING_SOURCE", `Unsupported source_type: ${value}`, {
      source_type: value,
    });
  }
  return value === "hyperframes" ? "motion" : value;
}

function learningRoute(sourceType, category = "") {
  const source = normalizedSourceType(sourceType);
  const normalizedCategory = normalizedText(category).toLowerCase();
  if (source === "behance") {
    return Object.freeze({
      track: "behance",
      target_reference: "references/commercial.md",
      rule_prefix: "CR",
    });
  }
  if (source === "motion") {
    return Object.freeze({
      track: "gif-research",
      target_reference: "references/motion.md",
      rule_prefix: "MR",
    });
  }
  if (MOTION_CATEGORIES.has(normalizedCategory)) {
    return Object.freeze({
      track: "gif-feedback",
      target_reference: "references/motion.md",
      rule_prefix: "MR",
    });
  }
  return Object.freeze({
    track: "feedback",
    target_reference: "references/taste.md",
    rule_prefix: "TR",
  });
}

function maintenancePlan(sourceType) {
  const source = normalizedSourceType(sourceType);
  const capture =
    source === "behance"
      ? {
          adapter: "existing-maintenance-script",
          command:
            "node scripts/maintenance/refresh-browser-study.mjs --kind behance",
        }
      : source === "motion"
        ? {
            adapter: "existing-maintenance-script",
            command:
              "node scripts/maintenance/refresh-browser-study.mjs --kind hyperframes",
          }
        : null;
  return Object.freeze({
    capture,
    distill: {
      adapter: "existing-maintenance-script",
      command: "node scripts/maintenance/distill-learnings.mjs",
    },
    status: {
      adapter: "existing-maintenance-script",
      command: "node scripts/maintenance/learning-status.mjs --json",
    },
    execution_adapter: "learning-pipeline-execution-adapter",
    action_ids:
      source === "behance"
        ? ["refresh-behance", "distill", "status"]
        : source === "motion"
          ? ["refresh-hyperframes", "distill", "status"]
          : ["distill", "status"],
    executed: false,
  });
}

function normalizedSensitiveTerms(value = {}) {
  const normalize = (items) =>
    [...new Set((Array.isArray(items) ? items : []).map(normalizedText).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right, "en"),
    );
  return {
    product_names: normalize(value.product_names),
    unique_copy: normalize(value.unique_copy),
  };
}

function normalizeRawCandidate(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    fail("INVALID_LEARNING_CANDIDATE", "candidate must be an object");
  }
  const sourceType = normalizedSourceType(candidate.source_type);
  return {
    ...candidate,
    candidate_id: assertString(candidate.candidate_id, "candidate_id"),
    source_type: sourceType,
    category: normalizedText(candidate.category).toLowerCase(),
    title: assertString(candidate.title, "title"),
    rule_text: assertString(candidate.rule_text, "rule_text"),
    source_locator: assertString(candidate.source_locator, "source_locator"),
    producer_session_id: assertString(
      candidate.producer_session_id,
      "producer_session_id",
    ),
    captured_at: assertString(candidate.captured_at, "captured_at"),
    sensitive_terms: normalizedSensitiveTerms(candidate.sensitive_terms),
  };
}

export function candidateHash(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    fail("INVALID_LEARNING_CANDIDATE", "candidate must be an object");
  }
  return sha256(canonicalJson(candidate));
}

function receiptId(prefix, value) {
  return `${prefix}-${sha256(canonicalJson(value)).slice(0, 24)}`;
}

function portableSourceRef(sourceLocator) {
  if (URL_PATTERN.test(sourceLocator) || PATH_PATTERNS.some((item) => item.test(sourceLocator))) {
    return `source-${sha256(sourceLocator).slice(0, 24)}`;
  }
  return sourceLocator;
}

function collectCandidateText(candidate) {
  return Object.entries(candidate)
    .filter(([key, value]) => SCANNED_TEXT_KEYS.has(key) && typeof value === "string")
    .map(([field, value]) => ({ field, value }));
}

function findSanitizationViolations(candidate, sensitiveTerms) {
  const violations = [];
  for (const { field, value } of collectCandidateText(candidate)) {
    if (URL_PATTERN.test(value)) {
      violations.push({ code: "URL", field });
    }
    if (PATH_PATTERNS.some((pattern) => pattern.test(value))) {
      violations.push({ code: "FILE_PATH", field });
    }
    for (const productName of sensitiveTerms.product_names) {
      if (value.toLocaleLowerCase("en").includes(productName.toLocaleLowerCase("en"))) {
        violations.push({
          code: "PRODUCT_NAME",
          field,
          fingerprint: sha256(productName).slice(0, 16),
        });
      }
    }
    for (const uniqueCopy of sensitiveTerms.unique_copy) {
      if (value.toLocaleLowerCase("en").includes(uniqueCopy.toLocaleLowerCase("en"))) {
        violations.push({
          code: "UNIQUE_COPY",
          field,
          fingerprint: sha256(uniqueCopy).slice(0, 16),
        });
      }
    }
  }
  return violations.sort(
    (left, right) =>
      left.field.localeCompare(right.field, "en") ||
      left.code.localeCompare(right.code, "en"),
  );
}

function sanitizedCandidate(rawCandidate) {
  const optionalText = Object.fromEntries(
    [...SCANNED_TEXT_KEYS]
      .filter(
        (key) =>
          !["title", "rule_text", "proposed_rule_text"].includes(key) &&
          normalizedText(rawCandidate[key]),
      )
      .map((key) => [key, normalizedText(rawCandidate[key])]),
  );
  return {
    candidate_id: rawCandidate.candidate_id,
    source_type: rawCandidate.source_type,
    category: rawCandidate.category,
    title: rawCandidate.title,
    rule_text: rawCandidate.rule_text,
    ...optionalText,
    source_ref: portableSourceRef(rawCandidate.source_locator),
    producer_session_id: rawCandidate.producer_session_id,
    captured_at: rawCandidate.captured_at,
  };
}

export function intakeLearningCandidate(candidate, { policy, rubric } = {}) {
  const normalized = normalizeRawCandidate(candidate);
  const policyLock = normalizeLock(policy, "policy");
  const rubricLock = normalizeLock(rubric, "rubric");
  const route = learningRoute(normalized.source_type, normalized.category);
  const rawHash = candidateHash(normalized);
  const receiptCore = {
    candidate_id: normalized.candidate_id,
    raw_candidate_sha256: rawHash,
    source_type: normalized.source_type,
    route,
    producer_session_id: normalized.producer_session_id,
    policy: policyLock,
    rubric: rubricLock,
  };
  return Object.freeze({
    schema_version: "1.0",
    intake_receipt_id: receiptId("learning-intake", receiptCore),
    status: "CAPTURED",
    ...receiptCore,
    raw_candidate: normalized,
    maintenance_plan: maintenancePlan(normalized.source_type),
    active_rule_write_allowed: false,
  });
}

export function sanitizeLearningCandidate(captured) {
  if (!captured || captured.status !== "CAPTURED") {
    fail("INVALID_PIPELINE_STATE", "Only CAPTURED candidates can be sanitized");
  }
  if (candidateHash(captured.raw_candidate) !== captured.raw_candidate_sha256) {
    fail(
      "CANDIDATE_HASH_MISMATCH",
      "The captured candidate no longer matches its intake hash",
    );
  }
  assertFrozenLocks(captured);
  const terms = normalizedSensitiveTerms(captured.raw_candidate.sensitive_terms);
  const violations = findSanitizationViolations(captured.raw_candidate, terms);
  const common = {
    schema_version: "1.0",
    candidate_id: captured.candidate_id,
    intake_receipt_id: captured.intake_receipt_id,
    raw_candidate_sha256: captured.raw_candidate_sha256,
    route: captured.route,
    producer_session_id: captured.producer_session_id,
    policy: captured.policy,
    rubric: captured.rubric,
    active_rule_write_allowed: false,
    ...(captured.maintenance_execution
      ? {
          maintenance_execution: structuredClone(
            captured.maintenance_execution,
          ),
        }
      : {}),
  };
  if (violations.length > 0) {
    const receiptCore = {
      candidate_id: captured.candidate_id,
      raw_candidate_sha256: captured.raw_candidate_sha256,
      violations,
    };
    return Object.freeze({
      ...common,
      sanitization_receipt_id: receiptId(
        "learning-quarantine",
        receiptCore,
      ),
      status: "QUARANTINED",
      candidate: null,
      candidate_sha256: null,
      violations,
      reason_codes: ["SANITIZATION_VIOLATION"],
    });
  }
  const candidate = sanitizedCandidate(captured.raw_candidate);
  const sanitizedHash = candidateHash(candidate);
  const receiptCore = {
    candidate_id: captured.candidate_id,
    candidate_sha256: sanitizedHash,
    route: captured.route,
    policy: captured.policy,
    rubric: captured.rubric,
  };
  return Object.freeze({
    ...common,
    sanitization_receipt_id: receiptId("learning-sanitize", receiptCore),
    status: "SANITIZED",
    candidate,
    candidate_sha256: sanitizedHash,
    violations: [],
  });
}

function normalizedEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    fail("INVALID_REVIEW_EVIDENCE", "Every evidence item must be an object");
  }
  const evidenceKind = normalizedText(evidence.evidence_kind).toLowerCase();
  if (!["case", "different_product", "regression"].includes(evidenceKind)) {
    fail("INVALID_REVIEW_EVIDENCE", `Unsupported evidence_kind: ${evidenceKind}`);
  }
  const normalized = {
    ...evidence,
    evidence_kind: evidenceKind,
    case_id: assertString(evidence.case_id, "evidence.case_id"),
    outcome: normalizedText(evidence.outcome).toUpperCase(),
    artifact_sha256: assertHash(
      evidence.artifact_sha256,
      "evidence.artifact_sha256",
    ),
  };
  delete normalized.evidence_id;
  if (!["PASS", "FAIL"].includes(normalized.outcome)) {
    fail("INVALID_REVIEW_EVIDENCE", "evidence.outcome must be PASS or FAIL");
  }
  return normalized;
}

export function deterministicEvidenceId(evidence) {
  const normalized = normalizedEvidence(evidence);
  return `evidence-${sha256(canonicalJson(normalized)).slice(0, 24)}`;
}

function evidenceMode(items) {
  const passing = items.filter((item) => item.outcome === "PASS");
  const cases = new Set(
    passing
      .filter((item) => item.evidence_kind === "case")
      .map((item) => item.case_id),
  );
  if (cases.size >= 3) return "THREE_CASES";
  const hasDifferentProduct = passing.some(
    (item) => item.evidence_kind === "different_product",
  );
  const hasRegression = passing.some(
    (item) => item.evidence_kind === "regression",
  );
  if (hasDifferentProduct && hasRegression) {
    return "DIFFERENT_PRODUCT_AND_REGRESSION";
  }
  return null;
}

function assertSanitizedCandidate(subject) {
  if (!subject || subject.status !== "SANITIZED") {
    fail(
      "INVALID_PIPELINE_STATE",
      "Only a SANITIZED candidate can enter review",
    );
  }
  if (
    !subject.candidate ||
    candidateHash(subject.candidate) !== subject.candidate_sha256
  ) {
    fail(
      "CANDIDATE_HASH_MISMATCH",
      "Review candidate does not match the exact sanitized candidate hash",
    );
  }
}

export function reviewLearningCandidate(subject, review = {}, context = {}) {
  assertSanitizedCandidate(subject);
  const locks = assertFrozenLocks(subject, context);
  const reviewerSessionId = assertString(
    review.reviewer_session_id,
    "reviewer_session_id",
  );
  if (reviewerSessionId === subject.producer_session_id) {
    fail(
      "SELF_REVIEW_FORBIDDEN",
      "Producer and reviewer session IDs must be different",
    );
  }
  const decision = normalizedText(review.decision || "approve").toLowerCase();
  if (!["approve", "reject", "quarantine"].includes(decision)) {
    fail("INVALID_REVIEW_DECISION", `Unsupported decision: ${decision}`);
  }
  const evidence = (Array.isArray(review.evidence) ? review.evidence : []).map(
    normalizedEvidence,
  );
  const evidenceWithIds = evidence
    .map((item) => ({
      ...item,
      evidence_id: deterministicEvidenceId(item),
    }))
    .sort((left, right) =>
      left.evidence_id.localeCompare(right.evidence_id, "en"),
    );
  const mode = evidenceMode(evidenceWithIds);
  let status = "APPROVED";
  let reasonCodes = [];
  if (decision === "reject") {
    status = "REJECTED";
    reasonCodes = Array.isArray(review.reason_codes)
      ? [...new Set(review.reason_codes.map(normalizedText).filter(Boolean))].sort()
      : [];
    if (reasonCodes.length === 0) reasonCodes = ["REVIEWER_REJECTED"];
  } else if (decision === "quarantine") {
    status = "QUARANTINED";
    reasonCodes = Array.isArray(review.reason_codes)
      ? [...new Set(review.reason_codes.map(normalizedText).filter(Boolean))].sort()
      : [];
    if (reasonCodes.length === 0) reasonCodes = ["REVIEWER_QUARANTINED"];
  } else if (!mode) {
    status = "QUARANTINED";
    reasonCodes = ["INSUFFICIENT_VALIDATION_EVIDENCE"];
  }
  const receiptCore = {
    candidate_id: subject.candidate_id,
    candidate_sha256: subject.candidate_sha256,
    sanitization_receipt_id: subject.sanitization_receipt_id,
    producer_session_id: subject.producer_session_id,
    reviewer_session_id: reviewerSessionId,
    decision,
    status,
    reason_codes: reasonCodes,
    evidence_ids: evidenceWithIds.map((item) => item.evidence_id),
    evidence_mode: mode,
    policy: locks.policy,
    rubric: locks.rubric,
  };
  return Object.freeze({
    schema_version: "1.0",
    review_receipt_id: receiptId("learning-review", receiptCore),
    ...receiptCore,
    route: subject.route,
    candidate: subject.candidate,
    evidence: evidenceWithIds,
    reviewed_at: assertString(review.reviewed_at, "reviewed_at"),
    active_rule_write_allowed: false,
    ...(subject.maintenance_execution
      ? {
          maintenance_execution: structuredClone(
            subject.maintenance_execution,
          ),
        }
      : {}),
  });
}

function assertPromotionProposalSafe(text) {
  const violations = findSanitizationViolations(
    { proposed_rule_text: text },
    { product_names: [], unique_copy: [] },
  );
  if (violations.length > 0) {
    fail(
      "UNSAFE_PROMOTION_PROPOSAL",
      "Promotion proposal contains a URL or file path",
      { violations },
    );
  }
}

export function createPromotionPlan(reviewReceipt, proposal = {}) {
  if (!reviewReceipt || reviewReceipt.status !== "APPROVED") {
    fail(
      "PROMOTION_NOT_APPROVED",
      "Only an APPROVED review receipt can produce a promotion plan",
    );
  }
  if (
    !reviewReceipt.candidate ||
    candidateHash(reviewReceipt.candidate) !== reviewReceipt.candidate_sha256
  ) {
    fail(
      "CANDIDATE_HASH_MISMATCH",
      "Promotion plan must bind the exact reviewed candidate hash",
    );
  }
  assertFrozenLocks(reviewReceipt);
  const proposedRuleId = assertString(
    proposal.proposed_rule_id,
    "proposed_rule_id",
  );
  const expectedPrefix = `${reviewReceipt.route.rule_prefix}-`;
  if (!proposedRuleId.startsWith(expectedPrefix)) {
    fail(
      "WRONG_RULE_NAMESPACE",
      `Rule ID must begin with ${expectedPrefix}`,
      { proposed_rule_id: proposedRuleId },
    );
  }
  const proposedRuleText = assertString(
    proposal.proposed_rule_text,
    "proposed_rule_text",
  );
  assertPromotionProposalSafe(proposedRuleText);
  const proposedRuleSha256 = sha256(proposedRuleText);
  const planCore = {
    candidate_id: reviewReceipt.candidate_id,
    candidate_sha256: reviewReceipt.candidate_sha256,
    review_receipt_id: reviewReceipt.review_receipt_id,
    target_reference: reviewReceipt.route.target_reference,
    proposed_rule_id: proposedRuleId,
    proposed_rule_sha256: proposedRuleSha256,
    policy: reviewReceipt.policy,
    rubric: reviewReceipt.rubric,
    ...(reviewReceipt.maintenance_execution
      ? {
          maintenance_execution: structuredClone(
            reviewReceipt.maintenance_execution,
          ),
        }
      : {}),
  };
  return Object.freeze({
    schema_version: "1.0",
    promotion_plan_id: receiptId("learning-promotion-plan", planCore),
    action: "PROPOSE_ACTIVE_RULE_PATCH",
    ...planCore,
    proposed_rule_text: proposedRuleText,
    protected_references: ACTIVE_RULE_REFERENCES,
    required_follow_up: [
      "human_or_independent_agent_applies_rule",
      "regression_tests_pass",
      "learning_status_updated",
      "source_deletion_receipt_created",
    ],
    write_allowed: false,
    writes_performed: false,
  });
}

function present(value) {
  return normalizedText(value).length > 0;
}

export function createSourceDeletionReceipt(promotionPlan, verification = {}) {
  if (
    !promotionPlan ||
    promotionPlan.action !== "PROPOSE_ACTIVE_RULE_PATCH" ||
    promotionPlan.write_allowed !== false ||
    promotionPlan.writes_performed !== false
  ) {
    fail(
      "INVALID_PROMOTION_PLAN",
      "Deletion verification requires an immutable promotion-only plan",
    );
  }
  const blockedReasons = [];
  if (verification.promotion_applied !== true) {
    blockedReasons.push("PROMOTION_NOT_APPLIED");
  }
  if (verification.active_reference !== promotionPlan.target_reference) {
    blockedReasons.push("WRONG_ACTIVE_REFERENCE");
  }
  if (!HASH_PATTERN.test(String(verification.active_reference_sha256 || ""))) {
    blockedReasons.push("ACTIVE_REFERENCE_HASH_MISSING");
  }
  if (verification.promoted_rule_id !== promotionPlan.proposed_rule_id) {
    blockedReasons.push("PROMOTED_RULE_ID_MISMATCH");
  }
  if (
    verification.promoted_rule_sha256 !== promotionPlan.proposed_rule_sha256
  ) {
    blockedReasons.push("PROMOTED_RULE_HASH_MISMATCH");
  }
  if (verification.regression_passed !== true) {
    blockedReasons.push("REGRESSION_NOT_PASSED");
  }
  if (
    !present(verification.regression_receipt_id) ||
    !HASH_PATTERN.test(String(verification.regression_receipt_sha256 || ""))
  ) {
    blockedReasons.push("REGRESSION_RECEIPT_MISSING");
  }
  if (verification.learning_status_updated !== true) {
    blockedReasons.push("LEARNING_STATUS_NOT_UPDATED");
  }
  if (
    !present(verification.learning_status_receipt_id) ||
    !HASH_PATTERN.test(
      String(verification.learning_status_receipt_sha256 || ""),
    )
  ) {
    blockedReasons.push("LEARNING_STATUS_RECEIPT_MISSING");
  }
  const transientSourceIds = [
    ...new Set(
      (Array.isArray(verification.transient_source_ids)
        ? verification.transient_source_ids
        : []
      )
        .map(normalizedText)
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right, "en"));
  if (transientSourceIds.length === 0) {
    blockedReasons.push("TRANSIENT_SOURCE_IDS_MISSING");
  }
  const receiptCore = {
    promotion_plan_id: promotionPlan.promotion_plan_id,
    candidate_sha256: promotionPlan.candidate_sha256,
    target_reference: promotionPlan.target_reference,
    proposed_rule_id: promotionPlan.proposed_rule_id,
    proposed_rule_sha256: promotionPlan.proposed_rule_sha256,
    verification: {
      promotion_applied: verification.promotion_applied === true,
      active_reference: normalizedText(verification.active_reference),
      active_reference_sha256: normalizedText(
        verification.active_reference_sha256,
      ),
      promoted_rule_id: normalizedText(verification.promoted_rule_id),
      promoted_rule_sha256: normalizedText(
        verification.promoted_rule_sha256,
      ),
      regression_passed: verification.regression_passed === true,
      regression_receipt_id: normalizedText(
        verification.regression_receipt_id,
      ),
      regression_receipt_sha256: normalizedText(
        verification.regression_receipt_sha256,
      ),
      learning_status_updated:
        verification.learning_status_updated === true,
      learning_status_receipt_id: normalizedText(
        verification.learning_status_receipt_id,
      ),
      learning_status_receipt_sha256: normalizedText(
        verification.learning_status_receipt_sha256,
      ),
    },
    transient_source_ids: transientSourceIds,
    blocked_reasons: blockedReasons,
  };
  return Object.freeze({
    schema_version: "1.0",
    source_deletion_receipt_id: receiptId(
      "learning-source-deletion",
      receiptCore,
    ),
    ...receiptCore,
    policy: promotionPlan.policy,
    rubric: promotionPlan.rubric,
    deletion_allowed: blockedReasons.length === 0,
    deletion_performed: false,
    deletion_instruction:
      blockedReasons.length === 0
        ? "A separate authorized actor may delete only the listed transient sources."
        : "Keep every source; promotion proof is incomplete.",
  });
}

function receiptCore(receipt) {
  const { receipt_sha256: _receiptSha256, ...core } = receipt;
  return core;
}

function assertExecutionReceiptHash(receipt, expectedHash, field) {
  if (
    !receipt ||
    assertHash(expectedHash, field) !== receipt.receipt_sha256 ||
    sha256(canonicalJson(receiptCore(receipt))) !== expectedHash
  ) {
    fail(
      "MAINTENANCE_RECEIPT_HASH_MISMATCH",
      `${field} does not match the attached receipt bytes.`,
      { field },
    );
  }
}

export function attachLearningMaintenanceExecution(
  captured,
  executionResult,
) {
  if (!captured || captured.status !== "CAPTURED") {
    fail(
      "INVALID_PIPELINE_STATE",
      "Maintenance execution can only attach to a CAPTURED candidate.",
    );
  }
  if (
    candidateHash(captured.raw_candidate) !==
    captured.raw_candidate_sha256
  ) {
    fail(
      "CANDIDATE_HASH_MISMATCH",
      "The captured candidate no longer matches its intake hash.",
    );
  }
  const binding = executionResult?.pipeline_binding;
  if (
    executionResult?.status !== "PASS" ||
    executionResult?.execution_receipt?.status !== "PASS" ||
    executionResult?.validation_receipt?.verdict !== "PASS"
  ) {
    fail(
      "MAINTENANCE_EXECUTION_NOT_VERIFIED",
      "Only PASS execution and structural validation receipts can attach.",
    );
  }
  if (
    binding?.candidate_id !== captured.candidate_id ||
    binding?.intake_receipt_id !== captured.intake_receipt_id ||
    binding?.raw_candidate_sha256 !==
      captured.raw_candidate_sha256 ||
    canonicalJson(binding?.route) !== canonicalJson(captured.route)
  ) {
    fail(
      "MAINTENANCE_PIPELINE_BINDING_MISMATCH",
      "Maintenance receipts do not bind the exact intake candidate.",
    );
  }
  assertExecutionReceiptHash(
    executionResult.execution_receipt,
    executionResult.execution_receipt_sha256,
    "execution_receipt_sha256",
  );
  assertExecutionReceiptHash(
    executionResult.validation_receipt,
    executionResult.validation_receipt_sha256,
    "validation_receipt_sha256",
  );
  if (
    executionResult.validation_receipt.subject
      ?.execution_receipt_sha256 !==
      executionResult.execution_receipt_sha256 ||
    executionResult.validation_receipt.subject
      ?.artifact_set_digest !==
      executionResult.execution_receipt.output_set_sha256 ||
    executionResult.execution_receipt.output_set_sha256 !==
      executionResult.output_set_sha256 ||
    sha256(canonicalJson(executionResult.output_hash_set)) !==
      executionResult.output_set_sha256 ||
    canonicalJson(executionResult.output_hash_set) !==
      canonicalJson(
        executionResult.execution_receipt.output_hash_set,
      )
  ) {
    fail(
      "MAINTENANCE_RECEIPT_LINK_MISMATCH",
      "Execution, output, and structural validation receipts are not linked.",
    );
  }
  const maintenanceExecution = Object.freeze({
    plan_id: assertString(executionResult.plan_id, "plan_id"),
    plan_digest: assertHash(
      executionResult.plan_digest,
      "plan_digest",
    ),
    execution_id: assertString(
      executionResult.execution_receipt.execution_id,
      "execution_id",
    ),
    execution_receipt_sha256:
      executionResult.execution_receipt_sha256,
    validation_id: assertString(
      executionResult.validation_receipt.validation_id,
      "validation_id",
    ),
    validation_receipt_sha256:
      executionResult.validation_receipt_sha256,
    output_set_sha256: assertHash(
      executionResult.output_set_sha256,
      "output_set_sha256",
    ),
    output_hash_set: structuredClone(
      executionResult.output_hash_set,
    ),
  });
  return Object.freeze({
    ...captured,
    maintenance_plan: Object.freeze({
      ...captured.maintenance_plan,
      executed: true,
      plan_id: maintenanceExecution.plan_id,
      plan_digest: maintenanceExecution.plan_digest,
      execution_receipt_sha256:
        maintenanceExecution.execution_receipt_sha256,
      validation_receipt_sha256:
        maintenanceExecution.validation_receipt_sha256,
    }),
    maintenance_execution: maintenanceExecution,
  });
}

export class LearningPipelineAdapter {
  constructor({ policy, rubric } = {}) {
    this.policy = normalizeLock(policy, "policy");
    this.rubric = normalizeLock(rubric, "rubric");
    Object.freeze(this);
  }

  intake(candidate) {
    return intakeLearningCandidate(candidate, {
      policy: this.policy,
      rubric: this.rubric,
    });
  }

  sanitize(captured) {
    assertFrozenLocks(captured, {
      policy: this.policy,
      rubric: this.rubric,
    });
    return sanitizeLearningCandidate(captured);
  }

  attachMaintenanceExecution(captured, executionResult) {
    assertFrozenLocks(captured, {
      policy: this.policy,
      rubric: this.rubric,
    });
    return attachLearningMaintenanceExecution(
      captured,
      executionResult,
    );
  }

  review(sanitized, review) {
    return reviewLearningCandidate(sanitized, review, {
      policy: this.policy,
      rubric: this.rubric,
    });
  }

  createPromotionPlan(reviewReceipt, proposal) {
    assertFrozenLocks(reviewReceipt, {
      policy: this.policy,
      rubric: this.rubric,
    });
    return createPromotionPlan(reviewReceipt, proposal);
  }

  createSourceDeletionReceipt(promotionPlan, verification) {
    assertFrozenLocks(promotionPlan, {
      policy: this.policy,
      rubric: this.rubric,
    });
    return createSourceDeletionReceipt(promotionPlan, verification);
  }
}
