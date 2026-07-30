const SHA256 = "a".repeat(64);

const GIF_IDS = Object.freeze([
  "gif-problem-tightness",
  "gif-benefit-stable-edge",
  "gif-waiting",
  "gif-problem-rollup",
  "gif-benefit-relaxed-fit",
  "gif-benefit-cooling-contact",
  "gif-usage-sequence",
  "gif-comparison-pressure",
]);

const PRODUCT_REFERENCE_GIFS = new Set([
  "gif-problem-tightness",
  "gif-problem-rollup",
  "gif-benefit-relaxed-fit",
  "gif-benefit-cooling-contact",
  "gif-usage-sequence",
  "gif-comparison-pressure",
]);

function imageJob(jobId, gifBriefIds) {
  return {
    job_id: jobId,
    claim_ids: ["claim-benefit"],
    slot_ids: ["slot-solution-visual"],
    gif_brief_ids: gifBriefIds,
    identity: {
      reference_asset_ids: ["supplier-product"],
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
          asset_id: "supplier-product",
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
  };
}

function gifBrief(briefId) {
  const imageJobId =
    briefId === "gif-benefit-stable-edge"
      ? "image-benefit"
      : briefId === "gif-waiting"
        ? "image-usage"
        : "image-hero";
  const productReference = PRODUCT_REFERENCE_GIFS.has(briefId);
  return {
    brief_id: briefId,
    claim_ids: ["claim-benefit"],
    slot_ids: ["slot-solution-visual"],
    motion_necessity: {
      required: true,
      reason: "시간에 따른 제품 상태 변화를 보여줘야 합니다.",
      static_insufficiency: "한 장으로는 전후 상태를 구분하기 어렵습니다.",
    },
    source: {
      kind: productReference
        ? "product_reference"
        : "approved_image_job",
      image_job_ids: [imageJobId],
      ...(productReference
        ? { asset_ids: ["supplier-product"] }
        : {}),
    },
    static_fallback: {
      image_job_id: imageJobId,
      reason: "모션을 재생할 수 없으면 같은 승인 소스의 정지 이미지를 표시합니다.",
    },
  };
}

export function createParallelProductionPlan() {
  const heroGifIds = GIF_IDS.filter((id) =>
    PRODUCT_REFERENCE_GIFS.has(id),
  );
  return {
    schema_version: "1.0",
    plan_id: "plan-parallel-frontier",
    provenance: {
      product_ssot: {
        artifact_id: "artifact-product-ssot",
        manifest_sha256: "b".repeat(64),
      },
      market_snapshots: [
        {
          artifact_id: "artifact-market-snapshot",
          manifest_sha256: "c".repeat(64),
          finding_ids: ["finding-product-pain"],
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
          claim_id: "claim-benefit",
          fact_ids: ["fact-product-structure"],
          evidence_asset_ids: ["supplier-product"],
          section_ids: ["section-solution"],
          slot_ids: ["slot-solution-visual"],
          image_job_ids: [
            "image-hero",
            "image-benefit",
            "image-usage",
          ],
          gif_brief_ids: [...GIF_IDS],
        },
      ],
    },
    section_graph_draft: {
      sections: [
        {
          section_id: "section-solution",
          claim_ids: ["claim-benefit"],
          slot_ids: ["slot-solution-visual"],
        },
      ],
      slots: [
        {
          slot_id: "slot-solution-visual",
          section_id: "section-solution",
          claim_ids: ["claim-benefit"],
          image_job_ids: [
            "image-hero",
            "image-benefit",
            "image-usage",
          ],
          gif_brief_ids: [...GIF_IDS],
        },
      ],
    },
    image_job_set: {
      jobs: [
        imageJob("image-hero", heroGifIds),
        imageJob("image-benefit", [
          "gif-benefit-stable-edge",
        ]),
        imageJob("image-usage", ["gif-waiting"]),
      ],
    },
    gif_brief_set: {
      briefs: GIF_IDS.map(gifBrief),
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
          text: "\"오래 착용하면 조임이 불편해요\"",
          claim_id: "claim-benefit",
        },
        {
          quote_id: "quote-rollup",
          pain_id: "pain-rollup",
          text: "\"움직일 때 자꾸 말려 올라가요\"",
          claim_id: "claim-benefit",
        },
        {
          quote_id: "quote-heat",
          pain_id: "pain-heat",
          text: "\"더운 날에는 금방 답답해져요\"",
          claim_id: "claim-benefit",
        },
      ],
      product_answer: {
        section_id: "section-solution",
        sentence: "조임과 말림 부담을 줄이도록 설계한 제품입니다.",
      },
      solution_modules: [
        {
          solution_id: "solution-relaxed-fit",
          pain_id: "pain-tightness",
          claim_id: "claim-benefit",
          section_id: "section-solution",
          customer_benefit_copy: "오래 착용해도 조임 부담을 줄여줍니다.",
          still_image_job_id: "image-hero",
          benefit_motion_brief_id: "gif-benefit-relaxed-fit",
          fact_or_condition_id: "fact-product-structure",
          experiential_quote: "\"착용할 때 압박감이 덜해요\"",
        },
        {
          solution_id: "solution-stable-edge",
          pain_id: "pain-rollup",
          claim_id: "claim-benefit",
          section_id: "section-solution",
          customer_benefit_copy: "움직임에도 가장자리 부담을 줄여줍니다.",
          still_image_job_id: "image-benefit",
          benefit_motion_brief_id: "gif-benefit-stable-edge",
          fact_or_condition_id: "fact-product-structure",
          experiential_quote: "\"움직여도 말림 부담이 덜해요\"",
        },
        {
          solution_id: "solution-cooling-contact",
          pain_id: "pain-heat",
          claim_id: "claim-benefit",
          section_id: "section-solution",
          customer_benefit_copy: "더운 날 착용 답답함을 줄여줍니다.",
          still_image_job_id: "image-usage",
          benefit_motion_brief_id: "gif-benefit-cooling-contact",
          fact_or_condition_id: "fact-product-structure",
          experiential_quote: "\"더운 날에도 부담이 덜해요\"",
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
        prior_inconvenience: "기존 착용 조건에서는 조임과 말림 부담이 있었습니다.",
        verified_difference: "제품 구조로 착용 부담을 줄였습니다.",
        competitor_attack: false,
      },
      comparison_motion_brief_ids: [
        "gif-comparison-pressure",
      ],
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
