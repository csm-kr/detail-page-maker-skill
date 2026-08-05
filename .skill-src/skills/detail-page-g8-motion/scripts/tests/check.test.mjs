// G8 판정 단위 테스트.
//
// 2회차 결함: brief 를 고치고 컴포지션은 옛것을 그대로 재렌더했고, g06 자막 5개가
// 페이지 용어 집합 밖이라 GIF 와 HTML 이 다른 이름을 썼다. GIF 파일은 전부 있었으므로
// 존재 검사는 통과했다. **신선도와 용어 집합**을 본다.

import assert from "node:assert/strict";
import { utimes } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const INDEX = path.join("work", "comps", "index.json");
const PLAN = "flow-plan.json";
const PAGE = path.join("work", "page-plan.md");

const PAGE_TEXT = `# page-plan

## hero
수단: css

## 용어 집합
- 팔토시
- 통기성
- 신축성
`;

const BRIEFS = [
  { id: "g01", method: "hyperframes", keywords: ["통기성"] },
  { id: "g02", method: "god-tibo", keywords: [] },
];

const entry = (id, extra = {}) => ({
  brief: id,
  method: BRIEFS.find((b) => b.id === id)?.method,
  comp: `work/comps/${id}.html`,
  gif: `output/media/gifs/${id}.gif`,
  subtitles: ["팔토시"],
  notes: "통기성",
  ...extra,
});

/** comp 를 먼저, gif 를 나중으로 못박는다. 신선도 검사는 이 순서를 본다. */
async function stamp(b, id, { gifOlder = false } = {}) {
  const comp = await b.write(`work/comps/${id}.html`, "<html></html>\n");
  const gif = await b.write(`output/media/gifs/${id}.gif`, "GIF89a\n");
  const base = Date.now();
  await utimes(comp, new Date(base), new Date(base));
  const gifAt = gifOlder ? base - 60000 : base + 60000;
  await utimes(gif, new Date(gifAt), new Date(gifAt));
}

async function bed({ entries, briefs = BRIEFS, page = PAGE_TEXT, gifOlder = false } = {}) {
  const b = await makeCheckbed();
  const list = entries ?? BRIEFS.map((brief) => entry(brief.id));
  if (page !== null) await b.write(PAGE, page);
  await b.write(PLAN, { gif_briefs: briefs });
  for (const item of list) {
    if (item.comp) await stamp(b, item.brief, { gifOlder });
  }
  await b.write(INDEX, { entries: list });
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

test("comps/index.json 이 없으면 그 사유 하나만 낸다", async () => {
  const b = await makeCheckbed();
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /brief↔컴포지션↔GIF 대응을 남긴다/);
  } finally {
    await b.cleanup();
  }
});

test("brief 수와 컴포지션 수가 다르면 양쪽을 함께 낸다", async () => {
  const b = await bed({ entries: [entry("g01")] });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /brief 2개 · 컴포지션 1개/);
  } finally {
    await b.cleanup();
  }
});

test("method 가 brief 와 다르면 양쪽 값을 함께 낸다", async () => {
  const b = await bed({
    entries: [entry("g01", { method: "ffmpeg" }), entry("g02")],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /g01 의 method 가 brief 와 다르다 \(brief hyperframes · 실제 ffmpeg\)/);
  } finally {
    await b.cleanup();
  }
});

test("자막이 페이지 용어 집합 밖이면 그 낱말을 지목한다", async () => {
  const b = await bed({
    entries: [entry("g01", { subtitles: ["팔토시", "쿨링소재"] }), entry("g02")],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /g01 의 자막이 페이지 용어 집합 밖이다: 쿨링소재/);
  } finally {
    await b.cleanup();
  }
});

test("용어 집합을 읽을 수 없으면 자막 검사 대신 그 사실을 낸다", async () => {
  const b = await bed({ page: "# page-plan\n\n## hero\n수단: css\n" });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /`## 용어 집합` 을 읽을 수 없다/);
  } finally {
    await b.cleanup();
  }
});

test("brief 핵심 명사가 컴포지션에 없으면 지목한다", async () => {
  const b = await bed({
    entries: [entry("g01", { notes: "그냥 움직임" }), entry("g02")],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /g01 의 brief 핵심 명사가 컴포지션에 없다: 통기성/);
  } finally {
    await b.cleanup();
  }
});

test("GIF 가 컴포지션보다 오래되면 거부한다 — 옛 설계를 재렌더한 것이다", async () => {
  const b = await bed({ gifOlder: true });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 2, reasons.join(" / "));
    assert.match(reasons.join("\n"), /g01 의 GIF 가 컴포지션보다 오래됐다/);
    assert.match(reasons.join("\n"), /g02 의 GIF 가 컴포지션보다 오래됐다/);
  } finally {
    await b.cleanup();
  }
});

test("대응하는 brief 가 없는 컴포지션을 거부한다", async () => {
  const b = await bed({
    entries: [entry("g01"), { ...entry("g02"), brief: "g99" }],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.match(reasons.join("\n"), /컴포지션 g99 에 대응하는 brief 가 없다/);
  } finally {
    await b.cleanup();
  }
});

test("comp 나 gif 경로가 없으면 거부한다", async () => {
  const b = await bed({
    entries: [entry("g01"), { brief: "g02", method: "god-tibo", subtitles: [] }],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /g02 에 comp 와 gif 경로가 필요하다/);
  } finally {
    await b.cleanup();
  }
});

test("한 수단이 8개를 넘으면 거부한다", async () => {
  const briefs = Array.from({ length: 9 }, (_, i) => ({
    id: `g${i + 1}`,
    method: "hyperframes",
    keywords: [],
  }));
  const entries = briefs.map((brief) => ({
    brief: brief.id,
    method: "hyperframes",
    comp: `work/comps/${brief.id}.html`,
    gif: `output/media/gifs/${brief.id}.gif`,
    subtitles: [],
  }));
  const b = await bed({ briefs, entries });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /method hyperframes 가 9개다/);
  } finally {
    await b.cleanup();
  }
});
