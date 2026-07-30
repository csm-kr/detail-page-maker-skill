import assert from "node:assert/strict";
import test from "node:test";

import {
  RunBudgetLedger,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/run-budget.mjs";

function profile() {
  return {
    max_tokens: 20_000,
    max_image_candidates: 8,
    max_gif_previews: 2,
    max_full_page_loops: 3,
    max_wall_ms: 600_000,
    max_estimated_cost: 10,
    provider_concurrency: { imagegen: 2, hyperframes: 1 },
  };
}

test("WorkOrder 비용을 예약하고 실제 사용량 receipt로 정산한다", () => {
  const ledger = new RunBudgetLedger(profile());
  const reservation = ledger.reserve("work-image-1", {
    provider: "imagegen",
    tokens: 2000,
    image_candidates: 4,
    gif_previews: 0,
    estimated_cost: 3,
  });
  const committed = ledger.commit("work-image-1", {
    tokens: 1800,
    image_candidates: 4,
    gif_previews: 0,
    actual_cost: 2.7,
  });

  assert.equal(reservation.status, "reserved");
  assert.equal(committed.status, "committed");
  assert.equal(ledger.snapshot().actual.tokens, 1800);
  assert.equal(ledger.snapshot().active_reservations, 0);
});

test("예산이나 provider concurrency를 넘으면 품질 gate를 우회하지 않고 대기한다", () => {
  const ledger = new RunBudgetLedger(profile());
  ledger.reserve("work-image-1", {
    provider: "imagegen",
    tokens: 1000,
    image_candidates: 4,
    gif_previews: 0,
    estimated_cost: 2,
  });
  ledger.reserve("work-image-2", {
    provider: "imagegen",
    tokens: 1000,
    image_candidates: 4,
    gif_previews: 0,
    estimated_cost: 2,
  });

  assert.throws(
    () =>
      ledger.reserve("work-image-3", {
        provider: "imagegen",
        tokens: 1000,
        image_candidates: 1,
        gif_previews: 0,
        estimated_cost: 1,
      }),
    (error) => error.code === "PROVIDER_CONCURRENCY_EXCEEDED",
  );
  assert.throws(
    () =>
      ledger.reserve("work-too-large", {
        provider: "other",
        tokens: 30_000,
        image_candidates: 0,
        gif_previews: 0,
        estimated_cost: 1,
      }),
    (error) => error.code === "BUDGET_AWAITING_USER",
  );
  assert.equal(ledger.snapshot().publish_allowed, false);
});
