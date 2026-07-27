# Detail Page Maker Skill

공급처 상품 URL에서 제품 사실, 상업 기획, 승인된 이미지·GIF, 수정 가능한 HTML
상세페이지와 Studio 프로젝트를 만드는 스킬 소스다.

## 빠른 시작

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

에이전트는 `SKILL.md → guide.md → workflow.md` 순서로 읽고 현재 작업에 필요한 전문
가이드만 추가로 읽는다.

상위 경로에서 `config/workspace.json`을 발견하면 새 프로젝트를 해당 설정의
`projects/`에 만들고, 없으면 사용자 문서 폴더를 사용한다. 각 프로젝트는 근거,
이미지·GIF, HyperFrames 원본, QA와 HTML을 자기 폴더 안에 보존하며 외부 파일
경로를 참조하지 않는다.

설치 스크립트는 Taste, HyperFrames와 Browser Harness 스킬을 이 폴더의
`.agents/skills/`에 설치한다. 다른 프로젝트나 사용자 전역 스킬을 덮어쓰지 않는다.

## 핵심 문서

| 파일 | 역할 |
|---|---|
| `SKILL.md` | 스킬 진입점과 절대 게이트 |
| `guide.md` | 작업별 문서 라우팅 지도 |
| `references/workflow.md` | 전체 제작 순서 |
| `references/commercial.md` | 고객 문제·제품 답·선택 이유 |
| `references/asset-gen-guide.md` | God Tibo 4개 배치와 무노이즈 이미지 |
| `references/asset-management.md` | pending·approved·rejected 자산 수명주기 |
| `references/gif-guide.md` | GIF 제작과 프로젝트 학습 누적 |
| `references/approval-guide.md` | 옆 승인 세션 필수 게이트 |
| `references/studio-workflow.md` | Studio v1 승인·편집·개정판 |
| `references/portable-install.md` | 다른 컴퓨터 설치·진단·E2E |

## 스킬 폴더 구조

```text
detail-page-maker-skill/
├─ SKILL.md
├─ guide.md
├─ README.md
├─ dependencies.json
├─ skills-lock.json
├─ .agents/
│  └─ skills/                 컴퓨터별 로컬 의존 스킬, Git 제외
├─ agents/
│  └─ openai.yaml
├─ assets/
│  ├─ project-template/
│  │  ├─ APPROVALS.md
│  │  ├─ BUYER-JOURNEY.md
│  │  ├─ COMMERCIAL.md
│  │  ├─ DESIGN.md
│  │  ├─ GIF.md
│  │  ├─ LEARNINGS.md
│  │  └─ index.html
│  ├─ studio-v1-runtime/
│  │  ├─ app.js
│  │  ├─ studio.html
│  │  ├─ studio-v1.css
│  │  └─ studio-v1.js
│  └─ studio-runtime/         God Tibo·회귀 검사용 확장 지원 런타임
├─ references/
│  ├─ workflow.md
│  ├─ commercial.md
│  ├─ asset-gen-guide.md
│  ├─ asset-management.md
│  ├─ gif-guide.md
│  ├─ approval-guide.md
│  ├─ BUYER-JOURNEY.md
│  ├─ commercial-detail-page.md
│  ├─ commercial-qa.md
│  ├─ domeggook-supplier-extraction.md
│  ├─ product-identity.md
│  ├─ product-identity-imagegen.md
│  ├─ gif-motion-pattern-library.md
│  ├─ hyperframes.md
│  ├─ hyperframes-gif-qa.md
│  ├─ korean-copy-typography.md
│  ├─ public-output-policy.md
│  ├─ studio-workflow.md
│  ├─ novaface-insole-learnings.md
│  ├─ portable-install.md
│  ├─ user-feedback-quality-gates.md
│  ├─ behance-commercial-analysis.md
│  └─ design-study.md
└─ scripts/
   ├─ detail-page.mjs
   ├─ e2e.mjs
   ├─ new-project.mjs
   ├─ god-tibo-batch-worker.mjs
   ├─ setup-local.ps1
   ├─ studio-v1-server.mjs
   └─ studio-server.mjs       확장 지원 API, 사용자 기본 화면 아님
```

## 새 프로젝트 기본 기획 파일

```text
planning/
├─ COMMERCIAL.md
├─ DESIGN.md
├─ BUYER-JOURNEY.md
├─ GIF.md
├─ APPROVALS.md
└─ LEARNINGS.md
```

GIF를 사용하지 않는 프로젝트도 `GIF.md`를 유지하고 사용하지 않은 이유를 기록한다.
모든 프로젝트는 `APPROVALS.md`에 옆 승인 세션의 게이트 결정을 기록한다.
종료할 때 `LEARNINGS.md`에서 상품 한정 학습과 공용 후보를 분리하고, 공용 후보는
다른 프로젝트 또는 회귀 테스트로 재검증한 뒤에만 스킬 규약으로 승격한다.

`assets/studio-v1-runtime/`만 현재 CLI가 새 프로젝트에 복사하는 활성 편집기다.
`assets/studio-runtime/`과 확장 서버·도메인은 God Tibo, 제품 SSOT와 회귀 검사가
실제로 사용하므로 유지한다. 사용자 기본 실행 명령은 계속 Studio v1만 연다.

## 기본 품질 게이트

- 확인되지 않은 제품 사실·효능·수치 금지
- God Tibo 이미지 생성은 최대 4개 병렬 배치
- 자글거림·필름 그레인·센서 노이즈가 보이는 이미지 승인 금지
- 제작 세션의 자가 승인 금지
- 승인되지 않은 이미지·GIF의 조립 금지
- 고객 화면의 프롬프트·파일명·해시·QA·제작 상태 노출 금지
- 제품 동일성 하드 실패 0건
- 반응형·HTML·HyperFrames 최종 검사 통과
