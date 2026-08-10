import {
  CATEGORY_REFERENCE_LIBRARY_SHA256,
  CATEGORY_REFERENCE_QA_DIMENSIONS,
  getCategoryReferenceLibrary,
} from "../../../skills/detail-page-maker-skill/scripts/orchestration/category-reference-library.mjs";
import {
  SALES_ASSET_METADATA_FIELDS,
  SALES_MOTION_PHASES,
  SALES_MOTION_TEMPLATE_IDS,
} from "../../../skills/detail-page-maker-skill/scripts/orchestration/sales-motion-pipeline-contract.mjs";

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
      method: "fixed-product-graphics",
      pattern_id: patternIds[index] ?? `motion-pattern-${index + 1}`,
      start_state: `start-state-${index + 1}`,
      mid_state: `mid-state-${index + 1}`,
      end_state: `end-state-${index + 1}`,
      visible_delta:
        "제품 본체의 위치·형태·접촉 상태가 프레임 사이에서 분명히 달라진다.",
      decorative_overlay_only: false,
      one_message: true,
      information_delivery_mode: "fixed_product_graphic_composite",
      background_contrast: "제품 윤곽이 분리되는 고대비 배경",
      answer_within_seconds: 1,
      canvas: { width: 780, height: 600 },
      fps: 24,
      duration_seconds: 4,
      output_format: "gif+animated-webp",
      placement_scale: "chapter",
      template_id: "T1_HERO_REVEAL",
      purpose: `chapter-${index + 1}의 구매 질문 하나를 1초 안에 답한다.`,
      product_geometry_locked: true,
      generative_product_morphing_allowed: false,
      generative_morphing_allowed: false,
      public_media_strategy:
        "single_motion_surface_with_poster_fallback",
      effect_policy: {
        base_transition_family_count: 1,
        accent_transition_count: index === 0 ? 1 : 0,
        strong_effect_usage:
          index === 0 ? "product_entrance" : "none",
        information_remains_primary: true,
      },
      // 인접 GIF가 카메라·핵심 변화·전환·강조 그래픽 네 축 모두에서 달라지도록
      // index로 값을 벌린다. 계약은 최소 두 축을 요구한다.
      camera: `camera-${index + 1}`,
      core_change: `core-change-${index + 1}`,
      transition: `transition-${index + 1}`,
      emphasis_graphic: `emphasis-${index + 1}`,
      first_frame: {
        product_or_problem_visible: true,
        message: `chapter-${index + 1}의 한 줄 메시지`,
        visual_evidence: `chapter-${index + 1}에서 확인되는 구조 근거`,
      },
      loop: {
        mode: "ping_pong",
        pixel_boundary_pass_required: true,
        perceptual_continuity_pass_required: true,
      },
      identity_invariants: [
        "제품 색상은 승인된 기준 이미지와 같다.",
        "제품 외형과 부품 구성은 바뀌지 않는다.",
        "제품 비율과 크기 관계는 고정된다.",
        "표면 재질 표현은 실제 자산에서만 온다.",
      ],
    };
    brief.reference_profile_digest = profileDigest;
    brief.knowledge_rule_packet_digest = "9".repeat(64);
    brief.applied_rule_ids = ["MR-001"];
  });
}

const IMAGE_CANDIDATE_COUNTS = [8, 8, 6, 6, 4];
const IMAGE_SHOT_TYPES = [
  "hero_front",
  "feature_detail_1",
  "usage_scene_1",
  "before_scene",
  "feature_overview",
];
const IMAGE_TEMPLATES = [
  "T1_HERO_REVEAL",
  "T3_FEATURE_HOTSPOT",
  "T6_STEPS_FLOW",
  "T5_BEFORE_AFTER_SLIDER",
  "T10_INFO_CARDS",
];
const LOGICAL_SHOT_GROUPS = [
  ["product_base", 8, ["hero_front", "hero_angle"]],
  ["feature_detail", 6, ["feature_detail_1", "feature_detail_2"]],
  ["dimension", 4, ["dimension_front", "dimension_side"]],
  ["feature_overview", 4, ["feature_overview"]],
  ["state_pair", 4, ["before_scene", "after_scene"]],
  ["usage", 4, ["usage_scene_1", "usage_scene_2"]],
  ["component_structure", 2, ["components_flatlay", "exploded_view"]],
];

function bindImageBatch(plan) {
  plan.image_job_set.jobs.forEach((job, index) => {
    job.candidate_count = IMAGE_CANDIDATE_COUNTS[index] ?? 0;
    job.shot_type = IMAGE_SHOT_TYPES[index];
    job.recommended_template = IMAGE_TEMPLATES[index];
    job.identity = {
      ...(job.identity ?? {}),
      canonical_reference_required: true,
      invariant_conditions: [
        "승인된 기준 이미지의 색상을 유지한다.",
        "제품 형태와 외곽선을 바꾸지 않는다.",
        "부품 구성과 개수를 유지한다.",
        "제품 비율과 구성 배치를 유지한다.",
      ],
    };
  });
  plan.image_job_set.generation_batch = {
    strategy: "single_concurrent_batch",
    planned_images: 32,
    provider_workers: 32,
  };
}

function bindSectionMessages(plan) {
  plan.section_graph_draft.sections.forEach((section, index) => {
    section.message_contract = {
      message_count: 1,
      customer_sentence:
        "빠르게 넘겨도 이 구간의 핵심 하나가 바로 읽힌다.",
      headline_lines: [`chapter-${index + 1} 핵심 한 줄`],
      primary_media: index % 2 === 0 ? "image" : "motion",
      visual_proof: "제품 구조를 그대로 보여주는 주 시각 하나",
      next_section_reason:
        "확인한 장점을 실제 사용 장면으로 이어서 증명한다.",
      alignment: "center",
      minimum_visual_occupancy_percent: 60,
    };
  });
}

function bindSolutionMedia(plan) {
  for (const solution of plan.commercial_flow.solution_modules) {
    solution.public_media_strategy = "single_primary_surface";
    solution.still_role = "motion_poster_or_separate_evidence_section";
  }
}

function bindScrollQa(plan) {
  plan.rubric_target.coupang_scroll_qa = {
    first_second_message_required: true,
    fast_scroll_story_required: true,
    center_axis_max_offset_px: 8,
    minimum_title_px_390: 28,
    minimum_title_px_780: 44,
    minimum_visual_density_percent: 55,
    lazy_loading_fast_scroll_pass_required: true,
    redundant_still_motion_allowed: false,
  };
}

function bindSalesMotionPipeline(plan) {
  plan.sales_motion_pipeline = {
    phases: [...SALES_MOTION_PHASES],
    image_generation: {
      provider: "chatgpt-image-2-via-god-tibo",
      candidate_count: 32,
      provider_workers: 32,
      execution_strategy: "single_concurrent_batch",
      role_groups_are_logical_only: true,
      sequential_role_batches_allowed: false,
      logical_groups: LOGICAL_SHOT_GROUPS.map(
        ([groupId, candidateCount, shotTypes]) => ({
          group_id: groupId,
          candidate_count: candidateCount,
          shot_types: [...shotTypes],
        }),
      ),
      anchor_set: {
        count: 4,
        source: "approved_actual_or_supplier_references",
        identity_invariants: [
          "형태",
          "색",
          "비율",
          "부품",
          "재질",
          "표면",
        ],
        anchor_first_only_when_source_views_insufficient: true,
      },
    },
    asset_selection: {
      use_all_candidates: false,
      selected_count_minimum: 8,
      selected_count_maximum: 15,
      required_metadata_fields: [...SALES_ASSET_METADATA_FIELDS],
    },
    callout_fallback_policy: {
      point_threshold: 0.85,
      bbox_threshold: 0.6,
      low_confidence: "separate_detail_card",
    },
    render_pipeline: {
      primary: "deterministic_silent_mp4",
      converter: "ffmpeg",
      derivatives: ["gif", "animated_webp"],
      hyperframes_direct_gif_allowed: false,
    },
    template_catalog: [...SALES_MOTION_TEMPLATE_IDS],
  };
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
  bindImageBatch(plan);
  bindSectionMessages(plan);
  bindSolutionMedia(plan);
  bindScrollQa(plan);
  bindSalesMotionPipeline(plan);
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
