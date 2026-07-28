import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../skills/detail-page-maker-skill",
);

async function skillFile(relativePath) {
  return readFile(path.join(SKILL_ROOT, relativePath), "utf8");
}

test("G0와 G1 준비 작업은 병렬이고 최종 승인은 순차다", async () => {
  const [skill, workflow, approval] = await Promise.all([
    skillFile("SKILL.md"),
    skillFile("references/workflow.md"),
    skillFile("references/approval-guide.md"),
  ]);

  for (const document of [skill, workflow, approval]) {
    assert.match(document, /G0/);
    assert.match(document, /G1/);
    assert.match(document, /병렬/);
  }

  assert.match(skill, /G0 → G1 → G2 → G3 → G4 → G5/);
  assert.match(workflow, /최종 승인은 `G0 → G1` 순서/);
  assert.match(approval, /G0 승인 전에는 G1을 `approved`로 기록하거나/);
});

test("G0 대기 중 G1 초안은 의존성과 임시 주장을 기록한다", async () => {
  const [
    commercial,
    commercialTemplate,
    designTemplate,
    buyerJourneyTemplate,
    gifTemplate,
    approvalsTemplate,
  ] =
    await Promise.all([
      skillFile("references/commercial.md"),
      skillFile("assets/project-template/COMMERCIAL.md"),
      skillFile("assets/project-template/DESIGN.md"),
      skillFile("assets/project-template/BUYER-JOURNEY.md"),
      skillFile("assets/project-template/GIF.md"),
      skillFile("assets/project-template/APPROVALS.md"),
    ]);

  for (const document of [
    commercial,
    commercialTemplate,
    designTemplate,
    buyerJourneyTemplate,
    gifTemplate,
    approvalsTemplate,
  ]) {
    assert.match(document, /g0_dependency/);
    assert.match(document, /provisional_claims/);
    assert.match(document, /blocked_until_g0/);
  }

  assert.match(commercial, /동종 제품 3개 이상과 공개 후기 원문/);
  assert.match(commercialTemplate, /PARALLEL_DRAFT_WITH_G0/);
  assert.match(approvalsTemplate, /preparation_status`: parallel_draft/);
  assert.match(approvalsTemplate, /decision`: held/);
});

test("제조사 제공 기능은 출처가 고정된 공개 사실로 사용하고 임의 수치를 만들지 않는다", async () => {
  const [skill, commercial, detailPage, qa, commercialTemplate] =
    await Promise.all([
      skillFile("SKILL.md"),
      skillFile("references/commercial.md"),
      skillFile("references/commercial-detail-page.md"),
      skillFile("references/commercial-qa.md"),
      skillFile("assets/project-template/COMMERCIAL.md"),
    ]);

  for (const document of [skill, commercial, detailPage, qa]) {
    assert.match(document, /MANUFACTURER_CLAIM/);
  }

  assert.match(commercial, /publishable: true/);
  assert.match(commercial, /정성 그래프/);
  assert.match(detailPage, /제조사가 수치를 제공하지 않았다면/);
  assert.match(qa, /임의 눈금·온도·비율·시간/);
  assert.match(commercialTemplate, /numeric_basis/);
});

test("핵심 장점은 정지 이미지와 GIF 뒤에 사용법·후기·문제 해결·스펙·리마인드로 이어진다", async () => {
  const [commercial, journey, commercialTemplate, journeyTemplate] =
    await Promise.all([
      skillFile("references/commercial.md"),
      skillFile("references/BUYER-JOURNEY.md"),
      skillFile("assets/project-template/COMMERCIAL.md"),
      skillFile("assets/project-template/BUYER-JOURNEY.md"),
    ]);

  assert.match(commercial, /간단한 사용법과 착용 GIF/);
  assert.match(commercial, /검증된 동일 SKU 사용자 후기/);
  assert.match(commercial, /사이즈·구성·상세 스펙/);
  assert.match(journey, /Recap problem and solution/);

  for (const document of [commercialTemplate, journeyTemplate]) {
    assert.match(document, /still_evidence_asset_id/);
    assert.match(document, /motion_evidence_asset_id/);
  }
});
