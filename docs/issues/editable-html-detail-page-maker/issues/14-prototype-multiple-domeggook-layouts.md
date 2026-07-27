# 서로 다른 도매꾹 상세 레이아웃 추출 회귀 검증

Type: prototype
Status: open
Blocked by: 12

## Question

서로 다른 상품군·판매자·상세 자산 구성의 도매꾹 URL에서도 상품번호, CDN 경로, 이미지 수와 상세 높이를 고정하지 않고 원본 사진·치수·소구점·기획 근거를 동일 계약으로 추출할 수 있는가?

## Acceptance criteria

- 최소 세 개의 서로 다른 상품군과 판매자 fixture를 사용한다.
- 상세 root 내부 이미지형, 실제 다중 프레임 GIF 포함형, 장문 이미지 fallback형을 포함한다.
- 각 fixture에서 상세 자산 provenance와 선택 방식이 출력에 남는다.
- `gif_source_count`, `static_gif_count`, `animated_gif_count`가 실제 프레임 수와 일치한다.
- 가격·최소 주문수량·옵션의 존재·누락을 변동 정보로 기록한다.
- 특정 상품번호, 판매자 CDN, 자산 개수나 치수를 코드에 고정하지 않았음을 회귀 테스트로 증명한다.
