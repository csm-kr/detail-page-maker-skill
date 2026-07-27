# 실제 도매꾹 URL 추출과 사실 정규화 검증

Type: prototype
Status: resolved
Blocked by: 05

## Question

사용자가 제공한 실제 도매꾹 상품 URL 하나에서 portable bundle을 만들고 `supplier-facts.json`으로 정규화했을 때 필수 상품 사실, 상세 자산, 공개 후기, 누락·변동 정보와 원본 locator가 계약대로 보존되는가?

## Comments

- 2026-07-24: 첫 prototype 입력으로 `https://domeggook.com/43314131?from=popular100`을 제공받았다.
- 이전 `dmk-extractor`의 상세 root 선택과 장문 이미지 fallback을 함께 검증한다.
- 2026-07-24: 실제 추출 prototype 실행을 시작했다.
- 2026-07-24: portable bundle 생성과 독립 validator는 통과했다. 현재 extractor의 상세 root provenance와 실제 GIF 동적 여부 집계에 계약 공백이 있어 자동 승격은 조건부 통과로 판정했다.

## Answer

실제 도매꾹 URL에서 대표 이미지 1개, 상세 원본 8개, 조립 상세 860×11,644px, 공개 후기 4개와 Browser Harness 녹화 32프레임을 수집했다. 요청·최종 상품번호가 일치했고 manifest SHA-256 `942fb77ded36b76f6f94839a66165336006ef19d6155de5df91284b3f33edd50`로 독립 검증이 `VALID`를 반환했다.

원본 사진, 표시 치수·재질·구조, 사실에 연결된 소구 후보와 기획 브리프를 분리할 수 있었다. 다만 다음 조건을 계약에 추가해야 임의 도매꾹 URL에서 안전한 자동 승격이 가능하다.

- 상세 자산별 `within_detail_root`, `selection_mode`, root selector와 root 수를 portable bundle에 저장한다.
- GIF MIME 원본 수, 1프레임 정지 GIF 수와 실제 다중 프레임 GIF 수를 분리한다.
- 가격·최소 주문수량·옵션을 수집 시각이 붙은 변동 정보로 보존한다.
- 이미지 속 사실은 OCR 원문, 원본 영역과 사람의 확인 상태를 함께 남긴다.
- 서로 다른 상품·판매자 상세 레이아웃을 추가 fixture로 검증한다.

근거와 예시는 [`projects/domeggook-43314131/report.md`](../../../../projects/domeggook-43314131/report.md)와 [`supplier-facts.json`](../../../../projects/domeggook-43314131/supplier-facts.json)에 기록했다. 과거 원본 bundle은 현재 보존되어 있지 않으며, 남은 공급처 evidence와 한계는 프로젝트의 [`evidence/supplier-bundle.md`](../../../../projects/domeggook-43314131/evidence/supplier-bundle.md)에 명시했다.
