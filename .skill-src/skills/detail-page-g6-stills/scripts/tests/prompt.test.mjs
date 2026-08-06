// 스틸 생성 작업의 조립.
//
// 1회차 결함 둘. 둘 다 여기서 났다.
//   1. `items[].references` 가 30개 전부 비어 있었다. 컷마다 따로 생성돼 같은 제품으로
//      보이지 않았다.
//   2. 프롬프트에 문자 금지 지시가 없었다. PUREHABIT, LeafShield 같은 없는 브랜드와
//      NON-TOXIC 배지가 이미지에 구워져 나왔고 30장 중 9장이 그 이유로 탈락했다.

import assert from "node:assert/strict";
import test from "node:test";

import { NO_TEXT_RULE, buildItems, regenItems } from "../lib/prompt.mjs";

const CUTS = [
  { id: "cut-01", prompt: "노란 시트가 가지에 걸려 있다" },
  { id: "cut-02", prompt: "점착면 매크로", references: ["input/photos/a.jpg"] },
];

test("모든 프롬프트에 문자·브랜드 금지가 붙는다", () => {
  for (const item of buildItems(CUTS, { face: "allow" })) {
    assert.ok(item.prompt.includes(NO_TEXT_RULE), `금지 규칙이 없다: ${item.prompt}`);
  }
});

test("기준 이미지가 있으면 모든 컷의 첫 레퍼런스가 된다", () => {
  const items = buildItems(CUTS, { face: "allow", base: "work/stills/base.png" });
  for (const item of items) {
    assert.equal(item.references[0], "work/stills/base.png");
  }
});

test("컷이 가진 레퍼런스는 기준 이미지 뒤에 붙는다", () => {
  const items = buildItems(CUTS, { face: "allow", base: "work/stills/base.png" });
  assert.deepEqual(items[1].references, ["work/stills/base.png", "input/photos/a.jpg"]);
});

test("기준 이미지가 없으면 references 를 만들지 않는다", () => {
  const items = buildItems([CUTS[0]], { face: "allow" });
  assert.ok(!("references" in items[0]), "빈 references 를 넣으면 tibo 가 편집 모드로 간다");
});

test("얼굴 정책이 프롬프트에 문자로 들어간다", () => {
  const items = buildItems(CUTS, { face: "crop-below-chin" });
  assert.ok(items[0].prompt.includes("crop-below-chin"));
});

test("기준 이미지 자신은 자기를 레퍼런스로 삼지 않는다", () => {
  const items = buildItems(CUTS, { face: "allow", base: "work/stills/cut-01.png", baseCut: "cut-01" });
  assert.ok(!("references" in items[0]), "기준 컷이 자기를 참조한다");
  assert.equal(items[1].references[0], "work/stills/cut-01.png");
});

test("탈락한 컷만 다시 굽는다", () => {
  const selection = {
    entries: [
      { cut: "cut-01", decision: "accept" },
      { cut: "cut-02", decision: "reject", regen_job: "매크로를 더 가깝게" },
    ],
  };
  const items = regenItems(CUTS, selection, { face: "allow" });
  assert.equal(items.length, 1);
  assert.ok(items[0].prompt.includes("매크로를 더 가깝게"));
  assert.ok(items[0].prompt.includes(NO_TEXT_RULE));
});

test("재생성 지시가 없는 탈락은 원래 프롬프트로 다시 굽는다", () => {
  const selection = { entries: [{ cut: "cut-02", decision: "reject" }] };
  const items = regenItems(CUTS, selection, { face: "allow" });
  assert.equal(items.length, 1);
  assert.ok(items[0].prompt.includes("점착면 매크로"));
});

test("채택만 있으면 다시 구울 것이 없다", () => {
  const selection = { entries: [{ cut: "cut-01", decision: "accept" }] };
  assert.deepEqual(regenItems(CUTS, selection, { face: "allow" }), []);
});
