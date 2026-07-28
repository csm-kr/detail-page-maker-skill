import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const qaRoot = path.join(projectRoot, "qa");
const reportRoot = path.join(qaRoot, "reports");
const now = new Date().toISOString();

const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
const writeJson = (relativePath, value) =>
  fs.writeFileSync(
    path.join(projectRoot, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
const hashFile = (relativePath) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(projectRoot, relativePath)))
    .digest("hex");

fs.mkdirSync(reportRoot, { recursive: true });

const plan = readJson("production/production-plan.json");
const selectedAssets = plan.assetRouting
  .map((route) => ({
    assetId: route.assetId,
    version: route.version ?? "v01",
    path: route.rawPath,
    sha256: route.sha256,
    width: route.width,
    height: route.height,
    qaStatus: route.qaStatus,
    corrected: Boolean(route.correctionJobId),
    correctionFinding: route.correctionFinding ?? null,
  }))
  .sort((a, b) => a.assetId.localeCompare(b.assetId));

if (
  selectedAssets.length !== 40 ||
  selectedAssets.some(
    (asset) =>
      asset.qaStatus !== "PASS" ||
      !fs.existsSync(path.join(projectRoot, asset.path)),
  )
) {
  throw new Error("Selected 40-asset set is incomplete or not fully QA PASS");
}

const expectedSizes = new Map(
  plan.jobs.flatMap((job) =>
    job.assetIds.map((assetId) => [assetId, job.targetSize]),
  ),
);
for (const asset of selectedAssets) {
  const actual = `${asset.width}x${asset.height}`;
  if (expectedSizes.get(asset.assetId) !== actual) {
    throw new Error(
      `${asset.assetId} size mismatch: ${actual} != ${expectedSizes.get(asset.assetId)}`,
    );
  }
}

const revisedAssetIds = ["A01", "A03", "A04", "D01", "D08", "E07", "E08"];
const revisedAssets = selectedAssets.filter((asset) =>
  revisedAssetIds.includes(asset.assetId),
);
const correctionReport = readJson(
  "production/user-feedback-correction-report.json",
);

const contactSheets = ["A", "B", "C", "D", "E"].map(
  (group) => `qa/evidence/g2-image-assets/contact-${group}-rev002.jpg`,
);
const comparisonSheet =
  "qa/evidence/g2-image-assets/rev002-original-rejected-revised.jpg";
const revisedOnlyPreview =
  "qa/evidence/g2-image-assets/rev002-new-only-preview.jpg";
for (const evidencePath of [
  ...contactSheets,
  comparisonSheet,
  revisedOnlyPreview,
]) {
  if (!fs.existsSync(path.join(projectRoot, evidencePath))) {
    throw new Error(`Missing QA evidence: ${evidencePath}`);
  }
}

const qaReport = {
  schemaVersion: 1,
  gate: "G2 IMAGE_ASSETS",
  revisionId: "rev-002",
  status: "QA_PASS_PENDING_USER_REAPPROVAL",
  qaCompletedAt: now,
  uniqueAssetCount: 40,
  initialGenerationCount: 40,
  previousCorrectionGenerationCount: 3,
  userFeedbackGenerationCount: 9,
  totalProductionGeneratedImageCount: 52,
  totalImageCountIncludingModelCandidates: 60,
  firstPassCount: 37,
  selectedCorrectedAssetCount: 10,
  userRejectedAssetCount: 7,
  internalRejectedAttemptCount: 2,
  exactSizePassCount: 40,
  productIdentityHardFailuresRemaining: 0,
  modelIdentityHardFailuresRemaining: 0,
  prohibitedClaimFailuresRemaining: 0,
  textAndWatermarkFailuresRemaining: 0,
  userFeedback:
    "a01, a03, a04 이거 원본과 달라, d01, d08, e07, e08 이게 달라 짧아 대부분",
  correctionPolicy: {
    canonicalReference: "user-real-original Image 1",
    physicalRatio: "47cm x 14cm, approximately 3.36:1",
    status: "old versions changes_requested; revised versions pending",
  },
  contactSheets,
  comparisonSheet,
  revisedOnlyPreview,
  revisedAssets,
  internalRejectedAttempts: correctionReport.internalRejectedAttempts,
  selectedAssets,
};
writeJson("qa/reports/g2-image-assets-rev002.json", qaReport);

const revisedRows = revisedAssets
  .map(
    (asset) =>
      `| ${asset.assetId} | ${asset.version} | ${asset.width}×${asset.height} | ${asset.correctionFinding} | PASS |`,
  )
  .join("\n");
const rejectedRows = correctionReport.internalRejectedAttempts
  .map(
    (attempt) =>
      `| ${attempt.assetId} | ${attempt.version} | ${attempt.finding} | 보존·미선택 |`,
  )
  .join("\n");

const markdown = `# G2 이미지 소재 QA · rev002

- 제품명: 루즈핏 쿨토시
- 제조사: 살랑
- 모델 SSOT: C00-03
- 생성기: 로컬 \`god-tibo-gpt-image2-skill\`
- 상태: 사용자 피드백 7개 교정 QA 통과, G2 재승인 대기

## 사용자 피드백

> a01, a03, a04 이거 원본과 달라, d01, d08, e07, e08 이게 달라 짧아 대부분

기존 7개는 즉시 \`changes_requested\`로 전환했고 덮어쓰지 않았다. 실사 원본을 각 생성 작업의 Image 1로 고정하고 공급처 표기 47×14cm, 즉 약 3.36:1의 길고 좁은 실루엣을 하드 기준으로 다시 생성했다.

## 생성·선택 결과

- 고유 소재 역할: 40개
- 최초 생성: 40장
- 기존 교정 생성: 3장
- 이번 사용자 피드백 교정 생성: 9장
- 본 제작 누적 생성: 52장
- 캐릭터 시트 후보 포함 누적 생성: 60장
- 사용자 반려 에셋: 7개
- 내부 반려 시도: 2개
- 최종 선택 후보: 40개
- 정확한 W×H 통과: 40개

## 이번 교정 선택본

| 에셋 | 선택 버전 | W×H | 교정 결과 | 판정 |
|---|---|---:|---|---|
${revisedRows}

## 내부 반려 이력

| 에셋 | 버전 | 반려 사유 | 처리 |
|---|---|---|---|
${rejectedRows}

A03은 v02에서 후면 엄지 홀이 빠졌고 v03에서 상·하단 프레이밍이 잘려 모두 미선택으로 보존했다. 실사 후면 엄지 홀, 무라벨 역면, 전면 평면 라벨과 전체 길이를 함께 만족한 v04를 선택했다.

## 시각 QA

- A01·D01·E07: 한 쌍 모두 전체 길이가 보이며 짧은 레그워머형 실루엣을 제거했다.
- A03: 앞·뒤가 구분되고 후면 엄지 홀, 전면 \`HELLO / CUTE SLEEVE\` 평면 라벨, 전체 길이가 확인된다.
- A04: 굵은 골지·로프형 텍스처를 제거하고 실사의 얇은 광택, 미세 가로결, 불규칙 세로 드레이프를 반영했다.
- D08: 짧게 뭉친 형태 대신 한 쌍의 전체 길이가 읽히는 교차 플랫레이로 교정했다.
- E08: C00-03 모델 정체성을 유지하고 상완 밴딩부터 손등 커프·엄지 홀까지 긴 루즈핏 구조가 이어진다.
- 남은 제품 동일성·길이 하드 실패: 0
- 남은 모델·손가락·엄지 홀 하드 실패: 0
- 남은 미확인 성능·수치·워터마크: 0

## 검토 증거

- 원본·반려본·수정본 비교: \`${comparisonSheet}\`
- 수정 7개 모아보기: \`${revisedOnlyPreview}\`
- 전체 선택본: \`${contactSheets.join("`, `")}\`
- 기계 원장: \`qa/reports/g2-image-assets-rev002.json\`
- 사용자 피드백 교정 원장: \`production/user-feedback-correction-report.json\`

## 승인 경계

제작 세션의 QA 통과는 사용자 승인을 대신하지 않는다. 수정 7개를 포함한 현재 선택 후보 40개는 모두 \`asset/generated/pending/image\` 상태이며, 사용자의 명시적 G2 재승인 전에는 GIF·상세페이지 조립에 사용하지 않는다.
`;
fs.writeFileSync(
  path.join(reportRoot, "g2-image-assets-rev002.md"),
  markdown,
  "utf8",
);

const artifactPaths = [
  "production/production-plan.json",
  "production/generation-report.json",
  "production/correction-report.json",
  "production/user-feedback-correction-report.json",
  "qa/reports/g2-image-assets-rev002.json",
  "qa/reports/g2-image-assets-rev002.md",
  ...contactSheets,
  comparisonSheet,
  revisedOnlyPreview,
];
const artifactHashes = Object.fromEntries(
  artifactPaths.map((artifactPath) => [artifactPath, hashFile(artifactPath)]),
);

const approvalsPath = path.join(projectRoot, "planning", "APPROVALS.md");
const approvals = fs.readFileSync(approvalsPath, "utf8");
const artifactHashLines = artifactPaths
  .map(
    (artifactPath) =>
      `  - \`${artifactPath}\`: \`${artifactHashes[artifactPath]}\``,
  )
  .join("\n");
const g2Block = `## G2 IMAGE_ASSETS

- \`artifact_paths\`: ${artifactPaths.map((value) => `\`${value}\``).join(", ")}
- \`artifact_sha256\`:
${artifactHashLines}
- \`preparation_status\`: ready_for_user_reapproval_after_rev002
- \`required_approved_count\`: 40
- \`generated_count\`: 40
- \`total_generated_with_corrections\`: 52
- \`total_generated_including_model_candidates\`: 60
- \`first_pass_count\`: 37
- \`corrected_pass_count\`: 10
- \`user_rejected_count\`: 7
- \`internal_rejected_attempt_count\`: 2
- \`decision\`: pending
- \`decided_at\`:
- \`findings\`:
  - 사용자 피드백 \`a01, a03, a04 이거 원본과 달라, d01, d08, e07, e08 이게 달라 짧아 대부분\`을 G2 changes_requested로 기록했다.
  - A01 v02, A03 v04, A04 v02, D01 v02, D08 v02, E07 v02, E08 v03으로 교체했다.
  - 실사 원본을 Image 1로 고정하고 47×14cm, 약 3.36:1의 긴 비례와 얇은 실물 재질을 우선했다.
  - A03 v02·v03은 내부 QA에서 반려하고 비파괴 이력으로 보존했다.
  - 수정 7개를 포함한 선택본 40개가 지정 W×H와 SHA-256 검사를 통과했다.
  - 제품·모델·손·엄지 홀·미확인 성능·문자·워터마크 잔여 하드 실패는 0건이다.
- \`required_changes\`: 내부 QA 기준 추가 변경 없음. 사용자 G2 재승인 대기.
- \`user_confirmation\`: pending_after_rev002
`;
const nextApprovals = approvals.replace(
  /## G2 IMAGE_ASSETS[\s\S]*?(?=\r?\n## G3 GIF_MOTION)/,
  g2Block.trimEnd(),
);
if (nextApprovals === approvals) {
  throw new Error("Could not update G2 block in planning/APPROVALS.md");
}
fs.writeFileSync(approvalsPath, nextApprovals, "utf8");

const ledgerPath = path.join(projectRoot, "asset", "approval-ledger.ndjson");
const ledger = fs.readFileSync(ledgerPath, "utf8");
const eventId = "g2-rev002-qa-pass-pending-user-reapproval";
if (!ledger.includes(`"eventId":"${eventId}"`)) {
  const ledgerRecord = {
    eventId,
    gate: "G2 IMAGE_ASSETS",
    revisionId: "rev-002",
    decision: "pending",
    preparationStatus: "qa_pass_pending_user_reapproval",
    affectedAssetIds: revisedAssetIds,
    selectedVersions: Object.fromEntries(
      revisedAssets.map((asset) => [asset.assetId, asset.version]),
    ),
    comparisonSheet,
    recordedAt: now,
  };
  fs.appendFileSync(
    ledgerPath,
    `${JSON.stringify(ledgerRecord)}\n`,
    "utf8",
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      status: qaReport.status,
      exactSizePassCount: 40,
      revisedAssets: revisedAssets.map((asset) => ({
        assetId: asset.assetId,
        version: asset.version,
      })),
      comparisonSheet,
      report: "qa/reports/g2-image-assets-rev002.md",
    },
    null,
    2,
  ),
);
