// 컴포지션 색인. check.mjs 가 이 형태를 그대로 본다.
//
// 색인은 brief ↔ 컴포지션 ↔ GIF 의 대응이다. 세 개가 어긋나면 "GIF 는 있는데 무엇을
// 보여주는지 아무도 모르는" 2회차 상태로 돌아간다.

/** 한 수단에 몰리는 것을 막는 상한. check.mjs 와 같은 값이어야 한다. */
export const METHOD_CAP = 8;

/**
 * 색인 항목 하나.
 *   brief   플랜의 gif_brief.id
 *   meta    컴포지션 디렉터리의 meta.json — `{ method, subtitles }`
 *   comp    컴포지션 원본 파일의 프로젝트 상대 경로 (디렉터리가 아니다)
 *   gif     구운 GIF 의 프로젝트 상대 경로
 */
export function buildEntry({ brief, meta, comp, gif, sourceStill = null, frames = 0 }) {
  return {
    brief,
    method: meta?.method ?? null,
    subtitles: meta?.subtitles ?? [],
    // GIF 의 입력이 된 스틸. 이 값이 비면 도형에서 시작했다는 뜻이다.
    source_still: sourceStill ?? meta?.source_still ?? null,
    frames,
    comp,
    gif,
  };
}

/** 수단이 한쪽으로 쏠렸는지. 편한 경로로 몰리는 것을 스크립트도 먼저 말한다. */
export function methodOverflow(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.method, (counts.get(entry.method) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > METHOD_CAP)
    .map(([method, count]) => `${method ?? "없음"} ${count}개`);
}

/** brief 의 핵심 명사가 컴포지션에 실제로 들어갔는가. check.mjs 와 같은 판정이다. */
export function missingKeywords(entry, brief) {
  const blob = JSON.stringify(entry);
  return (brief?.keywords ?? []).filter((word) => !blob.includes(word));
}

/** page-plan 의 용어 집합 밖에 있는 자막. */
export function straySubtitles(entry, terms) {
  if (!terms?.length) return [];
  return (entry.subtitles ?? []).filter((subtitle) => !terms.includes(subtitle));
}
