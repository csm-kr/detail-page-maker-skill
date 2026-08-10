import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sameSet(left, right) {
  const a = [...new Set(left ?? [])].sort();
  const b = [...new Set(right ?? [])].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

const MODULE_CODE_SHA256 = sha256(
  readFileSync(fileURLToPath(import.meta.url)),
);
const G0_QA_POLICY_ID = "policy.qa.g0-normalization.v1";
const G0_QA_POLICY_SHA256 = sha256(G0_QA_POLICY_ID);

function reviewContainsPersonalData(review) {
  const personalKeys = new Set([
    "author",
    "author_email",
    "author_id",
    "author_name",
    "email",
    "nickname",
    "phone",
    "user_id",
  ]);
  if (
    Object.entries(review ?? {}).some(
      ([key, value]) => personalKeys.has(key) && value,
    )
  ) {
    return true;
  }
  const body = String(review?.body ?? "");
  return (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(body) ||
    /(?:01[016789])[-.\s]?\d{3,4}[-.\s]?\d{4}/.test(body)
  );
}

function numericSignature(value) {
  const matches = String(value ?? "").match(
    /-?\d+(?:[.,]\d+)?\s*(?:[a-zA-Z가-힣%℃°]+)?/g,
  );
  return matches?.map((item) => item.replace(/\s+/g, "").toLowerCase()).join("|") ??
    "";
}

function evidenceIdForFile(snapshot, sourcePath) {
  const index = (snapshot?.files ?? []).findIndex(
    (file) => file?.source_path === sourcePath,
  );
  if (index < 0) return null;
  return (
    snapshot.member_ids?.[index] ??
    `supplier-file-${snapshot.files[index].object_sha256.slice(0, 12)}`
  );
}

function sourceFor({
  snapshot,
  sourceUrl,
  sourcePath,
  locator,
}) {
  return {
    url: sourceUrl,
    path: sourcePath,
    locator,
    evidence_artifact_id: evidenceIdForFile(snapshot, sourcePath),
  };
}

export function normalizeG0SupplierEvidence({
  supplierSnapshot,
  manifest,
  page,
  reviews,
  actualProductPhotos = [],
  producerAgentSessionId,
  minimumVerifiedFactCount = 3,
}) {
  const productId = String(page?.product_id ?? supplierSnapshot?.product_id ?? "");
  const sourceUrl = page?.final_url ?? reviews?.source_page_url ?? null;
  const digest12 = sha256(
    `${supplierSnapshot?.manifest_sha256}:${productId}`,
  ).slice(0, 12);
  const supplierEvidenceFiles = (supplierSnapshot?.files ?? []).map(
    (file, index) => ({
      artifact_id:
        supplierSnapshot.member_ids?.[index] ??
        `supplier-file-${file.object_sha256.slice(0, 12)}`,
      source_path: file.source_path,
      kind: file.kind,
      object_sha256: file.object_sha256,
      rights: "evidence_reference",
      rights_observation: file.rights ?? null,
      production_use_allowed: false,
      source_kind: file.source_kind ?? null,
      classification: file.classification ?? "evidence_reference",
      same_sku_verified: file.same_sku_verified === true,
    }),
  );
  const supplierIdentityMedia = supplierEvidenceFiles.filter(
    (file) =>
      file.kind === "product_thumbnail" &&
      file.source_kind === "supplier_same_sku" &&
      file.same_sku_verified === true &&
      ["identity_reference", "production_licensed"].includes(
        file.classification,
      ),
  );
  const manifestDigest = sha256(stableJson(manifest ?? {}));
  const inputMembers = [
    {
      artifact_id: supplierSnapshot?.artifact_id,
      digest: supplierSnapshot?.manifest_sha256,
      role: "supplier_snapshot",
    },
    {
      artifact_id: `supplier-manifest-${manifestDigest.slice(0, 12)}`,
      digest: manifestDigest,
      role: "supplier_manifest",
    },
    {
      artifact_id: evidenceIdForFile(supplierSnapshot, "page.json"),
      digest: sha256(stableJson(page ?? {})),
      role: "structured_product_page",
    },
    {
      artifact_id: evidenceIdForFile(
        supplierSnapshot,
        "reviews/reviews.json",
      ),
      digest: sha256(stableJson(reviews ?? {})),
      role: "sanitized_public_reviews",
    },
    ...actualProductPhotos.map((photo) => ({
      artifact_id: photo.artifact_id,
      digest: photo.object_sha256,
      role: "actual_product_photo",
    })),
  ].sort((left, right) =>
    String(left.artifact_id).localeCompare(String(right.artifact_id)),
  );
  const inputSet = {
    artifact_ids: inputMembers.map((member) => member.artifact_id),
    members: inputMembers,
    digest: sha256(stableJson(inputMembers)),
  };
  const identityPhotoSet = {
    artifact_id: `identity-photo-set-${digest12}`,
    artifact_type: "identity.photo_set",
    status:
      actualProductPhotos.length > 0
        ? "supplied"
        : supplierIdentityMedia.length > 0
          ? "supplier_same_sku_fallback"
          : "not_supplied",
    member_ids:
      actualProductPhotos.length > 0
        ? actualProductPhotos.map((photo) => photo.artifact_id)
        : supplierIdentityMedia.map((file) => file.artifact_id),
    source_kind:
      actualProductPhotos.length > 0
        ? "actual_product_photo"
        : supplierIdentityMedia.length > 0
          ? "supplier_same_sku"
          : null,
    production_use_allowed: false,
    consumers: ["G0_QA", "G2_IMAGE"],
  };
  const identityPhotoSetReceipt = {
    receipt_id: `receipt-${identityPhotoSet.artifact_id}`,
    receipt_type: "identity.photo_set.receipt",
    artifact_id: identityPhotoSet.artifact_id,
    decision: identityPhotoSet.status,
    producer_agent_session_id: producerAgentSessionId,
    input_set: inputSet,
  };
  const productNameFact = {
    fact_id: `FACT-PRODUCT-NAME-${digest12}`,
    fact_type: "PRODUCT_FACT",
    field: "product_name",
    value: page?.product_name ?? null,
    status: "verified",
    source: sourceFor({
      snapshot: supplierSnapshot,
      sourceUrl,
      sourcePath: "page.json",
      locator: "page.json#/product_name",
    }),
  };
  const hardFailures = [];
  const canonicalSupplierUrls = [
    [
      "supplierSnapshot.canonical_supplier_url",
      supplierSnapshot?.canonical_supplier_url,
    ],
    ["manifest.canonical_supplier_url", manifest?.canonical_supplier_url],
    ["manifest.final_url", manifest?.final_url],
    ["page.final_url", page?.final_url],
    ["reviews.source_page_url", reviews?.source_page_url],
  ];
  if (
    canonicalSupplierUrls.some(
      ([, value]) => typeof value !== "string" || value.trim() === "",
    )
  ) {
    hardFailures.push({
      code: "CANONICAL_SUPPLIER_URL_REQUIRED",
      path: "canonical_supplier_url",
      sources: canonicalSupplierUrls.map(([sourcePath, value]) => ({
        path: sourcePath,
        value: value ?? null,
      })),
    });
  } else {
    const supplierProductUrls = canonicalSupplierUrls.map(
      ([sourcePath, value]) => {
        try {
          const parsed = new URL(value);
          const productIdFromUrl = parsed.pathname
            .split("/")
            .filter(Boolean)
            .findLast((segment) => /^\d+$/.test(segment));
          return {
            path: sourcePath,
            product_id: productIdFromUrl ?? null,
            canonical_url: productIdFromUrl
              ? `https://domeggook.com/${productIdFromUrl}`
              : null,
          };
        } catch {
          return {
            path: sourcePath,
            product_id: null,
            canonical_url: null,
          };
        }
      },
    );
    if (
      supplierProductUrls.some(
        (entry) =>
          entry.product_id !== productId ||
          entry.canonical_url !==
            supplierProductUrls[0].canonical_url,
      )
    ) {
      hardFailures.push({
        code: "CANONICAL_SUPPLIER_URL_MISMATCH",
        path: "canonical_supplier_url",
        sources: supplierProductUrls,
      });
    }
  }
  if (
    actualProductPhotos.length === 0 &&
    supplierIdentityMedia.length === 0
  ) {
    hardFailures.push({
      code: "SAME_SKU_IDENTITY_MEDIA_REQUIRED",
      path: "supplierSnapshot.files",
    });
  }
  const productIds = [
    ["supplierSnapshot.product_id", supplierSnapshot?.product_id],
    ["manifest.product_id", manifest?.product_id],
    ["page.product_id", page?.product_id],
    ["reviews.product_id", reviews?.product_id],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (new Set(productIds.map(([, value]) => String(value))).size > 1) {
    hardFailures.push({
      code: "PRODUCT_ID_CONFLICT",
      path: "product_id",
      sources: productIds.map(([path, value]) => ({
        path,
        product_id: String(value),
      })),
    });
  }
  const eligiblePageFacts = [];
  for (const fact of page?.facts ?? []) {
    if (
      String(fact?.source_path ?? "").replaceAll("\\", "/") ===
      "reviews/reviews.json"
    ) {
      hardFailures.push({
        code: "REVIEW_PROMOTED_TO_PRODUCT_FACT",
        path: "page.facts",
        fact_id: fact?.fact_id ?? null,
      });
      continue;
    }
    eligiblePageFacts.push(fact);
  }
  const pageFacts = eligiblePageFacts.map((fact) => ({
    fact_id: fact.fact_id,
    fact_type: fact.fact_type ?? "PRODUCT_FACT",
    field: fact.field ?? null,
    option_id: fact.option_id ?? null,
    value: fact.value,
    status: "verified",
    source: sourceFor({
      snapshot: supplierSnapshot,
      sourceUrl,
      sourcePath: fact.source_path,
      locator: fact.source_locator ?? fact.locator ?? null,
    }),
  }));
  const facts = [productNameFact, ...pageFacts];
  facts.forEach((fact, index) => {
    if (!fact.source.locator) {
      hardFailures.push({
        code: "FACT_LOCATOR_MISSING",
        path: `product_ssot.facts[${index}].source.locator`,
        fact_id: fact.fact_id,
      });
    }
    if (!fact.source.evidence_artifact_id) {
      hardFailures.push({
        code: "FACT_EVIDENCE_NOT_FOUND",
        path: `product_ssot.facts[${index}].source.evidence_artifact_id`,
        fact_id: fact.fact_id,
        source_path: fact.source.path,
      });
    }
  });
  const numericFactGroups = new Map();
  for (const fact of facts) {
    const signature = numericSignature(fact.value);
    if (!signature || !fact.field) continue;
    const key = `${fact.field}::${fact.option_id ?? "base"}`;
    const group = numericFactGroups.get(key) ?? [];
    group.push({ fact_id: fact.fact_id, signature });
    numericFactGroups.set(key, group);
  }
  for (const [key, group] of numericFactGroups) {
    if (new Set(group.map((item) => item.signature)).size > 1) {
      hardFailures.push({
        code: "NUMERIC_CONFLICT",
        path: "page.facts",
        field_key: key,
        fact_ids: group.map((item) => item.fact_id),
      });
    }
  }
  const optionGroups = new Map();
  for (const option of page?.options ?? []) {
    const key = option?.option_id ?? option?.name ?? option?.label;
    if (!key) continue;
    const comparable = JSON.stringify({
      label: option.label ?? null,
      name: option.name ?? null,
      value: option.value ?? null,
      price: option.price ?? null,
      quantity: option.quantity ?? null,
      dimensions: option.dimensions ?? null,
    });
    const group = optionGroups.get(key) ?? [];
    group.push({ comparable, locator: option.source_locator ?? null });
    optionGroups.set(key, group);
  }
  for (const [optionId, group] of optionGroups) {
    if (new Set(group.map((item) => item.comparable)).size > 1) {
      hardFailures.push({
        code: "OPTION_CONFLICT",
        path: "page.options",
        option_id: optionId,
        source_locators: group.map((item) => item.locator),
      });
    }
  }
  const reviewEvidenceArtifactId = evidenceIdForFile(
    supplierSnapshot,
    "reviews/reviews.json",
  );
  if (reviews?.author_identifiers_removed !== true) {
    hardFailures.push({
      code: "PRIVACY_SANITIZATION_NOT_PROVEN",
      path: "reviews.author_identifiers_removed",
    });
  }
  const reviewsWithPrivacy = (reviews?.reviews ?? []).map(
    (review, index) => ({
      review,
      index,
      contains_personal_data: reviewContainsPersonalData(review),
    }),
  );
  for (const item of reviewsWithPrivacy) {
    if (item.contains_personal_data) {
      hardFailures.push({
        code: "PERSONAL_DATA_PRESENT",
        path: `reviews.reviews[${item.index}]`,
      });
    }
  }
  const supplierReviewObservations = reviewsWithPrivacy.map(
    ({ review, index, contains_personal_data: containsPersonalData }) => ({
      observation_id: review.evidence_id ?? `supplier-review-${index + 1}`,
      source_type: "SUPPLIER_REVIEW_OBSERVATION",
      value: containsPersonalData ? null : (review.body ?? null),
      rating: review.rating ?? null,
      source: {
        url: reviews?.source_page_url ?? sourceUrl,
        path: "reviews/reviews.json",
        locator: `reviews/reviews.json#/reviews/${index}`,
        evidence_artifact_id: reviewEvidenceArtifactId,
      },
      may_be_product_fact: false,
      may_be_manufacturer_fact: false,
      publishable: false,
      redacted_due_to_privacy: containsPersonalData,
    }),
  );
  const verifiedFactCount = facts.filter(
    (fact) =>
      fact.fact_type === "PRODUCT_FACT" &&
      fact.status === "verified" &&
      fact.value,
  ).length;
  const status =
    verifiedFactCount >= minimumVerifiedFactCount &&
    hardFailures.length === 0
      ? actualProductPhotos.length > 0
        ? "publish_ready"
        : "generation_ready"
      : "draft";

  return {
    schema_version: "1.0",
    stage_id: "G0_NORMALIZE",
    producer_agent_session_id: producerAgentSessionId,
    input_set: inputSet,
    hard_failures: hardFailures,
    warnings: [
      {
        code: "RIGHTS_NOT_PROVEN",
        severity: "warning",
        source_locator: "page.json#/image_usage_observation",
        observation: page?.image_usage_observation ?? null,
      },
    ],
    supplier_evidence_files: supplierEvidenceFiles,
    identity_photo_set: identityPhotoSet,
    identity_photo_set_receipt: identityPhotoSetReceipt,
    product_ssot: {
      artifact_id: `product-ssot-${digest12}`,
      artifact_type: "product.ssot",
      product_id: productId,
      product_name: page?.product_name ?? null,
      source_url: sourceUrl,
      status,
      readiness: {
        actual_product_photo_supplied: actualProductPhotos.length > 0,
        supplier_same_sku_identity_media_available:
          supplierIdentityMedia.length > 0,
        g1_g2_progress_allowed:
          status === "publish_ready" ||
          status === "generation_ready",
        verified_product_fact_count: verifiedFactCount,
        minimum_verified_fact_count: minimumVerifiedFactCount,
      },
      facts,
      identity_references: [
        ...supplierIdentityMedia.map((file) => file.artifact_id),
        ...actualProductPhotos.map((photo) => photo.artifact_id),
      ],
      supplier_review_observations: supplierReviewObservations,
      claim_policy: {
        allowed_fact_types: ["PRODUCT_FACT", "MANUFACTURER_CLAIM"],
        supplier_reviews_are_product_facts: false,
        supplier_reviews_are_manufacturer_facts: false,
        supplier_reviews_publishable: false,
      },
    },
  };
}

export function buildG0QaReceipt({
  normalization,
  expectedInputArtifactIds,
  expectedInputSetDigest,
  producerAgentSessionId,
  validatorAgentSessionId,
  startedAt,
  finishedAt,
}) {
  const hardFailures = structuredClone(
    normalization?.hard_failures ?? [],
  );
  const actualArtifactIds = normalization?.input_set?.artifact_ids ?? [];
  const actualDigest = normalization?.input_set?.digest ?? null;
  const inputSetPass =
    actualDigest === expectedInputSetDigest &&
    sameSet(actualArtifactIds, expectedInputArtifactIds);
  if (actualDigest !== expectedInputSetDigest) {
    hardFailures.push({
      code: "INPUT_SET_DIGEST_MISMATCH",
      path: "subject.artifact_set_digest",
    });
  }
  if (!sameSet(actualArtifactIds, expectedInputArtifactIds)) {
    hardFailures.push({
      code: "INPUT_ARTIFACT_SET_MISMATCH",
      path: "subject.artifact_ids",
    });
  }
  const producerSessionPass =
    producerAgentSessionId ===
      normalization?.producer_agent_session_id &&
    Boolean(producerAgentSessionId);
  if (!producerSessionPass) {
    hardFailures.push({
      code: "PRODUCER_SESSION_MISMATCH",
      path: "producer.agent_session_ids",
    });
  }
  const validatorSessionPass =
    Boolean(validatorAgentSessionId) &&
    validatorAgentSessionId !== producerAgentSessionId;
  if (!validatorSessionPass) {
    hardFailures.push({
      code: "PRODUCER_VALIDATOR_NOT_SEPARATED",
      path: "validator.agent_session_id",
    });
  }
  const normalizationPass =
    (normalization?.hard_failures ?? []).length === 0;
  const verdict = hardFailures.length === 0 ? "PASS" : "BLOCKED";
  const digest12 = sha256(
    `${actualDigest}:${validatorAgentSessionId}`,
  ).slice(0, 12);

  return {
    schema_version: "1.0",
    validation_id: `validation-g0-${digest12}`,
    stage_id: "G0_QA",
    subject: {
      artifact_set_digest: actualDigest,
      artifact_ids: [...actualArtifactIds],
      artifact_ids_digest: sha256(stableJson([...actualArtifactIds].sort())),
    },
    validator: {
      name: "g0-normalization-qa",
      version: "1.0.0",
      code_sha256: MODULE_CODE_SHA256,
      agent_id: "g0-normalization-qa-agent",
      agent_session_id: validatorAgentSessionId,
    },
    producer: {
      agent_session_ids: producerAgentSessionId
        ? [producerAgentSessionId]
        : [],
    },
    policy: {
      policy_id: G0_QA_POLICY_ID,
      policy_sha256: G0_QA_POLICY_SHA256,
    },
    validator_kind: "deterministic",
    checks: [
      {
        check_id: "g0.exact_input_set",
        status: inputSetPass ? "PASS" : "FAIL",
        severity: "hard",
        evidence_artifact_ids: [...actualArtifactIds],
      },
      {
        check_id: "g0.producer_validator_separation",
        status:
          producerSessionPass && validatorSessionPass ? "PASS" : "FAIL",
        severity: "hard",
        evidence_artifact_ids: [
          normalization?.product_ssot?.artifact_id,
        ].filter(Boolean),
      },
      {
        check_id: "g0.normalization_hard_failures",
        status: normalizationPass ? "PASS" : "FAIL",
        severity: "hard",
        evidence_artifact_ids: [
          normalization?.product_ssot?.artifact_id,
          normalization?.identity_photo_set?.artifact_id,
        ].filter(Boolean),
      },
    ],
    score: verdict === "PASS" ? 100 : 0,
    hard_failures: hardFailures,
    verdict,
    started_at: startedAt,
    finished_at: finishedAt,
  };
}
