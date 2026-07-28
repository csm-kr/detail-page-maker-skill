import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const repositoryRoot = path.resolve(projectRoot, "..", "..");
const outputDirectory =
  "asset/generated/pending/image/production-rev003-feedback/correction-05-d08";
const manifestRelativePath = `${outputDirectory}/manifest.json`;
const imageRelativePath = `${outputDirectory}/frame-000.png`;
const jobRelativePath = "production/jobs/correction-05-d08-matched-pair.json";
const manifestPath = path.join(projectRoot, manifestRelativePath);
const imagePath = path.join(projectRoot, imageRelativePath);
const archiveManifestPath = path.join(
  repositoryRoot,
  ".scratch",
  "god-tibo-raw",
  "loosefit-cool-sleeve",
  "production-rev003-feedback",
  "correction-05-d08",
  "manifest.raw.json",
);
const now = new Date().toISOString();

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

if (rawManifest.dry_run !== false || rawManifest.images?.length !== 1) {
  throw new Error("D08 rev003 manifest is not a completed one-image run");
}

const rawImage = rawManifest.images[0];
const imageSize = readPngSize(imagePath);
const imageSha256 = hashFile(imagePath);
if (
  imageSize.width !== 1024 ||
  imageSize.height !== 1024 ||
  rawImage.sha256 !== imageSha256 ||
  rawImage.size_check?.matches_reference !== true
) {
  throw new Error("D08 rev003 image integrity or size-invariant check failed");
}

const finding =
  "두 토시의 전체 길이·폭·상단 밴딩·긴 손등 커프·엄지 구멍·라벨 위치와 재질을 동일한 한 쌍으로 교정함.";
const userConfirmation = "d08만 2개 같아야 하는데 이거 같게해줘.";
const sanitizedManifest = {
  schemaVersion: 1,
  jobId: "correction-05-d08-matched-pair",
  jobPath: jobRelativePath,
  outputDirectory,
  createdAt: rawManifest.created_at,
  durationMs: rawManifest.duration_ms,
  detailLevel: 3,
  workers: 1,
  sizeMode: "invariant",
  targetSize: "1024x1024",
  backendRequestSize: rawManifest.api_size?.[0] ?? "1024x1024",
  providerWarning:
    "Unsupported private Codex backend path; contract may change without notice.",
  rawManifestSha256: sha256(rawBuffer),
  assets: [
    {
      assetId: "D08",
      role: "folded-pair-stack",
      version: "v03",
      index: 0,
      path: imageRelativePath,
      sha256: imageSha256,
      width: imageSize.width,
      height: imageSize.height,
      responseId: rawImage.response_id,
      generatedAt: rawManifest.created_at,
      warnings: rawImage.warnings ?? [],
      sizeCheck: {
        matchesReference: true,
      },
      qaStatus: "PASS",
      finding,
    },
  ],
};
writeJson(manifestPath, sanitizedManifest);
const sanitizedManifestSha256 = hashFile(manifestPath);

const assetManifestPath = path.join(
  projectRoot,
  "asset",
  "asset-manifest.json",
);
const assetManifest = readJson(assetManifestPath);
const d08v02 = assetManifest.assets.find(
  (asset) => asset.id === "D08" && asset.version === "v02",
);
if (!d08v02) throw new Error("Missing D08 v02 asset history");
d08v02.status = "changes_requested";
d08v02.qaStatus = "FAIL";
d08v02.qaFinding =
  "두 토시의 전체 길이·폭·커프 길이와 라벨 상대 위치가 달라 동일한 판매 한 쌍으로 보이지 않음.";
d08v02.userConfirmation = userConfirmation;
d08v02.supersededBy = "D08-v03";

const d08v03 = {
  ...d08v02,
  status: "pending",
  version: "v03",
  path: imageRelativePath,
  sha256: imageSha256,
  width: imageSize.width,
  height: imageSize.height,
  jobId: "correction-05-d08-matched-pair",
  jobPath: jobRelativePath,
  responseId: rawImage.response_id,
  generatedAt: rawManifest.created_at,
  detailLevel: 3,
  sizeMode: "invariant",
  targetSize: "1024x1024",
  qaStatus: "PASS",
  qaFinding: finding,
  userConfirmation,
  supersededBy: null,
  approvedBy: null,
  approvedAt: null,
};
const existingV03Index = assetManifest.assets.findIndex(
  (asset) => asset.id === "D08" && asset.version === "v03",
);
if (existingV03Index >= 0) assetManifest.assets[existingV03Index] = d08v03;
else assetManifest.assets.push(d08v03);
assetManifest.updatedAt = now;
writeJson(assetManifestPath, assetManifest);

const planPath = path.join(productionRoot, "production-plan.json");
const plan = readJson(planPath);
const route = plan.assetRouting.find((item) => item.assetId === "D08");
if (!route) throw new Error("Missing D08 production route");
route.previousAttempts ??= [];
if (
  !route.previousAttempts.some(
    (attempt) =>
      attempt.version === "v02" &&
      attempt.path ===
        "asset/generated/pending/image/production-rev002-feedback/correction-02-square/frame-001.png",
  )
) {
  route.previousAttempts.push({
    version: "v02",
    path: "asset/generated/pending/image/production-rev002-feedback/correction-02-square/frame-001.png",
    sha256:
      "4ab6bb26c531dd30dcab332e89dba9d914fbf41ea6e2c026dc1562d60604e7a7",
    qaStatus: "FAIL",
    finding:
      "두 토시의 전체 길이·폭·커프 길이와 라벨 상대 위치가 달라 동일한 판매 한 쌍으로 보이지 않음.",
    source: "human_user",
  });
}
Object.assign(route, {
  rawPath: imageRelativePath,
  status: "generated-pending-user-approval",
  sha256: imageSha256,
  width: imageSize.width,
  height: imageSize.height,
  responseId: rawImage.response_id,
  generatedAt: rawManifest.created_at,
  qaStatus: "PASS",
  version: "v03",
  userFeedback: userConfirmation,
  userFinding:
    "D08 안의 두 토시가 동일한 길이·폭·구조를 가진 한 쌍으로 보여야 함.",
  nextVersion: null,
  correctionJobId: "correction-05-d08-matched-pair",
  correctionFinding: finding,
  userFeedbackResolvedBy: "v03",
});

const newCorrectionJob = {
  jobId: "correction-05-d08-matched-pair",
  path: jobRelativePath,
  outputDirectory,
  workers: 1,
  sizeMode: "invariant",
  targetSize: "1024x1024",
  assetIds: ["D08"],
  manifestPath: manifestRelativePath,
  manifestSha256: sanitizedManifestSha256,
  generatedCount: 1,
  passCount: 1,
  rejectedCount: 0,
  status: "qa-pass-pending-user-approval",
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
plan.totalGeneratedImageCount = 53;
plan.totalImageCountIncludingModelCandidates = 61;
plan.userFeedbackRound = "rev003";
plan.userFeedbackAt = now;
plan.userFeedbackAssetIds = ["D08"];
plan.userFeedbackResolvedAt = now;
plan.userFeedbackResolvedAssetIds = ["D08"];
plan.selectedAssetCount = 40;
writeJson(planPath, plan);

const projectPath = path.join(projectRoot, "project.json");
const project = readJson(projectPath);
if (
  project.g2UserFeedback &&
  project.g2UserFeedback.eventId !== "g2-d08-matched-pair-rev003"
) {
  project.g2UserFeedbackHistory ??= [];
  if (
    !project.g2UserFeedbackHistory.some(
      (event) => event.eventId === project.g2UserFeedback.eventId,
    )
  ) {
    project.g2UserFeedbackHistory.push(project.g2UserFeedback);
  }
}
project.phase = "image_generation";
project.currentRevisionId = "rev-006";
project.updatedAt = now;
project.g2UserFeedback = {
  eventId: "g2-d08-matched-pair-rev003",
  recordedAt: now,
  assetIds: ["D08"],
  confirmation: userConfirmation,
  status: "revised_pending_user_approval",
  resolvedAt: now,
  selectedVersions: { D08: "v03" },
};
writeJson(projectPath, project);

const correctionReportPath = path.join(
  productionRoot,
  "user-feedback-correction-report.json",
);
const correctionReport = readJson(correctionReportPath);
correctionReport.revisionId = "rev-006";
correctionReport.status = "qa-pass-pending-user-approval";
correctionReport.appliedAt = now;
correctionReport.selectedVersions.D08 = "v03";
correctionReport.selectedCorrections.D08 = {
  version: "v03",
  path: imageRelativePath,
  sha256: imageSha256,
  width: 1024,
  height: 1024,
  qaStatus: "PASS",
  finding,
};
correctionReport.productionGeneratedImageCount = 53;
correctionReport.totalImageCountIncludingModelCandidates = 61;
correctionReport.additionalUserFeedbackRounds ??= [];
if (
  !correctionReport.additionalUserFeedbackRounds.some(
    (round) => round.eventId === "g2-d08-matched-pair-rev003",
  )
) {
  correctionReport.additionalUserFeedbackRounds.push({
    eventId: "g2-d08-matched-pair-rev003",
    userConfirmation,
    affectedAssetIds: ["D08"],
    previousVersion: "v02",
    selectedVersion: "v03",
    recordedAt: now,
  });
}
writeJson(correctionReportPath, correctionReport);

const d08Report = {
  schemaVersion: 1,
  projectRevisionId: "rev-006",
  g2RevisionId: "rev-003",
  gate: "G2 IMAGE_ASSETS",
  status: "qa-pass-pending-user-approval",
  userConfirmation,
  assetId: "D08",
  previousVersion: {
    version: "v02",
    status: "changes_requested",
    path: d08v02.path,
    sha256: d08v02.sha256,
    finding: d08v02.qaFinding,
  },
  selectedVersion: {
    version: "v03",
    status: "pending",
    path: imageRelativePath,
    sha256: imageSha256,
    width: 1024,
    height: 1024,
    responseId: rawImage.response_id,
    generatedAt: rawManifest.created_at,
    qaStatus: "PASS",
    finding,
  },
  checks: {
    exactSleeveCount: 2,
    matchedLength: "PASS",
    matchedWidth: "PASS",
    matchedUpperElastic: "PASS",
    matchedWideCuff: "PASS",
    matchedThumbOpening: "PASS",
    matchedLabel: "PASS",
    exactOutputSize: "PASS",
    productIdentity: "PASS",
  },
  productionGeneratedImageCount: 53,
  totalImageCountIncludingModelCandidates: 61,
};
writeJson(
  path.join(productionRoot, "d08-matched-pair-correction-report.json"),
  d08Report,
);

const ledgerPath = path.join(
  projectRoot,
  "asset",
  "approval-ledger.ndjson",
);
const ledger = fs.readFileSync(ledgerPath, "utf8");
const eventId = "g2-d08-matched-pair-rev003";
if (!ledger.includes(`"eventId":"${eventId}"`)) {
  fs.appendFileSync(
    ledgerPath,
    `${JSON.stringify({
      eventId,
      gate: "G2 IMAGE_ASSETS",
      revisionId: "rev-003",
      projectRevisionId: "rev-006",
      decision: "changes_requested_resolved_pending_reapproval",
      confirmedByUser: true,
      userConfirmation,
      affectedAssetIds: ["D08"],
      previousVersions: { D08: "v02" },
      selectedVersions: { D08: "v03" },
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
      previousVersion: "v02",
      selectedVersion: "v03",
      image: imageRelativePath,
      sha256: imageSha256,
      size: `${imageSize.width}x${imageSize.height}`,
      productionGeneratedImageCount: 53,
      totalImageCountIncludingModelCandidates: 61,
    },
    null,
    2,
  ),
);
