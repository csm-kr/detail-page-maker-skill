# 루즈핏 쿨토시 — Design Plan

## Source

- `supplier_url`: https://domeggook.com/55873582?affid=
- `status`: REV-021_ASSEMBLED_QA_PASS
- `planning_phase`: `G4_QA_PASSED_USER_REVIEW_PENDING`
- `g0_dependency`: approved
- `taste_skill_checked`: yes

## Design Read

> 가볍고 살랑이는 여름 데일리웨어를, 실제 제품 사진이 먼저 읽히는 아이보리·페일블루의 에디토리얼형 쿠팡 상세페이지로 표현한다.

## Taste Dials

- `DESIGN_VARIANCE`: 7
- `MOTION_INTENSITY`: 8
- `VISUAL_DENSITY`: 5
- `reasoning`: 한 장마다 다른 구매 질문을 풀고 각 장점 바로 다음에 비교·하강
  막대·스타일 매치컷·착용 절차·구성 리빌을 둔다. 움직임은 적극 사용하되 제품
  동일성과 주장-증거 연결을 흔들지 않는다.

## Visual System

- `palette`: warm ivory `#F7F4EE`, paper white `#FFFDF9`, pale sky `#DCEEFF`, cool blue `#2D6FD2`, ink `#1D2530`, soft coral warning `#E96E5B`
- `type_scale`: 800px 기준 헤드라인 52~72px, 이유 제목 38~52px, 본문 24~30px, 정보표 22~26px
- `section_rhythm`: 장면 배경 이미지 → 짧은 상업 헤드라인 → 한 줄 편익 → 즉시 GIF 증거
- `image_direction`: 자연광, 실제 플리츠 결, 화이트 소재의 미세한 비침. 대표·산책·피날레는 승인된 20대 여성 모델의 얼굴을 보여주고, 구조 섹션은 팔·손·제품을 크게 보여준다.
- `model_identity`: G2A에서 승인한 `model-20f-airfit-01` 캐릭터 시트의 얼굴·헤어·체형·피부톤을 모든 인물 장면에서 유지
- `motion_role`: 최소 10개 GIF를 장점과 사실 가까이에 분산한다. 비교 와이프,
  단계형 하강 막대, 스타일 매치컷, 착용 절차와 한 쌍 리빌을 핵심 패턴으로 사용하고
  동일 GIF를 반복하지 않는다.
- `mobile_priority`: 최종 원본은 800px 폭, 390px 축소에서도 의미 단위 줄바꿈과 16px 이상 환산 본문 유지
- `forbidden_patterns`: 과도한 유리효과, 빛나는 UV 방패, 근거 없는 온도 수치,
  가짜 별점·후기 카드, 반복 제품 이미지, 위쪽 밴드 꽈배기, 페이지 끝 증거 갤러리,
  고객 화면의 제작·검수·제조사 확인 문구

## Layout Direction

1. 히어로는 실제 길이가 읽히는 양팔 실착을 배경 이미지로 사용해 시작한다.
2. 첫 3초 안에 `루즈핏`, `손등 커버`, `화이트 플리츠`가 모두 보여야 한다.
3. 이유 섹션은 사진 65~75%, 카피 25~35% 비율을 기본으로 한다.
4. 손등 구조는 손등 방향과 손바닥 방향을 같은 섹션에 병치한다.
5. 상품 구성은 가장 동일성이 좋은 좌우 한 쌍을 짧은 링·빛·윤곽 FX로 공개한다.
6. 치수·비침 안내는 차분한 정보 섹션으로 분리해 광고 톤을 낮춘다.
7. 최종 CTA는 상품 선택 이유 네 개만 다시 묶고 새 주장을 추가하지 않는다.
8. 불편은 정확히 세 개이며 문자·말풍선으로 고객의 망설임을 표현한다.
9. 각 장점의 GIF는 바로 다음 모듈에 두며 상세 증거를 뒤에서 다시 모으지 않는다.
10. 마지막 장면은 상완부터 손등까지 길이가 보이도록 짧은 크롭을 피한다.

## Page Rules

- 한 섹션은 한 구매 질문에 답한다.
- 장식보다 제품 동일성·직접 증거·한글 가독성을 우선한다.
- 말풍선 꼬리·화살표·배지 같은 장식은 본문보다 뒤 레이어에 두고 안전 영역을 예약한다.
- 한국어는 의미 단위로 줄바꿈하며 문장 어미만 한 줄에 고립시키지 않는다.
- 같은 이미지·GIF를 고객 화면에서 반복하지 않는다.
- 제작 메타데이터와 SSOT 내부 용어를 고객 화면에 노출하지 않는다.
- 공급처·경쟁사 상세 이미지를 최종 고객 화면에 그대로 재사용하지 않는다.

## Pre-flight

- `report_path`: `qa/reports/taste-rev-001.md`
- `planning_result`: ready
- `final_result`: pending
- `decoration_text_overlap_390_800`: pending
- `product_identity_check`: pending
- `claim_boundary_check`: pending
