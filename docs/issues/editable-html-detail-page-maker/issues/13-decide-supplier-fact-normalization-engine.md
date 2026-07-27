# 공급처 이미지 사실 정규화 엔진 결정

Type: prototype
Status: open
Blocked by: 12

## Question

ImageGen 이외의 생성형 모델을 도입하지 않고, 도매꾹 상세 이미지의 OCR 원문·치수선이 가리키는 부위·이미지 영역·원본 비교·사람의 확인 상태를 어떻게 결합해야 `supplier-facts.json`, 소구 후보와 기획 브리프를 정확하고 재현 가능하게 만들 수 있는가?

## Acceptance criteria

- 원문 OCR과 정규화 값을 분리한다.
- 치수 숫자, 단위, 치수선의 대상 부위와 방향을 함께 보존한다.
- 모든 사실이 bundle 상대 경로와 구체 locator로 역추적된다.
- 공급처 소구 문구를 제품 사실과 분리하고 검증 전 `planning-only`로 둔다.
- `publishable: true`가 될 수 있는 수동 확인 절차와 로그 형식을 정의한다.
- 원본 사진 인벤토리, 사실표, 소구 후보와 기획 브리프의 스키마 경계를 결정한다.
