# 단일 스킬 폴더 설치와 E2E

## 목표

`detail-page-maker-skill` 폴더 하나만 받은 Windows 컴퓨터에서 그 폴더 안의
스크립트만으로 의존 스킬을 설치하고 전체 로컬 실행 가능성을 검증한다.

## 설치 위치

외부 스킬은 사용자 전역 폴더가 아니라 이 스킬 폴더 아래에 설치한다.

```text
detail-page-maker-skill/
├─ .agents/
│  └─ skills/
│     ├─ browser-harness/
│     ├─ design-taste-frontend/
│     ├─ hyperframes/
│     └─ ...
├─ dependencies.json
├─ skills-lock.json
└─ scripts/
   ├─ setup-local.ps1
   ├─ detail-page.mjs
   └─ e2e.mjs
```

`.agents/skills/`는 컴퓨터별 설치 결과라 Git에 올리지 않는다. `skills-lock.json`은
Taste와 HyperFrames의 설치 출처와 해시를 보존한다. Browser Harness 스킬은 설치된
`browser-harness skill` 명령에서 같은 폴더로 생성한다.

## 첫 설치

PowerShell에서 현재 스킬 폴더로 이동한 뒤 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1 -NoProject
```

스크립트는 다음을 수행한다.

1. Git, Node.js, Codex CLI, uv, FFmpeg를 확인하고 필요하면 `winget`으로 설치
2. GitHub와 Codex 로그인 확인
3. Browser Harness 실행 도구와 로컬 스킬 설치
4. Taste와 HyperFrames 스킬을 `.agents/skills/`에 복사
5. `doctor` 실행
6. 임시 프로젝트 E2E 실행

로그인 확인을 별도로 끝냈거나 프로그램 설치 권한이 없으면 다음처럼 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1 `
  -SkipPackages `
  -SkipLogin `
  -NoProject
```

## 빠른 재검사

설치나 사용자 프로젝트를 바꾸지 않고 현재 폴더의 실행 가능성만 검사한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1 -QuickTest
```

또는 두 공개 명령을 직접 실행한다.

```powershell
node .\scripts\detail-page.mjs doctor
node .\scripts\e2e.mjs
```

E2E는 운영 프로젝트를 열지 않는다. 시스템 임시 폴더에 테스트 프로젝트를 만들고
다음을 확인한 뒤 전부 정리한다.

```text
프로젝트 생성
→ 기획 템플릿 5개 확인
→ Studio v1 HTTP 200
→ pending Asset이 있으면 출력 LOCKED
→ 사용자 확인 없는 승인 409
→ 사용자 승인과 SHA-256 기록
→ pending 0과 출력 READY
→ 임시 프로젝트 삭제
```

## 첫 프로젝트

설치와 동시에 공급처 URL 프로젝트를 만들려면 다음처럼 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1 `
  -ProductName "상품명" `
  -SupplierUrl "https://domeggook.com/상품번호"
```

상위 폴더에서 `config/workspace.json`을 발견하면 해당 설정의 `projectsRoot`에
프로젝트를 만들고, 단독 설치 환경에서는
`Documents/DetailPageStudio/projects`를 사용한다. 생성된 프로젝트는 다른
프로젝트나 저장소 루트의 파일 경로를 참조하지 않는다.

Codex를 다시 시작하고 다음처럼 요청한다.

```text
$detail-page-maker-skill로 이 공급처 URL의 Studio 프로젝트를 만들어줘:
https://domeggook.com/상품번호
```

## 업데이트

Git으로 받은 폴더라면 `git pull` 뒤 설치 스크립트를 다시 실행한다. 설치형 스킬이면
주 스킬을 업데이트한 뒤 같은 명령을 다시 실행한다. 로컬 의존 스킬은 새 해시로
교체되고 `skills-lock.json`이 갱신된다.
