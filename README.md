# Detail Page Maker Skill

공급처 URL과 사용자가 지정한 쿠팡 URL을 받아, 쿠팡 상세페이지의 판매 흐름을 현재
상품에 맞게 재기획하는 Codex 스킬이다. 약 30개 이미지와 약 10개 GIF/WebP를 포함한
폭 780px `output/detail-page.html`을 만들고 Studio 편집과 Coupang Wing/CDN 출력을
유지한다.

## 핵심 계약

- 시작 입력: 공급처 URL, 지정 쿠팡 URL, 선택적 실제 제품 사진
- 기준작: 지정 쿠팡 상세페이지 한 개의 흐름·카피 전략·증명 방식
- 기본 흐름: 시선 확보 → 문제 공감 → 핵심 장점 → 작동 원리 → 시각적 증거 →
  사용 방법 → 옵션 선택 → 구매 확신
- 출력: 780px HTML, 이미지 약 30개, GIF/WebP 약 10개, 선택적 Wing export
- 목표 시간: 멀티에이전트 병렬 실행으로 60분 이내

시장 전체 검색, 경쟁상품 다수 비교, 대량 후기 분석과 고정 승인 대기는 기본 실행하지
않는다. 제품 사실·동일성·권리·공개 출력 안전선만 강제하고 섹션 수, 표현, 스타일과
작업 분배는 AI가 상품에 맞게 판단한다.

카피는 글자 수로 자르지 않는다. 조사·수식어·숫자와 단위·핵심 표현을 분리하지 않고
문맥과 의미 단위로 청킹해 `<br>`을 지정한 뒤 780px 실제 화면에서 검수한다.

## 설치와 업데이트

```sh
npx skills add https://github.com/csm-kr/detail-page-maker-skill \
  --skill detail-page-maker-skill --agent codex --yes --copy

npx skills update detail-page-maker-skill --project --yes
```

설치 후 다음처럼 요청한다.

```text
$detail-page-maker-skill로 상세페이지를 만들어줘.
공급처: <URL>
기준 쿠팡: <URL>
제품 사진: 있음/없음
```

## 실행과 검증

Node.js 22.15.0 이상이 필요하다. URL 캡처에는 Browser Harness, 모션 제작에는
FFmpeg와 호스트의 HyperFrames 스킬을 사용한다.

```sh
node .agents/skills/detail-page-maker-skill/scripts/detail-page.mjs doctor
node .agents/skills/detail-page-maker-skill/scripts/e2e.mjs
```

저장소 자체를 검증할 때는 다음을 실행한다.

```sh
node --test skills/detail-page-maker-skill/scripts/tests/*.test.mjs
node skills/detail-page-maker-skill/scripts/e2e.mjs
node skills/detail-page-maker-skill/scripts/detail-page.mjs doctor
```

스킬의 실행 계약은
[`skills/detail-page-maker-skill/SKILL.md`](skills/detail-page-maker-skill/SKILL.md),
빠른 제작 플로우는
[`references/workflow.md`](skills/detail-page-maker-skill/references/workflow.md)에 있다.
