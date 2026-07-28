import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const repositoryRoot = path.resolve(projectRoot, "..", "..");
const planPath = path.join(productionRoot, "production-plan.json");
const assetManifestPath = path.join(projectRoot, "asset", "asset-manifest.json");
const correctionDirectoryRelative =
  "asset/generated/pending/image/production-rev001-corrections/correction-01";
const correctionDirectory = path.join(
  projectRoot,
  correctionDirectoryRelative,
);
const rawManifestPath = path.join(correctionDirectory, "manifest.json");
const correctionJobPath =
  "production/jobs/correction-01-invariant.json";

const corrections = [
  {
    assetId: "B06",
    index: 0,
    version: "v02",
    finding:
      "손바닥 면에 노출된 라벨을 제거하고 손바닥 개방 구조를 유지함.",
    expectedWidth: 1024,
    expectedHeight: 1024,
  },
  {
    assetId: "D03",
    index: 1,
    version: "v02",
    finding:
      "뒷면 컷의 잘못된 라벨을 제거하고 역면 엄지홀·봉제를 유지함.",
    expectedWidth: 1024,
    expectedHeight: 1536,
  },
  {
    assetId: "E08",
    index: 2,
    version: "v02",
    finding:
      "떠 있던 행택형 라벨을 손등 커프에 평평하게 봉제된 형태로 교정함.",
    expectedWidth: 1024,
    expectedHeight: 1024,
  },
];

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJson = (filePath, value) =>
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
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

const rawBuffer = fs.readFileSync(rawManifestPath);
const rawManifest = JSON.parse(rawBuffer.toString("utf8"));
if (rawManifest.dry_run !== false || rawManifest.images?.length !== 3) {
  throw new Error("Correction manifest is not a completed three-image run");
}

const archiveDirectory = path.join(
  repositoryRoot,
  ".scratch",
  "god-tibo-raw",
  "루즈핏-쿨토시",
  "production-rev001-corrections",
  "correction-01",
);
fs.mkdirSync(archiveDirectory, { recursive: true });
fs.writeFileSync(
  path.join(archiveDirectory, "manifest.raw.json"),
  rawBuffer,
);

const plan = readJson(planPath);
const assetManifest = readJson(assetManifestPath);
const sanitizedAssets = [];
const now = new Date().toISOString();

for (const correction of corrections) {
  const imagePathRelative = `${correctionDirectoryRelative}/frame-${String(
    correction.index,
  ).padStart(3, "0")}.png`;
  const imagePath = path.join(projectRoot, imagePathRelative);
  const imageBuffer = fs.readFileSync(imagePath);
  const imageSha256 = sha256(imageBuffer);
  const imageSize = readPngSize(imagePath);
  const rawImage = rawManifest.images[correction.index];

  if (
    imageSize.width !== correction.expectedWidth ||
    imageSize.height !== correction.expectedHeight
  ) {
    throw new Error(
      `${correction.assetId} correction size mismatch: ${imageSize.width}x${imageSize.height}`,
    );
  }
  if (
    rawImage.size_check?.matches_reference !== true ||
    rawImage.sha256 !== imageSha256
  ) {
    throw new Error(`${correction.assetId} correction integrity check failed`);
  }

  const route = plan.assetRouting.find(
    (candidate) => candidate.assetId === correction.assetId,
  );
  if (!route) {
    throw new Error(`Missing production route: ${correction.assetId}`);
  }
  const originalPath = route.rawPath;
  const originalSha256 = route.sha256;
  route.previousAttempts = [
    ...(route.previousAttempts ?? []),
    {
      version: route.version ?? "v01",
      path: originalPath,
      sha256: originalSha256,
      qaStatus: "FAIL",
      finding: correction.finding,
    },
  ];
  route.version = correction.version;
  route.rawPath = imagePathRelative;
  route.sha256 = imageSha256;
  route.width = imageSize.width;
  route.height = imageSize.height;
  route.responseId = rawImage.response_id;
  route.generatedAt = rawManifest.created_at;
  route.qaStatus = "PASS";
  route.status = "generated-pending-user-approval";
  route.correctionJobId = "correction-01-invariant";
  route.correctionFinding = correction.finding;

  const originalAsset = assetManifest.assets.find(
    (asset) =>
      asset.id === correction.assetId &&
      (asset.version ?? "v01") === "v01",
  );
  if (!originalAsset) {
    throw new Error(`Missing original asset manifest row: ${correction.assetId}`);
  }
  originalAsset.status = "changes_requested";
  originalAsset.qaStatus = "FAIL";
  originalAsset.qaFinding = correction.finding;
  originalAsset.supersededBy = `${correction.assetId}-${correction.version}`;

  const replacement = {
    ...originalAsset,
    status: "pending",
    version: correction.version,
    path: imagePathRelative,
    sha256: imageSha256,
    width: imageSize.width,
    height: imageSize.height,
    jobId: "correction-01-invariant",
    jobPath: correctionJobPath,
    responseId: rawImage.response_id,
    generatedAt: rawManifest.created_at,
    sizeMode: "invariant",
    targetSize: `${imageSize.width}x${imageSize.height}`,
    qaStatus: "PASS",
    qaFinding: correction.finding,
    supersededBy: null,
    approvedBy: null,
    approvedAt: null,
  };
  assetManifest.assets.push(replacement);

  sanitizedAssets.push({
    assetId: correction.assetId,
    version: correction.version,
    index: correction.index,
    path: imagePathRelative,
    sha256: imageSha256,
    width: imageSize.width,
    height: imageSize.height,
    responseId: rawImage.response_id,
    generatedAt: rawManifest.created_at,
    sizeCheck: {
      matchesReference: true,
    },
    qaStatus: "PASS",
    correctionFinding: correction.finding,
  });
}

const sanitizedManifest = {
  schemaVersion: 1,
  jobId: "correction-01-invariant",
  jobPath: correctionJobPath,
  outputDirectory: correctionDirectoryRelative,
  createdAt: rawManifest.created_at,
  durationMs: rawManifest.duration_ms,
  detailLevel: 3,
  workers: 3,
  sizeMode: "invariant",
  providerWarning:
    "Unsupported private Codex backend path; contract may change without notice.",
  rawManifestSha256: sha256(rawBuffer),
  assets: sanitizedAssets,
};
writeJson(rawManifestPath, sanitizedManifest);

assetManifest.updatedAt = now;
writeJson(assetManifestPath, assetManifest);

plan.status = "ready-for-g2-review";
plan.qaStatus = "PASS_WITH_CORRECTIONS";
plan.qaCompletedAt = now;
plan.generatedAssetCount = 40;
plan.totalGeneratedImageCount = 43;
plan.firstPassCount = 37;
plan.correctedCount = 3;
plan.correctionJobs = [
  {
    jobId: "correction-01-invariant",
    path: correctionJobPath,
    outputDirectory: correctionDirectoryRelative,
    workers: 3,
    assetIds: corrections.map((correction) => correction.assetId),
    manifestPath: `${correctionDirectoryRelative}/manifest.json`,
    status: "qa-pass-pending-user-approval",
  },
];
writeJson(planPath, plan);

const correctionReport = {
  schemaVersion: 1,
  revisionId: plan.revisionId,
  status: "qa-pass-pending-user-approval",
  appliedAt: now,
  initialGeneratedAssetCount: 40,
  correctionGeneratedAssetCount: 3,
  totalGeneratedImageCount: 43,
  corrections: sanitizedAssets,
};
writeJson(
  path.join(productionRoot, "correction-report.json"),
  correctionReport,
);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      corrected: corrections.length,
      totalGeneratedImageCount: 43,
      planStatus: plan.status,
      correctionReport: "production/correction-report.json",
    },
    null,
    2,
  )}\n`,
);
