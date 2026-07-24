# Taste Skill·정기 학습·도매꾹 인기상품 반복 루프

상태: in-progress
결정일: 2026-07-25

## 범위

현재 43314131 상세페이지가 97점·하드 실패 0개를 통과한 뒤 다음 세 작업을 순서대로 실행한다.

1. `Leonxlnx/taste-skill`과 `https://www.tasteskill.dev/`의 계약·라이선스·효과를 확인하고 현재 디자인 규약과 A/B 비교한다.
2. Behance 상세페이지와 Taste Skill 사례를 정기 수집하는 검토 큐 예약 작업을 구현한다.
3. `https://domeggook.com/main/item/itemPopular.php`에서 상품을 한 개씩 선정해 공급처 추출부터 HTML QA까지 전체 파이프라인을 반복한다.

## 진행 기록

- [x] Taste Skill 저장소·사이트·MIT 라이선스와 v2 구조 확인
- [x] Codex용 5개 스킬 설치
- [x] 현재 43314131 페이지의 숫자형 메타 라벨·눈썹 밀도 A/B 검수
- [x] 390px 반응형·축소 모션·편집 모드 회귀 QA
- [x] Behance·Taste 검토 큐 예약 작업 구현
- [ ] 도매꾹 인기상품 첫 후보 선정과 공급처 추출

예약 작업:

- 이름: `DetailPageMaker-DesignStudyRefresh`
- 주기: 매주 월요일 09:30 KST
- 다음 실행: 2026-07-27 09:30 KST
- Task Scheduler 검증: `LastTaskResult=0`
- 산출물: `research/continuous-design-study/queue.md`, `state.json`

## 예약 작업 경계

- 후보 URL·게시일·디자인 가설만 자동 수집한다.
- 무인 작업이 상용 HTML이나 영구 규약을 자동 수정하지 않는다.
- 서로 다른 우수 사례 3개 이상과 현재 상품 A/B 검증을 통과한 규칙만 사람이 승격한다.

## 도매꾹 반복 경계

- 한 번에 한 상품만 전체 과정을 완료한다.
- 실제 공개 후기와 합성 문제를 분리한다.
- 97점·하드 실패 0개 전에는 다음 상품으로 넘어가지 않는다.
