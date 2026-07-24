# 상업용 HTML 상세페이지 디자인 실험 메모리

상태: 계속 진화하는 실험 기록

작성일: 2026-07-24

현재 실험 대상: `prototypes/domeggook-43314131/detail-page/index.html`

관련 영구 계약: [`commetial-detail-page.md`](commetial-detail-page.md)

## 0. 이 문서의 역할

이 문서는 두 오픈소스 저장소에서 발견한 설계 방법을 상업용 상세페이지에 시험하기 위한 **후보 규칙·실험·판정 기록**이다. 아직 검증되지 않은 아이디어를 영구 규칙처럼 쓰지 않는다.

- 출처 저장소의 문장, 브랜드 스타일, 색상값, 글꼴값, 레이아웃을 복제하지 않는다.
- 직접 채택한 일반 규칙과 상업 상세페이지에 맞게 변환한 규칙을 구분한다.
- 한 번에 작은 변화 하나만 시험하고, 같은 rubric과 같은 뷰포트로 전후를 비교한다.
- 사실 정확성, 실제 SKU 동일성, 플랫폼 규칙은 모든 디자인 실험보다 우선한다.
- 실험이 실패해도 기록을 삭제하지 않는다. 실패 이유가 다음 제작의 입력이다.
- 이 문서는 실험 메모리다. 영구 계약을 자동으로 변경하지 않으며, 승격 조건을 만족한 규칙만 별도 승인 후 영구 계약 후보가 된다.

### 상태 표기

| 상태 | 의미 |
|---|---|
| `candidate` | 출처에서 발견했으나 아직 이 프로젝트에서 시험하지 않음 |
| `testing` | 전후 증거를 수집 중 |
| `adopted-local` | 현재 상세페이지에서만 효과가 확인됨 |
| `promote-candidate` | 두 개 이상의 서로 다른 상품에서 재현되어 영구 계약 후보가 됨 |
| `held` | 가치가 있을 수 있으나 자료·표본·권한이 부족함 |
| `rejected` | 실패 기준을 충족해 현재 방식으로는 사용하지 않음 |
| `rolled-back` | 한때 채택했으나 후속 증거로 되돌림 |

## 1. 조사 범위와 1차 출처

### A. VoltAgent `awesome-design-md`

- 저장소: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
- 루트 README: [README — What’s Inside Each DESIGN.md](https://github.com/VoltAgent/awesome-design-md#whats-inside-each-designmd)
- 실제 컬렉션 구조: [`design-md/`](https://github.com/VoltAgent/awesome-design-md/tree/main/design-md)
- 실제 표본: [Apple `DESIGN.md`](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md)
- 표본 폴더: [Apple 폴더](https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/apple)
- 기여 규칙: [`CONTRIBUTING.md`](https://github.com/VoltAgent/awesome-design-md/blob/main/CONTRIBUTING.md)

#### 직접 관찰

1. 루트 README는 각 `DESIGN.md`가 분위기, 색 역할, 타이포 위계, 컴포넌트, 레이아웃, 깊이, Do/Don’t, 반응형, 에이전트 지침을 한 문서에 담는다고 설명한다.
2. 실제 `design-md/`는 여러 브랜드별 하위 폴더를 가진다. 즉 하나의 거대한 보편 스타일이 아니라, **프로젝트별 디자인 계약**을 분리하는 구조다.
3. Apple 표본은 기계 판독 가능한 토큰 블록과 사람이 읽는 설명을 함께 제공한다. 색·타입·간격·곡률·컴포넌트가 이름으로 연결되고, 아래 서술이 그 사용 조건을 설명한다.
4. 같은 표본의 `Do's and Don'ts`, `Responsive Behavior`, `Iteration Guide`, `Known Gaps`는 좋은 모양뿐 아니라 금지·축소·미확인 영역까지 기록한다.
5. `Iteration Guide`는 한 번에 컴포넌트 하나에 집중하고 토큰 참조를 쓰는 방식을 제안한다.
6. `CONTRIBUTING.md`는 라이브 원본과 비교하고, 변경 전후의 이유를 남기라고 요구한다. 이는 “수정했다”가 아니라 “무엇이 나아졌는가”를 증명하는 변경 방식이다.
7. 루트 README는 각 사이트에 preview HTML이 있다고 설명하지만, 조사 시점의 Apple 폴더에는 `DESIGN.md`와 외부 페이지를 안내하는 `README.md`만 보였다. 따라서 **README의 요약보다 실제 현재 트리와 파일을 우선 확인**해야 한다.

#### 가져오지 않는 것

- Apple, Nike, Airbnb 등 개별 브랜드의 실제 색상·폰트·수치·라운드·그림자
- 특정 브랜드처럼 보이게 만드는 사진 구도와 카피
- “유명 브랜드가 썼으니 좋다”는 권위 전이
- 외부 preview가 현재 저장소 안에 있다고 가정하는 문서 구조

### B. Owl-Listener `ai-design-skills`

- 저장소: [Owl-Listener/ai-design-skills](https://github.com/Owl-Listener/ai-design-skills)
- 루트 README: [6개 설계 층과 출처 체계](https://github.com/Owl-Listener/ai-design-skills/blob/main/README.md#L17-L21)
- 실제 스킬 구조: [`skills/`](https://github.com/Owl-Listener/ai-design-skills/tree/main/skills)
- 생성 UI 제약: [`generative-ui/SKILL.md`](https://github.com/Owl-Listener/ai-design-skills/blob/main/skills/model-interaction-design/generative-ui/SKILL.md#L11-L29)
- 단계적 공개: [`progressive-disclosure/SKILL.md`](https://github.com/Owl-Listener/ai-design-skills/blob/main/skills/model-interaction-design/progressive-disclosure/SKILL.md#L14-L28)
- 투명성: [`transparency-patterns/SKILL.md`](https://github.com/Owl-Listener/ai-design-skills/blob/main/skills/ai-alignment-reasoning/transparency-patterns/SKILL.md#L7-L31)
- 신뢰 보정: [`trust-calibration/SKILL.md`](https://github.com/Owl-Listener/ai-design-skills/blob/main/skills/ai-alignment-reasoning/trust-calibration/SKILL.md#L21-L37)
- 품질 rubric: [`output-quality-rubrics/SKILL.md`](https://github.com/Owl-Listener/ai-design-skills/blob/main/skills/evaluation/output-quality-rubrics/SKILL.md#L5-L35)
- 제약 명세: [`constraint-specification/SKILL.md`](https://github.com/Owl-Listener/ai-design-skills/blob/main/skills/prompt-architecture/constraint-specification/SKILL.md#L5-L50)
- 연구 번역 추적: [README의 `REFERENCES.md`·`RESEARCH.md` 설명](https://github.com/Owl-Listener/ai-design-skills/blob/main/README.md#L126-L131)

#### 직접 관찰

1. 루트 README는 저장소를 model interaction, alignment reasoning, system behaviour, evaluation, agent orchestration, prompt architecture의 여섯 층으로 나눈다.
2. 실제 `skills/`도 여섯 범주로 나뉜다. 규칙, 평가, 오케스트레이션을 뒤섞지 않고 역할별로 분리하는 구조다.
3. `generative-ui`는 생성 결과를 무제한 화면으로 보지 않고 컴포넌트 집합, 레이아웃, 스타일 경계, 상호작용, 접근성 제약 안에서 생성하도록 한다.
4. 같은 문서는 사용자가 예측 가능한 안정적 인터페이스를 기대하거나 접근성을 보장할 수 없을 때 생성 UI를 쓰지 말라고 한다.
5. `transparency-patterns`는 출처, 한계, 확실성, 공개 수준을 과업의 위험과 사용자 필요에 맞추라고 한다. 설명처럼 보이지만 정보가 없는 “투명성 연극”도 금지한다.
6. `trust-calibration`은 근거가 약한 결과를 굵은 제목과 단정적 형식으로 포장하는 것을 `trust laundering`으로 분류한다.
7. `output-quality-rubrics`는 평가 차원, 점수 앵커, 가중치, 모호한 사례 처리 규칙이 있어야 평가자 간 편차를 줄일 수 있다고 설명한다.
8. `constraint-specification`은 제약을 구체화하고, hard/soft를 나누고, 충돌 우선순위와 경계 사례를 시험하라고 한다.
9. README는 `REFERENCES.md`와 `RESEARCH.md`를 통해 원 연구와 실무 번역을 구분한다고 명시한다. 이 문서도 같은 이유로 직접 채택과 도메인 변환을 분리한다.

#### 가져오지 않는 것

- AI 기능을 사용자 숙련도에 따라 잠금 해제하는 온보딩
- 상세페이지 방문 중 모델이 카드와 레이아웃을 실시간으로 재생성하는 방식
- 모델의 chain-of-thought나 내부 추론 흔적
- AI 확률을 상품 사실의 확실성처럼 표시하는 방식
- 모든 문장에 불확실성 배지를 붙이는 과잉 고지
- AI 페르소나·아첨·멀티에이전트 규칙을 구매자용 화면에 직접 노출하는 방식

## 2. 직접 채택 규칙

아래 규칙은 출처의 의미를 상업 상세페이지에서도 바꾸지 않고 사용할 수 있다. 단, 개별 브랜드 값은 채택하지 않는다.

| ID | 규칙 | 1차 출처 | 현재 상태 |
|---|---|---|---|
| `D-01` | 디자인 계약에 시각 분위기뿐 아니라 색 역할, 타입 위계, 간격, 컴포넌트, 금지, 반응형, 알려진 공백을 함께 기록한다. | awesome-design-md README·Apple 표본 | `candidate` |
| `D-02` | 색상·간격·타입·곡률은 의미 이름을 가진 토큰으로 참조하고 새 섹션에서 임의 값을 늘리지 않는다. | Apple `DESIGN.md` Iteration Guide | `candidate` |
| `D-03` | 한 번에 컴포넌트 하나만 바꾸고 변경 전후 이유와 화면 증거를 남긴다. | Apple Iteration Guide·CONTRIBUTING | `adopted-local` |
| `D-04` | 반응형은 단순 축소가 아니라 열 접기, 타입 축소, 이미지 아트 디렉션, 터치 목표를 명시한다. | Apple `DESIGN.md` Responsive Behavior | `candidate` |
| `D-05` | 생성 가능한 화면을 허용된 컴포넌트, 레이아웃, 스타일, 상호작용, 접근성 제약 안에 둔다. | `generative-ui` | `candidate` |
| `D-06` | 예측 가능성과 접근성을 보장해야 하는 공개 페이지는 런타임 자유 생성 대신 안정된 HTML을 사용한다. | `generative-ui` When Not to Use It | `candidate` |
| `D-07` | 출처, 한계, 미확인 영역을 구매 판단에 필요한 수준으로 표시한다. | `transparency-patterns` | `adopted-local` |
| `D-08` | 근거의 강도보다 시각적 확신이 강해지지 않게 한다. | `trust-calibration` | `candidate` |
| `D-09` | 품질 평가는 차원, 1~5점 앵커, 가중치, 경계 사례를 먼저 고정한다. | `output-quality-rubrics` | `adopted-local` |
| `D-10` | 제약은 hard/soft로 나누고 충돌 우선순위, 위반 예, 경계 테스트를 기록한다. | `constraint-specification` | `candidate` |

## 3. 상업 상세페이지용 변환 규칙

아래는 원문 아이디어를 상품 판매 문맥에 맞게 바꾼 규칙이다. 원문과 같은 규칙이라고 주장하지 않는다.

| ID | 원 아이디어 | 상세페이지 변환 | 현재 상태 |
|---|---|---|---|
| `T-01` | 프로젝트별 `DESIGN.md` | 상품마다 `제품 동일성 + 주장-근거 + 디자인 토큰 + 반응형 + 금지`를 묶은 생성 계약을 둔다. | `candidate` |
| `T-02` | Progressive disclosure의 surface/intermediate/power | `첫 화면 핵심 가치 → 사용·구조 이해 → 치수·재질·원산지·주의·출처`의 구매 정보 깊이로 바꾼다. | `adopted-local` |
| `T-03` | AI confidence와 limitation | `공급처 원문 확인 / 사용자 승인 대기 / 시험 근거 없음 / 미확인 / 공개 금지`의 상품 사실 상태로 바꾼다. | `candidate` |
| `T-04` | Generative UI component library | `hero / use-proof / structure / specs / source-note`처럼 허용된 편집 가능 DOM 모듈만 조립한다. | `candidate` |
| `T-05` | Trust calibration | 제목 크기, 색 대비, 수치 배지의 시각 권위가 주장 근거의 강도를 넘지 않도록 보정한다. | `candidate` |
| `T-06` | Feedback loop | 구매자 반응 UI가 아니라 제작 중 카피·이미지 변경, 승인 대기, 저장 완료를 보여주는 편집 피드백으로 바꾼다. | `candidate` |
| `T-07` | General output rubric | 사실·동일성과 주장 근거에 가장 큰 가중치를 둔 상세페이지 전용 rubric으로 바꾼다. | `adopted-local` |
| `T-08` | Preview와 before/after rationale | 같은 브라우저·뷰포트·콘텐츠로 전후 캡처하고 점수 차이와 부작용을 기록한다. | `adopted-local` |

## 4. 보류·거부 규칙

| ID | 판정 | 항목 | 이유 |
|---|---|---|---|
| `H-01` | `held` | `<details>`로 근거와 한계를 접어 두기 | 정보 과부하는 줄일 수 있지만 중요한 구매 조건이 숨을 수 있다. 핵심 사실은 항상 펼치고 부가 출처에만 제한할지 시험이 필요하다. |
| `H-02` | `held` | 상세페이지용 별도 토큰 preview 페이지 | 유지보수에는 유용하지만 현재 단일 HTML 편집 흐름에서 산출물 증가 비용을 확인해야 한다. |
| `H-03` | `held` | 편집 모드의 “수정됨·저장 전” 상태 | 제작 UX에는 유용하나 구매자 화면과 분리되는지, 저장된 HTML에 상태가 남지 않는지 검증해야 한다. |
| `R-01` | `rejected` | 유명 브랜드의 실제 색·폰트·간격값 이식 | 상품 정체와 무관하며 복제 위험이 있다. |
| `R-02` | `rejected` | 방문 때마다 모델이 레이아웃을 재생성 | 결과 재현성, 접근성, 플랫폼 호환성을 보장할 수 없다. |
| `R-03` | `rejected` | 검증 안 된 주장에 큰 숫자·강한 색·전문적 도해 적용 | 근거보다 시각 권위가 강한 `trust laundering`이다. |
| `R-04` | `rejected` | AI 내부 추론 또는 chain-of-thought를 상품 근거로 공개 | 제품 증거가 아니며 투명성처럼 보이는 잡음이 된다. |
| `R-05` | `rejected` | 모든 카피에 불확실성 배지 부착 | 진짜 위험 신호를 약화하고 구매 정보를 방해한다. |
| `R-06` | `rejected` | AI 기능용 onboarding·기능 잠금 해제를 판매 서사에 사용 | 판매 상세페이지의 목적과 사용자 기대에 맞지 않는다. |

## 5. 현재 HTML 기준선 관찰

대상 파일은 읽기 전용으로 조사했으며 이번 작업에서는 수정하지 않는다.

### 이미 잘 갖춘 부분

- `:root`에 색, 곡률, 폭, 글꼴 토큰이 있다.
- 섹션에 안정적인 `id`와 `data-section`이 있다.
- 기능·규격·재질 섹션에 `data-fact-id`가 연결되어 있다.
- `data-editable`, `data-replaceable`, `data-asset-id`로 카피와 자산을 교체할 수 있다.
- 620px 반응형, `prefers-reduced-motion`, 인쇄 스타일이 있다.
- 모션을 실제 성능 증거로 사용하지 않는다는 캡션이 있다.
- 재질에서 시험 없는 녹 방지·위생·내구 주장을 제외한다고 명시한다.

### 실험할 수 있는 공백

- 정보 깊이가 DOM에서 명시되지 않아 새 섹션을 삽입할 때 서사 층위가 흔들릴 수 있다.
- `data-fact-id`는 있지만 `공급처 표시 / 시연 참조 / 시험 근거 없음 / 승인 대기` 같은 공개 상태의 문법은 통일되어 있지 않다.
- 색 토큰은 있으나 간격·타입 크기·컴포넌트 상태 토큰은 상대적으로 덜 구조화되어 있다.
- 편집 중 무엇이 바뀌었고 저장됐는지 블록별 피드백이 없다.
- 현재 소스 메모와 근거 캡션의 시각 계층이 하나의 규칙으로 정의되어 있지 않다.

## 6. 첫 번째 작은 실험

실험 ID: `EXP-001`

상태: `adopted-local`

목적: 제품 디자인을 바꾸지 않고 **정보 깊이와 증거 상태를 더 빨리 이해하게 할 수 있는지** 확인한다.

### 가설

기존 섹션에 정보 층위 메타데이터를 붙이고 기능 3컷 아래에 한 줄짜리 표준 근거 캡션을 추가하면, 사용자가 기능의 종류와 근거 범위를 더 정확히 구분하면서도 페이지의 감정적 리듬과 읽기 속도는 나빠지지 않는다.

### 적용 범위

오직 다음 기존 요소만 대상으로 한다.

1. 섹션에 `data-disclosure-level` 추가
2. `#functions .use-grid` 바로 아래에 표준 근거 캡션 한 줄 추가
3. 새 색·폰트·이미지·카피 주장 추가 금지
4. 섹션 순서, 제품 이미지, 제품 실루엣, 모션, 수치 변경 금지

### 정보 층위 매핑

| 층위 | 기존 섹션 |
|---|---|
| `surface` | `hero`, `context` |
| `intermediate` | `functions`, `motion-guide`, `dual-edge` |
| `proof` | `specifications`, `material`, `storage`, `product-facts`, `source-note` |

이 속성은 우선 제작·QA용 메타데이터다. 구매자에게 `surface` 같은 내부 용어를 노출하지 않는다.

### 근거 캡션 후보

> 공급처 시연 이미지 기준 · 기능 종류를 설명하는 자료이며 일정한 절삭 결과를 보장하지 않습니다.

이 문장은 신규 효능 주장이 아니다. 기존 기능 사실의 출처와 한계를 한곳에 묶는 실험 문구다. 실제 적용 전 `claim-evidence-map`과 사용자 승인을 다시 확인한다.

### 이 실험이 작은 이유

- 기존 DOM 구조와 섹션 순서를 유지한다.
- 기존 `.evidence-note` 스타일을 재사용할 수 있다.
- 자산을 새로 만들지 않는다.
- 실패하면 속성 10개와 캡션 한 줄만 되돌리면 된다.

### 적용하지 않는 것

- `430` 수치를 더 크게 만들지 않는다.
- `녹슬지 않음`, `위생적`, `안전`, `일정한 두께`를 추가하지 않는다.
- 근거 상태별 화려한 배지나 신호등 색을 추가하지 않는다.
- 모바일에서 캡션을 숨기지 않는다.

### 2026-07-24 실행 결과

#### Evidence Record

- experiment_id: `EXP-001`
- rule_ids: `D-03`, `D-07`, `D-09`, `T-02`, `T-07`, `T-08`
- tested_at: `2026-07-24`
- evaluator: Codex
- source_file: `prototypes/domeggook-43314131/detail-page/index.html`
- source_file_sha256_before: `BAC6BCA37C3D8D8C71EEF9C7AC95BE481922B0938C5A1CD0C51BA08112B5068E`
- source_file_sha256_after: `475DA4758B9F521D83FFE80AA337F887C53EA7C1AC803B5A452F9D151BA5DE60`
- browser_recording_path: `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\detail-page-exp001-final-qa`
- target_url: `http://127.0.0.1:4174/prototypes/domeggook-43314131/detail-page/index.html`

#### Fixed conditions

- content/assets: 동일
- viewport: 800×1200, 360×900
- device_scale_factor: 1
- reduced_motion: 일반 모션과 `reduce`를 각각 검증
- before capture: `.artifacts/exp001-before-800.png`, `.artifacts/exp001-before-360.png`
- after capture: `.artifacts/exp001-after-800.png`, `.artifacts/exp001-after-360.png`

#### 검증

- 10개 섹션과 source note에 허용된 `surface / intermediate / proof` 값만 존재한다.
- 모든 `[data-fact-id]`가 비어 있지 않다.
- `img:not([alt])`는 0개다.
- 800px과 360px 모두 `scrollWidth === clientWidth`다.
- 편집 모드에서 61개 요소가 `contenteditable`로 전환되고 저장 버튼이 표시된다.
- 편집 버튼 높이는 44px, 사실 본문 16px, 근거 캡션 12px다.
- 축소 모션에서 GIF 2개가 각각 정지 poster로 교체되고 모든 reveal이 보인다.
- HTML은 36,511B에서 37,309B로 798B 증가했고 이미지 용량 변화는 없다.
- 페이지 길이는 800px에서 82px, 360px에서 103px 증가했다.

#### Rubric

| 항목 | 전 | 후 | 가중 변화 |
|---|---:|---:|---:|
| 사실·제품 동일성 | 4/5 | 4/5 | 0 |
| 주장-근거 보정 | 3/5 | 4/5 | +5 |
| 정보 위계·이해 | 4/5 | 4/5 | 0 |
| 접근성·반응형 | 5/5 | 5/5 | 0 |
| 편집성·일관성 | 4/5 | 5/5 | +2 |
| 성능·시각 절제 | 4/5 | 4/5 | 0 |
| 가중 총점 | 78/100 | 85/100 | +7 |

#### Decision

- status: `adopted-local`
- reason: 하드 실패 없이 주장 한계가 기능 시연 바로 아래로 이동했고 총점이 7점 상승했다. 사실·제품 동일성은 낮아지지 않았으며 360px·800px 무결성, 편집 기능과 축소 모션이 유지됐다.
- rollback_steps: `.functions__evidence` 규칙과 캡션 한 줄, 11개 `data-disclosure-level` 속성을 제거한다.
- trade-off: 설명 길이가 82~103px 늘었다. 다른 상품에서 같은 효과가 재현되기 전에는 영구 계약으로 승격하지 않는다.

## 7. 후속 소규모 실험 후보

| 실험 ID | 변화 | 확인할 질문 | 선행 조건 |
|---|---|---|---|
| `EXP-002` | facts 섹션 하나에서 타입·간격을 의미 토큰으로 치환 | 토큰화가 수정 속도와 일관성을 높이는가 | `EXP-001` 판정 완료 |
| `EXP-003` | 편집한 블록에만 `수정됨·저장 전` 표시 | 저장 상태를 오해하지 않게 하는가 | 편집 UI와 공개 HTML 분리 방법 확정 |
| `EXP-004` | 부가 출처만 `<details>`로 접기 | 정보 과부하를 줄이면서 한계가 묻히지 않는가 | 핵심 사실은 항상 펼침 |
| `EXP-005` | facts 섹션의 모바일 표 구조만 재설계 | 360px에서 스캔 속도가 좋아지는가 | 동일 카피·동일 순서 고정 |
| `EXP-006` | 허용 섹션 목록을 생성 계약으로 선언 | 새 페이지 생성 시 임의 레이아웃 분산이 줄어드는가 | 최소 두 상품에서 생성 비교 |

한 번에 둘 이상을 묶어 시험하지 않는다. 묶으면 어느 규칙이 점수 변화의 원인인지 알 수 없다.

## 8. 채택·보류·거부 판정 기준

### 채택

다음을 모두 충족하면 `adopted-local`로 바꾼다.

1. 하드 실패가 없다.
2. 가중 총점이 기준선보다 5점 이상 오른다.
3. `사실·동일성` 점수가 낮아지지 않는다.
4. `주장-근거`가 최소 1점 앵커만큼 좋아진다.
5. 360px과 800px 모두 수평 스크롤·겹침·글자 잘림이 없다.
6. 화면 증거, DOM 검증, 변경 diff, 판정 이유가 기록되어 있다.
7. 되돌림 단위가 명확하다.

### 보류

다음 중 하나면 `held`로 둔다.

- 총점 변화가 0~4점으로 작아 효과를 확신할 수 없다.
- 평가자 간 점수 차이가 한 항목에서 2점 이상이다.
- 가독성은 좋아졌지만 페이지 길이·성능·감성 리듬이 악화되는 등 trade-off가 남는다.
- 승인된 사실·실물 자산·모바일 증거가 부족하다.
- 한 상품에서만 통하고 다른 상품으로 일반화할 근거가 없다.

### 거부

다음 중 하나면 `rejected`로 바꾼다.

- 제품 형태, 사실, 수치, 근거 범위를 오인하게 한다.
- 근거보다 더 큰 시각 권위를 부여한다.
- 접근성 또는 반응형 하드 실패가 생긴다.
- 브랜드·참고작 복제 없이는 성립하지 않는다.
- 편집 가능성을 낮추거나 카피를 이미지에 굽는다.
- 런타임 결과가 재현되지 않는다.
- 전체 점수가 낮아지거나 핵심 항목 하나가 2점 이상 하락한다.

## 9. 전후 평가 rubric

각 항목은 1~5점으로 평가한다. 가중 점수는 `항목 점수 ÷ 5 × 가중치`로 계산한다.

| 평가 항목 | 가중치 | 1점 앵커 | 3점 앵커 | 5점 앵커 |
|---|---:|---|---|---|
| 사실·제품 동일성 | 30 | SKU·수치·기능이 오인되거나 출처가 끊김 | 사실은 맞지만 일부 출처·상태가 불명확 | 모든 제품 표현과 수치가 원문·자산·상태에 추적됨 |
| 주장-근거 보정 | 25 | 근거 없는 주장이 강하게 보임 | 주요 주장에는 근거가 있으나 범위·한계가 멀리 있음 | 주장 바로 옆에서 출처·범위·한계를 정확히 이해함 |
| 정보 위계·이해 | 15 | 핵심 효용과 구매 조건을 찾기 어려움 | 순서는 이해되지만 일부 섹션 역할이 겹침 | 가치→사용→구조→증거→구매 정보가 빠르게 구분됨 |
| 접근성·반응형 | 15 | 잘림, 낮은 대비, 대체 수단 누락 | 주요 폭에서 사용 가능하나 작은 결함이 있음 | 360·800px, 키보드, 대체 텍스트, 축소 모션 모두 통과 |
| 편집성·일관성 | 10 | 값이 하드코딩되고 변경 범위를 알 수 없음 | 일부 토큰·ID를 사용 | 카피·자산·토큰·섹션을 안전하게 교체하고 되돌릴 수 있음 |
| 성능·시각 절제 | 5 | 장식·모션·용량이 정보보다 큼 | 큰 문제는 없으나 불필요 요소가 남음 | 추가 비용이 작고 시각 권위가 근거 강도와 일치 |

### 하드 실패

- 실제 SKU와 다른 실루엣·칼날·고리·재질색
- 공개 불가 주장 또는 미승인 사실 노출
- 근거 없는 녹 방지·위생·내구·안전·일정 두께 주장
- 360px에서 수평 스크롤 또는 핵심 카피 잘림
- 의미 있는 이미지의 대체 텍스트 손실
- 축소 모션 환경에서 정보 손실
- 기존 편집·저장 기능 파손

## 10. 브라우저 증거 기록 형식

모든 실험은 browser-harness로 같은 조건에서 전후를 기록한다.

```md
### Evidence Record

- experiment_id:
- rule_ids:
- tested_at:
- evaluator:
- source_file:
- source_file_sha256:
- browser_recording_path:
- target_url:
- browser_title:
- browser_version:

#### Fixed conditions
- content/assets:
- 800px viewport:
- 360px viewport:
- reduced_motion:
- device_scale_factor:
- scroll_position_or_section:

#### Before
- full_page_capture:
- 800px_capture:
- 360px_capture:
- DOM assertions:
- horizontal_overflow:
- contrast_check:
- rubric scores:

#### After
- full_page_capture:
- 800px_capture:
- 360px_capture:
- DOM assertions:
- horizontal_overflow:
- contrast_check:
- rubric scores:

#### Delta
- weighted_score_before:
- weighted_score_after:
- hard_failures_before:
- hard_failures_after:
- file_size_delta:
- image_weight_delta:
- unexpected_side_effects:

#### Decision
- status: adopted-local | held | rejected | rolled-back
- reason:
- rollback_steps:
- follow_up:
```

### 필수 DOM 확인

- 모든 `[data-fact-id]`가 빈 값이 아닌가
- 새 `[data-disclosure-level]` 값이 허용 목록 안에 있는가
- `img:not([alt])`가 없는가
- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`인가
- `prefers-reduced-motion: reduce`에서 `.reveal`이 보이는가
- 편집 모드에서 `data-editable`, `data-replaceable`이 계속 작동하는가
- 저장한 HTML을 다시 열어도 변경과 접근성 속성이 남는가

## 11. 기억 승격 규칙

`adopted-local`은 현재 상품에서만 유효하다. 영구 규칙 후보가 되려면 다음을 모두 만족한다.

1. 서로 다른 상품군 두 개 이상에서 같은 규칙을 독립적으로 시험한다.
2. 두 실험 모두 동일 rubric에서 채택 기준을 통과한다.
3. 사실·동일성·접근성 하드 실패가 없다.
4. 특정 브랜드 자산이나 특정 카피에 의존하지 않는다.
5. 규칙이 “무엇을 하라”뿐 아니라 “언제 하지 말라”도 설명한다.
6. 출처, 변환 과정, 전후 증거, trade-off가 남아 있다.
7. 영구 계약과 충돌하지 않는다.
8. 사용자 또는 프로젝트 책임자가 승격을 승인한다.

승격 시 이 문서의 상태를 `promote-candidate`로 바꾸고, 영구 계약에는 압축된 규칙만 제안한다. 실험의 세부 증거와 실패 이력은 이 문서에 남긴다.

## 12. 되돌림 규칙

다음 상황이면 채택 규칙을 즉시 재검토한다.

- 후속 상품에서 사실 오인이나 제품 동일성 회귀가 발생
- 플랫폼 정책 또는 접근성 기준 변경
- 출처 저장소의 규칙이 수정·철회되거나 관찰 근거가 잘못된 것으로 확인
- 페이지 성능, 편집성, 모바일 가독성이 누적해서 악화
- 규칙이 템플릿 고착을 만들어 서로 다른 상품이 같은 페이지처럼 보임
- 근거 고지가 너무 많아 핵심 구매 정보를 방해

되돌릴 때 기록을 삭제하지 않는다.

1. 상태를 `rolled-back`으로 바꾼다.
2. 최초 채택 근거와 새 반증을 함께 링크한다.
3. 영향을 받은 파일·섹션·토큰을 적는다.
4. 최소 변경으로 이전 상태를 복원한다.
5. 같은 실패를 막을 경계 조건을 후보 규칙에 추가한다.

## 13. 실험 로그

| 날짜 | 실험 | 상태 | 대상 | 결과 증거 | 다음 행동 |
|---|---|---|---|---|---|
| 2026-07-24 | `EXP-001` 실행 | `adopted-local` | 도매꾹 43314131 상세페이지 | 78→85점, 하드 실패 없음, 800·360px 통과 | 다른 상품군 1개 이상에서 독립 재시험 |

## 14. 다음 실행 체크리스트

- [x] 현재 `index.html`의 SHA-256을 기록한다.
- [x] browser-harness 녹화를 시작하고 정확한 저장 경로를 기록한다.
- [x] 800px·360px 기준선을 같은 콘텐츠와 위치에서 캡처한다.
- [x] 기준선 rubric을 먼저 채점한다.
- [x] `EXP-001` 외 변경을 하지 않는다.
- [x] 새 주장을 추가하지 않고 기존 근거 범위만 설명한다.
- [x] DOM·반응형·축소 모션·편집·저장 기능을 검증한다.
- [x] 같은 조건으로 후속 화면을 캡처한다.
- [x] 점수보다 하드 실패를 먼저 판정한다.
- [x] `adopted-local`, `held`, `rejected` 중 하나로 기록한다.
- [x] 결과와 되돌림 단위를 기록한다.

---

핵심 원칙은 단순하다. **디자인 규칙은 출처가 있어야 하고, 상품에 맞게 변환한 부분은 변환이라고 밝혀야 하며, 작은 전후 실험으로 이득을 증명하기 전에는 영구 기억으로 승격하지 않는다.**
