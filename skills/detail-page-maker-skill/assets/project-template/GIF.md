# {{PRODUCT_NAME}} - GIF Plan

## Source

- `supplier_url`: {{SUPPLIER_URL}}
- `status`: DRAFT
- `planning_phase`: `PARALLEL_DRAFT_WITH_G0`
- `g0_dependency`: `pending`
- `provisional_claims`: []
- `blocked_until_g0`: []
- `guide`: `detail-page-maker-skill/references/motion.md`

## GIF Decision

- `motion_required`: yes
- `decision_reason`:
- `minimum_total`: 5
- `planning_default_minimum`: 7
- `planning_default_maximum`: 9
- `planned_total`: 7
- `default_exception_reason`:
- `problem_motion_minimum`: 2
- `solution_motion_per_solution`: 1
- `usage_motion_minimum`: 1
- `comparison_motion_minimum`: 1

필수 role은 `motion_required: no`로 바꿀 수 없다. 시간축 근거가 더 명확하면
기본 범위를 넘어 추가하고 사유를 기록한다.

## Planned GIFs

GIF마다 아래 블록을 복사해 작성한다.

### GIF-001

- `gif_id`:
- `section_id`:
- `claim_id`:
- `component_id`:
- `fact_id`:
- `motion_required`: yes
- `motion_reason`:
- `method`: imagegen-seq | heygenframe | hybrid
- `start_state`:
- `end_state`:
- `pattern_id`:
- `claim_fx`:
- `source_assets`:
- `product_ssot`:
- `forbidden_claims`:
- `included_prop_gate`: product-only | verified-included
- `included_prop_evidence`:
- `subject_safe_region`:
- `hand_safe_region`:
- `text_safe_regions`:
- `measurement_axes`:
- `composition_path`:
- `render_path`:
- `poster_path`:
- `qa_report`:
- `approval_status`: planned
- `flow_role`: problem | solution | usage | comparison | additional-proof
- `pain_id`:
- `solution_id`:

## Final QA

- `hyperframes_check_strict`:
- `first_middle_last_contact_sheet`:
- `product_identity`:
- `person_head_hand_crop`:
- `thumbhole_handback_fingers_visible`:
- `dual_axis_measurement`:
- `claim_component_scope`:
- `overlay_alignment`:
- `included_prop_ambiguity`:
- `text_overlap`:
- `mobile_readability`:
- `reduced_motion_poster`:
- `manifest_updated`:
- `html_current_src`:
- `user_approval`:
- `total_motion_count`:
- `problem_motion_count`:
- `solution_motion_coverage`:
- `usage_motion_count`:
- `comparison_motion_count`:
- `visible_only_playback`:
- `reentry_restart`:
- `wing_animated_webp`:

## Project Learning

상세페이지 작업 종료 시 작성하고, 검증된 재사용 규칙만 스킬의
`.detail-page/planning/LEARNINGS.md`에 기록하고
`references/learning.md`의 승격 절차를 따른다.

- `patterns_used`:
- `what_worked`:
- `failure_or_waste`:
- `actual_fix`:
- `reusable_rule`:
- `applies_when`:
- `exclude_when`:
