# 노바페이스 발편한 기능성깔창 - Project Learnings

## LEARN-001

- `category`: qa
- `scope`: candidate-shared
- `observation`: QA 캡처와 GIF 접촉판은 임시 폴더가 아니라 해당 프로젝트의 QA evidence로 보존해야 보고서 링크가 장기 유지된다.
- `evidence_paths`: `qa/evidence/commercial-final-v8/`, `qa/commercial-final-v8.md`
- `before_after`: 구 임시 폴더 이미지 참조 → 프로젝트 상대 QA evidence
- `risk_if_reused`: 모든 중간 캡처를 영구 보존하면 저장소가 불필요하게 커질 수 있다.
- `next_validation`: 최종 판정에 직접 사용한 캡처만 manifest 또는 보고서에서 참조
- `promotion_status`: validated
