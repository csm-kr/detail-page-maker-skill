import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createProject, defaultProjectsRoot } from "./new-project.mjs";
import { startStudioV1Server } from "./studio-v1-server.mjs";

const CURRENT_SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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
  const [major] = versionTuple(process.version);
  return major >= 22;
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
      : `로컬 의존 스킬 '${skillName}'이 없습니다. scripts/setup-local.ps1을 실행하세요.`,
  };
}

function printHelp() {
  console.log(`Detail Page Maker

Commands:
  doctor
  new --name <상품명> --supplier-url <URL> [--root <폴더>] [--no-start]
  start --project <프로젝트 폴더> [--port 8896] [--no-open]

Default projects root:
  ${defaultProjectsRoot()}
`);
}

async function doctor() {
  const hyperframes = probe("npx", ["hyperframes", "--version"]);
  const browserHarness = probe("browser-harness", ["--version"]);
  const ffmpeg = probe("ffmpeg", ["-version"]);
  const localSkills = Object.fromEntries(
    requiredLocalSkills().map((skillName) => [
      skillName,
      probeLocalSkill(skillName),
    ]),
  );
  const localSkillsOk = Object.values(localSkills).every((skill) => skill.ok);
  const designTasteFrontend = localSkills["design-taste-frontend"];
  const report = {
    ok:
      nodeSupported() &&
      hyperframes.ok &&
      browserHarness.ok &&
      ffmpeg.ok &&
      localSkillsOk,
    node: {
      ok: nodeSupported(),
      version: process.version,
      required: ">=22",
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
    localSkillRoot: path.join(CURRENT_SKILL_ROOT, ".agents", "skills"),
    localSkills,
    designTasteFrontend: {
      ok: designTasteFrontend?.ok === true,
      required: true,
      path: designTasteFrontend?.path || null,
      detail: designTasteFrontend?.detail || null,
    },
    defaultProjectsRoot: defaultProjectsRoot(),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
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
    });
    console.log(`Project created: ${created.projectRoot}`);
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
  if (command === "start") {
    if (!args.project) {
      throw new Error("start 명령에는 --project 경로가 필요합니다.");
    }
    const started = await startStudioV1Server({
      projectRoot: path.resolve(args.project),
      port: Number(args.port || 8896),
      open: args["no-open"] !== true,
    });
    console.log(`Detail Page Studio v1: ${started.url}`);
    return;
  }
  throw new Error(`알 수 없는 명령입니다: ${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
