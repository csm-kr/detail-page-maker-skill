# 연구·피드백 학습과 규칙 승격

학습 규칙의 Git 정본은 세 파일뿐이다.

| 학습 입력 | 임시 저장 | 검증 뒤 실제 업데이트 |
| --- | --- | --- |
| Behance 상세페이지 조사 | `.workspace/learning/behance/{inbox,reviewed}.md` | `commercial.md` |
| 실제 공개 상품 상세페이지 조사 | `<project>/.detail-page/research/` | 현재 `COMMERCIAL.md`, 검증 뒤 `commercial.md` |
| HyperFrames 공식 예제·모션 패턴 조사 | `.workspace/learning/gif/{inbox,reviewed}.md` | `motion.md` |
| 실제 제작 중 디자인·카피·레이아웃 피드백 | `<project>/.detail-page/planning/LEARNINGS.md` | `taste.md` |
| 실제 제작 중 GIF·모션·크롭 피드백 | `<project>/.detail-page/planning/LEARNINGS.md` | `motion.md` |
| G5 완성 결과·검증된 조사·frame 제작 경험 | `<workspace>/exps/*.md` | route에 따라 `commercial.md`·`taste.md`·`motion.md` |

`learning.md`는 운영 절차만 설명한다. 규칙을 중복 저장하지 않는다.

현재 상품을 위해 수집한 공급처·쿠팡·실제 공개 상세페이지의 근거와 구매 질문은
해당 프로젝트 기획에 즉시 적용할 수 있다. 다른 상품에도 자동 상속하는 공용 규칙은
독립 검증과 사용자 승인을 통과해 active reference로 승격된 것만 쓴다.
사용자가 workspace의 `exps/`를 trusted drop으로 선택한 경우에는 파일 배치와
`promotion: auto`가 standing approval 역할을 한다. 이 예외도 evidence bytes/hash,
독립 reviewer, 품질 기준과 sanitize를 통과해야 한다.

## 0. 완성 결과 Trusted Experience

`exps/` 아래에 하위 track 폴더를 만들지 않는다. 한 연구 묶음 또는 한 완성 run마다
Markdown 하나를 만들고 같은 원천에서 나온 여러 원자 경험은 그 파일의 여러
`EXP-*` 블록으로 둔다.

| 경험 | source_kind/category | 승격 |
| --- | --- | --- |
| Behance 상세페이지 반복 관찰 | `commercial-research` | CR |
| HeyGenFrame motion·frame 구현 | `frame-production` | MR |
| HeyGenFrame Studio 편집·저장 UX | `completed-result`, `studio` | TR |
| 완성 상세페이지 디자인·카피 피드백 | `completed-result` 또는 `user-feedback` | TR |
| GIF·crop·timing 사용자 피드백 | `user-feedback`, `gif|motion|animation` | MR |

Behance 검색 페이지는 후보 index일 뿐 승격 evidence가 아니다. 서로 다른 실제
프로젝트 3개 이상을 열어 반복되는 `message_intent`, `purchase_flow`,
`evidence_boundary`만 일반화한다. 작품의 이미지·고유 카피·색·레이아웃 조합은
승격하지 않는다.

HeyGenFrame은 motion/frame과 Studio UX를 같은 규칙으로 섞지 않는다. motion은
strict frame-check, 첫·중간·끝 프레임과 반복 경계 evidence를 요구하고 MR로
보낸다. Studio의 편집·스냅·저장·복구·overflow 경험은 완성 결과의 QA evidence와
함께 TR로 보낸다.

완성 결과 경험은 publish 97·Behance 90·critical 85·hard failure 0과 실제 evidence
파일 2개 이상뿐 아니라 export 후 `public_output_qa: PASS`, 생산 run과 다른
`qa_run_id`, `reference_comparison: PASS` 또는 `user_approval: true`를 요구한다.
Frame 경험도 같은 public-output/독립 run 경계를 지킨다. 같은 제작 run의 자체
점수만으로 그 run을 성공 exemplar나 CR/TR/MR 승격 근거로 사용할 수 없다.
Commercial research는 서로 다른 사례 3개 이상, frame 경험은 strict frame-check
PASS와 evidence 2개 이상을 요구한다. 모든 evidence 경로는 workspace 상대 경로이고
기록한 SHA-256과 실제 bytes가 같아야 한다.

```text
exps/*.md 감지
→ source_kind/category route
→ evidence bytes/hash 및 품질 검증
→ 상품명·URL·경로·고유 카피·색상 sanitize
→ producer/reviewer session 분리
→ CR/TR/MR insert 또는 명시 supersedes update
→ atomic active reference 교체
→ .workspace/learning/exps/promotions/ flat receipt
```

동일 bytes는 receipt와 현재 rule row hash가 같을 때만 idempotent reuse한다. 실패한
항목만 `.workspace/learning/exps/quarantine/`에 flat JSON receipt로 남기고 같은
문서의 통과한 sibling 경험은 유지한다. 원본 Markdown은 삭제하거나 이동하지 않는다.

## 1. Behance·실제 상세페이지 → commercial.md

```text
Browser Harness 조사
→ Browser Harness 녹화 원문 + .workspace/learning/behance/inbox.md
→ reviewed.md에 반복 관찰만 LEARN 후보로 작성
→ candidates.md로 증류
→ 세 사례 이상 + 다른 상품 또는 회귀 테스트로 검증
→ 작품 고유 표현과 URL 제거
→ commercial.md의 CR 규칙 추가 또는 갱신
→ active KnowledgeSnapshot 갱신
```

수집은 후보만 만들며 `commercial.md`를 자동 수정하지 않는다. Behance는 판매
성과나 제품 사실의 근거가 아니므로 시각·정보 구조 원리만 학습한다.

현재 상품의 조사 agent는 `pain`, `message_intent`, `purchase_flow`,
`evidence_boundary`를 프로젝트 research artifact로 남긴다. Planning agent는 이
artifact와 G0 SSOT를 함께 읽되 작품 고유 문장·레이아웃·이미지를 복사하지 않는다.
Commercial·Visual·Technical research reviewer는 서로 다른 agent session으로
후보를 검수한다.

### Category reference library의 점진 확장

활성 category cohort는
`policies/category-reference-library-v1.json` 한 곳에서 관리하고 상품 프로젝트에
reference HTML·Behance 자산·카드를 복제하지 않는다. 새로 검증한 좋은 작품은 기존
archetype의 reference card 후보로 먼저 추가한다. 별도 archetype은 서로 다른 상품
3개 이상과 완성 프로젝트 3개 이상에서 기존 archetype으로 설명되지 않는 구매
서사·시각 증명 방식이 반복되고 독립 review가 PASS할 때만 만든다.

```text
공개 프로젝트 후보 확인
→ 실제 프로젝트 페이지와 motion locator 검증
→ 기존 6 archetype 중 하나에 우선 배치
→ reference card의 traits·motion patterns·적용 target 기록
→ 회귀 fixture에서 cohort 선택과 six-dimension 비교 검증
→ library version·hash 갱신
→ 3상품·3완성본 반복이 쌓인 경우에만 새 archetype 검토
```

한 작품의 고유 색·카피·이미지·레이아웃을 복사하지 않는다. reference card가 주는
것은 관찰 trait와 비교 기준뿐이며 G1 ProductionPlan은 선택한 primary cohort 카드
2개 이상을 모든 section·image job·GIF brief·public-output QA에 연결해야 한다.
`coupang-wing-detail-780.html`은 어느 카테고리의 템플릿도 아니고 공통 시각 ambition
하한만 제공한다.

## 2. 제작 피드백 → taste.md 또는 motion.md

프로젝트 `.detail-page/planning/LEARNINGS.md`의 후보는 다음 필드를 쓴다.

- `learning_id`
- `category`
- `scope`: `project-only | candidate-shared | rejected`
- `source_type`: `feedback`
- `observation`
- `evidence_paths`
- `before_after`
- `risk_if_reused`
- `next_validation`
- `owner_reference`: `taste.md`
- `updated_at`
- `promotion_status`: `local | validated | promoted | rejected`

```text
실제 제작 피드백
→ .detail-page/planning/LEARNINGS.md
→ candidates.md로 증류
→ 다른 상품 1개 이상 또는 회귀 테스트로 재검증
→ 상품 고유 정보와 원문 제거
→ 일반 시각 피드백은 taste.md의 TR 규칙 추가 또는 갱신
→ category가 gif·motion·animation이면 motion.md의 MR 규칙 추가 또는 갱신
→ 승격된 LEARN 원문 블록 삭제
```

완성 결과의 `output/detail-page.html`은 학습의 종착지가 아니라 다음 개정의
`current_output` baseline이다. 사용자 기준작은 `positive_reference`, 실패 결과는
`negative_reference`, 승인 결과는 `approved_exemplar`로 profile해 다음 G1의
ReferenceArtifactSet에 넣는다.

## 3. HyperFrames 조사 → motion.md

```text
Browser Harness로 HyperFrames 공식 저장소 조사
→ 녹화 원문 + .workspace/learning/gif/inbox.md
→ 공식 예제에서 반복되는 구현 원리만 reviewed.md에 LEARN 후보로 작성
→ candidates.md로 증류
→ 현재 GIF 1개 이상에서 strict·frame-check·첫/중간/끝 프레임 검증
→ 저장소 URL·예제 고유 카피·좌표 제거
→ motion.md의 MR 규칙 추가 또는 갱신
→ 녹화 원문, inbox.md, reviewed.md, candidates.md 삭제
```

공식 예제의 화려한 전환을 그대로 복사하지 않는다. 제품 주장과 인과가 있는
마스크·경로·슬라이드·단계·수량 패턴만 후보로 만들고 실제 제품 GIF에서 검증한다.

## 명령

Behance 후보를 수집한다.

```sh
node scripts/maintenance/refresh-browser-study.mjs --kind behance --workspace "<workspace-root>" --max 12
```

HyperFrames 공식 모션 후보를 수집한다.

```sh
node scripts/maintenance/refresh-browser-study.mjs --kind hyperframes --workspace "<workspace-root>" --max 24
```

두 경로의 후보를 한 보고서로 모은다.

```sh
node scripts/maintenance/distill-learnings.mjs --root "<projects-root>" --source "<workspace-root>/.workspace/learning/behance/reviewed.md" --source "<workspace-root>/.workspace/learning/gif/reviewed.md" --output "<workspace-root>/.workspace/learning/candidates.md"
```

현재 저장 위치·최근 수정 시각·누적 규칙 수를 확인한다.

```sh
node scripts/detail-page.mjs learning-status --workspace "<workspace-root>"
```

Trusted Experience 폴더를 초기화하고 즉시 동기화한다.

```sh
node scripts/detail-page.mjs experience-init --workspace "<workspace-root>"
node scripts/detail-page.mjs experience-sync --workspace "<workspace-root>"
```

`new`, `start`, `workflow-advance`, `workflow-resume`은 active
KnowledgeSnapshot을 만들거나 production을 계속하기 전에 같은 sync를 자동 실행한다.
`doctor`, `learning-status`, `list`, `validate`는 read-only이며 자동 승격을
실행하지 않는다.

공개 카피에서 분위기 문구와 설명 없는 장점명 반복을 검사한다.

```sh
node scripts/maintenance/validate-copy-terminology.mjs --file "<output/detail-page.html>" --brand "<제조사 또는 브랜드명>"
```

## 원문 보존과 active rule 분리

다음 조건을 모두 확인한 뒤 임시 후보를 active rule에서 분리한다.

- 새 규칙이 `commercial.md`의 `CR-*`, `taste.md`의 `TR-*`, `motion.md`의
  `MR-*` 중 올바른 정본에 존재한다.
- 규칙에는 특정 작품·상품의 URL, 카피, 색상값, 파일 경로, 스크린샷이 없다.
- 검증 기준이 표에 남아 있고 관련 회귀 테스트가 통과한다.
- `learning-status`에서 대상 규칙 수와 수정 시각이 갱신됐다.
- 원문·녹화·URL은 고객 출력과 active rule에서 제거하고 프로젝트 내부 research
  retention 정책에 따라 보존 또는 정리한다.

실패·보류 후보는 공용 규칙과 다음 생산 run의 KnowledgeSnapshot에 넣지 않는다.

## LearningPipeline maintenance 실행 경계

`LearningPipelineExecutionAdapter`는 intake가 만든 `maintenance_plan`의 shell
문자열을 직접 실행하지 않는다. 먼저 `plan()`으로 source route에 맞는 action ID와
다음 프로젝트 로컬 allowlist를 고정한 뒤, 별도 `execute()`에서 같은 계약을 다시
검증한다.

- `scripts/maintenance/refresh-browser-study.mjs --kind behance`
- `scripts/maintenance/refresh-browser-study.mjs --kind hyperframes`
- `scripts/maintenance/distill-learnings.mjs`
- `scripts/maintenance/learning-status.mjs`

각 plan은 script bytes, 입력 Markdown, `commercial.md`·`taste.md`·`motion.md`,
cwd·environment key set·args·timeout의 SHA-256을 고정한다. 실행은 shell을 사용하지
않으며 allowlist 밖 경로, symlink, 변경된 command·script·input을 spawn 전에
거부한다. 성공하면 command별 exit code와 stdout/stderr hash, 출력 Markdown과
status JSON hash set, ExecutionReceipt와 structural ValidationReceipt를 남긴다.
같은 plan은 출력 bytes가 그대로일 때만 기존 receipt를 재사용한다.

실패·timeout·output drift에서는 active reference 세 파일을 변경하지 않는다. PASS
execution과 PASS structural validation은 `attachMaintenanceExecution()`으로 exact
intake에 연결한 뒤에만 sanitize → review → promotion plan으로 전달한다. 이 연결
자체는 active reference를 수정하지 않으며 실제 승격은 기존 사용자 승인 promotion
절차를 그대로 따른다.
