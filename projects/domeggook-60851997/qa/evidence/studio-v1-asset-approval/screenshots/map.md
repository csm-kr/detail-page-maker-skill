# Studio v1 Asset Approval Map

## Destination

`domeggook-60851997`에서 사용한 단순 HTML 편집 Studio v1을 활성 기준으로 삼고,
제품 SSOT와 상세페이지 조립 사이에 사용자 이미지·GIF 승인 게이트를 추가한다.

## Notes

- 기준 구현: `detail-page/studio.html`
- Studio v2는 활성 실행 경로에서 제외하고 과거 기록으로만 보존한다.
- 사용자 원본은 덮어쓰지 않는다.
- 신규 생성물은 항상 `asset/generated/pending/`에서 시작한다.

## Decisions so far

- [Studio v1과 Asset 승인 게이트](issues/01-studio-v1-asset-approval.md)
- 활성 Studio는 v1 하나이며 새 프로젝트 CLI도 v1 런타임만 복사한다.
- 기존 게시 페이지 Asset은 동결하고, 전환 이후 신규·변경본부터 새 승인 계약을
  적용한다.
- 최종 출력은 pending 0개일 때만 허용한다.
- 결정 기록은 manifest와 append-only 승인 원장에 함께 남긴다.

## Not yet specified

- 원격 협업과 다중 사용자 승인
- 외부 클라우드 저장소

## Out of scope

- 기존 노바페이스 게시 자산 119MB의 물리적 중복 복사
- Studio에서 ImageGen API를 직접 호출하는 기능
- 폐기된 Studio v2의 기능 확장
