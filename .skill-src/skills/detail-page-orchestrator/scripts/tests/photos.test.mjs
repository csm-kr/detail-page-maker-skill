// 사진 입력 경로 — 사진은 회차 폴더 안에서만 산다.
//
// 예전에는 워크스페이스의 `data/` 에 모아 두고 start 가 복사했다. 같은 사진이 두 벌이
// 되고, 시작한 뒤에 사진을 더 넣을 방법이 없었다. 이제 사진은
// `projects/<회차>/input/photos/` 한 곳에만 있고 `photos` 가 그것을 잠근다.
//
// 사진은 필수가 아니다. 계약은 "없으면 공급처 동일 SKU로 진행" 이다 — docs/GUIDE.md §3.

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { COUPANG_URL, SUPPLIER_URL, makeWorkspace, orchestrate } from "./fixture.mjs";

const START = [
  "start",
  "--name",
  "테스트",
  "--supplier-url",
  SUPPLIER_URL,
  "--coupang-url",
  COUPANG_URL,
];

async function projectOf(root) {
  const { resolveProject } = await import("../lib/project.mjs");
  return resolveProject(root);
}

async function inputsOf(root) {
  const project = await projectOf(root);
  return JSON.parse(await readFile(path.join(project, "work", "inputs.lock.json"), "utf8"));
}

test("사진 없이 시작할 수 있다", async () => {
  const ws = await makeWorkspace();
  try {
    const { code, out } = orchestrate(START, { workspace: ws.root });
    assert.equal(code, 0, out);
    assert.equal((await inputsOf(ws.root)).photos.count, 0);
  } finally {
    await ws.cleanup();
  }
});

test("워크스페이스 data/ 를 입력으로 읽지 않는다", async () => {
  // 회차 밖에 둔 사진을 참조하면 그 사진이 바뀌거나 사라졌을 때 회차를 재현할 수 없다.
  const ws = await makeWorkspace();
  try {
    await mkdir(path.join(ws.root, "data"), { recursive: true });
    await writeFile(path.join(ws.root, "data", "옛사진.jpg"), "사진 자리", "utf8");
    orchestrate(START, { workspace: ws.root });
    assert.equal((await inputsOf(ws.root)).photos.count, 0, "data/ 를 여전히 읽는다");
  } finally {
    await ws.cleanup();
  }
});

test("photos 가 시작한 뒤에 넣은 사진을 잠근다", async () => {
  const ws = await makeWorkspace();
  try {
    orchestrate(START, { workspace: ws.root });
    const project = await projectOf(ws.root);
    await writeFile(path.join(project, "input", "photos", "실물-1.jpg"), "사진 자리", "utf8");

    const { code, out } = orchestrate(["photos"], { workspace: ws.root });
    assert.equal(code, 0, out);

    const { photos } = await inputsOf(ws.root);
    assert.equal(photos.count, 1);
    assert.equal(photos.entries[0].file, "input/photos/실물-1.jpg");
    assert.match(photos.entries[0].sha256, /^sha256:/);
  } finally {
    await ws.cleanup();
  }
});

test("사진이 아닌 파일은 잠그지 않는다", async () => {
  const ws = await makeWorkspace();
  try {
    orchestrate(START, { workspace: ws.root });
    const project = await projectOf(ws.root);
    await writeFile(path.join(project, "input", "photos", "메모.txt"), "사진 아님", "utf8");
    orchestrate(["photos"], { workspace: ws.root });
    assert.equal((await inputsOf(ws.root)).photos.count, 0);
  } finally {
    await ws.cleanup();
  }
});
