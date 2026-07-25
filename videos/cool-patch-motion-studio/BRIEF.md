---
workflow: motion-graphics
flow: automation
storyboard: no
destination: product-detail-html
aspect: 800x800
language: ko
audience: "더운 야외 활동과 일상에서 간편한 쿨링 방식을 찾는 고객"
length: "5.2s × 5 compositions"
angle: "hands-free form, preparation, use, dimensions, care"
---

# 아이스 쿨패치 모션 스튜디오

## Intent

도매꾹 상품 23824901의 확인된 사실만 사용해 상세페이지용 GIF 다섯 개를 만든다. 각 GIF는 하나의 구매 질문만 답하며, 한글과 수치는 HTML/SVG로 유지한다.

## Motion contract

- `problem`: 냉팩을 계속 들고 있는 불편과 붙이는 제품 형태를 대비한다.
- `prep`: 더 시원하게 사용하려면 냉장 1–2시간 보관하며 냉동하지 않는다는 순서를 보여준다.
- `peel`: 개봉, 투명 필름 제거, 깨끗하고 마른 피부에 부착하는 세 단계를 보여준다.
- `dimension`: 약 5×12cm와 1팩 2매입을 제품과 떨어진 치수선으로 보여준다.
- `care`: 같은 부위에 장시간 사용하지 않고 이상이 있으면 중단한다는 기준을 보여준다.

## Evidence boundary

- 허용: 약 5×12cm, 하이드로겔·PE, 1팩 2매입, 36개월 이상, 냉장 1–2시간, 냉동 금지, 공급처 사용 순서와 주의사항.
- 금지: 온도 하락 수치, 최대 8시간, 접착력 보장, 저자극·무자극, 치료·해열 효능, KC·시험기관 인증 배지.
- ImageGen 소재는 맥락·분위기·제품 파생 시각화이며 성능 증거로 사용하지 않는다.

## Geometry QA

- 치수선 끝점과 점 중심의 차이는 각 축 2px 이내다.
- 치수선과 제품 외곽 사이에는 최소 24px 여백을 둔다.
- 수치 라벨은 선 그리기가 끝난 뒤 나타난다.
