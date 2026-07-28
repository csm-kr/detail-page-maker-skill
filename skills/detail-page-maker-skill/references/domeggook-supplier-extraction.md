# 도매꾹 공급처 추출 계약

## 목적

최초 입력인 도매꾹 상품 상세 URL 하나를 변경 불가능한 공급처 증거 번들과 출처 추적 가능한 상품 사실표로 변환한다.

기존 `dmk-extractor`가 원본 캡처와 검증을 담당하고, 새 `detail-page-maker-skill`은 검증된 번들을 가져와 상품 사실을 정규화한다. 새 스킬에서 도매꾹 DOM 선택자나 후기 API를 중복 구현하지 않는다.

## 입력 경계

다음 형식의 실제 상품 상세 URL 하나만 허용한다.

```text
https://domeggook.com/<product-id>
https://www.domeggook.com/<product-id>
```

첫 prototype 입력:

```text
https://domeggook.com/43314131?from=popular100
```

쿼리 문자열은 허용하지만 URL의 host, port와 숫자 상품번호를 검증한다. 검색, 베스트, 카테고리, 로그인, 상품번호 없는 URL과 `javascript:`, `data:`, `file:` URL은 거부한다.

출력 경로는 존재하지 않거나 비어 있어야 한다. 기존 정상 캡처를 덮어쓰지 않는다.

## 1단계: 변경 불가능한 portable bundle

`dmk-extractor`로 한 상품을 한 세션에서 순차 수집한다.

```text
evidence/supplier/domeggook/<product-id>/
├─ manifest.json
├─ page.json
├─ thumbnail/
│  └─ thumbnail.png
├─ detail/
│  ├─ detail-page.png
│  ├─ assets/
│  │  └─ detail-01.png 또는 detail-01.gif ...
│  └─ gif-frames/detail-01/
│     └─ frame-0001.png ...
├─ reviews/
│  └─ reviews.json
└─ evidence/
   └─ browser-harness/recordings/...
```

### 필수 원본

- 요청 URL, 최종 URL과 숫자 상품번호
- 페이지 제목과 상품명
- 실제 상품 상세 여부
- `상품상세 더보기` 클릭과 확장 검증 결과
- 지연 로딩 스크롤과 안정화 지표
- 실제 상세 상단의 대표 갤러리 원본과 자연 크기
- 펼친 판매자 상세설명 내부 이미지의 원본 URL, 자연 크기와 DOM 순서
- 상세설명 원본을 DOM 순서대로 조립한 `detail-page.png`
- 상세설명 DOM 내부 GIF의 원본, 모든 번호 프레임, 표시 시간과 반복 횟수
- 최근 6개월 공개 구매후기 전체와 화면 표시 수·저장 수·완전성
- `상세설명 이미지 사용여부`의 관찰값
- 조사 시각과 Browser Harness 녹화 상대 경로
- 모든 결과 파일의 크기, SHA-256과 이미지 치수

상세설명 내부 GIF가 없거나 표시 후기 수가 0인 것은 정상 상태다. 이 경우 불필요한 GIF 디렉터리를 만들지 않고 후기는 빈 배열로 저장한다.

현재 `dmk-extractor` 구현은 `#lInfoView .lInfoViewItemContents`, `#lInfoViewItemContents`, `[class~="lInfoViewItemContents"]`를 판매자 상세 root로 탐지한다. root 내부에서 자연 크기 500×400px 이상인 이미지를 우선 선택한다. 내부 자산을 하나도 확정하지 못하면 문서 하단의 600×1,200px 이상 장문 이미지를 fallback으로 선택할 수 있다.

새 스킬은 `within_detail_root: true` 자산만 상품 사실과 제품 SSOT에 자동 승격한다. root 밖 fallback 자산은 원본 bundle에는 보존할 수 있지만, 수동 검수 전에는 `status: needs-verification`, `allowed_use: evidence-only`로 둔다.

이를 bundle만으로 독립 검증할 수 있도록 각 상세 자산에 `within_detail_root`, `selection_mode`, `detail_root_selector`, `detail_root_count`를 저장한다. 하나라도 없으면 자산은 증거로만 보존하고 사실 정규화·제품 SSOT 자동 승격을 차단한다. 특정 상품번호, 판매자 CDN 경로, 자산 개수나 이미지 높이를 코드에 고정하지 않는다.

GIF는 파일 확장자와 실제 동적 여부를 분리한다. `gif_source_count`는 GIF MIME 원본 수, `static_gif_count`는 1프레임 GIF 수, `animated_gif_count`는 `animation.animated == true`이면서 `frame_count > 1`인 원본 수다. 정지 GIF는 번호 프레임을 보존할 수 있지만 HyperFrames 참고용 동적 자산으로 분류하지 않는다.

### 개인정보와 접근 안전선

- 후기 작성자 ID, 닉네임, 회원번호, 내부 후기번호와 소유권 플래그를 저장하지 않는다.
- 쿠키, 세션, 요청 헤더, 로그인 토큰과 공급사 전화번호·이메일을 저장하지 않는다.
- CAPTCHA, 로그인, 비밀글과 접근 제한을 우회하지 않는다.
- `상세설명 이미지 사용여부: 사용허용`은 관찰값일 뿐 판매용 사용권 보증으로 해석하지 않는다.

## 2단계: 공급처 사실 정규화

검증된 portable bundle만 읽어 다음 네 산출물을 만든다. 원본 번들은 수정하지 않는다.

```text
planning/
├─ supplier-photo-inventory.json
├─ supplier-facts.json
├─ supplier-appeal-candidates.json
└─ supplier-planning-brief.json
```

- `supplier-photo-inventory.json`: 대표·상세 원본을 `identity-primary`, `identity-detail`, `geometry`, `demonstration`, `exclude`로 분류하고 보이는 사실, 허용 용도와 SSOT 승격 상태를 기록한다.
- `supplier-facts.json`: 상품명, 치수, 재질, 구조, 구성, 사용 정보와 운영 정보를 원문·정규화 값·locator로 보존한다.
- `supplier-appeal-candidates.json`: 소구 후보마다 이를 지지하는 하나 이상의 fact ID, 검증 상태와 금지 확장을 기록한다.
- `supplier-planning-brief.json`: 제품 질문, 구매 서사, 필요한 정지 이미지·모션, 정보 공백과 금지 주장을 정리한다. 기획 결과는 제품 사실의 새로운 출처가 아니다.

### 사실 범주

1. **상품 식별**: 상품번호, 상품명, 모델·브랜드·제조사·원산지.
2. **판매 구성**: 최소 주문수량, 포장 단위, 구성품, 옵션명과 옵션별 구성.
3. **물리 사양**: 크기, 무게, 용량, 색상, 소재, 부품과 결합 구조.
4. **사용 정보**: 사용 대상, 사용 순서, 관리·세척·보관법과 주의사항.
5. **근거 주장**: 시험·인증·성능·효과 문구와 함께 표시된 조건·문서.
6. **운영 정보**: 가격, 옵션 추가금, 재고·배송 조건과 수집 시각.

운영 정보는 변동 가능하므로 상세페이지의 영구 제품 사실이나 광고 주장에 사용하지 않는다.

### 사실 레코드

각 사실은 최소한 다음 필드를 가진다.

```json
{
  "fact_id": "supplier-fact-001",
  "category": "physical-spec",
  "raw_label": "공급처에 표시된 원문 라벨",
  "raw_value": "공급처에 표시된 원문 값",
  "normalized_value": null,
  "unit": null,
  "source_path": "detail/assets/detail-03.png",
  "source_locator": {
    "kind": "image-region",
    "asset_index": 3,
    "region": [0.0, 0.0, 1.0, 1.0]
  },
  "observed_at": "ISO-8601",
  "volatility": "stable",
  "status": "source-stated",
  "allowed_use": "page-copy",
  "publication_status": "inferred",
  "publishable": false
}
```

### 정규화 규칙

- `raw_label`과 `raw_value`는 원문 그대로 보존한다.
- 단위 변환과 표기 통일은 `normalized_value`에만 기록한다.
- DOM 텍스트, 상세 이미지와 GIF 프레임의 어느 위치에서 읽었는지 locator를 남긴다.
- 이미지 OCR 결과는 원본 영역과 대조해 사람이 확인하기 전까지 `status: needs-verification`으로 둔다.
- 원본에서 확인할 수 없는 필드는 `null`과 `missing` 상태로 남기고 추정하지 않는다.
- 공급처 문구가 곧 시험 결과나 인증의 진위를 보증하지 않는다. 원문 문서가 없으면 `allowed_use: planning-only`로 제한한다.
- 후기는 고객 불편과 사용 언어를 찾는 보조 근거이며 상품 규격·성능 사실의 출처로 사용하지 않는다.
- 근거 상태와 게시 상태를 분리한다. `status`는 `source-stated`, `needs-verification`, `missing`, `conflict`를 사용하고, `publication_status`는 `confirmed`, `inferred`, `unknown`, `prohibited`를 사용한다.
- `publishable: true`는 원본 locator를 사람이 확인해 `publication_status: confirmed`가 된 사실에만 허용한다. 소구 후보와 기획 문장은 연결된 모든 사실이 확인되어도 별도의 카피 승인을 거친다.
- 치수는 한 이미지 안의 숫자만 떼지 않고 치수선이 가리키는 부위, 원문 단위와 제품 방향을 함께 기록한다.
- 공급처 원본 사진은 역할 인벤토리에 먼저 등록한다. 배경·손·소품이 포함된 대표 이미지를 곧바로 누끼 SSOT로 승격하지 않는다.

## 제품 SSOT 가져오기

검증된 대표 이미지와 상세 자산 중 실제 SKU를 보여주는 파일만 다음 위치로 가져온다.

```text
asset/input/product-ssot/supplier/
```

가져온 각 파일은 `asset/ssot/product-manifest.json`에서 원본 bundle 상대 경로와 SHA-256을 참조한다. 배너, 추천상품, 후기 이미지, 배송·교환·반품 안내와 사이트 UI는 제품 SSOT에서 제외한다.

공급처 이미지는 사용자 촬영 원본을 대체하지 않는다. 두 출처가 충돌하면 자동으로 하나를 선택하지 않고 차이를 기록해 사용자 확인을 받는다.

## 실패와 중단 조건

### 하드 실패

다음 상태에서는 정상 `manifest.json`을 만들거나 후속 기획으로 진행하지 않는다.

- `URL_INVALID`
- `OUTPUT_EXISTS`
- `PAGE_BLOCKED`
- `NOT_PRODUCT_DETAIL`
- `DETAIL_EXPAND_FAILED`
- `LAZY_LOAD_UNSTABLE`
- `THUMBNAIL_NOT_FOUND`
- `DETAIL_ASSET_NOT_FOUND`
- `DETAIL_TOO_LARGE`
- `GIF_SOURCE_FETCH_FAILED`
- `GIF_SOURCE_INVALID`
- `GIF_FRAME_LIMIT_EXCEEDED`
- `REVIEW_FETCH_FAILED`
- `CAPTURE_VALIDATION_FAILED`

실패 결과는 `.partial-*` 디렉터리의 `capture-failure.json`에 실패 코드, 마지막 성공 단계와 재개 조건만 기록한다. 차단을 계정이나 IP 전체의 영구 차단으로 확대 해석하지 않는다.

### 정보 공백

다음은 캡처 전체의 실패가 아니지만 관련 주장·섹션을 차단한다.

- 규격·구성·옵션이 공급처 원문에 없음
- 시험·인증 문구는 있으나 원문 문서나 조건이 없음
- 제품 이미지가 한 각도뿐이거나 실제 SKU 구조가 가려짐
- 공급처 이미지와 사용자 촬영 원본이 충돌함
- OCR이 모호하거나 단위·수치가 판독되지 않음

공백은 `planning/supplier-facts.json`에 기록하고, 사용자 확인이나 추가 사진이 도착하기 전까지 해당 사실을 카피·ImageGen·GIF에 사용하지 않는다.

## 완료 조건

- `dmk-extractor` 검증이 성공한다.
- 요청·최종 URL의 상품번호가 일치한다.
- 대표 이미지와 펼친 상세설명 원본이 존재한다.
- 모든 결과 파일이 manifest의 크기·SHA-256·치수와 일치한다.
- 후기 표시 수와 저장 수가 일치하거나 명시된 제한 수집이다.
- 개인정보 제거 플래그가 참이다.
- `supplier-facts.json`의 모든 값이 원본 경로와 locator를 가진다.
- 누락·충돌·검증 대기 사실이 명시적으로 기록된다.
- 제품 SSOT로 가져온 모든 파일이 원본 bundle SHA-256으로 역추적된다.
- 제품 사실과 제품 SSOT에 자동 승격된 상세 자산은 모두 `within_detail_root: true`다.
- 모든 상세 자산에 root provenance와 선택 방식이 저장된다.
- `gif_source_count`, `static_gif_count`, `animated_gif_count`가 실제 프레임 판정과 일치한다.
- 원본 사진, 치수·제품 사실, 소구 후보와 기획 브리프가 서로 다른 산출물이며 모든 소구 후보가 fact ID로 역추적된다.
- 게시 가능한 사실은 모두 `publication_status: confirmed`, `publishable: true`이고 수동 확인 이력이 있다.
