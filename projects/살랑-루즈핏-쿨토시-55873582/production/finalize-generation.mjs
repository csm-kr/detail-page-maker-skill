import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const repositoryRoot = path.resolve(projectRoot, "..", "..");
const planPath = path.join(productionRoot, "production-plan.json");
const assetManifestPath = path.join(projectRoot, "asset", "asset-manifest.json");
const rawArchiveRoot = path.join(
  repositoryRoot,
  ".scratch",
  "god-tibo-raw",
  "루즈핏-쿨토시",
  "production-rev001",
);

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, { encoding: "utf8" }));
const writeJson = (filePath, value) =>
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

const readPngSize = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const plan = readJson(planPath);
const definitionsById = new Map();
for (const job of plan.jobs) {
  const jobFile = readJson(path.join(projectRoot, job.path));
  job.assetIds.forEach((assetId, index) => {
    const prompt = jobFile.items[index]?.prompt ?? "";
    const roleMatch = prompt.match(
      /^Create asset [A-Z]\d{2} \(([^)]+)\)/m,
    );
    definitionsById.set(assetId, {
      role: roleMatch?.[1] ?? "unknown",
      referencePaths: jobFile.items[index]?.references ?? [],
      jobPath: job.path,
    });
  });
}

const missingJobs = [];
const generatedAssets = [];
const jobReports = [];

for (const job of plan.jobs) {
  const outputAbsolute = path.join(projectRoot, job.outputDirectory);
  const manifestPath = path.join(outputAbsolute, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    missingJobs.push({ jobId: job.jobId, reason: "manifest_missing" });
    continue;
  }

  const rawBuffer = fs.readFileSync(manifestPath);
  const rawManifest = JSON.parse(rawBuffer.toString("utf8"));
  if (rawManifest.dry_run !== false) {
    missingJobs.push({ jobId: job.jobId, reason: "not_generated" });
    continue;
  }
  if (!Array.isArray(rawManifest.images)) {
    missingJobs.push({ jobId: job.jobId, reason: "images_missing" });
    continue;
  }
  if (rawManifest.images.length !== job.assetIds.length) {
    missingJobs.push({
      jobId: job.jobId,
      reason: "image_count_mismatch",
      expected: job.assetIds.length,
      actual: rawManifest.images.length,
    });
    continue;
  }

  const [expectedWidth, expectedHeight] = job.targetSize
    .split("x")
    .map(Number);
  const sanitizedAssets = [];

  for (let index = 0; index < job.assetIds.length; index += 1) {
    const assetId = job.assetIds[index];
    const route = plan.assetRouting.find(
      (item) => item.assetId === assetId && item.jobId === job.jobId,
    );
    const absoluteImagePath = path.join(projectRoot, route.rawPath);
    if (!fs.existsSync(absoluteImagePath)) {
      throw new Error(`Generated image is missing: ${route.rawPath}`);
    }
    const imageBuffer = fs.readFileSync(absoluteImagePath);
    if (imageBuffer.length === 0) {
      throw new Error(`Generated image is empty: ${route.rawPath}`);
    }
    const actualSha256 = sha256(imageBuffer);
    const actualSize = readPngSize(absoluteImagePath);
    if (
      actualSize.width !== expectedWidth ||
      actualSize.height !== expectedHeight
    ) {
      throw new Error(
        `${assetId} size mismatch: ${actualSize.width}x${actualSize.height} !== ${job.targetSize}`,
      );
    }
    const rawImage = rawManifest.images[index] ?? {};
    if (rawImage.sha256 && rawImage.sha256 !== actualSha256) {
      throw new Error(
        `${assetId} hash mismatch: ${actualSha256} !== ${rawImage.sha256}`,
      );
    }
    if (rawImage.size_check?.matches_expected !== true) {
      throw new Error(`${assetId} God Tibo size_check did not pass`);
    }

    const definition = definitionsById.get(assetId);
    const generatedAsset = {
      id: assetId,
      type: "generated-image",
      role: definition.role,
      status: "pending",
      version: "v01",
      path: route.rawPath,
      sha256: actualSha256,
      width: actualSize.width,
      height: actualSize.height,
      provider: "god-tibo-gpt-image2-skill",
      jobId: job.jobId,
      jobPath: definition.jobPath,
      responseId: rawImage.response_id ?? null,
      generatedAt: rawManifest.created_at ?? null,
      detailLevel: job.detailLevel,
      sizeMode: "controllable",
      targetSize: job.targetSize,
      qaStatus: "pending",
      approvalGate: "G2 IMAGE_ASSETS",
      approvedBy: null,
      approvedAt: null,
    };
    generatedAssets.push(generatedAsset);
    sanitizedAssets.push({
      assetId,
      role: definition.role,
      index,
      path: route.rawPath,
      sha256: actualSha256,
      width: actualSize.width,
      height: actualSize.height,
      responseId: rawImage.response_id ?? null,
      generatedAt: rawManifest.created_at ?? null,
      warnings: rawImage.warnings ?? [],
      sizeCheck: {
        expected: { width: expectedWidth, height: expectedHeight },
        matchesExpected: true,
      },
    });

    route.status = "generated-pending-qa";
    route.sha256 = actualSha256;
    route.width = actualSize.width;
    route.height = actualSize.height;
    route.responseId = rawImage.response_id ?? null;
    route.generatedAt = rawManifest.created_at ?? null;
    route.qaStatus = "pending";
  }

  const archiveDirectory = path.join(rawArchiveRoot, job.jobId);
  fs.mkdirSync(archiveDirectory, { recursive: true });
  const archivedRawManifest = path.join(
    archiveDirectory,
    "manifest.raw.json",
  );
  fs.writeFileSync(archivedRawManifest, rawBuffer);

  const sanitizedManifest = {
    schemaVersion: 1,
    jobId: job.jobId,
    jobPath: job.path,
    outputDirectory: job.outputDirectory,
    createdAt: rawManifest.created_at ?? null,
    durationMs: rawManifest.duration_ms ?? null,
    detailLevel: job.detailLevel,
    workers: job.workers,
    sizeMode: "controllable",
    targetSize: job.targetSize,
    backendRequestSize: rawManifest.size?.backend_request_size ?? "auto",
    providerWarning:
      "Unsupported private Codex backend path; contract may change without notice.",
    rawManifestSha256: sha256(rawBuffer),
    assets: sanitizedAssets,
  };
  writeJson(manifestPath, sanitizedManifest);
  job.status = "generated-pending-qa";
  job.generatedAt = rawManifest.created_at ?? null;
  job.manifestPath = path
    .relative(projectRoot, manifestPath)
    .replaceAll("\\", "/");
  job.manifestSha256 = sha256(
    fs.readFileSync(manifestPath),
  );
  jobReports.push({
    jobId: job.jobId,
    assetCount: sanitizedAssets.length,
    targetSize: job.targetSize,
    manifestPath: job.manifestPath,
    status: "generated-pending-qa",
  });
}

if (missingJobs.length > 0) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        readyToFinalize: false,
        generatedJobs: jobReports.length,
        expectedJobs: plan.jobs.length,
        missingJobs,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 2;
} else {
  if (generatedAssets.length !== plan.requestedAssetCount) {
    throw new Error(
      `Generated asset count mismatch: ${generatedAssets.length} !== ${plan.requestedAssetCount}`,
    );
  }

  const assetManifest = readJson(assetManifestPath);
  const retainedAssets = assetManifest.assets.filter(
    (asset) =>
      asset.type !== "generated-image" ||
      !generatedAssets.some((candidate) => candidate.id === asset.id),
  );
  assetManifest.assets = [...retainedAssets, ...generatedAssets];
  assetManifest.updatedAt = new Date().toISOString();
  writeJson(assetManifestPath, assetManifest);

  plan.status = "generated-pending-qa";
  plan.generatedAt = new Date().toISOString();
  plan.generatedAssetCount = generatedAssets.length;
  plan.qaStatus = "pending";
  writeJson(planPath, plan);

  const report = {
    schemaVersion: 1,
    revisionId: plan.revisionId,
    status: "generated-pending-qa",
    generatedAt: plan.generatedAt,
    provider: plan.provider,
    requestedAssetCount: plan.requestedAssetCount,
    generatedAssetCount: generatedAssets.length,
    sizeChecksPassed: generatedAssets.length,
    waves: plan.waves,
    jobs: jobReports,
    assets: generatedAssets.map((asset) => ({
      id: asset.id,
      role: asset.role,
      path: asset.path,
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
      responseId: asset.responseId,
      qaStatus: asset.qaStatus,
    })),
  };
  writeJson(
    path.join(productionRoot, "generation-report.json"),
    report,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        generatedJobs: jobReports.length,
        generatedAssets: generatedAssets.length,
        sizeChecksPassed: generatedAssets.length,
        report: "production/generation-report.json",
      },
      null,
      2,
    )}\n`,
  );
}
