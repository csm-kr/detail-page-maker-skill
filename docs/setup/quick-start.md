# Git 주소부터 시작하는 빠른 설치

대상 저장소는 비공개 저장소입니다.

```text
https://github.com/csm-kr/detail-page-maker-skill
```

## 처음 설치

Windows PowerShell에서 아래 세 줄만 실행합니다.

```powershell
git clone https://github.com/csm-kr/detail-page-maker-skill.git
cd detail-page-maker-skill
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
```

스크립트가 다음 작업을 순서대로 처리합니다.

1. Node.js, Codex CLI, GitHub CLI, uv, FFmpeg 설치 확인
2. GitHub와 Codex 로그인 확인
3. Browser Harness와 HyperFrames 설치
4. `detail-page-maker-skill`을 Codex 전역 스킬로 등록
5. CLI·Studio 자동 테스트
6. 공급처 URL을 받아 첫 상품 프로젝트 생성

비공개 저장소를 복제하기 위한 GitHub 인증과 Codex 로그인은 보안상 사용자가
브라우저에서 직접 승인해야 합니다.

## Quick Test

설치를 바꾸지 않고 현재 컴퓨터가 실행 가능한지만 빠르게 확인합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1 -QuickTest
```

Quick Test는 필수 명령, 상세페이지 CLI 진단, Studio 테스트, 스킬 탐색을
검사합니다. 하나라도 실패하면 종료 코드가 `0`이 아니므로 자동화에서도 바로
실패를 감지할 수 있습니다.

## 상품 정보까지 한 번에 전달

질문 없이 바로 프로젝트와 Studio를 열려면 상품명과 공급처 URL을 함께
전달합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1 `
  -ProductName "노바페이스 발편한 기능성깔창" `
  -SupplierUrl "https://domeggook.com/60851997?from=lstGen"
```

프로젝트 데이터는 기본적으로 다음 위치에 저장됩니다.

```text
C:\Users\<사용자>\Documents\DetailPageStudio\projects
```

Studio 종료는 실행 중인 PowerShell 창에서 `Ctrl+C`를 누릅니다.
