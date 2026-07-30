#!/usr/bin/env node

import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export function findWorkspaceRoot(startDirectory = process.cwd()) {
  let current = path.resolve(startDirectory);
  while (true) {
    if (
      path.basename(current) === ".workspace" ||
      path.basename(current) === "workspace"
    ) {
      return path.dirname(current);
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDirectory);
    current = parent;
  }
}

export function resolveLearningPaths({
  workspaceRoot = findWorkspaceRoot(),
  skillRoot = DEFAULT_SKILL_ROOT,
} = {}) {
  const workspace = path.resolve(workspaceRoot);
  const skill = path.resolve(skillRoot);
  return {
    behanceInbox: path.join(
      workspace,
      ".workspace",
      "learning",
      "behance",
      "inbox.md",
    ),
    behanceReviewed: path.join(
      workspace,
      ".workspace",
      "learning",
      "behance",
      "reviewed.md",
    ),
    gifInbox: path.join(
      workspace,
      ".workspace",
      "learning",
      "gif",
      "inbox.md",
    ),
    gifReviewed: path.join(
      workspace,
      ".workspace",
      "learning",
      "gif",
      "reviewed.md",
    ),
    candidateReport: path.join(
      workspace,
      ".workspace",
      "learning",
      "candidates.md",
    ),
    projectsRoot: path.join(workspace, ".workspace", "projects"),
    learningRegistry: path.join(skill, "references", "learning.md"),
    commercialReference: path.join(skill, "references", "commercial.md"),
    tasteReference: path.join(skill, "references", "taste.md"),
    motionReference: path.join(skill, "references", "motion.md"),
    refreshScript: path.join(
      skill,
      "scripts",
      "maintenance",
      "refresh-behance-study.ps1",
    ),
    gifRefreshScript: path.join(
      skill,
      "scripts",
      "maintenance",
      "refresh-hyperframes-study.ps1",
    ),
    distillScript: path.join(
      skill,
      "scripts",
      "maintenance",
      "distill-learnings.mjs",
    ),
  };
}

async function fileStatus(target) {
  if (!(await exists(target))) {
    return { path: target, exists: false, updatedAt: null };
  }
  const metadata = await stat(target);
  return {
    path: target,
    exists: true,
    updatedAt: metadata.mtime.toISOString(),
  };
}

async function countMatches(file, pattern) {
  if (!(await exists(file))) return 0;
  const contents = await readFile(file, "utf8");
  return [...contents.matchAll(pattern)].length;
}

async function recordingStatus(inboxPath) {
  if (!(await exists(inboxPath))) {
    return { path: null, exists: false, updatedAt: null };
  }
  const contents = await readFile(inboxPath, "utf8");
  const recordingPath =
    contents.match(/^Browser Harness 원문 녹화:\s*`([^`]+)`$/m)?.[1] || null;
  return recordingPath
    ? fileStatus(recordingPath)
    : { path: null, exists: false, updatedAt: null };
}

async function countProjectFeedback(projectsRoot) {
  if (!(await exists(projectsRoot))) return 0;
  let count = 0;
  for (const project of await readdir(projectsRoot, { withFileTypes: true })) {
    if (!project.isDirectory() || project.name.startsWith(".")) continue;
    count += await countMatches(
      path.join(
        projectsRoot,
        project.name,
        ".detail-page",
        "planning",
        "LEARNINGS.md",
      ),
      /^#{2,3}\s+LEARN-/gm,
    );
  }
  return count;
}

export async function buildLearningStatus(options = {}) {
  const paths = resolveLearningPaths(options);
  const files = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([key, target]) => [
        key,
        await fileStatus(target),
      ]),
    ),
  );
  files.behanceRecording = await recordingStatus(paths.behanceInbox);
  files.gifRecording = await recordingStatus(paths.gifInbox);
  return {
    workspaceRoot: path.resolve(
      options.workspaceRoot || findWorkspaceRoot(),
    ),
    files,
    counts: {
      reviewedBehanceLearnings: await countMatches(
        paths.behanceReviewed,
        /^#{2,3}\s+LEARN-/gm,
      ),
      reviewedGifLearnings: await countMatches(
        paths.gifReviewed,
        /^#{2,3}\s+LEARN-/gm,
      ),
      projectFeedbackLearnings: await countProjectFeedback(paths.projectsRoot),
      distilledCandidates: await countMatches(
        paths.candidateReport,
        /^\|\s+[^-|\n][^|\n]*\|\s+LEARN-/gm,
      ),
      commercialRules: await countMatches(
        paths.commercialReference,
        /^\|\s+CR-\d+\s+\|/gm,
      ),
      tasteRules: await countMatches(
        paths.tasteReference,
        /^\|\s+TR-\d+\s+\|/gm,
      ),
      motionRules: await countMatches(
        paths.motionReference,
        /^\|\s+MR-\d+\s+\|/gm,
      ),
    },
    flows: {
      behance: [
        "behanceInbox",
        "behanceReviewed",
        "candidateReport",
        "commercialReference",
        "delete transient source",
      ],
      feedback: [
        "<project>/.detail-page/planning/LEARNINGS.md",
        "candidateReport",
        "tasteReference or motionReference by category",
        "delete promoted source block",
      ],
      gifResearch: [
        "gifInbox",
        "gifReviewed",
        "candidateReport",
        "motionReference",
        "delete transient source",
      ],
    },
  };
}

function statusLabel(file) {
  return file.exists ? `있음 · ${file.updatedAt}` : "없음";
}

export function renderLearningStatus(report) {
  const files = report.files;
  return [
    "# 학습 저장·업데이트 상태",
    "",
    `Workspace: ${report.workspaceRoot}`,
    "",
    "1. 수집 후보",
    `   ${files.behanceInbox.path}`,
    `   ${statusLabel(files.behanceInbox)}`,
    "2. 사람이 검토해 작성한 학습",
    `   ${files.behanceReviewed.path}`,
    `   ${statusLabel(files.behanceReviewed)} · ${report.counts.reviewedBehanceLearnings}건`,
    "   Browser Harness 원문 녹화",
    `   ${files.behanceRecording.path || "inbox.md에 기록 없음"}`,
    `   ${statusLabel(files.behanceRecording)}`,
    "3. HyperFrames GIF 조사 후보",
    `   ${files.gifInbox.path}`,
    `   ${statusLabel(files.gifInbox)}`,
    "4. 사람이 검토해 작성한 GIF 학습",
    `   ${files.gifReviewed.path}`,
    `   ${statusLabel(files.gifReviewed)} · ${report.counts.reviewedGifLearnings}건`,
    "   Browser Harness 원문 녹화",
    `   ${files.gifRecording.path || "inbox.md에 기록 없음"}`,
    `   ${statusLabel(files.gifRecording)}`,
    "5. 실제 제작 피드백 원문",
    `   ${files.projectsRoot.path}${path.sep}*${path.sep}.detail-page${path.sep}planning${path.sep}LEARNINGS.md`,
    `   ${statusLabel(files.projectsRoot)} · ${report.counts.projectFeedbackLearnings}건`,
    "6. 증류 후보 보고서",
    `   ${files.candidateReport.path}`,
    `   ${statusLabel(files.candidateReport)} · ${report.counts.distilledCandidates}건`,
    "7. Behance 검증 규칙의 실제 반영 위치",
    `   ${files.commercialReference.path}`,
    `   ${statusLabel(files.commercialReference)} · CR 규칙 ${report.counts.commercialRules}건`,
    "8. 일반 제작 피드백 규칙의 반영 위치",
    `   ${files.tasteReference.path}`,
    `   ${statusLabel(files.tasteReference)} · TR 규칙 ${report.counts.tasteRules}건`,
    "9. GIF 조사·GIF 피드백 규칙의 반영 위치",
    `   ${files.motionReference.path}`,
    `   ${statusLabel(files.motionReference)} · MR 규칙 ${report.counts.motionRules}건`,
    "10. 세 학습 트랙의 운영 규약",
    `   ${files.learningRegistry.path}`,
    "",
    "Behance 수집 스크립트:",
    `   ${files.refreshScript.path}`,
    "HyperFrames GIF 수집 스크립트:",
    `   ${files.gifRefreshScript.path}`,
    "증류 스크립트:",
    `   ${files.distillScript.path}`,
    "",
    "각 트랙의 inbox와 reviewed가 없으면 아직 새 조사를 실행·검토하지 않은 상태다.",
    "수집만으로 규칙 문서는 자동 업데이트되지 않는다. 검증·승격 후 임시 원문은 삭제한다.",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { workspaceRoot: "", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--workspace") {
      options.workspaceRoot = argv[++index] || "";
    } else if (token === "--json") {
      options.json = true;
    } else {
      throw new Error(`알 수 없는 인자입니다: ${token}`);
    }
  }
  if (!options.workspaceRoot) delete options.workspaceRoot;
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildLearningStatus(options);
  process.stdout.write(
    options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderLearningStatus(report),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
