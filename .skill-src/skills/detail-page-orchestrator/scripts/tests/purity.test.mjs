// 스킬 순수성 — 스킬 트리에 특정 프로젝트의 것이 들어오지 못하게 막는다.
//
// 한 번 걷어내는 것으로는 안 된다. 2회차 잔여물(.pyc 안의 절대 경로)이 실제로 들어와
// 있었고, 커밋 직전에야 발견했다. 그래서 검사로 고정한다.
//
// 회차에 필요한 것은 전부 `projects/<이름>/` 아래에 모인다. 스킬은 그 밖에 쓰지 않는다.

import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { SKILLS_ROOT } from "./fixture.mjs";

/** 번들 의존 스킬은 남의 코드다. 우리가 쓴 것만 본다. */
const OURS = /^detail-page-/;

async function ourFiles(extensions = /\.(mjs|md|json|py|sh)$/) {
  const found = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".agents") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (extensions.test(entry.name)) found.push(full);
    }
  };
  for (const name of await readdir(SKILLS_ROOT)) {
    if (!OURS.test(name)) continue;
    if (!(await stat(path.join(SKILLS_ROOT, name))).isDirectory()) continue;
    await walk(path.join(SKILLS_ROOT, name));
  }
  return found;
}

test("사용자 절대 경로가 없다", async () => {
  const offenders = [];
  for (const file of await ourFiles()) {
    const raw = await readFile(file, "utf8");
    // 문서의 설명용 예시는 허용하지 않는다. 예시도 다른 기계에서 오해를 만든다.
    if (/[A-Z]:\\Users\\|\/(?:c|mnt\/c)\/Users\/|\/home\/[a-z]/i.test(raw)) {
      offenders.push(path.relative(SKILLS_ROOT, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test("파이썬 바이트코드가 없다", async () => {
  const found = await ourFiles(/\.pyc$/);
  assert.deepEqual(
    found.map((f) => path.relative(SKILLS_ROOT, f)),
    [],
    ".pyc 에는 컴파일 시점의 절대 경로가 박혀 있다",
  );
});

test("생성물이 스킬 안에 없다", async () => {
  // 이미지·GIF·HTML 산출물은 프로젝트 아래에만 있어야 한다.
  const found = await ourFiles(/\.(png|jpe?g|webp|gif|mp4)$/);
  assert.deepEqual(
    found.map((f) => path.relative(SKILLS_ROOT, f)),
    [],
    "발행물은 projects/<이름>/output/ 아래에만 둔다",
  );
});

test("run.mjs 의 체크리스트가 SKILL.md 와 갈리지 않는다", async () => {
  // 같은 목록이 두 곳에 있으면 갈린다. 실제로 갈렸다 — SKILL.md 만 고쳤더니 런타임에
  // 뜨는 문구는 옛것이었고, 에이전트가 읽는 것은 run.mjs 쪽이다.
  // 최상위 `- ` 항목만 본다. 들여쓴 하위 항목은 설명이다.
  const drifted = [];
  for (const name of (await readdir(SKILLS_ROOT)).filter((n) => /^detail-page-g\d/.test(n))) {
    const doc = await readFile(path.join(SKILLS_ROOT, name, "SKILL.md"), "utf8");
    const runner = await readFile(path.join(SKILLS_ROOT, name, "scripts", "run.mjs"), "utf8");

    const section = doc.split(/^## 해야 하는 것$/m)[1]?.split(/^## /m)[0] ?? "";
    const documented = [...section.matchAll(/^- (.+)$/gm)].map((m) => m[1].trim());

    // 체크리스트가 없는 게이트는 스크립트가 직접 산출물을 쓴다. 대조할 목록이 없다.
    if (!/checklist\(/.test(runner)) continue;

    const items = runner.split(/items:\s*\[/)[1]?.split(/^\s*\],$/m)[0] ?? "";
    const printed = [...items.matchAll(/^\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) =>
      m[1].replace(/\\"/g, '"').trim(),
    );

    if (documented.length === 0 || printed.length === 0) {
      drifted.push(`${name}: 목록을 읽지 못했다 (문서 ${documented.length} · 런타임 ${printed.length})`);
      continue;
    }
    for (const [index, expected] of documented.entries()) {
      if (printed[index] !== expected) {
        drifted.push(`${name}[${index}]\n    SKILL.md: ${expected}\n    run.mjs : ${printed[index] ?? "(없음)"}`);
      }
    }
  }
  assert.deepEqual(drifted, []);
});

test("run.mjs 가 읽으라는 문서가 실제로 있다", async () => {
  // 없는 파일을 읽으라고 하면 에이전트는 조용히 건너뛰거나 내용을 지어낸다.
  // 셋이 끊겨 있었다 — 내용이 없어서가 아니라 다른 스킬에 있는 것을 제 폴더로 가리켰다.
  const dangling = [];
  for (const name of (await readdir(SKILLS_ROOT)).filter((n) => /^detail-page-g\d/.test(n))) {
    const dir = path.join(SKILLS_ROOT, name);
    const runner = await readFile(path.join(dir, "scripts", "run.mjs"), "utf8");
    const block = runner.split(/reading:\s*\[/)[1]?.split(/^\s*\],$/m)[0] ?? "";
    for (const [, rel] of block.matchAll(/"([^"]+)"/g)) {
      // `work/…` 는 회차 중에 만들어지는 산출물이다. 스킬 트리에 있을 리 없다.
      if (!/^(\.\.\/)?[\w.-]*\/?references\//.test(rel)) continue;
      try {
        await stat(path.join(dir, rel));
      } catch {
        dangling.push(`${name} → ${rel}`);
      }
    }
  }
  assert.deepEqual(dangling, []);
});

test("게이트 산출물 경로가 전부 프로젝트 아래이거나 명시적으로 워크스페이스다", async () => {
  const { GATES } = await import("../lib/gates.mjs");
  const strays = [];
  for (const g of GATES) {
    for (const spec of [...g.inputs, ...g.outputs]) {
      if (spec.startsWith("ws:")) continue; // 환경 잠금만 워크스페이스다
      if (path.isAbsolute(spec) || spec.startsWith("..")) strays.push(`${g.id} ${spec}`);
    }
  }
  assert.deepEqual(strays, []);
});

test("워크스페이스에 쓰는 게이트 산출물은 환경 잠금 하나뿐이다", async () => {
  // 회차 산출물이 워크스페이스로 새면 다음 회차와 섞이고 재현이 깨진다.
  const { GATES } = await import("../lib/gates.mjs");
  const workspaceOutputs = GATES.flatMap((g) =>
    g.outputs.filter((spec) => spec.startsWith("ws:")).map((spec) => `${g.id} ${spec}`),
  );
  assert.deepEqual(workspaceOutputs, ["INIT ws:work/env.lock.json"]);
});
