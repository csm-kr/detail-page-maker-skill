export class StageValidationPolicyError extends Error {
  constructor(reasons) {
    super("stage validation policy threshold를 충족하지 못했습니다.");
    this.name = "StageValidationPolicyError";
    this.code = "STAGE_VALIDATION_POLICY_FAILED";
    this.details = { reasons };
  }
}

export function assertStageValidationPolicy(receipt, policy) {
  if (!policy) return receipt?.score;
  const metrics = receipt?.quality_metrics ?? {};
  const reasons = [];
  if (receipt?.verdict !== "PASS") reasons.push("VERDICT_NOT_PASS");
  if ((receipt?.hard_failures ?? []).length > 0) {
    reasons.push("HARD_FAILURE_PRESENT");
  }
  if (
    !Number.isFinite(receipt?.score) ||
    receipt.score < policy.min_score
  ) {
    reasons.push("SCORE_BELOW_POLICY");
  }
  if (
    !Number.isFinite(metrics.behance_quality_score) ||
    metrics.behance_quality_score <
      policy.min_behance_quality_score
  ) {
    reasons.push("BEHANCE_QUALITY_BELOW_POLICY");
  }
  if (
    !Number.isFinite(metrics.critical_dimension_min_score) ||
    metrics.critical_dimension_min_score <
      policy.min_critical_dimension_score
  ) {
    reasons.push("CRITICAL_DIMENSION_BELOW_POLICY");
  }
  if (
    !Number.isInteger(metrics.deterministic_hard_failure_count) ||
    metrics.deterministic_hard_failure_count >
      policy.max_deterministic_hard_failures
  ) {
    reasons.push("DETERMINISTIC_HARD_FAILURE");
  }
  if (reasons.length > 0) {
    throw new StageValidationPolicyError(reasons);
  }
  return receipt.score;
}
