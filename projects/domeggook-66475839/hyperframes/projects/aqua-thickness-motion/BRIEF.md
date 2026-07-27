---
workflow: motion-graphics
flow: automation
storyboard: no
message: "바닥 기준 약 1.5cm라는 공급처 수치의 측정 위치를 한 번에 이해시킨다"
destination: product-detail-html
aspect: 800x760
language: ko
audience: "아쿠아슈즈 밑창 두께를 구매 전에 확인하는 고객"
length: 4s
angle: product-specification
---

## Intent

ImageGen 공급처 참조 파생 컷아웃은 제품 형태를 담당하고 HyperFrames는 바닥 두께의 측정 위치만 움직인다. 충격 흡수, 발 보호, 쿠션 성능은 표현하지 않는다.

## Asset

- `assets/green-side-v1.png`: 공급처 그린 상품 이미지를 참조해 만든 측면 컷아웃.

## Motion contract

- 0.2초에 제품이 가볍게 나타난다.
- 0.65초부터 제품 오른쪽에서 20px 이상 떨어진 치수선이 그려진다.
- 1.05초에 `바닥 기준 약 1.5cm` 라벨이 나타난다.
- 3.45초부터 치수선과 라벨이 사라져 첫 프레임으로 연결된다.

## Constraints

- 치수 값은 `FACT-008`만 사용한다.
- 치수선과 틱은 제품 픽셀에 닿지 않는다.
- 수치가 실제 화면 비율과 정확히 비례하는 것처럼 과장하지 않는다.
- 충격 흡수·압력 분산·안전 성능으로 확장하지 않는다.
