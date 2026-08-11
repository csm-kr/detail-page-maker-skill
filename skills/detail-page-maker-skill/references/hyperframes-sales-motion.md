# HyperFrames + ChatGPT Image 2 정보형 세일즈 모션

이 문서는 상세페이지용 정적 자산 32개를 계획·생성·선별한 뒤 HyperFrames에서
정보형 모션으로 조립하는 기본 제작 계약이다. HyperFrames는 모션 조립기이고,
ChatGPT Image 2를 호출하는 God Tibo는 정적 자산 생성기다. 둘 사이에는 샷 계획,
자산 metadata, 좌표 신뢰도, fallback 정책이 반드시 있어야 한다.

## 고정 파이프라인

1. 제품 사실, 타깃 문제, 구매 이유, 치수·구성·사용법의 근거를 고정한다.
2. 페이지별 고객 한 문장과 이를 증명할 모션 유형을 선택한다.
3. 모션마다 필요한 shot type과 실제 입력 조건을 샷 리스트로 만든다.
4. 32개 후보를 God Tibo의 한 `items: 32`, `workers: 32` provider job으로 생성한다.
5. 동일성·상업성·모션 적합도로 8~15개 대표 자산을 선택한다.
6. 제품 bbox, anchor, feature bbox, text/dimension safe area, pair/group를 기록한다.
7. 정밀 위치 overlay만 God Tibo locator guide를 별도로 만들고 marker 좌표를 추출한다.
8. HyperFrames T1~T10 템플릿에 깨끗한 자산과 metadata를 연결한다.
9. strict/frame check 후 결정론적 무음 MP4를 렌더한다.
10. FFmpeg로 GIF와 animated WebP를 파생한다.
11. 첫 프레임, 1초 전달, 위치 정확성, 제품 동일성, 루프, 모바일 가독성을 QA한다.

## 32개 후보의 샷 계획

32개는 무작위 변형 수가 아니다. 아래 배분은 기본 예시이며 실제 근거와 선택한
모션에 따라 슬롯 수를 재배분한다.

| 논리 그룹 | 권장 수 | shot type 예시 | 연결 모션 |
| --- | ---: | --- | --- |
| 제품 베이스 | 8 | `hero_front`, `hero_angle` | T1, T10 |
| 기능·소재 디테일 | 6 | `feature_detail_1/2`, `material_macro` | T4, T7 |
| 치수 기준 컷 | 4 | `dimension_front`, `dimension_side` | T2 |
| 기능 전체 컷 | 4 | `feature_overview` | T3 |
| 실제 상태 pair | 4 | `before_scene`, `after_scene` | T5 |
| 사용 장면·단계 | 4 | `usage_scene_1/2` | T6 |
| 구성·구조 | 2 | `components_flatlay`, `exploded_view` | T8, T9 |

치수가 확인되지 않으면 치수 4개를 만들지 않고 Hero·디테일·사용·정보 카드 슬롯으로
재배분한다. 실제 전후 pair가 없으면 before/after 슬롯도 만들지 않는다. 논리 그룹은
프롬프트와 선택을 위한 분류일 뿐, 8개씩 순차 실행하는 물리 batch가 아니다.

고급 제작에서 40~60개 후보가 필요하면 동시성 상한은 32 provider workers로 유지하고
내부 큐 또는 승인된 추가 확장으로 처리한다. 기본 경로는 항상 32개 단일 동시 batch다.

## 일관성 anchor set

먼저 실제 제품 사진과 공급처 동일 SKU 이미지 중 승인된 3~5개 뷰를 anchor set으로
고정한다. 정면, 사선, 측면, 대표 디테일, 대표 사용 장면이 이상적이다. 소스 뷰가
부족할 때만 anchor-first 생성 후 확장한다.

모든 후보에 다음 불변 조건을 공통 적용한다.

- 제품 형태와 실제 비율
- 색상과 재질감
- 구멍·홈·끈·패턴·부품의 수와 위치
- 로고와 표면 문양
- 실제 구성품
- 상품별 촬영·배경 톤

프레임 사이 또는 컷 사이에 제품 구조가 바뀌는 생성형 모핑은 금지한다.

## 자산 metadata

선택 후보마다 다음 필드를 저장한다.

```yaml
image_id: image-feature-overview-01
shot_type: feature_overview
view_type: front
candidate_score: 94
recommended_template: T3_FEATURE_HOTSPOT
anchor_points: []
bbox_regions: []
dimension_safe_area: {x: 0.08, y: 0.08, width: 0.84, height: 0.84}
text_safe_area: {x: 0.08, y: 0.05, width: 0.84, height: 0.20}
before_after_pair_id: null
consistency_group: product-main-v1
locator_guide: null
```

좌표는 해상도 독립적인 0~1 정규화 값으로 기록한다. `candidate_score`는 제품
동일성, 메시지 증명력, 제품 점유율, 상업성, 텍스트 안전영역, 템플릿 적합도를
분리 평가한 뒤 합산한다. 32개를 모두 쓰지 않고 8~15개만 선택하는 것이 정상이다.

## God Tibo 정밀 locator guide

T2 치수, T3 precise anchor, T6 방향 화살표처럼 위치 정확성이 주장 자체인 경우에만
locator guide를 만든다. 상업 후보 32장 batch를 다시 나누는 것이 아니라, 대표
자산이 승인된 뒤 필요한 guide item만 한 보조 batch로 동시에 실행한다.

### 1. 가이드 편집

- Image 1은 HyperFrames가 실제 렌더할 깨끗한 원본이다.
- `size_mode: invariant`, `gif: false`, `QUALITY_GATE:CLEAN_COMMERCIAL`을 쓴다.
- 원본의 geometry·crop·camera·손·도구·빛·물체 위치를 모두 보존한다.
- 실제 의미점에 16~18px의 작고 평평한 `#FF00FF` 원형 점만 추가한다.
- 한 점마다 물리적 의미를 프롬프트에 적고 text·line·arrow·ring·glow·label을
  모두 금지한다.
- clean source를 덮어쓰지 않고 guide를
  `.detail-page/generation/pending/locator-guides/<guide-id>/`에 별도 저장한다.

방향 화살표는 최소 `physical-action-origin`과
`physical-interaction-target` 두 점을 쓴다. 예를 들어 벗기기는 필름이 실제로
분리되기 시작하는 힌지와 손가락이 필름을 집은 점이다. 치수는 실제 제품 외곽의
가로·세로 축별 시작·끝점을 쓴다. 제품 중심이나 빈 배경을 편의상 찍지 않는다.

### 2. 좌표 추출

가이드 spec의 경로는 spec 파일 기준 상대 경로다.

```json
{
  "schema_version": "1.0",
  "canvas": {"width": 780, "height": 780},
  "guides": [{
    "id": "step-direction",
    "source": "../approved/step-clean.png",
    "path": "../pending/locator-guides/step/frame-000.png",
    "expected": 2,
    "group": "points",
    "roles": ["physical-action-origin", "physical-interaction-target"]
  }]
}
```

```sh
node scripts/motion/extract-locator-guides.mjs \
  --spec "<project>/.detail-page/generation/locator-guides.json" \
  --output "<project>/.detail-page/generation/locator-anchors.json"
```

실행기는 marker component 수가 `expected`와 다르면 중단하고 source/guide의 픽셀
크기가 다르면 중단한다. 출력은 원본 좌표, 0~1 정규화 좌표, target canvas 좌표,
두 자산 SHA-256과 marker semantic role을 가진다. 여러 제품 외곽은
`group: boxes`, `box_count`, `points_per_box`로 묶고 곡선은 `group: curve`와
실제 경로 순서의 점을 쓴다.

### 3. HyperFrames 합성

- SVG `viewBox`를 extraction output의 canvas와 일치시킨다.
- clean source만 `<img>`로 렌더하고 guide는 DOM·CSS asset에 넣지 않는다.
- SVG 시작·끝·중간점을 extraction output에서 직접 읽는다.
- 화살표 머리는 target point에, 치수선 끝은 실제 외곽 endpoint에 둔다.
- 임의 margin·translate로 위치를 보정하지 않는다. 불일치하면 guide를 다시 만든다.
- first/mid/last snapshot에서 clean source 기준 편차 2px 이하를 확인한다.

motion brief의 `locator_guide`에는 generator, invariant mode, source/guide ID와
SHA-256, marker count/coordinates, extraction receipt, clean-source render와
guide-publication 금지를 기록한다. Guide가 public HTML·Wing·`output/media`에
참조되면 hard fail이다.

## T1~T10 템플릿

| ID | 템플릿 | 필요한 자산 | 핵심 모션 |
| --- | --- | --- | --- |
| T1 | Hero Reveal | hero front/angle | cinematic scale reveal, 핵심 카피 |
| T2 | Dimension Reveal | 정면/측면 기준 컷, 실제 치수 | SVG 치수선·화살표·수치 |
| T3 | Feature Hotspot | 전체 제품, feature 위치 | 전체→강조→확대→설명→복귀 |
| T4 | Detail Zoom | 전체 컷+고해상도 detail | clip-path 돋보기·mask reveal |
| T5 | Before After Slider | 실제 정렬 pair | wipe·push·slider |
| T6 | Steps Flow | 실제 단계 1~3컷 | 동사·방향·pulse·완료 check |
| T7 | Material Motion | material macro와 검증 사실 | 압력·공기·물방울 등 구조 반응 |
| T8 | Components Layout | 검증된 구성품 flatlay | 순차 펼침·이름·수량·전체 정렬 |
| T9 | Exploded Layers | 검증된 layer PNG 2개 이상 | 2.5D 분리·라벨·재결합 |
| T10 | Info Cards | 제품 전체와 검증 데이터 | 사이즈·소재·구성·관리 카드 |

추가 모션 문법인 상태 전환, 시선 유도 스캔, 윤곽 추적, 사용 범위, 옵션 비교는
가장 가까운 T1~T10 템플릿의 variant로 기록한다. 옵션은 실제 옵션별 이미지를
사용하고 프로그래밍 recolor로 실제 상품처럼 표현하지 않는다.

## 모션별 정보 계약

모든 GIF는 다음을 충족한다.

- 한 GIF당 고객 메시지 하나
- 첫 프레임만 보아도 제품/문제, 한 줄 메시지, 시각 근거가 보임
- 1초 안에 무엇을 설명하는지 이해됨
- 제품 geometry와 identity가 고정됨
- `decorative_overlay_only: false`
- `information_delivery_mode`는 고정 제품 그래픽 합성, 정렬된 실제 상태 pair,
  검증된 layer 자산 중 하나
- 인접 GIF와 카메라·핵심 변화·전환·강조 그래픽 중 두 축 이상 다름

제품이 고정되고 SVG·라벨만 움직여도 실제 치수, 기능 위치, 단계, 구성, 소재 원리를
새로 이해시키면 유효한 정보형 모션이다. 반대로 새 정보를 추가하지 않는 팬·줌·흔들기·
광선·스캔·입자만 움직이면 장식-only 실패다.

## 치수 모션

- 공급처·실측 등 검증된 값만 사용한다.
- 제품 외곽을 따라 윤곽선을 그린 뒤 치수선으로 전환하거나 축별로 분리한다.
- 치수선은 제품을 가리지 않는 외부 여백에 배치한다.
- 가로·세로·높이·두께를 한꺼번에 보여 복잡하게 만들지 않고 순차 공개한다.
- 실제 제품 비율을 고정한다.
- 치수가 없으면 T2를 생성하지 않고 T10 정보 카드 또는 다른 근거 모션으로 바꾼다.

## 기능 콜아웃 신뢰도

| confidence | route | 표현 |
| ---: | --- | --- |
| 0.85 이상 | `precise_anchor` | 정규화 point, ring, trace line |
| 0.60~0.85 | `bbox_glow` | 넓은 타원·마스크·글로우·spotlight |
| 0.60 미만 | `separate_detail_card` | 제품 위 표기를 포기하고 별도 detail 컷 |

정밀 콜아웃의 순서는 `전체 위치 → 부위 강조 → 확대 → 기능 설명 → 전체 복귀`다.
포인트 개수에 상한은 없다. 동시에 3개를 넘기지 않게 순차로 밝히고 각 포인트를
0.8~1.2초 유지한다. 포인트가 많으면 길이를 늘려서 담는다.
긴 문장·교차 화살표·동시 점멸은 금지한다.

## 디테일·전후·단계·구성

- 돋보기는 같은 이미지를 키우지 않고 별도 고해상도 detail을 원형 clip-path에 넣는다.
- Before/After는 실제 두 이미지의 제품 중심·크기·방향·카메라를 먼저 정렬한다.
- 실제 비교 pair가 없거나 정렬이 실패하면 slider 대신 정보 카드 전환을 사용한다.
- 사용법은 단계 수 제한 없이 짧은 동사, 방향 화살표, pulse, 완료 check를 쓴다. 단계가 많으면 길이를 늘린다.
- 불확실한 손가락을 생성해 누르는 연출보다 고정 제품 위 화살표·pulse를 우선한다.
- 구성품과 layer는 공급처 구성·실물에서 확인된 것만 펼치고 이름과 수량을 표시한다.
- exploded view가 불안정하면 T9 대신 T10 구조 정보 카드로 전환한다.

## 소재·작동 원리

`입력/압력 → 제품 구조 반응 → 기능 작동 → 사용자 결과`를 한 화면의 인과로
설명한다. 유연성, 통기성, 방수, 탄성, 마찰 같은 표현은 실제 확인된 사실만 사용한다.
검증되지 않은 내구성·방수 등급·하중·성능 숫자는 만들지 않는다.

## 전환과 화려함

전환 계열 수와 강조 전환 개수에 프로젝트 전체 상한은 없다. 각 motion의 목적에
맞는 효과를 아래 표에서 고른다. 인접 motion 다양성 검사는 그대로 유지된다.

| 목적 | 권장 효과 |
| --- | --- |
| 제품 첫 등장 | cinematic zoom, scale reveal |
| 가장 강한 장점 공개 | flash-through-white |
| 디테일 확대 | mask reveal, iris reveal |
| 전후 비교 | push, cover, wipe |
| 기능 전환 | whip pan |
| 프리미엄 제품 | blur dissolve, cross-warp |
| 테크 제품 | grid, chromatic split |
| 소재·유연성 | ripple, soft morph |

강한 shader는 제품 첫 등장 또는 핵심 장점 공개에만 쓴다. 효과가 제품 기능을
가리거나 메시지를 대신하면 실패다. `soft morph`도 제품 형상을 바꾸지 않고 배경·
마스크·광학 효과에만 적용한다.

## 렌더와 변환

HyperFrames의 정본은 결정론적 무음 MP4다. MP4를 한 번 렌더한 뒤 같은 파일에서
FFmpeg로 GIF와 animated WebP를 만든다. HyperFrames가 GIF를 직접 렌더하는 명령을
기본 경로로 쓰지 않는다. MP4·GIF·WebP는 digest edge로 연결하고 first/mid/last와
반복 경계를 동일한 승인 chain에서 검사한다.

## fallback

| 실패 조건 | 대체 |
| --- | --- |
| 실제 치수 없음 | T2 생략, T10 또는 다른 기능 모션 |
| 실제 전후 pair 없음·정렬 실패 | slider 생략, 카드·상태 설명 전환 |
| anchor 신뢰도 낮음 | bbox glow 또는 별도 detail card |
| 사용 장면 품질 낮음 | 해당 lifestyle motion 생략 |
| exploded view 구조 불안정 | T10 Info Cards |
| 옵션 실제 이미지 없음 | 옵션 비교 생략 |

못 만드는 증명을 억지로 생성하지 않는다. 근거가 있는 다른 템플릿으로 바꾼다.

## QA

- 첫 프레임만으로 메시지·제품·근거가 보이는가
- 1초 안에 고객 질문에 답하는가
- 제품 형태·비율·색·부품이 모든 프레임에서 고정되는가
- 치수·콜아웃·전후 비교가 실제 입력과 confidence route를 따르는가
- 정밀 overlay가 God Tibo guide의 exact marker 좌표를 쓰고 clean source 위에서
  2px 이내로 맞으며 guide 자체는 공개되지 않는가
- 장식-only 팬·줌·스캔 반복이 없는가
- 인접 GIF의 증명 문법이 두 축 이상 다른가
- 텍스트와 그래픽이 제품을 가리지 않고 390/780px에서 읽히는가
- MP4에서 FFmpeg GIF/WebP가 파생되었는가
- 첫·마지막 픽셀뿐 아니라 속도·방향·밝기도 자연스럽게 이어지는가
