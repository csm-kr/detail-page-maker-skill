// G5 판정 단위 테스트.
//
// 2회차 최대 누락: DESIGN-GUIDE 를 쓰고 프롬프트에 넣지 않았다. 주입 0건인 채로 스틸
// 30장이 생성됐다. 발행 플랜을 G3 초안과 분리한 덕에 **건너뛰면 파일이 아예 없고**,
// 있어도 프롬프트 안의 hex·키워드를 대조한다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const PLAN = "flow-plan.json";
const DRAFT = path.join("work", "flow-plan.draft.json");
const GUIDE = path.join("work", "design-ref", "DESIGN-GUIDE.md");

const GUIDE_TEXT = `# DESIGN-GUIDE

## 팔레트
- brand \`#3189FD\`
- navy \`#0F2540\`
- paper \`#F5F5F5\`

## 배경
밝은 회색 스튜디오 배경, 부드러운 그림자
`;

const TOKENS = { brand: "#3189FD", navy: "#0F2540", paper: "#F5F5F5" };
const IDS = ["c1", "c2", "c3"];

const cut = (id, prompt) => ({
  id,
  prompt: prompt ?? `${id} 컷. 스튜디오 배경. 강조 색 #3189FD`,
  target_size: "780x780",
});

async function bed({ plan, draftIds = IDS, guide = GUIDE_TEXT } = {}) {
  const b = await makeCheckbed();
  if (guide !== null) await b.write(GUIDE, guide);
  await b.write(DRAFT, { cuts: draftIds.map((id) => cut(id)) });
  if (plan !== null) {
    await b.write(PLAN, {
      tokens: TOKENS,
      cuts: IDS.map((id) => cut(id)),
      policy: { model_face: "crop-below-chin" },
      ...plan,
    });
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

test("발행 플랜이 없으면 그 사유 하나만 낸다 — 주입을 건너뛴 상태가 파일의 부재로 드러난다", async () => {
  const b = await bed({ plan: null });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /주입을 건너뛰면 이 파일이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("토큰이 가이드와 다르면 어느 쪽이 무엇인지 함께 낸다", async () => {
  const b = await bed({ plan: { tokens: { ...TOKENS, brand: "#FF0000" } } });
  try {
    const { reasons } = await check(b.ctx);
    // 브랜드 색이 바뀌면 프롬프트의 hex 도 어긋난다. 두 사유가 같은 원인을 가리킨다.
    assert.match(reasons.join("\n"), /토큰 brand 이 가이드와 다르다 \(가이드 #3189FD · 플랜 #FF0000\)/);
  } finally {
    await b.cleanup();
  }
});

test("토큰이 아예 없으면 거부한다", async () => {
  const b = await bed({ plan: { tokens: {} } });
  try {
    const { reasons } = await check(b.ctx);
    assert.match(reasons.join("\n"), /발행 플랜에 tokens 가 없다/);
  } finally {
    await b.cleanup();
  }
});

test("브랜드 색이 프롬프트에 없는 컷을 지목한다", async () => {
  const b = await bed({
    plan: { cuts: [cut("c1"), cut("c2", "c2 컷. 스튜디오 배경"), cut("c3")] },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /브랜드 색 #3189FD 이 프롬프트에 없는 컷 1개: c2/);
  } finally {
    await b.cleanup();
  }
});

test("소문자로 적은 hex 도 주입된 것으로 본다", async () => {
  const b = await bed({
    plan: { cuts: IDS.map((id) => cut(id, `${id} 컷. 스튜디오 배경. 강조 #3189fd`)) },
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("가이드 배경 키워드가 없는 컷을 지목한다", async () => {
  const b = await bed({
    plan: { cuts: [cut("c1"), cut("c2", "c2 컷. 흰 벽. #3189FD"), cut("c3")] },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /가이드 배경 키워드가 없는 컷 1개: c2/);
  } finally {
    await b.cleanup();
  }
});

test("주입 전후로 컷이 늘면 거부한다 — 주입은 프롬프트만 바꾼다", async () => {
  const b = await bed({ plan: { cuts: [...IDS, "c4"].map((id) => cut(id)) } });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /컷 집합이 달라졌다/);
  } finally {
    await b.cleanup();
  }
});

test("주입 전후로 컷이 줄어도 거부한다", async () => {
  const b = await bed({ plan: { cuts: [cut("c1"), cut("c2")] } });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /컷 집합이 달라졌다/);
  } finally {
    await b.cleanup();
  }
});

test("발행 플랜에 얼굴 정책이 없으면 거부한다 — G6 선별이 이 값을 본다", async () => {
  const b = await bed({ plan: { policy: {} } });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /policy\.model_face 가 없다/);
  } finally {
    await b.cleanup();
  }
});

test("가이드에 이름 붙은 팔레트가 없으면 주입 검사로 넘어가지 않는다", async () => {
  // 가이드가 부실하면 무엇을 주입할지 정할 수 없다. 원인을 가이드로 돌린다.
  const b = await bed({ guide: "# DESIGN-GUIDE\n\n## 팔레트\n파랑과 남색을 쓴다\n" });
  try {
    const { reasons } = await check(b.ctx);
    assert.match(reasons.join("\n"), /이름 붙은 색이 3개 미만/);
    assert.equal(
      reasons.some((r) => r.includes("프롬프트에 없는 컷")),
      false,
      "가이드를 못 읽는 상태에서 컷을 탓하지 않는다",
    );
  } finally {
    await b.cleanup();
  }
});
