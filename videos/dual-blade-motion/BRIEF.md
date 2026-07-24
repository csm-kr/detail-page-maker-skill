---
workflow: motion-graphics
flow: automation
storyboard: no
message: "실제 두 커터 면을 3D 카드 플립으로 연결해 뒤집는 방향과 기능 전환을 분명히 보여준다"
destination: product-detail-html
aspect: 800x720
language: ko
audience: "다용도 미니 채칼의 두 커터 구조를 확인하는 고객"
length: 4s
angle: product-function
---

## Intent

기존 위치 강조 모션이 실제로 뒤집는 느낌을 주지 못한 문제를 수정한다. 같은 2D 누끼를 거울처럼 회전시키지 않고, 공급처에 표시된 두 실제 커터 면을 카드의 앞·뒷면으로 사용한다. 원근, backface occlusion, 중간 z 이동과 앞·뒷면 고정 구간으로 반전 동작을 명확하게 만든다.

## Assets

- `assets/blade-face-a.png`: 껍질 제거·얇게 썰기 커터 면의 실제 표시 이미지 크롭.
- `assets/blade-face-b.png`: 채썰기 커터 면의 실제 표시 이미지 크롭.
- `assets/supplier-spec-evidence.png`: 위 두 크롭의 원본 근거.

## Motion contract

- 0.00–0.78초: A면을 읽을 수 있게 유지.
- 0.78–1.46초: Y축 0→180도 회전, 90도 근처에서 z 이동과 원근으로 깊이를 증명.
- 1.46–2.72초: B면을 읽을 수 있게 유지.
- 2.72–3.40초: Y축 180→360도 회전.
- 3.40–4.00초: A면을 유지해 루프 첫 프레임과 연결.

## Constraints

- 제품의 두 실제 커터 면 외에 새로운 부품이나 성능 표현을 추가하지 않는다.
- 한 면을 단순 미러링해 반대 면으로 위장하지 않는다.
- 제품 기능 이름은 HyperFrames 소스에서 수정 가능하며, 납품 HTML에도 별도 편집 가능한 설명을 둔다.
