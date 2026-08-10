import {
  CATEGORY_REFERENCE_LIBRARY_SHA256,
  CATEGORY_REFERENCE_QA_DIMENSIONS,
  getCategoryReferenceLibrary,
} from "../../../skills/detail-page-maker-skill/scripts/orchestration/category-reference-library.mjs";

const SHA256 = "a".repeat(64);
const REFERENCE_QA_DIMENSIONS = [
  "desire_formation",
  "observable_differentiation",
  "scene_diversity",
  "motion_semantic_delta",
  "delivery_780",
  "decision_close",
];
const IMAGE_VARIANTS = [
  {
    suffix: "hero",
    role: "hero",
    scene_kind: "isolated_product",
    product_views: ["top"],
  },
  {
    suffix: "mechanism",
    role: "mechanism",
    scene_kind: "mechanism_macro",
    product_views: ["bottom", "detail"],
  },
  {
    suffix: "usage",
    role: "usage",
    scene_kind: "contextual_use",
    product_views: ["in_use"],
  },
  {
    suffix: "comparison",
    role: "comparison",
    scene_kind: "comparison",
    product_views: ["side"],
  },
  {
    suffix: "outcome",
    role: "outcome",
    scene_kind: "outcome_context",
    product_views: ["front"],
  },
];

function clone(value) {
  return structuredClone(value);
}

function unique(values) {
  return [...new Set(values)];
}

function ensureFiveImageJobs(plan) {
  const jobs = plan.image_job_set.jobs;
  const base = clone(jobs[0]);
  while (jobs.length < IMAGE_VARIANTS.length) {
    const variant = IMAGE_VARIANTS[jobs.length];
    jobs.push({
      ...clone(base),
      job_id: `image-${variant.suffix}`,
      gif_brief_ids: [],
    });
  }
  jobs.forEach((job, index) => {
    const variant = IMAGE_VARIANTS[index];
    job.visual_contract = {
      role: variant.role,
      scene_kind: variant.scene_kind,
      product_views: [...variant.product_views],
      usage_context:
        variant.scene_kind === "contextual_use"
          ? "실제 사용 환경에서 제품을 착용하는 장면"
          : "제품 구조와 구매 차이를 확인하는 장면",
      lighting: `chapter-${index + 1} contrast lighting`,
      background: `chapter-${index + 1} commercial background`,
      product_occupancy_percent: index === 0 ? 72 : 58,
      differentiation_goal:
        `${variant.role} 역할의 고유한 구매 질문을 한 장면으로 답한다.`,
    };
    job.applied_rule_ids = ["CR-001", "TR-001"];
  });
  plan.image_job_set.visual_coverage = {
    required_product_views: unique(
      jobs.flatMap(
        (job) => job.visual_contract.product_views,
      ),
    ),
    required_scene_kinds: unique(
      jobs.map((job) => job.visual_contract.scene_kind),
    ),
  };
}

function bindGraph(plan) {
  const imageJobIds = plan.image_job_set.jobs.map(
    (job) => job.job_id,
  );
  const claim = plan.claim_graph.claims[0];
  claim.claim_type = "observable_structure";
  claim.observation_scope =
    "실제 제품 사진에서 확인되는 외형과 구성 부위";
  claim.effect_claim_allowed = false;
  claim.customer_benefit_statement =
    "제품 구조와 사용 장면을 함께 확인해 선택할 수 있습니다.";
  claim.evidence_boundary_statement =
    "관찰 가능한 구조만 설명하며 미검증 효능은 단정하지 않습니다.";
  claim.image_job_ids = imageJobIds;
  for (const slot of plan.section_graph_draft.slots) {
    slot.image_job_ids = unique([
      ...(slot.image_job_ids ?? []),
      ...imageJobIds,
    ]);
  }
  for (const job of plan.image_job_set.jobs) {
    job.claim_ids = unique([
      ...(job.claim_ids ?? []),
      claim.claim_id,
    ]);
    job.slot_ids = unique([
      ...(job.slot_ids ?? []),
      ...claim.slot_ids,
    ]);
  }
}

function bindRules(plan) {
  const imageJobIds = plan.image_job_set.jobs.map(
    (job) => job.job_id,
  );
  const gifBriefIds = plan.gif_brief_set.briefs.map(
    (brief) => brief.brief_id,
  );
  const configure = (
    binding,
    targetIds,
    requiredEffect,
    acceptanceCheckId,
  ) => {
    binding.target_ids = [...targetIds];
    binding.required_effect = requiredEffect;
    binding.acceptance_check_ids = [acceptanceCheckId];
  };
  configure(
    plan.provenance.applied_rules.commercial[0],
    imageJobIds,
    "각 이미지가 구매 서사의 고유한 역할을 수행한다.",
    "commercial-role-coverage",
  );
  configure(
    plan.provenance.applied_rules.taste[0],
    imageJobIds,
    "장면과 조명이 반복되지 않는 상업적 리듬을 만든다.",
    "visual-scene-diversity",
  );
  configure(
    plan.provenance.applied_rules.motion[0],
    gifBriefIds,
    "각 모션이 시작·중간·끝의 실제 상태 변화를 보여준다.",
    "motion-semantic-delta",
  );
}

function bindMotion(plan, profileDigest) {
  const patternIds = [
    "structure-trace",
    "local-operation",
    "comparison-wipe",
    "usage-sequence",
    "material-flex",
    "fit-transition",
    "outcome-reveal",
    "decision-recap",
  ];
  plan.gif_brief_set.briefs.forEach((brief, index) => {
    brief.semantic_contract = {
      customer_question:
        "이 제품의 구조가 사용 중 어떻게 달라지는가?",
      feature_part: `feature-part-${index + 1}`,
      method: "hybrid",
      pattern_id: patternIds[index] ?? `motion-pattern-${index + 1}`,
      start_state: `start-state-${index + 1}`,
      mid_state: `mid-state-${index + 1}`,
      end_state: `end-state-${index + 1}`,
      visible_delta:
        "제품 본체의 위치·형태·접촉 상태가 프레임 사이에서 분명히 달라진다.",
      overlay_only: false,
      background_contrast: "제품 윤곽이 분리되는 고대비 배경",
      answer_within_seconds: 1.5,
      canvas: { width: 780, height: 600 },
      fps: 24,
      duration_seconds: 4,
      output_format: "gif+animated-webp",
      placement_scale: "chapter",
    };
    brief.reference_profile_digest = profileDigest;
    brief.knowledge_rule_packet_digest = "9".repeat(64);
    brief.applied_rule_ids = ["MR-001"];
  });
}

function bindReferences(plan) {
  const sectionIds = plan.section_graph_draft.sections.map(
    (section) => section.section_id,
  );
  const imageJobIds = plan.image_job_set.jobs.map(
    (job) => job.job_id,
  );
  const gifBriefIds = plan.gif_brief_set.briefs.map(
    (brief) => brief.brief_id,
  );
  const profileDigest = "8".repeat(64);
  plan.reference_artifact_set = {
    profile_set_sha256: profileDigest,
    artifacts: [
      {
        reference_id: "current-output-baseline",
        role: "current_output",
        rights: "research_only",
        artifact: {
          media_type: "text/html",
          locator: "output/detail-page.html",
          size_bytes: 4096,
          sha256: "7".repeat(64),
        },
        profile: {
          section_count: sectionIds.length,
          image_reference_count: imageJobIds.length,
          motion_reference_count: gifBriefIds.length,
          section_density_curve: [1],
          section_role_sequence: ["hero"],
          width_hints_px: [390, 780],
        },
      },
    ],
    adoption_matrix: [
      {
        reference_id: "current-output-baseline",
        trait: "현재 결과의 검증된 제품 동일성",
        decision: "adapt",
        reason: "제품 동일성은 유지하고 장면·모션 밀도는 강화한다.",
        target_section_ids: sectionIds,
      },
    ],
  };
  const allTargets = [
    ...sectionIds,
    ...imageJobIds,
    ...gifBriefIds,
  ];
  plan.category_reference_profile = {
    library_id: "detail-page-category-reference-library",
    library_version: "1.0.0",
    library_sha256: CATEGORY_REFERENCE_LIBRARY_SHA256,
    primary_archetype_id: "mechanism-structure",
    secondary_archetype_ids: [],
    classification_reason:
      "제품의 구조와 사용 중 변화가 구매 질문의 중심이다.",
    product_signals: ["부품", "작동", "사용 순서"],
    selected_reference_card_ids: [
      "behance-makeon-led-mask",
      "behance-replaceable-toothbrush",
    ],
    research_only_acknowledged: true,
    no_copy_acknowledged: true,
    ambition_anchor_ids: ["anchor-coupang-richness-780"],
    ambition_contract: {
      target: "meet_or_exceed_selected_cohort",
      critical_dimension_regression_allowed: false,
      public_output_comparison_required: true,
      required_dimensions: [...CATEGORY_REFERENCE_QA_DIMENSIONS],
    },
    trait_bindings: [
      {
        binding_id: "category-ref-mechanism-all",
        reference_card_id: "behance-makeon-led-mask",
        trait_id: "trait-mechanism-chapter-motion",
        target_ids: allTargets,
        adaptation_intent:
          "고유 제품 구조와 구매 질문에 맞게 챕터와 모션을 변형한다.",
        acceptance_check_ids: [
          "category-reference-target-coverage",
        ],
      },
    ],
    ambition_bindings: [
      "hero_commercial_intensity",
      "chapter_rhythm",
      "scene_role_diversity",
      "motion_chapter_coverage",
      "decision_close",
    ].map((dimension) => ({
      anchor_id: "anchor-coupang-richness-780",
      dimension,
      target_ids: [sectionIds[0]],
      adaptation_intent:
        "고유 표현은 복제하지 않고 시각적 강도와 설득 밀도만 적용한다.",
      acceptance_check_ids: [`ambition-${dimension}`],
    })),
    motion_pattern_family_bindings: [
      ["structure_trace", gifBriefIds[0]],
      ["local_operation", gifBriefIds[1]],
      ["comparison", gifBriefIds[2]],
      ["usage_sequence", gifBriefIds[3]],
    ].map(([patternFamily, briefId]) => ({
      pattern_family: patternFamily,
      gif_brief_ids: [briefId],
    })),
  };
  return profileDigest;
}

function bindRubricAndPlanning(plan) {
  const library = getCategoryReferenceLibrary();
  const referenceIds =
    plan.reference_artifact_set.artifacts.map(
      (artifact) => artifact.reference_id,
    );
  const selectedReferenceCardIds =
    plan.category_reference_profile.selected_reference_card_ids;
  plan.rubric_target.dimensions = unique([
    ...(plan.rubric_target.dimensions ?? []).map(
      (dimension) => dimension.criterion_id,
    ),
    ...REFERENCE_QA_DIMENSIONS,
  ]).map((criterionId) => ({
    criterion_id: criterionId,
    target_score:
      criterionId === "visual-hierarchy" ? 95 : 90,
  }));
  plan.rubric_target.reference_comparison = {
    reference_ids: referenceIds,
    public_output_subject_required: true,
    same_rubric_delta_required: true,
  };
  plan.rubric_target.category_reference_comparison = {
    library_id: library.library_id,
    library_version: library.version,
    library_sha256: CATEGORY_REFERENCE_LIBRARY_SHA256,
    reference_card_ids: selectedReferenceCardIds,
    target: "meet_or_exceed_selected_cohort",
    critical_dimension_regression_allowed: false,
    public_output_subject_required: true,
    required_dimensions: [...CATEGORY_REFERENCE_QA_DIMENSIONS],
  };
  plan.planning_materialization = {
    source: "production_plan",
    empty_template_allowed: false,
    documents: [
      ["COMMERCIAL.md", ["commercial_flow"]],
      ["DESIGN.md", ["image_job_set", "category_reference_profile"]],
      ["BUYER-JOURNEY.md", ["commercial_flow.section_role_order"]],
      ["GIF.md", ["gif_brief_set"]],
    ].map(([name, sourceFields]) => ({
      path: `.detail-page/planning/${name}`,
      status: "materialize_from_plan",
      source_fields: sourceFields,
    })),
  };
}

export function applyCurrentProductionPlanPolicy(plan) {
  ensureFiveImageJobs(plan);
  bindGraph(plan);
  bindRules(plan);
  const profileDigest = bindReferences(plan);
  bindMotion(plan, profileDigest);
  bindRubricAndPlanning(plan);
  plan.commercial_flow.decision_recap ??= {
    section_id:
      plan.section_graph_draft.sections.at(-1).section_id,
    customer_outcome:
      "제품 구조와 사용 장면을 확인한 뒤 더 편안한 선택을 할 수 있습니다.",
    selection_reason:
      "관찰 가능한 차별점과 실제 사용 조건을 함께 보여줍니다.",
    risk_only: false,
  };
  return plan;
}

export { SHA256 as CURRENT_POLICY_FIXTURE_SHA256 };
