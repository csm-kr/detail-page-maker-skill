import assert from "node:assert/strict";
import test from "node:test";

import {
  RepairPlanner,
  RubricLoopError,
  ScopeResolver,
  assertInvalidationAllowed,
  assertRubricDefinition,
  assertRubricDelta,
  assertRubricResult,
  createRubricDelta,
  evaluatePublishGate,
  evaluateStopPolicy,
  rubricDefinitionHash,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/rubric-loop.mjs";

const H = {
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
};

function definition() {
  const value = {
    schema_version: "1.0",
    rubric_id: "behance-commerce",
    version: "1.2.0",
    source_snapshot: {
      snapshot_id: "behance-2026-07-30",
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
        evidence_requirement: ["dom-report", "viewport-capture"],
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
        evidence_requirement: ["viewport-capture"],
        min_score: 90,
        hard_gate: false,
        applicable_section_types: ["hero", "feature", "spec"],
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

function result({
  id = "result-1",
  score = 98,
  hash = definition().rubric_sha256,
  checks = [],
} = {}) {
  const normalizedChecks = checks.map((check) => ({
    confidence: 1,
    evidence_locators: (check.evidence_artifact_ids ?? []).map(
      (artifactId) => `artifact://${artifactId}`,
    ),
    ...check,
  }));
  return {
    schema_version: "1.0",
    result_id: id,
    rubric_id: "behance-commerce",
    rubric_version: "1.2.0",
    rubric_sha256: hash,
    subject: {
      artifact_id: "html-1",
      manifest_sha256: H.c,
    },
    benchmark_sha256: H.a,
    evaluators: [
      {
        evaluator_id: "visual-agent",
        validator_kind: "model",
        code_sha256: H.b,
        model_id: "model-version-pinned",
        prompt_sha256: H.c,
      },
      {
        evaluator_id: "technical-agent",
        validator_kind: "deterministic",
        code_sha256: H.b,
        model_id: null,
        prompt_sha256: null,
      },
    ],
    viewport_capture_ids: ["capture-360", "capture-800"],
    score,
    checks: normalizedChecks,
    evaluated_at: "2026-07-30T10:00:00.000Z",
  };
}

test("RubricDefinition과 Result 계약은 버전·snapshot·policy·근거 있는 check를 강제한다", () => {
  const rubric = assertRubricDefinition(definition());
  const evaluated = assertRubricResult(
    result({
      checks: [
        {
          check_id: "check-hierarchy",
          dimension_id: "visual-hierarchy",
          evaluator_kind: "model",
          evaluator_id: "visual-agent",
          issue_code: null,
          section_id: "hero",
          status: "PASS",
          severity: "info",
          score: 98,
          evidence_artifact_ids: ["capture-mobile"],
        },
      ],
    }),
    rubric,
  );

  assert.equal(evaluated.rubric_sha256, rubric.rubric_sha256);
  assert.throws(
    () =>
      assertRubricResult(
        result({
          checks: [
            {
              check_id: "check-without-evidence",
              dimension_id: "visual-hierarchy",
              evaluator_kind: "model",
              evaluator_id: "visual-agent",
              status: "PASS",
              severity: "info",
              score: 98,
              evidence_artifact_ids: [],
            },
          ],
        }),
        rubric,
      ),
    (error) => error.code === "INVALID_RUBRIC_RESULT",
  );
});

test("RubricDelta는 rubric·benchmark·evaluator 구성이 같은 결과만 비교한다", () => {
  const rubric = definition();
  const previous = result({
    id: "result-before",
    score: 91,
    checks: [
      {
        check_id: "overflow-before",
        dimension_id: "technical-integrity",
        evaluator_kind: "deterministic",
        evaluator_id: "technical-agent",
        issue_code: "MOBILE_OVERFLOW",
        section_id: "spec",
        status: "FAIL",
        severity: "hard",
        score: 0,
        evidence_artifact_ids: ["capture-before"],
      },
    ],
  });
  const current = result({
    id: "result-after",
    score: 98,
    checks: [
      {
        check_id: "overflow-after",
        dimension_id: "technical-integrity",
        evaluator_kind: "deterministic",
        evaluator_id: "technical-agent",
        issue_code: null,
        section_id: "spec",
        status: "PASS",
        severity: "info",
        score: 100,
        evidence_artifact_ids: ["capture-after"],
      },
    ],
  });

  const delta = createRubricDelta(previous, current, rubric);
  assert.equal(delta.score_delta, 7);
  assert.deepEqual(delta.resolved_issue_keys, ["MOBILE_OVERFLOW::spec"]);
  assert.equal(assertRubricDelta(delta, rubric).rubric_sha256, rubric.rubric_sha256);

  assert.throws(
    () =>
      createRubricDelta(
        previous,
        { ...current, rubric_sha256: "f".repeat(64) },
        rubric,
      ),
    (error) => error.code === "RUBRIC_HASH_MISMATCH",
  );
  assert.throws(
    () =>
      createRubricDelta(
        previous,
        { ...current, benchmark_sha256: H.b },
        rubric,
      ),
    (error) => error.code === "RUBRIC_BENCHMARK_MISMATCH",
  );
  const changedEvaluator = structuredClone(current);
  changedEvaluator.evaluators[0].code_sha256 = H.c;
  assert.throws(
    () =>
      createRubricDelta(previous, changedEvaluator, rubric),
    (error) => error.code === "RUBRIC_EVALUATOR_MISMATCH",
  );
  const changedPrompt = structuredClone(current);
  changedPrompt.evaluators[0].prompt_sha256 = H.a;
  assert.throws(
    () => createRubricDelta(previous, changedPrompt, rubric),
    (error) => error.code === "RUBRIC_EVALUATOR_MISMATCH",
  );
  assert.throws(
    () =>
      assertRubricDelta(
        { ...delta, rubric_sha256: "f".repeat(64) },
        rubric,
      ),
    (error) => error.code === "RUBRIC_HASH_MISMATCH",
  );
});

test("모델 점수가 높아도 deterministic hard failure가 하나면 publish를 차단한다", () => {
  const rubric = definition();
  const gate = evaluatePublishGate(
    result({
      score: 100,
      checks: [
        {
          check_id: "visual",
          dimension_id: "visual-hierarchy",
          evaluator_kind: "model",
          evaluator_id: "visual-agent",
          issue_code: null,
          section_id: "hero",
          status: "PASS",
          severity: "info",
          score: 100,
          evidence_artifact_ids: ["visual-capture"],
        },
        {
          check_id: "overflow",
          dimension_id: "technical-integrity",
          evaluator_kind: "deterministic",
          evaluator_id: "technical-agent",
          issue_code: "MOBILE_OVERFLOW",
          section_id: "spec",
          status: "FAIL",
          severity: "hard",
          score: 0,
          evidence_artifact_ids: ["dom-overflow-report"],
        },
      ],
    }),
    rubric,
    { target_score: 97 },
  );

  assert.equal(gate.publish_allowed, false);
  assert.deepEqual(gate.blocking_issue_keys, ["MOBILE_OVERFLOW::spec"]);
  assert.ok(gate.reasons.includes("DETERMINISTIC_HARD_FAILURE"));
});

test("versioned stop policy는 총 3회·section 2회·재발·plateau·budget을 각각 중단 상태로 만든다", () => {
  const policy = definition().stop_policy;

  assert.deepEqual(
    evaluateStopPolicy({
      policy,
      history: [
        { attempt_id: "a1", section_ids: ["hero"], score: 90 },
        { attempt_id: "a2", section_ids: ["spec"], score: 93 },
        { attempt_id: "a3", section_ids: ["faq"], score: 95 },
      ],
      budget: { state: "AVAILABLE" },
    }).reasons,
    ["MAX_TOTAL_ATTEMPTS"],
  );

  assert.equal(
    evaluateStopPolicy({
      policy,
      history: [
        { attempt_id: "a1", section_ids: ["hero"], score: 90 },
        { attempt_id: "a2", section_ids: ["hero"], score: 94 },
      ],
      budget: { state: "AVAILABLE" },
    }).action,
    "PLATEAU_AWAITING_USER",
  );

  assert.ok(
    evaluateStopPolicy({
      policy,
      history: [
        {
          attempt_id: "a1",
          section_ids: ["hero"],
          score: 90,
          failed_issue_keys: ["VISUAL_RHYTHM::hero"],
        },
        {
          attempt_id: "a2",
          section_ids: ["spec"],
          score: 94,
          failed_issue_keys: ["VISUAL_RHYTHM::hero"],
        },
      ],
      budget: { state: "AVAILABLE" },
    }).reasons.includes("RECURRING_ISSUE"),
  );

  assert.ok(
    evaluateStopPolicy({
      policy,
      history: [
        { attempt_id: "a1", section_ids: ["hero"], score: 90 },
        { attempt_id: "a2", section_ids: ["spec"], score: 91 },
        { attempt_id: "a3", section_ids: ["faq"], score: 92.5 },
      ],
      budget: { state: "AVAILABLE" },
    }).reasons.includes("SCORE_PLATEAU"),
  );

  const budgetStop = evaluateStopPolicy({
    policy,
    history: [],
    budget: { state: "EXHAUSTED", remaining_units: 0 },
  });
  assert.equal(budgetStop.action, "BUDGET_AWAITING_USER");
  assert.deepEqual(budgetStop.reasons, ["BUDGET_EXHAUSTED"]);
  assert.equal(budgetStop.policy_version, "1.0.0");
});

test("RepairPlanner는 issue code를 deterministic scope로 해석하고 protected artifact는 수정안에서 제외한다", () => {
  const artifacts = [
    {
      artifact_id: "supplier-ssot",
      type: "evidence.product_ssot",
      section_ids: [],
    },
    {
      artifact_id: "plan-hero",
      type: "content.section_plan",
      section_ids: ["hero"],
    },
    {
      artifact_id: "image-hero",
      type: "media.image_candidate",
      section_ids: ["hero"],
    },
    {
      artifact_id: "html-1",
      type: "page.html_revision",
      section_ids: ["hero", "spec"],
    },
  ];
  const resolver = new ScopeResolver({ artifacts });
  const planner = new RepairPlanner({ scopeResolver: resolver });
  const repairPlan = planner.propose({
    rubric_result_id: "result-1",
    checks: [
      {
        issue_code: "PRODUCT_IDENTITY_MISMATCH",
        section_id: "hero",
        status: "FAIL",
        severity: "hard",
      },
      {
        issue_code: "MOBILE_OVERFLOW",
        section_id: "spec",
        status: "FAIL",
        severity: "hard",
      },
    ],
  });

  assert.equal(repairPlan.proposals.length, 2);
  assert.deepEqual(repairPlan.proposals[0].root_artifact_ids, ["image-hero"]);
  assert.ok(repairPlan.proposals[0].protected_artifact_ids.includes("supplier-ssot"));
  assert.deepEqual(repairPlan.proposals[1].root_artifact_ids, ["html-1"]);
  assert.equal(repairPlan.deterministic, true);

  assert.throws(
    () =>
      assertInvalidationAllowed(repairPlan, [
        "image-hero",
        "supplier-ssot",
      ]),
    (error) =>
      error instanceof RubricLoopError &&
      error.code === "PROTECTED_ARTIFACT_INVALIDATION",
  );
  assert.deepEqual(
    assertInvalidationAllowed(repairPlan, ["image-hero"]),
    ["image-hero"],
  );
});

test("알 수 없는 issue code는 넓은 추측 수정 대신 명시적으로 거부한다", () => {
  const planner = new RepairPlanner({
    scopeResolver: new ScopeResolver({ artifacts: [] }),
  });
  assert.throws(
    () =>
      planner.propose({
        rubric_result_id: "result-unknown",
        checks: [
          {
            issue_code: "MADE_UP_ISSUE",
            section_id: "hero",
            status: "FAIL",
            severity: "warning",
          },
        ],
      }),
    (error) => error.code === "UNKNOWN_ISSUE_CODE",
  );
});

test("ScopeResolver는 계획된 issue 계열을 대소문자와 무관하게 고정 scope code로 매핑한다", () => {
  const resolver = new ScopeResolver({
    artifacts: [
      {
        artifact_id: "plan-1",
        type: "content.section_plan",
        section_ids: ["hero"],
      },
      {
        artifact_id: "motion-1",
        type: "motion.project",
        section_ids: ["hero"],
      },
      {
        artifact_id: "section-graph-1",
        type: "page.section_graph_resolved",
        section_ids: ["hero"],
      },
      {
        artifact_id: "html-1",
        type: "page.html_revision",
        section_ids: ["hero"],
      },
    ],
  });

  assert.equal(resolver.resolve({ issue_code: "copy_tone", section_id: "hero" }).scope_code, "copy-and-html");
  assert.equal(resolver.resolve({ issue_code: "visual_hierarchy", section_id: "hero" }).scope_code, "section-layout-token-and-html");
  assert.equal(resolver.resolve({ issue_code: "identity", section_id: "hero" }).scope_code, "image-gif-and-section");
  assert.equal(resolver.resolve({ issue_code: "motion_clarity", section_id: "hero" }).scope_code, "motion-gif-and-section");
  assert.equal(resolver.resolve({ issue_code: "claim_evidence", section_id: "hero" }).requires_reapproval, true);
  assert.equal(resolver.resolve({ issue_code: "rights", section_id: "hero" }).requires_reapproval, true);
  assert.equal(resolver.resolve({ issue_code: "page_pacing", section_id: "hero" }).scope_code, "section-order-and-html");
});
