# Project learning and promotion loop

한 상품에서 배운 사실과 여러 상품에 재사용할 규칙을 섞지 않기 위한 종료 절차다.

## Project record

모든 프로젝트는 `planning/LEARNINGS.md`를 가진다. 작업 중 발견한 항목마다 다음을
기록한다.

- `learning_id`
- `category`: `product-fact | workflow | design | copy | image | gif | qa | tooling`
- `scope`: `project-only | candidate-shared | rejected`
- `observation`
- `evidence_paths`
- `before_after`
- `risk_if_reused`
- `next_validation`
- `promotion_status`: `local | issue-opened | validated | promoted | rejected`

상품 고유 부품명, 카피, 색, 수치와 고객 상황은 기본적으로 `project-only`다.

## Promotion gate

```text
프로젝트 관찰
→ planning/LEARNINGS.md
→ project-only 또는 candidate-shared 분류
→ 공용 후보는 검증 이슈 생성
→ 다른 프로젝트 1개 이상 또는 회귀 테스트에서 재검증
→ 하드 실패·제품 고유 정보 누출 검사
→ 공용 reference와 테스트 갱신
→ 스킬 실행 계약 승격
```

한 프로젝트의 점수 상승만으로 공용 규칙에 바로 추가하지 않는다. 다음 조건을 모두
만족해야 `promoted`가 된다.

1. 최종 QA와 사용자 승인을 통과한 근거가 있다.
2. 상품 고유 사실·표현·레이아웃 좌표를 제거해도 규칙이 성립한다.
3. 다른 상품 프로젝트 또는 자동 회귀 테스트에서 같은 방향의 개선이 재현된다.
4. 기존 승인·제품 동일성·접근성·성능 게이트를 약화하지 않는다.
5. 수정한 reference와 관련 테스트가 함께 통과한다.

## Repository feedback

`config/workspace.json`이 있는 저장소에서 작업할 때 `candidate-shared` 항목은
`docs/ISSUE.md` 형식에 따라 `docs/issues/<effort>/issues/`에 티켓을 만든다.

- 결함·회귀는 `Type: task`
- 추가 표본이나 재검증이 필요하면 `Type: research`
- 상태는 처음에 `open`
- `LEARNINGS.md`와 QA·스크린샷의 프로젝트 상대 경로를 근거로 연결

저장소 밖에 설치된 스킬은 외부 저장소를 추측하거나 수정하지 않는다. 후보를
`planning/LEARNINGS.md`에 `local` 상태로 남기고 사용자가 정본 저장소에 전달할 수
있는 요약만 만든다.

## Where updates belong

- 상품 사실·시장 조사·QA: 현재 `projects/<project-id>/`
- 공용 연구 원문: `docs/research/`
- 검증된 제작 규약: `docs/references/`
- 실행 가능한 설치 규약: `skills/detail-page-maker-skill/references/`
- 미검증 후보·결함: `docs/issues/`

공용 문서와 설치형 스킬에 같은 규칙을 반영할 때 의미가 어긋나지 않게 함께
갱신한다. 설치형 스킬은 저장소 외부 경로에 의존하지 않는 자체 포함 문장으로 쓴다.
