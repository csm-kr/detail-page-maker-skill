// G9 조립기. 게이트가 보는 것과 **같은 함수**로 검사한다.
//
// 1회차: 조립기가 모든 섹션을 같은 흰 박스로 찍었다. 절차는 다 맞았고 결과가 문서였다.
// 그래서 여기서 `lib/benchmark.mjs` 의 하한을 직접 건다 — 테스트가 게이트보다 느슨하면
// 테스트를 통과하고 게이트에서 막힌다.

import assert from "node:assert/strict";
import test from "node:test";

import { measure, shortfalls } from "../../../detail-page-orchestrator/scripts/lib/benchmark.mjs";
import { hexes, koreanRuns } from "../../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { producerLanguage } from "../../../detail-page-orchestrator/scripts/lib/copy.mjs";
import { PlanTextError, referencedMedia, renderHtml, say } from "../lib/render.mjs";

const section = (id, role, extra = {}) => ({
  id,
  role,
  kicker: `${id} 표지`,
  headline: `${id} 제목<br>두 번째 줄`,
  subcopy: `${id} 부제`,
  body: `${id} 본문`,
  emphasis: `${id} 강조`,
  ...extra,
});

const PLAN = {
  contract_id: "lean-page-plan-v1",
  inputs: {
    supplier_url: "https://domeggook.com/55873582",
    coupang_url: "https://www.coupang.com/vp/products/9516545017",
  },
  output: { width_px: 780, html_path: "output/detail-page.html" },
  tokens: { brand: "#3189FD", ink: "#111827", paper: "#FFFFFF", deep: "#0D1117", tint: "#F1F5F9", line: "#E5E7EB" },
  mood: { background: ["#F8FAFC", "#EEF2FF"] },
  footer_notice: "본 페이지에는 연출 이미지가 포함되어 있습니다",
  sections: [
    section("hero", "hero"),
    section("problem", "pain"),
    section("adhesion", "solution", {
      stats: [
        { value: "50", label: "장 대용량" },
        { value: "24", label: "시간 유지" },
        { value: "2", label: "면 점착" },
      ],
    }),
    section("waterproof", "solution"),
    section("quantity", "solution", { figure: { value: "50", unit: "장 대용량" } }),
    section("targets", "solution"),
    section("places", "solution"),
    section("before-after", "compare", { captions: ["설치 전", "설치 후"] }),
    section("install", "usage", { steps: ["보호막을 벗긴다", "끈을 꿴다", "매단다"] }),
    section("principle", "usage", { steps: ["노란색이 부른다", "다가온다", "붙는다"] }),
    section("product-info", "spec", { specs: [{ label: "소재", value: "냉감 원사" }] }),
    section("caution", "caution", { cautions: ["점착면을 만지지 않는다"] }),
    section("closing", "closing", { cta: "지금 확인하기" }),
  ],
  still_jobs: [
    { id: "st-01", section: "hero", prompt: "정면" },
    { id: "st-02", section: "adhesion", prompt: "접착" },
    { id: "st-03", section: "adhesion", prompt: "매크로" },
    { id: "st-04", section: "before-after", prompt: "전" },
    { id: "st-05", section: "before-after", prompt: "후" },
    { id: "st-06", section: "closing", prompt: "마감" },
  ],
  gif_briefs: [
    { id: "gf-01", section: "problem", question: "얼마나 몰리나" },
    { id: "gf-02", section: "waterproof", question: "물에 견디나" },
    { id: "gf-03", section: "install", question: "어떻게 다나" },
  ],
};

/** check.mjs 의 1번 검사를 그대로 옮긴다. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "\n");
}

function strayKorean(html, plan) {
  const blob = JSON.stringify(plan);
  return koreanRuns(visibleText(html), 3).filter((run) => !blob.includes(run));
}

test("기준작 하한을 넘는다", () => {
  const gaps = shortfalls(measure(renderHtml(PLAN)));
  assert.deepEqual(gaps, [], `조립기가 밋밋한 페이지를 만든다: ${gaps.join(" · ")}`);
});

test("role 마다 레이아웃이 다르다", () => {
  const html = renderHtml(PLAN);
  // 히어로·마감은 이미지 위 오버레이, 문제는 어두운 카피 판, 비교는 좌우, 규격은 표.
  assert.match(html, /id="s-hero"[\s\S]*?class="visual"/);
  assert.match(html, /id="s-problem"[\s\S]*?class="copy dark"/);
  assert.match(html, /id="s-before-after"[\s\S]*?class="two-up"/);
  assert.match(html, /id="s-product-info"[\s\S]*?class="spec-wrap"/);
  assert.match(html, /id="s-caution"[\s\S]*?class="caution"/);
  assert.match(html, /id="s-closing"[\s\S]*?class="cta"/);
});

test("장점 섹션의 배경이 이어지지 않는다", () => {
  const html = renderHtml(PLAN);
  const tones = [...html.matchAll(/id="s-(adhesion|waterproof|quantity)"[\s\S]*?class="copy ([a-z]+)"/g)]
    .map((match) => match[2]);
  assert.equal(new Set(tones).size, 3, `장점 배경이 겹친다: ${tones.join(", ")}`);
});

test("역할마다 제목 크기가 다르다", () => {
  // 2회차가 밋밋했던 직접 원인. `.headline` 하나로 히어로도 규격표도 주의사항도 찍었다.
  // 크기가 한 단이면 위계가 없고, 위계가 없으면 눈이 어디를 볼지 정하지 못한다.
  const html = renderHtml(PLAN);
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const sizeOf = (selector) => {
    const rule = new RegExp(`${selector}\\s*\\{[^}]*font-size:\\s*(\\d+)px`).exec(css);
    assert.ok(rule, `${selector} 의 font-size 를 찾을 수 없다`);
    return Number(rule[1]);
  };
  const hero = sizeOf("\\.hero \\.headline");
  const solution = sizeOf("\\.headline");
  const spec = sizeOf("\\.spec-wrap \\.headline");
  assert.ok(hero > solution, `히어로 제목 ${hero} 이 장점 제목 ${solution} 보다 크지 않다`);
  assert.ok(solution > spec, `장점 제목 ${solution} 이 규격 제목 ${spec} 보다 크지 않다`);
  assert.ok(hero >= 88, `히어로 제목이 ${hero}px 다. 디스플레이 크기가 아니다`);
});

test("대형 숫자 장치를 낸다", () => {
  // 기준작 v4 의 `.quantity .big` 116px. 상업 페이지의 가장 큰 글자는 대개 제목이 아니라 숫자다.
  const html = renderHtml(PLAN);
  assert.match(html, /id="s-quantity"[\s\S]*?class="figure"/);
  assert.match(html, /class="big">50</);
  assert.match(html, /class="unit">장 대용량</);
});

test("숫자 스트립을 낸다", () => {
  const html = renderHtml(PLAN);
  assert.match(html, /id="s-adhesion"[\s\S]*?class="stat-strip"/);
  assert.match(html, /<strong>50<\/strong><span>장 대용량<\/span>/);
});

test("figure 와 stats 가 없는 섹션에는 그 장치를 넣지 않는다", () => {
  const html = renderHtml(PLAN);
  const waterproof = /id="s-waterproof"([\s\S]*?)<\/section>/.exec(html)[1];
  assert.ok(!waterproof.includes("stat-strip"));
  assert.ok(!waterproof.includes('class="figure"'));
});

test("화면의 한글이 전부 플랜에서 온다", () => {
  assert.deepEqual(strayKorean(renderHtml(PLAN), PLAN), []);
});

test("푸터에 내부 식별자와 공급처 URL 이 없다", () => {
  // 1회차: contract_id 와 공급처 주소가 고객 화면 푸터에 그대로 실렸다.
  const html = renderHtml(PLAN);
  assert.ok(!html.includes(PLAN.contract_id), "contract_id 가 화면에 있다");
  assert.ok(!html.includes(PLAN.inputs.supplier_url), "공급처 URL 이 화면에 있다");
  assert.ok(!html.includes(PLAN.inputs.coupang_url), "쿠팡 URL 이 화면에 있다");
  assert.match(html, /<footer>본 페이지에는 연출 이미지가 포함되어 있습니다<\/footer>/);
});

test("제작자 언어를 만들지 않는다", () => {
  assert.deepEqual(producerLanguage(visibleText(renderHtml(PLAN))), []);
});

test("폭 780px 을 선언한다", () => {
  assert.match(renderHtml(PLAN), /max-width:\s*780px|width:\s*780px/);
});

test("자리표시자가 남지 않는다", () => {
  assert.ok(!/\[\[|TODO|자리표시|placeholder/i.test(renderHtml(PLAN)));
});

test("hex 는 :root 에만 있다", () => {
  const html = renderHtml(PLAN);
  const root = /:root\s*\{([\s\S]*?)\}/.exec(html)?.[1] ?? "";
  const inRoot = new Set(hexes(root));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const outside = hexes(styles.replace(/:root\s*\{[\s\S]*?\}/g, "")).filter((h) => !inRoot.has(h));
  assert.deepEqual(outside, []);
});

test("무드 배경색도 :root 를 지나간다", () => {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(renderHtml(PLAN))?.[1] ?? "";
  for (const hex of PLAN.mood.background) {
    assert.ok(hexes(root).includes(hex.toUpperCase()), `${hex} 가 :root 에 없다`);
  }
});

test("가이드 구성 요소와 인라인 SVG 가 있다", () => {
  const html = renderHtml(PLAN);
  for (const name of ["chip", "callout", "dim", "spec"]) {
    assert.match(html, new RegExp(`class="[^"]*\\b${name}\\b`), `${name} 이 없다`);
  }
  assert.match(html, /<svg\b/);
});

test("섹션을 플랜 순서대로 낸다", () => {
  const html = renderHtml(PLAN);
  assert.ok(html.indexOf('id="s-hero"') < html.indexOf('id="s-closing"'));
});

test("플랜에 없는 한글을 넣으려 하면 조립이 실패한다", () => {
  const blob = JSON.stringify(PLAN);
  assert.throws(() => say(blob, "박힌 문구"), PlanTextError);
  assert.equal(say(blob, "hero 제목"), "hero 제목");
  assert.equal(say(blob, "st-01"), "st-01", "한글이 없는 값은 통과시킨다");
});

test("미디어 경로는 output 기준이 아니라 HTML 기준이다", () => {
  // HTML 이 output/detail-page.html 이므로 src 는 media/… 여야 한다.
  // 1회차 조립기는 output/media/… 를 써서 G10 이 전부 ASSET_MISSING 으로 봤다.
  const html = renderHtml(PLAN);
  assert.match(html, /src="media\/images\/st-01\.webp"/);
  assert.match(html, /src="media\/gifs\/gf-01\.gif"/);
  assert.ok(!html.includes('src="output/media/'), "src 가 output/ 으로 시작한다");
});

test("앵커는 프로젝트 기준 경로로 돌려준다", () => {
  const refs = referencedMedia(renderHtml(PLAN));
  assert.ok(refs.includes("output/media/images/st-01.webp"));
  assert.ok(refs.includes("output/media/gifs/gf-01.gif"));
});

test("HTML 특수문자를 이스케이프한다", () => {
  const plan = {
    ...PLAN,
    sections: [{ id: "e", role: "pain", headline: "a<b>&c" }, ...PLAN.sections.slice(1)],
  };
  assert.match(renderHtml(plan), /a&lt;b&gt;&amp;c/);
});

test("발행되지 않은 컷은 페이지에 싣지 않는다", async () => {
  // 플랜은 선별 결과를 모른다. 탈락한 컷까지 실으면 G10 이 전부 ASSET_MISSING 으로 본다.
  const plan = {
    ...PLAN,
    still_jobs: [...PLAN.still_jobs, { id: "st-99", section: "adhesion", prompt: "탈락" }],
  };
  const html = renderHtml(plan, { accepted: new Set(PLAN.still_jobs.map((j) => j.id)) });
  assert.ok(!html.includes("st-99"), "탈락한 컷이 실렸다");
  assert.match(html, /st-02/);
});

test("채택 목록을 주지 않으면 전부 싣는다", () => {
  assert.match(renderHtml(PLAN), /st-01/);
});

test("스틸과 GIF 를 함께 싣는다 — 굽고 버리지 않는다", () => {
  // adhesion 은 스틸 2장, waterproof 는 GIF 1개, install 은 스틸 없이 GIF.
  const html = renderHtml(PLAN);
  assert.match(html, /st-02/);
  assert.match(html, /st-03/);
  assert.match(html, /gf-02/);
});
