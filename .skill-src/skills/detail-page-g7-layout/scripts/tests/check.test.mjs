// G7 판정 단위 테스트.
//
// 2회차 결함: 목업에서 4건이 이탈했는데 이유가 없었고, 수단이 전부 SVG/CSS 라
// 목업의 이펙트를 통째로 버렸다. 둘 다 "결과물은 있다" 로 통과하던 것들이다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const PAGE = path.join("work", "page-plan.md");
const PLAN = "flow-plan.json";
const HARVEST = path.join("work", "design-ref", "harvest.md");
const IDS = ["hero", "problem", "solution"];

const GOOD_PAGE = `# page-plan

harvest.md 의 수확 계획을 따른다.

## hero
수단: crop, css
- 목업 배경을 크롭해 깔고 제목을 얹는다

## problem
수단: svg
- 아이콘 세 개

## solution
수단: html
- 카드 3열

## 용어 집합
- 팔토시
- 통기성
- 신축성
`;

const GOOD_HARVEST = "# harvest\n\n## 가져올 것\n- 배경은 크롭해서 쓴다\n\n## 수확 금지\n- 한글 텍스트\n";

async function bed({ page = GOOD_PAGE, harvest = GOOD_HARVEST, sections = IDS } = {}) {
  const b = await makeCheckbed();
  if (page !== null) await b.write(PAGE, page);
  await b.write(PLAN, { sections: sections.map((id) => ({ id })) });
  if (harvest !== null) await b.write(HARVEST, harvest);
  return b;
}

test("전부 갖추면 통과한다", async () => {
  const b = await bed();
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("page-plan.md 이 없으면 그 사유 하나만 낸다", async () => {
  const b = await bed({ page: null });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /page-plan\.md 이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("섹션 수가 플랜과 다르면 양쪽 수를 함께 낸다", async () => {
  const b = await bed({ sections: [...IDS, "proof"] });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /플랜 4 · page-plan 3/);
  } finally {
    await b.cleanup();
  }
});

test("용어 집합은 섹션으로 세지 않는다", async () => {
  // `## 용어 집합` 을 섹션으로 세면 섹션 수가 언제나 하나 많아진다.
  const b = await bed();
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("harvest.md 를 참조하지 않으면 거부한다", async () => {
  const b = await bed({ page: GOOD_PAGE.replace("harvest.md 의 수확 계획을 따른다.", "") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /harvest\.md 를 참조하지 않는다/);
  } finally {
    await b.cleanup();
  }
});

test("용어 집합이 비면 거부한다 — G8 자막이 이 집합을 따른다", async () => {
  const b = await bed({ page: GOOD_PAGE.replace(/- 팔토시\n- 통기성\n- 신축성\n/, "") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /`## 용어 집합` 이 비어 있다/);
  } finally {
    await b.cleanup();
  }
});

test("수단이 없는 섹션을 지목한다", async () => {
  const b = await bed({ page: GOOD_PAGE.replace("수단: svg\n", "") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /섹션 problem 에 `수단:` 이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("모르는 수단을 거부한다", async () => {
  const b = await bed({ page: GOOD_PAGE.replace("수단: html", "수단: photoshop") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /섹션 solution 의 모르는 수단: photoshop/);
  } finally {
    await b.cleanup();
  }
});

test("이탈이라고 적고 이유가 없으면 거부한다", async () => {
  const b = await bed({
    page: GOOD_PAGE.replace("- 아이콘 세 개", "- 목업에서 이탈한다"),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /섹션 problem 이 목업에서 이탈하는데 `이탈 이유:` 가 없다/);
  } finally {
    await b.cleanup();
  }
});

test("이탈 이유를 적으면 거부하지 않는다", async () => {
  const b = await bed({
    page: GOOD_PAGE.replace(
      "- 아이콘 세 개",
      "- 목업에서 이탈한다\n- 이탈 이유: 목업 아이콘이 저해상도라 SVG 로 다시 그린다",
    ),
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("수단이 전부 svg/css 면 이유를 요구한다 — 목업의 강점을 버리는 선택이다", async () => {
  const page = GOOD_PAGE.replace("수단: crop, css", "수단: css").replace("수단: html", "수단: svg");
  const b = await bed({ page, harvest: "# harvest\n\n## 수확 금지\n- 한글 텍스트\n" });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /`전부 SVG 이유:` 를 적는다/);
  } finally {
    await b.cleanup();
  }
});

test("harvest 가 크롭을 계획했는데 crop 수단이 없으면 거부한다", async () => {
  const b = await bed({ page: GOOD_PAGE.replace("수단: crop, css", "수단: html") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /크롭을 계획했는데 page-plan 에 crop 수단이 없다/);
  } finally {
    await b.cleanup();
  }
});

// 위 검사는 harvest 의 `크롭` 이라는 **낱말**만 본다. "크롭한다" 와 "크롭하지 않는다" 를
// 가리지 못하므로, 목업 사진에 오류가 있어 크롭을 접은 판까지 막는다.
// 접었으면 접은 이유를 적게 한다 — `이탈 이유:` 와 같은 형태다.

test("크롭하지 않기로 했으면 `crop 없음 이유:` 로 통과한다", async () => {
  const page = GOOD_PAGE.replace(
    "harvest.md 의 수확 계획을 따른다.",
    "harvest.md 의 수확 계획을 따른다.\n\ncrop 없음 이유: 목업 사진에 제품 identity 오류가 구워져 있어 크롭 발행하지 않는다",
  ).replace("수단: crop, css", "수단: generate, css");
  const b = await bed({ page });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("`crop 없음 이유:` 뒤가 비면 거부한다 — 낱말만 적고 넘어가는 것을 막는다", async () => {
  const page = GOOD_PAGE.replace(
    "harvest.md 의 수확 계획을 따른다.",
    "harvest.md 의 수확 계획을 따른다.\n\ncrop 없음 이유:",
  ).replace("수단: crop, css", "수단: generate, css");
  const b = await bed({ page });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /크롭을 계획했는데 page-plan 에 crop 수단이 없다/);
  } finally {
    await b.cleanup();
  }
});
