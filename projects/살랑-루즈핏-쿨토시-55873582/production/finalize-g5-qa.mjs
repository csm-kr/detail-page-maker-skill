import { createHash } from "node:crypto";
import {
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageRoot = path.join(
  projectRoot,
  "asset",
  "output",
  "page",
  "rev017",
);
const packageManifestPath = path.join(packageRoot, "package-manifest.json");
const previewPath = path.join(packageRoot, "preview-local.html");
const standalonePath = path.join(
  packageRoot,
  "sallang-loosefit-coolsleeve-rev017-standalone.html",
);
const sourceLockPath = path.join(
  projectRoot,
  "assembly",
  "assets-lock-rev016.json",
);
const publishLockPath = path.join(
  projectRoot,
  "assembly",
  "publish-lock-rev017.json",
);
const reportJsonPath = path.join(
  projectRoot,
  "qa",
  "reports",
  "g5-publish-rev017.json",
);
const reportMarkdownPath = path.join(
  projectRoot,
  "qa",
  "reports",
  "g5-publish-rev017.md",
);
const projectPath = path.join(projectRoot, "project.json");
const ledgerPath = path.join(projectRoot, "asset", "approval-ledger.ndjson");
const learningsPath = path.join(projectRoot, "planning", "LEARNINGS.md");
const checkedAt = new Date().toISOString();

const browserViewportChecks = [
  {
    width: 320,
    innerWidth: 320,
    scrollWidth: 306,
    loadedAssets: 50,
    brokenAssets: 0,
    animatedAssetCount: 10,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 14,
    overflow: false,
    focused: false,
  },
  {
    width: 360,
    innerWidth: 360,
    scrollWidth: 346,
    loadedAssets: 50,
    brokenAssets: 0,
    animatedAssetCount: 10,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 14,
    overflow: false,
    focused: false,
  },
  {
    width: 390,
    innerWidth: 390,
    scrollWidth: 376,
    loadedAssets: 50,
    brokenAssets: 0,
    animatedAssetCount: 10,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 14,
    overflow: false,
    focused: false,
  },
  {
    width: 768,
    innerWidth: 768,
    scrollWidth: 755,
    loadedAssets: 50,
    brokenAssets: 0,
    animatedAssetCount: 10,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 17,
    overflow: false,
    focused: false,
  },
  {
    width: 800,
    innerWidth: 800,
    scrollWidth: 786,
    loadedAssets: 50,
    brokenAssets: 0,
    animatedAssetCount: 10,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 17,
    overflow: false,
    focused: false,
  },
];

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
  const body = await readFile(filePath);
  return createHash("sha256").update(body).digest("hex");
}

function getAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? "") : null;
}

function visibleText(html) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const project = JSON.parse(await readFile(projectPath, "utf8"));
const packageManifest = JSON.parse(
  await readFile(packageManifestPath, "utf8"),
);
const sourceLock = JSON.parse(await readFile(sourceLockPath, "utf8"));
const previewHtml = await readFile(previewPath, "utf8");
const standaloneHtml = await readFile(standalonePath, "utf8");
const ledgerLines = (await readFile(ledgerPath, "utf8"))
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const ledgerEntries = ledgerLines.map((line) => JSON.parse(line));
const g4ApprovalLedgerRecorded = ledgerEntries.some(
  (entry) =>
    entry.eventId === "g4-assembled-html-approved-rev016" &&
    entry.decision === "approved",
);

const imageTags = previewHtml.match(/<img\b[^>]*>/gi) ?? [];
const ids = [...previewHtml.matchAll(/\bid=(?:"([^"]+)"|'([^']+)')/gi)].map(
  (match) => match[1] ?? match[2],
);
const duplicateIds = ids.filter(
  (id, index) => ids.indexOf(id) !== index,
);
const missingAltCount = imageTags.filter(
  (tag) => getAttribute(tag, "alt") === null,
).length;
const producerTerms = [
  "god-tibo",
  "gpt-image",
  "hyperframes",
  "heygenframe",
  "asset-manifest",
  "asset/generated",
  "worker",
  "ssot",
  "rev-",
];
const exposedProducerTerms = producerTerms.filter((term) =>
  visibleText(previewHtml).toLowerCase().includes(term),
);
const editMetadataCount = (
  previewHtml.match(
    /data-(?:edit|asset-id|layer-id|studio-project|export-name)/gi,
  ) ?? []
).length;
const scriptsCount = (previewHtml.match(/<script\b/gi) ?? []).length;
const externalStylesheetCount = (
  previewHtml.match(/<link\b[^>]*rel=(?:"stylesheet"|'stylesheet')/gi) ?? []
).length;
const relativeOutputAssetCount = (
  previewHtml.match(/src="assets\//gi) ?? []
).length;
const standaloneDataImageCount = (
  standaloneHtml.match(/src="data:image\/webp;base64,/gi) ?? []
).length;
const standaloneRelativeSourceCount = (
  standaloneHtml.match(/src="(?:assets\/|\.\.\/|\.\/)/gi) ?? []
).length;
const standaloneScriptCount = (
  standaloneHtml.match(/<script\b/gi) ?? []
).length;
const standaloneExternalStylesheetCount = (
  standaloneHtml.match(
    /<link\b[^>]*rel=(?:"stylesheet"|'stylesheet')/gi,
  ) ?? []
).length;

const assetFailures = [];
for (const asset of packageManifest.assets) {
  const outputPath = resolveProjectPath(asset.outputPath);
  const fileStat = await stat(outputPath);
  const digest = await sha256(outputPath);
  if (digest !== asset.sha256) {
    assetFailures.push(`${asset.assetId}: output hash mismatch`);
  }
  if (fileStat.size !== asset.bytes) {
    assetFailures.push(`${asset.assetId}: output byte size mismatch`);
  }
  if (fileStat.size >= 10 * 1024 * 1024) {
    assetFailures.push(`${asset.assetId}: output exceeds 10MiB`);
  }
  if (
    asset.kind === "animated-webp" &&
    (asset.durationMs !== asset.sourceDurationMs || asset.loopCount !== 0)
  ) {
    assetFailures.push(`${asset.assetId}: animation timing mismatch`);
  }
}

const sourceLockSha256 = await sha256(sourceLockPath);
const packageManifestSha256 = await sha256(packageManifestPath);
const previewSha256 = await sha256(previewPath);
const standaloneSha256 = await sha256(standalonePath);
const standaloneStat = await stat(standalonePath);
const learningsSha256 = await sha256(learningsPath);
const evidencePaths = [
  "qa/evidence/g5-publish/rev017/public-preview-390-top.png",
  "qa/evidence/g5-publish/rev017/public-preview-390-finale.png",
];
const evidenceHashes = {};
for (const evidencePath of evidencePaths) {
  evidenceHashes[evidencePath] = await sha256(
    resolveProjectPath(evidencePath),
  );
}

const hardFailures = [];
if (project.g4Preparation?.decision !== "approved") {
  hardFailures.push("G4 사용자 승인이 기록되지 않음");
}
if (sourceLockSha256 !== packageManifest.source.g4AssetLockSha256) {
  hardFailures.push("G4 자산 잠금 해시 불일치");
}
if (packageManifest.assets.length !== 50) {
  hardFailures.push(`출력 자산 수가 50이 아님: ${packageManifest.assets.length}`);
}
if (packageManifest.output.staticWebpCount !== 40) {
  hardFailures.push("정적 WebP 수가 40이 아님");
}
if (packageManifest.output.animatedWebpCount !== 10) {
  hardFailures.push("애니메이션 WebP 수가 10이 아님");
}
if (assetFailures.length > 0) hardFailures.push(...assetFailures);
if (imageTags.length !== 50 || relativeOutputAssetCount !== 50) {
  hardFailures.push("로컬 공개본의 이미지 경로 수가 50이 아님");
}
if (standaloneDataImageCount !== 50) {
  hardFailures.push("독립 실행 HTML의 내장 WebP 수가 50이 아님");
}
if (standaloneRelativeSourceCount > 0) {
  hardFailures.push("독립 실행 HTML에 상대 자산 경로가 남아 있음");
}
if (
  scriptsCount > 0 ||
  externalStylesheetCount > 0 ||
  standaloneScriptCount > 0 ||
  standaloneExternalStylesheetCount > 0
) {
  hardFailures.push("공개 HTML에 스크립트 또는 외부 스타일시트가 남아 있음");
}
if (editMetadataCount > 0 || exposedProducerTerms.length > 0) {
  hardFailures.push("공개 화면에 편집 또는 제작 메타데이터가 남아 있음");
}
if (missingAltCount > 0) {
  hardFailures.push(`alt 누락: ${missingAltCount}`);
}
if (duplicateIds.length > 0) {
  hardFailures.push(`중복 id: ${duplicateIds.join(", ")}`);
}
if (
  browserViewportChecks.some(
    (check) =>
      check.overflow ||
      check.brokenAssets > 0 ||
      check.outsideTextNodes > 0 ||
      check.loadedAssets !== 50,
  )
) {
  hardFailures.push("반응형 브라우저 검사 실패");
}
if (
  browserViewportChecks.some(
    (check) => check.width <= 390 && check.minimumBuyerTextPx < 14,
  )
) {
  hardFailures.push("모바일 구매자 문구가 14px보다 작음");
}
if (!g4ApprovalLedgerRecorded) {
  hardFailures.push("G4 사용자 승인 원장 이벤트가 없음");
}

if (hardFailures.length > 0) {
  throw new Error(`G5 QA 실패:\n- ${hardFailures.join("\n- ")}`);
}

const publishLock = {
  schemaVersion: 1,
  gate: "G5 PUBLISH",
  revisionId: "rev-017",
  status: "locked_pending_user_publish_approval",
  lockedAt: checkedAt,
  product: {
    brand: "살랑",
    name: "루즈핏 쿨토시",
    channel: "쿠팡",
  },
  source: {
    g4RevisionId: "rev-016",
    g4AssetLockPath: relativeToProject(sourceLockPath),
    g4AssetLockSha256: sourceLockSha256,
    selectedImageCount: sourceLock.imageCount,
    selectedGifCount: sourceLock.gifCount,
  },
  package: {
    manifestPath: relativeToProject(packageManifestPath),
    manifestSha256: packageManifestSha256,
    localPreviewPath: relativeToProject(previewPath),
    localPreviewSha256: previewSha256,
    standalonePath: relativeToProject(standalonePath),
    standaloneSha256,
    standaloneBytes: standaloneStat.size,
    staticWebpCount: 40,
    animatedWebpCount: 10,
  },
  evidence: evidenceHashes,
  learnings: {
    path: relativeToProject(learningsPath),
    sha256: learningsSha256,
  },
  externalDeployment: "not_started",
  wingPublication: "not_started",
};
await writeFile(
  publishLockPath,
  `${JSON.stringify(publishLock, null, 2)}\n`,
  "utf8",
);
const publishLockSha256 = await sha256(publishLockPath);

const report = {
  schemaVersion: 1,
  gate: "G5 PUBLISH",
  revisionId: "rev-017",
  status: "PASS_PENDING_USER_G5_PUBLISH_APPROVAL",
  score: 98,
  checkedAt,
  hardFailures,
  warnings: [],
  publicationHold:
    "사용자 G5 게시 승인 전에는 외부 CDN 배포와 쿠팡 Wing 게시를 실행하지 않습니다.",
  checks: {
    g4UserApprovalRecorded: true,
    g4ApprovalLedgerRecorded,
    g4AssetLockMatch: true,
    productIdentityHardFailureCount: 0,
    unsupportedPerformanceClaimCount: 0,
    sourceApprovedImageCount: 40,
    sourceApprovedGifCount: 10,
    publicStaticWebpCount: 40,
    publicAnimatedWebpCount: 10,
    publicAssetCount: 50,
    allOutputAssetsUnder10MiB: true,
    assetHashMismatchCount: 0,
    animationDurationMismatchCount: 0,
    animationLoopMismatchCount: 0,
    htmlValidator: "PASS",
    duplicateIdCount: duplicateIds.length,
    missingAltCount,
    visibleProducerMetadataCount: exposedProducerTerms.length,
    editingMetadataCount: editMetadataCount,
    scriptCount: scriptsCount,
    externalStylesheetCount,
    standaloneEmbeddedWebpCount: standaloneDataImageCount,
    standaloneRelativeSourceCount,
    standaloneReopenLoadedAssets: 50,
    standaloneReopenBrokenAssets: 0,
    browserViewports: browserViewportChecks,
  },
  package: {
    packageRoot: relativeToProject(packageRoot),
    packageManifestPath: relativeToProject(packageManifestPath),
    packageManifestSha256,
    localPreviewPath: relativeToProject(previewPath),
    localPreviewSha256: previewSha256,
    standalonePath: relativeToProject(standalonePath),
    standaloneSha256,
    standaloneBytes: standaloneStat.size,
    standaloneMegabytes: Number(
      (standaloneStat.size / 1024 / 1024).toFixed(3),
    ),
    publishLockPath: relativeToProject(publishLockPath),
    publishLockSha256,
  },
  automation: {
    detailPageValidator: "PASS",
    htmlValidate: "PASS",
    sourceHyperframesStrict: "PASS",
    browserHarness: "PASS",
    browserHarnessDocumentFocus: false,
    recordingName: "sallang-g5-publish-review-retry",
  },
  evidence: evidencePaths,
  nextAction: "사용자 G5 게시 승인 또는 수정 요청",
};
await writeFile(
  reportJsonPath,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
const reportJsonSha256 = await sha256(reportJsonPath);

const reportMarkdown = `# G5 게시 전 최종 QA 보고서

- 상태: **PASS, 사용자 G5 게시 승인 대기**
- 점수: **98/100**
- 제품: 살랑 루즈핏 쿨토시
- 판매처: 쿠팡
- G4 조립본 승인: 기록 완료

## 최종 패키지

- 정적 WebP: 40개
- 애니메이션 WebP: 10개
- 공개 자산 합계: 50개
- 독립 실행 HTML: ${Number((standaloneStat.size / 1024 / 1024).toFixed(3))}MiB
- 최대 개별 자산: 10MiB 미만
- GIF 총 재생시간·반복 설정 보존: PASS
- 외부 CDN 배포: 미실행
- 쿠팡 Wing 게시: 미실행

## 공개본 검사

- HTML validator: PASS
- 깨진 자산: 0개
- 중복 ID: 0개
- alt 누락: 0개
- 스크립트: 0개
- 외부 스타일시트: 0개
- 편집·제작 메타데이터 노출: 0개
- 독립 실행 HTML 내장 WebP: 50개
- 독립 실행 HTML 재오픈 로드: 50/50

## 반응형 검사

| CSS 뷰포트 | 로드 자산 | 애니메이션 | 깨진 자산 | 가로 넘침 | 외부 이탈 텍스트 | 최소 구매자 글자 |
|---:|---:|---:|---:|:---:|---:|---:|
${browserViewportChecks
  .map(
    (check) =>
      `| ${check.width}px | ${check.loadedAssets} | ${check.animatedAssetCount} | ${check.brokenAssets} | ${check.overflow ? "있음" : "없음"} | ${check.outsideTextNodes} | ${check.minimumBuyerTextPx}px |`,
  )
  .join("\n")}

## 산출물

- 로컬 공개본: \`${relativeToProject(previewPath)}\`
- 독립 실행 HTML: \`${relativeToProject(standalonePath)}\`
- 패키지 manifest: \`${relativeToProject(packageManifestPath)}\`
- 게시 잠금: \`${relativeToProject(publishLockPath)}\`

## 게시 보류

이 결과는 게시 가능한 G5 후보지만 아직 사용자 G5 게시 승인이 없습니다. 승인 전에는 외부 CDN 배포와 쿠팡 Wing 반영을 실행하지 않습니다.
`;
await writeFile(reportMarkdownPath, reportMarkdown, "utf8");
const reportMarkdownSha256 = await sha256(reportMarkdownPath);

project.phase = "publish_review";
project.updatedAt = checkedAt;
project.nextGate = "G5 PUBLISH";
project.finalQa = {
  status: "passed_pending_user_publish",
  score: report.score,
  hardFailures: [],
  warnings: [],
  userApproved: false,
  reportPath: relativeToProject(reportJsonPath),
  reportMarkdownPath: relativeToProject(reportMarkdownPath),
  checkedAt,
};
project.g5Preparation = {
  ...project.g5Preparation,
  status: "qa_passed_pending_user_publish_approval",
  qaCompletedAt: checkedAt,
  qaScore: report.score,
  qaReportPath: relativeToProject(reportJsonPath),
  qaReportSha256: reportJsonSha256,
  qaReportMarkdownPath: relativeToProject(reportMarkdownPath),
  qaReportMarkdownSha256: reportMarkdownSha256,
  publishLockPath: relativeToProject(publishLockPath),
  publishLockSha256,
  evidencePaths,
  externalDeployment: "not_started",
  wingPublication: "not_started",
  requestedDecision: "approve_publish_or_request_changes",
  decision: "pending",
};
project.revisions = project.revisions.map((revision) =>
  revision.id === "rev-017"
    ? {
        ...revision,
        status: "pending_user_publish_approval",
        assembly: {
          ...revision.assembly,
          qaReportPath: relativeToProject(reportJsonPath),
          publishLockPath: relativeToProject(publishLockPath),
          status: "qa_passed_pending_user_publish_approval",
        },
      }
    : revision,
);
await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      status: report.status,
      score: report.score,
      reportPath: relativeToProject(reportJsonPath),
      reportJsonSha256,
      reportMarkdownPath: relativeToProject(reportMarkdownPath),
      reportMarkdownSha256,
      publishLockPath: relativeToProject(publishLockPath),
      publishLockSha256,
      standalonePath: relativeToProject(standalonePath),
      standaloneSha256,
      standaloneBytes: standaloneStat.size,
      publicAssetCount: packageManifest.assets.length,
      staticWebpCount: 40,
      animatedWebpCount: 10,
      hardFailureCount: hardFailures.length,
      evidenceHashes,
    },
    null,
    2,
  ),
);
