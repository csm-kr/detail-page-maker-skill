import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createProject, defaultProjectsRoot } from "./new-project.mjs";
import { startStudioServer } from "./studio-server.mjs";

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
    output: `${result.stdout || ""}${result.stderr || ""}${
      result.error ? `\n${result.error.message}` : ""
    }`.trim(),
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
  const report = {
    ok: nodeSupported() && hyperframes.ok && browserHarness.ok,
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
      const started = await startStudioServer({
        projectRoot: created.projectRoot,
        port: Number(args.port || 8896),
        open: args["no-open"] !== true,
      });
      console.log(`Detail Page Studio: ${started.url}`);
    }
    return;
  }
  if (command === "start") {
    if (!args.project) {
      throw new Error("start 명령에는 --project 경로가 필요합니다.");
    }
    const started = await startStudioServer({
      projectRoot: path.resolve(args.project),
      port: Number(args.port || 8896),
      open: args["no-open"] !== true,
    });
    console.log(`Detail Page Studio: ${started.url}`);
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
