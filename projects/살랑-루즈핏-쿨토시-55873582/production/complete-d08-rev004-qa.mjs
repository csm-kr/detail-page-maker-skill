import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const reportRoot = path.join(projectRoot, "qa", "reports");
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
      !fs.existsSync(path.join(projectRoot, asset.path)) ||
      hashFile(asset.path) !== asset.sha256,
  )
) {
  throw new Error("Selected 40-asset set is incomplete or failed integrity QA");
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

const d08 = selectedAssets.find((asset) => asset.assetId === "D08");
if (
  !d08 ||
  d08.version !== "v04" ||
  d08.path !==
    "asset/generated/pending/image/production-rev004-feedback/correction-06-d08-nonoverlap-candidates/frame-002.png"
) {
  throw new Error("D08 v04 candidate C03 is not the selected route");
}

const candidateReport = readJson(
  "production/d08-nonoverlap-candidates-report.json",
);
if (
  candidateReport.candidates?.length !== 8 ||
  candidateReport.selectedVersion?.candidateId !== "D08-C03" ||
  candidateReport.selectedVersion?.frameIndex !== 2
) {
  throw new Error("D08 candidate selection report is inconsistent");
}

const contactSheets = ["A", "B", "C", "D", "E"].map(
  (group) => `qa/evidence/g2-image-assets/contact-${group}-rev004.jpg`,
);
const candidateSheet =
  "qa/evidence/g2-image-assets/d08-rev004-candidates-8up.jpg";
const comparisonSheet =
  "qa/evidence/g2-image-assets/d08-rev004-rejected-selected.jpg";
for (const evidencePath of [
  ...contactSheets,
  candidateSheet,
  comparisonSheet,
]) {
  if (!fs.existsSync(path.join(projectRoot, evidencePath))) {
    throw new Error(`Missing QA evidence: ${evidencePath}`);
  }
}

const qaReport = {
  schemaVersion: 1,
  gate: "G2 IMAGE_ASSETS",
  revisionId: "rev-004",
  projectRevisionId: "rev-008",
  status: "QA_PASS_PENDING_USER_REAPPROVAL",
  qaCompletedAt: now,
  uniqueAssetCount: 40,
  initialGenerationCount: 40,
  currentCandidateGenerationCount: 8,
  totalProductionGeneratedImageCount: 61,
  totalImageCountIncludingModelCandidates: 69,
  firstPassCount: 37,
  selectedCorrectedAssetCount: 10,
  currentFeedbackAssetCount: 1,
  currentCandidateCount: 8,
  currentSelectedCandidateId: "D08-C03",
  currentSelectedFrameIndex: 2,
  exactSizePassCount: 40,
  productIdentityHardFailuresRemaining: 0,
  productOverlapHardFailuresRemaining: 0,
  matchedPairHardFailuresRemaining: 0,
  modelIdentityHardFailuresRemaining: 0,
  prohibitedClaimFailuresRemaining: 0,
  textAndWatermarkFailuresRemaining: 0,
  userFeedback:
    "음 x 자 에서 두개가 겹쳐서 나와서 리젝, 이거 여러개 만들어서 괜찮은거 찾아서 해줘",
  correctionPolicy: {
    canonicalReference: "user-real-original pair as Image 1",
    hardRequirement:
      "exactly two matched sleeves, parallel, independently visible, continuous background gap, no contact or overlap",
    selection:
      "generated 8 candidates with 8 workers; selected D08-C03 / frame-002",
    status: "D08 v03 changes_requested; D08 v04 pending",
  },
  contactSheets,
  candidateSheet,
  comparisonSheet,
  revisedAssets: [d08],
  candidateEvaluations: candidateReport.candidates,
  selectedAssets,
};
writeJson("qa/reports/g2-image-assets-rev004.json", qaReport);

const markdown = `# G2 이미지 소재 QA · rev004

- 제품명: 루즈핏 쿨토시
- 제조사: 살랑
- 생성기: 로컬 \`god-tibo-gpt-image2-skill\`
- 상태: D08 비겹침 후보 8장 비교·선택 완료, G2 재승인 대기

## 사용자 피드백

> 음 x 자 에서 두개가 겹쳐서 나와서 리젝, 이거 여러개 만들어서 괜찮은거 찾아서 해줘

D08 v03은 \`changes_requested\`로 보존했다. 사용자 실사 한 쌍을 Image 1 제품 SSOT로 고정하고 8개 워커로 1024×1024 후보 8장을 병렬 생성했다.

## 하드 판정 기준

- 정확히 두 개의 토시
- 두 제품 사이가 위에서 아래까지 연속된 배경으로 분리
- 접촉·교차·겹침·X자·서로의 그림자 침범 없음
- 두 제품의 전체 외곽과 네 끝이 모두 노출
- 전체 길이·폭·상단 밴딩·긴 커프·엄지 구멍·라벨·재질 일치
- 정확한 1024×1024와 SHA-256 무결성

## 선택 결과

- 생성 후보: 8장
- 선택: \`D08-C03\` · \`frame-002.png\`
- 선택 버전: D08 v04
- 선택 이유: 연속 배경 간격, 상·하단 수평 정렬, 좌우 비례, 미러 커프·엄지 구멍·라벨 구조가 가장 안정적
- 차선: D08-C08 · 간격과 상단 안전 여백이 선택본보다 좁아 미선택
- 이전 D08 v03: X자 겹침으로 반려·비파괴 보존
- 본 제작 누적 생성: 61장
- 캐릭터 시트 후보 포함 누적 생성: 69장
- 전체 선택본 지정 W×H 및 SHA-256 통과: 40개

## 선택본 QA

| 검사 항목 | 판정 |
|---|---|
| 제품 수량 2개 | PASS |
| 제품 간 접촉·교차·겹침 없음 | PASS |
| 위에서 아래까지 연속 배경 간격 | PASS |
| 두 제품 전체 외곽 노출 | PASS |
| 좌우 길이·폭·밴딩·커프 일치 | PASS |
| 엄지 구멍과 라벨 미러 구조 | PASS |
| 실사 재질·드레이프 동일성 | PASS |
| 1024×1024 및 SHA-256 | PASS |

## 검토 증거

- 후보 8장: \`${candidateSheet}\`
- 실사·반려 v03·선택 v04: \`${comparisonSheet}\`
- 전체 D그룹: \`qa/evidence/g2-image-assets/contact-D-rev004.jpg\`
- 선택 원본: \`${d08.path}\`
- 기계 원장: \`qa/reports/g2-image-assets-rev004.json\`
- 후보 판정 원장: \`production/d08-nonoverlap-candidates-report.json\`

## 승인 경계

D08 v04는 내부 QA를 통과했지만 사용자 승인을 대신하지 않는다. 선택본은 \`asset/generated/pending/image\`에 보관했으며 명시적 G2 재승인 전에는 다음 GIF·상세페이지 조립 단계로 넘기지 않는다.
`;
fs.writeFileSync(
  path.join(reportRoot, "g2-image-assets-rev004.md"),
  markdown,
  "utf8",
);

const artifactPaths = [
  "production/production-plan.json",
  "production/user-feedback-correction-report.json",
  "production/d08-nonoverlap-candidates-report.json",
  "qa/reports/g2-image-assets-rev004.json",
  "qa/reports/g2-image-assets-rev004.md",
  ...contactSheets,
  candidateSheet,
  comparisonSheet,
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
- \`preparation_status\`: ready_for_user_reapproval_after_rev004
- \`required_approved_count\`: 40
- \`generated_count\`: 40
- \`current_candidate_count\`: 8
- \`selected_candidate\`: D08-C03 / frame-002 / D08 v04
- \`total_generated_with_corrections\`: 61
- \`total_generated_including_model_candidates\`: 69
- \`first_pass_count\`: 37
- \`corrected_pass_count\`: 10
- \`current_feedback_asset_count\`: 1
- \`decision\`: pending
- \`decided_at\`:
- \`findings\`:
  - 사용자 피드백에 따라 X자 겹침 D08 v03을 changes_requested로 기록했다.
  - 실사 한 쌍을 Image 1로 고정하고 8개 워커로 비겹침 후보 8장을 병렬 생성했다.
  - 후보 전체에서 제품 수량 2개, 접촉·교차·겹침 없음, 연속 배경 간격, 전체 외곽 노출을 확인했다.
  - 상·하단 정렬, 좌우 길이·폭, 미러 커프·엄지 구멍·라벨 구조가 가장 안정적인 D08-C03을 D08 v04로 선택했다.
  - D08 v04와 전체 선택본 40개가 지정 W×H와 SHA-256 검사를 통과했다.
- \`required_changes\`: 내부 QA 기준 추가 변경 없음. 사용자 G2 재승인 대기.
- \`user_confirmation\`: pending_after_rev004
`;
const nextApprovals = approvals.replace(
  /## G2 IMAGE_ASSETS[\s\S]*?(?=\r?\n## G3 GIF_MOTION)/,
  g2Block.trimEnd(),
);
if (nextApprovals === approvals) {
  throw new Error("Could not update G2 block in planning/APPROVALS.md");
}
fs.writeFileSync(approvalsPath, nextApprovals, "utf8");

const ledgerPath = path.join(
  projectRoot,
  "asset",
  "approval-ledger.ndjson",
);
const ledger = fs.readFileSync(ledgerPath, "utf8");
const eventId = "g2-rev004-qa-pass-pending-user-reapproval";
if (!ledger.includes(`"eventId":"${eventId}"`)) {
  fs.appendFileSync(
    ledgerPath,
    `${JSON.stringify({
      eventId,
      gate: "G2 IMAGE_ASSETS",
      revisionId: "rev-004",
      projectRevisionId: "rev-008",
      decision: "pending",
      preparationStatus: "qa_pass_pending_user_reapproval",
      affectedAssetIds: ["D08"],
      candidateCount: 8,
      selectedCandidateId: "D08-C03",
      selectedFrameIndex: 2,
      selectedVersions: { D08: "v04" },
      candidateSheet,
      comparisonSheet,
      recordedAt: now,
    })}\n`,
    "utf8",
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      status: qaReport.status,
      generatedCandidates: 8,
      selectedCandidateId: qaReport.currentSelectedCandidateId,
      selectedFrameIndex: qaReport.currentSelectedFrameIndex,
      selectedVersion: d08.version,
      exactSizePassCount: qaReport.exactSizePassCount,
      report: "qa/reports/g2-image-assets-rev004.md",
    },
    null,
    2,
  ),
);
