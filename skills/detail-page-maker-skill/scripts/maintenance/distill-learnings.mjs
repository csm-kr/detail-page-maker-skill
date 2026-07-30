#!/usr/bin/env node

import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const options = { root: "", output: "", sources: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root") options.root = argv[++index] || "";
    else if (token === "--output") options.output = argv[++index] || "";
    else if (token === "--source") options.sources.push(argv[++index] || "");
    else if (token === "--json") options.json = true;
    else throw new Error(`알 수 없는 인자입니다: ${token}`);
  }
  if (!options.root) {
    throw new Error("--root <프로젝트 상위 폴더>가 필요합니다.");
  }
  if (options.sources.some((source) => !source)) {
    throw new Error("--source <추가 Markdown> 경로가 필요합니다.");
  }
  return options;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function portablePath(target) {
  return String(target).replaceAll("\\", "/");
}

function parseFields(block) {
  return Object.fromEntries(
    [...block.matchAll(/^- `([^`]+)`:\s*(.*)$/gm)].map((match) => [
      match[1].trim(),
      match[2].trim(),
    ]),
  );
}

function learningRoute(sourceType, category = "") {
  const normalizedCategory = category.trim().toLowerCase();
  if (sourceType === "behance") {
    return { track: "behance", ownerReference: "commercial.md" };
  }
  if (sourceType === "hyperframes") {
    return { track: "gif-research", ownerReference: "motion.md" };
  }
  if (sourceType === "feedback") {
    if (["gif", "motion", "animation"].includes(normalizedCategory)) {
      return { track: "gif-feedback", ownerReference: "motion.md" };
    }
    return { track: "feedback", ownerReference: "taste.md" };
  }
  return { track: "other", ownerReference: "" };
}

export function parseLearningDocument(
  markdown,
  projectId,
  sourceFile = `${projectId}/.detail-page/planning/LEARNINGS.md`,
) {
  const headings = [
    ...markdown.matchAll(/^#{2,3}\s+(LEARN-[A-Za-z0-9_-]+)\s*$/gm),
  ];
  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const fields = parseFields(markdown.slice(start, end));
    const sourceType = fields.source_type || "feedback";
    const category = fields.category || "";
    const route = learningRoute(sourceType, category);
    return {
      projectId,
      learningId: heading[1],
      category,
      scope: fields.scope || "",
      observation: fields.observation || "",
      evidencePaths: fields.evidence_paths || "",
      beforeAfter: fields.before_after || "",
      riskIfReused: fields.risk_if_reused || "",
      nextValidation: fields.next_validation || "",
      promotionStatus: fields.promotion_status || "local",
      sourceType,
      sourceUrls: fields.source_urls || "",
      track: route.track,
      ownerReference: route.ownerReference || fields.owner_reference || "",
      updatedAt: fields.updated_at || "",
      sourceFile: portablePath(sourceFile),
    };
  });
}

async function collectLearningFile(file, projectId, sourceFile) {
  if (!(await exists(file))) return [];
  const markdown = await readFile(file, "utf8");
  return parseLearningDocument(markdown, projectId, sourceFile).filter(
    (learning) => learning.scope === "candidate-shared",
  );
}

function displayExtraSource(file) {
  const absolute = path.resolve(file);
  const relative = path.relative(process.cwd(), absolute);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return portablePath(relative);
  }
  return `<extra-source>/${path.basename(absolute)}`;
}

export async function collectLearningCandidates(
  projectsRoot,
  extraSources = [],
) {
  const root = path.resolve(projectsRoot);
  const candidates = [];
  if (await exists(root)) {
    const projects = await readdir(root, { withFileTypes: true });
    for (const project of projects) {
      if (!project.isDirectory() || project.name.startsWith(".")) continue;
      const file = path.join(
        root,
        project.name,
        ".detail-page",
        "planning",
        "LEARNINGS.md",
      );
      candidates.push(
        ...(await collectLearningFile(
          file,
          project.name,
          `${project.name}/.detail-page/planning/LEARNINGS.md`,
        )),
      );
    }
  }

  for (const source of extraSources) {
    const absolute = path.resolve(source);
    const sourceId = path.basename(path.dirname(absolute)) || "external";
    candidates.push(
      ...(await collectLearningFile(
        absolute,
        sourceId,
        displayExtraSource(absolute),
      )),
    );
  }

  return candidates.sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId, "ko") ||
      left.learningId.localeCompare(right.learningId, "en"),
  );
}

function escapeTable(value) {
  return String(value || "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

export function renderCandidateReport(candidates) {
  const rows = candidates.map(
    (item) =>
      `| ${escapeTable(item.sourceFile)} | ${escapeTable(item.learningId)} | ` +
      `${escapeTable(item.track)} | ${escapeTable(item.category)} | ` +
      `${escapeTable(item.promotionStatus)} | ` +
      `${escapeTable(item.ownerReference || "-")} | ` +
      `${escapeTable(item.observation)} |`,
  );
  return [
    "# Distilled learning candidates",
    "",
    "Sources:",
    "",
    "- `<projects-root>/*/.detail-page/planning/LEARNINGS.md`",
    "- `--source`로 지정한 추가 Markdown(예: Behance·GIF `reviewed.md`)",
    "",
    "이 보고서는 바이너리 근거를 복사하지 않는다. 활성 reference도 자동 수정하지 않는다.",
    "`source_type: behance`는 `commercial.md`, `source_type: hyperframes`는",
    "`motion.md`로 승격한다. 제작 피드백은 일반 항목은 `taste.md`,",
    "`category: gif | motion | animation`은 `motion.md`로만 승격한다.",
    "승격이 끝나면 원문과 후보 Markdown을 삭제한다.",
    "",
    "| Source Markdown | Learning | Track | Category | Status | Owner | Observation |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(rows.length
      ? rows
      : ["| - | - | - | - | - | - | 승격 후보 없음 |"]),
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidates = await collectLearningCandidates(
    options.root,
    options.sources,
  );
  const output = options.json
    ? `${JSON.stringify({ candidates }, null, 2)}\n`
    : renderCandidateReport(candidates);
  if (options.output) {
    const outputPath = path.resolve(options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
    process.stdout.write(`updated=${outputPath}\ncandidates=${candidates.length}\n`);
  } else {
    process.stdout.write(output);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
