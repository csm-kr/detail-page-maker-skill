# 상용 HTML에 적용할 AI 디자인 스킬 조사

Type: research
Status: resolved
Blocked by:

## Question

공식 저장소와 1차 문서에서 확인되는 AI 디자인·프런트엔드 디자인 스킬 중, 상용 상세페이지의 일관성·세련도·편집성을 높이기 위해 이 스킬 내부에 흡수할 원칙과 검증 루프는 무엇인가?

## Answer

[`상용 HTML 상세페이지에 흡수할 AI 디자인 스킬 계약`](../../../research/ai-design-skills.md)에서 Anthropic, Vercel, DTCG, W3C, Playwright와 Core Web Vitals의 공식 원문을 비교했다.

- 단일 외부 스킬을 런타임 의존성으로 두지 않고 역할별 계약을 내부화한다.
- `디자인 디렉션 잠금 → 디자인 토큰·콘텐츠·DOM 구현 → 정적 감사 → 다중 폭 시각 회귀 → 접근성·성능 검사 → 사람의 아트디렉션 비평 → 국소 수정`을 필수 루프로 사용한다.
- 디자인 결정은 DTCG 형식 토큰과 CSS 변수로 편집 가능하게 만들고, 카피·자산·섹션 데이터를 DOM과 분리한다.
- 320, 360, 800, 1440px 렌더와 Playwright·axe·Core Web Vitals를 기계 gate로 사용하되 사람의 시각 비평을 대체하지 않는다.
- QA를 시작할 때 Vercel의 최신 원문 규칙을 다시 읽고 결함을 `file:line` 단위로 기록한다.

## Comments

- 2026-07-24: 공식 1차 출처 조사와 내부 계약 보고서 작성을 완료했다.
