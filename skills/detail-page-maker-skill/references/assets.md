# 이미지·자산 상태·승인

## 생성 실행기

모든 생성형 이미지 제작·편집은
`.agents/skills/god-tibo-gpt-image2-skill/scripts/tibo-batch.mjs`로 실행한다.
내장 이미지 생성 도구나 다른 모델을 우회 경로로 사용하지 않는다.

- 작업 단위: 8개 `items`를 명시
- 8개 초과: 입력 순서를 보존해 8개씩 분할
- God Tibo의 기본값을 사용하지 않는다.
- 생성: 명시한 W×H를 갖는 `controllable`
- 편집: 입력 크기를 보존하는 `invariant`
- 모든 프롬프트: `QUALITY_GATE:CLEAN_COMMERCIAL`

결과에는 자글거림, 필름 그레인, 센서 노이즈, 색 노이즈, 디더링, 과한 샤픈,
더러운 그림자 입자가 없어야 한다.

Orchestrator의 논리 작업 단위는 한 image cut당 한 WorkOrder·한 worker다. adapter가
provider batch를 구성할 때만 준비된 독립 cut을 최대 8개 `items`로 묶으며 결과를
다시 cut별 artifact와 receipt로 분리한다. 가용 worker slot은 먼저 채우고 실패한
cut과 실제 descendant만 재실행한다.

모든 제품 cut은 같은 SKU의 공급처 이미지 SSOT를 ImageGen reference로 사용한다.
사용자가 `input/product/`에 실제 사진을 넣으면 추가 identity reference로
강화한다. 공급처 원본·쿠팡·Behance 이미지는 고객 광고 자산으로 직접 조립하지
않는다.

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
