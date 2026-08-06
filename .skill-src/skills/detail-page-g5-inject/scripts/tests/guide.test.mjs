// 가이드 읽기 단위 테스트.
//
// run.mjs 와 check.mjs 가 같은 정의를 쓰므로 여기서 틀리면 두 쪽이 함께 틀린다.
// 그리고 함께 틀리면 **검사가 통과하면서 산출물이 오염된다** — 5회차에 실제로 그랬다.

import assert from "node:assert/strict";
import test from "node:test";

import { moodBlock, parseBackground } from "../lib/guide.mjs";

test("배경 키워드는 첫 줄에서만 뽑는다 — 설명 문단의 활용형이 섞이지 않는다", () => {
  // 가이드는 `## 배경` 첫 줄을 키워드 줄로 쓰고 아래에 설명을 단다. 절 전체를 훑으면
  // `줄이다`·`못하므로` 같은 조각이 발행 플랜의 mood 로 실려 G6 까지 흘러간다.
  const block = [
    "초록 · 잎사귀 · 온실 · 자연광",
    "",
    "**첫 줄이 키워드 줄이다.** 뽑기는 조사를 떼지 못하므로 설명 문장이 먼저 오면",
    "`잎사귀가`·`온실과` 같은 활용형이 프롬프트에 박힌다.",
  ].join("\n");

  assert.deepEqual(parseBackground(block), ["초록", "잎사귀", "온실", "자연광"]);
});

test("키워드 줄 앞의 빈 줄을 건너뛴다", () => {
  assert.deepEqual(parseBackground("\n\n초록 · 온실 · 자연광\n"), ["초록", "온실", "자연광"]);
});

test("키워드 줄이 없으면 빈 목록이다 — readGuide 가 가이드를 탓하게 둔다", () => {
  assert.deepEqual(parseBackground("- bullet\n"), []);
  assert.deepEqual(parseBackground(""), []);
  assert.deepEqual(parseBackground(null), []);
});

test("무드 블록은 개행으로 시작한다 — 프롬프트 마지막 문장과 붙지 않는다", () => {
  const guide = { palette: { brand: "#F3CC0C" }, background: ["초록", "온실"] };
  const block = moodBlock(guide, { id: "c01" });

  assert.equal(block.startsWith("\n"), true, `블록이 개행으로 시작하지 않는다: ${JSON.stringify(block)}`);
  assert.equal(
    `...natural daylight.${block}`.includes("daylight.배경"),
    false,
    "원문 마침표와 무드 첫 낱말이 한 낱말로 붙었다",
  );
});

test("no_product 컷에는 제품 금지 줄이 붙는다", () => {
  const guide = { palette: { brand: "#F3CC0C" }, background: ["초록"] };

  assert.match(moodBlock(guide, { id: "c04", no_product: true }), /제품을 넣지 않는다\./);
  assert.doesNotMatch(moodBlock(guide, { id: "c01" }), /제품을 넣지 않는다\./);
});
