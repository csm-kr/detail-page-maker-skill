import DETAIL_PAGE_FLOW_POLICY from "../../policies/detail-page-flow-v1.json" with { type: "json" };
import {
  CATEGORY_REFERENCE_LIBRARY_SHA256,
  CATEGORY_REFERENCE_QA_DIMENSIONS,
  getCategoryReferenceLibrary,
  validateCategoryReferenceProfile,
} from "./category-reference-library.mjs";
import {
  validateCoupangConversionPlan,
} from "./coupang-conversion-contract.mjs";
import {
  validateBenchmarkAssembly,
} from "./competitor-benchmark.mjs";

const STABLE_ID = Object.freeze({
  claim: /^claim-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  section: /^section-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  slot: /^slot-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  image_job: /^image-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  gif_brief: /^gif-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
});

const IDENTITY_LOCKS = Object.freeze([
  "silhouette",
  "parts",
  "quantity",
  "text",
  "orientation",
]);

const RIGHTS = new Set([
  "evidence_reference",
  "identity_reference",
  "production_licensed",
  "production_generated",
  "research_only",
  "unknown",
]);

const DIRECT_PRODUCTION_RIGHTS = new Set([
  "production_licensed",
  "production_generated",
]);
const GENERATION_REFERENCE_SOURCE_KINDS = new Set([
  ...DETAIL_PAGE_FLOW_POLICY.inputs.image_generation_references
    .allowed_source_kinds,
]);
const GENERATION_REFERENCE_CLASSIFICATIONS = new Set([
  ...DETAIL_PAGE_FLOW_POLICY.inputs.image_generation_references
    .allowed_classifications,
]);

const RULE_ID = Object.freeze({
  commercial: /^CR-\d{3}$/,
  taste: /^TR-\d{3}$/,
  motion: /^MR-\d{3}$/,
});
const REFERENCE_ROLES = new Set([
  "current_output",
  "positive_reference",
  "negative_reference",
  "approved_exemplar",
]);
const REFERENCE_DECISIONS = new Set(["adopt", "adapt", "reject"]);
const CLAIM_TYPES = new Set([
  "product_identity",
  "specification",
  "usage_condition",
  "observable_structure",
  "manufacturer_claim",
  "verified_efficacy",
]);
const IMAGE_ROLES = new Set([
  "hero",
  "desire",
  "pain",
  "core_feature",
  "mechanism",
  "usage",
  "outcome",
  "comparison",
  "specification",
  "decision_recap",
]);
const IMAGE_SCENE_KINDS = new Set([
  "isolated_product",
  "contextual_use",
  "mechanism_macro",
  "outcome_context",
  "comparison",
  "specification",
]);
const PRODUCT_VIEWS = new Set([
  "top",
  "bottom",
  "side",
  "front",
  "back",
  "detail",
  "in_use",
  "not_applicable",
]);
const MOTION_METHODS = new Set([
  "fixed-product-graphics",
  "aligned-state-pair",
  "verified-layered-assets",
]);
const MOTION_OUTPUT_FORMATS = new Set([
  "gif",
  "animated-webp",
  "gif+animated-webp",
]);
const REQUIRED_REFERENCE_QA_DIMENSIONS = Object.freeze([
  "desire_formation",
  "observable_differentiation",
  "scene_diversity",
  "motion_semantic_delta",
  "delivery_780",
  "decision_close",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value ?? ""));
}

function unique(values) {
  return [...new Set(values)];
}

function sameMembers(left, right) {
  const normalizedLeft = unique(left).sort();
  const normalizedRight = unique(right).sort();
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function isQuotedCustomerVoice(value) {
  const text = String(value ?? "").trim();
  return (
    (text.startsWith("“") && text.endsWith("”")) ||
    (text.startsWith('"') && text.endsWith('"'))
  );
}

function isSingleSentence(value) {
  const text = String(value ?? "").trim();
  if (!text || /[\r\n]/.test(text)) return false;
  return (
    text
      .split(/[.!?。！？]+/)
      .map((part) => part.trim())
      .filter(Boolean).length === 1
  );
}

function exactSequence(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function appendCommercialFlowErrors(plan, gifBriefs, addError) {
  const policy = DETAIL_PAGE_FLOW_POLICY;
  const contract = policy.planning_compiler_contract;
  const flow = plan?.[contract.root_field];
  const quoteLimits = policy.content.pain.statement_count;
  const solutionLimits = policy.content.solution_group.solution_count;
  const motionMinimum = Math.max(
    policy.motion.total_count_minimum,
    policy.motion.effective_minimum_from_required_roles ?? 0,
  );
  const defaultRange = policy.motion.planning_default_range;

  if (!isObject(flow)) {
    addError(
      "COMMERCIAL_FLOW_REQUIRED",
      contract.root_field,
      `${policy.policy_id}@${policy.version}의 필수 commercial flow가 필요합니다.`,
    );
    return;
  }

  for (const field of contract.required_fields) {
    if (flow[field] === undefined || flow[field] === null) {
      addError(
        "COMMERCIAL_FLOW_FIELD_REQUIRED",
        `${contract.root_field}.${field}`,
        `commercial flow의 ${field}가 필요합니다.`,
      );
    }
  }

  const quotes = asArray(flow.problem_quotes);
  const solutions = asArray(flow.solution_modules);
  const problemMotionIds = asArray(flow.problem_motion_brief_ids);
  const usageMotionIds = asArray(flow.usage_motion_brief_ids);
  const comparisonMotionIds = asArray(flow.comparison_motion_brief_ids);
  const briefIds = new Set(gifBriefs.map((brief) => brief?.brief_id));
  const claimIds = new Set(
    asArray(plan?.claim_graph?.claims).map((claim) => claim?.claim_id),
  );
  const claimFacts = new Map(
    asArray(plan?.claim_graph?.claims).map((claim) => [
      claim?.claim_id,
      new Set(asArray(claim?.fact_ids)),
    ]),
  );
  const sectionIds = new Set(
    asArray(plan?.section_graph_draft?.sections).map(
      (section) => section?.section_id,
    ),
  );
  const imageJobIds = new Set(
    asArray(plan?.image_job_set?.jobs).map((job) => job?.job_id),
  );

  if (
    !exactSequence(
      flow.section_role_order,
      policy.content.required_order,
    )
  ) {
    addError(
      "SECTION_ROLE_ORDER_INVALID",
      `${contract.root_field}.section_role_order`,
      "필수 section role은 hero부터 decision_recap까지 정책 순서를 정확히 따라야 합니다.",
      {
        expected: policy.content.required_order,
        actual: flow.section_role_order,
      },
    );
  }

  const hero = flow.hero;
  if (
    !isObject(hero) ||
    !contract.hero_fields.every(
      (field) => hero?.[field] !== undefined && hero?.[field] !== null,
    ) ||
    !sectionIds.has(hero?.section_id) ||
    hero?.static !== policy.content.hero.static ||
    hero?.product_visual_priority !==
      policy.content.hero.product_visual_priority ||
    hero?.commercial_intensity !==
      policy.content.hero.commercial_intensity ||
    hero?.product_identity_change_allowed !==
      policy.content.hero.product_identity_change_allowed ||
    asArray(hero?.primary_benefit_claim_ids).length !==
      policy.content.hero.primary_benefit_count ||
    !claimIds.has(hero?.primary_benefit_claim_ids?.[0])
  ) {
    addError(
      "HERO_CONTRACT_INVALID",
      `${contract.root_field}.hero`,
      "Hero는 첫 section role의 정적 섹션이며 검증된 핵심 benefit claim 하나만 가져야 합니다.",
    );
  }

  const productAnswer = flow.product_answer;
  if (
    !isObject(productAnswer) ||
    !contract.product_answer_fields.every((field) =>
      isNonEmptyString(productAnswer?.[field]),
    ) ||
    !sectionIds.has(productAnswer?.section_id) ||
    !isSingleSentence(productAnswer?.sentence)
  ) {
    addError(
      "PRODUCT_ANSWER_CONTRACT_INVALID",
      `${contract.root_field}.product_answer`,
      "제품 답은 pain과 solution_group 사이의 독립 section에 놓인 한 문장이어야 합니다.",
    );
  }

  if (
    quotes.length < quoteLimits.minimum ||
    quotes.length > quoteLimits.maximum
  ) {
    addError(
      "PROBLEM_QUOTE_COUNT_INVALID",
      `${contract.root_field}.problem_quotes`,
      `고객 불편 인용문은 ${quoteLimits.minimum}~${quoteLimits.maximum}개여야 합니다.`,
      { actual: quotes.length },
    );
  }
  if (
    solutions.length < solutionLimits.minimum ||
    solutions.length > solutionLimits.maximum
  ) {
    addError(
      "SOLUTION_MODULE_COUNT_INVALID",
      `${contract.root_field}.solution_modules`,
      `해결 장점 모듈은 ${solutionLimits.minimum}~${solutionLimits.maximum}개여야 합니다.`,
      { actual: solutions.length },
    );
  }

  const quoteIds = new Set();
  const quotePainIds = [];
  quotes.forEach((quote, index) => {
    const path = `${contract.root_field}.problem_quotes[${index}]`;
    const fieldsValid = contract.problem_quote_fields.every((field) =>
      isNonEmptyString(quote?.[field]),
    );
    if (!fieldsValid) {
      addError(
        "PROBLEM_QUOTE_FIELDS_REQUIRED",
        path,
        `불편 인용문에는 ${contract.problem_quote_fields.join(", ")}가 필요합니다.`,
      );
    }
    if (!isQuotedCustomerVoice(quote?.text)) {
      addError(
        "PROBLEM_QUOTE_PUBLIC_FORM_INVALID",
        `${path}.text`,
        "불편 문장은 작성자·후기 UI 없이 인용부호를 붙인 1인칭 의견 형태여야 합니다.",
      );
    }
    if (/[?？]\s*[”"]?$/.test(String(quote?.text ?? "").trim())) {
      addError(
        "PROBLEM_QUOTE_QUESTION_FORM_FORBIDDEN",
        `${path}.text`,
        "불편 의견은 고객 질문형이 아니라 불편을 말하는 1인칭 의견이어야 합니다.",
      );
    }
    if (quoteIds.has(quote?.quote_id)) {
      addError(
        "DUPLICATE_PROBLEM_QUOTE",
        `${path}.quote_id`,
        "quote_id는 중복될 수 없습니다.",
      );
    }
    quoteIds.add(quote?.quote_id);
    quotePainIds.push(quote?.pain_id);
    if (!claimIds.has(quote?.claim_id)) {
      addError(
        "PROBLEM_QUOTE_CLAIM_NOT_FOUND",
        `${path}.claim_id`,
        "불편 문장의 claim_id가 claim graph에 없습니다.",
      );
    }
  });

  const solutionIds = new Set();
  const solutionPainIds = [];
  const benefitMotionIds = [];
  solutions.forEach((solution, index) => {
    const path = `${contract.root_field}.solution_modules[${index}]`;
    const fieldsValid = contract.solution_module_fields.every((field) =>
      isNonEmptyString(solution?.[field]),
    );
    if (!fieldsValid) {
      addError(
        "SOLUTION_MODULE_FIELDS_REQUIRED",
        path,
        `해결 모듈에는 ${contract.solution_module_fields.join(", ")}가 필요합니다.`,
      );
    }
    if (solutionIds.has(solution?.solution_id)) {
      addError(
        "DUPLICATE_SOLUTION_MODULE",
        `${path}.solution_id`,
        "solution_id는 중복될 수 없습니다.",
      );
    }
    solutionIds.add(solution?.solution_id);
    solutionPainIds.push(solution?.pain_id);
    benefitMotionIds.push(solution?.benefit_motion_brief_id);
    if (!claimIds.has(solution?.claim_id)) {
      addError(
        "SOLUTION_CLAIM_NOT_FOUND",
        `${path}.claim_id`,
        "해결 모듈의 claim_id가 claim graph에 없습니다.",
      );
    }
    if (!sectionIds.has(solution?.section_id)) {
      addError(
        "SOLUTION_SECTION_NOT_FOUND",
        `${path}.section_id`,
        "해결 모듈의 section_id가 section graph에 없습니다.",
      );
    }
    if (
      !isNonEmptyString(solution?.customer_benefit_copy) ||
      !imageJobIds.has(solution?.still_image_job_id) ||
      !claimFacts
        .get(solution?.claim_id)
        ?.has(solution?.fact_or_condition_id) ||
      !isQuotedCustomerVoice(solution?.experiential_quote) ||
      [
        solution?.attribution,
        solution?.author,
        solution?.reviewer_name,
      ].some(isNonEmptyString) ||
      solution?.review_ui === true
    ) {
      addError(
        "SOLUTION_FIVE_PART_CONTRACT_INVALID",
        path,
        "각 해결 모듈에는 고객 benefit copy, 승인 still job, 전용 motion, 검증 fact/condition, 무기명 인용형 체감 의견이 필요합니다.",
      );
    }
  });

  if (
    contract.one_to_one.pain_to_solution === true &&
    (quotePainIds.length !== solutionPainIds.length ||
      quotePainIds.some(
        (painId, index) => painId !== solutionPainIds[index],
      ) ||
      unique(quotePainIds).length !== quotePainIds.length)
  ) {
    addError(
      "PAIN_SOLUTION_ONE_TO_ONE_INVALID",
      contract.root_field,
      "불편과 해결 장점은 같은 pain_id 순서를 가진 고유한 1:1 연결이어야 합니다.",
      { problem_pain_ids: quotePainIds, solution_pain_ids: solutionPainIds },
    );
  }

  const referencedMotionIds = [
    ...problemMotionIds,
    ...benefitMotionIds,
    ...usageMotionIds,
    ...comparisonMotionIds,
  ];
  for (const [role, ids, minimum] of [
    ["problem", problemMotionIds, policy.motion.required_roles.pain],
    [
      "benefit",
      benefitMotionIds,
      solutions.length * policy.motion.required_roles.solution_per_item,
    ],
    ["usage", usageMotionIds, policy.motion.required_roles.usage],
    [
      "comparison",
      comparisonMotionIds,
      policy.motion.required_roles.comparison,
    ],
  ]) {
    if (ids.length < minimum) {
      addError(
        "MOTION_ROLE_COVERAGE_INSUFFICIENT",
        `${contract.root_field}.${role}`,
        `${role} motion은 최소 ${minimum}개가 필요합니다.`,
        { actual: ids.length },
      );
    }
  }
  if (
    contract.one_to_one.benefit_motion_per_solution === true &&
    (benefitMotionIds.length !== solutions.length ||
      unique(benefitMotionIds).length !== benefitMotionIds.length)
  ) {
    addError(
      "BENEFIT_MOTION_ONE_TO_ONE_INVALID",
      `${contract.root_field}.solution_modules`,
      "각 해결 장점은 중복되지 않는 전용 motion brief 하나를 가져야 합니다.",
    );
  }
  if (
    unique(referencedMotionIds).length !== referencedMotionIds.length
  ) {
    addError(
      "MOTION_ROLE_REUSE_FORBIDDEN",
      contract.root_field,
      "한 motion brief를 문제·장점·사용·비교 역할에 중복 배정할 수 없습니다.",
    );
  }
  for (const briefId of referencedMotionIds) {
    if (!briefIds.has(briefId)) {
      addError(
        "COMMERCIAL_FLOW_MOTION_NOT_FOUND",
        contract.root_field,
        `motion brief ${briefId}가 gif_brief_set에 없습니다.`,
      );
    }
  }
  if (gifBriefs.length < motionMinimum) {
    addError(
      "TOTAL_MOTION_MINIMUM_NOT_MET",
      "gif_brief_set.briefs",
      `역할별 합산 유효 motion은 최소 ${motionMinimum}개여야 합니다.`,
      { actual: gifBriefs.length },
    );
  }

  const usage = flow.usage;
  if (
    !isObject(usage) ||
    !contract.usage_fields.every(
      (field) => usage?.[field] !== undefined && usage?.[field] !== null,
    ) ||
    !sectionIds.has(usage?.section_id) ||
    !exactSequence(usage?.sequence, policy.content.usage.sequence)
  ) {
    addError(
      "USAGE_SEQUENCE_INVALID",
      `${contract.root_field}.usage`,
      "사용 section은 preparation → use → result 순서를 정확히 가져야 합니다.",
    );
  }

  const comparison = flow.comparison;
  if (
    !isObject(comparison) ||
    !contract.comparison_fields.every((field) =>
      isNonEmptyString(comparison?.[field]),
    ) ||
    !sectionIds.has(comparison?.section_id) ||
    comparison?.competitor_attack === true
  ) {
    addError(
      "COMPARISON_CONTRACT_INVALID",
      `${contract.root_field}.comparison`,
      "비교 section은 prior inconvenience와 verified product difference를 갖고 경쟁사 공격을 하지 않아야 합니다.",
    );
  }

  const actualReview = flow.actual_review;
  const actualReviewShapeValid =
    isObject(actualReview) &&
    contract.actual_review_fields.every((field) =>
      Object.hasOwn(actualReview, field),
    );
  if (!actualReviewShapeValid) {
    addError(
      "ACTUAL_REVIEW_DECISION_REQUIRED",
      `${contract.root_field}.actual_review`,
      "actual review section의 존재 여부와 verified same-SKU receipt 결정을 명시해야 합니다.",
    );
  } else if (actualReview.section_present === false) {
    if (actualReview.verified_same_sku_receipt_id !== null) {
      addError(
        "ACTUAL_REVIEW_OMIT_RECEIPT_INVALID",
        `${contract.root_field}.actual_review.verified_same_sku_receipt_id`,
        "후기 section을 생략할 때 verified receipt ID는 null이어야 합니다.",
      );
    }
  } else if (actualReview.section_present === true) {
    const reviewReceipt = asArray(
      plan?.provenance?.verified_same_sku_review_receipts,
    ).find(
      (receipt) =>
        receipt?.receipt_id ===
        actualReview.verified_same_sku_receipt_id,
    );
    if (
      !isNonEmptyString(actualReview.verified_same_sku_receipt_id) ||
      reviewReceipt?.same_sku_verified !== true ||
      !isSha256(reviewReceipt?.receipt_sha256)
    ) {
      addError(
        "ACTUAL_REVIEW_VERIFIED_SAME_SKU_REQUIRED",
        `${contract.root_field}.actual_review`,
        "실제 후기 section은 exact verified same-SKU receipt가 있을 때만 허용됩니다.",
      );
    }
  } else {
    addError(
      "ACTUAL_REVIEW_SECTION_FLAG_INVALID",
      `${contract.root_field}.actual_review.section_present`,
      "actual review section_present는 boolean이어야 합니다.",
    );
  }

  const publicPresentation = flow.public_presentation;
  if (
    !isObject(publicPresentation) ||
    !contract.public_presentation_fields.every((field) =>
      Object.hasOwn(publicPresentation, field),
    ) ||
    publicPresentation.review_ui !== false ||
    publicPresentation.fake_transaction_ui !== false
  ) {
    addError(
      "PUBLIC_PRESENTATION_CONTRACT_INVALID",
      `${contract.root_field}.public_presentation`,
      "재구성 의견에는 후기 UI를 붙일 수 없고 상세페이지 안에 가짜 거래 CTA를 만들 수 없습니다.",
    );
  }

  const target = flow.motion_target;
  const plannedTotal = target?.planned_total;
  if (
    !Number.isInteger(plannedTotal) ||
    plannedTotal !== gifBriefs.length
  ) {
    addError(
      "MOTION_TARGET_DIGEST_MISMATCH",
      `${contract.root_field}.motion_target.planned_total`,
      "motion_target.planned_total은 실제 GIF brief 수와 정확히 같아야 합니다.",
      { planned_total: plannedTotal, actual: gifBriefs.length },
    );
  }
  if (
    Number.isInteger(plannedTotal) &&
    (plannedTotal < defaultRange.minimum ||
      plannedTotal > defaultRange.maximum) &&
    !isNonEmptyString(target?.[contract.default_range_exception_field])
  ) {
    addError(
      "MOTION_DEFAULT_RANGE_EXCEPTION_REQUIRED",
      `${contract.root_field}.motion_target.${contract.default_range_exception_field}`,
      `기본 ${defaultRange.minimum}~${defaultRange.maximum}개 범위를 벗어나면 근거 있는 예외 사유가 필요합니다.`,
    );
  }
}

export function validateCommercialFlowContract(plan) {
  const errors = [];
  appendCommercialFlowErrors(
    plan,
    asArray(plan?.gif_brief_set?.briefs),
    (code, path, message, details = undefined) => {
      errors.push({
        code,
        path,
        message,
        ...(details === undefined ? {} : { details }),
      });
    },
  );
  return {
    ok: errors.length === 0,
    errors,
    policy_id: DETAIL_PAGE_FLOW_POLICY.policy_id,
    policy_version: DETAIL_PAGE_FLOW_POLICY.version,
  };
}

export class ProductionPlanContractError extends Error {
  constructor(errors, summary) {
    super("G1C ProductionPlan 계약을 만족하지 않습니다.");
    this.name = "ProductionPlanContractError";
    this.code = "INVALID_PRODUCTION_PLAN";
    this.details = { errors, summary };
  }
}

function appendReferenceArtifactSetErrors(plan, addError) {
  const artifactSet = plan?.reference_artifact_set;
  const artifacts = asArray(artifactSet?.artifacts);
  const matrix = asArray(artifactSet?.adoption_matrix);
  if (!isObject(artifactSet) || artifacts.length === 0) {
    addError(
      "REFERENCE_ARTIFACT_SET_REQUIRED",
      "reference_artifact_set",
      "기존 output 또는 사용자 기준작을 profile한 ReferenceArtifactSet이 필요합니다.",
    );
    return;
  }
  if (!isSha256(artifactSet?.profile_set_sha256)) {
    addError(
      "REFERENCE_PROFILE_DIGEST_REQUIRED",
      "reference_artifact_set.profile_set_sha256",
      "ReferenceArtifactSet은 profiler가 만든 exact profile set SHA-256을 가져야 합니다.",
    );
  }
  const referenceIds = artifacts.map((artifact) => artifact?.reference_id);
  if (
    unique(referenceIds).length !== referenceIds.length ||
    artifacts.some(
      (artifact) =>
        !isNonEmptyString(artifact?.reference_id) ||
        !REFERENCE_ROLES.has(artifact?.role) ||
        artifact?.rights !== "research_only" ||
        artifact?.artifact?.media_type !== "text/html" ||
        !isNonEmptyString(artifact?.artifact?.locator) ||
        !Number.isInteger(artifact?.artifact?.size_bytes) ||
        artifact.artifact.size_bytes <= 0 ||
        !isSha256(artifact?.artifact?.sha256) ||
        !isObject(artifact?.profile) ||
        !Number.isInteger(artifact?.profile?.section_count) ||
        artifact.profile.section_count < 0 ||
        !Number.isInteger(artifact?.profile?.image_reference_count) ||
        artifact.profile.image_reference_count < 0 ||
        !Number.isInteger(artifact?.profile?.motion_reference_count) ||
        artifact.profile.motion_reference_count < 0 ||
        !Array.isArray(artifact?.profile?.section_density_curve) ||
        !Array.isArray(artifact?.profile?.section_role_sequence) ||
        !Array.isArray(artifact?.profile?.width_hints_px),
    )
  ) {
    addError(
      "REFERENCE_ARTIFACT_INVALID",
      "reference_artifact_set.artifacts",
      "Reference artifact는 역할, research-only 권리, HTML bytes/hash와 구조 profile을 가져야 합니다.",
    );
  }
  if (!artifacts.some((artifact) => artifact?.role === "current_output")) {
    addError(
      "CURRENT_OUTPUT_BASELINE_REQUIRED",
      "reference_artifact_set.artifacts",
      "기존 output/detail-page.html을 current_output baseline으로 등록해야 합니다.",
    );
  }
  const matrixReferences = new Set();
  matrix.forEach((entry, index) => {
    const path = `reference_artifact_set.adoption_matrix[${index}]`;
    if (
      !referenceIds.includes(entry?.reference_id) ||
      !isNonEmptyString(entry?.trait) ||
      !REFERENCE_DECISIONS.has(entry?.decision) ||
      !isNonEmptyString(entry?.reason) ||
      !Array.isArray(entry?.target_section_ids) ||
      (entry?.decision !== "reject" &&
        entry.target_section_ids.length === 0)
    ) {
      addError(
        "REFERENCE_ADOPTION_DECISION_INVALID",
        path,
        "각 reference trait는 adopt/adapt/reject 결정, 이유, 적용 section을 가져야 합니다.",
      );
    }
    if (isNonEmptyString(entry?.reference_id)) {
      matrixReferences.add(entry.reference_id);
    }
  });
  const missingDecisions = referenceIds.filter(
    (referenceId) => !matrixReferences.has(referenceId),
  );
  if (matrix.length === 0 || missingDecisions.length > 0) {
    addError(
      "REFERENCE_ADOPTION_MATRIX_INCOMPLETE",
      "reference_artifact_set.adoption_matrix",
      "모든 current/reference artifact의 채택·변형·거절 판단이 필요합니다.",
      { missing_reference_ids: missingDecisions },
    );
  }
}

export function validateProductionPlan(plan, context = {}) {
  const errors = [];
  const orphans = new Set();

  function addError(code, path, message, details = undefined) {
    errors.push({
      code,
      path,
      message,
      ...(details === undefined ? {} : { details }),
    });
  }

  const requiredParts = [
    "reference_artifact_set",
    "category_reference_profile",
    "benchmark_assembly",
    "claim_graph",
    "section_graph_draft",
    "image_job_set",
    "gif_brief_set",
    "sales_motion_pipeline",
    "rubric_target",
  ];
  for (const part of requiredParts) {
    if (!isObject(plan?.[part])) {
      addError(
        "PRODUCTION_PLAN_PART_REQUIRED",
        part,
        `ProductionPlan의 ${part} 파트가 필요합니다.`,
      );
    }
  }

  const claims = asArray(plan?.claim_graph?.claims);
  const sections = asArray(plan?.section_graph_draft?.sections);
  const slots = asArray(plan?.section_graph_draft?.slots);
  const imageJobs = asArray(plan?.image_job_set?.jobs);
  const gifBriefs = asArray(plan?.gif_brief_set?.briefs);

  appendReferenceArtifactSetErrors(plan, addError);
  appendCommercialFlowErrors(plan, gifBriefs, addError);
  for (const error of validateBenchmarkAssembly(
    plan?.benchmark_assembly,
    { sectionIds: sections.map((section) => section?.section_id) },
  ).errors) {
    addError(error.code, error.path, error.message, error.details);
  }
  for (const error of validateCoupangConversionPlan(plan).errors) {
    addError(error.code, error.path, error.message, error.details);
  }

  const heroClaimIds = asArray(
    plan?.commercial_flow?.hero?.primary_benefit_claim_ids,
  );
  const heroClaims = heroClaimIds
    .map((claimId) =>
      claims.find((claim) => claim?.claim_id === claimId),
    )
    .filter(Boolean);
  if (
    heroClaims.length !== 1 ||
    heroClaims.some(
      (claim) =>
        ["product_identity", "specification"].includes(
          claim?.claim_type,
        ) ||
        !isNonEmptyString(claim?.customer_benefit_statement) ||
        !isNonEmptyString(claim?.evidence_boundary_statement),
    )
  ) {
    addError(
      "HERO_CUSTOMER_BENEFIT_REQUIRED",
      "commercial_flow.hero.primary_benefit_claim_ids",
      "Hero는 소재명·검증 절차 자체가 아니라 근거 경계가 있는 고객 구매 이유 하나를 말해야 합니다.",
    );
  }
  const decisionRecap = plan?.commercial_flow?.decision_recap;
  if (
    !isObject(decisionRecap) ||
    !isNonEmptyString(decisionRecap?.section_id) ||
    !isNonEmptyString(decisionRecap?.customer_outcome) ||
    !isNonEmptyString(decisionRecap?.selection_reason) ||
    decisionRecap?.risk_only !== false
  ) {
    addError(
      "DECISION_RECAP_PURCHASE_CLOSE_REQUIRED",
      "commercial_flow.decision_recap",
      "마지막 section은 위험 확인만 반복하지 않고 고객 결과와 선택 이유로 구매 질문을 닫아야 합니다.",
    );
  }

  const provenance = plan?.provenance;
  const ssotBinding = provenance?.product_ssot;
  const knowledgeBinding = provenance?.knowledge_snapshot;
  const marketBindings = asArray(provenance?.market_snapshots);
  const sourceBindingInvalid =
    !isObject(provenance) ||
    !isNonEmptyString(ssotBinding?.artifact_id) ||
    !isSha256(ssotBinding?.manifest_sha256) ||
    !isNonEmptyString(knowledgeBinding?.artifact_id) ||
    !isSha256(knowledgeBinding?.manifest_sha256) ||
    marketBindings.length === 0 ||
    marketBindings.some(
      (binding) =>
        !isNonEmptyString(binding?.artifact_id) ||
        !isSha256(binding?.manifest_sha256) ||
        asArray(binding?.finding_ids).length === 0 ||
        asArray(binding?.finding_ids).some(
          (findingId) => !isNonEmptyString(findingId),
        ),
    );
  if (sourceBindingInvalid) {
    addError(
      "PLAN_SOURCE_BINDING_INVALID",
      "provenance",
      "승인 SSOT, 시장 finding, 동결 KnowledgeSnapshot의 artifact ID와 SHA-256 연결이 필요합니다.",
    );
  }

  const appliedRules = provenance?.applied_rules;
  const commercialRules = asArray(appliedRules?.commercial);
  const tasteRules = asArray(appliedRules?.taste);
  const motionRules = asArray(appliedRules?.motion);
  const validRuleBinding = (binding, pattern) =>
    isObject(binding) &&
    pattern.test(String(binding.rule_id || "")) &&
    isSha256(binding.rule_sha256) &&
    asArray(binding.target_ids).length > 0 &&
    asArray(binding.target_ids).every(isNonEmptyString) &&
    isNonEmptyString(binding.required_effect) &&
    asArray(binding.acceptance_check_ids).length > 0 &&
    asArray(binding.acceptance_check_ids).every(isNonEmptyString);
  const invalidRuleTrace =
    commercialRules.length === 0 ||
    tasteRules.length === 0 ||
    commercialRules.some(
      (binding) => !validRuleBinding(binding, RULE_ID.commercial),
    ) ||
    tasteRules.some(
      (binding) => !validRuleBinding(binding, RULE_ID.taste),
    ) ||
    motionRules.some(
      (binding) => !validRuleBinding(binding, RULE_ID.motion),
    ) ||
    (gifBriefs.length > 0 && motionRules.length === 0);
  if (invalidRuleTrace) {
    addError(
      "PLAN_RULE_TRACE_INVALID",
      "provenance.applied_rules",
      "CR/TR/MR은 rule ID/hash뿐 아니라 target, required effect, acceptance check에 실행 바인딩해야 합니다.",
    );
  }
  if (context.knowledgeSnapshot) {
    const frozen = context.knowledgeSnapshot;
    const frozenRules = new Map(
      asArray(frozen.rule_index).map((entry) => [
        entry.rule_id,
        entry.rule_sha256,
      ]),
    );
    const snapshotBindingMismatch =
      frozen.knowledge_snapshot_id !== knowledgeBinding?.artifact_id ||
      frozen.manifest_sha256 !== knowledgeBinding?.manifest_sha256 ||
      [...commercialRules, ...tasteRules, ...motionRules].some(
        (binding) =>
          frozenRules.get(binding?.rule_id) !== binding?.rule_sha256,
      );
    if (snapshotBindingMismatch) {
      addError(
        "PLAN_RULE_SNAPSHOT_MISMATCH",
        "provenance.applied_rules",
        "ProductionPlan의 개별 rule ID/hash가 frozen KnowledgeSnapshot index와 다릅니다.",
      );
    }
  }

  const copyTone = plan?.copy_tone;
  const copyToneSourceRules = asArray(copyTone?.source_rule_ids);
  const allowedCopyRuleIds = new Set([
    ...commercialRules.map((binding) => binding?.rule_id),
    ...tasteRules.map((binding) => binding?.rule_id),
  ]);
  const copyToneInvalid =
    !isObject(copyTone) ||
    copyTone?.owner !== "html_dom" ||
    asArray(copyTone?.voice).length === 0 ||
    asArray(copyTone?.prohibited).length === 0 ||
    copyToneSourceRules.length === 0 ||
    copyToneSourceRules.some(
      (ruleId) => !allowedCopyRuleIds.has(ruleId),
    );
  if (copyToneInvalid) {
    addError(
      "COPY_TONE_CONTRACT_INVALID",
      "copy_tone",
      "고객 카피는 HTML DOM이 소유하며 CR/TR rule trace가 있는 voice·금지 표현 계약이 필요합니다.",
    );
  }

  const collections = [
    {
      name: "claim",
      plural: "claims",
      path: "claim_graph.claims",
      items: claims,
      idField: "claim_id",
      pattern: STABLE_ID.claim,
      stableRequired: true,
    },
    {
      name: "section",
      plural: "sections",
      path: "section_graph_draft.sections",
      items: sections,
      idField: "section_id",
      pattern: STABLE_ID.section,
      stableRequired: true,
    },
    {
      name: "slot",
      plural: "slots",
      path: "section_graph_draft.slots",
      items: slots,
      idField: "slot_id",
      pattern: STABLE_ID.slot,
      stableRequired: true,
    },
    {
      name: "image_job",
      plural: "image_jobs",
      path: "image_job_set.jobs",
      items: imageJobs,
      idField: "job_id",
      pattern: STABLE_ID.image_job,
    },
    {
      name: "gif_brief",
      plural: "gif_briefs",
      path: "gif_brief_set.briefs",
      items: gifBriefs,
      idField: "brief_id",
      pattern: STABLE_ID.gif_brief,
      allowEmpty: true,
    },
  ];

  const indexes = {};
  for (const collection of collections) {
    if (!Array.isArray(
      collection.name === "claim"
        ? plan?.claim_graph?.claims
        : collection.name === "section"
          ? plan?.section_graph_draft?.sections
          : collection.name === "slot"
            ? plan?.section_graph_draft?.slots
            : collection.name === "image_job"
              ? plan?.image_job_set?.jobs
              : plan?.gif_brief_set?.briefs,
    )) {
      addError(
        "PRODUCTION_PLAN_COLLECTION_REQUIRED",
        collection.path,
        `${collection.path} 배열이 필요합니다.`,
      );
    } else if (
      collection.items.length === 0 &&
      collection.allowEmpty !== true
    ) {
      addError(
        "PRODUCTION_PLAN_COLLECTION_EMPTY",
        collection.path,
        `${collection.path}는 비어 있을 수 없습니다.`,
      );
    }

    const index = new Map();
    collection.items.forEach((item, itemIndex) => {
      const id = item?.[collection.idField];
      const idPath = `${collection.path}[${itemIndex}].${collection.idField}`;
      if (!isNonEmptyString(id) || !collection.pattern.test(id)) {
        addError(
          collection.stableRequired ? "UNSTABLE_ID" : "INVALID_ID",
          idPath,
          `${collection.name} ID는 위치·시각과 무관한 의미 slug여야 합니다.`,
        );
      }
      if (index.has(id)) {
        addError(
          "DUPLICATE_ID",
          idPath,
          `${collection.name} ID가 중복되었습니다.`,
          { id },
        );
      } else if (isNonEmptyString(id)) {
        index.set(id, { item, itemIndex });
      }
    });
    indexes[collection.name] = index;
  }

  const executableTargetIds = new Set([
    ...indexes.section.keys(),
    ...indexes.slot.keys(),
    ...indexes.image_job.keys(),
    ...indexes.gif_brief.keys(),
    "reference-artifact-set",
    "planning-doc:COMMERCIAL.md",
    "planning-doc:DESIGN.md",
    "planning-doc:BUYER-JOURNEY.md",
    "planning-doc:GIF.md",
    "public-output:detail-page.html",
    "public-output:media",
    "public-output:manifest",
  ]);
  const categoryReferenceValidation =
    validateCategoryReferenceProfile(
      plan?.category_reference_profile,
      {
        sectionIds: [...indexes.section.keys()],
        imageJobs,
        gifBriefs,
      },
    );
  for (const error of categoryReferenceValidation.errors) {
    addError(
      error.code,
      error.path,
      error.message,
      error.details,
    );
  }
  asArray(plan?.reference_artifact_set?.adoption_matrix).forEach(
    (entry, entryIndex) => {
      const unknownSections = asArray(entry?.target_section_ids).filter(
        (sectionId) => !indexes.section.has(sectionId),
      );
      if (unknownSections.length > 0) {
        addError(
          "REFERENCE_ADOPTION_SECTION_NOT_FOUND",
          `reference_artifact_set.adoption_matrix[${entryIndex}].target_section_ids`,
          "Reference 채택 판단은 실제 ProductionPlan section에 연결되어야 합니다.",
          { unknown_section_ids: unknownSections },
        );
      }
    },
  );
  for (const [kind, bindings] of [
    ["commercial", commercialRules],
    ["taste", tasteRules],
    ["motion", motionRules],
  ]) {
    bindings.forEach((binding, bindingIndex) => {
      const path = `provenance.applied_rules.${kind}[${bindingIndex}]`;
      const unknownTargets = asArray(binding?.target_ids).filter(
        (targetId) => !executableTargetIds.has(targetId),
      );
      if (unknownTargets.length > 0) {
        addError(
          "RULE_TARGET_NOT_FOUND",
          `${path}.target_ids`,
          "적용 규칙의 target은 실제 section/job/brief/planning/public-output 계약이어야 합니다.",
          { unknown_target_ids: unknownTargets },
        );
      }
      if (
        kind === "motion" &&
        !asArray(binding?.target_ids).some((targetId) =>
          indexes.gif_brief.has(targetId),
        )
      ) {
        addError(
          "MOTION_RULE_BRIEF_BINDING_REQUIRED",
          `${path}.target_ids`,
          "MR 규칙은 하나 이상의 실제 gif brief에 직접 연결되어야 합니다.",
        );
      }
    });
  }

  function checkReferenceList({
    leftType,
    leftItems,
    leftIdField,
    leftPath,
    leftReferenceField,
    rightType,
    rightIndex,
    rightReverseField,
  }) {
    leftItems.forEach((left, leftIndex) => {
      const leftId = left?.[leftIdField];
      const refs = asArray(left?.[leftReferenceField]);
      if (!Array.isArray(left?.[leftReferenceField])) {
        addError(
          "REFERENCE_LIST_REQUIRED",
          `${leftPath}[${leftIndex}].${leftReferenceField}`,
          `${leftReferenceField} 배열이 필요합니다.`,
        );
        orphans.add(`${leftType}:${leftId ?? leftIndex}`);
        return;
      }
      if (unique(refs).length !== refs.length) {
        addError(
          "DUPLICATE_REFERENCE",
          `${leftPath}[${leftIndex}].${leftReferenceField}`,
          "같은 참조를 두 번 기록할 수 없습니다.",
        );
      }
      refs.forEach((rightId) => {
        const referencePath =
          `${leftPath}[${leftIndex}].${leftReferenceField}[${rightId}]`;
        const right = rightIndex.get(rightId)?.item;
        if (!right) {
          addError(
            "REFERENCE_NOT_FOUND",
            referencePath,
            `${rightType} ${rightId}를 찾을 수 없습니다.`,
          );
          orphans.add(`${leftType}:${leftId ?? leftIndex}`);
          return;
        }
        if (!asArray(right?.[rightReverseField]).includes(leftId)) {
          addError(
            "REFERENCE_NOT_BIDIRECTIONAL",
            referencePath,
            `${leftId} → ${rightId} 참조의 역방향 연결이 없습니다.`,
          );
          orphans.add(`${rightType}:${rightId}`);
        }
      });
    });
  }

  function checkBidirectionalMany({
    leftType,
    leftItems,
    leftIndex,
    leftIdField,
    leftPath,
    leftReferenceField,
    rightType,
    rightItems,
    rightIndex,
    rightIdField,
    rightPath,
    rightReferenceField,
  }) {
    checkReferenceList({
      leftType,
      leftItems,
      leftIdField,
      leftPath,
      leftReferenceField,
      rightType,
      rightIndex,
      rightReverseField: rightReferenceField,
    });
    checkReferenceList({
      leftType: rightType,
      leftItems: rightItems,
      leftIdField: rightIdField,
      leftPath: rightPath,
      leftReferenceField: rightReferenceField,
      rightType: leftType,
      rightIndex: leftIndex,
      rightReverseField: leftReferenceField,
    });
  }

  checkBidirectionalMany({
    leftType: "claim",
    leftItems: claims,
    leftIndex: indexes.claim,
    leftIdField: "claim_id",
    leftPath: "claim_graph.claims",
    leftReferenceField: "section_ids",
    rightType: "section",
    rightItems: sections,
    rightIndex: indexes.section,
    rightIdField: "section_id",
    rightPath: "section_graph_draft.sections",
    rightReferenceField: "claim_ids",
  });
  checkBidirectionalMany({
    leftType: "claim",
    leftItems: claims,
    leftIndex: indexes.claim,
    leftIdField: "claim_id",
    leftPath: "claim_graph.claims",
    leftReferenceField: "slot_ids",
    rightType: "slot",
    rightItems: slots,
    rightIndex: indexes.slot,
    rightIdField: "slot_id",
    rightPath: "section_graph_draft.slots",
    rightReferenceField: "claim_ids",
  });
  checkBidirectionalMany({
    leftType: "claim",
    leftItems: claims,
    leftIndex: indexes.claim,
    leftIdField: "claim_id",
    leftPath: "claim_graph.claims",
    leftReferenceField: "image_job_ids",
    rightType: "image_job",
    rightItems: imageJobs,
    rightIndex: indexes.image_job,
    rightIdField: "job_id",
    rightPath: "image_job_set.jobs",
    rightReferenceField: "claim_ids",
  });
  checkBidirectionalMany({
    leftType: "claim",
    leftItems: claims,
    leftIndex: indexes.claim,
    leftIdField: "claim_id",
    leftPath: "claim_graph.claims",
    leftReferenceField: "gif_brief_ids",
    rightType: "gif_brief",
    rightItems: gifBriefs,
    rightIndex: indexes.gif_brief,
    rightIdField: "brief_id",
    rightPath: "gif_brief_set.briefs",
    rightReferenceField: "claim_ids",
  });
  checkBidirectionalMany({
    leftType: "slot",
    leftItems: slots,
    leftIndex: indexes.slot,
    leftIdField: "slot_id",
    leftPath: "section_graph_draft.slots",
    leftReferenceField: "image_job_ids",
    rightType: "image_job",
    rightItems: imageJobs,
    rightIndex: indexes.image_job,
    rightIdField: "job_id",
    rightPath: "image_job_set.jobs",
    rightReferenceField: "slot_ids",
  });
  checkBidirectionalMany({
    leftType: "slot",
    leftItems: slots,
    leftIndex: indexes.slot,
    leftIdField: "slot_id",
    leftPath: "section_graph_draft.slots",
    leftReferenceField: "gif_brief_ids",
    rightType: "gif_brief",
    rightItems: gifBriefs,
    rightIndex: indexes.gif_brief,
    rightIdField: "brief_id",
    rightPath: "gif_brief_set.briefs",
    rightReferenceField: "slot_ids",
  });

  sections.forEach((section, sectionIndex) => {
    const sectionId = section?.section_id;
    const sectionSlotIds = asArray(section?.slot_ids);
    if (asArray(section?.claim_ids).length === 0 || sectionSlotIds.length === 0) {
      orphans.add(`section:${sectionId ?? sectionIndex}`);
    }
    sectionSlotIds.forEach((slotId) => {
      const slot = indexes.slot.get(slotId)?.item;
      if (!slot) {
        addError(
          "REFERENCE_NOT_FOUND",
          `section_graph_draft.sections[${sectionIndex}].slot_ids[${slotId}]`,
          `slot ${slotId}를 찾을 수 없습니다.`,
        );
        orphans.add(`section:${sectionId ?? sectionIndex}`);
      } else if (slot.section_id !== sectionId) {
        addError(
          "REFERENCE_NOT_BIDIRECTIONAL",
          `section_graph_draft.sections[${sectionIndex}].slot_ids[${slotId}]`,
          `${sectionId} → ${slotId} 참조의 역방향 연결이 없습니다.`,
        );
        orphans.add(`slot:${slotId}`);
      }
    });
  });

  slots.forEach((slot, slotIndex) => {
    const slotId = slot?.slot_id;
    const section = indexes.section.get(slot?.section_id)?.item;
    if (!section) {
      addError(
        "REFERENCE_NOT_FOUND",
        `section_graph_draft.slots[${slotIndex}].section_id`,
        `section ${slot?.section_id}를 찾을 수 없습니다.`,
      );
      orphans.add(`slot:${slotId ?? slotIndex}`);
    } else if (!asArray(section.slot_ids).includes(slotId)) {
      addError(
        "REFERENCE_NOT_BIDIRECTIONAL",
        `section_graph_draft.slots[${slotIndex}].section_id`,
        `${slotId} → ${slot.section_id} 참조의 역방향 연결이 없습니다.`,
      );
      orphans.add(`section:${slot.section_id}`);
    }
    if (
      asArray(slot?.claim_ids).length === 0 ||
      (asArray(slot?.image_job_ids).length === 0 &&
        asArray(slot?.gif_brief_ids).length === 0)
    ) {
      orphans.add(`slot:${slotId ?? slotIndex}`);
    }
  });

  claims.forEach((claim, claimIndex) => {
    const path = `claim_graph.claims[${claimIndex}]`;
    if (!CLAIM_TYPES.has(claim?.claim_type)) {
      addError(
        "CLAIM_TYPE_REQUIRED",
        `${path}.claim_type`,
        "claim은 identity/specification/usage 또는 observable_structure/manufacturer_claim/verified_efficacy 경계를 명시해야 합니다.",
      );
    }
    if (
      claim?.claim_type === "observable_structure" &&
      (!isNonEmptyString(claim?.observation_scope) ||
        claim?.effect_claim_allowed !== false)
    ) {
      addError(
        "OBSERVABLE_STRUCTURE_BOUNDARY_REQUIRED",
        path,
        "관찰 구조 claim은 실제 보이는 부위 범위를 적고 검증되지 않은 효과 연결을 금지해야 합니다.",
      );
    }
    if (
      claim?.claim_type === "manufacturer_claim" &&
      !isNonEmptyString(claim?.source_conditions)
    ) {
      addError(
        "MANUFACTURER_CLAIM_CONDITIONS_REQUIRED",
        `${path}.source_conditions`,
        "제조사 주장은 원문 적용 조건을 가져야 합니다.",
      );
    }
    if (
      claim?.claim_type === "verified_efficacy" &&
      asArray(claim?.verification_artifact_ids).length === 0
    ) {
      addError(
        "VERIFIED_EFFICACY_EVIDENCE_REQUIRED",
        `${path}.verification_artifact_ids`,
        "효능·정량 claim은 독립 검증 artifact에 직접 연결되어야 합니다.",
      );
    }
    if (
      asArray(claim?.fact_ids).length === 0 ||
      asArray(claim?.evidence_asset_ids).length === 0 ||
      asArray(claim?.section_ids).length === 0 ||
      asArray(claim?.slot_ids).length === 0 ||
      (asArray(claim?.image_job_ids).length === 0 &&
        asArray(claim?.gif_brief_ids).length === 0)
    ) {
      orphans.add(`claim:${claim?.claim_id ?? claimIndex}`);
    }
  });

  for (let index = 1; index < gifBriefs.length; index += 1) {
    const previous = gifBriefs[index - 1];
    const current = gifBriefs[index];
    if (
      isNonEmptyString(previous?.semantic_contract?.pattern_id) &&
      previous.semantic_contract.pattern_id ===
        current?.semantic_contract?.pattern_id &&
      !isNonEmptyString(current?.semantic_contract?.pattern_reuse_reason)
    ) {
      addError(
        "ADJACENT_MOTION_PATTERN_REUSE_FORBIDDEN",
        `gif_brief_set.briefs[${index}].semantic_contract.pattern_id`,
        "인접 motion은 같은 패턴을 반복하지 않으며 필요한 경우 구체적인 재사용 사유를 적어야 합니다.",
      );
    }
  }

  imageJobs.forEach((job, jobIndex) => {
    const path = `image_job_set.jobs[${jobIndex}]`;
    const jobId = job?.job_id ?? jobIndex;
    if (
      asArray(job?.claim_ids).length === 0 ||
      asArray(job?.slot_ids).length === 0
    ) {
      orphans.add(`image_job:${jobId}`);
    }

    const identityAssets = asArray(job?.identity?.reference_asset_ids);
    const identityLocks = asArray(job?.identity?.must_preserve);
    if (
      identityAssets.length === 0 ||
      IDENTITY_LOCKS.some((lock) => !identityLocks.includes(lock))
    ) {
      addError(
        "IMAGE_IDENTITY_INCOMPLETE",
        `${path}.identity`,
        "제품 동일성 참조와 silhouette·parts·quantity·text·orientation 잠금이 필요합니다.",
      );
    }

    const rightsAssets = asArray(job?.rights?.reference_assets);
    const rightsAssetIds = rightsAssets.map((asset) => asset?.asset_id);
    const forbiddenGenerationReferences = rightsAssets.filter(
      (asset) =>
        !GENERATION_REFERENCE_SOURCE_KINDS.has(
          asset?.source_kind,
        ) ||
        !GENERATION_REFERENCE_CLASSIFICATIONS.has(
          asset?.classification,
        ) ||
        asset?.classification === "research_only" ||
        (asset?.source_kind === "supplier_same_sku" &&
          asset?.same_sku_verified !== true),
    );
    if (forbiddenGenerationReferences.length > 0) {
      addError(
        "IMAGE_GENERATION_REFERENCE_FORBIDDEN",
        `${path}.rights.reference_assets`,
        "이미지 생성 참조는 검증된 동일 SKU 공급처 이미지 또는 실제 제품 사진만 허용됩니다.",
        {
          forbidden_asset_ids: forbiddenGenerationReferences.map(
            (asset) => asset?.asset_id ?? null,
          ),
        },
      );
    }
    const rightsInvalid =
      !sameMembers(identityAssets, rightsAssetIds) ||
      rightsAssets.some(
        (asset) =>
          !isNonEmptyString(asset?.asset_id) ||
          !RIGHTS.has(asset?.classification) ||
          (asset?.production_use_allowed === true &&
            !DIRECT_PRODUCTION_RIGHTS.has(asset?.classification)) ||
          typeof asset?.production_use_allowed !== "boolean",
      ) ||
      job?.rights?.output_classification !== "production_generated";
    if (rightsInvalid) {
      addError(
        "IMAGE_RIGHTS_INVALID",
        `${path}.rights`,
        "모든 동일성 참조의 파일별 권리와 production_generated 출력 권리를 지정해야 합니다.",
      );
    }

    const size = job?.size;
    const targetSizeValid =
      size?.mode === "target" &&
      Number.isInteger(size?.width) &&
      size.width > 0 &&
      Number.isInteger(size?.height) &&
      size.height > 0;
    const referenceSizeValid =
      size?.mode === "reference" &&
      Number.isInteger(size?.width) &&
      size.width > 0 &&
      Number.isInteger(size?.height) &&
      size.height > 0 &&
      isNonEmptyString(size?.reference_asset_id);
    if (
      (!targetSizeValid && !referenceSizeValid) ||
      !isNonEmptyString(size?.confirmation_decision_id)
    ) {
      addError(
        "IMAGE_SIZE_INVALID",
        `${path}.size`,
        "확정된 target/reference 크기와 사용자 확인 decision ID가 필요합니다.",
      );
    }
    if (
      !Number.isInteger(job?.candidate_count) ||
      job.candidate_count < 1 ||
      job.candidate_count > 32
    ) {
      addError(
        "IMAGE_CANDIDATE_COUNT_INVALID",
        `${path}.candidate_count`,
        "candidate_count는 명시적인 1~32 정수여야 합니다.",
      );
    }
    const visual = job?.visual_contract;
    const productViews = asArray(visual?.product_views);
    const appliedRuleIds = asArray(job?.applied_rule_ids);
    const allowedImageRuleIds = new Set([
      ...commercialRules.map((binding) => binding?.rule_id),
      ...tasteRules.map((binding) => binding?.rule_id),
    ]);
    const imageRuleBindings = [...commercialRules, ...tasteRules];
    if (
      !isObject(visual) ||
      !IMAGE_ROLES.has(visual?.role) ||
      !IMAGE_SCENE_KINDS.has(visual?.scene_kind) ||
      productViews.length === 0 ||
      productViews.some((view) => !PRODUCT_VIEWS.has(view)) ||
      !isNonEmptyString(visual?.usage_context) ||
      !isNonEmptyString(visual?.lighting) ||
      !isNonEmptyString(visual?.background) ||
      !Number.isInteger(visual?.product_occupancy_percent) ||
      visual.product_occupancy_percent < 25 ||
      visual.product_occupancy_percent > 90 ||
      !isNonEmptyString(visual?.differentiation_goal)
    ) {
      addError(
        "IMAGE_VISUAL_CONTRACT_REQUIRED",
        `${path}.visual_contract`,
        "이미지 job은 역할·장면·제품 면·사용 맥락·조명·배경·점유율·차별화 목표를 가져야 합니다.",
      );
    }
    if (
      ["hero", "core_feature"].includes(visual?.role) &&
      (!Number.isInteger(job?.candidate_count) ||
        job.candidate_count < 2)
    ) {
      addError(
        "CORE_IMAGE_CANDIDATE_MINIMUM",
        `${path}.candidate_count`,
        "Hero와 핵심 기능 이미지는 비교 가능한 후보가 2개 이상이어야 합니다.",
      );
    }
    if (
      appliedRuleIds.length === 0 ||
      appliedRuleIds.some((ruleId) => !allowedImageRuleIds.has(ruleId)) ||
      appliedRuleIds.some(
        (ruleId) =>
          !imageRuleBindings.some(
            (binding) =>
              binding?.rule_id === ruleId &&
              asArray(binding?.target_ids).includes(job?.job_id),
          ),
      )
    ) {
      addError(
        "IMAGE_RULE_EFFECT_BINDING_REQUIRED",
        `${path}.applied_rule_ids`,
        "각 image job은 자신을 target으로 하는 CR/TR effect binding을 가져야 합니다.",
      );
    }
  });

  const imageCoverage = plan?.image_job_set?.visual_coverage;
  const coveredViews = new Set(
    imageJobs.flatMap((job) =>
      asArray(job?.visual_contract?.product_views),
    ),
  );
  const coveredSceneKinds = new Set(
    imageJobs.map((job) => job?.visual_contract?.scene_kind).filter(Boolean),
  );
  const requiredViews = asArray(imageCoverage?.required_product_views);
  const requiredSceneKinds = asArray(imageCoverage?.required_scene_kinds);
  if (
    !isObject(imageCoverage) ||
    requiredViews.length === 0 ||
    requiredSceneKinds.length === 0 ||
    requiredViews.some(
      (view) => !PRODUCT_VIEWS.has(view) || !coveredViews.has(view),
    ) ||
    requiredSceneKinds.some(
      (kind) =>
        !IMAGE_SCENE_KINDS.has(kind) || !coveredSceneKinds.has(kind),
    ) ||
    !requiredSceneKinds.includes("contextual_use")
  ) {
    addError(
      "IMAGE_VISUAL_COVERAGE_INCOMPLETE",
      "image_job_set.visual_coverage",
      "제품 면·장면 역할 coverage와 최소 한 개의 실제 사용 맥락 이미지가 필요합니다.",
    );
  }
  const differentiationGoals = imageJobs
    .map((job) => job?.visual_contract?.differentiation_goal)
    .filter(isNonEmptyString);
  if (
    differentiationGoals.length !==
    unique(differentiationGoals).length
  ) {
    addError(
      "IMAGE_DIFFERENTIATION_GOAL_REUSED",
      "image_job_set.jobs",
      "서로 다른 image job은 같은 차별화 목표와 구도를 반복할 수 없습니다.",
    );
  }

  gifBriefs.forEach((brief, briefIndex) => {
    const path = `gif_brief_set.briefs[${briefIndex}]`;
    const briefId = brief?.brief_id ?? briefIndex;
    if (
      asArray(brief?.claim_ids).length === 0 ||
      asArray(brief?.slot_ids).length === 0
    ) {
      orphans.add(`gif_brief:${briefId}`);
    }

    if (
      brief?.motion_necessity?.required !== true ||
      !isNonEmptyString(brief?.motion_necessity?.reason) ||
      !isNonEmptyString(brief?.motion_necessity?.static_insufficiency)
    ) {
      addError(
        "GIF_MOTION_NECESSITY_REQUIRED",
        `${path}.motion_necessity`,
        "GIF는 시간축이 필요한 이유와 정지 이미지의 한계를 명시해야 합니다.",
      );
    }
    const semantic = brief?.semantic_contract;
    const appliedMotionRuleIds = asArray(brief?.applied_rule_ids);
    const allowedMotionRuleIds = new Set(
      motionRules.map((binding) => binding?.rule_id),
    );
    if (
      !isObject(semantic) ||
      !isNonEmptyString(semantic?.customer_question) ||
      !isNonEmptyString(semantic?.feature_part) ||
      !MOTION_METHODS.has(semantic?.method) ||
      !isNonEmptyString(semantic?.pattern_id) ||
      !isNonEmptyString(semantic?.start_state) ||
      !isNonEmptyString(semantic?.mid_state) ||
      !isNonEmptyString(semantic?.end_state) ||
      !isNonEmptyString(semantic?.visible_delta) ||
      semantic?.decorative_overlay_only !== false ||
      semantic?.one_message !== true ||
      ![
        "fixed_product_graphic_composite",
        "aligned_verified_state_pair",
        "verified_layered_product_assets",
      ].includes(semantic?.information_delivery_mode) ||
      !isNonEmptyString(semantic?.background_contrast) ||
      !Number.isFinite(semantic?.answer_within_seconds) ||
      semantic.answer_within_seconds <= 0 ||
      semantic.answer_within_seconds > 1 ||
      semantic?.canvas?.width !== 780 ||
      !Number.isInteger(semantic?.canvas?.height) ||
      semantic.canvas.height <= 0 ||
      ![15, 24, 30, 60].includes(semantic?.fps) ||
      !Number.isFinite(semantic?.duration_seconds) ||
      semantic.duration_seconds <= 0 ||
      semantic.duration_seconds > 8 ||
      !MOTION_OUTPUT_FORMATS.has(semantic?.output_format) ||
      !["chapter", "full-width"].includes(semantic?.placement_scale) ||
      !isSha256(brief?.reference_profile_digest) ||
      brief.reference_profile_digest !==
        plan?.reference_artifact_set?.profile_set_sha256 ||
      !isSha256(brief?.knowledge_rule_packet_digest)
    ) {
      addError(
        "GIF_SEMANTIC_CONTRACT_REQUIRED",
        `${path}.semantic_contract`,
        "GIF는 구매 질문, 기능 부위, 방식, 시작·중간·끝 정보 상태, visible delta, 장식-only 금지, 1초 내 답, 780 canvas, fps·형식·chapter 배치를 명시해야 합니다.",
      );
    }
    if (
      appliedMotionRuleIds.length === 0 ||
      appliedMotionRuleIds.some(
        (ruleId) => !allowedMotionRuleIds.has(ruleId),
      ) ||
      appliedMotionRuleIds.some(
        (ruleId) =>
          !motionRules.some(
            (binding) =>
              binding?.rule_id === ruleId &&
              asArray(binding?.target_ids).includes(brief?.brief_id),
          ),
      )
    ) {
      addError(
        "GIF_RULE_EFFECT_BINDING_REQUIRED",
        `${path}.applied_rule_ids`,
        "각 GIF brief는 자신을 target으로 하는 MR effect binding을 가져야 합니다.",
      );
    }

    const sourceJobIds = asArray(brief?.source?.image_job_ids);
    const sourceAssetIds = asArray(brief?.source?.asset_ids);
    const allowedSourceKinds = new Set([
      "approved_image_job",
      "approved_asset",
      "product_reference",
    ]);
    const sourceMatchesKind =
      (brief?.source?.kind === "approved_image_job" &&
        sourceJobIds.length > 0) ||
      (["approved_asset", "product_reference"].includes(
        brief?.source?.kind,
      ) &&
        sourceAssetIds.length > 0);
    if (
      !allowedSourceKinds.has(brief?.source?.kind) ||
      !sourceMatchesKind
    ) {
      addError(
        "GIF_SOURCE_REQUIRED",
        `${path}.source`,
        "GIF의 승인 이미지 job 또는 제품 참조 asset 소스가 필요합니다.",
      );
      orphans.add(`gif_brief:${briefId}`);
    }

    sourceJobIds.forEach((jobId) => {
      const job = indexes.image_job.get(jobId)?.item;
      if (!job) {
        addError(
          "REFERENCE_NOT_FOUND",
          `${path}.source.image_job_ids[${jobId}]`,
          `image_job ${jobId}를 찾을 수 없습니다.`,
        );
        orphans.add(`gif_brief:${briefId}`);
      } else if (!asArray(job.gif_brief_ids).includes(brief?.brief_id)) {
        addError(
          "REFERENCE_NOT_BIDIRECTIONAL",
          `${path}.source.image_job_ids[${jobId}]`,
          `${brief?.brief_id} → ${jobId} 참조의 역방향 연결이 없습니다.`,
        );
        orphans.add(`image_job:${jobId}`);
      }
    });

    const fallback = brief?.static_fallback;
    if (
      !isObject(fallback) ||
      !isNonEmptyString(fallback.image_job_id) ||
      !indexes.image_job.has(fallback.image_job_id) ||
      !sourceJobIds.includes(fallback.image_job_id) ||
      !isNonEmptyString(fallback.reason)
    ) {
      addError(
        "GIF_STATIC_FALLBACK_REQUIRED",
        `${path}.static_fallback`,
        "GIF와 같은 승인 소스를 쓰는 정적 fallback image job과 사유가 필요합니다.",
      );
    }
  });

  imageJobs.forEach((job, jobIndex) => {
    asArray(job?.gif_brief_ids).forEach((briefId) => {
      const brief = indexes.gif_brief.get(briefId)?.item;
      if (!brief) {
        addError(
          "REFERENCE_NOT_FOUND",
          `image_job_set.jobs[${jobIndex}].gif_brief_ids[${briefId}]`,
          `gif_brief ${briefId}를 찾을 수 없습니다.`,
        );
        orphans.add(`image_job:${job?.job_id ?? jobIndex}`);
      } else if (!asArray(brief?.source?.image_job_ids).includes(job?.job_id)) {
        addError(
          "REFERENCE_NOT_BIDIRECTIONAL",
          `image_job_set.jobs[${jobIndex}].gif_brief_ids[${briefId}]`,
          `${job?.job_id} → ${briefId} 참조의 역방향 연결이 없습니다.`,
        );
        orphans.add(`gif_brief:${briefId}`);
      }
    });
  });

  const rubric = plan?.rubric_target;
  const dimensions = asArray(rubric?.dimensions);
  const dimensionIds = dimensions.map((dimension) => dimension?.criterion_id);
  const rubricInvalid =
    !isNonEmptyString(rubric?.rubric_version) ||
    !isSha256(rubric?.rubric_snapshot_sha256) ||
    !Number.isInteger(rubric?.target_score) ||
    rubric.target_score < 97 ||
    rubric.target_score > 100 ||
    rubric?.hard_failure_max !== 0 ||
    dimensions.length === 0 ||
    unique(dimensionIds).length !== dimensionIds.length ||
    dimensions.some(
      (dimension) =>
        !isNonEmptyString(dimension?.criterion_id) ||
        !Number.isInteger(dimension?.target_score) ||
        dimension.target_score < 0 ||
        dimension.target_score > 100,
    );
  if (rubricInvalid) {
    addError(
      "RUBRIC_TARGET_INVALID",
      "rubric_target",
      "버전 고정 rubric, SHA-256 snapshot, 97+ 목표, hard failure 0, 차원별 목표가 필요합니다.",
    );
  }
  const missingReferenceDimensions =
    REQUIRED_REFERENCE_QA_DIMENSIONS.filter(
      (criterionId) => !dimensionIds.includes(criterionId),
    );
  const referenceComparison = rubric?.reference_comparison;
  const referenceIds = asArray(
    plan?.reference_artifact_set?.artifacts,
  ).map((artifact) => artifact?.reference_id);
  if (
    missingReferenceDimensions.length > 0 ||
    !isObject(referenceComparison) ||
    !sameMembers(
      asArray(referenceComparison?.reference_ids),
      referenceIds,
    ) ||
    referenceComparison?.public_output_subject_required !== true ||
    referenceComparison?.same_rubric_delta_required !== true
  ) {
    addError(
      "REFERENCE_COMPARISON_RUBRIC_REQUIRED",
      "rubric_target.reference_comparison",
      "욕구·관찰 차별점·장면 다양성·motion delta·780 전달·구매 마무리를 동일 rubric으로 baseline과 비교해야 합니다.",
      { missing_dimension_ids: missingReferenceDimensions },
    );
  }
  const categoryLibrary = getCategoryReferenceLibrary();
  const categoryComparison =
    rubric?.category_reference_comparison;
  const selectedCategoryReferenceIds = asArray(
    plan?.category_reference_profile
      ?.selected_reference_card_ids,
  );
  if (
    !isObject(categoryComparison) ||
    categoryComparison?.library_id !==
      categoryLibrary.library_id ||
    categoryComparison?.library_version !==
      categoryLibrary.version ||
    categoryComparison?.library_sha256 !==
      CATEGORY_REFERENCE_LIBRARY_SHA256 ||
    !sameMembers(
      asArray(categoryComparison?.reference_card_ids),
      selectedCategoryReferenceIds,
    ) ||
    categoryComparison?.target !==
      "meet_or_exceed_selected_cohort" ||
    categoryComparison?.critical_dimension_regression_allowed !==
      false ||
    categoryComparison?.public_output_subject_required !== true ||
    !sameMembers(
      asArray(categoryComparison?.required_dimensions),
      CATEGORY_REFERENCE_QA_DIMENSIONS,
    )
  ) {
    addError(
      "CATEGORY_REFERENCE_COMPARISON_RUBRIC_REQUIRED",
      "rubric_target.category_reference_comparison",
      "선택한 category reference cohort보다 낮아지지 않는 공개 결과 비교 계약이 필요합니다.",
    );
  }

  const materialization = plan?.planning_materialization;
  const requiredPlanningDocuments = [
    ".detail-page/planning/BENCHMARK-ASSEMBLY.md",
    ".detail-page/planning/COMMERCIAL.md",
    ".detail-page/planning/DESIGN.md",
    ".detail-page/planning/BUYER-JOURNEY.md",
    ".detail-page/planning/GIF.md",
  ];
  const plannedDocuments = asArray(materialization?.documents);
  if (
    !isObject(materialization) ||
    materialization?.source !== "production_plan" ||
    materialization?.empty_template_allowed !== false ||
    !sameMembers(
      plannedDocuments.map((document) => document?.path),
      requiredPlanningDocuments,
    ) ||
    plannedDocuments.some(
      (document) =>
        document?.status !== "materialize_from_plan" ||
        asArray(document?.source_fields).length === 0,
    )
  ) {
    addError(
      "PLANNING_MATERIALIZATION_REQUIRED",
      "planning_materialization",
      "ProductionPlan은 BENCHMARK-ASSEMBLY·COMMERCIAL·DESIGN·BUYER-JOURNEY·GIF 사람용 문서를 빈 템플릿 없이 물질화해야 합니다.",
    );
  }

  for (const node of [...orphans].sort()) {
    addError(
      "ORPHAN_NODE",
      "production_graph",
      `${node}가 완결된 양방향 제작 그래프에 연결되지 않았습니다.`,
      { node },
    );
  }

  const summary = {
    reference_artifacts: asArray(
      plan?.reference_artifact_set?.artifacts,
    ).length,
    benchmark_competitors: asArray(
      plan?.benchmark_assembly?.competitors,
    ).length,
    claims: claims.length,
    sections: sections.length,
    slots: slots.length,
    image_jobs: imageJobs.length,
    gif_briefs: gifBriefs.length,
    category_reference_cards: asArray(
      plan?.category_reference_profile
        ?.selected_reference_card_ids,
    ).length,
    orphans: orphans.size,
  };
  return {
    ok: errors.length === 0 && orphans.size === 0,
    errors,
    summary,
  };
}

export function assertProductionPlan(plan, context = {}) {
  const validation = validateProductionPlan(plan, context);
  if (!validation.ok) {
    throw new ProductionPlanContractError(
      validation.errors,
      validation.summary,
    );
  }
  return plan;
}
