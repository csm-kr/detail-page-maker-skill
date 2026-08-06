// 목업 프롬프트를 조립한다.
//
// 조립을 스크립트가 하는 이유는 하나다 — 사람이 하면 블록을 빠뜨린다.
// 2회차에 1,208줄 템플릿을 열지 않고 2,754자를 손으로 써서 5개 블록이 빠졌고,
// 3회차에는 실행 경로 자체가 없어 23분 예산이 전부 손작업으로 갔다.

import { headings } from "../../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

/**
 * 템플릿의 **원문**. 파일 머리말(이 파일이 무엇인지 설명하는 부분)은 프롬프트가 아니다.
 * 원문은 ``` 펜스 안에 있다. 펜스가 없으면 전체를 쓴다.
 */
export function templateBody(markdown) {
  const fenced = /```[a-z]*\n([\s\S]*?)```/.exec(markdown ?? "");
  return (fenced ? fenced[1] : (markdown ?? "")).trim();
}

/** 블록 제목. `check.mjs` 와 **같은 방식**이어야 한다 — 다르면 조립하고도 거부당한다. */
export function blockTitles(markdown) {
  return headings(templateBody(markdown), 2).map((title) => title.replace(/^\d+\.\s*/, ""));
}

/**
 * 섹션 하나의 장면 지시. 화면 문자열은 넣지 않는다 — 이미지에 글자를 굽지 않는다.
 *
 * 필드 이름은 **플랜이 쓰는 그대로** 읽는다. 3회차에 여기만 `headline_lines` 였고
 * 플랜은 `headline` 이었다. 조용히 빈 문자열이 되어 섹션 메시지가 한 줄도 들어가지
 * 않은 채 목업이 생성됐다. 조립기에서 같은 일이 한 번 있었고 여기서 또 있었다.
 */
function scene(section) {
  const lines = [
    `## 이번 장`,
    `- 섹션 id: ${section.id}`,
    `- 역할: ${section.role ?? "solution"}`,
  ];
  const head = String(section.headline ?? "").replace(/<br\s*\/?>/gi, " ").trim();
  if (head) lines.push(`- 이 장이 전할 메시지: ${head}`);
  if (section.subcopy) lines.push(`- 보조 메시지: ${section.subcopy}`);
  lines.push(
    "- 위 메시지는 **장면으로** 표현한다. 이미지 안에 한글이나 영문 글자를 그리지 않는다.",
  );
  return lines.join("\n");
}

/** 템플릿 원문 + 이번 장 + 얼굴 정책. 이 셋이 한 프롬프트다. */
export function assemblePrompt({ template, section, face }) {
  return [templateBody(template), scene(section), `## 얼굴 정책\n- ${face}`].join("\n\n");
}

/** god-tibo `items`. 무드 레퍼런스는 모든 장에 같이 붙어 톤을 맞춘다. */
export function mockupItems({ template, sections, face, moods = [] }) {
  return sections.map((section) => ({
    prompt: assemblePrompt({ template, section, face }),
    ...(moods.length > 0 ? { references: [...moods] } : {}),
  }));
}

/**
 * 목업이 어디서 왔는가. 게이트가 이 값을 요구한다.
 *
 * 3회차 `mockup-index.json` 에는 `"origin": "self-rendered"` 가 적혀 있었다 —
 * 우리가 만든 `mockup.html` 을 headless Chrome 으로 찍은 스크린샷이었다.
 * 그러면 **디자인 목표가 곧 결과물**이고 목업은 아무것도 끌어올리지 못한다.
 * G4 가 존재하는 이유가 사라진다. 목업은 밖에서 와야 한다.
 */
export const ORIGIN = "god-tibo";

/**
 * 섹션↔파일 1:1. 생성기가 입력 순서대로 파일을 쓰므로 순서가 곧 대응이다.
 * 수가 다르면 대응을 만들지 않는다 — 어긋난 색인은 없는 색인보다 나쁘다.
 */
export function mockupIndex(sections, files) {
  if (sections.length !== files.length) {
    throw new Error(
      `MOCKUP_COUNT_MISMATCH 섹션 ${sections.length}개 · 파일 ${files.length}개. 대응을 만들 수 없다`,
    );
  }
  return {
    origin: ORIGIN,
    sections: Object.fromEntries(sections.map((section, index) => [section.id, files[index]])),
  };
}
