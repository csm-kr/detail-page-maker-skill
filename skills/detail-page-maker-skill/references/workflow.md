# 제작 플로우와 승인 게이트

## 전체 순서

| 단계 | 잠글 것 | 필수 산출물 | 다음 단계 조건 |
| --- | --- | --- | --- |
| 입력 | 공급처 URL, 선택적 실제품 사진, 목표 채널 | `input/product`, 프로젝트 폴더 | 공급처 same-SKU media 확인 |
| G0 SOURCE_SSOT | 제품 사실, 외형, 부품, 수량, 문자, 방향 | extractor evidence, SSOT manifest | 원본 사진 fast path 자동 승인 또는 공급처 SSOT 수동 승인 |
| G1 COMMERCIAL_PLAN | 기존 output·기준작의 상품 관계와 판매 논리 비교, category cohort, 고정 문제→답→해결 흐름, section별 한 메시지·증명 이미지·정지/GIF 역할·다음 이유 공동 설계 | ReferenceArtifactSet + CategoryReferenceProfile + 물질화된 사람용 기획 + commercial-flow/claim/section/image/motion/rubric ProductionPlan | 모든 section/image/GIF의 category trait binding·visual ambition·rule effect·쿠팡 1초 전달·detail-page-flow hard-0, 양방향 참조·orphan 0, 사용자 기획 승인 |
| G2 IMAGE_ASSETS | 용도별 32장 단일 동시 배치와 제품 불변 조건 QA | 32개 pending 이미지, God Tibo 32 provider workers receipt, QA 기록 | candidate 합계 32·단일 batch·동일성 PASS 뒤 plan-once 자동 승인 또는 사용자 이미지 승인 |
| G3 MOTION_ASSETS | 문제 2+, 장점별 1+, 사용·비교, total 5+/기본 7~9와 모션 다양성 | 승인 motion, poster, HyperFrames 원본, 다양성 표 | 인접 2축 차이·첫 프레임·픽셀/지각 loop·제품 불변·coverage hard-0 뒤 plan-once 자동 승인 또는 preview·최종 자산 수동 승인 |
| G4 ASSEMBLY | 승인 자산과 섹션 연결 | editable Studio source, 현재 output, 내부 revision, rubric result/delta | 390/780 repair PASS 뒤 plan-once 자동 승인 또는 사용자 조립 승인 |
| G5 PUBLISH | 공개 카피, 접근성, 채널 규격, 새 CDN namespace | `output/detail-page.html`, versioned Wing export | publish 97·Behance 90·critical 85·content hard 0·원격 검증 뒤 plan-once receipt 또는 게시 승인 |
| 학습 | 재사용 가능성과 위험 | 프로젝트 후보 또는 `<project>/.detail-page/exps/*.md` | 일반 후보는 승인 승격, trusted exps는 검증 뒤 CR/TR/MR 자동 승격 |

## G0·G1 병렬 준비

G0의 공급처 근거 정규화와 G1의 시장 조사는 병렬로 진행할 수 있다. G0가 잠기기
전의 G1 문서는 다음 상태를 명시한다.

- `g0_dependency`: 아직 잠기지 않은 제품 사실
- `provisional_claims`: 제품 답으로 확정하지 않은 가설
- `blocked_until_g0`: G0 승인 전 확정하거나 제작할 수 없는 항목

동종 제품 3개 이상과 공개 후기 원문에서 시장 불편을 조사하되 현재 SKU의 사실로
옮기지 않는다. G0 검증 전에는 G1을 `approved`로 기록하거나 이미지 생성을
시작하지 않는다. 검증 순서는 `G0 → G1 → G2 → G3 → G4 → G5`다. 실제 원본
사진이 검증된 run에서는 G1 기획만 사용자가 승인하고 나머지 user gate는
Orchestrator가 exact policy receipt로 승인한다.

## 속도 fast path

품질 gate 수를 줄이지 않고 critical path를 줄인다. G1에서 32개 이미지의 역할과
프롬프트를 모두 확정하고 G2는 God Tibo `items: 32`, `workers: 32` 한 번으로
즉시 실행한다. 8×4 순차 배치는 금지한다. 제품 reference만 필요한 G3 motion은
G2와 동시에, 승인 이미지가 필요한 motion은 해당 member가 준비되는 즉시 시작한다.
통과한 artifact와 브라우저 캡처는 digest cache로 재사용하고 실패 member와 실제
descendant만 재생성한다. G4 수정 중에는 변경 section만 캡처·검사하며 마지막에
320·360·390·780 다중 viewport 전체 스크롤 캡처를 한 번 수행한다.

멀티에이전트 수와 브라우저 동시성은 별개다. 같은 로컬 Chrome의 활성 탭을
제어하는 Browser Harness extractor는 전역 단일 browser lane에서 직렬 실행한다.
다른 agent는 그동안 로컬 검증·정규화·기획처럼 브라우저를 쓰지 않는 작업만
병렬 실행한다. agent마다 격리된 remote browser endpoint가 증명되지 않았는데
여러 extractor를 동시에 실행하면 상품 ID와 녹화가 서로 섞일 수 있으므로
유효한 병렬 실행으로 세지 않는다.

도매꾹 공급처 WorkOrder는 `dmk-extractor`, 쿠팡 경쟁상품·후기 WorkOrder는
`coupang-extractor`를 runner로 고정한다. 각 extractor bundle의 원본 locator,
member hash, ExecutionReceipt, 독립 ValidationReceipt가 없으면 준비 완료로
세지 않는다. 실제 제품 사진이 없으면 최초 한 번만 알리고 공급처 same-SKU media를
SSOT로 계속한다.

## 실행 강제

스킬 문서의 순서는 설명이며, 실제 강제점은 persistent Orchestrator다. 내부
모듈과 저장 경계는 [`orchestration.md`](orchestration.md)를 따른다.

```text
workflow-status
→ workflow-advance / workflow-resume
→ worker-lease
→ 하위 스킬 Adapter 실행
→ ExecutionReceipt + output artifact + ValidationReceipt 제출
→ Orchestrator commit
→ exact digest/nonce 사용자 승인 또는 plan-once policy 자동 승인
```

- 작업 agent는 중앙 state와 승인 ledger를 직접 수정하지 않는다.
- WorkOrder에는 input artifact set digest, expected output type, policy,
  allowed staging root, runner skill/adapter, agent session, lease expiry와
  fencing token을 고정한다.
- 장기 작업은 `worker-heartbeat`로 lease를 연장한다. 만료된 work는 같은 input
  digest로 새 agent에 재배정하고 이전 fencing token의 늦은 제출을 거부한다.
- 생산자와 semantic validator session은 다르다.
- receipt나 다음 consumer가 없는 파일은 고아이며 다음 단계가 볼 수 없다.
- committed artifact는 `.detail-page/workflow/artifacts/<project-key>/`에
  exact input digest, producer session, adapter code hash를 가진 immutable
  JSON record로 저장되고 `workflow-status`가 `record_locator`를 노출한다.
- immutable record 안에는 실제 output artifact, ExecutionReceipt,
  structural ValidationReceipt가 함께 있다. `record_sha256`은 이 JSON의 실제
  bytes hash이며, 별도 Markdown이나 `orchestration/receipts/` 복사본이 정본이
  아니다.
- 파일로 실체화된 artifact는 `member_manifest.schema_version: "1.0"`,
  `policy: "materialized"`를 쓰고 `member_ids` 전부를
  `member_id/root_id/canonical 상대 locator/size_bytes/sha256`로 1:1
  열거한다. ArtifactRecordStore는 commit 때뿐 아니라 WorkflowEngine의 모든
  `loadOrCreate`에서 실제 파일 bytes를 다시 읽는다. 따라서
  `workflow-status`/inspect, `workflow-advance`, `workflow-resume`과 두 export가
  진입하는 inspect 경계에서 누락·크기/hash 불일치·경로 이탈·symlink를
  fail-closed한다.
- 입력 member가 바뀌면 아래 revision plan/commit 절차로 artifact graph의 실제
  descendant만 stale 처리한다.
- 재시작 뒤에도 `.detail-page/workflow/<project-id>.json`에서 lease·gate를
  재개한다.

### 실행 결과 구분

| 상태 | 의미 | 다음 행동 |
| --- | --- | --- |
| `ERROR [CODE]` | state seal, artifact record, receipt, 파일 bytes 또는 실행 계약이 유효하지 않음 | error code와 details를 보고 원본에서 재실행하거나 명시된 migration 사용 |
| `HOLD` | 실행은 정상이나 제품 동일성·권리·근거가 생산 기준에 부족함 | 부족한 실제품·권리·시장 근거를 추가 |
| `AWAITING_USER` | G1 기획, 원본 사진 없는 run의 승인, rubric plateau 또는 budget 판단 대기 | exact challenge 또는 revision plan 검토 |
| `COMPLETED` | G5 hard gate와 사용자 게시 승인까지 통과 | sealed HTML/Wing export |

과거 state에 현재 계약이 요구하는 immutable artifact record와 receipt가 없으면
`HOLD`로 낮추지 않고 `ARTIFACT_RECORD_MISSING` 오류로 중단한다. 과거 산출물에
receipt를 사후 합성하지 말고 저장된 원본 evidence bundle에서 새 workflow run을
시작한다.

## Revision plan과 선택적 재검증

승인된 실제품 photo set, G2 이미지 member, G3 GIF member를 바꿀 때는 기존 state를
직접 편집하거나 `workflow-resume`부터 실행하지 않는다. 먼저 변경 요청 JSON을
파일 또는 인라인 JSON으로 전달한다.

```sh
node scripts/detail-page.mjs workflow-revision-plan --project "<project-path>" --project-id "<project-id>" --input-digest "<sha256>" --change "<change.json|JSON>" --agent-session "<planner-session-id>"
```

출력의 `RevisionPlanned`에는 `plan_digest`, `graph_snapshot_digest`,
`state_mutation: false`, 전체 `plan`, `artifact_record`,
`commit_validation_receipt`가 있다. 다음 두 파일은 서로 다른 목적의 불변
증거이며 둘 다 commit 전에 재검증된다.

| 실제 위치 | 내용 | 확인값 |
| --- | --- | --- |
| `<project>/.detail-page/workflow/revision-plans/<plan-digest>.json` | exact change request, `RevisionImpactPlan`, plan artifact, ExecutionReceipt, structural ValidationReceipt를 묶은 immutable envelope | `plan_digest`, `envelope_sha256` |
| `<project>/.detail-page/workflow/artifacts/<project-key>/<artifact-key>.json` | `plan.revision_impact` artifact의 immutable artifact record | CLI 출력의 `artifact_record.record_locator`, `record_sha256` |

plan은 이 두 기록만 생성하고 graph artifact status, stage, challenge/gate는 바꾸지
않는다. stale·reset·reopen 집합을 검토한 뒤 별도 승인 명령을 실행한다.

```sh
node scripts/detail-page.mjs workflow-revision-commit --project "<project-path>" --project-id "<project-id>" --input-digest "<sha256>" --plan-digest "<RevisionPlanned.plan_digest>" --decided-by "<operator-id>" --reason "<변경 승인 사유>" --agent-session "<approver-session-id>"
```

commit은 다음 순서를 원자적으로 적용한다.

1. plan envelope, artifact record bytes와 두 receipt의 hash·subject를 검증한다.
2. 현재 graph/workflow digest로 impact를 재계산한다.
3. `stale_artifact_ids`는 `stale`, `stale_member_refs`는 해당 container만
   `partial_stale`로 표시한다.
4. `reset_stage_ids`를 `pending`으로 되돌리고 실행 중 work는 supersede한다.
5. `approval_gates_to_reopen`의 기존 challenge를 무효화하고 gate를 다시 연다.
6. sealed state
   `<project>/.detail-page/workflow/<project-id>.json`의
   `revision_commits[plan_digest]`에 `decided_by`, `reason`, stale/reset/reopen
   결과를 기록한다.

같은 exact change로 plan을 다시 요청하면 같은 digest와 기존 불변 record를
idempotent하게 재사용할 수 있다. 그러나 commit은 한 번뿐이다. 이미 commit한
plan replay, 계획 뒤 graph drift, workflow definition drift, envelope/record/
receipt tamper, 저장된 plan과 재계산 결과 불일치는 모두 상태 변경 전에
fail-closed한다.

### 변경 종류와 범위

- `actual_product_photo_set_revision`: `old_artifact`의 exact ID/SHA-256과
  `new_artifact`의 새 ID·새 SHA-256, 같은 `identity.photo_set` type, exact
  `revision_of`를 요구한다. `new_artifact`에는 non-empty hashed member,
  `producer_agent_session_id`, `policy: materialized`와 `root_id: project`인
  exact 1:1 member manifest가 필요하다. 각 locator는 canonical project 상대
  경로이고 `size_bytes > 0`, manifest SHA-256과 member hash가 실제 bytes와
  같아야 한다.
  - `rights_provenance.receipt_type`은
    `photo_revision.rights_provenance`이고 evidence locator/SHA-256은 실제 photo
    member를 가리킨다. `identity_reference`는
    `production_use_allowed: false`, `production_licensed`는 `true`다.
  - `identity_provenance.receipt_type`은
    `photo_revision.identity_provenance`, `decision`은 `verified`이며 같은 exact
    photo member set을 subject로 가진다.
  - 두 receipt의 `receipt_sha256`을 canonical body에서 다시 계산한다. commit은
    새 `identity.photo_set` ArtifactRecord와 ExecutionReceipt·structural
    ValidationReceipt를 만들고 old→new `revision_of` edge를 추가한다. 그 뒤
    `G0C_NORMALIZE`, `G0Q_QA`, `G0U_APPROVAL`만 reset/reopen하여 선택적으로
    재개한다.
  - 실제품 변경의 이미지 descendant는 재검증하되 승인 `product.ssot`
    boundary에서 멈춰 SSOT·시장·지식을 보호한다.
- `g2_image_member_rejection`: 반려 receipt의 subject와
  `old_artifact.member_id/member_sha256`이 같아야 한다. 해당 image member와
  연결 GIF/section/page descendant만 stale하고 G2 QA·제작 stage 및 실제로
  영향받은 사용자 gate를 다시 연다.
- `g3_gif_member_rejection`: 해당 GIF member와 연결 section/page descendant만
  stale하고 G3 render/QA 및 실제로 영향받은 사용자 gate를 다시 연다. 이미지
  branch와 다른 GIF는 유지한다.

member-level edge가 있으면 `scope.mode`는 `member_exact`이고 형제
이미지·GIF·section은 `protected_ids`에 남는다. 없으면
`artifact_fallback`으로 표시하고 오직 명시된 artifact-level descendant closure만
확대한다. 전체 graph invalidation은 금지한다. 보호된 SSOT·market·knowledge로
잘못 연결되는 edge, 존재하지 않거나 hash가 다른 member edge, root의 누락 edge도
거부한다.

## G1 ProductionPlan

기획 agent의 Markdown만으로 G2~G4를 실행하지 않는다. PlanningCompiler가 다음
아홉 part를 만든 뒤 한 digest로 승인한다.

1. `reference_artifact_set`
2. `category_reference_profile`
3. `commercial_flow`
4. `claim_graph`
5. `section_graph_draft`
6. `image_job_set`
7. `gif_brief_set`
8. `sales_motion_pipeline`
9. `rubric_target`

G1 시작 전에 다음 명령으로 기존 고객 output과 사용자가 준 기준 HTML을 profile한다.

```sh
node scripts/detail-page.mjs reference-profile \
  --project "<project-path>" \
  --reference "<reference.html>" \
  --role positive_reference
```

`reference_artifact_set`은 `current_output`, `positive_reference`,
`negative_reference`, `approved_exemplar`를 구분한다. 모든 artifact는 hash와
section density, image/motion reference, 폭 hint를 가지며 adoption matrix는
각 trait를 `adopt | adapt | reject`로 판단하고 이유와 target section을 남긴다.
고유 자산·카피를 Production에 복제하지 않는다.

`category_reference_profile`은 현재 library ID·version·SHA-256, 주 아키타입
하나, 보조 아키타입 최대 하나, 분류 이유와 제품 신호를 가진다. 주 아키타입의
개별 Behance card 2개 이상을 선택하고 모든 section·image job·GIF brief에
trait·adaptation intent·acceptance check를 바인딩한다. 공통 ambition anchor의
Hero 강도·챕터 리듬·장면 다양성·motion coverage·구매 마무리도 실제 target에
연결한다. 이미지 역할 5종·장면 4종·단독 제품 35% 이하·motion pattern 4종과
선택 아키타입의 필수 역할을 통과하지 못하면 G2/G3 frontier를 발급하지 않는다.

`provenance`에는 승인 product SSOT, 선택된 market snapshot/finding,
KnowledgeSnapshot의 artifact ID와 SHA-256, 적용 `CR/TR/MR` effect binding을 넣는다.
각 binding은 rule ID/hash 외에 `target_ids`, `required_effect`,
`acceptance_check_ids`를 가진다. ID/hash만 나열한 규칙은 적용으로 세지 않는다.
`copy_tone.owner`는 `html_dom`이며 voice·금지 표현은 해당 CR/TR rule에
역추적되어야 한다. 이 연결이 없으면 G1C ProductionPlan 계약이 실패한다.

`commercial_flow`에는 불편 인용 3~5개, 문제 motion 2+, 같은 순서의 해결 장점
3~5개와 pain 1:1 연결, 장점별 still·전용 motion·fact·체감 의견, 사용 motion 1+,
비교 motion 1+, 전체 최소 5·기본 7~9 target이 있어야 한다.

각 section에는 고객 질문, intent, claim/evidence, copy block, image slot,
motion slot, HTML module과 acceptance가 있다. 이미지·motion·HTML agent는 같은
section/slot/claim ID를 소비하고 내부 출력에도 보존한다. 필수 coverage slot에는
`motion_not_required`를 사용할 수 없다. 추가 비필수 slot만 정적 대체 사유를
기록할 수 있다.

Claim은 `observable_structure`, `manufacturer_claim`, `verified_efficacy` 경계를
분리한다. 관찰 구조에는 보이는 범위와 `effect_claim_allowed: false`를 기록하며
효능 근거가 없다는 이유로 구조 차별점까지 제외하지 않는다.

Image job은 `visual_contract`에 역할, scene kind, 제품 면, 사용 맥락, 조명, 배경,
제품 점유율, 인접 job과 다른 차별화 목표를 가진다. Hero와 핵심 기능은 후보 2개
이상이고 전체 image set은 실제 사용 맥락을 포함한다.

GIF brief는 구매 질문, 기능 부위, T1~T10 템플릿, 정보 전달 방식, pattern ID,
시작·중간·끝 정보 상태, visible delta, decorative-overlay-only 금지, 배경 대비,
1초 내 답, 780 canvas, FPS, 길이,
GIF/animated WebP 형식, placement scale, MR effect binding과 reference/rule packet
digest를 가진다. 인접 pattern 중복은 명시적 사유 없이는 실패한다.

`sales_motion_pipeline`은 32장 단일 동시 생성의 논리 샷 그룹, 3~5개 anchor set,
8~15개 자산 선별과 metadata, 0.85/0.60 콜아웃 fallback, T1~T10 catalog,
결정론적 MP4→FFmpeg GIF/WebP 파생 계약을 가진다.

승인 plan을 G2/G3 frontier에 전달하면 `COMMERCIAL.md`, `DESIGN.md`,
`BUYER-JOURNEY.md`, `GIF.md`를 plan digest에서 결정적으로 물질화한다. 빈 template,
`{{TOKEN}}`, source field가 없는 문서는 G1 완료로 보지 않는다.

## Plan-once fast path

다음 조건이 모두 참이면 수동 차단은 `G1U_APPROVAL` 한 번만 남긴다.

1. fresh `identity.photo_set`의 모든 materialized member가 project root의
   `input/product/` 아래 regular file이다.
2. member별 `size_bytes > 0`과 SHA-256이 실제 bytes와 일치한다.
3. G1 ProductionPlan과 G1 QA가 통과했고 `G1U_APPROVAL` receipt가 사용자의
   approval channel을 가진다.

G1 전 `G0U_APPROVAL`, `G1DQ_SELECTION`과 G1 후
`G2S_CONFIG_APPROVAL`, `G2U_APPROVAL`, `G3V_PREVIEW_APPROVAL`,
`G3U_APPROVAL`, `G4U_APPROVAL`, `G5U_APPROVAL`은 ready가 된 순간
`policy.approval.plan-once-with-actual-photos.v1`로 자동 승인한다. 각 자동
receipt는 nonce, exact subject artifact-set digest, stage, 정책 ID, 원본 사진
검증과 G1 승인 계보를 기록한다. 원본 사진이 없으면 모든 기존 수동 gate가 그대로
동작한다.

Auto approval은 ready stage에만 적용한다. 파일·identity·claim/evidence·motion
semantic·reference QA·public animation closure·CDN 원격 검증 실패와
plateau/budget 판단은 성공으로 바꾸지 않는다.

## G4 Studio 서버 오케스트레이션

Studio production 경로는 다음 서버 API를 순서대로 사용한다.

1. `POST /api/v1/studio/working/import`는 WorkflowEngine inspect를 다시 수행하고
   ready `S1_STUDIO_WORKING`과 exact fresh `G4A_ASSEMBLY`
   `page.html_revision` ID/manifest SHA-256을 확인한다. sealed session은
   `<project>/.detail-page/workflow/studio-sessions/<session-id>.json`에 저장된다.
2. `POST /api/v1/studio/working/save`는 `status: working`과 exact
   `expected_working_snapshot_digest`가 맞을 때만 HTML과 editable contract를
   함께 저장한다. save snapshot을 최신 source revision으로 봉인하고
   `output/detail-page.html` 단일 진입점을 같은 저장 사건에서 갱신한다.
   이전 bytes는 `.detail-page/backups/`에 보존하고 최근 20개만 유지한다.
   저장 뒤 실제 section bottom과 scrollHeight가 다르면
   실패하고 이전 bytes로 복원한다. 성공 상태는 `wing_export_required`다.
3. `POST /api/v1/studio/commit`은 새 편집 원본을 만들지 않는다. import 이후
   workflow digest와 save snapshot이 그대로이고, 현재 working subject를
   평가한 pre-commit RubricResult가
   97/90/85/hard-0을 통과할 때만
   `<project>/.detail-page/workflow/revisions/<revision-id>/`에 내부 immutable
   revision을 만든다.
   `studio.committed_revision`과 `page.html_revision`은 materialized
   ArtifactRecord로 commit되고
   `<project>/.detail-page/qa/captures/<revision-id>/`의 390 authoring, 780
   delivery, 숨은 320/360 overflow BrowserCapture work order가 발급된다.
4. `POST /api/v1/studio/capture/complete`는 실제 PNG bytes·viewport 크기·overflow·
   stable frame·recording, exact capture ID set, exact immutable revision
   subject를 검증한다. post-commit RubricResult와 immutable baseline의
   RubricDelta를 만든 뒤 `WorkflowEngine.recordRubricIteration`을 호출한다.
   `RubricPublishReady`이고 G4Q artifact·ValidationReceipt commit도 일치할 때만
   `workflow-advance`로 `G4U_APPROVAL`을 ready로 만든다. Plan-once run은 exact
   policy receipt로 자동 승인하고 그 외 run만 사용자 challenge를 연다.

Mutable working은 다음 단계 입력이 아니며 session seal, imported graph digest,
revision seal, capture work order 중 하나라도 바뀌면 중단한다.

## G4 rubric과 repair

Commercial, Evidence, Identity, Visual, Motion, Technical QA agent는 동일한
390 authoring·780 delivery와 숨은 320/360 overflow capture set을 읽으며 가능한
검사를 병렬 실행한다. coordinator, producer, evaluator session은 서로 달라야
한다. RubricAggregator가 결과를 합치고 RepairPlanner가 제안하면
RepairScopeResolver가 수정 가능한 artifact와 보호 artifact를 결정한다.

```sh
node scripts/detail-page.mjs workflow-rubric-record --project "<project-path>" --project-id "<project-id>" --input-digest "<sha256>" --result "<rubric-result.json|JSON>" --evaluator-session "<evaluator-session-id>" --budget "<run-budget.json|JSON>" --scope "<full_page|section>"

node scripts/detail-page.mjs workflow-rubric-status --project "<project-path>" --project-id "<project-id>" --input-digest "<sha256>"
```

`--budget`을 생략하면 `{ "state": "AVAILABLE" }`, `--scope`를 생략하면
`full_page`다. `workflow-rubric-record`는 exact fresh graph subject/evidence를
검증하고 comparable 이전 결과가 있으면 RubricDelta를 만든다. 비교 가능성은
동일 subject lineage, rubric SHA-256뿐 아니라 `benchmark_sha256`과 evaluator
set의 exact fingerprint까지 요구한다. fingerprint는 evaluator별
`evaluator_id`, `validator_kind`, `code_sha256`, `model_id`,
`prompt_sha256`을 포함하며 하나라도 다르면 delta 비교를 거부한다.

결과·delta·transition은 sealed state의 `repair_loop`에 누적되고,
`qa.repair_transition`은
`.detail-page/workflow/artifacts/<project-key>/<artifact-key>.json`의 immutable
ArtifactRecord와 ExecutionReceipt·structural ValidationReceipt로 남는다.
`workflow-rubric-status`는 이 persistent 상태를 읽는다.

- claim/evidence·rights 실패는 G1과 모든 descendant를 재검수한다.
- identity 실패는 해당 image와 연결 GIF/section만 되돌린다.
- motion 실패는 해당 HyperFrames project/GIF/section만 되돌린다.
- copy·layout·overflow는 해당 HTML section부터 다시 검사한다.
- 실패가 repair 가능하면 `RubricRepairScheduled`가 mutation root와 descendant만
  stale/reset/reopen한다. 통과하면 `RubricPublishReady`, full-page 3회 또는
  section 2회 소진, recurring issue count 2, 최근 두 번의 개선이 각각 2점 미만,
  budget blocked이면 `RubricAwaitUser`다. stop reason은
  `PLATEAU_AWAITING_USER` 또는 `BUDGET_AWAITING_USER`이며 이 상태를 완료로
  간주하지 않는다.

## 공통 sealed G5 export gate

`POST /api/v1/exports/html`과 `POST /api/v1/exports/coupang-wing`은
`studio-v1-server.mjs`의 같은 서버 gate를 통과한다. 다음을 모두 만족해야 한다.

- pending 0, required 미승인 0
- verified workflow state seal, stale artifact 0
- `G5U_APPROVAL: approved`와 exact subject digest에 묶인 사용자 또는 plan-once
  policy의 verified
  `decision.publish_approval`
- 정확히 하나의 fresh `G5_PUBLISH_QA` `qa.validation_receipt`와 실제 immutable
  record bytes
- `verdict: PASS`, score 97 이상, `behance_quality_score` 90 이상,
  `critical_dimension_min_score` 85 이상,
  `deterministic_hard_failure_count: 0`, `hard_failures: []`
- `detail-page-flow-v1` order·count·pain/solution·motion coverage hard failure 0

일반 HTML export는 gate 이후 WorkflowEngine을 다시 inspect하여 모든
materialized member를 재해시하고, 정확히 하나의 fresh immutable Studio revision
seal과 editable source bytes를 검증한다. staging에서
`output/detail-page.html`, `output/media/`, `output/export-manifest.json`을 만든
뒤 같은 graph/approval/G5 QA proof를 다시 확인하고 현재 파일을 원자적으로
덮어쓴다. Wing도 같은 gate 뒤 Browser Harness exporter를 실행한다. 매 실행은 새
`export_id`와 `{cdn_root}/{project_key}/{export_id}/` namespace를 사용하며 결과는
`<project>/output/wing/<export-id>/`, job receipt는
`<project>/.detail-page/workflow/jobs/<export-id>.json`에 둔다. 원격 URL의
HTTP·MIME·size·hash 검증을 통과한 뒤에만 `wing_export_required`를 해제한다.
Wing HTML은 `output/wing/<export-id>/detail-page.html`에 확정하며 Studio
Save가 만든 `output/detail-page.html`을 덮어쓰지 않는다.

일반 HTML staging은 저작본의 `data-motion-src`를 실제 공개 `<img src>` animation
참조로 승격한 뒤 sanitizer를 적용한다. 그 다음 public DOM의 animation 참조,
export manifest, `output/media/gifs` bytes, 실제 frame count 2+를 1:1로 닫는다.
Poster-only 결과나 plan motion 수보다 공개 animation 수가 적은 결과는 원자적
publish 전에 실패하고 이전 output으로 rollback한다.

## 실행 시간 계층

- `smoke`: 계약·sanitizer·reference profiler 같은 빠른 결정적 검사
- `member`: 변경된 image/GIF와 실제 descendant만 생성·검증
- `final-export`: 승인된 immutable member를 재사용해 실제 공개 HTML/Wing의
  DOM·manifest·bytes·780 capture를 검증

G2/G3 aggregate lease는 허용하지 않는다. 각 image/motion item은 하나의 frontier
WorkOrder, 단계별 time budget, 60초 heartbeat 정책을 가지며 장기 실행은 heartbeat
없이 완료 처리할 수 없다.

## 학습 maintenance 실행

`new`, `adopt`, `start`, `workflow-advance`, `workflow-resume`는 Knowledge freeze
전에 프로젝트의 단일 평면 `<project>/.detail-page/exps/*.md`를 먼저 동기화한다. 파일을 `<project>/.detail-page/exps/`에
두고 각 블록에 `scope: shared`, `promotion: auto`를 기록한 행위는 해당 블록에
대한 standing authorization이다. 따라서 아래 일반 learning intake와 달리 별도
승격 명령이나 매 규칙 사용자 승인을 다시 요구하지 않는다.

자동 승격도 무조건 반영하지는 않는다. 프로젝트 상대 evidence의 실제 SHA-256,
서로 다른 producer/reviewer session과 run, export 후 public-output QA, 기준 비교
또는 사용자 승인, source별 품질 조건, 상품명·고유 카피·URL·경로 제거를 모두
통과해야 한다. 같은 제작 run의 자체 점수는 승격 근거가 아니다. 실패 블록은 active
reference를 바꾸지 않고
`<project>/.detail-page/learning/exps/quarantine/*.json`에 기록한다. 성공 receipt와 reference
snapshot은 폴더를 항목별로 늘리지 않고
`<project>/.detail-page/learning/exps/promotions/<item-sha256>.{json,md}`에 평면 저장한다.

- Behance 조사는 검색 페이지 자체가 아니라 서로 다른 실제 프로젝트 3개 이상의
  반복 정보 구조를 `commercial-research`로 기록하고 CR에 보낸다.
- HeyGenFrame/HyperFrames의 motion·frame 검증은 `frame-production`으로 MR에
  보낸다.
- HeyGenFrame Studio의 편집 흐름·레이아웃 UX는 `completed-result`,
  `category: studio`로 TR에 보낸다.
- 조사/run별 Markdown 파일은 분리하되 `<project>/.detail-page/exps/` 아래 source별 하위 폴더는 만들지
  않는다. 한 파일에 여러 `EXP-*` 블록을 둘 수 있다.

Learning intake의 `source_type`에 따라 `LearningPipelineExecutionAdapter`가 다음
고정 순서만 계획한다.

| source | allowlisted action sequence |
| --- | --- |
| `behance` | `refresh-behance → distill → status` |
| `motion` | `refresh-hyperframes → distill → status` |
| `feedback` | `distill → status` |

계획에 봉인되는 실제 argv 형태는 다음과 같다. `<node>`는 현재
`process.execPath`이며 macOS·Ubuntu·Windows에서 같은 Node 진입점을 쓴다.

```text
<node> <skill-root>/scripts/maintenance/refresh-browser-study.mjs
  --kind behance --project <project-root> --max 12

<node> <skill-root>/scripts/maintenance/refresh-browser-study.mjs
  --kind hyperframes --project <project-root> --max 24

<node> <skill-root>/scripts/maintenance/distill-learnings.mjs
  --root <project-root>
  --source <project-root>/.detail-page/learning/behance/reviewed.md
  --source <project-root>/.detail-page/learning/gif/reviewed.md
  --output <project-root>/.detail-page/learning/candidates.md

<node> <skill-root>/scripts/maintenance/learning-status.mjs
  --project <project-root> --json
```

adapter는 shell 없이 skill root cwd에서 spawn하며 action/script path, script와 input
SHA-256, fixed env key set, argv, timeout, root binding을 실행 직전에 재검증한다.
command별 exit/timeout/spawn 상태와 stdout/stderr hash, output hash set은
ExecutionReceipt와 structural ValidationReceipt에 남는다. 최종 위치는
`<project>/.detail-page/learning/runs/<plan-id>.receipt.json`, status materialization은
`<project>/.detail-page/learning/runs/<plan-id>.status.json`, 후보는
`<project>/.detail-page/learning/candidates.md`다. 같은 plan은 현재 output hash가 같을 때만
idempotent reuse한다. 실행 전 active `references/commercial.md`, `taste.md`,
`motion.md`를 snapshot하고 실패·timeout·활성 파일 변조 시 정확한 bytes로
rollback한다. PASS receipt를 intake에 연결한 뒤에도 sanitize→독립 review→
promotion은 별도이며 사용자 승인 전 활성 규칙을 수정하지 않는다.

마지막 문장의 사용자 승인 조건은 일반 project learning candidate에만 적용한다.
검증된 `<project>/.detail-page/exps/` 블록은 위 standing authorization 예외를 적용한다.

## 프로젝트 경계

프로젝트는 다음 활성 경로만 사용한다.

프로젝트 루트의 허용 directory는 `input/`, `output/`, `.detail-page/`,
`.migration-archive/`뿐이다. `README.md`, `project.json`, `.DS_Store` 외의 루트
파일과 다른 directory는 validation 오류다. 아래 트리는 가능한 경로를 설명하며
새 프로젝트에서 모두 미리 만들지 않는다. `input/product/`,
`output/detail-page.html`, `.detail-page/authoring`과 최소 상태만 시작 시 만든다.
evidence·generation·workflow·planning·backups·research·QA·export job은 실제
첫 write에 lazy-create한다. Studio runtime은 설치된 스킬에서 직접 제공하며 상품
프로젝트 안에 복제하거나 생성하지 않는다.

```text
<project>/
├─ input/
│  ├─ product/                사용자 실제 제품 사진(선택)
│  └─ source/                 intake가 옮겨 온 원본 압축본·중복 원본
├─ output/
│  ├─ detail-page.html        현재 고객 진입점
│  ├─ media/{images,gifs}/
│  └─ wing/<export-id>/       780 WebP stack·manifest·Wing HTML
└─ .detail-page/
   ├─ backups/                최근 저장 20개
   ├─ evidence/               공급처·시장 원본과 locator
   ├─ research/               상품 전용 조사
   ├─ generation/
   │  ├─ ssot/
   │  ├─ pending/
   │  ├─ approved/
   │  ├─ rejected/
   │  └─ hyperframes/{projects,renders}/
   ├─ planning/
   ├─ workflow/
   │  ├─ <project-id>.json
   │  ├─ artifacts/
   │  ├─ receipts/
   │  ├─ staging/
   │  ├─ revisions/
   │  └─ jobs/
   └─ qa/{reports,captures}/
```

`deliverables/`, 공개 `index.html`, 복수형 프로젝트 루트 `assets/`와 다른
프로젝트·저장소의 파일 경로를 참조하지 않는다. 레거시는
`scripts/maintenance/migrate-legacy-asset-root.mjs`의
dry-run digest·one-time nonce를 사용자가 승인한 뒤에만 이동한다. 원본은 삭제하지
않고 `.migration-archive/<preview-digest>/assets/`에 복구용으로 보존한다.

## 주장 연결

공개 주장은 최소한 다음 연결을 가진다.

```text
claim_id → fact_id → evidence_asset_id → section_id
         → image_job_id / gif_brief_id → approved media artifact
         → editable HTML data-claim-id
```

부품 단위 분석이 필요하면 `component_id`를 `claim_id`와 `fact_id` 사이에 넣는다.
`fact_id`는 검증된 제품 사실 또는 출처·원문·조건이 고정된
`MANUFACTURER_CLAIM`만 허용한다. 제조사가 제공하지 않은 온도·비율·시간·시험
조건은 생성하지 않는다.

## 중단 조건

- 원본과 locator 없이 제품 사실을 확정해야 하는 경우
- 실제품과 생성 결과의 실루엣·부품·수량·문자·방향이 충돌하는 경우
- 사용자 승인 없이 pending 자산을 조립해야 하는 경우
- 프로젝트 밖 파일에 의존해야 하는 경우
- 최종 화면에 제작 메타데이터나 출처 없는 주장이 남는 경우
- 공급처 same-SKU media가 없는데 제품 이미지를 생성해야 하는 경우
- detail-page-flow-v1의 순서·1:1·count·motion coverage가 실패한 경우
- 기존 CDN export namespace를 덮어써야 하는 경우
