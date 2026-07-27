# {{PRODUCT_NAME}} - Design Plan

## Source

- `supplier_url`: {{SUPPLIER_URL}}
- `status`: DRAFT
- `taste_skill_checked`: no

## Design Read

한 문장으로 제품·고객·구매 상황에 맞는 디자인 방향을 정의한다.

>

## Taste Dials

- `DESIGN_VARIANCE`:
- `MOTION_INTENSITY`:
- `VISUAL_DENSITY`:
- `reasoning`:

## Visual System

- `palette`:
- `type_scale`:
- `section_rhythm`:
- `image_direction`:
- `motion_role`:
- `mobile_priority`:
- `forbidden_patterns`:

## Page Rules

- 한 섹션은 한 구매 질문에 답한다.
- 장식보다 제품 동일성·직접 증거·한글 가독성을 우선한다.
- 말풍선 꼬리·화살표·배지 같은 장식은 본문보다 뒤 레이어에 두고 콘텐츠 패딩에 안전 영역을 예약한다. 390px와 800px에서 장식 경계가 텍스트 경계를 1px도 침범하지 않아야 한다.
- 한국어는 의미 단위로 줄바꿈하며 `니다.`, `습니다.`, `세요.` 같은 문장 어미만 한 줄에 고립시키지 않는다. 필요하면 텍스트 폭·크기·고정 줄바꿈을 함께 조정한다.
- 같은 이미지·GIF를 고객 화면에서 반복하지 않는다.
- 제작 메타데이터는 고객 화면에 노출하지 않는다.

## Pre-flight

- `report_path`: `qa/reports/taste-<revision>.md`
- `planning_result`: pending
- `final_result`: pending
- `decoration_text_overlap_390_800`: pending
