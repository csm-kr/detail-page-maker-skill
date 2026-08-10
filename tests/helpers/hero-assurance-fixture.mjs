import { createHash } from "node:crypto";

import {
  HERO_OUTPUT_POLICY,
  HERO_OUTPUT_POLICY_SHA256,
  canonicalHeroSha256,
  createHeroValidationReceipt,
  heroCommercialSubjectDigest,
  heroIdentitySubjectDigest,
  heroIdentityTraceSha256,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/hero-output-gate.mjs";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function commercialReceipt(manifest, score) {
  const subjectDigest = heroCommercialSubjectDigest({
    captureArtifactId: manifest.capture.artifact_id,
    captureSha256: manifest.capture.sha256,
    capturedHtmlSha256: manifest.capture.captured_html_sha256,
    viewport: manifest.capture.viewport,
  });
  return {
    validation_id: `hero-commercial-${subjectDigest.slice(0, 16)}`,
    subject: {
      artifact_set_digest: subjectDigest,
      artifact_ids: [manifest.capture.artifact_id],
    },
    validator: {
      name: HERO_OUTPUT_POLICY.commercial_validator_id,
      version: HERO_OUTPUT_POLICY.commercial_validator_version,
      code_sha256:
        HERO_OUTPUT_POLICY.commercial_validator_code_sha256,
      prompt_sha256: HERO_OUTPUT_POLICY.commercial_prompt_sha256,
      model_id: "visual-validator-pinned-test",
      agent_id: "hero-commercial-validator",
      agent_session_id: "hero-commercial-validator-session",
    },
    producer: {
      agent_session_ids: ["hero-capture-producer-session"],
    },
    policy: {
      policy_id: "policy.hero-commercial-visual.v1",
      policy_sha256: canonicalHeroSha256({
        policy_id: "policy.hero-commercial-visual.v1",
        threshold:
          HERO_OUTPUT_POLICY.commercial_visual_minimum_score,
        prompt_sha256: HERO_OUTPUT_POLICY.commercial_prompt_sha256,
      }),
    },
    validator_kind: "model",
    checks: [
      {
        check_id: "hero.commercial_visual_intensity",
        status: "PASS",
        severity: "hard",
        evidence_artifact_ids: [manifest.capture.artifact_id],
      },
    ],
    score,
    hard_failures: [],
    verdict: "PASS",
    started_at: "2026-07-30T03:00:00.000Z",
    finished_at: "2026-07-30T03:01:00.000Z",
  };
}

export function attachValidHeroAssurance(contract, {
  commercialScore = 95,
  heroArtifactSha256 = sha256(
    "approved hero image bytes fixture",
  ),
  // materialized member 조회는 artifact_id 또는 이 경로로 이뤄지므로
  // 프로젝트 자산 매니페스트의 path와 같아야 한다.
  heroArtifactPath = "assets/hero.bin",
  productBox = { x: 35, y: 170, width: 320, height: 430 },
  peerVisualBoxes = [
    { element_id: "hero-badge", x: 18, y: 24, width: 100, height: 40 },
  ],
} = {}) {
  const value = structuredClone(contract);
  const graph = value.resolved_section_graph;
  graph.graph_id ??= "resolved-graph-hero-fixture";
  const section =
    graph.sections.find(
      (candidate) => candidate.section_id === "section-hero",
    ) ?? graph.sections[0];
  section.section_id = "section-hero";
  section.role = "hero";
  section.claims ??= (section.claim_ids ?? []).map((claimId) => ({
    claim_id: claimId,
  }));
  section.claim_ids ??= section.claims.map((claim) => claim.claim_id);
  const primaryClaimId =
    section.claims[0]?.claim_id ?? section.claim_ids[0];
  section.claims = [section.claims[0] ?? { claim_id: primaryClaimId }];
  section.claim_ids = [primaryClaimId];

  const heroSlot =
    section.media_slots.find(
      (slot) => slot.approved_artifact_id === "image-approved-001",
    ) ?? section.media_slots[0];
  heroSlot.kind = "image";
  const heroArtifactId = heroSlot.approved_artifact_id;
  const heroSha256 = heroArtifactSha256;
  const sourceArtifactId = "supplier-same-sku-identity-001";
  const sourceSha256 = sha256("supplier same sku source fixture");
  const g2ValidationArtifactId = "g2-identity-validation-001";
  const g2IdentitySubjectDigest = heroIdentitySubjectDigest({
    sourceArtifactId,
    sourceSha256,
    heroArtifactId,
    heroSha256,
  });
  const g2IdentityValidationReceipt = {
    validation_id: g2ValidationArtifactId,
    subject: {
      artifact_set_digest: g2IdentitySubjectDigest,
      artifact_ids: [sourceArtifactId, heroArtifactId],
    },
    validator: {
      name: HERO_OUTPUT_POLICY.identity_validator_id,
      version: HERO_OUTPUT_POLICY.identity_validator_version,
      code_sha256:
        HERO_OUTPUT_POLICY.identity_validator_code_sha256,
      agent_id: "g2-identity-validator",
      agent_session_id: "g2-identity-validator-session",
    },
    producer: {
      agent_session_ids: ["g2-image-producer-session"],
    },
    policy: {
      policy_id: "policy.g2-product-identity.v1",
      policy_sha256: canonicalHeroSha256({
        policy_id: "policy.g2-product-identity.v1",
        validator_code_sha256:
          HERO_OUTPUT_POLICY.identity_validator_code_sha256,
      }),
    },
    validator_kind: "model",
    checks: [
      {
        check_id: "hero.product_identity_preserved",
        status: "PASS",
        severity: "hard",
        evidence_artifact_ids: [sourceArtifactId, heroArtifactId],
      },
    ],
    score: 100,
    hard_failures: [],
    verdict: "PASS",
    started_at: "2026-07-30T02:58:00.000Z",
    finished_at: "2026-07-30T02:59:00.000Z",
  };
  const g2ValidationReceiptSha256 = canonicalHeroSha256(
    g2IdentityValidationReceipt,
  );
  const identityTraceSha256 = heroIdentityTraceSha256({
    sourceArtifactId,
    sourceSha256,
    heroArtifactId,
    heroSha256,
    g2IdentityValidationArtifactId: g2ValidationArtifactId,
    g2IdentityValidationReceiptSha256:
      g2ValidationReceiptSha256,
  });

  const heroArtifact =
    value.approved_artifacts.find(
      (artifact) => artifact.artifact_id === heroArtifactId,
    );
  Object.assign(heroArtifact, {
    path: heroArtifact.path ?? heroArtifactPath,
    sha256: heroSha256,
    approval_status: "approved",
    production_use_allowed: true,
    identity_trace_sha256: identityTraceSha256,
  });
  value.identity_source_artifacts = [
    {
      artifact_id: sourceArtifactId,
      sha256: sourceSha256,
      source_kind: "supplier_same_sku",
      same_sku: true,
      g2_identity_validation_artifact_id: g2ValidationArtifactId,
      g2_identity_validation_receipt_sha256:
        g2ValidationReceiptSha256,
      g2_identity_validation_receipt:
        g2IdentityValidationReceipt,
    },
  ];

  const currentHtmlSha256 = sha256(value.html);
  const manifest = {
    schema_version: "1.0",
    policy_id: HERO_OUTPUT_POLICY.policy_id,
    policy_version: HERO_OUTPUT_POLICY.version,
    policy_sha256: HERO_OUTPUT_POLICY_SHA256,
    hero_section_id: section.section_id,
    resolved_graph_artifact_id: graph.graph_id,
    primary_benefit_claim_ids: [primaryClaimId],
    hero_artifact: {
      artifact_id: heroArtifactId,
      sha256: heroSha256,
    },
    identity_source: {
      artifact_id: sourceArtifactId,
      sha256: sourceSha256,
      g2_identity_validation_artifact_id: g2ValidationArtifactId,
      g2_identity_validation_receipt_sha256:
        g2ValidationReceiptSha256,
    },
    identity_trace_sha256: identityTraceSha256,
    html_sha256: currentHtmlSha256,
    capture: {
      artifact_id: "hero-capture-390-2x-001",
      sha256: sha256("hero capture 390@2x fixture"),
      captured_html_sha256: currentHtmlSha256,
      viewport: {
        css_width: HERO_OUTPUT_POLICY.capture_viewport_css_width,
        device_scale_factor:
          HERO_OUTPUT_POLICY.capture_device_scale_factor,
      },
      section_bbox: {
        x: 0,
        y: 0,
        width: 390,
        height: 900,
      },
      product_bbox: productBox,
      peer_visual_bboxes: peerVisualBoxes,
      visual_element_count: peerVisualBoxes.length + 1,
    },
    static_dom_evidence: {
      artifact_id: "hero-static-dom-report-001",
      sha256: sha256("hero static DOM report fixture"),
      animated_element_count: 0,
      runtime_target_count: 0,
      css_animation_name_count: 0,
    },
    producer_agent_session_ids: [
      "g2-image-producer-session",
      "g4-html-producer-session",
      "hero-capture-producer-session",
    ],
  };
  const commercialValidationReceipt = commercialReceipt(
    manifest,
    commercialScore,
  );
  manifest.commercial_validation_id =
    commercialValidationReceipt.validation_id;
  manifest.commercial_validation_receipt_sha256 =
    canonicalHeroSha256(commercialValidationReceipt);
  const validationReceipt = createHeroValidationReceipt({
    manifest,
    validatorAgentSessionId: "hero-output-validator-session",
    producerAgentSessionIds: manifest.producer_agent_session_ids,
    createdAt: "2026-07-30T03:02:00.000Z",
  });
  value.hero_assurance = {
    manifest,
    commercial_validation_receipt: commercialValidationReceipt,
    validation_receipt: validationReceipt,
  };
  return value;
}
