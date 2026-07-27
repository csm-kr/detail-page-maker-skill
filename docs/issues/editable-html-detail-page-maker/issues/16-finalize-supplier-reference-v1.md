# 공급처 기준 v1 최종 납품본 마감

Type: delivery
Status: resolved
Blocked by: 15

## Question

도매꾹 상품 `43314131`의 공급처 원문을 현재 버전의 기준 사실로 승인해 prototype 표기와 내부 제작 문구를 제거하고, 근거 데이터·편집 상태·320~800px 검수를 갖춘 최종 `supplier-reference-v1` HTML로 마감할 수 있는가?

## Comments

- 2026-07-24: 사용자가 추가 계획보다 현재 상세페이지의 우선 완성을 지시했다.
- 2026-07-24: 사용자가 공급처 URL을 현재 버전의 정확한 기준 정보로 사용하도록 앞서 승인한 범위를 적용했다.
- 2026-07-24: 공급처 표시 이미지에서 제품명·치수·재질·원산지·수입원을 다시 대조했다.
- 성능·안전·세척·가격·옵션처럼 원문에서 확정하지 못한 정보는 계속 제외한다.
- 사용자 다각도 실사진은 현재 v1의 차단 항목이 아니라 후속 제품 동일성 강화 입력으로 분리한다.

## Answer

[`projects/domeggook-43314131/detail-page/index.html`](../../../../projects/domeggook-43314131/detail-page/index.html)을 `supplier-reference-v1-final`로 마감했다.

- 제품명·기능·구조·치수·재질·원산지와 수입원의 공급처 사실 12개를 공개 가능 상태로 잠갔다.
- 공급처의 `녹슬지 않아 위생적` 주장은 시험 근거가 없어 계속 차단했다.
- 수입원에 `supplier-fact-013`을 추가하고 공개 claim 9개를 모두 사실·섹션·자산에 연결했다.
- 구매자 화면의 `prototype`, ImageGen·HyperFrames 내부 제작 용어와 SSOT 대기 문구를 근거 파일로 이동했다.
- [`content.json`](../../../../projects/domeggook-43314131/detail-page/content.json)과 [`publication-approval.json`](../../../../projects/domeggook-43314131/detail-page/publication-approval.json)을 추가했다.
- 편집 패널에서 `변경 없음 → 수정됨·저장 필요 → 저장됨` 상태를 제공하고 구매자 화면에서는 숨겼다.
- Browser Harness에서 320·360·390·768·800px overflow 0, 이미지 로드·alt·fact ID·축소 모션·편집 기능을 통과했다.
- 최종 Behance·상업 계약 QA는 94/100, 하드 실패 0개다.

상세 결과는 [`qa/behance-rubric-report.md`](../../../../projects/domeggook-43314131/detail-page/qa/behance-rubric-report.md)에 기록했다.
