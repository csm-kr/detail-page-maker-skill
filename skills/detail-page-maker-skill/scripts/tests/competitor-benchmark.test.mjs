import assert from "node:assert/strict";
import test from "node:test";

import {
  rankBenchmarkCandidates,
  validateBenchmarkAssembly,
} from "../orchestration/competitor-benchmark.mjs";

function candidate(id, matchTier, channel, salesVolume, reviewCount) {
  return {
    competitor_id: id,
    url: `https://example.com/${id}`,
    channel,
    match_tier: matchTier,
    performance: { sales_volume: salesVolume, review_count: reviewCount },
    evidence_ids: [`evidence-${id}`],
    selling_points: [`${id} 핵심 소구`],
  };
}

function validAssembly() {
  return {
    policy_id: "policy.benchmark-assembly.searchmaster-compatible.v1",
    supplier: { url: "https://domeggook.com/product/123" },
    photo_intake: {
      asked_once: true,
      status: "no_response",
      on_missing: "continue_with_supplier_same_sku",
      ssot_priority: ["user_actual_photos", "supplier_same_sku"],
    },
    search_strategy: {
      adapter: "searchmaster-compatible-commerce-search",
      primary_channel: "coupang",
      match_priority: ["same_sku", "same_category", "adjacent_category"],
      minimum_competitors: 3,
      rank_signals: ["sales_volume", "category_rank", "review_count"],
    },
    competitors: [
      candidate("comp-a", "same_sku", "coupang", 2000, 800),
      candidate("comp-b", "same_category", "coupang", 9000, 2400),
      candidate("comp-c", "same_category", "naver", 5000, 1700),
    ],
    primary_backbone: {
      competitor_id: "comp-a",
      selection_reason: "동일 SKU이면서 구매 흐름이 가장 명확함",
      adopted_section_order: ["hero", "pain", "solution"],
    },
    borrowed_strengths: [
      {
        competitor_id: "comp-b",
        target_section_id: "section-feature",
        source_point: "구조 차이를 크게 확대하는 설명",
        adapted_copy_intent: "자사 제품 실물 구조를 한눈에 이해시키기",
        claim_id: "claim-structure",
        evidence_ids: ["evidence-comp-b"],
        proof_boundary: "공급처 실물 사진에서 관찰되는 구조까지만 표현",
      },
    ],
    section_design_references: [
      {
        section_id: "section-feature",
        competitor_id: "comp-c",
        reference_scope: "layout_and_explanation_pattern_only",
      },
    ],
    own_product_rewrite: {
      product_ssot_artifact_id: "product-ssot-1",
      locked_section_order: ["section-feature"],
      rewrites: [
        {
          section_id: "section-feature",
          own_product_copy: "실제 구조가 만드는 편한 사용감을 확인하세요.",
          claim_ids: ["claim-structure"],
        },
      ],
    },
    advantage_policy: {
      surface_supported_advantages: true,
      certificate_required_claims_need_evidence: true,
      unsupported_quantitative_claims_forbidden: true,
      allowed_claim_types: [
        "observable_structure",
        "manufacturer_claim",
        "verified_efficacy",
      ],
    },
  };
}

test("동일 SKU를 최우선으로 두고 판매 성과로 경쟁사를 정렬한다", () => {
  const ranked = rankBenchmarkCandidates(validAssembly().competitors);
  assert.equal(ranked[0].competitor_id, "comp-a");
  assert.ok(ranked[0].benchmark_score > ranked[1].benchmark_score);
});

test("A 뼈대·B/C 보강·섹션별 레퍼런스·자사 카피 재작성 계약을 검증한다", () => {
  assert.deepEqual(
    validateBenchmarkAssembly(validAssembly(), {
      sectionIds: ["section-feature"],
    }).errors,
    [],
  );
});

test("경쟁사 장점을 숨기거나 근거 없는 정량 주장을 허용하는 계획은 거절한다", () => {
  const assembly = validAssembly();
  assembly.advantage_policy.surface_supported_advantages = false;
  assembly.advantage_policy.unsupported_quantitative_claims_forbidden = false;
  const result = validateBenchmarkAssembly(assembly, {
    sectionIds: ["section-feature"],
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.errors.some((error) => error.code === "ADVANTAGE_SURFACING_POLICY_INVALID"),
    true,
  );
});
