import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCoupangExtractorWorkOrders,
  discoverMarketCandidates,
  importCoupangBundle,
  verifyCandidateSelection,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/market-evidence.mjs";

const PRODUCT_ID = "123";
const ITEM_ID = "456";
const VENDOR_ITEM_ID = "789";
const CANONICAL_URL =
  "https://www.coupang.com/vp/products/123?itemId=456&vendorItemId=789";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function validSelection({
  mode = "independent_validation",
  includeVendor = true,
} = {}) {
  const observedUrl = includeVendor
    ? `https://www.coupang.com/vp/products/${PRODUCT_ID}?vendorItemId=${VENDOR_ITEM_ID}&itemId=${ITEM_ID}&sourceType=search`
    : `https://www.coupang.com/vp/products/${PRODUCT_ID}?itemId=${ITEM_ID}&sourceType=search`;
  const discovery = discoverMarketCandidates({
    search_criteria: {
      query: "휴대용 선풍기",
      category: "생활가전",
    },
    producer: {
      agent_id: "discovery-agent",
      agent_session_id: "discovery-session",
    },
    observed_candidates: [
      {
        url: observedUrl,
        relevance_score: 91,
        relevance_reasons: [
          {
            dimension: "function",
            observation: "동일한 휴대용 냉풍 기능을 판매한다.",
            source_locator: "search-result:1",
          },
        ],
      },
    ],
  });

  const review =
    mode === "user_selection"
      ? {
          kind: "user_selection",
          decided_by: "user",
          approval_channel: "codex",
          nonce: "market-user-selection-1",
        }
      : {
          kind: "independent_validation",
          validator: {
            agent_id: "market-qa-agent",
            agent_session_id: "market-qa-session",
          },
          checks: [
            {
              check_id: "market-relevance",
              status: "PASS",
              evidence_candidate_ids: [
                discovery.candidates[0].candidate_id,
              ],
            },
          ],
        };

  return verifyCandidateSelection({
    discovery,
    candidate_set_digest: discovery.candidate_set_digest,
    selected_candidate_ids: [discovery.candidates[0].candidate_id],
    review,
  });
}

async function createPortableBundle({
  status = "READY",
  productId = PRODUCT_ID,
  itemId = ITEM_ID,
  vendorItemId = VENDOR_ITEM_ID,
  completeAllReviews = false,
  reviewText = "바람 세기가 사용하기 편했습니다.",
  reviewFields = {},
  providerWarnings = [],
  extraUntrackedFile = false,
  manifestTransform,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "coupang-market-"));
  const normalizedUrl = `https://www.coupang.com/vp/products/${productId}?itemId=${itemId}&vendorItemId=${vendorItemId}`;
  const rights = {
    scope: "research_reference_only",
    production_use_allowed: false,
    reviewer_identity_stored: false,
  };
  const reviewScope = {
    requested_max_reviews: 200,
    requested_latest_reviews: 100,
    requested_supplement_reviews: 100,
    reviews_observed: 1,
    complete_all_reviews: completeAllReviews,
  };
  const capture = {
    schema_version: "1.0",
    artifact_type: "coupang_product_evidence_capture",
    capture_id: "capture-fixture",
    status,
    product: {
      normalized_url: normalizedUrl,
      product_id: productId,
      item_id: itemId,
      vendor_item_id: vendorItemId,
    },
    reviews: {
      status,
      scope: reviewScope,
      items: [{ rating: 2, review_text: reviewText, ...reviewFields }],
    },
    rights,
  };
  const page = {
    schema_version: "1.0",
    artifact_type: "coupang_extractor_page",
    status,
    normalized_url: normalizedUrl,
    product_id: productId,
    item_id: itemId,
    vendor_item_id: vendorItemId,
    reviews: { status, scope: reviewScope },
    rights,
  };
  const reviews = {
    schema_version: "1.0",
    artifact_type: "coupang_public_review_capture",
    status,
    product_id: productId,
    item_id: itemId,
    scope: reviewScope,
    author_identifiers_removed: true,
    reviews: [{ rating: 2, review_text: reviewText, ...reviewFields }],
    rights,
  };
  const validation = {
    status: "VALID",
    errors: [],
    warnings: providerWarnings,
  };

  await writeJson(path.join(root, "capture.json"), capture);
  await writeJson(path.join(root, "page.json"), page);
  await writeJson(path.join(root, "reviews", "reviews.json"), reviews);
  await writeJson(
    path.join(root, "evidence", "validation.json"),
    validation,
  );
  if (extraUntrackedFile) {
    await writeFile(path.join(root, "not-in-manifest.txt"), "orphan\n", "utf8");
  }

  const relativePaths = [
    "capture.json",
    "evidence/validation.json",
    "page.json",
    "reviews/reviews.json",
  ];
  const artifacts = [];
  for (const relativePath of relativePaths) {
    const bytes = await readFile(path.join(root, ...relativePath.split("/")));
    artifacts.push({
      path: relativePath,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  let manifest = {
    schema_version: "1.0",
    artifact_type: "coupang_extractor_bundle_manifest",
    capture_id: "capture-fixture",
    status,
    browser_mode: "visible_browser_harness",
    product_id: productId,
    item_id: itemId,
    vendor_item_id: vendorItemId,
    normalized_url: normalizedUrl,
    review_scope: reviewScope,
    validation,
    rights,
    artifacts,
  };
  if (manifestTransform) manifest = manifestTransform(manifest);
  await writeJson(path.join(root, "manifest.json"), manifest);
  return root;
}

test("G1D는 검색 후보를 canonical direct URL과 관련성 근거로 고정한다", () => {
  const discovery = discoverMarketCandidates({
    search_criteria: { query: "미니 선풍기", category: "생활가전" },
    producer: {
      agent_id: "discovery-agent",
      agent_session_id: "discovery-session",
    },
    observed_candidates: [
      {
        url: `https://www.coupang.com/vp/products/${PRODUCT_ID}?vendorItemId=${VENDOR_ITEM_ID}&itemId=${ITEM_ID}&sourceType=search`,
        relevance_score: 88,
        relevance_reasons: [
          {
            dimension: "category",
            observation: "같은 휴대용 선풍기 범주다.",
            source_locator: "search-result:1",
          },
        ],
      },
    ],
  });

  assert.equal(discovery.stage_id, "G1D_DISCOVERY");
  assert.match(discovery.candidate_set_digest, /^[a-f0-9]{64}$/);
  assert.equal(discovery.candidates[0].canonical_url, CANONICAL_URL);
  assert.deepEqual(
    {
      product_id: discovery.candidates[0].product_id,
      item_id: discovery.candidates[0].item_id,
      vendor_item_id: discovery.candidates[0].vendor_item_id,
      relevance_score: discovery.candidates[0].relevance_score,
    },
    {
      product_id: PRODUCT_ID,
      item_id: ITEM_ID,
      vendor_item_id: VENDOR_ITEM_ID,
      relevance_score: 88,
    },
  );
  assert.equal(discovery.candidates[0].relevance_reasons.length, 1);
});

test("사용자가 준 direct URL도 G1D bypass receipt 없이 건너뛰지 않는다", () => {
  const discovery = discoverMarketCandidates({
    producer: {
      agent_id: "discovery-agent",
      agent_session_id: "discovery-session",
    },
    user_provided_urls: [
      {
        url: CANONICAL_URL,
        relevance_score: 80,
        relevance_reasons: [
          {
            dimension: "user_intent",
            observation: "사용자가 비교 대상으로 지정했다.",
            source_locator: "intake.competitor_url:0",
          },
        ],
        input_provenance: "intake.competitor_url:0",
      },
    ],
  });

  assert.equal(discovery.discovery_mode, "user_provided_url_bypass");
  assert.equal(discovery.user_provided_url_bypass_receipts.length, 1);
  assert.deepEqual(
    {
      receipt_type:
        discovery.user_provided_url_bypass_receipts[0].receipt_type,
      canonical_url:
        discovery.user_provided_url_bypass_receipts[0].canonical_url,
      product_id:
        discovery.user_provided_url_bypass_receipts[0].product_id,
      item_id: discovery.user_provided_url_bypass_receipts[0].item_id,
      input_provenance:
        discovery.user_provided_url_bypass_receipts[0].input_provenance,
    },
    {
      receipt_type: "user_provided_url_bypass",
      canonical_url: CANONICAL_URL,
      product_id: PRODUCT_ID,
      item_id: ITEM_ID,
      input_provenance: "intake.competitor_url:0",
    },
  );
});

test("여러 사용자 URL의 bypass provenance는 후보 정렬 뒤에도 해당 URL에 붙는다", () => {
  const discovery = discoverMarketCandidates({
    producer: {
      agent_id: "discovery-agent",
      agent_session_id: "discovery-session",
    },
    user_provided_urls: [
      {
        url: "https://www.coupang.com/vp/products/999?itemId=999",
        relevance_score: 70,
        relevance_reasons: [
          {
            dimension: "user_intent",
            observation: "첫 번째 사용자 비교 대상이다.",
            source_locator: "intake.competitor_url:0",
          },
        ],
        input_provenance: "intake.competitor_url:0",
      },
      {
        url: "https://www.coupang.com/vp/products/123?itemId=123",
        relevance_score: 80,
        relevance_reasons: [
          {
            dimension: "user_intent",
            observation: "두 번째 사용자 비교 대상이다.",
            source_locator: "intake.competitor_url:1",
          },
        ],
        input_provenance: "intake.competitor_url:1",
      },
    ],
  });

  assert.equal(
    discovery.user_provided_url_bypass_receipts.find(
      (receipt) => receipt.product_id === "999",
    ).input_provenance,
    "intake.competitor_url:0",
  );
  assert.equal(
    discovery.user_provided_url_bypass_receipts.find(
      (receipt) => receipt.product_id === "123",
    ).input_provenance,
    "intake.competitor_url:1",
  );
});

test("G1D는 itemId 또는 관련성 근거가 없는 후보를 거부한다", () => {
  assert.throws(
    () =>
      discoverMarketCandidates({
        search_criteria: { query: "선풍기" },
        producer: {
          agent_id: "discovery-agent",
          agent_session_id: "discovery-session",
        },
        observed_candidates: [
          {
            url: `https://www.coupang.com/vp/products/${PRODUCT_ID}`,
            relevance_score: 90,
            relevance_reasons: [],
          },
        ],
      }),
    (error) => {
      assert.equal(error.code, "INVALID_DIRECT_PRODUCT_URL");
      return true;
    },
  );
});

test("G1DQ 독립 검수는 exact candidate-set을 선택 artifact와 직접 URL work order로 만든다", async () => {
  const selection = await validSelection();
  const orders = createCoupangExtractorWorkOrders({
    selection: selection.selection_artifact,
  });

  assert.equal(selection.stage_id, "G1DQ_SELECTION");
  assert.equal(selection.selection_receipt.review_kind, "independent_validation");
  assert.equal(selection.selection_artifact.candidate_set_digest, selection.selection_receipt.candidate_set_digest);
  assert.deepEqual(orders, [
    {
      provider: "coupang-extractor",
      candidate_id: selection.selection_artifact.selected_candidates[0].candidate_id,
      direct_product_url: CANONICAL_URL,
      product_id: PRODUCT_ID,
      item_id: ITEM_ID,
      vendor_item_id: VENDOR_ITEM_ID,
      selection_receipt_id: selection.selection_receipt.selection_receipt_id,
      candidate_set_digest: selection.selection_artifact.candidate_set_digest,
    },
  ]);
  assert.equal(
    Object.hasOwn(orders[0], "search_criteria") ||
      Object.hasOwn(orders[0], "query"),
    false,
  );
});

test("G1DQ 사용자 선택도 exact candidate-set receipt를 요구한다", async () => {
  const selection = await validSelection({ mode: "user_selection" });
  assert.equal(selection.selection_receipt.review_kind, "user_selection");
  assert.equal(selection.selection_receipt.decided_by, "user");
  assert.equal(selection.selection_artifact.selected_candidates.length, 1);
});

test("G1DQ는 사용자 direct URL의 bypass receipt가 삭제된 discovery를 거부한다", () => {
  const discovery = discoverMarketCandidates({
    producer: {
      agent_id: "discovery-agent",
      agent_session_id: "discovery-session",
    },
    user_provided_urls: [
      {
        url: CANONICAL_URL,
        relevance_score: 80,
        relevance_reasons: [
          {
            dimension: "user_intent",
            observation: "사용자가 비교 대상으로 지정했다.",
            source_locator: "intake.competitor_url:0",
          },
        ],
        input_provenance: "intake.competitor_url:0",
      },
    ],
  });
  const tampered = structuredClone(discovery);
  tampered.user_provided_url_bypass_receipts = [];

  assert.throws(
    () =>
      verifyCandidateSelection({
        discovery: tampered,
        candidate_set_digest: tampered.candidate_set_digest,
        selected_candidate_ids: [tampered.candidates[0].candidate_id],
        review: {
          kind: "user_selection",
          decided_by: "user",
          approval_channel: "codex",
          nonce: "bypass-removed",
        },
      }),
    (error) => {
      assert.equal(error.code, "USER_URL_BYPASS_RECEIPT_REQUIRED");
      return true;
    },
  );
});

test("후보 집합을 digest 뒤에 바꾸거나 selection 없이 검색조건을 extractor에 넘길 수 없다", async () => {
  const selection = await validSelection();
  const tampered = structuredClone(selection.discovery);
  tampered.candidates[0].relevance_score = 1;

  assert.throws(
    () =>
      verifyCandidateSelection({
        discovery: tampered,
        candidate_set_digest: selection.discovery.candidate_set_digest,
        selected_candidate_ids: [tampered.candidates[0].candidate_id],
        review: {
          kind: "user_selection",
          decided_by: "user",
          approval_channel: "codex",
          nonce: "tampered-selection",
        },
      }),
    (error) => {
      assert.equal(error.code, "CANDIDATE_SET_DIGEST_MISMATCH");
      return true;
    },
  );

  assert.throws(
    () =>
      createCoupangExtractorWorkOrders({
        search_criteria: { query: "선풍기" },
      }),
    (error) => {
      assert.equal(error.code, "G1DQ_SELECTION_REQUIRED");
      return true;
    },
  );
});

test("G1A는 READY portable bundle 전 파일을 검증하고 미승인 research-only artifact로 가져온다", async () => {
  const bundleRoot = await createPortableBundle();
  try {
    const selection = await validSelection();
    const result = await importCoupangBundle({
      bundleRoot,
      selection: selection.selection_artifact,
      candidateId:
        selection.selection_artifact.selected_candidates[0].candidate_id,
    });

    assert.equal(result.stage_id, "G1A_MARKET_EVIDENCE");
    assert.equal(result.status, "completed");
    assert.equal(result.provider_status, "READY");
    assert.equal(result.approval_status, "not_approved");
    assert.equal(result.outputs[0].artifact_type, "market.competitor_evidence");
    assert.equal(result.outputs[0].production_use_allowed, false);
    assert.equal(result.outputs[0].rights, "research_reference_only");
    assert.equal(result.outputs[0].files.length, 4);
    assert.equal(
      result.outputs[0].files.every(
        (file) =>
          file.production_use_allowed === false &&
          file.rights === "research_reference_only",
      ),
      true,
    );
    assert.equal(result.importer_receipt.provider, "coupang-extractor");
    assert.equal(result.importer_receipt.file_mappings.length, 4);
    assert.deepEqual(
      result.importer_receipt.file_mappings.map((entry) => entry.source_path),
      [
        "capture.json",
        "evidence/validation.json",
        "page.json",
        "reviews/reviews.json",
      ],
    );
    assert.equal(
      result.importer_receipt.provider_warnings.some(
        (warning) => warning.code === "PROVIDER_STATUS_IS_NOT_APPROVAL",
      ),
      true,
    );
  } finally {
    await rm(bundleRoot, { recursive: true, force: true });
  }
});

test("G1A는 선택 URL에서 optional vendorItemId가 없으면 bundle에서 일관되게 확인된 값을 보존한다", async () => {
  const bundleRoot = await createPortableBundle();
  try {
    const selection = await validSelection({ includeVendor: false });
    const result = await importCoupangBundle({
      bundleRoot,
      selection: selection.selection_artifact,
      candidateId:
        selection.selection_artifact.selected_candidates[0].candidate_id,
    });

    assert.equal(
      selection.selection_artifact.selected_candidates[0].vendor_item_id,
      null,
    );
    assert.equal(result.outputs[0].vendor_item_id, VENDOR_ITEM_ID);
    assert.equal(
      result.outputs[0].canonical_url,
      `https://www.coupang.com/vp/products/${PRODUCT_ID}?itemId=${ITEM_ID}`,
    );
  } finally {
    await rm(bundleRoot, { recursive: true, force: true });
  }
});

test("G1A는 PARTIAL 상태와 provider warning을 없애지 않고 HOLD로 보존한다", async () => {
  const bundleRoot = await createPortableBundle({
    status: "PARTIAL",
    providerWarnings: [
      {
        code: "LATEST_REVIEW_SHORTAGE",
        severity: "warning",
        message: "최신 후기 표본이 100개보다 적습니다.",
      },
    ],
  });
  try {
    const selection = await validSelection();
    const result = await importCoupangBundle({
      bundleRoot,
      selection: selection.selection_artifact,
      candidateId:
        selection.selection_artifact.selected_candidates[0].candidate_id,
    });

    assert.equal(result.status, "hold");
    assert.equal(result.provider_status, "PARTIAL");
    assert.equal(result.approval_status, "not_approved");
    assert.deepEqual(
      result.importer_receipt.provider_warnings.map(
        (warning) => warning.code,
      ),
      [
        "LATEST_REVIEW_SHORTAGE",
        "PROVIDER_PARTIAL",
        "PROVIDER_STATUS_IS_NOT_APPROVAL",
      ],
    );
  } finally {
    await rm(bundleRoot, { recursive: true, force: true });
  }
});

test("G1A는 hash·size 변조와 manifest 밖 파일을 거부한다", async (t) => {
  const selection = await validSelection();
  const candidateId =
    selection.selection_artifact.selected_candidates[0].candidate_id;

  await t.test("SHA-256/size mismatch", async () => {
    const bundleRoot = await createPortableBundle({
      manifestTransform(manifest) {
        manifest.artifacts[0].bytes += 1;
        manifest.artifacts[0].sha256 = "0".repeat(64);
        return manifest;
      },
    });
    try {
      await assert.rejects(
        importCoupangBundle({
          bundleRoot,
          selection: selection.selection_artifact,
          candidateId,
        }),
        (error) => {
          assert.equal(error.code, "ARTIFACT_INTEGRITY_MISMATCH");
          return true;
        },
      );
    } finally {
      await rm(bundleRoot, { recursive: true, force: true });
    }
  });

  await t.test("untracked file", async () => {
    const bundleRoot = await createPortableBundle({
      extraUntrackedFile: true,
    });
    try {
      await assert.rejects(
        importCoupangBundle({
          bundleRoot,
          selection: selection.selection_artifact,
          candidateId,
        }),
        (error) => {
          assert.equal(error.code, "INCOMPLETE_FILE_MANIFEST");
          return true;
        },
      );
    } finally {
      await rm(bundleRoot, { recursive: true, force: true });
    }
  });
});

test("G1A는 경로 탈출과 상품 ID 불일치를 거부한다", async (t) => {
  const selection = await validSelection();
  const candidateId =
    selection.selection_artifact.selected_candidates[0].candidate_id;

  await t.test("path traversal", async () => {
    const bundleRoot = await createPortableBundle({
      manifestTransform(manifest) {
        manifest.artifacts[0].path = "../outside.json";
        return manifest;
      },
    });
    try {
      await assert.rejects(
        importCoupangBundle({
          bundleRoot,
          selection: selection.selection_artifact,
          candidateId,
        }),
        (error) => {
          assert.equal(error.code, "INVALID_ARTIFACT_PATH");
          return true;
        },
      );
    } finally {
      await rm(bundleRoot, { recursive: true, force: true });
    }
  });

  await t.test("product mismatch", async () => {
    const bundleRoot = await createPortableBundle({ productId: "999" });
    try {
      await assert.rejects(
        importCoupangBundle({
          bundleRoot,
          selection: selection.selection_artifact,
          candidateId,
        }),
        (error) => {
          assert.equal(error.code, "PRODUCT_ID_MISMATCH");
          return true;
        },
      );
    } finally {
      await rm(bundleRoot, { recursive: true, force: true });
    }
  });
});

test("G1A는 privacy redaction과 complete_all_reviews=false 계약을 강제한다", async (t) => {
  const selection = await validSelection();
  const candidateId =
    selection.selection_artifact.selected_candidates[0].candidate_id;

  await t.test("unredacted privacy", async () => {
    const bundleRoot = await createPortableBundle({
      reviewText: "연락처는 me@example.com 입니다.",
    });
    try {
      await assert.rejects(
        importCoupangBundle({
          bundleRoot,
          selection: selection.selection_artifact,
          candidateId,
        }),
        (error) => {
          assert.equal(error.code, "PRIVACY_REDACTION_REQUIRED");
          return true;
        },
      );
    } finally {
      await rm(bundleRoot, { recursive: true, force: true });
    }
  });

  await t.test("machine-generated hash와 ID field는 본문 PII scan에서 제외한다", async () => {
    const bundleRoot = await createPortableBundle({
      reviewFields: {
        content_key:
          "sha256:c7cadf5c6820968618f7bd8b4e2f0754083cd66850f4c3159e106653926cc4fb",
        dedupe_key:
          "sha256:1066539260000000000000000000000000000000000000000000000000000000",
        review_id: "review-01012345678",
        content_digest:
          "c7cadf5c6820968618f7bd8b4e2f0754083cd66850f4c3159e106653926cc4fb",
      },
    });
    try {
      const imported = await importCoupangBundle({
        bundleRoot,
        selection: selection.selection_artifact,
        candidateId,
      });
      assert.equal(imported.status, "completed");
    } finally {
      await rm(bundleRoot, { recursive: true, force: true });
    }
  });

  await t.test("human-authored title과 content는 계속 엄격히 검사한다", async () => {
    const bundleRoot = await createPortableBundle({
      reviewFields: {
        title: "문의 번호는 010-1234-5678",
        content: "본문은 정상처럼 보여도 제목 PII를 허용하면 안 됩니다.",
      },
    });
    try {
      await assert.rejects(
        importCoupangBundle({
          bundleRoot,
          selection: selection.selection_artifact,
          candidateId,
        }),
        (error) => {
          assert.equal(error.code, "PRIVACY_REDACTION_REQUIRED");
          assert.match(error.details.locator, /\.title$/);
          return true;
        },
      );
    } finally {
      await rm(bundleRoot, { recursive: true, force: true });
    }
  });

  await t.test("complete all reviews claim", async () => {
    const bundleRoot = await createPortableBundle({
      completeAllReviews: true,
    });
    try {
      await assert.rejects(
        importCoupangBundle({
          bundleRoot,
          selection: selection.selection_artifact,
          candidateId,
        }),
        (error) => {
          assert.equal(error.code, "REVIEW_SCOPE_INVALID");
          return true;
        },
      );
    } finally {
      await rm(bundleRoot, { recursive: true, force: true });
    }
  });
});
