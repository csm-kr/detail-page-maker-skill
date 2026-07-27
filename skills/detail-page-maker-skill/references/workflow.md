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
8. 프로젝트 학습

## 전체 흐름

```text
입력·근거
→ 제품 SSOT
→ COMMERCIAL·DESIGN·BUYER-JOURNEY
→ G0·G1 독립 승인
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
→ 프로젝트 학습
```

## 1. 입력과 공급처 근거

- 실제 공급처 URL 하나를 프로젝트 시작점으로 사용한다.
- 대표·상세 원본, 수집 시각과 locator를 보존한다.
- 사진, 제품 사실, 공급처 주장, 가격·MOQ·옵션 같은 변동 정보를 분리한다.
- 로그인·캡차·OCR 추정값은 승인 사실로 올리지 않는다.
- 도매꾹은 [`domeggook-supplier-extraction.md`](domeggook-supplier-extraction.md)를
  따른다.

## 2. 제품 SSOT와 G0

제품 참조 우선순위는 `동일 SKU 사용자 원본 → 공급처 원본 → 승인 컷아웃 →
승인 파생 뷰`다. 생성 결과는 원본을 덮어쓰지 않는다.

[`product-identity.md`](product-identity.md)에 따라 실루엣·면·부품·수량·문자·방향을
잠그고, 옆 승인 세션과 사용자가 `G0 SOURCE_SSOT`를 승인해야 기획을 확정한다.

## 3. 상업·디자인·구매 서사와 G1

프로젝트에서 다음 파일을 함께 작성한다.

- `planning/COMMERCIAL.md`: 고객 문제, 제품 답, 선택 이유, 주장 경계
- `planning/DESIGN.md`: 시각 언어, 밀도, 타이포, 모션 강도
- `planning/BUYER-JOURNEY.md`: 구매 질문, 페이지 역할, 읽는 순서
- `planning/GIF.md`: 모션 필요성, 패턴, 시작·결과 상태
- `planning/APPROVALS.md`: G0~G5 결정과 해시

기본 서사는 다음 순서를 사용한다.

```text
불편 인식 → 우리 제품의 답 → 선택 이유 3~5개와 직접 증거
→ 사용법·사용 장면 → 구조·마감 → 구성·사이즈·관리·FAQ → 선택 요약
```

### 고객의 문제를 우리 제품으로 해결하는 섹션

[`commercial.md`](commercial.md)의 `고객 상황 / 제품 답 / 고객 문장 / 직접 증거`
구조를 사용한다. 고객이 자기 이야기처럼 알아보게 쓰되 실제 동일 상품 후기가
없으면 후기 UI·별점·작성자·구매 인증·체험 증언을 만들지 않는다.

노바페이스 사례에서 채택하는 것은 `오래 서는 날 / 답답함 / 사이즈 선택`이라는
문구가 아니라, 서로 다른 세 구매 질문에 각각 다른 제품 답과 증거를 붙인 구조다.
현재 상품의 근거로 3~5개 이유를 새로 만든다.

공개 주장마다 다음 연결을 고정한다.

```text
claim_id → component_id → fact_id → evidence_asset_id → section_id
```

직접 근거가 없거나 구조 관찰을 성능 결과로 확장한 주장은 제외한다. 옆 승인 세션과
사용자가 `G1 COMMERCIAL_PLAN`을 승인하기 전에는 이미지 작업을 시작하지 않는다.

## 4. 이미지 생성과 G2

[`asset-gen-guide.md`](asset-gen-guide.md)를 따른다.

1. 서로 다른 역할의 queued job을 최대 네 개로 묶는다.
2. God Tibo 워커 네 개로 병렬 생성한다.
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
- 제품과 추적 오버레이는 같은 변환 그룹에 둔다.
- 첫·중간·마지막 프레임, 제품 동일성, 접점과 poster를 검사한다.
- 옆 승인 세션과 사용자가 `G3 GIF_MOTION`을 승인한 렌더만 조립한다.
- 렌더는 `asset/generated/pending/gif`에서 시작하며 승인 뒤
  `asset/generated/approved/gif`로 이동한다.

## 6. 조립·편집과 G4

필수 에셋의 승인 버전과 SHA-256을 manifest에 고정한다. 같은 승인 경로를 고객
HTML에서 반복하지 않고 GIF는 해당 주장 바로 옆에 둔다. 조립 뒤 에셋·GIF는 읽기
전용이며 카피·배치 수정은 새 HTML 개정판에서 한다.

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

## 8. 프로젝트 학습

작업 종료 때 `planning/GIF.md`를 완성한다. GIF가 없으면 정적 이미지가 더 나았던
이유를 기록한다. 최종 QA 또는 사용자 승인을 통과한 재사용 규칙만
[`gif-guide.md`](gif-guide.md)의 프로젝트 학습 원장에 추가한다.
