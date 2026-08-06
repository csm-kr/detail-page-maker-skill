# 렌더 경로 — 무엇으로 굽고, 예산은 얼마인가

G8 은 **프레임까지만** 만든다. GIF 조립은 언제나 `lib/gifasm.mjs` 다.
이 문서는 "프레임을 무엇으로 찍는가" 만 다룬다.

## 예산

```
RENDER_BUDGET_MS = 240,000   (240초)
```

3회차에 hyperframes CLI 가 **240초에 타임아웃했다.** 그래서 headless Chrome
스크린샷으로 갈아탔고, 그 뒤로 hyperframes 를 다시 시도하지 않았다. **우회가 굳었다.**

의존성은 계속 벤더링돼 있었고(3.3MB · 파일 259개) 문서는 계속 hyperframes 를
가리켰다. 아무도 다시 재지 않았기 때문이다.

그래서 예산을 그때 그 값으로 못박고, **재는 것을 게이트로 만들었다.**

```bash
node scripts/run.mjs --probe
```

`work/comps/render-probe.json` 에 남는다. 없거나 하루가 지났거나 살아 있는 경로가
하나도 없으면 게이트가 거부한다. 우회 자체가 잘못이 아니다 — **우회했다는 사실이
안 적히는 것**이 잘못이다.

## 두 경로

| 경로 | 무엇을 재는가 | 4회차 실측 |
| --- | --- | ---: |
| `hyperframes` | **실제로 12프레임이 나오는가** (`snapshot`) | **6~8초** |
| `chrome` | 프레임 1장 780×520 | **0.9초** (×12 = 약 11초) |

`doctor` 는 재지 않는다 — 그건 렌더가 아니다. 프로브는 실제 컴포지션을 만들고
자산까지 안에 넣은 뒤 `snapshot` 을 돌린다. **그래야 계약을 확인한 것이다.**

### 240초는 무엇이었나

`hyperframes doctor` 의 출력이 답을 준다.

```
✓ Chrome   cache: ~/.cache/hyperframes/chrome/chrome-headless-shell/win64-.../chrome-headless-shell.exe
✓ FFmpeg   ffmpeg 8.1.2
```

Chrome 이 **캐시에 있다.** 3회차의 240초는 렌더가 느린 것이 아니라 `@puppeteer/browsers`
가 첫 실행에서 Chrome 을 내려받은 시간이었다. 지금은 7.3초에 끝난다.

**한 번의 실패가 경로를 죽은 것으로 만들었다.** 그것이 `--probe` 가 있는 이유다.

## hyperframes 로 프레임을 받는 길

CLI 에 우리가 필요한 것이 이미 있다.

```
hyperframes snapshot [DIR] --output <dir> --frames <N> --at <초,초,…>
  Capture key frames from a composition as PNG screenshots
```

MP4 가 아니라 **PNG 시퀀스**다. 그대로 `lib/gifasm.mjs` 에 넣을 수 있다 —
속도 제어는 우리가 소유하므로 조립기를 바꿀 필요가 없다.

같이 쓸 수 있는 것: `lint` · `check` · `validate` (헤드리스에서 JS 오류·누락 자산·대비 검사).

**옮겼다.** `--render` 가 `hyperframes snapshot --at <시각들> --no-end` 로 프레임을 받는다.
브라우저를 한 번만 띄우므로 12장에 6~8초다 (Chrome 은 프로세스 12번, 약 11초).

`--at` 으로 시각을 직접 준다. 기본 `--frames N` 은 마지막을 **97% 지점**에서 찍어
결과 상태에 도달하지 못한 프레임이 마지막이 된다 — MR-006 위반이다.

## 컴포지션 계약 — 두 가지를 어겼다가 조용히 실패했다

`--scaffold` 가 만드는 것은 hyperframes 컴포지션이다.

```html
<div id="root" data-composition-id="main" data-start="0" data-duration="1.2"
     data-width="780" data-height="520">
  <div class="clip" data-start="0" data-duration="1.2" data-track-index="1">
    <img class="shot" src="./c07.webp">   ← 발행된 스틸
  </div>
</div>
<script>
  const tl = gsap.timeline({ paused: true });   // 일시정지된 타임라인 하나
  tl.to(rule, { scaleY: 1, ease: "power1.out", duration: D }, 0);
  window.__timelines["main"] = tl;
</script>
```

### 1. 클립이 없으면 타임라인이 안 걸린다

계약: *"At least one clip (any element with `data-start`, `data-duration`,
`data-track-index`)"*. 빠뜨렸더니 **12프레임이 전부 같은 그림**이었다.

### 2. `../` 로 자산을 가리키면 404 다

hyperframes 는 **컴포지션 디렉터리를 웹 루트로 서빙하고 `../` 를 거부한다.**

```
[StaticGuard] asset path(s) traversing above the project root with "../"
✗ 404 loading motion/node_modules/gsap/dist/gsap.min.js
✗ gsap is not defined
```

gsap 이 안 실려 스크립트가 죽고, 타임라인이 등록되지 않고, 또 12프레임이 전부 같은
그림이었다. **그런데 렌더는 성공이라고 했다.** 그래서 `--scaffold` 가 자산을 안으로 복사한다.

| 자산 | 어디서 | 컴포지션 안 이름 |
| --- | --- | --- |
| gsap | `motion/node_modules/gsap/dist/gsap.min.js` | `gsap.min.js` |
| 한글 폰트 | `runtime/fonts/NotoSansKR-VF.ttf` | `font.ttf` (+ `@font-face`) |
| 스틸 | `output/media/images/<컷>.webp` | `<컷>.webp` — **컷 id 를 남긴다** |

폰트도 계약이다. `validate` 가 이렇게 경고한다 — *"Font families used without
@font-face declaration: noto sans kr … Text will fall back to a generic font."*

두 실패 모두 **조용히 같은 그림이 나오는** 실패다. `hyperframes validate .` 이
둘 다 한 줄로 말해 준다. 컴포지션을 고쳤으면 이걸 먼저 돌린다.

### 결정론과 레이아웃 트윈

- 절대값만 쓴다. `+=` 상대 트윈은 양방향 seek 에서 어긋난다
- `Math.random()` · `Date.now()` 를 쓰지 않는다
- **레이아웃 속성(`width`/`height`/`top`/`left`)을 트윈하지 않는다.**
  옛 `measure` 는 `rule.style.height` 를 트윈했다 — 규칙을 안 읽어서 어겼다. 이제 `scaleY` 다

## 용량 예산 — 무엇을 줄였고, 무엇은 안 줄였나

5회차에 미디어 총량이 **12.6MB** 로 상한 12MB 를 넘었다. 그중 84%가 GIF 였다.

프레임을 그대로 두고 **조립만 바꿔** 다시 구워서 쟀다 (GIF 5개 합계):

| 조립 | 합계 | 눈으로 |
| --- | ---: | --- |
| `c256` · `bayer_scale=3` (그때 것) | 5734KB | 평평한 면에 격자 무늬가 보인다 |
| `c256` · `bayer_scale=5` | 5124KB | 무늬가 사라진다 |
| **`c192` · `bayer_scale=5`** | **~4800KB** | **base 와 구분되지 않는다 ← 이걸 쓴다** |
| `c160` · `bayer_scale=5` | 4400KB | 자막 스크림 그라데이션에 띠가 생긴다 |
| `c128` · `sierra2_4a` | 4600KB | 잎 가장자리에 파란 색점이 생긴다 |
| `paletteuse=diff_mode=rectangle` | 5734KB | **한 바이트도 안 줄었다** |

마지막 줄이 중요하다. "변한 사각형만 다시 칠한다" 는 옵션인데 우리 GIF 는 화면 전체가
밀리거나 확대돼서 변한 사각형이 언제나 프레임 전체다. 그럴듯해 보인다는 이유로
다시 붙이지 않는다.

**폭은 780px 그대로 둔다.** 640px 으로 줄이면 30% 가 빠지지만 페이지 폭이 780px 이라
브라우저가 도로 늘려 그만큼 흐려진다. 색은 안 보이게 줄일 수 있고 해상도는 못 그런다.

디더 격자만 성기게 해도(`bayer_scale` 3→5) 10%가 준다. 디더 무늬 자체가 LZW 가 이어
붙일 것을 끊기 때문이다 — **파일의 10%가 노이즈였다.**

값은 `lib/gifasm.mjs` 의 `MAX_COLORS` · `BAYER_SCALE` 이 소유하고 테스트가 지킨다.
6회차 실측: GIF 10.66MB → **8.50MB**, 미디어 총량 12.6MB → **10.45MB**.

## 순서

```bash
node scripts/run.mjs --probe      # 경로가 예산 안에 도는가. 굽기 전에 한다
node scripts/run.mjs --scaffold   # brief 마다 컴포지션. 스틸이 이미 들어가 있다
node scripts/run.mjs --render     # 프레임 → gifasm.mjs → GIF
node scripts/run.mjs --assemble   # 프레임은 그대로, gifasm.mjs → GIF 만 다시
```

`--assemble` 은 조립 설정만 바뀌었을 때다. `--render` 는 `tibo-sequence` 프레임을
이미지 API 로 **다시 생성한다** — 돈이 다시 들고 이미 승인된 장면이 다른 그림으로 바뀐다.
