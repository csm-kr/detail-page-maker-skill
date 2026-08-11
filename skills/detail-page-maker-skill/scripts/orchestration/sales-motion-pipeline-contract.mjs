export const SALES_MOTION_PHASES = Object.freeze([
  "product_understanding",
  "motion_planning",
  "shot_planning",
  "image_generation",
  "asset_selection",
  "metadata_extraction",
  "hyperframes_assembly",
  "mp4_render",
  "animation_conversion",
  "qa_and_fallback",
]);

export const SALES_MOTION_TEMPLATE_IDS = Object.freeze([
  "T1_HERO_REVEAL",
  "T2_DIMENSION_REVEAL",
  "T3_FEATURE_HOTSPOT",
  "T4_DETAIL_ZOOM",
  "T5_BEFORE_AFTER_SLIDER",
  "T6_STEPS_FLOW",
  "T7_MATERIAL_MOTION",
  "T8_COMPONENTS_LAYOUT",
  "T9_EXPLODED_LAYERS",
  "T10_INFO_CARDS",
]);

export const SALES_MOTION_SHOT_TYPES = Object.freeze([
  "hero_front",
  "hero_angle",
  "dimension_front",
  "dimension_side",
  "feature_overview",
  "feature_detail_1",
  "feature_detail_2",
  "before_scene",
  "after_scene",
  "usage_scene_1",
  "usage_scene_2",
  "components_flatlay",
  "exploded_view",
  "material_macro",
]);

export const SALES_ASSET_METADATA_FIELDS = Object.freeze([
  "image_id",
  "shot_type",
  "view_type",
  "candidate_score",
  "recommended_template",
  "anchor_points",
  "bbox_regions",
  "dimension_safe_area",
  "text_safe_area",
  "before_after_pair_id",
  "consistency_group",
  "locator_guide",
]);

export const RECOMMENDED_32_SHOT_ALLOCATION = Object.freeze({
  product_base: 8,
  feature_detail: 6,
  dimension: 4,
  feature_overview: 4,
  state_pair: 4,
  usage: 4,
  component_structure: 2,
});

const TEMPLATE_SET = new Set(SALES_MOTION_TEMPLATE_IDS);
const SHOT_SET = new Set(SALES_MOTION_SHOT_TYPES);
const DELIVERY_MODES = new Set([
  "fixed_product_graphic_composite",
  "aligned_verified_state_pair",
  "verified_layered_product_assets",
]);
const CALLOUT_ROUTES = new Set([
  "precise_anchor",
  "bbox_glow",
  "separate_detail_card",
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isUnitCoordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function add(errors, code, path, message, details = undefined) {
  errors.push({
    code,
    path,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function exactStringSet(actual, expected) {
  const values = asArray(actual);
  return (
    values.length === expected.length &&
    expected.every((value) => values.includes(value))
  );
}

export function calloutRouteForConfidence(confidence) {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }
  if (confidence >= 0.85) return "precise_anchor";
  if (confidence >= 0.6) return "bbox_glow";
  return "separate_detail_card";
}

function validateCalloutLocation(location, path, errors) {
  const confidence = location?.confidence;
  const route = calloutRouteForConfidence(confidence);
  if (!route || location?.route !== route || !CALLOUT_ROUTES.has(location?.route)) {
    add(
      errors,
      "FEATURE_CALLOUT_CONFIDENCE_ROUTE_REQUIRED",
      path,
      "기능 콜아웃은 0.85 이상 anchor, 0.60~0.85 bbox, 0.60 미만 별도 detail card로 전환해야 합니다.",
      { confidence, expected_route: route },
    );
    return;
  }
  if (
    route === "precise_anchor" &&
    (!isUnitCoordinate(location?.anchor?.x) ||
      !isUnitCoordinate(location?.anchor?.y))
  ) {
    add(
      errors,
      "NORMALIZED_FEATURE_ANCHOR_REQUIRED",
      `${path}.anchor`,
      "정밀 콜아웃 anchor는 0~1 정규화 x/y 좌표여야 합니다.",
    );
  }
  if (
    route === "bbox_glow" &&
    (!isUnitCoordinate(location?.bbox?.x) ||
      !isUnitCoordinate(location?.bbox?.y) ||
      !isUnitCoordinate(location?.bbox?.width) ||
      !isUnitCoordinate(location?.bbox?.height) ||
      location.bbox.width <= 0 ||
      location.bbox.height <= 0 ||
      location.bbox.x + location.bbox.width > 1 ||
      location.bbox.y + location.bbox.height > 1)
  ) {
    add(
      errors,
      "NORMALIZED_FEATURE_BBOX_REQUIRED",
      `${path}.bbox`,
      "영역 콜아웃 bbox는 이미지 안의 0~1 정규화 사각형이어야 합니다.",
    );
  }
  if (
    route === "separate_detail_card" &&
    !isText(location?.detail_asset_id)
  ) {
    add(
      errors,
      "LOW_CONFIDENCE_DETAIL_ASSET_REQUIRED",
      `${path}.detail_asset_id`,
      "낮은 신뢰도의 기능 위치는 별도 고해상도 detail asset으로 설명해야 합니다.",
    );
  }
}

function validatePrecisionGuide(guide, path, errors, minimumMarkerCount) {
  const coordinates = asArray(guide?.coordinates);
  const validCoordinates = coordinates.every(
    (point) =>
      isText(point?.anchor_id) &&
      isText(point?.semantic_role) &&
      isUnitCoordinate(point?.x) &&
      isUnitCoordinate(point?.y),
  );
  if (
    !isObject(guide) ||
    guide?.generator !== "chatgpt-image-2-via-god-tibo" ||
    guide?.edit_mode !== "invariant" ||
    guide?.marker_hex !== "#FF00FF" ||
    guide?.marker_only_edit !== true ||
    guide?.geometry_locked !== true ||
    guide?.same_pixel_dimensions !== true ||
    !isText(guide?.source_asset_id) ||
    !isText(guide?.guide_asset_id) ||
    guide.source_asset_id === guide.guide_asset_id ||
    !isSha256(guide?.source_sha256) ||
    !isSha256(guide?.guide_sha256) ||
    !Number.isInteger(guide?.expected_marker_count) ||
    guide.expected_marker_count < minimumMarkerCount ||
    coordinates.length !== guide.expected_marker_count ||
    !validCoordinates ||
    !isText(guide?.extraction_receipt_id) ||
    !isSha256(guide?.coordinates_sha256) ||
    guide?.clean_source_used_for_render !== true ||
    guide?.guide_asset_used_for_render !== false ||
    guide?.guide_publication_forbidden !== true
  ) {
    add(
      errors,
      "GOD_TIBO_LOCATOR_GUIDE_REQUIRED",
      path,
      "정밀 치수선·콜아웃·방향 화살표는 God Tibo invariant 가이드의 고대비 점을 추출한 실제 좌표를 사용하고, 렌더에는 점이 없는 원본만 사용해야 합니다.",
      { minimum_marker_count: minimumMarkerCount },
    );
  }
}

export function validateSalesMotionBrief(brief, path = "motion") {
  const errors = [];
  const semantic = brief?.semantic_contract ?? brief;
  if (
    !isObject(semantic) ||
    !TEMPLATE_SET.has(semantic?.template_id) ||
    semantic?.one_message !== true ||
    !isText(semantic?.purpose) ||
    !Number.isFinite(semantic?.answer_within_seconds) ||
    semantic.answer_within_seconds <= 0 ||
    semantic.answer_within_seconds > 1 ||
    !DELIVERY_MODES.has(semantic?.information_delivery_mode) ||
    semantic?.decorative_overlay_only !== false ||
    semantic?.product_geometry_locked !== true ||
    semantic?.generative_product_morphing_allowed !== false
  ) {
    add(
      errors,
      "INFORMATION_SALES_MOTION_CONTRACT_REQUIRED",
      `${path}.semantic_contract`,
      "모션은 T1~T10 템플릿, 한 메시지, 1초 전달, 고정 제품 기반 정보 합성, 장식-only 금지 계약을 가져야 합니다.",
    );
    return { ok: false, errors };
  }

  const accent = semantic?.effect_policy;
  if (
    !isObject(accent) ||
    accent?.base_transition_family_count !== 1 ||
    !Number.isInteger(accent?.accent_transition_count) ||
    accent.accent_transition_count < 0 ||
    accent.accent_transition_count > 2 ||
    !["none", "product_entrance", "primary_benefit_reveal"].includes(
      accent?.strong_effect_usage,
    ) ||
    accent?.information_remains_primary !== true
  ) {
    add(
      errors,
      "SALES_MOTION_EFFECT_LIMIT_REQUIRED",
      `${path}.semantic_contract.effect_policy`,
      "기본 전환은 한 계열, 강조 전환은 최대 2개이며 강한 효과는 첫 등장/핵심 장점에만 사용해야 합니다.",
    );
  }

  if (semantic.template_id === "T2_DIMENSION_REVEAL") {
    const dimensions = semantic?.dimensions;
    if (
      !isObject(dimensions) ||
      dimensions?.verified !== true ||
      asArray(dimensions?.values).length === 0 ||
      asArray(dimensions?.values).some(
        (item) =>
          !isText(item?.axis) ||
          !Number.isFinite(item?.value) ||
          item.value <= 0 ||
          !isText(item?.unit),
      ) ||
      dimensions?.svg_measurement_lines !== true ||
      dimensions?.bidirectional_arrows !== true ||
      dimensions?.outside_product_bounds !== true ||
      dimensions?.product_ratio_locked !== true
    ) {
      add(
        errors,
        "VERIFIED_DIMENSION_MOTION_REQUIRED",
        `${path}.semantic_contract.dimensions`,
        "치수 모션은 검증된 실제 수치와 외곽 SVG 치수선·양방향 화살표·제품 비율 고정이 필요합니다.",
      );
    }
    validatePrecisionGuide(
      semantic?.locator_guide,
      `${path}.semantic_contract.locator_guide`,
      errors,
      2,
    );
  }

  if (semantic.template_id === "T3_FEATURE_HOTSPOT") {
    const locations = asArray(semantic?.feature_locations);
    if (locations.length < 1 || locations.length > 3) {
      add(
        errors,
        "FEATURE_HOTSPOT_COUNT_INVALID",
        `${path}.semantic_contract.feature_locations`,
        "한 hotspot GIF는 순차 기능 포인트 1~3개만 설명해야 합니다.",
      );
    }
    locations.forEach((location, index) =>
      validateCalloutLocation(
        location,
        `${path}.semantic_contract.feature_locations[${index}]`,
        errors,
      ),
    );
    const preciseLocationCount = locations.filter(
      (location) => location?.route === "precise_anchor",
    ).length;
    if (preciseLocationCount > 0) {
      validatePrecisionGuide(
        semantic?.locator_guide,
        `${path}.semantic_contract.locator_guide`,
        errors,
        preciseLocationCount,
      );
    }
    if (
      locations.some(
        (location) =>
          !Number.isFinite(location?.hold_seconds) ||
          location.hold_seconds < 0.8 ||
          location.hold_seconds > 1.2,
      )
    ) {
      add(
        errors,
        "FEATURE_HOTSPOT_HOLD_TIME_REQUIRED",
        `${path}.semantic_contract.feature_locations`,
        "각 기능 hotspot은 순차로 0.8~1.2초 유지해야 합니다.",
      );
    }
  }

  if (
    semantic.template_id === "T4_DETAIL_ZOOM" &&
    (!isText(semantic?.detail_asset_id) ||
      semantic?.separate_high_resolution_detail !== true ||
      semantic?.clip_path_lens !== true)
  ) {
    add(
      errors,
      "HIGH_RES_DETAIL_LENS_REQUIRED",
      `${path}.semantic_contract.detail_asset_id`,
      "돋보기 모션은 같은 이미지 확대가 아니라 별도 고해상도 detail asset을 clip-path 안에 사용해야 합니다.",
    );
  }

  if (semantic.template_id === "T5_BEFORE_AFTER_SLIDER") {
    const pair = semantic?.comparison_pair;
    if (
      !isObject(pair) ||
      pair?.actual_images_verified !== true ||
      !isText(pair?.before_asset_id) ||
      !isText(pair?.after_asset_id) ||
      pair?.center_aligned !== true ||
      pair?.scale_aligned !== true ||
      pair?.direction_aligned !== true ||
      pair?.camera_aligned !== true
    ) {
      add(
        errors,
        "VERIFIED_ALIGNED_BEFORE_AFTER_REQUIRED",
        `${path}.semantic_contract.comparison_pair`,
        "비포·애프터는 실제 검증 pair와 중심·크기·방향·카메라 정렬이 필요합니다.",
      );
    }
  }

  if (semantic.template_id === "T6_STEPS_FLOW") {
    const steps = asArray(semantic?.steps);
    if (
      steps.length < 1 ||
      steps.length > 3 ||
      steps.some(
        (step) =>
          !isText(step?.verb) ||
          !isText(step?.asset_id) ||
          step?.direction_cue !== true ||
          step?.completion_cue !== true,
      )
    ) {
      add(
        errors,
        "USAGE_STEPS_FLOW_REQUIRED",
        `${path}.semantic_contract.steps`,
        "사용법 GIF는 동사형 문구와 방향·완료 표시가 있는 실제 단계 1~3개로 제한합니다.",
      );
    }
    validatePrecisionGuide(
      semantic?.locator_guide,
      `${path}.semantic_contract.locator_guide`,
      errors,
      2,
    );
  }

  if (
    semantic.template_id === "T7_MATERIAL_MOTION" &&
    semantic?.material_claims_verified !== true
  ) {
    add(
      errors,
      "VERIFIED_MATERIAL_CLAIMS_REQUIRED",
      `${path}.semantic_contract.material_claims_verified`,
      "소재 특성 모션은 검증된 사실만 시각화해야 합니다.",
    );
  }

  if (
    semantic.template_id === "T8_COMPONENTS_LAYOUT" &&
    (semantic?.components_verified !== true ||
      asArray(semantic?.component_asset_ids).length === 0)
  ) {
    add(
      errors,
      "VERIFIED_COMPONENTS_REQUIRED",
      `${path}.semantic_contract.component_asset_ids`,
      "구성품 모션은 실제 포함 구성이 확인된 자산만 사용해야 합니다.",
    );
  }

  if (
    semantic.template_id === "T9_EXPLODED_LAYERS" &&
    (semantic?.layer_structure_verified !== true ||
      asArray(semantic?.layer_asset_ids).length < 2)
  ) {
    add(
      errors,
      "VERIFIED_EXPLODED_LAYERS_REQUIRED",
      `${path}.semantic_contract.layer_asset_ids`,
      "분해 구조 모션은 검증된 2개 이상의 실제 레이어 자산이 필요합니다.",
    );
  }

  if (
    semantic.template_id === "T10_INFO_CARDS" &&
    (semantic?.data_cards_verified !== true ||
      asArray(semantic?.data_cards).length === 0 ||
      asArray(semantic?.data_cards).some(
        (card) => !isText(card?.label) || !isText(card?.value),
      ))
  ) {
    add(
      errors,
      "VERIFIED_INFO_CARDS_REQUIRED",
      `${path}.semantic_contract.data_cards`,
      "정보 카드 모션은 확인된 사이즈·소재·구성·사용·관리 데이터만 표시해야 합니다.",
    );
  }

  if (
    semantic?.variant === "option_comparison" &&
    (semantic?.actual_option_images_verified !== true ||
      asArray(semantic?.option_asset_ids).length < 2)
  ) {
    add(
      errors,
      "ACTUAL_OPTION_IMAGES_REQUIRED",
      `${path}.semantic_contract.option_asset_ids`,
      "옵션 비교는 프로그램 recolor가 아니라 실제 옵션 이미지 2개 이상이 필요합니다.",
    );
  }

  return { ok: errors.length === 0, errors };
}

export function validateSalesMotionPipeline(plan) {
  const errors = [];
  const pipeline = plan?.sales_motion_pipeline;
  if (!isObject(pipeline)) {
    add(
      errors,
      "SALES_MOTION_PIPELINE_REQUIRED",
      "sales_motion_pipeline",
      "32장 계획 생성부터 HyperFrames MP4·FFmpeg 파생까지의 정보형 세일즈 모션 파이프라인이 필요합니다.",
    );
    return { ok: false, errors };
  }

  if (
    asArray(pipeline.phases).length !== SALES_MOTION_PHASES.length ||
    SALES_MOTION_PHASES.some(
      (phase, index) => pipeline.phases[index] !== phase,
    )
  ) {
    add(
      errors,
      "SALES_MOTION_PHASE_ORDER_REQUIRED",
      "sales_motion_pipeline.phases",
      "제품 이해부터 QA·fallback까지의 파이프라인 순서를 유지해야 합니다.",
    );
  }

  const generation = pipeline?.image_generation;
  const groups = asArray(generation?.logical_groups);
  const groupTotal = groups.reduce(
    (sum, group) =>
      sum + (Number.isInteger(group?.candidate_count) ? group.candidate_count : 0),
    0,
  );
  if (
    !isObject(generation) ||
    generation?.provider !== "chatgpt-image-2-via-god-tibo" ||
    generation?.candidate_count !== 32 ||
    generation?.provider_workers !== 32 ||
    generation?.execution_strategy !== "single_concurrent_batch" ||
    generation?.role_groups_are_logical_only !== true ||
    generation?.sequential_role_batches_allowed !== false ||
    groups.length === 0 ||
    groupTotal !== 32 ||
    groups.some(
      (group) =>
        !isText(group?.group_id) ||
        !Number.isInteger(group?.candidate_count) ||
        group.candidate_count <= 0 ||
        asArray(group?.shot_types).length === 0 ||
        asArray(group?.shot_types).some((shot) => !SHOT_SET.has(shot)),
    )
  ) {
    add(
      errors,
      "PLANNED_32_IMAGE_SINGLE_BATCH_REQUIRED",
      "sales_motion_pipeline.image_generation",
      "샷 역할 합계 32개를 ChatGPT Image 2/God Tibo 32 workers의 단일 동시 batch로 생성해야 합니다.",
      { logical_group_candidate_total: groupTotal },
    );
  }

  const anchors = generation?.anchor_set;
  if (
    !isObject(anchors) ||
    !Number.isInteger(anchors?.count) ||
    anchors.count < 3 ||
    anchors.count > 5 ||
    anchors?.source !== "approved_actual_or_supplier_references" ||
    asArray(anchors?.identity_invariants).length < 6 ||
    anchors?.anchor_first_only_when_source_views_insufficient !== true
  ) {
    add(
      errors,
      "PRODUCT_ANCHOR_SET_REQUIRED",
      "sales_motion_pipeline.image_generation.anchor_set",
      "실제품·공급처 승인 참조 3~5장과 형태·색·비율·부품·재질·표면의 불변 조건이 필요합니다.",
    );
  }

  const selection = pipeline?.asset_selection;
  if (
    !isObject(selection) ||
    selection?.use_all_candidates !== false ||
    selection?.selected_count_minimum !== 8 ||
    selection?.selected_count_maximum !== 15 ||
    !exactStringSet(selection?.required_metadata_fields, SALES_ASSET_METADATA_FIELDS)
  ) {
    add(
      errors,
      "ASSET_SELECTION_AND_METADATA_REQUIRED",
      "sales_motion_pipeline.asset_selection",
      "32개 후보 중 8~15개를 선별하고 shot/template/좌표/safe-area/pair/consistency metadata를 저장해야 합니다.",
    );
  }

  const callout = pipeline?.callout_fallback_policy;
  if (
    !isObject(callout) ||
    callout?.point_threshold !== 0.85 ||
    callout?.bbox_threshold !== 0.6 ||
    callout?.low_confidence !== "separate_detail_card"
  ) {
    add(
      errors,
      "CALLOUT_FALLBACK_POLICY_REQUIRED",
      "sales_motion_pipeline.callout_fallback_policy",
      "콜아웃 신뢰도 0.85/0.60 경계와 별도 detail card fallback을 고정해야 합니다.",
    );
  }

  const render = pipeline?.render_pipeline;
  if (
    !isObject(render) ||
    render?.primary !== "deterministic_silent_mp4" ||
    render?.converter !== "ffmpeg" ||
    !exactStringSet(render?.derivatives, ["gif", "animated_webp"]) ||
    render?.hyperframes_direct_gif_allowed !== false
  ) {
    add(
      errors,
      "MP4_FFMPEG_DERIVATIVE_PIPELINE_REQUIRED",
      "sales_motion_pipeline.render_pipeline",
      "HyperFrames 결정론적 무음 MP4를 정본으로 만들고 FFmpeg로 GIF와 animated WebP를 파생해야 합니다.",
    );
  }

  const templateIds = pipeline?.template_catalog;
  if (!exactStringSet(templateIds, SALES_MOTION_TEMPLATE_IDS)) {
    add(
      errors,
      "SALES_MOTION_TEMPLATE_CATALOG_REQUIRED",
      "sales_motion_pipeline.template_catalog",
      "T1 Hero부터 T10 Info Cards까지의 정보형 세일즈 모션 템플릿 catalog가 필요합니다.",
    );
  }

  asArray(plan?.gif_brief_set?.briefs).forEach((brief, index) => {
    errors.push(
      ...validateSalesMotionBrief(
        brief,
        `gif_brief_set.briefs[${index}]`,
      ).errors,
    );
  });

  return { ok: errors.length === 0, errors };
}
