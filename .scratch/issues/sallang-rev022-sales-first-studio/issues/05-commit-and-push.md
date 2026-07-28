# 05. 선별 커밋·푸시

- Type: task
- Status: resolved
- Label: ready-for-agent
- Blocked by: 04
- Created: 2026-07-28

## 할 일

- 사용자 소유의 기존 dirty 변경을 제외한다.
- 원격 최신 main을 반영하고 이번 요청 파일만 커밋한다.
- origin/main에 푸시하고 로컬·원격 HEAD를 확인한다.

## 수락 기준

- 기존 unrelated 변경이 보존된다.
- 커밋 SHA와 최종 진입점을 보고한다.

## Comments

- 2026-07-28: `git pull --ff-only origin main` 결과 원격과 로컬이 동일했다.
- 기존 dirty 파일은 제외하고 이 작업의 문서·Studio·살랑 rev022·테스트만
  선별해 커밋·푸시한다.
