import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAggregateLeaseAllowed,
} from "../orchestration/workflow-engine.mjs";

test("G2/G3 aggregate lease는 item frontier 오류로 차단한다", () => {
  for (const stageId of [
    "G2A_IMAGE",
    "G3P_PREVIEW",
    "G3R_RENDER",
  ]) {
    assert.throws(
      () => assertAggregateLeaseAllowed(stageId),
      (error) =>
        error?.code === "ITEM_FRONTIER_REQUIRED" &&
        error?.details?.stage_id === stageId,
    );
  }
  assert.equal(
    assertAggregateLeaseAllowed("G5_PUBLISH_QA"),
    "G5_PUBLISH_QA",
  );
});
