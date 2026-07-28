# Detail Page Maker Skill

공급처 상품 URL에서 제품 사실 SSOT, God Tibo GPT Image 2 상업 이미지, HyperFrames GIF와 수정 가능한 HTML 상세페이지를 만드는 설치형 Codex 스킬입니다.

저장소 규칙과 설계 문서는 [`docs/`](docs/README.md), 완성 상품은
[`projects/`](projects/README.md), 설치 가능한 스킬 정본은
[`skills/detail-page-maker-skill/`](skills/detail-page-maker-skill/)에 있습니다.

저장소를 변경하는 에이전트는 먼저 [`docs/RULES.md`](docs/RULES.md),
[`docs/CONTEXT.md`](docs/CONTEXT.md), [`docs/ISSUE.md`](docs/ISSUE.md)를 읽습니다.

## 폴더 역할

| 경로 | 역할 |
| --- | --- |
| [`docs/`](docs/README.md) | 규칙, 이슈, 장기 연구, 재사용 reference와 계획 |
| [`projects/`](projects/README.md) | 상품별 근거·연구·자산·모션·QA·HTML의 자기완결 단위 |
| [`skills/`](skills/README.md) | 설치 가능한 스킬 정본 |
| [`scripts/`](scripts/README.md) | 설치와 정기 연구 갱신 진입점 |
| [`tests/`](tests/README.md) | 스킬·Studio 회귀 테스트 |
| [`config/`](config/README.md) | 저장소 workspace 설정 |

`.agents/`는 로컬에 설치된 스킬 복사본이며 Git 정본이 아닙니다. 수정은
`skills/`에서 하고 설치본은 다시 설치해 갱신합니다.

## 한 프로젝트의 전체 흐름

```text
공급처 근거 → 제품 SSOT → 기획 → 이미지·GIF 승인 → HTML → 최종 QA
→ planning/LEARNINGS.md 회고 → 공용 후보 이슈 → 재검증 → 스킬 갱신
```

상품 고유 자료는 해당 `projects/<project-id>/`에 남깁니다. 여러 상품에 재사용할
후보만 [`docs/issues/`](docs/ISSUE.md)에서 검증하고, 다른 프로젝트나 회귀 테스트를
통과한 뒤 [`docs/references/`](docs/references/README.md)와 설치 스킬에 승격합니다.

생성된 이미지와 GIF는 `pending`에 먼저 저장하고 Studio v1에서 사용자가 개별
승인한 파일만 최종 HTML에 사용합니다.

기획·디자인·HTML 최종 QA에는 `design-taste-frontend`를 필수로 사용합니다.
Windows 설치 스크립트는 Taste·God Tibo GPT Image 2·HyperFrames·Browser Harness 스킬을
`skills/detail-page-maker-skill/.agents/skills/`에 로컬 설치하며, 다른 프로젝트와
사용자 전역 스킬을 변경하지 않습니다.

## Git 주소부터 한 번에 설치

```powershell
git clone https://github.com/csm-kr/detail-page-maker-skill.git
cd detail-page-maker-skill
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

설치 상태만 빠르게 다시 검사할 때는 다음 명령을 사용합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 -QuickTest
```

전체 설명은 [`docs/setup/quick-start.md`](docs/setup/quick-start.md)를 참고하세요.

## Codex에 스킬 폴더 하나만 설치

```powershell
npx skills add `
  https://github.com/csm-kr/detail-page-maker-skill/tree/main/skills/detail-page-maker-skill `
  --skill detail-page-maker-skill `
  --agent codex `
  --global `
  --yes `
  --copy

$codexRoot = if ($env:CODEX_HOME) {
  $env:CODEX_HOME
} else {
  Join-Path $env:USERPROFILE ".codex"
}
$skillRoot = Join-Path $codexRoot "skills\detail-page-maker-skill"

powershell -ExecutionPolicy Bypass -File `
  (Join-Path $skillRoot "scripts\setup-local.ps1") `
  -NoProject
```

첫 명령은 이 저장소에서 `detail-page-maker-skill` 폴더만 설치합니다. 두 번째 명령은
필요한 외부 스킬을 받은 폴더 내부에 설치하고 `doctor`와 E2E를 실행합니다. 설치 후
Codex를 다시 시작하고 다음과 같이 요청합니다.

```text
$detail-page-maker-skill로 이 공급처 상품의 새 Studio 프로젝트를 만들어줘:
https://domeggook.com/상품번호
```

## 로컬 실행

저장소에서 실행 환경을 확인합니다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs doctor
node skills/detail-page-maker-skill/scripts/e2e.mjs
```

저장소가 관리하는 독립 프로젝트를 조회·검사합니다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs list
node skills/detail-page-maker-skill/scripts/detail-page.mjs validate
```

새 상품 프로젝트를 만듭니다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs new `
  --name "노바페이스 발편한 기능성깔창" `
  --supplier-url "https://domeggook.com/60851997"
```

프로젝트를 생성하면 Studio 서버가 시작되고 다음 주소가 브라우저에서 열립니다.

```text
http://127.0.0.1:8896/studio.html
```

기존 프로젝트를 다시 열려면 다음 명령을 사용합니다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs start `
  --project "projects\<상품명>-<상품번호>"
```

## 기본 저장 위치

복제한 저장소에서 실행하면 `config/workspace.json`에 따라 프로젝트를
`projects/`에 저장합니다.

```text
detail-page-maker/
└─ projects/
   └─ <상품명>-<상품번호>/
```

스킬 폴더만 전역 설치해 다른 위치에서 실행할 때는 기존 기본값을 사용합니다.

```text
C:\Users\<사용자>\Documents\DetailPageStudio\projects\<상품명>-<상품번호>\
```

`DETAIL_PAGE_PROJECTS_ROOT` 환경 변수나 `--root`로 위치를 바꿀 수 있습니다.
Studio v1의 승인 원장, HTML, 공급처 증거, 이미지·GIF와 HyperFrames 원본은 상품
프로젝트 안에 저장합니다. 프로젝트는 다른 프로젝트나 저장소 루트의 파일 경로를
참조하지 않습니다.

## 프로젝트 폴더 구성

```text
<상품명>-<상품번호>/
├─ project.json
├─ README.md
├─ evidence/                 공급처·시장 근거 번들
├─ research/                 프로젝트 전용 조사
├─ asset/
│  ├─ input/                 실제 촬영·공급처 원본
│  ├─ ssot/                  제품 절대 기준 자산
│  ├─ generated/
│  │  ├─ pending/
│  │  │  ├─ image/
│  │  │  └─ gif/
│  │  ├─ approved/
│  │  │  ├─ image/
│  │  │  └─ gif/
│  │  └─ rejected/
│  │     ├─ image/
│  │     └─ gif/
│  ├─ output/
│  │  ├─ page/
│  │  └─ gif/
│  ├─ deprecated/
│  ├─ asset-manifest.json
│  └─ approval-ledger.ndjson
├─ hyperframes/
│  ├─ projects/              수정 가능한 모션 원본
│  └─ renders/               MP4·GIF 렌더 결과
├─ html/
│  ├─ studio.html            Studio v1
│  ├─ index.html             편집 중인 상세페이지
│  └─ app.js                 편집·저장·단일 HTML 출력
├─ qa/
│  ├─ reports/               QA 보고서
│  └─ captures/              검수 캡처
├─ revisions/                개정판 기록
└─ planning/                 기획·GIF·승인 기록
```

## 저장 위치 변경

`--root` 옵션으로 상품 프로젝트 상위 폴더를 지정할 수 있습니다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs new `
  --name "상품명" `
  --supplier-url "https://supplier.example/item/123456" `
  --root "D:\DetailPageProjects"
```

이 경우 저장 위치는 다음과 같습니다.

```text
D:\DetailPageProjects\<상품명>-<상품번호>\
```

## Studio 작업 순서

1. 공급처 원문과 실제품 사진을 등록해 제품 사실 SSOT를 고정합니다.
2. `design-taste-frontend`로 상품별 Design Read와 `VARIANCE / MOTION / DENSITY`를 정하고 pre-flight 보고서를 만듭니다.
3. 로컬 `god-tibo-gpt-image2-skill`로 기본 8장씩 ImageGen 이미지 후보를 만들고,
   HyperFrames GIF 후보와 함께 `asset/generated/pending`에 저장합니다.
4. 원본·후보 비교와 독립 시각 QA를 수행합니다.
5. Studio v1의 `에셋 승인`에서 사용자가 각 파일을 승인하거나 반려합니다.
6. 승인 파일은 `approved`, 반려 파일은 `rejected`로 이동하고 SHA-256을 기록합니다.
7. 조립 뒤 에셋과 GIF는 읽기 전용으로 유지하고 HTML만 편집합니다.
8. Taste 최종 pre-flight, 상용 QA 97점 이상, 하드 실패 0건과 사용자 최종 승인 뒤 게시용 HTML을 내보냅니다.

Studio v1은 브라우저에서 ImageGen API를 직접 호출하지 않습니다. 설치된
`god-tibo-gpt-image2-skill`을 통해서만 이미지를 만들며 Codex에 다음과 같이 요청합니다.

```text
이 프로젝트의 다음 ImageGen과 HyperFrames 에셋을 만들고 pending에 저장한 뒤 QA해줘.
```

## 저장소

- GitHub: <https://github.com/csm-kr/detail-page-maker-skill>
- 공개 범위: Private
- 설치 스킬: [`skills/detail-page-maker-skill/`](skills/detail-page-maker-skill/)
- Studio v1 계약: [`skills/detail-page-maker-skill/references/studio-workflow.md`](skills/detail-page-maker-skill/references/studio-workflow.md)
- Asset 상태 계약: [`skills/detail-page-maker-skill/references/asset-management.md`](skills/detail-page-maker-skill/references/asset-management.md)
- 확장 Studio 지원 모듈은 God Tibo·제품 SSOT·회귀 검사가 사용하며, 사용자 기본
  화면은 Studio v1입니다.
