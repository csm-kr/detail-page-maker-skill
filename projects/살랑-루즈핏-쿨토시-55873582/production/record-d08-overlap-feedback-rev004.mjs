import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const now = new Date().toISOString();
const userConfirmation =
  "음 x 자 에서 두개가 겹쳐서 나와서 리젝, 이거 여러개 만들어서 괜찮은거 찾아서 해줘";
const finding =
  "X자 교차 구도에서 두 토시가 겹쳐 각각의 전체 외곽과 동일한 한 쌍 여부를 한눈에 확인하기 어려움.";

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJson = (filePath, value) =>
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const assetManifestPath = path.join(
  projectRoot,
  "asset",
  "asset-manifest.json",
);
const assetManifest = readJson(assetManifestPath);
const d08v03 = assetManifest.assets.find(
  (asset) => asset.id === "D08" && asset.version === "v03",
);
if (!d08v03) throw new Error("Missing D08 v03");
d08v03.status = "changes_requested";
d08v03.qaStatus = "FAIL";
d08v03.qaFinding = finding;
d08v03.userConfirmation = userConfirmation;
d08v03.supersededBy = null;
assetManifest.updatedAt = now;
writeJson(assetManifestPath, assetManifest);

const planPath = path.join(productionRoot, "production-plan.json");
const plan = readJson(planPath);
const route = plan.assetRouting.find((item) => item.assetId === "D08");
if (!route || route.version !== "v03") {
  throw new Error("D08 v03 is not the current production route");
}
route.status = "changes-requested-user-feedback";
route.qaStatus = "FAIL";
route.userFeedback = userConfirmation;
route.userFinding = finding;
route.nextVersion = "v04";
plan.status = "changes-requested-at-g2";
plan.qaStatus = "FAIL_USER_FEEDBACK";
plan.userFeedbackRound = "rev004";
plan.userFeedbackAt = now;
plan.userFeedbackAssetIds = ["D08"];
writeJson(planPath, plan);

const projectPath = path.join(projectRoot, "project.json");
const project = readJson(projectPath);
if (project.g2UserFeedback) {
  project.g2UserFeedbackHistory ??= [];
  if (
    !project.g2UserFeedbackHistory.some(
      (event) => event.eventId === project.g2UserFeedback.eventId,
    )
  ) {
    project.g2UserFeedbackHistory.push(project.g2UserFeedback);
  }
}
project.phase = "image_generation_revision";
project.currentRevisionId = "rev-007";
project.updatedAt = now;
project.g2UserFeedback = {
  eventId: "g2-d08-overlap-rejected-rev004",
  recordedAt: now,
  assetIds: ["D08"],
  confirmation: userConfirmation,
  status: "changes_requested",
  finding,
  nextVersion: "v04",
};
writeJson(projectPath, project);

const ledgerPath = path.join(
  projectRoot,
  "asset",
  "approval-ledger.ndjson",
);
const ledger = fs.readFileSync(ledgerPath, "utf8");
const eventId = "g2-d08-overlap-rejected-rev004";
if (!ledger.includes(`"eventId":"${eventId}"`)) {
  fs.appendFileSync(
    ledgerPath,
    `${JSON.stringify({
      eventId,
      gate: "G2 IMAGE_ASSETS",
      revisionId: "rev-004",
      projectRevisionId: "rev-007",
      decision: "changes_requested",
      confirmedByUser: true,
      userConfirmation,
      affectedAssetIds: ["D08"],
      rejectedVersions: { D08: "v03" },
      nextVersions: { D08: "v04" },
      finding,
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
      rejectedVersion: "v03",
      nextVersion: "v04",
      finding,
    },
    null,
    2,
  ),
);
