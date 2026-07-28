# 쿠팡 Wing 전용 HTML과 Cloudflare CDN

쿠팡 Wing 등록용 HTML 또는 CDN 게시 요청에는 이 문서를 처음부터 끝까지 읽고
아래 순서대로 수행한다. 최종 승인된 HTML·이미지·GIF를 입력으로 사용하되, 웹페이지용
DOM/CSS를 Wing 등록본에 그대로 복사하지 않는다.

## 목차

- [산출물 계약](#산출물-계약)
- [1. 승인 상태와 입력 잠금](#1-승인-상태와-입력-잠금)
- [2. 780px 에셋 패키지](#2-780px-에셋-패키지)
- [3. 쿠팡 Wing HTML 규칙](#3-쿠팡-wing-html-규칙)
- [4. Cloudflare 연결과 R2 판정](#4-cloudflare-연결과-r2-판정)
- [5. Cloudflare Pages Direct Upload](#5-cloudflare-pages-direct-upload)
- [6. 배포 후 닫힌 검증](#6-배포-후-닫힌-검증)
- [7. 전달](#7-전달)

## 산출물 계약

Studio v1의 `최종 출력`에서 HTTPS CDN 기본 주소를 입력하고
`쿠팡 Wing 포맷으로 내보내기`를 실행한다. 프로젝트 안에
`exports/coupang-wing-780-webp-YYYYMMDD-HHmmss/`를 만들고 다음 파일을 보존한다.

- `coupang-wing-detail-780.html`: 절대 HTTPS CDN URL을 사용하는 Wing 등록본
- `preview-local-780.html`: `assets/` 상대 경로를 사용하는 로컬 검수본
- `cdn-upload-manifest.json`: 배포 정보와 에셋별 규격·해시·실제 URL
- `README.md`: 운영 CDN 주소, 배포 방식, 사용 순서, 검증 결과
- `assets/`: 카피·배경·제품·장식·레이어가 모두 합성된 완성형 정적/애니메이션 WebP

소스 프로젝트나 저장소 공용 폴더를 참조하지 말고 패키지만으로 로컬 검수와 재배포가
가능해야 한다. Wing 등록본과 로컬 검수본의 에셋 순서는 같아야 하며, 두 HTML 모두
이미지 태그만 세로로 연결한다.

Studio는 이 로컬 패키지까지만 만든다. `assets/`를 입력한 immutable CDN revision
경로에 실제 업로드하고 6절의 닫힌 검증을 마치기 전에는
`remote_verification.status`를 `pending`에서 바꾸거나 게시 완료로 보고하지 않는다.

## 1. 승인 상태와 입력 잠금

1. G5 승인, 상용 QA 97점 이상, 사용자 게시 승인, 필수 pending 0개를 확인한다.
2. HTML에서 참조하는 모든 에셋이 `approved`인지 확인한다.
3. 승인본의 바이트를 입력으로 잠그고 변환 뒤 원본 파일을 덮어쓰지 않는다.
4. 의료 효능, 확인되지 않은 수치, 가짜 후기 문구가 없는지 다시 검사한다.

승인이 없거나 필수 에셋이 누락되면 CDN 게시를 시작하지 않는다.

## 2. 780px 에셋 패키지

모든 공개 에셋의 가로 크기를 정확히 780px로 만든다. 360px 레이아웃을 변환할 때는
`780 / 360 = 2.1666666666666665`의 단일 배율을 사용하고 가로·세로에 서로 다른
배율을 적용하지 않는다.

- PNG/JPEG는 입력 자료로만 사용하고, 원본 비율을 유지해 가로 780px 정적 WebP로
  출력한다.
- 웹페이지의 각 최종 섹션을 780px 폭의 완성형 이미지 한 장으로 평면화한다. 텍스트,
  배경, 제품, 번호, 말풍선, 그라데이션, CTA, FAQ 등 고객에게 보여야 할 모든 요소를
  이미지 안에 합성한다.
- 배경과 제품을 `position:absolute`로 겹치도록 나뉜 소스는 반드시 한 장으로 합친다.
  예를 들어 `airflow-bg + airflow`, `finale-bg + finale-product`는 각각 하나의 완성형
  WebP가 되어야 한다.
- 쿠팡 Wing 공개 에셋은 정적·애니메이션을 모두 `.webp`로 출력한다. GIF 입력은
  애니메이션 WebP로 변환하고 프레임 순서, 프레임별 시간, 총 재생 시간과 반복
  설정을 유지한다. 최적화 과정에서 동일 프레임이 병합될 수 있으므로 출력 프레임
  수보다 총 재생 시간과 반복 설정의 일치를 필수로 검사한다.
- 각 파일은 10MiB 미만이어야 한다. 초과 애니메이션은 먼저 품질과 프레임 압축을
  조정하되 움직임의 의미와 타이밍을 바꾸지 않는다.
- 파일명은 표시 순서가 드러나는 `01-...`, `02-...` 형식으로 고정한다.
- 바이트가 바뀌면 기존 immutable URL을 덮어쓰지 말고 revision을 올린다.

매니페스트의 각 에셋에 다음 값을 기록한다.

`order`, `asset_id`, `source_filename`, `filename`, `kind`, `format`,
`mime_type`, `width`, `height`, `frames`, `duration_ms`, `loop_count`, `bytes`,
`megabytes`, `under_10mb`, `sha256`, `cdn_url`

## 3. 쿠팡 Wing HTML 규칙

Wing 등록본은 다음 규칙을 모두 만족해야 한다.

- 공개 HTML은 이미지 중심의 sanitizer-safe 마크업이어야 한다.
- 루트는 `<div align="center">` 하나를 사용하고, 그 안에는 순서대로 배치한
  `<img ... width="780" alt="..."><br>`만 둔다.
- 스타일과 레이어는 HTML로 재현하지 않는다. `<style>`, `style=`, `class=`,
  `position:absolute`, inline SVG, 텍스트 오버레이, FAQ DOM, 빈 장식 `div`를 넣지
  않는다.
- 카피는 각 완성형 WebP 안에 합성하고, HTML의 `alt`에는 해당 이미지의 의미를
  설명하는 짧은 문구를 넣는다.
- 모든 공개 이미지 URL은 실제 배포된 절대 `https://` URL이어야 한다.
- `<script>`, 외부 JavaScript, 외부 CSS, `iframe`, `video`, `canvas`,
  `data:`/base64 이미지, `file:` URL, 로컬 상대 경로를 넣지 않는다.
- 프롬프트, 로컬 파일명, 해시, 내부 QA, 승인 상태를 고객 HTML에 노출하지 않는다.
- `cdn.YOUR-DOMAIN.com` 같은 플레이스홀더를 한 글자도 남기지 않는다.

안전한 기본 형태는 다음과 같다.

```html
<div align="center">
  <img src="https://cdn.example.com/coupang/product-v1/01-hero.webp" width="780" alt="상품 메인 이미지"><br>
  <img src="https://cdn.example.com/coupang/product-v1/02-feature.webp" width="780" alt="상품 핵심 특징"><br>
</div>
```

로컬 검수본만 `assets/<filename>` 상대 경로를 사용한다. Wing 등록본의 URL을
로컬 검수 편의를 위해 상대 경로로 되돌리지 않는다.

## 4. Cloudflare 연결과 R2 판정

Cloudflare API 작업 전 `cloudflare-api` MCP가 OAuth로 연결됐는지 확인한다.
API 토큰을 채팅이나 파일에 기록하지 않는다.

1. MCP로 현재 계정과 R2 버킷 목록을 읽는다.
2. R2 사용 권한이 있고 버킷 생성·공개 도메인 구성이 가능하면 R2를 우선 사용한다.
3. R2 API 오류 `10042`는 해당 계정에 R2 구독이 활성화되지 않았다는 뜻으로
   취급한다. 사용자 요청 없이 유료 구독을 활성화하지 않는다.
4. 오류 `10042`이거나 R2 공개 배포가 막히면 Cloudflare Pages Direct Upload를
   동일 Cloudflare 엣지 CDN의 대체 경로로 사용한다.

R2가 꼭 필요하다고 사용자가 명시한 경우에는 Pages로 바꾸지 말고 R2 활성화를
요청한다. 그 외에는 아래 Pages 절차를 계속 수행한다.

## 5. Cloudflare Pages Direct Upload

Wrangler OAuth 상태를 확인한다.

```powershell
npx --yes wrangler@latest whoami
```

로그인되지 않았으면 표시형 브라우저에서 OAuth를 승인한다. 사용 가능한 로컬 포트를
고르고 토큰을 직접 입력하지 않는다.

```powershell
npx --yes wrangler@latest login `
  --callback-host 127.0.0.1 `
  --callback-port <available-port> `
  --no-use-keyring
```

배포 디렉터리를 프로젝트의 `.scratch/pages-deploy/`에 준비한다.

```text
.scratch/pages-deploy/
├── index.html
├── _headers
└── coupang/<product-slug>-v<revision>/
    └── <all package assets>
```

`_headers`에는 revision 경로의 장기 캐시와 CORS를 지정한다.

```text
/coupang/<product-slug>-v<revision>/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *
```

프로젝트 이름은 매니페스트에 있는 기존 값을 재사용한다. 없으면
`<product-slug>-coupang-assets`를 사용한다. 먼저 목록을 확인하고 없는 프로젝트만
한 번 생성한다.

```powershell
npx --yes wrangler@latest pages project list
npx --yes wrangler@latest pages project create <project-name> `
  --production-branch main
npx --yes wrangler@latest pages deploy .scratch/pages-deploy `
  --project-name <project-name> `
  --branch main `
  --commit-dirty=true
```

프로덕션 CDN 기본 주소는 다음 형식이다.

```text
https://<project-name>.pages.dev/coupang/<product-slug>-v<revision>
```

배포별 임시 도메인보다 이 고정 프로덕션 도메인을 Wing HTML에 사용한다. 실제 주소로
Wing 등록본의 모든 이미지 URL을 교체하고 매니페스트의 `cdn_base_url`과 각
`cdn_url`을 갱신한다.

## 6. 배포 후 닫힌 검증

HTML을 전달하기 전에 모든 에셋을 CDN에서 다시 내려받아 다음을 자동 검사한다.

1. 전체 URL이 HTTP 200을 반환한다.
2. `Content-Type`이 확장자와 일치한다. WebP는 정적·애니메이션 모두
   `image/webp`여야 한다.
3. `Cache-Control`에 `max-age=31536000`과 `immutable`이 있다.
4. 원격 파일 SHA-256이 패키지의 `sha256`과 일치한다.
5. 애니메이션 WebP가 실제 애니메이션이며 변환 전 승인본과 프레임 순서, 총 재생
   시간, 반복 설정이 같다. 동일 프레임 최적화로 출력 프레임 수가 줄어든 경우에는
   병합 사유와 총 재생 시간 보존을 매니페스트에 기록한다.
6. Wing 등록본의 이미지 태그 수와 매니페스트 에셋 수가 같다.
7. 허용 마크업이 `<div align="center">`, `<img>`, `<br>`뿐인지 검사한다.
8. `<style>`, `style=`, `class=`, `<script>`, `<svg>`, FAQ 텍스트 노드,
   플레이스홀더, 상대 이미지 URL, 비 HTTPS URL이 0개다.
9. 레이어로 분리됐던 배경·제품 쌍이 실제 최종 WebP 한 장 안에 합성됐는지 시각
   검사한다.
10. 780px 브라우저 검수에서 깨진 이미지와 가로 오버플로가 0개다.

간헐적 네트워크 오류는 짧게 재시도하되, 최종 200과 해시 일치를 얻지 못한 URL이
하나라도 있으면 완료로 보고하지 않는다. 검증 시각과 통과 개수를 매니페스트와
`README.md`에 기록한다.

## 7. 전달

사용자에게 다음 네 가지를 함께 전달한다.

- 고정 프로덕션 CDN 기본 주소
- `coupang-wing-detail-780.html` 절대 경로
- `preview-local-780.html` 절대 경로
- 매니페스트 기준 에셋 수와 HTTP·해시·GIF·HTML QA 결과

R2 대신 Pages를 사용했다면 R2 오류 코드와 대체 이유도 한 문장으로 알린다.
