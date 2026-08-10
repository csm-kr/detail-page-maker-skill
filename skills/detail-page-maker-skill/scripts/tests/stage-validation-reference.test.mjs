import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStageValidationPolicy,
} from "../orchestration/stage-validation-policy.mjs";

const policy = {
  min_score: 97,
  min_behance_quality_score: 90,
  min_critical_dimension_score: 85,
  max_deterministic_hard_failures: 0,
  reference_comparison_required: true,
  category_reference_comparison_required: true,
};

const categoryDimensions = [
  "desire_formation",
  "observable_differentiation",
  "scene_diversity",
  "motion_semantic_delta",
  "delivery_780",
  "decision_close",
].map((criterionId) => ({
  criterion_id: criterionId,
  current_score: 92,
  cohort_score: 90,
  observation: `${criterionId} category cohort 비교`,
}));

const passingCategoryComparison = {
  status: "PASS",
  library_sha256: "a".repeat(64),
  reference_card_ids: [
    "behance-makeon-led-mask",
    "behance-replaceable-toothbrush",
  ],
  target: "meet_or_exceed_selected_cohort",
  dimensions: categoryDimensions,
};

function receipt(
  referenceComparison,
  categoryComparison = passingCategoryComparison,
) {
  return {
    verdict: "PASS",
    score: 98,
    hard_failures: [],
    quality_metrics: {
      behance_quality_score: 94,
      critical_dimension_min_score: 90,
      deterministic_hard_failure_count: 0,
      reference_comparison: referenceComparison,
      category_reference_comparison: categoryComparison,
    },
  };
}

test("자체 고득점만 있고 기준 비교가 없으면 stage QA를 통과하지 못한다", () => {
  assert.throws(
    () => assertStageValidationPolicy(receipt(null), policy),
    (error) =>
      error?.details?.reasons?.includes(
        "REFERENCE_COMPARISON_REQUIRED",
      ),
  );
});

test("여섯 구매·시각 차원의 기준 비교 observation이 있어야 통과한다", () => {
  const dimensions = [
    "desire_formation",
    "observable_differentiation",
    "scene_diversity",
    "motion_semantic_delta",
    "delivery_780",
    "decision_close",
  ].map((criterionId) => ({
    criterion_id: criterionId,
    current_score: 92,
    reference_score: 90,
    observation: `${criterionId} 비교 관찰`,
  }));
  assert.equal(
    assertStageValidationPolicy(
      receipt({
        status: "PASS",
        reference_ids: ["reference-current-output"],
        dimensions,
      }),
      policy,
    ),
    98,
  );
});

test("선택 category cohort보다 한 차원이라도 낮으면 통과하지 못한다", () => {
  const referenceDimensions = [
    "desire_formation",
    "observable_differentiation",
    "scene_diversity",
    "motion_semantic_delta",
    "delivery_780",
    "decision_close",
  ].map((criterionId) => ({
    criterion_id: criterionId,
    current_score: 92,
    reference_score: 90,
    observation: `${criterionId} baseline 비교`,
  }));
  const regressed = structuredClone(passingCategoryComparison);
  regressed.dimensions[2].current_score = 89;
  assert.throws(
    () =>
      assertStageValidationPolicy(
        receipt(
          {
            status: "PASS",
            reference_ids: ["reference-current-output"],
            dimensions: referenceDimensions,
          },
          regressed,
        ),
        policy,
      ),
    (error) =>
      error?.details?.reasons?.includes(
        "CATEGORY_REFERENCE_COMPARISON_REQUIRED",
      ),
  );
});
