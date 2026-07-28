# Markdown routing map

저장소의 Markdown 문서를 목적별로 연결하는 정본 지도다. 처음에는 이 문서에서
작업 유형을 고르고, 링크된 실행 계약을 읽은 뒤 필요한 연구·이슈 기록으로 내려간다.

## 1. 최상위 진입점

| 질문 | 먼저 읽기 | 다음 경로 |
| --- | --- | --- |
| 이 저장소가 무엇을 만드는가 | [`../CONTEXT.md`](../CONTEXT.md) | [`CONTEXT.md`](CONTEXT.md), [`PLAN.md`](PLAN.md) |
| 저장소 규칙·triage | [`RULES.md`](RULES.md) | [`ISSUE.md`](ISSUE.md), [`issues/README.md`](issues/README.md) |
| 폴더와 보존 정책 | [`STRUCTURE.md`](STRUCTURE.md) | 스킬의 [`asset-management.md`](../skills/detail-page-maker-skill/references/asset-management.md) |
| 상세페이지 전체 실행 | 스킬 [`SKILL.md`](../skills/detail-page-maker-skill/SKILL.md) | 스킬 [`guide.md`](../skills/detail-page-maker-skill/guide.md) |
| 새 컴퓨터 설치 | [`setup/quick-start.md`](setup/quick-start.md) | [`setup/new-computer-windows.md`](setup/new-computer-windows.md) |
| Studio 제품·구조 | [`studio/v1-editor-contract.md`](studio/v1-editor-contract.md) | 폐기 설계 참고: [`studio/product-spec.md`](studio/product-spec.md), [`studio/architecture.md`](studio/architecture.md) |

## 2. 상세페이지 제작 라우팅

```text
공급처·실제품 입력
→ 스킬 workflow + approval + asset management
→ 제품 SSOT / 상업 기획 / 카피
→ God Tibo 이미지
→ HyperFrames GIF·FX
→ Studio 편집·승인
→ 상용 QA·게시
→ 프로젝트 LEARNINGS
→ 재검증된 규칙만 공용 references·tests로 승격
```

| 단계 | 실행 계약 | 보조 규약·연구 |
| --- | --- | --- |
| 전체 순서 | [`workflow.md`](../skills/detail-page-maker-skill/references/workflow.md), [`approval-guide.md`](../skills/detail-page-maker-skill/references/approval-guide.md) | [`PLAN.md`](PLAN.md) |
| 공급처 추출 | [`domeggook-supplier-extraction.md`](../skills/detail-page-maker-skill/references/domeggook-supplier-extraction.md) | [`contracts/domeggook-supplier-extraction.md`](contracts/domeggook-supplier-extraction.md) |
| 제품 동일성 | [`product-identity.md`](../skills/detail-page-maker-skill/references/product-identity.md), [`product-identity-imagegen.md`](../skills/detail-page-maker-skill/references/product-identity-imagegen.md) | [`references/product-identity-imagegen.md`](references/product-identity-imagegen.md) |
| 상업 기획 | [`commercial.md`](../skills/detail-page-maker-skill/references/commercial.md), [`BUYER-JOURNEY.md`](../skills/detail-page-maker-skill/references/BUYER-JOURNEY.md) | [`references/commercial-detail-page.md`](references/commercial-detail-page.md) |
| 카피·한글 | [`commercial-copy-tone-guide.md`](../skills/detail-page-maker-skill/references/commercial-copy-tone-guide.md), [`korean-copy-typography.md`](../skills/detail-page-maker-skill/references/korean-copy-typography.md) | [`research/behance-commercial-language-study-55.md`](research/behance-commercial-language-study-55.md) |
| 이미지 생성 | [`asset-gen-guide.md`](../skills/detail-page-maker-skill/references/asset-gen-guide.md) | [`references/design-study.md`](references/design-study.md) |
| GIF·FX | [`gif-guide.md`](../skills/detail-page-maker-skill/references/gif-guide.md), [`commercial-effects-and-claim-proof.md`](../skills/detail-page-maker-skill/references/commercial-effects-and-claim-proof.md) | [`gif-motion-pattern-library.md`](../skills/detail-page-maker-skill/references/gif-motion-pattern-library.md), [`research/hyperframes-gif-pipeline.md`](research/hyperframes-gif-pipeline.md) |
| Studio | [`studio-workflow.md`](../skills/detail-page-maker-skill/references/studio-workflow.md) | [`studio/v1-editor-contract.md`](studio/v1-editor-contract.md), [`studio/commerce-detail-page-studio-handoff.md`](studio/commerce-detail-page-studio-handoff.md), [`studio/ui-ux-ai-handoff.md`](studio/ui-ux-ai-handoff.md) |
| 공개 출력 | [`public-output-policy.md`](../skills/detail-page-maker-skill/references/public-output-policy.md) | [`coupang-wing-html-cdn.md`](../skills/detail-page-maker-skill/references/coupang-wing-html-cdn.md) |
| 최종 QA | [`commercial-qa.md`](../skills/detail-page-maker-skill/references/commercial-qa.md), [`hyperframes-gif-qa.md`](../skills/detail-page-maker-skill/references/hyperframes-gif-qa.md) | [`references/user-feedback-quality-gates.md`](references/user-feedback-quality-gates.md) |
| 학습 승격 | [`learning-loop.md`](../skills/detail-page-maker-skill/references/learning-loop.md) | 각 프로젝트 `planning/LEARNINGS.md` |

## 3. 공용 references

[`references/README.md`](references/README.md)가 공용 reference의 소개다.

- 상업 구성: [`commercial-detail-page.md`](references/commercial-detail-page.md),
  [`commercial-copy-tone-guide.md`](references/commercial-copy-tone-guide.md),
  [`behance-commercial-analysis-20260725.md`](references/behance-commercial-analysis-20260725.md)
- 디자인: [`design-study.md`](references/design-study.md)
- 카피·타이포: [`korean-copy-typography.md`](references/korean-copy-typography.md)
- 제품 동일성: [`product-identity-imagegen.md`](references/product-identity-imagegen.md)
- 모션 QA: [`hyperframes-gif-qa.md`](references/hyperframes-gif-qa.md)
- 사용자 피드백: [`user-feedback-quality-gates.md`](references/user-feedback-quality-gates.md)

공용 reference는 여러 상품에서 재검증된 규칙만 둔다. 상품 고유 수치·카피·좌표는
프로젝트 `planning/`에 남긴다.

## 4. 연구와 증거

[`research/README.md`](research/README.md)가 연구 진입점이다.

- 상업 문법: [`research/behance-detail-page-design-grammar.md`](research/behance-detail-page-design-grammar.md)
- 상업 말투 55건: [`research/behance-commercial-language-study-55.md`](research/behance-commercial-language-study-55.md)
- AI 디자인 도구: [`research/ai-design-skills.md`](research/ai-design-skills.md)
- HyperFrames 파이프라인: [`research/hyperframes-gif-pipeline.md`](research/hyperframes-gif-pipeline.md)
- 지속 연구 큐: [`research/continuous-design-study/README.md`](research/continuous-design-study/README.md)
- 원본 캡처: [`research/evidence/README.md`](research/evidence/README.md)

연구 문서는 디자인 판단의 근거이며 제품 사실의 출처가 아니다.

## 5. 이슈·Wayfinder

[`ISSUE.md`](ISSUE.md)와 [`issues/README.md`](issues/README.md)가 형식을 소유한다.
각 작업은 `spec.md → map.md → issues/*.md` 순서로 읽는다.

- 현재 저장소 정리: [`issues/repository-maintenance/map.md`](issues/repository-maintenance/map.md)
- 편집형 상세페이지: [`issues/editable-html-detail-page-maker/map.md`](issues/editable-html-detail-page-maker/map.md)
- Studio v2 연구: [`issues/detail-page-studio-v2/map.md`](issues/detail-page-studio-v2/map.md)
- 진행 중 로컬 작업: `../.scratch/issues/<task>/spec.md`,
  `../.scratch/issues/<task>/map.md`, `../.scratch/issues/<task>/issues/*.md`

`.scratch/` 이슈는 진행 중 작업 기록이다. 완료 후 재사용 가치가 있는 결정만
`docs/issues/` 또는 스킬 reference로 승격한다.

## 6. 프로젝트 문서

각 `projects/<project>/`는 자기완결 단위다.

```text
product/PRODUCT-SSOT.md
planning/COMMERCIAL.md
planning/DESIGN.md
planning/BUYER-JOURNEY.md
planning/GIF.md
planning/APPROVALS.md
planning/LEARNINGS.md
qa/**/*
deliverables/<revision>/qa/final-report.md
```

살랑 프로젝트의 이번 학습은
[`COMMERCIAL-CREATIVE-MEMORY.md`](../projects/살랑-루즈핏-쿨토시-55873582/planning/COMMERCIAL-CREATIVE-MEMORY.md),
[`GIF-FX-MAP.md`](../projects/살랑-루즈핏-쿨토시-55873582/planning/GIF-FX-MAP.md),
[`LEARNINGS.md`](../projects/살랑-루즈핏-쿨토시-55873582/planning/LEARNINGS.md)에
연결돼 있다.

## 7. 문서 소유권

- 실행 방법 변경: 스킬 `references/*.md`와 테스트를 함께 수정
- 저장소 구조 변경: `STRUCTURE.md`와 이 지도를 함께 수정
- Studio UI 계약 변경: `studio/`와 스킬 `studio-workflow.md`를 함께 수정
- 상품 한정 사실 변경: 해당 프로젝트 `product/`·`planning/`만 수정
- 반복 검증된 학습 승격: 프로젝트 `LEARNINGS.md` → 검증 이슈 → 공용 reference

새 Markdown 문서를 추가하면 최소 한 곳에서 이 지도 또는 해당 하위 `README.md`가
그 문서로 연결해야 한다.
