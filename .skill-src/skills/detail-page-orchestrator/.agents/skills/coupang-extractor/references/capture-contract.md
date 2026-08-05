# 캡처 계약

## 상품 동일성

- 입력 host는 `coupang.com` 또는 `www.coupang.com`만 허용한다.
- path는 `/vp/products/<숫자 productId>`여야 한다.
- `itemId`는 필수 숫자다. `vendorItemId`는 있으면 숫자여야 한다.
- 정규 URL에는 `itemId`와 선택적 `vendorItemId`만 남긴다.
- thumbnail, detail, reviews 조각의 productId·itemId·vendorItemId가 입력과 같아야 한다. vendorItemId가 입력에 있으면 모든 조각에서 동일해야 한다.

## 관측과 완전성

- 썸네일은 현재 선택 옵션의 화면 상단 갤러리에서 실제 클릭해 관측한 메인 이미지다.
- 상세는 판매자 상세영역에서 실제 로드된 이미지다. 갤러리·추천·리뷰 이미지를 제외한다.
- 후기는 공개 화면에서 유한 페이지 안에 실제 렌더된 카드만 포함한다.
- 후기 1단계는 `모든 별점`과 `최신순` 선택 상태를 확인한 뒤 공개 후기 최소 100개를 DOM 순서대로 저장하는 `latest_baseline`이다.
- 후기 2단계는 최신 표본과 중복을 제외한 `rating_stratified_supplement`다. 기본 100개 목표는 1·2점 합계 67개와 4·5점 합계 33개다. 한 별점이 부족하면 같은 그룹의 다른 별점으로 부족분을 재배분한다.
- 작성자 정보 없이 내용·옵션·날짜가 같은 카드가 여러 개면 occurrence를 부여해 최신 카드 수를 보존한다. 보강 표본 중복 제거는 content-key별 최신 occurrence 수를 차감하는 multiset 방식이다.
- 공개 수량·정렬·필터·페이지 상한 때문에 최신 100개가 부족하면 `latest_minimum_met:false`, 보강 표본이 부족하면 `supplement_contract_met:false`로 표시한다. `sampling_contract_met`는 두 계약을 모두 만족할 때만 true다.
- 후기의 `complete_all_reviews`는 항상 `false`다.
- 일부 항목 timeout, selector fallback, 상한 종료, 다운로드 실패는 `PARTIAL`이다.

## 다운로드와 파일

- CDN host는 `coupangcdn.com` 또는 그 하위 도메인만 허용한다.
- HTTPS, 기본 포트, userinfo 없음만 허용한다.
- 리다이렉트를 따르지 않는다.
- 각 URL은 한 번만 요청한다. 응답 바이트를 재인코딩·리사이즈하지 않는다.
- 각 파일에 상대 경로, byte 수, MIME, SHA-256, 원본 URL을 기록한다.
- 대표 PNG와 상세 세로 조립본은 파생물로 표시하고, 원본 자산과 함께 별도 경로에 저장한다.

## 저장 구조

- 기본 출력은 `<workspace>/tests/coupang-extractor-<productId>-<itemId>/`다.
- 대표 이미지는 `thumbnail/thumbnail.png`, 갤러리 원본은 `thumbnail/assets/`, 상세 조립본은 `detail/detail-page.png`, 상세 원본은 `detail/assets/`에 둔다.
- 후기 전용 뷰는 `reviews/reviews.json`, 최소 페이지 메타데이터는 `page.json`, 전체 원장은 `capture.json`, 모든 파일 해시는 `manifest.json`에 둔다.
- Browser Harness 녹화와 실행·검증 진단은 `evidence/` 아래에 둔다.
- 성공 결과는 `.partial-<id>` staging에서 검증한 후에만 승격한다. 비어 있지 않은 정상 출력은 덮어쓰지 않는다.

## 상태

- `READY`: 요청한 제한 범위가 정상 종료되고 validator가 통과했다.
- `PARTIAL`: 일부 근거는 있으나 누락·상한·DOM 변경·다운로드 실패가 있다.
- `ACCESS_BLOCKED`: 접근 벽을 관측하고 우회하지 않았다.
- `VALIDATION_FAILED`: 상품 ID·스키마·개인정보·URL·파일 해시 계약이 깨졌다.

## 권리

모든 번들은 다음을 고정한다.

```json
{
  "scope": "research_reference_only",
  "production_use_allowed": false,
  "reviewer_identity_stored": false
}
```
