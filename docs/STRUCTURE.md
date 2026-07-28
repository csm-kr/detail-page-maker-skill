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

2026-07-27 기준 크기 감사 결과는 다음과 같다.

- `projects/`: 약 848 MiB
- `docs/`: 약 16 MiB
- `.agents/`: 약 6.8 MiB
- 1 MiB보다 큰 파일 중 동일 hash 그룹 85개, 추가 복사본 98개
- 중복 복사본을 모두 없앴을 때의 이론상 절감량: 약 222.2 MiB

대용량 중복의 대부분은 `assets/` 원본, HyperFrames 입력·렌더, 게시용
`detail-page/assets/`를 각각 자기완결 상태로 보존한 의도적인 복사본이다. Git은
hard link를 보존하지 않고, 이 파일들은 manifest와 QA 보고서가 참조하므로
경로를 바꾸지 않은 채 중복 파일만 삭제할 수 없다.

### 지금 지워도 되는 로컬 항목

- `.agents/`: `skills/` 정본에서 다시 설치할 수 있는 로컬 복사본. 현재 Codex가
  사용 중일 수 있어 이번 정리에서는 보존하고 Git에서 제외했다.
- `.artifacts/`: 재생성 가능한 검사·설치 산출물. Git에서 제외한다.

### 보존 정책을 만든 뒤 정리할 후보

- HyperFrames `snapshots/`와 선택되지 않은 중간 렌더
- 노바페이스 `v8`~`v10` MP4처럼 최종판 이전의 렌더
- source → motion → publication 사이의 동일 이미지 복사본

이 후보는 먼저 현재 최종판, 참조 manifest, QA hash, 복구 위치를 기록한
archive manifest를 만든 뒤 정리한다. 프로젝트 자기완결성과 재현성을 깨는
공용 asset store 도입은 현재 하지 않는다.

## Project asset root policy

신규·갱신 프로젝트의 활성 자산 루트는 단수 `asset/` 하나다. 프로젝트 루트에
`asset/`와 `assets/`가 동시에 있으면 다음 순서로 정리한다.

1. 모든 활성 참조와 SHA-256을 조사한다.
2. 현재 입력·SSOT·승인본은 `asset/`의 정해진 상태 폴더로 이동한다.
3. 비활성 원본·중복·교체본은 삭제하지 않고
   `archive/legacy-assets/<YYYY-MM-DD>/`로 이동한다.
4. archive에 원래 경로·복구 경로 `README.md`와 `checksums.sha256`을 남긴다.
5. 텍스트·manifest 참조가 0건이고 디렉터리가 비었을 때만 프로젝트 루트의
   `assets/` 디렉터리를 제거한다.

스킬 런타임의 `skills/**/assets/`, HyperFrames 프로젝트 내부 `assets/`, 쿠팡
Wing 출력 패키지의 `assets/`는 각 도구의 자기완결 리소스이므로 이 규칙의 대상이
아니다. prototype과 모션 원본은 안전 정리 대상으로 보지 않는다.

## `skills/`와 `.agents/skills/`

| 경로 | 성격 | 수정·버전 관리 |
| --- | --- | --- |
| `skills/detail-page-maker-skill/` | 배포할 스킬의 정본 source | 여기서 수정하고 테스트·커밋 |
| `.agents/skills/detail-page-maker-skill/` | 이 컴퓨터에서 실행 중인 설치 복사본 | 직접 수정하지 않고 source에서 재설치 |

즉 `.agents/skills/`를 삭제해도 source는 사라지지 않지만, 재설치 전까지 로컬
Codex에서 해당 스킬을 사용할 수 없을 수 있다.
