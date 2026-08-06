// 소구점 — 공급처와 쿠팡이 **실제로 쓰는** 판매 표현.
//
// 지정한 쿠팡 페이지는 같은 상품이다. 그 페이지의 판매 언어를 안 쓰면서 같은 물건을
// 팔 수는 없다. `references/sales-story.md` 는 이것을 이미 적고 있었다 —
// "공급처에 있는 표현은 과장이어도 쓴다. 그것이 이 제품의 판매 언어다."
//
// 그런데 확인하는 검사가 없었다. 그래서 3회차 flow-map 은 `완벽 포획` `강력 접착`
// `절대 안떨어짐` 을 전부 "옮겨 오지 않는 것" 으로 분류했고, 페이지는 아무 표현도
// 물려받지 못한 채 나왔다. **문서가 시키는 것과 산출물이 하는 것이 반대였다.**
//
// 지어내는 것과 옮기는 것은 다르다. 여기서 세는 것은 **원문에 있는 것**뿐이다.

/** flow-map 에 모아야 할 최소 개수. 이보다 적으면 기준작을 훑기만 한 것이다. */
export const MIN_PHRASES = 6;
/** 플랜이 실제로 써야 할 최소 개수. 모으기만 하는 것을 막는다. */
export const MIN_USED = 3;

const HANGUL = /[가-힣]/;

/**
 * `## 소구점` 절에서 인용된 표현을 뽑는다.
 * 백틱과 큰따옴표(곧은 것·굽은 것)를 받는다 — 표로 적든 목록으로 적든 같게 읽힌다.
 */
export function appealPhrases(markdown) {
  const lines = (markdown ?? "").split("\n");
  const start = lines.findIndex((line) => line.replace(/^#+\s*/, "").trim() === "소구점");
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("#"));
  const block = (end === -1 ? rest : rest.slice(0, end)).join("\n");

  const found = [];
  for (const match of block.matchAll(/`([^`\n]+)`|"([^"\n]+)"|[“]([^”\n]+)[”]/g)) {
    const value = (match[1] ?? match[2] ?? match[3]).trim();
    // 한글이 없는 조각은 표 머리말이나 식별자다. 판매 표현이 아니다.
    if (value && HANGUL.test(value) && !found.includes(value)) found.push(value);
  }
  return found;
}

/** 플랜의 화면 문자열이 아직 쓰지 않은 표현. */
export function unusedAppeals(phrases, planBlob) {
  const blob = String(planBlob ?? "");
  return (phrases ?? []).filter((phrase) => !blob.includes(phrase));
}
