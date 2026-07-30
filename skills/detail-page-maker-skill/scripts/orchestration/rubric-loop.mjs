import { createHash } from "node:crypto";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const VALIDATOR_KINDS = new Set(["deterministic", "model", "human"]);
const CHECK_STATUSES = new Set(["PASS", "FAIL"]);
const CHECK_SEVERITIES = new Set(["hard", "warning", "info"]);
const ACTIVE_BUDGET_STATES = new Set(["AVAILABLE", "WARNING"]);
const BLOCKED_BUDGET_STATES = new Set([
  "EXHAUSTED",
  "EXCEEDED",
  "INSUFFICIENT",
  "OVER_BUDGET",
  "DEPLETED",
  "BLOCKED",
]);

export class RubricLoopError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RubricLoopError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new RubricLoopError(code, message, details);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return SHA256_PATTERN.test(String(value ?? ""));
}

function isFiniteScore(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function isNonEmptyStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isNonEmptyString)
  );
}

function sortedUnique(values) {
  return [...new Set(values.map(String))].sort();
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

function clone(value) {
  return structuredClone(value);
}

function withoutRubricHash(definition) {
  const copy = clone(definition);
  delete copy.rubric_sha256;
  return copy;
}

export function rubricDefinitionHash(definition) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(withoutRubricHash(definition))))
    .digest("hex");
}

function validateStopPolicy(policy) {
  const errors = [];
  if (!isNonEmptyString(policy?.policy_id)) errors.push("stop_policy.policy_id");
  if (!isNonEmptyString(policy?.version)) errors.push("stop_policy.version");
  for (const field of [
    "max_total_attempts",
    "max_section_attempts",
    "recurring_issue_limit",
    "plateau_window",
  ]) {
    if (!Number.isInteger(policy?.[field]) || policy[field] < 1) {
      errors.push(`stop_policy.${field}`);
    }
  }
  if (
    !Number.isFinite(policy?.min_score_improvement) ||
    policy.min_score_improvement < 0
  ) {
    errors.push("stop_policy.min_score_improvement");
  }
  return errors;
}

export function validateRubricDefinition(definition) {
  const errors = [];
  if (definition?.schema_version !== "1.0") errors.push("schema_version");
  if (!isNonEmptyString(definition?.rubric_id)) errors.push("rubric_id");
  if (!isNonEmptyString(definition?.version)) errors.push("version");
  if (!isNonEmptyString(definition?.source_snapshot?.snapshot_id)) {
    errors.push("source_snapshot.snapshot_id");
  }
  if (!isSha256(definition?.source_snapshot?.sha256)) {
    errors.push("source_snapshot.sha256");
  }
  if (!isNonEmptyString(definition?.policy?.policy_id)) {
    errors.push("policy.policy_id");
  }
  if (!isSha256(definition?.policy?.sha256)) errors.push("policy.sha256");
  if (!Array.isArray(definition?.dimensions) || definition.dimensions.length < 1) {
    errors.push("dimensions");
  }

  const dimensionIds = new Set();
  let totalWeight = 0;
  for (const [index, dimension] of (definition?.dimensions ?? []).entries()) {
    const at = `dimensions[${index}]`;
    if (!isNonEmptyString(dimension?.dimension_id)) {
      errors.push(`${at}.dimension_id`);
    } else if (dimensionIds.has(dimension.dimension_id)) {
      errors.push(`${at}.dimension_id:duplicate`);
    } else {
      dimensionIds.add(dimension.dimension_id);
    }
    if (!VALIDATOR_KINDS.has(dimension?.validator_kind)) {
      errors.push(`${at}.validator_kind`);
    }
    if (!Number.isFinite(dimension?.weight) || dimension.weight <= 0) {
      errors.push(`${at}.weight`);
    } else {
      totalWeight += dimension.weight;
    }
    if (!isFiniteScore(dimension?.min_score)) errors.push(`${at}.min_score`);
    if (typeof dimension?.hard_gate !== "boolean") {
      errors.push(`${at}.hard_gate`);
    }
    if (!isNonEmptyStringArray(dimension?.evidence_requirement)) {
      errors.push(`${at}.evidence_requirement`);
    }
    if (!isNonEmptyStringArray(dimension?.applicable_section_types)) {
      errors.push(`${at}.applicable_section_types`);
    }
    if (
      !dimension?.issue_to_repair_scope_code ||
      typeof dimension.issue_to_repair_scope_code !== "object" ||
      Array.isArray(dimension.issue_to_repair_scope_code)
    ) {
      errors.push(`${at}.issue_to_repair_scope_code`);
    } else if (
      !Object.entries(dimension.issue_to_repair_scope_code).every(
        ([issueCode, scopeCode]) =>
          isNonEmptyString(issueCode) && isNonEmptyString(scopeCode),
      )
    ) {
      errors.push(`${at}.issue_to_repair_scope_code:entry`);
    }
    if (
      !Array.isArray(dimension?.hard_failure_codes) ||
      !dimension.hard_failure_codes.every(isNonEmptyString)
    ) {
      errors.push(`${at}.hard_failure_codes`);
    }
  }
  if (!(totalWeight > 0)) errors.push("dimensions.weight_total");
  errors.push(...validateStopPolicy(definition?.stop_policy));

  const expectedHash = rubricDefinitionHash(definition ?? {});
  if (!isSha256(definition?.rubric_sha256)) {
    errors.push("rubric_sha256");
  } else if (definition.rubric_sha256 !== expectedHash) {
    errors.push("rubric_sha256:mismatch");
  }
  return { ok: errors.length === 0, errors, expected_hash: expectedHash };
}

export function assertRubricDefinition(definition) {
  const validation = validateRubricDefinition(definition);
  if (!validation.ok) {
    fail(
      "INVALID_RUBRIC_DEFINITION",
      "RubricDefinition 계약을 충족하지 않습니다.",
      validation,
    );
  }
  return clone(definition);
}

function rubricIdentityMatches(result, definition) {
  return (
    result?.rubric_id === definition.rubric_id &&
    result?.rubric_version === definition.version &&
    result?.rubric_sha256 === definition.rubric_sha256
  );
}

export function validateRubricResult(result, definition) {
  const errors = [];
  let rubric;
  try {
    rubric = assertRubricDefinition(definition);
  } catch (error) {
    return {
      ok: false,
      errors: ["rubric_definition"],
      cause: error,
    };
  }
  if (result?.schema_version !== "1.0") errors.push("schema_version");
  if (!isNonEmptyString(result?.result_id)) errors.push("result_id");
  if (!rubricIdentityMatches(result, rubric)) errors.push("rubric_identity");
  if (!isNonEmptyString(result?.subject?.artifact_id)) {
    errors.push("subject.artifact_id");
  }
  if (!isSha256(result?.subject?.manifest_sha256)) {
    errors.push("subject.manifest_sha256");
  }
  if (
    result?.subject?.lineage_id !== undefined &&
    !isNonEmptyString(result.subject.lineage_id)
  ) {
    errors.push("subject.lineage_id");
  }
  if (!isSha256(result?.benchmark_sha256)) errors.push("benchmark_sha256");
  if (!isFiniteScore(result?.score)) errors.push("score");
  if (!isNonEmptyStringArray(result?.viewport_capture_ids)) {
    errors.push("viewport_capture_ids");
  }
  if (
    !isNonEmptyString(result?.evaluated_at) ||
    Number.isNaN(Date.parse(result.evaluated_at))
  ) {
    errors.push("evaluated_at");
  }

  const evaluators = new Map();
  if (!Array.isArray(result?.evaluators) || result.evaluators.length < 1) {
    errors.push("evaluators");
  }
  for (const [index, evaluator] of (result?.evaluators ?? []).entries()) {
    const at = `evaluators[${index}]`;
    if (!isNonEmptyString(evaluator?.evaluator_id)) {
      errors.push(`${at}.evaluator_id`);
      continue;
    }
    if (evaluators.has(evaluator.evaluator_id)) {
      errors.push(`${at}.evaluator_id:duplicate`);
    }
    evaluators.set(evaluator.evaluator_id, evaluator);
    if (!VALIDATOR_KINDS.has(evaluator?.validator_kind)) {
      errors.push(`${at}.validator_kind`);
    }
    if (!isSha256(evaluator?.code_sha256)) errors.push(`${at}.code_sha256`);
    if (evaluator?.validator_kind === "model") {
      if (!isNonEmptyString(evaluator?.model_id)) errors.push(`${at}.model_id`);
      if (!isSha256(evaluator?.prompt_sha256)) {
        errors.push(`${at}.prompt_sha256`);
      }
    }
  }

  const dimensionById = new Map(
    rubric.dimensions.map((dimension) => [dimension.dimension_id, dimension]),
  );
  if (!Array.isArray(result?.checks) || result.checks.length < 1) {
    errors.push("checks");
  }
  const checkIds = new Set();
  for (const [index, check] of (result?.checks ?? []).entries()) {
    const at = `checks[${index}]`;
    if (!isNonEmptyString(check?.check_id)) {
      errors.push(`${at}.check_id`);
    } else if (checkIds.has(check.check_id)) {
      errors.push(`${at}.check_id:duplicate`);
    } else {
      checkIds.add(check.check_id);
    }
    const dimension = dimensionById.get(check?.dimension_id);
    if (!dimension) errors.push(`${at}.dimension_id`);
    if (!VALIDATOR_KINDS.has(check?.evaluator_kind)) {
      errors.push(`${at}.evaluator_kind`);
    } else if (
      dimension &&
      check.evaluator_kind !== dimension.validator_kind
    ) {
      errors.push(`${at}.evaluator_kind:mismatch`);
    }
    const evaluator = evaluators.get(check?.evaluator_id);
    if (!evaluator) {
      errors.push(`${at}.evaluator_id`);
    } else if (evaluator.validator_kind !== check.evaluator_kind) {
      errors.push(`${at}.evaluator_id:kind_mismatch`);
    }
    if (!CHECK_STATUSES.has(check?.status)) errors.push(`${at}.status`);
    if (!CHECK_SEVERITIES.has(check?.severity)) errors.push(`${at}.severity`);
    if (!isFiniteScore(check?.score)) errors.push(`${at}.score`);
    if (
      !Number.isFinite(check?.confidence) ||
      check.confidence < 0 ||
      check.confidence > 1
    ) {
      errors.push(`${at}.confidence`);
    }
    if (!isNonEmptyStringArray(check?.evidence_artifact_ids)) {
      errors.push(`${at}.evidence_artifact_ids`);
    }
    if (!isNonEmptyStringArray(check?.evidence_locators)) {
      errors.push(`${at}.evidence_locators`);
    }
    if (
      check?.status === "FAIL" &&
      !isNonEmptyString(check?.issue_code)
    ) {
      errors.push(`${at}.issue_code`);
    }
    if (
      check?.status === "PASS" &&
      check?.issue_code !== null &&
      check?.issue_code !== undefined
    ) {
      errors.push(`${at}.issue_code:pass`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertRubricResult(result, definition) {
  if (result?.rubric_sha256 !== definition?.rubric_sha256) {
    fail(
      "RUBRIC_HASH_MISMATCH",
      "RubricResult의 rubric hash가 RubricDefinition과 다릅니다.",
      {
        expected: definition?.rubric_sha256,
        actual: result?.rubric_sha256,
      },
    );
  }
  const validation = validateRubricResult(result, definition);
  if (!validation.ok) {
    fail(
      "INVALID_RUBRIC_RESULT",
      "RubricResult 계약을 충족하지 않습니다.",
      validation,
    );
  }
  return clone(result);
}

function failedIssueKeys(result) {
  return sortedUnique(
    result.checks
      .filter((check) => check.status === "FAIL")
      .map((check) => `${check.issue_code}::${check.section_id ?? "*"}`),
  );
}

function sha256Of(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function createRubricDelta(previous, current, definition) {
  const before = assertRubricResult(previous, definition);
  const after = assertRubricResult(current, definition);
  if (before.rubric_sha256 !== after.rubric_sha256) {
    fail(
      "RUBRIC_HASH_MISMATCH",
      "서로 다른 rubric hash의 결과는 비교할 수 없습니다.",
      {
        previous: before.rubric_sha256,
        current: after.rubric_sha256,
      },
    );
  }
  if (before.benchmark_sha256 !== after.benchmark_sha256) {
    fail(
      "RUBRIC_BENCHMARK_MISMATCH",
      "서로 다른 benchmark snapshot의 결과는 delta로 비교할 수 없습니다.",
      {
        previous: before.benchmark_sha256,
        current: after.benchmark_sha256,
      },
    );
  }
  const evaluatorFingerprint = (result) =>
    result.evaluators
      .map((evaluator) => ({
        evaluator_id: evaluator.evaluator_id,
        validator_kind: evaluator.validator_kind,
        code_sha256: evaluator.code_sha256,
        model_id: evaluator.model_id ?? null,
        prompt_sha256: evaluator.prompt_sha256 ?? null,
      }))
      .sort((left, right) =>
        left.evaluator_id.localeCompare(right.evaluator_id),
      );
  const beforeEvaluatorSet = evaluatorFingerprint(before);
  const afterEvaluatorSet = evaluatorFingerprint(after);
  const beforeEvaluatorSetSha256 = sha256Of(beforeEvaluatorSet);
  const afterEvaluatorSetSha256 = sha256Of(afterEvaluatorSet);
  if (beforeEvaluatorSetSha256 !== afterEvaluatorSetSha256) {
    fail(
      "RUBRIC_EVALUATOR_MISMATCH",
      "evaluator code/model/prompt 구성이 다른 결과는 delta로 비교할 수 없습니다.",
      {
        previous: beforeEvaluatorSetSha256,
        current: afterEvaluatorSetSha256,
      },
    );
  }
  const beforeLineage =
    before.subject.lineage_id ?? before.subject.artifact_id;
  const afterLineage =
    after.subject.lineage_id ?? after.subject.artifact_id;
  if (beforeLineage !== afterLineage) {
    fail(
      "RUBRIC_SUBJECT_MISMATCH",
      "같은 subject 계열의 결과만 delta로 비교할 수 있습니다.",
      {
        previous: beforeLineage,
        current: afterLineage,
      },
    );
  }

  const beforeIssues = new Set(failedIssueKeys(before));
  const afterIssues = new Set(failedIssueKeys(after));
  const body = {
    schema_version: "1.0",
    delta_id: `delta-${sha256Of([
      before.result_id,
      after.result_id,
      definition.rubric_sha256,
    ]).slice(0, 20)}`,
    rubric_id: definition.rubric_id,
    rubric_version: definition.version,
    rubric_sha256: definition.rubric_sha256,
    benchmark_sha256: before.benchmark_sha256,
    evaluator_set_sha256: beforeEvaluatorSetSha256,
    subject_artifact_id: before.subject.artifact_id,
    subject_lineage_id: beforeLineage,
    previous_result_id: before.result_id,
    current_result_id: after.result_id,
    score_delta: Number((after.score - before.score).toFixed(6)),
    resolved_issue_keys: sortedUnique(
      [...beforeIssues].filter((key) => !afterIssues.has(key)),
    ),
    introduced_issue_keys: sortedUnique(
      [...afterIssues].filter((key) => !beforeIssues.has(key)),
    ),
    recurring_issue_keys: sortedUnique(
      [...afterIssues].filter((key) => beforeIssues.has(key)),
    ),
  };
  return { ...body, delta_sha256: sha256Of(body) };
}

export function validateRubricDelta(delta, definition) {
  const errors = [];
  let rubric;
  try {
    rubric = assertRubricDefinition(definition);
  } catch (error) {
    return { ok: false, errors: ["rubric_definition"], cause: error };
  }
  if (delta?.schema_version !== "1.0") errors.push("schema_version");
  if (!isNonEmptyString(delta?.delta_id)) errors.push("delta_id");
  if (
    delta?.rubric_id !== rubric.rubric_id ||
    delta?.rubric_version !== rubric.version
  ) {
    errors.push("rubric_identity");
  }
  if (!isNonEmptyString(delta?.subject_artifact_id)) {
    errors.push("subject_artifact_id");
  }
  if (!isNonEmptyString(delta?.previous_result_id)) {
    errors.push("previous_result_id");
  }
  if (!isNonEmptyString(delta?.current_result_id)) {
    errors.push("current_result_id");
  }
  if (!isSha256(delta?.benchmark_sha256)) {
    errors.push("benchmark_sha256");
  }
  if (!isSha256(delta?.evaluator_set_sha256)) {
    errors.push("evaluator_set_sha256");
  }
  if (!Number.isFinite(delta?.score_delta)) errors.push("score_delta");
  for (const field of [
    "resolved_issue_keys",
    "introduced_issue_keys",
    "recurring_issue_keys",
  ]) {
    if (
      !Array.isArray(delta?.[field]) ||
      !delta[field].every(isNonEmptyString)
    ) {
      errors.push(field);
    }
  }
  const body = clone(delta ?? {});
  delete body.delta_sha256;
  if (!isSha256(delta?.delta_sha256) || delta.delta_sha256 !== sha256Of(body)) {
    errors.push("delta_sha256");
  }
  return { ok: errors.length === 0, errors };
}

export function assertRubricDelta(delta, definition) {
  if (delta?.rubric_sha256 !== definition?.rubric_sha256) {
    fail(
      "RUBRIC_HASH_MISMATCH",
      "RubricDelta의 rubric hash가 RubricDefinition과 다릅니다.",
      {
        expected: definition?.rubric_sha256,
        actual: delta?.rubric_sha256,
      },
    );
  }
  const validation = validateRubricDelta(delta, definition);
  if (!validation.ok) {
    fail(
      "INVALID_RUBRIC_DELTA",
      "RubricDelta 계약을 충족하지 않습니다.",
      validation,
    );
  }
  return clone(delta);
}

function weightedScore(result, definition, validatorKind = undefined) {
  const matching = definition.dimensions.filter(
    (dimension) =>
      validatorKind === undefined ||
      dimension.validator_kind === validatorKind,
  );
  let weight = 0;
  let score = 0;
  for (const dimension of matching) {
    const checks = result.checks.filter(
      (check) => check.dimension_id === dimension.dimension_id,
    );
    if (checks.length === 0) continue;
    const dimensionScore =
      checks.reduce((sum, check) => sum + check.score, 0) / checks.length;
    weight += dimension.weight;
    score += dimensionScore * dimension.weight;
  }
  return weight === 0 ? null : Number((score / weight).toFixed(6));
}

export function evaluatePublishGate(
  result,
  definition,
  {
    target_score = 97,
    behance_weighted_target = 90,
    critical_dimension_target = 85,
  } = {},
) {
  const evaluated = assertRubricResult(result, definition);
  const deterministicHardFailures = evaluated.checks.filter(
    (check) =>
      check.evaluator_kind === "deterministic" &&
      check.status === "FAIL" &&
      check.severity === "hard",
  );
  const dimensionScores = Object.fromEntries(
    definition.dimensions.map((dimension) => [
      dimension.dimension_id,
      weightedScore(
        {
          ...evaluated,
          checks: evaluated.checks.filter(
            (check) => check.dimension_id === dimension.dimension_id,
          ),
        },
        { dimensions: [dimension] },
      ),
    ]),
  );
  const criticalFailures = definition.dimensions
    .filter((dimension) => dimension.hard_gate)
    .filter((dimension) => {
      const score = dimensionScores[dimension.dimension_id];
      return score === null || score < critical_dimension_target;
    })
    .map((dimension) => dimension.dimension_id)
    .sort();
  const behanceWeightedScore = weightedScore(evaluated, definition, "model");
  const reasons = [];
  if (deterministicHardFailures.length > 0) {
    reasons.push("DETERMINISTIC_HARD_FAILURE");
  }
  if (evaluated.score < target_score) reasons.push("PUBLISH_SCORE_BELOW_TARGET");
  if (
    behanceWeightedScore !== null &&
    behanceWeightedScore < behance_weighted_target
  ) {
    reasons.push("BEHANCE_WEIGHTED_SCORE_BELOW_TARGET");
  }
  if (criticalFailures.length > 0) {
    reasons.push("CRITICAL_DIMENSION_BELOW_TARGET");
  }
  return {
    publish_allowed: reasons.length === 0,
    reasons,
    score: evaluated.score,
    behance_weighted_score: behanceWeightedScore,
    critical_dimension_failures: criticalFailures,
    blocking_issue_keys: sortedUnique(
      deterministicHardFailures.map(
        (check) => `${check.issue_code}::${check.section_id ?? "*"}`,
      ),
    ),
    rubric_sha256: definition.rubric_sha256,
  };
}

export function evaluateStopPolicy({ policy, history = [], budget }) {
  const policyErrors = validateStopPolicy(policy);
  if (policyErrors.length > 0) {
    fail(
      "INVALID_STOP_POLICY",
      "versioned stop policy 계약을 충족하지 않습니다.",
      { errors: policyErrors },
    );
  }
  if (!budget || !isNonEmptyString(budget.state)) {
    fail("INVALID_BUDGET_STATE", "budget.state가 필요합니다.");
  }
  if (BLOCKED_BUDGET_STATES.has(budget.state)) {
    return {
      action: "BUDGET_AWAITING_USER",
      reasons: ["BUDGET_EXHAUSTED"],
      policy_id: policy.policy_id,
      policy_version: policy.version,
      budget_state: budget.state,
    };
  }
  if (!ACTIVE_BUDGET_STATES.has(budget.state)) {
    fail("INVALID_BUDGET_STATE", "알 수 없는 budget.state입니다.", {
      state: budget.state,
    });
  }

  const reasons = [];
  const hasExplicitScopeKinds = history.some((attempt) =>
    isNonEmptyString(attempt?.scope_kind),
  );
  const fullPageAttempts = hasExplicitScopeKinds
    ? history.filter((attempt) => attempt.scope_kind === "full_page")
    : history;
  if (fullPageAttempts.length >= policy.max_total_attempts) {
    reasons.push("MAX_TOTAL_ATTEMPTS");
  }
  const sectionCounts = new Map();
  const issueCounts = new Map();
  for (const attempt of history) {
    for (const sectionId of new Set(attempt.section_ids ?? [])) {
      sectionCounts.set(sectionId, (sectionCounts.get(sectionId) ?? 0) + 1);
    }
    for (const issueKey of new Set(attempt.failed_issue_keys ?? [])) {
      issueCounts.set(issueKey, (issueCounts.get(issueKey) ?? 0) + 1);
    }
  }
  if (
    [...sectionCounts.values()].some(
      (count) => count >= policy.max_section_attempts,
    )
  ) {
    reasons.push("MAX_SECTION_ATTEMPTS");
  }
  if (
    [...issueCounts.values()].some(
      (count) => count >= policy.recurring_issue_limit,
    )
  ) {
    reasons.push("RECURRING_ISSUE");
  }
  const improvements = history
    .slice(1)
    .map((attempt, index) => attempt.score - history[index].score);
  const recentImprovements = improvements.slice(-policy.plateau_window);
  if (
    recentImprovements.length === policy.plateau_window &&
    recentImprovements.every(
      (improvement) => improvement < policy.min_score_improvement,
    )
  ) {
    reasons.push("SCORE_PLATEAU");
  }
  return {
    action: reasons.length > 0 ? "PLATEAU_AWAITING_USER" : "CONTINUE",
    reasons,
    policy_id: policy.policy_id,
    policy_version: policy.version,
    budget_state: budget.state,
    attempts_used: history.length,
    section_attempts: Object.fromEntries(
      [...sectionCounts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

export const ISSUE_REPAIR_SCOPES = Object.freeze({
  COPY_TONE: Object.freeze({
    scope_code: "copy-and-html",
    root_types: Object.freeze(["content.section_plan", "page.html_revision"]),
    descendant_types: Object.freeze(["page.html_revision"]),
  }),
  VISUAL_HIERARCHY: Object.freeze({
    scope_code: "section-layout-token-and-html",
    root_types: Object.freeze([
      "design.section_layout",
      "design.token_set",
      "page.html_revision",
    ]),
    descendant_types: Object.freeze(["page.html_revision"]),
  }),
  PRODUCT_IDENTITY_MISMATCH: Object.freeze({
    scope_code: "image-gif-and-section",
    root_types: Object.freeze(["media.image_candidate"]),
    descendant_types: Object.freeze([
      "media.gif_candidate",
      "page.section_graph_resolved",
      "page.html_revision",
    ]),
  }),
  IDENTITY: Object.freeze({
    scope_code: "image-gif-and-section",
    root_types: Object.freeze(["media.image_candidate"]),
    descendant_types: Object.freeze([
      "media.gif_candidate",
      "page.section_graph_resolved",
      "page.html_revision",
    ]),
  }),
  MOTION_CLARITY: Object.freeze({
    scope_code: "motion-gif-and-section",
    root_types: Object.freeze(["motion.project", "media.gif_candidate"]),
    descendant_types: Object.freeze([
      "page.section_graph_resolved",
      "page.html_revision",
    ]),
  }),
  CLAIM_EVIDENCE: Object.freeze({
    scope_code: "claim-and-all-descendants-with-reapproval",
    root_types: Object.freeze(["content.section_plan"]),
    descendant_types: Object.freeze([
      "media.image_candidate",
      "media.gif_candidate",
      "page.section_graph_resolved",
      "page.html_revision",
      "studio.committed_revision",
      "decision.page_approval",
    ]),
    requires_reapproval: true,
  }),
  RIGHTS: Object.freeze({
    scope_code: "asset-and-all-descendants",
    root_types: Object.freeze([
      "media.source_asset",
      "media.image_candidate",
      "media.gif_candidate",
    ]),
    descendant_types: Object.freeze([
      "page.section_graph_resolved",
      "page.html_revision",
      "studio.committed_revision",
      "decision.page_approval",
    ]),
    requires_reapproval: true,
  }),
  PAGE_PACING: Object.freeze({
    scope_code: "section-order-and-html",
    root_types: Object.freeze([
      "page.section_graph_resolved",
      "page.html_revision",
    ]),
    descendant_types: Object.freeze(["studio.committed_revision"]),
  }),
  MOBILE_OVERFLOW: Object.freeze({
    scope_code: "html-section-css",
    root_types: Object.freeze(["page.html_revision"]),
    descendant_types: Object.freeze(["studio.committed_revision"]),
  }),
  VISUAL_RHYTHM: Object.freeze({
    scope_code: "section-token-spacing-background",
    root_types: Object.freeze([
      "design.token_set",
      "page.section_graph_resolved",
      "page.html_revision",
    ]),
    descendant_types: Object.freeze(["studio.committed_revision"]),
  }),
});

const PROTECTED_TYPE_PREFIXES = Object.freeze([
  "evidence.",
  "knowledge.",
  "decision.plan_approval",
]);

function isProtectedArtifact(artifact) {
  return (
    artifact.protected === true ||
    PROTECTED_TYPE_PREFIXES.some((prefix) =>
      String(artifact.type ?? "").startsWith(prefix),
    )
  );
}

function artifactAppliesToSection(artifact, sectionId) {
  if (!sectionId || sectionId === "*") return true;
  const sectionIds = artifact.section_ids ?? [];
  return sectionIds.length === 0 || sectionIds.includes(sectionId);
}

export class ScopeResolver {
  #artifacts;

  #scopeTable;

  constructor({ artifacts = [], scopeTable = ISSUE_REPAIR_SCOPES } = {}) {
    this.#artifacts = artifacts.map(clone);
    this.#scopeTable = scopeTable;
  }

  resolve(issue) {
    const rawIssueCode = String(issue?.issue_code ?? "");
    const issueCode = rawIssueCode
      .trim()
      .replaceAll(/[\s-]+/g, "_")
      .toUpperCase();
    const scope = this.#scopeTable[issueCode];
    if (!scope) {
      fail(
        "UNKNOWN_ISSUE_CODE",
        "등록되지 않은 issue code는 추측으로 넓게 수정할 수 없습니다.",
        { issue_code: rawIssueCode },
      );
    }
    const sectionId = issue?.section_id ?? "*";
    const rootArtifactIds = this.#artifacts
      .filter(
        (artifact) =>
          scope.root_types.includes(artifact.type) &&
          artifactAppliesToSection(artifact, sectionId) &&
          !isProtectedArtifact(artifact),
      )
      .map((artifact) => artifact.artifact_id)
      .sort();
    const protectedArtifactIds = this.#artifacts
      .filter(isProtectedArtifact)
      .map((artifact) => artifact.artifact_id)
      .sort();
    return {
      issue_code: issueCode,
      issue_key: `${issueCode}::${sectionId}`,
      section_id: sectionId,
      scope_code: scope.scope_code,
      root_artifact_ids: rootArtifactIds,
      descendant_artifact_types: [...scope.descendant_types],
      protected_artifact_ids: protectedArtifactIds,
      requires_reapproval: scope.requires_reapproval === true,
    };
  }
}

export class RepairPlanner {
  #scopeResolver;

  constructor({ scopeResolver }) {
    if (
      !scopeResolver ||
      typeof scopeResolver.resolve !== "function"
    ) {
      fail(
        "INVALID_SCOPE_RESOLVER",
        "RepairPlanner에는 deterministic ScopeResolver가 필요합니다.",
      );
    }
    this.#scopeResolver = scopeResolver;
  }

  propose({ rubric_result_id, checks }) {
    if (!isNonEmptyString(rubric_result_id) || !Array.isArray(checks)) {
      fail(
        "INVALID_REPAIR_INPUT",
        "rubric_result_id와 checks가 필요합니다.",
      );
    }
    const failures = checks.filter((check) => check.status === "FAIL");
    const proposals = failures.map((failure, index) => {
      const scope = this.#scopeResolver.resolve(failure);
      return {
        proposal_id: `repair-${index + 1}-${sha256Of([
          rubric_result_id,
          scope.issue_key,
        ]).slice(0, 12)}`,
        ...scope,
        action: "INVALIDATE_ROOTS_AND_DESCENDANTS",
      };
    });
    return {
      schema_version: "1.0",
      repair_plan_id: `repair-plan-${sha256Of([
        rubric_result_id,
        proposals.map((proposal) => proposal.issue_key),
      ]).slice(0, 16)}`,
      source_rubric_result_id: rubric_result_id,
      deterministic: true,
      proposals,
    };
  }
}

export function assertInvalidationAllowed(repairPlanOrProposal, artifactIds) {
  if (!Array.isArray(artifactIds) || !artifactIds.every(isNonEmptyString)) {
    fail(
      "INVALID_INVALIDATION_REQUEST",
      "무효화 artifact ID 배열이 필요합니다.",
    );
  }
  const proposals = Array.isArray(repairPlanOrProposal?.proposals)
    ? repairPlanOrProposal.proposals
    : [repairPlanOrProposal];
  const protectedIds = new Set(
    proposals.flatMap((proposal) => proposal?.protected_artifact_ids ?? []),
  );
  const protectedRequested = sortedUnique(
    artifactIds.filter((artifactId) => protectedIds.has(artifactId)),
  );
  if (protectedRequested.length > 0) {
    fail(
      "PROTECTED_ARTIFACT_INVALIDATION",
      "보호된 SSOT·근거·승인 artifact는 repair loop에서 무효화할 수 없습니다.",
      { artifact_ids: protectedRequested },
    );
  }
  const allowedRoots = new Set(
    proposals.flatMap((proposal) => proposal?.root_artifact_ids ?? []),
  );
  const outsideScope = sortedUnique(
    artifactIds.filter((artifactId) => !allowedRoots.has(artifactId)),
  );
  if (outsideScope.length > 0) {
    fail(
      "REPAIR_SCOPE_VIOLATION",
      "deterministic repair scope 밖의 artifact를 무효화할 수 없습니다.",
      { artifact_ids: outsideScope },
    );
  }
  return sortedUnique(artifactIds);
}
