// 기준작 대비 상업 강도. `references/benchmark/` 의 두 파일이 하한의 근거다.
//
// 왜 이것들만 재는가. 다섯 지표는 전부 "이미지를 크게 쓰고 그 위에 말을 얹었는가" 를
// 서로 다른 각도에서 묻는다. 밋밋한 페이지는 다섯 개 중 최소 셋에 걸린다.
// 취향을 재지 않는다 — 취향은 못 재고, 이 다섯은 잰다.

// 팔레트의 과감함은 여기서 재지 않는다. CSS 만 보면 3px 칩의 배경과 한 화면을 덮는
// 배경을 가를 수 없어서, 재는 척하면 밋밋한 페이지가 그 항목을 통과한다.
// 색은 `references/benchmark/BENCHMARK.md` 가 기준작을 보고 판단하게 한다.

/** `<style>` 블록만 모은다. 인라인 style 속성은 규칙이 아니므로 뺀다. */
function styles(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
}

/** `:root` 의 `--name: #hex` 를 실제 값으로 바꾼다. 토큰 뒤에 숨은 색을 놓치지 않는다. */
function resolveVars(css) {
  const tokens = new Map();
  for (const block of css.matchAll(/:root\s*\{([\s\S]*?)\}/g)) {
    for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
      tokens.set(name, value);
    }
  }
  return css.replace(/var\(\s*(--[\w-]+)[^)]*\)/g, (whole, name) => tokens.get(name) ?? whole);
}

/** 화면 하나를 채울 만한 고정 높이. 300px 미만은 부품이지 무대가 아니다. */
const STAGE_MIN_PX = 300;

export function measure(html) {
  const css = resolveVars(styles(html));

  const fontSizes = [...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((m) =>
    Number(m[1]),
  );
  // 선언을 센다. 규칙 하나를 모든 섹션에 돌려 쓰면 여기서 1이다 — 그게 요점이다.
  // 기준작은 장면마다 다른 크기의 무대를 준다. 한 크기로 통일한 페이지가 밋밋한 페이지다.
  const stages = [...css.matchAll(/\b(?:min-)?height\s*:\s*(\d+(?:\.\d+)?)px/gi)].filter(
    (match) => Number(match[1]) >= STAGE_MIN_PX,
  );

  return {
    sections: (html.match(/<section\b/gi) ?? []).length,
    fullBleed: (css.match(/object-fit\s*:\s*cover/gi) ?? []).length,
    overlays: (css.match(/position\s*:\s*absolute/gi) ?? []).length,
    visualStages: stages.length,
    maxTypePx: fontSizes.length === 0 ? 0 : Math.max(...fontSizes),
    typeScale: new Set(fontSizes).size,
  };
}

/**
 * 하한 = **두 기준작 실측의 최솟값**. 고르는 값이 아니라 유도되는 값이다.
 * `tests/benchmark.test.mjs` 가 `===` 로 확인한다.
 *
 * 처음에는 여기 안전하게 낮춘 값을 적었다 (`sections: 10`, `maxTypePx: 56`). 그래서
 * 기준작의 절반짜리 페이지가 전부 통과했고 "화려하지 않다" 는 말을 들었다.
 * 낮춰 잡은 하한은 하한이 아니라 면제다.
 *
 * 올리고 싶으면 여기가 아니라 `references/benchmark/` 를 바꾼다.
 */
export const FLOOR = {
  sections: 13,
  fullBleed: 4,
  overlays: 3,
  visualStages: 8,
  maxTypePx: 116,
  typeScale: 21,
};

const LABEL = {
  sections: "섹션 수",
  fullBleed: "꽉 채운 이미지 (object-fit:cover)",
  overlays: "이미지 위 오버레이 (position:absolute)",
  visualStages: "시각 무대 (고정 높이 300px 이상 선언)",
  maxTypePx: "가장 큰 글자 크기(px)",
  typeScale: "글자 크기 가짓수",
};

/** 하한에 못 미친 항목을 사람이 읽을 문장으로. 빈 배열이면 통과다. */
export function shortfalls(metrics) {
  return Object.keys(FLOOR)
    .filter((key) => metrics[key] < FLOOR[key])
    .map((key) => `${LABEL[key]} ${metrics[key]} < ${FLOOR[key]}`);
}
