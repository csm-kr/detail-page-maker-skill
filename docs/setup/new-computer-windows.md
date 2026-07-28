# 새 Windows 컴퓨터에서 처음부터 실행하기

## 가장 간단한 방법

private 저장소 접근 권한이 있는 PowerShell에서 다음 세 줄을 실행한다.

```powershell
git clone https://github.com/csm-kr/detail-page-maker-skill.git
cd detail-page-maker-skill
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

`scripts/setup-windows.ps1`은 실제 설치 로직을 복제하지 않는다. 받은 스킬 폴더의
`skills/detail-page-maker-skill/scripts/setup-local.ps1`을 그대로 호출한다.

설치 스크립트가 처리하는 범위:

1. Git, GitHub CLI, Node.js 22 이상, Codex CLI, uv, FFmpeg 확인
2. GitHub·Codex 로그인
3. Browser Harness 실행 도구 설치
4. Taste·God Tibo GPT Image 2·HyperFrames·Browser Harness 스킬을 받은 스킬 폴더 안에 설치
5. 환경 진단
6. 임시 프로젝트 E2E
7. 공급처 URL로 첫 Studio 프로젝트 생성

GitHub와 Codex 로그인 승인은 보안상 사용자가 직접 완료해야 한다.

## 스킬 폴더 하나만 Codex에 설치

저장소 전체 대신 Codex 스킬 하나만 설치하려면 다음 명령을 사용한다.

```powershell
npx skills add `
  https://github.com/csm-kr/detail-page-maker-skill/tree/main/skills/detail-page-maker-skill `
  --skill detail-page-maker-skill `
  --agent codex `
  --global `
  --yes `
  --copy
```

설치된 스킬 경로를 계산하고 로컬 의존성을 설치한다.

```powershell
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

외부 스킬은 다음 위치에만 저장된다.

```text
<설치된 detail-page-maker-skill>\.agents\skills\
```

전역 Taste·God Tibo GPT Image 2·HyperFrames 스킬을 따로 설치할 필요가 없다. 설치 출처와 해시는
`skills-lock.json`에 기록된다.

## E2E 확인

설치 후 다음 명령을 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File `
  (Join-Path $skillRoot "scripts\setup-local.ps1") `
  -QuickTest
```

또는 공개 명령을 각각 실행한다.

```powershell
node (Join-Path $skillRoot "scripts\detail-page.mjs") doctor
node (Join-Path $skillRoot "scripts\e2e.mjs")
```

성공 기준:

```text
12개 로컬 의존 스킬 발견
→ 새 임시 프로젝트 생성
→ COMMERCIAL·DESIGN·BUYER-JOURNEY·GIF·APPROVALS 생성
→ Studio v1 HTTP 200
→ pending이 있으면 출력 LOCKED
→ 사용자 확인 없는 승인 거부
→ 명시적 승인 뒤 SHA-256 기록
→ 출력 READY
→ 임시 프로젝트 삭제
```

E2E는 공급처에 접속하지 않고 ImageGen을 호출하지 않으며 기존 사용자 프로젝트를
변경하지 않는다.

## 첫 상품 프로젝트

```powershell
powershell -ExecutionPolicy Bypass -File `
  (Join-Path $skillRoot "scripts\setup-local.ps1") `
  -ProductName "노바페이스 발편한 기능성깔창" `
  -SupplierUrl "https://domeggook.com/60851997"
```

복제한 저장소에서 실행할 때의 기본 저장 위치:

```text
<저장소>\projects\<상품명>-<상품번호>\
```

전역 설치한 스킬을 다른 폴더에서 실행할 때는
`C:\Users\<사용자>\Documents\DetailPageStudio\projects`를 사용한다.

Studio v1 기본 주소:

```text
http://127.0.0.1:8896/studio.html
```

## Codex에서 시작

설치 후 Codex를 다시 시작하고 요청한다.

```text
$detail-page-maker-skill로 이 공급처 URL의 새 Studio 프로젝트를 만들어줘:
https://domeggook.com/상품번호
```

God Tibo GPT Image 2·HyperFrames 후보는 프로젝트의 `asset/generated/pending/`에 들어가며,
Studio v1에서 사용자가 승인한 파일만 최종 HTML에 사용된다.

## 업데이트

저장소 복제 방식:

```powershell
git pull
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 -NoProject
```

스킬 설치 방식:

```powershell
npx skills update --global detail-page-maker-skill
powershell -ExecutionPolicy Bypass -File `
  (Join-Path $skillRoot "scripts\setup-local.ps1") `
  -NoProject
```

복제한 저장소의 상품 프로젝트는 `projects/`에, 전역 설치형 프로젝트는
`Documents\DetailPageStudio\projects`에 저장된다. 두 경우 모두 프로젝트는
자기 폴더 안의 증거·자산·HyperFrames 원본만 참조한다.

## 문제 해결

private 저장소 접근:

```powershell
gh auth status
gh repo view csm-kr/detail-page-maker-skill
```

Browser Harness:

```powershell
browser-harness --doctor
```

포트 충돌:

```powershell
node (Join-Path $skillRoot "scripts\detail-page.mjs") start `
  --project "<상품 프로젝트 경로>" `
  --port 8897
```
