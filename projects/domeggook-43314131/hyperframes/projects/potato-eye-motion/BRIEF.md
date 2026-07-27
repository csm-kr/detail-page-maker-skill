---
workflow: motion-graphics
flow: automation
storyboard: no
message: "오른쪽 제거 돌기가 감자 눈에 닿는 실제 사용 순간을 한 번에 이해시킨다"
destination: product-detail-html
aspect: 800x800
language: ko
audience: "다기능 채칼의 보조 기능을 확인하는 구매자"
length: 4s
angle: product-action-proof
---

## Intent

`supplier-storage-evidence.png`의 오른쪽 돌기와 감자 눈 접촉 장면을 동작 SSOT로 사용한다. ImageGen은 제품 구조를 재설계하지 않고 같은 접촉 방향을 상업용 매크로 화질로 확장하는 데만 사용한다. HyperFrames는 시작 프레임과 접촉 프레임을 짧은 카메라 푸시, 접촉 링, 진행선으로 연결한다.

## Assets

- `assets/potato-eye-start.png`: 돌기가 감자 눈 위에 떠 있는 시작 프레임
- `assets/potato-eye-contact.png`: 같은 방향에서 돌기가 감자 눈에 닿은 접촉 프레임

## Motion contract

- 0.00–0.72초: 시작 상태를 충분히 보여 준다.
- 0.72–1.36초: 시작 프레임에서 접촉 프레임으로 전환한다.
- 1.30–2.80초: 접촉 링과 짧은 진행선으로 제거 지점을 강조한다.
- 3.28–4.00초: 첫 상태로 돌아가 끊김 없이 반복한다.

## Constraints

- 제품의 톱니, 프레임, 오른쪽 돌기 위치를 추가하거나 제거하지 않는다.
- 감자의 눈 외 영역을 제거하는 것처럼 과장하지 않는다.
- 설명 문구는 최종 HTML에서 편집 가능하도록 GIF 내부에 넣지 않는다.
