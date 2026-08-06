// 고객 화면에 나가면 안 되는 말. 결정적으로만 잡는다.
//
// 두 종류다.
//   1. 제작자가 자기 작업을 설명하는 말 — "적었습니다", "표기가 없어"
//   2. 파이프라인 내부 용어 — 프롬프트, 해시, QA, 승인
//
// 둘 다 "이 페이지는 누가 만들었나" 를 화면에 드러낸다. 소비자는 그것을 알 필요가 없다.
// 공급처가 이미 쓰는 판매 표현(강력 점착, 생활방수)은 여기서 막지 않는다 — 쓴다.

/**
 * 잡을 것. 부정문 어미까지 붙여 좁힌다.
 * `확인` 하나로는 "구매 전에 확인하세요" 까지 잡히므로 그렇게 쓰지 않는다.
 */
const PATTERNS = [
  // 1. 제작자가 자기 작업을 말한다
  /적(?:었|습니|지\s*않|어\s*두)[가-힣]*/,
  /(?:그대로|양쪽을)\s*(?:옮|가져)[가-힣]*/,
  /모른다[가-힣]*/,
  /모르는\s*(?:것|부분|점)/,
  /재구성(?:했|한|해)[가-힣]*/,

  // 2. 근거의 부재를 화면에서 설명한다
  /표기(?:가|를)\s*(?:없|서로|그대로)[가-힣]*/,
  /확인되지\s*않[가-힣]*/,
  /확인된\s*(?:바|것)[가-힣]*\s*없/,
  /근거(?:가)?\s*없[가-힣]*/,
  /출처(?:가)?\s*없[가-힣]*/,
  /판단하지\s*않[가-힣]*/,
  /제조사\s*확인/,

  // 3. 파이프라인 내부 용어
  /프롬프트/,
  /해시|sha-?256/i,
  /\bQA\b/i,
  /승인\s*(?:상태|대기|완료|여부)/,
  /게이트\s*(?:통과|검사)/,
];

/**
 * 걸린 곳을 문장 단위로 돌려준다. 빈 배열이면 통과다.
 * `sample` 은 사람이 원문에서 찾을 수 있을 만큼만 잘라 준다.
 */
export function producerLanguage(value) {
  const found = [];
  const seen = new Set();
  for (const pattern of PATTERNS) {
    const match = new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(value ?? "");
    if (!match) continue;
    const at = match.index;
    const sample = (value ?? "")
      .slice(Math.max(0, at - 12), at + match[0].length + 12)
      .replace(/\s+/g, " ")
      .trim();
    if (seen.has(sample)) continue;
    seen.add(sample);
    found.push({ pattern: String(pattern), sample });
  }
  return found;
}
