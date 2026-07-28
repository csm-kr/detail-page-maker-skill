# Studio v1 Approval and Revision Workflow

현재 사용자용 Studio는 세 작업면만 제공한다. 제작·자동 QA·옆 승인 세션 검토는
Studio 밖에서 준비하고, Studio는 사용자 결정과 편집·출력을 단순하게 유지한다.

기준 구현은 `projects/domeggook-60851997/detail-page/studio.html`이다. 활성 CLI는
`scripts/studio-v1-server.mjs`만 시작한다. Studio v2의 Inspector, 복잡한 상태
머신과 일곱 단계 작업 센터는 폐기하고 과거 자료로만 보존한다.

## 작업면

1. `상세 편집`: 360px 기본 캔버스에서 문구·이미지·순서·높이를 편집한다.
2. `에셋 승인`: pending 이미지·GIF를 하나씩 보고 승인·반려한다.
3. `최종 출력`: 필수 미승인과 pending이 0건일 때 단일 HTML을 내보낸다.

조립·기획·프롬프트·QA 로그를 고객 미리보기 안에 섞지 않는다. 제작 메타데이터는
별도 프로젝트 기록과 [`public-output-policy.md`](public-output-policy.md)에 따른다.

## 역할

- 제작 세션: 조사, 기획, God Tibo·HyperFrames 제작, 수정, 자동 QA
- 옆 승인 세션: 원본·후보·근거·QA 독립 검토와 게이트 결정
- 사용자: 상업 방향, 에셋 승인·반려, 최종 조립·게시 결정
- Studio v1: pending·approved·rejected 상태, 해시, 내보내기 잠금

제작 세션은 자신이 만든 산출물을 승인하지 않는다. 옆 승인 세션은 수정하지 않고
`approved | changes_requested | held`와 이유를 기록한다.

## 필수 승인

[`approval-guide.md`](approval-guide.md)의 G0~G5를 따른다.

```text
자동 QA 통과
→ 옆 승인 세션 결정
→ planning/APPROVALS.md 기록
→ 사용자 Studio 승인
→ approved 폴더 이동
```

다음 조건이 모두 있어야 승인으로 본다.

- `qa.status === passed`
- 하드 실패 0건
- 산출물 SHA-256
- 옆 승인 세션 `approved`
- 사용자의 명시적 승인

디자인 경고는 사용자가 판단할 수 있지만 제품 동일성·허위 주장·노이즈 하드 실패는
우회할 수 없다. 네 개 배치 결과도 개별 에셋으로 결정한다.

## 자산 상태

정식 상태와 폴더 계약은 [`asset-management.md`](asset-management.md)를 따른다.

```text
asset/generated/pending
├─ 독립 검토 + 사용자 승인 → asset/generated/approved
└─ changes_requested 또는 사용자 반려 → asset/generated/rejected
```

반려 파일을 수정하거나 되돌리지 않는다. 수정본은 새 버전으로 pending에서 다시
시작한다. 승인 파일의 바이트·SHA-256이 바뀌면 해당 승인과 의존 HTML·GIF 승인을
무효화한다.

## 상세 편집

편집은 동시에 섞지 않고 두 도구로 나눈다.

| 도구 | 하는 일 | 하지 않는 일 |
|---|---|---|
| `V 요소 배치` | 모든 의미 있는 요소 선택, 드래그·X/Y·방향키 이동, 휠 크기 조절, 삭제 | 텍스트 입력·정렬 |
| `T 텍스트 변환` | 텍스트 선택·직접 입력, 글꼴·색·왼쪽/가운데/오른쪽/양쪽 정렬, 비우기 | 요소 이동·크기 조절·삭제 |

요소를 움직일 때 캔버스 세로 중심선, 좌우 8% 안전선, 현재 섹션 가로
중심선을 보이고 8px 이내에서 스냅한다. 보조선은 내보낸 HTML에서 제거한다.

허용:

- 카피·타이포·색
- 모든 의미 있는 텍스트·이미지·GIF·figure·목록·표 셀을 선택
- 선택 요소의 X/Y 숫자 입력, 1px 이동 버튼, `Shift` 10px 이동, 화살표 키 이동
- 이미지·GIF와 시각 요소를 포인터로 드래그해 이동하고, 선택한 비텍스트 요소 위
  휠로 25~400% 확대·축소
- 선택 텍스트의 왼쪽·가운데·오른쪽·양쪽 정렬, 텍스트 비우기와 실행 취소
- 선택 요소 삭제와 실행 취소
- 선택 텍스트의 글자색 변경
- `Noto Sans KR`, `Gmarket Sans`, `S-Core Dream`, `Wanted Sans`,
  `Black Han Sans`, `Jalnan` 글꼴 변경
- 이미지·GIF를 다른 승인 에셋으로 교체
- 섹션 순서와 표시 여부
- 자동 높이·수동 높이
- 로컬 저장·초기화

실행 취소는 버튼과 `Ctrl/Cmd+Z`를 모두 제공하고 최소 최근 50개 체크포인트를
유지한다. 텍스트 비우기·문구 수정·위치·크기·글꼴·색·이미지 교체·섹션 순서를
되돌릴 수 있어야 한다. 모든 변경을 저장하기 전에도 실행 취소할 수 있어야 한다.

단축키는 `V` 요소 배치, `T` 텍스트 변환, 방향키 1px,
`Shift+방향키` 10px, `Delete/Backspace` 삭제, `Esc` 선택 해제,
`Ctrl/Cmd+Shift+L/E/R/J` 왼쪽/가운데/오른쪽/양쪽 정렬을 사용한다. 입력 중인
텍스트에는 `V`, `T`, `Backspace` 도구 단축키를 가로채지 않는다. 정렬과 단축키
패턴은 [Google Docs 단축키](https://support.google.com/docs/answer/179738?hl=en),
[PowerPoint 텍스트 정렬](https://support.microsoft.com/en-us/powerpoint/change-text-alignment-indentation-and-spacing-in-powerpoint),
[Microsoft 개체 정렬](https://support.microsoft.com/en-us/office/graphics-visuals/align-or-arrange-objects)의
사용자 기대와 맞춘다.

금지:

- pending·rejected·deprecated 경로 사용
- 제품 SSOT 변경
- GIF 내부 타임라인 변경
- 고객 화면에 파일명·프롬프트·해시·승인 상태 노출

저장 키는 DOM 순번 대신 `section ID + layer ID` 또는 `asset ID`를 사용한다.
명시 태그가 없는 의미 있는 가시 요소에는 Studio 로드 때 안정적인
`data-studio-object`와 텍스트의 `data-studio-text` 식별자를 부여한다.
텍스트 내부의 포인터 입력은 텍스트 편집을 우선한다. 휠 확대·축소는 먼저 클릭한
선택 요소에서만 동작하고, 그 밖에서는 페이지 스크롤을 유지한다. 위치·배율은 요소
식별자와 함께 로컬 상태에 저장하며 초기화 시 제거한다. 사용자가 지정한 수정 HTML을
`localStorage`보다 우선하며, 문구·이미지·요소 변형 뒤 `ResizeObserver`와
`MutationObserver`로 실제 높이를 다시 계산한다.

## 조립과 개정판

조립 전에 모든 신규 이미지·GIF가 approved인지, 같은 에셋을 중복 사용하지
않는지 확인한다. 승인 자산은 직접 덮어쓰지 않는다. 수정이 필요하면 새 개정판과
새 후보를 만들고 변경 자산, 의존 GIF, 연결 HTML 섹션만 다시 승인한다.

## 내보내기

- pending 또는 필수 미승인 에셋이 하나라도 있으면 게시 출력을 잠근다.
- `단일 HTML 내보내기`는 CSS, 이미지와 GIF를 data URL로 포함한 자립형 HTML을
  만들고 편집 런타임과 프로젝트 상대 경로를 제거한다. 저장된 위치·배율은 결과에
  유지한다.
- `쿠팡 Wing 포맷으로 내보내기`는 G5 통과, 상용 QA 97점 이상, 사용자 게시 승인,
  pending·필수 미승인 0건을 모두 요구한다.
- 쿠팡 Wing 내보내기 전에 새 revision의 HTTPS CDN 기본 주소를 입력한다. 주소에는
  인증정보, query, hash를 넣지 않는다.
- Studio는 `#detailPage`의 표시 중인 최상위 `section[data-section]`을 순서대로
  780px 완성형 WebP로 평탄화한다. GIF와 애니메이션 WebP는 애니메이션 WebP로
  변환하고 프레임 순서·시간·반복을 보존하며, 저장된 위치·배율도 평탄화한다.
- Wing 패키지는 `exports/coupang-wing-780-webp-YYYYMMDD-HHmmss/`에 만들며
  `assets/`, `coupang-wing-detail-780.html`, `preview-local-780.html`,
  `cdn-upload-manifest.json`, `README.md`를 포함한다.
- Wing 등록본은 `<div align="center">`, `<img width="780">`, `<br>`만 사용한다.
  텍스트, CSS, SVG, 겹침 레이어는 모두 WebP 안에 합성한다.
- Studio 내보내기는 로컬 패키지 생성까지만 수행한다. `assets/`를 입력한 CDN
  revision 경로에 올리고 HTTP·MIME·캐시·SHA-256을 닫힌 검증하기 전에는
  게시 완료로 표시하지 않는다.
- 프로젝트 밖에서 일반 HTML은 360·800px와 GIF 재생을, Wing 패키지는 로컬
  780px 미리보기와 이미지 순서·잘림·애니메이션을 다시 검수한다.

## 로컬 API

- `GET /api/v1/assets`: pending·approved·rejected 이미지와 GIF 조회
- `POST /api/v1/assets/decision`: 사용자 확인이 있는 승인·반려 이동
- `GET /api/v1/gate`: 일반 내보내기와 쿠팡 Wing 전용 게이트 상태 조회
- `POST /api/v1/exports/coupang-wing`: HTTPS CDN 기본 주소를 받아 780px WebP와
  이미지 전용 HTML 패키지 생성

`confirmedByUser: true`가 없거나 대상 경로가 pending이 아니면 상태 전환을
거절한다. 같은 이름의 대상 파일이 있으면 덮어쓰지 않고 새 버전명을 요구한다.
