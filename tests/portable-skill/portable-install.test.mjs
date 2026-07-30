import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  inspectDependencyClosure,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/dependency-closure.mjs";

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

async function walkFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, child)));
    } else {
      files.push(child);
    }
  }
  return files;
}

test("배포 계약은 Git에서 받는 단일 스킬과 내장 의존성 14개다", async () => {
  const [manifest, lock, skill, readme] = await Promise.all([
    readFile(path.join(SKILL_ROOT, "dependencies.json"), "utf8").then(JSON.parse),
    readFile(path.join(SKILL_ROOT, "skills-lock.json"), "utf8").then(JSON.parse),
    readFile(path.join(SKILL_ROOT, "SKILL.md"), "utf8"),
    readFile(path.join(REPOSITORY_ROOT, "README.md"), "utf8"),
  ]);

  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.installScope, "project-local");
  assert.equal(manifest.vendoredSkillDirectory, ".agents/skills");
  assert.equal(manifest.distribution.transport, "git");
  assert.equal(
    manifest.distribution.repository,
    "https://github.com/csm-kr/detail-page-maker-skill.git",
  );
  assert.equal(manifest.distribution.bundledDependenciesRequired, true);
  assert.equal(
    manifest.runtimes.hyperframes,
    "project-local-npx-required-for-motion",
  );
  assert.equal("networkFallback" in manifest, false);
  assert.deepEqual(
    manifest.skills.map((dependency) => dependency.name),
    REQUIRED_SKILLS,
  );
  assert.ok(
    manifest.skills.every(
      (dependency) =>
        dependency.source === "vendored-local" &&
        !("networkSource" in dependency),
    ),
  );
  assert.deepEqual(Object.keys(lock.skills), REQUIRED_SKILLS);
  assert.match(skill, /이 배포 폴더의 `\.agents\/skills\/`만 사용/);
  assert.match(readme, /npx skills add https:\/\/github\.com\/csm-kr\/detail-page-maker-skill/);
  assert.match(readme, /--skill detail-page-maker-skill/);
  assert.doesNotMatch(readme, /install-local|setup-local|setup-windows/);
});

test("스킬 폴더 하나만 복사해도 dependency closure와 E2E가 통과한다", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "detail-single-skill-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const copiedSkill = path.join(fixture, "detail-page-maker-skill");
  await cp(SKILL_ROOT, copiedSkill, { recursive: true });

  const closure = await inspectDependencyClosure(copiedSkill);
  assert.equal(closure.ok, true);
  assert.equal(closure.declaredCount, REQUIRED_SKILLS.length);
  assert.equal(closure.lockedCount, REQUIRED_SKILLS.length);
  assert.equal(closure.installedCount, REQUIRED_SKILLS.length);

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [path.join(copiedSkill, "scripts", "e2e.mjs")],
    {
      cwd: copiedSkill,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
  assert.match(`${stdout}\n${stderr}`, /PASS/);
});

test("내장 스킬 누락이나 잠금 hash 불일치는 fail-closed한다", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "detail-bundle-fail-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const copiedSkill = path.join(fixture, "detail-page-maker-skill");
  await cp(SKILL_ROOT, copiedSkill, { recursive: true });

  await rm(
    path.join(
      copiedSkill,
      ".agents",
      "skills",
      "dmk-extractor",
      "SKILL.md",
    ),
  );
  const missing = await inspectDependencyClosure(copiedSkill);
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missingInstall, ["dmk-extractor"]);

  await cp(
    path.join(
      SKILL_ROOT,
      ".agents",
      "skills",
      "dmk-extractor",
      "SKILL.md",
    ),
    path.join(
      copiedSkill,
      ".agents",
      "skills",
      "dmk-extractor",
      "SKILL.md",
    ),
  );
  await writeFile(
    path.join(
      copiedSkill,
      ".agents",
      "skills",
      "dmk-extractor",
      "SKILL.md",
    ),
    "\n<!-- tampered -->\n",
    { encoding: "utf8", flag: "a" },
  );
  const tampered = await inspectDependencyClosure(copiedSkill);
  assert.equal(tampered.ok, false);
  assert.deepEqual(
    tampered.hashMismatches.map((entry) => entry.skillName),
    ["dmk-extractor"],
  );
});

test("핵심 실행 경로에는 운영체제별 설치 스크립트가 없다", async () => {
  const files = await walkFiles(SKILL_ROOT);
  const ownFiles = files.filter(
    (file) => !file.startsWith(`.agents${path.sep}skills${path.sep}`),
  );
  assert.deepEqual(
    ownFiles.filter((file) => /\.(?:ps1|bat|cmd)$/iu.test(file)),
    [],
  );
  assert.deepEqual(
    files.filter((file) => /\.(?:node|dll|exe|so|dylib)$/iu.test(file)),
    [],
  );
  await Promise.all(
    [
      "scripts/install-local.ps1",
      "scripts/setup-local.ps1",
    ].map(async (relative) => {
      await assert.rejects(access(path.join(SKILL_ROOT, relative)), /ENOENT/);
    }),
  );
  const manifest = JSON.parse(
    await readFile(path.join(SKILL_ROOT, "dependencies.json"), "utf8"),
  );
  assert.equal("powershell" in manifest.runtimes, false);
});

test("공통 Node 유지보수 진입점은 세 운영체제용 경로 인자를 path API로 처리한다", async () => {
  const [refresh, adapter] = await Promise.all([
    readFile(
      path.join(
        SKILL_ROOT,
        "scripts",
        "maintenance",
        "refresh-browser-study.mjs",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        SKILL_ROOT,
        "scripts",
        "orchestration",
        "adapters",
        "learning-pipeline-adapter.mjs",
      ),
      "utf8",
    ),
  ]);
  assert.match(refresh, /path\.join/);
  assert.match(refresh, /spawn\("browser-harness"/);
  assert.match(refresh, /shell: false/);
  assert.match(adapter, /process\.execPath/);
  assert.doesNotMatch(adapter, /powershell|pwsh/i);
});

test("Cloudflare setup 보조 CLI도 운영체제 셸 없이 Node argv로 실행된다", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "cloudflare-setup-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const target = path.join(fixture, "wrangler.js");
  const bytes = Buffer.from("cross-platform-entry\n", "utf8");
  await writeFile(target, bytes);
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(
        SKILL_ROOT,
        "scripts",
        "runtime",
        "cloudflare-setup.mjs",
      ),
      "entry-hash",
      "--file",
      target,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(
    stdout.trim(),
    createHash("sha256").update(bytes).digest("hex"),
  );
});
