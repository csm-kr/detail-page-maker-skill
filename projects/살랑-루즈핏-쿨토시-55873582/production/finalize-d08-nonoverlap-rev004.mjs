import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const repositoryRoot = path.resolve(projectRoot, "..", "..");
const outputDirectory =
  "asset/generated/pending/image/production-rev004-feedback/correction-06-d08-nonoverlap-candidates";
const manifestRelativePath = `${outputDirectory}/manifest.json`;
const jobRelativePath =
  "production/jobs/correction-06-d08-nonoverlap-candidates.json";
const manifestPath = path.join(projectRoot, manifestRelativePath);
const archiveManifestPath = path.join(
  repositoryRoot,
  ".scratch",
  "god-tibo-raw",
  "loosefit-cool-sleeve",
  "production-rev004-feedback",
  "correction-06-d08-nonoverlap-candidates",
  "manifest.raw.json",
);
const now = new Date().toISOString();
const selectedIndex = 2;
const selectedVersion = "v04";
const userConfirmation =
  "음 x 자 에서 두개가 겹쳐서 나와서 리젝, 이거 여러개 만들어서 괜찮은거 찾아서 해줘";
const selectedFinding =
  "8개 후보 중 제품끼리 닿거나 겹치지 않고, 두 토시의 상·하단 정렬·전체 길이·폭·커프·엄지 구멍·라벨이 가장 안정적으로 일치하는 평행 플랫레이를 선택함.";

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJson = (filePath, value) =>
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
const hashFile = (filePath) => sha256(fs.readFileSync(filePath));
const readPngSize = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`Not a PNG: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

let rawBuffer;
let rawManifest;
const currentManifest = readJson(manifestPath);
if (currentManifest.schema_version === 2) {
  rawBuffer = fs.readFileSync(manifestPath);
  rawManifest = currentManifest;
  fs.mkdirSync(path.dirname(archiveManifestPath), { recursive: true });
  fs.writeFileSync(archiveManifestPath, rawBuffer);
} else {
  rawBuffer = fs.readFileSync(archiveManifestPath);
  rawManifest = JSON.parse(rawBuffer.toString("utf8"));
}

if (rawManifest.dry_run !== false || rawManifest.images?.length !== 8) {
  throw new Error("D08 rev004 manifest is not a completed eight-image run");
}

const candidateNotes = [
  "비겹침·동일 수량 통과. 좌우 하단 여백과 커프 폭 균형이 선택본보다 약간 덜 안정적.",
  "비겹침·동일 수량 통과. 좌우 하단 수평 정렬이 선택본보다 약간 어긋남.",
  "선택본. 연속 배경 간격, 상·하단 수평 정렬, 좌우 비례와 미러 커프 구조가 가장 안정적.",
  "비겹침·동일 수량 통과. 좌우 몸통 드레이프 밀도 차이가 선택본보다 큼.",
  "비겹침·동일 수량 통과. 커프와 라벨의 상대 정렬이 선택본보다 덜 또렷함.",
  "비겹침·동일 수량 통과. 좌우 몸통 폭과 실루엣 균형이 선택본보다 약함.",
  "비겹침·동일 수량 통과. 제품 간격과 라벨 대칭성이 좋지만 선택본보다 상단 정렬이 약함.",
  "차선 후보. 좌우 동일성과 미러 구조가 좋지만 제품 간격과 상단 안전 여백이 선택본보다 좁음.",
];

const candidates = rawManifest.images.map((rawImage, index) => {
  const imageRelativePath = `${outputDirectory}/frame-${String(index).padStart(
    3,
    "0",
  )}.png`;
  const imagePath = path.join(projectRoot, imageRelativePath);
  const imageSize = readPngSize(imagePath);
  const imageSha256 = hashFile(imagePath);
  if (
    imageSize.width !== 1024 ||
    imageSize.height !== 1024 ||
    rawImage.sha256 !== imageSha256 ||
    rawImage.size_check?.matches_expected !== true
  ) {
    throw new Error(`D08 candidate ${index + 1} integrity or size check failed`);
  }
  return {
    candidateId: `D08-C${String(index + 1).padStart(2, "0")}`,
    frameIndex: index,
    path: imageRelativePath,
    sha256: imageSha256,
    width: imageSize.width,
    height: imageSize.height,
    responseId: rawImage.response_id,
    generatedAt: rawManifest.created_at,
    warnings: rawImage.warnings ?? [],
    qa: {
      exactSleeveCount: "PASS",
      noContactOrOverlap: "PASS",
      completeSilhouettes: "PASS",
      matchedPairIdentity: "PASS",
      exactOutputSize: "PASS",
    },
    selection: index === selectedIndex ? "SELECTED" : "NOT_SELECTED",
    finding: candidateNotes[index],
  };
});
const selected = candidates[selectedIndex];

const sanitizedManifest = {
  schemaVersion: 1,
  jobId: "correction-06-d08-nonoverlap-candidates",
  jobPath: jobRelativePath,
  outputDirectory,
  createdAt: rawManifest.created_at,
  durationMs: rawManifest.duration_ms,
  detailLevel: 3,
  workers: 8,
  batchSize: 8,
  sizeMode: "controllable",
  targetSize: "1024x1024",
  backendRequestSize: "auto",
  providerWarning:
    "Unsupported private Codex backend path; contract may change without notice.",
  rawManifestSha256: sha256(rawBuffer),
  selectedCandidateId: selected.candidateId,
  selectedFrameIndex: selected.frameIndex,
  assets: candidates,
};
writeJson(manifestPath, sanitizedManifest);
const sanitizedManifestSha256 = hashFile(manifestPath);

const assetManifestPath = path.join(
  projectRoot,
  "asset",
  "asset-manifest.json",
);
const assetManifest = readJson(assetManifestPath);
const d08v03 = assetManifest.assets.find(
  (asset) => asset.id === "D08" && asset.version === "v03",
);
if (!d08v03) throw new Error("Missing D08 v03 history");
d08v03.status = "changes_requested";
d08v03.qaStatus = "FAIL";
d08v03.qaFinding =
  "X자 교차 구도에서 두 토시가 겹쳐 각각의 전체 외곽을 독립적으로 확인할 수 없음.";
d08v03.userConfirmation = userConfirmation;
d08v03.supersededBy = "D08-v04";

const d08v04 = {
  ...d08v03,
  status: "pending",
  version: selectedVersion,
  path: selected.path,
  sha256: selected.sha256,
  width: selected.width,
  height: selected.height,
  jobId: "correction-06-d08-nonoverlap-candidates",
  jobPath: jobRelativePath,
  responseId: selected.responseId,
  generatedAt: selected.generatedAt,
  detailLevel: 3,
  sizeMode: "controllable",
  targetSize: "1024x1024",
  qaStatus: "PASS",
  qaFinding: selectedFinding,
  userConfirmation,
  supersededBy: null,
  approvedBy: null,
  approvedAt: null,
};
const existingV04Index = assetManifest.assets.findIndex(
  (asset) => asset.id === "D08" && asset.version === selectedVersion,
);
if (existingV04Index >= 0) assetManifest.assets[existingV04Index] = d08v04;
else assetManifest.assets.push(d08v04);
assetManifest.updatedAt = now;
writeJson(assetManifestPath, assetManifest);

const planPath = path.join(productionRoot, "production-plan.json");
const plan = readJson(planPath);
const route = plan.assetRouting.find((item) => item.assetId === "D08");
if (!route) throw new Error("Missing D08 production route");
route.previousAttempts ??= [];
if (
  !route.previousAttempts.some(
    (attempt) => attempt.version === "v03" && attempt.path === d08v03.path,
  )
) {
  route.previousAttempts.push({
    version: "v03",
    path: d08v03.path,
    sha256: d08v03.sha256,
    qaStatus: "FAIL",
    finding: d08v03.qaFinding,
    source: "human_user",
  });
}
Object.assign(route, {
  rawPath: selected.path,
  status: "generated-pending-user-approval",
  sha256: selected.sha256,
  width: selected.width,
  height: selected.height,
  responseId: selected.responseId,
  generatedAt: selected.generatedAt,
  qaStatus: "PASS",
  version: selectedVersion,
  userFeedback: userConfirmation,
  userFinding:
    "D08의 두 토시가 서로 닿거나 겹치지 않고 각각 완전한 외곽을 보여야 함.",
  nextVersion: null,
  correctionJobId: "correction-06-d08-nonoverlap-candidates",
  correctionFinding: selectedFinding,
  userFeedbackResolvedBy: selectedVersion,
  selectedCandidateId: selected.candidateId,
});

const newCorrectionJob = {
  jobId: "correction-06-d08-nonoverlap-candidates",
  path: jobRelativePath,
  outputDirectory,
  workers: 8,
  batchSize: 8,
  sizeMode: "controllable",
  targetSize: "1024x1024",
  assetIds: ["D08"],
  manifestPath: manifestRelativePath,
  manifestSha256: sanitizedManifestSha256,
  generatedCount: 8,
  qaPassCount: 8,
  selectedCount: 1,
  notSelectedCount: 7,
  selectedCandidateId: selected.candidateId,
  selectedFrameIndex: selected.frameIndex,
  status: "qa-pass-one-selected-pending-user-approval",
};
plan.correctionJobs = [
  ...(plan.correctionJobs ?? []).filter(
    (job) => job.jobId !== newCorrectionJob.jobId,
  ),
  newCorrectionJob,
];
plan.status = "ready-for-g2-user-approval";
plan.qaStatus = "PASS_WITH_USER_FEEDBACK_CORRECTIONS";
plan.qaCompletedAt = now;
plan.totalGeneratedImageCount = 61;
plan.totalImageCountIncludingModelCandidates = 69;
plan.userFeedbackRound = "rev004";
plan.userFeedbackAt = now;
plan.userFeedbackAssetIds = ["D08"];
plan.userFeedbackResolvedAt = now;
plan.userFeedbackResolvedAssetIds = ["D08"];
plan.selectedAssetCount = 40;
writeJson(planPath, plan);

const projectPath = path.join(projectRoot, "project.json");
const project = readJson(projectPath);
project.phase = "image_generation";
project.currentRevisionId = "rev-008";
project.updatedAt = now;
project.g2UserFeedback = {
  ...(project.g2UserFeedback ?? {}),
  eventId: "g2-d08-overlap-rejected-rev004",
  status: "revised_pending_user_approval",
  resolvedAt: now,
  candidateCount: 8,
  selectedCandidateId: selected.candidateId,
  selectedVersions: { D08: selectedVersion },
};
writeJson(projectPath, project);

const correctionReportPath = path.join(
  productionRoot,
  "user-feedback-correction-report.json",
);
const correctionReport = readJson(correctionReportPath);
correctionReport.revisionId = "rev-008";
correctionReport.status = "qa-pass-pending-user-approval";
correctionReport.appliedAt = now;
correctionReport.selectedVersions.D08 = selectedVersion;
correctionReport.selectedCorrections.D08 = {
  version: selectedVersion,
  candidateId: selected.candidateId,
  path: selected.path,
  sha256: selected.sha256,
  width: selected.width,
  height: selected.height,
  qaStatus: "PASS",
  finding: selectedFinding,
};
correctionReport.productionGeneratedImageCount = 61;
correctionReport.totalImageCountIncludingModelCandidates = 69;
correctionReport.additionalUserFeedbackRounds ??= [];
const roundIndex = correctionReport.additionalUserFeedbackRounds.findIndex(
  (round) => round.eventId === "g2-d08-overlap-rejected-rev004",
);
const round = {
  eventId: "g2-d08-overlap-rejected-rev004",
  userConfirmation,
  affectedAssetIds: ["D08"],
  previousVersion: "v03",
  candidateCount: 8,
  selectedCandidateId: selected.candidateId,
  selectedVersion,
  recordedAt: now,
};
if (roundIndex >= 0)
  correctionReport.additionalUserFeedbackRounds[roundIndex] = round;
else correctionReport.additionalUserFeedbackRounds.push(round);
writeJson(correctionReportPath, correctionReport);

const candidateReport = {
  schemaVersion: 1,
  projectRevisionId: "rev-008",
  g2RevisionId: "rev-004",
  gate: "G2 IMAGE_ASSETS",
  status: "qa-pass-one-selected-pending-user-approval",
  userConfirmation,
  assetId: "D08",
  rejectedVersion: {
    version: "v03",
    path: d08v03.path,
    sha256: d08v03.sha256,
    status: "changes_requested",
    finding: d08v03.qaFinding,
  },
  generation: {
    provider: "god-tibo-gpt-image2-skill",
    workers: 8,
    candidateCount: 8,
    targetSize: "1024x1024",
    sizeMode: "controllable",
    sourcePriority:
      "user-real-original pair as Image 1, then real single and label details",
  },
  hardSelectionCriteria: [
    "exactly two sleeves",
    "no contact, crossing, overlap, or touching shadows",
    "continuous background gap from upper opening to bottom cuff",
    "complete independent silhouettes",
    "matched length, width, upper elastic, long cuff, thumb opening, label, and material",
    "exact 1024x1024 output",
  ],
  selectedVersion: {
    version: selectedVersion,
    candidateId: selected.candidateId,
    frameIndex: selected.frameIndex,
    path: selected.path,
    sha256: selected.sha256,
    width: selected.width,
    height: selected.height,
    qaStatus: "PASS",
    finding: selectedFinding,
  },
  candidates,
  productionGeneratedImageCount: 61,
  totalImageCountIncludingModelCandidates: 69,
};
writeJson(
  path.join(productionRoot, "d08-nonoverlap-candidates-report.json"),
  candidateReport,
);

const ledgerPath = path.join(
  projectRoot,
  "asset",
  "approval-ledger.ndjson",
);
const ledger = fs.readFileSync(ledgerPath, "utf8");
const eventId = "g2-d08-nonoverlap-candidates-selected-rev004";
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
      rejectedVersions: { D08: "v03" },
      selectedVersions: { D08: selectedVersion },
      selectedCandidateId: selected.candidateId,
      selectedFrameIndex: selected.frameIndex,
      recordedAt: now,
    })}\n`,
    "utf8",
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      assetId: "D08",
      generatedCandidates: candidates.length,
      selectedCandidateId: selected.candidateId,
      selectedFrameIndex: selected.frameIndex,
      selectedVersion,
      image: selected.path,
      sha256: selected.sha256,
      size: `${selected.width}x${selected.height}`,
      productionGeneratedImageCount: 61,
      totalImageCountIncludingModelCandidates: 69,
    },
    null,
    2,
  ),
);
