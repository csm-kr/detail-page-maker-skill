// review-collector.js의 표본 계약 판정을 DOM 없이 검증한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.CoupangExtractorCommon = {};
new Function(readFileSync(join(SCRIPT_DIR, "review-collector.js"), "utf8"))();

const { supplyExhausted, groupSupplySettled, evaluateSampling } =
  globalThis.CoupangExtractorReviews.__internals;

function buckets(overrides = {}) {
  return [1, 2, 4, 5].map((rating) => ({
    rating,
    group: rating <= 2 ? "low" : "high",
    supply_exhausted: true,
    stop_reason: "NO_NEXT_PAGE",
    ...(overrides[rating] || {}),
  }));
}

function state(overrides = {}) {
  return {
    latestReady: true,
    latestCollected: 30,
    latestReviews: 100,
    latestSupplyExhausted: true,
    supplementCollected: 9,
    supplementReviews: 100,
    lowCount: 6,
    highCount: 3,
    neutralCount: 0,
    supplementPagesRemaining: 18,
    filterObservations: buckets(),
    ...overrides,
  };
}

const cases = {
  "소진 stop_reason만 소진으로 인정한다"() {
    for (const reason of ["NO_NEXT_PAGE", "STABLE_NO_NEW_REVIEWS", "REVIEW_CARD_NOT_FOUND", "RATING_OPTION_NOT_FOUND"]) {
      assert.equal(supplyExhausted(reason), true, reason);
    }
    for (const reason of ["MAX_LATEST_PAGES", "MAX_SUPPLEMENT_PAGES", "REVIEW_PAGE_TIMEOUT", "RATING_FILTER_TIMEOUT", null]) {
      assert.equal(supplyExhausted(reason), false, String(reason));
    }
  },

  "그룹 목표를 채웠으면 소진 여부와 무관하게 완결이다"() {
    assert.equal(groupSupplySettled("low", buckets({ 1: { supply_exhausted: false } }), 67, 67), true);
  },

  "그룹 안 한 버킷이라도 안 소진이면 미완결이다"() {
    const observations = buckets({ 2: { supply_exhausted: false, stop_reason: "MAX_SUPPLEMENT_PAGES" } });
    assert.equal(groupSupplySettled("low", observations, 20, 67), false);
    assert.equal(groupSupplySettled("high", observations, 3, 33), true);
  },

  "관측이 없는 그룹은 완결로 보지 않는다"() {
    assert.equal(groupSupplySettled("high", buckets().slice(0, 2), 0, 33), false);
  },

  "후기가 적어 양쪽이 소진되면 계약을 충족한다"() {
    const result = evaluateSampling(state());
    assert.equal(result.latestMinimumMet, true);
    assert.equal(result.supplementSupplyExhausted, true);
    assert.equal(result.supplementContractMet, true);
    assert.equal(result.samplingContractMet, true);
  },

  "목표를 정확히 채운 기존 경로는 그대로 충족한다"() {
    const result = evaluateSampling(
      state({
        latestCollected: 100,
        latestSupplyExhausted: false,
        supplementCollected: 100,
        lowCount: 67,
        highCount: 33,
      })
    );
    assert.equal(result.supplementSupplyExhausted, false);
    assert.equal(result.samplingContractMet, true);
  },

  "최신 표본이 페이지 상한에 걸리면 계약 미충족이다"() {
    const result = evaluateSampling(state({ latestSupplyExhausted: false }));
    assert.equal(result.latestMinimumMet, false);
    assert.equal(result.samplingContractMet, false);
  },

  "보강 페이지 상한에 걸리면 소진으로 보지 않는다"() {
    const result = evaluateSampling(state({ supplementPagesRemaining: 0 }));
    assert.equal(result.supplementSupplyExhausted, false);
    assert.equal(result.supplementContractMet, false);
  },

  "정렬·필터를 확인하지 못하면 소진이어도 미충족이다"() {
    assert.equal(evaluateSampling(state({ latestReady: false })).latestMinimumMet, false);
  },

  "후기 0개는 소진이어도 충족이 아니다"() {
    assert.equal(evaluateSampling(state({ latestCollected: 0 })).latestMinimumMet, false);
  },

  "3점이 섞이면 보강 계약은 깨진다"() {
    assert.equal(evaluateSampling(state({ neutralCount: 1, supplementCollected: 10 })).supplementContractMet, false);
  },

  "보강 표본이 하나도 없어도 소진이면 충족한다"() {
    const result = evaluateSampling(state({ supplementCollected: 0, lowCount: 0, highCount: 0 }));
    assert.equal(result.supplementContractMet, true);
    assert.equal(result.samplingContractMet, true);
  },
};

let failed = 0;
for (const [name, run] of Object.entries(cases)) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n     ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
