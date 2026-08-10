# aisyncclub 이미지형 상세페이지 flow 비교

- 조사일: 2026-07-30
- 조사 대상: `aisyncclub/detail_page_codex_skill`
- 고정 commit: `afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3`
- immutable tree: <https://github.com/aisyncclub/detail_page_codex_skill/tree/afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3>
- 적용 범위: 프로젝트 로컬 `detail-page-maker-skill`의 기획·제작·검수 workflow

이 문서는 외부 스킬의 문장이나 결과 디자인을 복사하는 문서가 아니다. 공개 원문에서 확인한 workflow 원리를 우리 artifact 계약으로 다시 표현한 비교 기록이다. 원문 코드나 고유 카피·색·서체·레이아웃을 복제하지 않는다.

## 확인한 원문

- [README](https://github.com/aisyncclub/detail_page_codex_skill/blob/afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3/README.md)
- [제작 스킬](https://github.com/aisyncclub/detail_page_codex_skill/blob/afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3/ecommerce-detail-page/SKILL.md)
- [참조 분석 스킬](https://github.com/aisyncclub/detail_page_codex_skill/blob/afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3/detail-page-reference-analyzer/SKILL.md)
- [사진 분석](https://github.com/aisyncclub/detail_page_codex_skill/blob/afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3/ecommerce-detail-page/references/photo-analysis.md)
- [스타일 템플릿](https://github.com/aisyncclub/detail_page_codex_skill/blob/afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3/ecommerce-detail-page/references/style-templates.md)
- [컷 구조](https://github.com/aisyncclub/detail_page_codex_skill/blob/afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3/ecommerce-detail-page/references/cut-structure.md)
- [이미지 제작 workflow](https://github.com/aisyncclub/detail_page_codex_skill/blob/afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3/ecommerce-detail-page/references/image-production-workflow.md)
- [gallery builder](https://github.com/aisyncclub/detail_page_codex_skill/blob/afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3/ecommerce-detail-page/scripts/build-image-gallery.mjs)

README에는 MIT 표기가 있지만 고정 commit의 recursive tree에서는 별도 `LICENSE` 파일을 확인하지 못했다. 따라서 이 프로젝트는 workflow 개념만 독립 구현하며 외부 코드를 가져오지 않는다.

## 외부 flow의 핵심

```text
제품 사진 확인
→ 진행 모드·상품·고객·스타일·컷 수 결정
→ 컷별 목적·카피·구도·ASCII 배치 기획
→ 사용자 기획 승인
→ one-cut-per-worker 병렬 이미지 생성
→ 카피·가독성·사실 QA
→ 실패한 컷만 부분 재생성
→ 세로 gallery와 다운로드 package
```

강한 부분은 제작 전에 제품 사진과 컷별 역할을 구체화하고, 한 컷을 한 worker에 배정하며, 가능한 worker를 먼저 채운 뒤 실패한 컷만 재시도하는 것이다. 이 원리는 제작 대기와 재생성 비용을 줄인다.

## 채택·변환·비채택

| 외부 방식 | 판정 | 프로젝트 정본 방식 |
| --- | --- | --- |
| 사진 우선 intake와 품질 판정 | 변환 | 실제 제품 사진은 선택 사항이다. 있으면 강한 identity reference로 추가하고, 없으면 최초 한 번만 알린 뒤 공급처 same-SKU media를 SSOT·ImageGen 참조로 사용한다. |
| 컷별 목적·구도·필수 사실 선기획 | 확장 | Markdown 컷이 아니라 `content.section_plan`으로 만들고 `customer_question → claim → evidence → media → HTML`을 연결한다. |
| 정확한 컷 수와 one-cut-per-worker | 채택 | image job마다 별도 WorkOrder·staging root·output digest를 부여하고 사용 가능한 slot을 먼저 채운다. |
| 실패한 컷만 재생성 | 확장 | 실패 criterion이 가리키는 artifact root와 descendant만 stale 처리한다. 통과 member의 digest는 보존한다. |
| 세로 gallery와 개별 다운로드 | 역할 변경 | 최종 상세페이지가 아니라 Studio v1의 review/download sidecar로 사용한다. |
| 한국어 카피를 이미지 안에 생성 | 비채택 | HTML이 카피의 정본이다. 이미지는 제품·장면·질감·도해를 담당하고 package 원문 외 임의 문자를 기본 금지한다. |
| 이미지 묶음을 보여주는 gallery HTML | 확장 | 내부 Studio는 editable section을 유지하고 고객용 `output/detail-page.html`과 Wing은 같은 780 CDN WebP stack으로 전달한다. |
| GIF 제작 단계 없음 | 보완 | 문제 2+, 해결 장점별 1+, 사용 1+, 비교 1+, 전체 최소 5·기본 7~9를 G1·G3·G5 gate로 강제한다. |
| 사람용 Markdown QA 표 | 보완 | subject digest, validator code·policy hash, evidence artifact, producer/validator session 분리를 가진 ValidationReceipt를 요구한다. |
| worker가 파일을 곧바로 완성 경로에 둠 | 비채택 | worker는 staging에만 제출하고 Orchestrator만 검증 후 immutable artifact를 commit한다. |

## 우리 flow의 강제 연결

```text
identity.reference_set
→ commercial_flow + content.section_plan
→ image.work_order[] → image.candidate[] → image.approved[]
→ motion.opportunity[] → HyperFrames preview approval
→ gif.candidate[] → gif.approved[]
→ editable Studio authoring source
→ Save current working + output preview + 내부 snapshot 20개
→ versioned rubric QA
→ 사용자 승인 → 새 CDN namespace Wing export
```

각 화살표는 경로 문자열이 아니라 `artifact_id + manifest_sha256`으로 연결한다. 각 생산 단계는 다음 consumer, 독립 ValidationReceipt, 필요한 ApprovalReceipt가 없으면 완료할 수 없다.

### 이미지

- 하나의 job은 하나의 section 질문과 주 역할을 가진다.
- 실제 제품 reference, 금지 변경, 권리 등급, 출력 크기, 허용 쓰기 경로를 WorkOrder에 고정한다.
- candidate는 병렬 생성하되 동일성·치수·OCR·시각 QA를 통과한 member만 승인한다.
- copy 수정은 image 재생성을 요구하지 않는다.

### GIF

- 문제 2+, 해결 장점별 1+, 사용 1+, 비교 1+를 만들고 시간축 근거가 더 필요한
  제품은 상한 없이 추가한다.
- BRIEF·프로젝트·preview 승인을 받은 뒤 최종 render한다.
- 첫·중간·마지막 frame, loop, crop, 동일성, 용량과 정지 fallback을 독립 검수한다.

### HTML과 Studio

- copy, 시험 조건, 사양, 주의사항의 저작 정본은 편집 가능한 Studio section이다.
- 각 section은 section·claim·evidence·asset ID를 보존한다.
- Studio 저장은 현재 working을 새 source revision으로 확정하고
  `output/detail-page.html` 단일 진입점을 갱신하며 최근 20개 내부 snapshot을
  남긴다. Wing Export는 `output/wing/<export-id>/`에 별도 780px CDN stack을
  만들고 현재 output을 덮어쓰지 않는다.
- 외부 gallery의 “한눈에 이어 보기” 장점은 유지하되 QA·revision·승인 상태를 함께 보여준다.

## 적용 규칙

1. 외부 스킬의 고유 표현을 그대로 복사하지 않는다.
2. 참조 분석 결과는 `research-only` 학습 후보이며 production asset이 아니다.
3. 한 사례의 관찰을 즉시 공용 규칙으로 만들지 않는다.
4. 채택 후보는 다른 상품이나 결정론 fixture에서 검증하고 사용자 승인을 받아야 한다.
5. 현재 run은 승인 KnowledgeSnapshot과 현재 상품 research artifact를 함께 읽는다.
   공용 규칙 승격은 별도 독립 검증과 사용자 승인을 요구한다.

## 조사 한계

- 이 비교는 2026-07-30의 고정 commit에 한정된다. 이후 upstream 변경을 반영하지 않는다.
- 저장소의 생성 사례가 실제 매출·전환을 개선했다는 독립 데이터는 확인하지 않았다.
- sample QA는 사람이 읽는 기록이며 실제 실행·독립 검수를 증명하는 receipt로 보지 않았다.
- 외부 HTML은 image gallery이므로 editable commerce HTML의 품질 비교 자료가 아니다.
- 제작 GIF workflow가 없어 GIF 품질·비용·접근성에 관한 외부 검증 근거는 없다.
- 브라우저 녹화가 동시 조사와 충돌했으므로 immutable GitHub 링크와 commit을 판정 근거로 삼았다.
