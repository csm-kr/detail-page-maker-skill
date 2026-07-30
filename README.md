# Detail Page Maker Skill

공급처 URL 하나에서 제품 SSOT, 시장 조사, 상업 기획, 이미지, GIF, 편집 가능한
Studio v1, `output/detail-page.html`, 쿠팡 Wing CDN 출력을 만드는 단일 Codex
스킬이다. 실행에 필요한 연관 스킬 14개는 이 스킬 폴더 안에 잠금된 상태로
포함된다.

## 한 줄 설치

macOS, Ubuntu, Windows에서 대상 프로젝트 폴더를 연 뒤 같은 명령을 실행한다.
GitHub 저장소에서 `detail-page-maker-skill` 하나만 프로젝트 로컬로 받는다.
현재 비공개 저장소에 처음 연결하는 컴퓨터는 접근 권한이 있는 계정으로 아래
인증을 한 번 마친다.

```sh
gh auth login
gh auth setup-git
```

```sh
npx skills add https://github.com/csm-kr/detail-page-maker-skill --skill detail-page-maker-skill --agent codex --yes --copy
```

전역 설치는 하지 않는다. 설치 후 Codex에 다음처럼 요청하면 된다.

```text
$detail-page-maker-skill로 이 공급처 상품의 상세페이지를 만들어줘: <공급처 URL>
```

## 업데이트

```sh
npx skills update detail-page-maker-skill --project --yes
```

업데이트도 Git 원본의 단일 스킬 폴더를 다시 받는다. 내장된 연관 스킬은 별도로
설치하거나 업데이트하지 않는다.

## 실행 검사

Node.js 22.15.0 이상과 GitHub CLI가 필요하다. GIF 제작에는 `ffmpeg`가 필요하고, motion 작업 시
내장 HyperFrames 절차가 `npx hyperframes`로 프로젝트 로컬 런타임을 준비한다.
실제 브라우저 수집·검수에는 `browser-harness` 실행 파일이 필요하다. 이들은
별도 스킬이 아니라 세 운영체제에서 사용하는 실행 프로그램이다.

```sh
node .agents/skills/detail-page-maker-skill/scripts/detail-page.mjs doctor
node .agents/skills/detail-page-maker-skill/scripts/e2e.mjs
```

설치된 폴더 하나를 다른 프로젝트에 수동 복사하는 방식은 지원하지 않는다.
프로젝트마다 위 Git 설치 명령을 실행해 출처와 업데이트 경로를 유지한다.

## 저장 위치

- 사용자가 넣는 실제 제품 사진: `<project>/input/product/`
- 편집·복구 내부 상태: `<project>/.detail-page/`
- 최종 고객 HTML: `<project>/output/detail-page.html`
- 이미지·GIF: `<project>/output/media/`
- 새 프로젝트 기본 루트: `.workspace/projects/`

공급처 원본, 생성 이미지, GIF, 영상, QA 캡처와 프로젝트 실행 상태는 Git 배포물에
포함하지 않는다. Git에는 단일 스킬, 증류된 규칙, 회귀 테스트만 둔다.

스킬 실행 계약은
[`skills/detail-page-maker-skill/SKILL.md`](skills/detail-page-maker-skill/SKILL.md)에
있다.
