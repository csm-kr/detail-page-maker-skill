---
name: detail-page-maker-skill
description: 공급처 상품 URL과 실제 제품 자료에서 제품 사실 SSOT, COMMERCIAL·DESIGN·BUYER-JOURNEY 기획, God Tibo 상업 이미지, HyperFrames GIF와 수정 가능한 HTML 상세페이지를 만든다. 신규 이미지·GIF를 pending에서 시작해 Studio v1에서 사용자가 개별 승인·반려하고 approved 에셋만 조립·QA·게시해야 할 때 사용한다.
---

# Detail Page Maker

공급처 근거에서 시작해 독립 승인된 이미지·GIF만 사용하는 상업 상세페이지를 만든다.

## 문서 라우팅

1. [`guide.md`](guide.md)에서 현재 작업의 필수 문서를 고른다.
2. 항상 [`workflow.md`](references/workflow.md),
   [`approval-guide.md`](references/approval-guide.md),
   [`asset-management.md`](references/asset-management.md),
   [`public-output-policy.md`](references/public-output-policy.md)를 읽는다.
3. 상업 기획은 [`commercial.md`](references/commercial.md), 이미지 생성은
   [`asset-gen-guide.md`](references/asset-gen-guide.md), GIF는
   [`gif-guide.md`](references/gif-guide.md)를 읽는다.
4. Studio는 [`studio-workflow.md`](references/studio-workflow.md), 게시 전 검사는
   [`commercial-qa.md`](references/commercial-qa.md)를 읽는다.
5. 기능성 깔창은
   [`novaface-insole-learnings.md`](references/novaface-insole-learnings.md),
   설치·E2E는 [`portable-install.md`](references/portable-install.md)를 읽는다.

## 로컬 의존 스킬

의존 스킬은 이 폴더의 `.agents/skills/`에 설치한다. 전역 설치를 가정하지 않는다.
`design-taste-frontend`는 선택 참고자료가 아니라 이 스킬의 필수 의존성이다.
디자인·카피·HTML 작업 전에
`.agents/skills/design-taste-frontend/SKILL.md` 전체를 읽는다. 모션 작업 전에는
같은 위치의 `hyperframes`, `hyperframes-core`, `hyperframes-animation`을 읽는다.
누락 시 작업을 진행하지 말고 `scripts/setup-local.ps1`을 실행한다.
기획과 Taste 최종 pre-flight는 `qa/reports/taste-<revision>.md`에 기록한다.

## 실행

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1 -NoProject
node scripts/detail-page.mjs doctor
node scripts/e2e.mjs
node scripts/detail-page.mjs new `
  --name "상품명" `
  --supplier-url "https://supplier.example/item/123456"
```

기존 프로젝트는 `node scripts/detail-page.mjs start --project "<project-path>"`로 연다.

## 절대 게이트

1. 공급처 원문·locator와 실제품 사진으로 제품 SSOT를 잠근다.
2. `COMMERCIAL.md`, `DESIGN.md`, `BUYER-JOURNEY.md`, `GIF.md`,
   `APPROVALS.md`를 작성하고 G0~G5를 순서대로 승인받는다.
3. 고객 문제를 `우리 제품의 답 → 선택 이유 3~5개 → 직접 증거`로 연결한다.
4. 공개 주장마다
   `claim_id → component_id → fact_id → evidence_asset_id → section_id`를 고정한다.
5. God Tibo는 최대 네 작업을 병렬 실행하고 모든 프롬프트에
   `QUALITY_GATE:CLEAN_COMMERCIAL`을 적용한다.
6. 모든 신규 이미지·GIF는 `asset/generated/pending/image|gif`에서 시작한다.
   제작 세션의 QA를 사용자 승인으로 간주하지 않는다.
7. 제품 동일성·무노이즈 QA 실패본은 새 버전으로 생성한다. 기존 파일을 덮어쓰지
   않고 승인본만 조립한다.
8. GIF 하나는 주장 하나·부품 하나·상태 변화 하나만 설명한다.
9. 고객 HTML에서 프롬프트·파일명·해시·QA·승인 상태를 제거한다.

## Studio v1

활성 CLI는 `studio-v1-server.mjs`만 시작한다. 작업면은
`상세 편집 → 에셋 승인 → 최종 출력`이다. pending과 필수 미승인이 0개일 때만
자립형 HTML을 내보낸다. Studio 승인 클릭만 사용자의 명시적 결정으로 기록한다.

복잡한 Studio v2 작업 센터는 사용자 화면으로 실행하지 않는다. God Tibo, 제품
SSOT와 회귀 검사가 사용하는 확장 도메인·서버·런타임은 지원 라이브러리이므로
삭제하거나 deprecated로 옮기지 않는다.

## 완료 조건

- 제품 동일성 하드 실패, 가짜 후기, 미확인 효능·수치가 0건이다.
- pending 필수 에셋과 rejected 경로 참조가 0건이다.
- HyperFrames `check --strict` 오류·경고가 0건이다.
- 320·360·390·768·800px 오버플로·잘림이 0건이다.
- Taste pre-flight, 상용 QA 97점 이상과 G5 사용자 승인을 기록했다.
- 게시용 단일 HTML, Studio 프로젝트 묶음과 GIF 학습 기록을 만들었다.
