import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStageValidationPolicy,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/stage-validation-policy.mjs";

const POLICY = {
  receipt_required: true,
  min_score: 97,
  min_behance_quality_score: 90,
  min_critical_dimension_score: 85,
  max_deterministic_hard_failures: 0,
};

function receipt() {
  return {
    score: 97,
    verdict: "PASS",
    hard_failures: [],
    quality_metrics: {
      behance_quality_score: 92,
      critical_dimension_min_score: 87,
      deterministic_hard_failure_count: 0,
    },
  };
}

test("G4/G5 semantic gate는 97/90/85/hard0을 모두 만족해야 한다", () => {
  assert.equal(
    assertStageValidationPolicy(receipt(), POLICY),
    receipt().score,
  );
});

test("평균 점수만 높고 Behance·critical·hard gate가 낮으면 차단한다", () => {
  for (const mutate of [
    (value) => {
      value.score = 96;
    },
    (value) => {
      value.quality_metrics.behance_quality_score = 89;
    },
    (value) => {
      value.quality_metrics.critical_dimension_min_score = 84;
    },
    (value) => {
      value.quality_metrics.deterministic_hard_failure_count = 1;
    },
  ]) {
    const value = receipt();
    mutate(value);
    assert.throws(
      () => assertStageValidationPolicy(value, POLICY),
      (error) => error.code === "STAGE_VALIDATION_POLICY_FAILED",
    );
  }
});
