import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  validateValidationReceipt,
} from "./receipt-contracts.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
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

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function canonicalHeroSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)) ?? "null")
    .digest("hex");
}

const FLOW_POLICY = JSON.parse(
  readFileSync(
    new URL("../../policies/detail-page-flow-v1.json", import.meta.url),
    "utf8",
  ),
);
const POLICY_SOURCE =
  FLOW_POLICY?.content?.hero?.output_assurance;
if (
  !POLICY_SOURCE?.policy_id ||
  !POLICY_SOURCE?.version ||
  !Array.isArray(POLICY_SOURCE?.required_checks)
) {
  throw new Error(
    "detail-page-flow-v1 Hero output assurance policy가 없습니다.",
  );
}

export const HERO_OUTPUT_POLICY = deepFreeze(
  structuredClone(POLICY_SOURCE),
);
const REQUIRED_HERO_CHECK_IDS = Object.freeze([
  ...HERO_OUTPUT_POLICY.required_checks,
]);

export const HERO_OUTPUT_POLICY_SHA256 =
  canonicalHeroSha256(HERO_OUTPUT_POLICY);

export const HERO_OUTPUT_VALIDATOR_CODE_SHA256 = createHash("sha256")
  .update(readFileSync(fileURLToPath(import.meta.url)))
  .digest("hex");

function isObject(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value);
}

function isSha256(value) {
  return SHA256.test(String(value ?? ""));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function add(errors, code, path, message, details = undefined) {
  errors.push({
    code,
    path,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function exactSet(left, right) {
  const a = [...new Set(left ?? [])].sort();
  const b = [...new Set(right ?? [])].sort();
  return a.length === b.length &&
    a.every((value, index) => value === b[index]);
}

function validBox(box) {
  return isObject(box) &&
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0;
}

function boxArea(box) {
  return box.width * box.height;
}

function boxInside(inner, outer) {
  const epsilon = 0.01;
  return inner.x + epsilon >= outer.x &&
    inner.y + epsilon >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon;
}

function htmlSha256(html) {
  return createHash("sha256").update(String(html ?? "")).digest("hex");
}

function heroSectionHtml(html, sectionId) {
  const escaped = String(sectionId).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const opening = new RegExp(
    `<section\\b[^>]*\\bdata-section-id\\s*=\\s*(?:"${escaped}"|'${escaped}')[^>]*>`,
    "i",
  );
  const match = opening.exec(String(html ?? ""));
  if (!match) return null;
  const source = String(html);
  const sectionTokens = /<\/?section\b[^>]*>/gi;
  sectionTokens.lastIndex = match.index + match[0].length;
  let depth = 1;
  for (
    let token = sectionTokens.exec(source);
    token;
    token = sectionTokens.exec(source)
  ) {
    depth += /^<\//.test(token[0]) ? -1 : 1;
    if (depth === 0) {
      return source.slice(match.index, sectionTokens.lastIndex);
    }
  }
  return null;
}

function heroHasRuntimeMotion(sectionHtml) {
  if (!sectionHtml) return true;
  return (
    /<(?:video|audio|canvas)\b/i.test(sectionHtml) ||
    /\bsrc\s*=\s*(?:"[^"]+\.(?:gif|webm|mp4)(?:[?#][^"]*)?"|'[^']+\.(?:gif|webm|mp4)(?:[?#][^']*)?')/i
      .test(sectionHtml) ||
    /\b(?:data-motion|data-animation|data-runtime-target)\b/i
      .test(sectionHtml) ||
    /\banimation(?:-name)?\s*:/i.test(sectionHtml) ||
    /\bclass\s*=\s*(?:"[^"]*\bmotion(?:-|_|\s)[^"]*"|'[^']*\bmotion(?:-|_|\s)[^']*')/i
      .test(sectionHtml)
  );
}

export function heroIdentityTraceSha256({
  sourceArtifactId,
  sourceSha256,
  heroArtifactId,
  heroSha256,
  g2IdentityValidationArtifactId,
  g2IdentityValidationReceiptSha256,
}) {
  return canonicalHeroSha256({
    source_artifact_id: sourceArtifactId,
    source_sha256: sourceSha256,
    hero_artifact_id: heroArtifactId,
    hero_sha256: heroSha256,
    g2_identity_validation_artifact_id:
      g2IdentityValidationArtifactId,
    g2_identity_validation_receipt_sha256:
      g2IdentityValidationReceiptSha256,
  });
}

export function heroIdentitySubjectDigest({
  sourceArtifactId,
  sourceSha256,
  heroArtifactId,
  heroSha256,
}) {
  return canonicalHeroSha256({
    source_artifact_id: sourceArtifactId,
    source_sha256: sourceSha256,
    hero_artifact_id: heroArtifactId,
    hero_sha256: heroSha256,
  });
}

export function heroCommercialSubjectDigest({
  captureArtifactId,
  captureSha256,
  capturedHtmlSha256,
  viewport,
}) {
  return canonicalHeroSha256({
    capture_artifact_id: captureArtifactId,
    capture_sha256: captureSha256,
    captured_html_sha256: capturedHtmlSha256,
    viewport,
  });
}

export function heroAssuranceSubjectDigest(manifest) {
  return canonicalHeroSha256(manifest);
}

function validateCommercialReceipt(
  manifest,
  commercialReceipt,
  errors,
) {
  const capture = manifest?.capture;
  const expectedDigest = heroCommercialSubjectDigest({
    captureArtifactId: capture?.artifact_id,
    captureSha256: capture?.sha256,
    capturedHtmlSha256: capture?.captured_html_sha256,
    viewport: capture?.viewport,
  });
  const report = validateValidationReceipt(commercialReceipt, {
    expectedArtifactSetDigest: expectedDigest,
    expectedPolicyId: "policy.hero-commercial-visual.v1",
    validatorAgentSessionId:
      commercialReceipt?.validator?.agent_session_id,
    producerAgentSessionIds:
      commercialReceipt?.producer?.agent_session_ids,
    availableEvidenceArtifactIds: [capture?.artifact_id],
  });
  if (!report.ok) {
    add(
      errors,
      "HERO_COMMERCIAL_RECEIPT_INVALID",
      "commercial_validation_receipt",
      "상업 강도 판정은 390px capture exact digest에 고정된 독립 ValidationReceipt여야 합니다.",
      report.errors,
    );
    return;
  }
  if (
    !exactSet(commercialReceipt?.subject?.artifact_ids, [
      capture?.artifact_id,
    ])
  ) {
    add(
      errors,
      "HERO_COMMERCIAL_SUBJECT_ARTIFACT_MISMATCH",
      "commercial_validation_receipt.subject.artifact_ids",
      "상업 시각 ValidationReceipt는 해당 390px capture 하나만 평가해야 합니다.",
    );
  }
  if (
    manifest?.commercial_validation_id !==
      commercialReceipt.validation_id ||
    manifest?.commercial_validation_receipt_sha256 !==
      canonicalHeroSha256(commercialReceipt)
  ) {
    add(
      errors,
      "HERO_COMMERCIAL_RECEIPT_DIGEST_MISMATCH",
      "manifest.commercial_validation_receipt_sha256",
      "Hero assurance manifest는 상업 시각 ValidationReceipt exact digest에 고정되어야 합니다.",
    );
  }
  if (
    commercialReceipt.validator_kind !== "model" ||
    commercialReceipt?.validator?.name !==
      HERO_OUTPUT_POLICY.commercial_validator_id ||
    commercialReceipt?.validator?.version !==
      HERO_OUTPUT_POLICY.commercial_validator_version ||
    commercialReceipt?.validator?.code_sha256 !==
      HERO_OUTPUT_POLICY.commercial_validator_code_sha256 ||
    !nonEmpty(commercialReceipt?.validator?.model_id) ||
    commercialReceipt?.validator?.prompt_sha256 !==
      HERO_OUTPUT_POLICY.commercial_prompt_sha256 ||
    commercialReceipt.score <
      HERO_OUTPUT_POLICY.commercial_visual_minimum_score ||
    commercialReceipt.checks.length !== 1 ||
    commercialReceipt.checks[0]?.check_id !==
      "hero.commercial_visual_intensity" ||
    commercialReceipt.checks[0]?.status !== "PASS" ||
    commercialReceipt.checks[0]?.severity !== "hard" ||
    !commercialReceipt.producer.agent_session_ids.every((sessionId) =>
      manifest?.producer_agent_session_ids?.includes(sessionId)
    )
  ) {
    add(
      errors,
      "HERO_COMMERCIAL_INTENSITY_NOT_HIGH",
      "commercial_validation_receipt",
      "고정 validator·prompt로 판정한 상업 시각 점수가 high 기준을 충족해야 합니다.",
    );
  }
}

function validateIdentityReceipt(
  manifest,
  sourceArtifact,
  heroArtifact,
  errors,
) {
  const receipt =
    sourceArtifact?.g2_identity_validation_receipt;
  const expectedDigest = heroIdentitySubjectDigest({
    sourceArtifactId: sourceArtifact?.artifact_id,
    sourceSha256: sourceArtifact?.sha256,
    heroArtifactId: heroArtifact?.artifact_id,
    heroSha256: heroArtifact?.sha256,
  });
  const report = validateValidationReceipt(receipt, {
    expectedArtifactSetDigest: expectedDigest,
    expectedPolicyId: "policy.g2-product-identity.v1",
    validatorAgentSessionId:
      receipt?.validator?.agent_session_id,
    producerAgentSessionIds:
      receipt?.producer?.agent_session_ids,
    availableEvidenceArtifactIds: [
      sourceArtifact?.artifact_id,
      heroArtifact?.artifact_id,
    ].filter(nonEmpty),
  });
  if (!report.ok) {
    add(
      errors,
      "HERO_G2_IDENTITY_RECEIPT_INVALID",
      "identity_source_artifacts.g2_identity_validation_receipt",
      "G2 identity ValidationReceipt는 same-SKU source와 승인 Hero asset exact digest를 독립 검수해야 합니다.",
      report.errors,
    );
    return;
  }
  if (
    receipt?.validation_id !==
      sourceArtifact.g2_identity_validation_artifact_id ||
    canonicalHeroSha256(receipt) !==
      sourceArtifact.g2_identity_validation_receipt_sha256 ||
    receipt?.validator?.name !==
      HERO_OUTPUT_POLICY.identity_validator_id ||
    receipt?.validator?.version !==
      HERO_OUTPUT_POLICY.identity_validator_version ||
    receipt?.validator?.code_sha256 !==
      HERO_OUTPUT_POLICY.identity_validator_code_sha256 ||
    receipt?.validator_kind !== "model" ||
    receipt.checks.length !== 1 ||
    receipt.checks[0]?.check_id !==
      "hero.product_identity_preserved" ||
    receipt.checks[0]?.status !== "PASS" ||
    receipt.checks[0]?.severity !== "hard" ||
    !exactSet(receipt?.subject?.artifact_ids, [
      sourceArtifact.artifact_id,
      heroArtifact.artifact_id,
    ]) ||
    !receipt.producer.agent_session_ids.every((sessionId) =>
      manifest?.producer_agent_session_ids?.includes(sessionId)
    )
  ) {
    add(
      errors,
      "HERO_G2_IDENTITY_RECEIPT_MISMATCH",
      "identity_source_artifacts.g2_identity_validation_receipt",
      "G2 identity receipt의 ID·hash·validator·producer·PASS check가 assurance trace와 일치해야 합니다.",
    );
  }
}

function validateFinalReceipt(
  manifest,
  receipt,
  evidenceIds,
  errors,
) {
  const expectedDigest = heroAssuranceSubjectDigest(manifest);
  const report = validateValidationReceipt(receipt, {
    expectedArtifactSetDigest: expectedDigest,
    expectedPolicyId: HERO_OUTPUT_POLICY.policy_id,
    validatorAgentSessionId: receipt?.validator?.agent_session_id,
    producerAgentSessionIds:
      manifest?.producer_agent_session_ids,
    availableEvidenceArtifactIds: evidenceIds,
  });
  if (!report.ok) {
    add(
      errors,
      "HERO_VALIDATION_RECEIPT_INVALID",
      "validation_receipt",
      "Hero assurance는 exact manifest digest와 독립 validator에 고정된 ValidationReceipt여야 합니다.",
      report.errors,
    );
    return;
  }
  const expectedSubjectArtifactIds = [
    manifest?.hero_artifact?.artifact_id,
    manifest?.capture?.artifact_id,
    manifest?.static_dom_evidence?.artifact_id,
    manifest?.resolved_graph_artifact_id,
  ];
  if (
    !exactSet(
      receipt?.subject?.artifact_ids,
      expectedSubjectArtifactIds,
    )
  ) {
    add(
      errors,
      "HERO_SUBJECT_ARTIFACT_MISMATCH",
      "validation_receipt.subject.artifact_ids",
      "Hero ValidationReceipt subject는 승인 제품·capture·DOM report·resolved graph exact set이어야 합니다.",
    );
  }
  if (
    receipt?.validator?.name !==
      "HeroOutputAssuranceValidator" ||
    receipt?.validator?.version !== HERO_OUTPUT_POLICY.version ||
    receipt?.validator?.code_sha256 !==
      HERO_OUTPUT_VALIDATOR_CODE_SHA256 ||
    receipt?.policy?.policy_sha256 !== HERO_OUTPUT_POLICY_SHA256
  ) {
    add(
      errors,
      "HERO_VALIDATOR_NOT_PINNED",
      "validation_receipt",
      "Hero bbox·정적·동일성 gate는 고정 policy와 validator code hash를 사용해야 합니다.",
    );
  }
  const checkIds = receipt.checks.map((check) => check?.check_id);
  const requiredEvidenceByCheck = new Map([
    [
      "hero.identity_preserved",
      [
        manifest?.identity_source?.artifact_id,
        manifest?.identity_source
          ?.g2_identity_validation_artifact_id,
        manifest?.hero_artifact?.artifact_id,
      ],
    ],
    [
      "hero.product_largest",
      [manifest?.capture?.artifact_id],
    ],
    [
      "hero.commercial_intensity_high",
      [
        manifest?.capture?.artifact_id,
        manifest?.commercial_validation_id,
      ],
    ],
    [
      "hero.static",
      [manifest?.static_dom_evidence?.artifact_id],
    ],
    [
      "hero.single_primary_benefit",
      [manifest?.resolved_graph_artifact_id],
    ],
  ]);
  if (
    receipt.checks.length !== REQUIRED_HERO_CHECK_IDS.length ||
    !exactSet(checkIds, REQUIRED_HERO_CHECK_IDS) ||
    receipt.checks.some(
      (check) =>
        check.status !== "PASS" ||
        check.severity !== "hard" ||
        !Array.isArray(check.evidence_artifact_ids) ||
        check.evidence_artifact_ids.length === 0 ||
        !exactSet(
          check.evidence_artifact_ids,
          requiredEvidenceByCheck.get(check.check_id) ?? [],
        ),
    )
  ) {
    add(
      errors,
      "HERO_REQUIRED_CHECKS_MISSING",
      "validation_receipt.checks",
      "Hero의 동일성·제품 최대·상업 강도·정적·핵심 장점 1개 check가 모두 hard PASS여야 합니다.",
    );
  }
}

export function validateHeroOutputGate({
  manifest,
  validationReceipt,
  commercialValidationReceipt,
  resolvedSectionGraph,
  approvedArtifacts,
  identitySourceArtifacts,
  html,
} = {}) {
  const errors = [];
  if (
    manifest?.schema_version !== "1.0" ||
    manifest?.policy_id !== HERO_OUTPUT_POLICY.policy_id ||
    manifest?.policy_version !== HERO_OUTPUT_POLICY.version ||
    manifest?.policy_sha256 !== HERO_OUTPUT_POLICY_SHA256
  ) {
    add(
      errors,
      "HERO_ASSURANCE_MANIFEST_REQUIRED",
      "manifest",
      "고정 Hero output assurance manifest가 필요합니다.",
    );
  }
  if (
    !Array.isArray(manifest?.producer_agent_session_ids) ||
    manifest.producer_agent_session_ids.length < 3 ||
    new Set(manifest.producer_agent_session_ids).size !==
      manifest.producer_agent_session_ids.length ||
    manifest.producer_agent_session_ids.some(
      (sessionId) => !nonEmpty(sessionId),
    )
  ) {
    add(
      errors,
      "HERO_PRODUCER_SESSIONS_INVALID",
      "manifest.producer_agent_session_ids",
      "Hero assurance는 G2 image·G4 HTML·capture의 분리된 producer session을 기록해야 합니다.",
    );
  }

  const section = (
    Array.isArray(resolvedSectionGraph?.sections)
      ? resolvedSectionGraph.sections
      : []
  ).find(
    (candidate) =>
      candidate?.section_id === manifest?.hero_section_id,
  );
  if (!section) {
    add(
      errors,
      "HERO_SECTION_MISMATCH",
      "resolved_section_graph.sections",
      "assurance의 Hero section을 resolved graph에서 찾을 수 없습니다.",
    );
  }
  if (
    !nonEmpty(resolvedSectionGraph?.graph_id) ||
    manifest?.resolved_graph_artifact_id !==
      resolvedSectionGraph.graph_id
  ) {
    add(
      errors,
      "HERO_RESOLVED_GRAPH_MISMATCH",
      "manifest.resolved_graph_artifact_id",
      "Hero assurance는 현재 resolved section graph artifact에 고정되어야 합니다.",
    );
  }
  const claims = Array.isArray(section?.claims)
    ? section.claims.map((claim) => claim?.claim_id)
    : Array.isArray(section?.claim_ids)
      ? section.claim_ids
      : [];
  if (
    claims.length !== HERO_OUTPUT_POLICY.primary_benefit_count ||
    manifest?.primary_benefit_claim_ids?.length !==
      HERO_OUTPUT_POLICY.primary_benefit_count ||
    claims[0] !== manifest?.primary_benefit_claim_ids?.[0]
  ) {
    add(
      errors,
      "HERO_PRIMARY_BENEFIT_COUNT_MISMATCH",
      "manifest.primary_benefit_claim_ids",
      "실제 Hero section과 assurance는 같은 핵심 benefit claim 정확히 한 개만 가져야 합니다.",
    );
  }

  const heroSlots = Array.isArray(section?.media_slots)
    ? section.media_slots
    : [];
  if (
    heroSlots.length === 0 ||
    heroSlots.some(
      (slot) =>
        !HERO_OUTPUT_POLICY.allowed_hero_media_kinds.includes(
          slot?.kind,
        ),
    ) ||
    !heroSlots.some(
      (slot) =>
        slot?.approved_artifact_id ===
        manifest?.hero_artifact?.artifact_id,
    )
  ) {
    add(
      errors,
      "HERO_STATIC_MEDIA_MISMATCH",
      "resolved_section_graph.sections.media_slots",
      "Hero는 승인된 정지 image만 사용하고 assurance의 제품 artifact를 포함해야 합니다.",
    );
  }

  const heroArtifact = (
    Array.isArray(approvedArtifacts) ? approvedArtifacts : []
  ).find(
    (artifact) =>
      artifact?.artifact_id ===
      manifest?.hero_artifact?.artifact_id,
  );
  const sourceArtifact = (
    Array.isArray(identitySourceArtifacts)
      ? identitySourceArtifacts
      : []
  ).find(
    (artifact) =>
      artifact?.artifact_id ===
      manifest?.identity_source?.artifact_id,
  );
  const expectedTrace = heroIdentityTraceSha256({
    sourceArtifactId: sourceArtifact?.artifact_id,
    sourceSha256: sourceArtifact?.sha256,
    heroArtifactId: heroArtifact?.artifact_id,
    heroSha256: heroArtifact?.sha256,
    g2IdentityValidationArtifactId:
      sourceArtifact?.g2_identity_validation_artifact_id,
    g2IdentityValidationReceiptSha256:
      sourceArtifact?.g2_identity_validation_receipt_sha256,
  });
  validateIdentityReceipt(
    manifest,
    sourceArtifact,
    heroArtifact,
    errors,
  );
  if (
    !heroArtifact ||
    heroArtifact.approval_status !== "approved" ||
    heroArtifact.production_use_allowed !== true ||
    !isSha256(heroArtifact.sha256) ||
    !sourceArtifact ||
    sourceArtifact.same_sku !== true ||
    !["supplier_same_sku", "actual_product_photo"].includes(
      sourceArtifact.source_kind,
    ) ||
    !isSha256(sourceArtifact.sha256) ||
    !isSha256(
      sourceArtifact.g2_identity_validation_receipt_sha256,
    ) ||
    !nonEmpty(
      sourceArtifact.g2_identity_validation_artifact_id,
    ) ||
    manifest?.hero_artifact?.sha256 !== heroArtifact.sha256 ||
    manifest?.identity_source?.sha256 !== sourceArtifact.sha256 ||
    manifest?.identity_source?.artifact_id !==
      sourceArtifact.artifact_id ||
    manifest?.identity_source
      ?.g2_identity_validation_artifact_id !==
      sourceArtifact.g2_identity_validation_artifact_id ||
    manifest?.identity_source
      ?.g2_identity_validation_receipt_sha256 !==
      sourceArtifact.g2_identity_validation_receipt_sha256 ||
    manifest?.identity_trace_sha256 !== expectedTrace ||
    heroArtifact.identity_trace_sha256 !== expectedTrace
  ) {
    add(
      errors,
      "HERO_IDENTITY_TRACE_MISMATCH",
      "manifest.identity_trace_sha256",
      "G2 same-SKU source→승인 Hero asset의 hash·identity ValidationReceipt trace가 일치해야 합니다.",
    );
  }

  const actualHtmlSha256 = htmlSha256(html);
  if (
    manifest?.html_sha256 !== actualHtmlSha256 ||
    manifest?.capture?.captured_html_sha256 !== actualHtmlSha256
  ) {
    add(
      errors,
      "HERO_CAPTURE_HTML_MISMATCH",
      "manifest.capture.captured_html_sha256",
      "Hero capture는 현재 editable HTML exact bytes를 대상으로 해야 합니다.",
    );
  }
  const sectionHtml = heroSectionHtml(
    html,
    manifest?.hero_section_id,
  );
  if (
    !sectionHtml ||
    heroHasRuntimeMotion(sectionHtml) ||
    !nonEmpty(manifest?.static_dom_evidence?.artifact_id) ||
    !isSha256(manifest?.static_dom_evidence?.sha256) ||
    manifest?.static_dom_evidence?.animated_element_count !== 0 ||
    manifest?.static_dom_evidence?.runtime_target_count !== 0 ||
    manifest?.static_dom_evidence?.css_animation_name_count !== 0
  ) {
    add(
      errors,
      "HERO_NOT_STATIC",
      "manifest.static_dom_evidence",
      "Hero subtree와 DOM runtime evidence 모두 motion·GIF·video·animation 대상이 0이어야 합니다.",
    );
  }

  const capture = manifest?.capture;
  if (
    !isSha256(capture?.sha256) ||
    !nonEmpty(capture?.artifact_id) ||
    capture?.viewport?.css_width !==
      HERO_OUTPUT_POLICY.capture_viewport_css_width ||
    capture?.viewport?.device_scale_factor !==
      HERO_OUTPUT_POLICY.capture_device_scale_factor ||
    !validBox(capture?.section_bbox) ||
    !validBox(capture?.product_bbox) ||
    capture.section_bbox.x < -0.01 ||
    Math.abs(
      capture.section_bbox.width -
        HERO_OUTPUT_POLICY.capture_viewport_css_width,
    ) > 1 ||
    !boxInside(capture?.product_bbox, capture?.section_bbox)
  ) {
    add(
      errors,
      "HERO_CAPTURE_GEOMETRY_INVALID",
      "manifest.capture",
      "390 CSS px·2x capture와 Hero/product bounding box가 필요합니다.",
    );
  } else {
    const ratio =
      boxArea(capture.product_bbox) /
      boxArea(capture.section_bbox);
    const peers = Array.isArray(capture.peer_visual_bboxes)
      ? capture.peer_visual_bboxes
      : [];
    const peerInvalid =
      !Array.isArray(capture.peer_visual_bboxes) ||
      !Number.isInteger(capture.visual_element_count) ||
      capture.visual_element_count !== peers.length + 1 ||
      peers.some(
      (peer) =>
        !nonEmpty(peer?.element_id) ||
        !validBox(peer) ||
        !boxInside(peer, capture.section_bbox),
      );
    const peerAtLeastAsLarge = peers.some(
      (peer) =>
        validBox(peer) &&
        boxArea(peer) >= boxArea(capture.product_bbox),
    );
    if (
      ratio <
        HERO_OUTPUT_POLICY.minimum_product_section_area_ratio ||
      peerInvalid ||
      peerAtLeastAsLarge
    ) {
      add(
        errors,
        "HERO_PRODUCT_NOT_LARGEST",
        "manifest.capture.product_bbox",
        "제품 bbox는 Hero 면적 기준을 넘고 다른 모든 시각 요소보다 커야 합니다.",
        {
          actual_area_ratio: ratio,
          minimum_area_ratio:
            HERO_OUTPUT_POLICY.minimum_product_section_area_ratio,
        },
      );
    }
  }

  validateCommercialReceipt(
    manifest,
    commercialValidationReceipt,
    errors,
  );

  const evidenceIds = [
    sourceArtifact?.artifact_id,
    sourceArtifact?.g2_identity_validation_artifact_id,
    heroArtifact?.artifact_id,
    capture?.artifact_id,
    manifest?.static_dom_evidence?.artifact_id,
    commercialValidationReceipt?.validation_id,
    resolvedSectionGraph?.graph_id,
  ].filter(nonEmpty);
  validateFinalReceipt(
    manifest,
    validationReceipt,
    evidenceIds,
    errors,
  );

  return {
    ok: errors.length === 0,
    errors,
    metrics: {
      product_section_area_ratio:
        validBox(capture?.section_bbox) &&
        validBox(capture?.product_bbox)
          ? boxArea(capture.product_bbox) /
            boxArea(capture.section_bbox)
          : null,
      commercial_score:
        commercialValidationReceipt?.score ?? null,
    },
  };
}

export class HeroOutputGateError extends Error {
  constructor(errors) {
    super("Hero 실제 산출물 assurance gate를 통과하지 못했습니다.");
    this.name = "HeroOutputGateError";
    this.code = "HERO_OUTPUT_GATE_FAILED";
    this.details = { errors };
  }
}

export function assertHeroOutputGate(input) {
  const report = validateHeroOutputGate(input);
  if (!report.ok) throw new HeroOutputGateError(report.errors);
  return report;
}

export function createHeroValidationReceipt({
  manifest,
  validatorAgentSessionId,
  producerAgentSessionIds,
  createdAt = new Date().toISOString(),
}) {
  const evidence = {
    identity: [
      manifest.identity_source.artifact_id,
      manifest.identity_source.g2_identity_validation_artifact_id,
      manifest.hero_artifact.artifact_id,
    ],
    capture: [manifest.capture.artifact_id],
    static: [manifest.static_dom_evidence.artifact_id],
    commercial: [
      manifest.capture.artifact_id,
      manifest.commercial_validation_id,
    ],
    benefit: [manifest.resolved_graph_artifact_id],
  };
  const checks = [
    {
      check_id: "hero.identity_preserved",
      status: "PASS",
      severity: "hard",
      evidence_artifact_ids: evidence.identity,
    },
    {
      check_id: "hero.product_largest",
      status: "PASS",
      severity: "hard",
      evidence_artifact_ids: evidence.capture,
    },
    {
      check_id: "hero.commercial_intensity_high",
      status: "PASS",
      severity: "hard",
      evidence_artifact_ids: evidence.commercial,
    },
    {
      check_id: "hero.static",
      status: "PASS",
      severity: "hard",
      evidence_artifact_ids: evidence.static,
    },
    {
      check_id: "hero.single_primary_benefit",
      status: "PASS",
      severity: "hard",
      evidence_artifact_ids: evidence.benefit,
    },
  ];
  const subjectDigest = heroAssuranceSubjectDigest(manifest);
  return {
    validation_id: `hero-output-${subjectDigest.slice(0, 16)}`,
    subject: {
      artifact_set_digest: subjectDigest,
      artifact_ids: [
        manifest.hero_artifact.artifact_id,
        manifest.capture.artifact_id,
        manifest.static_dom_evidence.artifact_id,
        manifest.resolved_graph_artifact_id,
      ],
    },
    validator: {
      name: "HeroOutputAssuranceValidator",
      version: HERO_OUTPUT_POLICY.version,
      code_sha256: HERO_OUTPUT_VALIDATOR_CODE_SHA256,
      agent_id: "hero-output-validator",
      agent_session_id: validatorAgentSessionId,
    },
    producer: {
      agent_session_ids: [...producerAgentSessionIds],
    },
    policy: {
      policy_id: HERO_OUTPUT_POLICY.policy_id,
      policy_sha256: HERO_OUTPUT_POLICY_SHA256,
    },
    validator_kind: "deterministic",
    checks,
    score: 100,
    hard_failures: [],
    verdict: "PASS",
    started_at: createdAt,
    finished_at: createdAt,
  };
}
