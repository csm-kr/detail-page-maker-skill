# 프로젝트 로컬 설치·배포

## 불변 원칙

- 설치 기본 위치는 소비 프로젝트의 `.agents/skills/`다.
- `detail-page-maker-skill`과 모든 실행 의존 스킬은 그 폴더의 sibling으로
  설치한다.
- 사용자 홈, `$CODEX_HOME`, 전역 Codex 스킬 폴더는 읽거나 수정하지 않는다.
- 받은 스킬 폴더의 `.agents/skills/`에 포함된 vendored 원본을 항상 먼저 쓴다.
- vendored 원본이 없을 때도 `-AllowNetwork` 없이는 네트워크를 사용하지 않는다.
- 기존 대상 폴더가 소스와 다르면 덮어쓰거나 병합하지 않고 설치를 중단한다.
- 소스와 대상이 같거나 대상이 소스 내부면 재귀 복사를 차단한다.
- 의존 스킬 이름은 소문자·숫자·하이픈만 허용하고 경로 구분자·`..`를 이동 전에
  차단한다.
- 대상 프로젝트부터 `.agents/skills/<name>`까지 존재하는 모든 부모 경로의
  junction·symlink·reparse point를 preflight, 각 move, receipt 기록과 rollback
  직전에 다시 검사한다. 프로젝트 밖으로 연결된 대상에는 설치하지 않는다.
- 여러 sibling 이동이나 receipt 기록 중 하나라도 실패하면 이번 실행에서 새로
  만든 대상만 되돌리고 기존 receipt bytes를 복원한다.

## 다른 프로젝트에 설치

받은 스킬 폴더의 경로를 `-Source`로 지정한다. `-TargetProject`를 생략하면
명령을 실행한 현재 폴더가 대상 프로젝트다.

```powershell
Set-Location "D:\work\my-commerce-project"

powershell -ExecutionPolicy Bypass -File `
  "D:\downloads\detail-page-maker-skill\scripts\install-local.ps1" `
  -Source "D:\downloads\detail-page-maker-skill"
```

설치 결과는 다음과 같다.

```text
my-commerce-project/
└─ .agents/
   ├─ detail-page-maker-skill.install.json
   └─ skills/
      ├─ detail-page-maker-skill/
      ├─ browser-harness/
      ├─ coupang-extractor/
      ├─ design-taste-frontend/
      ├─ dmk-extractor/
      ├─ god-tibo-gpt-image2-skill/
      ├─ hyperframes/
      ├─ hyperframes-animation/
      ├─ hyperframes-cli/
      ├─ hyperframes-core/
      ├─ hyperframes-creative/
      ├─ hyperframes-keyframes/
      ├─ hyperframes-registry/
      ├─ media-use/
      └─ motion-graphics/
```

설치된 `detail-page-maker-skill/`에도 동일한 vendored 의존 스킬이 포함되므로,
그 폴더를 다시 `-Source`로 지정해 다른 프로젝트에 전달할 수 있다.

## 변경 없는 사전 검증

`-DryRun`은 잠금 파일, vendored 해시, 충돌, 설치 계획을 검사하고 파일을 만들지
않는다. `-ValidateOnly`도 같은 불변 검사를 수행하고 설치하지 않는다.

```powershell
powershell -ExecutionPolicy Bypass -File `
  "<source>\scripts\install-local.ps1" `
  -Source "<source>" `
  -TargetProject "<target-project>" `
  -DryRun
```

같은 소스로 다시 실행하면 같은 폴더는 `skip-identical`로 처리한다. 대상 스킬을
사용자가 수정한 경우에는 해당 내용을 보존한 채 오류로 중단한다. 수정본을
자동으로 지우는 강제 덮어쓰기 옵션은 제공하지 않는다.

## 명시적 네트워크 대체

정상 배포본에는 의존 스킬이 vendored되어 있으므로 보통 네트워크가 필요 없다.
일부 vendored 의존성이 빠진 특수 배포본만 다음처럼 명시적으로 허용할 수 있다.

```powershell
powershell -ExecutionPolicy Bypass -File `
  "<source>\scripts\install-local.ps1" `
  -Source "<source>" `
  -TargetProject "<target-project>" `
  -AllowNetwork
```

네트워크 대체도 `skills-lock.json`의 `SKILL.md` SHA-256과 일치해야 staging을
통과한다. `dmk-extractor`, `coupang-extractor`처럼 네트워크 대체 소스가 선언되지
않은 스킬은 vendored 원본이 없으면 항상 실패한다.

## 간편 설치와 진단

`setup-local.ps1`은 프로젝트 로컬 설치기의 얇은 진입점이다. 시스템 패키지,
로그인, 전역 PATH를 변경하지 않는다.

```powershell
powershell -ExecutionPolicy Bypass -File `
  "<source>\scripts\setup-local.ps1" `
  -Source "<source>" `
  -TargetProject "<target-project>" `
  -NoProject
```

설치 후에는 소비 프로젝트의 로컬 스킬을 직접 진단한다.

```powershell
node "<target-project>\.agents\skills\detail-page-maker-skill\scripts\detail-page.mjs" doctor
node "<target-project>\.agents\skills\detail-page-maker-skill\scripts\e2e.mjs"
```

Node.js, ffmpeg, Browser Harness 같은 실행 프로그램은 프로젝트 로컬 스킬과 별개의
런타임 의존성이다. 설치기는 이 시스템 프로그램을 자동 설치하거나 로그인하지
않는다.

## 잠금 검증

- `dependencies.json`은 필요한 sibling 스킬과 로컬·네트워크 해석 정책을 선언한다.
- `skills-lock.json`은 각 의존 스킬의 `SKILL.md` SHA-256을 고정한다.
- 두 파일의 스킬 집합이 다르거나 vendored 파일 해시가 다르면 복사 전에 실패한다.
- 모든 파일은 staging에서 다시 검증한 뒤 대상에 이동한다.
- 대상이 검증 뒤 새로 생기는 race도 이동 직전에 다시 검사한다.
- 성공 시 `.agents/detail-page-maker-skill.install.json`에 설치 출처와 전체 폴더
  digest를 기록한다.
