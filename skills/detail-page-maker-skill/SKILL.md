---
name: detail-page-maker-skill
description: 공급처 상품 URL과 실제 제품 자료에서 G0 제품 SSOT와 G1 시장·상업 기획을 병렬 준비하고, 순차 승인 뒤 God Tibo 상업 이미지, HyperFrames GIF와 수정 가능한 HTML 상세페이지를 만든다. 신규 이미지·GIF를 pending에서 시작해 Studio v1에서 사용자가 개별 승인·반려하고 approved 에셋만 조립·QA·게시하거나, 쿠팡 Wing 전용 780px HTML과 Cloudflare CDN 패키지를 만들어야 할 때 사용한다.
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
   공개 카피는 [`commercial-copy-tone-guide.md`](references/commercial-copy-tone-guide.md),
   비교·슬라이드·그래프·구성 FX와 소구 직후 증명은
   [`commercial-effects-and-claim-proof.md`](references/commercial-effects-and-claim-proof.md)를
   읽는다.
4. Studio는 [`studio-workflow.md`](references/studio-workflow.md), 게시 전 검사는
   [`commercial-qa.md`](references/commercial-qa.md)를 읽는다.
5. 쿠팡 Wing 전용 HTML을 만들거나 CDN에 게시할 때는
   [`coupang-wing-html-cdn.md`](references/coupang-wing-html-cdn.md)를 처음부터
   끝까지 읽고 그 절차를 따른다.
6. 기능성 깔창은
   [`novaface-insole-learnings.md`](references/novaface-insole-learnings.md),
   설치·E2E는 [`portable-install.md`](references/portable-install.md)를 읽는다.
7. 프로젝트 종료와 공용 규칙 승격은
   [`learning-loop.md`](references/learning-loop.md)를 읽는다.

## 로컬 의존 스킬

의존 스킬은 이 폴더의 `.agents/skills/`에 설치한다. 전역 설치를 가정하지 않는다.
`design-taste-frontend`는 선택 참고자료가 아니라 이 스킬의 필수 의존성이다.
디자인·카피·HTML 작업 전에
`.agents/skills/design-taste-frontend/SKILL.md` 전체를 읽는다. 모션 작업 전에는
같은 위치의 `hyperframes`, `hyperframes-core`, `hyperframes-animation`을 읽는다.
모든 생성형 이미지 제작·편집 전에는
`.agents/skills/god-tibo-gpt-image2-skill/SKILL.md` 전체를 읽고 그 스킬의
`scripts/tibo-batch.mjs`만 사용한다. 내장 `imagegen` 도구나 다른 이미지 생성
모델을 우회 경로로 사용하지 않는다.
누락 시 작업을 진행하지 말고 `scripts/setup-local.ps1`을 실행한다.
기획과 Taste 최종 pre-flight는 `qa/reports/taste-<revision>.md`에 기록한다.

## 실행

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1 -NoProject
node scripts/detail-page.mjs doctor
node scripts/e2e.mjs
node scripts/detail-page.mjs list
node scripts/detail-page.mjs validate
node scripts/detail-page.mjs new `
  --name "상품명" `
  --supplier-url "https://supplier.example/item/123456"
```

기존 프로젝트는 `node scripts/detail-page.mjs start --project "<project-path>"`로 연다.
저장소 프로젝트 목록은 `list`, 외부 파일 경로 의존성은 `validate`로 검사한다.
`config/workspace.json`이 발견되면 해당 `projectsRoot`를 사용하고, 없으면 사용자
문서 폴더를 사용한다.

## 절대 게이트

1. 공급처 원문·locator와 실제품 사진으로 제품 SSOT를 잠근다.
2. G0 SSOT 트랙과 G1 시장·상업 기획 초안을 병렬로 진행한다. G0 진행 중에도 동종
   제품 3개 이상과 공개 후기를 조사하고 `COMMERCIAL.md`, `DESIGN.md`,
   `BUYER-JOURNEY.md`, `GIF.md`, `APPROVALS.md`를 초안으로 작성한다. 제품 답,
   선택 이유, 주장-증거 연결은 `provisional`로 표시하고 G0 승인 뒤 확정한다.
   최종 승인은 `G0 → G1 → G2 → G3 → G4 → G5` 순서를 지키며 G1 승인 전에는
   이미지 생성을 시작하지 않는다.
3. 고객 화면을 최우선으로 설계한다. 기본적으로 서로 다른 불편 3개를
   `우리 제품의 답 → 선택 이유 3~5개 → 직접 증거`로 연결하되, 제품 근거가
   부족하면 수를 억지로 채우지 않는다. 문제는 고객의 장면·감정으로 말하고
   제작 방식·근거 분류·승인 상태는 공개하지 않는다.
4. 공개 주장마다
   `claim_id → component_id → fact_id → evidence_asset_id → section_id`를 고정한다.
   `fact_id`는 검증된 제품 사실 또는 출처가 고정된 `MANUFACTURER_CLAIM` 레코드다.
   제조사·브랜드 소유자·제조사를 대표하는 사용자가 확인한 기능은 제조사 제공
   제품 사실로 받아들여 공개할 수 있다. 공개 화면에서는 `제조사 확인`이나
   `MANUFACTURER_CLAIM`을 말하지 않고 고객의 상황·변화로 번역한다. 각 핵심
   장점에는 정지 이미지와 전용 GIF를 각각 연결하고 그 증거를 소구 바로 다음에
   둔다. 제조사가 주지 않은 온도·비율·시간·시험 조건은 만들지 않는다.
5. God Tibo GPT Image 2는 기본 8개 `items` 작업을 한 배치로 병렬 실행한다.
   8개를 넘으면 입력 순서를 보존해 8개씩 나누고, 모든 프롬프트에
   `QUALITY_GATE:CLEAN_COMMERCIAL`을 적용한다. 생성은 `controllable`과 명시된
   W×H, 편집은 Image 1 크기를 보존하는 `invariant`를 사용한다.
6. 모든 신규 이미지·GIF는 `asset/generated/pending/image|gif`에서 시작한다.
   제작 세션의 QA를 사용자 승인으로 간주하지 않는다.
7. 제품 동일성·무노이즈 QA 실패본은 새 버전으로 생성한다. 기존 파일을 덮어쓰지
   않고 승인본만 조립한다.
8. GIF 하나는 주장 하나·부품 하나·상태 변화 하나만 설명한다. 슬라이드 비교,
   스타일 매치컷, 무수치 하강 막대, 구성 리빌과 실제 좌표 강조를 적극 사용하되
   장식만 움직이는 GIF는 만들지 않는다. 여러 GIF를 페이지 후반 proof 갤러리에
   모으지 않는다.
9. 고객 HTML에서 프롬프트·파일명·해시·QA·승인 상태와 `제조사 확인`,
   `실물 구조를 기준으로 재구성` 같은 제작자 언어를 제거한다.
10. 각 프로젝트는 근거·자산·HyperFrames 원본·QA·HTML을 자기 폴더 안에 보존하고
    다른 프로젝트나 저장소 공용 폴더를 파일 의존성으로 참조하지 않는다. 프로젝트
    자산 루트는 단수 `asset/` 하나만 사용한다. 프로젝트 루트의 복수형 `assets/`는
    금지하며 발견 시 `scripts/migrate-legacy-asset-root.mjs`로 해시 보존
    마이그레이션을 완료한 뒤 작업한다. 스킬 자체의 런타임 리소스 폴더와 Wing 출력
    패키지 내부의 `assets/`는 이 금지 대상이 아니다.
11. 한 프로젝트의 학습은 먼저 `planning/LEARNINGS.md`에 기록한다. 다른 프로젝트
    또는 회귀 테스트로 재검증하기 전에는 공용 스킬 규약으로 승격하지 않는다.
12. 작업 자산은 `asset/`과 `hyperframes/`에 보존하고, 사용자가 여는 결과는
    `deliverables/<revision>/index.html` 하나로 고정한다. 그 HTML이 참조하는
    이미지·GIF·manifest·최종 QA만 같은 revision 폴더에 패키징한다.

## Studio v1

활성 CLI는 `studio-v1-server.mjs`만 시작한다. 작업면은
`상세 편집 → 에셋 승인 → 최종 출력`이다. pending과 필수 미승인이 0개일 때만
자립형 HTML을 내보낸다. G5·상용 QA 97점·사용자 게시 승인까지 충족하면 같은
최종 출력 화면에서 `쿠팡 Wing 포맷으로 내보내기`를 사용할 수 있다. 이 출력은
각 섹션을 780px 완성형 WebP로 평탄화하고 `<img>`만 세로로 연결한 Wing HTML과
CDN 업로드 매니페스트를 만든다. Studio 승인 클릭만 사용자의 명시적 결정으로
기록한다.

복잡한 Studio v2 작업 센터는 사용자 화면으로 실행하지 않는다. God Tibo, 제품
SSOT와 회귀 검사가 사용하는 확장 도메인·서버·런타임은 지원 라이브러리이므로
삭제하거나 deprecated로 옮기지 않는다.

## 완료 조건

- 제품 동일성 하드 실패, 가짜 후기, 출처 없는 효능과 임의 생성 수치가 0건이다.
- 제조사 제공 기능은 `MANUFACTURER_CLAIM` 출처·원문·조건을 기록했고, 수치가 없는
  기능 그래프에는 임의 눈금·온도·시험 결과 문구가 0건이다.
- 고객 화면의 제작 방식·근거 분류·승인 상태·제조사 확인 문구가 0건이다.
- 모든 핵심 소구와 전용 증거의 거리가 `same-section` 또는 `next-section`이며,
  후반 일괄 proof 갤러리가 0건이다.
- pending 필수 에셋과 rejected 경로 참조가 0건이다.
- HyperFrames `check --strict` 오류·경고가 0건이다.
- 320·360·390·768·800px 오버플로·잘림이 0건이다.
- Taste pre-flight, 상용 QA 97점 이상과 G5 사용자 승인을 기록했다.
- 게시용 단일 HTML, Studio 프로젝트 묶음, GIF 기록과 `LEARNINGS.md`를 만들었다.
- 사용자 검토 진입점은 `deliverables/<revision>/index.html` 하나다.
- 공용 후보는 검증 이슈 또는 다음 검증 계획에 연결했고 상품 한정 학습은 프로젝트
  안에 유지했다.
