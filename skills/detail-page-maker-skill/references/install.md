# Git 단일 스킬 설치·실행

## 지원 계약

- 배포 원본은 `https://github.com/csm-kr/detail-page-maker-skill` 하나다.
- 사용자는 `detail-page-maker-skill` 하나만 프로젝트 로컬로 설치한다.
- 실행 의존 스킬 14개는 설치된 스킬의 `.agents/skills/`에 내장한다.
- sibling·전역 스킬을 추가로 설치하거나 정상 실행 경로로 사용하지 않는다.
- macOS, Ubuntu, Windows 모두 Node.js 22.15.0 이상의 같은 Node 진입점을 사용한다.
- PowerShell, Bash, 운영체제별 설치 스크립트를 요구하지 않는다.
- 불완전한 번들은 네트워크에서 조각을 보충하지 않고 즉시 실패한다.

## 설치

대상 프로젝트 폴더에서 실행한다.

현재 비공개 저장소를 새 컴퓨터에서 처음 받는 경우 먼저 접근 권한이 있는
GitHub 계정을 Git에 연결한다.

```sh
gh auth login
gh auth setup-git
```

```sh
npx skills add https://github.com/csm-kr/detail-page-maker-skill --skill detail-page-maker-skill --agent codex --yes --copy
```

이 명령은 GitHub 저장소에서 상위 스킬 폴더 하나를 복사한다. `--skill`을 생략하거나
`--full-depth`로 내부 스킬을 각각 설치하지 않는다.

## 업데이트

```sh
npx skills update detail-page-maker-skill --project --yes
```

내장 스킬을 개별 업데이트하지 않는다. 상위 스킬 업데이트가
`dependencies.json`, `skills-lock.json`, `.agents/skills/`를 한 단위로 교체한다.

## 검사

```sh
node .agents/skills/detail-page-maker-skill/scripts/detail-page.mjs doctor
node .agents/skills/detail-page-maker-skill/scripts/e2e.mjs
node .agents/skills/detail-page-maker-skill/scripts/detail-page.mjs agent-capacity
```

`doctor`는 선언·잠금·내장 상태가 14/14/14인지 검사한다. 일부 내장 스킬이나
잠금 hash가 다르면 실행하지 않고 상위 스킬 하나를 다시 업데이트한다.
`agent-capacity`는 현재 CPU·RAM 추천, host slot, 실제 session 수와 최종 worker
상한을 보여 준다.

## 런타임

- Node.js 22.15.0 이상: 필수
- Git, GitHub CLI 및 npm/npx: 비공개 Git 원본의 설치·업데이트에 필수
- HyperFrames: motion 단계에서 `npx hyperframes`로 프로젝트 로컬 준비
- ffmpeg: GIF·motion 제작에 필수
- browser-harness 실행 파일: 공급처·쿠팡·Behance 수집과 브라우저 QA에 필수

런타임 프로그램과 로그인 상태를 전역으로 변경하지 않는다. HyperFrames는 해당
motion 프로젝트의 로컬 `node_modules`에만 준비한다. 그 밖의 런타임이 누락되면
`doctor`가 상태를 보고하고 해당 단계는 `HOLD`로 남긴다.

## 새 프로젝트

설치된 스킬 폴더에서 다음 Node 명령을 실행한다.

```sh
node .agents/skills/detail-page-maker-skill/scripts/detail-page.mjs new --name "상품명" --supplier-url "https://supplier.example/item/123456"
```

사용자가 직접 넣는 파일은 생성된 프로젝트의 `input/product/`뿐이다. 실제 제품
사진이 없고 같은 SKU의 공급처 이미지가 확인되면 최초 한 번 알린 뒤 진행한다.

## 경험 자동 승격

workspace에 평면 `exps/` drop을 초기화하고 필요할 때 명시적으로 검사할 수 있다.

```sh
node .agents/skills/detail-page-maker-skill/scripts/detail-page.mjs experience-init
node .agents/skills/detail-page-maker-skill/scripts/detail-page.mjs experience-sync
```

완성 run, Behance 조사, frame 제작 경험은 조사/run별 `.md`로 나누되 source별
하위 폴더를 만들지 않는다. 형식은 `exps/README.md`를 따른다. 검증을 통과한
블록은 다음 mutating entrypoint에서 자동 승격되며 실패 블록은 격리된다.

멀티 agent host가 session을 외부에서 공급할 때는 CLI의 반복
`--worker-sessions <id>` 또는 다음 환경값을 사용한다.

```text
DETAIL_PAGE_AGENT_TOTAL_SLOTS
DETAIL_PAGE_AGENT_MAX_WORKERS
DETAIL_PAGE_AGENT_SESSION_IDS
```

CPU·RAM 추천만으로 실제 session을 만들거나 임의 ID를 생성하지 않는다.

## 배포 무결성

- `dependencies.json`은 단일 Git 배포와 필요한 내장 스킬을 선언한다.
- `skills-lock.json`은 각 내장 스킬의 `SKILL.md` SHA-256을 고정한다.
- 두 파일의 집합, 실제 내장 파일, hash 중 하나라도 다르면 fail-closed한다.
- 설치된 스킬 폴더 하나만으로 `doctor`, E2E, G0→G5를 실행할 수 있어야 한다.
