// G3 판정 단위 테스트.
//
// 2회차 결함 둘: 공급처 순서를 그대로 상속했고, 화면 문자열 약 100개가 플랜 밖(빌더
// 안)에 있었다. 개수 검사로는 둘 다 통과한다 — 섹션도 있었고 플랜도 있었다.
// **flow-map 과의 집합 일치**와 **섹션마다 headline** 을 본다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const DRAFT = path.join("work", "flow-plan.draft.json");
const MAP = path.join("work", "flow-map.md");

/**
 * role 은 `lib/story.mjs` 의 계약이다. 기준작 v4 의 13섹션 구조를 그대로 쓴다.
 * 섹션 하한은 `lib/benchmark.mjs` 의 `FLOOR.sections` 이고 그 값은 기준작 실측이다 —
 * 줄이면 하한에 걸린다.
 */
const PLAN = [
  ["hero", "hero"],
  ["problem", "pain"],
  ["adhesion", "solution"],
  ["waterproof", "solution"],
  ["quantity", "solution"],
  ["targets", "solution"],
  ["places", "solution"],
  ["proof", "compare"],
  ["install", "usage"],
  ["principle", "usage"],
  ["caution", "caution"],
  ["spec", "spec"],
  ["closing", "closing"],
];
const IDS = PLAN.map(([id]) => id);
const ROLE = new Map(PLAN);

/** 공급처·쿠팡이 실제로 쓰는 표현. G2 가 모으고 G3 이 **쓴다**. */
const APPEALS = ["강력 점착", "생활방수", "50장 대용량", "완벽 포획", "끈적임 오래", "한 번 붙으면"];

const MAP_TEXT = `# flow-map

## 섹션 순서
${IDS.map((id, i) => `${i + 1}. ${id}`).join("\n")}

## 소구점
${APPEALS.map((phrase) => `- "${phrase}"`).join("\n")}
`;

/** GIF brief. 수단 둘을 섞고 컷 하나를 입력으로 지정한다. */
const brief = (i, extra = {}) => ({
  id: `g${i + 1}`,
  method: i < 4 ? "still-motion" : "tibo-sequence",
  source_still: `c${i + 1}`,
  ...extra,
});

/** id 목록을 플랜 섹션으로. role 은 위 표에서 가져오고 없으면 solution 으로 둔다. */
const asSections = (ids, extra = () => ({})) =>
  ids.map((id, index) => ({
    id,
    role: ROLE.get(id) ?? "solution",
    // 앞쪽 섹션이 소구점을 그대로 쓴다. 공급처·쿠팡의 판매 언어를 물려받는 자리다.
    headline: APPEALS[index] ? `${APPEALS[index]} 한 줄` : `${id} 한 줄`,
    ...extra(id),
  }));

function draft(overrides = {}) {
  return {
    sections: asSections(IDS),
    cuts: Array.from({ length: 20 }, (_, i) => ({
      id: `c${i + 1}`,
      prompt: `컷 ${i + 1} 설명`,
      target_size: "780x780",
    })),
    gif_briefs: Array.from({ length: 6 }, (_, i) => brief(i)),
    ...overrides,
  };
}

async function bed(overrides = {}, { map = MAP_TEXT } = {}) {
  const b = await makeCheckbed();
  await b.write(DRAFT, draft(overrides));
  if (map !== null) await b.write(MAP, map);
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

test("플랜 섹션이 flow-map 과 다르면 빠짐과 추가를 함께 지목한다", async () => {
  // 공급처 순서를 상속하면 이 모양이 된다 — 기준작에 없는 섹션이 들어오고 있던 것이 빠진다.
  const b = await bed({
    // 서사는 성립하게 두고 **집합만** 어긋나게 한다. 그래야 이 검사만 걸린다.
    sections: asSections(IDS.slice(0, -1)).concat({
      id: "배송안내",
      role: "closing",
      headline: "배송안내 한 줄",
    }),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /빠짐 \[closing\]/);
    assert.match(reasons[0], /추가 \[배송안내\]/);
  } finally {
    await b.cleanup();
  }
});

test("서사가 성립하는 한 순서를 바꿔도 거부하지 않는다", async () => {
  // 흐름을 다시 짜는 것은 G3 의 일이다. flow-map 과 집합만 같으면 된다.
  // 단 hero → pain → solution → closing 의 뼈대는 `lib/story.mjs` 가 따로 본다.
  const shuffled = asSections(IDS);
  [shuffled[2], shuffled[4]] = [shuffled[4], shuffled[2]];
  const b = await bed({ sections: shuffled });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("섹션에 headline 이 없으면 거부한다 — 화면 문자열을 빌더에 박지 않는다", async () => {
  const b = await bed({
    sections: asSections(IDS).map((s) => (s.id === "proof" ? { id: s.id, role: s.role } : s)),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /섹션 proof 에 headline 이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("빈 문자열 headline 도 없는 것으로 본다", async () => {
  const b = await bed({
    sections: asSections(IDS, (id) => (id === "spec" ? { headline: "   " } : {})),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /섹션 spec 에 headline 이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("근거 없는 표현이 플랜에 있으면 거부한다", async () => {
  const b = await bed({
    sections: asSections(IDS, (id) => (id === "hero" ? { headline: "자외선 차단 100%" } : {})),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 2, reasons.join(" / "));
    assert.match(reasons.join("\n"), /"자외선 차단"/);
    assert.match(reasons.join("\n"), /"100%"/);
  } finally {
    await b.cleanup();
  }
});

test("컷에 target_size 가 없으면 거부한다", async () => {
  const b = await bed({
    cuts: Array.from({ length: 20 }, (_, i) => ({
      id: `c${i + 1}`,
      prompt: `컷 ${i + 1} 설명`,
      ...(i === 3 ? {} : { target_size: "780x780" }),
    })),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /컷 c4 에 target_size 가 없다/);
  } finally {
    await b.cleanup();
  }
});

test("컷이 20개 미만이면 거부한다", async () => {
  const b = await bed({
    cuts: Array.from({ length: 19 }, (_, i) => ({
      id: `c${i + 1}`,
      prompt: `컷 ${i + 1}`,
      target_size: "780x780",
    })),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /still job 이 19개다/);
  } finally {
    await b.cleanup();
  }
});

test("모르는 method 는 거부한다", async () => {
  const b = await bed({
    gif_briefs: Array.from({ length: 6 }, (_, i) =>
      brief(i, i === 2 ? { method: "photoshop" } : {}),
    ),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /brief g3 의 method/);
  } finally {
    await b.cleanup();
  }
});

test("한 수단이 8개를 넘으면 거부한다 — 편한 경로로 쏠린 것이다", async () => {
  const b = await bed({
    gif_briefs: [
      ...Array.from({ length: 9 }, (_, i) => brief(i, { method: "still-motion" })),
      brief(9, { method: "tibo-sequence" }),
    ],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /method still-motion 가 9개다/);
  } finally {
    await b.cleanup();
  }
});

test("정확히 8개면 거부하지 않는다", async () => {
  const b = await bed({
    gif_briefs: [
      ...Array.from({ length: 8 }, (_, i) => brief(i, { method: "still-motion" })),
      brief(8, { method: "tibo-sequence" }),
    ],
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

// ── 판매 서사와 카피 위생 ──────────────────────────────────────────────────
// 1회차 플랜에는 role 이 없었다. 스펙 나열 8섹션이 그대로 통과했고, 본문에
// "모르는 것은 모른다고 적었습니다" 가 실려 나갔다. 플랜에서 잡으면 빌드까지 안 간다.

test("섹션에 role 이 없으면 거부한다", async () => {
  const b = await bed({ sections: IDS.map((id) => ({ id, headline: `${id} 한 줄` })) });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /role/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("장점 섹션이 3개 미만이면 거부한다", async () => {
  const demoted = new Set(["waterproof", "quantity", "targets"]);
  const b = await bed({
    sections: asSections(IDS, (id) => (demoted.has(id) ? { role: "usage" } : {})),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /장점/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("문제 섹션이 없으면 거부한다 — 장점부터 시작하지 않는다", async () => {
  const b = await bed({
    sections: asSections(IDS, (id) => (id === "problem" ? { role: "solution" } : {})),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /문제/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("제작자 언어가 플랜에 있으면 거부한다", async () => {
  const b = await bed({
    sections: asSections(IDS, (id) =>
      id === "spec" ? { footnote: "유인 파장은 공급처 표기가 없어 적지 않습니다" } : {},
    ),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /제작자 언어/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("컷 프롬프트의 영어는 제작자 언어로 잡지 않는다", async () => {
  // 프롬프트는 화면에 안 나간다. 화면 문자열만 본다.
  const b = await bed({
    cuts: Array.from({ length: 20 }, (_, i) => ({
      id: `c${i + 1}`,
      prompt: "no text, no logos — QA of the sticky surface",
      target_size: "780x780",
    })),
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("brief 에 source_still 이 없으면 거부한다 — GIF 는 이미지에서 시작한다", async () => {
  const b = await bed({
    gif_briefs: Array.from({ length: 6 }, (_, i) => {
      const { source_still: _drop, ...rest } = brief(i);
      return rest;
    }),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /source_still 이 없다/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("source_still 이 플랜의 컷이 아니면 거부한다", async () => {
  const b = await bed({
    gif_briefs: Array.from({ length: 6 }, (_, i) =>
      brief(i, i === 1 ? { source_still: "없는컷" } : {}),
    ),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /플랜의 컷이 아니다/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("한 수단만 쓰면 거부한다 — 둘은 서로 다른 것을 증명한다", async () => {
  const b = await bed({
    gif_briefs: Array.from({ length: 6 }, (_, i) => brief(i, { method: "still-motion" })),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /tibo-sequence 를 쓴 brief 가 없다/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

// ── 소구점 ────────────────────────────────────────────────────────────────
// G2 가 모으고 G3 이 쓴다. 모으기만 하면 3회차와 같다 — flow-map 에는 다 적혀 있었다.

test("소구점을 하나도 쓰지 않으면 거부한다", async () => {
  const b = await bed({
    sections: IDS.map((id) => ({ id, role: ROLE.get(id) ?? "solution", headline: `${id} 한 줄` })),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(
      reasons.some((r) => /소구점 6개 중 0개를 쓴다/.test(r)),
      reasons.join(" / "),
    );
  } finally {
    await b.cleanup();
  }
});

test("공급처 원문에 있는 과장 표현은 쓸 수 있다", async () => {
  // 같은 제품이다. `완벽`, `1위` 같은 표현도 **원문에 있으면** 쓴다.
  // 지어내는 것과 옮기는 것은 다르다.
  const b = await bed(
    { sections: asSections(IDS, (id) => (id === "hero" ? { headline: "업계 1위 완벽 포획" } : {})) },
    { map: `${MAP_TEXT}
- "업계 1위"
` },
  );
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(!reasons.some((r) => /"1위"/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("출처 없는 `완벽` 은 거부한다", async () => {
  // 5회차: 히어로가 `걸어두면 완벽 포획` 으로 발행됐다. 기준작에 있는 표현이라 옮긴 것은
  // 맞지만, `완벽` 이 어느 목록에도 없어서 **지어내도 통과하는 상태**였다.
  // SSOT 는 이미 정확히 판정했다 — "`완벽` 은 근거 없는 절대 표현이다".
  const b = await bed(
    { sections: asSections(IDS, (id) => (id === "hero" ? { headline: "걸어두면 완벽 포획" } : {})) },
    { map: `# flow-map

## 섹션 순서
${IDS.map((id, i) => `${i + 1}. ${id}`).join("\n")}

## 소구점
- "강력 점착"
- "생활방수"
- "50장 대용량"
- "끈적임 오래"
- "한 번 붙으면"
- "바로 포획"
` },
  );
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /"완벽"/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("원문에 없는 과장 표현은 여전히 거부한다", async () => {
  const b = await bed({
    sections: asSections(IDS, (id) => (id === "hero" ? { headline: "업계 1위 상품" } : {})),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /"1위"/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("약사법 표현은 원문에 있어도 거부한다", async () => {
  const b = await bed(
    { sections: asSections(IDS, (id) => (id === "hero" ? { headline: "완치 보장" } : {})) },
    { map: `${MAP_TEXT}
- "완치 보장"
` },
  );
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /"완치"/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});
