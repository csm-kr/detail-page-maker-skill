// 판정 호출 단위 테스트.
//
// 5회차 G7 결함: 게이트 세션이 틀린 판정을 고쳤는데 부모가 **옛 판으로** 세 번 다 거부했다.
// 부모는 팩을 만들 때 이미 그 게이트의 check.mjs 를 import 했고, ESM 은 한 번 읽은 모듈을
// 프로세스가 끝날 때까지 캐시한다. 우회 플래그가 없는 설계라 "게이트를 고친다" 가 정상 경로인데,
// 고친 게이트가 같은 회차에서 영영 반영되지 않는 자리였다.

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadCheck } from "../lib/check.mjs";

const OLD = "export const check = async () => ({ reasons: ['옛 판'] });\n";
const NEW = "export const check = async () => ({ reasons: [] });\n";

async function bed() {
  const dir = await mkdtemp(path.join(tmpdir(), "dp-check-"));
  return { entry: path.join(dir, "check.mjs"), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("판정 모듈을 고치면 같은 프로세스에서도 새 판으로 판정한다", async () => {
  const b = await bed();
  try {
    await writeFile(b.entry, OLD, "utf8");
    const before = await loadCheck(b.entry);
    assert.deepEqual((await before.check({})).reasons, ["옛 판"]);

    // 게이트 세션이 틀린 게이트를 고친 자리다. 캐시를 그대로 쓰면 여기서 `옛 판` 이 나온다.
    await writeFile(b.entry, NEW, "utf8");
    const after = await loadCheck(b.entry);
    assert.deepEqual((await after.check({})).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("고치지 않은 모듈도 그대로 판정한다", async () => {
  const b = await bed();
  try {
    await writeFile(b.entry, OLD, "utf8");
    const first = await loadCheck(b.entry);
    const second = await loadCheck(b.entry);
    assert.deepEqual((await first.check({})).reasons, ["옛 판"]);
    assert.deepEqual((await second.check({})).reasons, ["옛 판"]);
  } finally {
    await b.cleanup();
  }
});
