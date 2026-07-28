# 03. 고객 화면 우선 워크플로우·스킬·문서 갱신

- Type: task
- Status: resolved
- Label: ready-for-agent
- Blocked by: 02
- Created: 2026-07-28

## 할 일

- 상세페이지 제작 워크플로우에 `고객 화면 → 구매 질문 → 소구 → 즉시 증명` 순서를
  명시한다.
- 공개 화면에는 제작 방식, 근거 분류, 생성 도구, 검수 상태를 쓰지 않도록 스킬
  하드 게이트를 추가한다.
- 고객 메시지·고객의 소리·말풍선의 허용 조건과 허구 후기 금지 조건을 문서화한다.
- 각 소구 전용 이미지·GIF를 바로 다음 모듈에 두고 후반 일괄 proof 갤러리를
  금지한다.
- 배경 이미지 섹션의 카피 안전영역, 대비, 제품 비가림 규칙을 추가한다.
- HyperFrames의 슬라이드 비교·전후 분할·강조 FX 사용례를 문서화한다.

## 변경 대상

- `skills/detail-page-maker-skill/SKILL.md`
- `skills/detail-page-maker-skill/references/workflow.md`
- `skills/detail-page-maker-skill/references/commercial.md`
- `skills/detail-page-maker-skill/references/gif-guide.md`
- `skills/detail-page-maker-skill/references/public-output-policy.md`
- 관련 `docs/references/`

## 수락 기준

- 고객 화면 금지어 전역 검사가 워크플로우에 포함된다.
- `소구 → 즉시 증명`이 필수 순서로 명시된다.
- 메시지·말풍선이 후기처럼 오인되지 않는 작성 규칙이 있다.
- 새 상품에서도 같은 규칙을 재사용할 수 있다.

## Answer

`SKILL.md`, `guide.md`, `workflow.md`, `commercial.md`, `gif-guide.md`,
`gif-motion-pattern-library.md`, `public-output-policy.md`,
`asset-management.md`와 `agents/openai.yaml`을 갱신했다. 고객용 카피 가이드와
상용 효과·즉시 증명 가이드를 라우팅하고, 세 불편·주장 직후 GIF·후반 증거 갤러리
금지·내부 제작 문구 금지·개정별 deliverables 진입점을 하드 규칙으로 고정했다.

`quick_validate.py`를 UTF-8 모드로 실행한 결과 `Skill is valid!`를 확인했다.
