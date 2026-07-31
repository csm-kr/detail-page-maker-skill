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
  if (policy.reference_comparison_required === true) {
    const comparison = metrics.reference_comparison;
    const requiredDimensions = [
      "desire_formation",
      "observable_differentiation",
      "scene_diversity",
      "motion_semantic_delta",
      "delivery_780",
      "decision_close",
    ];
    const dimensions = new Map(
      (Array.isArray(comparison?.dimensions)
        ? comparison.dimensions
        : []
      ).map((dimension) => [
        dimension?.criterion_id,
        dimension,
      ]),
    );
    if (
      comparison?.status !== "PASS" ||
      !Array.isArray(comparison?.reference_ids) ||
      comparison.reference_ids.length === 0 ||
      requiredDimensions.some((criterionId) => {
        const dimension = dimensions.get(criterionId);
        return (
          !Number.isFinite(dimension?.current_score) ||
          !Number.isFinite(dimension?.reference_score) ||
          typeof dimension?.observation !== "string" ||
          dimension.observation.trim() === ""
        );
      })
    ) {
      reasons.push("REFERENCE_COMPARISON_REQUIRED");
    }
  }
  if (
    policy.category_reference_comparison_required === true
  ) {
    const comparison =
      metrics.category_reference_comparison;
    const requiredDimensions = [
      "desire_formation",
      "observable_differentiation",
      "scene_diversity",
      "motion_semantic_delta",
      "delivery_780",
      "decision_close",
    ];
    const dimensions = new Map(
      (Array.isArray(comparison?.dimensions)
        ? comparison.dimensions
        : []
      ).map((dimension) => [
        dimension?.criterion_id,
        dimension,
      ]),
    );
    if (
      comparison?.status !== "PASS" ||
      !/^[a-f0-9]{64}$/.test(
        String(comparison?.library_sha256 || ""),
      ) ||
      !Array.isArray(comparison?.reference_card_ids) ||
      comparison.reference_card_ids.length < 2 ||
      comparison?.target !==
        "meet_or_exceed_selected_cohort" ||
      requiredDimensions.some((criterionId) => {
        const dimension = dimensions.get(criterionId);
        return (
          !Number.isFinite(dimension?.current_score) ||
          !Number.isFinite(dimension?.cohort_score) ||
          dimension.current_score < dimension.cohort_score ||
          typeof dimension?.observation !== "string" ||
          dimension.observation.trim() === ""
        );
      })
    ) {
      reasons.push(
        "CATEGORY_REFERENCE_COMPARISON_REQUIRED",
      );
    }
  }
  if (reasons.length > 0) {
    throw new StageValidationPolicyError(reasons);
  }
  return receipt.score;
}
