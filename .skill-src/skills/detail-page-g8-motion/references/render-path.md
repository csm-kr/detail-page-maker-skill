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
| `hyperframes` | 벤더링된 CLI 가 쓸 수 있는 상태인가 (`doctor`) | **7.3초** |
| `chrome` | G8 이 실제로 프레임을 찍는 경로 (1장 780×520) | **0.9초** |

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

**아직 안 옮겼다.** 지금 `--render` 는 `?f=N` + Chrome 스크린샷이다. 옮기려면
컴포지션 계약을 먼저 읽는다 — `hyperframes-core/references/minimal-composition.md`,
`determinism-rules.md`, `hyperframes-animation/rules-index.md`. 계약을 모르고 CLI 만
갈아 끼우면 스틸이 빠지고 `compUsesStill()` 이 거부한다.

## 지금 쓰는 경로 — `?f=N` + Chrome

컴포지션은 프레임 번호를 쿼리로 받는다.

```js
const t = f / (STILL_MOTION_FRAMES - 1);   // 0 → 1
```

프레임마다 Chrome 을 한 번 띄워 `--screenshot` 을 찍는다. 12장에 약 11초.

**결정론은 지킨다** — `t` 가 프레임 번호의 순함수이고 `Math.random()` 도 `Date.now()` 도
없다. hyperframes 의 결정론 계약과 같은 조건이다.

**어기고 있는 것 하나:** `measure` 패턴이 `rule.style.height` 를 트윈한다.
hyperframes 규칙은 레이아웃 속성(`width`/`height`/`top`/`left`)을 트윈하지 말라고 한다.
`transform: scaleY()` 나 SVG path draw 로 바꿔야 한다. 규칙을 안 읽어서 어겼다.

## 순서

```bash
node scripts/run.mjs --probe      # 경로가 예산 안에 도는가. 굽기 전에 한다
node scripts/run.mjs --scaffold   # brief 마다 컴포지션. 스틸이 이미 들어가 있다
node scripts/run.mjs --render     # 프레임 → gifasm.mjs → GIF
```
