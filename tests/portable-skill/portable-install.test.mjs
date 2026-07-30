import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SKILL_ROOT = path.join(
  REPOSITORY_ROOT,
  "skills",
  "detail-page-maker-skill",
);
const INSTALLER = path.join(SKILL_ROOT, "scripts", "install-local.ps1");
const REQUIRED_SKILLS = [
  "browser-harness",
  "coupang-extractor",
  "design-taste-frontend",
  "dmk-extractor",
  "god-tibo-gpt-image2-skill",
  "hyperframes",
  "hyperframes-animation",
  "hyperframes-cli",
  "hyperframes-core",
  "hyperframes-creative",
  "hyperframes-keyframes",
  "hyperframes-registry",
  "media-use",
  "motion-graphics",
];

async function runInstaller(targetProject, ...extraArguments) {
  return runInstallerFrom(SKILL_ROOT, targetProject, ...extraArguments);
}

async function runInstallerFrom(source, targetProject, ...extraArguments) {
  return execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      INSTALLER,
      "-Source",
      source,
      "-TargetProject",
      targetProject,
      ...extraArguments,
    ],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
}

test("의존성 선언은 프로젝트 로컬·vendored 우선·명시적 네트워크 정책이다", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(SKILL_ROOT, "dependencies.json"), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(path.join(SKILL_ROOT, "skills-lock.json"), "utf8"),
  );

  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.installScope, "project-local");
  assert.equal(manifest.defaultTargetSkillDirectory, ".agents/skills");
  assert.equal(manifest.vendoredSkillDirectory, ".agents/skills");
  assert.equal(manifest.networkFallback, "explicit-only");
  assert.deepEqual(
    manifest.skills.map((skill) => skill.name),
    REQUIRED_SKILLS,
  );
  assert.deepEqual(Object.keys(lock.skills), REQUIRED_SKILLS);
  assert.ok(manifest.skills.every((skill) => skill.source === "vendored-local"));
});

test("setup 진입점은 전역 설치 없이 프로젝트 로컬 설치기만 호출한다", async () => {
  const [setup, installer] = await Promise.all([
    readFile(path.join(SKILL_ROOT, "scripts", "setup-local.ps1"), "utf8"),
    readFile(INSTALLER, "utf8"),
  ]);

  assert.match(setup, /install-local\.ps1/);
  assert.match(setup, /TargetProject/);
  assert.doesNotMatch(setup, /winget\s+install|uv"\s*,?\s*@?\(\s*"tool"\s*,\s*"install"/);
  assert.doesNotMatch(setup, /--global|\$CODEX_HOME|EnvironmentVariable\("Path"/);
  assert.match(installer, /-AllowNetwork/);
  assert.match(installer, /skip-identical/);
  assert.match(installer, /E_RECURSIVE_COPY/);
  assert.doesNotMatch(installer, /\$CODEX_HOME|--global/);
});

test("dry-run은 파일을 만들지 않고 전체 sibling 설치 계획을 검증한다", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "detail-skill-dry-"));
  try {
    const { stdout } = await runInstaller(target, "-DryRun", "-Json");
    const report = JSON.parse(stdout);

    assert.equal(report.ok, true);
    assert.equal(report.mode, "dry-run");
    assert.equal(report.allowNetwork, false);
    assert.deepEqual(
      report.actions.map((action) => action.name),
      ["detail-page-maker-skill", ...REQUIRED_SKILLS],
    );
    await assert.rejects(
      access(path.join(target, ".agents")),
      /ENOENT/,
    );
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test("로컬 번들은 설치·동일 재실행되고 사용자 변경은 덮어쓰지 않는다", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "detail-skill-install-"));
  const source = path.join(fixture, "source");
  const target = path.join(fixture, "target");
  try {
    await cp(SKILL_ROOT, source, { recursive: true });
    await mkdir(target);
    await runInstallerFrom(source, target);
    const targetSkillRoot = path.join(target, ".agents", "skills");
    for (const skillName of ["detail-page-maker-skill", ...REQUIRED_SKILLS]) {
      await access(path.join(targetSkillRoot, skillName, "SKILL.md"));
    }
    await access(
      path.join(
        targetSkillRoot,
        "detail-page-maker-skill",
        ".agents",
        "skills",
        "dmk-extractor",
        "SKILL.md",
      ),
    );
    const receipt = JSON.parse(
      await readFile(
        path.join(target, ".agents", "detail-page-maker-skill.install.json"),
        "utf8",
      ),
    );
    assert.equal(receipt.networkUsed, false);
    assert.equal(receipt.skills.length, REQUIRED_SKILLS.length + 1);

    const second = await runInstallerFrom(source, target);
    assert.match(second.stdout, /\[skip-identical\] detail-page-maker-skill/);
    assert.match(second.stdout, /\[skip-identical\] dmk-extractor/);

    const changedSkill = path.join(
      targetSkillRoot,
      "dmk-extractor",
      "SKILL.md",
    );
    await appendFile(changedSkill, "\n<!-- user-owned-change -->\n", "utf8");
    await assert.rejects(
      runInstallerFrom(source, target),
      (error) => {
        assert.match(
          `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
          /E_TARGET_CONFLICT/,
        );
        return true;
      },
    );
    assert.match(await readFile(changedSkill, "utf8"), /user-owned-change/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("설치된 스킬 자신을 같은 대상에 다시 복사하는 재귀 경로를 차단한다", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "detail-skill-cycle-"));
  const source = path.join(fixture, "source");
  const target = path.join(fixture, "target");
  try {
    await cp(SKILL_ROOT, source, { recursive: true });
    await mkdir(target);
    await runInstallerFrom(source, target);
    const installedSource = path.join(
      target,
      ".agents",
      "skills",
      "detail-page-maker-skill",
    );
    await assert.rejects(
      execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(installedSource, "scripts", "install-local.ps1"),
          "-Source",
          installedSource,
          "-TargetProject",
          target,
        ],
        {
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
        },
      ),
      (error) => {
        assert.match(
          `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
          /E_RECURSIVE_COPY/,
        );
        return true;
      },
    );
    assert.equal((await stat(installedSource)).isDirectory(), true);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("의존 스킬 이름의 경로 탈출을 이동 전에 차단하고 rollback 경계를 갖는다", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "detail-skill-name-"));
  const source = path.join(fixture, "source");
  const target = path.join(fixture, "target");
  try {
    await cp(SKILL_ROOT, source, { recursive: true });
    await mkdir(target);
    const manifestPath = path.join(source, "dependencies.json");
    const lockPath = path.join(source, "skills-lock.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    manifest.skills[0].name = "../outside";
    const originalLock = lock.skills[REQUIRED_SKILLS[0]];
    delete lock.skills[REQUIRED_SKILLS[0]];
    lock.skills["../outside"] = originalLock;
    await Promise.all([
      writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
      writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`),
    ]);

    await assert.rejects(
      runInstallerFrom(source, target),
      (error) => {
        assert.match(
          `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
          /E_SKILL_NAME_INVALID/,
        );
        return true;
      },
    );
    await assert.rejects(access(path.join(fixture, "outside")), /ENOENT/);

    const installer = await readFile(INSTALLER, "utf8");
    assert.match(installer, /\$committedDestinations/);
    assert.match(installer, /E_TARGET_RACE/);
    assert.match(installer, /catch\s*\{/);
    assert.match(installer, /Remove-Item -Recurse -Force -LiteralPath \$destination/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("대상 .agents/skills 부모 junction을 따라 프로젝트 밖에 설치하지 않는다", async () => {
  const fixture = await mkdtemp(
    path.join(os.tmpdir(), "detail-skill-target-junction-"),
  );
  const source = path.join(fixture, "source");
  const target = path.join(fixture, "target");
  const outside = path.join(fixture, "outside");
  try {
    await Promise.all([
      cp(SKILL_ROOT, source, { recursive: true }),
      mkdir(path.join(target, ".agents"), { recursive: true }),
      mkdir(outside, { recursive: true }),
    ]);
    await symlink(
      outside,
      path.join(target, ".agents", "skills"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await assert.rejects(
      runInstallerFrom(source, target),
      (error) => {
        assert.match(
          `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
          /E_TARGET_REPARSE/,
        );
        return true;
      },
    );
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
