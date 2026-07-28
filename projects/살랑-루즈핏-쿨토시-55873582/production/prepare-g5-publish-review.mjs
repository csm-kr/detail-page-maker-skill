import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const toolingRoot = path.join(projectRoot, ".scratch", "g5-tooling");
const requireFromTooling = createRequire(path.join(toolingRoot, "entry.cjs"));
const sharp = requireFromTooling("sharp");

const sourceHtmlPath = path.join(projectRoot, "html", "index.html");
const sourceCssPath = path.join(projectRoot, "html", "styles.css");
const projectPath = path.join(projectRoot, "project.json");
const manifestPath = path.join(projectRoot, "asset", "asset-manifest.json");
const sourceLockPath = path.join(
  projectRoot,
  "assembly",
  "assets-lock-rev016.json",
);
const ledgerPath = path.join(projectRoot, "asset", "approval-ledger.ndjson");
const outputRoot = path.join(
  projectRoot,
  "asset",
  "output",
  "page",
  "rev017",
);
const outputAssetsRoot = path.join(outputRoot, "assets");
const localPreviewPath = path.join(outputRoot, "preview-local.html");
const standalonePath = path.join(
  outputRoot,
  "sallang-loosefit-coolsleeve-rev017-standalone.html",
);
const publicSkeletonPath = path.join(
  projectRoot,
  ".scratch",
  "g5-public-skeleton-rev017.html",
);
const packageManifestPath = path.join(
  outputRoot,
  "package-manifest.json",
);
const readmePath = path.join(outputRoot, "README.md");
const runAt = new Date().toISOString();
let approvedAt = runAt;
const userConfirmation = "승인";
const outputRevisionId = "rev-017";
const tenMiB = 10 * 1024 * 1024;

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function relativeToProject(filePath) {
  return toPosix(path.relative(projectRoot, filePath));
}

function resolveProjectPath(relativePath) {
  const absolute = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`프로젝트 밖 경로는 사용할 수 없습니다: ${relativePath}`);
  }
  return absolute;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  const body = await readFile(filePath);
  hash.update(body);
  return hash.digest("hex");
}

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) {
    await once(stream, "drain");
  }
}

async function writeStandaloneHtml(template, assetsByToken) {
  const stream = createWriteStream(standalonePath, { encoding: "utf8" });
  stream.on("error", (error) => {
    throw error;
  });
  const marker = /__G5_ASSET_(\d{3})__/g;
  let cursor = 0;
  for (const match of template.matchAll(marker)) {
    await writeChunk(stream, template.slice(cursor, match.index));
    const asset = assetsByToken.get(match[0]);
    if (!asset) {
      throw new Error(`독립 실행 HTML 토큰에 대응하는 자산이 없습니다: ${match[0]}`);
    }
    const base64 = (await readFile(resolveProjectPath(asset.outputPath))).toString(
      "base64",
    );
    await writeChunk(stream, `data:image/webp;base64,${base64}`);
    cursor = match.index + match[0].length;
  }
  await writeChunk(stream, template.slice(cursor));
  stream.end();
  await once(stream, "finish");
}

const sourceHtml = await readFile(sourceHtmlPath, "utf8");
const sourceCss = await readFile(sourceCssPath, "utf8");
const project = JSON.parse(await readFile(projectPath, "utf8"));
const assetManifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sourceLock = JSON.parse(await readFile(sourceLockPath, "utf8"));
const sourceLockSha256 = await sha256(sourceLockPath);

if (
  !["qa_passed_pending_user_review", "approved"].includes(
    project.g4Preparation?.status,
  )
) {
  throw new Error(
    `G4 검토 상태가 승인 기록 전 예상과 다릅니다: ${project.g4Preparation?.status}`,
  );
}
if (project.g4Preparation?.status === "approved") {
  approvedAt = project.g4Preparation.approvedAt ?? runAt;
}
if (project.g4Preparation.assetLockSha256 !== sourceLockSha256) {
  throw new Error("G4 자산 잠금 해시가 project.json과 일치하지 않습니다.");
}
if (sourceLock.assetCount !== 50 || sourceLock.imageCount !== 40 || sourceLock.gifCount !== 10) {
  throw new Error("G4 자산 잠금 수량이 40개 이미지와 10개 GIF가 아닙니다.");
}

const approvedByPath = new Map(
  assetManifest.assets
    .filter((asset) => asset.status === "approved")
    .map((asset) => [asset.path, asset]),
);

await mkdir(outputAssetsRoot, { recursive: true });
await mkdir(path.dirname(publicSkeletonPath), { recursive: true });

let previousPackageManifest = null;
try {
  previousPackageManifest = JSON.parse(
    await readFile(packageManifestPath, "utf8"),
  );
} catch {
  previousPackageManifest = null;
}
const previousAssetBySourcePath = new Map(
  (previousPackageManifest?.assets ?? []).map((asset) => [
    asset.sourcePath,
    asset,
  ]),
);

const outputAssets = [];
for (const sourceAsset of sourceLock.assets) {
  const approvedRecord = approvedByPath.get(sourceAsset.path);
  if (!approvedRecord) {
    throw new Error(`승인 manifest에서 찾을 수 없는 G4 자산입니다: ${sourceAsset.path}`);
  }
  const sourcePath = resolveProjectPath(sourceAsset.path);
  if ((await sha256(sourcePath)) !== sourceAsset.sha256) {
    throw new Error(`G4 승인 해시와 다른 자산입니다: ${sourceAsset.id}`);
  }

  const order = String(sourceAsset.order).padStart(2, "0");
  const safeRole = String(sourceAsset.role)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filename = `${order}-${sourceAsset.id.toLowerCase()}-${safeRole}.webp`;
  const outputPath = path.join(outputAssetsRoot, filename);
  const sourceIsAnimated = sourceAsset.type === "generated-gif";
  const sourceMetadata = await sharp(sourcePath, {
    animated: sourceIsAnimated,
  }).metadata();

  const previousAsset = previousAssetBySourcePath.get(sourceAsset.path);
  let reuseOutput = false;
  if (
    previousAsset?.sourceSha256 === sourceAsset.sha256 &&
    previousAsset?.outputPath === relativeToProject(outputPath)
  ) {
    try {
      reuseOutput =
        (await sha256(outputPath)) === previousAsset.sha256;
    } catch {
      reuseOutput = false;
    }
  }

  if (!reuseOutput) {
    if (sourceIsAnimated) {
      await sharp(sourcePath, { animated: true })
        .webp({
          quality: 88,
          alphaQuality: 100,
          effort: 4,
          loop: sourceMetadata.loop ?? 0,
        })
        .toFile(outputPath);
    } else {
      await sharp(sourcePath)
        .rotate()
        .resize({
          width: Math.min(1600, sourceMetadata.width ?? 1600),
          withoutEnlargement: true,
        })
        .webp({
          quality: 88,
          alphaQuality: 100,
          effort: 4,
          smartSubsample: true,
        })
        .toFile(outputPath);
    }
  }

  const outputMetadata = await sharp(outputPath, {
    animated: sourceIsAnimated,
  }).metadata();
  const outputStat = await stat(outputPath);
  const sourceDurationMs = Array.isArray(sourceMetadata.delay)
    ? sourceMetadata.delay.reduce((sum, delay) => sum + delay, 0)
    : null;
  const outputDurationMs = Array.isArray(outputMetadata.delay)
    ? outputMetadata.delay.reduce((sum, delay) => sum + delay, 0)
    : null;
  if (
    sourceIsAnimated &&
    (outputDurationMs !== sourceDurationMs ||
      (outputMetadata.loop ?? 0) !== (sourceMetadata.loop ?? 0))
  ) {
    throw new Error(`애니메이션 시간 또는 반복 설정이 달라졌습니다: ${sourceAsset.id}`);
  }
  if (outputStat.size >= tenMiB) {
    throw new Error(`G5 최적화 자산이 10MiB 이상입니다: ${filename}`);
  }

  outputAssets.push({
    order: sourceAsset.order,
    assetId: sourceAsset.id,
    role: sourceAsset.role,
    sourceKind: sourceAsset.type,
    sourceVersion: sourceAsset.version,
    sourcePath: sourceAsset.path,
    sourceSha256: sourceAsset.sha256,
    sourceBytes: sourceAsset.bytes,
    filename,
    outputPath: relativeToProject(outputPath),
    kind: sourceIsAnimated ? "animated-webp" : "static-webp",
    format: "webp",
    mimeType: "image/webp",
    width: outputMetadata.width,
    height: sourceIsAnimated
      ? outputMetadata.pageHeight
      : outputMetadata.height,
    sourceFrames: sourceMetadata.pages ?? 1,
    frames: outputMetadata.pages ?? 1,
    sourceDurationMs,
    durationMs: outputDurationMs,
    loopCount: outputMetadata.loop ?? null,
    bytes: outputStat.size,
    megabytes: Number((outputStat.size / 1024 / 1024).toFixed(3)),
    under10MiB: outputStat.size < tenMiB,
    sha256: await sha256(outputPath),
  });
}

if (outputAssets.length !== 50) {
  throw new Error(`G5 출력 자산 수가 50개가 아닙니다: ${outputAssets.length}`);
}
if (outputAssets.filter((asset) => asset.kind === "animated-webp").length !== 10) {
  throw new Error("G5 애니메이션 WebP 수가 10개가 아닙니다.");
}

let publicHtml = sourceHtml
  .replace(
    /<link\b[^>]*rel=(?:"stylesheet"|'stylesheet')[^>]*>/i,
    `<style>\n${sourceCss}\n</style>`,
  )
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/\sdata-studio-project=(?:"[^"]*"|'[^']*')/gi, "")
  .replace(/\sdata-export-name=(?:"[^"]*"|'[^']*')/gi, "")
  .replace(/\sdata-edit-image\b/gi, "")
  .replace(/\sdata-edit\b/gi, "")
  .replace(/\sdata-asset-id=(?:"[^"]*"|'[^']*')/gi, "")
  .replace(/\sdata-layer-id=(?:"[^"]*"|'[^']*')/gi, "")
  .replace(/\sdata-section=(?:"[^"]*"|'[^']*')/gi, "")
  .replace(/\sdata-edit-id=(?:"[^"]*"|'[^']*')/gi, "")
  .replace(/\scontenteditable=(?:"[^"]*"|'[^']*')/gi, "")
  .replace(/<html\b([^>]*)>/i, '<html$1 data-export="self-contained">');
publicHtml = `${publicHtml.replace(/[ \t]+$/gm, "").trimEnd()}\n`;

const outputAssetsByOrder = new Map(
  outputAssets.map((asset) => [asset.order, asset]),
);
const tokenToAsset = new Map();
let imageOrder = 0;
publicHtml = publicHtml.replace(
  /(<img\b[^>]*\bsrc=")([^"]+)(")/gi,
  (_match, prefix, _source, suffix) => {
    imageOrder += 1;
    const asset = outputAssetsByOrder.get(imageOrder);
    if (!asset) {
      throw new Error(`HTML의 ${imageOrder}번째 이미지와 출력 자산을 연결할 수 없습니다.`);
    }
    const token = `__G5_ASSET_${String(imageOrder).padStart(3, "0")}__`;
    tokenToAsset.set(token, asset);
    return `${prefix}${token}${suffix}`;
  },
);

if (imageOrder !== 50) {
  throw new Error(`공개 HTML img 수가 50개가 아닙니다: ${imageOrder}`);
}

const relativePreviewHtml = publicHtml.replace(
  /__G5_ASSET_(\d{3})__/g,
  (token) => {
    const asset = tokenToAsset.get(token);
    if (!asset) throw new Error(`상대 경로 변환 실패: ${token}`);
    return `assets/${asset.filename}`;
  },
);
const skeletonHtml = publicHtml.replace(
  /__G5_ASSET_(\d{3})__/g,
  "data:image/webp;base64,UklGRg==",
);
await writeFile(localPreviewPath, relativePreviewHtml, "utf8");
await writeFile(publicSkeletonPath, skeletonHtml, "utf8");
await writeStandaloneHtml(publicHtml, tokenToAsset);

const outputFileStat = await stat(standalonePath);
const outputFileSha256 = await sha256(standalonePath);
const localPreviewSha256 = await sha256(localPreviewPath);

const packageManifest = {
  schemaVersion: 1,
  gate: "G5 PUBLISH",
  revisionId: outputRevisionId,
  status: "candidate_pending_user_publish_approval",
  createdAt: approvedAt,
  product: {
    brand: "살랑",
    name: "루즈핏 쿨토시",
    channel: "쿠팡",
    supplierUrl: project.supplierUrl,
  },
  source: {
    g4RevisionId: "rev-016",
    g4AssetLockPath: relativeToProject(sourceLockPath),
    g4AssetLockSha256: sourceLockSha256,
    sourceHtmlPath: relativeToProject(sourceHtmlPath),
    sourceHtmlSha256: await sha256(sourceHtmlPath),
    sourceCssPath: relativeToProject(sourceCssPath),
    sourceCssSha256: await sha256(sourceCssPath),
  },
  output: {
    localPreviewPath: relativeToProject(localPreviewPath),
    localPreviewSha256,
    standalonePath: relativeToProject(standalonePath),
    standaloneSha256: outputFileSha256,
    standaloneBytes: outputFileStat.size,
    standaloneMegabytes: Number(
      (outputFileStat.size / 1024 / 1024).toFixed(3),
    ),
    selfContained: true,
    scripts: 0,
    externalStylesheets: 0,
    embeddedAssetCount: 50,
    staticWebpCount: 40,
    animatedWebpCount: 10,
  },
  optimization: {
    staticWebpQuality: 88,
    animatedWebpQuality: 88,
    maximumStaticWidth: 1600,
    maximumAssetBytes: tenMiB,
    allAssetsUnder10MiB: outputAssets.every((asset) => asset.under10MiB),
    animationDurationPreserved: outputAssets
      .filter((asset) => asset.kind === "animated-webp")
      .every((asset) => asset.durationMs === asset.sourceDurationMs),
    animationLoopPreserved: true,
    frameMergePolicy:
      "애니메이션 WebP 인코더가 연속 동일 프레임을 병합할 수 있으나 총 재생시간과 무한 반복은 보존합니다.",
  },
  assets: outputAssets,
  cdn: {
    deployed: false,
    reason: "G5 사용자 게시 승인 전에는 외부 CDN에 배포하지 않습니다.",
  },
};
await writeFile(
  packageManifestPath,
  `${JSON.stringify(packageManifest, null, 2)}\n`,
  "utf8",
);
const packageManifestSha256 = await sha256(packageManifestPath);

const readme = `# 살랑 루즈핏 쿨토시 G5 게시 검토 패키지

이 폴더는 사용자 G4 승인을 반영한 G5 게시 후보입니다.

## 파일

- \`preview-local.html\`: 최적화 WebP 50개를 상대 경로로 읽는 로컬 검토본
- \`sallang-loosefit-coolsleeve-rev017-standalone.html\`: CSS와 자산을 모두 포함한 독립 실행 HTML
- \`package-manifest.json\`: 원본과 출력 자산의 SHA-256, 규격, 애니메이션 시간과 반복 정보
- \`assets/\`: 정적 WebP 40개와 애니메이션 WebP 10개

## 상태

- G4 조립본: 사용자 승인
- G5 최종 QA: 진행 중
- 외부 CDN 배포: 미실행
- 쿠팡 Wing 게시: 미실행

G5 사용자 게시 승인 전에는 이 패키지를 외부에 배포하지 않습니다.
`;
await writeFile(readmePath, readme, "utf8");

const ledgerBody = await readFile(ledgerPath, "utf8");
const g4EventId = "g4-assembled-html-approved-rev016";
if (!ledgerBody.includes(`"eventId":"${g4EventId}"`)) {
  await appendFile(
    ledgerPath,
    `${JSON.stringify({
      schemaVersion: 1,
      eventId: g4EventId,
      gate: "G4 ASSEMBLED_HTML",
      decision: "approved",
      projectRevisionId: "rev-016",
      approvedAt,
      approvedBy: "human_user",
      userConfirmation,
      entryPath: "html/index.html",
      assetLockPath: relativeToProject(sourceLockPath),
      assetLockSha256: sourceLockSha256,
      qaReportPath: "qa/reports/g4-assembled-html-rev016.json",
      qaScore: 98,
      nextGate: "G5 PUBLISH",
    })}\n`,
    "utf8",
  );
}

project.phase = "final_qa_in_progress";
project.currentRevisionId = outputRevisionId;
project.updatedAt = approvedAt;
project.nextGate = "G5 PUBLISH";
project.g4Preparation.status = "approved";
project.g4Preparation.decision = "approved";
project.g4Preparation.approvedAt = approvedAt;
project.g4Preparation.approvedBy = "human_user";
project.g4Preparation.userConfirmation = userConfirmation;
project.revisions = project.revisions.map((revision) =>
  revision.id === "rev-016"
    ? {
        ...revision,
        status: "approved",
        approvedAt,
        approvedBy: "human_user",
        userConfirmation,
      }
    : revision,
);
project.revisions = project.revisions.filter(
  (revision) => revision.id !== outputRevisionId,
);
project.revisions.push({
  id: outputRevisionId,
  number: 17,
  status: "qa_in_progress",
  parentRevisionId: "rev-016",
  reason: "G4 승인 조립본을 독립 실행 HTML과 최적화 WebP 게시 후보로 패키징",
  createdAt: approvedAt,
  assetSelections: Object.fromEntries(
    outputAssets.map((asset) => [asset.assetId, asset.sourceVersion]),
  ),
  affectedAssetIds: outputAssets.map((asset) => asset.assetId),
  affectedSectionIds: sourceLock.sections,
  assembly: {
    packageManifestPath: relativeToProject(packageManifestPath),
    localPreviewPath: relativeToProject(localPreviewPath),
    standalonePath: relativeToProject(standalonePath),
    status: "package_built_qa_pending",
  },
});
project.g5Preparation = {
  gate: "G5 PUBLISH",
  revisionId: "rev-001",
  projectRevisionId: outputRevisionId,
  status: "package_built_qa_pending",
  preparedAt: approvedAt,
  packageRoot: relativeToProject(outputRoot),
  packageManifestPath: relativeToProject(packageManifestPath),
  packageManifestSha256,
  localPreviewPath: relativeToProject(localPreviewPath),
  localPreviewSha256,
  standalonePath: relativeToProject(standalonePath),
  standaloneSha256: outputFileSha256,
  standaloneBytes: outputFileStat.size,
  staticWebpCount: 40,
  animatedWebpCount: 10,
  allAssetsUnder10MiB: outputAssets.every((asset) => asset.under10MiB),
  externalDeployment: "not_started",
  requestedDecision: "pending_final_qa",
  decision: "pending",
};
await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      status: "PACKAGE_BUILT_QA_PENDING",
      g4Decision: "approved",
      projectRevisionId: outputRevisionId,
      outputRoot: relativeToProject(outputRoot),
      localPreviewPath: relativeToProject(localPreviewPath),
      localPreviewSha256,
      standalonePath: relativeToProject(standalonePath),
      standaloneSha256: outputFileSha256,
      standaloneBytes: outputFileStat.size,
      packageManifestPath: relativeToProject(packageManifestPath),
      packageManifestSha256,
      staticWebpCount: 40,
      animatedWebpCount: 10,
      totalOutputAssetBytes: outputAssets.reduce(
        (sum, asset) => sum + asset.bytes,
        0,
      ),
      maximumOutputAssetBytes: Math.max(
        ...outputAssets.map((asset) => asset.bytes),
      ),
      allAssetsUnder10MiB: outputAssets.every((asset) => asset.under10MiB),
      publicSkeletonPath: relativeToProject(publicSkeletonPath),
    },
    null,
    2,
  ),
);
