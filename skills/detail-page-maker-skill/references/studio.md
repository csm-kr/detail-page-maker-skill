# Studio v1 승인·편집·개정

## 활성 런타임

사용자 화면은 `scripts/runtime/studio-v1-server.mjs`만 시작한다. 작업면은
`상세 편집 → 에셋 승인 → 최종 출력` 세 개다.

Studio는 편집 UI이며 저장한 working snapshot이 최신 저작 정본 revision이다.
유일한 디자인 폭은
390 CSS px다. 고객 전달 자산과 공개 HTML은 같은 section을 폭 780px 전달
profile로 렌더한다. 390px 레이아웃을 780px 안의 좁은 중앙 열로 유지하는 것은
parity가 아니라 전달 폭 실패다.

## 에셋 승인

Studio는 pending 이미지·GIF를 원본과 함께 표시한다. 일반 run의 승인 또는 반려
버튼은 사용자의 명시적 확인을 요구하며 파일 이동, 해시, 원장 기록을 한 동작으로
처리한다. Plan-once run은 독립 QA PASS 뒤 sealed workflow 원장에 policy
approval을 append하고 정상 member를 자동 승인한다. 일반 run의 pending과 필수
미승인이 0개이거나, plan-once run의 G2/G3 policy approval 계보가 모두 검증됐을
때만 일반 HTML 내보내기를 연다.

## 상세 편집

의미 있는 텍스트·이미지·GIF·시각 요소를 선택할 수 있어야 한다.

### Authoring iframe 권한 경계

- Studio 부모만 same-origin 세션 capability와 `/api/v1/*` 호출 권한을 가진다.
- Authoring iframe은 `sandbox="allow-scripts"`로 실행하며
  `allow-same-origin`을 추가하지 않는다. child는 opaque origin이므로 쿠키,
  `localStorage`, 부모 DOM과 API에 직접 접근하지 않는다.
- child의 모든 parent message listener는
  `event.source === window.parent`, 부모의 모든 child message listener는
  `event.source === preview.contentWindow`를 먼저 확인한다.
- 사용자가 부모의 `저장`을 누를 때만 부모가 암호학적 난수 one-time nonce를
  만들고 `DETAIL_SERIALIZE_REQUEST`를 보낸다. child는 exact nonce와 현재 HTML을
  `DETAIL_SERIALIZED`로 한 번 반환한다.
- 부모는 outstanding nonce와 정확히 일치하는 첫 응답만 소비하여
  `/api/v1/output/save`를 호출한다. wrong nonce, 사전 전송, 재전송, timeout
  응답은 저장 권한을 얻지 못한다.
- 저장 성공·실패는 부모가 같은 nonce의 `DETAIL_SAVE_RESULT`로 child에
  중계한다. `Origin: null`인 child의 save·approval API 직접 호출은 서버에서
  거부한다.

- `V`: 요소 배치
- `T`: 텍스트 변환
- `Delete/Backspace`: 확인 뒤 선택 요소 삭제
- `Esc`: 선택 해제와 편집 종료
- `Ctrl/Cmd+Z`: 실행 취소
- 화살표: 1px 이동
- `Shift+화살표`: 10px 이동
- `Ctrl/Cmd+Shift+L/E/R/J`: 텍스트 정렬

요소 배치 모드는 텍스트 내용을 바꾸지 않는다. 텍스트 변환 모드는 비텍스트 요소를
움직이지 않는다. 캔버스·섹션 중심과 안전 여백 보조선을 제공하고 가까운 위치에서
스냅한다.

텍스트는 내용 비우기, 글꼴, 색, 왼쪽·가운데·오른쪽·양쪽 정렬을 지원한다.
다중 선택은 Ctrl/Cmd로 추가하고 그룹 이동 시 각 요소의 상대 위치를 보존한다.
활성 요소와 선택 그룹, 레이어 깊이를 구분해 표시한다.

### 반응형 하단 자르기

`미리보기 창 높이`는 Studio iframe만 조절하며 결과물의 길이를 바꾸지 않는다.
실제 결과의 긴 하단을 줄일 때는 섹션을 선택한 뒤 `선택 섹션 아래 자르기`를 쓴다.
크롭 높이는 `mobile`(520px 이하)과 `desktop`(521px 이상)으로 분리해 상태에
저장하고, 미리보기·재열기·단일 HTML 내보내기에 같은 미디어쿼리를 적용한다.
`자동 높이로 복원`과 실행 취소가 항상 가능해야 한다.

## 개정

조립 승인 뒤 이미지·GIF는 읽기 전용이다. 자산을 바꾸려면 revision impact를
계산하고 영향받은 에셋과 섹션만 승인을 해제한다. HTML 편집 상태는 안정된 요소
ID를 기준으로 저장한다.

사용자가 보는 저장 동작은 파일 이름을 늘리지 않는다. `저장`을 명시적으로
누르면 현재 working model을 최신 source revision으로 봉인하고
`output/detail-page.html` 단일 진입점을 같은 digest 계보로 갱신한 뒤 전체 section의
실제 콘텐츠 높이로 문서 높이를 다시 계산한다. 저장 전 bytes는 내부
`.detail-page/backups/`에 snapshot으로 보존하며 최신 20개를 넘으면 가장 오래된
것부터 정리한다. snapshot과 immutable receipt는 복구·검증용 내부 기록이고 고객
출력이나 사용자 기본 파일 목록에 노출하지 않는다.

## 출력

사용자 검토와 최신 저장 진입점은 `output/detail-page.html` 하나다. media는
`output/media/{images,gifs}/`, Wing export는 `output/wing/<export-id>/`에 둔다.
작업 원본·snapshot·evidence·전체 QA는 `.detail-page/` 내부에 남긴다.
`deliverables/`와 공개 `index.html`은 만들지 않는다.

## G4 서버 오케스트레이션 계약

Studio production 경로는 iframe 메시지가 아니라 다음 서버 API를 순서대로 사용한다.

1. `POST /api/v1/studio/working/import`
   - WorkflowEngine inspect를 다시 수행하고 `S1_STUDIO_WORKING`이 ready인지 확인한다.
   - 전달된 artifact ID와 manifest SHA-256이 exact fresh `G4A_ASSEMBLY`
     `page.html_revision`인지 검증한다.
   - mutable working snapshot과 imported workflow digest를 봉인한 session JSON을
     `<project>/.detail-page/workflow/studio-sessions/<session-id>.json`에 둔다.
2. `POST /api/v1/studio/working/save`
   - session이 `working`이고 `expected_working_snapshot_digest`가 직전 snapshot과
     정확히 같을 때만 HTML과 editable contract를 함께 저장한다.
   - save snapshot이 최신 source revision이 되며
     `output/detail-page.html`을 원자적으로 덮어쓰기 전에 이전 bytes를 내부
     backup에 기록한다.
   - 저장된 문서의 실제 section bottom과 scrollHeight가 일치해야 한다.
   - 새 snapshot 검증이 실패하면 이전 `detail-page.html` bytes로 복원한다.
   - backup은 최신 20개만 유지한다.
3. `POST /api/v1/studio/commit`
   - 새 편집 원본을 만들지 않고 저장된 exact source revision을 검증·봉인한다.
   - import 이후 workflow graph가 바뀌지 않았고 save된 exact snapshot인지 다시
     검사한다.
   - 현재 working artifact ID/hash를 subject로 한 pre-commit RubricResult가
     score 97, Behance quality 90, critical dimension 85, hard failure 0을
     통과해야 한다.
   - `StudioCommitAdapter`는
     `<project>/.detail-page/workflow/revisions/<revision-id>/`에 내부 immutable
     revision을 만들고
     `studio.committed_revision`·`page.html_revision` materialized
     ArtifactRecord를 commit한다.
   - `BrowserCaptureAdapter`는
     `<project>/.detail-page/qa/captures/<revision-id>/`의 390 authoring capture와
     780 delivery capture, 숨은 320/360 overflow work order를 만든다.
4. `POST /api/v1/studio/capture/complete`
   - 실제 PNG bytes·viewport 크기·overflow·stable frame·recording과 정확히 같은
     세 capture ID를 재검증한다.
   - post-commit RubricResult의 subject가 exact immutable revision인지 확인하고,
     immutable pre-commit baseline과 RubricDelta를 만든다.
   - 별도 evaluator session으로 `WorkflowEngine.recordRubricIteration`을 호출한다.
     실패는 `RubricRepairScheduled`, plateau/budget stop은 `RubricAwaitUser`로
     저장하고 challenge를 열지 않는다.
   - G4Q artifact와 ValidationReceipt가 일치하고 transition이
     `RubricPublishReady`일 때만 `G4U_APPROVAL`을 ready로 만든다. Plan-once
     run은 policy receipt로 자동 승인하고 일반 run은 exact challenge를 연다.

commit·capture artifact의 canonical materialized member manifest는 WorkflowEngine
ArtifactRecordStore가 commit과 이후 inspect/advance/resume/export 때 실제 파일을
다시 해시할 수 있도록 보존한다. Mutable working은 sealed snapshot digest로
충돌을 막는다. Session JSON seal, workflow graph, revision commit, capture work
order 중 하나라도 바뀌면 다음 단계는 fail-closed한다.

## 공통 G5 내보내기 잠금

`POST /api/v1/exports/html`과 `POST /api/v1/exports/coupang-wing`은 별도 UI
플래그가 아니라 같은 서버측 sealed gate를 사용한다.

- pending 0, required 미승인 0
- verified workflow state seal, stale artifact 0
- 승인된 `G5U_APPROVAL`과 exact subject에 묶인 사용자 또는 plan-once policy의 verified
  `decision.publish_approval`
- 정확히 하나의 fresh `G5_PUBLISH_QA` `qa.validation_receipt`와 변조되지 않은
  ArtifactRecord
- `verdict: PASS`, score 97 이상, Behance quality 90 이상, critical dimension
  85 이상, deterministic hard failure 0, detail-page-flow hard failure 0,
  `hard_failures` 빈 배열

일반 HTML은 gate 뒤 WorkflowEngine을 다시 inspect하고, 정확히 하나의 fresh
immutable Studio revision seal과 editable authoring source bytes를 확인한다. staging에서
`output/detail-page.html`, `output/media/`, `output/export-manifest.json`을 만든
뒤 graph·approval·QA proof가 그대로인지 다시 확인하고 원자적으로 publish한다.

Staging 과정은 `data-motion-src`를 공개 animation `<img src>`로 변환한 후
sanitizer를 적용하고 DOM·manifest·`output/media/gifs`·frame count closure를
검사한다. Motion plan이 있는데 animation bytes가 없거나 poster만 있으면 publish
proof와 무관하게 실패한다.

Wing은 같은 gate 뒤 Browser Harness exporter를 실행한다. 출력은
`<project>/output/wing/<export-id>/`, 실행 job은
`<project>/.detail-page/workflow/jobs/<export-id>.json`에 남는다. 어느 export든 inspect 중
materialized member bytes가 manifest의 size/SHA-256과 다르면 생성하지 않는다.
성공한 Wing은 자신의 `detail-page.html`을 만들지만 최신 Studio 저장본인
`output/detail-page.html`을 덮어쓰지 않는다.
