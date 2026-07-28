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
  d08.version !== "v03" ||
  d08.path !==
    "asset/generated/pending/image/production-rev003-feedback/correction-05-d08/frame-000.png"
) {
  throw new Error("D08 v03 is not the selected production route");
}

const contactSheets = ["A", "B", "C", "D", "E"].map(
  (group) => `qa/evidence/g2-image-assets/contact-${group}-rev003.jpg`,
);
const comparisonSheet =
  "qa/evidence/g2-image-assets/d08-rev003-rejected-revised.jpg";
for (const evidencePath of [...contactSheets, comparisonSheet]) {
  if (!fs.existsSync(path.join(projectRoot, evidencePath))) {
    throw new Error(`Missing QA evidence: ${evidencePath}`);
  }
}

const qaReport = {
  schemaVersion: 1,
  gate: "G2 IMAGE_ASSETS",
  revisionId: "rev-003",
  projectRevisionId: "rev-006",
  status: "QA_PASS_PENDING_USER_REAPPROVAL",
  qaCompletedAt: now,
  uniqueAssetCount: 40,
  initialGenerationCount: 40,
  totalProductionGeneratedImageCount: 53,
  totalImageCountIncludingModelCandidates: 61,
  firstPassCount: 37,
  selectedCorrectedAssetCount: 10,
  currentFeedbackAssetCount: 1,
  exactSizePassCount: 40,
  productIdentityHardFailuresRemaining: 0,
  matchedPairHardFailuresRemaining: 0,
  modelIdentityHardFailuresRemaining: 0,
  prohibitedClaimFailuresRemaining: 0,
  textAndWatermarkFailuresRemaining: 0,
  userFeedback: "d08만 2개 같아야 하는데 이거 같게해줘.",
  correctionPolicy: {
    canonicalReference:
      "D08 v02 composition as Image 1; user-real-original pair as supporting identity reference",
    requiredPairIdentity:
      "same length, width, upper elastic, long cuff, thumb opening, label, and material",
    status: "D08 v02 changes_requested; D08 v03 pending",
  },
  contactSheets,
  comparisonSheet,
  revisedAssets: [d08],
  selectedAssets,
};
writeJson("qa/reports/g2-image-assets-rev003.json", qaReport);

const markdown = `# G2 이미지 소재 QA · rev003

- 제품명: 루즈핏 쿨토시
- 제조사: 살랑
- 생성기: 로컬 \`god-tibo-gpt-image2-skill\`
- 상태: D08 동일 한 쌍 교정 QA 통과, G2 재승인 대기

## 사용자 피드백

> d08만 2개 같아야 하는데 이거 같게해줘.

D08 v02는 덮어쓰지 않고 \`changes_requested\`로 보존했다. 기존 1024×1024 교차 플랫레이를 Image 1로 고정하고, 사용자 실사 한 쌍을 보조 동일성 기준으로 사용해 D08 v03만 새로 생성했다.

## D08 v03 판정

| 검사 항목 | 판정 |
|---|---|
| 정확히 두 개의 토시 | PASS |
| 두 토시의 전체 길이·폭 일치 | PASS |
| 상단 밴딩 폭·주름 밀도 일치 | PASS |
| 긴 손등 커프 길이·폭 일치 | PASS |
| 엄지 구멍 구조 일치 | PASS |
| \`HELLO / CUTE SLEEVE\` 라벨 크기·상대 위치 일치 | PASS |
| 얇은 광택·미세 가로결·세로 드레이프 일치 | PASS |
| 1024×1024 크기 | PASS |

## 선택 결과

- 이전 버전: D08 v02 · \`changes_requested\` · 비파괴 보존
- 선택 버전: D08 v03 · \`pending\` · G2 사용자 재승인 대기
- 선택 경로: \`${d08.path}\`
- SHA-256: \`${d08.sha256}\`
- 전체 선택 소재: 40개
- 본 제작 누적 생성: 53장
- 캐릭터 시트 후보 포함 누적 생성: 61장
- 지정 W×H 및 SHA-256 통과: 40개

## 검토 증거

- 실사·v02·v03 비교: \`${comparisonSheet}\`
- 전체 D그룹: \`qa/evidence/g2-image-assets/contact-D-rev003.jpg\`
- 전체 선택본: \`${contactSheets.join("`, `")}\`
- 기계 원장: \`qa/reports/g2-image-assets-rev003.json\`
- D08 교정 원장: \`production/d08-matched-pair-correction-report.json\`

## 승인 경계

내부 QA 통과는 사용자 승인을 대신하지 않는다. D08 v03은 \`asset/generated/pending/image\`에 보관했으며 사용자의 명시적 G2 재승인 전에는 다음 GIF·상세페이지 조립 단계로 넘기지 않는다.
`;
fs.writeFileSync(
  path.join(reportRoot, "g2-image-assets-rev003.md"),
  markdown,
  "utf8",
);

const artifactPaths = [
  "production/production-plan.json",
  "production/user-feedback-correction-report.json",
  "production/d08-matched-pair-correction-report.json",
  "qa/reports/g2-image-assets-rev003.json",
  "qa/reports/g2-image-assets-rev003.md",
  ...contactSheets,
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
- \`preparation_status\`: ready_for_user_reapproval_after_rev003
- \`required_approved_count\`: 40
- \`generated_count\`: 40
- \`total_generated_with_corrections\`: 53
- \`total_generated_including_model_candidates\`: 61
- \`first_pass_count\`: 37
- \`corrected_pass_count\`: 10
- \`current_feedback_asset_count\`: 1
- \`decision\`: pending
- \`decided_at\`:
- \`findings\`:
  - 사용자 피드백 \`d08만 2개 같아야 하는데 이거 같게해줘.\`를 D08 v02에 changes_requested로 기록했다.
  - D08 v02는 보존하고 D08 v03만 새로 생성·선택했다.
  - 두 토시의 전체 길이·폭·상단 밴딩·긴 커프·엄지 구멍·라벨·재질이 같은 판매 한 쌍으로 보이는지 확인했다.
  - D08 v03은 1024×1024와 SHA-256 무결성 검사를 통과했다.
  - 전체 선택본 40개의 제품·모델·미확인 성능·문자·워터마크 잔여 하드 실패는 0건이다.
- \`required_changes\`: 내부 QA 기준 추가 변경 없음. 사용자 G2 재승인 대기.
- \`user_confirmation\`: pending_after_rev003
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
const eventId = "g2-rev003-qa-pass-pending-user-reapproval";
if (!ledger.includes(`"eventId":"${eventId}"`)) {
  fs.appendFileSync(
    ledgerPath,
    `${JSON.stringify({
      eventId,
      gate: "G2 IMAGE_ASSETS",
      revisionId: "rev-003",
      projectRevisionId: "rev-006",
      decision: "pending",
      preparationStatus: "qa_pass_pending_user_reapproval",
      affectedAssetIds: ["D08"],
      selectedVersions: { D08: "v03" },
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
      exactSizePassCount: qaReport.exactSizePassCount,
      assetId: "D08",
      selectedVersion: "v03",
      comparisonSheet,
      report: "qa/reports/g2-image-assets-rev003.md",
    },
    null,
    2,
  ),
);
