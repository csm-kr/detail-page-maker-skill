import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import CATEGORY_REFERENCE_LIBRARY from "../../policies/category-reference-library-v1.json" with { type: "json" };

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values) {
  return [...new Set(values)];
}

function sameMembers(left, right) {
  const normalizedLeft = unique(left).sort();
  const normalizedRight = unique(right).sort();
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every(
      (value, index) => value === normalizedRight[index],
    )
  );
}

export const CATEGORY_REFERENCE_LIBRARY_SHA256 = sha256(
  Buffer.from(JSON.stringify(CATEGORY_REFERENCE_LIBRARY), "utf8"),
);

export const CATEGORY_REFERENCE_QA_DIMENSIONS = Object.freeze([
  ...CATEGORY_REFERENCE_LIBRARY.visual_ambition_contract
    .required_dimensions,
]);

export function getCategoryReferenceLibrary() {
  return structuredClone(CATEGORY_REFERENCE_LIBRARY);
}

export function validateCategoryReferenceLibrary(
  library = CATEGORY_REFERENCE_LIBRARY,
) {
  const errors = [];
  const add = (code, pathValue, message) =>
    errors.push({ code, path: pathValue, message });
  const cards = asArray(library?.reference_cards);
  const archetypes = asArray(library?.archetypes);
  const anchors = asArray(library?.ambition_anchors);
  const cardIds = cards.map((card) => card?.reference_card_id);
  const archetypeIds = archetypes.map(
    (archetype) => archetype?.archetype_id,
  );
  const anchorIds = anchors.map((anchor) => anchor?.anchor_id);

  if (
    library?.schema_version !== "1.0" ||
    !isNonEmptyString(library?.library_id) ||
    !isNonEmptyString(library?.version) ||
    library?.research_only !== true
  ) {
    add(
      "CATEGORY_LIBRARY_HEADER_INVALID",
      "category_reference_library",
      "카테고리 reference library의 버전·ID·research-only 선언이 필요합니다.",
    );
  }
  if (
    archetypes.length !== 6 ||
    unique(archetypeIds).length !== archetypeIds.length
  ) {
    add(
      "CATEGORY_ARCHETYPE_SET_INVALID",
      "category_reference_library.archetypes",
      "초기 library는 중복 없는 상위 증명 아키타입 6개여야 합니다.",
    );
  }
  if (
    cards.length < 8 ||
    unique(cardIds).length !== cardIds.length
  ) {
    add(
      "CATEGORY_REFERENCE_CARD_SET_INVALID",
      "category_reference_library.reference_cards",
      "1차 library는 중복 없는 개별 프로젝트 reference card 8개 이상이어야 합니다.",
    );
  }
  if (
    anchors.length === 0 ||
    unique(anchorIds).length !== anchorIds.length
  ) {
    add(
      "AMBITION_ANCHOR_SET_INVALID",
      "category_reference_library.ambition_anchors",
      "공통 화려함 기준 anchor가 하나 이상 필요합니다.",
    );
  }
  for (const [index, card] of cards.entries()) {
    if (
      !isNonEmptyString(card?.reference_card_id) ||
      card?.source_type !== "behance_project" ||
      !/^https:\/\/www\.behance\.net\/gallery\/\d+\//.test(
        String(card?.url || ""),
      ) ||
      card?.rights !== "research_only" ||
      card?.source_page_verified !== true ||
      asArray(card?.traits).length === 0
    ) {
      add(
        "CATEGORY_REFERENCE_CARD_INVALID",
        `category_reference_library.reference_cards[${index}]`,
        "Reference card는 검증된 개별 Behance 프로젝트, research-only 권리와 trait를 가져야 합니다.",
      );
    }
    const traitIds = asArray(card?.traits).map(
      (trait) => trait?.trait_id,
    );
    if (
      unique(traitIds).length !== traitIds.length ||
      asArray(card?.traits).some(
        (trait) =>
          !isNonEmptyString(trait?.trait_id) ||
          !isNonEmptyString(trait?.description) ||
          asArray(trait?.applies_to).length === 0 ||
          asArray(trait?.applies_to).some(
            (targetType) =>
              !["section", "image_job", "gif_brief"].includes(
                targetType,
              ),
          ),
      )
    ) {
      add(
        "CATEGORY_REFERENCE_TRAIT_INVALID",
        `category_reference_library.reference_cards[${index}].traits`,
        "Reference trait ID는 card 안에서 고유하고 적용 target과 설명을 가져야 합니다.",
      );
    }
  }
  for (const [index, archetype] of archetypes.entries()) {
    const references = asArray(archetype?.reference_card_ids);
    if (
      !isNonEmptyString(archetype?.archetype_id) ||
      !isNonEmptyString(archetype?.buyer_question) ||
      references.length <
        library.selection_contract.minimum_primary_reference_cards ||
      references.some((cardId) => !cardIds.includes(cardId)) ||
      asArray(archetype?.required_image_roles).length === 0 ||
      asArray(archetype?.required_motion_pattern_families).length ===
        0
    ) {
      add(
        "CATEGORY_ARCHETYPE_INVALID",
        `category_reference_library.archetypes[${index}]`,
        "아키타입은 구매 질문, 이미지·motion 역할과 2개 이상의 실제 reference card를 가져야 합니다.",
      );
    }
  }
  if (
    library?.expansion_contract?.mode !== "incremental" ||
    library?.expansion_contract?.minimum_distinct_products < 3 ||
    library?.expansion_contract?.minimum_distinct_reference_projects <
      3 ||
    library?.expansion_contract
      ?.single_exception_may_create_archetype !== false
  ) {
    add(
      "CATEGORY_EXPANSION_CONTRACT_INVALID",
      "category_reference_library.expansion_contract",
      "새 분류는 서로 다른 제품·reference 3개 이상에서 검증된 뒤에만 추가해야 합니다.",
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    summary: {
      archetypes: archetypes.length,
      reference_cards: cards.length,
      ambition_anchors: anchors.length,
    },
  };
}

export async function validateCategoryReferenceLibraryFiles({
  skillRoot,
  library = CATEGORY_REFERENCE_LIBRARY,
} = {}) {
  const errors = [];
  for (const anchor of asArray(library?.ambition_anchors)) {
    const locator = String(anchor?.locator || "");
    const target = path.resolve(skillRoot, ...locator.split("/"));
    const relative = path.relative(path.resolve(skillRoot), target);
    if (
      !locator ||
      path.isAbsolute(locator) ||
      relative.startsWith("..") ||
      path.isAbsolute(relative)
    ) {
      errors.push({
        code: "AMBITION_ANCHOR_PATH_INVALID",
        path: locator,
      });
      continue;
    }
    try {
      const bytes = await readFile(target);
      if (sha256(bytes) !== anchor?.sha256) {
        errors.push({
          code: "AMBITION_ANCHOR_HASH_MISMATCH",
          path: locator,
        });
      }
    } catch {
      errors.push({
        code: "AMBITION_ANCHOR_MISSING",
        path: locator,
      });
    }
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

export function buildCategoryReferenceCohort({
  primaryArchetypeId,
  secondaryArchetypeIds = [],
} = {}) {
  const archetypes = new Map(
    CATEGORY_REFERENCE_LIBRARY.archetypes.map((archetype) => [
      archetype.archetype_id,
      archetype,
    ]),
  );
  const primary = archetypes.get(primaryArchetypeId);
  const secondaryIds = asArray(secondaryArchetypeIds);
  if (
    !primary ||
    secondaryIds.length >
      CATEGORY_REFERENCE_LIBRARY.selection_contract
        .secondary_archetype_maximum ||
    secondaryIds.some(
      (archetypeId) =>
        !archetypes.has(archetypeId) ||
        archetypeId === primaryArchetypeId,
    )
  ) {
    throw new Error("유효한 주 아키타입과 보조 아키타입이 필요합니다.");
  }
  const selectedArchetypes = [
    primary,
    ...secondaryIds.map((archetypeId) =>
      archetypes.get(archetypeId),
    ),
  ];
  return {
    library_id: CATEGORY_REFERENCE_LIBRARY.library_id,
    library_version: CATEGORY_REFERENCE_LIBRARY.version,
    library_sha256: CATEGORY_REFERENCE_LIBRARY_SHA256,
    primary_archetype_id: primaryArchetypeId,
    secondary_archetype_ids: [...secondaryIds],
    eligible_reference_card_ids: unique(
      selectedArchetypes.flatMap(
        (archetype) => archetype.reference_card_ids,
      ),
    ),
    required_image_roles: unique(
      selectedArchetypes.flatMap(
        (archetype) => archetype.required_image_roles,
      ),
    ),
    required_motion_pattern_families: unique(
      selectedArchetypes.flatMap(
        (archetype) =>
          archetype.required_motion_pattern_families,
      ),
    ),
    ambition_anchor_ids:
      CATEGORY_REFERENCE_LIBRARY.ambition_anchors.map(
        (anchor) => anchor.anchor_id,
      ),
  };
}

export function validateCategoryReferenceProfile(
  profile,
  {
    sectionIds = [],
    imageJobs = [],
    gifBriefs = [],
  } = {},
) {
  const errors = [];
  const add = (code, pathValue, message, details = undefined) =>
    errors.push({
      code,
      path: pathValue,
      message,
      ...(details === undefined ? {} : { details }),
    });
  let cohort = null;
  try {
    cohort = buildCategoryReferenceCohort({
      primaryArchetypeId: profile?.primary_archetype_id,
      secondaryArchetypeIds: profile?.secondary_archetype_ids,
    });
  } catch {
    add(
      "CATEGORY_ARCHETYPE_SELECTION_INVALID",
      "category_reference_profile",
      "주 아키타입 하나와 선택적 보조 아키타입 하나를 library에서 선택해야 합니다.",
    );
  }
  if (
    profile?.library_id !==
      CATEGORY_REFERENCE_LIBRARY.library_id ||
    profile?.library_version !==
      CATEGORY_REFERENCE_LIBRARY.version ||
    profile?.library_sha256 !==
      CATEGORY_REFERENCE_LIBRARY_SHA256
  ) {
    add(
      "CATEGORY_LIBRARY_BINDING_INVALID",
      "category_reference_profile",
      "ProductionPlan은 현재 category reference library ID·version·SHA-256에 묶여야 합니다.",
    );
  }
  if (
    !isNonEmptyString(profile?.classification_reason) ||
    asArray(profile?.product_signals).length === 0 ||
    profile?.research_only_acknowledged !== true ||
    profile?.no_copy_acknowledged !== true
  ) {
    add(
      "CATEGORY_CLASSIFICATION_RATIONALE_REQUIRED",
      "category_reference_profile",
      "분류 이유·제품 신호와 research-only/no-copy 확인이 필요합니다.",
    );
  }

  const cards = new Map(
    CATEGORY_REFERENCE_LIBRARY.reference_cards.map((card) => [
      card.reference_card_id,
      card,
    ]),
  );
  const selectedCardIds = asArray(
    profile?.selected_reference_card_ids,
  );
  const primaryArchetype =
    CATEGORY_REFERENCE_LIBRARY.archetypes.find(
      (archetype) =>
        archetype.archetype_id ===
        profile?.primary_archetype_id,
    );
  const selectedPrimaryCards = selectedCardIds.filter((cardId) =>
    asArray(primaryArchetype?.reference_card_ids).includes(cardId),
  );
  if (
    !cohort ||
    selectedPrimaryCards.length <
      CATEGORY_REFERENCE_LIBRARY.selection_contract
        .minimum_primary_reference_cards ||
    selectedCardIds.some(
      (cardId) =>
        !cohort?.eligible_reference_card_ids.includes(cardId),
    ) ||
    unique(selectedCardIds).length !== selectedCardIds.length
  ) {
    add(
      "CATEGORY_REFERENCE_COHORT_INCOMPLETE",
      "category_reference_profile.selected_reference_card_ids",
      "주 아키타입의 서로 다른 reference card를 최소 2개 선택해야 합니다.",
    );
  }

  if (
    !sameMembers(
      asArray(profile?.ambition_anchor_ids),
      CATEGORY_REFERENCE_LIBRARY.ambition_anchors.map(
        (anchor) => anchor.anchor_id,
      ),
    ) ||
    profile?.ambition_contract?.target !==
      "meet_or_exceed_selected_cohort" ||
    profile?.ambition_contract
      ?.critical_dimension_regression_allowed !== false ||
    profile?.ambition_contract
      ?.public_output_comparison_required !== true ||
    !sameMembers(
      asArray(profile?.ambition_contract?.required_dimensions),
      CATEGORY_REFERENCE_QA_DIMENSIONS,
    )
  ) {
    add(
      "VISUAL_AMBITION_CONTRACT_REQUIRED",
      "category_reference_profile.ambition_contract",
      "공통 화려함 anchor와 선택 cohort 이상을 요구하는 여섯 차원 비교 계약이 필요합니다.",
    );
  }

  const targetTypeById = new Map([
    ...asArray(sectionIds).map((id) => [id, "section"]),
    ...asArray(imageJobs).map((job) => [job?.job_id, "image_job"]),
    ...asArray(gifBriefs).map((brief) => [
      brief?.brief_id,
      "gif_brief",
    ]),
  ]);
  const requiredTargetIds = [...targetTypeById.keys()].filter(Boolean);
  const coveredTargets = new Set();
  for (const [index, binding] of asArray(
    profile?.trait_bindings,
  ).entries()) {
    const card = cards.get(binding?.reference_card_id);
    const trait = asArray(card?.traits).find(
      (candidate) => candidate.trait_id === binding?.trait_id,
    );
    const targets = asArray(binding?.target_ids);
    const invalidTargets = targets.filter((targetId) => {
      const targetType = targetTypeById.get(targetId);
      return !targetType || !asArray(trait?.applies_to).includes(targetType);
    });
    if (
      !isNonEmptyString(binding?.binding_id) ||
      !selectedCardIds.includes(binding?.reference_card_id) ||
      !trait ||
      targets.length === 0 ||
      invalidTargets.length > 0 ||
      !isNonEmptyString(binding?.adaptation_intent) ||
      asArray(binding?.acceptance_check_ids).length === 0
    ) {
      add(
        "CATEGORY_TRAIT_BINDING_INVALID",
        `category_reference_profile.trait_bindings[${index}]`,
        "선택 reference의 trait를 허용 target·변형 의도·acceptance check에 연결해야 합니다.",
        { invalid_target_ids: invalidTargets },
      );
    }
    targets.forEach((targetId) => coveredTargets.add(targetId));
  }
  const uncoveredTargets = requiredTargetIds.filter(
    (targetId) => !coveredTargets.has(targetId),
  );
  if (uncoveredTargets.length > 0) {
    add(
      "CATEGORY_REFERENCE_TARGET_COVERAGE_INCOMPLETE",
      "category_reference_profile.trait_bindings",
      "모든 section, image job, GIF brief는 선택 category reference trait를 따라야 합니다.",
      { uncovered_target_ids: uncoveredTargets },
    );
  }

  const anchors = new Map(
    CATEGORY_REFERENCE_LIBRARY.ambition_anchors.map((anchor) => [
      anchor.anchor_id,
      anchor,
    ]),
  );
  const coveredAnchorDimensions = new Set();
  for (const [index, binding] of asArray(
    profile?.ambition_bindings,
  ).entries()) {
    const anchor = anchors.get(binding?.anchor_id);
    const targets = asArray(binding?.target_ids);
    if (
      !anchor ||
      !asArray(anchor.adoptable_dimensions).includes(
        binding?.dimension,
      ) ||
      targets.length === 0 ||
      targets.some((targetId) => !targetTypeById.has(targetId)) ||
      !isNonEmptyString(binding?.adaptation_intent) ||
      asArray(binding?.acceptance_check_ids).length === 0
    ) {
      add(
        "AMBITION_ANCHOR_BINDING_INVALID",
        `category_reference_profile.ambition_bindings[${index}]`,
        "공통 ambition anchor의 차원을 실제 target과 acceptance check에 연결해야 합니다.",
      );
    }
    if (isNonEmptyString(binding?.dimension)) {
      coveredAnchorDimensions.add(binding.dimension);
    }
  }
  const requiredAnchorDimensions = unique(
    CATEGORY_REFERENCE_LIBRARY.ambition_anchors.flatMap(
      (anchor) => anchor.adoptable_dimensions,
    ),
  );
  const missingAnchorDimensions = requiredAnchorDimensions.filter(
    (dimension) => !coveredAnchorDimensions.has(dimension),
  );
  if (missingAnchorDimensions.length > 0) {
    add(
      "AMBITION_ANCHOR_COVERAGE_INCOMPLETE",
      "category_reference_profile.ambition_bindings",
      "화려함 anchor의 Hero·리듬·장면·motion·마무리 차원을 모두 적용해야 합니다.",
      { missing_dimensions: missingAnchorDimensions },
    );
  }

  const imageRoles = unique(
    asArray(imageJobs)
      .map((job) => job?.visual_contract?.role)
      .filter(Boolean),
  );
  const sceneKinds = unique(
    asArray(imageJobs)
      .map((job) => job?.visual_contract?.scene_kind)
      .filter(Boolean),
  );
  const isolatedCount = asArray(imageJobs).filter(
    (job) =>
      job?.visual_contract?.scene_kind === "isolated_product",
  ).length;
  const isolatedRatio =
    asArray(imageJobs).length === 0
      ? 1
      : isolatedCount / asArray(imageJobs).length;
  const missingImageRoles = asArray(
    primaryArchetype?.required_image_roles,
  ).filter((role) => !imageRoles.includes(role));
  if (
    imageRoles.length <
      CATEGORY_REFERENCE_LIBRARY.visual_ambition_contract
        .minimum_distinct_image_roles ||
    sceneKinds.length <
      CATEGORY_REFERENCE_LIBRARY.visual_ambition_contract
        .minimum_distinct_scene_kinds ||
    isolatedRatio >
      CATEGORY_REFERENCE_LIBRARY.visual_ambition_contract
        .maximum_isolated_product_ratio ||
    missingImageRoles.length > 0
  ) {
    add(
      "CATEGORY_VISUAL_AMBITION_INCOMPLETE",
      "image_job_set",
      "선택 아키타입의 이미지 역할과 공통 장면 다양성·단독 제품 비율 기준을 충족해야 합니다.",
      {
        missing_image_roles: missingImageRoles,
        distinct_image_roles: imageRoles.length,
        distinct_scene_kinds: sceneKinds.length,
        isolated_product_ratio: isolatedRatio,
      },
    );
  }

  const distinctMotionPatterns = unique(
    asArray(gifBriefs)
      .map((brief) => brief?.semantic_contract?.pattern_id)
      .filter(Boolean),
  );
  const familyBindings = asArray(
    profile?.motion_pattern_family_bindings,
  );
  const missingMotionFamilies = asArray(
    primaryArchetype?.required_motion_pattern_families,
  ).filter(
    (family) =>
      !familyBindings.some(
        (binding) =>
          binding?.pattern_family === family &&
          asArray(binding?.gif_brief_ids).length > 0 &&
          asArray(binding?.gif_brief_ids).every((briefId) =>
            asArray(gifBriefs).some(
              (brief) => brief?.brief_id === briefId,
            ),
          ),
      ),
  );
  if (
    distinctMotionPatterns.length <
      CATEGORY_REFERENCE_LIBRARY.visual_ambition_contract
        .minimum_distinct_motion_patterns ||
    missingMotionFamilies.length > 0
  ) {
    add(
      "CATEGORY_MOTION_AMBITION_INCOMPLETE",
      "category_reference_profile.motion_pattern_family_bindings",
      "선택 아키타입의 motion family와 최소 4개 패턴 다양성을 실제 GIF brief에 연결해야 합니다.",
      {
        missing_motion_pattern_families: missingMotionFamilies,
        distinct_motion_patterns: distinctMotionPatterns.length,
      },
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    summary: {
      primary_archetype_id:
        profile?.primary_archetype_id ?? null,
      selected_reference_cards: selectedCardIds.length,
      bound_targets: coveredTargets.size,
      required_targets: requiredTargetIds.length,
      distinct_image_roles: imageRoles.length,
      distinct_scene_kinds: sceneKinds.length,
      distinct_motion_patterns: distinctMotionPatterns.length,
    },
  };
}
