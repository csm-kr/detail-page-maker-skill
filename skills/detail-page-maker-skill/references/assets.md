# 이미지·자산 상태·승인

## 생성 실행기

모든 생성형 이미지 제작·편집은
`.agents/skills/god-tibo-gpt-image2-skill/scripts/tibo-batch.mjs`로 실행한다.
내장 이미지 생성 도구나 다른 모델을 우회 경로로 사용하지 않는다.

- 기본 작업 단위: 서로 다른 용도의 32개 `items`를 한 job에 명시
- 기본 동시 실행: `workers: 32`, `single_concurrent_batch`
- 32개를 8개씩 네 번 나누는 순차 실행은 금지한다.
- 생성: 명시한 W×H를 갖는 `controllable`
- 편집: 입력 크기를 보존하는 `invariant`
- 모든 프롬프트: `QUALITY_GATE:CLEAN_COMMERCIAL`

결과에는 자글거림, 필름 그레인, 센서 노이즈, 색 노이즈, 디더링, 과한 샤픈,
더러운 그림자 입자가 없어야 한다.

Orchestrator의 논리 작업 단위는 한 image cut당 한 WorkOrder member다. adapter는
준비된 독립 cut 32개를 하나의 God Tibo `items` job으로 묶고 provider 요청을
32 workers로 동시에 시작한다. provider worker는 Codex agent session이 아니라
이미지 생성 동시 요청이다. 결과는 다시 cut별 artifact와 receipt로 분리하고 실패한
cut과 실제 descendant만 같은 입력으로 재실행한다.

32개는 단순 변형 수가 아니라 용도 배치다. Hero, 문제 상황, 핵심 기능 근거,
매크로 디테일, 사용 단계, 사용 장소, 비교, 썸네일 후보, GIF 첫·중간·끝 프레임을
기획 단계에서 나눈다. HTML 빈칸을 만든 뒤 비슷한 이미지를 채우는 작업은 실패다.

논리 그룹은 기본적으로 제품 베이스 8, 기능·소재 디테일 6, 치수 4, 기능 전체 4,
실제 상태 pair 4, 사용 4, 구성·구조 2를 권장한다. 다만 실제 치수나 전후 자료가
없으면 해당 그룹을 만들지 않고 근거가 있는 shot으로 32개를 재배분한다. 이 그룹은
하나의 32-worker provider job 안의 역할 분류이며 순차 batch가 아니다.

기본 shot type은 `hero_front`, `hero_angle`, `dimension_front`,
`dimension_side`, `feature_overview`, `feature_detail_1/2`, `before_scene`,
`after_scene`, `usage_scene_1/2`, `components_flatlay`, `exploded_view`,
`material_macro`다. 32개 생성 후 동일성·상업성·모션 적합도가 높은 8~15개만
대표 자산으로 선택한다.

선택 자산은 `image_id`, `shot_type`, `view_type`, `candidate_score`,
`recommended_template`, `anchor_points`, `bbox_regions`, `dimension_safe_area`,
`text_safe_area`, `before_after_pair_id`, `consistency_group`, `locator_guide`를 기록한다. 좌표는
0~1 정규화 값으로 저장한다. 상세 연결 규칙은
[`hyperframes-sales-motion.md`](hyperframes-sales-motion.md)를 따른다.

## 정밀 위치용 내부 가이드 자산

치수선, 실제 부위 콜아웃, 사용 방향 화살표처럼 몇 픽셀의 위치 오차가 메시지를
바꾸는 overlay는 HyperFrames에서 눈대중으로 배치하지 않는다.

1. 승인된 깨끗한 motion 배경을 변경 없이 보존한다.
2. 그 이미지를 Image 1로 둔 God Tibo `size_mode: invariant` 편집에서 작고 평평한
   `#FF00FF` 원형 점만 실제 의미점에 추가한다.
3. 점 외 텍스트·선·화살표·링·글로우·재구도·crop·제품 수정은 금지한다.
4. 가이드와 깨끗한 원본은 서로 다른 asset ID·SHA-256을 가지며 픽셀 크기가
   정확히 같아야 한다.
5. `scripts/motion/extract-locator-guides.mjs`가 점 개수를 exact 검사하고 0~1 좌표와
   780 canvas 좌표를 물질화한다.
6. HyperFrames는 깨끗한 원본만 렌더하고 가이드는 좌표 evidence로만 소비한다.

이 가이드 편집은 32개 상업 후보를 대신하거나 그 수에 포함되는 이미지 생성이
아니다. G2의 `items: 32`, `workers: 32` 단일 provider batch와 대표 자산 선별이
끝난 뒤, 위치 증명이 필요한 G3 motion만 한 보조 `locator-guide` batch로 묶는다.
이 batch의 `items`는 필요한 가이드 수와 같고 `workers`도 그 수만큼, 최대 32로
즉시 실행한다. 가이드는
`.detail-page/generation/pending/locator-guides/<guide-id>/` 아래에 두고
`output/media/`, HTML, Wing에는 복사하지 않는다.

방향 화살표는 최소 두 점을 쓴다. 첫 점은 실제 물리 동작이 시작되는
`physical-action-origin`, 둘째 점은 손·도구·결합부가 닿는
`physical-interaction-target`이다. 치수는 실제 외곽의 축별 시작·끝점을 쓴다.
가이드의 제품 geometry가 원본에서 2px보다 크게 어긋나거나 예상 점 개수가 다르면
좌표를 손으로 보정하지 말고 가이드 편집을 다시 실행한다.

## 출력 비율 — 세로 긴 컷을 만들지 않는다

쿠팡 상세페이지는 그 자체가 세로로 긴 스크롤이다. 세로 긴 이미지는 메시지 하나를
전하면서 스크롤 길이만 먹는다. 생성 비율은 두 가지로 고정한다.

| 비율 | 기본 크기 | 쓰임 |
| --- | --- | --- |
| 정방형 1:1 | 1080×1080 | 제품 단독, 매크로, 치수, 전후 pair, 상태 컷, **모든 motion 배경** |
| 가로 4:3 | 1440×1080 | 사용 장면, 사용 환경, 구성 flat lay, 배경 plate |

- 세로형(`1080×1350` 등)은 만들지 않는다. Hero의 세로 임팩트는 이미지 비율이 아니라
  HTML 섹션 높이·배경 plate·겹침 레이어로 만든다.
- **motion 배경은 반드시 정방형이다.** motion canvas 는 780×780 고정이고 `.bg` 가
  `object-fit: cover` 이므로, 세로 소스를 넣으면 상하가 잘려 헤드라인이 약속한
  시각 근거가 화면에서 사라진다. 잘림은 렌더 뒤 QA 가 아니라 배정 단계에서 막는다.
- 그래서 배정 순서는 `motion 9개 확정 → 그 배경을 정방형으로 못박음 → 남은 cut 을
  정방형·가로형으로 배분` 이다. 이미지를 먼저 만들고 남는 컷을 motion 배경으로
  재사용하지 않는다.
- 비율을 더 조절해야 하면 이미지가 아니라 섹션 높이와 crop 안전영역으로 해결한다.

모든 제품 cut은 같은 SKU의 공급처 이미지 SSOT를 ImageGen reference로 사용한다.
사용자가 `input/product/`에 실제 사진을 넣으면 추가 identity reference로
강화한다. 공급처 원본·쿠팡·Behance 이미지는 고객 광고 자산으로 직접 조립하지
않는다.

생성 전에 상품별 제품 불변 조건을 적어도 네 개 고정한다. 색, 외형과 비율,
구멍·홈·끈 같은 부품 수와 위치, 실제 구성품, 로고·문구 금지 등이 이에 해당한다.
모든 32개 item은 같은 canonical 제품 참조와 불변 조건을 공유한다.

## Image job 시각 계약

각 cut은 identity·rights·size 외에 다음 `visual_contract`를 가진다.

- `role`: hero, desire, pain, core_feature, mechanism, usage, outcome,
  comparison, specification, decision_recap
- `scene_kind`: isolated_product, contextual_use, mechanism_macro,
  outcome_context, comparison, specification
- `product_views`: top, bottom, side, front, back, detail, in_use
- `usage_context`, `lighting`, `background`
- `product_occupancy_percent`: 25~90
- 다른 cut과 겹치지 않는 `differentiation_goal`
- 해당 job을 target으로 하는 CR/TR `applied_rule_ids`
- 선택 category reference card의 `trait_id`, 변형 의도, acceptance check binding

Hero와 핵심 기능 cut은 후보 2개 이상을 만든다. 전체 image set은 제품별 필수 면과
scene coverage를 선언하고 최소 한 개의 실제 사용 맥락을 포함한다. 같은 제한된 참조
사진·각도·흰 배경을 Hero부터 FAQ·마무리까지 반복해 job 수만 채우는 것은 실패다.
전체 set은 이미지 역할 5종, 장면 4종 이상이며 `isolated_product`는 35% 이하여야
한다. Category reference의 실제 이미지 bytes는 generation reference로 전달하지
않고 trait와 장면 역할만 prompt contract에 반영한다.

## 상태 수명주기

```text
input 또는 ssot
→ generated/pending
→ 자동 검사와 시각 QA
├─ 사용자 승인 또는 plan-once policy 승인 → generated/approved
├─ 사용자 반려 → generated/rejected
└─ 수정 필요 → 새 pending 버전
```

파일을 덮어쓰지 않는다. 동일 역할의 새 결과는 버전이 다른 새 파일로 저장한다.
제작 세션의 QA 자체를 사용자 승인으로 간주하지 않는다. 단,
`input/product/` 원본 bytes와 사용자 승인 G1 plan이 있는 run은 독립 Image QA
PASS를 plan-once policy가 exact digest로 승인할 수 있다.

## Manifest 최소 필드

```json
{
  "asset_id": "ASSET-HERO-01",
  "kind": "image",
  "role": "hero-product",
  "status": "pending",
  "path": "asset/generated/pending/image/hero-v01.png",
  "sha256": "...",
  "source_refs": ["asset/ssot/product-front.png"],
  "claim_ids": ["CLAIM-001"],
  "qa": {"hard_failures": [], "warnings": []},
  "approval": null
}
```

## 승인

사용자의 Studio 승인 또는 검증된 plan-once policy receipt를 최종 결정으로
기록한다. 승인은 에셋 ID, 버전, 해시, 결정, 시각, 승인 채널을 append-only
원장에 남긴다. 원본이나 관련 제품 사실이 바뀌면 영향받는 승인만 무효화한다.

## 조립 전 검사

- pending 필수 에셋 0개
- rejected 또는 deprecated 경로 참조 0개
- 승인 파일의 현재 SHA-256과 manifest 일치
- 제품 동일성 하드 실패 0개
- 각 공개 주장에 승인된 직접 증거 존재
- Hero는 제품 최대 시각·핵심 장점 한 개·정적 이미지
- 각 해결 장점에 승인 still과 전용 motion용 source frame 존재
- image set의 필수 제품 면·scene coverage 100%, contextual-use 1개 이상
- Hero·핵심 기능 candidate 2개 이상과 중복 differentiation goal 0건
- 390 CSS px 저작 화면과 780px 전달 자산 crop 안전영역 통과
