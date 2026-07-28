# 08. 워크트리 병합과 비활성 자산 보존 이관

- Type: task
- Status: resolved
- Label: ready-for-agent
- Blocked by: 없음
- Created: 2026-07-28

## 할 일

- `migration/asset-root-unification`과 `main`의 공통 조상·변경·충돌을 감사한다.
- 병합과 충돌하는 로컬 변경은 stash와 archive manifest로 복구 가능하게 보호한다.
- 바이트 동일 중복과 최종본 미참조 자산을 구분한다.
- 비활성 자산을 `archive/legacy-assets/2026-07-28/`로 이관한다.
- 기존 프로토타입과 승인 원본은 삭제하지 않는다.
- 워크트리 커밋을 명시적 merge commit으로 통합한다.

## 수락 기준

- 병합 전 로컬 변경을 잃지 않는다.
- 모든 이동 파일에 원래 경로·복구 경로·SHA-256이 있다.
- 최종 HTML·manifest·QA의 깨진 참조가 0건이다.

## Answer

`migration/asset-root-unification`을 명시적 merge commit `d9b9bcb`로 통합했다.
충돌 가능성이 있던 기존 변경은 stash와 `refs/archive/pre-merge-*` 두 개로
보존했다. 활성 supplier crop은 단일 `asset/` 루트로 옮기고, 비활성 원본·복구본과
대체된 GIF는 `archive/legacy-assets/2026-07-28/`로 이동했다.

상위 체크섬 2/2, 중첩 체크섬 21/21이 일치하고 활성 레거시 경로 참조는 0건이다.
기존 프로토타입과 승인 원본은 삭제하지 않았다.
