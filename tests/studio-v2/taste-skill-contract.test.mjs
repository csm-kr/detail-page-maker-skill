import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function repositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("detail-page-maker는 design-taste-frontend를 필수 게이트로 선언한다", async () => {
  const skill = await repositoryFile(
    "skills/detail-page-maker-skill/SKILL.md",
  );

  assert.match(
    skill,
    /`design-taste-frontend`는 선택 참고자료가 아니라 이 스킬의 필수\s+의존성이다\./,
  );
  assert.match(skill, /qa\/reports\/taste-<revision>\.md/);
  assert.match(skill, /Taste 최종 pre-flight/);
});

test("설치와 doctor가 design-taste-frontend 의존성을 강제한다", async () => {
  const [setup, cli] = await Promise.all([
    repositoryFile(
      "skills/detail-page-maker-skill/scripts/setup-local.ps1",
    ),
    repositoryFile(
      "skills/detail-page-maker-skill/scripts/detail-page.mjs",
    ),
  ]);

  assert.match(setup, /Leonxlnx\/taste-skill/);
  assert.match(setup, /"--skill", "design-taste-frontend"/);
  assert.match(setup, /\.agents[\\/]skills/);
  assert.doesNotMatch(setup, /--global/);
  assert.match(cli, /probeLocalSkill/);
  assert.match(cli, /localSkills\["design-taste-frontend"\]/);
});

test("설치와 doctor가 God Tibo GPT Image 2 실행 환경을 강제한다", async () => {
  const [setup, cli, dependencies] = await Promise.all([
    repositoryFile(
      "skills/detail-page-maker-skill/scripts/setup-local.ps1",
    ),
    repositoryFile(
      "skills/detail-page-maker-skill/scripts/detail-page.mjs",
    ),
    repositoryFile(
      "skills/detail-page-maker-skill/dependencies.json",
    ),
  ]);

  assert.match(setup, /csm-kr\/god-tibo-gpt-image2-skill/);
  assert.match(setup, /npm"[\s\S]*"install"[\s\S]*"--omit=dev"/);
  assert.match(cli, /probeGodTiboRuntime/);
  assert.match(cli, /defaultBatchSize:\s*8/);
  assert.match(cli, /godTiboGptImage2/);
  assert.match(dependencies, /"name":\s*"god-tibo-gpt-image2-skill"/);
});
