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

/**
 * 타임라인 길이(초). 프레임 12장을 이 안에서 고르게 뽑는다.
 * GIF 가 프레임마다 얼마나 머무는지는 `lib/gifasm.mjs` 가 따로 정한다 —
 * 여기는 **움직임의 시간**이고 거기는 **보여 주는 시간**이다.
 */
export const TIMELINE_SEC = 1.2;

/**
 * 컴포지션이 쓰는 자산. **전부 컴포지션 디렉터리 안에 있어야 한다.**
 *
 * hyperframes 는 컴포지션 디렉터리를 웹 루트로 서빙하고 `../` 를 거부한다 —
 *   [StaticGuard] asset path(s) traversing above the project root with "../"
 *   ✗ gsap is not defined
 * 그러면 타임라인이 등록되지 않고 **12프레임이 전부 같은 그림**으로 나오는데
 * 렌더는 성공이라고 한다. 조용히 같은 그림이 나오는 실패다.
 *
 * `from` 은 워크스페이스 기준, `as` 는 컴포지션 안의 이름이다.
 * 스틸 파일 이름에는 컷 id 를 남긴다 — 게이트가 그것으로 comp↔컷 대응을 본다.
 */
export function compositionAssets(brief, imageExt = ".webp") {
  return [
    { from: "motion/node_modules/gsap/dist/gsap.min.js", as: "gsap.min.js" },
    { from: "runtime/fonts/NotoSansKR-VF.ttf", as: "font.ttf" },
    {
      from: null, // 회차 폴더 기준이다. run.mjs 가 project 를 붙인다
      project: `output/media/images/${brief.source_still}${imageExt}`,
      as: `${brief.source_still}${imageExt}`,
    },
  ];
}

/** 컴포지션 안에서의 스틸 이름. 밖을 가리키지 않는다. */
export function stillHref(cutId, imageExt = ".webp") {
  return `./${cutId}${imageExt}`;
}

/**
 * 프레임을 찍을 시각. **양 끝을 포함한다.**
 *
 * hyperframes 의 `--frames N` 은 마지막을 9.7/10 지점에서 찍는다. 그러면 결과 상태에
 * 도달하지 못한 프레임이 마지막이 되고 "결과를 최소 1초 유지한다"(MR-006) 가 깨진다.
 * 그래서 `--at` 으로 직접 준다.
 */
export function snapshotTimes(frames, duration = TIMELINE_SEC) {
  if (frames <= 1) return [0];
  return Array.from({ length: frames }, (_, index) =>
    Number(((index * duration) / (frames - 1)).toFixed(3)),
  );
}

/** `hyperframes.json`. 이것이 없으면 CLI 가 디렉터리를 프로젝트로 보지 않는다. */
export function compositionConfig() {
  return {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    paths: { blocks: ".", components: "./components", assets: "." },
    media: { autoProxy: false },
  };
}

/**
 * 이펙트. 제품은 고정하고 **설명이 움직인다** — 정보가 늘지 않는 장식은 넣지 않는다.
 *
 * 규칙 둘을 지킨다.
 *   1. 절대값만 쓴다. `+=` 상대 트윈은 양방향 seek 에서 어긋난다
 *   2. **레이아웃 속성(width/height/top/left)을 트윈하지 않는다.**
 *      옛 `measure` 가 `rule.style.height` 를 트윈했다 — 규칙을 안 읽어서 어겼다
 */
const PATTERNS = {
  // 가림막이 오른쪽으로 물러나며 상태가 드러난다.
  // 45% 에서 시작한다 — 첫 프레임이 통째로 가려지면 제품이 안 보이는 GIF 가 된다.
  reveal: `tl.set(veil, { opacity: 0.92, xPercent: 45 }, 0);
tl.to(veil, { xPercent: 100, ease: "none", duration: D }, 0);`,
  // 느린 푸시인. 부위 매크로에 쓴다.
  zoom: `tl.fromTo(shot, { scale: 1 }, { scale: 1.18, ease: "none", duration: D }, 0);
tl.set(ring, { opacity: 0, scale: 0.6 }, 0);
tl.to(ring, { opacity: 1, scale: 1, ease: "power2.out", duration: D * 0.5 }, D * 0.25);`,
  // 자막이 하나씩 바뀐다. 단계·구성 설명에 쓴다.
  sequence: `tl.fromTo(shot, { scale: 1 }, { scale: 1.05, ease: "none", duration: D }, 0);`,
  // 치수선을 그린다. 규격 바로 위에 둔다. **scaleY 다 — height 가 아니다.**
  measure: `tl.set(rule, { opacity: 1, scaleY: 0 }, 0);
tl.to(rule, { scaleY: 1, ease: "power1.out", duration: D }, 0);`,
};

/**
 * still-motion 컴포지션. **hyperframes 계약을 따른다** —
 * `#root` 에 컴포지션 메타를, `window.__timelines["main"]` 에 일시정지된 타임라인 하나를 둔다.
 * `run.mjs --render` 가 `hyperframes snapshot --at <시각들>` 로 프레임을 받는다.
 *
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

  // 자막은 트윈하지 않는다. 글자가 흐려지며 바뀌면 못 읽는다 — 시각에 딱 꽂는다.
  const captionCues = caption
    .map(
      (line, index) =>
        `tl.set(cap, { textContent: ${JSON.stringify(line)} }, ${(
          (index * TIMELINE_SEC) /
          Math.max(1, caption.length)
        ).toFixed(3)});`,
    )
    .join("\n");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=${COMP_SIZE.width}, height=${COMP_SIZE.height}">
<script src="./gsap.min.js"></script>
<style>
@font-face{font-family:"CompKR";src:url("./font.ttf");font-weight:100 900;font-display:block}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${COMP_SIZE.width}px;height:${COMP_SIZE.height}px;overflow:hidden;background:${ink};
 font-family:"CompKR",sans-serif}
#root{position:relative;width:100%;height:100%;overflow:hidden}
.clip{position:absolute;inset:0}
.shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 50%}
.veil{position:absolute;inset:0;background:${ink};opacity:0}
.ring{position:absolute;left:50%;top:50%;width:220px;height:220px;margin:-110px 0 0 -110px;
 border-radius:50%;border:6px solid ${brand};opacity:0}
.rule{position:absolute;left:64px;top:56px;width:6px;height:340px;background:${brand};opacity:0;
 transform-origin:50% 0%}
.cap{position:absolute;left:0;right:0;bottom:34px;text-align:center;color:${paper};
 font-size:38px;font-weight:900;letter-spacing:-.04em;text-shadow:0 2px 10px rgba(0,0,0,.6)}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${TIMELINE_SEC}"
     data-width="${COMP_SIZE.width}" data-height="${COMP_SIZE.height}">
  <div class="clip" data-start="0" data-duration="${TIMELINE_SEC}" data-track-index="1">
    <img class="shot" id="shot" src="${stillHref(brief.source_still, imageExt)}" alt="">
    <div class="veil" id="veil"></div>
    <div class="ring" id="ring"></div>
    <div class="rule" id="rule"></div>
    <div class="cap" id="cap"></div>
  </div>
</div>
<script>
const D = ${TIMELINE_SEC};
const shot = document.getElementById("shot");
const veil = document.getElementById("veil");
const ring = document.getElementById("ring");
const rule = document.getElementById("rule");
const cap  = document.getElementById("cap");
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${effect}
${captionCues}
window.__timelines["main"] = tl;
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
