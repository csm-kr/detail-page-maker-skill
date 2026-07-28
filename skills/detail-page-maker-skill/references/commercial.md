# Commercial Planning Guide

상세페이지가 `고객의 실제 문제 → 우리 제품의 답 → 선택 이유 → 직접 증거`로
읽히게 만드는 상업 기획 계약이다.

## 병렬 초안 시작 입력

- 공급처 원문과 수집 시각
- 제품 정체를 구분할 수 있는 SSOT 후보와 G0 미확인 항목
- 제조사·브랜드 소유자 또는 제조사를 대표하는 사용자가 제공한 기능 주장
- 확인된 후기 또는 명확히 구분된 시장 고민
- 동종 제품 3개 이상과 공개 후기 원문

G0 진행 중에도 위 입력으로 시장 조사, 고객 문제, 구매 질문, 구매 서사와 디자인
초안을 만든다. 제품 답과 공개 주장은 `provisional`로 두고 미확인 사실을 채워
넣지 않는다.

## G1 승인 필수 입력

- 승인된 제품 SSOT
- 판매 구성·옵션·규격·주의사항
- `claim_id → component_id → fact_id → evidence_asset_id → section_id`

## 기획 산출물

프로젝트 `planning/COMMERCIAL.md`에 다음을 기록한다.

```text
planning_phase
g0_dependency
provisional_claims
blocked_until_g0
core_problem
product_answer
core_promise
reasons_to_buy[3..5]
claim_boundaries
blocked_claims
manufacturer_claims
review_provenance
proof_assets
```

`planning_phase: PARALLEL_DRAFT_WITH_G0`에서는 `MARKET_PAIN`, 고객 질문과
친근한 문제 후킹을 먼저 발전시킨다. G0 승인 뒤 `product_answer`,
`reasons_to_buy[3..5]`, 주장-증거 연결과 공개 카피를 확정하고
`planning_phase: READY_FOR_G1_REVIEW`로 바꾼다.

각 선택 이유는 다음 다섯 항목을 가진다.

```text
customer_want
product_answer
customer_copy
visual_proof
still_evidence_asset_id
motion_evidence_asset_id
blocked_expansion
```

## 제조사 제공 제품 사실

제조사·브랜드 소유자·제조사를 대표하는 사용자가 명시적으로 확인한 기능은
`MANUFACTURER_CLAIM`으로 등록하고 G1에서 `publishable: true`인 제품 사실로
사용한다. 독립 시험이 없어도 제조사 문구 범위 안에서 장점 카피, 이미지, GIF와
인포그래픽을 만들 수 있다.

```text
fact_id: MFR-CLAIM-*
claim_text_exact
confirmed_by
source_kind: manufacturer_page | manufacturer_file | user_confirmed_manufacturer
source_locator
confirmed_at
scope_and_conditions
numeric_basis: supplied | not_supplied
publishable: true
```

- `numeric_basis: supplied`이면 제공된 값·단위·조건만 그대로 사용한다.
- `numeric_basis: not_supplied`이면 온도가 내려가는 방향, 따뜻한 색에서 시원한
  색으로 변하는 흐름 같은 정성 그래프를 허용한다.
- 정성 그래프에는 °C, 퍼센트, 시간, 표본 수, 시험기관, 비교 우위와 정밀 눈금을
  임의로 넣지 않고 `시험 결과`라고 부르지 않는다.
- 제조사 기능의 출처 근거와 이를 보여주는 정지 이미지·GIF를 분리해 기록한다.
  생성 이미지는 시각 설명이며 제조사 주장 레코드가 출처 근거다.

## 고객 후기처럼 읽히는 문제 해결 섹션

사용자가 자기 상황을 알아보는 생활 언어를 쓰되, 실제 후기가 없으면 후기 UI와
사용 경험을 꾸미지 않는다.

권장 흐름:

1. 고객이 자주 겪는 구체적 불편을 짧게 제시한다.
2. 같은 화면이나 바로 다음 화면에서 우리 제품을 답으로 보여 준다.
3. `사용 장면으로 보는 선택 이유`처럼 섹션 성격을 밝힌다.
4. 서로 다른 선택 이유 3개를 고객 편익 문장으로 보여 준다.
5. 각 문장 바로 옆에 실제 구조·사용법·규격 증거를 둔다.

실제 동일 상품 후기가 아니면 별점, 작성자, 아바타, 구매 인증, 작성일, 따옴표형
추천 문구를 사용하지 않는다. `사용해보니`, `효과를 봤다`, `추천한다` 같은 체험
증언 문법도 금지한다.

## 장점 이후의 구매 흐름

장점이 네 개면 각 장점을 정지 이미지와 전용 GIF로 증명한 뒤 다음 순서를 사용한다.

```text
간단한 사용법과 착용 GIF
→ 검증된 동일 SKU 사용자 후기
→ 처음 제기한 문제와 네 장점의 해결 연결
→ 사이즈·구성·상세 스펙
→ 네 장점 최종 리마인드
```

사용법은 동작 GIF와 2~4개의 짧은 단계·간단한 이모지로 설명할 수 있다. 이모지는
보조 표식이며 대체 텍스트와 문장 없이 단독으로 의미를 맡기지 않는다. 동일 SKU의
실제 후기 문장이 없으면 후기 섹션을 `blocked`로 두고 가짜 후기로 채우지 않는다.
문제 해결 요약과 마지막 리마인드는 새 주장을 추가하지 않는다.

## 노바페이스 선택 이유에서 채택할 구조

노바페이스 깔창의 `사용 장면으로 보는 선택 이유`는 다음 세 구매 질문을 서로 다른
증거로 분리했다.

| 고객 상황 | 제품 답 | 화면 문장 방향 | 직접 증거 |
|---|---|---|---|
| 오래 서거나 많이 걷는 날 | 실제 PU 구조와 뒤꿈치·아치 형태 | 발 아래에서 확인되는 포근한 구조 | 굽힘·구조·접점 이미지 또는 GIF |
| 신발 속 답답함이 걱정됨 | 실제 에어홀과 에어메시 | 구멍과 메쉬로 고려한 공기 길 | 에어홀 위치와 시작점이 맞는 GIF |
| 사이즈 선택이 어려움 | 제조사 확인 옵션과 선택 규칙 | 발길이에 맞춰 고르는 방법 | 사이즈 표와 선택 인터랙션 |

다른 상품에는 이 세 문장을 복사하지 않는다. 대신 `고객 상황 / 제품 답 / 고객
문장 / 직접 증거`의 네 칸 구조만 재사용한다.

## 출처 유형

- `OWN_REVIEW`: 같은 상품의 검증된 실제 후기
- `MARKET_PAIN`: 시장 조사에서 반복된 구매 전 고민
- `PLANNED_QUESTION`: 타깃과 제품 조건에서 만든 구매 질문
- `SYNTHETIC_PAIN`: 적합한 후기가 없을 때 제품이 답할 수 있게 기획한 생활 불편

`OWN_REVIEW`만 실제 사용 경험으로 표현할 수 있다. 나머지는 고민·질문·선택 이유로
표시한다.

## 승인 게이트

G0 승인 뒤, 이미지 생성 전에 옆 승인 세션이 다음을 승인해야 한다.

1. 고객 문제가 실제 근거나 정직한 기획 질문에 기반한다.
2. 제품 답이 승인 사실과 일치한다.
3. 선택 이유 3~5개가 서로 중복되지 않는다.
4. 각 이유에 정지 이미지와 전용 GIF가 계획되어 있다.
5. 제조사 제공 기능은 `MFR-CLAIM-*` 원문·출처·수치 제공 여부가 기록되어 있다.
6. 더 강하지만 확인되지 않은 해석이 `blocked_expansion`에 기록되어 있다.

상세 서사와 HTML 계약은 [`commercial-detail-page.md`](commercial-detail-page.md),
페이지 순서는 [`BUYER-JOURNEY.md`](BUYER-JOURNEY.md), 문장과 말풍선은
[`korean-copy-typography.md`](korean-copy-typography.md)를 따른다.
