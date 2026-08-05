// G9 조립기. 게이트가 보는 것과 **같은 함수**로 검사한다.
//
// 옛 build-page.mjs 는 특정 상품 전용이었다. 그것을 옮기지 않고 플랜만 보고 도는
// 조립기를 새로 쓴다. 그러므로 조립기가 지켜야 하는 것은 check.mjs 의 계약 그대로다.
// 여기서 checkkit 의 koreanRuns·hexes 를 직접 불러 쓰는 이유가 그것이다 — 테스트가
// 게이트보다 느슨하면 테스트를 통과하고 게이트에서 막힌다.

import assert from "node:assert/strict";
import test from "node:test";

import { hexes, koreanRuns } from "../../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { PlanTextError, renderHtml, say } from "../lib/render.mjs";

const PLAN = {
  contract_id: "lean-page-plan-v1",
  inputs: {
    supplier_url: "https://domeggook.com/55873582",
    coupang_url: "https://www.coupang.com/vp/products/9516545017",
  },
  output: { width_px: 780, html_path: "output/detail-page.html" },
  tokens: { brand: "#3189FD", ink: "#111827", line: "#E5E7EB" },
  mood: { background: ["#F8FAFC", "#EEF2FF"] },
  sections: [
    {
      id: "hook",
      headline_lines: ["여름 팔토시"],
      body_chunks: ["햇볕을 가린다"],
      emphasis_chunks: ["시원하다"],
      specs: [{ label: "소재", value: "냉감 원사" }],
    },
    {
      id: "proof",
      headline_lines: ["실측"],
      body_chunks: [],
      emphasis_chunks: [],
    },
  ],
  still_jobs: [{ id: "st-01", section_id: "hook", purpose: "대표", prompt: "정면", width_px: 780 }],
  gif_briefs: [
    {
      id: "gf-01",
      section_id: "proof",
      width_px: 780,
      question: "잘 늘어나나",
      start: "가만히",
      action: "당긴다",
      result: "돌아온다",
    },
  ],
};

/** check.mjs 의 1번 검사를 그대로 옮긴다. */
function strayKorean(html, plan) {
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "\n");
  const blob = JSON.stringify(plan);
  return koreanRuns(visible, 3).filter((run) => !blob.includes(run));
}

test("화면의 한글이 전부 플랜에서 온다", () => {
  assert.deepEqual(strayKorean(renderHtml(PLAN), PLAN), []);
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
  // 가이드의 배경 hex 를 그대로 선택자에 박으면 4번 검사에서 걸린다.
  const root = /:root\s*\{([\s\S]*?)\}/.exec(renderHtml(PLAN))?.[1] ?? "";
  for (const hex of PLAN.mood.background) assert.ok(hexes(root).includes(hex.toLowerCase()) || hexes(root).includes(hex), `${hex} 가 :root 에 없다`);
});

test("가이드 구성 요소 6종과 인라인 SVG 가 있다", () => {
  const html = renderHtml(PLAN);
  for (const name of ["infocard", "callout", "spec", "chip", "dim", "trace"]) {
    assert.match(html, new RegExp(`class="[^"]*\\b${name}\\b`), `${name} 이 없다`);
  }
  assert.match(html, /<svg\b/);
});

test("섹션을 플랜 순서대로 낸다", () => {
  const html = renderHtml(PLAN);
  assert.ok(html.indexOf('id="s-hook"') < html.indexOf('id="s-proof"'));
});

test("플랜에 없는 한글을 넣으려 하면 조립이 실패한다", () => {
  // 조립기에 문자열을 박는 실수를 게이트까지 미루지 않는다. 여기서 터진다.
  const blob = JSON.stringify(PLAN);
  assert.throws(() => say(blob, "박힌 문구"), PlanTextError);
  assert.equal(say(blob, "여름 팔토시"), "여름 팔토시");
  assert.equal(say(blob, "st-01"), "st-01", "한글이 없는 값은 통과시킨다");
});

test("섹션이 비어도 구성 요소 자리는 남는다", () => {
  // proof 섹션은 강조·스펙이 없다. 클래스가 사라지면 게이트가 막는다.
  const html = renderHtml({ ...PLAN, sections: [PLAN.sections[1]] });
  for (const name of ["infocard", "callout", "spec", "chip"]) {
    assert.match(html, new RegExp(`class="[^"]*\\b${name}\\b`), `${name} 이 없다`);
  }
});

test("미디어는 아이디로 경로를 만든다", () => {
  const html = renderHtml(PLAN);
  assert.match(html, /output\/media\/images\/st-01\./);
  assert.match(html, /output\/media\/gifs\/gf-01\.gif/);
});

test("HTML 특수문자를 이스케이프한다", () => {
  const plan = {
    ...PLAN,
    sections: [{ id: "e", headline_lines: ["a<b>&c"], body_chunks: [], emphasis_chunks: [] }],
  };
  const html = renderHtml(plan);
  assert.match(html, /a&lt;b&gt;&amp;c/);
});
