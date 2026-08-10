import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../skills/detail-page-maker-skill",
);

const REQUIRED_WORKFLOW_SKILLS = [
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

test("G0부터 G5까지 필요한 프로젝트 로컬 스킬은 선언·잠금·설치 상태가 일치한다", async () => {
  const [dependencies, lock] = await Promise.all([
    readFile(path.join(SKILL_ROOT, "dependencies.json"), "utf8").then(JSON.parse),
    readFile(path.join(SKILL_ROOT, "skills-lock.json"), "utf8").then(JSON.parse),
  ]);
  const declared = dependencies.skills
    .map((skill) => skill.name)
    .sort((left, right) => left.localeCompare(right));
  const locked = Object.keys(lock.skills).sort((left, right) =>
    left.localeCompare(right),
  );

  assert.deepEqual(declared, REQUIRED_WORKFLOW_SKILLS);
  assert.deepEqual(locked, REQUIRED_WORKFLOW_SKILLS);
  await Promise.all(
    REQUIRED_WORKFLOW_SKILLS.map((skillName) =>
      access(
        path.join(
          SKILL_ROOT,
          ".agents",
          "skills",
          skillName,
          "SKILL.md",
        ),
      ),
    ),
  );
});

test("상위 스킬은 God Tibo 기본값에 기대지 않고 32개 작업 단위를 명시한다", async () => {
  const [skill, assets] = await Promise.all([
    readFile(path.join(SKILL_ROOT, "SKILL.md"), "utf8"),
    readFile(path.join(SKILL_ROOT, "references", "assets.md"), "utf8"),
  ]);

  assert.doesNotMatch(skill, /기본\s*배치[^\n]*16개/);
  assert.match(skill, /`items` 32개/);
  assert.match(skill, /`workers: 32`/);
  assert.match(assets, /기본 작업 단위: 서로 다른 용도의 32개 `items`/);
  assert.match(assets, /`workers: 32`, `single_concurrent_batch`/);
  // 32개를 작은 batch로 쪼개 순차 실행하는 우회를 문서가 금지해야 한다.
  assert.match(assets, /8개씩 네 번 나누는 순차 실행은 금지한다/);
});
