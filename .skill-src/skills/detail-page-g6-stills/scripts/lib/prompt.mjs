// 스틸 생성 작업을 조립한다. 프롬프트에 무엇이 반드시 붙는지가 여기 한 곳에 있다.
//
// 1회차에 30장이 각자 따로 생성됐고 9장은 없는 브랜드와 영문 배지를 이미지에 구워 왔다.
// 둘 다 프롬프트 조립의 문제이지 판정의 문제가 아니었다 — 판정은 제 몫을 했고,
// 18장이 탈락해 발행 수량 하한을 못 넘겼다.

/**
 * 문자·브랜드 금지. 영어로 쓴다 — 프롬프트를 받는 쪽이 영어를 더 정확히 따른다.
 * 이 한 줄이 없어서 PUREHABIT, LeafShield, NON-TOXIC 이 이미지에 구워졌다.
 */
export const NO_TEXT_RULE =
  "No text, letters, numbers, logos, brand names, watermarks, badges, " +
  "packaging print or label typography anywhere in the image.";

/** 컷 하나의 최종 프롬프트. */
function compose(body, face) {
  return [body, `Face policy: ${face}.`, NO_TEXT_RULE].filter(Boolean).join("\n");
}

/**
 * 레퍼런스 목록. 기준 이미지가 Image 1 이다 — god-tibo 가 첫 장을 canonical base 로 잡는다.
 * 기준 컷 자신은 자기를 참조하지 않는다.
 *
 * `no_product` 컷에는 **하나도 붙이지 않는다.** 문제 제기·설치 전 컷의 프롬프트는
 * "제품을 넣지 않는다" 인데 Image 1 로 제품 사진을 주면 canonical base 가 그 문장을
 * 이긴다. check.mjs 가 판정 기록에서 같은 것을 막고 있으므로 생성도 같은 규칙을 따른다.
 */
function references(cut, base, baseCut) {
  if (cut.no_product === true) return {};
  if (!base || cut.id === baseCut) {
    return cut.references?.length ? { references: [...cut.references] } : {};
  }
  return { references: [base, ...(cut.references ?? [])] };
}

/** 컷 목록 → god-tibo `items`. */
export function buildItems(cuts, { face, base = null, baseCut = null } = {}) {
  return cuts.map((cut) => ({
    prompt: compose(cut.prompt, face),
    ...references(cut, base, baseCut),
  }));
}

/**
 * 탈락한 컷만. `regen_job` 이 있으면 그것을, 없으면 원래 프롬프트를 쓴다.
 * 채택분은 건드리지 않는다 — 전체를 다시 구우면 통과한 컷까지 날아간다.
 */
export function regenItems(cuts, selection, { face, base = null, baseCut = null } = {}) {
  const rejected = new Map(
    (selection?.entries ?? [])
      .filter((entry) => entry.decision === "reject")
      .map((entry) => [entry.cut, entry.regen_job]),
  );
  return cuts
    .filter((cut) => rejected.has(cut.id))
    .map((cut) => ({
      prompt: compose(rejected.get(cut.id) || cut.prompt, face),
      ...references(cut, base, baseCut),
    }));
}

/** 다시 구운 컷의 id 순서. 결과 파일을 어느 컷에 되돌릴지 알려면 필요하다. */
export function regenCutIds(cuts, selection) {
  const rejected = new Set(
    (selection?.entries ?? [])
      .filter((entry) => entry.decision === "reject")
      .map((entry) => entry.cut),
  );
  return cuts.filter((cut) => rejected.has(cut.id)).map((cut) => cut.id);
}
