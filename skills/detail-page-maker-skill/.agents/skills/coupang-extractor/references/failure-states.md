# 실패 상태와 행동

| 코드 | 의미 | 행동 |
|---|---|---|
| `URL_INVALID` | 직접 쿠팡 상품 URL 또는 숫자 ID 계약 실패 | URL을 바꾸지 말고 중단 |
| `OUTPUT_EXISTS` | 고정 tests 출력에 기존 정상 결과가 있음 | 덮어쓰지 않고 명시적 빈 `--output`을 사용 |
| `LOCAL_RUNTIME_FAILED` | Browser Harness 연결·실행 실패 | 진단 1회 후 수동 북마클릿 경로 제안 |
| `ACCESS_BLOCKED` | Access Denied, CAPTCHA, challenge | 즉시 중단, 재시도 0회 |
| `LOGIN_REQUIRED` | 로그인·MFA·계정 선택 벽 | 자동 처리 없이 중단 |
| `PRODUCT_MISMATCH` | 세 수집기의 상품 ID 불일치 | 합치기·다운로드 중단 |
| `THUMBNAIL_NOT_FOUND` | 갤러리나 유효 메인 이미지 없음 | 다른 수집 결과가 있으면 전체 `PARTIAL` |
| `THUMBNAIL_ITEM_TIMEOUT` | 클릭 후 이미지 교체·decode timeout | 해당 항목 실패를 남기고 다음 항목 진행 |
| `DETAIL_REGION_UNCERTAIN` | 구체 상세 루트를 잠그지 못함 | broad fallback 결과를 `PARTIAL`로만 보존 |
| `DETAIL_ASSET_NOT_FOUND` | 유효 상세 이미지 없음 | 다른 수집 결과가 있으면 전체 `PARTIAL` |
| `LAZY_LOAD_INCOMPLETE` | 상세 스크롤 단계·시간 상한 도달 | 수집분 보존, `PARTIAL` |
| `REVIEW_TAB_NOT_FOUND` | 공개 상품평 탭 없음 | `PARTIAL`, 추정 API 사용 금지 |
| `REVIEW_CARD_NOT_FOUND` | 탭은 열렸으나 확인된 후기 카드 없음 | `PARTIAL` |
| `REVIEW_PAGE_TIMEOUT` | 다음 페이지 변화 timeout | 수집분 보존, `PARTIAL` |
| `RATING_FILTER_NOT_FOUND` | 별점 combobox가 없음 | 저평점 표본을 꾸미지 않고 `PARTIAL` |
| `RATING_OPTION_NOT_FOUND` | 1·2·4·5점 옵션 중 하나가 없음 | 해당 bucket 부족분 기록 |
| `RATING_FILTER_TIMEOUT` | 별점 선택 후 카드가 바뀌지 않음 | 해당 bucket 중단, 다음 bucket 진행 |
| `RATING_BUCKET_SHORTAGE` | 2:1 목표 수량을 못 채움 | 실제 rating_counts와 부족분 보고 |
| `LATEST_SORT_NOT_FOUND` / `LATEST_SORT_TIMEOUT` | 최신순 컨트롤을 찾거나 선택 상태를 확인하지 못함 | 최신 표본으로 꾸미지 않고 `latest_minimum_met:false` |
| `LATEST_REVIEW_SHORTAGE` / `MAX_LATEST_PAGES` | 최신 100개 최소 표본을 못 채움 | 실제 최신 수량과 종료 이유 보고 |
| `MAX_SUPPLEMENT_PAGES` | 2:1 보강 단계 페이지 상한 도달 | 보강 수량·부족분 보고 |
| `STABLE_NO_NEW_REVIEWS` | 같은 후기 집합 2회 | 정상 유한 종료, 관측 범위 보고 |
| `NO_NEXT_PAGE` | 다음 페이지가 없음 | 정상 유한 종료, 전체 보장 금지 |
| `MAX_PAGES` / `MAX_REVIEWS` | 사용자 상한 도달 | `PARTIAL`, 요청 범위 보고 |
| `DOWNLOAD_FAILED` | CDN 1회 요청 실패 | 실패 asset 기록, 전체 `PARTIAL` |
| `VALIDATION_FAILED` | 구조·개인정보·해시 불변식 실패 | READY 금지 |

명시적 사이트 차단 뒤에는 새 프로필·IP·프록시·계정·지문 회전을 하지 않는다. 동일 URL 자동 재시도도 하지 않는다.
