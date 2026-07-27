# 상용 HTML 상세페이지에 흡수할 AI 디자인 스킬 계약

조사일: 2026-07-24

## 결론

설치할 스킬 하나를 고르는 것으로는 이 프로젝트의 목표를 충족할 수 없다. 공식 원문을 비교하면 역할이 세 층으로 나뉜다.

1. **창작 전 디렉션 계약**: Anthropic `frontend-design`의 강점이다. 제품·고객·페이지의 한 가지 목적을 먼저 고정하고, 팔레트·타이포·레이아웃·한 가지 시그니처를 계획한 뒤 “이 제품이 아니어도 나올 법한 결과인가”를 자체 비평한다. [Anthropic `frontend-design` 원문](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
2. **구현 계약**: DTCG 토큰 파일과 CSS 사용자 정의 속성으로 디자인 결정을 편집 가능한 데이터로 만들고, 카피·자산·섹션을 DOM에서 분리한다. DTCG 2025.10은 토큰을 도구 독립적인 이름/값과 타입, 그룹, 참조로 표현하며 JSON 기반 교환을 정의한다. [DTCG Format 2025.10](https://www.designtokens.org/TR/2025.10/format/) CSS 사용자 정의 속성은 한 번 수정한 값이 모든 사용처로 전파되어 편집 오류를 줄이는 목적을 명시한다. [CSS Custom Properties Level 1](https://www.w3.org/TR/css-variables-1/)
3. **생성 후 검증 계약**: Vercel의 스킬처럼 매번 최신 규칙을 읽어 파일·행 단위로 감사하고, Playwright 시각 비교·axe 접근성 검사·다중 뷰포트·Core Web Vitals로 회귀를 막는다. [Vercel `web-design-guidelines` 원문](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) [Vercel 감사 규칙 원문](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)

따라서 새 스킬은 **디자인 디렉션 잠금 → 토큰/콘텐츠/DOM 구현 → 기계 검사 → 렌더 검사 → 사람이 하는 아트디렉션 비평 → 국소 수정 후 재검사**를 필수 루프로 가져야 한다. “예쁜 HTML 생성”을 한 번 수행하는 프롬프트는 이 계약을 대체할 수 없다.

## 조사 범위와 출처 등급

공식 GitHub 저장소의 스킬 원문, 표준 단체의 규격, 공식 브라우저·테스트 도구 문서만 사용했다. 블로그 모음, 마켓플레이스 설명, 제3자의 “best skill” 목록은 제외했다.

DTCG 2025.10 문서는 2025년 10월 28일의 Final Community Group Report이며 안정적인 구현 대상으로 설명되지만, 스스로 **W3C 표준이나 W3C Standards Track 문서는 아니라고 명시**한다. 따라서 아래 제안은 이를 상호운용 가능한 파일 계약으로 채택하되 “W3C Recommendation”이라고 부르지 않는다. [DTCG 문서 상태](https://www.designtokens.org/TR/2025.10/format/#sotd)

## 공식 스킬·규칙 비교

| 원문 | 잘하는 일 | 이 프로젝트에 흡수할 것 | 그대로 흡수하지 않을 것 |
| --- | --- | --- | --- |
| [Anthropic `frontend-design`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | 제품 세계에서 시각 언어를 찾고, hero를 페이지의 논지로 만들며, 타이포·구조·모션을 의도적으로 선택한다. 4~6개 명명 색상, 2개 이상 타이포 역할, 레이아웃 아이디어, 한 가지 시그니처를 먼저 계획하고 다시 비평한다. | 제품·고객·단일 목적 잠금, hero 논지, 타이포 역할, 정보 목적에 따른 구조, 한 가지 시그니처, “genericity critique”, 구축 전/후 두 번의 비평 | 주관적 비평만으로 승인하는 방식. 토큰 스키마, 접근성, 성능, 회귀 검사가 별도로 필요하다. |
| [Anthropic `web-artifacts-builder`](https://github.com/anthropics/skills/blob/main/skills/web-artifacts-builder/SKILL.md) | React·TypeScript·Tailwind·shadcn/ui 기반의 복잡한 아티팩트를 초기화하고 단일 HTML로 번들한다. 과도한 중앙 정렬, 보라색 그라데이션, 균일한 둥근 모서리, Inter 남용을 AI식 상투성으로 지적한다. | 상투적인 시각 습관을 명시적으로 검사한다는 태도 | 모든 자산을 인라인한 단일 `bundle.html`과 “테스트는 선택”이라는 흐름. 본 프로젝트는 카피·이미지·GIF·토큰을 따로 교체해야 하고 QA가 필수이므로 충돌한다. |
| [Vercel `web-design-guidelines`](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) | 감사할 때마다 최신 공식 규칙을 가져와 지정 파일 전체를 검사하고, 결과를 `file:line`으로 보고한다. | 규칙 버전을 생성 프롬프트에 복사해 고정하지 않고, QA 시작 시 원문을 새로 읽는 freshness 계약; 결함을 파일·행·규칙 ID로 기록하는 형식 | 브랜드별 아트디렉션 생성. 이 스킬은 창작 디렉터가 아니라 감사자다. |
| [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) | 의미 있는 HTML, 포커스, 폼, 애니메이션, 타이포, 이미지, 성능, 반응형, 국제화에 대한 실행 가능한 규칙과 금지 패턴을 제공한다. | 실제 HTML 텍스트, 의미 요소 우선, 키보드 포커스, `prefers-reduced-motion`, 명시적 이미지 크기, 아래쪽 이미지 지연 로드, `transition: all` 금지, 짧음/평균/긴 콘텐츠 상태 검사 | Vercel 고유의 문장 대소문자·`&` 선호 등 브랜드 규칙. 프로젝트의 한국어 브랜드 보이스가 우선한다. |
| [Anthropic `webapp-testing`](https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md) | 정적 HTML은 소스에서 선택자를 파악하고, 동적 앱은 렌더 완료 후 스크린샷·DOM·로그를 조사한 다음 행동하는 “reconnaissance-then-action” 흐름을 쓴다. | 수정 전에 실제 렌더와 DOM을 먼저 수집하고, 수정 후 같은 관찰을 반복하는 진단 순서 | “필요할 때만 테스트”라는 선택성. 상용 상세페이지에서는 렌더 검사가 항상 필요하다. |
| [DTCG Format 2025.10](https://www.designtokens.org/TR/2025.10/format/) + [CSS Custom Properties](https://www.w3.org/TR/css-variables-1/) | 토큰의 `$value`, `$type`, `$description`, 그룹, 별칭/참조와 편집 가능한 JSON 형식을 정의하고, CSS에서 명명 값의 일괄 전파를 제공한다. | 디자인 결정을 `*.tokens.json`의 SSOT로 저장하고 CSS 변수를 생성하는 경계 | 화면을 보고 임의로 추출한 색상 목록만 “토큰”이라 부르는 것. 타입·역할·설명·참조 검증이 필요하다. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) + [Playwright 시각 비교](https://playwright.dev/docs/test-snapshots) + [Playwright 접근성 테스트](https://playwright.dev/docs/accessibility-testing) | 텍스트/비텍스트 대비, 320 CSS px reflow, 가시적 포커스, 최소 타깃 크기를 객관화하고, 승인 렌더와 픽셀 비교 및 axe 검사를 자동화한다. | 접근성 하드 게이트, 동일 환경 스크린샷 기준선, 자동 검사 뒤 수동 검사의 이중 루프 | 픽셀 diff 또는 axe 단독 통과를 디자인 승인으로 간주하는 것. Playwright도 자동 검사만으로 모든 접근성 문제를 찾을 수 없다고 명시한다. |

## 내부 스킬에 흡수할 계약

### 1. `design-direction.md`를 먼저 잠근다

HTML이나 생성 이미지를 만들기 전에 다음 항목이 모두 채워져야 한다.

- `subject`: 실제 제품과 제품군
- `audience`: 구매자와 사용 상황
- `single_job`: 이 페이지가 구매자에게 완료시킬 한 가지 판단
- `hero_thesis`: 첫 화면에서 제품 종류·핵심 가치·브랜드 분위기를 전달하는 한 문장
- `product_world`: 제품 고유의 재질, 도구, 공간, 조명, 사용 흔적
- `palette`: 역할 이름이 붙은 4~6개 색상과 대비를 검사할 전경/배경 쌍
- `type_roles`: 최소 `display`, `body`; 필요하면 `utility/data`를 추가하고 크기·굵기·행간·자간을 지정
- `layout`: 그리드·콘텐츠 폭·섹션 여백과 2개 이상의 ASCII 와이어프레임 비교
- `signature`: 이 제품과 논지를 대표하는 기억 요소 정확히 1개
- `motion`: 정보를 증명하는 모션만 적고 정지 대체 상태를 함께 지정
- `genericity_critique`: 다른 동종 제품 프롬프트에도 그대로 나올 선택, 상투적인 AI 패턴, 제거·수정한 항목

이 구조는 Anthropic 원문의 “주제·대상·페이지의 한 가지 일”, 4~6개 색상, 2개 이상 타이포 역할, 레이아웃 비교, 한 가지 시그니처, 구축 전 자체 비평을 상세페이지용으로 구체화한 것이다. [Anthropic `frontend-design`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

승인 규칙은 다음과 같다.

- hero는 단순한 큰 제목·숫자·그라데이션 조합이 아니라 전체 페이지가 입증할 논지여야 한다. [Anthropic `frontend-design`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- 번호, 눈썹 제목, 선, 라벨은 실제 순서·범주·근거 관계를 표현할 때만 쓴다. 구조적 장식이 정보를 가장하면 실패다. [Anthropic `frontend-design`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- 대담함은 시그니처 한 곳에 집중하고, 나머지는 타이포·간격·정렬의 정밀도로 받친다. [Anthropic `frontend-design`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- 페이지 길이를 동일 카드의 반복으로 채우지 않는다. `hero`, `problem`, `evidence`, `mechanism`, `comparison`, `usage`, `spec`, `decision`처럼 정보 목적별로 구도를 바꾸되 같은 토큰과 광원·제품 비율을 유지한다. “구조가 정보여야 한다”는 원칙의 프로젝트 적용이다. [Anthropic `frontend-design`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

### 2. 디자인 결정을 데이터로 잠근다

필수 산출물을 다음처럼 분리한다.

```text
planning/
  design-direction.md
  design-tokens.tokens.json
  section-storyboard.md
content.json
styles.css
assets/manifest.json
index.html
```

`design-tokens.tokens.json`은 DTCG 2025.10의 `$value`, `$type`, 그룹과 참조 문법을 따르고, 사람이 목적을 이해해야 하는 토큰에는 `$description`을 둔다. DTCG는 토큰 타입을 값 모양으로 추측하지 말고 명시·상속·참조 해석으로 결정해야 하며, 순환 참조는 오류로 다룬다. [DTCG 토큰 타입](https://www.designtokens.org/TR/2025.10/format/#type) [DTCG 참조 해석](https://www.designtokens.org/TR/2025.10/format/#references)

토큰은 두 층으로 둔다.

- **원시 토큰**: 실제 색상, 크기, 굵기, 시간, 곡선 값
- **의미 토큰**: `color.text.primary`, `color.surface.evidence`, `space.section.major`, `type.hero`, `radius.media`처럼 쓰임을 이름으로 표현하고 원시 토큰을 참조

`styles.css`의 `:root` 사용자 정의 속성은 이 파일에서 생성하거나 명시적으로 동기화한다. 반복되는 브랜드 색상·간격·타입 값은 컴포넌트 안에 흩뿌리지 않는다. CSS 명세는 사용자 정의 속성이 명명 값을 한 곳에서 바꿔 모든 사용처에 전파해 편집을 쉽고 오류를 적게 만든다고 설명한다. [CSS Custom Properties 소개](https://www.w3.org/TR/css-variables-1/#intro)

토큰 QA는 다음을 실패로 처리한다.

- `$type`을 결정할 수 없는 토큰
- 해석되지 않은 참조 또는 순환 참조
- 대소문자만 다른 이름
- 의미 토큰 없이 여러 섹션에 반복된 색상·간격·타입 리터럴
- `design-direction.md`에는 있으나 토큰 파일에 없는 결정
- 사용되지 않는 토큰과 설명 없는 예외 리터럴

### 3. 편집 가능한 DOM을 보장한다

- 로고처럼 표현 자체가 필수인 경우를 제외하고 정보 카피를 이미지에 굽지 않고 실제 HTML 텍스트로 둔다. WCAG 2.2의 Images of Text 기준도 기술로 표현할 수 있으면 이미지가 아닌 텍스트를 사용하도록 요구한다. [WCAG 2.2, 1.4.5 Images of Text](https://www.w3.org/TR/WCAG22/#images-of-text)
- 각 섹션은 독립적인 `<section data-section-id="…" data-section-purpose="…">`로 만들고, 필수 데이터·주장·자산 ID를 `content.json`과 `assets/manifest.json`에서 참조한다. 이 속성명은 프로젝트 내부 계약이지만, 의미 요소를 ARIA보다 우선하고 제목을 계층화하라는 감사 규칙에 맞춘다. [Vercel 감사 규칙](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
- 링크는 `<a>`, 동작은 `<button>`, 문서 제목은 실제 `<h1>`~`<h6>` 계층을 사용한다. 이미지에는 의미에 맞는 `alt` 또는 장식용 빈 `alt`를 둔다. [Vercel 감사 규칙](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
- 이미지·GIF에는 명시적 `width`/`height` 또는 고정 종횡비를 주어 레이아웃 공간을 예약한다. 첫 화면 핵심 이미지만 우선 로드하고 아래쪽 자산은 지연 로드한다. [Vercel 감사 규칙](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
- CSS/SVG는 배경·장식·강조에 쓰되 제품 사실을 표현하는 자산의 형태를 대신 그리거나 왜곡하지 않는다. 이는 이 프로젝트의 제품 사실 SSOT 계약이며, 디자인 규칙은 그 위에만 작동한다.

편집성은 “코드가 읽힌다”가 아니라 다음 조작 테스트로 판정한다.

1. `content.json`의 제목·본문·수치 한 항목을 바꾸면 이미지 재생성 없이 반영된다.
2. manifest의 이미지 또는 GIF 경로 한 개를 바꾸면 레이아웃이 유지된다.
3. 의미 토큰 한 개를 바꾸면 의도한 모든 사용처만 함께 바뀐다.
4. 선택 섹션 하나를 이동·복제·삭제해도 인접 섹션의 스타일과 제목 계층이 무너지지 않는다.
5. 짧은·평균·긴 카피와 빈 선택 필드를 주입해 넘침, 잘림, 빈 껍데기를 검사한다. Vercel 원문도 빈 상태와 매우 짧거나 긴 콘텐츠를 모두 설계·검사하도록 요구한다. [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)

## 필수 검증 루프

### 단계 A. 정적 감사

QA를 시작할 때 [Vercel 최신 감사 원문](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)을 새로 읽는다. 원문을 스킬 안에 영구 복사하지 않는다. 이것은 Vercel 공식 스킬이 매번 최신 규칙을 가져오도록 명시한 방식이다. [Vercel `web-design-guidelines`](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md)

다음 항목을 파일·행·규칙 ID로 보고하고 오류가 있으면 렌더 승인으로 진행하지 않는다.

- 토큰 타입·참조·미사용·예외 리터럴
- 이미지 속 텍스트, 제목 계층, `alt`, 링크/버튼 의미
- 가시적 `:focus-visible`, 키보드 접근, `prefers-reduced-motion`
- `transition: all`, 크기 없는 이미지, 첫 화면 밖의 비지연 이미지
- 끊어진 manifest 경로, 중복 `data-section-id`, 존재하지 않는 주장·자산 참조

### 단계 B. 결정론적 렌더와 시각 회귀

승인 후보를 같은 브라우저·OS·폰트 환경에서 렌더한다. Playwright는 첫 실행에서 기준 스크린샷을 만들고 이후 `toHaveScreenshot()`으로 비교할 수 있지만, 운영체제·브라우저 버전·하드웨어·헤드리스 여부가 달라지면 렌더가 달라질 수 있으므로 기준선과 비교 환경을 같게 유지하라고 명시한다. [Playwright 시각 비교](https://playwright.dev/docs/test-snapshots)

최소 렌더 매트릭스는 다음과 같이 제안한다.

| 폭 | 목적 | 통과 조건 |
| ---: | --- | --- |
| 320 CSS px | WCAG reflow 하한 | 페이지 전체의 양방향 스크롤 없이 정보·기능 유지. WCAG는 세로 스크롤 콘텐츠가 320 CSS px 폭에서 정보 손실이나 2차원 스크롤 없이 표시되도록 요구한다. [WCAG 2.2, 1.4.10](https://www.w3.org/TR/WCAG22/#reflow) |
| 360 px | 일반 모바일 | 잘린 카피·겹침·과도한 빈 공간·44 px 미만의 주요 모바일 조작 타깃 없음. Vercel은 모바일 타깃 44 px를 권장하며 WCAG 2.2 AA의 최소 기준은 예외를 제외한 24×24 CSS px다. [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) [WCAG 2.2, 2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum) |
| 800 px | 상세페이지 기준 폭 | 디자인 디렉션, 제품 비율, 타이포 줄바꿈, 섹션 리듬이 승인 기준선과 일치 |
| 1440 px | 편집·데스크톱 미리보기 | 콘텐츠가 무제한으로 늘어나지 않고 의도한 폭·정렬 유지 |

기준 스크린샷은 첫 생성물이 아니라 사람이 디자인 디렉션과 제품 동일성을 승인한 버전에서만 만든다. 이후 변경은 전체 페이지와 섹션별 스냅샷을 비교하고, 의도한 변경만 기준선을 갱신한다. Playwright는 이미지뿐 아니라 텍스트·임의 바이너리 스냅샷도 지원하므로 hero 카피와 섹션 순서도 별도로 고정할 수 있다. [Playwright 시각 비교](https://playwright.dev/docs/test-snapshots)

### 단계 C. 접근성 하드 게이트

- 일반 텍스트는 최소 4.5:1, 큰 텍스트는 최소 3:1의 대비를 검사한다. [WCAG 2.2, 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- 필수 UI 경계와 정보성 그래픽은 인접 색상 대비 최소 3:1을 검사한다. [WCAG 2.2, 1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast)
- 키보드 조작 요소의 포커스 표시가 실제로 보이는지 검사한다. [WCAG 2.2, 2.4.7](https://www.w3.org/TR/WCAG22/#focus-visible)
- `@axe-core/playwright`로 자동 검출 가능한 WCAG A/AA 위반이 0인지 검사하고 결과 JSON을 QA 산출물로 첨부한다. Playwright 공식 예제는 `AxeBuilder.analyze()` 결과의 `violations`가 빈 배열인지 검증한다. [Playwright 접근성 테스트](https://playwright.dev/docs/accessibility-testing)
- axe 통과 후에도 키보드 순서, 대체 텍스트의 의미, 확대·reflow, 모션 감소를 사람이 확인한다. Playwright 문서도 자동 검사는 일부 일반 문제만 찾으며 수동 평가와 포괄적 사용자 테스트를 함께 권장한다. [Playwright 접근성 테스트의 한계](https://playwright.dev/docs/accessibility-testing#introduction)

### 단계 D. 성능 게이트

대형 제품 이미지와 GIF를 많이 쓰는 페이지이므로 “보기에 완성됨”과 “로드 가능한 상용 페이지”를 분리하지 않는다.

- Core Web Vitals 목표는 LCP 2.5초 이하, INP 200 ms 이하, CLS 0.1 이하이며 모바일·데스크톱을 나누어 페이지 로드의 75번째 백분위수에서 평가한다. [web.dev Web Vitals](https://web.dev/articles/vitals)
- 개발 중에는 Chrome DevTools/Lighthouse 등 실험실 측정으로 LCP·CLS와 회귀를 잡되, Lighthouse 같은 무사용자 환경은 INP를 측정할 수 없으므로 배포 후 field/RUM을 별도로 수집한다. [web.dev Web Vitals의 측정 도구 설명](https://web.dev/articles/vitals#core_web_vitals_measurement)
- HTML 검사에서는 명시적 이미지 크기, 첫 화면 자산만 선로드, 아래쪽 자산 지연 로드, 필요한 글꼴만 서브셋·선로드하는지 확인한다. [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)

### 단계 E. 아트디렉션 비평

기계 검사가 통과한 전체 페이지 스크린샷을 보고 아래 질문에 모두 답한다.

1. 첫 화면만 보고 제품 종류, 핵심 가치, 브랜드 분위기를 말할 수 있는가?
2. hero의 논지를 뒤 섹션의 근거·작동·사용 장면이 실제로 입증하는가?
3. 팔레트·타입·여백·제품 크기·광원이 잠근 디렉션과 일치하는가?
4. 정보 목적이 달라질 때 구도도 달라지되, 다른 사이트를 이어 붙인 것처럼 보이지 않는가?
5. 시그니처 한 가지가 기억에 남고, 주변 장식은 이를 방해하지 않는가?
6. 이 제품명과 사진을 다른 동종 제품으로 바꿔도 거의 같은 페이지가 되는가? 그렇다면 제품 세계에서 나온 선택을 다시 넣어야 한다.
7. 모션이 한 가지 주장 또는 인과를 설명하는가? 장식만 한다면 제거한다.

이 비평은 Anthropic 원문의 hero-as-thesis, 주제에서 나온 디자인, 의도적인 타이포·구조·모션, 한 곳에 집중한 대담함, 구축 후 재비평을 상세페이지 승인 질문으로 바꾼 것이다. [Anthropic `frontend-design`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

수정은 실패한 섹션·토큰·자산 한 단위로 제한하고 **A → B → C → D → E**를 다시 돈다. 전체 페이지를 새로 생성해 이미 승인된 디자인과 제품 동일성을 흔드는 방식은 금지한다.

## 권장 QA 보고서 형식

```text
qa/
  design-critique.md
  token-report.json
  html-audit.md
  accessibility-scan.json
  visual/
    320/
    360/
    800/
    1440/
  visual-regression-report.md
  performance-report.md
  acceptance-report.md
```

`html-audit.md`는 Vercel 형식처럼 `file:line — rule — finding — required fix`로 기록한다. [Vercel 감사 출력 형식](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md#output-format) `acceptance-report.md`는 각 하드 게이트를 `pass | fail | not-run`으로 기록하며 `not-run`을 통과로 간주하지 않는다.

## 최종 제안

새 스킬 안에는 다음 다섯 모듈을 이름과 입출력이 분명한 계약으로 둔다.

1. `art-direction-lock`: 제품 사실과 구매 목적을 입력받아 `design-direction.md`를 만들고 genericity critique를 통과시킨다.
2. `design-token-compiler`: DTCG 호환 토큰을 검증하고 CSS 사용자 정의 속성으로 내보낸다.
3. `editable-section-builder`: `content.json`, asset manifest, 독립 섹션 DOM을 연결하며 정보 카피를 이미지에 굽지 않는다.
4. `fresh-rule-auditor`: 매 QA 때 Vercel 원문을 새로 읽고 파일·행 단위 정적 결함을 보고한다.
5. `render-critique-loop`: 다중 뷰포트, Playwright 시각 회귀, axe, 성능 측정, 사람의 아트디렉션 비평을 순서대로 수행하고 실패 단위만 되돌린다.

이 조합이 상용 상세페이지의 세 가지 목표를 동시에 지킨다. **일관성**은 토큰과 승인 기준선으로, **세련도**는 제품 고유 디렉션과 반복 비평으로, **편집성**은 실제 HTML 텍스트·분리 자산·독립 섹션과 조작 테스트로 검증한다.
