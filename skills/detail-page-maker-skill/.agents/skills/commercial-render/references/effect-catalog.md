# 효과 카탈로그 — 엔진이 만들 수 있는 것

`claim-visuals.md`가 **무엇으로 보이게 할까**라면, 이 문서는 **그걸 어느 엔진으로
어떻게 만드나**다. 상품에 종속되지 않는다.

분기는 하나다.

> **제품 픽셀이 프레임 사이에 바뀌어야 하는가?**

아니오면 HyperFrames, 예면 make-consistent-gif. 판단은 `engine-routing.md`.

`구현` 열의 허용 속성은 `opacity` `x` `y` `scale` `rotation` `color`
`backgroundColor` `borderRadius` `transform` 뿐이다.
`clip-path`·`width`·`height` 트윈과 `repeat: -1`은 금지다.

---

## A. HyperFrames — 제품은 고정, 주변이 움직인다 (12)

| # | 효과 | 무엇이 움직이나 | 어떤 주장에 | 구현 |
| --- | --- | --- | --- | --- |
| 1 | **게이지 차오름** | 바·링이 0에서 목표까지 참 | 용량 · 잔량 · 진행률 · 충전 | `scaleY` + `transformOrigin: bottom`. `width` 트윈 우회 |
| 2 | **숫자 확정 팝** | 수치가 제자리에서 커졌다 돌아옴 | 사양 · 수량 · 규격 | 값은 **t=0에 확정**하고 `scale` 펄스만. 0부터 세면 첫 프레임이 틀린 사양이 된다 |
| 3 | **궤적 그리기** | 선이 한쪽 끝에서 반대편까지 그려짐 | 경로 · 도달 범위 · 연결 · 동선 | SVG `stroke-dashoffset` 트윈 |
| 4 | **좌표 타깃 줌** | 카메라가 특정 부위로 정확히 들어감 | 부위 지목 · 마감 · 각인 | 측정 좌표 기반 `scale`+`x/y`. **소스 해상도 ≥ 렌더 × 배율** 아니면 뭉갠다 |
| 5 | **랙 포커스** | 앞 레이어가 풀리고 뒤가 잡힘 | 매크로 진입 · 주목 이동 | `filter: blur` 교차. 근/원 레이어 2장 필요 |
| 6 | **다단 카메라** | 전환 지점에만 짧게 밀고 재고정 | 리듬 · 강조 순간 | 상태 변화 시점에 push-in 1회. 상시 팬·줌은 coverage로 안 센다 |
| 7 | **상태 스왑** | 같은 중심에서 A가 줄고 B가 튀어나옴 | 모드 전환 · 옵션 교체 | 나가는 쪽 축소+페이드, 들어오는 쪽 `back.out(2)` 오버슛 |
| 8 | **컨테이너 모프** | 상자가 다른 형태로 변해 실제를 드러냄 | 접힘 · 변신 · 화면 전환 | `width`/`height` 금지를 균일 `scale`로, 나머지는 `borderRadius`·`boxShadow` 페인트만 |
| 9 | **스프링 프레스** | 눌렸다 튕겨 돌아옴 | 버튼 · 촉감 · 쿠션 · 탄성 | 선형 압축 → 스프링 복귀 두 트윈. 색·글로우 변형 가능 |
| 10 | **파티클 확산** | 입자가 한 점에서 퍼지거나 모임 | 분사 · 향 · 열 · 냄새 · 살균 | **상수 좌표 배열**에 `opacity`+`x/y`. 시드 없는 `Math.random()` 금지 |
| 11 | **전후 와이프** | 경계선이 지나가며 두 상태가 갈림 | 사용 전후 · 경쟁 비교 | 래퍼와 이미지의 `x`를 역방향 상쇄. 첫 프레임을 `p=0.5`에 두면 t=0에 비교 의도가 전달된다 |
| 12 | **순차 조립** | 흩어진 요소가 자리를 찾아 정렬 | 구성품 · 세트 · 단계 · 스펙 | 상수 시작 좌표에서 `x/y`+`opacity` 스태거 |

## B. make-consistent-gif — 제품 자체가 달라진다 (6)

프레임마다 생성하므로 **텍스트·치수선·라벨을 절대 얹지 않는다.** 프레임마다 흔들린다.

| # | 효과 | 템플릿 | 어떤 주장에 | 프레임 계획 |
| --- | --- | --- | --- | --- |
| 13 | **턴어라운드** | `turnaround` | 뒤·옆 형상 · 양면 동일 | 프레임 수를 360의 약수로. 8이면 45°씩 |
| 14 | **분해** | `exploded` | 내부 구조 · 층 구성 | 층이 축을 따라 등간격으로 벌어짐 |
| 15 | **채움** | `fill` | 수납량 · 용량 · 흡수 | 빈 상태 → 단계별 → 가득. 용기 위치 고정 |
| 16 | **결합** | `fit` | 호환 · 조립 · 부품 장착 | 접근 → 접촉 → 반쯤 삽입 → 완결. **중간 단계를 좌표로 못박지 않으면 모델이 결합 완료로 건너뛴다** |
| 17 | **복원** | `restore` | 세척 · 관리 · 형상 회복 | 오염 → 세척 중 → 원상. 오염 위치를 프레임마다 고정 |
| 18 | **변형·하중** | `stress` | 탄성 · 내구 · 접힘 | 힘 방향과 변형량을 프레임마다 명시 |

## C. 혼용 — 형상 변화 위에 정보 (2)

MCG 프레임을 HyperFrames 배경 트랙에 얹고 그 위에 결정론 오버레이를 합성한다.
**회전·변형에 흔들리지 않는 라벨을 붙일 수 있는 유일한 경로다.**

| # | 효과 | 구성 | 어떤 주장에 |
| --- | --- | --- | --- |
| 19 | **회전 + 부위 라벨** | MCG 턴어라운드 → `frame-sequence` → 콜아웃 링·라벨 | 각 면의 부품 이름 · 양면 차이 |
| 20 | **변형 + 치수선** | MCG 변형 시퀀스 → `frame-sequence` → 치수 카드 | 접었을 때/펼쳤을 때 규격 |

```
make-consistent-gif → RGBA 프레임 시퀀스
        ↓
HyperFrames 배경 트랙에 frame-sequence 로 얹고
        ↓
결정론 오버레이(라벨·콜아웃·치수선) 합성
        ↓
MP4 → FFmpeg GIF / animated WebP
```

---

## 고를 때 흔히 틀리는 것

- **HyperFrames로 제품을 바꾸려 한다.** CSS 변환으로는 불가능하고 억지로 흉내 내면
  형상이 깨진다. 13~18은 MCG 경로다.
- **MCG로 정보 오버레이를 만든다.** 결정론이 없어 치수선·숫자가 프레임마다 흔들린다.
  정보가 필요하면 C군 혼용이다.
- **A군을 장식으로만 쓴다.** 6·10은 정보를 늘리지 않으면 coverage로 세지 않는다.
  `loop-qa.md`의 장식-only 판정을 먼저 통과시킨다.
- **프레임 시퀀스만으로 컴포지션을 만든다.** `frame-sequence`는 컷 전환이라 타임라인
  길이가 0이 되고 `check`가 `sweep_static`으로 막는다. 전 구간을 덮는 트윈이 하나
  필요하다(생성기가 자동으로 넣는다).

## 인접 다양성

인접 슬롯은 `카메라 · 핵심 변화 · 전환 · 강조 그래픽` 4축 중 2축 이상 달라야 한다.
같은 군에서 연달아 고르면 축이 겹치기 쉽다. A군 → B군 → A군처럼 섞는다.

---

# 신규 kind 파라미터 (13종)

`build_motions.py` 에 구현됐고 `smoke/spec.json` 에 실사용 예시가 있다.
기존 16종은 [`composition.md`](composition.md) 의 오버레이 표를 본다.

## 공통 옵션

모든 신규 kind 가 받는다.

| 키 | 기본 | 뜻 |
| --- | --- | --- |
| `tone` | `dark` | `dark` \| `light`. 배경 밝기에 맞춰 팔레트를 뒤집는다. 하드코딩 금지 |
| `anchor` | kind별 | `[x, y]` 0~1 정규화. **제품 부위에 붙인다.** 중앙 강제를 대체 |
| `align` | `center` | `left` \| `center` \| `right`. anchor 기준점 |
| `scrim` | `false` | 밝은 배경 위 텍스트 뒤에 패널을 깐다 |

## 개별

| kind | 핵심 파라미터 | 비고 |
| --- | --- | --- |
| `count-pop` | `from` `to` `unit` `label` `grid:{cols,dot,gap}` `rise` | `쌓기` 전용. 누적이 정보다. **확정 사양에는 쓰지 않는다** — `metric-card` 를 쓴다. `to > 120` 이면 그리드 생략 |
| `gauge-fill` | `bars:[{label,to,color}]` `top` `orient` | `to` 는 0~1. **바마다 color 를 다르게** 줘야 비교가 성립. 라벨은 불투명 pill 이 깔린다 |
| `path-draw` | `points:[[x,y],…]` `color` | 끝점에 링이 팝. 길이 라벨을 붙이면 검증 대상이 된다 |
| `target-zoom` | `target:[x,y]` `zoom` `max_zoom` `label` | **소스 해상도 ≥ 렌더 × zoom** 이 아니면 뭉갠다. 기본 상한 1.8 |
| `rack-focus` | `label` `label_y` + `assets.near` | 근경 레이어 이미지가 별도로 필요 |
| `camera-push` | `at` `zoom` `hold` | 오버레이가 아니라 카메라만. 상시 줌이 아니라 전환 지점 1회 |
| `state-swap` | `states:[{label}]` `top` `color` | 같은 중심에서 교체. `nowrap` + ellipsis 로 넘침을 막는다 |
| `container-morph` | `steps:[{label,scale,radius}]` | `width`/`height` 트윈 금지를 균일 `scale` + `borderRadius` 로 대체 |
| `press-spring` | `point:[x,y]` `reps` | 배경에 `scaleY` 압축 후 `elastic.out` 복귀 |
| `spread-bloom` | `origins:[[x,y]]` `tint` `rings` `size` | 냉감·온기·탈취·살균 공용. 반지름이 아니라 `scale` 트윈 |
| `assemble` | `items:[{label}]` | 상수 시작 좌표에서 스태거 진입 |
| `xray-reveal` | `marks:[[x,y]]` `tint` + `assets.inner` | 스캔선 통과 → 속 레이어 노출 → 포인트 팝 |
| `flow-arrows` | `lanes:[[x,y]]` `membrane` `travel` `color` | 좌표는 상수 배열. 시드 없는 난수 금지 |

## 스모크 스위트

kind 를 추가하거나 고칠 때마다 돌린다. 20종을 한 번에 렌더해 회귀를 잡는다.

```sh
python3 scripts/build_motions.py --spec smoke/spec.json --out smoke/projects
bash    scripts/render.sh --projects smoke/projects --out smoke/renders --spec smoke/spec.json
python3 scripts/qa_motion.py --spec smoke/spec.json --renders smoke/renders
```

`smoke/renders/poster-sheet.jpg` 를 **눈으로 본다.** 자동 게이트가 못 잡는 결함이
여기서 나온다. 실제로 이 스위트가 처음 돌 때 다음 넷을 잡았다.

- `gauge-fill` 라벨이 밝은 제품 위에서 명암비 1.33:1
- `metric-card` 첫 프레임이 `0ML` (확정 사양을 0 부터 셈)
- `state-swap` 라벨이 캔버스 밖으로 넘침
- `container-morph` 라벨이 제품과 겹쳐 안 읽힘
