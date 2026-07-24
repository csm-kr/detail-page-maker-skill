# HyperFrames 제품 효과 GIF 파이프라인 조사

조사일: 2026-07-24  
공식 저장소 기준: [`heygen-com/hyperframes` `9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd`](https://github.com/heygen-com/hyperframes/commit/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd), 패키지 `0.7.70`

## 결론

이 프로젝트의 기본 경로는 `제품 컷아웃 SSOT + 승인된 ImageGen 정지 자산 → seek 가능한 HyperFrames HTML → 검증용 MP4 및 필요 시 PNG 시퀀스 → HyperFrames 직접 GIF 렌더`로 정한다.

HyperFrames CLI가 `gif`를 정식 출력 포맷으로 지원하고, 내부에서 FFmpeg `palettegen=stats_mode=diff`와 `paletteuse=dither=sierra2_4a`를 사용하는 두 단계 팔레트 인코딩을 수행하므로, 기본 경로에서 MP4를 다시 GIF로 변환할 필요가 없다. GIF는 30fps로 제한되며 공식 가이드는 파일 크기를 위해 15fps를 권장한다. GIF에는 오디오가 없고 MP4/WebM보다 훨씬 크므로 짧은 컴포지션에 써야 한다. [HyperFrames Rendering — Animated GIF](https://hyperframes.heygen.com/guides/rendering#animated-gif), [현재 GIF 인코더 인자](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/producer/src/services/render/stages/gifEncodeArgs.ts)

최종 GIF는 무한 루프(`--gif-loop 0`), 기본 15fps, 무음, 불투명 배경으로 운용한다. 투명성이 필요하면 GIF가 아니라 WebM, MOV 또는 PNG 시퀀스를 선택한다. 공식 가이드는 GIF가 “1-bit transparency only”라고 설명하지만, 현재 구현은 GIF 캡처 프레임을 JPEG로 만들고 GIF를 알파 출력 대상으로 분류하지 않으므로 투명 GIF에 의존해서는 안 된다. [공식 포맷 가이드](https://hyperframes.heygen.com/guides/rendering#animated-gif), [GIF가 `needsAlpha`에서 제외되는 현재 렌더 경로](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/producer/src/services/renderOrchestrator.ts), [GIF가 `frame_%06d.jpg`를 입력으로 쓰는 인코드 단계](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/producer/src/services/render/stages/encodeStage.ts)

HyperFrames의 자동 검사만으로 제품 동일성이나 루프 이음새까지 보장되지는 않는다. `check`, motion sidecar, keyframe 진단, 핵심 시각의 PNG snapshot, 실제 GIF 메타데이터 검사, 실제 브라우저에서 최소 3회 반복 재생 검수를 모두 통과해야 게시 가능하다. `check`는 런타임·요청·레이아웃·motion assertion·대비를 검사하지만, 공식 계약도 snapshot을 직접 보고 자동 검사와 육안 검사를 함께 사용하도록 요구한다. [lint/check/snapshot 계약](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-cli/references/lint-validate-inspect.md)

## 1. 입력 자산과 제품 동일성 계약

### 1.1 자산 역할

프로젝트 적용 결정:

- `product-ssot/cutout/*.png`의 승인된 제품 컷아웃 한 장을 모션 구간의 제품 본체로 사용한다.
- ImageGen 정지 자산은 배경, 사용 상황, 조명판, 효과판처럼 제품을 둘러싼 레이어로만 사용한다.
- 실제 제품이 회전해 다른 면이 보여야 한다면 임의 생성한 중간 형상이 아니라 승인된 해당 각도의 컷아웃 또는 제품 뷰 시트를 사용한다.
- 한 GIF는 한 가지 작동 또는 효과만 입증하며, 모션에서 새로운 성능 사실을 만들어내지 않는다.

제품 본체는 가능한 한 컴포지션 전체에서 동일한 DOM `<img>` 한 개로 유지한다. 제품 위치·회전·확대가 필요하면 그 이미지를 감싼 내부 wrapper를 변환하고, 실루엣·로고·부품을 변형하는 shape morph는 금지한다. HyperFrames의 keyframe 계약도 연속성이 중요할 때 객체 identity를 유지하고, 대체나 dissolve가 의도된 경우에만 crossfade하도록 규정한다. [HyperFrames Keyframes identity 계약](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-keyframes/SKILL.md)

### 1.2 권장 DOM 레이어

제품 본체를 담은 base clip은 전체 duration 동안 유지하고, 배경·마스크·SVG·입자·조명 효과는 별도 clip 또는 base clip 내부의 별도 레이어로 둔다.

```html
<div
  id="root"
  data-composition-id="product-effect"
  data-start="0"
  data-width="800"
  data-height="800"
  data-duration="3"
>
  <section
    id="product-stage"
    class="clip"
    data-start="0"
    data-duration="3"
    data-track-index="1"
  >
    <img id="scene-bg" src="assets/generated/scene-bg.png" alt="" />
    <div id="product-motion">
      <img id="product" src="assets/product-ssot/cutout/front.png" alt="" />
    </div>
  </section>

  <section
    id="effect-layer"
    class="clip"
    data-start="0"
    data-duration="3"
    data-track-index="2"
  >
    <!-- SVG, mask, light, particles -->
  </section>
</div>
```

컴포지션 root에는 `data-composition-id`, `data-width`, `data-height`, `data-duration`가 필요하고 CSS에서도 명시적인 pixel 크기를 가져야 한다. 보이는 timed element에는 `class="clip"`과 `data-start`, `data-duration`, `data-track-index`가 필요하며 clip은 root의 direct child여야 한다. [최소 컴포지션](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-core/references/minimal-composition.md), [`data-*` 전체 계약](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-core/references/data-attributes.md)

`data-track-index`는 앞뒤 paint 순서가 아니라 시간 중첩 lane이다. 같은 track의 clip끼리는 시간 구간이 겹치면 안 되고, 앞뒤 레이어는 CSS `z-index`로 정한다. [Tracks and Clips](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-core/references/tracks-and-clips.md)

전체 화면 배경은 root 자체가 아니라 `position:absolute; inset:0`인 full-bleed child에 그린다. 현재 공식 core 계약은 producer 합성 과정에서 root의 자체 background가 사라져 검은 프레임이 될 수 있으며 preview/snapshot에는 정상으로 보일 수도 있다고 경고한다. [HyperFrames Core — non-negotiable rules](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-core/SKILL.md)

렌더에 필요한 제품 컷아웃과 ImageGen 정지 자산은 프로젝트 안에 고정하고 render-time network fetch에 의존하지 않는다. 동일 time에서 동일 pixel을 내야 하므로 필수 자산의 render-time network fetch는 결정성 계약 위반이다. [Determinism Rules](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-core/references/determinism-rules.md)

## 2. seek 가능한 애니메이션 계약

HyperFrames는 순차 재생 상태를 녹화하는 대신 각 frame의 time으로 DOM/canvas 상태를 다시 seek해 pixel buffer를 얻는다. 임의 순서의 frame seek와 같은 frame의 반복 seek가 같은 결과를 내야 하며, canonical clock은 `t = frame / fps`이다. [Frame Adapters — Required Semantics와 Determinism](https://hyperframes.heygen.com/concepts/frame-adapters#required-semantics)

GSAP 사용 시 다음이 필수다.

- `gsap.timeline({ paused: true })`를 page 초기화 중 동기적으로 한 번 만든다.
- `window.__timelines["product-effect"]`에 등록하며 key는 root의 `data-composition-id`와 정확히 같아야 한다.
- render-critical motion에 `tl.play()`를 호출하지 않는다.
- `async`, `Promise`, `setTimeout`, event handler 안에서 timeline을 만들지 않는다.
- `Date.now()`, `performance.now()`, seed 없는 `Math.random()`, hover·scroll·pointer 상태, render-time network fetch를 쓰지 않는다.
- `repeat: -1`을 쓰지 않고 필요한 cycle 수를 유한하게 계산한다.

위 항목은 HyperFrames의 공식 animation runtime 및 determinism 계약이다. [Determinism, Animation Runtime, and Layout](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-core/references/determinism-rules.md)

제품 motion의 기본 channel은 `x/y`, `scale`, `rotation`, `opacity` 같은 compositor/visual channel로 제한한다. `display`, raw `visibility`, `top/left`, `width/height`, late DOM creation은 피한다. mask·clip-path·SVG 효과가 꼭 필요할 때만 keyframe 진단과 snapshot을 추가한다. [HyperFrames Keyframes — Channels](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-keyframes/SKILL.md)

root `data-duration`은 compile time에 한 번 읽히며 script나 render variable로 뒤늦게 바꿀 수 없다. 제품 효과마다 loop period를 HTML에 정적으로 기록해야 한다. [Data Attributes — Composition Root](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-core/references/data-attributes.md)

### 2.1 루프용 timeline 설계

프로젝트 적용 결정:

1. `data-duration`을 한 cycle의 정확한 period로 둔다.
2. timeline의 `t=duration` pose가 `t=0` pose로 돌아오게 유한 keyframe을 작성한다.
3. 위치뿐 아니라 scale, rotation, opacity, mask, light, particle state도 경계에서 이어지게 한다.
4. 마지막에 검은 화면이나 cleanup frame을 넣지 않는다.
5. reset을 숨겨야 하면 제품을 순간 변형하지 말고, 밝은 flare·wipe처럼 의미 있는 효과 구간 안에서 reset한다.
6. 시작·효과 peak·복귀 pose를 semantic label로 명시한다.

현재 renderer는 `totalFrames = duration × fps`가 정수에 가까우면 반올림하고 아니면 올림하며, 실제 capture는 `i = 0 ... totalFrames - 1`, `time = i / fps`로 수행한다. 즉 정확한 `t=duration` frame은 중복 캡처되지 않는다. 따라서 timeline은 `t=duration`에 시작 pose로 돌아오도록 작성하되, 실제 이음새는 `t=(N-1)/fps → 0` 한 frame step이 자연스러운지 검수해야 한다. 이 문장은 공식 capture code에서 도출한 적용 해석이다. [frame 수 계산](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/producer/src/services/render/stages/probeStage.ts), [capture time 계산](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/producer/src/services/render/stages/captureStage.ts)

## 3. 검증과 렌더 계약

### 3.1 작성 중과 최종 gate

권장 실행 순서는 다음과 같다.

```bash
# 구조를 크게 바꾼 직후 빠른 정적 검사
npx hyperframes lint .

# 최종 browser gate: lint를 다시 실행하고 runtime/layout/motion/contrast를 검사
npx hyperframes check . --snapshots --samples 15 --strict

# 실제 제품 요소의 seek-safe motion을 집중 진단
npx hyperframes keyframes . \
  --selector "#product-motion" \
  --shot qa/product-motion-strip.png \
  --layout strip \
  --from 0 \
  --to 3

# 첫 frame, 효과 peak, 마지막 capture 직전 frame, timeline의 정확한 끝 pose
npx hyperframes snapshot . --at 0,1.5,2.933333,3

# check 통과 후 Studio에서 최종 승인
npx hyperframes preview .
```

`check`는 lint error가 있으면 browser를 열지 않고 중단하며, 그 뒤 한 browser seek sweep에서 JavaScript/runtime error, failed request, layout, `*.motion.json`, WCAG contrast를 검사한다. `--snapshots`는 overview와 finding crop을 저장한다. [check 계약](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-cli/references/lint-validate-inspect.md#check)

motion sidecar에는 최소한 제품 등장, frame 이탈 금지, motion 생존 조건을 선언한다.

```json
{
  "duration": 3,
  "assertions": [
    { "kind": "appearsBy", "selector": "#product", "bySec": 0.1 },
    { "kind": "staysInFrame", "selector": "#product-motion" },
    { "kind": "keepsMoving", "withinSelector": "#product-stage", "maxStaticSec": 1.2 }
  ]
}
```

`appearsBy`, `before`, `staysInFrame`, `keepsMoving`가 현재 공식 motion assertion이며 selector가 없으면 조용히 통과하지 않고 error를 낸다. [Motion verification](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-cli/references/lint-validate-inspect.md#motion-verification-motionjson-sidecar)

`keyframes`, focused `--shot`, `snapshot --at`은 각각 실제 animated target·중간 pose·경로와 painted full-frame state를 확인하는 도구다. 첫 frame, proof pose, final-minus-hold, exact final을 확인하라는 절차가 공식 keyframe 계약에 포함된다. [HyperFrames Keyframes — CLI Proof](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-keyframes/SKILL.md)

검사가 통과해도 자동 렌더하지 않는다. Studio의 최종 컴포지션 preview에서 사용자가 승인한 뒤 렌더한다. [HyperFrames CLI development loop](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-cli/SKILL.md)

### 3.2 보존할 출력

```bash
# 제작·QA용 무음 원본 영상
npx hyperframes render . \
  --format mp4 \
  --fps 30 \
  --quality high \
  --output assets/motion/video/product-effect.mp4

# 최종 게시 GIF
npx hyperframes render . \
  --format gif \
  --fps 15 \
  --gif-loop 0 \
  --output assets/motion/gif/product-effect.gif

# frame 단위 장애 분석이나 별도 크기 최적화가 필요할 때만
npx hyperframes render . \
  --format png-sequence \
  --fps 15 \
  --output assets/motion/frames/product-effect/
```

HyperFrames는 MP4, WebM, MOV, GIF, PNG sequence를 공식 출력 포맷으로 제공한다. PNG sequence는 zero-padded RGBA frame 디렉터리이며 muxed audio가 없고, audio가 있으면 `audio.aac` sidecar를 쓴다. GIF는 직접 two-pass palette encode하고 audio를 무시한다. [공식 Rendering 옵션](https://hyperframes.heygen.com/guides/rendering#options), [현재 encode stage](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/producer/src/services/render/stages/encodeStage.ts)

로컬 모드는 빠른 반복에 쓰고, 동일 Chrome·font·FFmpeg 기반의 재현 가능한 최종 렌더가 필요하면 Docker mode를 쓴다. 공식 가이드는 AI agent-driven rendering과 CI에 Docker mode를 권장한다. [Rendering Modes](https://hyperframes.heygen.com/guides/rendering#rendering-modes)

## 4. GIF 변환·최적화 계약

### 4.1 기본 경로: HyperFrames 직접 GIF

```bash
npx hyperframes render . \
  --format gif \
  --fps 15 \
  --gif-loop 0 \
  --output assets/motion/gif/product-effect.gif
```

현재 CLI는 GIF 요청 fps가 30을 넘으면 30으로 낮추고, `gif-loop`가 없으면 `0`을 적용한다. 허용 loop 값은 `0..65535`의 정수다. [render plan의 GIF fps/loop 처리](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/cli/src/commands/render/plan.ts), [`--gif-loop` parser](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/cli/src/utils/renderArgs.ts)

현재 GIF encoder는 첫 pass에서 `fps=...,palettegen=stats_mode=diff`, 둘째 pass에서 `paletteuse=dither=sierra2_4a`, `-loop <count>`를 사용한다. [gifEncodeArgs.ts](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/producer/src/services/render/stages/gifEncodeArgs.ts)

FFmpeg 공식 문서상 `palettegen=stats_mode=diff`는 이전 frame과 달라진 영역만 histogram에 반영해 정적 배경보다 움직이는 부분에 더 비중을 둘 수 있고, `paletteuse`는 256-color palette로 영상을 downsample한다. `sierra2_4a`는 FFmpeg의 기본 error-diffusion dithering이다. [FFmpeg palettegen](https://ffmpeg.org/ffmpeg-filters.html#palettegen), [FFmpeg paletteuse](https://ffmpeg.org/ffmpeg-filters.html#paletteuse)

파일 크기는 다음 순서로 줄인다.

1. 실제 HTML 삽입 폭과 같은 canvas에서 authoring한다. 기본 상세페이지 폭이 800px이면 GIF도 우선 800px 폭을 넘기지 않는다.
2. 한 GIF에 한 효과만 남기고 duration을 줄인다.
3. 기본 15fps를 사용하고 motion 가독성이 무너지지 않을 때만 더 낮춘다.
4. frame 대부분이 정적으로 유지되도록 제품 본체와 배경을 고정하고 필요한 효과 영역만 움직인다.
5. 위 조정 후에도 판매 채널의 payload budget을 넘을 때만 PNG sequence 후처리 경로를 쓴다.

1~4는 고정 canvas, 짧은 GIF와 15fps를 권장하는 공식 가이드 및 diff palette의 특성을 이 프로젝트에 적용한 권고다. [HyperFrames Animated GIF 가이드](https://hyperframes.heygen.com/guides/rendering#animated-gif), [FFmpeg palettegen diff mode](https://ffmpeg.org/ffmpeg-filters.html#palettegen)

### 4.2 예외 경로: PNG sequence에서 FFmpeg 후처리

HyperFrames의 고정 GIF encoder 옵션만으로 채널 용량을 맞출 수 없거나, 이미 검수한 frame을 다시 capture하지 않고 크기만 바꿔야 할 때 사용한다.

```bash
ffmpeg -y \
  -framerate 15 \
  -start_number 1 \
  -i "assets/motion/frames/product-effect/frame_%06d.png" \
  -vf "fps=15,scale=800:-2:flags=lanczos,palettegen=stats_mode=diff:reserve_transparent=0" \
  "assets/motion/frames/product-effect/palette.png"

ffmpeg -y \
  -framerate 15 \
  -start_number 1 \
  -i "assets/motion/frames/product-effect/frame_%06d.png" \
  -i "assets/motion/frames/product-effect/palette.png" \
  -lavfi "fps=15,scale=800:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  -loop 0 \
  "assets/motion/gif/product-effect.gif"
```

FFmpeg `scale`은 지정한 width에 맞춰 resize하고 한 축에 `-n`을 쓰면 aspect ratio를 유지하면서 해당 축을 `n`의 배수로 조정한다. `paletteuse=diff_mode=rectangle`은 바뀐 rectangle만 다시 처리해 정적 장면의 dithering noise를 줄이고 GIF compression을 개선할 수 있다. [FFmpeg scale](https://ffmpeg.org/ffmpeg-filters.html#scale), [FFmpeg paletteuse `diff_mode`](https://ffmpeg.org/ffmpeg-filters.html#paletteuse)

FFmpeg GIF muxer의 `-loop 0`은 무한 반복이고 `-1`은 반복 없음이다. frame delay의 최소 단위는 1 centisecond다. [FFmpeg GIF muxer](https://ffmpeg.org/ffmpeg-formats.html#gif-2)

이 후처리 경로를 사용하면 원본 PNG sequence, palette, 최종 GIF의 hash와 command를 manifest에 기록한다. 결과가 기본 HyperFrames GIF보다 작고, 제품 edge·logo·gradient의 시각 품질과 loop seam이 동등하거나 더 좋을 때만 채택한다.

## 5. GIF 결과와 루프 검수 계약

### 5.1 기계 검수

HyperFrames core는 GIF의 width, height, frame count, frame별 delay, duration, Netscape loop count를 읽는 `parseAnimatedGifMetadata()`를 공개 export한다. loop count `0`은 무한 반복이고, loop extension이 없으면 `null`이다. [GIF metadata parser](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/core/src/media/gif.ts), [core public export](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/core/src/index.ts)

```js
import { readFileSync } from "node:fs";
import { parseAnimatedGifMetadata } from "@hyperframes/core";

const bytes = readFileSync("assets/motion/gif/product-effect.gif");
const meta = parseAnimatedGifMetadata(bytes);

if (!meta?.animated) throw new Error("GIF is not animated");
if (meta.width !== 800 || meta.height !== 800) throw new Error("Unexpected canvas");
if (meta.loopCount !== 0) throw new Error("GIF must loop forever");
if (meta.frameCount !== 45) throw new Error("Expected 3s × 15fps = 45 frames");
if (Math.abs(meta.durationSeconds - 3) > 0.1) throw new Error("Unexpected GIF duration");
if (meta.delaysCentiseconds.some((delay) => delay <= 0)) {
  throw new Error("Invalid frame delay");
}
```

GIF timebase가 centisecond이므로 15fps의 정확한 `66.666...ms` 간격은 frame delay가 번갈아 양자화될 수 있다. 모든 frame delay가 동일한지 대신 총 duration이 한 frame 이내 오차인지 검사한다. FFmpeg는 GIF frame delay가 1 centisecond보다 작을 수 없다고 명시한다. [FFmpeg GIF muxer timebase](https://ffmpeg.org/ffmpeg-formats.html#gif-2)

독립적인 container/frame 점검에는 `ffprobe`를 사용한다.

```bash
ffprobe -v error \
  -count_frames \
  -select_streams v:0 \
  -show_entries stream=width,height,avg_frame_rate,nb_read_frames,duration \
  -of json \
  assets/motion/gif/product-effect.gif
```

`ffprobe -count_frames`는 stream별 frame 수를 세고, `-show_entries`는 지정한 field만 출력한다. [FFprobe 공식 옵션](https://ffmpeg.org/ffprobe.html)

기계 acceptance:

- 파일이 존재하고 0 byte보다 크다.
- width/height가 컴포지션 canvas와 같다.
- `animated === true`, `loopCount === 0`이다.
- `frameCount === durationToFrameCount(duration, fps)`다.
- metadata duration과 authoring duration 차이가 `max(0.1초, 1/fps)` 이하다.
- frame delay가 모두 양수다.
- MP4, PNG sequence, GIF의 제품 asset provenance가 같은 컷아웃 SSOT hash로 연결된다.

### 5.2 시각 검수

다음 frame을 각각 PNG로 확인한다.

- `t=0`: 첫 frame이 검정·흰색 blank가 아니며 제품 실루엣과 로고가 온전하다.
- 효과 원인이 드러나는 직전 frame.
- 효과 peak frame.
- 제품 결과를 읽을 수 있는 hold frame.
- `t=duration-1/fps`: 마지막 capture frame에서 제품이 변형되거나 사라지지 않는다.
- `t=duration`: 실제 GIF에는 중복 수록되지 않지만 authoring timeline의 pose가 `t=0`으로 정확히 복귀한다.

그 뒤 실제 GIF를 최종 HTML의 실제 표시 폭에서 최소 3회 연속 재생한다.

- 마지막 frame에서 첫 frame으로 갈 때 이동 거리·방향·속도가 인접 frame의 변화와 비슷하다.
- 갑작스러운 jump, 중복 제품, 한 frame flash, 검정 frame, logo 교체가 없다.
- reset 구간이 제품 변형처럼 읽히지 않는다.
- 한 번의 cycle만 보아도 한 가지 제품 작동 또는 효과를 이해할 수 있다.
- 360px와 기본 상세페이지 폭에서 제품 edge와 핵심 효과가 식별된다.

`check`의 성공은 위 시각 acceptance를 대신하지 않는다. 공식 CLI 계약도 snapshot PNG를 직접 확인하고, painted pixel이 log보다 우선이라고 규정한다. [lint/check/snapshot discipline](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-cli/references/lint-validate-inspect.md#discipline-motion-heavy-work), [Keyframes diagnostic reading](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/skills/hyperframes-keyframes/SKILL.md)

## 6. 프로젝트에서 확정할 기본값과 미결정값

| 항목 | 권고 기본값 | 근거 또는 남은 결정 |
| --- | --- | --- |
| 제품 source | 승인된 제품 컷아웃 SSOT 한 개를 연속 사용 | 제품 동일성 프로젝트 계약 |
| 정지 scene source | 승인된 ImageGen 자산 | ImageGen은 배경·효과판, 제품 본체는 컷아웃 SSOT |
| canvas | 최종 HTML 삽입 slot과 같은 pixel 크기, 우선 폭 800px 이하 | root는 fixed pixel canvas이고 GIF는 MP4보다 크다. [공식 가이드](https://hyperframes.heygen.com/guides/rendering#animated-gif) |
| duration | 한 효과가 읽히는 최소 길이, 잠정 2~4초 | HyperFrames 공식 max는 없으므로 제품 효과별 승인 필요 |
| GIF fps | 15fps | 공식 권장, 30fps hard cap. [공식 가이드](https://hyperframes.heygen.com/guides/rendering#animated-gif) |
| loop | `--gif-loop 0` | 무한 반복. [CLI source](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/cli/src/commands/render/plan.ts) |
| audio | 없음 | GIF encoder가 audio를 무시한다. [encode stage](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/producer/src/services/render/stages/encodeStage.ts) |
| transparency | 불투명 GIF | 현재 GIF capture/encode path가 JPEG frame을 쓴다. [encode stage](https://github.com/heygen-com/hyperframes/blob/9d4c3493d0511e1bb2755fe2b9ef84972a95a5cd/packages/producer/src/services/render/stages/encodeStage.ts) |
| QA video | MP4, 30fps, high | 제작·QA 보존물; 게시물은 GIF |
| frame artifact | 장애 분석·후처리 시에만 PNG sequence | 공식 RGBA frame 출력. [Rendering 옵션](https://hyperframes.heygen.com/guides/rendering#options) |
| 최종 렌더 mode | 반복은 local, 승인본은 Docker 권고 | 공식 재현성 구분. [Rendering Modes](https://hyperframes.heygen.com/guides/rendering#rendering-modes) |
| 파일 크기 budget | 미결정 | HyperFrames에는 판매 채널 공통 용량 기준이 없다. 대상 채널·호스팅 방식이 정해진 뒤 GIF당 및 페이지 총량을 별도 결정해야 한다. |
| 페이지당 GIF 수 | 미결정 | 각 GIF가 한 주장만 입증한다는 현재 프로젝트 원칙 아래 성능 budget과 함께 결정해야 한다. |

## 7. 구현용 완료 조건

다음을 모두 만족할 때 이 파이프라인의 한 GIF를 완료로 본다.

1. 제품 본체가 승인된 컷아웃 SSOT에서 왔고 manifest에서 원본 hash까지 추적된다.
2. 모든 ImageGen 정지 자산이 승인 상태이며 제품 사실을 새로 주장하지 않는다.
3. root와 clip `data-*`, track, timeline key가 공식 계약과 일치한다.
4. timeline이 동기적으로 생성된 paused seek timeline이며 clock·timer·unseeded random·infinite repeat가 없다.
5. `lint`와 `check --snapshots --strict`가 통과한다.
6. focused keyframe shot과 first/peak/final-minus-one-frame/exact-final snapshot을 사람이 검수했다.
7. Studio preview에서 최종 컴포지션을 승인했다.
8. MP4 QA render와 최종 GIF가 존재하고 0 byte보다 크며 duration이 타당하다.
9. GIF metadata의 canvas, frame count, duration, infinite loop가 acceptance와 일치한다.
10. 실제 GIF를 3회 이상 반복 재생했을 때 seam, flash, 제품 변형, logo 변화, 중복 제품이 없다.
11. 실제 상세페이지 표시 폭에서 가독성과 로딩 성능 budget을 통과한다.
12. 최종 HTML은 GIF 바로 옆에 해당 GIF가 입증하는 한 가지 주장만 둔다.
