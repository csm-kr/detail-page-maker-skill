// GIF 의 입력은 이미지다. 이 파일이 그 계약을 들고 있다.
//
// 1회차에 컴포지션 10개 전부 `<img>` 가 0건이었다. 도형에 애니메이션을 걸었고 그래서
// 상업적으로 보이지 않았다. 수단을 둘로 좁히고 둘 다 **발행된 스틸에서 시작**하게 한다.
//
//   still-motion    스틸 한 장 위에 이펙트를 얹는다. 제품은 고정되고 설명이 움직인다
//   tibo-sequence   스틸을 레퍼런스로 다음 장면을 생성해 이어 붙인다. 장면이 움직인다
//
// 두 번째는 god-tibo 가 이미 갖고 있던 경로다 (`prompts` + `references`).
// 스킬이 한 번도 부르지 않았을 뿐이다.
//
// **GIF 조립은 둘 다 `lib/gifasm.mjs` 가 한다.** 여기서는 프레임까지만 만든다 —
// 렌더러에게 조립까지 맡기면 일정 fps 가 되어 프레임마다 머무는 시간을 줄 수 없다.

/** 문자 금지. `g6-stills/scripts/lib/prompt.mjs` 와 같은 이유로 붙인다. */
const NO_TEXT_RULE =
  "No text, letters, numbers, logos, brand names, watermarks or badges anywhere in the image.";

export const METHODS = ["still-motion", "tibo-sequence"];

/**
 * 컴포지션 캔버스와 보간 프레임 수. **찍는 쪽(run.mjs)과 그리는 쪽이 같은 값을 봐야 한다.**
 * 갈리면 마지막 프레임이 잘리거나 애니메이션이 중간에서 끝난다.
 */
export const COMP_SIZE = { width: 780, height: 520 };
export const STILL_MOTION_FRAMES = 12;

/** 컴포지션(`work/comps/<brief>/`) 에서 발행 스틸까지의 상대 경로. */
export function stillHref(cutId, imageExt = ".webp") {
  return `../../../output/media/images/${cutId}${imageExt}`;
}

/**
 * 이펙트. 제품은 고정하고 **설명이 움직인다** — 정보가 늘지 않는 장식은 넣지 않는다.
 * 각 함수는 진행도 `t` (0~1) 를 받아 프레임 스타일을 돌려준다.
 */
const PATTERNS = {
  // 마스크가 오른쪽에서 물러나며 상태가 드러난다.
  // 45% 에서 시작한다 — 첫 프레임이 통째로 가려지면 제품이 안 보이는 GIF 가 된다.
  reveal: `
    veil.style.clipPath = "inset(0 0 0 " + (45 + t * 55).toFixed(2) + "%)";
    veil.style.opacity = "0.92";`,
  // 느린 푸시인. 부위 매크로에 쓴다.
  zoom: `
    shot.style.transform = "scale(" + (1 + t * 0.18).toFixed(4) + ")";
    ring.style.opacity = t > 0.25 ? "1" : "0";
    ring.style.transform = "translate(-50%,-50%) scale(" + (0.6 + t * 0.4).toFixed(3) + ")";`,
  // 자막이 하나씩 바뀐다. 단계·구성 설명에 쓴다.
  sequence: `
    shot.style.transform = "scale(" + (1 + t * 0.05).toFixed(4) + ")";`,
  // 치수선을 그린다. 규격 바로 위에 둔다.
  measure: `
    rule.style.height = (t * 100).toFixed(2) + "%";
    rule.style.opacity = "1";`,
};

/**
 * still-motion 컴포지션. `run.mjs --render` 가 `?f=N` 으로 프레임마다 한 장씩 찍는다.
 * 색은 넘겨받은 토큰만 쓴다 — 여기서 새 색을 만들지 않는다.
 */
export function scaffoldStillMotion({
  brief,
  imageExt = ".webp",
  subtitles = [],
  frames = STILL_MOTION_FRAMES,
  tokens = {},
}) {
  const effect = PATTERNS[brief.pattern];
  if (!effect) {
    throw new Error(
      `UNKNOWN_PATTERN ${brief.id} 의 pattern 이 없거나 모르는 값이다: ${brief.pattern} (${Object.keys(PATTERNS).join(" / ")})`,
    );
  }
  if (!brief.source_still) {
    throw new Error(`SOURCE_STILL_MISSING ${brief.id} 에 source_still 이 없다`);
  }

  const caption = subtitles.length > 0 ? subtitles : (brief.frames ?? []);
  const ink = tokens.ink ?? "#111111";
  const brand = tokens.brand ?? "#FFDF00";
  const paper = tokens.paper ?? "#FFFFFF";

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:${COMP_SIZE.width}px;height:${COMP_SIZE.height}px;overflow:hidden;background:${ink};
 font-family:"Noto Sans KR","Malgun Gothic",sans-serif}
.stage{position:relative;width:100%;height:100%;overflow:hidden}
.shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 50%}
.veil{position:absolute;inset:0;background:${ink};opacity:0}
.ring{position:absolute;left:50%;top:50%;width:220px;height:220px;margin:0;border-radius:50%;
 border:6px solid ${brand};opacity:0;transform:translate(-50%,-50%)}
.rule{position:absolute;left:64px;top:56px;width:6px;height:0;background:${brand};opacity:0}
.cap{position:absolute;left:0;right:0;bottom:34px;text-align:center;color:${paper};
 font-size:38px;font-weight:900;letter-spacing:-.04em;text-shadow:0 2px 10px rgba(0,0,0,.6)}
</style></head><body>
<div class="stage">
  <img class="shot" id="shot" src="${stillHref(brief.source_still, imageExt)}" alt="">
  <div class="veil" id="veil"></div>
  <div class="ring" id="ring"></div>
  <div class="rule" id="rule"></div>
  <div class="cap" id="cap"></div>
</div>
<script>
const N = ${frames};
const f = Number(new URLSearchParams(location.search).get("f") || 0);
const t = N > 1 ? f / (N - 1) : 0;
const shot = document.getElementById("shot");
const veil = document.getElementById("veil");
const ring = document.getElementById("ring");
const rule = document.getElementById("rule");
const cap  = document.getElementById("cap");
const CAPTIONS = ${JSON.stringify(caption)};
if (CAPTIONS.length) cap.textContent = CAPTIONS[Math.min(CAPTIONS.length - 1, Math.floor(t * CAPTIONS.length))];
${effect}
</script>
</body></html>
`;
}

/**
 * tibo-sequence 작업. 스틸이 Image 1 이므로 생성된 프레임이 같은 제품을 유지한다.
 * god-tibo 가 `prompts` 순서대로 프레임을 만든다. 이어 붙이는 것은 `lib/gifasm.mjs` 다.
 */
export function tiboSequenceJob({ brief, stillPath, outputDir, targetSize }) {
  const frames = brief.frames ?? [];
  if (frames.length < 2) {
    throw new Error(`TOO_FEW_FRAMES ${brief.id} 의 frames 가 ${frames.length}개다. 2개 이상이어야 한다`);
  }
  if (!stillPath) throw new Error(`SOURCE_STILL_MISSING ${brief.id} 의 스틸 경로가 없다`);

  // `gif` 를 요청하지 않는다. **프레임까지만** 받고 조립은 `lib/gifasm.mjs` 가 한다.
  // god-tibo 의 조립기는 일정 fps 로만 이어 붙일 수 있어서 프레임마다 머무는 시간을
  // 줄 수 없다 — 3회차의 3프레임 0.48초가 fps 6 을 그대로 쓴 결과였다.
  return {
    size_mode: "controllable",
    target_size: targetSize,
    references: [stillPath],
    workers: Math.min(32, frames.length),
    output_dir: outputDir,
    prompts: frames.map(
      (step) =>
        `Keep the exact same product, colour, framing and lighting as the reference image. ${step}\n${NO_TEXT_RULE}`,
    ),
  };
}

/** 컴포지션이 그 스틸을 실제로 쓰는가. 1회차에는 10개 전부 false 였다. */
export function compUsesStill(html, cutId) {
  if (!html || !cutId) return false;
  return new RegExp(`src="[^"]*/${cutId}\\.(webp|png|jpe?g)"`).test(html);
}
