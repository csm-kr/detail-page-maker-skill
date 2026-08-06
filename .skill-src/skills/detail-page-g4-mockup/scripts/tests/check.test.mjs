// G4 판정 단위 테스트.
//
// 2회차 결함: templates.md(1,208줄)를 열지 않아 5블록이 빠졌고, 무드 레퍼런스가 0장이었고,
// 목업이 콜라주 2장 + 중복 1장이었는데 **개수 검사가 통과시켰다.**
// 그래서 블록 전량 대조와 섹션↔파일 1:1 을 본다.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { check } from "../check.mjs";
import { ORIGIN } from "../lib/mockup.mjs";
import {
  headings,
  text,
} from "../../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const REF = path.join("work", "design-ref");
const IDS = ["hero", "problem", "solution"];

const GUIDE = `# DESIGN-GUIDE

## 팔레트
배경 #F5F5F5 · 본문 #1A1A1A · 강조 #C8A96E · 보조 #8A8A8A

## 구성 요소
- 라운드 카드 16px
`;

const HARVEST = `# harvest

## 가져올 것
- 팔레트

## 수확 금지
- 목업의 한글 텍스트와 비율은 가져오지 않는다
`;

/** templates.md 의 블록 이름을 전량 담은 프롬프트. 실제 문서에서 뽑는다. */
async function fullPrompt(modelFace = "crop-below-chin") {
  const template = await text(
    SKILL_ROOT,
    path.join("references", "templates.md"),
  );
  const blocks = headings(template, 2).map((title) =>
    title.replace(/^\d+\.\s*/, ""),
  );
  return `${blocks.join("\n")}\n얼굴 정책: ${modelFace}\n`;
}

async function bed({
  prompt,
  moods = ["mood-1.png"],
  index = {
    origin: ORIGIN,
    sections: Object.fromEntries(IDS.map((id) => [id, `${id}.png`])),
  },
  guide = GUIDE,
  harvest = HARVEST,
} = {}) {
  const b = await makeCheckbed();
  await b.write(
    path.join(REF, "prompts-sent", "batch-1.md"),
    prompt ?? (await fullPrompt()),
  );
  for (const name of moods)
    await b.write(path.join(REF, "mood", name), "무드 자리\n");
  if (index !== null) await b.write(path.join(REF, "mockup-index.json"), index);
  if (guide !== null) await b.write(path.join(REF, "DESIGN-GUIDE.md"), guide);
  if (harvest !== null) await b.write(path.join(REF, "harvest.md"), harvest);
  await b.write(path.join("work", "flow-plan.draft.json"), {
    sections: IDS.map((id) => ({ id, headline: `${id} 한 줄` })),
  });
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

test("templates.md 의 블록이 프롬프트에 빠지면 몇 개인지와 함께 거부한다", async () => {
  const full = await fullPrompt();
  const b = await bed({ prompt: full.replace("절대 금지 요소\n", "") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /블록이 프롬프트에 빠졌다 \(1\/12\)/);
    assert.match(reasons[0], /절대 금지 요소/);
  } finally {
    await b.cleanup();
  }
});

test("보낸 프롬프트가 없으면 거부한다", async () => {
  const b = await makeCheckbed();
  try {
    await b.write(path.join(REF, "mood", "m.png"), "x");
    await b.write(path.join(REF, "mockup-index.json"), { sections: {} });
    await b.write(path.join(REF, "DESIGN-GUIDE.md"), GUIDE);
    await b.write(path.join(REF, "harvest.md"), HARVEST);
    const { reasons } = await check(b.ctx);
    assert.match(reasons.join("\n"), /prompts-sent\/ 가 비어 있다/);
  } finally {
    await b.cleanup();
  }
});

test("무드 레퍼런스가 0장이면 거부한다", async () => {
  const b = await bed({ moods: [] });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /무드 레퍼런스가 없다/);
  } finally {
    await b.cleanup();
  }
});

test("mockup-index.json 이 없으면 거부한다", async () => {
  const b = await bed({ index: null });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /섹션↔목업 파일 1:1 분류를 기록한다/);
  } finally {
    await b.cleanup();
  }
});

test("목업이 없는 섹션이 있으면 그 섹션을 지목한다", async () => {
  const b = await bed({
    index: {
      origin: ORIGIN,
      sections: { hero: "hero.png", problem: "problem.png" },
    },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /목업이 없는 섹션: solution/);
  } finally {
    await b.cleanup();
  }
});

test("한 목업 파일이 두 섹션에 쓰이면 거부한다 — 개수 검사가 놓친 중복이다", async () => {
  const b = await bed({
    index: {
      origin: ORIGIN,
      sections: {
        hero: "hero.png",
        problem: "hero.png",
        solution: "solution.png",
      },
    },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /여러 섹션에 쓰였다: hero\.png/);
  } finally {
    await b.cleanup();
  }
});

test("한 섹션에 파일이 둘이면 콜라주로 본다", async () => {
  const b = await bed({
    index: {
      origin: ORIGIN,
      sections: {
        hero: ["hero-a.png", "hero-b.png"],
        problem: "problem.png",
        solution: "solution.png",
      },
    },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /섹션 hero 에 파일이 2개다/);
  } finally {
    await b.cleanup();
  }
});

test("얼굴 정책이 보낸 프롬프트에 없으면 거부한다", async () => {
  const template = await text(
    SKILL_ROOT,
    path.join("references", "templates.md"),
  );
  const blocks = headings(template, 2).map((title) =>
    title.replace(/^\d+\.\s*/, ""),
  );
  const b = await bed({ prompt: `${blocks.join("\n")}\n` });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(
      reasons[0],
      /얼굴 정책 "crop-below-chin" 이 보낸 프롬프트에 없다/,
    );
  } finally {
    await b.cleanup();
  }
});

test("DESIGN-GUIDE 의 실측 hex 가 4개 미만이면 거부한다", async () => {
  const b = await bed({
    guide: GUIDE.replace(" · 보조 #8A8A8A", ""),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /실측 hex 가 3개다/);
  } finally {
    await b.cleanup();
  }
});

test("DESIGN-GUIDE 에 구성 요소 절이 없으면 거부한다 — 팔레트만 뽑으면 G7 이 옮길 것이 없다", async () => {
  const b = await bed({ guide: GUIDE.replace("## 구성 요소", "## 잡담") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /구성 요소 절이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("harvest.md 에 수확 금지 항목이 없으면 거부한다", async () => {
  const b = await bed({ harvest: "# harvest\n\n## 가져올 것\n- 팔레트\n" });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /수확 금지 항목이 없다/);
  } finally {
    await b.cleanup();
  }
});

// ── 목업이 어디서 왔는가 ──────────────────────────────────────────────────
// 3회차: `mockup-index.json` 에 `"origin": "self-rendered"` 가 적혀 있었다.
// 우리가 만든 mockup.html 을 headless Chrome 으로 찍은 스크린샷이었다.
// 디자인 목표가 곧 결과물이면 G4 는 아무것도 끌어올리지 못한다. 여섯 검사가 전부 통과했다.

test("우리 HTML 을 찍은 스크린샷을 목업으로 받지 않는다", async () => {
  const b = await bed({
    index: {
      origin: "self-rendered",
      sections: Object.fromEntries(IDS.map((id) => [id, `${id}.png`])),
    },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(
      reasons.some((r) => /목업의 출처가/.test(r)),
      reasons.join(" / "),
    );
  } finally {
    await b.cleanup();
  }
});

test("출처가 아예 없어도 거부한다", async () => {
  const b = await bed({
    index: { sections: Object.fromEntries(IDS.map((id) => [id, `${id}.png`])) },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(
      reasons.some((r) => /목업의 출처가/.test(r)),
      reasons.join(" / "),
    );
  } finally {
    await b.cleanup();
  }
});
