---
name: dmk-extractor
description: 도매꾹(domeggook.com) 상품 URL 하나를 격리 Browser Harness로 열어 대표 썸네일, 펼친 상세페이지와 내부 GIF 프레임, 최근 6개월 공개 구매후기를 추출하고 검증된 portable bundle로 저장한다. coupang-manager의 공급처 근거 수집, 도매꾹 썸네일·상세·후기 3종 가져오기, coupang-detail-page-maker 입력용 공급처 원문 확보가 필요할 때 사용한다.
---

# 도매꾹 통합 추출기

이 스킬은 `coupang-manager`의 도매꾹 근거 수집 전문 작업자다. 지정 URL 하나의 썸네일·상세·공개 후기 번들만 만들고 상품기획·콘텐츠기획·승인을 수행하지 않는다. 검증된 번들과 상태를 `coupang-manager`에 반환한다.

도매꾹 실제 상품 상세 URL 하나에서 썸네일, 판매자 상세설명, 공개 구매후기를 한 번에 수집하라. 사용자 Chrome 대신 임시 프로필의 격리된 headless Chrome과 Browser Harness만 사용하라.

## 실행 원칙

- 먼저 [출력 계약](references/output-contract.md)을 읽고 완전성·개인정보·사용권 기준을 적용하라.
- 상품번호가 포함된 `domeggook.com` 실제 상세 URL만 허용하라.
- CAPTCHA, 로그인, 접근 제한, 비밀글 또는 권한 벽을 우회하지 말라.
- 한 상품을 한 세션에서 순차 수집하고 병렬 요청이나 무제한 재시도를 하지 말라.
- 후기 작성자 ID, 회원번호, 내부 후기번호, 소유권 플래그를 결과에 저장하지 말라.
- 공급처 페이지의 `상세설명 이미지 사용여부` 문구는 관찰값으로만 기록하고 판매용 사용권으로 단정하지 말라.
- GIF 프레임 분리는 펼친 판매자 상세설명 DOM 내부 자산에만 적용하라. 대표 썸네일·헤더·공지·후기·추천·로딩 아이콘의 GIF는 분리하지 말라.
- 판매자 상세설명 내부에 GIF가 없으면 GIF 관련 디렉터리나 파일을 만들지 말고 일반 수집을 그대로 완료하라.
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
`--output` 번들을 검증한 뒤 maker의 `import_extractor_bundle.py`로 가져온다.

## 수집 순서

1. URL의 호스트·포트·상품번호를 검증하라.
2. 임시 Chrome 프로필, 임시 CDP 포트, 격리 Browser Harness 런타임을 만들라.
3. `start_recording()` 후 `new_tab(<상품 URL>)`로 직접 열고 실제 상품 상세인지 판정하라.
4. 접근성 트리에서 `상품상세 더보기`를 찾아 좌표 클릭하고 `상품상세 접기` 또는 문서 높이 증가로 확장을 검증하라.
5. 제한된 단계 스크롤로 지연 로딩을 완료하라.
6. 실제 상품 상세 상단의 대표 갤러리 이미지를 원본 크기로 캡처하라.
7. `within_detail_root: true`인 펼친 판매자 상세설명 영역의 이미지 원본만 DOM 순서대로 열어 `detail-page.png`로 조립하라. 그 내부 자산이 GIF일 때만 원본을 보존하고 모든 프레임을 `frame-0001.png`부터 번호별로 분리하라. 대표 썸네일과 상세 영역 밖 GIF는 분리하지 말라.
8. 페이지가 사용하는 공개 `reviewAjax.php` 요청을 같은 브라우저 세션에서 페이지별로 호출하라. 화면의 최근 6개월 후기 수와 수집 수를 대조하라.
9. 작성자 식별자를 제거한 `reviews.json`, 최소 상품 메타데이터 `page.json`, 핵심 PNG, 녹화 증거를 저장하라.
10. SHA-256 원장을 만들고 `validate_capture.py`로 검증한 뒤에만 완료로 보고하라.
11. Browser Harness 데몬, headless Chrome, 임시 프로필과 임시 CDP 포트를 정리하라.

## 실패 처리

다음 상태를 명확히 구분하라.

- `URL_INVALID`: 도매꾹 실제 상품 상세 URL이 아님
- `OUTPUT_EXISTS`: 정상 결과를 덮어쓸 수 있음
- `PAGE_BLOCKED`: CAPTCHA·로그인·Access Denied·접근 제한
- `NOT_PRODUCT_DETAIL`: 상품번호가 일치하는 실제 상세가 아님
- `DETAIL_EXPAND_FAILED`: 상세 더보기 확장 검증 실패
- `LAZY_LOAD_UNSTABLE`: 제한된 스크롤 안에 문서가 안정되지 않음
- `THUMBNAIL_NOT_FOUND`: 대표 갤러리 원본을 확정하지 못함
- `DETAIL_ASSET_NOT_FOUND`: 판매자 상세설명 원본을 확정하지 못함
- `GIF_SOURCE_FETCH_FAILED`: 같은 브라우저 세션에서 GIF 원본 바이트 회수 실패
- `GIF_SOURCE_INVALID`: GIF MIME·시그니처·디코딩 검증 실패
- `GIF_FRAME_LIMIT_EXCEEDED`: 프레임 수 또는 전체 픽셀이 안전 한도를 넘음
- `REVIEW_FETCH_FAILED`: 후기 응답·페이지 수·콘텐츠 형식 검증 실패
- `CAPTURE_VALIDATION_FAILED`: 파일·해시·크기·개인정보·수집 수 불일치

실패하면 정상 `manifest.json`을 만들지 말고 `.partial-*` 디렉터리에 `capture-failure.json`만 남겨 재개 조건과 함께 보고하라. 접근 제한을 전체 IP·계정 차단으로 확대 해석하지 말라.

## 검증

수집 후 다음을 실행하라.

```powershell
python -X utf8 <skill-dir>\scripts\validate_capture.py "<output-dir>"
```

성공 보고에는 상품번호, 요청·최종 URL, 출력 루트, 썸네일·상세페이지·후기 JSON 경로, GIF 원본 수와 번호 프레임 수, 후기 표시 수와 저장 수, `manifest.json` SHA-256, 녹화 상대 경로를 포함하라.
