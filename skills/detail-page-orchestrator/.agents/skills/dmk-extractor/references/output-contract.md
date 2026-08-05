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
│  ├─ assets/
│  │  └─ detail-01.png 또는 detail-01.gif ...
│  └─ gif-frames/detail-01/
│     └─ frame-0001.png ...
├─ reviews/
│  └─ reviews.json
└─ evidence/
   └─ browser-harness/
      └─ recordings/<recording-name>/...
```

모든 JSON은 UTF-8, 두 칸 들여쓰기, 마지막 줄바꿈으로 저장한다. 경로는 출력 루트 기준 POSIX 상대 경로로 원장에 기록한다.

## thumbnail/thumbnail.png

- 검색 결과 카드가 아니라 실제 상품 상세 상단의 대표 갤러리 이미지를 사용한다.
- `alt="상품 섬네일 이미지"`를 최우선으로 하고, 없으면 `thumbLightbox`, `gallery`, `main`, `product`, `item`, `goods` 상위 요소를 점수화한다.
- 렌즈 검색 버튼, 배너, 로고, 추천상품, 확대 UI를 제외한다.
- 같은 Browser Harness 세션에서 원본 URL을 직접 열거나 격리 문서에 렌더링해 자연 크기로 캡처한다.
- 최소 자연 크기는 250×250px이다.

## detail/detail-page.png

- `상품상세 더보기`를 클릭하고 확장 상태와 지연 로딩 완료를 먼저 검증한다.
- `.lInfoViewItemContents` 등 판매자 상세설명 콘텐츠 영역 안의 이미지 원본을 우선한다.
- 공지, 정책, 배송·교환·반품, 추천, 구매후기, 사이트 UI 이미지는 제외한다.
- 원본 이미지를 DOM 순서대로 캡처하고 폭이 다르면 흰색 배경 중앙 정렬로 세로 조립한다.
- 각 원본 PNG도 `detail/assets/`에 보존하고 원본 URL·자연 크기·직접 열기 여부를 `page.json`에 기록한다.
- CDP 한 번의 장문 캡처를 피하고 최대 7,000px 높이 타일로 캡처한다.
- 완성 이미지 최소 크기는 600×1,000px이다.

## 애니메이션 GIF

- GIF 분리 대상은 `상품상세 더보기`로 펼친 판매자 상세설명 DOM 내부에서 `within_detail_root: true`로 확인된 자산뿐이다.
- 대표 상품 썸네일, 헤더, 공급사 공지, 후기, 추천상품, 로딩 아이콘, 사이트 UI의 GIF는 원본·프레임 분리 대상이 아니다.
- 대상 GIF가 0개이면 `detail/gif-frames/`와 `.gif` 원본을 만들지 않는다. 이는 정상 완료 상태다.
- URL 확장자만 믿지 말고 응답 MIME과 `GIF87a`·`GIF89a` 시그니처를 검증한다.
- 같은 Browser Harness 탭에서 원본 GIF 바이트를 청크 단위로 읽어 `detail/assets/detail-XX.gif`에 그대로 보존한다.
- 모든 프레임을 빠짐없이 `detail/gif-frames/detail-XX/frame-0001.png`, `frame-0002.png`처럼 4자리 번호로 저장한다.
- 각 프레임의 번호, 표시 시간, 크기, 상대 경로와 전체 프레임 수·반복 횟수를 `page.json`에 기록한다.
- `detail-page.png` 조립에는 첫 프레임을 대표 정지 이미지로 사용하되 원본 GIF와 번호 프레임을 삭제하지 않는다.
- 프레임 수·전체 픽셀이 안전 한도를 넘으면 일부만 조용히 저장하지 말고 `GIF_FRAME_LIMIT_EXCEEDED`로 실패한다.

## reviews/reviews.json

도매꾹 상품 페이지가 공개적으로 사용하는 최근 6개월 구매후기 응답만 같은 브라우저 세션에서 읽는다.

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

- 순차 evidence ID
- 1~5 정수 별점
- 후기 본문
- 공급사 답변 또는 `null`
- 페이지에 표시된 작성일
- 프리미엄 후기 여부
- 공개 후기 이미지 URL 배열

다음 필드는 원본 응답에 있어도 저장하지 않는다.

- 작성자 ID·닉네임·회원번호
- 내부 후기번호
- 삭제·소유권 플래그
- 쿠키·세션·요청 헤더
- 로그인 토큰

표시 후기 수가 0이면 빈 배열을 정상으로 허용한다. 전체 수집에서 저장 수가 표시 수와 다르면 성공으로 승격하지 않는다. `--review-limit`이 명시된 경우에만 제한 수까지의 부분 수집을 정상으로 표시한다.

## page.json

최소한 다음을 저장한다.

- 요청 URL, 최종 URL, 상품번호, 제목, 상품명
- 페이지 유형과 실제 상품 상세 판정
- 상세 더보기 클릭·확장 검증
- 지연 로딩 스크롤 지표
- 대표 썸네일 원본 URL과 자연 크기
- 상세설명 원본 URL·자연 크기·조립 순서
- 화면의 후기 수와 후기 수집 상태
- 상세설명 이미지 사용여부 관찰값
- Browser Harness 녹화 상대 경로와 조사 시각

페이지 전체 본문, 공급사 전화번호·이메일, 쿠키, 요청 헤더, 로그인 상태는 저장하지 않는다.

## manifest.json

모든 결과 파일에 대해 다음을 기록한다.

- `path`
- `kind`
- `size_bytes`
- `sha256`
- 이미지라면 `width_px`, `height_px`

원장에는 `browser_mode: isolated_headless_browser_harness`, 요청·최종 URL, 상품번호, 후기 표시 수·저장 수·완전성, 조사 시각을 포함한다. 원장 자신의 해시는 콘솔 완료 응답에서 별도로 보고한다.

## 사용권과 접근 안전선

- 공개 접근 가능 여부와 판매용 사용 권리는 별개다.
- `상세설명 이미지 사용여부: 사용허용`은 해당 페이지의 관찰값일 뿐 제3자 상표·인물·인증서까지 포괄하는 권리 보증이 아니다.
- CAPTCHA, 로그인, 비밀글, 접근 제한을 우회하지 않는다.
- 한 상품을 순차 수집하고 후기 페이지 요청 사이에 짧은 간격을 둔다.
- 차단 페이지나 오류 화면을 상품 자산으로 저장하지 않는다.
