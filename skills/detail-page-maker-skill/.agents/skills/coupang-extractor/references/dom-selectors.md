# DOM 선택자 레지스트리

이 파일은 fallback 순서를 기록한다. 실제 쿠팡 DOM에서 smoke test로 확인한 선택자만 `confirmed`로 승격한다. 현재 항목은 `detail-page` 레포의 북마클릿과 2026-07-21 handoff에서 가져온 후보이며 live 보장은 아니다.

## 썸네일 후보

갤러리 항목:

```text
.product-image li
.prod-image__item
.prod-image__items > li
.prod-image__items > div
[class~="prod-image__item"]
```

메인 이미지:

```text
.product-image img
img.prod-image__detail
.prod-image__detail img
#repImageContainer img
.prod-image__detail-image img
```

`2026-07-21` 표시형 Chrome smoke test에서 productId `8194396050`, itemId `23464171617`의 최신 `twc-*` 레이아웃은 `.product-image li` 8개를 갤러리 항목으로, `.product-image img` 중 표시 면적이 가장 큰 이미지를 메인 이미지로 확인했다. 이 두 선택자는 해당 관측 범위에서 `confirmed`다.

## 상세 후보

구체 루트 우선순위:

```text
#productDetail
#productDetailDisplay
#product-detail
.product-detail
.vendor-item-detail
.prod-description
.product-detail-content
```

`[class*="detail"]`은 진단 fallback일 뿐 READY 근거가 아니다. 갤러리, 리뷰, 추천·연관상품 조상 안 이미지는 제외한다.

## 후기 후보

카드 후보:

```text
article.sdp-review__article__list__review
.sdp-review__article__list__review
[class*="review"] article
```

본문 후보:

```text
.sdp-review__article__list__review__content
[class*="review__content"]
[data-review-content]
[class~="twc-break-all"]
```

`2026-07-21` 동일 smoke test에서 최신 `twc-*` 레이아웃은 `[class*="review"] article` 10개를 후기 카드로, 카드 안 `[class~="twc-break-all"]`을 후기 본문으로 확인했다. `[data-review-id]`는 후기 카드가 아니라 도움 버튼 컨테이너였으므로 카드 후보에서 제외했다. 별점은 카드 안 `bg-full-star` 개수, 도움 수는 `[data-review-id][data-count]`의 `data-count`로 관측했다.

같은 레이아웃의 페이지네이션은 숫자 버튼 1~10과 양끝의 빈 화살표 버튼을 한 컨테이너의 직접 자식으로 렌더했다. 현재 페이지 다음 숫자 버튼을 우선하고, 다음 숫자가 없을 때 활성화된 마지막 빈 버튼으로 다음 묶음을 연다.

별점 필터는 `#sdpReview [role="combobox"]`의 `모든 별점` 컨트롤이며, 열린 포털의 `[role="option"]` 라벨은 `최고=5`, `좋음=4`, `보통=3`, `별로=2`, `나쁨=1`로 관측했다. 필터 선택 뒤 카드의 `bg-full-star` 개수와 선택 bucket이 같은 항목만 저장한다.

`2026-07-21` productId `7428330754`, itemId `23800281366`의 표시형 Chrome에서 후기 정렬은 `베스트순`과 `최신순` 텍스트 버튼으로 관측했다. 최신 표본은 `모든 별점`을 확인한 뒤 정확히 `최신순`인 표시 버튼을 클릭하고 선택 스타일 또는 카드 순서 변화를 확인해야 한다.

탭·페이지 버튼은 `상품평`, `구매후기`, `리뷰`, `다음`의 접근성 이름과 의미 있는 컨테이너를 함께 사용한다. selector가 맞지 않으면 원본 DOM 전체를 저장하지 말고 최소 진단만 남긴다.

## 갱신 규칙

실페이지 smoke test 후 날짜, URL의 productId/itemId, 성공·실패 selector와 관측 범위를 기록한다. 후기 원문·작성자·쿠키는 fixture나 문서에 복사하지 않는다.
