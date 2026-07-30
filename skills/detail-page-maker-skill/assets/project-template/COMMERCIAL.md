# {{PRODUCT_NAME}} - Commercial Plan

## Source

- `supplier_url`: {{SUPPLIER_URL}}
- `actual_product_photos`: optional
- `actual_photo_status`: provided | absent_notified_once
- `supplier_same_sku_media`: required
- `status`: DRAFT
- `planning_phase`: `PARALLEL_DRAFT_WITH_G0`
- `g0_dependency`: `pending`
- `provisional_claims`: []
- `blocked_until_g0`: []
- `market_evidence`:
- `guide`: `detail-page-maker-skill/references/commercial.md`

## Core Problem and Answer

- `core_problem`:
- `problem_provenance`: `OWN_REVIEW | MARKET_PAIN | RECONSTRUCTED_FROM_USE_CONTEXT`
- `product_answer`:
- `core_promise`:
- `claim_boundaries`:
- `blocked_claims`:
- `manufacturer_claims`:

실제 동일 상품 후기가 아니면 후기 카드·별점·작성자·구매 인증·체험 증언으로
꾸미지 않는다.

## Required Opening Pain Quotes

Hero 바로 다음에 소구점으로 해결할 수 있는 서로 다른 고객 불편을 3~5개의
짧은 비질문형·1인칭 인용 말풍선으로 배치한다. 작성자·별점·구매 인증은 붙이지
않는다. 문제 그룹을 완성한 뒤 제품의 한 문장 답과 별도 해결 그룹을 둔다.

| quote_id | pain_id | quote_text | provenance | claim_id | solution_id | status |
|---|---|---|---|---|---|---|
| QUOTE-01 | PAIN-01 | “ ” | `OWN_REVIEW | MARKET_PAIN | RECONSTRUCTED_FROM_USE_CONTEXT` |  | SOLUTION-01 | planned |
| QUOTE-02 | PAIN-02 | “ ” | `OWN_REVIEW | MARKET_PAIN | RECONSTRUCTED_FROM_USE_CONTEXT` |  | SOLUTION-02 | planned |
| QUOTE-03 | PAIN-03 | “ ” | `OWN_REVIEW | MARKET_PAIN | RECONSTRUCTED_FROM_USE_CONTEXT` |  | SOLUTION-03 | planned |

## Required Commercial Flow

- `hero.section_id`:
- `hero.static`: true
- `hero.primary_benefit_claim_ids`: []
- `hero.product_visual_priority`: largest
- `hero.commercial_intensity`: high
- `hero.product_identity_change_allowed`: false
- `section_role_order`: `[hero, pain, product_answer, solution_group, usage, comparison, choice_and_fit, specification_and_caution, objection_and_faq, decision_recap]`
- `problem_motion_brief_ids`: []
- `product_answer.section_id`:
- `product_answer.sentence`:
- `usage.section_id`:
- `usage.sequence`: `[preparation, use, result]`
- `usage_motion_brief_ids`: []
- `comparison.section_id`:
- `comparison.prior_inconvenience`:
- `comparison.verified_difference`:
- `comparison_motion_brief_ids`: []
- `motion_target.planned_total`: 7
- `motion_target.default_exception_reason`:
- `actual_review.section_present`: false
- `actual_review.verified_same_sku_receipt_id`: null
- `public_presentation.review_ui`: false
- `public_presentation.fake_transaction_ui`: false

## Image Generation Identity References

각 생성 참조는 아래 계약을 모두 만족해야 한다. 쿠팡·Behance 및
`research_only` 자산은 이미지 생성 참조로 사용할 수 없다.

- `asset_id`:
- `source_kind`: `supplier_same_sku | actual_product_photo`
- `classification`: `identity_reference | production_licensed`
- `same_sku_verified`: true
- `production_use_allowed`: false

## Reasons to Buy

3~5개 이유를 작성한다. 각 이유는 다른 구매 질문과 직접 증거를 가져야 한다.

### REASON-01

- `solution_id`: SOLUTION-01
- `pain_id`: PAIN-01
- `customer_situation`:
- `customer_want`:
- `product_answer`:
- `customer_copy`:
- `claim_id`:
- `component_id`:
- `fact_id`:
- `evidence_asset_id`:
- `still_evidence_asset_id`:
- `still_image_job_id`:
- `motion_evidence_asset_id`:
- `benefit_motion_brief_id`:
- `fact_or_condition_id`:
- `section_id`:
- `visual_proof`:
- `experiential_quote`: “ ”
- `blocked_expansion`:

## Evidence Map

| claim_id | component_id | fact_id | evidence_asset_id | section_id | status |
|---|---|---|---|---|---|
|  |  |  |  |  | planned |

## Manufacturer Claim Records

### MFR-CLAIM-01

- `claim_text_exact`:
- `confirmed_by`:
- `source_kind`: `manufacturer_page | manufacturer_file | user_confirmed_manufacturer`
- `source_locator`:
- `confirmed_at`:
- `scope_and_conditions`:
- `numeric_basis`: `supplied | not_supplied`
- `publishable`: true

## G1 Approval

각 핵심 주장에 pain/solution 1:1, `fact_id`, 정지 이미지, 전용 motion, 체감
의견과 섹션 위치가 있어야 한다. 문제 motion 2+, 장점별 1+, 사용 1+, 비교 1+,
전체 최소 5·기본 7~9를 충족해야 한다.

- `prerequisite_gate`: `G0 SOURCE_SSOT`
- `reviewer_session`:
- `artifact_sha256`:
- `decision`: held
- `user_confirmation`: pending
- `findings`:
