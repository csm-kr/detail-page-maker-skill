# 13. Studio·GIF·반응형·자산 최종 QA

- Type: task
- Status: resolved
- Label: ready-for-agent
- Blocked by: 10, 11, 12
- Created: 2026-07-28

## 할 일

- Studio 선택·이동·실행 취소·텍스트 비우기·글꼴·색상 저장을 브라우저로 검증한다.
- HyperFrames strict·keyframe·snapshot과 최종 GIF 첫·중간·끝을 검증한다.
- 최종 페이지의 그래프 제거, 문구 비중복, 47 cm 위치, 반응형을 검사한다.
- archive manifest와 최종 deliverables 참조 무결성을 검사한다.
- 스킬 quick validation과 저장소 관련 테스트를 실행한다.

## 수락 기준

- 자동 검사와 실제 브라우저 검사가 모두 통과한다.
- 깨진 미디어·가로 넘침·복구 불가능 이동이 0건이다.

## Answer

Studio 실제 브라우저 조작, 320·360·390·768·800px 상세페이지, 24개 로컬 미디어,
11개 GIF, 13개 섹션을 검사했다. 깨진 참조·가로 넘침·냉감 그래프·활성 레거시
경로 참조는 모두 0건이다.

자동 테스트는 21개 중 20개 통과, 1개 의도된 제외이며 실패 0건이다.
HyperFrames strict는 오류·경고 0건, archive 체크섬은 상위 2/2와 중첩 21/21,
신규 GIF의 pending·deliverable·HyperFrames 사본 해시는 6/6 일치한다.
