---
workflow: motion-graphics
flow: automation
storyboard: no
message: "제품의 네 표시 치수가 어느 구간을 뜻하는지 순차 치수선으로 설명한다"
destination: product-detail-html
aspect: 800x900
language: ko
audience: "구매 전 제품 크기와 측정 구간을 확인하는 고객"
length: 4.2s
angle: product-specification
---

## Intent

ImageGen은 제품 동일성과 깨끗한 정면 베이스를 담당하고, HyperFrames는 가로·헤드 높이·손잡이 길이·고리의 측정 구간을 결정적 SVG 스트로크로 순차 표시한다. 숫자는 제품 표시 치수만 사용하며, 최종 상세페이지의 수정 가능한 HTML 표에도 같은 값을 중복 제공한다.

## Assets

- `assets/product-dimension-base-v2.png`: 제품 누끼·치수 원본·커터 근접 이미지를 참조해 만든 정면 도해 베이스.

## Motion contract

- 0.16초부터 헤드 가로 7.2cm 구간을 표시한다.
- 0.86초부터 헤드 높이 5.3cm 구간을 표시한다.
- 1.56초부터 손잡이 길이 10.05cm 구간을 표시한다.
- 2.34초부터 고리 2cm 구간을 표시한다.
- 3.72초부터 치수선과 라벨을 지워 첫 프레임과 자연스럽게 연결한다.

## Constraints

- 생성 이미지에서 새로운 치수를 추론하지 않는다.
- 치수선의 양 끝은 해당 제품 부위의 실제 시작·끝 방향과 일치시킨다.
- 헤드 가로 치수선은 제품 상단과 최소 16px의 시각 간격을 두어 선·틱이 제품에 닿지 않게 한다.
- 치수 값은 `supplier-fact-007`부터 `supplier-fact-010`까지만 사용한다.
