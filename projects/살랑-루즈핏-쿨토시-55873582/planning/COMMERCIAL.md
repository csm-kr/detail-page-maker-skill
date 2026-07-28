# 루즈핏 쿨토시 — Commercial Plan

## Source

- `supplier_url`: https://domeggook.com/55873582?affid=
- `sales_channel`: 쿠팡
- `manufacturer`: 살랑
- `model_identity`: model-20f-airfit-01 — G2A 승인 캐릭터 시트 사용
- `planned_generation`: 캐릭터 시트 후보 8장 + 본 제작 40장
- `status`: REV-021_ASSEMBLED_REVIEW_READY
- `planning_phase`: `G4_QA_PASSED_USER_REVIEW_PENDING`
- `g0_dependency`: approved
- `market_evidence`: `research/coupang-market.md`
- `own_listing_evidence`: `evidence/own-coupang/9623659088-28739122241`
- `guide`: `detail-page-maker-skill/references/commercial.md`

## Core Problem and Answer

- `core_problem`: 여름 햇빛은 피하고 싶지만 조이는 핏, 짧은 덮임, 스포티한 인상 때문에 오늘의 옷차림과 멀어지는 불편
- `problem_provenance`: `MARKET_PAIN`
- `product_answer`: 여유 있는 화이트 플리츠, 손등까지 이어지는 엄지홀 구조와 시원한 쿨 소재를 데일리 실루엣에 담은 쿨토시
- `core_promise`: `그늘은 길게, 실루엣은 가볍게.`
- `claim_boundaries`: 실물에서 확인되는 루즈핏·플리츠·엄지홀·손등 덮임·화이트 스타일·치수와 `MFR-CLAIM-COOL-MATERIAL` 범위의 쿨링 기능을 공개한다.
- `blocked_claims`: 제조사가 제공하지 않은 정확한 °C·비율·시간·시험기관·비교군, UV 차단률, UPF, 흡한속건, 통풍 수치, 논슬립, 흘러내림 방지, 세탁 내구

경쟁상품 후기는 시장의 구매 질문을 찾는 참고 자료일 뿐 살랑의 후기나 성능 증거로 표현하지 않는다.

## Pain Points — Exactly Three

| pain_id | customer voice | public format | answer |
|---|---|---|---|
| PAIN-01 | `햇빛은 피하고 싶은데, 팔까지 꼭 조여야 할까요?` | 짧은 문자 말풍선 | 여유 있게 떨어지는 플리츠 |
| PAIN-02 | `손목에서 멈춘 커버, 손등은 또 그대로.` | 손등을 가리키는 대화형 카드 | 엄지홀에서 손등으로 이어지는 길이 |
| PAIN-03 | `등산용 토시는 조금… 오늘의 옷차림까지 무거워 보이니까.` | 옷차림 위 메시지 카드 | 화이트 플리츠의 데일리 인상 |

세 문장은 후기·구매 인증이 아니라 고객이 구매 전에 떠올리는 망설임이다. 별점,
작성자, 날짜, 아바타는 사용하지 않는다.

## Manufacturer Claim Records

### MFR-CLAIM-COOL-MATERIAL

- `claim_text_exact`: `시원한 쿨 소재이며 착용 시 착용 부위 표면 온도가 낮아지는 방향의 쿨링 기능`
- `confirmed_by`: 제조사 `살랑`을 대표해 지시한 사용자
- `source_kind`: `user_confirmed_manufacturer`
- `source_locator`: 2026-07-28 사용자 지시 + 공급처 상품명 `여름 냉감 팔토시`
- `scope_and_conditions`: 여름철 일반 착용, 구체 시험 환경 미제공
- `numeric_basis`: `not_supplied`
- `publishable`: true
- `allowed_customer_copy`: `시원한 쿨 소재`, `착용할수록 열감은 아래로`
- `visual_policy`: 숫자·°C·시험기관·정밀 눈금 없는 온도 하강 방향 그래프와 따뜻한 색→시원한 색 전환 GIF
- `source_evidence`: `evidence/supplier/domeggook/55873582/page.json`

## Reasons to Buy

### REASON-01 — 압박 대신 여유

- `customer_situation`: 딱 붙는 스포츠 토시가 답답한 여름 외출
- `customer_want`: 팔에 달라붙지 않는 편안한 실루엣
- `product_answer`: 길고 여유 있게 떨어지는 세로 플리츠 튜브
- `customer_copy`: `바람이 머무는 듯, 주름 사이에 남겨둔 여유.`
- `claim_id`: CLAIM-LOOSE-DRAPE
- `component_id`: COMPONENT-PLEATED-TUBE
- `fact_id`: FACT-REAL-WORN-DRAPE
- `evidence_asset_id`: ssot-user-original-04
- `still_evidence_asset_id`: A07 v01
- `motion_evidence_asset_id`: GIF-007
- `section_id`: reason-loose-fit
- `visual_proof`: 실물 실착 사진과 생성할 팔 전체 드레이프 근접컷
- `blocked_expansion`: 통풍·냉감·땀 배출 수치로 확장 금지

### REASON-02 — 손등까지 이어지는 구조

- `customer_situation`: 운전·산책 때 팔은 가렸지만 손등이 그대로 드러나는 경우
- `customer_want`: 손동작을 방해하지 않으면서 손등까지 이어지는 구조
- `product_answer`: 손등 커프와 엄지홀
- `customer_copy`: `손끝의 움직임은 자유롭게, 그늘은 손등까지.`
- `claim_id`: CLAIM-HAND-COVER
- `component_id`: COMPONENT-THUMB-HOLE-CUFF
- `fact_id`: FACT-REAL-THUMB-HOLE
- `evidence_asset_id`: ssot-user-original-04
- `still_evidence_asset_id`: A05 v01
- `motion_evidence_asset_id`: GIF-001
- `section_id`: reason-hand-cover
- `visual_proof`: 손등 방향과 손바닥 방향을 나눠 보여주는 실착 클로즈업
- `blocked_expansion`: 자외선 차단률·논슬립·운전 안전 보장으로 확장 금지

### REASON-03 — 시원한 쿨 소재

- `customer_situation`: 더운 날 팔을 덮어야 하지만 열감이 더해질까 걱정되는 착용
- `customer_want`: 여름에 가볍고 시원하게 느껴지는 소재
- `product_answer`: 여름 착용을 위한 시원한 쿨 소재
- `customer_copy`: `뜨거운 하루 위, 한 겹 더 시원한 선택.`
- `claim_id`: CLAIM-MFR-COOLING
- `component_id`: COMPONENT-COOL-FABRIC
- `fact_id`: MFR-CLAIM-COOL-MATERIAL
- `evidence_asset_id`: MFR-CLAIM-COOL-MATERIAL
- `still_evidence_asset_id`: COOL-01 planned
- `motion_evidence_asset_id`: GIF-011 planned
- `section_id`: reason-cool-material
- `visual_proof`: 원단 매크로와 숫자 없는 착용 전→후 온도 하강 방향 그래프, 따뜻한 색에서 시원한 색으로 전환되는 GIF
- `blocked_expansion`: 임의 °C·퍼센트·시간·시험기관·비교 제품·냉감 지속 시간 생성 금지

### REASON-04 — 어떤 스타일에도 자연스럽게

- `customer_situation`: 기능성 토시가 스포츠 장비처럼 보여 평소 옷과 겉돌까 걱정되는 외출
- `customer_want`: 캐주얼·출근·페미닌 룩에 두루 어울리는 데일리 인상
- `product_answer`: 화이트 컬러, 잔잔한 플리츠와 루즈한 실루엣
- `customer_copy`: `기능은 가볍게, 오늘의 룩은 그대로.`
- `claim_id`: CLAIM-STYLE-VERSATILITY
- `component_id`: COMPONENT-WHITE-PLEATED-LOOK
- `fact_id`: FACT-WHITE-VARIANT
- `evidence_asset_id`: ssot-user-original-06
- `still_evidence_asset_id`: STYLE-01 planned
- `motion_evidence_asset_id`: GIF-012 planned
- `section_id`: reason-style-versatility
- `visual_proof`: 승인된 20대 여성 모델과 동일 제품을 유지한 캐주얼·출근·페미닌 3룩 이미지, 같은 포즈에서 의상만 전환하는 GIF
- `blocked_expansion`: 모든 의상·체형에 절대 어울린다는 보장, 보호·안전 성능으로 확장 금지

## Decision-Support Facts

- `FACT-REAL-IDENTITY`: 좌우 한 쌍, 앞·뒤, 라벨과 봉제는 상세 스펙에서 실물로 확인한다.
- `FACT-SUPPLIER-47X14`: 공급처 표기 47×14cm, 화이트 1세트 2개입, 제조사 살랑.
- `FACT-THIN-WHITE`: 밝은 빛에서 느껴질 수 있는 얇음과 비침은 상세 스펙·FAQ에서 정직하게 안내한다.

위 세 항목은 핵심 장점이 아니라 구매 불안을 줄이는 상세 정보다.

## Review Provenance

- `own_listing_review_text_count`: 0
- `supplier_review_text_count`: 0
- `review_section_status`: `blocked_until_verified_same_sku_review_text`
- `policy`: 실제 동일 SKU 후기 문장이 확보되기 전에는 별점·작성자·체험 문장을 만들지 않고 공개 화면에서 후기 섹션을 숨긴다.

## Evidence Map

| claim_id | component_id | fact_id | evidence_asset_id | section_id | status |
|---|---|---|---|---|---|
| CLAIM-LOOSE-DRAPE | COMPONENT-PLEATED-TUBE | FACT-REAL-WORN-DRAPE | A07, GIF-007 | reason-loose-fit | approved-assets |
| CLAIM-HAND-COVER | COMPONENT-THUMB-HOLE-CUFF | FACT-REAL-THUMB-HOLE | A05, GIF-001 | reason-hand-cover | approved-assets |
| CLAIM-MFR-COOLING | COMPONENT-COOL-FABRIC | MFR-CLAIM-COOL-MATERIAL | COOL-021, GIF-017 | reason-cool-material | rev021-production |
| CLAIM-STYLE-VERSATILITY | COMPONENT-WHITE-PLEATED-LOOK | FACT-WHITE-VARIANT | STYLE-021, GIF-018 | reason-style-versatility | rev021-production |

## G1 Approval

- `prerequisite_gate`: `G0 SOURCE_SSOT`
- `reviewer_session`: pending
- `artifact_sha256`: pending
- `decision`: held
- `user_confirmation`: 2026-07-28 네 가지 장점, 상업 카피, 적극적 GIF와 후속 흐름 제작 승인
- `findings`: rev021은 정확히 세 불편으로 시작한다. 네 장점은 각각 바로 다음에
  전용 GIF가 오며 뒤쪽 증거 갤러리에 다시 모으지 않는다. 고객 화면에는 제조사
  확인·생성 방식·검수 메타데이터를 쓰지 않는다.
