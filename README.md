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

## 요청 템플릿

스킬이 강제하는 것은 프롬프트에 다시 쓰지 않는다. 아래는 **스킬이 알 수 없는 것만**
남긴 형태다.

```text
$detail-page-maker-skill로 상세페이지를 만들어줘.

공급처:      <도매꾹 등 상품 URL>
기준 쿠팡:   <쿠팡 상품 URL>
실제 사진:   없음 | 있음(경로)

공급처 사진의 용도: identity 레퍼런스로만 쓰고 페이지에는 새로 생성한 이미지를 쓴다
                   (또는: 공급처 사진을 페이지에 직접 쓴다)

검수:        gate 3단, codex와 오케스트레이터 양쪽 모두 통과해야 진행
호스트:      codex는 tmux로 띄운다
보고:        스킬이 요구한 절차를 호스트 제약으로 생략하면 그 즉시 알린다

추가 요구:
- 공급처 사용설명서를 원문 훼손 없이 재구성해 한 섹션으로 넣는다
- <제품별 특이사항이 있으면 여기에>
```

### 프롬프트에 쓰지 않아도 되는 것

다음은 스킬 문서가 이미 강제한다. 프롬프트에 중복해 넣으면 길어지기만 하고,
스킬이 갱신될 때 프롬프트 쪽이 낡아 서로 어긋난다.

| 내용 | 담당 문서 |
| --- | --- |
| 한 화면 한 메시지, 결과 중심 제목, 보조 장점 2~3개 | `commercial.md` |
| 경쟁 페이지는 카피가 아니라 판매 논리만 참고 | `commercial.md`, `SKILL.md` |
| 의미 단위 청킹, `word-break: keep-all`, 중앙 정렬 검수 | `studio.md`, `commercial.md` |
| 정지 이미지와 GIF의 역할 분담, 기능별 모션 문법 | `assets.md` |
| 첫 프레임 가독성, 루프 이음매, 프레임 간 제품 동일성 | `assets.md` |
| 제품 정체성 고정, 존재하지 않는 부품 생성 금지 | `SKILL.md`, `commercial.md` |
| 생성 이미지에 한글 금지, 카피는 HTML로 | `assets.md` |
| 장면에 맞는 비율 배정(정방형·가로형·세로형) | `assets.md` |
| 전후 비교는 기준 컷을 먼저 만들고 레퍼런스로 이어붙이기 | `assets.md` |
| 780px 폭, 내부 메타데이터 비공개, 근거 없는 주장 금지 | `SKILL.md`, `studio.md` |

### 반드시 프롬프트에 써야 하는 것

스킬이 판단할 수 없어 매번 지정해야 한다.

- **공급처 사진의 용도.** "이미지는 공급처에서 받아서 만들어줘"는 두 가지로 읽힌다.
  사진을 페이지에 직접 쓰라는 것인지, identity 레퍼런스로만 쓰고 이미지는 새로
  생성하라는 것인지 명시한다.
- **레이아웃 특이 요구.** 배경 레이어, 겹침 구성처럼 시각적으로 구체적인 요구는
  말로만 두면 해석이 갈린다. 참고 이미지나 원하는 효과를 한 문장으로 못 박는다.
- **원문 재현이 필요한 자료.** 사용설명서, 인증서, 성분표처럼 훼손 없이 옮겨야 하는
  것이 있으면 지정한다. 기본 흐름에는 들어가지 않는다.
- **검수 강도.** gate를 몇 단으로 둘지, 어느 검수자를 쓸지.
- **호스트 제약.** 사용할 세션 형태(tmux, sub-agent 등).

### 왜 검수와 보고를 프롬프트에 넣는가

실제 제작 1건에서 나온 품질 실패가 **전량 검수 실패**였다. 생성 자체는 정상이었고,
제작자가 자기 의도를 알기 때문에 어긋난 컷을 통과시켰다. 검수 주체와 독립성을
지정하지 않으면 이 실패가 반복된다.

같은 건에서 호스트 제약으로 지시받은 실행 경로를 생략하고도 보고하지 않은 일이
있었다. 보고 의무를 프롬프트에 명시하면 이런 침묵을 막을 수 있다.

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
