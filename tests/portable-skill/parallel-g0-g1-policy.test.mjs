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
  const [skill, workflow] = await Promise.all([
    skillFile("SKILL.md"),
    skillFile("references/workflow.md"),
  ]);

  for (const document of [skill, workflow]) {
    assert.match(document, /G0/);
    assert.match(document, /G1/);
  }
  assert.match(skill, /G0 → G1 → G2 → G3 → G4 → G5/);
  assert.match(workflow, /병렬/);
  assert.match(workflow, /G0 승인 전에는 G1을 `approved`로 기록하거나/);
});

test("G0 대기 중 G1 초안은 의존성과 임시 주장을 기록한다", async () => {
  const [
    workflow,
    commercialTemplate,
    designTemplate,
    buyerJourneyTemplate,
    gifTemplate,
    approvalsTemplate,
  ] = await Promise.all([
    skillFile("references/workflow.md"),
    skillFile("assets/project-template/COMMERCIAL.md"),
    skillFile("assets/project-template/DESIGN.md"),
    skillFile("assets/project-template/BUYER-JOURNEY.md"),
    skillFile("assets/project-template/GIF.md"),
    skillFile("assets/project-template/APPROVALS.md"),
  ]);

  for (const document of [
    workflow,
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
});

test("제조사 제공 기능은 출처가 고정된 사실만 허용하고 임의 수치를 막는다", async () => {
  const [workflow, evidence, commercial, motion, publish] = await Promise.all([
    skillFile("references/workflow.md"),
    skillFile("references/evidence.md"),
    skillFile("references/commercial.md"),
    skillFile("references/motion.md"),
    skillFile("references/publish.md"),
  ]);

  for (const document of [workflow, evidence, commercial]) {
    assert.match(document, /MANUFACTURER_CLAIM/);
  }
  assert.match(commercial, /numeric_basis: none/);
  assert.match(motion, /정량 시험이 없는/);
  assert.match(publish, /임의 수치/);
});

test("상업 서사는 장점별 still·motion 뒤에 사용·구매 정보를 잇는다", async () => {
  const [commercial, commercialTemplate, journeyTemplate] = await Promise.all([
    skillFile("references/commercial.md"),
    skillFile("assets/project-template/COMMERCIAL.md"),
    skillFile("assets/project-template/BUYER-JOURNEY.md"),
  ]);

  assert.match(
    commercial,
    /각 장점의 정지 이미지·전용 motion·근거·체감 의견/,
  );
  assert.match(commercial, /준비·사용·결과/);
  assert.match(commercial, /사이즈·구성·상세 스펙/);
  for (const document of [commercialTemplate, journeyTemplate]) {
    assert.match(document, /still_evidence_asset_id/);
    assert.match(document, /motion_evidence_asset_id/);
  }
});
