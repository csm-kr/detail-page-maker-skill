import assert from "node:assert/strict";
import test from "node:test";

import {
  SALES_ASSET_METADATA_FIELDS,
  SALES_MOTION_PHASES,
  SALES_MOTION_TEMPLATE_IDS,
  calloutRouteForConfidence,
  validateSalesMotionBrief,
  validateSalesMotionPipeline,
} from "../orchestration/sales-motion-pipeline-contract.mjs";

const HASH = "a".repeat(64);

function baseSemantic(overrides = {}) {
  return {
    template_id: "T1_HERO_REVEAL",
    one_message: true,
    purpose: "제품의 가장 강한 구매 이유를 첫 화면에 전달",
    answer_within_seconds: 1,
    information_delivery_mode: "fixed_product_graphic_composite",
    decorative_overlay_only: false,
    product_geometry_locked: true,
    generative_product_morphing_allowed: false,
    effect_policy: {
      base_transition_family_count: 1,
      accent_transition_count: 1,
      strong_effect_usage: "product_entrance",
      information_remains_primary: true,
    },
    ...overrides,
  };
}

function locatorGuide(count, roles = []) {
  return {
    generator: "chatgpt-image-2-via-god-tibo",
    edit_mode: "invariant",
    marker_hex: "#FF00FF",
    marker_only_edit: true,
    geometry_locked: true,
    same_pixel_dimensions: true,
    source_asset_id: "clean-source-1",
    guide_asset_id: "locator-guide-1",
    source_sha256: HASH,
    guide_sha256: "b".repeat(64),
    expected_marker_count: count,
    coordinates: Array.from({ length: count }, (_, index) => ({
      anchor_id: `anchor-${index + 1}`,
      semantic_role: roles[index] ?? `verified-point-${index + 1}`,
      x: (index + 1) / (count + 1),
      y: (index + 1) / (count + 1),
    })),
    extraction_receipt_id: "locator-extraction-1",
    coordinates_sha256: "c".repeat(64),
    clean_source_used_for_render: true,
    guide_asset_used_for_render: false,
    guide_publication_forbidden: true,
  };
}

function pipeline() {
  return {
    phases: [...SALES_MOTION_PHASES],
    image_generation: {
      provider: "chatgpt-image-2-via-god-tibo",
      candidate_count: 32,
      provider_workers: 32,
      execution_strategy: "single_concurrent_batch",
      role_groups_are_logical_only: true,
      sequential_role_batches_allowed: false,
      logical_groups: [
        { group_id: "base", candidate_count: 8, shot_types: ["hero_front", "hero_angle"] },
        { group_id: "detail", candidate_count: 6, shot_types: ["feature_detail_1", "material_macro"] },
        { group_id: "dimension", candidate_count: 4, shot_types: ["dimension_front", "dimension_side"] },
        { group_id: "feature", candidate_count: 4, shot_types: ["feature_overview"] },
        { group_id: "pair", candidate_count: 4, shot_types: ["before_scene", "after_scene"] },
        { group_id: "usage", candidate_count: 4, shot_types: ["usage_scene_1", "usage_scene_2"] },
        { group_id: "parts", candidate_count: 2, shot_types: ["components_flatlay", "exploded_view"] },
      ],
      anchor_set: {
        count: 5,
        source: "approved_actual_or_supplier_references",
        identity_invariants: ["shape", "color", "ratio", "parts", "material", "surface"],
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

test("32개 역할 그룹은 한 32-worker 물리 batch로 고정된다", () => {
  const result = validateSalesMotionPipeline({
    sales_motion_pipeline: pipeline(),
    gif_brief_set: { briefs: [{ semantic_contract: baseSemantic() }] },
  });
  assert.equal(result.ok, true);

  const invalid = pipeline();
  invalid.image_generation.execution_strategy = "sequential_role_batches";
  assert.equal(
    validateSalesMotionPipeline({
      sales_motion_pipeline: invalid,
      gif_brief_set: { briefs: [{ semantic_contract: baseSemantic() }] },
    }).ok,
    false,
  );
});

test("콜아웃 confidence는 anchor·bbox·detail card로 결정된다", () => {
  assert.equal(calloutRouteForConfidence(0.85), "precise_anchor");
  assert.equal(calloutRouteForConfidence(0.6), "bbox_glow");
  assert.equal(calloutRouteForConfidence(0.59), "separate_detail_card");

  const precise = validateSalesMotionBrief({
    semantic_contract: baseSemantic({
      template_id: "T3_FEATURE_HOTSPOT",
      feature_locations: [{
        confidence: 0.92,
        route: "precise_anchor",
        hold_seconds: 1,
        anchor: { x: 0.68, y: 0.42 },
      }],
      locator_guide: locatorGuide(1, ["feature-center"]),
    }),
  });
  assert.equal(precise.ok, true);

  const wrongRoute = validateSalesMotionBrief({
    semantic_contract: baseSemantic({
      template_id: "T3_FEATURE_HOTSPOT",
      feature_locations: [{
        confidence: 0.4,
        route: "precise_anchor",
        hold_seconds: 1,
        anchor: { x: 0.2, y: 0.2 },
      }],
    }),
  });
  assert.equal(wrongRoute.ok, false);
  assert.ok(
    wrongRoute.errors.some(
      (error) => error.code === "FEATURE_CALLOUT_CONFIDENCE_ROUTE_REQUIRED",
    ),
  );
});

test("고정 제품 위 정보 SVG는 허용하고 장식-only는 거부한다", () => {
  const dimension = validateSalesMotionBrief({
    semantic_contract: baseSemantic({
      template_id: "T2_DIMENSION_REVEAL",
      strong_effect_usage: "none",
      dimensions: {
        verified: true,
        values: [
          { axis: "width", value: 8.5, unit: "cm" },
          { axis: "height", value: 28, unit: "cm" },
        ],
        svg_measurement_lines: true,
        bidirectional_arrows: true,
        outside_product_bounds: true,
        product_ratio_locked: true,
      },
      locator_guide: locatorGuide(4, [
        "width-start",
        "height-start",
        "width-end",
        "height-end",
      ]),
    }),
  });
  assert.equal(dimension.ok, true);

  const decorative = validateSalesMotionBrief({
    semantic_contract: baseSemantic({ decorative_overlay_only: true }),
  });
  assert.equal(decorative.ok, false);
});

test("정밀 오버레이는 God Tibo 가이드 좌표와 깨끗한 렌더 원본을 요구한다", () => {
  const missingGuide = validateSalesMotionBrief({
    semantic_contract: baseSemantic({
      template_id: "T6_STEPS_FLOW",
      steps: [{
        verb: "필름을 벗긴다",
        asset_id: "peel-source-1",
        direction_cue: true,
        completion_cue: true,
      }],
    }),
  });
  assert.ok(
    missingGuide.errors.some(
      (error) => error.code === "GOD_TIBO_LOCATOR_GUIDE_REQUIRED",
    ),
  );

  const verifiedGuide = validateSalesMotionBrief({
    semantic_contract: baseSemantic({
      template_id: "T6_STEPS_FLOW",
      steps: [{
        verb: "필름을 벗긴다",
        asset_id: "peel-source-1",
        direction_cue: true,
        completion_cue: true,
      }],
      locator_guide: locatorGuide(2, [
        "physical-action-origin",
        "physical-interaction-target",
      ]),
    }),
  });
  assert.equal(verifiedGuide.ok, true);
});

test("근거 없는 치수와 실제 pair 없는 before-after를 차단한다", () => {
  const guessedDimension = validateSalesMotionBrief({
    semantic_contract: baseSemantic({
      template_id: "T2_DIMENSION_REVEAL",
      dimensions: {
        verified: false,
        values: [{ axis: "width", value: 10, unit: "cm" }],
      },
    }),
  });
  assert.ok(
    guessedDimension.errors.some(
      (error) => error.code === "VERIFIED_DIMENSION_MOTION_REQUIRED",
    ),
  );

  const fakePair = validateSalesMotionBrief({
    semantic_contract: baseSemantic({
      template_id: "T5_BEFORE_AFTER_SLIDER",
      information_delivery_mode: "aligned_verified_state_pair",
      comparison_pair: { actual_images_verified: false },
    }),
  });
  assert.ok(
    fakePair.errors.some(
      (error) => error.code === "VERIFIED_ALIGNED_BEFORE_AFTER_REQUIRED",
    ),
  );
});
