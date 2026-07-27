# Repository structure

## Canonical layout

```text
README.md
docs/
  CONTEXT.md
  ISSUE.md
  PLAN.md
  RULES.md
  issues/
  references/
  research/
projects/
scripts/
skills/
tests/
config/
```

Git 동작을 위한 `.gitignore`와 로컬 도구 디렉터리 같은 숨김 항목은 예외다.

## Dependency policy

- `projects/<project-id>/`는 자기완결 단위다.
- 프로젝트는 다른 프로젝트나 저장소 공용 자산을 파일 의존성으로 참조하지 않는다.
- 공용 문서는 프로젝트 파일을 설명 근거로 링크할 수 있지만 런타임에서 읽지 않는다.
- 설치형 스킬은 `skills/detail-page-maker-skill/`만 복사해도 동작해야 한다.
- `docs/research/`는 런타임 의존성이 아니라 감사 가능한 설계 근거다.
- `docs/issues/`는 계획·결정 이력이며 런타임 의존성이 아니다.

## Migration completed

- `prototypes/`와 `videos/`를 상품별 `projects/`로 통합했다.
- 공급처 fixture를 해당 프로젝트의 `evidence/`로 이동했다.
- 구 임시 이슈 폴더를 `docs/issues/`로 이동했다.
- 구 임시 폴더의 QA·연구 이미지를 해당 프로젝트 또는 `docs/research/evidence/`로 이동했다.
- 루트 문서를 `docs/`, `docs/references/`, `scripts/`로 이동했다.
- 오탈자가 있던 디자인 학습 문서를 `docs/references/design-study.md`로 바로잡았다.

## Safe cleanup

정리 과정에서 내용이 바이트 단위로 같은 BIO ORTO 캡처 7개만 삭제했다. Git에서
복구할 수 있다.

다음 항목은 재생성 가능하지만 이번 변경에서는 사용자 로컬 상태를 보존했다.

- `.agents/`: 로컬 설치된 스킬 복사본
- `.artifacts/`: 로컬 검사·설치 산출물
- 프로젝트 내부의 HyperFrames `snapshots/`와 중간 렌더

프로젝트 중간 렌더는 최종 manifest와 QA 보고서가 참조할 수 있으므로 별도 보존
정책과 hash 검증 없이 일괄 삭제하지 않는다.
