# 02. 설치형 스킬 패키지 구성

- Type: task
- Status: resolved
- Triage: ready-for-agent
- Blocked by: 01
- Created: 2026-07-26

## Question

연구·프로토타입·실제 상품 산출물을 설치 단위에서 제외하고 스킬만 받아 바로 새 프로젝트를 생성·실행할 수 있는가?

## Acceptance criteria

- `skills/detail-page-maker-skill/`이 유일한 설치 스킬이다.
- `SKILL.md`, `agents/`, `scripts/`, `references/`, `assets/`만으로 실행 계약이 닫힌다.
- 첫 실행이 기본 프로젝트 폴더를 만들 수 있다.
- 기존 실험 자료는 삭제하지 않고 설치 패키지에서 제외한다.
- 스킬 검증과 `npx skills add` 발견 검사가 통과한다.

## Answer

`skills/detail-page-maker-skill/`을 유일한 설치 스킬로 만들었다. `doctor`, `new`, `start`와 Studio 런타임·참조 문서·프로젝트 템플릿을 모두 패키지 안에 넣었다. `quick_validate.py`와 `npx skills add . --list`에서 단일 스킬 발견을 확인했다.

## Comments

- 2026-07-26: 기존 자료는 우선 보존하고 `lab/` 물리 이동은 경로 마이그레이션으로 분리한다.
- 2026-07-26: 루트 중복 `SKILL.md`와 `agents/openai.yaml`을 제거해 설치 탐지 충돌을 해소했다.
