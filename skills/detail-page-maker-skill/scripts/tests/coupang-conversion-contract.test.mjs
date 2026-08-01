import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DEFAULT_IMAGE_GENERATION_COUNT,
  DEFAULT_IMAGE_PROVIDER_WORKERS,
  validateCoupangConversionPlan,
  validateMotionDiversity,
  validatePublicConversionHtml,
} from "../orchestration/coupang-conversion-contract.mjs";
import {
  SALES_ASSET_METADATA_FIELDS,
  SALES_MOTION_PHASES,
  SALES_MOTION_TEMPLATE_IDS,
} from "../orchestration/sales-motion-pipeline-contract.mjs";
import { buildGodTiboCommandPlan } from "../orchestration/adapters/god-tibo-adapter.mjs";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_WORKERS,
  validateJob,
} from "../../.agents/skills/god-tibo-gpt-image2-skill/scripts/tibo-batch.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const HASH = "a".repeat(64);

function motion(overrides = {}) {
  return {
    semantic_contract: {
      purpose: "기능을 한눈에 증명",
      template_id: "T1_HERO_REVEAL",
      one_message: true,
      answer_within_seconds: 1,
      information_delivery_mode: "fixed_product_graphic_composite",
      decorative_overlay_only: false,
      product_geometry_locked: true,
      effect_policy: {
        base_transition_family_count: 1,
        accent_transition_count: 1,
        strong_effect_usage: "product_entrance",
        information_remains_primary: true,
      },
      camera: "fixed",
      core_change: "before_after",
      transition: "wipe",
      emphasis_graphic: "split_line",
      first_frame: {
        product_or_problem_visible: true,
        message: "첫 화면에서 장점 전달",
        visual_evidence: "제품과 결과를 동시에 표시",
      },
      loop: {
        mode: "cyclic",
        pixel_boundary_pass_required: true,
        perceptual_continuity_pass_required: true,
      },
      identity_invariants: ["색", "형태", "부품", "비율"],
      generative_morphing_allowed: false,
      generative_product_morphing_allowed: false,
      public_media_strategy: "single_motion_surface_with_poster_fallback",
      ...overrides,
    },
  };
}

function salesMotionPipeline() {
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
        { group_id: "product-base", candidate_count: 8, shot_types: ["hero_front", "hero_angle"] },
        { group_id: "detail", candidate_count: 6, shot_types: ["feature_detail_1", "material_macro"] },
        { group_id: "dimension", candidate_count: 4, shot_types: ["dimension_front", "dimension_side"] },
        { group_id: "feature", candidate_count: 4, shot_types: ["feature_overview"] },
        { group_id: "state", candidate_count: 4, shot_types: ["before_scene", "after_scene"] },
        { group_id: "usage", candidate_count: 4, shot_types: ["usage_scene_1", "usage_scene_2"] },
        { group_id: "structure", candidate_count: 2, shot_types: ["components_flatlay", "exploded_view"] },
      ],
      anchor_set: {
        count: 3,
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

test("God Tibo와 상세페이지 기본 이미지 생성량은 32장·32 workers다", () => {
  assert.equal(DEFAULT_IMAGE_GENERATION_COUNT, 32);
  assert.equal(DEFAULT_IMAGE_PROVIDER_WORKERS, 32);
  assert.equal(DEFAULT_BATCH_SIZE, 32);
  assert.equal(DEFAULT_WORKERS, 32);
  const job = validateJob({
    prompt: "상업 이미지",
    size_mode: "controllable",
    target_size: "800x1200",
    output_dir: "output/default-32",
  });
  assert.equal(job.batch_size, 32);
  assert.equal(job.workers, 32);
});

test("32개 image item을 한 provider batch와 32 workers로 계획한다", async () => {
  const staging = await mkdtemp(path.join(os.tmpdir(), "tibo-32-worker-"));
  try {
    const fanOut = Array.from({ length: 32 }, (_, index) => ({
      candidate_id: `candidate-${index + 1}`,
      worker_id: `provider-worker-${index + 1}`,
      input_sha256: HASH,
      output_sha256: HASH,
      status: "passed",
    }));
    const plan = await buildGodTiboCommandPlan({
      skillRoot: ROOT,
      allowedStagingRoot: staging,
      stagingRoot: staging,
      idempotencyKey: "b".repeat(64),
      workOrder: {
        stage_id: "G2A_IMAGE",
        execution_config: {
          items: 32,
          workers: 32,
          detail_level: "high",
          gif: "forbidden",
          size_mode: "target",
          target_size: { width: 800, height: 1200 },
          size_confirmation_decision_id: "decision-32-images",
          fan_out: fanOut,
        },
      },
      itemSpecs: fanOut.map((member) => ({
        candidate_id: member.candidate_id,
        prompt: `서로 다른 상업 컷 ${member.candidate_id}`,
        references: [],
        shot_type: "hero_front",
        recommended_template: "T1_HERO_REVEAL",
        consistency_group: "product-main-v1",
      })),
    });
    assert.equal(plan.commands.length, 1);
    assert.equal(plan.commands[0].job_spec.items.length, 32);
    assert.equal(plan.commands[0].job_spec.workers, 32);
    assert.equal(plan.planning_receipt.provider_batch_count, 1);
    assert.equal(plan.planning_receipt.provider_workers, 32);
    assert.equal(
      plan.commands[0].candidate_bindings[0].recommended_template,
      "T1_HERO_REVEAL",
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
});

test("인접 GIF는 모션 축 두 개 이상이 달라야 한다", () => {
  const invalid = validateMotionDiversity([
    motion(),
    motion({ core_change: "macro_focus" }),
  ]);
  assert.equal(invalid.ok, false);
  assert.ok(
    invalid.errors.some(
      (error) => error.code === "ADJACENT_GIF_DIVERSITY_AXES_INSUFFICIENT",
    ),
  );

  const valid = validateMotionDiversity([
    motion(),
    motion({
      camera: "macro_zoom",
      core_change: "surface_gloss",
      transition: "focus_shift",
      emphasis_graphic: "circle_callout",
    }),
  ]);
  assert.equal(valid.ok, true);
});

test("쿠팡 전환 계약은 32장·중앙축·단일 주매체·스크롤 QA를 함께 잠근다", () => {
  const jobs = Array.from({ length: 16 }, (_, index) => ({
    job_id: `image-${index + 1}`,
    candidate_count: 2,
    shot_type: index % 2 === 0 ? "hero_front" : "feature_overview",
    recommended_template:
      index % 2 === 0 ? "T1_HERO_REVEAL" : "T3_FEATURE_HOTSPOT",
    identity: {
      canonical_reference_required: true,
      invariant_conditions: ["색", "형태", "부품", "비율"],
    },
  }));
  const result = validateCoupangConversionPlan({
    sales_motion_pipeline: salesMotionPipeline(),
    reference_artifact_set: {
      artifacts: [{ role: "current_output" }],
    },
    image_job_set: {
      jobs,
      generation_batch: {
        strategy: "single_concurrent_batch",
        planned_images: 32,
        provider_workers: 32,
      },
    },
    section_graph_draft: {
      sections: [{
        message_contract: {
          message_count: 1,
          customer_sentence: "한 걸음마다 탄탄하게",
          headline_lines: ["매일 신는 신발에", "탄탄한 한 겹"],
          primary_media: "motion",
          visual_proof: "깔창과 착용 결과를 한 화면에 표시",
          next_section_reason: "발을 받치는 구조를 이어서 설명",
          alignment: "center",
          minimum_visual_occupancy_percent: 65,
        },
      }],
    },
    gif_brief_set: { briefs: [motion()] },
    commercial_flow: {
      solution_modules: [{
        public_media_strategy: "single_primary_surface",
        still_role: "motion_poster_or_separate_evidence_section",
      }],
    },
    rubric_target: {
      coupang_scroll_qa: {
        first_second_message_required: true,
        fast_scroll_story_required: true,
        center_axis_max_offset_px: 8,
        minimum_title_px_390: 28,
        minimum_title_px_780: 44,
        minimum_visual_density_percent: 55,
        lazy_loading_fast_scroll_pass_required: true,
        redundant_still_motion_allowed: false,
      },
    },
  });
  assert.equal(result.ok, true);
});

test("공개 HTML은 내부 metadata와 로컬 Studio 런처를 거부한다", () => {
  assert.equal(
    validatePublicConversionHtml(
      "<!doctype html><html><body><h1>탄탄한 발밑</h1></body></html>",
    ).ok,
    true,
  );
  assert.equal(
    validatePublicConversionHtml(
      '<main data-claim-id="claim-1"><a data-local-studio-launcher>Studio</a></main>',
    ).ok,
    false,
  );
});
