// 목업 프롬프트 조립.
//
// 1회차: G4 의 run.mjs 는 체크리스트만 출력하고 끝났다. 실행 경로가 아예 없어서
// 사람이 ChatGPT 대화로 가야 했고, 23분 예산의 게이트가 가장 오래 걸렸다.
// 바로 옆에 god-tibo 가 있었는데 아무도 부르지 않았다.
//
// 2회차: templates.md 1,208줄을 열지 않고 2,754자 프롬프트를 써서 5개 블록이 빠졌다.
// 조립을 스크립트가 하면 블록을 빠뜨릴 방법이 없다.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ORIGIN,
  assemblePrompt,
  blockTitles,
  mockupIndex,
  mockupItems,
  templateBody,
} from "../lib/mockup.mjs";

const TEMPLATE = `# templates.md — 원본

> 메타 설명. 이 줄은 프롬프트가 아니다.

아래는 원본 전문이다.

---

\`\`\`
# 쿠팡 상세페이지 프롬프트 템플릿

## 1. 사용 목적
쿠팡 모바일 상세설명용 세로 이미지를 만든다.

## 2. 제작 규격
폭 780px. 세로형.

## 3. 절대 금지 요소
없는 인증 마크를 그리지 않는다.
\`\`\`
`;

// 필드 이름은 **플랜이 쓰는 그대로**여야 한다. 플랜은 `headline` 을 쓴다.
// 3회차에 여기만 `headline_lines` 였고, 그래서 섹션 메시지가 프롬프트에 한 줄도
// 들어가지 않은 채 목업이 생성됐다. 테스트가 같은 오타를 쓰고 있어서 초록이었다.
const SECTIONS = [
  { id: "hero", role: "hero", headline: "가지에 걸어두면<br>그걸로 끝", subcopy: "한 장이면 됩니다" },
  { id: "problem", role: "pain", headline: "한두 마리라고", subcopy: "그냥 두실 건가요" },
];

test("펜스 안의 원문만 뽑는다 — 파일 자체의 메타 설명은 프롬프트가 아니다", () => {
  const body = templateBody(TEMPLATE);
  assert.ok(body.includes("## 1. 사용 목적"));
  assert.ok(!body.includes("메타 설명"), "파일 머리말이 프롬프트에 섞였다");
});

test("블록 제목을 게이트와 같은 방식으로 읽는다", () => {
  assert.deepEqual(blockTitles(TEMPLATE), ["사용 목적", "제작 규격", "절대 금지 요소"]);
});

test("조립한 프롬프트에 모든 블록이 들어간다", () => {
  const prompt = assemblePrompt({ template: TEMPLATE, section: SECTIONS[0], face: "allow" });
  for (const title of blockTitles(TEMPLATE)) {
    assert.ok(prompt.includes(title), `블록이 빠졌다: ${title}`);
  }
});

test("얼굴 정책이 프롬프트에 문자로 들어간다", () => {
  const prompt = assemblePrompt({ template: TEMPLATE, section: SECTIONS[0], face: "crop-below-chin" });
  assert.ok(prompt.includes("crop-below-chin"));
});

test("섹션의 헤드라인과 역할이 프롬프트에 들어간다", () => {
  const prompt = assemblePrompt({ template: TEMPLATE, section: SECTIONS[0], face: "allow" });
  assert.ok(prompt.includes("가지에 걸어두면"), "플랜의 headline 이 프롬프트에 없다");
  assert.ok(prompt.includes("그걸로 끝"), "두 번째 줄이 빠졌다");
  assert.ok(prompt.includes("한 장이면 됩니다"), "보조 메시지가 빠졌다");
  assert.ok(prompt.includes("hero"));
});

test("섹션마다 하나씩 작업을 만든다", () => {
  const items = mockupItems({ template: TEMPLATE, sections: SECTIONS, face: "allow" });
  assert.equal(items.length, 2);
});

test("무드 레퍼런스가 모든 작업에 붙는다 — identity 사진만으로는 톤이 안 나온다", () => {
  const items = mockupItems({
    template: TEMPLATE,
    sections: SECTIONS,
    face: "allow",
    moods: ["/m/a.png", "/m/b.png"],
  });
  for (const item of items) assert.deepEqual(item.references, ["/m/a.png", "/m/b.png"]);
});

test("무드가 없으면 references 를 만들지 않는다", () => {
  const items = mockupItems({ template: TEMPLATE, sections: SECTIONS, face: "allow", moods: [] });
  assert.ok(!("references" in items[0]));
});

test("색인은 섹션당 파일 하나다 — 콜라주와 중복을 게이트가 잡는다", () => {
  const index = mockupIndex(SECTIONS, ["frame-000.png", "frame-001.png"]);
  assert.deepEqual(index.sections, { hero: "frame-000.png", problem: "frame-001.png" });
});

test("색인이 목업의 출처를 기록한다", () => {
  // 3회차: 이 파일에 `"origin": "self-rendered"` 가 적혀 있었다. 우리가 만든 HTML 을
  // headless Chrome 으로 찍은 스크린샷이었다는 뜻이다. 그러면 디자인 목표가 곧 결과물이고,
  // 목업은 아무것도 끌어올리지 못한다. 게이트가 이 값을 본다.
  assert.equal(mockupIndex(SECTIONS, ["a.png", "b.png"]).origin, ORIGIN);
  assert.equal(ORIGIN, "god-tibo");
});

test("파일 수가 섹션 수와 다르면 색인을 만들지 않는다", () => {
  assert.throws(() => mockupIndex(SECTIONS, ["frame-000.png"]), /COUNT_MISMATCH/);
});
