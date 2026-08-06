// G8 색인. check.mjs 와 같은 판정을 스크립트가 먼저 해야 한다 —
// 게이트에서만 잡히면 무엇을 고칠지 모르는 채로 되돌아온다.

import assert from "node:assert/strict";
import test from "node:test";

import {
  METHOD_CAP,
  buildEntry,
  methodOverflow,
  missingKeywords,
  straySubtitles,
} from "../lib/comps.mjs";

const entry = buildEntry({
  brief: "gf-01",
  meta: { method: "svg", subtitles: ["손등"] },
  comp: "work/comps/gf-01/scene.json",
  gif: "output/media/gifs/gf-01.gif",
});

test("색인 항목에 brief·method·자막·스틸·경로가 다 있다", () => {
  assert.deepEqual(entry, {
    brief: "gf-01",
    method: "svg",
    subtitles: ["손등"],
    source_still: null,
    frames: 0,
    comp: "work/comps/gf-01/scene.json",
    gif: "output/media/gifs/gf-01.gif",
  });
});

test("입력 스틸을 색인에 남긴다 — 이 값이 비면 도형에서 시작했다는 뜻이다", () => {
  const withStill = buildEntry({
    brief: "gf-03",
    meta: { method: "still-motion" },
    comp: "a",
    gif: "b",
    sourceStill: "cut-07",
    frames: 12,
  });
  assert.equal(withStill.source_still, "cut-07");
  assert.equal(withStill.frames, 12);
});

test("meta 가 없으면 method 를 null 로 남긴다 — 없는 채로 통과시키지 않는다", () => {
  const bare = buildEntry({ brief: "gf-02", comp: "a", gif: "b" });
  assert.equal(bare.method, null);
  assert.deepEqual(bare.subtitles, []);
});

test("한 수단이 8개를 넘으면 잡는다", () => {
  assert.equal(METHOD_CAP, 8);
  const many = Array.from({ length: 9 }, (_, i) =>
    buildEntry({ brief: `g-${i}`, meta: { method: "css" } }),
  );
  assert.deepEqual(methodOverflow(many), ["css 9개"]);
  assert.deepEqual(methodOverflow(many.slice(0, 8)), []);
});

test("brief 핵심 명사가 컴포지션에 없으면 잡는다", () => {
  assert.deepEqual(missingKeywords(entry, { keywords: ["손등", "신축"] }), ["신축"]);
  assert.deepEqual(missingKeywords(entry, { keywords: ["손등"] }), []);
});

test("자막이 용어 집합 밖이면 잡는다", () => {
  assert.deepEqual(straySubtitles(entry, ["팔뚝"]), ["손등"]);
  assert.deepEqual(straySubtitles(entry, ["손등", "팔뚝"]), []);
});

test("용어 집합을 읽지 못하면 자막을 트집잡지 않는다", () => {
  // 용어 집합 부재는 별도 거부 사유다. 여기서 이중으로 세지 않는다.
  assert.deepEqual(straySubtitles(entry, []), []);
});
