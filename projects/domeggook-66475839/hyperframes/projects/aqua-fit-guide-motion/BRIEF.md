---
workflow: motion-graphics
flow: automation
storyboard: no
message: "발길이를 먼저 재고 S부터 XXXL까지 연결하는 선택 흐름을 보여준다"
destination: product-detail-html
aspect: 800x800
language: ko
audience: "아쿠아슈즈 사이즈 선택이 어려운 고객"
length: 5.2s
angle: size-selection
---

## Intent

발길이 cm를 먼저 보고 공급처의 S~XXXL 표로 이동하는 흐름을 보여준다. 정사이즈 보장이나 발 모양의 개인차를 숨기지 않는다.

## Motion contract

- 0.2초에 발길이 기준선과 6개 옵션이 나타난다.
- 0.75초부터 S, M, L, XL, XXL, XXXL을 순서대로 강조한다.
- 각 강조 상태에서 해당 발길이 범위를 표시한다.
- 4.7초부터 강조가 사라져 첫 프레임으로 연결된다.

## Constraints

- `FACT-006`의 발길이 범위와 옵션만 사용한다.
- 발볼이 넓으면 한 치수 크게 선택하라는 공급처 안내를 고정 문구로 병기한다.
- 실제 발 모양과 착용감은 개인차가 있음을 명시한다.
