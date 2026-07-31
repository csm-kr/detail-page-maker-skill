# 카테고리 Reference Library

기계 정본은
[`policies/category-reference-library-v1.json`](../policies/category-reference-library-v1.json)이다.
이 문서는 G1 기획자와 QA가 분류·적용·확장 방법을 읽는 사람용 설명이다.

## 역할 분리

- `coupang-wing-detail-780.html`: 모든 상품의 화려함 최저선을 정하는 공통
  `visual_ambition_only` anchor다. 기본 색·레이아웃·템플릿이 아니다.
- Behance reference card: 선택한 상품 아키타입의 구매 흐름, 이미지 역할,
  motion 증명 문법을 제공한다.
- 현재 `output/detail-page.html`: 직전 결과의 baseline이며 다음 제작에서
  반복할 것과 고칠 것을 알려 준다.

셋의 역할을 합치지 않는다. 원본 이미지·GIF·카피·색·레이아웃 조합은 모두
research-only이며 production 자산과 ImageGen reference로 사용하지 않는다.

## 초기 6개 아키타입

| ID | 고객이 먼저 묻는 것 | 대표 대상 |
| --- | --- | --- |
| `mechanism-structure` | 무엇이 어떻게 작동하는가 | 기능성 생활용품, 기기, 공구 |
| `sensory-texture` | 어떤 감각·질감을 기대하는가 | 식품, 뷰티, 세정 |
| `fit-movement` | 몸에 어떻게 맞고 움직이는가 | 의류, 신발, 보호·착용용품 |
| `space-compatibility` | 내 공간·기기에 맞는가 | 수납, 설치, 액세서리 |
| `comparison-configuration` | 구성·옵션·규격이 무엇이 다른가 | 세트, 부품, 선택형 상품 |
| `trust-evidence` | 왜 믿을 수 있고 조건은 무엇인가 | 위생, 케어, 근거 중심 상품 |

한 상품은 주 아키타입 하나와 보조 아키타입 최대 하나만 사용한다. 상품명이나
쿠팡 분류 이름만으로 고르지 말고 승인된 제품 사실과 핵심 구매 질문으로 판단한다.

## G1 강제 순서

1. `node scripts/detail-page.mjs reference-library`로 library ID·version·hash를
   읽는다.
2. 주 아키타입 하나와 필요할 때만 보조 아키타입 하나를 선택하고 이유와 제품
   신호를 기록한다.
3. 주 아키타입 reference card를 최소 2개 선택한다.
4. 선택 card의 trait를 모든 section, image job, GIF brief에
   `trait_id → target_ids → adaptation_intent → acceptance_check_ids`로 연결한다.
5. 공통 ambition anchor의 Hero 강도, 챕터 리듬, 장면 다양성, motion coverage,
   구매 마무리 차원을 실제 target에 연결한다.
6. 이미지 역할 5종, 장면 4종, 단독 제품 scene 35% 이하, motion pattern 4종을
   기획에서 계산해 통과한다.
7. G4와 export 후 G5에서 선택 cohort의 여섯 시각 차원보다 낮은 결과를
   hard fail한다.

누락된 binding을 자연어로 설명해 우회할 수 없다. 기계 validator가 G2/G3
WorkOrder 발급 전에 닫힌 target coverage를 검사한다.

## 점진 확장

새 상품 하나가 기존 아키타입에 완전히 맞지 않는다는 이유로 새 폴더나 분류를
만들지 않는다. 다음 조건을 모두 만족할 때만 JSON library의 새 하위 프로필 또는
상위 아키타입을 추가하고 version을 올린다.

- 서로 다른 제품 3개 이상에서 같은 구매 질문·증명 문법이 반복됨
- 서로 다른 실제 reference 프로젝트 3개 이상에서 반복됨
- 기존 6개 조합으로 설명할 수 없는 이유가 기록됨
- 독립 검토와 회귀 테스트를 통과함
- 작품 고유 자산·카피·색·레이아웃을 제거해도 규칙이 유효함

Reference HTML·캡처·GIF를 상품 프로젝트마다 복제하지 않는다. 공용 library와
anchor는 스킬 안에 한 번만 두고, 프로젝트 ProductionPlan에는 ID·version·hash와
적용 binding만 저장한다.
