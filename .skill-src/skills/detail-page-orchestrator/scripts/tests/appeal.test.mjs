// 소구점. **같은 제품을 파는 페이지가 그 제품의 판매 언어를 안 쓰면 팔리지 않는다.**
//
// `references/sales-story.md` 는 이미 "공급처와 쿠팡이 쓰는 판매 표현도 그대로 쓴다"
// 라고 적고 있었다. 그런데 확인하는 검사가 없었고, 그 사이 3회차 flow-map 은
// `완벽 포획` `강력 접착` 같은 표현을 전부 "옮겨 오지 않는 것" 으로 분류했다.
// 문서가 시키는 것과 산출물이 하는 것이 반대였고 아무도 몰랐다.

import assert from "node:assert/strict";
import test from "node:test";

import { MIN_PHRASES, MIN_USED, appealPhrases, unusedAppeals } from "../lib/appeal.mjs";

const MAP = `# flow-map

## 섹션 순서
1. hero

## 소구점

공급처와 쿠팡이 실제로 쓰는 표현. **원문 그대로** 옮긴다.

| 표현 | 출처 |
| --- | --- |
| \`강력 점착\` | 공급처 |
| \`생활방수\` | 공급처 |
| \`50장 대용량\` | 공급처 |
| \`완벽 포획\` | 쿠팡 |
| \`끈적임 오래 지속\` | 쿠팡 |
| \`한 번 붙으면 끝\` | 쿠팡 |

## 디자인 분위기
`;

test("원문 표현을 뽑는다", () => {
  assert.deepEqual(appealPhrases(MAP), [
    "강력 점착",
    "생활방수",
    "50장 대용량",
    "완벽 포획",
    "끈적임 오래 지속",
    "한 번 붙으면 끝",
  ]);
});

test("큰따옴표로 적어도 뽑는다", () => {
  const map = `## 소구점\n- "완벽 차단" (쿠팡)\n- “두 배 오래” (공급처)\n`;
  assert.deepEqual(appealPhrases(map), ["완벽 차단", "두 배 오래"]);
});

test("절이 없으면 빈 배열이다", () => {
  assert.deepEqual(appealPhrases("# flow-map\n\n## 섹션 순서\n1. hero\n"), []);
});

test("한글이 없는 조각은 표현으로 세지 않는다", () => {
  // 표 머리말의 `표현` `출처` 같은 것과 코드 조각을 걸러낸다.
  const map = "## 소구점\n- `hero` 는 id 다\n- `강력 점착`\n";
  assert.deepEqual(appealPhrases(map), ["강력 점착"]);
});

test("플랜이 쓰지 않은 표현을 지목한다", () => {
  const plan = { sections: [{ headline: "강력 점착으로<br>한 번 붙으면 끝" }] };
  const unused = unusedAppeals(appealPhrases(MAP), JSON.stringify(plan));
  assert.ok(!unused.includes("강력 점착"));
  assert.ok(!unused.includes("한 번 붙으면 끝"));
  assert.ok(unused.includes("완벽 포획"));
});

test("하한은 수집과 사용 양쪽에 있다", () => {
  // 모으기만 하고 안 쓰면 3회차와 같다 — flow-map 에는 다 적혀 있었다.
  assert.ok(MIN_PHRASES >= 6);
  assert.ok(MIN_USED >= 3);
  assert.ok(MIN_USED <= MIN_PHRASES);
});
