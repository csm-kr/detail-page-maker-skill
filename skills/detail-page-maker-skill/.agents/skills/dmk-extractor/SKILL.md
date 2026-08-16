---
name: dmk-extractor
description: 도매꾹(domeggook.com) 상품 URL 하나를 HTTP로 직접 받아 대표 썸네일, 판매자 상세설명 원본과 조립 이미지, 최근 6개월 공개 구매후기를 추출하고 검증된 portable bundle로 저장한다. coupang-manager의 공급처 근거 수집, 도매꾹 썸네일·상세·후기 3종 가져오기, coupang-detail-page-maker 입력용 공급처 원문 확보가 필요할 때 사용한다.
---

# 도매꾹 통합 추출기

이 스킬은 `coupang-manager`의 도매꾹 근거 수집 전문 작업자다. 지정 URL 하나의 썸네일·상세·공개 후기 번들만 만들고 상품기획·콘텐츠기획·승인을 수행하지 않는다. 검증된 번들과 상태를 `coupang-manager`에 반환한다.

도매꾹 실제 상품 상세 URL 하나에서 썸네일, 판매자 상세설명, 공개 구매후기를 한 번에 수집하라. 브라우저를 띄우지 말고 HTTP GET만 사용하라.

## 실행 원칙

- 먼저 [출력 계약](references/output-contract.md)을 읽고 완전성·개인정보·사용권 기준을 적용하라.
- 상품번호가 포함된 `domeggook.com` 실제 상세 URL만 허용하라.
- 응답은 `euc-kr`이다. `cp949`로 디코드하라. UTF-8로 읽으면 한글이 전부 깨진다.
- 판매자 상세설명은 최초 응답의 `<textarea id="contentsBuffer">`에서 전량 회수하라. `상품상세 더보기`는 CSS 토글일 뿐이라 클릭·확장 검증·스크롤이 필요 없다.
- CAPTCHA, 로그인, 접근 제한, 비밀글 또는 권한 벽을 우회하지 말라.
- 한 상품을 한 세션에서 순차 수집하고 병렬 요청이나 무제한 재시도를 하지 말라.
- 후기 작성자 ID, 회원번호, 내부 후기번호, 소유권 플래그를 결과에 저장하지 말라.
- 공급처 페이지의 `상세설명 이미지 사용여부` 문구는 관찰값으로만 기록하고 판매용 사용권으로 단정하지 말라.
- 상세 이미지는 `contentsBuffer` 안의 것만 쓰라. 페이지 나머지 200여 개 이미지는 사이트 UI·추천·후기 영역이므로 수집 대상이 아니다.
- 정상 결과가 이미 있는 출력 디렉터리를 덮어쓰지 말라.

## 입력

필수 입력은 도매꾹 실제 상품 상세 URL 1개와 비어 있거나 존재하지 않는 새
`--output` 경로다. `coupang-manager`에서는 프로젝트 스키마 결합을 피하기 위해
항상 portable bundle 출력 경로를 명시하고, 검증 후 `coupang-detail-page-maker`
가 현재 프로젝트로 가져오게 한다. `--project-root`는 호환 가능한 별도 commerce
프로젝트에서만 사용한다.

허용 예시:

```text
https://domeggook.com/60851997
https://domeggook.com/60851997?from=lstGen
https://www.domeggook.com/60851997
```

검색·베스트·카테고리·로그인 URL, 상품번호 없는 URL, `javascript:`·`data:`·`file:` URL은 거부하라.

## 실행

PowerShell에서 다음처럼 실행하라.

```powershell
python -X utf8 <skill-dir>\scripts\extract_dmk.py `
  --url "https://domeggook.com/60851997?from=lstGen" `
  --output "<workspace>\tests\dmk-extractor-60851997"
```

기본값은 최근 6개월 공개 후기 전체를 수집한다. 일부만 필요하다고 사용자가
명시한 경우에만 `--review-limit <개수>`를 추가한다. `coupang-manager`는
`--output` 번들을 검증한 뒤 `DmkExtractorAdapter`로 현재 프로젝트에 가져온다.

필요한 것은 Python과 Pillow뿐이다. Chrome, CDP, Browser Harness를 쓰지 않는다.

## 수집 순서

1. URL의 호스트·포트·상품번호를 검증하라.
2. 상품 페이지를 GET하고 응답 바이트를 `evidence/http/page.html`에 그대로 보존하라.
3. 차단 문구를 확인하고, `var itemNo`가 요청 상품번호와 같고 `contentsBuffer`가 있는지로 실제 상품 상세를 판정하라.
4. `<img id="lThumbImg">`의 원본 URL을 내려받아 `thumbnail/thumbnail.png`로 저장하라.
5. `contentsBuffer`를 꺼내 엔티티를 되돌리고 `<img>`를 DOM 순서대로 모으라. 사이트 UI 자산과 `data:` URI는 버리라.
6. 각 원본을 `detail/assets/detail-01.*`로 바이트 그대로 보존하고, 세로로 조립해 `detail/detail-page.png`를 만들라. 폭이 다르면 흰 배경 중앙 정렬한다. GIF는 첫 프레임을 쓰고 프레임 분리는 하지 않는다.
7. 페이지에 박힌 후기 총개수를 읽고 공개 `reviewAjax.php`를 페이지별로 순차 호출하라. 화면의 후기 수와 수집 수를 대조하라.
8. 별점 `A`~`E`를 5~1 정수로 바꾸고 작성자 식별자와 내부 후기번호를 제거한 `reviews.json`, 최소 상품 메타데이터 `page.json`, 요청 원장 `requests.jsonl`을 저장하라.
9. SHA-256 원장을 만들고 `validate_capture.py`로 검증한 뒤에만 완료로 보고하라.

## 실패 처리

다음 상태를 명확히 구분하라.

- `URL_INVALID`: 도매꾹 실제 상품 상세 URL이 아님
- `OUTPUT_EXISTS`: 정상 결과를 덮어쓸 수 있음
- `PAGE_FETCH_FAILED`: HTTP 요청 자체가 실패
- `PAGE_BLOCKED`: CAPTCHA·로그인·Access Denied·접근 제한
- `NOT_PRODUCT_DETAIL`: 상품번호가 일치하는 실제 상세가 아님
- `THUMBNAIL_NOT_FOUND`: 대표 갤러리 원본을 확정하지 못함
- `DETAIL_BUFFER_NOT_FOUND`: 판매자 상세설명 버퍼를 찾지 못함
- `DETAIL_ASSET_NOT_FOUND`: 상세설명에서 이미지 원본을 찾지 못하거나 안전 한도 초과
- `ASSET_DOWNLOAD_FAILED`: 원본 내려받기 실패, 이미지가 아님, 총량 한도 초과
- `REVIEW_FETCH_FAILED`: 후기 응답·형식 검증 실패 또는 수집 수 불일치
- `CAPTURE_VALIDATION_FAILED`: 파일·해시·크기·개인정보·수집 수 불일치

실패하면 정상 `manifest.json`을 만들지 말고 `.partial-*` 디렉터리에 `capture-failure.json`만 남겨 상태 코드와 재개 조건과 함께 보고하라. 접근 제한을 전체 IP·계정 차단으로 확대 해석하지 말라.

## 검증

수집 후 다음을 실행하라.

```powershell
python -X utf8 <skill-dir>\scripts\validate_capture.py "<output-dir>"
```

파싱·정제 회귀 테스트는 실제 응답 픽스처로 네트워크 없이 돌린다.

```powershell
python -X utf8 -m unittest discover -s <skill-dir>\scripts\tests -p "test_*.py"
```

성공 보고에는 상품번호, 요청·최종 URL, 출력 루트, 썸네일·상세페이지·후기 JSON 경로, 상세 원본 수, 후기 표시 수와 저장 수, `manifest.json` SHA-256, HTTP 증거 상대 경로를 포함하라.
