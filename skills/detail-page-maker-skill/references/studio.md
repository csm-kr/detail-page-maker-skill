# Studio v1 최종 편집·개정

## 역할과 진입 시점

Studio는 조사·기획·이미지 생성·GIF 제작·에셋 승인·workflow 제어 화면이 아니다.
Orchestrator가 G0~G3를 끝내고 G4 조립과 사전 QA가 통과한 완성 working revision을
만든 뒤, 사용자가 마지막 문구·배치·이미지만 손보는 최종 편집 UI다.

사용자에게 보이는 작업면은 `최종 수정 → 최종 출력` 두 개다. 과거의 에셋 승인과
workflow 탭은 DOM 호환을 위해 남더라도 navigation에서는 숨긴다. 사용자 부재로
제작이 멈추지 않으며 Studio를 열지 않아도 자동 제작·QA·배포 흐름은 계속된다.

유일한 저작 폭은 390 CSS px다. 고객 전달 자산과 공개 HTML은 같은 section을
폭 780px profile로 렌더한다. 390px 레이아웃을 780px 화면의 좁은 중앙 열로
유지하는 것은 parity가 아니라 전달 폭 실패다.

## HTML에서 Studio로 이동

로컬 서버의 `/output/detail-page.html` 응답에는 최신 `working` 상태의 exact
`session_id`를 넣은 다음 링크를 한 개 주입한다.

```text
/studio.html?session_id=<exact-working-session>
```

런처 문구는 `Studio에서 최종 수정`이다. 직접 `/studio.html`을 열어도 서버가
최신 working session을 찾으면 exact URL로 redirect한다. 이 주입과 redirect는
로컬 HTTP에서만 일어나며 디스크의 canonical `output/detail-page.html`, manifest,
공개 HTML과 Wing bytes에는 Studio 링크나 session ID를 쓰지 않는다.

working session이 없으면 읽기 미리보기만 허용하고 `최종 수정 저장`을 비활성화한다.
초기 템플릿이나 G1~G3 산출물을 Studio에서 편집 정본으로 저장하지 않는다.

## 편집 권한 경계

- Studio 부모만 same-origin capability와 `/api/v1/*` 호출 권한을 가진다.
- authoring iframe은 `sandbox="allow-scripts"`로 실행하고 `allow-same-origin`을
  추가하지 않는다. child는 쿠키·부모 DOM·API에 직접 접근할 수 없다.
- 부모는 query의 `session_id`로
  `GET /api/v1/studio/working/state?session_id=...`를 호출하고 exact
  `working_snapshot_digest`와 `editable_html_contract`를 받는다.
- iframe은 `/studio-working.html?session_id=...`에서 그 session의 `index.html`
  bytes만 렌더한다.
- 사용자가 저장을 누르면 부모가 암호학적 one-time nonce를 만들고
  `DETAIL_SERIALIZE_REQUEST`를 보낸다. child는 exact nonce와 현재 HTML을 한 번만
  `DETAIL_SERIALIZED`로 반환한다.
- 부모는 wrong nonce·사전 전송·재전송·timeout 응답을 무시하고 exact 응답만
  `POST /api/v1/studio/working/save`에 보낸다. 레거시
  `POST /api/v1/output/save`는 최종 Studio UI에서 사용하지 않는다.
- save payload에는 `session_id`, 직전 `expected_working_snapshot_digest`, HTML,
  HTML을 반영한 `editable_html_contract`가 함께 있어야 한다.

지원 편집은 텍스트 내용·글꼴·색·정렬, 요소 선택·이동·크기, 이미지 교체,
섹션 순서·표시, mobile/desktop 하단 crop이다. `V`는 배치, `T`는 텍스트,
`Ctrl/Cmd+Z`는 실행 취소, 화살표는 1px, `Shift+화살표`는 10px 이동이다.

## G4 서버 오케스트레이션

1. `POST /api/v1/studio/working/import`
   - WorkflowEngine에서 `S1_STUDIO_WORKING` ready를 확인한다.
   - 전달 artifact ID와 manifest SHA-256이 exact fresh `G4A_ASSEMBLY`
     `page.html_revision`인지 검증한다.
   - mutable working snapshot과 imported workflow digest를 봉인한 session JSON을
     `.detail-page/workflow/studio-sessions/<session-id>.json`에 쓴다.
2. `GET /api/v1/studio/working/state`와 `GET /studio-working.html`
   - UI에 sealed session summary·editable contract와 exact working HTML을 제공한다.
   - session이 `working`이 아니거나 project 밖 경로면 fail-closed한다.
3. `POST /api/v1/studio/working/save`
   - expected digest가 현재 snapshot과 같을 때만 HTML과 contract를 함께 저장한다.
   - 저장은 mutable G4 working revision만 갱신하며 공개
     `output/detail-page.html`을 직접 덮어쓰지 않는다.
   - 검증 실패 시 이전 working bytes를 복원한다.
4. `POST /api/v1/studio/commit`
   - import 뒤 workflow graph drift와 exact saved snapshot을 다시 검사한다.
   - pre-commit RubricResult가 score 97, Behance 90, critical 85, hard failure 0을
     통과해야 immutable `studio.committed_revision`과 `page.html_revision`을 만든다.
   - BrowserCapture work order는 320@1x·360@1x·390@2x와 780 delivery 검사를 묶는다.
5. `POST /api/v1/studio/capture/complete`
   - 실제 capture bytes·viewport·overflow·stable frame과 exact immutable revision을
     다시 검증한다.
   - 실패는 필요한 section만 repair하고, 통과하면 G4U를 URL-only policy receipt로
     자동 승인한 뒤 G5로 진행한다.

Session JSON seal, workflow graph, revision commit, capture work order 중 하나라도
바뀌면 다음 단계는 실패한다. Studio 수정 뒤에도 독립 QA를 생략하지 않는다.

## 공개 출력과 복구

사용자가 보는 진입점은 `output/detail-page.html` 하나다. media는
`output/media/{images,gifs}/`, Wing은 `output/wing/<export-id>/`에 둔다.
working·revision·evidence·QA·복구 snapshot은 `.detail-page/` 내부에만 둔다.
`deliverables/`와 공개 `index.html`은 만들지 않는다.

`POST /api/v1/exports/html`과 `POST /api/v1/exports/coupang-wing`은 같은 서버측
sealed G5 gate를 사용한다. pending/필수 미승인 0, state seal, stale 0, G5 exact
approval receipt, fresh QA, 97/90/85/hard-0, motion DOM→manifest→animation bytes
closure를 모두 통과해야 한다. public sanitizer는 실제 HTML 태그의 `data-*`를
제거하지만 CSS selector 문자열을 속성으로 오인하지 않는다.

Wing Export마다 새 immutable `{project_key}/{export_id}` CDN namespace를 만들고
HTTP·MIME·크기·SHA-256·immutable cache를 원격 검증한다. 성공한 Wing은 자체
`detail-page.html`을 만들며 공개 정본을 임의로 덮어쓰지 않는다.
