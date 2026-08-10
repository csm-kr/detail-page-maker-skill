# 780 상업 컴포지션

HyperFrames 슬롯의 뼈대. 문법 정본은 형제 `hyperframes-core`, 명령은 `hyperframes-cli`를 따른다.

## 뼈대

```html
<div id="root" data-composition-id="main" data-start="0"
     data-width="780" data-height="780" data-duration="3.6">
  <section id="scene-main" class="stage clip"
           data-start="0" data-duration="3.6" data-track-index="1">
    <img class="bg" src="assets/bg.png" alt="고객이 이해할 제품 설명" />
    <div class="scrim-top"></div><div class="scrim-bot"></div>
    <!-- 오버레이 레이어 -->
    <div class="head">
      <span class="eyebrow">…</span>
      <span class="hl">첫 줄</span><span class="hl"><em>강조 줄</em></span>
    </div>
  </section>
</div>
```

- 루트는 픽셀로 크기가 고정돼야 한다. 전체 화면 채움은 루트가 아니라 **전면 자식**에 건다.
  루트 자체의 `background`는 프레임 합성에서 누락돼 검게 렌더될 수 있다.
- 타임라인은 페이지 로드 시 **동기로** 하나만 만들고 `window.__timelines["main"]`에 등록한다.
- 모든 `id`는 조립된 페이지 전체에서 고유해야 한다.
- Studio가 편집 대상으로 삼도록 타임라인에 보이는 요소에 `id`를 준다. 없으면 `lint` 경고.

## 결정론 허용 속성

`opacity` · `x` · `y` · `scale` · `rotation` · `color` · `backgroundColor` · `borderRadius` · transform.

`display`·`visibility` 직접 트윈 금지. `clip-path`·`width`·`height` 트윈 금지.
`repeat: -1` 금지. 유한 횟수로 계산한다.
`Date.now()`·시드 없는 `Math.random()`·네트워크·입력 상태 금지. 좌표는 상수 배열로 박는다.

변형되는 요소는 **블록 레벨 + 실제 크기**를 가져야 한다. 인라인 `<span>`에 `scaleX`는 무효다.

## 와이프를 허용 속성만으로 만들기

`clip-path`가 금지이므로 두 레이어의 `x`를 역방향으로 상쇄한다.

```
바깥 래퍼(overflow:hidden)  x:  0 → -W     (보이는 창이 줄어든다)
안쪽 이미지                 x:  0 → +W     (제자리에 머문다)
분할선                      x:  W → 0
```

`p`를 남은 BEFORE 비율이라 하면 `wrapper.x = -W(1-p)`, `img.x = +W(1-p)`, `divider.x = W·p`.
첫 프레임을 `p=0.5` 근처로 두면 t=0에 전후가 동시에 보여 비교 의도가 즉시 전달된다.

## 오버레이 종류

`scripts/build_motions.py`가 지원하는 `overlay.kind`.

| kind | 쓰임 | 핵심 파라미터 |
| --- | --- | --- |
| `alert-ring` | 문제 부위 경고 | `x y size color` |
| `dashed-zone` | 발생 영역 표시 | `x y w h` |
| `swarm` | 개체 증가·이동 | `points[] mode(grow\|rise)` |
| `converge` | 대상으로 모여듦 | `paths[{from,to}] target` |
| `load-arrow` | 하중·방향 | `x y len` |
| `runoff` | 흐름·비딩 | `streaks[] beads[]` |
| `split-state` | 좌우 상태 대비 | `leftTint rightTint marks` |
| `step-cuts` | 단계 컷 전환 | `steps[{img,caption}]` |
| `wipe-compare` | 전후 와이프 | `before after startRatio` |
| `size-cards` | 사이즈·정보 카드 | `cards[] bar` |
| `frame-sequence` | 생성 프레임 시퀀스 재생 (MCG 산출물) | `frames[]` |
| `numbered-chapter` | POINT 01 챕터 배지 | `number top color` |
| `spec-grid` | 아이콘·라벨 스펙 격자 | `items[{label,sub}] cols top` |
| `free-from` | 無 · NO 배지 스탬프 | `items[] mark top` |
| `metric-card` | 수치 카운트업 + 조건 각주 | `metrics[{value,unit,label,condition}]` |
| `cert-badge` | 인증·특허·시험 씰 | `items[{name,issuer,ref}]` |

`metric-card`의 `condition`(대상·기간·측정조건), `cert-badge`의 `issuer`·`ref`는 **선택 항목이다.**
있으면 화면에 함께 새기고, 없으면 그 줄만 빼고 빌드하며 stderr에 경고만 남긴다.

모든 kind는 **첫 요소를 t=0에 세운다.** 오버레이가 전부 뒤늦게 등장하면 첫 프레임에
헤드라인만 남아 시각 근거가 사라지고, 이는 첫 프레임 계약 위반이다.

새 kind를 추가할 때는 결정론 허용 속성만 쓰고, 첫 프레임 상태로 복귀하는 종료 트윈을 반드시 넣는다.

## 타이포

| 요소 | 780px 기준 |
| --- | --- |
| eyebrow | 25px / 800 |
| 헤드라인 | 54px / 900, 2줄 이내 |
| 캡션 | 44px / 900, 불투명 pill |
| 정보 카드 | 46px / 900 |

줄바꿈은 `<span class="hl">` 블록으로 직접 끊는다. 본문에 `<br>`을 쓰지 않는다.
조사·명사, 숫자·단위를 분리하지 않는다. 핵심 단어를 마지막 줄에 둔다.

## 검증

```sh
npx hyperframes lint --json      # 빠른 반복
npx hyperframes check --json     # 최종 게이트. lint + runtime + layout + motion + contrast
npx hyperframes render --quality high --output out.mp4
```

`check`가 0 findings가 아니면 렌더하지 않는다.
