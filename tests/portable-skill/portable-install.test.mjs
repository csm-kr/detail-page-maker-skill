import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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

test("단일 스킬 폴더는 로컬 설치할 의존 스킬을 명시한다", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(SKILL_ROOT, "dependencies.json"), "utf8"),
  );

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.installScope, "skill-folder");
  assert.equal(manifest.localSkillDirectory, ".agents/skills");
  assert.deepEqual(
    manifest.skills.map((skill) => skill.name),
    [
      "browser-harness",
      "design-taste-frontend",
      "hyperframes",
      "hyperframes-animation",
      "hyperframes-cli",
      "hyperframes-core",
      "hyperframes-creative",
      "hyperframes-keyframes",
      "hyperframes-registry",
      "media-use",
      "motion-graphics",
    ],
  );
});

test("로컬 설치 명령은 전역 폴더가 아니라 받은 스킬 폴더를 사용한다", async () => {
  const setup = await readFile(
    path.join(SKILL_ROOT, "scripts", "setup-local.ps1"),
    "utf8",
  );

  assert.match(setup, /\$SkillRoot\s*=/);
  assert.match(setup, /Set-Location -LiteralPath \$SkillRoot/);
  assert.match(setup, /\.agents[\\/]skills/);
  assert.match(setup, /Leonxlnx\/taste-skill/);
  assert.match(setup, /heygen-com\/hyperframes/);
  assert.match(setup, /browser-harness skill/);
  assert.match(setup, /e2e\.mjs/);
  assert.doesNotMatch(setup, /--global/);
});

test("E2E 명령은 새 프로젝트의 승인 전 잠금과 승인 후 출력을 검증한다", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(SKILL_ROOT, "scripts", "e2e.mjs"), "--json"],
    { encoding: "utf8" },
  );
  const report = JSON.parse(stdout);

  assert.equal(report.ok, true);
  assert.equal(report.checks.projectCreated, true);
  assert.equal(report.checks.studioHttpStatus, 200);
  assert.equal(report.checks.gateBefore.exportAllowed, false);
  assert.equal(report.checks.unconfirmedDecisionStatus, 409);
  assert.equal(report.checks.approvedDecisionStatus, 200);
  assert.equal(report.checks.gateAfter.exportAllowed, true);
  assert.equal(report.checks.approvalManifestRecorded, true);
  assert.equal(report.cleaned, true);
});
