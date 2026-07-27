# 04. 통합 Studio UI 구현

- Type: prototype
- Status: resolved
- Triage: ready-for-agent
- Blocked by: 01, 03
- Created: 2026-07-26

## Question

에셋 검수부터 HTML 편집까지의 단방향 흐름을 한 `studio.html`에서 안전하고 전문적으로 조작할 수 있는가?

## Acceptance criteria

- 에셋 검수, GIF 편집, 조립, HTML 편집, 최종 QA 탭이 있다.
- 조립 전후 권한과 읽기 전용 상태가 명확하다.
- 원본·후보 비교, 겹치기, 차이 강조, 동기화 확대가 있다.
- 레이어·그룹·장면 범위의 프롬프트 요청과 확인창이 있다.
- GIF 레이어·타임라인·텍스트 속성 편집면이 있다.
- 320·390·800px 오버라이드가 명시적으로 표시된다.
- 로딩·빈 상태·오류·완료 상태가 구현된다.

## Answer

다섯 작업면을 하나의 `studio.html`에 통합했다. 원본·후보 비교, 차이·겹치기, 동기 확대·스크롤, GIF 레이어 속성·프롬프트 편집 요청, 조립 잠금, HTML 직접 편집·viewport override·자동 저장·undo/redo·체크포인트와 최종 QA 화면을 연결했다.

## Comments

- 2026-07-26: 기본은 어두운 프로덕션 UI, 작업 캔버스는 밝게 분리하기로 했다.
- 2026-07-26: Browser Harness에서 1600×750 작업 화면, 업로드 대화상자, 비교·조립 차단·읽기 전용·HTML 편집·GIF 레이어 inspector·최종 QA 게이트를 시각 검수했다.
