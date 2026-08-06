// 후보 파일 찾기 — 생성이 쓴 이름과 발행이 찾는 이름이 갈렸다.
//
// 3회차 실사용에서 12개 컷이 전부 `FFMPEG_FAILED` 로 떨어졌다. ffmpeg 문제가 아니라
// 없는 파일을 넘긴 것이었다. 생성기는 `frame-000.png` 로 쓰고 발행은 `cut-01.png` 를
// 찾았다. 판정 기록이 이미 실제 경로를 들고 있으므로 그것을 먼저 믿는다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { stillSource } from "../lib/source.mjs";

const STAGE = path.join("work", "stills");

test("판정에 적힌 파일 경로를 쓴다", () => {
  const src = stillSource({ cut: "cut-01", file: "work/stills/frame-000.png" }, STAGE);
  assert.equal(src, path.join("work", "stills", "frame-000.png"));
});

test("파일 경로가 없으면 컷 id 로 되돌아간다", () => {
  const src = stillSource({ cut: "cut-01" }, STAGE);
  assert.equal(src, path.join(STAGE, "cut-01.png"));
});

test("회차 밖을 가리키는 경로는 받지 않는다", () => {
  // 판정 파일은 사람이 쓴다. 상위로 빠져나가는 경로를 그대로 열면 회차 밖 파일이 발행된다.
  for (const bad of ["../../../etc/passwd", "C:\\Windows\\win.ini", "/etc/passwd"]) {
    assert.throws(() => stillSource({ cut: "cut-01", file: bad }, STAGE), /STILL_SOURCE_OUTSIDE/);
  }
});
