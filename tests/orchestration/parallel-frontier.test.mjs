import assert from "node:assert/strict";
import test from "node:test";

import {
  ParallelFrontierError,
  planParallelFrontier,
  productionPlanDigest,
  validateParallelQaCompletion,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/parallel-frontier.mjs";
import {
  dispatchParallelProductionFrontier,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/parallel-dispatcher.mjs";
import {
  createParallelProductionPlan,
} from "../fixtures/orchestration/parallel-production-plan.mjs";

const HASH = "a".repeat(64);

function legacyPlanFixture() {
  return {
    plan_id: "plan-parallel-frontier",
    claim_graph: {
      claims: [
        {
          claim_id: "claim-benefit",
          fact_ids: ["fact-product-structure"],
        },
      ],
    },
    section_graph_draft: {
      sections: [{ section_id: "section-solution" }],
    },
    image_job_set: {
      jobs: [
        { job_id: "image-hero", prompt: "hero" },
        { job_id: "image-benefit", prompt: "benefit" },
        { job_id: "image-usage", prompt: "usage" },
      ],
    },
    gif_brief_set: {
      briefs: [
        {
          brief_id: "gif-problem-tightness",
          source: {
            kind: "product_reference",
            asset_ids: ["supplier-product"],
          },
        },
        {
          brief_id: "gif-benefit-stable-edge",
          source: {
            kind: "approved_image_job",
            image_job_ids: ["image-benefit"],
          },
        },
        {
          brief_id: "gif-waiting",
          source: {
            kind: "approved_image_job",
            image_job_ids: ["image-usage"],
          },
        },
        {
          brief_id: "gif-problem-rollup",
          source: {
            kind: "product_reference",
            asset_ids: ["supplier-product"],
          },
        },
        {
          brief_id: "gif-benefit-relaxed-fit",
          source: {
            kind: "product_reference",
            asset_ids: ["supplier-product"],
          },
        },
        {
          brief_id: "gif-benefit-cooling-contact",
          source: {
            kind: "product_reference",
            asset_ids: ["supplier-product"],
          },
        },
        {
          brief_id: "gif-usage-sequence",
          source: {
            kind: "product_reference",
            asset_ids: ["supplier-product"],
          },
        },
        {
          brief_id: "gif-comparison-pressure",
          source: {
            kind: "product_reference",
            asset_ids: ["supplier-product"],
          },
        },
      ],
    },
    commercial_flow: {
      hero: {
        section_id: "section-solution",
        static: true,
        primary_benefit_claim_ids: ["claim-benefit"],
        product_visual_priority: "largest",
        commercial_intensity: "high",
        product_identity_change_allowed: false,
      },
      section_role_order: [
        "hero",
        "pain",
        "product_answer",
        "solution_group",
        "usage",
        "comparison",
        "choice_and_fit",
        "specification_and_caution",
        "objection_and_faq",
        "decision_recap",
      ],
      problem_quotes: [
        {
          quote_id: "quote-tightness",
          pain_id: "pain-tightness",
          text: "“오래 끼면 조이는 느낌이 불편해요”",
          claim_id: "claim-benefit",
        },
        {
          quote_id: "quote-rollup",
          pain_id: "pain-rollup",
          text: "“움직일 때 자꾸 말려 올라가요”",
          claim_id: "claim-benefit",
        },
        {
          quote_id: "quote-heat",
          pain_id: "pain-heat",
          text: "“더운 날엔 안쪽이 쉽게 답답해져요”",
          claim_id: "claim-benefit",
        },
      ],
      product_answer: {
        section_id: "section-solution",
        sentence: "조임과 말림 부담을 덜어주는 제품입니다.",
      },
      solution_modules: [
        {
          solution_id: "solution-relaxed-fit",
          pain_id: "pain-tightness",
          claim_id: "claim-benefit",
          section_id: "section-solution",
          customer_benefit_copy: "오래 착용해도 조임 부담을 덜어줍니다.",
          still_image_job_id: "image-hero",
          benefit_motion_brief_id: "gif-benefit-relaxed-fit",
          fact_or_condition_id: "fact-product-structure",
          experiential_quote: "“오래 착용해도 부담이 덜해요”",
        },
        {
          solution_id: "solution-stable-edge",
          pain_id: "pain-rollup",
          claim_id: "claim-benefit",
          section_id: "section-solution",
          customer_benefit_copy: "움직여도 가장자리가 안정적으로 닿습니다.",
          still_image_job_id: "image-benefit",
          benefit_motion_brief_id: "gif-benefit-stable-edge",
          fact_or_condition_id: "fact-product-structure",
          experiential_quote: "“움직일 때도 말림 부담이 덜해요”",
        },
        {
          solution_id: "solution-cooling-contact",
          pain_id: "pain-heat",
          claim_id: "claim-benefit",
          section_id: "section-solution",
          customer_benefit_copy: "더운 날 답답한 느낌을 덜어줍니다.",
          still_image_job_id: "image-usage",
          benefit_motion_brief_id: "gif-benefit-cooling-contact",
          fact_or_condition_id: "fact-product-structure",
          experiential_quote: "“더운 날에도 닿는 느낌이 산뜻해요”",
        },
      ],
      problem_motion_brief_ids: [
        "gif-problem-tightness",
        "gif-problem-rollup",
      ],
      usage: {
        section_id: "section-solution",
        sequence: ["preparation", "use", "result"],
      },
      usage_motion_brief_ids: ["gif-usage-sequence"],
      comparison: {
        section_id: "section-solution",
        prior_inconvenience: "기존에는 조임과 말림이 부담이었습니다.",
        verified_difference: "제품 구조로 착용 부담을 덜었습니다.",
        competitor_attack: false,
      },
      comparison_motion_brief_ids: ["gif-comparison-pressure"],
      motion_target: { planned_total: 8 },
      actual_review: {
        section_present: false,
        verified_same_sku_receipt_id: null,
      },
      public_presentation: {
        review_ui: false,
        fake_transaction_ui: false,
      },
    },
  };
}

function plan() {
  return createParallelProductionPlan();
}

function approval(productionPlan) {
  return {
    decision_id: "decision-plan-approved",
    decision: "approved",
    subject_plan_sha256: productionPlanDigest(productionPlan),
  };
}

test("G0 공급처·사진·시장 discovery·지식 준비를 worker capacity까지 병렬 발급한다", () => {
  const frontier = planParallelFrontier({
    ready_stage_ids: [
      "G0A_SUPPLIER",
      "G0B_PHOTO",
      "G1D_DISCOVERY",
      "G1B_KNOWLEDGE",
    ],
    project_input_digest: HASH,
    worker_capacity: 4,
    worker_session_ids: ["worker-a", "worker-b", "worker-c", "worker-d"],
  });

  assert.equal(frontier.issued_count, 4);
  assert.equal(frontier.capacity_filled, true);
  assert.deepEqual(
    frontier.work_orders.map((item) => item.stage_id),
    [
      "G0A_SUPPLIER",
      "G0B_PHOTO",
      "G1D_DISCOVERY",
      "G1B_KNOWLEDGE",
    ],
  );
  for (const workOrder of frontier.work_orders) {
    assert.match(workOrder.expected_artifact_id, /^artifact-/);
    assert.match(workOrder.exact_input_digest, /^[a-f0-9]{64}$/);
    assert.match(workOrder.output_locator, /^orchestration\/staging\//);
    assert.equal(workOrder.requires_execution_receipt, true);
    assert.equal(
      workOrder.requires_independent_validation_receipt,
      true,
    );
  }
});

test("G2 image cut과 source가 준비된 G3 motion module을 서로 다른 worker로 교차 병렬 발급한다", () => {
  const productionPlan = plan();
  const frontier = planParallelFrontier({
    ready_stage_ids: ["G2A_IMAGE", "G3P_PREVIEW"],
    project_input_digest: HASH,
    production_plan: productionPlan,
    plan_approval: approval(productionPlan),
    approved_image_job_ids: ["image-benefit"],
    worker_capacity: 4,
    worker_session_ids: ["worker-a", "worker-b", "worker-c", "worker-d"],
  });

  assert.deepEqual(
    frontier.work_orders.map((item) => item.kind),
    ["image_cut", "motion_module", "image_cut", "motion_module"],
  );
  assert.deepEqual(
    frontier.work_orders.map((item) => item.member_id),
    [
      "image-hero",
      "gif-problem-tightness",
      "image-benefit",
      "gif-benefit-stable-edge",
    ],
  );
  assert.ok(
    frontier.work_orders.every(
      (item) =>
        item.validation_session_constraint.must_differ_from[0] ===
        item.producer_agent_session_id,
    ),
  );
  assert.equal(
    frontier.work_orders.some((item) => item.member_id === "gif-waiting"),
    false,
  );
});

test("14기준 commercial flow가 깨지면 exact 승인이 있어도 G1 이후 frontier를 발급하지 않는다", () => {
  const productionPlan = plan();
  productionPlan.commercial_flow.problem_motion_brief_ids = [];
  const exactApproval = approval(productionPlan);

  assert.throws(
    () =>
      planParallelFrontier({
        ready_stage_ids: ["G2A_IMAGE", "G3P_PREVIEW"],
        project_input_digest: HASH,
        production_plan: productionPlan,
        plan_approval: exactApproval,
        worker_capacity: 2,
        worker_session_ids: ["worker-a", "worker-b"],
      }),
    (error) =>
      error instanceof ParallelFrontierError &&
      error.code === "COMMERCIAL_FLOW_GATE_BLOCKED",
  );
});

test("research_only 이미지 생성 참조가 있으면 commercial subset을 통과해도 G2 frontier를 차단한다", () => {
  const productionPlan = plan();
  const reference =
    productionPlan.image_job_set.jobs[0].rights.reference_assets[0];
  reference.source_kind = "coupang";
  reference.classification = "research_only";
  reference.same_sku_verified = false;
  const exactApproval = approval(productionPlan);

  assert.throws(
    () =>
      planParallelFrontier({
        ready_stage_ids: ["G2A_IMAGE"],
        project_input_digest: HASH,
        production_plan: productionPlan,
        plan_approval: exactApproval,
        worker_capacity: 1,
        worker_session_ids: ["worker-a"],
      }),
    (error) =>
      error instanceof ParallelFrontierError &&
      error.code === "PRODUCTION_PLAN_GATE_BLOCKED" &&
      error.details.errors.some(
        (item) =>
          item.code === "IMAGE_GENERATION_REFERENCE_FORBIDDEN",
      ),
  );
});

test("같은 artifact member의 중복 active lease를 차단한다", () => {
  const productionPlan = plan();
  const activeLease = {
    work_item_id: "G2A_IMAGE:image-hero",
    producer_agent_session_id: "worker-active",
    status: "running",
  };
  const frontier = planParallelFrontier({
    ready_stage_ids: ["G2A_IMAGE"],
    project_input_digest: HASH,
    production_plan: productionPlan,
    plan_approval: approval(productionPlan),
    active_leases: [activeLease],
    worker_capacity: 3,
    worker_session_ids: [
      "worker-active",
      "worker-b",
      "worker-c",
    ],
  });
  assert.equal(
    frontier.work_orders.some(
      (item) => item.work_item_id === activeLease.work_item_id,
    ),
    false,
  );

  assert.throws(
    () =>
      planParallelFrontier({
        ready_stage_ids: ["G2A_IMAGE"],
        project_input_digest: HASH,
        production_plan: productionPlan,
        plan_approval: approval(productionPlan),
        active_leases: [activeLease, { ...activeLease }],
        worker_capacity: 3,
        worker_session_ids: [
          "worker-active",
          "worker-b",
          "worker-c",
        ],
      }),
    (error) =>
      error instanceof ParallelFrontierError &&
      error.code === "DUPLICATE_ACTIVE_LEASE",
  );
});

test("Commercial·Evidence·Identity·Visual·Motion·Technical QA는 생산자와 다른 병렬 session에 배정한다", () => {
  const qaSubject = {
    artifact_id: "studio-commit",
    manifest_sha256: HASH,
    producer_agent_session_ids: ["page-producer"],
  };
  const frontier = planParallelFrontier({
    ready_stage_ids: ["G4_PARALLEL_QA"],
    project_input_digest: HASH,
    qa_subject: qaSubject,
    worker_capacity: 6,
    worker_session_ids: [
      "page-producer",
      "qa-a",
      "qa-b",
      "qa-c",
      "qa-d",
      "qa-e",
      "qa-f",
    ],
  });

  assert.equal(frontier.issued_count, 6);
  assert.deepEqual(
    new Set(frontier.work_orders.map((item) => item.member_id)),
    new Set([
      "commercial",
      "evidence",
      "identity",
      "visual",
      "motion",
      "technical",
    ]),
  );
  assert.equal(
    frontier.work_orders.some(
      (item) => item.producer_agent_session_id === "page-producer",
    ),
    false,
  );
  assert.equal(
    new Set(
      frontier.work_orders.map(
        (item) => item.producer_agent_session_id,
      ),
    ).size,
    6,
  );

  const qaResults = frontier.work_orders.map((workOrder) => ({
    qa_lane: workOrder.member_id,
    artifact_id: workOrder.expected_artifact_id,
    exact_input_digest: workOrder.exact_input_digest,
    output_locator: workOrder.output_locator,
    producer_agent_session_id: workOrder.producer_agent_session_id,
    execution_receipt: {
      execution_id: `execution-${workOrder.member_id}`,
      adapter_id: "IndependentQaAdapter",
      adapter_code_sha256: HASH,
    },
    validation_receipt: {
      validation_id: `validation-${workOrder.member_id}`,
      subject: {
        artifact_set_digest: workOrder.exact_input_digest,
      },
      validator: {
        agent_session_id: workOrder.producer_agent_session_id,
      },
      producer: {
        agent_session_ids: ["page-producer"],
      },
      verdict: "PASS",
      hard_failures: [],
    },
  }));
  const completion = validateParallelQaCompletion({
    qa_subject: qaSubject,
    results: qaResults,
  });
  assert.equal(completion.ok, true);
  assert.match(completion.qa_bundle_sha256, /^[a-f0-9]{64}$/);

  qaResults.pop();
  assert.equal(
    validateParallelQaCompletion({
      qa_subject: qaSubject,
      results: qaResults,
    }).ok,
    false,
  );
});

test("retry frontier는 실패 member와 명시된 descendants만 다시 발급한다", () => {
  const productionPlan = plan();
  const frontier = planParallelFrontier({
    ready_stage_ids: ["G2A_IMAGE", "G3P_PREVIEW"],
    project_input_digest: HASH,
    production_plan: productionPlan,
    plan_approval: approval(productionPlan),
    approved_image_job_ids: ["image-benefit"],
    failed_members: [
      {
        work_item_id: "G2A_IMAGE:image-hero",
        descendant_work_item_ids: [
          "G3P_PREVIEW:gif-problem-tightness",
        ],
      },
    ],
    retry_member_ids: ["G2A_IMAGE:image-hero"],
    worker_capacity: 4,
    worker_session_ids: ["worker-a", "worker-b", "worker-c", "worker-d"],
  });

  assert.deepEqual(
    frontier.work_orders.map((item) => item.work_item_id),
    [
      "G2A_IMAGE:image-hero",
      "G3P_PREVIEW:gif-problem-tightness",
    ],
  );
});

test("failed_members가 있는데 retry root가 없으면 통과 sibling 전체 재발급을 차단한다", () => {
  const productionPlan = plan();
  assert.throws(
    () =>
      planParallelFrontier({
        ready_stage_ids: ["G2A_IMAGE"],
        project_input_digest: HASH,
        production_plan: productionPlan,
        plan_approval: approval(productionPlan),
        failed_members: [
          {
            work_item_id: "G2A_IMAGE:image-hero",
            descendant_work_item_ids: [],
          },
        ],
        retry_member_ids: [],
        worker_capacity: 3,
        worker_session_ids: [
          "worker-a",
          "worker-b",
          "worker-c",
        ],
      }),
    (error) =>
      error instanceof ParallelFrontierError &&
      error.code === "FAILED_RETRY_SCOPE_REQUIRED",
  );
});

test("dispatcher는 persistent failed member와 descendant를 자동 재시도하고 통과 sibling은 재발급하지 않는다", async () => {
  const productionPlan = plan();
  let leasedCapabilities = null;
  const engine = {
    async inspect() {
      return {
        frontier_work_items: [
          {
            work_order_id: "failed-image-benefit",
            work_item_id: "G2A_IMAGE:image-benefit",
            stage_id: "G2A_IMAGE",
            member_id: "image-benefit",
            status: "failed",
            descendant_work_item_ids: [
              "G3P_PREVIEW:gif-benefit-stable-edge",
            ],
          },
          {
            work_order_id: "passed-image-hero",
            work_item_id: "G2A_IMAGE:image-hero",
            stage_id: "G2A_IMAGE",
            member_id: "image-hero",
            status: "completed",
          },
        ],
      };
    },
    async leaseFrontier(_projectRef, capabilities) {
      leasedCapabilities = capabilities;
      return {
        kind: "FrontierLeased",
        work_orders: capabilities.planned_work_items,
      };
    },
    async completeParallelFrontier() {
      throw new Error("frontier must not complete during retry");
    },
  };

  const result = await dispatchParallelProductionFrontier({
    engine,
    project_ref: {
      project_id: "project-retry",
      input_digest: HASH,
      agent_session_id: "coordinator",
    },
    advance_result: {
      kind: "WorkAvailable",
      ready_stages: ["G3P_PREVIEW"],
    },
    production_plan: productionPlan,
    plan_approval: approval(productionPlan),
    approved_image_job_ids: ["image-benefit"],
    worker_capacity: 2,
    worker_session_ids: ["worker-a", "worker-b"],
  });

  assert.equal(result.frontier_plan.planned_count, 2);
  assert.deepEqual(
    leasedCapabilities.planned_work_items.map(
      (item) => item.work_item_id,
    ),
    [
      "G2A_IMAGE:image-benefit",
      "G3P_PREVIEW:gif-benefit-stable-edge",
    ],
  );
  assert.equal(
    leasedCapabilities.planned_work_items.some(
      (item) => item.work_item_id === "G2A_IMAGE:image-hero",
    ),
    false,
  );
});
