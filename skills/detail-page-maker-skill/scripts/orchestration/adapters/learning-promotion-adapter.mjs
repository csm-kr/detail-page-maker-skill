import {
  createHash,
  randomBytes,
} from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  ACTIVE_RULE_REFERENCES,
  createPromotionPlan,
} from "../learning-pipeline.mjs";
import {
  buildLearningStatus,
} from "../../maintenance/learning-status.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const NONCE = /^[a-f0-9]{64}$/;
const RULE_ID = /^(CR|TR|MR)-\d+$/;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s"'`)]+/i;
const PATH_PATTERNS = [
  /\b[a-z]:[\\/][^\s"'`]+/i,
  /(?:^|[\s("'`])(?:\/Users\/|\/home\/|\/tmp\/|\.{0,2}\/)[^\s"'`)]+/i,
  /\b(?:file:\/\/|\\\\)[^\s"'`]+/i,
  /(?:^|[\s("'`])(?:[\w.-]+[\\/])+\w[\w.-]*\.(?:md|json|html?|png|jpe?g|gif|webp|svg|mp4|mov|mjs|js|ps1)\b/i,
];
const TARGETS = Object.freeze({
  "references/commercial.md": Object.freeze({
    prefix: "CR",
    count_key: "commercialRules",
  }),
  "references/taste.md": Object.freeze({
    prefix: "TR",
    count_key: "tasteRules",
  }),
  "references/motion.md": Object.freeze({
    prefix: "MR",
    count_key: "motionRules",
  }),
});
const TABLE_HEADER =
  /^\|\s*ID\s*\|\s*계속 적용할 규칙\s*\|\s*검증 기준\s*\|\s*갱신일\s*\|\s*$/;
const TABLE_SEPARATOR =
  /^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*$/;

export class LearningPromotionAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "LearningPromotionAdapterError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new LearningPromotionAdapterError(
    code,
    message,
    details,
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function canonicalSha256(value) {
  return sha256(canonicalJson(value));
}

function clone(value) {
  return structuredClone(value);
}

function nonEmpty(value, field, code = "INVALID_PROMOTION_INPUT") {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(code, `${field}가 필요합니다.`, { field });
  }
  return value.trim();
}

function hashValue(
  value,
  field,
  code = "INVALID_PROMOTION_INPUT",
) {
  const text = String(value ?? "").toLowerCase();
  if (!SHA256.test(text)) {
    fail(code, `${field}는 SHA-256이어야 합니다.`, {
      field,
      value,
    });
  }
  return text;
}

function isoTimestamp(
  value,
  field,
  code = "INVALID_PROMOTION_INPUT",
) {
  if (
    typeof value !== "string" ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(code, `${field}는 ISO timestamp여야 합니다.`, {
      field,
      value,
    });
  }
  return value;
}

function absolutePath(value, field) {
  const text = nonEmpty(
    value,
    field,
    "ABSOLUTE_PATH_REQUIRED",
  );
  if (!path.isAbsolute(text)) {
    fail(
      "ABSOLUTE_PATH_REQUIRED",
      `${field}는 절대 경로여야 합니다.`,
      { field, path: text },
    );
  }
  return path.resolve(text);
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function targetContract(targetReference) {
  if (
    !ACTIVE_RULE_REFERENCES.includes(targetReference) ||
    !TARGETS[targetReference]
  ) {
    fail(
      "WRONG_PROMOTION_TARGET",
      "promotion target은 commercial.md, taste.md, motion.md 중 route가 지정한 정본이어야 합니다.",
      { target_reference: targetReference },
    );
  }
  return TARGETS[targetReference];
}

function resolveReferencePath(skillRoot, targetReference) {
  const skill = absolutePath(skillRoot, "skill_root");
  const target = targetContract(targetReference);
  const absolute = path.resolve(
    skill,
    ...targetReference.split("/"),
  );
  if (!isWithin(skill, absolute)) {
    fail(
      "REFERENCE_PATH_ESCAPE",
      "active reference가 skill root를 벗어났습니다.",
      { target_reference: targetReference },
    );
  }
  return { skill, absolute, target };
}

function assertPromotionPlan(promotionPlan, reviewReceipt) {
  if (
    !promotionPlan ||
    promotionPlan.action !== "PROPOSE_ACTIVE_RULE_PATCH" ||
    promotionPlan.write_allowed !== false ||
    promotionPlan.writes_performed !== false
  ) {
    fail(
      "INVALID_PROMOTION_PLAN",
      "LearningPipeline의 immutable promotion plan이 필요합니다.",
    );
  }
  const target = targetContract(
    promotionPlan.target_reference,
  );
  if (
    typeof promotionPlan.proposed_rule_id !== "string" ||
    !RULE_ID.test(promotionPlan.proposed_rule_id) ||
    !promotionPlan.proposed_rule_id.startsWith(
      `${target.prefix}-`,
    )
  ) {
    fail(
      "WRONG_PROMOTION_TARGET",
      "rule ID namespace와 target reference가 다릅니다.",
      {
        proposed_rule_id: promotionPlan.proposed_rule_id,
        target_reference: promotionPlan.target_reference,
      },
    );
  }
  if (
    !reviewReceipt ||
    reviewReceipt.status !== "APPROVED" ||
    reviewReceipt.review_receipt_id !==
      promotionPlan.review_receipt_id ||
    reviewReceipt.candidate_sha256 !==
      promotionPlan.candidate_sha256 ||
    reviewReceipt.route?.target_reference !==
      promotionPlan.target_reference ||
    reviewReceipt.route?.rule_prefix !== target.prefix
  ) {
    fail(
      "REVIEW_RECEIPT_MISMATCH",
      "promotion plan과 APPROVED review receipt가 exact candidate·route로 연결되지 않았습니다.",
    );
  }
  let regenerated;
  try {
    regenerated = createPromotionPlan(reviewReceipt, {
      proposed_rule_id: promotionPlan.proposed_rule_id,
      proposed_rule_text: promotionPlan.proposed_rule_text,
    });
  } catch (error) {
    fail(
      "INVALID_PROMOTION_PLAN",
      "LearningPipeline이 promotion plan을 재검증하지 못했습니다.",
      { cause: error?.code ?? error?.message },
    );
  }
  if (
    canonicalJson(regenerated) !==
    canonicalJson(promotionPlan)
  ) {
    fail(
      "PROMOTION_PLAN_DIGEST_MISMATCH",
      "promotion plan이 LearningPipeline 생성 뒤 변경됐습니다.",
    );
  }
  const producerSessionId = nonEmpty(
    reviewReceipt.producer_session_id,
    "review_receipt.producer_session_id",
    "REVIEW_RECEIPT_MISMATCH",
  );
  const reviewerSessionId = nonEmpty(
    reviewReceipt.reviewer_session_id,
    "review_receipt.reviewer_session_id",
    "REVIEW_RECEIPT_MISMATCH",
  );
  if (producerSessionId === reviewerSessionId) {
    fail(
      "REVIEW_RECEIPT_MISMATCH",
      "candidate producer와 reviewer는 분리되어야 합니다.",
    );
  }
  return {
    target,
    producer_session_id: producerSessionId,
    reviewer_session_id: reviewerSessionId,
    plan_sha256: canonicalSha256(promotionPlan),
    review_receipt_sha256:
      canonicalSha256(reviewReceipt),
  };
}

function normalizedSensitiveTerms(sanitizationContext) {
  if (
    !sanitizationContext ||
    typeof sanitizationContext !== "object" ||
    Array.isArray(sanitizationContext)
  ) {
    fail(
      "SANITIZATION_CONTEXT_REQUIRED",
      "commit 직전 상품명·고유 카피 재검사용 context가 필요합니다.",
    );
  }
  const { context_sha256: suppliedSha256, ...contextBody } =
    sanitizationContext;
  const candidateSha256 = hashValue(
    contextBody.candidate_sha256,
    "sanitization_context.candidate_sha256",
    "SANITIZATION_CONTEXT_REQUIRED",
  );
  const normalize = (value, field) => {
    if (!Array.isArray(value)) {
      fail(
        "SANITIZATION_CONTEXT_REQUIRED",
        `${field}는 배열이어야 합니다.`,
      );
    }
    return [
      ...new Set(
        value
          .map((item) =>
            typeof item === "string" ? item.trim() : "",
          )
          .filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right, "en"));
  };
  const normalized = {
    candidate_sha256: candidateSha256,
    product_names: normalize(
      contextBody.product_names,
      "sanitization_context.product_names",
    ),
    unique_copy: normalize(
      contextBody.unique_copy,
      "sanitization_context.unique_copy",
    ),
    scanner_code_sha256: hashValue(
      contextBody.scanner_code_sha256,
      "sanitization_context.scanner_code_sha256",
      "SANITIZATION_CONTEXT_REQUIRED",
    ),
  };
  const actualSha256 = canonicalSha256(normalized);
  if (suppliedSha256 !== actualSha256) {
    fail(
      "SANITIZATION_CONTEXT_HASH_MISMATCH",
      "sanitization context가 생성 뒤 변경됐습니다.",
      {
        expected_context_sha256: suppliedSha256,
        actual_context_sha256: actualSha256,
      },
    );
  }
  return {
    ...normalized,
    context_sha256: actualSha256,
  };
}

function assertSafeCell(value, field) {
  const text = nonEmpty(
    value,
    field,
    "UNSAFE_PROMOTION_CONTENT",
  );
  if (
    text.includes("|") ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    fail(
      "UNSAFE_PROMOTION_CONTENT",
      "rule table cell에는 pipe 또는 줄바꿈을 넣을 수 없습니다.",
      { field },
    );
  }
  return text;
}

function rescanPromotionContent(
  promotionPlan,
  regression,
  context,
) {
  if (
    context.candidate_sha256 !==
    promotionPlan.candidate_sha256
  ) {
    fail(
      "SANITIZATION_CONTEXT_CANDIDATE_MISMATCH",
      "sanitization context가 exact candidate와 다릅니다.",
    );
  }
  const values = [
    {
      field: "proposed_rule_text",
      value: assertSafeCell(
        promotionPlan.proposed_rule_text,
        "proposed_rule_text",
      ),
    },
    {
      field: "regression.validation_criterion",
      value: assertSafeCell(
        regression.validation_criterion,
        "regression.validation_criterion",
      ),
    },
  ];
  const violations = [];
  for (const entry of values) {
    if (URL_PATTERN.test(entry.value)) {
      violations.push({
        code: "URL",
        field: entry.field,
      });
    }
    if (
      PATH_PATTERNS.some((pattern) =>
        pattern.test(entry.value),
      )
    ) {
      violations.push({
        code: "FILE_PATH",
        field: entry.field,
      });
    }
    for (const term of context.product_names) {
      if (
        entry.value
          .toLocaleLowerCase("en")
          .includes(term.toLocaleLowerCase("en"))
      ) {
        violations.push({
          code: "PRODUCT_NAME",
          field: entry.field,
          fingerprint: sha256(term).slice(0, 16),
        });
      }
    }
    for (const term of context.unique_copy) {
      if (
        entry.value
          .toLocaleLowerCase("en")
          .includes(term.toLocaleLowerCase("en"))
      ) {
        violations.push({
          code: "UNIQUE_COPY",
          field: entry.field,
          fingerprint: sha256(term).slice(0, 16),
        });
      }
    }
  }
  if (violations.length > 0) {
    fail(
      "PROMOTION_SANITIZATION_FAILED",
      "commit 직전 재검사에서 상품명·URL·경로·고유 카피가 발견됐습니다.",
      { violations },
    );
  }
  return {
    product_name_fingerprints: context.product_names.map(
      (term) => sha256(term).slice(0, 16),
    ),
    unique_copy_fingerprints: context.unique_copy.map(
      (term) => sha256(term).slice(0, 16),
    ),
    scan_status: "PASS",
    context_sha256: context.context_sha256,
    scanner_code_sha256: context.scanner_code_sha256,
  };
}

function assertRegressionEvidence(
  regressionEvidence,
  promotionPlan,
) {
  if (
    !regressionEvidence ||
    typeof regressionEvidence !== "object" ||
    Array.isArray(regressionEvidence)
  ) {
    fail(
      "REGRESSION_EVIDENCE_REQUIRED",
      "promotion commit에는 PASS regression receipt가 필요합니다.",
    );
  }
  const {
    receipt_sha256: suppliedReceiptSha256,
    ...receiptBody
  } = regressionEvidence;
  const normalized = {
    schema_version: "1.0",
    receipt_type: "learning.promotion.regression",
    receipt_id: nonEmpty(
      receiptBody.receipt_id,
      "regression.receipt_id",
      "REGRESSION_EVIDENCE_REQUIRED",
    ),
    status: String(receiptBody.status ?? "").toUpperCase(),
    promotion_plan_id: nonEmpty(
      receiptBody.promotion_plan_id,
      "regression.promotion_plan_id",
      "REGRESSION_EVIDENCE_REQUIRED",
    ),
    candidate_sha256: hashValue(
      receiptBody.candidate_sha256,
      "regression.candidate_sha256",
      "REGRESSION_EVIDENCE_REQUIRED",
    ),
    target_reference: nonEmpty(
      receiptBody.target_reference,
      "regression.target_reference",
      "REGRESSION_EVIDENCE_REQUIRED",
    ),
    proposed_rule_id: nonEmpty(
      receiptBody.proposed_rule_id,
      "regression.proposed_rule_id",
      "REGRESSION_EVIDENCE_REQUIRED",
    ),
    validation_criterion: nonEmpty(
      receiptBody.validation_criterion,
      "regression.validation_criterion",
      "REGRESSION_EVIDENCE_REQUIRED",
    ),
    case_ids: [
      ...new Set(
        (Array.isArray(receiptBody.case_ids)
          ? receiptBody.case_ids
          : []
        )
          .map((item) =>
            typeof item === "string" ? item.trim() : "",
          )
          .filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right, "en")),
    validator_session_id: nonEmpty(
      receiptBody.validator_session_id,
      "regression.validator_session_id",
      "REGRESSION_EVIDENCE_REQUIRED",
    ),
    validator_code_sha256: hashValue(
      receiptBody.validator_code_sha256,
      "regression.validator_code_sha256",
      "REGRESSION_EVIDENCE_REQUIRED",
    ),
    completed_at: isoTimestamp(
      receiptBody.completed_at,
      "regression.completed_at",
      "REGRESSION_EVIDENCE_REQUIRED",
    ),
  };
  if (
    receiptBody.schema_version !== "1.0" ||
    receiptBody.receipt_type !==
      "learning.promotion.regression" ||
    normalized.status !== "PASS" ||
    normalized.case_ids.length === 0 ||
    normalized.promotion_plan_id !==
      promotionPlan.promotion_plan_id ||
    normalized.candidate_sha256 !==
      promotionPlan.candidate_sha256 ||
    normalized.target_reference !==
      promotionPlan.target_reference ||
    normalized.proposed_rule_id !==
      promotionPlan.proposed_rule_id
  ) {
    fail(
      "REGRESSION_EVIDENCE_MISMATCH",
      "regression receipt가 exact promotion plan을 PASS하지 않았습니다.",
    );
  }
  const actualReceiptSha256 = canonicalSha256(normalized);
  if (suppliedReceiptSha256 !== actualReceiptSha256) {
    fail(
      "REGRESSION_EVIDENCE_HASH_MISMATCH",
      "regression receipt가 생성 뒤 변경됐습니다.",
      {
        expected_receipt_sha256: suppliedReceiptSha256,
        actual_receipt_sha256: actualReceiptSha256,
      },
    );
  }
  return {
    ...normalized,
    receipt_sha256: actualReceiptSha256,
  };
}

function splitTableRow(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) {
    return null;
  }
  const cells = line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
  return cells.length === 4 ? cells : null;
}

function parseRuleTable(referenceText, target) {
  const lines = referenceText.replaceAll("\r\n", "\n").split("\n");
  const headerIndex = lines.findIndex((line) =>
    TABLE_HEADER.test(line),
  );
  if (
    headerIndex < 0 ||
    !TABLE_SEPARATOR.test(lines[headerIndex + 1] ?? "")
  ) {
    fail(
      "RULE_TABLE_NOT_FOUND",
      "active reference에서 정본 규칙 표를 찾지 못했습니다.",
    );
  }
  let endIndex = headerIndex + 2;
  const rows = [];
  const ids = new Set();
  while (
    endIndex < lines.length &&
    lines[endIndex].startsWith("|")
  ) {
    const cells = splitTableRow(lines[endIndex]);
    if (!cells) {
      fail(
        "INVALID_RULE_TABLE",
        "규칙 표는 네 열을 가져야 합니다.",
        { line: endIndex + 1 },
      );
    }
    const [ruleId, ruleText, validationCriterion, updatedOn] =
      cells;
    if (
      !RULE_ID.test(ruleId) ||
      !ruleId.startsWith(`${target.prefix}-`) ||
      !ruleText ||
      !validationCriterion ||
      !/^\d{4}-\d{2}-\d{2}$/.test(updatedOn)
    ) {
      fail(
        "INVALID_RULE_TABLE",
        "규칙 표 row의 ID namespace·text·검증 기준·날짜가 유효하지 않습니다.",
        { line: endIndex + 1, rule_id: ruleId },
      );
    }
    if (ids.has(ruleId)) {
      fail(
        "DUPLICATE_RULE_ID",
        "active reference 규칙 표에 중복 ID가 있습니다.",
        { rule_id: ruleId },
      );
    }
    ids.add(ruleId);
    rows.push({
      line_index: endIndex,
      rule_id: ruleId,
      rule_text: ruleText,
      validation_criterion: validationCriterion,
      updated_on: updatedOn,
    });
    endIndex += 1;
  }
  return { lines, rows, end_index: endIndex };
}

function rowHash(row) {
  return canonicalSha256({
    rule_id: row.rule_id,
    rule_text: row.rule_text,
    validation_criterion: row.validation_criterion,
    updated_on: row.updated_on,
  });
}

function renderRuleRow(row) {
  return `| ${row.rule_id} | ${row.rule_text} | ${row.validation_criterion} | ${row.updated_on} |`;
}

function applyRuleRow(referenceText, table, row) {
  const lines = [...table.lines];
  const existing = table.rows.find(
    (item) => item.rule_id === row.rule_id,
  );
  if (existing) {
    lines[existing.line_index] = renderRuleRow(row);
  } else {
    lines.splice(table.end_index, 0, renderRuleRow(row));
  }
  const normalized = lines.join("\n");
  return {
    action: existing ? "update" : "insert",
    previous_rule_row_sha256: existing
      ? rowHash(existing)
      : null,
    reference_text: normalized,
  };
}

async function readReference(referencePath) {
  let info;
  try {
    info = await lstat(referencePath);
  } catch (error) {
    fail(
      "ACTIVE_REFERENCE_MISSING",
      "active reference를 찾을 수 없습니다.",
      { path: referencePath, cause: error?.code },
    );
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    fail(
      "UNSAFE_ACTIVE_REFERENCE",
      "active reference는 symlink가 아닌 일반 파일이어야 합니다.",
      { path: referencePath },
    );
  }
  const bytes = await readFile(referencePath);
  return {
    bytes,
    text: bytes.toString("utf8"),
    sha256: sha256(bytes),
  };
}

function learningStatusDigest(status) {
  return canonicalSha256(status);
}

async function currentState({
  promotionPlan,
  skillRoot,
  projectRoot,
}) {
  const resolved = resolveReferencePath(
    skillRoot,
    promotionPlan.target_reference,
  );
  const reference = await readReference(resolved.absolute);
  const status = await buildLearningStatus({
    skillRoot: resolved.skill,
    projectRoot: absolutePath(
      projectRoot,
      "project_root",
    ),
  });
  return {
    skill_root: resolved.skill,
    project_root: path.resolve(projectRoot),
    reference_path: resolved.absolute,
    target: resolved.target,
    active_reference_sha256: reference.sha256,
    active_reference_bytes: reference.bytes,
    active_reference_text: reference.text,
    learning_status: status,
    learning_status_sha256: learningStatusDigest(status),
  };
}

export async function inspectLearningPromotionState({
  promotionPlan,
  reviewReceipt,
  skillRoot,
  projectRoot,
} = {}) {
  const validated = assertPromotionPlan(
    promotionPlan,
    reviewReceipt,
  );
  const state = await currentState({
    promotionPlan,
    skillRoot,
    projectRoot,
  });
  const table = parseRuleTable(
    state.active_reference_text,
    validated.target,
  );
  return Object.freeze({
    schema_version: "1.0",
    promotion_plan_id: promotionPlan.promotion_plan_id,
    promotion_plan_sha256: validated.plan_sha256,
    review_receipt_id: reviewReceipt.review_receipt_id,
    review_receipt_sha256:
      validated.review_receipt_sha256,
    target_reference: promotionPlan.target_reference,
    proposed_rule_id: promotionPlan.proposed_rule_id,
    active_reference_sha256:
      state.active_reference_sha256,
    learning_status_sha256:
      state.learning_status_sha256,
    learning_status_counts: clone(
      state.learning_status.counts,
    ),
    rule_action: table.rows.some(
      (row) =>
        row.rule_id === promotionPlan.proposed_rule_id,
    )
      ? "update"
      : "insert",
  });
}

function normalizeNonce(value) {
  const nonce = value ?? randomBytes(32).toString("hex");
  if (!NONCE.test(String(nonce))) {
    fail(
      "INVALID_PROMOTION_NONCE",
      "promotion nonce는 32-byte lowercase hex여야 합니다.",
    );
  }
  return String(nonce);
}

export async function createLearningPromotionChallenge({
  promotionPlan,
  reviewReceipt,
  regressionEvidence,
  sanitizationContext,
  skillRoot,
  projectRoot,
  frozenActiveReferenceSha256,
  learningStatusBeforeSha256,
  nonce,
} = {}) {
  const validated = assertPromotionPlan(
    promotionPlan,
    reviewReceipt,
  );
  const regression = assertRegressionEvidence(
    regressionEvidence,
    promotionPlan,
  );
  const context = normalizedSensitiveTerms(
    sanitizationContext,
  );
  const sanitization = rescanPromotionContent(
    promotionPlan,
    regression,
    context,
  );
  const state = await currentState({
    promotionPlan,
    skillRoot,
    projectRoot,
  });
  const expectedReferenceSha256 = hashValue(
    frozenActiveReferenceSha256,
    "frozen_active_reference_sha256",
    "ACTIVE_REFERENCE_HASH_REQUIRED",
  );
  const expectedStatusSha256 = hashValue(
    learningStatusBeforeSha256,
    "learning_status_before_sha256",
    "LEARNING_STATUS_HASH_REQUIRED",
  );
  if (
    state.active_reference_sha256 !==
    expectedReferenceSha256
  ) {
    fail(
      "ACTIVE_REFERENCE_DRIFT",
      "challenge 생성 전 active reference가 frozen hash와 다릅니다.",
      {
        expected: expectedReferenceSha256,
        actual: state.active_reference_sha256,
      },
    );
  }
  if (
    state.learning_status_sha256 !== expectedStatusSha256
  ) {
    fail(
      "LEARNING_STATUS_DRIFT",
      "challenge 생성 전 learning-status가 before hash와 다릅니다.",
      {
        expected: expectedStatusSha256,
        actual: state.learning_status_sha256,
      },
    );
  }
  const table = parseRuleTable(
    state.active_reference_text,
    validated.target,
  );
  const existing = table.rows.find(
    (row) =>
      row.rule_id === promotionPlan.proposed_rule_id,
  );
  const challengeNonce = normalizeNonce(nonce);
  const challengeBody = {
    schema_version: "1.0",
    challenge_type: "learning.promotion.user_approval",
    promotion_plan_id: promotionPlan.promotion_plan_id,
    promotion_plan_sha256: validated.plan_sha256,
    review_receipt_id: reviewReceipt.review_receipt_id,
    review_receipt_sha256:
      validated.review_receipt_sha256,
    candidate_sha256: promotionPlan.candidate_sha256,
    target_reference: promotionPlan.target_reference,
    proposed_rule_id: promotionPlan.proposed_rule_id,
    proposed_rule_sha256:
      promotionPlan.proposed_rule_sha256,
    proposed_rule_text: promotionPlan.proposed_rule_text,
    validation_criterion:
      regression.validation_criterion,
    regression_receipt_id: regression.receipt_id,
    regression_receipt_sha256:
      regression.receipt_sha256,
    sanitization_context_sha256:
      context.context_sha256,
    sanitization_status: sanitization.scan_status,
    frozen_active_reference_sha256:
      expectedReferenceSha256,
    learning_status_before_sha256:
      expectedStatusSha256,
    learning_status_before_counts: clone(
      state.learning_status.counts,
    ),
    rule_action: existing ? "update" : "insert",
    previous_rule_row_sha256: existing
      ? rowHash(existing)
      : null,
    producer_session_id:
      validated.producer_session_id,
    reviewer_session_id:
      validated.reviewer_session_id,
    nonce: challengeNonce,
  };
  const challengeSha256 = canonicalSha256(challengeBody);
  return Object.freeze({
    ...challengeBody,
    challenge_id:
      `learning-promotion-challenge-${challengeSha256.slice(0, 24)}`,
    challenge_sha256: challengeSha256,
    active_reference_write_allowed: false,
    writes_performed: false,
  });
}

function assertChallenge(
  challenge,
  promotionPlan,
  reviewReceipt,
  regression,
  context,
) {
  if (
    !challenge ||
    challenge.challenge_type !==
      "learning.promotion.user_approval" ||
    challenge.active_reference_write_allowed !== false ||
    challenge.writes_performed !== false
  ) {
    fail(
      "INVALID_PROMOTION_CHALLENGE",
      "write-disabled promotion challenge가 필요합니다.",
    );
  }
  const {
    challenge_id: suppliedId,
    challenge_sha256: suppliedSha256,
    active_reference_write_allowed:
      _activeReferenceWriteAllowed,
    writes_performed: _writesPerformed,
    ...challengeBody
  } = challenge;
  const actualSha256 = canonicalSha256(challengeBody);
  if (
    suppliedSha256 !== actualSha256 ||
    suppliedId !==
      `learning-promotion-challenge-${actualSha256.slice(0, 24)}`
  ) {
    fail(
      "PROMOTION_CHALLENGE_HASH_MISMATCH",
      "promotion challenge가 생성 뒤 변경됐습니다.",
    );
  }
  const exact = {
    promotion_plan_id: promotionPlan.promotion_plan_id,
    promotion_plan_sha256:
      canonicalSha256(promotionPlan),
    review_receipt_id: reviewReceipt.review_receipt_id,
    review_receipt_sha256:
      canonicalSha256(reviewReceipt),
    candidate_sha256: promotionPlan.candidate_sha256,
    target_reference: promotionPlan.target_reference,
    proposed_rule_id: promotionPlan.proposed_rule_id,
    proposed_rule_sha256:
      promotionPlan.proposed_rule_sha256,
    proposed_rule_text: promotionPlan.proposed_rule_text,
    regression_receipt_id: regression.receipt_id,
    regression_receipt_sha256:
      regression.receipt_sha256,
    sanitization_context_sha256:
      context.context_sha256,
    validation_criterion:
      regression.validation_criterion,
    sanitization_status: "PASS",
    producer_session_id:
      reviewReceipt.producer_session_id,
    reviewer_session_id:
      reviewReceipt.reviewer_session_id,
  };
  for (const [field, expected] of Object.entries(exact)) {
    if (challenge[field] !== expected) {
      fail(
        "PROMOTION_CHALLENGE_SUBJECT_MISMATCH",
        "challenge가 exact plan·review·regression·sanitize context와 다릅니다.",
        { field, expected, actual: challenge[field] },
      );
    }
  }
  normalizeNonce(challenge.nonce);
  return actualSha256;
}

function assertApprovalProof(
  approvalProof,
  challenge,
  reviewReceipt,
) {
  if (
    !approvalProof ||
    typeof approvalProof !== "object" ||
    Array.isArray(approvalProof)
  ) {
    fail(
      "USER_APPROVAL_REQUIRED",
      "exact challenge에 대한 사용자 approval proof가 필요합니다.",
    );
  }
  const {
    approval_proof_sha256: suppliedSha256,
    ...proofBody
  } = approvalProof;
  const normalized = {
    schema_version: "1.0",
    approval_kind: "user_promotion_approval",
    challenge_id: nonEmpty(
      proofBody.challenge_id,
      "approval.challenge_id",
      "USER_APPROVAL_REQUIRED",
    ),
    challenge_sha256: hashValue(
      proofBody.challenge_sha256,
      "approval.challenge_sha256",
      "USER_APPROVAL_REQUIRED",
    ),
    promotion_plan_sha256: hashValue(
      proofBody.promotion_plan_sha256,
      "approval.promotion_plan_sha256",
      "USER_APPROVAL_REQUIRED",
    ),
    nonce: nonEmpty(
      proofBody.nonce,
      "approval.nonce",
      "USER_APPROVAL_REQUIRED",
    ),
    decision: String(
      proofBody.decision ?? "",
    ).toLowerCase(),
    approver: {
      kind: nonEmpty(
        proofBody.approver?.kind,
        "approval.approver.kind",
        "USER_APPROVAL_REQUIRED",
      ),
      approver_id: nonEmpty(
        proofBody.approver?.approver_id,
        "approval.approver.approver_id",
        "USER_APPROVAL_REQUIRED",
      ),
      session_id: nonEmpty(
        proofBody.approver?.session_id,
        "approval.approver.session_id",
        "USER_APPROVAL_REQUIRED",
      ),
    },
    approval_channel: nonEmpty(
      proofBody.approval_channel,
      "approval.approval_channel",
      "USER_APPROVAL_REQUIRED",
    ),
    decision_id: nonEmpty(
      proofBody.decision_id,
      "approval.decision_id",
      "USER_APPROVAL_REQUIRED",
    ),
    approved_at: isoTimestamp(
      proofBody.approved_at,
      "approval.approved_at",
      "USER_APPROVAL_REQUIRED",
    ),
  };
  if (
    normalized.approval_kind !==
      proofBody.approval_kind ||
    normalized.decision !== "approved" ||
    normalized.approver.kind !== "user" ||
    normalized.challenge_id !== challenge.challenge_id ||
    normalized.challenge_sha256 !==
      challenge.challenge_sha256 ||
    normalized.promotion_plan_sha256 !==
      challenge.promotion_plan_sha256 ||
    normalized.nonce !== challenge.nonce
  ) {
    fail(
      "USER_APPROVAL_MISMATCH",
      "approval proof가 exact challenge의 사용자 승인과 다릅니다.",
    );
  }
  if (
    normalized.approver.session_id ===
      reviewReceipt.producer_session_id ||
    normalized.approver.session_id ===
      reviewReceipt.reviewer_session_id
  ) {
    fail(
      "APPROVER_SEPARATION_REQUIRED",
      "approver session은 candidate producer와 reviewer 모두와 달라야 합니다.",
    );
  }
  const actualSha256 = canonicalSha256(normalized);
  if (suppliedSha256 !== actualSha256) {
    fail(
      "USER_APPROVAL_PROOF_HASH_MISMATCH",
      "approval proof가 생성 뒤 변경됐습니다.",
      {
        expected_approval_proof_sha256:
          suppliedSha256,
        actual_approval_proof_sha256: actualSha256,
      },
    );
  }
  return {
    ...normalized,
    approval_proof_sha256: actualSha256,
  };
}

async function nonceAlreadyUsed(ledgerPath) {
  try {
    await lstat(ledgerPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function reserveNonce(
  revisionRoot,
  challenge,
  approval,
) {
  const nonceSha256 = sha256(challenge.nonce);
  const ledgerRoot = path.join(revisionRoot, ".nonce-ledger");
  const ledgerPath = path.join(
    ledgerRoot,
    `${nonceSha256}.json`,
  );
  await mkdir(ledgerRoot, { recursive: true });
  if (await nonceAlreadyUsed(ledgerPath)) {
    fail(
      "PROMOTION_NONCE_REUSED",
      "이미 사용된 promotion nonce입니다.",
      { nonce_sha256: nonceSha256 },
    );
  }
  const entry = {
    schema_version: "1.0",
    nonce_sha256: nonceSha256,
    challenge_id: challenge.challenge_id,
    challenge_sha256: challenge.challenge_sha256,
    approval_proof_sha256:
      approval.approval_proof_sha256,
    reserved_at: approval.approved_at,
  };
  try {
    await writeFile(
      ledgerPath,
      `${JSON.stringify(entry, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail(
        "PROMOTION_NONCE_REUSED",
        "이미 사용된 promotion nonce입니다.",
        { nonce_sha256: nonceSha256 },
      );
    }
    throw error;
  }
  return { nonce_sha256: nonceSha256, ledger_path: ledgerPath };
}

async function assertNonceUnused(
  revisionRoot,
  challenge,
) {
  const nonceSha256 = sha256(challenge.nonce);
  const ledgerPath = path.join(
    revisionRoot,
    ".nonce-ledger",
    `${nonceSha256}.json`,
  );
  if (await nonceAlreadyUsed(ledgerPath)) {
    fail(
      "PROMOTION_NONCE_REUSED",
      "이미 사용된 promotion nonce입니다.",
      { nonce_sha256: nonceSha256 },
    );
  }
}

async function atomicReplace(targetPath, bytes, token) {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.learning-promotion-${token}-${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function expectedCountAfter(
  beforeCounts,
  target,
  action,
) {
  const before = beforeCounts[target.count_key];
  if (!Number.isInteger(before) || before < 0) {
    fail(
      "INVALID_LEARNING_STATUS",
      "learning-status before의 규칙 수가 유효하지 않습니다.",
      { count_key: target.count_key, value: before },
    );
  }
  return before + (action === "insert" ? 1 : 0);
}

export async function commitLearningPromotion({
  challenge,
  approvalProof,
  promotionPlan,
  reviewReceipt,
  regressionEvidence,
  sanitizationContext,
  skillRoot,
  projectRoot,
} = {}) {
  const validated = assertPromotionPlan(
    promotionPlan,
    reviewReceipt,
  );
  const regression = assertRegressionEvidence(
    regressionEvidence,
    promotionPlan,
  );
  const context = normalizedSensitiveTerms(
    sanitizationContext,
  );
  const sanitization = rescanPromotionContent(
    promotionPlan,
    regression,
    context,
  );
  assertChallenge(
    challenge,
    promotionPlan,
    reviewReceipt,
    regression,
    context,
  );
  const approval = assertApprovalProof(
    approvalProof,
    challenge,
    reviewReceipt,
  );
  const project = absolutePath(
    projectRoot,
    "project_root",
  );
  const revisionRoot = path.join(
    project,
    ".detail-page",
    "learning-promotions",
  );
  await assertNonceUnused(revisionRoot, challenge);
  const state = await currentState({
    promotionPlan,
    skillRoot,
    projectRoot: project,
  });
  if (
    state.active_reference_sha256 !==
    challenge.frozen_active_reference_sha256
  ) {
    fail(
      "ACTIVE_REFERENCE_DRIFT",
      "사용자 승인 뒤 active reference가 바뀌었습니다.",
      {
        expected:
          challenge.frozen_active_reference_sha256,
        actual: state.active_reference_sha256,
      },
    );
  }
  if (
    state.learning_status_sha256 !==
    challenge.learning_status_before_sha256
  ) {
    fail(
      "LEARNING_STATUS_DRIFT",
      "사용자 승인 뒤 learning-status가 바뀌었습니다.",
      {
        expected:
          challenge.learning_status_before_sha256,
        actual: state.learning_status_sha256,
      },
    );
  }
  const table = parseRuleTable(
    state.active_reference_text,
    validated.target,
  );
  const row = {
    rule_id: promotionPlan.proposed_rule_id,
    rule_text: assertSafeCell(
      promotionPlan.proposed_rule_text,
      "proposed_rule_text",
    ),
    validation_criterion: assertSafeCell(
      regression.validation_criterion,
      "regression.validation_criterion",
    ),
    updated_on: approval.approved_at.slice(0, 10),
  };
  const applied = applyRuleRow(
    state.active_reference_text,
    table,
    row,
  );
  if (
    applied.action !== challenge.rule_action ||
    applied.previous_rule_row_sha256 !==
      challenge.previous_rule_row_sha256
  ) {
    fail(
      "RULE_TABLE_DRIFT",
      "승인한 insert/update 대상 row가 현재 active reference와 다릅니다.",
    );
  }
  const referenceAfterBytes = Buffer.from(
    applied.reference_text,
    "utf8",
  );
  const referenceAfterSha256 = sha256(
    referenceAfterBytes,
  );
  const ruleRowSha256 = rowHash(row);
  const revisionInputs = {
    challenge_sha256: challenge.challenge_sha256,
    approval_proof_sha256:
      approval.approval_proof_sha256,
    active_reference_sha256_before:
      state.active_reference_sha256,
    active_reference_sha256_after:
      referenceAfterSha256,
    rule_row_sha256: ruleRowSha256,
  };
  const revisionId =
    `learning-promotion-rev-${canonicalSha256(revisionInputs).slice(0, 24)}`;
  const finalDirectory = path.join(revisionRoot, revisionId);
  await mkdir(revisionRoot, { recursive: true });
  try {
    await lstat(finalDirectory);
    fail(
      "PROMOTION_REVISION_ALREADY_EXISTS",
      "같은 immutable promotion revision이 이미 존재합니다.",
      { revision_id: revisionId },
    );
  } catch (error) {
    if (
      error instanceof LearningPromotionAdapterError
    ) {
      throw error;
    }
    if (error?.code !== "ENOENT") throw error;
  }
  const stagingDirectory = await mkdtemp(
    path.join(revisionRoot, `.staging-${revisionId}-`),
  );
  let activeReferenceChanged = false;
  let promoted = false;
  try {
    await writeFile(
      path.join(stagingDirectory, "reference.md"),
      referenceAfterBytes,
      { flag: "wx" },
    );
    await writeFile(
      path.join(stagingDirectory, "commit-intent.json"),
      `${JSON.stringify(
        {
          schema_version: "1.0",
          revision_id: revisionId,
          target_reference:
            promotionPlan.target_reference,
          active_reference_sha256_before:
            state.active_reference_sha256,
          active_reference_sha256_after:
            referenceAfterSha256,
          rule_row_sha256: ruleRowSha256,
          challenge_sha256:
            challenge.challenge_sha256,
          approval_proof_sha256:
            approval.approval_proof_sha256,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    const latestReference = await readReference(
      state.reference_path,
    );
    if (
      latestReference.sha256 !==
      state.active_reference_sha256
    ) {
      fail(
        "ACTIVE_REFERENCE_DRIFT",
        "atomic switch 직전 active reference가 바뀌었습니다.",
      );
    }
    const nonceReservation = await reserveNonce(
      revisionRoot,
      challenge,
      approval,
    );
    await atomicReplace(
      state.reference_path,
      referenceAfterBytes,
      revisionId,
    );
    activeReferenceChanged = true;
    const statusAfter = await buildLearningStatus({
      skillRoot: state.skill_root,
      projectRoot: state.project_root,
    });
    const statusAfterSha256 =
      learningStatusDigest(statusAfter);
    const expectedTargetCount = expectedCountAfter(
      challenge.learning_status_before_counts,
      validated.target,
      applied.action,
    );
    if (
      statusAfter.counts[validated.target.count_key] !==
      expectedTargetCount
    ) {
      fail(
        "LEARNING_STATUS_AFTER_MISMATCH",
        "적용 뒤 learning-status의 대상 rule 수가 예상과 다릅니다.",
        {
          count_key: validated.target.count_key,
          expected: expectedTargetCount,
          actual:
            statusAfter.counts[
              validated.target.count_key
            ],
        },
      );
    }
    const receiptBody = {
      schema_version: "1.0",
      receipt_type: "learning.promotion",
      promotion_revision_id: revisionId,
      promotion_plan_id:
        promotionPlan.promotion_plan_id,
      promotion_plan_sha256:
        validated.plan_sha256,
      review_receipt_id:
        reviewReceipt.review_receipt_id,
      review_receipt_sha256:
        validated.review_receipt_sha256,
      challenge_id: challenge.challenge_id,
      challenge_sha256:
        challenge.challenge_sha256,
      approval: {
        approval_proof_sha256:
          approval.approval_proof_sha256,
        approver_id: approval.approver.approver_id,
        approver_session_id:
          approval.approver.session_id,
        approval_channel:
          approval.approval_channel,
        decision_id: approval.decision_id,
        approved_at: approval.approved_at,
      },
      nonce_sha256:
        nonceReservation.nonce_sha256,
      candidate_sha256:
        promotionPlan.candidate_sha256,
      target_reference:
        promotionPlan.target_reference,
      rule_action: applied.action,
      rule_row: {
        ...row,
        rule_row_sha256: ruleRowSha256,
        previous_rule_row_sha256:
          applied.previous_rule_row_sha256,
      },
      active_reference: {
        sha256_before:
          state.active_reference_sha256,
        sha256_after: referenceAfterSha256,
      },
      regression: {
        receipt_id: regression.receipt_id,
        receipt_sha256:
          regression.receipt_sha256,
        case_ids: clone(regression.case_ids),
        validator_session_id:
          regression.validator_session_id,
        completed_at: regression.completed_at,
      },
      sanitization,
      learning_status: {
        sha256_before:
          challenge.learning_status_before_sha256,
        counts_before: clone(
          challenge.learning_status_before_counts,
        ),
        sha256_after: statusAfterSha256,
        counts_after: clone(statusAfter.counts),
      },
      reference_revision: {
        reference_member: "reference.md",
        reference_sha256:
          referenceAfterSha256,
        commit_intent_member:
          "commit-intent.json",
      },
      source_deletion_allowed: false,
      raw_source_deleted: false,
    };
    const promotionReceipt = {
      ...receiptBody,
      promotion_receipt_id:
        `learning-promotion-${canonicalSha256(receiptBody).slice(0, 24)}`,
      promotion_receipt_sha256:
        canonicalSha256(receiptBody),
    };
    await writeFile(
      path.join(
        stagingDirectory,
        "promotion-receipt.json",
      ),
      `${JSON.stringify(promotionReceipt, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(stagingDirectory, finalDirectory);
    promoted = true;
    return Object.freeze({
      schema_version: "1.0",
      stage_id: "P1_LEARNING_PROMOTION",
      status: "committed",
      revision_path: finalDirectory,
      output_artifacts: [
        {
          artifact_id: revisionId,
          artifact_type: "learning.rule_revision",
          type: "learning.rule_revision",
          manifest_sha256:
            promotionReceipt.promotion_receipt_sha256,
          member_ids: [
            "commit-intent.json",
            "promotion-receipt.json",
            "reference.md",
          ],
          target_reference:
            promotionPlan.target_reference,
          rule_id: row.rule_id,
          rule_row_sha256: ruleRowSha256,
          active_reference_sha256:
            referenceAfterSha256,
        },
      ],
      promotion_receipt: promotionReceipt,
    });
  } catch (error) {
    if (activeReferenceChanged && !promoted) {
      await atomicReplace(
        state.reference_path,
        state.active_reference_bytes,
        `${revisionId}-rollback`,
      );
    }
    throw error;
  } finally {
    if (!promoted) {
      await rm(stagingDirectory, {
        recursive: true,
        force: true,
      });
    }
  }
}

function assertSourceDeletionReceipt(
  sourceDeletionReceipt,
  promotionReceipt,
) {
  if (
    !sourceDeletionReceipt ||
    sourceDeletionReceipt.deletion_allowed !== true ||
    sourceDeletionReceipt.deletion_performed !== false ||
    sourceDeletionReceipt.promotion_plan_id !==
      promotionReceipt.promotion_plan_id ||
    sourceDeletionReceipt.candidate_sha256 !==
      promotionReceipt.candidate_sha256 ||
    sourceDeletionReceipt.target_reference !==
      promotionReceipt.target_reference ||
    sourceDeletionReceipt.proposed_rule_id !==
      promotionReceipt.rule_row.rule_id ||
    sourceDeletionReceipt.proposed_rule_sha256 !==
      sha256(promotionReceipt.rule_row.rule_text) ||
    sourceDeletionReceipt.verification
      ?.active_reference_sha256 !==
      promotionReceipt.active_reference.sha256_after ||
    sourceDeletionReceipt.verification
      ?.regression_receipt_sha256 !==
      promotionReceipt.regression.receipt_sha256 ||
    sourceDeletionReceipt.verification
      ?.learning_status_receipt_sha256 !==
      promotionReceipt.learning_status.sha256_after
  ) {
    fail(
      "SOURCE_DELETION_RECEIPT_MISMATCH",
      "archive plan에는 promotion·regression·learning-status와 일치하는 deletion_allowed receipt가 필요합니다.",
    );
  }
  if (
    !Array.isArray(
      sourceDeletionReceipt.transient_source_ids,
    ) ||
    sourceDeletionReceipt.transient_source_ids.length === 0
  ) {
    fail(
      "SOURCE_DELETION_RECEIPT_MISMATCH",
      "archive할 transient source ID가 필요합니다.",
    );
  }
}

export function createSourceArchivePlan({
  promotionReceipt,
  sourceDeletionReceipt,
} = {}) {
  assertSourceDeletionReceipt(
    sourceDeletionReceipt,
    promotionReceipt,
  );
  const sourceIds = [
    ...new Set(
      sourceDeletionReceipt.transient_source_ids.map(
        (item) => nonEmpty(
          item,
          "transient_source_id",
          "UNSAFE_TRANSIENT_SOURCE_ID",
        ),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right, "en"));
  for (const sourceId of sourceIds) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(sourceId) ||
      URL_PATTERN.test(sourceId) ||
      PATH_PATTERNS.some((pattern) => pattern.test(sourceId))
    ) {
      fail(
        "UNSAFE_TRANSIENT_SOURCE_ID",
        "archive plan은 raw 경로가 아닌 opaque source ID만 받을 수 있습니다.",
        { source_id: sourceId },
      );
    }
  }
  const planBody = {
    schema_version: "1.0",
    action: "ARCHIVE_TRANSIENT_SOURCES",
    promotion_revision_id:
      promotionReceipt.promotion_revision_id,
    promotion_receipt_id:
      promotionReceipt.promotion_receipt_id,
    promotion_receipt_sha256:
      promotionReceipt.promotion_receipt_sha256,
    source_deletion_receipt_id:
      sourceDeletionReceipt.source_deletion_receipt_id,
    operations: sourceIds.map((sourceId) => ({
      source_id: sourceId,
      operation: "archive",
      archive_relative_locator:
        `${promotionReceipt.promotion_revision_id}/${sha256(sourceId).slice(0, 20)}.archive`,
    })),
    raw_delete_allowed: false,
    deletion_performed: false,
    archive_performed: false,
  };
  const archivePlanSha256 = canonicalSha256(planBody);
  return Object.freeze({
    ...planBody,
    archive_plan_id:
      `learning-archive-plan-${archivePlanSha256.slice(0, 24)}`,
    archive_plan_sha256: archivePlanSha256,
  });
}

export async function listLearningPromotionRevisions({
  projectRoot,
} = {}) {
  const root = path.join(
    absolutePath(projectRoot, "project_root"),
    ".detail-page",
    "learning-promotions",
  );
  try {
    const entries = await readdir(root, {
      withFileTypes: true,
    });
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith(
            "learning-promotion-rev-",
          ),
      )
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
