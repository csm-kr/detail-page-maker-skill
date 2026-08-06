// G8 판정 단위 테스트.
//
// 2회차 결함: brief 를 고치고 컴포지션은 옛것을 그대로 재렌더했고, g06 자막 5개가
// 페이지 용어 집합 밖이라 GIF 와 HTML 이 다른 이름을 썼다. GIF 파일은 전부 있었으므로
// 존재 검사는 통과했다. **신선도와 용어 집합**을 본다.

import assert from "node:assert/strict";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";
import { fakeGif, PACED_GIF } from "./gif-fixture.mjs";

const INDEX = path.join("work", "comps", "index.json");
const PLAN = "flow-plan.json";
const PAGE = path.join("work", "page-plan.md");
const PROBE = path.join("work", "comps", "render-probe.json");

const PAGE_TEXT = `# page-plan

## hero
수단: css

## 용어 집합
- 팔토시
- 통기성
- 신축성
`;

const BRIEFS = [
  { id: "g01", method: "still-motion", source_still: "c01", keywords: ["통기성"] },
  { id: "g02", method: "tibo-sequence", source_still: "c02", keywords: [] },
];

const entry = (id, extra = {}) => {
  const brief = BRIEFS.find((b) => b.id === id);
  return {
    brief: id,
    method: brief?.method,
    source_still: brief?.source_still,
    frames: brief?.method === "tibo-sequence" ? 6 : 0,
    comp: `work/comps/${id}.html`,
    gif: `output/media/gifs/${id}.gif`,
    subtitles: ["팔토시"],
    notes: "통기성",
    ...extra,
  };
};

/** still-motion 컴포지션은 발행된 스틸을 실제로 써야 한다. */
const compHtml = (id) =>
  `<html><img src="../../../output/media/images/${BRIEFS.find((b) => b.id === id)?.source_still}.webp"></html>`;

/** comp 를 먼저, gif 를 나중으로 못박는다. 신선도 검사는 이 순서를 본다. */
async function stamp(b, id, { gifOlder = false, gif: bytes = PACED_GIF } = {}) {
  const comp = await b.write(`work/comps/${id}.html`, compHtml(id));
  const gif = await b.write(`output/media/gifs/${id}.gif`, bytes);
  const base = Date.now();
  await utimes(comp, new Date(base), new Date(base));
  const gifAt = gifOlder ? base - 60000 : base + 60000;
  await utimes(gif, new Date(gifAt), new Date(gifAt));
}

/** 방금 잰 살아 있는 렌더 경로. `--probe` 가 남기는 모양이다. */
const freshProbe = (paths = [{ name: "chrome", ok: true, elapsed_ms: 4_100 }]) => ({
  at: new Date().toISOString(),
  budget_ms: 240_000,
  paths,
});

async function bed({
  entries,
  briefs = BRIEFS,
  page = PAGE_TEXT,
  gifOlder = false,
  gif,
  probe = freshProbe(),
} = {}) {
  const b = await makeCheckbed();
  const list = entries ?? BRIEFS.map((brief) => entry(brief.id));
  if (page !== null) await b.write(PAGE, page);
  if (probe !== null) await b.write(PROBE, probe);
  await b.write(PLAN, { gif_briefs: briefs });
  for (const item of list) {
    if (item.comp) await stamp(b, item.brief, { gifOlder, ...(gif ? { gif } : {}) });
  }
  await b.write(INDEX, { entries: list });
  return b;
}

test("미디어가 예산을 넘으면 GIF 를 굽는 자리에서 잡는다", async () => {
  // 5회차: G10 이 `미디어 총량 12.6 MB 가 상한 12 MB 를 넘는다` 로 거부했다. 그런데
  // 총량의 84%가 GIF 이고 GIF 를 굽는 것은 G8 이다. 만드는 자리에서 모르면 파이프라인
  // 끝까지 가서야 알고, G10 은 스크립트 게이트라 스스로 줄일 수도 없다.
  // 숫자를 새로 정하지 않는다 — G10 이 보는 그 정책값을 그대로 본다.
  const b = await bed();
  try {
    await mkdir(path.join(b.ctx.workspace, "work"), { recursive: true });
    await writeFile(
      path.join(b.ctx.workspace, "work", "env.lock.json"),
      JSON.stringify({ policy: { media_budget_mb: 0.000_01 } }),
      "utf8",
    );
    assert.ok(
      (await check(b.ctx)).reasons.some((reason) => /미디어 총량/.test(reason)),
      "예산을 넘겼는데 G8 이 잡지 않았다",
    );
  } finally {
    await b.cleanup();
  }
});

test("전부 갖추면 통과한다", async () => {
  const b = await bed();
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("렌더 경로를 재지 않았으면 거부한다", async () => {
  // 3회차는 hyperframes 가 240초에 타임아웃하자 조용히 Chrome 으로 갈아탔고
  // 그 우회가 굳었다. 재지 않으면 우회가 우회인지도 모른다.
  const b = await bed({ probe: null });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /--probe/);
  } finally {
    await b.cleanup();
  }
});

test("살아 있는 렌더 경로가 없으면 거부한다", async () => {
  const b = await bed({
    probe: {
      at: new Date().toISOString(),
      budget_ms: 240_000,
      paths: [
        { name: "hyperframes", ok: false, elapsed_ms: 240_000, error: "TIMEOUT" },
        { name: "chrome", ok: false, elapsed_ms: 300, error: "CHROME_NOT_FOUND" },
      ],
    },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /살아 있는 렌더 경로가 없다/);
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
    assert.match(reasons[0], /g01 의 method 가 brief 와 다르다 \(brief still-motion · 실제 ffmpeg\)/);
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
    // comp·gif 만 빠뜨린다. 나머지는 맞춰 둬야 이 검사만 걸린다.
    entries: [
      entry("g01"),
      { brief: "g02", method: "tibo-sequence", source_still: "c02", frames: 6, subtitles: [] },
    ],
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
    method: "tibo-sequence",
    source_still: `c${i + 1}`,
    keywords: [],
  }));
  const entries = briefs.map((brief) => ({
    brief: brief.id,
    method: "tibo-sequence",
    source_still: brief.source_still,
    frames: 6,
    comp: `work/comps/${brief.id}.html`,
    gif: `output/media/gifs/${brief.id}.gif`,
    subtitles: [],
  }));
  const b = await bed({ briefs, entries });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /method tibo-sequence 가 9개다/);
  } finally {
    await b.cleanup();
  }
});

// ── GIF 의 입력이 이미지인가 ────────────────────────────────────────────────
// 1회차: 컴포지션 10개 전부 `<img>` 가 0건이었다. 파일은 다 있었으므로 존재 검사와
// 신선도 검사는 전부 통과했다. 여기서만 잡힌다.

test("컴포지션이 스틸을 쓰지 않으면 거부한다 — 도형에 애니메이션을 걸지 않는다", async () => {
  const b = await bed();
  try {
    // 1회차 컴포지션의 실제 모양으로 덮어쓴다.
    await b.write(
      "work/comps/g01.html",
      '<html><div style="width:150px;height:230px;background:#ECC623"></div></html>\n',
    );
    const { reasons } = await check(b.ctx);
    assert.ok(
      reasons.some((r) => /컴포지션이 스틸 c01 을 쓰지 않는다/.test(r)),
      reasons.join(" / "),
    );
  } finally {
    await b.cleanup();
  }
});

test("연속 프레임이 2장 미만이면 거부한다", async () => {
  const b = await bed({ entries: [entry("g01"), entry("g02", { frames: 1 })] });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /생성 프레임이 1장이다/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

// ── GIF 가 얼마나 오래 보이는가 ────────────────────────────────────────────
// 3회차: 브리프에는 "천천히 드러난다" 라고 적혀 있었고 실제 파일은 3프레임 0.48초였다.
// 계획을 읽는 검사로는 못 잡는다. 구운 파일을 연다.

test("너무 빨리 지나가는 GIF 를 거부한다", async () => {
  // 실제로 나온 것: 3프레임 · 0.16초씩.
  const b = await bed({ gif: fakeGif([16, 16, 16]) });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /g01 이 너무 빨리 지나간다/.test(r)), reasons.join(" / "));
    assert.match(reasons.join(" / "), /첫 프레임이 160ms/);
  } finally {
    await b.cleanup();
  }
});

test("장면이 바뀌는 GIF 에는 더 긴 잣대를 댄다", async () => {
  // 보간으로는 통과하는 속도. tibo-sequence(g02)에서만 걸려야 한다.
  const b = await bed({ gif: fakeGif([80, 20, 20, 20, 20, 100]) });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(!reasons.some((r) => /g01 이 너무 빨리/.test(r)), reasons.join(" / "));
    assert.ok(reasons.some((r) => /g02 이 너무 빨리/.test(r)), reasons.join(" / "));
    assert.match(reasons.join(" / "), /장면/);
  } finally {
    await b.cleanup();
  }
});

test("GIF 를 열 수 없으면 통과시키지 않는다", async () => {
  const b = await bed();
  try {
    await b.write("output/media/gifs/g01.gif", "이건 GIF 가 아니다");
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /g01 의 GIF 를 읽을 수 없다/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});
