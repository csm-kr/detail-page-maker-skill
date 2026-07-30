import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COUPANG_HOSTS = new Set(["coupang.com", "www.coupang.com"]);
const SUPPORTED_BUNDLE_SCHEMA_VERSIONS = new Set(["1.0"]);
const PROVIDER_STATUSES = new Set(["READY", "PARTIAL"]);
const REQUIRED_BUNDLE_FILES = new Set([
  "capture.json",
  "evidence/validation.json",
  "page.json",
  "reviews/reviews.json",
]);
const FORBIDDEN_REVIEW_KEYS = new Set([
  "account_id",
  "account_url",
  "author",
  "author_id",
  "author_name",
  "cookie",
  "cookies",
  "html",
  "nickname",
  "order_id",
  "order_number",
  "profile",
  "profile_image",
  "profile_url",
  "raw_html",
  "reviewer",
  "reviewer_id",
  "reviewer_name",
  "session",
  "token",
  "user_id",
]);
const MACHINE_GENERATED_REVIEW_KEYS = new Set([
  "content_key",
  "dedupe_key",
]);
const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN =
  /(?<!\d)(?:\+?82[-.\s]?)?(?:0?1[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/;
const ORDER_PATTERN =
  /(?:주문\s*(?:번호|ID)|order\s*(?:number|no\.?|id))\s*[:#-]?\s*[A-Z0-9-]{5,}/i;

export class MarketEvidenceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MarketEvidenceError";
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return structuredClone(value);
}

function requireNonEmptyString(value, code, message, details = {}) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MarketEvidenceError(code, message, details);
  }
  return value.trim();
}

function parseNumericQuery(searchParams, name, required) {
  const values = searchParams.getAll(name).filter(Boolean);
  const unique = [...new Set(values)];
  if (
    (required && unique.length !== 1) ||
    (!required && unique.length > 1) ||
    (unique.length === 1 && !/^\d+$/.test(unique[0]))
  ) {
    throw new MarketEvidenceError(
      "INVALID_DIRECT_PRODUCT_URL",
      `${name}는 ${required ? "필수 " : ""}숫자 하나여야 합니다.`,
      { field: name },
    );
  }
  return unique[0] ?? null;
}

export function canonicalizeCoupangProductUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl ?? "").trim());
  } catch {
    throw new MarketEvidenceError(
      "INVALID_DIRECT_PRODUCT_URL",
      "쿠팡 직접 상품 URL을 해석할 수 없습니다.",
    );
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const productMatch = /^\/vp\/products\/(\d+)\/?$/.exec(parsed.pathname);
  if (
    parsed.protocol !== "https:" ||
    !COUPANG_HOSTS.has(host) ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    !productMatch
  ) {
    throw new MarketEvidenceError(
      "INVALID_DIRECT_PRODUCT_URL",
      "https 쿠팡 /vp/products/<productId> 직접 상품 URL만 허용합니다.",
    );
  }

  const productId = productMatch[1];
  const itemId = parseNumericQuery(parsed.searchParams, "itemId", true);
  const vendorItemId = parseNumericQuery(
    parsed.searchParams,
    "vendorItemId",
    false,
  );
  const canonical = new URL(
    `https://www.coupang.com/vp/products/${productId}`,
  );
  canonical.searchParams.set("itemId", itemId);
  if (vendorItemId) {
    canonical.searchParams.set("vendorItemId", vendorItemId);
  }

  return Object.freeze({
    canonical_url: canonical.toString(),
    product_id: productId,
    item_id: itemId,
    vendor_item_id: vendorItemId,
  });
}

function normalizeRelevanceReasons(reasons, candidateIndex) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    throw new MarketEvidenceError(
      "RELEVANCE_EVIDENCE_REQUIRED",
      "각 경쟁 후보에는 관련성 근거가 하나 이상 필요합니다.",
      { candidate_index: candidateIndex },
    );
  }
  return reasons.map((reason, reasonIndex) => ({
    dimension: requireNonEmptyString(
      reason?.dimension,
      "RELEVANCE_EVIDENCE_REQUIRED",
      "관련성 근거에는 dimension이 필요합니다.",
      { candidate_index: candidateIndex, reason_index: reasonIndex },
    ),
    observation: requireNonEmptyString(
      reason?.observation,
      "RELEVANCE_EVIDENCE_REQUIRED",
      "관련성 근거에는 observation이 필요합니다.",
      { candidate_index: candidateIndex, reason_index: reasonIndex },
    ),
    source_locator: requireNonEmptyString(
      reason?.source_locator,
      "RELEVANCE_EVIDENCE_REQUIRED",
      "관련성 근거에는 source_locator가 필요합니다.",
      { candidate_index: candidateIndex, reason_index: reasonIndex },
    ),
  }));
}

function normalizeCandidate(candidate, index, sourceKind) {
  const identity = canonicalizeCoupangProductUrl(candidate?.url);
  const relevanceScore = candidate?.relevance_score;
  if (
    typeof relevanceScore !== "number" ||
    !Number.isFinite(relevanceScore) ||
    relevanceScore < 0 ||
    relevanceScore > 100
  ) {
    throw new MarketEvidenceError(
      "INVALID_RELEVANCE_SCORE",
      "관련성 점수는 0~100의 유한한 숫자여야 합니다.",
      { candidate_index: index },
    );
  }
  const relevanceReasons = normalizeRelevanceReasons(
    candidate.relevance_reasons,
    index,
  );
  const candidateId = `coupang-${sha256(identity.canonical_url).slice(0, 16)}`;

  return {
    candidate_id: candidateId,
    ...identity,
    source_kind: sourceKind,
    relevance_score: relevanceScore,
    relevance_reasons: relevanceReasons,
  };
}

function candidateSetPayload(candidates) {
  return [...candidates]
    .map((candidate) => ({
      candidate_id: candidate.candidate_id,
      canonical_url: candidate.canonical_url,
      product_id: candidate.product_id,
      item_id: candidate.item_id,
      vendor_item_id: candidate.vendor_item_id ?? null,
      source_kind: candidate.source_kind,
      relevance_score: candidate.relevance_score,
      relevance_reasons: candidate.relevance_reasons,
    }))
    .sort((left, right) =>
      left.candidate_id.localeCompare(right.candidate_id),
    );
}

function candidateSetDigest(candidates) {
  return sha256(canonicalJson(candidateSetPayload(candidates)));
}

export function discoverMarketCandidates({
  search_criteria: searchCriteria,
  producer,
  observed_candidates: observedCandidates,
  user_provided_urls: userProvidedUrls,
} = {}) {
  const producerAgentId = requireNonEmptyString(
    producer?.agent_id,
    "DISCOVERY_PRODUCER_REQUIRED",
    "G1D producer agent_id가 필요합니다.",
  );
  const producerSessionId = requireNonEmptyString(
    producer?.agent_session_id,
    "DISCOVERY_PRODUCER_REQUIRED",
    "G1D producer agent_session_id가 필요합니다.",
  );
  const hasObserved =
    Array.isArray(observedCandidates) && observedCandidates.length > 0;
  const hasUserUrls =
    Array.isArray(userProvidedUrls) && userProvidedUrls.length > 0;
  if (hasObserved === hasUserUrls) {
    throw new MarketEvidenceError(
      "DISCOVERY_INPUT_REQUIRED",
      "검색 관측 후보 또는 사용자 제공 URL 중 정확히 하나가 필요합니다.",
    );
  }
  if (
    hasObserved &&
    (!searchCriteria ||
      typeof searchCriteria !== "object" ||
      Object.keys(searchCriteria).length === 0)
  ) {
    throw new MarketEvidenceError(
      "SEARCH_CRITERIA_REQUIRED",
      "검색으로 찾은 후보에는 검색 조건이 필요합니다.",
    );
  }

  const sourceKind = hasUserUrls
    ? "user_provided_url"
    : "search_observation";
  const sourceCandidates = hasUserUrls
    ? userProvidedUrls
    : observedCandidates;
  const candidates = sourceCandidates.map((candidate, index) =>
    normalizeCandidate(candidate, index, sourceKind),
  );
  const sourceByCandidateId = new Map(
    candidates.map((candidate, index) => [
      candidate.candidate_id,
      sourceCandidates[index],
    ]),
  );
  const candidateIds = new Set();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.candidate_id)) {
      throw new MarketEvidenceError(
        "DUPLICATE_MARKET_CANDIDATE",
        "같은 canonical URL 후보를 중복 등록할 수 없습니다.",
        { candidate_id: candidate.candidate_id },
      );
    }
    candidateIds.add(candidate.candidate_id);
  }
  candidates.sort((left, right) =>
    left.candidate_id.localeCompare(right.candidate_id),
  );

  const digest = candidateSetDigest(candidates);
  const discoveryId = `market-discovery-${digest.slice(0, 16)}`;
  const bypassReceipts = hasUserUrls
    ? candidates.map((candidate) => ({
        receipt_type: "user_provided_url_bypass",
        bypass_receipt_id: `market-bypass-${sha256(
          canonicalJson({
            candidate_id: candidate.candidate_id,
            input_provenance:
              sourceByCandidateId.get(candidate.candidate_id)
                ?.input_provenance ?? null,
          }),
        ).slice(0, 16)}`,
        candidate_id: candidate.candidate_id,
        requested_url: sourceByCandidateId.get(candidate.candidate_id).url,
        canonical_url: candidate.canonical_url,
        product_id: candidate.product_id,
        item_id: candidate.item_id,
        vendor_item_id: candidate.vendor_item_id,
        input_provenance: requireNonEmptyString(
          sourceByCandidateId.get(candidate.candidate_id)
            ?.input_provenance,
          "INPUT_PROVENANCE_REQUIRED",
          "사용자 제공 URL bypass에는 입력 provenance가 필요합니다.",
          { candidate_id: candidate.candidate_id },
        ),
        candidate_set_digest: digest,
      }))
    : [];

  return Object.freeze({
    schema_version: "2.0-draft",
    stage_id: "G1D_DISCOVERY",
    discovery_id: discoveryId,
    discovery_mode: hasUserUrls
      ? "user_provided_url_bypass"
      : "search_observation",
    producer: {
      agent_id: producerAgentId,
      agent_session_id: producerSessionId,
    },
    search_criteria: hasObserved ? clone(searchCriteria) : null,
    candidates,
    candidate_set_digest: digest,
    user_provided_url_bypass_receipts: bypassReceipts,
  });
}

function assertDiscoveryDigest(discovery, suppliedDigest) {
  if (
    !discovery ||
    discovery.stage_id !== "G1D_DISCOVERY" ||
    !Array.isArray(discovery.candidates) ||
    discovery.candidates.length === 0
  ) {
    throw new MarketEvidenceError(
      "G1D_DISCOVERY_REQUIRED",
      "G1DQ에는 G1D 후보 artifact가 필요합니다.",
    );
  }
  const actualDigest = candidateSetDigest(discovery.candidates);
  if (
    discovery.candidate_set_digest !== actualDigest ||
    suppliedDigest !== actualDigest
  ) {
    throw new MarketEvidenceError(
      "CANDIDATE_SET_DIGEST_MISMATCH",
      "G1DQ가 받은 후보 집합이 G1D exact candidate-set과 다릅니다.",
      {
        expected_candidate_set_digest: discovery.candidate_set_digest,
        supplied_candidate_set_digest: suppliedDigest,
        actual_candidate_set_digest: actualDigest,
      },
    );
  }
  const userCandidates = discovery.candidates.filter(
    (candidate) => candidate.source_kind === "user_provided_url",
  );
  if (userCandidates.length > 0) {
    const receipts = discovery.user_provided_url_bypass_receipts;
    const receiptByCandidateId = new Map(
      Array.isArray(receipts)
        ? receipts.map((receipt) => [receipt?.candidate_id, receipt])
        : [],
    );
    for (const candidate of userCandidates) {
      const receipt = receiptByCandidateId.get(
        candidate.candidate_id,
      );
      if (
        !receipt ||
        receipt.receipt_type !== "user_provided_url_bypass" ||
        receipt.candidate_set_digest !== actualDigest ||
        receipt.canonical_url !== candidate.canonical_url ||
        receipt.product_id !== candidate.product_id ||
        receipt.item_id !== candidate.item_id ||
        (receipt.vendor_item_id ?? null) !==
          (candidate.vendor_item_id ?? null) ||
        typeof receipt.input_provenance !== "string" ||
        receipt.input_provenance.length === 0
      ) {
        throw new MarketEvidenceError(
          "USER_URL_BYPASS_RECEIPT_REQUIRED",
          "사용자 direct URL마다 exact candidate-set에 고정된 bypass receipt가 필요합니다.",
          { candidate_id: candidate.candidate_id },
        );
      }
    }
  }
  return actualDigest;
}

function assertIndependentReview(review, discovery, selectedIds) {
  const validatorAgentId = requireNonEmptyString(
    review?.validator?.agent_id,
    "INDEPENDENT_MARKET_QA_REQUIRED",
    "독립 관련성 검수자 agent_id가 필요합니다.",
  );
  const validatorSessionId = requireNonEmptyString(
    review?.validator?.agent_session_id,
    "INDEPENDENT_MARKET_QA_REQUIRED",
    "독립 관련성 검수자 session이 필요합니다.",
  );
  if (
    validatorSessionId === discovery.producer?.agent_session_id
  ) {
    throw new MarketEvidenceError(
      "INDEPENDENT_MARKET_QA_REQUIRED",
      "경쟁상품 발견 생산자와 관련성 검수자는 다른 session이어야 합니다.",
    );
  }
  if (
    !Array.isArray(review.checks) ||
    review.checks.length === 0 ||
    review.checks.some(
      (check) =>
        !check?.check_id ||
        check.status !== "PASS" ||
        !Array.isArray(check.evidence_candidate_ids),
    )
  ) {
    throw new MarketEvidenceError(
      "MARKET_RELEVANCE_VALIDATION_FAILED",
      "독립 관련성 검수의 모든 check가 근거와 함께 PASS여야 합니다.",
    );
  }
  const evidencedIds = new Set(
    review.checks.flatMap((check) => check.evidence_candidate_ids),
  );
  if (selectedIds.some((candidateId) => !evidencedIds.has(candidateId))) {
    throw new MarketEvidenceError(
      "MARKET_RELEVANCE_VALIDATION_FAILED",
      "선택된 모든 후보가 독립 관련성 검수 근거에 포함돼야 합니다.",
    );
  }
  return {
    validator: {
      agent_id: validatorAgentId,
      agent_session_id: validatorSessionId,
    },
    checks: clone(review.checks),
  };
}

function assertUserSelection(review) {
  return {
    decided_by: requireNonEmptyString(
      review?.decided_by,
      "USER_MARKET_SELECTION_REQUIRED",
      "사용자 선택의 decided_by가 필요합니다.",
    ),
    approval_channel: requireNonEmptyString(
      review?.approval_channel,
      "USER_MARKET_SELECTION_REQUIRED",
      "사용자 선택의 approval_channel이 필요합니다.",
    ),
    nonce: requireNonEmptyString(
      review?.nonce,
      "USER_MARKET_SELECTION_REQUIRED",
      "사용자 선택의 nonce가 필요합니다.",
    ),
  };
}

export function verifyCandidateSelection({
  discovery,
  candidate_set_digest: suppliedDigest,
  selected_candidate_ids: selectedCandidateIds,
  review,
} = {}) {
  const digest = assertDiscoveryDigest(discovery, suppliedDigest);
  if (
    !Array.isArray(selectedCandidateIds) ||
    selectedCandidateIds.length === 0 ||
    new Set(selectedCandidateIds).size !== selectedCandidateIds.length
  ) {
    throw new MarketEvidenceError(
      "MARKET_SELECTION_REQUIRED",
      "G1DQ에서 중복 없는 후보를 하나 이상 선택해야 합니다.",
    );
  }
  const candidatesById = new Map(
    discovery.candidates.map((candidate) => [
      candidate.candidate_id,
      candidate,
    ]),
  );
  const selectedCandidates = selectedCandidateIds.map((candidateId) => {
    const candidate = candidatesById.get(candidateId);
    if (!candidate) {
      throw new MarketEvidenceError(
        "UNKNOWN_MARKET_CANDIDATE",
        "선택한 후보가 exact candidate-set에 없습니다.",
        { candidate_id: candidateId },
      );
    }
    return clone(candidate);
  });

  let reviewEvidence;
  if (review?.kind === "independent_validation") {
    reviewEvidence = assertIndependentReview(
      review,
      discovery,
      selectedCandidateIds,
    );
  } else if (review?.kind === "user_selection") {
    reviewEvidence = assertUserSelection(review);
  } else {
    throw new MarketEvidenceError(
      "G1DQ_REVIEW_REQUIRED",
      "독립 관련성 검수 또는 사용자 선택이 필요합니다.",
    );
  }

  const receiptId = `market-selection-${sha256(
    canonicalJson({
      candidate_set_digest: digest,
      selected_candidate_ids: selectedCandidateIds,
      review_kind: review.kind,
      review_evidence: reviewEvidence,
    }),
  ).slice(0, 16)}`;
  const selectionReceipt = {
    schema_version: "2.0-draft",
    selection_receipt_id: receiptId,
    discovery_id: discovery.discovery_id,
    candidate_set_digest: digest,
    selected_candidate_ids: [...selectedCandidateIds],
    review_kind: review.kind,
    ...reviewEvidence,
  };
  const selectionArtifact = {
    schema_version: "2.0-draft",
    artifact_type: "market.competitor_selection",
    artifact_id: `art-${receiptId}`,
    discovery_id: discovery.discovery_id,
    candidate_set_digest: digest,
    selection_receipt_id: receiptId,
    selected_candidates: selectedCandidates,
    consumers: ["G1A_MARKET_EVIDENCE"],
  };

  return Object.freeze({
    schema_version: "2.0-draft",
    stage_id: "G1DQ_SELECTION",
    status: "completed",
    discovery: clone(discovery),
    selection_artifact: selectionArtifact,
    selection_receipt: selectionReceipt,
  });
}

export function createCoupangExtractorWorkOrders({
  selection,
  search_criteria: searchCriteria,
  query,
} = {}) {
  if (
    !selection ||
    selection.artifact_type !== "market.competitor_selection" ||
    !selection.selection_receipt_id ||
    !/^[a-f0-9]{64}$/.test(
      String(selection.candidate_set_digest ?? ""),
    ) ||
    !Array.isArray(selection.selected_candidates) ||
    selection.selected_candidates.length === 0
  ) {
    throw new MarketEvidenceError(
      "G1DQ_SELECTION_REQUIRED",
      "G1DQ가 확정한 selection 없이는 coupang-extractor를 실행할 수 없습니다.",
    );
  }
  if (searchCriteria !== undefined || query !== undefined) {
    throw new MarketEvidenceError(
      "UNSELECTED_SEARCH_INPUT",
      "coupang-extractor에는 검색 조건을 전달할 수 없습니다.",
    );
  }

  return selection.selected_candidates.map((candidate) => {
    const identity = canonicalizeCoupangProductUrl(
      candidate.canonical_url,
    );
    if (
      identity.product_id !== candidate.product_id ||
      identity.item_id !== candidate.item_id ||
      identity.vendor_item_id !==
        (candidate.vendor_item_id ?? null)
    ) {
      throw new MarketEvidenceError(
        "SELECTION_IDENTITY_MISMATCH",
        "선택 후보의 canonical URL과 상품 ID가 다릅니다.",
        { candidate_id: candidate.candidate_id },
      );
    }
    return {
      provider: "coupang-extractor",
      candidate_id: candidate.candidate_id,
      direct_product_url: identity.canonical_url,
      product_id: identity.product_id,
      item_id: identity.item_id,
      vendor_item_id: identity.vendor_item_id,
      selection_receipt_id: selection.selection_receipt_id,
      candidate_set_digest: selection.candidate_set_digest,
    };
  });
}

async function readJson(filePath, code) {
  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    throw new MarketEvidenceError(
      code,
      "portable bundle의 필수 JSON을 읽을 수 없습니다.",
      { path: filePath, cause: error?.code },
    );
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new MarketEvidenceError(
      code,
      "portable bundle의 필수 JSON이 올바르지 않습니다.",
      { path: filePath },
    );
  }
}

function resolveBundlePath(root, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath === ".." ||
    relativePath.startsWith("../")
  ) {
    throw new MarketEvidenceError(
      "INVALID_ARTIFACT_PATH",
      "manifest 파일 경로는 bundle 내부의 canonical POSIX 상대 경로여야 합니다.",
      { path: relativePath },
    );
  }
  const absolutePath = path.resolve(
    root,
    ...relativePath.split("/"),
  );
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new MarketEvidenceError(
      "INVALID_ARTIFACT_PATH",
      "manifest 파일 경로가 bundle 밖을 가리킵니다.",
      { path: relativePath },
    );
  }
  return absolutePath;
}

async function listBundleFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path
      .relative(root, absolutePath)
      .split(path.sep)
      .join("/");
    if (entry.isSymbolicLink()) {
      throw new MarketEvidenceError(
        "INVALID_ARTIFACT_FILE",
        "portable bundle 안의 심볼릭 링크는 허용하지 않습니다.",
        { path: relativePath },
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await listBundleFiles(root, absolutePath)));
    } else if (entry.isFile() && relativePath !== "manifest.json") {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function verifyManifestArtifacts(root, artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new MarketEvidenceError(
      "INVALID_FILE_MANIFEST",
      "manifest.artifacts에는 모든 bundle 파일이 필요합니다.",
    );
  }
  const paths = new Set();
  const files = [];
  for (const entry of artifacts) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(String(entry.sha256 ?? ""))
    ) {
      throw new MarketEvidenceError(
        "INVALID_FILE_MANIFEST",
        "각 manifest artifact에는 path, bytes, SHA-256이 필요합니다.",
        { path: entry?.path },
      );
    }
    if (paths.has(entry.path)) {
      throw new MarketEvidenceError(
        "INVALID_FILE_MANIFEST",
        "manifest에 중복 파일 경로가 있습니다.",
        { path: entry.path },
      );
    }
    paths.add(entry.path);
    const absolutePath = resolveBundlePath(root, entry.path);
    let fileInfo;
    try {
      fileInfo = await lstat(absolutePath);
    } catch {
      throw new MarketEvidenceError(
        "ARTIFACT_MISSING",
        "manifest에 기록된 파일이 없습니다.",
        { path: entry.path },
      );
    }
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
      throw new MarketEvidenceError(
        "INVALID_ARTIFACT_FILE",
        "manifest artifact는 bundle 내부 일반 파일이어야 합니다.",
        { path: entry.path },
      );
    }
    const bytes = await readFile(absolutePath);
    const actualSha256 = sha256(bytes);
    if (
      fileInfo.size !== entry.bytes ||
      actualSha256 !== entry.sha256
    ) {
      throw new MarketEvidenceError(
        "ARTIFACT_INTEGRITY_MISMATCH",
        "manifest의 파일 크기 또는 SHA-256이 실제 파일과 다릅니다.",
        {
          path: entry.path,
          expected_bytes: entry.bytes,
          actual_bytes: fileInfo.size,
          expected_sha256: entry.sha256,
          actual_sha256: actualSha256,
        },
      );
    }
    files.push({
      source_path: entry.path,
      object_sha256: actualSha256,
      bytes: fileInfo.size,
      rights: "research_reference_only",
      production_use_allowed: false,
    });
  }

  const diskFiles = await listBundleFiles(root);
  const manifestFiles = [...paths].sort();
  if (
    canonicalJson(diskFiles) !== canonicalJson(manifestFiles)
  ) {
    throw new MarketEvidenceError(
      "INCOMPLETE_FILE_MANIFEST",
      "manifest가 portable bundle의 모든 파일을 정확히 열거하지 않습니다.",
      { manifest_files: manifestFiles, disk_files: diskFiles },
    );
  }
  const missingRequired = [...REQUIRED_BUNDLE_FILES].filter(
    (relativePath) => !paths.has(relativePath),
  );
  if (missingRequired.length > 0) {
    throw new MarketEvidenceError(
      "INCOMPLETE_BUNDLE",
      "쿠팡 portable bundle 필수 파일이 없습니다.",
      { missing_files: missingRequired },
    );
  }
  files.sort((left, right) =>
    left.source_path.localeCompare(right.source_path),
  );
  return files;
}

function assertIdentity(value, candidate, locator, vendorRequired = true) {
  const actualProductId = String(value?.product_id ?? "");
  const actualItemId = String(value?.item_id ?? "");
  const actualVendor =
    value?.vendor_item_id === null ||
    value?.vendor_item_id === undefined ||
    value?.vendor_item_id === ""
      ? null
      : String(value.vendor_item_id);
  if (actualVendor !== null && !/^\d+$/.test(actualVendor)) {
    throw new MarketEvidenceError(
      "VENDOR_ITEM_ID_MISMATCH",
      `${locator}의 vendorItemId가 숫자가 아닙니다.`,
      { locator, actual_vendor_item_id: actualVendor },
    );
  }
  if (actualProductId !== candidate.product_id) {
    throw new MarketEvidenceError(
      "PRODUCT_ID_MISMATCH",
      `${locator}의 productId가 G1DQ 선택과 다릅니다.`,
      {
        locator,
        expected_product_id: candidate.product_id,
        actual_product_id: actualProductId,
      },
    );
  }
  if (actualItemId !== candidate.item_id) {
    throw new MarketEvidenceError(
      "ITEM_ID_MISMATCH",
      `${locator}의 itemId가 G1DQ 선택과 다릅니다.`,
      {
        locator,
        expected_item_id: candidate.item_id,
        actual_item_id: actualItemId,
      },
    );
  }
  if (
    vendorRequired &&
    candidate.vendor_item_id != null &&
    candidate.vendor_item_id !== actualVendor
  ) {
    throw new MarketEvidenceError(
      "VENDOR_ITEM_ID_MISMATCH",
      `${locator}의 vendorItemId가 G1DQ 선택과 다릅니다.`,
      {
        locator,
        expected_vendor_item_id: candidate.vendor_item_id ?? null,
        actual_vendor_item_id: actualVendor,
      },
    );
  }
}

function assertResearchOnlyRights(value, locator) {
  const rights = value?.rights;
  if (
    !rights ||
    rights.scope !== "research_reference_only" ||
    rights.production_use_allowed !== false ||
    rights.reviewer_identity_stored !== false
  ) {
    throw new MarketEvidenceError(
      "INVALID_MARKET_EVIDENCE_RIGHTS",
      `${locator}의 권리는 research-only/production=false여야 합니다.`,
      { locator },
    );
  }
}

function assertReviewScopeFalse(scope, locator) {
  if (
    !scope ||
    typeof scope !== "object" ||
    scope.complete_all_reviews !== false
  ) {
    throw new MarketEvidenceError(
      "REVIEW_SCOPE_INVALID",
      `${locator}.complete_all_reviews는 false여야 합니다.`,
      { locator },
    );
  }
}

function walkReviewValue(value, locator, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkReviewValue(item, `${locator}[${index}]`, visitor),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childLocator = `${locator}.${key}`;
    visitor(key, child, childLocator);
    walkReviewValue(child, childLocator, visitor);
  }
}

function normalizedReviewKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function isMachineGeneratedReviewKey(key) {
  const normalized = normalizedReviewKey(key);
  return (
    MACHINE_GENERATED_REVIEW_KEYS.has(normalized) ||
    normalized === "id" ||
    normalized.endsWith("_id") ||
    /(?:^|_)(?:hash|sha256|digest)$/.test(normalized)
  );
}

function assertPrivacyRedacted(reviewItems, locator) {
  walkReviewValue(reviewItems, locator, (key, value, childLocator) => {
    const normalizedKey = normalizedReviewKey(key);
    if (FORBIDDEN_REVIEW_KEYS.has(normalizedKey)) {
      throw new MarketEvidenceError(
        "PRIVACY_REDACTION_REQUIRED",
        "후기 작성자·계정·원본 HTML 필드는 저장할 수 없습니다.",
        { locator: childLocator },
      );
    }
    if (
      typeof value === "string" &&
      !isMachineGeneratedReviewKey(normalizedKey) &&
      (EMAIL_PATTERN.test(value) ||
        PHONE_PATTERN.test(value) ||
        ORDER_PATTERN.test(value))
    ) {
      throw new MarketEvidenceError(
        "PRIVACY_REDACTION_REQUIRED",
        "후기 본문의 이메일·전화번호·주문번호를 마스킹해야 합니다.",
        { locator: childLocator },
      );
    }
  });
}

function selectedCandidate(selection, candidateId) {
  createCoupangExtractorWorkOrders({ selection });
  const candidate = selection.selected_candidates.find(
    (entry) => entry.candidate_id === candidateId,
  );
  if (!candidate) {
    throw new MarketEvidenceError(
      "SELECTED_CANDIDATE_REQUIRED",
      "G1A candidateId가 G1DQ selection에 없습니다.",
      { candidate_id: candidateId },
    );
  }
  return candidate;
}

export async function importCoupangBundle({
  bundleRoot,
  selection,
  candidateId,
  search_criteria: searchCriteria,
  query,
} = {}) {
  if (searchCriteria !== undefined || query !== undefined) {
    throw new MarketEvidenceError(
      "UNSELECTED_SEARCH_INPUT",
      "G1A에는 검색 조건이 아니라 G1DQ가 선택한 직접 상품 URL만 허용됩니다.",
    );
  }
  const candidate = selectedCandidate(selection, candidateId);
  const root = path.resolve(String(bundleRoot ?? ""));
  const manifestPath = path.join(root, "manifest.json");
  let manifestBytes;
  try {
    manifestBytes = await readFile(manifestPath);
  } catch {
    throw new MarketEvidenceError(
      "PARTIAL_BUNDLE",
      "manifest.json이 없는 실패 staging은 가져올 수 없습니다.",
      { bundle_root: root },
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new MarketEvidenceError(
      "PARTIAL_BUNDLE",
      "manifest.json이 올바른 JSON이 아닙니다.",
      { bundle_root: root },
    );
  }

  if (
    manifest.artifact_type !==
      "coupang_extractor_bundle_manifest" ||
    !SUPPORTED_BUNDLE_SCHEMA_VERSIONS.has(
      String(manifest.schema_version ?? ""),
    ) ||
    manifest.browser_mode !== "visible_browser_harness" ||
    !PROVIDER_STATUSES.has(manifest.status)
  ) {
    throw new MarketEvidenceError(
      "INVALID_COUPANG_MANIFEST",
      "지원되는 coupang-extractor portable bundle이 아닙니다.",
      {
        artifact_type: manifest.artifact_type,
        schema_version: manifest.schema_version,
        browser_mode: manifest.browser_mode,
        status: manifest.status,
      },
    );
  }
  assertIdentity(manifest, candidate, "manifest.json");
  const resolvedCandidate = {
    ...candidate,
    vendor_item_id:
      candidate.vendor_item_id ??
      (manifest.vendor_item_id == null
        ? null
        : String(manifest.vendor_item_id)),
  };
  assertResearchOnlyRights(manifest, "manifest.json");
  assertReviewScopeFalse(
    manifest.review_scope,
    "manifest.json#/review_scope",
  );

  const files = await verifyManifestArtifacts(
    root,
    manifest.artifacts,
  );
  const [capture, page, reviews, validation] = await Promise.all([
    readJson(path.join(root, "capture.json"), "INVALID_CAPTURE"),
    readJson(path.join(root, "page.json"), "INVALID_PAGE"),
    readJson(
      path.join(root, "reviews", "reviews.json"),
      "INVALID_REVIEWS",
    ),
    readJson(
      path.join(root, "evidence", "validation.json"),
      "INVALID_PROVIDER_VALIDATION",
    ),
  ]);

  assertIdentity(
    capture.product,
    resolvedCandidate,
    "capture.json#/product",
  );
  assertIdentity(page, resolvedCandidate, "page.json");
  assertIdentity(
    reviews,
    resolvedCandidate,
    "reviews/reviews.json",
    false,
  );
  assertResearchOnlyRights(capture, "capture.json");
  assertResearchOnlyRights(page, "page.json");
  assertResearchOnlyRights(reviews, "reviews/reviews.json");
  assertReviewScopeFalse(
    capture.reviews?.scope,
    "capture.json#/reviews/scope",
  );
  assertReviewScopeFalse(
    page.reviews?.scope,
    "page.json#/reviews/scope",
  );
  assertReviewScopeFalse(
    reviews.scope,
    "reviews/reviews.json#/scope",
  );
  if (reviews.author_identifiers_removed !== true) {
    throw new MarketEvidenceError(
      "PRIVACY_REDACTION_REQUIRED",
      "reviews bundle은 author_identifiers_removed:true여야 합니다.",
    );
  }
  assertPrivacyRedacted(
    capture.reviews?.items,
    "capture.json#/reviews/items",
  );
  assertPrivacyRedacted(
    reviews.reviews,
    "reviews/reviews.json#/reviews",
  );
  if (
    validation.status !== "VALID" ||
    (Array.isArray(validation.errors) &&
      validation.errors.length > 0)
  ) {
    throw new MarketEvidenceError(
      "PROVIDER_VALIDATION_FAILED",
      "coupang-extractor validator가 통과하지 않은 bundle입니다.",
      { validation },
    );
  }

  const sourceManifestSha256 = sha256(manifestBytes);
  const digest16 = sourceManifestSha256.slice(0, 16);
  const artifactId = `art-market-coupang-${digest16}`;
  const validationReceiptId = `validation-coupang-import-${digest16}`;
  const artifact = {
    schema_version: "2.0-draft",
    artifact_id: artifactId,
    artifact_type: "market.competitor_evidence",
    candidate_id: candidate.candidate_id,
    candidate_set_digest: selection.candidate_set_digest,
    product_id: candidate.product_id,
    item_id: candidate.item_id,
    vendor_item_id: resolvedCandidate.vendor_item_id,
    canonical_url: candidate.canonical_url,
    source_bundle_path: root,
    source_manifest_sha256: sourceManifestSha256,
    rights: "research_reference_only",
    production_use_allowed: false,
    approval_status: "not_approved",
    files,
    validation_receipt_ids: [validationReceiptId],
    consumers: ["G1C_COMMERCIAL_PLAN"],
  };
  const normalizedManifestSha256 = sha256(
    canonicalJson(artifact),
  );
  const adapterSha256 = sha256(
    await readFile(fileURLToPath(import.meta.url)),
  );
  const providerWarnings = Array.isArray(validation.warnings)
    ? clone(validation.warnings)
    : [];
  if (manifest.status === "PARTIAL") {
    providerWarnings.push({
      code: "PROVIDER_PARTIAL",
      severity: "warning",
      message:
        "일부 근거만 수집됐으므로 누락과 관측 상한을 해소하기 전까지 HOLD입니다.",
    });
  }
  providerWarnings.push({
    code: "PROVIDER_STATUS_IS_NOT_APPROVAL",
    severity: "warning",
    message:
      "provider 상태는 수집 계약 결과이며 G1 관련성 승인 또는 제작 권리가 아닙니다.",
  });
  const fileMappings = files.map((file) => ({
    source_path: file.source_path,
    object_sha256: file.object_sha256,
    normalized_member_id: `market-file-${file.object_sha256.slice(0, 16)}`,
    rights: "research_reference_only",
    production_use_allowed: false,
  }));
  if (fileMappings.length !== manifest.artifacts.length) {
    throw new MarketEvidenceError(
      "IMPORTER_FILE_MAPPING_REQUIRED",
      "ImporterReceipt는 manifest 전 파일을 매핑해야 합니다.",
    );
  }

  return {
    schema_version: "2.0-draft",
    stage_id: "G1A_MARKET_EVIDENCE",
    status: manifest.status === "READY" ? "completed" : "hold",
    provider_status: manifest.status,
    approval_status: "not_approved",
    outputs: [artifact],
    importer_receipt: {
      schema_version: "2.0-draft",
      importer_receipt_id: `import-coupang-${digest16}`,
      provider: "coupang-extractor",
      provider_version: String(manifest.schema_version),
      provider_skill_sha256: null,
      source_bundle_path: root,
      source_manifest_sha256: sourceManifestSha256,
      importer_name: "CoupangExtractorAdapter",
      importer_code_sha256: adapterSha256,
      normalized_artifact_id: artifactId,
      normalized_manifest_sha256: normalizedManifestSha256,
      provider_status: manifest.status,
      provider_warnings: providerWarnings,
      selection_receipt_id: selection.selection_receipt_id,
      candidate_set_digest: selection.candidate_set_digest,
      file_mappings: fileMappings,
      validation_receipt_ids: [validationReceiptId],
      imported_at: new Date().toISOString(),
    },
  };
}
