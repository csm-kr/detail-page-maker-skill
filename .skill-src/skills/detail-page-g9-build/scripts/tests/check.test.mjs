// G9 판정 단위 테스트.
//
// 2회차 결함: 화면 문자열 약 100개가 빌더 안에 박혀 있었고, 앵커 좌표를 붙인 이미지가
// 재생성돼도 아무도 몰랐다. HTML 은 정상으로 보였다 — 그래서 **플랜과 대조**하고
// **앵커 이미지 해시**를 본다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import { hashFile } from "../../../detail-page-orchestrator/scripts/lib/hashchain.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const HTML = path.join("output", "detail-page.html");
const PLAN = "flow-plan.json";
const ANCHORS = path.join("work", "anchors.json");
const HERO = path.join("output", "media", "images", "hero.webp");

const COPY = ["팔토시 한 줄", "통기성 좋다", "치수 안내", "보조 설명"];

const GOOD_HTML = `<style>
:root { --brand: #3189FD; --ink: #1A1A1A; }
.infocard { color: var(--ink); max-width: 780px; }
</style>
<div class="infocard">${COPY[0]}</div>
<div class="callout">${COPY[1]}</div>
<div class="spec">${COPY[2]}</div>
<div class="chip">신축</div>
<div class="dim">${COPY[3]}</div>
<div class="trace">근거</div>
<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>
`;

async function bed({ html = GOOD_HTML, anchors = true, plan } = {}) {
  const b = await makeCheckbed();
  if (html !== null) await b.write(HTML, html);
  await b.write(
    PLAN,
    plan ?? { sections: COPY.map((headline, i) => ({ id: `s${i}`, headline })) },
  );
  const hero = await b.write(HERO, "WEBP 자리\n");
  if (anchors) {
    await b.write(ANCHORS, { images: { [HERO.split(path.sep).join("/")]: await hashFile(hero) } });
  }
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

test("HTML 이 없으면 그 사유 하나만 낸다", async () => {
  const b = await bed({ html: null });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /detail-page\.html 이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("플랜에 없는 한글이 화면에 있으면 그 문자열을 지목한다", async () => {
  const b = await bed({
    html: GOOD_HTML.replace("<div class=\"trace\">근거</div>", '<div class="trace">무료 배송 안내</div>'),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /플랜 밖의 문자열이 1건 있다: 무료 배송 안내/);
  } finally {
    await b.cleanup();
  }
});

test("주석과 script 안의 한글은 화면 문자열로 세지 않는다", async () => {
  const b = await bed({
    html: `${GOOD_HTML}<!-- 내부 메모: 여기 손대지 말 것 -->\n<script>const 설명 = "개발용 문자열";</script>\n`,
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("폭 780px 선언이 없으면 거부한다", async () => {
  const b = await bed({ html: GOOD_HTML.replace("max-width: 780px;", "") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /폭 780px 선언이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("자리표시자가 남아 있으면 거부한다", async () => {
  const b = await bed({ html: GOOD_HTML.replace("근거", "TODO") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /자리표시자가 남아 있다/);
  } finally {
    await b.cleanup();
  }
});

test(":root 밖에 hex 가 있으면 지목한다", async () => {
  const b = await bed({
    html: GOOD_HTML.replace(".infocard { color: var(--ink);", ".infocard { color: #FF00AA;"),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /:root 밖에 hex 가 있다: #FF00AA/);
  } finally {
    await b.cleanup();
  }
});

test("가이드 구성 요소가 빠지면 그 이름을 지목한다", async () => {
  const b = await bed({ html: GOOD_HTML.replace('class="chip"', 'class="tag"') });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /가이드 구성 요소가 HTML 에 없다: chip/);
  } finally {
    await b.cleanup();
  }
});

test("인라인 SVG 가 하나도 없으면 거부한다", async () => {
  const b = await bed({
    html: GOOD_HTML.replace(/<svg[\s\S]*?<\/svg>\n/, ""),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /인라인 SVG 가 하나도 없다/);
  } finally {
    await b.cleanup();
  }
});

test("anchors.json 이 없으면 거부한다", async () => {
  const b = await bed({ anchors: false });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /좌표를 붙인 이미지의 해시를 남긴다/);
  } finally {
    await b.cleanup();
  }
});

test("앵커 이미지가 재생성되면 거부한다 — 좌표가 조용히 깨진다", async () => {
  const b = await bed();
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
    await b.write(HERO, "다시 만든 WEBP\n");
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /앵커 이미지가 바뀌었다/);
  } finally {
    await b.cleanup();
  }
});
