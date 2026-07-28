import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const projectRevisionId = "rev-009";
const gateRevisionId = "rev-004";
const gate = "G2 IMAGE_ASSETS";
const userConfirmation = "승인";

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
const imageSize = (relativePath) => {
  const bytes = fs.readFileSync(path.join(projectRoot, relativePath));
  if (
    bytes.length < 24 ||
    bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a"
  ) {
    throw new Error(`Not a valid PNG: ${relativePath}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
};

const plan = readJson("production/production-plan.json");
const manifest = readJson("asset/asset-manifest.json");
const project = readJson("project.json");
const qaReport = readJson("qa/reports/g2-image-assets-rev004.json");
const feedbackReport = readJson(
  "production/user-feedback-correction-report.json",
);
const candidateReport = readJson(
  "production/d08-nonoverlap-candidates-report.json",
);

const existingApprovedAt =
  plan.g2ApprovedAt ??
  project.g2Approval?.approvedAt ??
  qaReport.approvedAt ??
  null;
const approvedAt = existingApprovedAt || new Date().toISOString();

const selectedRoutes = [...plan.assetRouting].sort((a, b) =>
  a.assetId.localeCompare(b.assetId),
);
if (selectedRoutes.length !== 40) {
  throw new Error(
    `G2 requires exactly 40 selected assets; found ${selectedRoutes.length}`,
  );
}

const expectedSizes = new Map(
  plan.jobs.flatMap((job) =>
    job.assetIds.map((assetId) => [assetId, job.targetSize]),
  ),
);
const selectedVersions = {};
const selectedHashes = {};
for (const route of selectedRoutes) {
  route.version ??= "v01";
  if (route.qaStatus !== "PASS") {
    throw new Error(`${route.assetId} has not passed QA`);
  }
  const absolutePath = path.join(projectRoot, route.rawPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing selected asset: ${route.rawPath}`);
  }
  const actualHash = hashFile(route.rawPath);
  if (actualHash !== route.sha256) {
    throw new Error(
      `${route.assetId} SHA-256 mismatch: ${actualHash} != ${route.sha256}`,
    );
  }
  const actualSize = imageSize(route.rawPath);
  const actualWxH = `${actualSize.width}x${actualSize.height}`;
  const expectedWxH = expectedSizes.get(route.assetId);
  if (
    actualSize.width !== route.width ||
    actualSize.height !== route.height ||
    actualWxH !== expectedWxH
  ) {
    throw new Error(
      `${route.assetId} size mismatch: ${actualWxH} != ${expectedWxH}`,
    );
  }
  selectedVersions[route.assetId] = route.version;
  selectedHashes[route.assetId] = route.sha256;
}

const d08 = selectedRoutes.find((route) => route.assetId === "D08");
if (
  !d08 ||
  d08.version !== "v04" ||
  d08.selectedCandidateId !== "D08-C03" ||
  d08.rawPath !==
    "asset/generated/pending/image/production-rev004-feedback/correction-06-d08-nonoverlap-candidates/frame-002.png" ||
  d08.sha256 !==
    "a34a946384a068c30b7be8f7f7a21d3a14329923f1729b769ca1fad513c9e8e1"
) {
  throw new Error("The approved D08 v04 / D08-C03 selection is not intact");
}

if (
  candidateReport.candidates?.length !== 8 ||
  candidateReport.selectedVersion?.candidateId !== "D08-C03" ||
  candidateReport.selectedVersion?.frameIndex !== 2
) {
  throw new Error("D08 candidate report is inconsistent with the selection");
}

for (const route of selectedRoutes) {
  const matches = manifest.assets.filter(
    (asset) =>
      asset.id === route.assetId &&
      asset.version === route.version &&
      asset.path === route.rawPath,
  );
  if (matches.length !== 1) {
    throw new Error(
      `${route.assetId} ${route.version} must match exactly one manifest entry; found ${matches.length}`,
    );
  }
  const asset = matches[0];
  asset.status = "approved";
  asset.qaStatus = "PASS";
  asset.approvalGate = gate;
  asset.approvedBy = "human_user";
  asset.approvedAt = approvedAt;
  asset.userConfirmation = userConfirmation;
  route.status = "approved";
  route.approvedBy = "human_user";
  route.approvedAt = approvedAt;
  route.userConfirmation = userConfirmation;
}
manifest.updatedAt = approvedAt;

plan.status = "g2-approved-ready-for-g3";
plan.qaStatus = "PASS";
plan.g2Decision = "approved";
plan.g2ApprovedAt = approvedAt;
plan.g2ApprovedBy = "human_user";
plan.g2UserConfirmation = userConfirmation;
plan.nextGate = "G3 GIF_MOTION";
plan.selectedAssetCount = 40;

qaReport.status = "G2_APPROVED";
qaReport.decision = "approved";
qaReport.approvedAt = approvedAt;
qaReport.approvedBy = "human_user";
qaReport.userConfirmation = userConfirmation;
qaReport.approvalProjectRevisionId = projectRevisionId;
qaReport.selectedAssetCount = 40;
qaReport.nextGate = "G3 GIF_MOTION";
qaReport.selectedAssets = qaReport.selectedAssets.map((asset) => ({
  ...asset,
  status: "approved",
  approvalGate: gate,
  approvedAt,
  approvedBy: "human_user",
}));

feedbackReport.status = "g2-approved";
feedbackReport.approvedAt = approvedAt;
feedbackReport.approvedBy = "human_user";
feedbackReport.approvalUserConfirmation = userConfirmation;
feedbackReport.approvalProjectRevisionId = projectRevisionId;

candidateReport.status = "g2-approved";
candidateReport.approvedAt = approvedAt;
candidateReport.approvedBy = "human_user";
candidateReport.approvalUserConfirmation = userConfirmation;
candidateReport.approvalProjectRevisionId = projectRevisionId;
candidateReport.selectedVersion.status = "approved";
candidateReport.selectedVersion.approvedAt = approvedAt;
candidateReport.selectedVersion.approvedBy = "human_user";

project.phase = "gif_motion_planning";
project.currentRevisionId = projectRevisionId;
project.updatedAt = approvedAt;
project.nextGate = "G3 GIF_MOTION";
project.g2UserFeedback = {
  ...project.g2UserFeedback,
  status: "approved",
  approvedAt,
  approvedBy: "human_user",
  approvalUserConfirmation: userConfirmation,
};
project.g2Approval = {
  gate,
  revisionId: gateRevisionId,
  projectRevisionId,
  decision: "approved",
  approvedAt,
  approvedBy: "human_user",
  userConfirmation,
  selectedAssetCount: 40,
  selectedVersions,
  selectedHashes,
  selectedCandidate: {
    assetId: "D08",
    candidateId: "D08-C03",
    frameIndex: 2,
    version: "v04",
    path: d08.rawPath,
    sha256: d08.sha256,
  },
  nextGate: "G3 GIF_MOTION",
};

writeJson("asset/asset-manifest.json", manifest);
writeJson("production/production-plan.json", plan);
writeJson("project.json", project);
writeJson("qa/reports/g2-image-assets-rev004.json", qaReport);
writeJson("production/user-feedback-correction-report.json", feedbackReport);
writeJson(
  "production/d08-nonoverlap-candidates-report.json",
  candidateReport,
);

const qaMarkdownPath = path.join(
  projectRoot,
  "qa",
  "reports",
  "g2-image-assets-rev004.md",
);
let qaMarkdown = fs.readFileSync(qaMarkdownPath, "utf8");
qaMarkdown = qaMarkdown.replace(
  "- 상태: D08 비겹침 후보 8장 비교·선택 완료, G2 재승인 대기",
  `- 상태: G2 사용자 승인 완료 (${approvedAt})`,
);
qaMarkdown = qaMarkdown.replace(
  /## 승인 경계[\s\S]*$/,
  `## 승인 결과

- 사용자 확인: \`${userConfirmation}\`
- 승인 시각: \`${approvedAt}\`
- 승인 범위: D08 v04를 포함한 현재 선택본 40개
- 다음 게이트: \`G3 GIF_MOTION\`

D08 v01~v03과 다른 반려본은 \`changes_requested\` 상태로 비파괴 보존한다. 승인된 40개만 다음 GIF 제작의 입력으로 사용할 수 있다.
`,
);
fs.writeFileSync(qaMarkdownPath, qaMarkdown, "utf8");

const contactSheets = ["A", "B", "C", "D", "E"].map(
  (group) => `qa/evidence/g2-image-assets/contact-${group}-rev004.jpg`,
);
const candidateSheet =
  "qa/evidence/g2-image-assets/d08-rev004-candidates-8up.jpg";
const comparisonSheet =
  "qa/evidence/g2-image-assets/d08-rev004-rejected-selected.jpg";
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
for (const artifactPath of artifactPaths) {
  if (!fs.existsSync(path.join(projectRoot, artifactPath))) {
    throw new Error(`Missing approval artifact: ${artifactPath}`);
  }
}
const artifactHashes = Object.fromEntries(
  artifactPaths.map((artifactPath) => [artifactPath, hashFile(artifactPath)]),
);

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
- \`preparation_status\`: approved_after_rev004
- \`required_approved_count\`: 40
- \`generated_count\`: 40
- \`current_candidate_count\`: 8
- \`selected_candidate\`: D08-C03 / frame-002 / D08 v04
- \`total_generated_with_corrections\`: 61
- \`total_generated_including_model_candidates\`: 69
- \`first_pass_count\`: 37
- \`corrected_pass_count\`: 10
- \`current_feedback_asset_count\`: 1
- \`decision\`: approved
- \`decided_at\`: ${approvedAt}
- \`findings\`:
  - 사용자가 D08 v04를 포함한 현재 선택본 40개를 승인했다.
  - 선택본 40개는 모두 지정 W×H, SHA-256, 내부 QA PASS를 다시 확인했다.
  - D08-C03은 제품 두 개가 접촉·교차·겹침 없이 독립된 전체 외곽을 유지한다.
  - D08 v01~v03과 다른 반려본은 changes_requested 상태로 비파괴 보존한다.
- \`required_changes\`: 없음. G3 GIF_MOTION 진행 가능.
- \`user_confirmation\`: \`${userConfirmation}\`
`;
const g3Block = `## G3 GIF_MOTION

- \`artifact_paths\`: pending
- \`artifact_sha256\`: pending
- \`preparation_status\`: ready_after_g2_approval
- \`g2_dependency\`: approved
- \`decision\`: pending
- \`decided_at\`:
- \`findings\`:
- \`required_changes\`:
- \`user_confirmation\`: pending
`;
const approvalsPath = path.join(projectRoot, "planning", "APPROVALS.md");
const approvals = fs.readFileSync(approvalsPath, "utf8");
let nextApprovals = approvals.replace(
  /## G2 IMAGE_ASSETS[\s\S]*?(?=\r?\n## G3 GIF_MOTION)/,
  g2Block.trimEnd(),
);
nextApprovals = nextApprovals.replace(
  /## G3 GIF_MOTION[\s\S]*?(?=\r?\n## G4 ASSEMBLED_HTML)/,
  g3Block.trimEnd(),
);
if (nextApprovals === approvals) {
  throw new Error("Could not update G2/G3 blocks in planning/APPROVALS.md");
}
fs.writeFileSync(approvalsPath, nextApprovals, "utf8");

const ledgerPath = path.join(projectRoot, "asset", "approval-ledger.ndjson");
const ledger = fs.readFileSync(ledgerPath, "utf8");
const eventId = "g2-rev004-approved";
if (!ledger.includes(`"eventId":"${eventId}"`)) {
  fs.appendFileSync(
    ledgerPath,
    `${JSON.stringify({
      eventId,
      gate,
      revisionId: gateRevisionId,
      projectRevisionId,
      decision: "approved",
      confirmedByUser: true,
      userConfirmation,
      approvedBy: "human_user",
      approvedAt,
      selectedAssetCount: 40,
      selectedVersions,
      selectedHashes,
      selectedCandidateId: "D08-C03",
      selectedFrameIndex: 2,
      selectedCandidatePath: d08.rawPath,
      artifactPaths,
      artifactHashes,
      nextGate: "G3 GIF_MOTION",
    })}\n`,
    "utf8",
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      gate,
      decision: "approved",
      approvedAt,
      selectedAssetCount: 40,
      approvedManifestAssetCount: manifest.assets.filter(
        (asset) => asset.status === "approved",
      ).length,
      preservedChangesRequestedCount: manifest.assets.filter(
        (asset) => asset.status === "changes_requested",
      ).length,
      d08: {
        version: d08.version,
        selectedCandidateId: d08.selectedCandidateId,
        path: d08.rawPath,
        sha256: d08.sha256,
      },
      nextGate: "G3 GIF_MOTION",
    },
    null,
    2,
  ),
);
