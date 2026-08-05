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

const IDS = ["hero", "problem", "solution", "proof", "spec", "faq"];

const MAP_TEXT = `# flow-map

## 섹션 순서
${IDS.map((id, i) => `${i + 1}. ${id}`).join("\n")}
`;

function draft(overrides = {}) {
  return {
    sections: IDS.map((id) => ({ id, headline: `${id} 한 줄` })),
    cuts: Array.from({ length: 20 }, (_, i) => ({
      id: `c${i + 1}`,
      prompt: `컷 ${i + 1} 설명`,
      target_size: "780x780",
    })),
    gif_briefs: Array.from({ length: 6 }, (_, i) => ({
      id: `g${i + 1}`,
      method: i < 4 ? "hyperframes" : "god-tibo",
    })),
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
    sections: ["hero", "problem", "solution", "proof", "spec", "배송안내"].map((id) => ({
      id,
      headline: `${id} 한 줄`,
    })),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /빠짐 \[faq\]/);
    assert.match(reasons[0], /추가 \[배송안내\]/);
  } finally {
    await b.cleanup();
  }
});

test("순서만 다르고 집합이 같으면 거부하지 않는다", async () => {
  // 흐름을 다시 짜는 것은 G3 의 일이다. 집합이 어긋나는 것만 잡는다.
  const b = await bed({
    sections: [...IDS].reverse().map((id) => ({ id, headline: `${id} 한 줄` })),
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("섹션에 headline 이 없으면 거부한다 — 화면 문자열을 빌더에 박지 않는다", async () => {
  const b = await bed({
    sections: IDS.map((id) => (id === "proof" ? { id } : { id, headline: `${id} 한 줄` })),
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
    sections: IDS.map((id) => ({ id, headline: id === "spec" ? "   " : `${id} 한 줄` })),
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
    sections: IDS.map((id) => ({
      id,
      headline: id === "hero" ? "자외선 차단 100%" : `${id} 한 줄`,
    })),
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
    gif_briefs: Array.from({ length: 6 }, (_, i) => ({
      id: `g${i + 1}`,
      method: i === 2 ? "photoshop" : "hyperframes",
    })),
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
    gif_briefs: Array.from({ length: 9 }, (_, i) => ({ id: `g${i + 1}`, method: "hyperframes" })),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /method hyperframes 가 9개다/);
  } finally {
    await b.cleanup();
  }
});

test("정확히 8개면 거부하지 않는다", async () => {
  const b = await bed({
    gif_briefs: Array.from({ length: 8 }, (_, i) => ({ id: `g${i + 1}`, method: "hyperframes" })),
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});
