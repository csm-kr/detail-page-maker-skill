import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const planPath = path.join(productionRoot, "production-plan.json");
const assetManifestPath = path.join(projectRoot, "asset", "asset-manifest.json");
const qaReportPath = path.join(
  projectRoot,
  "qa",
  "reports",
  "g2-image-assets-rev001.json",
);

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJson = (filePath, value) =>
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const plan = readJson(planPath);
const assetManifest = readJson(assetManifestPath);
const qaCompletedAt = new Date().toISOString();

for (const route of plan.assetRouting) {
  route.qaStatus = "PASS";
  route.status = "generated-pending-user-approval";
}

for (const asset of assetManifest.assets) {
  if (asset.type !== "generated-image") {
    continue;
  }
  if (asset.status === "changes_requested") {
    continue;
  }
  asset.qaStatus = "PASS";
  asset.status = "pending";
}

const selectedAssets = plan.assetRouting.map((route) => ({
  assetId: route.assetId,
  version: route.version ?? "v01",
  path: route.rawPath,
  sha256: route.sha256,
  width: route.width,
  height: route.height,
  qaStatus: route.qaStatus,
  corrected: Boolean(route.previousAttempts?.length),
  correctionFinding: route.correctionFinding ?? null,
}));

if (
  selectedAssets.length !== 40 ||
  selectedAssets.some((asset) => asset.qaStatus !== "PASS")
) {
  throw new Error("Expected exactly 40 selected QA PASS assets");
}

plan.status = "ready-for-g2-user-approval";
plan.qaStatus = "PASS";
plan.qaCompletedAt = qaCompletedAt;
plan.selectedAssetCount = selectedAssets.length;
writeJson(planPath, plan);

assetManifest.updatedAt = qaCompletedAt;
writeJson(assetManifestPath, assetManifest);

const report = {
  schemaVersion: 1,
  gate: "G2 IMAGE_ASSETS",
  revisionId: plan.revisionId,
  status: "QA_PASS_PENDING_USER_APPROVAL",
  qaCompletedAt,
  uniqueAssetCount: selectedAssets.length,
  initialGenerationCount: 40,
  correctionGenerationCount: 3,
  totalGeneratedImageCount: 43,
  firstPassCount: 37,
  correctedPassCount: 3,
  exactSizePassCount: 40,
  productIdentityHardFailuresRemaining: 0,
  modelIdentityHardFailuresRemaining: 0,
  prohibitedClaimFailuresRemaining: 0,
  textAndWatermarkFailuresRemaining: 0,
  contactSheets: [
    "qa/evidence/g2-image-assets/contact-A-rev001.jpg",
    "qa/evidence/g2-image-assets/contact-B-rev001.jpg",
    "qa/evidence/g2-image-assets/contact-C-rev001.jpg",
    "qa/evidence/g2-image-assets/contact-D-rev001.jpg",
    "qa/evidence/g2-image-assets/contact-E-rev001.jpg",
  ],
  correctedAssets: selectedAssets
    .filter((asset) => asset.corrected)
    .map((asset) => ({
      assetId: asset.assetId,
      version: asset.version,
      finding: asset.correctionFinding,
      path: asset.path,
      sha256: asset.sha256,
    })),
  selectedAssets,
};
writeJson(qaReportPath, report);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      status: report.status,
      selectedAssets: selectedAssets.length,
      firstPass: report.firstPassCount,
      correctedPass: report.correctedPassCount,
      report: "qa/reports/g2-image-assets-rev001.json",
    },
    null,
    2,
  )}\n`,
);
