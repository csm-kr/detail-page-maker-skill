# 실제 도매꾹 URL 추출과 사실 정규화 검증

Type: prototype
Status: open
Blocked by: 05

## Question

사용자가 제공한 실제 도매꾹 상품 URL 하나에서 portable bundle을 만들고 `supplier-facts.json`으로 정규화했을 때 필수 상품 사실, 상세 자산, 공개 후기, 누락·변동 정보와 원본 locator가 계약대로 보존되는가?

## Comments

- 2026-07-24: 첫 prototype 입력으로 `https://domeggook.com/43314131?from=popular100`을 제공받았다.
- 이전 `dmk-extractor`의 상세 root 선택과 장문 이미지 fallback을 함께 검증한다.
