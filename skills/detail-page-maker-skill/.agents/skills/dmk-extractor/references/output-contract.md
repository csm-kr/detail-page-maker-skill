# 도매꾹 통합 추출 출력 계약

## 저장 구조

기본 `<output>`은 `<project>/20-product-planning/research-snapshots/extractors/domeggook/`이며, `project.json`의 `project.id`와 폴더명이 일치하는 현재 commerce 프로젝트만 허용한다.

```text
<output>/
├─ manifest.json
├─ page.json
├─ thumbnail/
│  └─ thumbnail.png
├─ detail/
│  ├─ detail-page.png
│  └─ assets/
│     └─ detail-01.jpg 또는 detail-01.png ...
├─ reviews/
│  └─ reviews.json
└─ evidence/
   └─ http/
      ├─ page.html
      └─ requests.jsonl
```

모든 JSON은 UTF-8, 두 칸 들여쓰기, 마지막 줄바꿈으로 저장한다. 경로는 출력 루트 기준 POSIX 상대 경로로 원장에 기록한다.

## 수집 방식

브라우저를 쓰지 않고 HTTP GET만 사용한다. 도매꾹 상품 페이지는 다음 성질을 갖는다.

- 응답 인코딩이 `euc-kr`이다. UTF-8로 읽으면 한글이 전부 깨지므로 `cp949`로 디코드한다.
- 판매자 상세설명 원문 전체가 최초 응답의 `<textarea id="contentsBuffer">`에 들어 있고, JS는 그 값을 `#lInfoViewItemContents`의 innerHTML로 옮기기만 한다.
- `상품상세 더보기`는 `max-height: 1200px` 토글일 뿐 콘텐츠를 추가로 불러오지 않는다. 따라서 클릭·확장 검증·지연 로딩 스크롤이 필요 없다.
- 후기는 공개 `reviewAjax.php`가 쿠키·로그인 없이 JSON으로 응답한다.

## thumbnail/thumbnail.png

- 검색 결과 카드가 아니라 실제 상품 상세 상단의 대표 갤러리 이미지를 사용한다.
- `<img id="lThumbImg">`의 `src`가 대표 썸네일 원본이다.
- 원본 URL을 그대로 내려받아 PNG로 저장한다. 화면 캡처를 쓰지 않는다.
- 최소 자연 크기는 250×250px이다.

## detail/detail-page.png

- `contentsBuffer` 안의 `<img>`만 대상으로 하며, DOM 순서를 그대로 보존한다.
- `cdn1.domeggook.com/image/` 아래 자산은 사이트 UI이므로 제외한다. 판매자 업로드 이미지는 `cdn1.domeggook.com/upload/` 또는 외부 CDN에 있다.
- 공지, 정책, 배송·교환·반품, 추천, 구매후기 영역은 `contentsBuffer` 밖이라 애초에 수집 범위에 들어오지 않는다.
- `data:` URI와 절대 URL이 아닌 참조는 버린다. 프로토콜 상대경로(`//host/…`)는 `https`로 올린다.
- 각 원본을 `detail/assets/detail-01.*`로 바이트 그대로 보존하고, 원본 URL·Content-Type·자연 크기·조립 순서를 `page.json`에 기록한다. 확장자는 URL이 아니라 실제 시그니처로 정한다.
- 원본을 세로로 이어 붙이고, 폭이 다르면 최대 폭 기준 흰 배경 중앙 정렬로 조립한다.
- 애니메이션 GIF는 첫 프레임을 대표 정지 이미지로 쓴다. 프레임 분리는 하지 않는다.
- 완성 이미지 최소 크기는 600×1,000px이다.
- 상세 원본 개수는 300개, 총 다운로드 용량은 200MB를 넘지 않는다. 넘으면 일부만 조용히 저장하지 말고 실패한다. 판매자가 상세설명을 수십 장으로 잘라 올리는 것이 일반적이라 78장·71,000px 조립도 정상 범위다.

## reviews/reviews.json

도매꾹 상품 페이지가 공개적으로 사용하는 최근 6개월 구매후기 응답만 읽는다. 6개월 범위는 서버가 적용하므로 별도 필터를 두지 않는다.

총개수는 응답이 아니라 페이지에 서버가 박아 둔 값(`"mode":"review"` 호출의 `total`)에서 읽고, 이 값이 `visible_review_count`가 된다. 페이지당 10건씩 `pg`를 증가시키며 순차 호출하고 요청 사이에 짧은 간격을 둔다.

필수 최상위 필드:

- `schema_version`
- `product_id`
- `source_page_url`
- `scope: public_purchase_reviews_recent_six_months`
- `visible_review_count`
- `requested_review_limit`
- `captured_review_count`
- `complete`
- `author_identifiers_removed: true`
- `rating_summary`
- `reviews`

각 후기에는 다음만 저장한다.

- `evidence_id` — 1부터의 순차 ID
- `rating` — 1~5 정수. 원본은 `A`~`E` 문자이며 `A=5, B=4, C=3, D=2, E=1`로 매핑한다.
- `body` — 후기 본문
- `seller_reply` — 공급사 답변 또는 `null`
- `written_on` — 페이지에 표시된 작성일 표기 그대로
- `is_premium` — 프리미엄 후기 여부
- `image_urls` — 공개 후기 이미지 URL 배열. 원본 `files[]`의 `url_1000`을 쓰고 없으면 `url_660`을 쓴다.

원본 응답에 있어도 저장하지 않는다.

- `writeId` 등 작성자 ID·닉네임·회원번호
- `no` 내부 후기번호
- `own` 삭제·소유권 플래그
- 쿠키·세션·요청 헤더
- 로그인 토큰

표시 후기 수가 0이면 빈 배열을 정상으로 허용한다. 전체 수집에서 저장 수가 표시 수와 다르면 성공으로 승격하지 않는다. `--review-limit`이 명시된 경우에만 제한 수까지의 부분 수집을 정상으로 표시한다.

## page.json

최소한 다음을 저장한다.

- 요청 URL, 최종 URL, 상품번호, 상품명
- 페이지 유형과 실제 상품 상세 판정
- `source_encoding`, `detail_source: contentsBuffer`, `capture_mode: direct_http_fetch`
- 대표 썸네일 원본 URL과 자연 크기
- 상세설명 원본 URL·Content-Type·자연 크기·조립 순서와 조립 결과 크기
- 화면의 후기 수와 후기 수집 상태
- 상세설명 이미지 사용여부 관찰값
- `http_evidence_dir`와 조사 시각

페이지 전체 본문, 공급사 전화번호·이메일, 쿠키, 요청 헤더, 로그인 상태는 저장하지 않는다.

## evidence/http

- `page.html` — 상품 페이지 응답 바이트 원본. 디코드하지 않고 그대로 보존한다.
- `requests.jsonl` — 요청 한 건당 한 줄로 URL, 메서드, 상태, 최종 URL, Content-Type, 크기, SHA-256, 시각을 남긴다. 쿠키·요청 헤더·토큰은 남기지 않는다.

## manifest.json

모든 결과 파일에 대해 다음을 기록한다.

- `path`
- `kind`
- `size_bytes`
- `sha256`
- 이미지라면 `width_px`, `height_px`

`kind`는 `structured_product_page`, `product_thumbnail`, `assembled_seller_detail_page`, `seller_detail_source_asset`, `sanitized_public_reviews`, `http_fetch_evidence` 중 하나다.

원장에는 `schema_version: 1.1`, `artifact_type: dmk_extractor_snapshot`, `capture_mode: direct_http_fetch`, `canonical_supplier_url`, 요청·최종 URL, 상품번호, 후기 표시 수·저장 수·완전성, 조사 시각을 포함한다. `canonical_supplier_url`은 어댑터가 요청 공급처 URL과 대조하므로 반드시 정규화된 요청 URL과 같아야 한다. 원장 자신의 해시는 콘솔 완료 응답에서 별도로 보고한다.

## 사용권과 접근 안전선

- 공개 접근 가능 여부와 판매용 사용 권리는 별개다.
- `상세설명 이미지 사용여부: 사용허용`은 해당 페이지의 관찰값일 뿐 제3자 상표·인물·인증서까지 포괄하는 권리 보증이 아니다.
- CAPTCHA, 로그인, 비밀글, 접근 제한을 우회하지 않는다.
- 한 상품을 순차 수집하고 후기 페이지 요청 사이에 짧은 간격을 둔다.
- 차단 페이지나 오류 화면을 상품 자산으로 저장하지 않는다.
