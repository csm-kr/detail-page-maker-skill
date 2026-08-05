// init — docs/ARCHITECTURE.md §11.2
//
// 다른 기계에서 스킬만 받아도 인터뷰부터 시작할 수 있어야 한다. 그래서 부트스트랩과
// 설치·정리를 함께 검사한다.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INIT = path.resolve(HERE, "..", "init.mjs");
const SKILLS_ROOT = path.resolve(HERE, "..", "..", "..");

const ANSWERS = {
  hosts: ["claude-code", "codex"],
  project_root: "./projects",
  model_face: "crop-below-chin",
  chatgpt_login: true,
  vendor_hyperframes: false,
  media_budget_mb: 12,
  photo_format: "webp-q85",
  capture_max_age_days: 7,
  wallclock_target_min: 95,
};

function run(args, { workspace, env = {} } = {}) {
  const result = spawnSync(process.execPath, [INIT, ...args], {
    encoding: "utf8",
    env: { ...process.env, DETAIL_PAGE_WORKSPACE: workspace, ...env },
  });
  return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** 작은 원본 스킬 트리. 109개 파일을 매 테스트마다 복사하지 않는다. */
async function makeSource(root) {
  const source = path.join(root, ".skill-src", "skills");
  for (const skill of ["detail-page-orchestrator", "detail-page-g1-fact"]) {
    await mkdir(path.join(source, skill, "scripts"), { recursive: true });
    await writeFile(path.join(source, skill, "SKILL.md"), `# ${skill}\n`, "utf8");
    await writeFile(
      path.join(source, skill, "scripts", "run.mjs"),
      "// stub\n",
      "utf8",
    );
  }
  return source;
}

async function makeWorkspace({ answers = ANSWERS } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "dp-init-"));
  await makeSource(root);
  if (answers !== null) {
    await mkdir(path.join(root, "work"), { recursive: true });
    await writeFile(
      path.join(root, "work", "env.answers.json"),
      `${JSON.stringify(answers, null, 2)}\n`,
      "utf8",
    );
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

test("빈 워크스페이스에서 필요한 디렉터리를 부트스트랩한다", async () => {
  const ws = await makeWorkspace();
  try {
    const { code, out } = run(["--apply"], { workspace: ws.root });
    assert.equal(code, 0, out);
    for (const dir of ["work", "data", "projects", path.join(".claude", "skills"), path.join(".agents", "skills")]) {
      assert.ok(await exists(path.join(ws.root, dir)), `${dir} 가 없다`);
    }
  } finally {
    await ws.cleanup();
  }
});

test("설치는 두 호스트 경로에만 이뤄지고 원본과 일치한다", async () => {
  const ws = await makeWorkspace();
  try {
    run(["--apply", "--install-mode", "copy"], { workspace: ws.root });
    const lock = JSON.parse(await readFile(path.join(ws.root, "work", "env.lock.json"), "utf8"));

    assert.deepEqual(Object.keys(lock.install.targets).sort(), ["claude-code", "codex"]);
    for (const target of Object.values(lock.install.targets)) {
      const installed = (await readdir(path.join(ws.root, target))).sort();
      // GENERATED.md 는 "여기를 고치지 않는다" 를 알리는 표지다.
      assert.deepEqual(installed, [
        "GENERATED.md",
        "detail-page-g1-fact",
        "detail-page-orchestrator",
      ]);
    }

    const { hashTree } = await import(
      "../../../detail-page-orchestrator/scripts/lib/hashchain.mjs"
    );
    const actual = await hashTree(path.join(ws.root, ".claude", "skills"));
    assert.equal(lock.install.sha256, actual);
  } finally {
    await ws.cleanup();
  }
});

test("홈 세 경로에 아무것도 쓰지 않는다", async () => {
  const ws = await makeWorkspace();
  const home = homedir();
  const before = {};
  for (const rel of [".claude/skills", ".agents/skills", ".codex/skills"]) {
    before[rel] = (await readdir(path.join(home, rel)).catch(() => [])).sort();
  }
  try {
    run(["--apply", "--install-mode", "copy"], { workspace: ws.root });
    for (const rel of Object.keys(before)) {
      const after = (await readdir(path.join(home, rel)).catch(() => [])).sort();
      assert.deepEqual(after, before[rel], `${rel} 이 바뀌었다`);
    }
  } finally {
    await ws.cleanup();
  }
});

test("model_face 가 없으면 --apply 가 거부한다", async () => {
  const withoutFace = { ...ANSWERS };
  delete withoutFace.model_face;
  const ws = await makeWorkspace({ answers: withoutFace });
  try {
    const { code, out } = run(["--apply"], { workspace: ws.root });
    assert.equal(code, 1);
    assert.match(out, /MODEL_FACE_MISSING/);
    assert.ok(!(await exists(path.join(ws.root, "work", "env.lock.json"))));
  } finally {
    await ws.cleanup();
  }
});

test("코드에 model_face 기본값 리터럴이 없다", async () => {
  const candidates = ["none", "crop-below-chin", "allow"];
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "tests") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.name.endsWith(".mjs")) continue;
      const text = await readFile(full, "utf8");
      // model_face 에 값을 대입하거나 ?? 로 기본값을 주는 곳이 있으면 안 된다.
      for (const value of candidates) {
        if (new RegExp(`model_face[^\\n]{0,40}["'\`]${value}["'\`]`).test(text)) {
          offenders.push(`${path.relative(SKILLS_ROOT, full)} (${value})`);
        }
      }
    }
  };
  await walk(SKILLS_ROOT);
  assert.deepEqual(offenders, []);
});

test("스킬 트리에 호스트 스킬 의존 개념이 남아 있지 않다", async () => {
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "tests") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(mjs|json|md)$/.test(entry.name)) continue;
      if ((await readFile(full, "utf8")).includes("host_skills")) {
        offenders.push(path.relative(SKILLS_ROOT, full));
      }
    }
  };
  await walk(SKILLS_ROOT);
  assert.deepEqual(offenders, []);
});

test("프로젝트 루트 기본값이 워크스페이스 안이다", async () => {
  const ws = await makeWorkspace();
  try {
    run(["--apply", "--install-mode", "copy"], { workspace: ws.root });
    const lock = JSON.parse(await readFile(path.join(ws.root, "work", "env.lock.json"), "utf8"));
    const resolved = path.resolve(ws.root, lock.policy.project_root);
    assert.ok(
      resolved.startsWith(path.resolve(ws.root)),
      `프로젝트 루트가 워크스페이스 밖이다: ${resolved}`,
    );
  } finally {
    await ws.cleanup();
  }
});

test("연결이 실패하면 복사로 폴백하고 모드를 기록한다", async () => {
  const ws = await makeWorkspace();
  try {
    const { installSkills } = await import("../lib/install.mjs");
    const result = await installSkills({
      workspace: ws.root,
      source: path.join(ws.root, ".skill-src", "skills"),
      hosts: ["claude-code"],
      mode: "auto",
      linker: async () => {
        throw new Error("연결 불가");
      },
    });
    assert.equal(result.mode, "copy");
    assert.ok(await exists(path.join(ws.root, ".claude", "skills", "detail-page-orchestrator", "SKILL.md")));
  } finally {
    await ws.cleanup();
  }
});

test("--prune 은 기본 dry-run 이고 목록만 출력한다", async () => {
  const ws = await makeWorkspace();
  try {
    run(["--apply", "--install-mode", "copy"], { workspace: ws.root });
    await mkdir(path.join(ws.root, "work"), { recursive: true });
    await writeFile(path.join(ws.root, "work", "build-all.mjs"), "// 우회 경로\n", "utf8");

    const { code, out } = run(["--prune"], { workspace: ws.root });
    assert.equal(code, 0, out);
    assert.match(out, /dry-run/);
    assert.match(out, /build-all\.mjs/);
    assert.ok(await exists(path.join(ws.root, "work", "build-all.mjs")), "dry-run 이 파일을 옮겼다");
    assert.ok(!(await exists(path.join(ws.root, ".trash"))));
  } finally {
    await ws.cleanup();
  }
});

test("--prune --apply 는 삭제가 아니라 .trash 로 옮긴다", async () => {
  const ws = await makeWorkspace();
  try {
    run(["--apply", "--install-mode", "copy"], { workspace: ws.root });
    await writeFile(path.join(ws.root, "work", "build-page.mjs"), "// 우회 경로\n", "utf8");

    const { code, out } = run(["--prune", "--apply"], { workspace: ws.root });
    assert.equal(code, 0, out);
    assert.ok(!(await exists(path.join(ws.root, "work", "build-page.mjs"))));

    const stamps = await readdir(path.join(ws.root, ".trash"));
    assert.equal(stamps.length, 1);
    assert.ok(
      await exists(path.join(ws.root, ".trash", stamps[0], "work", "build-page.mjs")),
      "옮긴 파일이 .trash 에 원래 경로 구조로 없다",
    );

    const lock = JSON.parse(await readFile(path.join(ws.root, "work", "env.lock.json"), "utf8"));
    assert.equal(lock.pruned.entries, 1);
    assert.match(lock.pruned.trash, /\.trash/);
  } finally {
    await ws.cleanup();
  }
});

test("워크스페이스 work/ 의 모르는 잔여물도 정리 목록에 올린다", async () => {
  // "필요한 것만 둔다" 는 아는 패턴만 치우는 것이 아니다. work/ 는 env.* 만 있어야 한다.
  const ws = await makeWorkspace();
  try {
    run(["--apply", "--install-mode", "copy"], { workspace: ws.root });
    await mkdir(path.join(ws.root, "work", "cpg-slices"), { recursive: true });
    await writeFile(path.join(ws.root, "work", "studio.log"), "log\n", "utf8");
    await writeFile(path.join(ws.root, "work", "run-stills.sh"), "#!/bin/sh\n", "utf8");

    const { out } = run(["--prune"], { workspace: ws.root });
    assert.match(out, /cpg-slices/);
    assert.match(out, /studio\.log/);
    assert.match(out, /run-stills\.sh/);
    // env.* 는 보호 대상이므로 목록에 없어야 한다.
    assert.doesNotMatch(out, /env\.lock\.json/);
    assert.doesNotMatch(out, /env\.answers\.json/);
  } finally {
    await ws.cleanup();
  }
});

test("오케스트레이터의 상태 파일은 정리 대상이 아니다", async () => {
  // active.json 을 옮기면 프로젝트가 둘 이상일 때 AMBIGUOUS_PROJECT 로 회차가 막힌다.
  // gates.history.json 은 완화 판단의 유일한 근거다. 둘 다 work/ 에 남는다.
  const ws = await makeWorkspace();
  try {
    run(["--apply", "--install-mode", "copy"], { workspace: ws.root });
    await writeFile(
      path.join(ws.root, "work", "active.json"),
      '{"project":"테스트-1"}\n',
      "utf8",
    );
    await writeFile(
      path.join(ws.root, "work", "gates.history.json"),
      '{"schema_version":"1.0","runs":[]}\n',
      "utf8",
    );

    const { out } = run(["--prune"], { workspace: ws.root });
    assert.doesNotMatch(out, /active\.json/);
    assert.doesNotMatch(out, /gates\.history\.json/);

    run(["--prune", "--apply"], { workspace: ws.root });
    for (const kept of ["active.json", "gates.history.json"]) {
      assert.ok(
        await exists(path.join(ws.root, "work", kept)),
        `오케스트레이터 상태 파일이 없어졌다: ${kept}`,
      );
    }
  } finally {
    await ws.cleanup();
  }
});

test("보호 목록은 정리 대상에서 제외된다", async () => {
  const ws = await makeWorkspace();
  try {
    run(["--apply", "--install-mode", "copy"], { workspace: ws.root });
    await mkdir(path.join(ws.root, "docs"), { recursive: true });
    await writeFile(path.join(ws.root, "docs", "PRD.md"), "# PRD\n", "utf8");
    await mkdir(path.join(ws.root, "data"), { recursive: true });
    await writeFile(path.join(ws.root, "data", "photo.jpg"), "x", "utf8");
    const output = path.join(ws.root, "projects", "옛-1", "output");
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "detail-page.html"), "<html>", "utf8");

    run(["--prune", "--apply"], { workspace: ws.root });

    for (const kept of [
      path.join("docs", "PRD.md"),
      path.join("data", "photo.jpg"),
      path.join("projects", "옛-1", "output", "detail-page.html"),
      path.join(".skill-src", "skills", "detail-page-orchestrator", "SKILL.md"),
      path.join("work", "env.lock.json"),
    ]) {
      assert.ok(await exists(path.join(ws.root, kept)), `보호 대상이 없어졌다: ${kept}`);
    }
  } finally {
    await ws.cleanup();
  }
});

test("폰트를 워크스페이스 안으로 들여온다", async () => {
  // R8. 호스트 경로를 그대로 기록하면 다른 기계에서 죽는다.
  const ws = await makeWorkspace();
  // 워크스페이스 **밖**에 둔다. 안에 두면 "이미 안에 있음" 분기를 타서 검사가 무의미해진다.
  const outside = await mkdtemp(path.join(tmpdir(), "dp-font-"));
  const fake = path.join(outside, "outside-font.ttf");
  await writeFile(fake, "0".repeat(64), "utf8");
  try {
    const { vendorFont } = await import("../lib/vendor.mjs");
    const recorded = await vendorFont({ workspace: ws.root, candidates: [fake] });
    assert.ok(recorded, "폰트를 기록하지 못했다");
    assert.ok(!path.isAbsolute(recorded), `절대 경로가 기록됐다: ${recorded}`);
    assert.ok(recorded.startsWith("runtime/fonts/"), `runtime/fonts 밖이다: ${recorded}`);
    assert.ok(await exists(path.join(ws.root, recorded)), "복사된 폰트가 없다");
  } finally {
    await rm(outside, { recursive: true, force: true });
    await ws.cleanup();
  }
});

test("env.lock.json 에 hyperframes 가 프로젝트-로컬로 기록된다", async () => {
  const ws = await makeWorkspace();
  try {
    run(["--apply", "--install-mode", "copy"], { workspace: ws.root });
    const lock = JSON.parse(await readFile(path.join(ws.root, "work", "env.lock.json"), "utf8"));
    assert.equal(lock.runtimes.hyperframes.mode, "project-local");
    // 경로는 워크스페이스 상대여야 한다. 절대 경로를 기록하면 다른 기계에서 죽는다.
    assert.ok(
      !path.isAbsolute(lock.runtimes.hyperframes.path),
      `절대 경로가 기록됐다: ${lock.runtimes.hyperframes.path}`,
    );
    assert.ok(
      path.resolve(ws.root, lock.runtimes.hyperframes.path).startsWith(path.resolve(ws.root)),
      "hyperframes 경로가 워크스페이스 밖이다",
    );
  } finally {
    await ws.cleanup();
  }
});
