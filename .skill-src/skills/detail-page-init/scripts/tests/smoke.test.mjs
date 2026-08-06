// 세팅 때 이미지 생성이 실제로 되는지 본다.
//
// 인증 파일이 있는 것과 이미지가 나오는 것은 다른 일이다. 1회차 init 은 앞의 것만 봤고,
// 뒤의 것은 G6 에서 컷 30장을 요청하고 나서야 알 수 있었다.

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { smokeGodTibo, smokeJob } from "../lib/smoke.mjs";

const bed = async () => mkdtemp(path.join(tmpdir(), "dp-smoke-"));

test("작업은 한 장만 만들고 문자를 금지한다", () => {
  const job = smokeJob("/out");
  assert.equal(job.items.length, 1);
  assert.equal(job.workers, 1);
  assert.equal(job.size_mode, "controllable");
  assert.match(job.items[0].prompt, /No text/i);
});

test("이미지가 나오면 통과한다", async () => {
  const dir = await bed();
  try {
    const result = await smokeGodTibo({
      tiboRoot: "/tibo",
      workspace: dir,
      run: async (_script, _args, _cwd, outputDir) => {
        const file = path.join(outputDir, "frame-000.png");
        await writeFile(file, "PNG 자리\n");
        await writeFile(
          path.join(outputDir, "manifest.json"),
          JSON.stringify({ images: [{ path: file }] }),
        );
      },
    });
    assert.equal(result.ok, true, result.detail);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("생성기가 실패하면 이유를 남긴다", async () => {
  const dir = await bed();
  try {
    const result = await smokeGodTibo({
      tiboRoot: "/tibo",
      workspace: dir,
      run: async () => {
        throw new Error("TIBO_FAILED 종료 코드 1");
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.detail, /종료 코드 1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manifest 는 있는데 파일이 없으면 실패로 본다", async () => {
  const dir = await bed();
  try {
    const result = await smokeGodTibo({
      tiboRoot: "/tibo",
      workspace: dir,
      run: async (_s, _a, _c, outputDir) => {
        await writeFile(
          path.join(outputDir, "manifest.json"),
          JSON.stringify({ images: [{ path: path.join(outputDir, "없는파일.png") }] }),
        );
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.detail, /이미지 파일/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("0바이트 이미지는 통과시키지 않는다", async () => {
  const dir = await bed();
  try {
    const result = await smokeGodTibo({
      tiboRoot: "/tibo",
      workspace: dir,
      run: async (_s, _a, _c, outputDir) => {
        const file = path.join(outputDir, "frame-000.png");
        await writeFile(file, "");
        await writeFile(
          path.join(outputDir, "manifest.json"),
          JSON.stringify({ images: [{ path: file }] }),
        );
      },
    });
    assert.equal(result.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("작업 파일을 워크스페이스에 남긴다 — 실패를 손으로 재현할 수 있어야 한다", async () => {
  const dir = await bed();
  try {
    await smokeGodTibo({
      tiboRoot: "/tibo",
      workspace: dir,
      run: async () => {
        throw new Error("아무거나");
      },
    });
    const raw = await readFile(path.join(dir, "work", "smoke", "job.json"), "utf8");
    assert.equal(JSON.parse(raw).items.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
