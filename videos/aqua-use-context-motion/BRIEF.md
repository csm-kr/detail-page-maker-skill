---
workflow: motion-graphics
flow: automation
storyboard: no
message: "물가에서 신는 착화형 신발이라는 사용 맥락만 보여준다"
destination: product-detail-html
aspect: 800x1000
language: ko
audience: "워터파크와 수영장 사용 장면을 확인하는 고객"
length: 4.2s
angle: use-context
---

## Intent

승인된 제품 컷아웃과 공급처 착화 이미지를 참조해 만든 ImageGen 장면에 HyperFrames의 느린 카메라 이동과 물결 그래픽만 적용한다. 미끄럼 방지, 배수, 건조, 안전 성능은 시연하지 않는다.

## Motion contract

- 0.2초부터 장면이 서서히 나타난다.
- 0.4~3.5초 동안 1.025배 이내의 느린 카메라 이동만 적용한다.
- 수영장 영역의 얇은 물결선은 제품과 접촉하지 않고 배경에서만 움직인다.
- 3.65초부터 첫 프레임으로 연결되도록 사라진다.

## Constraints

- 제품 형태, 배색, 레터링, 발과의 접촉 위치를 변형하지 않는다.
- 물 튀김, 달리기, 미끄럼 비교, 전후 효과를 만들지 않는다.
- 이 장면은 `ImageGen 참조 연출 이미지`로 고지한다.
