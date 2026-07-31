import assert from "node:assert/strict";
import test from "node:test";

import {
  validateProductionPlan,
} from "../orchestration/production-plan.mjs";

test("과거처럼 reference와 effect binding이 없는 plan은 G1에서 차단한다", () => {
  const result = validateProductionPlan({
    claim_graph: { claims: [] },
    section_graph_draft: { sections: [], slots: [] },
    image_job_set: { jobs: [] },
    gif_brief_set: { briefs: [] },
    rubric_target: {},
    provenance: {
      applied_rules: {
        commercial: [
          {
            rule_id: "CR-001",
            rule_sha256: "a".repeat(64),
          },
        ],
        taste: [
          {
            rule_id: "TR-001",
            rule_sha256: "b".repeat(64),
          },
        ],
        motion: [],
      },
    },
  });
  const codes = new Set(result.errors.map((error) => error.code));
  assert.equal(result.ok, false);
  assert.equal(codes.has("REFERENCE_ARTIFACT_SET_REQUIRED"), true);
  assert.equal(
    codes.has("CATEGORY_ARCHETYPE_SELECTION_INVALID"),
    true,
  );
  assert.equal(codes.has("PLAN_RULE_TRACE_INVALID"), true);
  assert.equal(codes.has("PLANNING_MATERIALIZATION_REQUIRED"), true);
  assert.equal(codes.has("REFERENCE_COMPARISON_RUBRIC_REQUIRED"), true);
  assert.equal(
    codes.has("CATEGORY_REFERENCE_COMPARISON_RUBRIC_REQUIRED"),
    true,
  );
});
