// G9 판정 단위 테스트.
//
// 2회차 결함: 화면 문자열 약 100개가 빌더 안에 박혀 있었고, 앵커 좌표를 붙인 이미지가
// 재생성돼도 아무도 몰랐다. HTML 은 정상으로 보였다 — 그래서 **플랜과 대조**하고
// **앵커 이미지 해시**를 본다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import { renderHtml } from "../lib/render.mjs";
import { hashFile } from "../../../detail-page-orchestrator/scripts/lib/hashchain.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const HTML = path.join("output", "detail-page.html");
const PLAN = "flow-plan.json";
const ANCHORS = path.join("work", "anchors.json");
const HERO = path.join("output", "media", "images", "hero.webp");

/**
 * 픽스처는 **조립기가 실제로 내는 HTML** 이다. 손으로 쓴 픽스처를 두지 않는다.
 *
 * 예전에는 여기 손으로 쓴 `<div>` 몇 개가 있었고, 조립기가 바뀌어도 이 테스트는
 * 계속 초록이었다. 판정기와 조립기가 서로 다른 것을 보고 있었다는 뜻이다 —
 * 사람이 손으로 만든 HTML 이 게이트를 통과한 것도 같은 이유였다.
 */
const s = (id, role, extra = {}) => ({
  id,
  role,
  kicker: `${id} 표지`,
  headline: `${id} 제목`,
  subcopy: `${id} 부제`,
  emphasis: `${id} 강조`,
  ...extra,
});

const PLAN_OBJ = {
  tokens: { brand: "#3189FD", ink: "#1A1A1A", paper: "#FFFFFF", deep: "#0D1117", tint: "#F1F5F9", line: "#E5E7EB" },
  footer_notice: "연출 이미지가 포함되어 있습니다",
  sections: [
    s("hero", "hero"),
    s("problem", "pain"),
    s("adhesion", "solution"),
    s("waterproof", "solution"),
    s("quantity", "solution", { figure: { value: "50", unit: "장 대용량" } }),
    s("targets", "solution", { stats: [{ value: "8", label: "종 대응" }] }),
    s("places", "solution"),
    s("before-after", "compare", { captions: ["설치 전", "설치 후"] }),
    s("install", "usage", { steps: ["보호막을 벗긴다", "매단다", "교체한다"] }),
    s("principle", "usage", { steps: ["부른다", "다가온다", "붙는다"] }),
    s("product-info", "spec", { specs: [{ label: "소재", value: "냉감 원사" }] }),
    s("caution", "caution", { cautions: ["점착면을 만지지 않는다"] }),
    s("closing", "closing", { cta: "지금 확인하기" }),
  ],
  still_jobs: [{ id: "hero", section: "hero", prompt: "정면" }],
};

const COPY = PLAN_OBJ.sections.map((section) => section.headline);
const GOOD_HTML = renderHtml(PLAN_OBJ);

test("헤드라인이 비어 있는 껍데기를 통과시키지 않는다", async () => {
  // 3회차 실사용: 빌더가 sections[].headline 을 읽지 않아 `<h2></h2>` 만 8개 나왔다.
  // "플랜 밖 문자열이 없는가" 만 보면 **빈 페이지가 완벽하게 통과한다** — 반대 방향도 본다.
  const EMPTY = GOOD_HTML.replace(new RegExp(COPY.join("|"), "g"), "");
  const b = await bed({ html: EMPTY });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(
      reasons.some((reason) => /헤드라인이 HTML 에 없다/.test(reason)),
      reasons.join(" / "),
    );
  } finally {
    await b.cleanup();
  }
});

test("플랜의 헤드라인이 전부 들어가면 통과한다", async () => {
  const b = await bed();
  try {
    const { reasons } = await check(b.ctx);
    assert.deepEqual(reasons, []);
  } finally {
    await b.cleanup();
  }
});

async function bed({ html = GOOD_HTML, anchors = true, plan } = {}) {
  const b = await makeCheckbed();
  if (html !== null) await b.write(HTML, html);
  await b.write(PLAN, plan ?? PLAN_OBJ);
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
    html: GOOD_HTML.replace(/<footer>[^<]*<\/footer>/, "<footer>무료 배송 안내</footer>"),
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
  const b = await bed({ html: GOOD_HTML.replace("width: 780px; max-width: 780px;", "") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /폭 780px 선언이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("자리표시자가 남아 있으면 거부한다", async () => {
  const b = await bed({ html: GOOD_HTML.replace(/<footer>[^<]*<\/footer>/, "<footer>TODO</footer>") });
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
    html: GOOD_HTML.replace("color: var(--c-ink);", "color: #FF00AA;"),
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
  const b = await bed({ html: GOOD_HTML.replaceAll('class="chip"', 'class="tag"') });
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
    html: GOOD_HTML.replace(/<svg[\s\S]*?<\/svg>/, ""),
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

// ── 기준작 대비와 카피 위생 ────────────────────────────────────────────────
// 1회차: 흰 박스에 가운데 정렬한 8섹션이 이 게이트를 완벽하게 통과했다.
// 절차는 다 밟았기 때문이다. 이제 결과를 본다.

test("밋밋한 페이지는 기준작 하한에 걸린다", async () => {
  const FLAT = `<style>
:root { --ink: #1C1F1A; --tint: #F4F7EC; }
.page { max-width: 780px; color: var(--ink); }
.sec { padding: 104px 60px; text-align: center; background: var(--tint); }
.head { font-size: 60px; }
.shot { display: block; width: 660px; height: auto; margin: 52px auto 0; }
.notes li::before { position: absolute; }
.infocard{}.callout{}.spec{}.chip{}.dim{}
</style>
<div class="page">
<section class="sec"><h2 class="head">${COPY[0]}</h2><img class="shot" src="a.webp" alt="a"></section>
<section class="sec"><p class="infocard">${COPY[1]}</p></section>
<section class="sec"><p class="callout">${COPY[2]}</p></section>
<section class="sec"><p class="dim">${COPY[3]}</p><span class="chip">신축</span>
  <ul class="spec"><li>소재</li></ul>
  <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg></section>
</div>
<footer>고지</footer>
`;
  const b = await bed({ html: FLAT });
  try {
    const { reasons } = await check(b.ctx);
    const gaps = reasons.filter((r) => /기준작 하한/.test(r));
    assert.ok(gaps.length >= 3, reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("제작자 언어가 화면에 있으면 거부한다", async () => {
  const b = await bed({
    html: GOOD_HTML.replace(
      /<footer>[^<]*<\/footer>/,
      "<footer>확인되지 않은 성능은 적지 않았습니다</footer>",
    ),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /제작자 언어가 화면에 있다/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("푸터가 없으면 거부한다 — 고지를 섹션마다 흘리지 않는다", async () => {
  const b = await bed({ html: GOOD_HTML.replace(/<footer>[^<]*<\/footer>/, "") });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /푸터가 없다/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});
