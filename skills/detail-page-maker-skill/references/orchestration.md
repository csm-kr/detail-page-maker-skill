# Orchestration 구조

이 문서는 상태·artifact·adapter·runtime 내부 구조를 수정하거나 진단할 때만 읽는다.
일반 제작 순서는 [`workflow.md`](workflow.md)를 따른다.

## 목차

1. 상태 변경 경계
2. WorkOrder 생명주기
3. 모듈 책임
4. 저장 구조
5. Revision과 repair
6. Studio와 export 경계
7. Agent capacity와 저장 예산

## 상태 변경 경계

`scripts/orchestration/workflow-engine.mjs`가 유일한 workflow 상태 변경
진입점이다. CLI·Studio·worker·adapter는 state JSON과 artifact graph를 직접
수정하지 않는다.

```text
CLI 또는 Studio
→ WorkflowEngine
→ WorkOrder
→ Adapter/worker staging 결과
→ ExecutionReceipt + ValidationReceipt
→ immutable ArtifactRecord
→ sealed state commit
```

## WorkOrder 생명주기

```text
advance/resume
→ 준비된 frontier 계산
→ worker capacity만큼 worker-lease / leaseFrontier
→ heartbeat
→ adapter 실행
→ worker-submit
→ 구조·의미 검증
→ graph commit 또는 거부
```

WorkOrder는 input artifact set digest, output type, skill·adapter ID, staging root,
agent session, attempt, lease expiry, fencing token과 budget을 고정한다. lease가
만료되면 같은 exact input으로만 재할당한다. 이전 token의 늦은 제출은 거부한다.

### 병렬 frontier 강제

`parallel-frontier.mjs`는 현재 ready stage와 승인된 ProductionPlan을 읽어
다음 작업을 결정적으로 item 단위로 만든다.

- S0 뒤 `G0A_SUPPLIER`, `G0B_PHOTO`, `G1D_DISCOVERY`,
  `G1B_KNOWLEDGE`를 동시에 준비한다.
- G2는 `image_job_set.jobs`의 candidate member 32개를 각각 식별하되 God Tibo
  adapter가 하나의 `items: 32`, `workers: 32` provider batch로 실행한다.
  provider worker는 Codex agent session이 아니며 8×4 순차 batch를 만들지 않는다.
- G3는 `gif_brief_set.briefs`의 motion module 하나를 worker 하나에만 배정한다.
  `product_reference` source motion은 G2와 병렬 가능하고,
  `approved_image_job` source는 해당 image approval receipt가 준비된 뒤에만
  frontier에 들어온다.
- G4 QA는 `commercial`, `evidence`, `identity`, `visual`, `motion`,
  `technical` lane을 서로 다른 agent session에 배정한다. Studio·HTML 생산자
  session은 이 QA lease를 받을 수 없다.
- active lease의 `work_item_id`와 같은 item은 다시 발급하지 않는다.
- retry frontier는 실패 member와 그 member의 명시된 descendant만 포함한다.
  통과한 형제 member는 다시 실행하거나 hash를 바꿀 수 없다.

모든 frontier WorkOrder는 `expected_artifact_id`, `exact_input_digest`,
`output_locator`, producer session, `ExecutionReceipt` 요구,
독립 `ValidationReceipt` 요구를 봉인한다. `production-plan.mjs`의
policy-driven commercial-flow validator를 먼저 통과하지 못하면 G2/G3 item을
한 건도 만들지 않는다.

`WorkflowEngine.leaseFrontier`는 현재 stage frontier를 실제 persistent lease로
바꾸며 active worker를 포함해 지정 capacity를 넘지 않는다. `lease` 자체도
semantic QA 대상 artifact의 producer와 같은 session이면
`PRODUCER_SELF_QA_FORBIDDEN`으로 거부한다.

CLI의 `workflow-advance`는 G2/G3 frontier가 준비되면
`parallel-dispatcher.mjs`를 반드시 거친다. 디스패처는
`planParallelFrontier`를 먼저 호출하고, 반환된 `work_orders`를
`WorkflowEngine.leaseFrontier({ planned_work_items })`에 그대로 넘긴다.
이때 `--worker-capacity auto`가 기본이며 capacity 이상 개수의 실제
`--worker-sessions`, `--production-plan`, exact `--plan-approval`이 없으면
fail-closed한다.
완료된 member는 다음 계획에서 제외하고, active member는 중복 발급하지
않으며, 모든 candidate member가 commit된 뒤에만
`completeParallelFrontier`가 해당 stage를 완료한다.

`performance-profile`은 실행 trace의 순차 시간과 실제 critical path를 비교한다.
필수 최적화는 32 provider 동시 실행, 준비된 G3 즉시 시작, 성공 member cache,
실패 member 재시도, 변경 section QA, 최종 전체 캡처 1회다. 이 명령은 gate를
생략하거나 완료되지 않은 artifact를 통과시키지 않는다.

```text
workflow-advance
→ G2/G3 ready 또는 running frontier 감지
→ planParallelFrontier(exact plan + approval + persisted member 상태)
→ leaseFrontier(planned_work_items, available slots)
→ item별 worker-submit
→ 다음 advance에서 남은 member만 재계획
→ 전 member commit 확인
→ completeParallelFrontier
```

병렬 QA 집계 전에는 `validateParallelQaCompletion`을 실행한다. 여섯 lane 중
하나라도 누락되거나, session이 중복되거나, 생산자가 QA를 수행하거나,
artifact ID·exact input digest·output locator·ExecutionReceipt·독립
ValidationReceipt 중 하나라도 없으면 QA bundle digest를 만들지 않는다.

## 모듈 책임

### Public engine과 저장

| 파일 | 책임 |
| --- | --- |
| `workflow-engine.mjs` | inspect, advance/resume, worker, decide, revision, rubric |
| `workflow-definition.mjs` | G0→G5 32개 stage와 runner·gate 계약 |
| `file-state-store.mjs` | canonical state seal과 atomic persistence |
| `artifact-record-store.mjs` | immutable record와 materialized member 재해시 |
| `artifact-graph.mjs` | typed edge, input-set digest, freshness |

### 검증·수정

| 파일 | 책임 |
| --- | --- |
| `receipt-contracts.mjs` | ValidationReceipt 공통 계약 |
| `structural-validation.mjs` | producer output 구조 검증 |
| `stage-validation-policy.mjs` | G4/G5 97·90·85·hard-0 gate |
| `revision-impact.mjs` | 사진·이미지·GIF 변경의 선택적 stale/reset |
| `repair-loop-controller.mjs` | rubric delta, repair scope, plateau/budget stop |
| `rubric-loop.mjs` | rubric result·delta·publish/stop 정책 |
| `run-budget.mjs` | 비용·provider concurrency 예약과 정산 |

### 근거·기획·학습

| 파일 | 책임 |
| --- | --- |
| `g0-normalization.mjs` | 공급처·실제품 근거를 제품 SSOT로 정규화 |
| `rights-policy.mjs` | 공급처 member별 제작 권리 판정 |
| `market-evidence.mjs` | 경쟁상품 후보·선택·bundle import와 QA |
| `dependency-closure.mjs` | 프로젝트 로컬 skill 선언·잠금·설치 검사 |
| `knowledge-snapshot.mjs` | CR/TR/MR·rubric·dependency hash 동결 |
| `category-reference-library.mjs` | 상품 archetype 선택·reference cohort·시각 ambition hard gate |
| `production-plan.mjs` | claim·section·media·GIF·rubric 실행 계획 |
| `production-contracts.mjs` | 이미지·GIF·HTML·Studio 제작 계약 |
| `parallel-frontier.mjs` | G0/G2/G3/독립 QA item frontier와 capacity 배정 |
| `parallel-dispatcher.mjs` | CLI advance의 G2/G3 계획·영속 item lease·완료 연결 |
| `storage-paths.mjs` | canonical `.detail-page/workflow/` 저장 위치 |
| `learning-pipeline.mjs` | 연구·피드백 후보의 검수·승격 경계 |

### Adapter

`scripts/orchestration/adapters/`는 외부 스킬·프로세스·runtime 경계다.
Adapter는 exact ResultEnvelope와 receipt만 반환하며 state를 변경하지 않는다.

- `dmk-bundle-adapter.mjs`
- `knowledge-freeze-adapter.mjs`
- `god-tibo-adapter.mjs`
- `hyperframes-adapter.mjs`
- `html-assembly-adapter.mjs`
- `studio-commit-adapter.mjs`
- `browser-capture-adapter.mjs`
- `learning-pipeline-adapter.mjs`
- `learning-promotion-adapter.mjs`

## 저장 구조

```text
<project>/.detail-page/workflow/
├─ <project-id>.json       sealed workflow state
├─ artifacts/              immutable output·plan·repair records
├─ revision-plans/         read-only revision envelopes
└─ studio-sessions/        sealed mutable-working sessions
```

materialized artifact는 모든 member의 root, canonical locator, size와 SHA-256을
열거한다. Engine inspect와 두 export는 record뿐 아니라 실제 bytes를 재검증한다.
새 프로젝트에는 레거시 `.detail-page-workflow/`를 만들지 않는다.

## Agent capacity와 저장 예산

`agent-capacity.mjs`는 처음 dispatch할 때 `os.availableParallelism()`과 총 RAM으로
machine worker 상한을 계산한다. CPU 상한은 `floor(cpu/2)`, RAM 상한은
`floor((GiB-2)/2)`, 전체 상한은 8이며 최소 1이다. 실제 할당은 다음 값의 최솟값이다.

```text
machine 추천
∩ host가 허용한 worker slot
∩ 실제 전달된 서로 다른 agent session 수
```

머신 자원은 실제 Codex agent session을 생성하지 않는다. host slot 또는 session
ID를 탐지할 수 없으면 이를 발명하지 않고 dispatch를 중단한다. host는
`DETAIL_PAGE_AGENT_TOTAL_SLOTS` 또는 `DETAIL_PAGE_AGENT_MAX_WORKERS`,
`DETAIL_PAGE_AGENT_SESSION_IDS`를 전달할 수 있다. 총 slot에는 coordinator 한
자리를 포함하므로 worker 상한은 `total-1`이다. `agent-capacity` 명령은 계산만
보고하며 state를 바꾸지 않는다.

폴더 수는 기능별 최상위 경계를 늘리는 방식으로 확장하지 않는다. 프로젝트 루트는
`.detail-page`, `.migration-archive`, `input`, `output`만 허용하며 단계별 내부
directory는 최초 실제 write에 lazy-create한다. 공용 경험도 단일 `exps/`에
Markdown만 두고 promotion/quarantine 기록은 각각 한 평면 directory에 저장한다.

## Revision과 repair

승인 후 변경은 `revision-plan`에서 영향 범위를 계산하고 별도 사용자 승인
`revision-commit`에서만 적용한다. member edge가 있으면 해당 member와 실제
descendant만 stale 처리하고 형제 branch와 SSOT·시장·KnowledgeSnapshot은
보호한다.

Rubric 실패는 failure owner를 G1·G2·G3·G4에 연결해 필요한 branch만 다시 연다.
같은 실패 반복, 점수 정체 또는 budget 소진은 사용자 대기 상태로 남겨 G4/G5를
차단한다.

## Studio와 export 경계

Studio는 G4 조립·사전 QA 뒤 exact session에만 여는 공용 최종 편집 UI이며 상품
프로젝트에 runtime 파일을 복제하지 않는다. working session은 mutable하지만
downstream 입력이 아니다. 명시적 Save는 G4 working source revision ID·hash만
갱신한다. commit·capture·QA는 그 exact revision을 검증·봉인하고 통과한 뒤에만
공개 `output/detail-page.html`을 만든다. 390 CSS px authoring을 DPR 2의 780 physical px로
capture하며 숨은 320·360 overflow 진단 capture와 독립 rubric 결과를 기록한다.
일반 HTML과 Wing export는 같은 서버측 G5 gate에서 state seal, fresh graph,
publish approval, G5 QA와 97·90·85·hard-0를 다시 검증한다. Wing은
`output/wing/<export-id>/` 파생본만 만들고 현재 output을 덮어쓰지 않는다.
