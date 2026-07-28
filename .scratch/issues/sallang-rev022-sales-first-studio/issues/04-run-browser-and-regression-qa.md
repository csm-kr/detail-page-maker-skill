# 04. 브라우저·자동 QA

- Type: task
- Status: resolved
- Label: ready-for-agent
- Blocked by: 02, 03
- Created: 2026-07-28

## 할 일

- Studio 모드·정렬·가이드·삭제·단축키를 실제 브라우저에서 조작한다.
- 다섯 뷰포트의 상세페이지와 미디어 참조를 검사한다.
- 스킬·문서 링크·Node 회귀 테스트를 실행한다.

## 수락 기준

- 브라우저 보고서와 최종 QA 보고서가 새 revision에 있다.
- 하드 실패와 깨진 참조가 0건이다.

## Comments

- 2026-07-28: Browser Harness 실제 조작으로 모드 분리·정렬·드래그 차단·보조선·
  스냅·삭제·undo를 확인했다.
- 320·360·390·768·800px 오버플로 0, 깨진 미디어 0, GIF 10개, 그래프 0을
  확인하고 `deliverables/rev022-sales-first/qa/`에 보고서를 패키징했다.
- Studio 계약 테스트 4/4와 Skill Creator validation이 통과했다. 프로젝트 전체
  portable validator의 과거 rev018~rev021 절대 경로 경고는 별도 레거시 범위다.
