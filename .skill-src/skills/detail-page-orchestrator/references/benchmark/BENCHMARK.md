# 기준작

이 폴더의 두 파일이 **"좋은 상세페이지" 의 정의**다. 취향으로 다투지 않기 위해 둔다.
새 회차의 HTML 은 여기에 걸어 잰다.

| 파일 | 무엇 |
| --- | --- |
| `v4-reference.html` | 같은 상품(해충 끈끈이)의 완성 기준작. 이미지는 구조를 보려고 `DATA_URI` 로 바꿨다 |
| `coupang-wing-780.html` | 쿠팡 윙 상세. 카테고리와 무관한 **강도 기준선** |

원본(이미지 포함 9.3MB)은 `bd6b3d0ab4ff44e2001c06ef05c00ba0c271959d` 의
`examples/` 에 있다. 필요하면 `git fetch --depth 1 origin <hash>` 로 받는다.

## 실측

`scripts/lib/benchmark.mjs` 의 `measure()` 결과다.

**하한 = 두 기준작 실측의 최솟값.** 사람이 고르지 않는다.
`tests/benchmark.test.mjs` 가 `===` 로 확인하므로 손으로 낮출 수 없다.

| 지표 | v4 | 쿠팡 윙 | 하한 | 무엇을 묻는가 |
| --- | --- | --- | --- | --- |
| `sections` | 13 | 19 | **13** | 서사를 몇 장면으로 나눴는가 |
| `fullBleed` | 4 | 9 | **4** | 이미지를 잘라서라도 꽉 채워 쓰는가 |
| `overlays` | 3 | 22 | **3** | 글자를 이미지 **위에** 얹는가 |
| `visualStages` | 8 | 21 | **8** | 장면마다 **다른 크기의** 무대를 주는가 |
| `maxTypePx` | 116 | 347 | **116** | 디스플레이 크기의 글자가 있는가 |
| `typeScale` | 21 | 38 | **21** | 위계가 몇 단인가 |

처음에는 이 하한을 안전하게 낮춰 적었다 — `sections 10 · fullBleed 2 ·
maxTypePx 56`. 두 기준작 어느 쪽에도 못 미치는 값이다. 그래서 기준작의 절반짜리
페이지가 여섯 항목을 전부 통과했고 "쿠팡과 비교해 상업적이지 않다" 는 말을 들었다.

**낮춰 잡은 하한은 하한이 아니라 면제다.** 올리고 싶으면 이 표가 아니라
`references/benchmark/` 의 기준작을 바꾼다.

### 걸린 회차들

```
1회차  sections  8 · fullBleed 0 · overlays 1 · visualStages 0 · maxTypePx  60 · typeScale  ?
2회차  sections 10 · fullBleed 3 · overlays 4 · visualStages 4 · maxTypePx  64 · typeScale 10
기준작 sections 13 · fullBleed 4 · overlays 3 · visualStages 8 · maxTypePx 116 · typeScale 21
```

1회차는 모든 섹션이 `padding:104px 60px; text-align:center` 흰 박스였다.
**글자를 이미지 위에 올릴 CSS 가 아예 없었다.**

2회차는 그것을 고쳤는데도 밋밋했다. 원인이 다르다 — 조립기가 `.headline` **하나로**
모든 역할의 제목을 찍었다. 히어로도 64px, 규격표도 64px, 주의사항도 64px.
`typeScale 10` 이 그 뜻이다. 기준작은 116 · 66 · 45 · 42 · 34 · 28 · 27 · 25 · 24 ·
22 · 21 · 20 · 19 · 18 · 17 · 16 · 15 · 14 · 12 로 **21단**을 쓴다.

크기가 한 단이면 위계가 없고, 위계가 없으면 눈이 어디를 먼저 볼지 정하지 못한다.
그것이 "상업적이지 않다" 의 정체다.

## 스크립트가 못 재는 것

### 팔레트

CSS 만 봐서는 3px 칩의 배경과 한 화면을 덮는 배경을 못 가른다. 그래서 안 잰다.
대신 기준작을 보고 판단한다.

```
v4    #ffdf00 노랑 · #f12626 빨강 · #0c0d0f 근검정 · #fff9df 크림
```

고채도 주색 하나, 경고색 하나, 근검정 하나. 페이지가 **주색 판 → 검정 판 →
이미지 판** 으로 갈아탄다. 저채도 단색 위에 얇은 선으로 정리한 화면은
포트폴리오이지 상세페이지가 아니다.

### 강조 장치

v4 가 쓴 것들이다. 전부 쓸 필요는 없지만 **하나도 없으면 밋밋해진다.**
조립기(`g9-build/scripts/lib/render.mjs`)가 어느 것을 내는지 옆에 적는다.

| 장치 | v4 | 조립기 | 플랜이 주는 것 |
| --- | --- | --- | --- |
| 대형 숫자 116px | `.quantity .big` | `.figure` | `section.figure = {value, unit}` |
| 3칸 숫자 스트립 | `.stat-strip` | `.stat-strip` | `section.stats = [{value, label}]` |
| 좌우 전/후 비교 | `.two-up` | `.two-up` | `section.captions` |
| 이미지 위 오버레이 + 셰이드 | `.overlay-*` | `.overlay-*` | `role: hero \| closing` |
| 기울인 배지 | `.impact-line` | `.callout` | `section.emphasis` |
| 원형 benefit 3개 | `.benefit` | — | 아직 없다 |

`.figure` 와 `.stat-strip` 은 **플랜이 값을 줄 때만** 나온다. 근거 없는 숫자를
채우려고 만들지 않는다 — 없으면 그 장치는 그냥 안 나온다.

### 카피의 목소리

v4 는 공급처 표현을 **그대로 쓴다.**

```
강력 점착 · 생활방수 · 50장 대용량 · 붙으면 놓치지 않도록
```

우리가 지어내지 않을 뿐, 공급처와 쿠팡이 이미 쓰는 표현은 쓴다.
같은 제품을 파는 페이지가 그 제품의 판매 언어를 안 쓰면 팔리지 않는다.

한계 고지는 **푸터에 한 번만** 둔다. 본문 섹션마다 각주를 달지 않는다.

```html
<footer>※ 본 페이지에는 제품 이해를 돕기 위한 연출 이미지가 포함되어 있습니다. …</footer>
```

`references/sales-story.md` 가 서사 순서를, `scripts/lib/copy.mjs` 가
고객 화면에 나가면 안 되는 제작자 언어를 맡는다.
