# 저장소 구조 통합과 학습 승격 루프

Type: task
Status: resolved
Blocked by:

## Question

상품별 산출물을 자기완결 프로젝트로 만들고, 장기 연구·이슈·스킬 source·로컬
설치본을 분리하면서 기존 링크와 실행 계약을 어떻게 유지할 것인가?

## Acceptance criteria

- 루트의 느슨한 문서는 README 외 내부 폴더로 이동한다.
- 이슈는 `docs/issues/`, 장기 연구는 `docs/research/`에 둔다.
- 상품 종속 근거·연구·모션·QA는 해당 `projects/<project-id>/`에 둔다.
- 스킬이 `planning/LEARNINGS.md`와 검증 후 승격 루프를 생성·요구한다.
- Markdown 링크, 프로젝트 격리 검사와 회귀 테스트가 통과한다.

## Answer

저장소를 다음 경계로 통합했다.

- 상품 종속 근거·연구·모션·QA·HTML은 `projects/<project-id>/` 안에 둔다.
- 장기 연구는 `docs/research/`, 재사용 규약은 `docs/references/`, 이슈는
  `docs/issues/`에서 관리한다.
- 배포 정본 `skills/`와 로컬 설치 복사본 `.agents/skills/`를 분리한다.
- 프로젝트 종료 때 `planning/LEARNINGS.md`에 학습을 남기고, 다른 프로젝트나
  회귀 테스트에서 확인한 공용 후보만 이슈를 거쳐 스킬에 승격한다.

검증 결과 프로젝트 5개가 자기완결 검사에 통과했고, Markdown 157개에서 깨진
내부 링크 0건, JSON 126개에서 파싱 오류 0건, Node 회귀 테스트 35개 중
35개 통과를 확인했다.

## Comments

- 2026-07-27: 구조 이동과 문서·스킬 갱신을 시작했다.
- 2026-07-27: 구조·학습 승격 루프와 전체 검증을 완료했다.
