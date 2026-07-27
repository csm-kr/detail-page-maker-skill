# Repository Rules

이 문서는 저장소를 탐색하거나 변경할 때 적용하는 정본 규칙이다.

## 시작 순서

1. 도메인 용어는 [`CONTEXT.md`](CONTEXT.md)를 읽고 사용한다.
2. 이슈 작업은 [`ISSUE.md`](ISSUE.md)와 `issues/`를 확인한다.
3. 관련 ADR이 `adr/`에 있으면 기존 결정을 우선한다.
4. 상품 산출물은 `projects/<project-id>/` 밖의 파일에 의존하지 않게 한다.

## 이슈 트래커

이슈, 명세와 Wayfinder 지도는 `docs/issues/` 아래의 Markdown으로 관리한다.
형식과 상태 전환은 [`ISSUE.md`](ISSUE.md)를 따른다.

## 도메인 문서

이 저장소는 하나의 도메인 컨텍스트를 사용한다. 이슈 제목, 명세, 코드, 테스트,
보고서와 사용자 설명에는 [`CONTEXT.md`](CONTEXT.md)의 정식 용어를 사용한다.
명시적으로 피하라고 한 동의어는 사용하지 않는다.

필요한 개념이 glossary에 없다면 새 용어를 임의로 만들기보다 도메인에 속하는
개념인지 먼저 검토한다. 기존 ADR과 충돌하면 결정을 조용히 덮어쓰지 않고 해당
ADR과 재검토 이유를 밝힌다.

## Triage labels

| Canonical role | Tracker label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer evaluation is required |
| `needs-info` | `needs-info` | More information is required from the reporter |
| `ready-for-agent` | `ready-for-agent` | Fully specified and ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Human implementation is required |
| `wontfix` | `wontfix` | The issue will not be actioned |

스킬이 canonical role을 언급하면 위 tracker label을 그대로 사용한다.

## 폴더 경계

- `docs/`: 규칙, 이슈, 계획, 연구와 재사용 문서의 정본
- `projects/`: 상품별 제품 근거, 자산, 모션, QA와 HTML
- `skills/`: 설치 가능한 스킬 패키지와 자체 포함 reference
- `scripts/`: 저장소 관리·설치·연구 갱신 진입점
- `tests/`: 실행 가능한 회귀 테스트만 보존
- `.artifacts/`: 재생성 가능한 로컬 결과이며 Git에 포함하지 않음

전체 구조와 보존 정책은 [`STRUCTURE.md`](STRUCTURE.md)를 따른다.
