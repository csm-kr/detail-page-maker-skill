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
| `H-03` | `held` | 편집 모드의 “수정됨·저장 전” 상태 | `EXP-003`에서 구매자 화면 분리와 저장 흐름은 통과했지만 가중 점수 상승이 +2점에 그쳐 영구 규칙 채택 기준에는 미달했다. 현재 상품의 편집 기능으로만 유지한다. |
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

## 7. 두 번째 작은 실험

실험 ID: `EXP-003`

상태: `held`

목적: 구매자 화면을 바꾸지 않고 편집자가 현재 HTML의 저장 필요 상태를 오해하지 않게 할 수 있는지 확인한다.

### 적용 범위

1. 편집 패널이 열린 동안에만 보이는 `role="status"` 문구
2. `clean / dirty / saved` 세 상태
3. 텍스트·색상·이미지 변경 이벤트를 `dirty`에 연결
4. 저장 후 편집 패널을 닫고 상태 문구를 구매자 화면에서 숨김
5. 상품 카피·이미지·섹션·색 토큰·모션 변경 금지

### 2026-07-24 실행 결과

#### Evidence Record

- experiment_id: `EXP-003`
- rule_ids: `D-03`, `T-06`, `T-08`
- tested_at: `2026-07-24`
- evaluator: Codex
- source_file: `prototypes/domeggook-43314131/detail-page/index.html`
- source_file_sha256_before: `C17D3A58A7C1AB9BBBB7A4232DD35C87A995290DD3589491E923206BB6F04D41`
- source_file_sha256_after: `701829B4A3803F05B9A333BA015975387C817C0287CDF2BF9DD771254E6EDB74`
- browser_recording_path: `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\detail-page-finalization-baseline`
- target_url: `http://127.0.0.1:4174/prototypes/domeggook-43314131/detail-page/index.html`

#### Fixed conditions

- content/assets: 동일
- viewport: 800×1200
- device_scale_factor: 1
- before capture: `.artifacts/final-v1-before-exp003-800.png`
- clean-state capture: `.artifacts/exp003-clean-800.png`
- dirty-state capture: `.artifacts/exp003-dirty-800.png`

#### 검증

- 일반 구매자 화면에서 상태 문구의 computed display는 `none`이다.
- 편집 모드에서 상태 문구가 `편집 준비 · 변경 없음`으로 표시된다.
- 실제 `input` 이벤트 후 `수정됨 · HTML 저장 필요`와 `data-state="dirty"`가 표시된다.
- 저장 처리 후 `저장됨 · 수정본 다운로드 완료`로 바뀌고 편집 패널이 닫힌다.
- 편집 모드의 61개 `contenteditable`, 9개 교체 이미지와 세 색상 입력이 유지된다.
- 상태 문구는 `role="status"`, `aria-live="polite"`로 보조기술에 전달된다.
- HTML은 37,786B에서 39,573B로 1,787B 증가했고 이미지 용량 변화는 없다.
- 320·360·390·768·800px에서 가로 overflow는 모두 0이다.

#### Rubric

| 항목 | 전 | 후 | 가중 변화 |
|---|---:|---:|---:|
| 사실·제품 동일성 | 4/5 | 4/5 | 0 |
| 주장-근거 보정 | 5/5 | 5/5 | 0 |
| 정보 위계·이해 | 4/5 | 4/5 | 0 |
| 접근성·반응형 | 5/5 | 5/5 | 0 |
| 편집성·일관성 | 4/5 | 5/5 | +2 |
| 성능·시각 절제 | 4/5 | 4/5 | 0 |
| 가중 총점 | 88/100 | 90/100 | +2 |

#### Decision

- status: `held`
- reason: 구매자 화면 분리, 편집 상태 전달, 반응형과 접근성은 통과했지만 채택 기준인 총점 +5와 주장-근거 개선을 충족하지 못했다.
- current_use: 현재 도매꾹 43314131 HTML의 편집 기능으로만 유지한다.
- rollback_steps: `.editor__status` CSS와 상태 문구 한 개, `setEditorStatus`, `markDirty`, 변경 이벤트 연결을 제거한다.
- follow_up: 다른 상품의 편집 오류 감소 또는 저장 누락 감소를 실제로 관찰하기 전에는 영구 계약으로 승격하지 않는다.

## 8. 후속 소규모 실험 후보

| 실험 ID | 변화 | 확인할 질문 | 선행 조건 |
|---|---|---|---|
| `EXP-002` | facts 섹션 하나에서 타입·간격을 의미 토큰으로 치환 | 토큰화가 수정 속도와 일관성을 높이는가 | `EXP-001` 판정 완료 |
| `EXP-004` | 부가 출처만 `<details>`로 접기 | 정보 과부하를 줄이면서 한계가 묻히지 않는가 | 핵심 사실은 항상 펼침 |
| `EXP-005` | facts 섹션의 모바일 표 구조만 재설계 | 360px에서 스캔 속도가 좋아지는가 | 동일 카피·동일 순서 고정 |
| `EXP-006` | 허용 섹션 목록을 생성 계약으로 선언 | 새 페이지 생성 시 임의 레이아웃 분산이 줄어드는가 | 최소 두 상품에서 생성 비교 |

한 번에 둘 이상을 묶어 시험하지 않는다. 묶으면 어느 규칙이 점수 변화의 원인인지 알 수 없다.

## 9. 채택·보류·거부 판정 기준

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

## 10. 전후 평가 rubric

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

## 11. 브라우저 증거 기록 형식

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

## 12. 기억 승격 규칙

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

## 13. 되돌림 규칙

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

## 14. 실험 로그

| 날짜 | 실험 | 상태 | 대상 | 결과 증거 | 다음 행동 |
|---|---|---|---|---|---|
| 2026-07-24 | `EXP-001` 실행 | `adopted-local` | 도매꾹 43314131 상세페이지 | 78→85점, 하드 실패 없음, 800·360px 통과 | 다른 상품군 1개 이상에서 독립 재시험 |
| 2026-07-24 | `EXP-003` 실행 | `held` | 도매꾹 43314131 상세페이지 편집 패널 | 88→90점, 구매자 화면 분리·상태 전달 통과 | 현재 상품에만 유지, 실제 저장 누락 감소 근거 수집 |
| 2026-07-25 | `EXP-004` BIO ORTO 소재 문법 변환 | `adopted-local` | 도매꾹 43314131 문제→해결 섹션 | ImageGen 배경과 실제 제품 레이어 분리, 800·390px overflow 없음 | 다른 상품군에서 재료·여백 리듬만 독립 재시험 |

## 15. 다음 실행 체크리스트

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

## 16. BIO ORTO 참고 소재 생성 실험

- 날짜: 2026-07-25
- 원본: https://www.behance.net/gallery/248442487/BIO-ORTO-
- 상태: `adopted-local`
- 대상: 도매꾹 43314131 문제→해결 섹션

### 관찰한 공통 문법

- 촉감 있는 아이보리 바탕과 짙은 자연색 블록을 번갈아 배치한다.
- 식재료 매크로와 넓은 여백을 함께 써 카피가 이미지에 눌리지 않게 한다.
- 감성 사진 다음에는 명확한 정보 카드나 제품 증거를 둬 구매 흐름을 회복한다.
- 제품이 없는 소재 장면은 분위기 전환에만 쓰고, 구조·수치·작동 주장은 실제 제품 증거로 다시 확인한다.

### 현재 상품에 적용한 변환

- 브랜드·패키지·고유 카피·로고·아티초크 이미지는 복제하지 않았다.
- ImageGen에는 감자·오이·당근과 중앙 카피 여백만 요청하고 제품·도구·문자를 금지했다.
- 실제 제품은 기존 컷아웃 SSOT를 HTML에서 별도 레이어로 겹쳤다.
- 동종 제품 공개 후기에서 확인한 두 생활 불편을 실제 HTML 텍스트 카드로 배치했다.

### QA 결과

- 800px와 390px에서 카피 대비, 줄바꿈, 가로 overflow를 통과했다.
- 생성 배경은 제품 사실의 증거로 사용하지 않았고, 해결 선언은 supplier fact ID에 연결했다.
- 현재 상품에서는 문제 제기 섹션의 장면성·상업성·서사 연결이 개선되어 채택했다.

### 되돌림 조건

- 식재료 배경이 실제 제품보다 먼저 읽히거나 핵심 기능 섹션을 두 화면 이상 밀어내면 제거한다.
- 다른 상품군에서 같은 아이보리 식재료 구도가 템플릿처럼 반복되면 상품별 재료·조명·여백 구조를 다시 설계한다.

---

## 17. Taste Skill v2 보조 규약 실험

- 날짜: 2026-07-25
- 저장소: https://github.com/Leonxlnx/taste-skill
- 사이트: https://www.tasteskill.dev/
- 확인 버전: 기본 `design-taste-frontend` v2 experimental
- 라이선스: MIT
- 상태: `held`

### 설치한 관련 스킬

- `design-taste-frontend`
- `gpt-taste`
- `redesign-existing-projects`
- `image-to-code`
- `imagegen-frontend-web`

### 상세페이지에 유효한 규칙

1. 코드 전에 페이지 종류, 구매자, 분위기, 근거 제약을 한 줄로 읽고 `VARIANCE / MOTION / DENSITY`를 고정한다.
2. 섹션 번호, `MODE 01`, `POINT 01`처럼 내용 없이 설계된 메타 라벨을 실제 기능명으로 바꾼다.
3. 작은 대문자 눈썹 라벨은 모든 섹션에 반복하지 않고 최대 `ceil(섹션 수 / 3)`개로 제한한다.
4. 모션마다 위계, 작동 설명, 피드백, 상태 전환 중 하나의 목적을 설명하지 못하면 삭제한다.
5. 한 강조색과 한 곡률 체계를 잠그고, 카피·버튼·이미지 캡션까지 출시 전 다시 읽는다.
6. 기존 페이지는 전면 재작성보다 타이포, 간격, 색, 모션, 핵심 섹션 순으로 작은 변경을 시험한다.

### 상세페이지용 로컬 예외

- React·Next.js·Tailwind 기본값은 수정 가능한 단일 HTML 납품 조건보다 우선하지 않는다.
- 내비게이션, SaaS식 CTA, 가격표, AIDA 고정 팩은 공급처형 세로 상품 상세페이지에 강제하지 않는다.
- 짙은 숲색과 아이보리의 교대는 서로 다른 테마가 아니라 동일 팔레트의 구매 챕터 구분으로 사용한다.
- 제품명, 재질, 치수, 사용 제한을 전달하는 근거 라벨은 장식 라벨과 구분해 유지한다.
- 제품 동일성과 주장 근거는 비대칭·모션·시각 실험보다 항상 우선한다.

### `EXP-007` 숫자형 메타 라벨 축소

- Design Read: 한국 오픈마켓의 단일 주방 소도구 상세페이지, 구매자가 기능·치수·안전을 빠르게 확인하는 신뢰 우선형 프리미엄 소비재, 네이티브 편집 HTML과 근거 기반 제품 이미지·HyperFrames 모션.
- Dials: `DESIGN_VARIANCE 6 / MOTION_INTENSITY 6 / VISUAL_DENSITY 5`
- 변경 전: `.eyebrow` 12개, 숫자형 섹션·모드·포인트 라벨 반복, 구매자 텍스트 em dash 1개, 편집 텍스트 76개
- 변경 후: 의미 있는 `.eyebrow` 4개, `ceil(10/3)=4` 상한 통과, 숫자형 메타 라벨 0개, em dash·en dash 0개, 편집 텍스트 68개
- 유지한 것: 제품·치수·기능·근거 캡션·섹션 순서·ImageGen 자산·GIF 4개·HTML 저장 기능
- 브라우저 증거: `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\dimension-gap-and-taste-final`, `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\taste-edit-mode-final-dom`
- 결과: 390px overflow 0, 잘린 편집 텍스트 0, 깨진 이미지 0, 68/68 편집 모드 전환, 기존 rubric 97/100 유지
- 판정: 총점 상승이 없어 영구 규칙 승격은 `held`다. 다만 현재 상품에서는 정보 손실 없이 장식 밀도가 줄어든 상태를 유지한다.
- 되돌림: 제거한 영문 눈썹과 숫자 라벨만 복원하고 제품·근거·모션은 건드리지 않는다.

### `FIX-DIM-001` 가로 치수선 분리

- 사용자 관찰: 7.2cm 가로 치수선 끝점이 제품 헤드 상단에 닿아 보였다.
- HyperFrames 변경: 선 `y=88→52`, 끝점 하단 `y=100→64`
- 검증: `check` 오류 0, 경고 0, 대비 31/31, 새 GIF 실제 재생 프레임 해시 차이 확인
- 화면 증거: `prototypes/domeggook-43314131/detail-page/qa/screenshots/11-dimension-gap-final.png`
- 결과: 선과 제품 사이에 명확한 여백이 생기고 네 치수 값과 측정 방향은 유지됐다.

핵심 원칙은 단순하다. **디자인 규칙은 출처가 있어야 하고, 상품에 맞게 변환한 부분은 변환이라고 밝혀야 하며, 작은 전후 실험으로 이득을 증명하기 전에는 영구 기억으로 승격하지 않는다.**

---

## 18. `EXP-008` 사진 중심 상세페이지와 독립 Studio

- 날짜: 2026-07-25
- 상태: `adopted-local`
- 대상: 도매꾹 66475839 아쿠아슈즈
- Design Read: 물놀이 전용 신발의 사용 장면을 먼저 보여주고, 제품 구조와 사이즈 정보를 뒤에서 검증하는 사진 중심 상업 상세페이지

### 변경

- 섹션 `10→16`, 수정 가능한 문구 `100→117`
- 단일 착화 맥락에서 수영장·워터파크·해변·계곡을 포함한 별도 가로 장면 5개로 확장
- 생성 이미지에 한글 카피를 굽지 않고 실제 제품·HTML 카피·ImageGen 장식 레이어를 분리
- 구매자 페이지에서 편집 도구가 내용을 덮지 않도록 모바일 편집 UI를 축약
- `studio.html`에서 문구·글자 크기·정렬·색상·이미지·초점·오버레이·토큰을 수정하고 JSON과 완전한 단일 HTML을 내보내도록 분리
- 첫 소구를 “물놀이 준비, 발길이부터”에서 “수영장부터 계곡까지, 물놀이를 위한 한 켤레”로 교체하고 발길이는 후반 선택 정보로 이동

### 증거

- 320·360·390·768·800px 가로 overflow 0, 깨진 이미지 0, 첫 제목 2줄
- 16개 섹션, h1 1개, 편집 항목 117개, GIF 3개
- 단일 HTML 31,287,338바이트, 이미지 16개 `data:` URL 내장, 재오픈 후 overflow 0
- Browser Harness 녹화: `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\aqua-detail-studio-qa-20260725`

### 배운 점

- 핵심 소구는 설명하기 쉬운 숫자가 아니라 승인 사실, 고객이 원하는 변화, 시각 증명 가능성이 가장 강하게 겹치는 항목이어야 한다.
- 치수·사이즈·주의는 중요해도 대부분 첫 소구가 아니라 선택을 돕는 후반 정보다.
- 실사진 위 한글은 HTML로 남겨야 카피·정렬·대비를 수정할 수 있고 생성 이미지의 오탈자도 피할 수 있다.
- Studio의 내보내기는 버튼 존재가 아니라 실제 다운로드, 재오픈, 이미지 로드, GIF MIME, 반응형까지 검증해야 한다.
- 사진이 늘어날수록 작은 눈썹 라벨을 함께 늘리지 않는다. 16개 섹션에서 5개로 `ceil(16/3)=6` 상한을 지켰다.

## 19. `FIX-FIT-001` 바·점·활성 호수의 단일 좌표 계약

- 사용자 관찰: “신발 호수보다, 발길이를 먼저” 모션에서 진행 바와 점이 맞지 않고 호수 전환이 어색했다.
- 원인: 커서 좌표, 진행 바 길이, 눈금 점 좌표가 서로 다른 계산을 사용했고 카드가 이동 시작과 동시에 바뀌었다.
- 변경: 기준선 `x=40~652`, 여섯 점 `95.64, 206.91, 318.18, 429.45, 540.73, 652px`을 단일 기하 데이터로 사용했다.
- 변경: 진행 바는 `x=40`에 고정해 목표 점까지 스케일하고, 커서와 바는 같은 `0.3초 power2.inOut`으로 움직인다.
- 변경: 활성 카드와 현재 범위 문구는 커서가 목표 점에 도착한 뒤에만 갱신한다.
- 검증: lint·runtime·layout·motion 오류·경고 0, 대비 80/80, 800×800, 15fps, 78프레임.
- 눈검수: 2.0초 M, 2.3초 L, 4.5초 XXXL에서 바 끝·점 중심·활성 카드가 일치한다.
- 승격 후보: 정보 모션은 선 끝과 점 중심 오차 2px 이내, 라벨 전환은 포인터 도착 뒤라는 규칙을 `commercial-tight v2` 하드 게이트로 사용한다.
## 20. `EXP-009` 미관찰 Behance 4종의 상용 상세 문법

- 날짜: 2026-07-25
- 상태: `adopted-local`
- 대상: 도매꾹 `23824901` 아이스 쿨패치
- 조사 원본:
  - `https://www.behance.net/gallery/241274633/_`
  - `https://www.behance.net/gallery/251502623/_`
  - `https://www.behance.net/gallery/220227061/-Lemon-juice-Product-page`
  - `https://www.behance.net/gallery/252540551/-Professional-Hair-Trimmer`

### 관찰

- 한 장면에서 제품·헤드라인·설명·수치가 동시에 경쟁하지 않는다.
- 큰 실제 제품 다음에 짧은 질문, 짧은 장점, 사용 정보가 번갈아 나온다.
- 사진 위 카피는 2–3줄 안에서 끝내고 어두운 그라데이션 또는 비어 있는 안전 여백에 둔다.
- 치수선은 단순하고 평행하며 제품 외곽과 닿지 않는다.
- 감성 소재 다음에는 정확한 정보 카드가 이어져야 설득이 완성된다.

### 적용

- Design Read: 푸른 하이드로겔 톤, 큰 제품, 어두운 네이비와 아이스 화이트의 고대비, 한 장면 한 메시지.
- Dials: `DESIGN_VARIANCE 6 / MOTION_INTENSITY 6 / VISUAL_DENSITY 5`.
- 13개 섹션을 `상황 → 불편 → 제품 형태 → 사용 맥락 → 구조 → 치수 → 준비 → 사용 → 소재 → 사례 → 주의 → 정보 → 요약`으로 편집했다.
- ImageGen 소재 5개와 제품 누끼를 분리하고, 사실 수치와 한글 카피는 HTML/SVG로 유지했다.
- 결과: 98/100, 하드 실패 0개.

### 되돌림 조건

- 사진 위 카피가 제품을 가리거나 3줄을 넘어가면 안전 여백을 다시 설계한다.
- 감성 소재가 실제 제품보다 먼저 보이면 생성 소재의 채도·크기·노출을 줄인다.
- 다른 상품군에서 같은 네이비·아쿠아 팔레트가 템플릿처럼 반복되면 상품 고유 소재와 색을 다시 추출한다.

## 21. `CUTOUT-002` 단색 배경 기반 제품 누끼 SSOT

- 날짜: 2026-07-25
- 상태: `adopted-local`
- 실패: ImageGen이 만든 체크무늬 배경 PNG는 실제 투명 채널이 없는 RGB였다.
- 대안: 제품과 겹치지 않는 마젠타 배경으로 다시 생성하고 결정론적 크로마키를 적용했다.
- 앞면 승인본: `538×1182 RGBA`, SHA-256 `0DA3211AF59E34B47567E35BFD98C67E3A08B8D36990626287FA55647563343D`.
- 필름 반제거 승인본: `494×1200 RGBA`, SHA-256 `14E074EF7C0E95310F4F0D1F0312B0393CCF844A0C68EFCCA25BE10E1E812C86`.
- 검수: 밝은 배경·검은 배경 동시 합성에서 마젠타 잔여와 잘린 투명 필름이 없는지 확인했다.
- 영구 후보 규칙: “투명처럼 보임”이 아니라 파일 포맷과 두 배경 합성으로 알파 채널을 검증한다.

## 22. `MOTION-COOL-001` 다섯 역할과 좌표 SSOT

- 날짜: 2026-07-25
- 상태: `adopted-local`
- 모션: 문제, 준비, 필름 제거, 치수, 피부 주의.
- HyperFrames 마스터: 800×800, 26초, 30fps.
- 배포 GIF: 각 5.2초, 15fps, 무한 반복.
- strict 검사: lint·runtime·layout·motion·contrast 오류·경고 0.
- 치수 좌표: 가로·세로 선의 시작·끝과 네 점의 중심 오차 0px.
- 제품 간격: 가로 24px, 세로 60px.
- 라벨은 선 그리기가 끝난 뒤에만 나타난다.
- Browser Harness 화면 캡처를 1초 간격으로 비교해 다섯 GIF 모두 실제 프레임 변화가 있음을 확인했다.
- 영구 후보 규칙: 컨트롤·바·선·커서·점·라벨이 같은 값을 설명하면 하나의 좌표 테이블·시간·ease를 공유한다.

## 23. `EXP-010` 기능성 인솔의 제품·맥락·데이터 모션 교차 리듬

- 날짜: 2026-07-25
- 상태: `adopted-local`
- 대상: 도매꾹 `44358530`
- 참고한 제품군:
  - D+AF Comfortable Insoles
  - MOVE Insoles CGI
  - Personalized Gyroid Insole
  - ARVITUM orthopedic insoles Brand Identity

### 관찰

- 인솔처럼 얇고 형태가 비슷한 제품은 정면 한 장만 반복하면 차이가 보이지 않는다.
- 상용 사례는 라이프스타일 장면, 제품 한 쌍, 측면 프로필, 신발 삽입, 소재 매크로를 번갈아 사용한다.
- 과정이 중요한 제품은 전후 이미지보다 `준비 → 작동 → 기다림 → 결과`의 시간 순서가 신뢰를 만든다.
- 의료적 분위기의 압력맵·해부 그래픽·큰 효능 숫자는 근거가 없을 때 상업 완성도를 높이는 것이 아니라 신뢰를 깎는다.
- 차콜·웜 화이트·열을 연상시키는 오렌지처럼 제품 고유 소재에서 뽑은 좁은 팔레트가 긴 페이지의 일관성을 유지한다.

### 적용

- Design Read: 기능·과정을 먼저 확인하는 성인 고객용 상업 상세페이지로 읽고, 의료적 과장 대신 제품의 블랙·오렌지와 작업 과정을 쓰는 trust-first consumer commerce로 설정했다.
- Visual language: 따뜻한 차콜 배경, 종이색 정보 구간, 오렌지 열 포인트, 큰 제품과 정확한 HTML/SVG 사실의 교차.
- Dials: `DESIGN_VARIANCE 6 / MOTION_INTENSITY 7 / VISUAL_DENSITY 6`.
- 제품 거리: 히어로 한 쌍, 소재 매크로, 측면 프로필, 실제 삽입 GIF, 다각도 피날레.
- 20개 섹션을 `차이 → 문제 → 과정 → 소재 → 재단 → 가열 → 착화 → 형태 → 사이즈 → 일상 → 적응 → 실제 시연 → 관리 → 사실 → 요약`으로 편집했다.
- ImageGen 8장은 한글을 굽지 않고 맥락만 만들었고, 실제 제품 누끼와 HTML 카피를 별도 레이어로 겹쳤다.
- HyperFrames 7개는 같은 제품 회전을 반복하지 않고 각각 형태, 재단선, 초 카운트, 5분 링, 측면 곡선, 사이즈 바, 적응 타임라인을 맡았다.

### 검증

- 320·360·390·768·800px에서 잘린 자식 요소와 overflow 0
- ImageGen 8장, 제품 SSOT 3개, HyperFrames 7개, 공급처 실제 시연 3개
- Studio 편집 텍스트 88개, 안정된 asset ID 이미지 21개
- Taste pre-flight: 눈썹 라벨 6개로 `ceil(20/3)=7` 이하, em dash 0, 강조색 1개, 모션 감소 포스터 10/10
- commercial-tight v3 98/100, 하드 실패 0개

### 영구 규칙 후보

- 기능성 제품은 “제품 사진 수” 대신 `제품 정체성 / 생활 맥락 / 작동 시간 / 데이터 사실 / 실제 시연 / 안전 경계` 여섯 층을 모두 갖춘다.
- 한 섹션의 시각 층은 최대 세 개로 제한한다: 배경 맥락, 실제 제품 SSOT, 수정 가능한 HTML/SVG 정보.
- 공급처 원본에 근거보다 강한 카피가 구워져 있으면 제품 시각만 크롭하고, 공개 문구는 승인 fact에서 다시 쓴다.
- 모바일 QA는 scrollWidth와 모든 자식 bounding box를 함께 검사한다.

### 되돌림 조건

- 생성 장면이 실제 제품보다 먼저 보이거나 제품 모양을 바꾸면 생성 장면 노출을 줄이고 SSOT를 전면에 둔다.
- 일곱 GIF 중 둘 이상이 같은 구매 질문을 반복하면 GIF 수를 줄이고 정적 정보 카드로 바꾼다.
- 차콜·오렌지가 다른 상품에도 관성적으로 반복되면 해당 상품의 소재·사용 온도·환경에서 팔레트를 다시 추출한다.
