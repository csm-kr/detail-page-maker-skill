# 아쿠아핏 워터 슈즈 - Project Learnings

## LEARN-001

- `category`: evidence
- `scope`: candidate-shared
- `observation`: 임시 supplier crop보다 원본 상세 이미지와 y 구간 locator를 정본으로 유지하는 편이 의존성이 적다.
- `evidence_paths`: `evidence/supplier-bundle/detail/assets/detail-01.png`, `supplier-facts.json`
- `before_after`: 누락된 `research/supplier-crops/` 참조 → 원본 이미지 구간 locator
- `risk_if_reused`: 구간 값만 남기고 원본 이미지를 제거하면 사실을 재검토할 수 없다.
- `next_validation`: 원본 이미지 hash와 locator 범위를 함께 검사
- `promotion_status`: validated
