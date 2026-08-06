# hyperframes 이펙트 — 무엇을 갖고 있고 무엇을 쓰고 있나

사용자 지적: **"hyperframes 이펙트 많이 스터디 해야해."**

재 봤다. 결론부터 — **3.3MB 를 번들해 놓고 손으로 쓴 CSS 15줄을 쓰고 있다.**

---

## 갖고 있는 것

`.skill-src/skills/detail-page-orchestrator/.agents/skills/` 아래에 hyperframes 계열
스킬이 **7개**, 파일 **259개**, **3.3MB** 다.

| 스킬 | 파일 | 크기 | 무엇 |
| --- | ---: | ---: | --- |
| `hyperframes-animation` | 121 | 1,454KB | 규칙 48 · 전환 16 · 청사진 22 · 예제 13 |
| `hyperframes-creative` | 78 | 1,401KB | 프레임 프리셋 · 팔레트 9 · 템플릿 |
| `hyperframes-core` | 19 | 176KB | 컴포지션 계약 · 결정론 규칙 · 프레임 워커 |
| `hyperframes-cli` | 11 | 128KB | preview / render / lint / batch |
| `hyperframes` | 17 | 107KB | 라우팅 |
| `hyperframes-registry` | 10 | 76KB | 레지스트리 |
| `hyperframes-keyframes` | 3 | 21KB | 키프레임 |

## 쓰고 있는 것

`g8-motion/scripts/lib/motion.mjs` 의 `PATTERNS` — **네 개, 전부 합쳐 15줄.**

```js
reveal:   veil.style.clipPath = "inset(0 0 0 " + (45 + t * 55) + "%)";
zoom:     shot.style.transform = "scale(" + (1 + t * 0.18) + ")";
sequence: shot.style.transform = "scale(" + (1 + t * 0.05) + ")";
measure:  rule.style.height = (t * 100) + "%";
```

그리고 렌더는 hyperframes 를 부르지 않는다. headless Chrome 으로 `?f=N` 을 12번 찍는다.

**hyperframes 는 지금 이 스킬에서 사실상 죽은 의존성이다.**

---

## 격차 — 세 층이 다르다

### 1. 기법이 다르다

우리 것은 프레임마다 인라인 style 을 대입한다. hyperframes 는 **일시정지된 GSAP
타임라인 하나**를 두고 프레임 시각으로 seek 한다. `rules-index.md` 의 계약이다.

> runs on ONE **paused** GSAP timeline registered on `window.__timelines`
> (never autoplay, never a second timeline);
> is **seek-safe both directions** … absolute values — never relative `+=` tweens;
> state readable as a pure function of timeline time, no mutable trackers;
> is **deterministic**: no `Math.random()`, no `Date.now()`

우리도 결정론은 지킨다(`t = f/(N-1)` 로 계산). 그런데 **우리가 손으로 다시 만들고 있는
계약이 이미 문서화돼 있고, 그 계약 위에 48개 규칙이 얹혀 있다.**

`width`/`height`/`top`/`left` 를 트윈하지 말라는 규칙도 있는데 — 우리 `measure` 패턴은
`rule.style.height` 를 트윈한다. 레이아웃 트윈이다. 규칙을 안 읽어서 어긴 것이다.

### 2. 우리에게 필요한 것이 이미 있다

`flow-map.md` 가 쿠팡 기준작을 읽고 **직접 지목한** 장치가 있다.

> 헤드라인 2줄 구조가 반복된다 — 작은 검정 윗줄(맥락) + 큰 초록 아랫줄(결과).
> 결과 줄의 한 구절에만 **형광 노랑 마커**를 깐다

그 마커가 번들 안에 있다. `hyperframes-animation/rules/css-marker-patterns.md` 1번.

```css
.mh-highlight-bar {
  position: absolute; inset: 0 -6px;
  background: #fdd835; opacity: .35;
  transform: scaleX(0); transform-origin: left center;
}
```
```js
tl.to("#hl-1", { scaleX: 1, duration: 0.5, ease: "power2.out" }, 0.6);
```

같은 파일에 circle / underline / strikethrough / sketchout 까지 다섯 모드가 있다.
**우리는 이걸 놔두고 도형에 애니메이션을 걸었다.**

### 3. 옛 `motion.md` 의 패턴표가 여기에 대응한다

퇴화 복구 때 옛 정본에서 되살린 것은 규칙(MR-006·MR-018)뿐이었다. **패턴표는 못 되살렸다.**

| motion.md 의 구매 질문 | 옛 패턴 | 번들 안의 대응 |
| --- | --- | --- |
| 무엇이 다른가 | 비교 와이프·슬라이더 | `blueprints/comparison-split.md` · `transitions/` |
| 어느 면·부품인가 | 면 뒤집기·구조 추적 | `rules/card-morph-anchor.md` · `3d-*` |
| 어떻게 작동하는가 | 국소 이펙트 | `rules/coordinate-target-zoom.md` · `ai-tracking-box.md` |
| 어떤 순서인가 | 절차 진행 | `blueprints/agent-progress-theater.md` |
| 몇 개가 오는가 | 구성 리빌 | `blueprints/grid-card-assemble.md` |
| 어디부터 어디까지인가 | 치수 위치 가이드 | `techniques.md §1 SVG Path Drawing` · `svg-path-draw` |
| 분위기가 어떻게 바뀌는가 | 짧은 매치컷 | `transitions/TRANSITION-REGISTRY.md` |

**일곱 질문이 전부 대응된다.** 우리 네 패턴은 이 중 두세 개를 흐리게 덮는다.

---

## 스터디 순서

넓게 읽지 않는다. **우리가 답해야 할 구매 질문에서 시작해 역으로 찾는다.**

### 0단계 — 경로가 도는가 (**했다**)

먼저 이것부터 확인한다 — 안 돌면 48개 규칙이 있어도 못 쓴다. 재 봤다.

```
hyperframes --help     0.53초
hyperframes doctor     7.3초
  ✓ Chrome   cache: ~/.cache/hyperframes/chrome/chrome-headless-shell/win64-.../
  ✓ FFmpeg   ffmpeg 8.1.2
chrome 1프레임 780×520  0.9초   (지금 쓰는 경로)
```

**CLI 는 산다.** 3회차의 240초는 렌더가 느린 것이 아니라 `@puppeteer/browsers` 가
첫 실행에서 Chrome 을 내려받은 시간이었다. 지금은 캐시에 있다.

한 번의 실패가 경로를 죽은 것으로 만들었고, 아무도 다시 재지 않아서 우회가 굳었다.
그래서 재는 것을 게이트로 만들었다 — `run.mjs --probe` 가
`work/comps/render-probe.json` 을 남기고, 없거나 하루가 지났거나 살아 있는 경로가
하나도 없으면 G8 이 거부한다. 예산은 그때 그 값 **240초**를 그대로 쓴다.

같이 찾은 것: CLI 에 우리가 필요한 것이 이미 있다.

```
hyperframes snapshot [DIR] --output <dir> --frames <N> --at <초,초,…>
  Capture key frames from a composition as PNG screenshots
```

MP4 가 아니라 **PNG 시퀀스**다. 그대로 `lib/gifasm.mjs` 에 넣을 수 있다 —
속도 제어는 우리가 소유하므로 조립기를 안 바꿔도 된다. `lint` · `check` · `validate`
(헤드리스 JS 오류·누락 자산·대비 검사) 도 같이 쓸 수 있다.

**갈아탔다.** `--render` 가 `snapshot --at <시각들> --no-end` 로 프레임을 받는다.
12프레임 6~8초 (Chrome 은 프로세스 12번, 약 11초).

옮기면서 계약을 안 읽고 시작해 **두 번 조용히 실패했다** — 클립이 없어서, 그리고
자산을 `../` 로 가리켜서. 둘 다 12프레임이 전부 같은 그림인데 렌더는 성공이라고 했다.
`hyperframes validate .` 이 둘 다 한 줄로 말해 준다. 아래 1단계를 건너뛴 대가다.

기록은 [`detail-page-g8-motion/references/render-path.md`](../../.skill-src/skills/detail-page-g8-motion/references/render-path.md) 에 옮겼다.
G8 세션의 컨텍스트 팩이 그 문서를 본문으로 받는다 — 이 파일은 사람이 읽는 기록이고,
게이트가 읽는 정본은 스킬 안에 있어야 한다.

### 1단계 — 계약 (읽기, 반나절)

먼저 이걸 읽어야 나머지가 읽힌다.

```
hyperframes-core/references/minimal-composition.md      컴포지션 한 벌의 최소형
hyperframes-core/references/determinism-rules.md        결정론 계약
hyperframes-core/references/frame-worker-core.md        프레임 렌더가 어떻게 도는가
hyperframes-animation/rules-index.md                    48개 규칙의 공통 계약 + 색인
hyperframes-cli/references/preview-render.md            render --format png-sequence
```

확인할 것: **우리 `?f=N` + Chrome 스크린샷이 이 계약과 어떻게 다른가.**
`png-sequence` 로 프레임을 받을 수 있으면 조립기(`gifasm.mjs`)는 그대로 쓸 수 있다 —
속도 제어는 우리가 이미 소유한다.

### 2단계 — 우리 일곱 질문에 대응하는 규칙만 (읽기 + 실측)

위 표의 일곱 줄. 규칙 하나당 확인할 것은 셋이다.

- 입력이 **이미지**인가 (도형이면 우리가 겪은 문제로 돌아간다)
- 780×520 캔버스에서 읽히는가
- 프레임 12장 안에 끝나는가 (`lib/pacing.mjs` 의 상한 12초)

### 3단계 — 예제 13개를 실제로 렌더해 본다

`hyperframes-animation/examples/*.html` 은 완성품이다. 읽지 말고 **굽는다.**
`comparison-split-cards.html` 과 `metric-video-text-pivot.html` 이 우리 `compare`·`spec`
섹션과 가장 가깝다.

### 4단계 — 두 개만 채택한다

한 번에 네 패턴을 여덟로 늘리지 않는다. **가장 크게 비는 두 자리부터.**

| 자리 | 지금 | 후보 |
| --- | --- | --- |
| 형광 마커 (기준작이 반복하는 장치) | 없다 | `css-marker-patterns.md` 1번 |
| 치수 가이드 (`measure` 가 레이아웃 트윈이다) | 규칙 위반 | `techniques.md §1` SVG path draw |

## 채택 기준

패턴을 늘리기 전에 통과해야 하는 것.

1. `lib/pacing.mjs` 의 속도 하한을 그대로 통과한다 — 화려해도 못 읽으면 소용없다
2. `compUsesStill()` 을 통과한다 — **입력은 여전히 발행된 스틸이다**
3. 렌더 경로가 실제로 돈다. **확인했다** — 0단계 참조. `run.mjs --probe` 가 게이트다
4. 패턴마다 테스트 한 개. 지금 네 패턴에는 `UNKNOWN_PATTERN` 거부 테스트뿐이다

---

## 왜 지금까지 안 됐나

기록해 둔다. 같은 일이 또 일어난다.

- 번들만 하고 **읽지 않았다.** 3.3MB 는 사람이 훑을 크기가 아니다.
  `rules-index.md` 라는 색인이 있는데 그 색인을 아무도 안 열었다
- **컨텍스트 예산 문제다.** G8 을 도는 세션은 이미 게이트 12개를 들고 있다.
  1.4MB 짜리 규칙 묶음을 열 자리가 없다 →
  [ADR-0012](../adr/0012-게이트를-헤드리스-세션으로-실행한다.md) 가 다루는 문제와 같다
- **렌더가 한 번 실패했고 우회했다.** hyperframes CLI 가 타임아웃하자 Chrome 스크린샷으로
  갈아탔고, 그 뒤로 hyperframes 를 다시 시도하지 않았다. 우회가 굳었다

3번이 제일 나빴다. **의존성이 죽은 줄 알았는데 죽지 않았다** — 첫 실행에서 Chrome 을
내려받는 4분이었고, 그 4분을 한 번 겪은 뒤로 아무도 다시 재지 않았다.

고친 방식이 중요하다. "이번엔 hyperframes 를 쓰자" 가 아니라 **재는 것을 게이트로**
만들었다. 다음에 또 죽으면 `--probe` 가 죽었다고 적고, 우회하면 우회했다고 적힌다.
우회 자체가 잘못이 아니다 — 우회했다는 사실이 안 적히는 것이 잘못이다.

컨텍스트 예산 문제(2번)도 같이 풀렸다. G8 세션은 이제 게이트 12개가 아니라
`render-path.md` 하나를 들고 시작한다 (팩 6,279B · 전량의 4%).
