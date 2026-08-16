---
name: coupang-extractor
description: 쿠팡 상품 URL 하나를 표시형 Chrome에서 열어 상단 대표·갤러리 썸네일, 판매자 상세페이지 원본·조립 이미지, 최신 공개 구매후기 최소 100개와 저평점 2:1 보강 표본을 수집하고 상품 ID·개인정보 제거·허용 CDN·SHA-256을 검증해 workspace/tests의 portable bundle로 저장한다. 쿠팡 썸네일 가져오기, 상세페이지 이미지 추출, 경쟁상품 후기 수집, 쿠팡 북마클릿 캡처, 상품 근거 번들 생성 요청에 사용한다.
---

# 쿠팡 추출기

쿠팡 상품 링크 하나에서 썸네일·상세·공개 후기를 같은 상품 ID 아래 수집한다. 세 수집기를 분리해 실패를 격리하고, 실제로 관측한 범위만 보고한다.

## 실행 전

1. 웹을 열기 전에 `browser-harness` 스킬을 완전히 읽는다.
2. 항상 [capture-contract.md](references/capture-contract.md)와 [failure-states.md](references/failure-states.md)를 읽는다.
3. 후기를 수집하므로 [review-privacy.md](references/review-privacy.md)를 읽는다.
4. DOM 선택자가 실패하거나 변경된 정황이 있을 때만 [dom-selectors.md](references/dom-selectors.md)를 읽는다.

## 기본 실행

입력은 `https://www.coupang.com/vp/products/<productId>?itemId=<itemId>` 형식의 직접 상품 URL이어야 한다. 다음 명령을 스킬 디렉터리에서 실행한다.

```powershell
python -X utf8 scripts/run_capture.py `
  --url "<COUPANG_PRODUCT_URL>" `
  --workspace "<WORKSPACE>"
```

기본값은 썸네일 전체 순회, 상세 지연 로딩 안정화, `최신순+모든 별점` 후기 최소 100개와 별도 보강 후기 100개다. 보강 표본은 1·2점 합계 67개 대 4·5점 합계 33개로 배분하고 최신 100개와 중복된 후기는 제외한다. 한 별점이 부족하면 같은 저·고평점 그룹의 다른 별점으로 부족분을 채운다. 최신 단계는 최대 12페이지, 보강 단계는 최대 24페이지이며 전체 후기 수집을 뜻하지 않는다. 후기가 100개 미만인 상품은 있는 만큼만 수집하고 공급 소진으로 `READY`가 되므로 목표치를 따로 낮출 필요가 없다.

## 고정 워크플로

1. URL의 host, productId, itemId와 선택적 vendorItemId를 잠근다.
2. `run_capture.py`가 OS 임시 경로의 전역 lock을 잡아 같은 로컬 Chrome을 쓰는
   Browser Harness 캡처를 하나씩 실행한다. lock을 잡은 뒤 새 탭에서 사용자가
   준 URL만 열고 다른 탭·쿠키·계정 정보를 읽지 않는다.
3. 차단·CAPTCHA·로그인 벽을 확인한다. 발견하면 우회나 재시도 없이 중단한다.
4. `thumbnail → detail → reviews` 순서로 같은 페이지 컨텍스트에서 수집한다.
5. 세 조각의 상품 ID를 대조한다. 불일치하면 `PRODUCT_MISMATCH`로 중단한다.
6. 쿠팡 CDN 이미지마다 한 번만 요청하고 리다이렉트를 따르지 않는다. 원본 응답 바이트를 저장한다.
7. 최신순 정렬을 DOM 상태로 확인한 뒤 최신 100개를 먼저 수집하고, 별점 필터를 실제 선택해 2:1 보강 표본을 수집한다.
8. `scripts/validate_capture.py`로 스키마·순서·URL·개인정보·권리·파일 해시를 검증한다.
9. 정상 staging만 고정 출력으로 원자적으로 승격하고 `READY`, `PARTIAL`, `ACCESS_BLOCKED`, `VALIDATION_FAILED`와 관측 범위를 보고한다.

출력은 기본적으로 다음 위치에 생긴다.

```text
<workspace>/tests/coupang-extractor-<productId>-<itemId>/
├── manifest.json
├── page.json
├── capture.json
├── thumbnail/
│   ├── thumbnail.png
│   └── assets/
├── detail/
│   ├── detail-page.png
│   └── assets/
├── reviews/
│   └── reviews.json
└── evidence/
    ├── runner-diagnostics.json
    ├── validation.json
    └── browser-harness/recordings/
```

정상 출력이 이미 있으면 `OUTPUT_EXISTS`로 중단한다. 실패 실행은 같은 위치의 `.partial-<id>` staging에 남기며 기존 정상 번들을 덮어쓰지 않는다. 별도 경로가 필요할 때만 `--output "<EMPTY_OUTPUT_DIR>"`를 사용한다.

## 북마클릿 수동 대체 경로

Browser Harness 연결만 실패했고 사용자가 직접 공개 상품 페이지를 정상 열 수 있을 때 사용한다.

```powershell
python -X utf8 scripts/build_bookmarklets.py --output "<OUTPUT_DIR>"
```

생성된 `coupang-bookmarklets.html`에서 세 링크를 북마크바로 옮긴 뒤 동일 상품에서 각각 한 번 실행한다. 생성된 세 JSON 조각은 다음으로 합친다.

```powershell
python -X utf8 scripts/merge_fragments.py `
  --thumbnail "<THUMBNAIL_JSON>" `
  --detail "<DETAIL_JSON>" `
  --reviews "<REVIEWS_JSON>" `
  --workspace "<WORKSPACE>"
```

기존 `쿠팡 상세 추출` 북마클릿의 줄바꿈 URL은 상세 이미지 참고 입력일 뿐 상품 동일성·후기·무결성을 보장하지 않는다. 새 번들의 대체물로 승격하지 않는다.

## 절대 규칙

- CAPTCHA, 로그인, MFA, Access Denied, 봇 차단을 우회하지 않는다.
- 무제한 페이지네이션·검색어 열거·백그라운드 대량 수집을 하지 않는다.
- 후기 작성자 이름·닉네임·프로필·계정 링크·원본 HTML을 payload에 넣지 않는다.
- 이메일·전화번호·주문번호 형태는 저장 전에 마스킹한다.
- 후기 미디어는 기본 수집하지 않는다.
- `complete_all_reviews`는 항상 `false`다. `PARTIAL`을 전체 수집이라고 표현하지 않는다.
- `latest_baseline`은 `모든 별점`과 `최신순`이 확인된 공개 후기 100개 이상이어야 한다. 정렬을 확인하지 못하거나 페이지 상한에 걸려 100개가 없으면 `latest_minimum_met:false`다.
- `rating_stratified_supplement`는 최신 표본과 중복을 제거한 저평점 1·2점 : 고평점 4·5점 = 2:1 표본이다. 필터 부족이나 페이지 상한으로 못 채우면 `supplement_contract_met:false`와 부족분을 남긴다.
- 공개 후기가 목표보다 적어 더 가져올 것이 없으면 있는 만큼만 수집하고 `supply_exhausted:true`, `stop_reason:REVIEW_SUPPLY_EXHAUSTED`로 `READY`가 된다. 상한 도달이나 페이지 전환 실패로 인한 부족은 그대로 `PARTIAL`이다. 둘을 같은 것으로 보고하지 않는다.
- 경쟁사 이미지와 후기는 `research_reference_only`, `production_use_allowed:false`다.
- 실패 실행으로 기존 성공 번들을 덮어쓰지 않는다.
- 같은 로컬 Browser Harness를 여러 agent가 동시에 직접 실행하지 않는다.
  CPU/RAM worker capacity가 2 이상이어도 local browser lane은 1이다.

## 검증 명령

```powershell
python -X utf8 scripts/validate_capture.py "<BUNDLE>/capture.json" --verify-files
python -X utf8 scripts/hash_artifacts.py "<BUNDLE>" --output "<BUNDLE>/manifest-check.json"
```

검증 실패를 숨기지 말고 `evidence/validation.json`의 오류 코드를 그대로 보고한다.
