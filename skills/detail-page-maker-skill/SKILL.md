---
name: detail-page-maker-skill
description: 공급처 URL에서 dmk-extractor·coupang-extractor 근거를 수집하고 제품 SSOT, 고정 상업 흐름, 승인 이미지, 다수의 HyperFrames motion, 390px 편집 Studio, output/detail-page.html과 버전형 CDN 쿠팡 Wing 출력을 멀티에이전트로 만든다. 상세페이지 신규 제작·카피·제품 이미지·GIF·Studio 편집·게시 QA·부분 수정·연구 학습·로컬 설치에 사용한다.
---

# Detail Page Maker

근거가 고정된 같은 SKU만 광고하고 승인된 자산만 조립한다. 판매 흐름은
`policies/detail-page-flow-v1.json`, 실행 순서·산출물 연결·검증·승인은
persistent Orchestrator가 강제한다.

## 실행

1. 항상 [`references/content-contract.md`](references/content-contract.md)와
   [`references/workflow.md`](references/workflow.md)를 읽는다.
2. 두 문서와 충돌하는 레거시 문서·프로젝트 관행은 적용하지 않는다.
3. 아래 표에서 현재 작업에 필요한 reference만 추가로 읽는다.
4. 이 스킬 폴더의 `.agents/skills/`에서 내장 의존 스킬을 찾는다.
5. `node scripts/detail-page.mjs doctor`로 단일 스킬 번들의 의존성을 검사한다.
6. `workflow-status`로 sealed state와 다음 gate를 확인한다.
7. `workflow-advance` 또는 `workflow-resume`으로 다음 WorkOrder를 발급한다.
8. 준비된 frontier WorkOrder를 가용 sub-agent 수만큼 lease한다. 작업 하나씩
   기다리지 말고 독립 작업을 동시에 실행한다.
9. 하위 스킬은 WorkOrder의 runner로만 호출하고 결과를
   `worker-lease → 실행 → worker-submit`으로 제출한다.
10. 사용자 gate는 exact digest와 nonce를 `workflow-decide`로 승인한다.
11. `G0 → G1 → G2 → G3 → G4 → G5` 승인 순서를 건너뛰지 않는다.
12. 승인 후 사진·이미지·GIF를 바꿀 때는
   `workflow-revision-plan → 사용자 검토 → workflow-revision-commit`을 따른다.

```sh
node scripts/detail-page.mjs doctor
node scripts/detail-page.mjs workflow-status --project "<project-path>" --project-id "<project-id>" --input-digest "<sha256>"
node scripts/detail-page.mjs workflow-advance --project "<project-path>" --project-id "<project-id>" --input-digest "<sha256>"
```

나머지 CLI 인자는 [`references/install.md`](references/install.md)와
[`references/workflow.md`](references/workflow.md)를 따른다.

## 작업별 reference

| 작업 | 읽을 문서 |
| --- | --- |
| 고정 판매 흐름·입출력·공개 형식 | [`content-contract.md`](references/content-contract.md) |
| 공급처 근거·실제품·권리·SSOT | [`evidence.md`](references/evidence.md) |
| 시장 조사·상업 기획·카피 | [`commercial.md`](references/commercial.md) |
| ImageGen·pending·에셋 승인 | [`assets.md`](references/assets.md) |
| GIF·HyperFrames·필수 motion coverage | [`motion.md`](references/motion.md) |
| Studio 편집·덮어쓰기·복구 snapshot | [`studio.md`](references/studio.md) |
| 게시 QA·Wing·전달본 | [`publish.md`](references/publish.md) |
| Cloudflare owner·bootstrap·runtime integrity | [`cloudflare-security.md`](references/cloudflare-security.md) |
| 설치·진단·프로젝트 격리 | [`install.md`](references/install.md) |
| 연구·피드백·규칙 승격 | [`learning.md`](references/learning.md) |
| 디자인·어투 규칙 | [`taste.md`](references/taste.md) |
| 상태·artifact·adapter 내부 구조 | [`orchestration.md`](references/orchestration.md) |
| aisync 이미지형 flow 비교 | [`aisync-flow-comparison.md`](references/aisync-flow-comparison.md) |
| Behance 평가·부분 repair | [`behance-rubric.md`](references/behance-rubric.md) |

## 하위 스킬

의존 스킬은 이 배포 폴더의 `.agents/skills/`만 사용한다. 하위 작업을 시작하기
전에 해당 폴더의 `SKILL.md` 원문을 끝까지 읽고 그 절차를 WorkOrder 안에서
실행한다. 별도 sibling·전역 스킬을 정상 경로로 사용하지 않는다.

- 공급처 근거: `dmk-extractor`와 `browser-harness`
- 쿠팡 경쟁상품·상세·후기 근거: `coupang-extractor`와 `browser-harness`
- 기획·HTML: `design-taste-frontend`
- 이미지: `god-tibo-gpt-image2-skill`
- GIF: `hyperframes`, `hyperframes-core`, `hyperframes-animation`,
  `hyperframes-creative`, `hyperframes-cli`, `motion-graphics`

하나라도 누락되면 불완전한 배포본이므로 실행하지 않고 Git 원본에서 이 스킬
하나를 다시 설치하거나 업데이트한다. 이미지 작업은 내장 God Tibo의
`scripts/tibo-batch.mjs`만 사용하고 작업 단위는 8개 `items`로 명시한다.

## 멀티에이전트 실행

- G0 공급처 추출과 G1 시장 조사를 병렬 준비한다. 승인만 G0→G1 순서로 잠근다.
- G2는 한 이미지 cut당 한 worker를 배정하고 가용 slot을 채운다.
- G3는 한 motion module당 한 worker를 배정한다. 입력 이미지가 승인된 module은
  다른 이미지·motion과 병렬 실행한다.
- Commercial·Evidence·Identity·Visual·Motion·Technical QA는 서로 다른
  validator session으로 병렬 실행한다.
- 생산 agent가 자기 결과의 유일한 검수자가 될 수 없다.
- 실패 member와 실제 descendant만 다시 실행하고 통과한 형제 산출물은 재사용한다.
- artifact ID, 입력 digest, 실제 출력 위치, 다음 consumer, ExecutionReceipt,
  독립 ValidationReceipt가 하나라도 없으면 완료로 세지 않는다.

## 하드 계약

- 공급처 URL과 같은 SKU의 공급처 원문·이미지·locator·권리로 G0 제품 SSOT를
  잠근다. 실제 제품 사진은 선택 사항이며 없으면 최초 한 번만 알리고 계속한다.
- 도매꾹은 `dmk-extractor`, 쿠팡은 `coupang-extractor`의 실제 portable bundle과
  검증 receipt를 사용한다. agent의 기억이나 검색 요약으로 대체하지 않는다.
- 공급처 이미지는 제품 동일성 SSOT와 ImageGen 참조로 사용하고 고객 광고에
  원본을 직접 싣지 않는다. 쿠팡·Behance 자산은 research-only다.
- G0 근거와 G1 시장 조사는 병렬 준비할 수 있지만 최종 승인은 순차로 한다.
- 공개 주장은 `claim → fact → evidence → section → media/HTML`로 추적한다.
- 확인되지 않은 효능·수치·후기·시험 결과를 만들지 않는다.
- `Hero → 불편 → 제품 답 → 해결 → 사용 → 비교 → 선택 → 사양·주의 → FAQ →
  리마인드` 순서를 지킨다.
- Hero는 화려한 정적 화면, 제품 최대 크기, 핵심 장점 한 개로 제한한다.
- 불편 인용 말풍선은 3~5개, 문제 motion은 2개 이상이며 각 불편은 같은 순서의
  해결 장점에 1:1로 연결한다.
- 해결 장점은 3~5개이며 각각 정지 이미지·전용 motion·검증 근거·무기명 체감
  의견을 갖는다.
- motion hard floor는 5개지만 필수 역할을 적용한 실제 최소는 7개이며 기본
  범위는 7~9개다. 시간 변화가 더 명확하면 상한 없이 늘린다. 문제 2+, 해결
  장점별 1+, 사용 1+, 비교 1+ 역할을 빠뜨리지 않는다.
- 기획은 `policies/detail-page-flow-v1.json`의 deterministic validator를
  통과하기 전 G2 WorkOrder를 받을 수 없다.
- 각 artifact에 exact input digest, ExecutionReceipt, 독립
  ValidationReceipt와 immutable record를 남긴다.
- materialized member는 inspect·advance·resume·export 때 실제 bytes를 다시
  해시한다. 누락·변조·경로 이탈·symlink는 fail-closed한다.
- worker는 staging에만 쓴다. Orchestrator만 검증 후 state와 artifact graph를
  commit한다.
- 이미지·GIF는 `pending`에서 시작하고 승인된 member만 조립한다.
- 이미지 job은 one-cut-per-worker로 실행하고 실패 member만 재시도한다.
- 판매 본문·사양·시험 조건·주의사항의 편집 정본은 Studio HTML section이다.
- 디자인 기준은 390 CSS px, 전달 자산은 폭 780px다.
- 명시적 저장은 현재 `output/detail-page.html`을 덮어쓰고 콘텐츠 높이에 맞춘다.
  내부 복구 snapshot은 최근 20개만 유지한다.
- 고객 진입점은 `output/detail-page.html`이다. `deliverables/`와 공개
  `index.html`을 만들지 않는다.
- Wing Export마다 새 `{project_key}/{export_id}/section-NN.webp` CDN 경로를
  만들고 이전 경로를 덮어쓰지 않는다.
- 고객 HTML과 Wing에는 내부 ID·프롬프트·파일명·hash·QA·agent·생성 방식이
  0건이어야 한다.
- 현재 run은 승인된 KnowledgeSnapshot과 현재 상품 연구를 사용한다. 공용 규칙은
  독립 검증과 사용자 승인 뒤에만 다음 run의 active reference로 승격한다.

## 완료

일반 HTML과 쿠팡 Wing은 같은 서버측 G5 gate를 사용한다. fresh artifact graph와
state seal, 게시 QA 97 이상, Behance quality 90 이상, critical dimension 85 이상,
content-flow hard failure 0, fresh G5 QA record, 사용자 게시 승인, versioned CDN
원격 검증을 모두 확인한 뒤에만 완료로 보고한다. plateau·budget 대기 또는
근거·권리 부족 상태는 완료가 아니라 `HOLD`다.
