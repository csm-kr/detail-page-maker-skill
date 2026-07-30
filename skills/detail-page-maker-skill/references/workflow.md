# 제작 플로우와 승인 게이트

## 전체 순서

| 단계 | 잠글 것 | 필수 산출물 | 다음 단계 조건 |
| --- | --- | --- | --- |
| 입력 | 공급처 URL, 선택적 실제품 사진, 목표 채널 | `input/product`, 프로젝트 폴더 | 공급처 same-SKU media 확인 |
| G0 SOURCE_SSOT | 제품 사실, 외형, 부품, 수량, 문자, 방향 | extractor evidence, SSOT manifest | 공급처 SSOT·선택적 실사진 사용자 승인 |
| G1 COMMERCIAL_PLAN | 고정 문제→답→해결 흐름, 주장, 증거·motion 계획 | 사람용 기획 + commercial-flow/claim/section/image/motion/rubric ProductionPlan | detail-page-flow-v1 hard-0, 양방향 참조·orphan 0, 사용자 기획 승인 |
| G2 IMAGE_ASSETS | 정지 이미지 후보와 동일성 QA | pending 이미지, QA 기록 | 사용자 이미지 승인 |
| G3 MOTION_ASSETS | 문제 2+, 장점별 1+, 사용·비교, total 5+/기본 7~9 | 승인 motion, poster, HyperFrames 원본 | coverage hard-0, preview·최종 자산 승인 |
| G4 ASSEMBLY | 승인 자산과 섹션 연결 | editable Studio source, 현재 output, 내부 revision, rubric result/delta | 390/780 부분 repair loop 통과와 사용자 조립 승인 |
| G5 PUBLISH | 공개 카피, 접근성, 채널 규격, 새 CDN namespace | `output/detail-page.html`, versioned Wing export | publish 97·Behance 90·critical 85·content hard 0·원격 검증·게시 승인 |
| 학습 | 재사용 가능성과 위험 | 임시 후보 Markdown | Behance는 commercial.md, 제작 피드백은 taste.md로 승격 후 원문 삭제 |

## G0·G1 병렬 준비

G0의 공급처 근거 정규화와 G1의 시장 조사는 병렬로 진행할 수 있다. G0가 잠기기
전의 G1 문서는 다음 상태를 명시한다.

- `g0_dependency`: 아직 잠기지 않은 제품 사실
- `provisional_claims`: 제품 답으로 확정하지 않은 가설
- `blocked_until_g0`: G0 승인 전 확정하거나 제작할 수 없는 항목

동종 제품 3개 이상과 공개 후기 원문에서 시장 불편을 조사하되 현재 SKU의 사실로
옮기지 않는다. G0 승인 전에는 G1을 `approved`로 기록하거나 이미지 생성을
시작하지 않는다. 최종 승인은 `G0 → G1 → G2 → G3 → G4 → G5` 순서다.

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
→ exact digest/nonce 사용자 승인
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
| `AWAITING_USER` | 승인, rubric plateau 또는 budget 판단 대기 | exact challenge 또는 revision plan 검토 |
| `COMPLETED` | G5 hard gate와 사용자 게시 승인까지 통과 | sealed HTML/Wing export |

과거 state에 현재 계약이 요구하는 immutable artifact record와 receipt가 없으면
`HOLD`로 낮추지 않고 `ARTIFACT_RECORD_MISSING` 오류로 중단한다. 과거 산출물에
receipt를 사후 합성하지 말고 저장된 원본 evidence bundle에서 새 workflow run을
시작한다.

## Revision plan과 선택적 재검증

승인된 실제품 photo set, G2 이미지 member, G3 GIF member를 바꿀 때는 기존 state를
직접 편집하거나 `workflow-resume`부터 실행하지 않는다. 먼저 변경 요청 JSON을
파일 또는 인라인 JSON으로 전달한다.

```powershell
node scripts/detail-page.mjs workflow-revision-plan `
  --project "<project-path>" `
  --project-id "<project-id>" `
  --input-digest "<sha256>" `
  --change "<change.json|JSON>" `
  --agent-session "<planner-session-id>"
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

```powershell
node scripts/detail-page.mjs workflow-revision-commit `
  --project "<project-path>" `
  --project-id "<project-id>" `
  --input-digest "<sha256>" `
  --plan-digest "<RevisionPlanned.plan_digest>" `
  --decided-by "<operator-id>" `
  --reason "<변경 승인 사유>" `
  --agent-session "<approver-session-id>"
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
여섯 part를 만든 뒤 한 digest로 승인한다.

1. `commercial_flow`
2. `claim_graph`
3. `section_graph_draft`
4. `image_job_set`
5. `gif_brief_set`
6. `rubric_target`

`provenance`에는 승인 product SSOT, 선택된 market snapshot/finding,
KnowledgeSnapshot의 artifact ID와 SHA-256, 적용 `CR/TR/MR` rule ID를 넣는다.
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

## G4 Studio 서버 오케스트레이션

Studio production 경로는 다음 서버 API를 순서대로 사용한다.

1. `POST /api/v1/studio/working/import`는 WorkflowEngine inspect를 다시 수행하고
   ready `S1_STUDIO_WORKING`과 exact fresh `G4A_ASSEMBLY`
   `page.html_revision` ID/manifest SHA-256을 확인한다. sealed session은
   `<project>/.detail-page/workflow/studio-sessions/<session-id>.json`에 저장된다.
2. `POST /api/v1/studio/working/save`는 `status: working`과 exact
   `expected_working_snapshot_digest`가 맞을 때만 HTML과 editable contract를
   함께 저장한다. 현재 authoring과 로컬 `output/detail-page.html` preview를
   원자적으로 덮어쓰기 전 `.detail-page/backups/`에 이전 bytes를 보존하고 최근
   20개만 유지한다. 저장 뒤 실제 section bottom과 scrollHeight가 다르면
   실패하고 이전 bytes로 복원한다. 성공 상태는 `wing_export_required`다.
3. `POST /api/v1/studio/commit`은 import 이후 workflow digest와 save snapshot이
   그대로이고, 현재 working subject를 평가한 pre-commit RubricResult가
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
   `workflow-advance`로 exact `G4U_APPROVAL` challenge를 연다.

Mutable working은 다음 단계 입력이 아니며 session seal, imported graph digest,
revision seal, capture work order 중 하나라도 바뀌면 중단한다.

## G4 rubric과 repair

Commercial, Evidence, Identity, Visual, Motion, Technical QA agent는 동일한
390 authoring·780 delivery와 숨은 320/360 overflow capture set을 읽으며 가능한
검사를 병렬 실행한다. coordinator, producer, evaluator session은 서로 달라야
한다. RubricAggregator가 결과를 합치고 RepairPlanner가 제안하면
RepairScopeResolver가 수정 가능한 artifact와 보호 artifact를 결정한다.

```powershell
node scripts/detail-page.mjs workflow-rubric-record `
  --project "<project-path>" `
  --project-id "<project-id>" `
  --input-digest "<sha256>" `
  --result "<rubric-result.json|JSON>" `
  --evaluator-session "<evaluator-session-id>" `
  --budget "<run-budget.json|JSON>" `
  --scope "<full_page|section>"

node scripts/detail-page.mjs workflow-rubric-status `
  --project "<project-path>" `
  --project-id "<project-id>" `
  --input-digest "<sha256>"
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
- `G5U_APPROVAL: approved`와 exact subject digest에 묶인 verified
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
HTTP·MIME·size·hash 검증을 통과한 뒤에만 `wing_export_required`를 해제하고
`output/detail-page.html`과 Wing HTML을 같은 CDN stack으로 갱신한다.

## 학습 maintenance 실행

Learning intake의 `source_type`에 따라 `LearningPipelineExecutionAdapter`가 다음
고정 순서만 계획한다.

| source | allowlisted action sequence |
| --- | --- |
| `behance` | `refresh-behance → distill → status` |
| `motion` | `refresh-hyperframes → distill → status` |
| `feedback` | `distill → status` |

계획에 봉인되는 실제 argv 형태는 다음과 같다. `<node>`는 현재
`process.execPath`, `<powershell>`은 플랫폼의 `pwsh` 또는 `powershell`이다.

```text
<powershell> -NoProfile -NonInteractive -ExecutionPolicy Bypass
  -File <skill-root>/scripts/maintenance/refresh-behance-study.ps1
  -WorkspaceRoot <workspace-root> -MaxProjects 12

<powershell> -NoProfile -NonInteractive -ExecutionPolicy Bypass
  -File <skill-root>/scripts/maintenance/refresh-hyperframes-study.ps1
  -WorkspaceRoot <workspace-root> -MaxSources 24

<node> <skill-root>/scripts/maintenance/distill-learnings.mjs
  --root <workspace-root>/.workspace/projects
  --source <workspace-root>/.workspace/learning/behance/reviewed.md
  --source <workspace-root>/.workspace/learning/gif/reviewed.md
  --output <workspace-root>/.workspace/learning/candidates.md

<node> <skill-root>/scripts/maintenance/learning-status.mjs
  --workspace <workspace-root> --json
```

adapter는 shell 없이 skill root cwd에서 spawn하며 action/script path, script와 input
SHA-256, fixed env key set, argv, timeout, root binding을 실행 직전에 재검증한다.
command별 exit/timeout/spawn 상태와 stdout/stderr hash, output hash set은
ExecutionReceipt와 structural ValidationReceipt에 남는다. 최종 위치는
`.workspace/learning/runs/<plan-id>.receipt.json`, status materialization은
`.workspace/learning/runs/<plan-id>.status.json`, 후보는
`.workspace/learning/candidates.md`다. 같은 plan은 현재 output hash가 같을 때만
idempotent reuse한다. 실행 전 active `references/commercial.md`, `taste.md`,
`motion.md`를 snapshot하고 실패·timeout·활성 파일 변조 시 정확한 bytes로
rollback한다. PASS receipt를 intake에 연결한 뒤에도 sanitize→독립 review→
promotion은 별도이며 사용자 승인 전 활성 규칙을 수정하지 않는다.

## 프로젝트 경계

프로젝트는 다음 활성 경로만 사용한다.

```text
<project>/
├─ input/
│  └─ product/                사용자 실제 제품 사진(선택)
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
