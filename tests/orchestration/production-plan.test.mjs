import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionPlan,
  validateProductionPlan,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/production-plan.mjs";

const SHA256 = "a".repeat(64);
const GIF_IDS = Object.freeze([
  "gif-problem-tightness",
  "gif-problem-rollup",
  "gif-benefit-relaxed-fit",
  "gif-benefit-stable-edge",
  "gif-benefit-cooling-contact",
  "gif-usage-sequence",
  "gif-comparison-pressure",
]);

function gifBrief(briefId) {
  return {
    brief_id: briefId,
    claim_ids: ["claim-cooling-contact"],
    slot_ids: ["slot-hero-visual"],
    motion_necessity: {
      required: true,
      reason: "시간에 따른 착용 상태 변화를 보여줘야 한다.",
      static_insufficiency: "한 프레임만으로는 전후 상태가 구분되지 않는다.",
    },
    source: {
      kind: "approved_image_job",
      image_job_ids: ["image-hero-product"],
      asset_ids: ["asset-product-front"],
    },
    static_fallback: {
      image_job_id: "image-hero-product",
      reason: "모션 재생이 불가능하면 승인된 정지 이미지를 표시한다.",
    },
  };
}

function validProductionPlan() {
  return {
    schema_version: "1.0",
    plan_id: "plan-cooling-shirt",
    provenance: {
      product_ssot: {
        artifact_id: "artifact-product-ssot",
        manifest_sha256: "b".repeat(64),
      },
      market_snapshots: [
        {
          artifact_id: "artifact-market-snapshot",
          manifest_sha256: "c".repeat(64),
          finding_ids: ["finding-cooling-shirt-sweat"],
        },
      ],
      knowledge_snapshot: {
        artifact_id: "artifact-knowledge-snapshot",
        manifest_sha256: "d".repeat(64),
      },
      applied_rules: {
        commercial: [
          { rule_id: "CR-001", rule_sha256: "e".repeat(64) },
        ],
        taste: [
          { rule_id: "TR-001", rule_sha256: "f".repeat(64) },
        ],
        motion: [
          { rule_id: "MR-001", rule_sha256: "1".repeat(64) },
        ],
      },
    },
    copy_tone: {
      owner: "html_dom",
      voice: ["간결한 근거 우선 문장"],
      prohibited: ["근거 없는 최상급"],
      source_rule_ids: ["CR-001", "TR-001"],
    },
    claim_graph: {
      claims: [
        {
          claim_id: "claim-cooling-contact",
          fact_ids: ["fact-fabric-contact"],
          evidence_asset_ids: ["evidence-supplier-detail"],
          section_ids: ["section-hero"],
          slot_ids: ["slot-hero-visual"],
          image_job_ids: ["image-hero-product"],
          gif_brief_ids: [...GIF_IDS],
        },
      ],
    },
    section_graph_draft: {
      sections: [
        {
          section_id: "section-hero",
          claim_ids: ["claim-cooling-contact"],
          slot_ids: ["slot-hero-visual"],
        },
      ],
      slots: [
        {
          slot_id: "slot-hero-visual",
          section_id: "section-hero",
          claim_ids: ["claim-cooling-contact"],
          image_job_ids: ["image-hero-product"],
          gif_brief_ids: [...GIF_IDS],
        },
      ],
    },
    image_job_set: {
      jobs: [
        {
          job_id: "image-hero-product",
          claim_ids: ["claim-cooling-contact"],
          slot_ids: ["slot-hero-visual"],
          gif_brief_ids: [...GIF_IDS],
          identity: {
            reference_asset_ids: ["asset-product-front"],
            must_preserve: [
              "silhouette",
              "parts",
              "quantity",
              "text",
              "orientation",
            ],
          },
          rights: {
            reference_assets: [
              {
                asset_id: "asset-product-front",
                source_kind: "supplier_same_sku",
                classification: "identity_reference",
                same_sku_verified: true,
                production_use_allowed: false,
              },
            ],
            output_classification: "production_generated",
          },
          size: {
            mode: "target",
            width: 800,
            height: 2000,
            confirmation_decision_id: "decision-image-size",
          },
          candidate_count: 4,
        },
      ],
    },
    gif_brief_set: {
      briefs: GIF_IDS.map(gifBrief),
    },
    commercial_flow: {
      hero: {
        section_id: "section-hero",
        static: true,
        primary_benefit_claim_ids: ["claim-cooling-contact"],
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
          claim_id: "claim-cooling-contact",
        },
        {
          quote_id: "quote-rollup",
          pain_id: "pain-rollup",
          text: "“움직일 때 자꾸 말려 올라가요”",
          claim_id: "claim-cooling-contact",
        },
        {
          quote_id: "quote-heat",
          pain_id: "pain-heat",
          text: "“더운 날엔 안쪽이 쉽게 답답해져요”",
          claim_id: "claim-cooling-contact",
        },
      ],
      product_answer: {
        section_id: "section-hero",
        sentence: "조임 부담을 덜고 안정적으로 밀착되는 팔토시입니다.",
      },
      solution_modules: [
        {
          solution_id: "solution-relaxed-fit",
          pain_id: "pain-tightness",
          claim_id: "claim-cooling-contact",
          section_id: "section-hero",
          customer_benefit_copy: "오래 착용해도 조임 부담을 덜어줍니다.",
          still_image_job_id: "image-hero-product",
          benefit_motion_brief_id: "gif-benefit-relaxed-fit",
          fact_or_condition_id: "fact-fabric-contact",
          experiential_quote: "“오래 착용해도 부담이 덜해요”",
        },
        {
          solution_id: "solution-stable-edge",
          pain_id: "pain-rollup",
          claim_id: "claim-cooling-contact",
          section_id: "section-hero",
          customer_benefit_copy: "움직임에도 가장자리가 안정적으로 닿습니다.",
          still_image_job_id: "image-hero-product",
          benefit_motion_brief_id: "gif-benefit-stable-edge",
          fact_or_condition_id: "fact-fabric-contact",
          experiential_quote: "“움직일 때도 말림 부담이 덜해요”",
        },
        {
          solution_id: "solution-cooling-contact",
          pain_id: "pain-heat",
          claim_id: "claim-cooling-contact",
          section_id: "section-hero",
          customer_benefit_copy: "더운 날 피부에 닿는 답답함을 줄여줍니다.",
          still_image_job_id: "image-hero-product",
          benefit_motion_brief_id: "gif-benefit-cooling-contact",
          fact_or_condition_id: "fact-fabric-contact",
          experiential_quote: "“더운 날에도 닿는 느낌이 산뜻해요”",
        },
      ],
      problem_motion_brief_ids: [
        "gif-problem-tightness",
        "gif-problem-rollup",
      ],
      usage_motion_brief_ids: ["gif-usage-sequence"],
      usage: {
        section_id: "section-hero",
        sequence: ["preparation", "use", "result"],
      },
      comparison_motion_brief_ids: ["gif-comparison-pressure"],
      comparison: {
        section_id: "section-hero",
        prior_inconvenience: "기존에는 조임과 말림이 부담이었습니다.",
        verified_difference: "제품 구조와 착용 조건에서 부담을 덜도록 설계했습니다.",
        competitor_attack: false,
      },
      motion_target: {
        planned_total: 7,
      },
      actual_review: {
        section_present: false,
        verified_same_sku_receipt_id: null,
      },
      public_presentation: {
        review_ui: false,
        fake_transaction_ui: false,
      },
    },
    rubric_target: {
      rubric_version: "behance-commerce-v1",
      rubric_snapshot_sha256: SHA256,
      target_score: 97,
      hard_failure_max: 0,
      dimensions: [
        {
          criterion_id: "visual-hierarchy",
          target_score: 95,
        },
      ],
    },
  };
}

test("G1C ProductionPlan의 다섯 파트와 양방향 그래프가 완결되면 제작 계약으로 확정한다", () => {
  const plan = validProductionPlan();

  const result = assertProductionPlan(plan);

  assert.equal(result, plan);
  const validation = validateProductionPlan(plan);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.summary, {
    claims: 1,
    sections: 1,
    slots: 1,
    image_jobs: 1,
    gif_briefs: 7,
    orphans: 0,
  });
});

test("section, slot, claim ID는 위치 번호나 임시 UUID가 아닌 안정적인 의미 slug여야 한다", () => {
  const plan = validProductionPlan();
  plan.claim_graph.claims[0].claim_id = "claim-001";

  const validation = validateProductionPlan(plan);

  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) =>
        error.code === "UNSTABLE_ID" &&
        error.path === "claim_graph.claims[0].claim_id",
    ),
  );
  assert.throws(
    () => assertProductionPlan(plan),
    (error) =>
      error.code === "INVALID_PRODUCTION_PLAN" &&
      error.details.errors.some((item) => item.code === "UNSTABLE_ID"),
  );
});

test("claim, section, slot, image job, GIF brief의 모든 참조는 역방향 참조까지 일치해야 한다", () => {
  const plan = validProductionPlan();
  plan.image_job_set.jobs[0].claim_ids = [];

  const validation = validateProductionPlan(plan);

  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) =>
        error.code === "REFERENCE_NOT_BIDIRECTIONAL" &&
        error.path ===
          "claim_graph.claims[0].image_job_ids[image-hero-product]",
    ),
  );
  assert.ok(
    validation.errors.some(
      (error) =>
        error.code === "ORPHAN_NODE" &&
        error.details.node === "image_job:image-hero-product",
    ),
  );
  assert.equal(validation.summary.orphans, 1);
});

test("GIF brief는 모션 필요성, 승인 소스, 정적 fallback을 모두 지정해야 한다", () => {
  const plan = validProductionPlan();
  const brief = plan.gif_brief_set.briefs[0];
  brief.motion_necessity.static_insufficiency = "";
  brief.source.image_job_ids = [];
  brief.static_fallback = null;

  const validation = validateProductionPlan(plan);

  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) => error.code === "GIF_MOTION_NECESSITY_REQUIRED",
    ),
  );
  assert.ok(
    validation.errors.some((error) => error.code === "GIF_SOURCE_REQUIRED"),
  );
  assert.ok(
    validation.errors.some(
      (error) => error.code === "GIF_STATIC_FALLBACK_REQUIRED",
    ),
  );
});

test("image job은 동일성 잠금, 파일별 권리, 확정 크기, 명시적 후보 수를 가져야 한다", () => {
  const plan = validProductionPlan();
  const job = plan.image_job_set.jobs[0];
  job.identity.must_preserve = ["silhouette"];
  job.rights.reference_assets[0].production_use_allowed = true;
  job.size.width = 0;
  job.size.confirmation_decision_id = "";
  job.candidate_count = 0;

  const validation = validateProductionPlan(plan);

  assert.equal(validation.ok, false);
  for (const code of [
    "IMAGE_IDENTITY_INCOMPLETE",
    "IMAGE_RIGHTS_INVALID",
    "IMAGE_SIZE_INVALID",
    "IMAGE_CANDIDATE_COUNT_INVALID",
  ]) {
    assert.ok(
      validation.errors.some((error) => error.code === code),
      `${code} 오류가 필요합니다.`,
    );
  }
});

test("G2 이미지 생성 참조는 same-SKU 공급처 또는 실제 제품 사진만 허용한다", () => {
  for (const [sourceKind, classification] of [
    ["coupang_market", "research_only"],
    ["behance_research", "research_only"],
    ["coupang_market", "identity_reference"],
  ]) {
    const plan = validProductionPlan();
    const reference =
      plan.image_job_set.jobs[0].rights.reference_assets[0];
    reference.source_kind = sourceKind;
    reference.classification = classification;
    reference.same_sku_verified = false;

    const validation = validateProductionPlan(plan);
    assert.equal(validation.ok, false);
    assert.ok(
      validation.errors.some(
        (error) =>
          error.code ===
          "IMAGE_GENERATION_REFERENCE_FORBIDDEN",
      ),
      `${sourceKind}/${classification}`,
    );
  }

  const actualPhotoPlan = validProductionPlan();
  const actualPhotoReference =
    actualPhotoPlan.image_job_set.jobs[0].rights.reference_assets[0];
  actualPhotoReference.source_kind = "actual_product_photo";
  actualPhotoReference.classification = "identity_reference";
  delete actualPhotoReference.same_sku_verified;
  assert.equal(validateProductionPlan(actualPhotoPlan).ok, true);
});

test("rubric target은 버전과 snapshot hash, 목표 점수, hard failure 0을 고정한다", () => {
  const plan = validProductionPlan();
  plan.rubric_target.rubric_snapshot_sha256 = "latest";
  plan.rubric_target.target_score = 96;
  plan.rubric_target.hard_failure_max = 1;
  plan.rubric_target.dimensions = [];

  const validation = validateProductionPlan(plan);

  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) => error.code === "RUBRIC_TARGET_INVALID",
    ),
  );
});

test("SSOT·시장 finding·동결 지식과 디자인/어투 rule trace가 없으면 기획을 확정하지 않는다", () => {
  const plan = validProductionPlan();
  plan.provenance.market_snapshots[0].finding_ids = [];
  plan.provenance.knowledge_snapshot.manifest_sha256 = "latest";
  plan.provenance.applied_rules.taste = [];
  plan.copy_tone.owner = "generated_image";
  plan.copy_tone.source_rule_ids = ["CR-999"];

  const validation = validateProductionPlan(plan);
  assert.equal(validation.ok, false);
  for (const code of [
    "PLAN_SOURCE_BINDING_INVALID",
    "PLAN_RULE_TRACE_INVALID",
    "COPY_TONE_CONTRACT_INVALID",
  ]) {
    assert.ok(
      validation.errors.some((error) => error.code === code),
      `${code} 오류가 필요합니다.`,
    );
  }
});

test("ProductionPlan의 개별 rule ID/hash는 frozen KnowledgeSnapshot index와 정확히 같아야 한다", () => {
  const plan = validProductionPlan();
  const knowledgeSnapshot = {
    knowledge_snapshot_id: "artifact-knowledge-snapshot",
    manifest_sha256:
      plan.provenance.knowledge_snapshot.manifest_sha256,
    rule_index: [
      ...plan.provenance.applied_rules.commercial,
      ...plan.provenance.applied_rules.taste,
      ...plan.provenance.applied_rules.motion,
    ],
  };

  assert.equal(
    validateProductionPlan(plan, { knowledgeSnapshot }).ok,
    true,
  );
  knowledgeSnapshot.rule_index[0] = {
    ...knowledgeSnapshot.rule_index[0],
    rule_sha256: "9".repeat(64),
  };
  const validation = validateProductionPlan(plan, {
    knowledgeSnapshot,
  });
  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) => error.code === "PLAN_RULE_SNAPSHOT_MISMATCH",
    ),
  );
});

test("필수 motion을 0개로 우회하는 not_required 결정은 commercial flow gate가 거부한다", () => {
  const plan = validProductionPlan();
  plan.claim_graph.claims[0].gif_brief_ids = [];
  plan.section_graph_draft.slots[0].gif_brief_ids = [];
  plan.image_job_set.jobs[0].gif_brief_ids = [];
  plan.gif_brief_set = {
    briefs: [],
    not_required: {
      decision_id: "decision-motion-not-required",
      reason: "제품 구조와 사용법을 승인된 정지 이미지 한 장으로 더 빠르게 설명할 수 있다.",
      static_slot_ids: ["slot-hero-visual"],
    },
  };
  plan.commercial_flow.problem_motion_brief_ids = [];
  plan.commercial_flow.usage_motion_brief_ids = [];
  plan.commercial_flow.comparison_motion_brief_ids = [];
  plan.commercial_flow.solution_modules.forEach((solution) => {
    solution.benefit_motion_brief_id = "gif-missing";
  });
  plan.commercial_flow.motion_target.planned_total = 0;

  const invalid = validateProductionPlan(plan);
  assert.equal(invalid.ok, false);
  assert.ok(
    invalid.errors.some(
      (error) => error.code === "TOTAL_MOTION_MINIMUM_NOT_MET",
    ),
  );
});

test("불편 3~5개와 해결 1:1 순서, 문제 2+·장점별·사용·비교 motion을 모두 강제한다", () => {
  const plan = validProductionPlan();
  plan.commercial_flow.problem_quotes[0].text = "인용부호 없는 불편";
  plan.commercial_flow.solution_modules[1].pain_id = "pain-other";
  plan.commercial_flow.problem_motion_brief_ids = [
    "gif-problem-tightness",
  ];
  plan.commercial_flow.comparison_motion_brief_ids = [];

  const invalid = validateProductionPlan(plan);
  assert.equal(invalid.ok, false);
  for (const code of [
    "PROBLEM_QUOTE_PUBLIC_FORM_INVALID",
    "PAIN_SOLUTION_ONE_TO_ONE_INVALID",
    "MOTION_ROLE_COVERAGE_INSUFFICIENT",
  ]) {
    assert.ok(
      invalid.errors.some((error) => error.code === code),
      `${code} 오류가 필요합니다.`,
    );
  }
});

test("기본 7~9개 밖의 motion 계획은 명시적인 예외 사유를 요구한다", () => {
  const plan = validProductionPlan();
  const extra = gifBrief("gif-support-extra-one");
  plan.gif_brief_set.briefs.push(extra);
  plan.gif_brief_set.briefs.push(gifBrief("gif-support-extra-two"));
  plan.gif_brief_set.briefs.push(gifBrief("gif-support-extra-three"));
  plan.claim_graph.claims[0].gif_brief_ids.push(
    "gif-support-extra-one",
    "gif-support-extra-two",
    "gif-support-extra-three",
  );
  plan.section_graph_draft.slots[0].gif_brief_ids.push(
    "gif-support-extra-one",
    "gif-support-extra-two",
    "gif-support-extra-three",
  );
  plan.image_job_set.jobs[0].gif_brief_ids.push(
    "gif-support-extra-one",
    "gif-support-extra-two",
    "gif-support-extra-three",
  );
  plan.commercial_flow.motion_target.planned_total = 10;

  const withoutReason = validateProductionPlan(plan);
  assert.equal(withoutReason.ok, false);
  assert.ok(
    withoutReason.errors.some(
      (error) => error.code === "MOTION_DEFAULT_RANGE_EXCEPTION_REQUIRED",
    ),
  );

  plan.commercial_flow.motion_target.default_exception_reason =
    "사용 단계가 복잡해 시간축 근거를 세 모듈 더 사용한다.";
  assert.equal(validateProductionPlan(plan).ok, true);
});

test("Hero·필수 section 순서·pain 사이의 한 문장 product answer를 강제한다", () => {
  const plan = validProductionPlan();
  plan.commercial_flow.hero.static = false;
  plan.commercial_flow.hero.primary_benefit_claim_ids.push(
    "claim-cooling-contact",
  );
  [
    plan.commercial_flow.section_role_order[0],
    plan.commercial_flow.section_role_order[1],
  ] = [
    plan.commercial_flow.section_role_order[1],
    plan.commercial_flow.section_role_order[0],
  ];
  plan.commercial_flow.product_answer.sentence =
    "조임을 덜어줍니다. 말림도 줄여줍니다.";

  const invalid = validateProductionPlan(plan);
  for (const code of [
    "HERO_CONTRACT_INVALID",
    "SECTION_ROLE_ORDER_INVALID",
    "PRODUCT_ANSWER_CONTRACT_INVALID",
  ]) {
    assert.ok(
      invalid.errors.some((error) => error.code === code),
      `${code} 오류가 필요합니다.`,
    );
  }
});

test("Hero의 largest·high·identity-lock 세 필드는 각각 mutation을 차단한다", () => {
  for (const [field, invalidValue] of [
    ["product_visual_priority", "balanced"],
    ["commercial_intensity", "medium"],
    ["product_identity_change_allowed", true],
  ]) {
    const plan = validProductionPlan();
    plan.commercial_flow.hero[field] = invalidValue;
    const validation = validateProductionPlan(plan);
    assert.equal(validation.ok, false);
    assert.ok(
      validation.errors.some(
        (error) => error.code === "HERO_CONTRACT_INVALID",
      ),
      field,
    );
  }
});

test("해결 장점마다 benefit copy·still·motion·fact·무기명 체감 인용의 다섯 요소를 강제한다", () => {
  const plan = validProductionPlan();
  const solution = plan.commercial_flow.solution_modules[0];
  solution.customer_benefit_copy = "";
  solution.still_image_job_id = "image-missing";
  solution.fact_or_condition_id = "fact-missing";
  solution.experiential_quote = "인용부호 없는 의견";
  solution.author = "가상 구매자";
  solution.review_ui = true;

  const invalid = validateProductionPlan(plan);
  assert.ok(
    invalid.errors.some(
      (error) => error.code === "SOLUTION_FIVE_PART_CONTRACT_INVALID",
    ),
  );
});

test("usage·comparison 흐름과 가짜 후기 UI·거래 CTA 금지를 강제한다", () => {
  const plan = validProductionPlan();
  plan.commercial_flow.usage.sequence = [
    "use",
    "preparation",
    "result",
  ];
  plan.commercial_flow.comparison.verified_difference = "";
  plan.commercial_flow.comparison.competitor_attack = true;
  plan.commercial_flow.public_presentation.review_ui = true;
  plan.commercial_flow.public_presentation.fake_transaction_ui = true;

  const invalid = validateProductionPlan(plan);
  for (const code of [
    "USAGE_SEQUENCE_INVALID",
    "COMPARISON_CONTRACT_INVALID",
    "PUBLIC_PRESENTATION_CONTRACT_INVALID",
  ]) {
    assert.ok(
      invalid.errors.some((error) => error.code === code),
      `${code} 오류가 필요합니다.`,
    );
  }
});

test("불편 의견의 질문형과 검증되지 않은 same-SKU 후기 section을 금지한다", () => {
  const plan = validProductionPlan();
  plan.commercial_flow.problem_quotes[0].text =
    "“오래 끼면 불편하지 않나요?”";
  plan.commercial_flow.actual_review = {
    section_present: true,
    verified_same_sku_receipt_id: "review-receipt-missing",
  };

  const invalid = validateProductionPlan(plan);
  for (const code of [
    "PROBLEM_QUOTE_QUESTION_FORM_FORBIDDEN",
    "ACTUAL_REVIEW_VERIFIED_SAME_SKU_REQUIRED",
  ]) {
    assert.ok(
      invalid.errors.some((error) => error.code === code),
      `${code} 오류가 필요합니다.`,
    );
  }
});

test("actual review section은 exact verified same-SKU receipt가 있을 때만 허용한다", () => {
  const plan = validProductionPlan();
  plan.provenance.verified_same_sku_review_receipts = [
    {
      receipt_id: "review-receipt-same-sku",
      same_sku_verified: true,
      receipt_sha256: "8".repeat(64),
    },
  ];
  plan.commercial_flow.actual_review = {
    section_present: true,
    verified_same_sku_receipt_id: "review-receipt-same-sku",
  };

  assert.equal(validateProductionPlan(plan).ok, true);
});

test("역할 합산 effective motion minimum 7을 하드 gate로 적용한다", () => {
  const plan = validProductionPlan();
  const removed = "gif-comparison-pressure";
  plan.gif_brief_set.briefs = plan.gif_brief_set.briefs.filter(
    (brief) => brief.brief_id !== removed,
  );
  plan.claim_graph.claims[0].gif_brief_ids =
    plan.claim_graph.claims[0].gif_brief_ids.filter(
      (briefId) => briefId !== removed,
    );
  plan.section_graph_draft.slots[0].gif_brief_ids =
    plan.section_graph_draft.slots[0].gif_brief_ids.filter(
      (briefId) => briefId !== removed,
    );
  plan.image_job_set.jobs[0].gif_brief_ids =
    plan.image_job_set.jobs[0].gif_brief_ids.filter(
      (briefId) => briefId !== removed,
    );
  plan.commercial_flow.comparison_motion_brief_ids = [];
  plan.commercial_flow.motion_target.planned_total = 6;
  plan.commercial_flow.motion_target.default_exception_reason =
    "성능 예외";

  const invalid = validateProductionPlan(plan);
  assert.ok(
    invalid.errors.some(
      (error) => error.code === "TOTAL_MOTION_MINIMUM_NOT_MET",
    ),
  );
});
