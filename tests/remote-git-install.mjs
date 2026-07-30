import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPOSITORY_URL =
  "https://github.com/csm-kr/detail-page-maker-skill";
const SKILL_NAME = "detail-page-maker-skill";
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SOURCE_SKILL_ROOT = path.join(
  REPOSITORY_ROOT,
  "skills",
  SKILL_NAME,
);

function canonicalText(bytes) {
  return bytes.toString("utf8").replace(/\r\n?/gu, "\n");
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "");
}

async function runNpx(args, cwd) {
  const quoteWindowsArg = (value) => {
    const text = String(value);
    if (!/[\s"&|<>^]/u.test(text)) return text;
    return `"${text.replace(/"/gu, '\\"')}"`;
  };
  const command =
    process.platform === "win32"
      ? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe"
      : "npx";
  const commandArgs =
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          ["npx", ...args].map(quoteWindowsArg).join(" "),
        ]
      : args;
  return execFileAsync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
}

async function runNode(script, args, cwd) {
  return execFileAsync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
}

async function assertInstalledSkill(skillRoot) {
  await access(path.join(skillRoot, "SKILL.md"));
  const nested = await readdir(path.join(skillRoot, ".agents", "skills"), {
    withFileTypes: true,
  });
  assert.equal(
    nested.filter((entry) => entry.isDirectory()).length,
    14,
    "원격 설치본에는 잠금된 내장 스킬 14개가 있어야 한다.",
  );

  const [sourceSkill, installedSkill] = await Promise.all([
    readFile(path.join(SOURCE_SKILL_ROOT, "SKILL.md")),
    readFile(path.join(skillRoot, "SKILL.md")),
  ]);
  assert.equal(
    canonicalText(installedSkill),
    canonicalText(sourceSkill),
    "원격 설치본은 현재 main checkout의 스킬과 일치해야 한다.",
  );

  const doctor = await runNode(
    path.join(skillRoot, "scripts", "detail-page.mjs"),
    ["doctor"],
    skillRoot,
  );
  const doctorResult = JSON.parse(doctor.stdout);
  assert.equal(doctorResult.ok, true);
  assert.equal(doctorResult.node.required, ">=22.15.0");
  assert.equal(doctorResult.dependencyClosure.declaredCount, 14);
  assert.equal(doctorResult.dependencyClosure.lockedCount, 14);
  assert.equal(doctorResult.dependencyClosure.installedCount, 14);

  const e2e = await runNode(
    path.join(skillRoot, "scripts", "e2e.mjs"),
    [],
    skillRoot,
  );
  assert.match(`${e2e.stdout}\n${e2e.stderr}`, /PASS/);
}

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "detail-page-remote-git-"),
);
const projectRoot = path.join(temporaryRoot, "project");

try {
  await mkdir(projectRoot, { recursive: true });

  const installation = await runNpx(
    [
      "--yes",
      "skills",
      "add",
      REPOSITORY_URL,
      "--skill",
      SKILL_NAME,
      "--agent",
      "codex",
      "--yes",
      "--copy",
    ],
    projectRoot,
  );
  assert.match(
    stripAnsi(`${installation.stdout}\n${installation.stderr}`),
    /Found\s+1\s+skill/u,
    "Git 원본은 top-level skill 하나만 노출해야 한다.",
  );

  const installedSkillRoot = path.join(
    projectRoot,
    ".agents",
    "skills",
    SKILL_NAME,
  );
  await assertInstalledSkill(installedSkillRoot);

  await runNpx(
    [
      "--yes",
      "skills",
      "update",
      SKILL_NAME,
      "--project",
      "--yes",
    ],
    projectRoot,
  );
  await assertInstalledSkill(installedSkillRoot);

  console.log(
    `PASS remote Git install/update · ${process.platform} · 1 top-level skill · 14 bundled skills`,
  );
} finally {
  await rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
}
