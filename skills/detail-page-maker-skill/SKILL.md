---
name: detail-page-maker-skill
description: 공급처 상품 URL에서 제품 사실 SSOT, ImageGen 상업 이미지, HyperFrames GIF와 수정 가능한 HTML 상세페이지를 만들고 조립 전 에셋 승인, 제품 동일성 QA, 개정판, Studio 편집과 게시 전 QA를 관리한다. 도매꾹·도매매 URL로 상업 상세페이지를 만들거나 이미지·GIF 일관성 검수, 프롬프트 수정, 편집 가능한 HTML·Studio 프로젝트가 필요할 때 사용한다.
---

# Detail Page Maker

공급처 URL에서 시작해 승인된 이미지·GIF만 조립한 상업 HTML 상세페이지를 만든다.

## 시작

1. [`references/workflow.md`](references/workflow.md)를 읽는다.
2. 도매꾹 URL이면 [`references/domeggook-supplier-extraction.md`](references/domeggook-supplier-extraction.md)를 읽는다.
3. 제품 이미지가 있으면 [`references/product-identity.md`](references/product-identity.md)와 [`references/product-identity-imagegen.md`](references/product-identity-imagegen.md)를 읽는다.
4. GIF나 모션이 필요하면 [`references/hyperframes.md`](references/hyperframes.md)와 [`references/hyperframes-gif-qa.md`](references/hyperframes-gif-qa.md)를 읽는다.
5. 기획·디자인·카피를 만들면 [`references/commercial-detail-page.md`](references/commercial-detail-page.md), [`references/study-design-skill.md`](references/study-design-skill.md), [`references/behance-commercial-analysis.md`](references/behance-commercial-analysis.md), [`references/korean-copy-typography.md`](references/korean-copy-typography.md), [`references/user-feedback-quality-gates.md`](references/user-feedback-quality-gates.md)에서 현재 제품에 관련된 규약을 읽는다.
6. Studio 작업이면 [`references/studio-workflow.md`](references/studio-workflow.md)를 읽는다.
7. 게시 전에는 [`references/commercial-qa.md`](references/commercial-qa.md)를 읽는다.

## 실행 환경

Node.js 22 이상, Browser Harness와 HyperFrames를 사용한다. 생성형 이미지는 Codex의 `imagegen` 스킬만 사용한다. 먼저 다음을 실행한다.

```powershell
node scripts/detail-page.mjs doctor
```

새 프로젝트를 만든다.

```powershell
node scripts/detail-page.mjs new `
  --name "상품명" `
  --supplier-url "https://supplier.example/item/123456"
```

기본 프로젝트 위치는 `문서/DetailPageStudio/projects/<상품명>-<상품번호>/`다. 생성 뒤 Studio 서버를 시작한다.

```powershell
node scripts/detail-page.mjs start --project "<project-path>"
```

## 필수 순서

1. 공급처 URL과 원문 근거를 수집한다.
2. 사용자 실사진과 공급처 사진으로 제품 사실 SSOT를 잠근다.
3. 제품 구조에 연결되는 구매 상황·불편·핵심 소구를 기획한다.
4. ImageGen 이미지와 HyperFrames 모션을 각각 새 에셋 버전으로 만든다.
5. Studio 자동 검사와 Codex 시각 QA를 기록한다.
6. 사용자에게 각 필수 에셋 승인을 받는다.
7. 승인된 버전만 상세페이지로 조립한다.
8. 조립 뒤 에셋·GIF는 읽기 전용으로 유지하고 HTML만 편집한다.
9. 97점 이상·하드 실패 0건·사용자 최종 승인 뒤 게시용 HTML을 내보낸다.

## 생성과 승인

- 생성형 시각 모델은 `imagegen`만 사용한다.
- ImageGen은 생성만 담당하고 결과를 자가 승인하지 않는다.
- 재생성은 기존 파일을 덮어쓰지 않고 후보 버전을 하나씩 만든다.
- 원본과 후보 한 개를 비교해 승인·재생성·보류를 결정한다.
- 제품 동일성 하드 실패는 사용자도 우회 승인할 수 없다.
- 조립 뒤 에셋 교체는 현재 버전을 잠금 해제하지 말고 새 개정판에서 수행한다.
- 새 개정판은 변경 에셋과 의존 GIF·HTML 섹션만 다시 승인한다.

## Studio 작업 대기열

Studio는 API 키나 생성 모델을 직접 호출하지 않는다. 사용자가 확인한 요청만 프로젝트의 `.studio/jobs/`에 기록한다.

Codex 작업자는 다음 순서로 처리한다.

1. `queued` 작업을 읽고 `running`으로 바꾼다.
2. 작업 종류에 따라 ImageGen 또는 HyperFrames를 사용한다.
3. 새 에셋 버전과 SHA-256을 등록한다.
4. 제품 SSOT와 후보를 비교해 QA 결과를 기록한다.
5. 하드 실패가 없으면 `review_ready`로 바꾼다.
6. 사용자 승인 전에는 조립하지 않는다.

## 금지

- 공급처 원문에서 확인하지 않은 치수·재질·효능을 사실처럼 쓰지 않는다.
- 실제품 대신 유사 상품 이미지를 제품 동일성 참조로 사용하지 않는다.
- 생성 이미지에 깨진 로고·문자·부품 위치를 HTML 오버레이로 숨기지 않는다.
- 완성 GIF 픽셀을 제품 원본처럼 취급하지 않는다.
- 조립된 현재 버전의 승인 에셋을 직접 교체하지 않는다.
- QA 전 게시용 결과를 내보내지 않는다.

## 완료 조건

- 필수 에셋 전부 사용자 승인
- 제품 동일성 하드 실패 0건
- HyperFrames `check --strict` 오류·경고 0건
- 320·360·390·768·800px 가로 overflow·잘림 0건
- HTML validator, 깨진 이미지·GIF, 중복 ID 0건
- 상용 QA 97점 이상
- 게시용 단일 HTML과 Studio 프로젝트 묶음 생성
