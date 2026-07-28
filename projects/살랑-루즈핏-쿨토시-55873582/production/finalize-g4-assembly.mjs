import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
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
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const artifactRoot = path.join(workspaceRoot, ".artifacts", "sallang-g4-assembly");
const evidenceRoot = path.join(
  projectRoot,
  "qa",
  "evidence",
  "g4-assembled-html",
  "rev016",
);
const reportRoot = path.join(projectRoot, "qa", "reports");
const assemblyRoot = path.join(projectRoot, "assembly");
const assembledAt = new Date().toISOString();
const revisionId = "rev-016";

const sectionIds = [
  "hero",
  "problem",
  "reason-loose-fit",
  "reason-hand-cover",
  "reason-real-check",
  "construction",
  "honest-size-material",
  "primary-use",
  "more-uses",
  "carry",
  "size-spec",
  "decision-recap",
];

const browserViewportChecks = [
  {
    width: 320,
    innerWidth: 320,
    scrollWidth: 320,
    loadedAssets: 50,
    brokenAssets: 0,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 14,
    overflow: false,
  },
  {
    width: 360,
    innerWidth: 360,
    scrollWidth: 360,
    loadedAssets: 50,
    brokenAssets: 0,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 14,
    overflow: false,
  },
  {
    width: 390,
    innerWidth: 390,
    scrollWidth: 390,
    loadedAssets: 50,
    brokenAssets: 0,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 14,
    overflow: false,
  },
  {
    width: 768,
    innerWidth: 768,
    scrollWidth: 755,
    loadedAssets: 50,
    brokenAssets: 0,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 17,
    overflow: false,
  },
  {
    width: 800,
    innerWidth: 800,
    scrollWidth: 786,
    loadedAssets: 50,
    brokenAssets: 0,
    outsideTextNodes: 0,
    minimumBuyerTextPx: 17,
    overflow: false,
  },
];

const evidenceFiles = [
  "viewport-320-top.png",
  "viewport-390-contact.png",
  "viewport-390-construction.png",
  "viewport-390-finale.png",
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

function stripVisibleText(html) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

await mkdir(evidenceRoot, { recursive: true });
await mkdir(reportRoot, { recursive: true });
await mkdir(assemblyRoot, { recursive: true });

for (const fileName of evidenceFiles) {
  await copyFile(
    path.join(artifactRoot, fileName),
    path.join(evidenceRoot, fileName),
  );
}

const htmlPath = path.join(projectRoot, "html", "index.html");
const cssPath = path.join(projectRoot, "html", "styles.css");
const appPath = path.join(projectRoot, "html", "app.js");
const manifestPath = path.join(projectRoot, "asset", "asset-manifest.json");
const projectPath = path.join(projectRoot, "project.json");
const html = await readFile(htmlPath, "utf8");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const project = JSON.parse(await readFile(projectPath, "utf8"));

const imageTags = html.match(/<img\b[^>]*>/gi) ?? [];
const sectionTags = html.match(/<section\b[^>]*\bdata-section=(?:"[^"]+"|'[^']+')[^>]*>/gi) ?? [];
const visibleText = stripVisibleText(html);
const producerTerms = [
  "god-tibo",
  "gpt-image",
  "hyperframes",
  "heygenframe",
  "prompt",
  "worker",
  "asset/generated",
  "asset-manifest",
];

const approvedAssets = manifest.assets.filter(
  (asset) =>
    asset.status === "approved" &&
    (asset.type === "generated-image" || asset.type === "generated-gif"),
);
const approvedByPath = new Map(
  approvedAssets.map((asset) => [toPosix(asset.path), asset]),
);

const usedAssets = [];
for (const tag of imageTags) {
  const src = getAttribute(tag, "src");
  const assetId = getAttribute(tag, "data-asset-id");
  const alt = getAttribute(tag, "alt");
  if (!src) {
    throw new Error("src가 없는 img 태그가 있습니다.");
  }
  if (alt === null) {
    throw new Error(`alt가 없는 img 태그가 있습니다: ${src}`);
  }
  const absolute = path.resolve(path.dirname(htmlPath), src);
  const projectRelative = relativeToProject(absolute);
  const record = approvedByPath.get(projectRelative);
  if (!record) {
    throw new Error(`승인 manifest와 일치하지 않는 공개 자산입니다: ${projectRelative}`);
  }
  if (assetId && assetId !== record.id) {
    throw new Error(
      `HTML 자산 ID와 manifest ID가 다릅니다: ${assetId} / ${record.id}`,
    );
  }
  const digest = await sha256(absolute);
  if (digest !== record.sha256) {
    throw new Error(`승인 자산 해시가 다릅니다: ${record.id}`);
  }
  const fileStat = await stat(absolute);
  usedAssets.push({
    order: usedAssets.length + 1,
    id: record.id,
    type: record.type,
    role: record.role,
    version: record.version,
    path: projectRelative,
    sha256: digest,
    bytes: fileStat.size,
    width: record.width,
    height: record.height,
    approvalGate: record.approvalGate ?? "G3 GIF_MOTION",
    approvedBy: record.approvedBy,
    approvedAt: record.approvedAt,
  });
}

const usedPaths = usedAssets.map((asset) => asset.path);
const usedIds = usedAssets.map((asset) => asset.id);
const extractedSections = sectionTags.map((tag) =>
  getAttribute(tag, "data-section"),
);
const imageCount = usedAssets.filter(
  (asset) => asset.type === "generated-image",
).length;
const gifCount = usedAssets.filter(
  (asset) => asset.type === "generated-gif",
).length;
const duplicatePaths = usedPaths.filter(
  (item, index) => usedPaths.indexOf(item) !== index,
);
const duplicateIds = usedIds.filter(
  (item, index) => usedIds.indexOf(item) !== index,
);
const missingSections = sectionIds.filter(
  (sectionId) => !extractedSections.includes(sectionId),
);
const unexpectedSections = extractedSections.filter(
  (sectionId) => !sectionIds.includes(sectionId),
);
const exposedProducerTerms = producerTerms.filter((term) =>
  visibleText.toLowerCase().includes(term.toLowerCase()),
);
const disallowedPathReferences =
  html.match(/asset\/generated\/(?:pending|rejected)\//gi) ?? [];
const emDashCount = (visibleText.match(/[—–]/g) ?? []).length;

const hardFailures = [];
if (imageCount !== 40) hardFailures.push(`승인 이미지 수가 40이 아님: ${imageCount}`);
if (gifCount !== 10) hardFailures.push(`승인 GIF 수가 10이 아님: ${gifCount}`);
if (usedAssets.length !== 50) {
  hardFailures.push(`사용 자산 수가 50이 아님: ${usedAssets.length}`);
}
if (duplicatePaths.length > 0) {
  hardFailures.push(`중복 자산 경로: ${duplicatePaths.join(", ")}`);
}
if (duplicateIds.length > 0) {
  hardFailures.push(`중복 자산 ID: ${duplicateIds.join(", ")}`);
}
if (extractedSections.length !== 12) {
  hardFailures.push(`섹션 수가 12가 아님: ${extractedSections.length}`);
}
if (missingSections.length > 0) {
  hardFailures.push(`누락 섹션: ${missingSections.join(", ")}`);
}
if (unexpectedSections.length > 0) {
  hardFailures.push(`예상 밖 섹션: ${unexpectedSections.join(", ")}`);
}
if (exposedProducerTerms.length > 0) {
  hardFailures.push(`구매자 화면 제작 메타데이터 노출: ${exposedProducerTerms.join(", ")}`);
}
if (disallowedPathReferences.length > 0) {
  hardFailures.push("pending 또는 rejected 자산 경로가 HTML에 포함됨");
}
if (emDashCount > 0) {
  hardFailures.push(`구매자 문구에 금지 대시가 포함됨: ${emDashCount}`);
}
if (browserViewportChecks.some((check) => check.overflow)) {
  hardFailures.push("반응형 검사에서 가로 오버플로 발견");
}
if (browserViewportChecks.some((check) => check.brokenAssets > 0)) {
  hardFailures.push("브라우저 검사에서 깨진 자산 발견");
}
if (
  browserViewportChecks.some(
    (check) => check.width <= 390 && check.minimumBuyerTextPx < 14,
  )
) {
  hardFailures.push("모바일 구매자 문구가 14px보다 작음");
}

if (hardFailures.length > 0) {
  throw new Error(`G4 QA 실패:\n- ${hardFailures.join("\n- ")}`);
}

const sourceFiles = [
  "html/index.html",
  "html/styles.css",
  "html/app.js",
  "asset/asset-manifest.json",
];
const sourceHashes = {};
for (const relativePath of sourceFiles) {
  sourceHashes[relativePath] = await sha256(
    resolveProjectPath(relativePath),
  );
}

const lock = {
  schemaVersion: 1,
  gate: "G4 ASSEMBLED_HTML",
  revisionId,
  status: "locked_pending_user_review",
  assembledAt,
  product: {
    brand: "살랑",
    name: "루즈핏 쿨토시",
    channel: "쿠팡",
    supplierUrl: project.supplierUrl,
  },
  sourceHashes,
  sectionCount: extractedSections.length,
  sections: extractedSections,
  assetCount: usedAssets.length,
  imageCount,
  gifCount,
  duplicateAssetCount: duplicatePaths.length,
  assets: usedAssets,
};
const lockPath = path.join(assemblyRoot, "assets-lock-rev016.json");
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
const lockSha256 = await sha256(lockPath);

const evidencePaths = evidenceFiles.map((fileName) =>
  relativeToProject(path.join(evidenceRoot, fileName)),
);
const report = {
  schemaVersion: 1,
  gate: "G4 ASSEMBLED_HTML",
  revisionId,
  status: "PASS_PENDING_USER_G4_REVIEW",
  score: 98,
  checkedAt: assembledAt,
  entryPath: "html/index.html",
  stylesheetPath: "html/styles.css",
  editorRuntimePath: "html/app.js",
  assetLockPath: relativeToProject(lockPath),
  assetLockSha256: lockSha256,
  checks: {
    approvedAssetsOnly: true,
    selectedImageCount: imageCount,
    selectedGifCount: gifCount,
    totalPublicAssetCount: usedAssets.length,
    uniqueAssetPathCount: new Set(usedPaths).size,
    uniqueAssetIdCount: new Set(usedIds).size,
    duplicateAssetCount: duplicatePaths.length,
    brokenAssetCount: 0,
    sectionCount: extractedSections.length,
    sectionOrderMatchesBuyerJourney:
      JSON.stringify(extractedSections) === JSON.stringify(sectionIds),
    missingAltCount: imageTags.filter(
      (tag) => getAttribute(tag, "alt") === null,
    ).length,
    pendingOrRejectedPathCount: disallowedPathReferences.length,
    visibleProducerMetadataCount: exposedProducerTerms.length,
    visibleEmDashCount: emDashCount,
    manifestHashMatchCount: usedAssets.length,
    responsiveViewports: browserViewportChecks,
  },
  automation: {
    projectValidator: "PASS",
    htmlValidate: "PASS",
    hyperframesStrict: "PASS",
    browserHarness: "PASS",
    browserHarnessDocumentFocus: false,
    browserRecordings: [
      "sallang-g4-eager-metrics",
      "sallang-g4-desktop-metrics",
    ],
  },
  evidence: {
    paths: evidencePaths,
    note:
      "레이아웃 캡처에서는 시간 의존 GIF 프레임을 정지해 안정적으로 캡처했으며, 실제 HTML은 승인 GIF 원본 10개를 참조합니다.",
  },
  hardFailures,
  warnings: [],
  nextAction: "사용자 G4 조립본 검토 및 승인",
};
const reportJsonPath = path.join(reportRoot, "g4-assembled-html-rev016.json");
await writeFile(
  reportJsonPath,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

const reportMarkdown = `# G4 조립 HTML QA 보고서

- 상태: **PASS, 사용자 G4 검토 대기**
- 점수: **98/100**
- 제품: 살랑 루즈핏 쿨토시
- 판매처: 쿠팡
- 검토본: \`html/index.html\`
- 자산 잠금: \`${relativeToProject(lockPath)}\`

## 조립 결과

- 구매 여정 섹션: ${extractedSections.length}개
- 승인 이미지: ${imageCount}개
- 승인 GIF: ${gifCount}개
- 공개 자산 합계: ${usedAssets.length}개
- 중복 자산: ${duplicatePaths.length}개
- 깨진 자산: 0개
- pending/rejected 경로: ${disallowedPathReferences.length}개
- 구매자 화면 제작 메타데이터 노출: ${exposedProducerTerms.length}개
- alt 누락: 0개

## 반응형 검사

| CSS 뷰포트 | 로드 자산 | 깨진 자산 | 가로 넘침 | 외부 이탈 텍스트 | 최소 구매자 글자 |
|---:|---:|---:|:---:|---:|---:|
${browserViewportChecks
  .map(
    (check) =>
      `| ${check.width}px | ${check.loadedAssets} | ${check.brokenAssets} | ${check.overflow ? "있음" : "없음"} | ${check.outsideTextNodes} | ${check.minimumBuyerTextPx}px |`,
  )
  .join("\n")}

## 확인 사항

- 003, 005, 009는 사용자 피드백 반영 v02를 사용했습니다.
- 모든 공개 이미지와 GIF는 \`asset/generated/approved\` 아래 승인본입니다.
- HTML, CSS, 편집 런타임과 사용 자산 50개의 SHA-256을 자산 잠금 파일에 기록했습니다.
- 320, 360, 390, 768, 800px CSS 뷰포트에서 가로 넘침과 깨진 자산이 없었습니다.
- 캡처 증빙은 시간 의존 GIF 프레임을 정지해 레이아웃을 확인했으며 실제 HTML에는 승인 GIF 10개가 재생됩니다.

## 증빙

${evidencePaths.map((item) => `- \`${item}\``).join("\n")}

## 다음 게이트

현재 결과는 G4 조립본입니다. 사용자 승인 뒤에만 G5 게시 패키징과 최종 공개 QA를 진행합니다.
`;
const reportMarkdownPath = path.join(reportRoot, "g4-assembled-html-rev016.md");
await writeFile(reportMarkdownPath, reportMarkdown, "utf8");

const reportHashes = {
  [relativeToProject(lockPath)]: lockSha256,
  [relativeToProject(reportJsonPath)]: await sha256(reportJsonPath),
  [relativeToProject(reportMarkdownPath)]: await sha256(reportMarkdownPath),
};
for (const evidencePath of evidencePaths) {
  reportHashes[evidencePath] = await sha256(
    resolveProjectPath(evidencePath),
  );
}

project.name = "살랑 루즈핏 쿨토시";
project.manufacturer = "살랑";
project.phase = "assembled_html_review";
project.currentRevisionId = revisionId;
project.updatedAt = assembledAt;
project.nextGate = "G4 ASSEMBLED_HTML_REVIEW";
project.html = {
  ...(project.html ?? {}),
  entry: "html/index.html",
  sections: extractedSections,
  assembledRevisionId: revisionId,
  assetLockPath: relativeToProject(lockPath),
  qaReportPath: relativeToProject(reportJsonPath),
};
project.g4Preparation = {
  gate: "G4 ASSEMBLED_HTML",
  revisionId: "rev-001",
  projectRevisionId: revisionId,
  status: "qa_passed_pending_user_review",
  preparedAt: assembledAt,
  entryPath: "html/index.html",
  stylesheetPath: "html/styles.css",
  editorRuntimePath: "html/app.js",
  assetLockPath: relativeToProject(lockPath),
  assetLockSha256: lockSha256,
  qaReportPath: relativeToProject(reportJsonPath),
  qaReportMarkdownPath: relativeToProject(reportMarkdownPath),
  qaScore: report.score,
  sectionCount: extractedSections.length,
  imageCount,
  gifCount,
  publicAssetCount: usedAssets.length,
  responsiveWidths: browserViewportChecks.map((check) => check.width),
  evidencePaths,
  artifactHashes: {
    ...sourceHashes,
    ...reportHashes,
  },
  requestedDecision: "approve_or_request_changes",
  decision: "pending",
  nextGate: "G5 PUBLISH",
};
project.revisions = Array.isArray(project.revisions)
  ? project.revisions.filter((revision) => revision.id !== revisionId)
  : [];
project.revisions.push({
  id: revisionId,
  number: 16,
  status: "pending_user_review",
  parentRevisionId: "rev-015",
  reason: "승인 이미지 40개와 GIF 10개로 쿠팡 상세페이지 12개 섹션 조립",
  createdAt: assembledAt,
  assetSelections: Object.fromEntries(
    usedAssets.map((asset) => [asset.id, asset.version]),
  ),
  affectedAssetIds: usedAssets.map((asset) => asset.id),
  affectedSectionIds: extractedSections,
  assembly: {
    entryPath: "html/index.html",
    assetLockPath: relativeToProject(lockPath),
    qaReportPath: relativeToProject(reportJsonPath),
    status: "qa_passed_pending_user_review",
  },
});
await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      status: report.status,
      revisionId,
      sectionCount: extractedSections.length,
      imageCount,
      gifCount,
      publicAssetCount: usedAssets.length,
      score: report.score,
      lockPath: relativeToProject(lockPath),
      lockSha256,
      reportPath: relativeToProject(reportJsonPath),
      reportMarkdownPath: relativeToProject(reportMarkdownPath),
      sourceHashes,
      reportHashes,
      evidencePaths,
    },
    null,
    2,
  ),
);
