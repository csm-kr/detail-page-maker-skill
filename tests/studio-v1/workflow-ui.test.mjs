import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function studioFile(fileName) {
  return readFile(
    path.join(
      REPOSITORY_ROOT,
      "skills/detail-page-maker-skill/assets/studio-v1-runtime",
      fileName,
    ),
    "utf8",
  );
}

test("Studio에는 기존 편집 UI와 분리된 persistent workflow panel·workspace가 있다", async () => {
  const html = await studioFile("studio.html");

  assert.match(html, /data-studio-view="edit"/);
  assert.match(html, /data-studio-view="approval"/);
  assert.match(html, /data-studio-view="output"/);
  assert.match(html, /data-studio-view="workflow"/);
  assert.match(html, /data-side-panel="workflow"/);
  assert.match(html, /data-workspace="workflow"/);
  assert.match(html, /id="workflowStageList"/);
  assert.match(html, /id="workflowCurrentStage"/);
  assert.match(html, /id="workflowStageCount"/);
  assert.match(html, /30\+ 단계/);
});

test("workflow panel은 ready·blocked·stale와 artifact·validator·approval·G5 gate를 명시적 텍스트로 표시한다", async () => {
  const html = await studioFile("studio.html");

  for (const id of [
    "workflowReadyCount",
    "workflowBlockedCount",
    "workflowStaleCount",
    "workflowArtifactCount",
    "workflowValidatorSummary",
    "workflowApprovalSummary",
    "workflowG5Gate",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /상태를 색만으로 구분하지 않습니다/);
});

test("advance·resume와 exact challenge proof 승인·사유 필수 반려 control이 있다", async () => {
  const html = await studioFile("studio.html");

  assert.match(html, /id="workflowAdvance"/);
  assert.match(html, /id="workflowResume"/);
  assert.match(html, /id="workflowChallenge"/);
  assert.match(html, /id="workflowChallengeId"/);
  assert.match(html, /id="workflowChallengeDigest"/);
  assert.match(html, /id="workflowChallengeNonce"/);
  assert.match(html, /id="workflowProofConfirmed"[^>]*type="checkbox"/);
  assert.match(html, /id="workflowApprove"/);
  assert.match(html, /id="workflowReject"/);
  assert.match(
    html,
    /id="workflowRejectReason"[^>]*required|<textarea[^>]*required[^>]*id="workflowRejectReason"/,
  );
});

test("workflow script는 세 API를 사용하고 project proof를 수정 없이 decision에 돌려준다", async () => {
  const script = await studioFile("studio-v1.js");

  assert.match(script, /api\("\/api\/v1\/workflow"\)/);
  assert.match(script, /api\("\/api\/v1\/workflow\/advance"/);
  assert.match(script, /api\("\/api\/v1\/workflow\/decision"/);
  assert.match(script, /challenge_id:\s*workflowChallenge\.challenge_id/);
  assert.match(script, /nonce:\s*workflowChallenge\.nonce/);
  assert.match(
    script,
    /subject_artifact_set_digest:\s*workflowChallenge\.subject_artifact_set_digest/,
  );
  assert.match(script, /workflowRejectReason\.value\.trim\(\)/);
  assert.match(script, /REJECTION_REASON_REQUIRED|반려 사유/);
});

test("workflow 렌더링은 API 문자열에 innerHTML을 쓰지 않고 textContent·replaceChildren만 사용한다", async () => {
  const script = await studioFile("studio-v1.js");
  const start = script.indexOf("function renderWorkflow(");
  const end = script.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0, "renderWorkflow 함수가 필요합니다.");
  const body = script.slice(start, end < 0 ? undefined : end);

  assert.match(body, /textContent/);
  assert.match(body, /replaceChildren/);
  assert.doesNotMatch(body, /innerHTML/);
  assert.match(body, /Object\.entries\(workflow\.stages/);
  assert.match(body, /statusLabel|workflowStatusLabel/);
});

test("opaque authoring 메시지는 privileged 부모 DOM의 HTML sink로 들어가지 않는다", async () => {
  const script = await studioFile("studio-v1.js");

  assert.match(script, /event\.source\s*!==\s*preview\.contentWindow/);
  assert.doesNotMatch(
    script,
    /(?:selectedLabel|sectionSelect|outputSummary)\.innerHTML\s*=/,
  );
  assert.match(script, /selectedLabel\.replaceChildren/);
  assert.match(script, /sectionSelect\.replaceChildren/);
  assert.match(script, /outputSummary\.replaceChildren/);
  assert.match(script, /selected\.textContent\s*=\s*String/);
});

test("에셋 ledger에는 workflow G2U·G3U·G4U·G5U 승인을 대체할 수 없다는 배지가 있다", async () => {
  const [html, script] = await Promise.all([
    studioFile("studio.html"),
    studioFile("studio-v1.js"),
  ]);

  assert.match(html, /workflow 승인 대체 불가/);
  assert.match(html, /G2U.*G3U.*G4U.*G5U/s);
  assert.match(script, /substitutesStageApproval/);
  assert.match(script, /ledgerScope/);
});

test("workflow UI 스타일은 상태 label과 반응형 stage grid를 제공한다", async () => {
  const css = await studioFile("studio-v1.css");

  assert.match(css, /\.workflow-stage-grid/);
  assert.match(css, /\.workflow-stage-card/);
  assert.match(css, /\.workflow-status-label/);
  assert.match(css, /\.workflow-challenge/);
  assert.match(css, /\.legacy-ledger-badge/);
  assert.match(css, /@media \(max-width: 1050px\)/);
});
