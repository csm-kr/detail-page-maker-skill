---
workflow: motion-graphics
flow: automation
storyboard: no
message: "한 헤드의 서로 다른 두 커터 위치와 용도를 구분한다"
destination: product-detail-html
aspect: 800x720
language: ko
audience: "다용도 미니 채칼 구매를 검토하는 고객"
length: 4s
angle: product-function
---

## Intent

다용도 미니 채칼 상세페이지의 이중 커터 섹션에 삽입할 짧고 무음인 제품 기능 루프다. 제품 본체는 하나만 정지 상태로 유지하고, 실제 공급처 구조 이미지에서 확인한 두 커터 위치를 순차 하이라이트한다. 장식보다 제품 구조 이해가 우선이다.

## Assets

- `assets/product-cutout.png` — 공급처 실제 제품 참조로 만든 승인 전 prototype 컷아웃. 프레임 전체에서 유일한 제품 본체로 사용한다.

## Customizations

- 4초 안에 안쪽 `껍질 제거 · 얇게 썰기` 커터 → 바깥쪽 `채썰기 커터` → 시작 상태로 복귀한다.
- 제품을 뒤집거나 변형하지 않고 두 커터 위치만 라임색 광선과 짧은 한국어 HTML 텍스트로 표시한다.
- 최종 HTML에는 무음·무한 루프 GIF를 삽입하고 `prefers-reduced-motion`에서는 정지 제품 이미지로 대체한다.

## Notes

- 제품 실루엣, 비율, 색상, 손잡이, 고리, 프레임, 날 수와 위치를 변형하지 않는다.
- 제품 복제, 새 부품, 식재료, 손, 로고와 근거 없는 성능 표현을 추가하지 않는다.
- 첫 director안의 `rotateY` 반전은 같은 2D 면을 거울상으로 반복해 실제 커터 위치를 오인시켰으므로 사용자 피드백에 따라 제거했다.
- 디자인 팔레트는 상세페이지의 `#0b2922`, `#173e34`, `#dfff5a`, `#f4f1e8`을 따른다.
- 사용자는 질문보다 구현을 요청했으므로 autonomous one-shot으로 진행한다.
