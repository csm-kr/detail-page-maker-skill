# 아이스 쿨패치 - Project Learnings

## LEARN-001

- `category`: workflow
- `scope`: candidate-shared
- `observation`: 공급처 번들, 상품별 Behance 조사, HyperFrames 원본과 QA를 한 프로젝트 폴더에 모으면 이전 루트 폴더 없이도 감사할 수 있다.
- `evidence_paths`: `evidence/supplier-bundle`, `research/`, `hyperframes/projects/`, `detail-page/qa/`
- `before_after`: 루트 `tests/`, `research/`, `videos/` 참조 → 프로젝트 상대 경로
- `risk_if_reused`: 원본을 복사하지 않고 경로만 바꾸면 provenance가 끊긴다.
- `next_validation`: 프로젝트 폴더에서 `detail-page.mjs validate --project .`
- `promotion_status`: validated
