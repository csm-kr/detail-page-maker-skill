#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateLeanPlan, buildExamplePlan } from "./lean-contract.mjs";
import { validateHtmlProject } from "./lean-html-qa.mjs";
import { createProject, defaultProjectsRoot } from "./lib/new-project.mjs";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MINIMUM_NODE = [22, 15, 0];

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function versionAtLeast(current, minimum) {
  const parts = String(current).replace(/^v/, "").split(".").map(Number);
  return minimum.every((part, index) =>
    parts[index] === part || parts[index] > part ||
    minimum.slice(0, index).some((prior, priorIndex) => parts[priorIndex] > prior),
  );
}

function probe(command, args = []) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0 && !result.error,
    version: `${result.stdout || ""}${result.stderr || ""}`.trim().split("\n")[0] || null,
  };
}

function findHostSkill(name) {
  const roots = [
    process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills") : null,
    path.join(os.homedir(), ".codex", "skills"),
    path.join(os.homedir(), ".agents", "skills"),
    path.join(os.homedir(), ".claude", "skills"),
  ].filter(Boolean);
  return roots
    .map((root) => path.join(root, name))
    .find((candidate) => existsSync(path.join(candidate, "SKILL.md"))) || null;
}

function doctor() {
  const manifest = JSON.parse(readFileSync(path.join(SKILL_ROOT, "dependencies.json"), "utf8"));
  const bundled = Object.fromEntries(manifest.bundled_skills.map((name) => {
    const skillPath = path.join(SKILL_ROOT, ".agents", "skills", name);
    return [name, { ok: existsSync(path.join(skillPath, "SKILL.md")), path: skillPath }];
  }));
  const host = Object.fromEntries(manifest.host_skills.map((name) => {
    const skillPath = findHostSkill(name);
    return [name, { ok: Boolean(skillPath), path: skillPath }];
  }));
  const report = {
    ok: versionAtLeast(process.version, MINIMUM_NODE),
    node: { ok: versionAtLeast(process.version, MINIMUM_NODE), version: process.version, required: ">=22.15.0" },
    ffmpeg: probe("ffmpeg", ["-version"]),
    browser_harness: probe("browser-harness", ["--version"]),
    bundled_skills: bundled,
    host_skills: host,
    note: "HyperFrames 실행 패키지는 motion 프로젝트에 로컬로 준비합니다.",
  };
  report.ok = report.ok && report.ffmpeg.ok && report.browser_harness.ok &&
    Object.values(bundled).every((item) => item.ok) &&
    Object.values(host).every((item) => item.ok);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function agentCapacity() {
  const cpu = os.availableParallelism?.() || os.cpus().length;
  const memoryGiB = os.totalmem() / 1024 ** 3;
  const recommended = Math.max(1, Math.min(cpu - 1, Math.floor(memoryGiB / 2), 6));
  console.log(JSON.stringify({
    available_parallelism: cpu,
    total_memory_gib: Number(memoryGiB.toFixed(1)),
    recommended_worker_capacity: recommended,
    note: "실제 동시 실행은 호스트가 제공한 agent slot 수를 넘지 않습니다. 브라우저 lane은 기본 1입니다.",
  }, null, 2));
}

function help() {
  console.log(`Detail Page Maker — lean 780px workflow

Commands:
  doctor
  agent-capacity
  new --name <name> --supplier-url <url> --coupang-url <url> --photos <yes|no> [--root <folder>]
  example-plan
  validate-plan --file <flow-plan.json>
  qa --project <folder> [--strict-media]
  studio --project <folder> [--host <host>] [--port <port>]
  wing --project <folder> [--mode <dry-run|publish>] [--confirm PUBLISH_CDN] [--page-url <url>]
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "help";
  if (command === "help" || args.help) return help();
  if (command === "doctor") return doctor();
  if (command === "agent-capacity") return agentCapacity();
  if (command === "example-plan") {
    console.log(JSON.stringify(await buildExamplePlan(), null, 2));
    return;
  }
  if (command === "validate-plan") {
    if (!args.file) throw new Error("--file <flow-plan.json>이 필요합니다.");
    const plan = JSON.parse(readFileSync(path.resolve(args.file), "utf8"));
    const report = await validateLeanPlan(plan);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (command === "new") {
    const created = await createProject({
      name: args.name,
      supplierUrl: args["supplier-url"],
      coupangUrl: args["coupang-url"],
      photoStatus: args.photos,
      root: args.root ? path.resolve(args.root) : defaultProjectsRoot(),
    });
    console.log(JSON.stringify(created, null, 2));
    return;
  }
  if (command === "qa") {
    if (!args.project) throw new Error("--project <folder>가 필요합니다.");
    const report = validateHtmlProject(args.project, { strictMedia: Boolean(args["strict-media"]) });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (command === "studio") {
    if (!args.project) throw new Error("--project <folder>가 필요합니다.");
    const { startLeanStudioServer } = await import("./lean-studio-server.mjs");
    const runtime = await startLeanStudioServer({
      projectRoot: path.resolve(args.project),
      host: args.host || "127.0.0.1",
      port: args.port ? Number(args.port) : 0,
    });
    console.log(JSON.stringify({ url: runtime.url, project: path.resolve(args.project) }, null, 2));
    return;
  }
  if (command === "wing") {
    if (!args.project) throw new Error("--project <folder>가 필요합니다.");
    const { runLeanWingExport } = await import("./lean-wing-export.mjs");
    const report = await runLeanWingExport({
      projectRoot: path.resolve(args.project),
      mode: args.mode || "dry-run",
      confirm: args.confirm,
      pageUrl: args["page-url"],
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  throw new Error(`알 수 없는 명령: ${command}`);
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});
