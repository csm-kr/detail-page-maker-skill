# Detail Page Maker Skill

공급처 근거에서 제품 SSOT, 상업 기획, 승인된 이미지·GIF, 편집 가능한 Studio v1
상세페이지와 쿠팡 Wing HTML을 만드는 설치형 Codex 스킬이다.

실행 진입점은
[`skills/detail-page-maker-skill/SKILL.md`](skills/detail-page-maker-skill/SKILL.md)이며,
세부 문서는 작업별로 `references/`에서 선택해 읽는다.

## 활성 배포 구조

```text
├─ skills/detail-page-maker-skill/   설치 가능한 단일 스킬
├─ tests/                            portable·Studio v1 회귀 테스트
├─ scripts/setup-windows.ps1         저장소 설치 진입점
└─ config/workspace.json             로컬 프로젝트 위치
```

상품 프로젝트, 공급처 원본, 생성 이미지, GIF, 영상, QA 캡처와 `.artifacts`는 Git
배포물에 포함하지 않는다. 저장소에서 만든 새 프로젝트는 기본적으로
`.workspace/projects/`에 저장된다. 2026-07-29 이전 자료는 로컬
`deprecated/`에 보존되어 있으며 이 경로는 Git에서 제외된다.

## 설치와 검사

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 -NoProject
node .\skills\detail-page-maker-skill\scripts\detail-page.mjs doctor
node .\skills\detail-page-maker-skill\scripts\e2e.mjs
node --test .\tests\portable-skill\*.test.mjs
node --test .\tests\orchestration\*.test.mjs
node --test .\tests\studio-v1\*.test.mjs
```

## 다른 프로젝트에 로컬 설치

전역 스킬 폴더를 바꾸지 않고 대상 프로젝트의 `.agents/skills/`에 본 스킬과
잠금된 연관 스킬 14개를 함께 설치한다.

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\skills\detail-page-maker-skill\scripts\install-local.ps1 `
  -Source .\skills\detail-page-maker-skill `
  -TargetProject "C:\path\to\target-project"
```

연관 스킬에는 공급처용 `dmk-extractor`, 시장 조사용 `coupang-extractor`,
Browser Harness, 이미지 생성, HyperFrames motion 계열이 포함된다. 설치기는
프로젝트 로컬 원본을 우선하며 명시적 `-AllowNetwork` 없이는 네트워크에서
가져오지 않는다.

## 새 프로젝트

```powershell
node .\skills\detail-page-maker-skill\scripts\detail-page.mjs new `
  --name "상품명" `
  --supplier-url "https://supplier.example/item/123456"
```

사용자가 직접 넣는 파일은 `<project>/input/product/`뿐이다. 실제 제품 사진이
없어도 같은 SKU의 공급처 이미지가 확인되면 계속 진행한다. 편집·저장은 내부
`.detail-page/`에서 수행하고 고객 진입점은
`<project>/output/detail-page.html` 하나로 유지한다.

## 두 학습 단계

```text
Behance 조사 → 로컬 후보 Markdown → 검증 → references/commercial.md
실제 제작 피드백 → 프로젝트 LEARNINGS.md → 검증 → references/taste.md
```

조사 URL·관찰 원문·피드백 원문은 `.workspace` 또는 프로젝트에 임시 저장하고,
규칙을 승격하거나 기각한 뒤 삭제한다. Git에는 계속 갱신되는 `CR-*`·`TR-*`
규칙과 회귀 테스트만 남긴다.

현재 저장 위치와 마지막 갱신 시각은 다음 명령으로 확인한다.

```powershell
node .\skills\detail-page-maker-skill\scripts\detail-page.mjs learning-status
```
