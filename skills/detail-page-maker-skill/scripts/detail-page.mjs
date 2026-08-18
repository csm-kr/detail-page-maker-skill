import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BRIEF_FIELDS,
  renderBriefPrompt,
  validateBrief,
} from "./lib/brief-prompt.mjs";
import {
  adoptProject,
  createProject,
  defaultProjectsRoot,
} from "./lib/new-project.mjs";
import {
  listProjects,
  validateProjectIsolation,
} from "./lib/project-manager.mjs";
import { resolveWorkspaceRoot } from "./lib/output-location.mjs";
import {
  intakeWorkspaceInputs,
  listWorkspaceIntakeCandidates,
} from "./lib/workspace-intake.mjs";
import {
  buildLearningStatus,
  renderLearningStatus,
} from "./maintenance/learning-status.mjs";
import {
  ensureExperienceDrop,
  syncTrustedExperiences,
} from "./maintenance/experience-sync.mjs";
import {
  inspectAgentCapacity,
  normalizeAgentSessionIds,
  resolveWorkerAllocation,
} from "./orchestration/agent-capacity.mjs";
import { analyzePerformanceTrace } from "./orchestration/performance-profile.mjs";
import {
  createDependencyClosureReceipt,
  inspectDependencyClosure,
} from "./orchestration/dependency-closure.mjs";
import {
  dispatchParallelProductionFrontier,
} from "./orchestration/parallel-dispatcher.mjs";
import {
  buildReferenceArtifactSet,
  writeReferenceArtifactSet,
} from "./orchestration/reference-artifact-set.mjs";
import {
  buildCategoryReferenceCohort,
  CATEGORY_REFERENCE_LIBRARY_SHA256,
  getCategoryReferenceLibrary,
  validateCategoryReferenceLibrary,
  validateCategoryReferenceLibraryFiles,
} from "./orchestration/category-reference-library.mjs";
import { createWorkflowEngine } from "./orchestration/workflow-engine.mjs";
import { startStudioV1Server } from "./runtime/studio-v1-server.mjs";

const CURRENT_SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const MINIMUM_NODE_VERSION = Object.freeze([22, 15, 0]);

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function versionTuple(version) {
  return version.replace(/^v/, "").split(".").map(Number);
}

function nodeSupported() {
  const current = versionTuple(process.version);
  for (let index = 0; index < MINIMUM_NODE_VERSION.length; index += 1) {
    const currentPart = current[index] || 0;
    const minimumPart = MINIMUM_NODE_VERSION[index];
    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }
  return true;
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"&|<>^]/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function probe(command, args) {
  const executable =
    process.platform === "win32"
      ? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe"
      : command;
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArg).join(" ")]
      : args;
  const result = spawnSync(executable, commandArgs, {
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    output: `${result.stdout || ""}${result.stderr || ""}${
      result.error ? `\n${result.error.message}` : ""
    }`.trim(),
  };
}

function requiredLocalSkills() {
  try {
    const manifest = JSON.parse(
      readFileSync(
        path.join(CURRENT_SKILL_ROOT, "dependencies.json"),
        "utf8",
      ),
    );
    return Array.isArray(manifest.skills)
      ? manifest.skills.map((skill) => String(skill.name))
      : [];
  } catch (error) {
    throw new Error(`dependencies.json을 읽지 못했습니다: ${error.message}`);
  }
}

function probeLocalSkill(skillName) {
  const skillDirectory = path.join(
    CURRENT_SKILL_ROOT,
    ".agents",
    "skills",
    skillName,
  );
  const skillFile = path.join(skillDirectory, "SKILL.md");
  const available = existsSync(skillFile);
  return {
    ok: available,
    scope: "skill-folder",
    path: available ? skillDirectory : null,
    detail: available
      ? null
      : `내장 의존 스킬 '${skillName}'이 없습니다. Git 원본에서 detail-page-maker-skill 하나를 다시 설치하거나 업데이트하세요.`,
  };
}

function probeGodTiboRuntime(localSkill) {
  const skillRoot = localSkill?.path;
  const runnerPath = skillRoot
    ? path.join(skillRoot, "scripts", "tibo-batch.mjs")
    : null;
  const runtimePackagePath = skillRoot
    ? path.join(
        skillRoot,
        "node_modules",
        "god-tibo-imagen",
        "package.json",
      )
    : null;
  const ok =
    localSkill?.ok === true &&
    existsSync(runnerPath) &&
    existsSync(runtimePackagePath);
  return {
    ok,
    required: true,
    skill: "god-tibo-gpt-image2-skill",
    path: skillRoot || null,
    runnerPath: existsSync(runnerPath || "") ? runnerPath : null,
    runtimeInstalled: existsSync(runtimePackagePath || ""),
    defaultProviderBatchSize: 32,
    defaultProviderWorkers: 32,
    detail: ok
      ? null
      : "내장 God Tibo GPT Image 2 실행 환경이 없습니다. Git 원본에서 상위 스킬 하나를 다시 설치하거나 업데이트하세요.",
  };
}

function printHelp() {
  console.log(`Detail Page Maker

Commands:
  doctor
  brief --input <brief.json|JSON> [--output <prompt.md>] [--workspace <workspace 폴더>]
        [--install-section <auto|include|omit>] [--json]
  agent-capacity [--worker-capacity <N|auto>] [--worker-sessions <ID[,ID]>]
                 [--workspace <workspace-folder>]
  intake --project <project-folder> [--file <name[,name]>] [--dry-run] [--json]
  intake-status [--workspace <workspace-folder>]
  performance-profile [--trace <JSON-file|JSON>]
  workflow-status --project <project-folder> --project-id <ID> --input-digest <SHA-256>
  workflow-advance --project <project-folder> --project-id <ID> --input-digest <SHA-256>
                   [--worker-capacity <N|auto> --worker-sessions <ID[,ID]>]
                   [--production-plan <JSON-file|JSON> --plan-approval <JSON-file|JSON>]
                   [--approved-image-job-ids <ID[,ID]>]
  workflow-resume --project <project-folder> --project-id <ID> --input-digest <SHA-256>
  workflow-decide --project <project-folder> --challenge <ID> --proof <JSON-file>
  workflow-revision-plan --project <project-folder> --project-id <ID> --input-digest <SHA-256>
                         --change <JSON-file|JSON> [--agent-session <ID>]
  workflow-revision-commit --project <project-folder> --project-id <ID> --input-digest <SHA-256>
                           --plan-digest <SHA-256> --decided-by <ID> --reason <TEXT>
                           [--agent-session <ID>]
  workflow-rubric-record --project <project-folder> --project-id <ID> --input-digest <SHA-256>
                         --result <JSON-file|JSON> --evaluator-session <ID>
                         [--budget <JSON-file|JSON>] [--scope <full_page|section>]
  workflow-rubric-status --project <project-folder> --project-id <ID> --input-digest <SHA-256>
  worker-lease --project <project-folder> --project-id <ID> --input-digest <SHA-256>
               --agent-session <ID> [--stage <stage-id[,stage-id]>]
  worker-heartbeat --project <project-folder> --project-id <ID> --input-digest <SHA-256>
                   --agent-session <ID> --work-order <ID> --fencing-token <TOKEN> --attempt <N>
  worker-submit --project <project-folder> --work-order <ID> --result <JSON-file>
  learning-status --project <프로젝트 폴더> [--json]
  experience-init --project <프로젝트 폴더>
  experience-sync --project <프로젝트 폴더> [--json]
  reference-library [--primary <archetype-id>] [--secondary <archetype-id>]
  reference-profile --project <프로젝트 폴더>
                    [--reference <기준 HTML> --role <positive_reference|negative_reference|approved_exemplar>]
                    [--output <reference-artifact-set.json>] [--workspace <workspace 폴더>]
  list [--root <projects 폴더>] [--json]
  validate [--project <프로젝트 폴더> | --root <projects 폴더>] [--json]
  new --name <상품명> --supplier-url <URL> [--root <폴더>] [--no-start]
  adopt --project <기존 프로젝트 폴더> --name <상품명> --supplier-url <URL>
        [--product-id <ID>] [--phase <단계>] [--score <점수>]
  start --project <프로젝트 폴더> [--port 8896] [--no-open]

Default projects root:
  ${defaultProjectsRoot()}
`);
}

function workflowContext(args) {
  if (!args.project || !args["project-id"] || !args["input-digest"]) {
    throw new Error(
      "workflow 명령에는 --project, --project-id, --input-digest가 필요합니다.",
    );
  }
  return {
    projectRoot: path.resolve(args.project),
    projectRef: {
      project_id: String(args["project-id"]),
      input_digest: String(args["input-digest"]),
      agent_session_id: args["agent-session"]
        ? String(args["agent-session"])
        : "cli-coordinator",
    },
  };
}

const ACTUAL_PRODUCT_PHOTO_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

function explicitBoolean(value, label) {
  if (value === true) return true;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  throw new Error(
    `${label}은 true 또는 false여야 합니다.`,
  );
}

function containsActualProductPhoto(directory) {
  if (!existsSync(directory)) return false;
  for (const entry of readdirSync(directory, {
    withFileTypes: true,
  })) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(directory, entry.name);
    if (
      entry.isDirectory() &&
      containsActualProductPhoto(entryPath)
    ) {
      return true;
    }
    if (
      entry.isFile() &&
      ACTUAL_PRODUCT_PHOTO_EXTENSIONS.has(
        path.extname(entry.name).toLowerCase(),
      )
    ) {
      return true;
    }
  }
  return false;
}

function workflowInputOptions(args, projectRoot) {
  const explicitField = "actual-product-photos-present";
  const actualProductPhotosPresent =
    Object.prototype.hasOwnProperty.call(args, explicitField)
      ? explicitBoolean(args[explicitField], `--${explicitField}`)
      : containsActualProductPhoto(
          path.join(projectRoot, "input", "product"),
        );
  return {
    actual_product_photos_present: actualProductPhotosPresent,
  };
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(readFileSync(path.resolve(filePath), "utf8"));
  } catch (error) {
    throw new Error(`${label} JSON을 읽지 못했습니다: ${error.message}`);
  }
}

function readJsonArgument(value, label) {
  if (existsSync(path.resolve(value))) {
    return readJsonFile(value, label);
  }
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`${label} JSON을 읽지 못했습니다: ${error.message}`);
  }
}

function readProductionPlanArgument(value) {
  const parsed = readJsonArgument(value, "ProductionPlan");
  if (
    parsed?.artifact?.type === "production.plan" &&
    parsed.artifact.payload &&
    typeof parsed.artifact.payload === "object" &&
    !Array.isArray(parsed.artifact.payload)
  ) {
    return parsed.artifact.payload;
  }
  return parsed;
}

async function doctor() {
  // `doctor` is diagnostic-only. Never let npx download or update a runtime.
  const hyperframes = probe("npx", [
    "--no-install",
    "hyperframes",
    "--version",
  ]);
  const browserHarness = probe("browser-harness", ["--version"]);
  const ffmpeg = probe("ffmpeg", ["-version"]);
  const dependencyClosure =
    await inspectDependencyClosure(CURRENT_SKILL_ROOT);
  const dependencyClosureReceipt = dependencyClosure.ok
    ? await createDependencyClosureReceipt(CURRENT_SKILL_ROOT)
    : null;
  const categoryReferenceLibrary =
    validateCategoryReferenceLibrary();
  const categoryReferenceFiles =
    await validateCategoryReferenceLibraryFiles({
      skillRoot: CURRENT_SKILL_ROOT,
    });
  const localSkills = Object.fromEntries(
    requiredLocalSkills().map((skillName) => [
      skillName,
      probeLocalSkill(skillName),
    ]),
  );
  const localSkillsOk = Object.values(localSkills).every((skill) => skill.ok);
  const designTasteFrontend = localSkills["design-taste-frontend"];
  const godTiboGptImage2 = probeGodTiboRuntime(
    localSkills["god-tibo-gpt-image2-skill"],
  );
  const agentCapacity = inspectAgentCapacity({
    sessionIds: normalizeAgentSessionIds(
      process.env.DETAIL_PAGE_AGENT_SESSION_IDS,
    ),
  });
  const report = {
    ok:
      nodeSupported() &&
      hyperframes.ok &&
      browserHarness.ok &&
      ffmpeg.ok &&
      dependencyClosure.ok &&
      categoryReferenceLibrary.ok &&
      categoryReferenceFiles.ok &&
      localSkillsOk &&
      godTiboGptImage2.ok,
    node: {
      ok: nodeSupported(),
      version: process.version,
      required: ">=22.15.0",
    },
    hyperframes: {
      ok: hyperframes.ok,
      version: hyperframes.output || null,
    },
    browserHarness: {
      ok: browserHarness.ok,
      version: browserHarness.output || null,
    },
    ffmpeg: {
      ok: ffmpeg.ok,
      version: ffmpeg.output.split(/\r?\n/)[0] || null,
    },
    dependencyClosure,
    dependencyClosureReceipt,
    categoryReferenceLibrary: {
      ...categoryReferenceLibrary,
      library_sha256:
        CATEGORY_REFERENCE_LIBRARY_SHA256,
      files: categoryReferenceFiles,
    },
    localSkillRoot: path.join(CURRENT_SKILL_ROOT, ".agents", "skills"),
    localSkills,
    designTasteFrontend: {
      ok: designTasteFrontend?.ok === true,
      required: true,
      path: designTasteFrontend?.path || null,
      detail: designTasteFrontend?.detail || null,
    },
    godTiboGptImage2,
    agentCapacity,
    defaultProjectsRoot: defaultProjectsRoot(),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function printIntakeReport(report) {
  const moved =
    report.moved_photos.length +
    report.extracted_photos.length +
    report.moved_archives.length;
  console.log(
    `Workspace intake: photos=${report.moved_photos.length} extracted=${report.extracted_photos.length} archives=${report.moved_archives.length} duplicates=${report.duplicates_preserved.length}${report.dry_run ? " (dry-run)" : ""}`,
  );
  for (const item of [
    ...report.moved_photos,
    ...report.extracted_photos,
    ...report.moved_archives,
  ]) {
    console.log(`  ${item.file} -> ${item.to}`);
  }
  for (const item of report.duplicates_preserved) {
    console.log(
      `  ${item.file} = ${item.existing} (중복${item.to ? `, ${item.to}에 보존` : ""})`,
    );
  }
  for (const item of report.failures) {
    console.log(`  ! ${item.file}: ${item.error}`);
  }
  if (moved > 0 && report.workspace_root_remaining.length > 0) {
    console.log(
      `  워크스페이스 루트 잔여: ${report.workspace_root_remaining.join(", ")}`,
    );
  }
}

function commandWorkspaceRoot(args) {
  return args.workspace
    ? path.resolve(args.workspace)
    : resolveWorkspaceRoot({ skillRoot: CURRENT_SKILL_ROOT });
}

function commandProjectRoot(args, fallback = "") {
  const target = args.project || fallback;
  if (!String(target).trim()) {
    throw new Error("이 명령에는 --project <프로젝트 폴더>가 필요합니다.");
  }
  return path.resolve(target);
}

// 산출물 폴더 규약: 경험 drop과 학습 receipt는 프로젝트 안에서만 다룬다.
async function reconcileTrustedExperiences(projectRoot) {
  return syncTrustedExperiences({
    projectRoot: path.resolve(projectRoot),
    skillRoot: CURRENT_SKILL_ROOT,
  });
}

// 인터뷰 6항목을 검증하고 제작 프롬프트 하나로 굳힌다. 통과 못 하면 프롬프트를
// 만들지 않고 다시 물어볼 항목만 돌려준다.
async function commandBrief(args) {
  if (!args.input || args.input === true) {
    throw new Error(
      "brief 명령에는 --input <brief.json|JSON>이 필요합니다. 인터뷰 6항목을 먼저 받아 적으세요.",
    );
  }
  const report = validateBrief(readJsonArgument(args.input, "Brief"));
  const issues = [...report.issues];

  const workspaceRoot = commandWorkspaceRoot(args);
  const photos = report.brief.photos;
  if (photos) {
    const resolved = path.isAbsolute(photos)
      ? photos
      : path.join(workspaceRoot, photos);
    if (!existsSync(resolved)) {
      issues.push({
        key: "photos",
        code: "photos_not_found",
        question: `실제 사진 "${photos}"를 ${workspaceRoot}에서 못 찾았습니다. 경로를 다시 확인하거나 "없음"으로 답하세요.`,
      });
    }
  }

  const mode = String(args["install-section"] || "auto");
  let installSection = mode === "include";
  if (mode === "auto") {
    const closure = await inspectDependencyClosure(CURRENT_SKILL_ROOT).catch(
      () => ({ ok: false }),
    );
    installSection = !closure.ok;
  } else if (mode !== "include" && mode !== "omit") {
    throw new Error("--install-section 값은 auto, include, omit 중 하나입니다.");
  }

  const ok = report.missing.length === 0 && issues.length === 0;
  const followups = [
    ...report.followups,
    ...issues.map((issue) => ({ key: issue.key, question: issue.question })),
  ];
  if (!ok) {
    process.exitCode = 1;
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            install_section: installSection,
            output: null,
            prompt_sha256: null,
            missing: report.missing,
            issues,
            notices: report.notices,
            followups,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log("인터뷰가 끝나지 않았습니다. 아래 항목을 다시 받아야 합니다.");
    for (const followup of followups) {
      const label =
        BRIEF_FIELDS.find((field) => field.key === followup.key)?.label ||
        followup.key;
      console.log(`  - ${label}: ${followup.question}`);
    }
    return;
  }

  const prompt = renderBriefPrompt(report.brief, { installed: !installSection });
  const promptSha256 = createHash("sha256").update(prompt, "utf8").digest("hex");
  let outputPath = null;
  if (args.output && args.output !== true) {
    outputPath = path.resolve(args.output);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, prompt, "utf8");
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          install_section: installSection,
          output: outputPath,
          prompt_sha256: promptSha256,
          missing: [],
          issues: [],
          notices: report.notices,
          followups: [],
        },
        null,
        2,
      ),
    );
    return;
  }
  for (const notice of report.notices) {
    console.log(`알림: ${notice.message}`);
  }
  if (outputPath) {
    console.log(`프롬프트: ${outputPath}`);
    console.log(`sha256: ${promptSha256}`);
    return;
  }
  console.log(prompt);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "help";
  if (command === "help" || args.help) {
    printHelp();
    return;
  }
  if (command === "doctor") {
    await doctor();
    return;
  }
  if (command === "brief") {
    await commandBrief(args);
    return;
  }
  if (command === "agent-capacity") {
    const sessionIds = normalizeAgentSessionIds(
      args["worker-sessions"] ||
        process.env.DETAIL_PAGE_AGENT_SESSION_IDS,
    );
    const profile = inspectAgentCapacity({ sessionIds });
    const requested =
      args["worker-capacity"] ||
      process.env.DETAIL_PAGE_WORKER_CAPACITY ||
      "auto";
    const allocation =
      sessionIds.length > 0
        ? resolveWorkerAllocation({
            requestedCapacity: requested,
            cliSessionIds: sessionIds,
          })
        : null;
    console.log(
      JSON.stringify(
        {
          workspace_root: commandWorkspaceRoot(args),
          profile,
          allocation,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "performance-profile") {
    const trace = args.trace
      ? readJsonArgument(args.trace, "PerformanceTrace")
      : [];
    console.log(JSON.stringify(analyzePerformanceTrace(trace), null, 2));
    return;
  }
  if (command === "experience-init") {
    const output = await ensureExperienceDrop({
      projectRoot: commandProjectRoot(args),
    });
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (command === "experience-sync") {
    const output = await reconcileTrustedExperiences(commandProjectRoot(args));
    console.log(JSON.stringify(output, null, 2));
    if (output.quarantined > 0) process.exitCode = 2;
    return;
  }
  if (command === "learning-status") {
    const report = await buildLearningStatus({
      projectRoot: commandProjectRoot(args),
    });
    if (args.json === true) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      process.stdout.write(renderLearningStatus(report));
    }
    return;
  }
  if (command === "reference-library") {
    const library = getCategoryReferenceLibrary();
    const output = args.primary
      ? {
          cohort: buildCategoryReferenceCohort({
            primaryArchetypeId: String(args.primary),
            secondaryArchetypeIds: args.secondary
              ? [String(args.secondary)]
              : [],
          }),
          library_sha256:
            CATEGORY_REFERENCE_LIBRARY_SHA256,
        }
      : {
          library,
          library_sha256:
            CATEGORY_REFERENCE_LIBRARY_SHA256,
        };
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (command === "reference-profile") {
    if (!args.project) {
      throw new Error(
        "reference-profile에는 --project 경로가 필요합니다.",
      );
    }
    const projectRoot = path.resolve(args.project);
    const workspaceRoot = commandWorkspaceRoot(args);
    const references = args.reference
      ? [
          {
            filePath: path.resolve(args.reference),
            role: String(args.role || "positive_reference"),
          },
        ]
      : [];
    const artifactSet = await buildReferenceArtifactSet({
      projectRoot,
      workspaceRoot,
      references,
    });
    const outputPath = path.resolve(
      args.output ||
        path.join(
          projectRoot,
          ".detail-page",
          "research",
          "reference-artifact-set.json",
        ),
    );
    const referenceResearchRoot = path.join(
      projectRoot,
      ".detail-page",
      "research",
    );
    const outputRelative = path.relative(
      referenceResearchRoot,
      outputPath,
    );
    if (
      outputRelative.startsWith("..") ||
      path.isAbsolute(outputRelative)
    ) {
      throw new Error(
        "reference profile 출력은 프로젝트의 .detail-page/research 안에 있어야 합니다.",
      );
    }
    await writeReferenceArtifactSet(outputPath, artifactSet);
    console.log(
      JSON.stringify(
        {
          output: path
            .relative(workspaceRoot, outputPath)
            .split(path.sep)
            .join("/"),
          reference_artifact_set: artifactSet,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (
    command === "workflow-revision-plan" ||
    command === "workflow-revision-commit"
  ) {
    const { projectRoot, projectRef } = workflowContext(args);
    const engine = createWorkflowEngine({ projectRoot });
    let output;
    if (command === "workflow-revision-plan") {
      if (!args.change) {
        throw new Error(
          "workflow-revision-plan에는 --change가 필요합니다.",
        );
      }
      output = await engine.planRevision(
        projectRef,
        readJsonArgument(args.change, "RevisionChange"),
      );
    } else {
      if (
        !args["plan-digest"] ||
        !args["decided-by"] ||
        !args.reason
      ) {
        throw new Error(
          "workflow-revision-commit에는 --plan-digest, --decided-by, --reason이 필요합니다.",
        );
      }
      output = await engine.commitRevision(projectRef, {
        planDigest: String(args["plan-digest"]),
        decidedBy: String(args["decided-by"]),
        reason: String(args.reason),
      });
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (
    command === "workflow-rubric-record" ||
    command === "workflow-rubric-status"
  ) {
    const { projectRoot, projectRef } = workflowContext(args);
    const engine = createWorkflowEngine({ projectRoot });
    if (command === "workflow-rubric-status") {
      const inspected = await engine.inspect(
        projectRef,
        workflowInputOptions(args, projectRoot),
      );
      console.log(
        JSON.stringify(
          {
            project_id: inspected.project_id,
            repair_loop: inspected.repair_loop,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (!args.result || !args["evaluator-session"]) {
      throw new Error(
        "workflow-rubric-record에는 --result와 --evaluator-session이 필요합니다.",
      );
    }
    const output = await engine.recordRubricIteration(
      projectRef,
      {
        evaluator_agent_session_id: String(
          args["evaluator-session"],
        ),
        rubric_result: readJsonArgument(
          args.result,
          "RubricResult",
        ),
        budget: args.budget
          ? readJsonArgument(args.budget, "RunBudget")
          : { state: "AVAILABLE" },
        scope_kind: args.scope
          ? String(args.scope)
          : "full_page",
      },
    );
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (
    [
      "workflow-status",
      "workflow-advance",
      "workflow-resume",
      "worker-lease",
      "worker-heartbeat",
    ].includes(command)
  ) {
    const { projectRoot, projectRef } = workflowContext(args);
    const engine = createWorkflowEngine({ projectRoot });
    const inputOptions = workflowInputOptions(args, projectRoot);
    let output;
    if (command === "workflow-status") {
      output = await engine.inspect(projectRef, inputOptions);
    } else if (command === "workflow-advance") {
      const experienceSync = await reconcileTrustedExperiences(projectRoot);
      output = await engine.advance(projectRef, {
        until: args.until || "next_user_gate",
        ...inputOptions,
      });
      const workerSessionIds = String(
        args["worker-sessions"] ?? "",
      )
        .split(",")
        .map((sessionId) => sessionId.trim())
        .filter(Boolean);
      output = await dispatchParallelProductionFrontier({
        engine,
        project_root: projectRoot,
        project_ref: projectRef,
        advance_result: output,
        production_plan: args["production-plan"]
          ? readProductionPlanArgument(
              args["production-plan"],
            )
          : null,
        plan_approval: args["plan-approval"]
          ? readJsonArgument(
              args["plan-approval"],
              "PlanApproval",
            )
          : null,
        approved_image_job_ids: String(
          args["approved-image-job-ids"] ?? "",
        )
          .split(",")
          .map((jobId) => jobId.trim())
          .filter(Boolean),
        worker_capacity:
          args["worker-capacity"] ||
          process.env.DETAIL_PAGE_WORKER_CAPACITY ||
          "auto",
        worker_session_ids: workerSessionIds,
        failed_members: args["failed-members"]
          ? readJsonArgument(
              args["failed-members"],
              "FailedMembers",
            )
          : [],
        retry_member_ids: String(
          args["retry-member-ids"] ?? "",
        )
          .split(",")
          .map((workItemId) => workItemId.trim())
          .filter(Boolean),
      });
      if (output && typeof output === "object") {
        output.experience_sync = experienceSync;
      }
    } else if (command === "workflow-resume") {
      const experienceSync = await reconcileTrustedExperiences(projectRoot);
      output = await engine.resume(projectRef, {
        until: args.until || "next_user_gate",
        ...inputOptions,
      });
      if (output && typeof output === "object") {
        output.experience_sync = experienceSync;
      }
    } else if (command === "worker-lease") {
      output = await engine.lease(projectRef, {
        stage_ids: args.stage
          ? String(args.stage)
              .split(",")
              .map((stageId) => stageId.trim())
              .filter(Boolean)
          : [],
      });
    } else {
      if (
        !args["work-order"] ||
        !args["fencing-token"] ||
        !Number.isInteger(Number(args.attempt))
      ) {
        throw new Error(
          "worker-heartbeat에는 --work-order, --fencing-token, --attempt가 필요합니다.",
        );
      }
      output = await engine.heartbeat(
        String(args["work-order"]),
        {
          project_ref: projectRef,
          fencing_token: String(args["fencing-token"]),
          attempt: Number(args.attempt),
        },
      );
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (command === "worker-submit") {
    if (!args.project || !args["work-order"] || !args.result) {
      throw new Error(
        "worker-submit에는 --project, --work-order, --result가 필요합니다.",
      );
    }
    const resultEnvelope = readJsonFile(args.result, "ResultEnvelope");
    const engine = createWorkflowEngine({
      projectRoot: path.resolve(args.project),
    });
    const output = resultEnvelope?.failure_receipt
      ? await engine.failFrontierWorkItem(
          String(args["work-order"]),
          resultEnvelope,
        )
      : await engine.submit(
          String(args["work-order"]),
          resultEnvelope,
        );
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (command === "workflow-decide") {
    if (!args.project || !args.challenge || !args.proof) {
      throw new Error(
        "workflow-decide에는 --project, --challenge, --proof가 필요합니다.",
      );
    }
    const decisionProof = readJsonFile(args.proof, "DecisionProof");
    const engine = createWorkflowEngine({
      projectRoot: path.resolve(args.project),
    });
    const output = await engine.decide(
      String(args.challenge),
      decisionProof,
    );
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (command === "list") {
    const root = path.resolve(args.root || defaultProjectsRoot());
    const projects = await listProjects(root);
    if (args.json === true) {
      console.log(JSON.stringify({ root, projects }, null, 2));
      return;
    }
    console.log(`Projects root: ${root}`);
    if (projects.length === 0) {
      console.log("관리 중인 프로젝트가 없습니다.");
      return;
    }
    for (const project of projects) {
      console.log(
        `${project.id}\t${project.phase}\t${project.name}\t${project.path}`,
      );
    }
    return;
  }
  if (command === "validate") {
    const targets = args.project
      ? [path.resolve(args.project)]
      : (await listProjects(
          path.resolve(args.root || defaultProjectsRoot()),
        )).map((project) => project.path);
    const reports = await Promise.all(
      targets.map((projectRoot) => validateProjectIsolation(projectRoot)),
    );
    const ok = reports.every((report) => report.ok);
    if (args.json === true) {
      console.log(JSON.stringify({ ok, reports }, null, 2));
    } else {
      for (const report of reports) {
        console.log(
          `${report.ok ? "PASS" : "FAIL"} ${report.projectRoot}${
            report.issues.length ? ` (${report.issues.length} issues)` : ""
          }`,
        );
        for (const issue of report.issues) {
          console.log(`  ${issue.file}: ${issue.reference}`);
        }
      }
    }
    if (!ok) process.exitCode = 1;
    return;
  }
  if (command === "new") {
    if (!args.name || !args["supplier-url"]) {
      throw new Error(
        "new 명령에는 --name과 --supplier-url이 필요합니다.",
      );
    }
    const created = await createProject({
      name: args.name,
      supplierUrl: args["supplier-url"],
      root: args.root || defaultProjectsRoot(),
      intake: args["no-intake"] !== true,
    });
    console.log(`Project created: ${created.projectRoot}`);
    if (created.intake) {
      printIntakeReport(created.intake);
    }
    const experienceSync = await reconcileTrustedExperiences(created.projectRoot);
    console.log(
      `Experience sync: promoted=${experienceSync.promoted} reused=${experienceSync.reused} quarantined=${experienceSync.quarantined}`,
    );
    if (args["no-start"] !== true) {
      const started = await startStudioV1Server({
        projectRoot: created.projectRoot,
        port: Number(args.port || 8896),
        open: args["no-open"] !== true,
      });
      console.log(`Detail Page Studio v1: ${started.url}`);
    }
    return;
  }
  if (command === "intake") {
    if (!args.project) {
      throw new Error(
        "intake 명령에는 --project 경로가 필요합니다. (--file <이름[,이름]>, --dry-run 지원)",
      );
    }
    const only = args.file
      ? String(args.file)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : null;
    const report = await intakeWorkspaceInputs({
      projectRoot: path.resolve(args.project),
      workspaceRoot: args.workspace ? path.resolve(args.workspace) : undefined,
      skillRoot: CURRENT_SKILL_ROOT,
      dryRun: args["dry-run"] === true,
      only,
    });
    if (args.json === true) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printIntakeReport(report);
    }
    if (report.failures.length > 0) process.exitCode = 1;
    return;
  }
  if (command === "intake-status") {
    const workspace = args.workspace
      ? path.resolve(args.workspace)
      : resolveWorkspaceRoot({ skillRoot: CURRENT_SKILL_ROOT });
    const candidates = await listWorkspaceIntakeCandidates({
      workspaceRoot: workspace,
    });
    console.log(
      JSON.stringify({ workspace_root: workspace, candidates }, null, 2),
    );
    if (candidates.length > 0) process.exitCode = 1;
    return;
  }
  if (command === "adopt") {
    if (!args.project || !args.name || !args["supplier-url"]) {
      throw new Error(
        "adopt 명령에는 --project, --name, --supplier-url이 필요합니다.",
      );
    }
    const adopted = await adoptProject({
      projectRoot: args.project,
      name: args.name,
      supplierUrl: args["supplier-url"],
      productId: args["product-id"] || "",
      phase: args.phase || "final_qa",
      score: args.score ?? null,
      htmlEntry: args["html-entry"] || "detail-page/index.html",
    });
    console.log(`Project adopted: ${adopted.projectRoot}`);
    const experienceSync = await reconcileTrustedExperiences(adopted.projectRoot);
    console.log(
      `Experience sync: promoted=${experienceSync.promoted} reused=${experienceSync.reused} quarantined=${experienceSync.quarantined}`,
    );
    return;
  }
  if (command === "start") {
    if (!args.project) {
      throw new Error("start 명령에는 --project 경로가 필요합니다.");
    }
    const experienceSync = await reconcileTrustedExperiences(
      commandProjectRoot(args),
    );
    const started = await startStudioV1Server({
      projectRoot: path.resolve(args.project),
      port: Number(args.port || 8896),
      open: args["no-open"] !== true,
    });
    console.log(`Detail Page Studio v1: ${started.url}`);
    console.log(
      `Experience sync: promoted=${experienceSync.promoted} reused=${experienceSync.reused} quarantined=${experienceSync.quarantined}`,
    );
    return;
  }
  throw new Error(`알 수 없는 명령입니다: ${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    const code = error?.code ? `[${error.code}] ` : "";
    console.error(`ERROR ${code}${error.message || error}`);
    if (error?.details && Object.keys(error.details).length > 0) {
      console.error(JSON.stringify({ details: error.details }, null, 2));
    }
    process.exitCode = 1;
  });
}
