import assert from "node:assert/strict";
import test from "node:test";

import {
  assertHeroOutputGate,
  validateHeroOutputGate,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/hero-output-gate.mjs";
import {
  sanitizePublicHtml,
} from "../../skills/detail-page-maker-skill/scripts/runtime/project-output-runtime.mjs";
import {
  attachValidHeroAssurance,
} from "../helpers/hero-assurance-fixture.mjs";

function baseContract() {
  const html = `<!doctype html><html lang="ko"><body><main>
  <section data-section-id="section-hero">
    <h1 data-claim-id="claim-primary">가볍게 밀착되는 한 가지 이유</h1>
    <figure data-slot-id="slot-hero" data-artifact-id="image-approved-001">
      <img src="media/images/hero.webp" alt="제품 전체 모습">
    </figure>
  </section>
  </main></body></html>`;
  return {
    resolved_section_graph: {
      graph_id: "resolved-graph-hero-fixture",
      sections: [
        {
          section_id: "section-hero",
          role: "hero",
          claim_ids: ["claim-primary"],
          claims: [{ claim_id: "claim-primary" }],
          media_slots: [
            {
              slot_id: "slot-hero",
              kind: "image",
              approved_artifact_id: "image-approved-001",
              embedded_text_policy: "none",
            },
          ],
        },
      ],
    },
    approved_artifacts: [
      {
        artifact_id: "image-approved-001",
        approval_status: "approved",
        copy_embedded: false,
      },
    ],
    html,
  };
}

function gateInput(contract) {
  return {
    manifest: contract.hero_assurance?.manifest,
    validationReceipt:
      contract.hero_assurance?.validation_receipt,
    commercialValidationReceipt:
      contract.hero_assurance?.commercial_validation_receipt,
    resolvedSectionGraph: contract.resolved_section_graph,
    approvedArtifacts: contract.approved_artifacts,
    identitySourceArtifacts: contract.identity_source_artifacts,
    html: contract.html,
  };
}

test("G2 identity·G4 HTML/capture·독립 receipt가 일치한 Hero만 통과한다", () => {
  const contract = attachValidHeroAssurance(baseContract());
  const report = validateHeroOutputGate(gateInput(contract));

  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.ok(report.metrics.product_section_area_ratio > 0.35);
  assert.equal(report.metrics.commercial_score, 95);
  assert.doesNotThrow(() =>
    assertHeroOutputGate(gateInput(contract)),
  );
});

test("제품 bbox가 Hero 면적 기준보다 작으면 largest 자기선언 없이 차단한다", () => {
  const contract = attachValidHeroAssurance(baseContract(), {
    productBox: { x: 120, y: 300, width: 120, height: 120 },
  });
  const report = validateHeroOutputGate(gateInput(contract));

  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some(
      (error) => error.code === "HERO_PRODUCT_NOT_LARGEST",
    ),
    true,
  );
});

test("상업 시각 판정이 medium 점수면 high gate를 통과하지 못한다", () => {
  const contract = attachValidHeroAssurance(baseContract(), {
    commercialScore: 89,
  });
  const report = validateHeroOutputGate(gateInput(contract));

  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some(
      (error) =>
        error.code === "HERO_COMMERCIAL_INTENSITY_NOT_HIGH",
    ),
    true,
  );
});

test("G2 source와 승인 Hero asset identity trace가 다르면 차단한다", () => {
  const contract = attachValidHeroAssurance(baseContract());
  contract.hero_assurance.manifest.identity_trace_sha256 =
    "0".repeat(64);
  const report = validateHeroOutputGate(gateInput(contract));

  assert.equal(report.ok, false);
  assert.equal(
    report.errors.some(
      (error) => error.code === "HERO_IDENTITY_TRACE_MISMATCH",
    ),
    true,
  );
});

test("Hero subtree가 motion 대상이거나 benefit claim이 둘이면 차단한다", () => {
  const moving = attachValidHeroAssurance(baseContract());
  moving.html = moving.html.replace(
    "</figure>",
    "</figure><video autoplay></video>",
  );
  const movingReport = validateHeroOutputGate(gateInput(moving));
  assert.equal(
    movingReport.errors.some(
      (error) => error.code === "HERO_NOT_STATIC",
    ),
    true,
  );

  const twoBenefits = attachValidHeroAssurance(baseContract());
  twoBenefits.resolved_section_graph.sections[0].claims.push({
    claim_id: "claim-secondary",
  });
  const benefitsReport = validateHeroOutputGate(
    gateInput(twoBenefits),
  );
  assert.equal(
    benefitsReport.errors.some(
      (error) =>
        error.code === "HERO_PRIMARY_BENEFIT_COUNT_MISMATCH",
    ),
    true,
  );
});

test("Hero assurance나 독립 receipt 누락은 fail-closed다", () => {
  const missing = validateHeroOutputGate(gateInput(baseContract()));
  assert.equal(missing.ok, false);
  assert.equal(
    missing.errors.some(
      (error) =>
        error.code === "HERO_ASSURANCE_MANIFEST_REQUIRED",
    ),
    true,
  );

  const noReceipt = attachValidHeroAssurance(baseContract());
  delete noReceipt.hero_assurance.validation_receipt;
  assert.equal(validateHeroOutputGate(gateInput(noReceipt)).ok, false);
});

test("assurance 근거는 공개 HTML로 투영되지 않고 내부 data metadata도 0이다", () => {
  const contract = attachValidHeroAssurance(baseContract());
  const publicHtml = sanitizePublicHtml(contract.html);
  const privateValues = [
    contract.hero_assurance.manifest.identity_trace_sha256,
    contract.hero_assurance.manifest.capture.sha256,
    contract.hero_assurance.validation_receipt.validation_id,
  ];

  assert.doesNotMatch(publicHtml, /\sdata-[^=\s>]+(?:=|\s|>)/i);
  for (const value of privateValues) {
    assert.equal(publicHtml.includes(value), false);
  }
  assert.match(publicHtml, /alt="제품 전체 모습"/);
});
