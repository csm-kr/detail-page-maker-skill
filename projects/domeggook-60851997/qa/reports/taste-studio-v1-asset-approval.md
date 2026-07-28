# Studio v1 Asset 승인 UI 검수

검수일: 2026-07-27  
대상: `domeggook-60851997/detail-page/studio.html`

## Design read

시니어 커머스 제작자가 쓰는 로컬 검수 작업대. 장식보다 원본·후보 비교와 승인
상태가 먼저 보이는 다크 툴 UI를 기준으로 삼았다.

- DESIGN_VARIANCE: 4
- MOTION_INTENSITY: 2
- VISUAL_DENSITY: 6

## 화면 검수

- 360px가 기본 캔버스로 선택되고 실제 iframe 너비도 360px다.
- 왼쪽 작업 순서가 `상세 편집 → 에셋 승인 → 최종 출력`으로 고정된다.
- 에셋 승인 화면은 현재 상태와 필터를 왼쪽에 두고 후보를 넓은 작업면에서 본다.
- 최종 출력 화면은 승인 수, 대기 수, READY/LOCKED를 같은 시야에 둔다.
- 장식용 그래디언트와 과한 모션을 사용하지 않았다.
- 1200×760 화면에서 Studio 자체의 가로 오버플로가 없다.
- 기존 상세페이지의 사용자 수정 상태를 유지했다.
  - 섹션 19개
  - 수정 가능한 문구 97개
  - 이미지 20개
  - `입체 에어셀` 문구 확인

## 승인 동작 검수

격리한 Studio v1 프로젝트에 pending 이미지 한 장을 넣고 실제 승인 동작을
실행했다.

| 시점 | pending | approved | 최종 출력 |
|---|---:|---:|---|
| 승인 전 | 1 | 0 | LOCKED |
| 승인 후 | 0 | 1 | READY |

- 파일이 `asset/generated/pending/image`에서
  `asset/generated/approved/image`로 실제 이동했다.
- `asset-manifest.json`에 SHA-256, 승인 시각, 원래 경로와 승인 경로가 기록됐다.
- `approval-ledger.ndjson`에도 같은 결정을 추가 기록했다.
- 확인값이 없는 API 승인 요청은 자동 테스트에서 거부된다.

## Browser Harness 증거

- 편집 화면: `qa/evidence/studio-v1-asset-approval/screenshots/studio-v1-edit.jpg`
- 승인 화면: `qa/evidence/studio-v1-asset-approval/screenshots/studio-v1-approval.jpg`
- 출력 화면: `qa/evidence/studio-v1-asset-approval/screenshots/studio-v1-output.jpg`
- 녹화: `qa/evidence/studio-v1-asset-approval/recordings/domeggook-60851997-studio-v1-approval/`
- 실제 승인 녹화: `qa/evidence/studio-v1-asset-approval/recordings/studio-v1-real-approval-action/`

## 결과

PASS. 신규 생성물은 승인 전 조립·출력이 차단되고, 명시적으로 승인된 Asset만
최종 출력 단계에 들어간다.
