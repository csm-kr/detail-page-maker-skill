# Studio v1과 Asset 승인 게이트

Type: task
Status: resolved
Triage: ready-for-agent
Blocked by:

## Question

`domeggook-60851997` Studio v1을 유지하면서 이미지·GIF 승인 게이트와 새 Asset
폴더 계약을 어떻게 활성 실행 경로와 스킬에 반영할 것인가?

## Answer

활성 실행 경로를 Studio v1으로 고정하고
`상세 편집 → 에셋 승인 → 최종 출력`의 세 작업면을 통합했다. 신규 이미지·GIF는
`asset/generated/pending`에서 시작하며, 사용자의 명시적 확인 뒤 서버가 파일을
`approved` 또는 `rejected`로 이동한다. pending 파일이 남아 있으면 단일 HTML
출력을 잠근다.

기존 `domeggook-60851997/assets/`는 사용자 수정 결과를 보존하기 위해 동결했고,
전환 이후 신규·변경 Asset만 새 `asset/` 계약을 따른다. Studio v2는 삭제하지 않고
`skills/detail-page-maker-skill/deprecated/studio-v2/`로 이동했으며 활성 CLI는 더
이상 참조하지 않는다.

## Comments

- 2026-07-27: 사용자가 `domeggook-60851997`에서 사용한 Studio v1을 기준으로
  특정했다.
- 2026-07-27: Studio v2는 삭제 대신 비활성 과거 자료로 보존하기로 했다.
- 2026-07-27: Studio v1 자동 테스트 6개, JavaScript 문법 검사 7개와 스킬
  validator를 통과했다.
- 2026-07-27: Browser Harness에서 기존 노바페이스 편집 상태, 360px 캔버스,
  세 작업면 전환을 확인했다.
- 2026-07-27: 격리 프로젝트의 pending 이미지 1개를 실제 승인하여 파일 이동,
  SHA-256 원장 기록과 `LOCKED → READY` 전환을 확인했다.
