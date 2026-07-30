import assert from "node:assert/strict";
import test from "node:test";

import {
  buildG0QaReceipt,
  normalizeG0SupplierEvidence,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/g0-normalization.mjs";

const SHA = {
  manifest: "1".repeat(64),
  page: "2".repeat(64),
  reviews: "3".repeat(64),
  thumbnail: "4".repeat(64),
};

function validInput() {
  const manifest = {
    schema_version: "1.0",
    product_id: "56328525",
    canonical_supplier_url: "https://domeggook.com/56328525",
    requested_url: "https://domeggook.com/56328525",
    final_url: "https://domeggook.com/56328525",
    artifacts: [
      {
        path: "page.json",
        kind: "structured_product_page",
        sha256: SHA.page,
      },
      {
        path: "reviews/reviews.json",
        kind: "sanitized_public_reviews",
        sha256: SHA.reviews,
      },
      {
        path: "thumbnail/product.jpg",
        kind: "product_thumbnail",
        sha256: SHA.thumbnail,
      },
    ],
  };
  return {
    supplierSnapshot: {
      artifact_id: "art-supplier-test",
      artifact_type: "supplier.snapshot",
      product_id: "56328525",
      canonical_supplier_url: "https://domeggook.com/56328525",
      manifest_sha256: SHA.manifest,
      files: manifest.artifacts.map((entry) => ({
        source_path: entry.path,
        kind: entry.kind,
        object_sha256: entry.sha256,
        rights: "unknown",
        production_use_allowed: true,
        source_kind: "supplier_same_sku",
        same_sku_verified: true,
        classification:
          entry.kind === "product_thumbnail"
            ? "identity_reference"
            : "evidence_reference",
      })),
      member_ids: [
        "supplier-file-page",
        "supplier-file-reviews",
        "supplier-file-thumbnail",
      ],
    },
    manifest,
    page: {
      product_id: "56328525",
      product_name: "테스트 냉감 반팔 티셔츠",
      final_url: "https://domeggook.com/56328525",
      image_usage_observation: "사용허용",
      facts: [
        {
          fact_id: "FACT-MATERIAL",
          fact_type: "PRODUCT_FACT",
          field: "material",
          value: "폴리에스터",
          source_path: "page.json",
          source_locator: "page.json#/facts/0",
        },
        {
          fact_id: "FACT-SIZE",
          fact_type: "PRODUCT_FACT",
          field: "size",
          value: "L",
          source_path: "page.json",
          source_locator: "page.json#/facts/1",
        },
      ],
    },
    reviews: {
      product_id: "56328525",
      source_page_url: "https://domeggook.com/56328525",
      author_identifiers_removed: true,
      reviews: [
        {
          evidence_id: "review-0001",
          rating: 5,
          body: "가볍고 시원합니다.",
        },
      ],
    },
    actualProductPhotos: [],
    producerAgentSessionId: "g0-normalizer-session",
  };
}

test("실제품 사진이 없어도 same-SKU 공급처 identity media가 있으면 G1/G2 진행 상태가 된다", () => {
  const result = normalizeG0SupplierEvidence(validInput());

  assert.deepEqual(result.hard_failures, []);
  assert.equal(result.identity_photo_set.artifact_type, "identity.photo_set");
  assert.equal(
    result.identity_photo_set.status,
    "supplier_same_sku_fallback",
  );
  assert.equal(
    result.identity_photo_set_receipt.decision,
    "supplier_same_sku_fallback",
  );
  assert.equal(
    result.supplier_evidence_files.every(
      (file) =>
        file.rights === "evidence_reference" &&
        file.production_use_allowed === false,
    ),
    true,
  );
  assert.equal(
    result.warnings.some((warning) => warning.code === "RIGHTS_NOT_PROVEN"),
    true,
  );
  assert.equal(result.product_ssot.product_id, "56328525");
  assert.equal(
    result.product_ssot.product_name,
    "테스트 냉감 반팔 티셔츠",
  );
  assert.equal(
    result.product_ssot.source_url,
    "https://domeggook.com/56328525",
  );
  assert.equal(result.product_ssot.status, "generation_ready");
  assert.equal(
    result.product_ssot.readiness
      .supplier_same_sku_identity_media_available,
    true,
  );
  assert.equal(
    result.product_ssot.readiness.g1_g2_progress_allowed,
    true,
  );
  assert.equal(result.product_ssot.facts.length, 3);
  assert.equal(
    result.product_ssot.facts.every(
      (fact) =>
        fact.fact_id &&
        fact.value &&
        fact.source.locator &&
        fact.source.evidence_artifact_id,
    ),
    true,
  );
  assert.equal(
    result.product_ssot.facts.some(
      (fact) => fact.value === "가볍고 시원합니다.",
    ),
    false,
  );
  assert.equal(
    result.product_ssot.supplier_review_observations[0].source_type,
    "SUPPLIER_REVIEW_OBSERVATION",
  );
  assert.equal(
    result.product_ssot.supplier_review_observations[0]
      .may_be_manufacturer_fact,
    false,
  );
});

test("실제품 사진과 유효한 same-SKU 공급처 identity media가 모두 없으면 G1/G2를 차단한다", () => {
  const input = validInput();
  const thumbnail = input.supplierSnapshot.files.find(
    (file) => file.kind === "product_thumbnail",
  );
  thumbnail.source_kind = "coupang_market";
  thumbnail.classification = "research_only";

  const result = normalizeG0SupplierEvidence(input);

  assert.equal(result.identity_photo_set.status, "not_supplied");
  assert.equal(result.product_ssot.status, "draft");
  assert.equal(
    result.product_ssot.readiness.g1_g2_progress_allowed,
    false,
  );
  assert.equal(
    result.hard_failures.some(
      (failure) =>
        failure.code === "SAME_SKU_IDENTITY_MEDIA_REQUIRED",
    ),
    true,
  );
});

test("canonical supplier URL 누락 또는 다른 item URL은 G0 hard failure다", () => {
  const missing = validInput();
  missing.supplierSnapshot.canonical_supplier_url = null;
  const missingResult = normalizeG0SupplierEvidence(missing);
  assert.equal(
    missingResult.hard_failures.some(
      (failure) =>
        failure.code === "CANONICAL_SUPPLIER_URL_REQUIRED",
    ),
    true,
  );

  const mismatch = validInput();
  mismatch.reviews.source_page_url =
    "https://domeggook.com/99999999";
  const mismatchResult = normalizeG0SupplierEvidence(mismatch);
  assert.equal(
    mismatchResult.hard_failures.some(
      (failure) =>
        failure.code === "CANONICAL_SUPPLIER_URL_MISMATCH",
    ),
    true,
  );
});

test("실제품 사진과 충분한 locator-backed 사실이 있으면 product.ssot를 publish_ready로 판정한다", () => {
  const input = validInput();
  input.actualProductPhotos = [
    {
      artifact_id: "actual-photo-front",
      object_sha256: "5".repeat(64),
      source_locator: "input/product/front.jpg",
    },
  ];

  const result = normalizeG0SupplierEvidence(input);

  assert.deepEqual(result.hard_failures, []);
  assert.equal(result.identity_photo_set.status, "supplied");
  assert.deepEqual(result.identity_photo_set.member_ids, [
    "actual-photo-front",
  ]);
  assert.equal(result.product_ssot.status, "publish_ready");
  assert.equal(
    result.product_ssot.readiness.actual_product_photo_supplied,
    true,
  );
  assert.equal(
    result.product_ssot.identity_references.includes(
      "actual-photo-front",
    ),
    true,
  );
});

test("제품 사실의 source locator 또는 evidence artifact 연결이 없으면 G0를 차단한다", () => {
  const input = validInput();
  delete input.page.facts[0].source_locator;
  input.page.facts[1].source_path = "missing-page.json";
  input.actualProductPhotos = [
    {
      artifact_id: "actual-photo-front",
      object_sha256: "5".repeat(64),
      source_locator: "input/product/front.jpg",
    },
  ];

  const result = normalizeG0SupplierEvidence(input);

  assert.equal(result.product_ssot.status, "draft");
  assert.equal(
    result.hard_failures.some(
      (failure) => failure.code === "FACT_LOCATOR_MISSING",
    ),
    true,
  );
  assert.equal(
    result.hard_failures.some(
      (failure) => failure.code === "FACT_EVIDENCE_NOT_FOUND",
    ),
    true,
  );
});

test("후기 개인정보 제거가 확인되지 않거나 식별자가 남으면 G0를 차단한다", () => {
  const input = validInput();
  input.reviews.author_identifiers_removed = false;
  input.reviews.reviews[0].author_email = "buyer@example.com";
  input.reviews.reviews[0].body =
    "문의는 010-1234-5678로 주세요.";

  const result = normalizeG0SupplierEvidence(input);

  assert.equal(
    result.hard_failures.some(
      (failure) => failure.code === "PRIVACY_SANITIZATION_NOT_PROVEN",
    ),
    true,
  );
  assert.equal(
    result.hard_failures.some(
      (failure) => failure.code === "PERSONAL_DATA_PRESENT",
    ),
    true,
  );
  assert.equal(result.product_ssot.status, "draft");
});

test("같은 제품 사실의 숫자와 같은 option id의 값이 충돌하면 G0를 차단한다", () => {
  const input = validInput();
  input.page.facts.push(
    {
      fact_id: "FACT-QUANTITY-A",
      fact_type: "PRODUCT_FACT",
      field: "quantity",
      value: "2개",
      source_path: "page.json",
      source_locator: "page.json#/facts/2",
    },
    {
      fact_id: "FACT-QUANTITY-B",
      fact_type: "PRODUCT_FACT",
      field: "quantity",
      value: "3개",
      source_path: "page.json",
      source_locator: "page.json#/facts/3",
    },
  );
  input.page.options = [
    {
      option_id: "OPT-BLACK-L",
      label: "블랙 / L",
      value: "총장 68 cm",
      source_locator: "page.json#/options/0",
    },
    {
      option_id: "OPT-BLACK-L",
      label: "블랙 / L",
      value: "총장 70 cm",
      source_locator: "page.json#/options/1",
    },
  ];

  const result = normalizeG0SupplierEvidence(input);

  assert.equal(
    result.hard_failures.some(
      (failure) => failure.code === "NUMERIC_CONFLICT",
    ),
    true,
  );
  assert.equal(
    result.hard_failures.some(
      (failure) => failure.code === "OPTION_CONFLICT",
    ),
    true,
  );
  assert.equal(result.product_ssot.status, "draft");
});

test("G0 QA receipt는 exact input set과 분리된 validator session에서만 PASS한다", () => {
  const normalization = normalizeG0SupplierEvidence(validInput());

  const receipt = buildG0QaReceipt({
    normalization,
    expectedInputArtifactIds: normalization.input_set.artifact_ids,
    expectedInputSetDigest: normalization.input_set.digest,
    producerAgentSessionId: "g0-normalizer-session",
    validatorAgentSessionId: "g0-qa-session",
    startedAt: "2026-07-30T03:00:00.000Z",
    finishedAt: "2026-07-30T03:01:00.000Z",
  });

  assert.equal(receipt.verdict, "PASS");
  assert.deepEqual(receipt.hard_failures, []);
  assert.equal(
    receipt.subject.artifact_set_digest,
    normalization.input_set.digest,
  );
  assert.deepEqual(
    receipt.subject.artifact_ids,
    normalization.input_set.artifact_ids,
  );
  assert.deepEqual(receipt.producer.agent_session_ids, [
    "g0-normalizer-session",
  ]);
  assert.equal(
    receipt.validator.agent_session_id,
    "g0-qa-session",
  );
  assert.equal(
    receipt.checks.every((check) => check.status === "PASS"),
    true,
  );
});

test("G0 QA receipt는 input 누락, self-validation 또는 정규화 hard fail이 있으면 BLOCKED다", () => {
  const input = validInput();
  delete input.page.facts[0].source_locator;
  const normalization = normalizeG0SupplierEvidence(input);

  const receipt = buildG0QaReceipt({
    normalization,
    expectedInputArtifactIds: normalization.input_set.artifact_ids.slice(1),
    expectedInputSetDigest: "9".repeat(64),
    producerAgentSessionId: "g0-normalizer-session",
    validatorAgentSessionId: "g0-normalizer-session",
    startedAt: "2026-07-30T03:00:00.000Z",
    finishedAt: "2026-07-30T03:01:00.000Z",
  });

  assert.equal(receipt.verdict, "BLOCKED");
  assert.equal(receipt.score, 0);
  for (const code of [
    "FACT_LOCATOR_MISSING",
    "INPUT_SET_DIGEST_MISMATCH",
    "INPUT_ARTIFACT_SET_MISMATCH",
    "PRODUCER_VALIDATOR_NOT_SEPARATED",
  ]) {
    assert.equal(
      receipt.hard_failures.some((failure) => failure.code === code),
      true,
      code,
    );
  }
  assert.equal(
    receipt.checks.some((check) => check.status === "FAIL"),
    true,
  );
});

test("공급처 후기를 제조사 주장이나 제품 사실로 승격하려는 입력을 제거하고 차단한다", () => {
  const input = validInput();
  input.page.facts.push({
    fact_id: "FACT-FROM-REVIEW",
    fact_type: "MANUFACTURER_CLAIM",
    field: "cooling",
    value: "가볍고 시원합니다.",
    source_path: "reviews/reviews.json",
    source_locator: "reviews/reviews.json#/reviews/0/body",
  });

  const result = normalizeG0SupplierEvidence(input);

  assert.equal(
    result.hard_failures.some(
      (failure) => failure.code === "REVIEW_PROMOTED_TO_PRODUCT_FACT",
    ),
    true,
  );
  assert.equal(
    result.product_ssot.facts.some(
      (fact) => fact.fact_id === "FACT-FROM-REVIEW",
    ),
    false,
  );
  assert.equal(
    result.product_ssot.supplier_review_observations[0].publishable,
    false,
  );
});

test("supplier snapshot, manifest, page, reviews의 상품번호가 다르면 G0를 차단한다", () => {
  const input = validInput();
  input.manifest.product_id = "99999999";
  input.reviews.product_id = "88888888";

  const result = normalizeG0SupplierEvidence(input);

  assert.equal(
    result.hard_failures.some(
      (failure) => failure.code === "PRODUCT_ID_CONFLICT",
    ),
    true,
  );
  assert.equal(result.product_ssot.status, "draft");
});
