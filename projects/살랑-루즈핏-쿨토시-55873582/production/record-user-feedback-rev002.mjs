import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetIds = ["A01", "A03", "A04", "D01", "D08", "E07", "E08"];
const nextVersions = {
  A01: "v02",
  A03: "v02",
  A04: "v02",
  D01: "v02",
  D08: "v02",
  E07: "v02",
  E08: "v03",
};
const userConfirmation =
  "a01, a03, a04 이거 원본과 달라, d01, d08, e07, e08 이게 달라 짧아 대부분";
const eventId = "g2-user-feedback-rev002-length-and-identity";
const recordedAt = new Date().toISOString();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(
    path.join(projectRoot, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

const assetManifest = readJson("asset/asset-manifest.json");
for (const assetId of targetIds) {
  const current = assetManifest.assets
    .filter((asset) => asset.id === assetId && asset.status === "pending")
    .at(-1);
  if (!current) {
    continue;
  }
  current.status = "changes_requested";
  current.qaStatus = "FAIL";
  current.qaFinding =
    "사용자 실사 원본과 제품 비례·구조가 다르고, 대부분 실제 47cm 길이보다 짧게 표현됨.";
  current.userConfirmation = userConfirmation;
  current.supersededBy = `${assetId}-${nextVersions[assetId]}`;
}
assetManifest.updatedAt = recordedAt;
writeJson("asset/asset-manifest.json", assetManifest);

const productionPlan = readJson("production/production-plan.json");
for (const route of productionPlan.assetRouting) {
  if (!targetIds.includes(route.assetId)) {
    continue;
  }
  route.version ||= route.assetId === "E08" ? "v02" : "v01";
  route.status = "changes-requested-user-feedback";
  route.qaStatus = "FAIL";
  route.userFeedback = userConfirmation;
  route.userFinding =
    "실사 원본 대비 제품 동일성 및 47×14cm의 길고 좁은 비례가 불충분함.";
  route.nextVersion = nextVersions[route.assetId];
}
productionPlan.status = "revision-required-by-user";
productionPlan.qaStatus = "FAIL";
productionPlan.userFeedbackRound = "rev002";
productionPlan.userFeedbackAt = recordedAt;
productionPlan.userFeedbackAssetIds = targetIds;
writeJson("production/production-plan.json", productionPlan);

const project = readJson("project.json");
project.phase = "image_generation_revision";
project.updatedAt = recordedAt;
project.currentRevisionId = "rev-005";
project.g2UserFeedback = {
  eventId,
  recordedAt,
  assetIds: targetIds,
  confirmation: userConfirmation,
  status: "changes_requested",
};
writeJson("project.json", project);

const ledgerPath = path.join(projectRoot, "asset", "approval-ledger.ndjson");
const ledger = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, "utf8") : "";
if (!ledger.includes(`"eventId":"${eventId}"`)) {
  const record = {
    eventId,
    gate: "G2 IMAGE_ASSETS",
    revisionId: "rev-002",
    decision: "changes_requested",
    confirmedByUser: true,
    userConfirmation,
    affectedAssetIds: targetIds,
    nextVersions,
    recordedAt,
  };
  fs.appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`, "utf8");
}

console.log(
  JSON.stringify(
    {
      eventId,
      status: "changes_requested",
      assetIds: targetIds,
      nextVersions,
      recordedAt,
    },
    null,
    2,
  ),
);
