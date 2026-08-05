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
