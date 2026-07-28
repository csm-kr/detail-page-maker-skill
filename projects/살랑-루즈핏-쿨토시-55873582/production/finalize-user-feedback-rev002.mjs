import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(productionRoot, "..");
const repositoryRoot = path.resolve(projectRoot, "..", "..");
const planPath = path.join(productionRoot, "production-plan.json");
const assetManifestPath = path.join(projectRoot, "asset", "asset-manifest.json");
const now = new Date().toISOString();

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

const jobDefinitions = [
  {
    jobId: "correction-02-landscape-1536x1024",
    jobPath: "production/jobs/correction-02-landscape-1536x1024.json",
    outputDirectory:
      "asset/generated/pending/image/production-rev002-feedback/correction-02-landscape",
    workers: 4,
    sizeMode: "controllable",
    targetSize: "1536x1024",
    attempts: [
      { assetId: "A01", role: "pair-flatlay-hero", index: 0, version: "v02", qaStatus: "PASS" },
      {
        assetId: "A03",
        role: "single-reverse-label",
        index: 1,
        version: "v02",
        qaStatus: "FAIL",
        finding: "왼쪽 후면 뷰에 실물의 옆면 엄지 홀이 누락됨.",
      },
      { assetId: "D01", role: "pair-clean-cutout", index: 2, version: "v02", qaStatus: "PASS" },
      { assetId: "E07", role: "pair-wide-banner", index: 3, version: "v02", qaStatus: "PASS" },
    ],
  },
  {
    jobId: "correction-02-square-1024x1024",
    jobPath: "production/jobs/correction-02-square-1024x1024.json",
    outputDirectory:
      "asset/generated/pending/image/production-rev002-feedback/correction-02-square",
    workers: 3,
    sizeMode: "controllable",
    targetSize: "1024x1024",
    attempts: [
      { assetId: "A04", role: "pleat-macro", index: 0, version: "v02", qaStatus: "PASS" },
      { assetId: "D08", role: "folded-pair-stack", index: 1, version: "v02", qaStatus: "PASS" },
      { assetId: "E08", role: "thumbhole-procedure-mid", index: 2, version: "v03", qaStatus: "PASS" },
    ],
  },
  {
    jobId: "correction-03-a03-thumb-opening",
    jobPath: "production/jobs/correction-03-a03-thumb-opening.json",
    outputDirectory:
      "asset/generated/pending/image/production-rev002-feedback/correction-03-a03",
    workers: 1,
    sizeMode: "invariant",
    targetSize: "1536x1024",
    attempts: [
      {
        assetId: "A03",
        role: "single-reverse-label",
        index: 0,
        version: "v03",
        qaStatus: "FAIL",
        finding: "엄지 홀은 추가됐으나 상·하단이 잘려 완제품 길이 증거가 훼손됨.",
      },
    ],
  },
  {
    jobId: "correction-04-a03-real-recompose",
    jobPath: "production/jobs/correction-04-a03-real-recompose.json",
    outputDirectory:
      "asset/generated/pending/image/production-rev002-feedback/correction-04-a03",
    workers: 1,
    sizeMode: "controllable",
    targetSize: "1536x1024",
    attempts: [
      {
        assetId: "A03",
        role: "single-reverse-label",
        index: 0,
        version: "v04",
        qaStatus: "PASS",
      },
    ],
  },
];

const selectedVersions = {
  A01: "v02",
  A03: "v04",
  A04: "v02",
  D01: "v02",
  D08: "v02",
  E07: "v02",
  E08: "v03",
};
const selectedFindings = {
  A01: "실사 원본의 47×14cm 길이 비례와 한 쌍의 긴 평행 실루엣을 복원함.",
  A03: "긴 앞·뒤 뷰를 분리하고 후면 엄지 홀·무라벨, 전면 평면 라벨을 복원함.",
  A04: "굵은 골지 대신 실사의 얇은 광택·미세 가로결·불규칙 세로 드레이프를 복원함.",
  D01: "실사 한 쌍의 길고 좁은 카탈로그 비례를 복원함.",
  D08: "짧게 뭉친 형태를 버리고 한 쌍의 전체 길이가 읽히는 교차 플랫레이로 교정함.",
  E07: "카피 여백을 유지하면서 한 쌍의 전체 47cm 비례가 보이도록 교정함.",
  E08: "승인 모델 정체성을 유지하며 상완부터 손등까지 긴 루즈핏 착용 구조를 복원함.",
};

const rawJobs = new Map();
const sanitizedAttemptRows = [];

for (const job of jobDefinitions) {
  const manifestPath = path.join(projectRoot, job.outputDirectory, "manifest.json");
  const rawBuffer = fs.readFileSync(manifestPath);
  const rawManifest = JSON.parse(rawBuffer.toString("utf8"));
  if (rawManifest.dry_run !== false) {
    throw new Error(`${job.jobId} manifest is not a completed run`);
  }
  if (rawManifest.images?.length !== job.attempts.length) {
    throw new Error(`${job.jobId} generated image count mismatch`);
  }

  const archiveDirectory = path.join(
    repositoryRoot,
    ".scratch",
    "god-tibo-raw",
    "루즈핏-쿨토시",
    "production-rev002-feedback",
    job.jobId,
  );
  fs.mkdirSync(archiveDirectory, { recursive: true });
  fs.writeFileSync(path.join(archiveDirectory, "manifest.raw.json"), rawBuffer);

  const sanitizedAssets = [];
  for (const attempt of job.attempts) {
    const imagePathRelative = `${job.outputDirectory}/frame-${String(
      attempt.index,
    ).padStart(3, "0")}.png`;
    const imagePath = path.join(projectRoot, imagePathRelative);
    const imageBuffer = fs.readFileSync(imagePath);
    const imageSha256 = sha256(imageBuffer);
    const imageSize = readPngSize(imagePath);
    const rawImage = rawManifest.images[attempt.index];
    const [targetWidth, targetHeight] = job.targetSize
      .split("x")
      .map(Number);

    if (
      imageSize.width !== targetWidth ||
      imageSize.height !== targetHeight ||
      rawImage.sha256 !== imageSha256
    ) {
      throw new Error(`${attempt.assetId} ${attempt.version} integrity failed`);
    }
    if (job.sizeMode === "invariant") {
      if (rawImage.size_check?.matches_reference !== true) {
        throw new Error(`${attempt.assetId} invariant size check failed`);
      }
    } else if (rawImage.size_check?.matches_expected !== true) {
      throw new Error(`${attempt.assetId} controllable size check failed`);
    }

    const row = {
      ...attempt,
      jobId: job.jobId,
      jobPath: job.jobPath,
      sizeMode: job.sizeMode,
      targetSize: job.targetSize,
      path: imagePathRelative,
      sha256: imageSha256,
      width: imageSize.width,
      height: imageSize.height,
      responseId: rawImage.response_id,
      generatedAt: rawManifest.created_at,
      warnings: rawImage.warnings ?? [],
    };
    sanitizedAttemptRows.push(row);
    sanitizedAssets.push({
      assetId: attempt.assetId,
      role: attempt.role,
      version: attempt.version,
      index: attempt.index,
      path: imagePathRelative,
      sha256: imageSha256,
      width: imageSize.width,
      height: imageSize.height,
      responseId: rawImage.response_id,
      generatedAt: rawManifest.created_at,
      warnings: rawImage.warnings ?? [],
      sizeCheck:
        job.sizeMode === "invariant"
          ? { matchesReference: true }
          : {
              expected: { width: targetWidth, height: targetHeight },
              matchesExpected: true,
            },
      qaStatus: attempt.qaStatus,
      finding: attempt.finding ?? null,
    });
  }

  const sanitizedManifest = {
    schemaVersion: 1,
    jobId: job.jobId,
    jobPath: job.jobPath,
    outputDirectory: job.outputDirectory,
    createdAt: rawManifest.created_at,
    durationMs: rawManifest.duration_ms,
    detailLevel: 3,
    workers: job.workers,
    sizeMode: job.sizeMode,
    targetSize: job.targetSize,
    backendRequestSize:
      job.sizeMode === "invariant" ? rawManifest.api_size?.[0] : "auto",
    providerWarning:
      "Unsupported private Codex backend path; contract may change without notice.",
    rawManifestSha256: sha256(rawBuffer),
    assets: sanitizedAssets,
  };
  writeJson(manifestPath, sanitizedManifest);
  rawJobs.set(job.jobId, {
    ...job,
    rawManifest,
    manifestPath: `${job.outputDirectory}/manifest.json`,
    manifestSha256: sha256(
      Buffer.from(`${JSON.stringify(sanitizedManifest, null, 2)}\n`, "utf8"),
    ),
  });
}

const plan = readJson(planPath);
const assetManifest = readJson(assetManifestPath);

const addPreviousAttempt = (route, attempt) => {
  route.previousAttempts ??= [];
  if (
    !route.previousAttempts.some(
      (existing) =>
        existing.version === attempt.version &&
        existing.path === attempt.path,
    )
  ) {
    route.previousAttempts.push(attempt);
  }
};

for (const assetId of Object.keys(selectedVersions)) {
  const route = plan.assetRouting.find(
    (candidate) => candidate.assetId === assetId,
  );
  if (!route) {
    throw new Error(`Missing production route: ${assetId}`);
  }
  const selectedVersion = selectedVersions[assetId];
  const selected = sanitizedAttemptRows.find(
    (attempt) =>
      attempt.assetId === assetId && attempt.version === selectedVersion,
  );
  if (!selected) {
    throw new Error(`Missing selected attempt: ${assetId}-${selectedVersion}`);
  }

  if (route.path !== selected.path && route.rawPath !== selected.path) {
    addPreviousAttempt(route, {
      version: route.version ?? "v01",
      path: route.rawPath,
      sha256: route.sha256,
      qaStatus: "FAIL",
      finding:
        "사용자 실사 원본과 제품 비례·구조가 다르고, 대부분 실제 47cm 길이보다 짧게 표현됨.",
      source: "human_user",
    });
  }

  if (assetId === "A03") {
    for (const rejected of sanitizedAttemptRows.filter(
      (attempt) =>
        attempt.assetId === "A03" && attempt.qaStatus === "FAIL",
    )) {
      addPreviousAttempt(route, {
        version: rejected.version,
        path: rejected.path,
        sha256: rejected.sha256,
        qaStatus: "FAIL",
        finding: rejected.finding,
        source: "internal_qa",
      });
    }
  }

  route.version = selected.version;
  route.rawPath = selected.path;
  route.sha256 = selected.sha256;
  route.width = selected.width;
  route.height = selected.height;
  route.responseId = selected.responseId;
  route.generatedAt = selected.generatedAt;
  route.qaStatus = "PASS";
  route.status = "generated-pending-user-approval";
  route.correctionJobId = selected.jobId;
  route.correctionFinding = selectedFindings[assetId];
  route.userFeedbackResolvedBy = selected.version;
  route.nextVersion = null;
}

const newVersionKeys = new Set(
  sanitizedAttemptRows.map(
    (attempt) => `${attempt.assetId}:${attempt.version}`,
  ),
);
assetManifest.assets = assetManifest.assets.filter(
  (asset) => !newVersionKeys.has(`${asset.id}:${asset.version}`),
);

for (const attempt of sanitizedAttemptRows) {
  const template = assetManifest.assets.find(
    (asset) => asset.id === attempt.assetId,
  );
  if (!template) {
    throw new Error(`Missing asset template: ${attempt.assetId}`);
  }
  const selected =
    selectedVersions[attempt.assetId] === attempt.version &&
    attempt.qaStatus === "PASS";
  const nextAttempt = sanitizedAttemptRows.find(
    (candidate) =>
      candidate.assetId === attempt.assetId &&
      Number(candidate.version.slice(1)) ===
        Number(attempt.version.slice(1)) + 1,
  );
  assetManifest.assets.push({
    ...template,
    status: selected ? "pending" : "changes_requested",
    version: attempt.version,
    path: attempt.path,
    sha256: attempt.sha256,
    width: attempt.width,
    height: attempt.height,
    jobId: attempt.jobId,
    jobPath: attempt.jobPath,
    responseId: attempt.responseId,
    generatedAt: attempt.generatedAt,
    detailLevel: 3,
    sizeMode: attempt.sizeMode,
    targetSize: attempt.targetSize,
    qaStatus: attempt.qaStatus,
    qaFinding:
      attempt.finding ??
      (selected
        ? selectedFindings[attempt.assetId]
        : "사용자 피드백 수정 시도"),
    supersededBy: selected
      ? null
      : nextAttempt
        ? `${attempt.assetId}-${nextAttempt.version}`
        : `${attempt.assetId}-${selectedVersions[attempt.assetId]}`,
    approvedBy: null,
    approvedAt: null,
  });
}
assetManifest.updatedAt = now;
writeJson(assetManifestPath, assetManifest);

const newCorrectionJobs = jobDefinitions.map((job) => {
  const rawJob = rawJobs.get(job.jobId);
  const passCount = job.attempts.filter(
    (attempt) => attempt.qaStatus === "PASS",
  ).length;
  return {
    jobId: job.jobId,
    path: job.jobPath,
    outputDirectory: job.outputDirectory,
    workers: job.workers,
    sizeMode: job.sizeMode,
    targetSize: job.targetSize,
    assetIds: job.attempts.map((attempt) => attempt.assetId),
    manifestPath: rawJob.manifestPath,
    manifestSha256: rawJob.manifestSha256,
    generatedCount: job.attempts.length,
    passCount,
    rejectedCount: job.attempts.length - passCount,
    status:
      passCount === job.attempts.length
        ? "qa-pass-pending-user-approval"
        : "review-complete-with-internal-rejection",
  };
});
plan.correctionJobs = [
  ...(plan.correctionJobs ?? []).filter(
    (job) => !newCorrectionJobs.some((current) => current.jobId === job.jobId),
  ),
  ...newCorrectionJobs,
];
plan.status = "ready-for-g2-user-approval";
plan.qaStatus = "PASS_WITH_USER_FEEDBACK_CORRECTIONS";
plan.qaCompletedAt = now;
plan.generatedAssetCount = 40;
plan.totalGeneratedImageCount = 52;
plan.totalImageCountIncludingModelCandidates = 60;
plan.firstPassCount = 37;
plan.correctedCount = 10;
plan.userFeedbackRound = "rev002";
plan.userFeedbackResolvedAt = now;
plan.userFeedbackResolvedAssetIds = Object.keys(selectedVersions);
plan.selectedAssetCount = 40;
writeJson(planPath, plan);

const project = readJson(path.join(projectRoot, "project.json"));
project.phase = "image_generation";
project.currentRevisionId = "rev-005";
project.updatedAt = now;
project.g2UserFeedback = {
  ...(project.g2UserFeedback ?? {}),
  status: "revised_pending_user_approval",
  resolvedAt: now,
  selectedVersions,
};
writeJson(path.join(projectRoot, "project.json"), project);

const correctionReport = {
  schemaVersion: 1,
  revisionId: "rev-005",
  gate: "G2 IMAGE_ASSETS",
  status: "qa-pass-pending-user-approval",
  appliedAt: now,
  userConfirmation:
    "a01, a03, a04 이거 원본과 달라, d01, d08, e07, e08 이게 달라 짧아 대부분",
  userRejectedAssetIds: Object.keys(selectedVersions),
  selectedVersions,
  selectedCorrections: Object.fromEntries(
    Object.entries(selectedVersions).map(([assetId, version]) => {
      const attempt = sanitizedAttemptRows.find(
        (candidate) =>
          candidate.assetId === assetId && candidate.version === version,
      );
      return [
        assetId,
        {
          version,
          path: attempt.path,
          sha256: attempt.sha256,
          width: attempt.width,
          height: attempt.height,
          qaStatus: "PASS",
          finding: selectedFindings[assetId],
        },
      ];
    }),
  ),
  internalRejectedAttempts: sanitizedAttemptRows
    .filter((attempt) => attempt.qaStatus === "FAIL")
    .map((attempt) => ({
      assetId: attempt.assetId,
      version: attempt.version,
      path: attempt.path,
      sha256: attempt.sha256,
      finding: attempt.finding,
    })),
  productionGeneratedImageCount: 52,
  totalImageCountIncludingModelCandidates: 60,
};
writeJson(
  path.join(productionRoot, "user-feedback-correction-report.json"),
  correctionReport,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      selectedVersions,
      productionGeneratedImageCount: 52,
      totalImageCountIncludingModelCandidates: 60,
      status: plan.status,
      report: "production/user-feedback-correction-report.json",
    },
    null,
    2,
  ),
);
