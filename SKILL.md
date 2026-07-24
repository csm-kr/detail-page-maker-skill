---
name: detail-page-maker-skill
description: 공급처 상품 URL에서 원본 사진·치수·재질·구조·소구 근거를 수집하고, 제품 컷아웃 SSOT와 ImageGen 참조 장면, HyperFrames GIF를 결합해 Behance 수준의 수정 가능한 상업 HTML 상세페이지를 제작·QA한다. 도매꾹·도매매 등 공급처 URL 기반 상세페이지 제작, 제품 사진 누끼와 다각도 SSOT, 상업 상세페이지 리디자인, GIF가 포함된 편집 가능 HTML, Behance 기준 상세페이지 QA를 요청할 때 사용한다.
---

# Detail Page Maker

공급처 사실을 잠근 뒤 제품 동일성, 구매 서사, 상업 디자인과 수정 가능한 HTML을 한 흐름으로 완성한다.

## 시작할 때 읽기

1. [`commetial-detail-page.md`](commetial-detail-page.md)를 전부 읽어 상업 상세페이지 규약과 QA 기준을 고정한다.
2. [`study-desing-skill.md`](study-desing-skill.md)를 전부 읽어 검증된 디자인 규칙과 최근 실험 결과를 반영한다.
3. 상품 사실·런타임 계약이 필요하면 [`plan.md`](plan.md)와 [`docs/contracts/domeggook-supplier-extraction.md`](docs/contracts/domeggook-supplier-extraction.md)에서 관련 절만 읽는다.
4. 두 메모가 없으면 공급처 추출과 증거 보존까지만 진행하고, 사실 없는 디자인 규칙을 임의로 만들지 않는다.

## 제작 순서

### 1. 공급처 근거 잠금

- 최초 입력은 숫자 상품번호가 포함된 실제 공급처 URL 하나만 받는다.
- 도매꾹 URL은 `dmk-extractor`와 `browser-harness`를 사용해 대표·상세 원본, 내부 GIF 프레임, 공개 후기와 원본 locator를 portable bundle로 보존한다.
- `supplier-photo-inventory.json`, `supplier-facts.json`, `supplier-appeal-candidates.json`, `supplier-planning-brief.json` 역할을 분리한다.
- 치수·재질·구조·구성·사용법·원산지 등 게시 사실은 원본 locator와 fact ID를 가진 확인 값만 사용한다.
- 가격·MOQ·옵션은 수집 시각이 붙은 변동 정보로 취급한다.
- 로그인·캡차·상세 root 불확실·OCR 미확인 상태를 정상 근거로 승격하지 않는다.

### 2. 제품 SSOT 구축

- 공급처 원본을 보존하고, 사용자가 다각도 실사진을 주면 동일 SKU의 최우선 제품 SSOT로 추가한다.
- 각 원본의 해시, 방향, 보이는 부품과 가림 영역을 기록한다.
- `imagegen` 편집으로 배경만 크로마 키로 바꾸고 알파 PNG 누끼를 만든다.
- 실루엣, 비율, 색상, 로고, 부품 수, 결합 구조, 얇은 부품과 구멍을 변경하지 않는다.
- 생성 제품 뷰는 파생 시각 자산이다. 원본에서 보이지 않는 면을 추정한 결과는 승인하지 않는다.

### 3. 구매 서사와 디자인 방향 잠금

- 현재 Behance `상세페이지` 원본 사례는 `browser-harness`로 관찰한다. 작품을 복제하지 말고 제품군 공통 문법만 추출한다.
- 기본 서사는 `제품·가치 인지 → 상황·문제 → 해결 원리·장점 → 구조·수치 증거 → 사용 → 구매 확인`으로 잡는다.
- 감성·정보·증거 섹션을 교차하고, 전체 페이지에서 최소 세 가지 제품 거리와 한 가지 일관된 조명·색·타이포 체계를 사용한다.
- 디자인 콘셉트, 팔레트, 타이포 비율, 그리드, 여백, 곡률, 제품 시점, GIF 대상 주장을 구현 전에 명시한다.
- 핵심 소구는 반드시 fact ID와 연결하고 근거보다 강한 성능 표현으로 키우지 않는다.

### 4. ImageGen과 HyperFrames 자산 제작

- 생성형 시각 모델은 `imagegen`만 사용한다.
- 실제 제품 장면에는 승인된 제품 컷아웃과 원본 제품 사진을 reference image로 함께 넣는다.
- 사용 전후가 필요한 장면은 시작·중간·종료 keyframe을 같은 카메라·손·조명으로 만든다.
- 모션은 `hyperframes`로 작성한다. paused seek timeline, full-duration clip, 결정적 동작과 `prefers-reduced-motion` poster를 제공한다.
- 한 GIF는 한 주장만 설명한다. 제품을 변형하거나 같은 제품을 중복 생성하지 않는다.
- 렌더 전 `hyperframes check`에서 오류·경고를 해결한다. QA용 30fps MP4와 게시용 15fps·무음·무한 반복 GIF를 보존한다.

### 5. 수정 가능한 HTML 구현

- 카피는 이미지에 굽지 않고 실제 HTML 텍스트로 둔다.
- 색상·폰트·폭·간격·곡률은 CSS 변수로 분리한다.
- 섹션을 독립 DOM 블록으로 만들고 이미지·GIF는 `assets/` 상대 경로로 교체 가능하게 한다.
- 각 주장 섹션에 `data-fact-id`, 각 교체 이미지에 안정된 asset ID와 대체 텍스트를 둔다.
- 800px 상업 상세 폭과 360px 모바일에서 가로 overflow, 잘림, 한글 줄바꿈과 이미지 로딩을 검증한다.
- 편집 모드 또는 명확한 코드 편집 지점을 제공한다. 편집 결과를 독립 HTML로 저장할 수 있게 한다.

### 6. 상업 QA와 한 번의 수정 루프

- [`commetial-detail-page.md`](commetial-detail-page.md)의 100점 rubric으로 채점한다.
- 첫 화면 인지, 구매 서사, 타이포, 아트디렉션, 제품 동일성·주장 근거, 섹션 리듬, 모션, 편집성·반응형을 검사한다.
- `browser-harness`에서 360px와 800px 실제 좌표·스크린샷·편집 동작을 확인한다.
- 가장 낮은 한 항목을 특정해 국소 수정하고 같은 검사를 다시 실행한다.
- 제품 실사진 SSOT나 가격·옵션이 없으면 prototype 통과와 판매 게시 승인을 분리해 기록한다.

## 디자인 학습 루프

- 외부 디자인 원문에서 발견한 규칙은 먼저 [`study-desing-skill.md`](study-desing-skill.md)의 `후보`로 기록한다.
- 실제 HTML 한 곳에만 적용하고 이전/이후 스크린샷과 rubric 변화를 비교한다.
- 점수·가독성·근거 인접성·반응형 중 하나가 명확히 개선된 규칙만 `채택`으로 승격한다.
- 취향 차이, 한 작품의 고유 장식, 접근성·성능을 악화한 규칙은 영구 메모리에 넣지 않는다.
- 각 기록에 날짜, 출처 URL, 적용 위치, 관찰 결과와 되돌림 조건을 남긴다.

## 완료 산출물

- 수정 가능한 `index.html`과 상대 경로 `assets/`
- 제품·ImageGen·GIF 파생 관계와 SHA-256이 있는 manifest
- HyperFrames 원본, GIF와 QA용 MP4
- Behance rubric QA 보고서와 360px·800px 스크린샷
- 공급처 사실표와 미확인·금지 주장 목록
- 학습 루프에서 검증된 경우에만 갱신한 두 디자인 메모
