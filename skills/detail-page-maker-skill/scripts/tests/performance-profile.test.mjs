import assert from "node:assert/strict";
import test from "node:test";

import { analyzePerformanceTrace } from "../orchestration/performance-profile.mjs";

test("이미지와 모션 item을 병렬 critical path로 계산한다", () => {
  const report = analyzePerformanceTrace([
    { stage_id: "G2_IMAGE_ASSETS", work_item_id: "a", duration_ms: 100 },
    { stage_id: "G2_IMAGE_ASSETS", work_item_id: "b", duration_ms: 120 },
    { stage_id: "G3_MOTION_ASSETS", work_item_id: "c", duration_ms: 200 },
    { stage_id: "G3_MOTION_ASSETS", work_item_id: "d", duration_ms: 150 },
  ]);
  assert.equal(report.observed_sequential_duration_ms, 570);
  assert.equal(report.estimated_optimized_duration_ms, 320);
  assert.equal(report.estimated_savings_ms, 250);
  assert.deepEqual(report.mandatory_fast_path.image_generation, {
    batch_size: 32,
    provider_workers: 32,
    strategy: "single_concurrent_batch",
  });
});
