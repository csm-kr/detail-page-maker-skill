import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCategoryReferenceCohort,
  CATEGORY_REFERENCE_LIBRARY_SHA256,
  CATEGORY_REFERENCE_QA_DIMENSIONS,
  getCategoryReferenceLibrary,
  validateCategoryReferenceLibrary,
  validateCategoryReferenceLibraryFiles,
  validateCategoryReferenceProfile,
} from "../orchestration/category-reference-library.mjs";

const sectionIds = [
  "section-hero",
  "section-mechanism",
  "section-usage",
  "section-comparison",
  "section-outcome",
];
const imageJobs = [
  ["image-hero", "hero", "isolated_product"],
  ["image-mechanism", "mechanism", "mechanism_macro"],
  ["image-usage", "usage", "contextual_use"],
  ["image-comparison", "comparison", "comparison"],
  ["image-outcome", "outcome", "outcome_context"],
].map(([jobId, role, sceneKind]) => ({
  job_id: jobId,
  visual_contract: {
    role,
    scene_kind: sceneKind,
  },
}));
const gifBriefs = [
  ["gif-structure", "structure-trace"],
  ["gif-operation", "local-operation"],
  ["gif-comparison", "comparison-wipe"],
  ["gif-usage", "usage-sequence"],
].map(([briefId, patternId]) => ({
  brief_id: briefId,
  semantic_contract: { pattern_id: patternId },
}));
const allTargetIds = [
  ...sectionIds,
  ...imageJobs.map((job) => job.job_id),
  ...gifBriefs.map((brief) => brief.brief_id),
];

function validProfile() {
  return {
    library_id: "detail-page-category-reference-library",
    library_version: "1.0.0",
    library_sha256: CATEGORY_REFERENCE_LIBRARY_SHA256,
    primary_archetype_id: "mechanism-structure",
    secondary_archetype_ids: [],
    classification_reason:
      "부품 구조와 작동 변화가 구매 질문의 중심이다.",
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
        target_ids: allTargetIds,
        adaptation_intent:
          "제품 고유 부품과 구매 질문에 맞게 구조·사용 챕터를 변형한다.",
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
      target_ids: ["section-hero"],
      adaptation_intent:
        "색과 레이아웃은 복제하지 않고 시각적 강도만 적용한다.",
      acceptance_check_ids: [`ambition-${dimension}`],
    })),
    motion_pattern_family_bindings: [
      ["structure_trace", "gif-structure"],
      ["local_operation", "gif-operation"],
      ["comparison", "gif-comparison"],
      ["usage_sequence", "gif-usage"],
    ].map(([patternFamily, briefId]) => ({
      pattern_family: patternFamily,
      gif_brief_ids: [briefId],
    })),
  };
}

test("1차 library는 6개 아키타입과 8개 실제 project card를 가진다", async () => {
  const library = getCategoryReferenceLibrary();
  const structural = validateCategoryReferenceLibrary(library);
  assert.equal(structural.ok, true, JSON.stringify(structural.errors));
  assert.equal(structural.summary.archetypes, 6);
  assert.equal(structural.summary.reference_cards, 8);
  const skillRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  );
  const files = await validateCategoryReferenceLibraryFiles({
    skillRoot,
  });
  assert.equal(files.ok, true, JSON.stringify(files.errors));
});

test("주 아키타입 cohort는 실제 reference와 공통 ambition anchor를 반환한다", () => {
  const cohort = buildCategoryReferenceCohort({
    primaryArchetypeId: "fit-movement",
    secondaryArchetypeIds: ["mechanism-structure"],
  });
  assert.equal(cohort.primary_archetype_id, "fit-movement");
  assert.ok(cohort.eligible_reference_card_ids.length >= 2);
  assert.deepEqual(cohort.ambition_anchor_ids, [
    "anchor-coupang-richness-780",
  ]);
});

test("모든 section·image·GIF가 reference trait와 ambition에 묶이면 통과한다", () => {
  const result = validateCategoryReferenceProfile(validProfile(), {
    sectionIds,
    imageJobs,
    gifBriefs,
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.summary.bound_targets, allTargetIds.length);
});

test("Reference binding 누락과 빈약한 장면·motion은 G1에서 차단한다", () => {
  const profile = validProfile();
  profile.trait_bindings[0].target_ids = ["section-hero"];
  const result = validateCategoryReferenceProfile(profile, {
    sectionIds,
    imageJobs: imageJobs.slice(0, 2),
    gifBriefs: gifBriefs.slice(0, 2),
  });
  const codes = new Set(result.errors.map((error) => error.code));
  assert.equal(result.ok, false);
  assert.equal(
    codes.has("CATEGORY_REFERENCE_TARGET_COVERAGE_INCOMPLETE"),
    true,
  );
  assert.equal(
    codes.has("CATEGORY_VISUAL_AMBITION_INCOMPLETE"),
    true,
  );
  assert.equal(
    codes.has("CATEGORY_MOTION_AMBITION_INCOMPLETE"),
    true,
  );
});
