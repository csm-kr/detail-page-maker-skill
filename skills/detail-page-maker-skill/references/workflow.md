# Detail Page Production Workflow

공급처 원본부터 게시 파일과 프로젝트 학습까지의 단계·산출물·승인 순서를 정의한다.

## 목차

1. 입력과 공급처 근거
2. 제품 SSOT와 G0
3. 상업·디자인·구매 서사와 G1
4. 이미지 생성과 G2
5. GIF와 G3
6. 조립·편집과 G4
7. 최종 QA·게시와 G5
8. 프로젝트 학습과 공용 규칙 승격

## 전체 흐름

```text
입력·근거
├─ G0 트랙: 제품 사실·SSOT 후보·미확인 항목
└─ G1 초안 트랙: 동종 제품·공개 후기·MARKET_PAIN
                  ·COMMERCIAL·DESIGN·BUYER-JOURNEY
→ G0 SOURCE_SSOT 승인
→ 제품 답·선택 이유·주장-증거 연결 확정
→ G1 COMMERCIAL_PLAN 승인
→ God Tibo 이미지 배치
→ asset/generated/pending/image
→ G2 독립 승인
→ Studio v1 사용자 승인·approved/image
→ HyperFrames GIF
→ asset/generated/pending/gif
→ G3 독립 승인
→ Studio v1 사용자 승인·approved/gif
→ HTML 조립·편집
→ G4 독립 승인
→ 최종 QA·G5 게시 승인
→ LEARNINGS 회고
→ 공용 후보 검증 이슈
→ 재검증 뒤 스킬 갱신
```

## G0·G1 병렬 준비와 순차 승인

G0와 G1은 작업 시작 순서가 아니라 승인 의존성을 가진다. 공급처 원본과 SSOT 후보로
상품 정체를 구분할 수 있으면 G0의 구성·치수·포장 확인과 G1의 시장 조사를 병렬로
진행한다.

G0 승인 전에도 다음 G1 작업을 수행한다.

- 동종 제품 3개 이상과 공개 후기 원문 조사
- `MARKET_PAIN`, 구매 질문, 친근한 문제 후킹과 페이지 순서 초안
- 디자인 언어, 이미지 역할과 GIF 필요성 초안
- 미확인 제품 사실에 기대지 않는 경쟁 구도와 금지 주장 정리

G0 승인 전에는 제품 답, 선택 이유 3~5개, `fact_id`, 직접 증거와 공개 카피를
확정하지 않는다. 해당 필드는 `provisional` 또는 `blocked_until_g0`로 기록한다.
최종 승인은 `G0 → G1` 순서이며 G0가 바뀌면 연결된 G1 필드와 해시를 다시 연다.

## 1. 입력과 공급처 근거

- 실제 공급처 URL 하나를 프로젝트 시작점으로 사용한다.
- 대표·상세 원본, 수집 시각과 locator를 보존한다.
- 사진, 독립 검증 제품 사실, `MANUFACTURER_CLAIM`, 가격·MOQ·옵션 같은 변동
  정보를 분리한다.
- 제조사·브랜드 소유자·제조사를 대표하는 사용자가 확인한 기능 문구는 원문,
  확인 주체, URL·파일·대화 locator와 시각을 고정해 제조사 제공 제품 사실로
  등록한다.
- 로그인·캡차·OCR 추정값은 승인 사실로 올리지 않는다.
- 도매꾹은 [`domeggook-supplier-extraction.md`](domeggook-supplier-extraction.md)를
  따른다.

## 2. 제품 SSOT와 G0

제품 참조 우선순위는 `동일 SKU 사용자 원본 → 공급처 원본 → 승인 컷아웃 →
승인 파생 뷰`다. 생성 결과는 원본을 덮어쓰지 않는다.

[`product-identity.md`](product-identity.md)에 따라 실루엣·면·부품·수량·문자·방향을
잠근다. 상품 정체를 구분할 수 있는 SSOT 후보가 준비되면 G0 미확인 항목을
추적하면서 G1 시장 조사와 기획 초안을 병렬로 시작한다. 옆 승인 세션과 사용자가
`G0 SOURCE_SSOT`를 승인해야 제품 답과 주장-증거 연결을 확정한다.

## 3. 상업·디자인·구매 서사와 G1

프로젝트에서 다음 파일을 함께 작성한다.

- `planning/COMMERCIAL.md`: 고객 문제, 제품 답, 선택 이유, 주장 경계
- `planning/DESIGN.md`: 시각 언어, 밀도, 타이포, 모션 강도
- `planning/BUYER-JOURNEY.md`: 구매 질문, 페이지 역할, 읽는 순서
- `planning/GIF.md`: 모션 필요성, 패턴, 시작·결과 상태
- `planning/APPROVALS.md`: G0~G5 결정과 해시
- `planning/LEARNINGS.md`: 상품 한정 학습과 공용 규칙 후보

각 기획 파일에 `planning_phase`, `g0_dependency`, `provisional_claims`,
`blocked_until_g0`를 기록한다. G0 진행 중에는 시장 고민·구매 질문·서사·디자인
초안을 발전시키고, G0 승인 뒤 제품 답·선택 이유·직접 증거와 공개 주장 경계를
확정한다.

기본 서사는 다음 순서를 사용한다.

```text
제품이 가장 큰 첫 화면과 직접적인 핵심 차이
→ BEFORE YOU CHOOSE의 서로 다른 구매 질문 3개
→ 우리 제품의 답
→ 장점 3~5개와 각 장점 바로 다음의 전용 GIF
→ 사용법·사용 장면 → 고객 목소리 또는 문제 해결 요약
→ 구성·사이즈·관리·FAQ → 선택 리마인드
```

카피와 정보 밀도는 판매 정보 70 : 브랜드 감성 30을 기본으로 한다. 각 일반
설득 장은 `특징 → 고객 효익 → 사용 장면 → 즉시 증거`로 이어지고, 같은 장점을
세 번 이상 반복하지 않는다. 첫 화면의 가장 큰 시각 대상은 모델이 아니라
판매 제품이며 비교 장면은 얼굴·전신보다 제품이 착용된 팔을 중심으로 같은 축척에서
보여 준다. 라벨은 실제 제품에 보일 수 있지만 구매 이유로 확대하지 않는다.

### 고객의 문제를 우리 제품으로 해결하는 섹션

[`commercial.md`](commercial.md)의 `고객 상황 / 제품 답 / 고객 문장 / 직접 증거`
구조를 사용한다. 고객이 자기 이야기처럼 알아보게 쓰되 실제 동일 상품 후기가
없으면 후기 UI·별점·작성자·구매 인증·체험 증언을 만들지 않는다.

기본 문제 후킹은 서로 겹치지 않는 불편 정확히 3개다. 문자 메시지와 말풍선은
고객이 실제로 떠올릴 법한 질문·망설임을 짧게 보여 주는 표현 장치로만 사용한다.
만든 체험담이나 구매 인증처럼 보이게 만들지 않는다. 문장 톤은
[`commercial-copy-tone-guide.md`](commercial-copy-tone-guide.md)를 따른다.

노바페이스 사례에서 채택하는 것은 `오래 서는 날 / 답답함 / 사이즈 선택`이라는
문구가 아니라, 서로 다른 세 구매 질문에 각각 다른 제품 답과 증거를 붙인 구조다.
현재 상품의 근거로 3~5개 이유를 새로 만든다.

공개 주장마다 다음 연결을 고정한다.

```text
claim_id → component_id → fact_id → evidence_asset_id → section_id
```

`fact_id`는 `FACT-*` 또는 `MFR-CLAIM-*`일 수 있다. 제조사 제공 기능은 독립 시험이
없어도 정성적 장점 카피와 정성적 설명 그래픽으로 공개할 수 있다. 단 제조사가
제공하지 않은 숫자·단위·비교군·시험 조건은 추가하지 않는다. 나머지 출처 없는
성능 확장은 제외한다.

`제조사 확인`, `제조사 주장`, `상용 촬영 톤으로 재구성` 같은 제작·출처 문장은
고객 화면에 쓰지 않는다. 제조사 제공 사실은 내부 근거로 보존하고, 공개 문장은
고객의 상황과 체감 방향을 중심으로 번역한다.

핵심 장점마다 `still_evidence_asset_id`와 `motion_evidence_asset_id`를 각각 계획한다.
GIF는 장점 하나만 설명한다. 정량 근거가 없는 냉감·열감은 그래프·막대·꺾은선으로
표현하지 않고 승인 제품·실착 위 쿨 스윕과 공기 흐름처럼 정성 방향을 보여 주는
FX로 표현한다. 옆 승인 세션과 사용자가 `G1 COMMERCIAL_PLAN`을 승인하기 전에는
이미지 작업을 시작하지 않는다.

## 4. 이미지 생성과 G2

[`asset-gen-guide.md`](asset-gen-guide.md)를 따른다.

1. 서로 다른 역할의 queued job을 최대 여덟 개 `items`로 묶는다.
2. 로컬 `god-tibo-gpt-image2-skill` 워커로 기본 여덟 장을 병렬 생성한다.
3. 모든 프롬프트에 `QUALITY_GATE:CLEAN_COMMERCIAL`을 적용한다.
4. 결과를 덮어쓰지 않고 `asset/generated/pending/image`에 새 후보 버전으로 등록한다.
5. 제품 동일성과 100%·200% 무노이즈 QA를 수행한다.
6. 원본과 후보를 옆 승인 세션에 개별 전달한다.
7. `G2 IMAGE_ASSETS`와 사용자 확인을 받은 파일만
   `asset/generated/approved/image`로 이동해 GIF·HTML에 사용한다.

## 5. GIF와 G3

[`gif-guide.md`](gif-guide.md)에서 필요성을 판정하고, 슬라이더·뒤집기·추적·국소
이펙트는 [`gif-motion-pattern-library.md`](gif-motion-pattern-library.md)에서 고른다.

- 한 GIF는 한 주장과 한 부품만 설명한다.
- 모든 GIF는 바로 앞 주장과 직접 연결된 주 FX를 최소 1개 사용한다.
- 제품과 추적 오버레이는 같은 변환 그룹에 둔다.
- 첫·중간·마지막 프레임, 제품 동일성, 접점과 poster를 검사한다.
- 비교 와이프, 쿨 스윕, 스타일 매치컷, 절차 진행, 길이 공개, 구성 공개 가운데
  해당 주장에 가장 적합한 패턴을 적극 사용한다.
- 이펙트는 장식이 아니라 변화 전·후, 제품 위치, 구성 수량을 첫 시선에 읽게 한다.
- 상세페이지 외부 카피와 GIF 내부 문구는 같은 문장을 반복하지 않는다. 내부 문구는
  상태·단계·수량 중심으로 더 짧게 쓴다.
- 길이·폭·높이처럼 위치를 알아야 하는 규격이 있으면 규격표 바로 위에 시작점과
  끝점을 실제 제품 외곽에 맞춘 전용 치수 위치 GIF를 만든다.
- 옆 승인 세션과 사용자가 `G3 GIF_MOTION`을 승인한 렌더만 조립한다.
- 렌더는 `asset/generated/pending/gif`에서 시작하며 승인 뒤
  `asset/generated/approved/gif`로 이동한다.

## 6. 조립·편집과 G4

필수 에셋의 승인 버전과 SHA-256을 manifest에 고정한다. 같은 승인 경로를 고객
HTML에서 반복하지 않고 GIF는 해당 주장 바로 옆에 둔다. 조립 뒤 에셋·GIF는 읽기
전용이며 카피·배치 수정은 새 HTML 개정판에서 한다.

장점의 증거 GIF를 페이지 뒤쪽의 `detail proof` 갤러리에 다시 모으지 않는다.
주장과 증거가 떨어져 설명을 되짚게 만드는 중복 섹션은 제거한다. 주요 이미지
배경 섹션은 텍스트 대비를 먼저 확보하고 제품을 가리는 과한 장식을 금지한다.

제작 메타데이터는 Studio에만 두며 상세 기준은
[`public-output-policy.md`](public-output-policy.md)를 따른다. 옆 승인 세션과 사용자가
실제 고객 화면, 섹션 순서, 반응형을 검토해 `G4 ASSEMBLED_HTML`을 승인한다.

## 7. 최종 QA·게시와 G5

[`commercial-qa.md`](commercial-qa.md), Taste 최종 pre-flight, HyperFrames strict,
320·360·390·768·800px 브라우저 검사를 수행한다. 게시 조건은 97점 이상, 하드 실패
0건, 옆 승인 세션 `G5 PUBLISH`, 사용자의 명시적 게시 승인이다.

게시용 HTML은 적용된 DOM과 CSS·이미지·GIF를 자립형 파일로 만들고 편집 런타임을
제거한다. 프로젝트 밖 경로에서 다시 열어 외부 참조, 누락 에셋, GIF 정지와 가로
오버플로가 없는지 확인한다.

사용자용 최종 진입점은 `<project>/deliverables/<revision>/index.html` 하나로
고정한다. 같은 폴더의 `media/`, `manifest.json`, `qa/final-report.md`만 게시
패키지에 포함한다. `asset/`, `hyperframes/`, `planning/`, `qa/`는 작업·근거
폴더이며 사용자에게 최종 결과 위치로 안내하지 않는다.

## 8. 프로젝트 학습과 공용 규칙 승격

작업 종료 때 `planning/GIF.md`와 `planning/LEARNINGS.md`를 완성한다. GIF가 없으면
정적 이미지가 더 나았던 이유를 기록한다.

[`learning-loop.md`](learning-loop.md)에 따라 학습을 `project-only`,
`candidate-shared`, `rejected`로 분류한다. 공용 후보는 저장소 안에서는
`docs/issues/` 검증 티켓에 연결하고, 저장소 밖에서는 프로젝트에 남긴다. 다른 상품
프로젝트 또는 회귀 테스트에서 개선이 재현된 규칙만 공용 reference, 테스트와 설치
스킬에 함께 승격한다.
