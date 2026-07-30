import assert from "node:assert/strict";
import test from "node:test";

import {
  createRepairLoopTransition,
  resolveRepairMutation,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/repair-loop-controller.mjs";
import {
  rubricDefinitionHash,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/rubric-loop.mjs";

const H = {
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
  d: "d".repeat(64),
};

function definition() {
  const value = {
    schema_version: "1.0",
    rubric_id: "behance-commerce",
    version: "1.0.0",
    source_snapshot: {
      snapshot_id: "behance-snapshot",
      sha256: H.a,
    },
    policy: {
      policy_id: "policy.qa.behance-rubric.v1",
      sha256: H.b,
    },
    dimensions: [
      {
        dimension_id: "technical-integrity",
        validator_kind: "deterministic",
        weight: 40,
        evidence_requirement: ["dom", "capture"],
        min_score: 100,
        hard_gate: true,
        applicable_section_types: ["all"],
        issue_to_repair_scope_code: {
          MOBILE_OVERFLOW: "html.section-css",
        },
        hard_failure_codes: ["MOBILE_OVERFLOW"],
      },
      {
        dimension_id: "visual-hierarchy",
        validator_kind: "model",
        weight: 60,
        evidence_requirement: ["capture"],
        min_score: 90,
        hard_gate: false,
        applicable_section_types: ["hero"],
        issue_to_repair_scope_code: {
          VISUAL_HIERARCHY: "section.layout-token-html",
        },
        hard_failure_codes: [],
      },
    ],
    stop_policy: {
      policy_id: "repair-stop",
      version: "1.0.0",
      max_total_attempts: 3,
      max_section_attempts: 2,
      recurring_issue_limit: 2,
      plateau_window: 2,
      min_score_improvement: 2,
    },
  };
  return { ...value, rubric_sha256: rubricDefinitionHash(value) };
}

function graph() {
  return {
    artifacts: [
      {
        artifact_id: "supplier-ssot",
        type: "evidence.product_ssot",
        manifest_sha256: H.a,
        status: "fresh",
      },
      {
        artifact_id: "html-1",
        type: "page.html_revision",
        manifest_sha256: H.c,
        status: "fresh",
        section_ids: ["hero", "spec"],
        produced_by_stage: "G4A",
      },
      {
        artifact_id: "capture-1",
        type: "qa.render_capture_set",
        manifest_sha256: H.d,
        status: "fresh",
        produced_by_stage: "G4Q0",
      },
      {
        artifact_id: "studio-1",
        type: "studio.committed_revision",
        manifest_sha256: H.b,
        status: "fresh",
        produced_by_stage: "G4C",
      },
    ],
    edges: [
      {
        from: "html-1",
        to: "studio-1",
        relation: "revision_of",
      },
    ],
  };
}

function result({
  id,
  score,
  status = "FAIL",
  issueCode = "MOBILE_OVERFLOW",
  sectionId = "spec",
} = {}) {
  const passed = status === "PASS";
  return {
    schema_version: "1.0",
    result_id: id,
    rubric_id: "behance-commerce",
    rubric_version: "1.0.0",
    rubric_sha256: definition().rubric_sha256,
    subject: {
      artifact_id: "html-1",
      manifest_sha256: H.c,
    },
    benchmark_sha256: H.a,
    evaluators: [
      {
        evaluator_id: "technical-agent",
        validator_kind: "deterministic",
        code_sha256: H.b,
      },
    ],
    viewport_capture_ids: ["capture-1"],
    score,
    checks: [
      {
        check_id: `check-${id}`,
        dimension_id: "technical-integrity",
        evaluator_kind: "deterministic",
        evaluator_id: "technical-agent",
        issue_code: passed ? null : issueCode,
        section_id: sectionId,
        status,
        severity: passed ? "info" : "hard",
        score: passed ? 100 : 0,
        confidence: 1,
        evidence_artifact_ids: ["capture-1"],
        evidence_locators: ["artifact://capture-1"],
      },
    ],
    evaluated_at: "2026-07-30T12:00:00.000Z",
  };
}

test("rubric 실패는 exact graph 근거에서 deterministic repair root를 만든다", () => {
  const transition = createRepairLoopTransition({
    rubricDefinition: definition(),
    graphSnapshot: graph(),
    currentResult: result({ id: "r1", score: 90 }),
    budget: { state: "AVAILABLE" },
  });

  assert.equal(transition.action, "REPAIR_REQUIRED");
  assert.deepEqual(
    transition.invalidation_root_artifact_ids,
    ["html-1"],
  );
  assert.equal(transition.repair_plan.proposals.length, 1);
  assert.equal(transition.auto_publish_allowed, false);
  assert.match(transition.transition_sha256, /^[a-f0-9]{64}$/);

  const mutation = resolveRepairMutation({
    transition,
    graphSnapshot: graph(),
    workflowDefinition: {
      stages: [
        {
          stage_id: "G4A",
          consumers: ["G4C"],
          user_gate: false,
        },
        {
          stage_id: "G4C",
          consumers: ["G4U"],
          user_gate: false,
        },
        {
          stage_id: "G4U",
          consumers: ["G5"],
          user_gate: true,
        },
        {
          stage_id: "G5",
          consumers: [],
          user_gate: false,
        },
      ],
    },
  });
  assert.deepEqual(mutation.stale_artifact_ids, [
    "html-1",
    "studio-1",
  ]);
  assert.deepEqual(mutation.reset_stage_ids, [
    "G4A",
    "G4C",
    "G4U",
    "G5",
  ]);
  assert.deepEqual(mutation.approval_gates_to_reopen, ["G4U"]);
});

test("재발·plateau 또는 budget 소진은 자동 repair와 publish를 멈춘다", () => {
  const previous = result({ id: "r1", score: 90 });
  const priorAttempts = [
    {
      attempt_id: "r1",
      result_sha256: H.a,
      scope_kind: "full_page",
      section_ids: ["spec"],
      failed_issue_keys: ["MOBILE_OVERFLOW::spec"],
      score: 90,
    },
  ];
  const stopped = createRepairLoopTransition({
    rubricDefinition: definition(),
    graphSnapshot: graph(),
    previousResult: previous,
    currentResult: result({ id: "r2", score: 91 }),
    priorAttempts,
    budget: { state: "AVAILABLE" },
  });
  assert.equal(stopped.action, "PLATEAU_AWAITING_USER");
  assert.ok(stopped.stop_decision.reasons.includes("RECURRING_ISSUE"));
  assert.equal(stopped.repair_plan, null);
  assert.equal(stopped.auto_publish_allowed, false);

  const budgetStopped = createRepairLoopTransition({
    rubricDefinition: definition(),
    graphSnapshot: graph(),
    currentResult: result({ id: "budget-r1", score: 90 }),
    budget: { state: "EXHAUSTED" },
  });
  assert.equal(budgetStopped.action, "BUDGET_AWAITING_USER");
  assert.equal(budgetStopped.auto_publish_allowed, false);
});

test("97/90/85/hard0를 통과한 result만 publish-ready가 된다", () => {
  const transition = createRepairLoopTransition({
    rubricDefinition: definition(),
    graphSnapshot: graph(),
    currentResult: result({
      id: "r-pass",
      score: 100,
      status: "PASS",
      issueCode: null,
    }),
    budget: { state: "AVAILABLE" },
  });

  assert.equal(transition.action, "PUBLISH_READY");
  assert.equal(transition.publish_gate.publish_allowed, true);
  assert.equal(transition.auto_publish_allowed, true);
  assert.equal(transition.repair_plan, null);
});

test("stale subject·evidence와 result replay를 fail-closed한다", () => {
  assert.throws(
    () =>
      createRepairLoopTransition({
        rubricDefinition: definition(),
        graphSnapshot: {
          ...graph(),
          artifacts: graph().artifacts.map((artifact) =>
            artifact.artifact_id === "capture-1"
              ? { ...artifact, status: "stale" }
              : artifact,
          ),
        },
        currentResult: result({ id: "r-stale", score: 90 }),
      }),
    (error) => error.code === "RUBRIC_EVIDENCE_NOT_FRESH",
  );

  assert.throws(
    () =>
      createRepairLoopTransition({
        rubricDefinition: definition(),
        graphSnapshot: graph(),
        currentResult: result({ id: "r-replay", score: 90 }),
        priorAttempts: [
          {
            attempt_id: "r-replay",
            section_ids: ["spec"],
            failed_issue_keys: ["MOBILE_OVERFLOW::spec"],
            score: 90,
          },
        ],
      }),
    (error) => error.code === "REPAIR_ATTEMPT_REPLAY",
  );
});
