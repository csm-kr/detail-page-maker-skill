const MATCH_PRIORITY = Object.freeze([
  "same_sku",
  "same_category",
  "adjacent_category",
]);
const CHANNELS = new Set(["coupang", "naver", "other_commerce"]);
const RANK_SIGNALS = new Set([
  "sales_volume",
  "category_rank",
  "review_count",
  "rating",
]);
const CLAIM_TYPES_ALLOWED_FOR_ADVANTAGE = Object.freeze([
  "observable_structure",
  "manufacturer_claim",
  "verified_efficacy",
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validUrl(value) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function sameMembers(left, right) {
  const normalize = (values) => [...new Set(values)].sort();
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function exactSequence(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : fallback;
}

export function benchmarkCandidateScore(candidate) {
  const matchWeight = {
    same_sku: 30_000_000,
    same_category: 20_000_000,
    adjacent_category: 10_000_000,
  }[candidate?.match_tier] ?? 0;
  const salesVolume = Math.min(numeric(candidate?.performance?.sales_volume), 999_999);
  const reviewCount = Math.min(numeric(candidate?.performance?.review_count), 99_999);
  const rating = Math.min(numeric(candidate?.performance?.rating), 5);
  const categoryRank = numeric(candidate?.performance?.category_rank, 999_999);
  const rankBonus = categoryRank < 999_999 ? Math.max(0, 100_000 - categoryRank) : 0;
  return matchWeight + salesVolume + reviewCount * 2 + rating * 1_000 + rankBonus;
}

export function rankBenchmarkCandidates(candidates) {
  return asArray(candidates)
    .map((candidate) => ({
      ...structuredClone(candidate),
      benchmark_score: benchmarkCandidateScore(candidate),
    }))
    .sort(
      (left, right) =>
        right.benchmark_score - left.benchmark_score ||
        String(left.competitor_id).localeCompare(String(right.competitor_id)),
    );
}

export function validateBenchmarkAssembly(assembly, { sectionIds = [] } = {}) {
  const errors = [];
  const add = (code, path, message, details) =>
    errors.push({ code, path, message, ...(details ? { details } : {}) });

  if (!assembly || typeof assembly !== "object" || Array.isArray(assembly)) {
    add(
      "BENCHMARK_ASSEMBLY_REQUIRED",
      "benchmark_assembly",
      "다중 경쟁사 벤치마크 조립 계약이 필요합니다.",
    );
    return { ok: false, errors };
  }
  if (assembly.policy_id !== "policy.benchmark-assembly.searchmaster-compatible.v1") {
    add(
      "BENCHMARK_POLICY_INVALID",
      "benchmark_assembly.policy_id",
      "SearchMaster 호환 경쟁사 조사 정책 ID가 필요합니다.",
    );
  }
  if (!validUrl(assembly?.supplier?.url)) {
    add(
      "SUPPLIER_URL_REQUIRED",
      "benchmark_assembly.supplier.url",
      "http(s) 도매 공급처 URL이 필요합니다.",
    );
  }
  const intake = assembly?.photo_intake;
  if (
    intake?.asked_once !== true ||
    !["provided", "not_provided", "no_response"].includes(intake?.status) ||
    intake?.on_missing !== "continue_with_supplier_same_sku" ||
    !exactSequence(asArray(intake?.ssot_priority), [
      "user_actual_photos",
      "supplier_same_sku",
    ])
  ) {
    add(
      "PHOTO_INTAKE_POLICY_INVALID",
      "benchmark_assembly.photo_intake",
      "실제품 사진은 한 번만 묻고, 없거나 무응답이면 공급처 동일 SKU를 SSOT로 계속 사용해야 합니다.",
    );
  }

  const strategy = assembly?.search_strategy;
  const candidates = asArray(assembly?.competitors);
  if (
    strategy?.adapter !== "searchmaster-compatible-commerce-search" ||
    strategy?.primary_channel !== "coupang" ||
    !exactSequence(asArray(strategy?.match_priority), MATCH_PRIORITY) ||
    !Number.isInteger(strategy?.minimum_competitors) ||
    strategy.minimum_competitors < 3 ||
    candidates.length < strategy.minimum_competitors ||
    asArray(strategy?.rank_signals).length === 0 ||
    asArray(strategy?.rank_signals).some((signal) => !RANK_SIGNALS.has(signal))
  ) {
    add(
      "COMPETITOR_SEARCH_STRATEGY_INVALID",
      "benchmark_assembly.search_strategy",
      "쿠팡 우선·동일 SKU 우선·최소 3개·판매 성과 신호 기반 경쟁사 조사가 필요합니다.",
    );
  }

  const competitorIds = new Set();
  for (const [index, candidate] of candidates.entries()) {
    const path = `benchmark_assembly.competitors[${index}]`;
    if (
      !nonEmpty(candidate?.competitor_id) ||
      competitorIds.has(candidate?.competitor_id) ||
      !validUrl(candidate?.url) ||
      !CHANNELS.has(candidate?.channel) ||
      !MATCH_PRIORITY.includes(candidate?.match_tier) ||
      asArray(candidate?.evidence_ids).length === 0 ||
      asArray(candidate?.evidence_ids).some((id) => !nonEmpty(id)) ||
      asArray(candidate?.selling_points).length === 0
    ) {
      add(
        "COMPETITOR_CANDIDATE_INVALID",
        path,
        "각 경쟁사는 고유 ID·URL·채널·제품 관계·근거·소구점을 가져야 합니다.",
      );
    }
    competitorIds.add(candidate?.competitor_id);
  }

  const primary = assembly?.primary_backbone;
  if (
    !competitorIds.has(primary?.competitor_id) ||
    !nonEmpty(primary?.selection_reason) ||
    asArray(primary?.adopted_section_order).length === 0
  ) {
    add(
      "PRIMARY_BACKBONE_INVALID",
      "benchmark_assembly.primary_backbone",
      "가장 좋은 경쟁사 한 곳을 판매 흐름의 주 뼈대로 선택해야 합니다.",
    );
  }

  const strengths = asArray(assembly?.borrowed_strengths);
  if (
    strengths.length === 0 ||
    !strengths.some((item) => item?.competitor_id !== primary?.competitor_id)
  ) {
    add(
      "SUPPLEMENTAL_COMPETITOR_STRENGTH_REQUIRED",
      "benchmark_assembly.borrowed_strengths",
      "B·C 경쟁사의 더 좋은 설명이나 소구를 최소 하나 보강해야 합니다.",
    );
  }
  strengths.forEach((item, index) => {
    if (
      !competitorIds.has(item?.competitor_id) ||
      !sectionIds.includes(item?.target_section_id) ||
      !nonEmpty(item?.source_point) ||
      !nonEmpty(item?.adapted_copy_intent) ||
      !nonEmpty(item?.claim_id) ||
      asArray(item?.evidence_ids).length === 0 ||
      !nonEmpty(item?.proof_boundary)
    ) {
      add(
        "BORROWED_STRENGTH_INVALID",
        `benchmark_assembly.borrowed_strengths[${index}]`,
        "보강 소구는 출처 경쟁사·대상 섹션·자사화 의도·claim·근거 경계를 연결해야 합니다.",
      );
    }
  });

  const designRefs = asArray(assembly?.section_design_references);
  const rewrite = assembly?.own_product_rewrite;
  const rewriteItems = asArray(rewrite?.rewrites);
  const designSectionIds = designRefs.map((item) => item?.section_id);
  const rewriteSectionIds = rewriteItems.map((item) => item?.section_id);
  if (
    !sameMembers(designSectionIds, sectionIds) ||
    designRefs.some(
      (item) =>
        !competitorIds.has(item?.competitor_id) ||
        item?.reference_scope !== "layout_and_explanation_pattern_only",
    )
  ) {
    add(
      "SECTION_DESIGN_REFERENCE_COVERAGE_INVALID",
      "benchmark_assembly.section_design_references",
      "모든 섹션은 별도의 경쟁사 디자인·설명 패턴 레퍼런스를 가져야 합니다.",
    );
  }
  if (
    !nonEmpty(rewrite?.product_ssot_artifact_id) ||
    !exactSequence(asArray(rewrite?.locked_section_order), sectionIds) ||
    !sameMembers(rewriteSectionIds, sectionIds) ||
    rewriteItems.some(
      (item) =>
        !nonEmpty(item?.own_product_copy) ||
        asArray(item?.claim_ids).length === 0,
    )
  ) {
    add(
      "OWN_PRODUCT_REWRITE_INVALID",
      "benchmark_assembly.own_product_rewrite",
      "섹션 순서를 고정하고 모든 카피를 자사 상품 SSOT와 claim으로 다시 써야 합니다.",
    );
  }

  const advantage = assembly?.advantage_policy;
  if (
    advantage?.surface_supported_advantages !== true ||
    advantage?.certificate_required_claims_need_evidence !== true ||
    advantage?.unsupported_quantitative_claims_forbidden !== true ||
    !sameMembers(
      asArray(advantage?.allowed_claim_types),
      CLAIM_TYPES_ALLOWED_FOR_ADVANTAGE,
    )
  ) {
    add(
      "ADVANTAGE_SURFACING_POLICY_INVALID",
      "benchmark_assembly.advantage_policy",
      "관찰·제조사·검증 효능 장점은 적극 노출하되 인증 필요·무근거 정량 주장은 차단해야 합니다.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    ranked_competitors: rankBenchmarkCandidates(candidates),
  };
}

export const BENCHMARK_MATCH_PRIORITY = MATCH_PRIORITY;
export const BENCHMARK_ADVANTAGE_CLAIM_TYPES = CLAIM_TYPES_ALLOWED_FOR_ADVANTAGE;
