# 줄리앤커터 만능채칼 - Project Learnings

## LEARN-001

- `category`: qa
- `scope`: candidate-shared
- `observation`: 최종 자산만 보존하고 원본 공급처 번들을 제외하면 페이지는 열리지만 provenance 재검증 범위가 줄어든다.
- `evidence_paths`: `supplier-facts.json`, `detail-page/assets/manifest.json`, `evidence/README.md`
- `before_after`: 외부 `.artifacts/` 경로 → 프로젝트 내부에 남은 공급처 evidence 경로와 미보존 상태 명시
- `risk_if_reused`: 누락된 원본을 생성 자산으로 대체하면 제품 사실 SSOT가 훼손된다.
- `next_validation`: 새 프로젝트부터 공급처 번들을 `evidence/supplier-bundle/`에 보존
- `promotion_status`: validated
