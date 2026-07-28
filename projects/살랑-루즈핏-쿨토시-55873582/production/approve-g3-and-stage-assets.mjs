import { createHash } from "node:crypto";
import {
  access,
  appendFile,
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifestPath = path.join(projectRoot, "asset", "asset-manifest.json");
const projectPath = path.join(projectRoot, "project.json");
const ledgerPath = path.join(projectRoot, "asset", "approval-ledger.ndjson");
const userConfirmation = "응 이제 만들어줘";
const approvedAt = new Date().toISOString();

const activeGifVersions = new Map([
  ["GIF-002", "v01"],
  ["GIF-003", "v02"],
  ["GIF-004", "v01"],
  ["GIF-005", "v02"],
  ["GIF-006", "v01"],
  ["GIF-007", "v01"],
  ["GIF-008", "v01"],
  ["GIF-009", "v02"],
  ["GIF-010", "v01"],
]);

const supersededGifVersions = new Map([
  ["GIF-003", "v01"],
  ["GIF-005", "v01"],
  ["GIF-009", "v01"],
]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  const body = await readFile(filePath);
  return createHash("sha256").update(body).digest("hex");
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function resolveProjectPath(relativePath) {
  const absolute = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`프로젝트 밖 경로는 사용할 수 없습니다: ${relativePath}`);
  }
  return absolute;
}

async function copyApprovedImage(record) {
  const sourceRelative = record.path;
  const source = resolveProjectPath(sourceRelative);
  if (!(await exists(source))) {
    throw new Error(`승인 이미지 원본이 없습니다: ${sourceRelative}`);
  }
  const digest = await sha256(source);
  if (digest !== record.sha256) {
    throw new Error(`승인 이미지 해시가 다릅니다: ${record.id}`);
  }

  const extension = path.extname(sourceRelative).toLowerCase();
  const fileName = `${record.id.toLowerCase()}-${record.role}-${record.version}${extension}`;
  const targetRelative = `asset/generated/approved/image/${fileName}`;
  const target = resolveProjectPath(targetRelative);
  await mkdir(path.dirname(target), { recursive: true });

  if (await exists(target)) {
    const targetDigest = await sha256(target);
    if (targetDigest !== digest) {
      throw new Error(`승인 이미지 대상이 이미 다른 바이트로 존재합니다: ${targetRelative}`);
    }
  } else {
    await copyFile(source, target);
  }

  record.sourceGenerationPath ||= sourceRelative;
  record.path = targetRelative;
  record.status = "approved";
  record.qaStatus = "PASS";
  record.approvedBy = "human_user";
  record.approvedAt ||= approvedAt;
  record.userConfirmation ||= "승인";
}

async function moveGifRecord(record, state) {
  const sourceRelative = record.path;
  const source = resolveProjectPath(sourceRelative);
  const fileName = path.basename(sourceRelative);
  const targetRelative = `asset/generated/${state}/gif/${fileName}`;
  const target = resolveProjectPath(targetRelative);
  await mkdir(path.dirname(target), { recursive: true });

  const sourceExists = await exists(source);
  const targetExists = await exists(target);
  if (!sourceExists && !targetExists) {
    throw new Error(`GIF 파일이 없습니다: ${record.id} ${record.version}`);
  }
  if (targetExists) {
    const targetDigest = await sha256(target);
    if (targetDigest !== record.sha256) {
      throw new Error(`GIF 대상이 이미 다른 바이트로 존재합니다: ${targetRelative}`);
    }
  } else {
    const sourceDigest = await sha256(source);
    if (sourceDigest !== record.sha256) {
      throw new Error(`GIF 해시가 다릅니다: ${record.id} ${record.version}`);
    }
    await rename(source, target);
  }

  record.sourcePath ||= sourceRelative;
  record.path = targetRelative;
  record.method ||= record.id === "GIF-001" ? "hybrid" : "heygenframe";
  record.status = state;
  if (state === "approved") {
    record.qaStatus = "PASS";
    record.approvedBy = "human_user";
    record.approvedAt = approvedAt;
    record.userConfirmation = userConfirmation;
  } else {
    record.rejectedBy = "human_user";
    record.rejectedAt = approvedAt;
    record.rejectionReason = "사용자 피드백을 반영한 후속 버전으로 교체";
  }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const approvedImages = manifest.assets.filter(
  (record) => /^[A-E]\d{2}$/.test(record.id || "") && record.status === "approved",
);
if (approvedImages.length !== 40) {
  throw new Error(`승인 이미지가 40장이 아닙니다: ${approvedImages.length}`);
}

const uniqueImageIds = new Set(approvedImages.map((record) => record.id));
if (uniqueImageIds.size !== 40) {
  throw new Error("승인 이미지 ID가 중복되어 있습니다.");
}

for (const record of approvedImages) {
  await copyApprovedImage(record);
}

const approvedGifRecords = [];
for (const [id, version] of activeGifVersions) {
  const record = manifest.assets.find(
    (candidate) => candidate.id === id && candidate.version === version,
  );
  if (!record) {
    throw new Error(`선택 GIF 레코드가 없습니다: ${id} ${version}`);
  }
  await moveGifRecord(record, "approved");
  approvedGifRecords.push(record);
}

for (const [id, version] of supersededGifVersions) {
  const record = manifest.assets.find(
    (candidate) => candidate.id === id && candidate.version === version,
  );
  if (!record) {
    throw new Error(`교체 전 GIF 레코드가 없습니다: ${id} ${version}`);
  }
  await moveGifRecord(record, "rejected");
}

manifest.updatedAt = approvedAt;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const assetManifestSha256 = await sha256(manifestPath);

const project = JSON.parse(await readFile(projectPath, "utf8"));
project.phase = "assembly_in_progress";
project.currentRevisionId = "rev-015";
project.updatedAt = approvedAt;
project.nextGate = "G4 ASSEMBLED_HTML";
project.g3BatchPreparation.status = "approved";
project.g3BatchPreparation.decision = "approved";
project.g3BatchPreparation.approvedAt = approvedAt;
project.g3BatchPreparation.approvedBy = "human_user";
project.g3BatchPreparation.approvalUserConfirmation = userConfirmation;
project.g3BatchFeedback.status = "approved";
project.g3BatchFeedback.decision = "approved";
project.g3BatchFeedback.approvedAt = approvedAt;
project.g3BatchFeedback.approvedBy = "human_user";
project.g3BatchFeedback.approvalUserConfirmation = userConfirmation;
project.g3BatchApproval = {
  gate: "G3 GIF_MOTION_BATCH",
  revisionId: "rev-002",
  projectRevisionId: "rev-015",
  decision: "approved",
  approvedAt,
  approvedBy: "human_user",
  userConfirmation,
  totalGifCount: 10,
  selectedVersions: Object.fromEntries(activeGifVersions),
  selectedAssets: approvedGifRecords.map((record) => ({
    id: record.id,
    version: record.version,
    path: record.path,
    sha256: record.sha256,
  })),
  assetManifestSha256,
  nextGate: "G4 ASSEMBLED_HTML",
};
await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

const eventId = "g3-gif-batch-approved-current-set-rev002";
const ledger = await readFile(ledgerPath, "utf8");
if (!ledger.split(/\r?\n/).some((line) => line.includes(`"eventId":"${eventId}"`))) {
  await appendFile(
    ledgerPath,
    `${JSON.stringify({
      eventId,
      gate: "G3 GIF_MOTION_BATCH",
      revisionId: "rev-002",
      projectRevisionId: "rev-015",
      decision: "approved",
      confirmedByUser: true,
      approvedBy: "human_user",
      userConfirmation,
      selectedVersions: Object.fromEntries(activeGifVersions),
      approvedGifCount: 9,
      totalGifCount: 10,
      approvedImageCount: 40,
      assetManifestSha256,
      nextGate: "G4 ASSEMBLED_HTML",
      approvedAt,
    })}\n`,
    "utf8",
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      approvedAt,
      approvedImageCount: approvedImages.length,
      newlyApprovedGifCount: approvedGifRecords.length,
      totalApprovedGifCount: 10,
      rejectedSupersededGifCount: supersededGifVersions.size,
      assetManifestSha256,
    },
    null,
    2,
  ),
);
