# 상세페이지 Asset 관리

## 목차

1. 흐름
2. 폴더
3. 상태 전환
4. GIF 방식
5. Studio v1 승인
6. 조립과 출력
7. 노바페이스 전환 규칙

## 1. 흐름

모든 프로젝트에서 다음 순서를 고정한다.

```text
실제 촬영 원본
→ 제품 SSOT 제작
→ 상세페이지 이미지 및 GIF 생성
→ 사용자 승인
→ 최종 상세페이지 출력
```

God Tibo와 HyperFrames는 결과를 생성할 뿐 승인하지 않는다. 에이전트의 QA 통과도
옆 승인 세션과 사용자 승인을 대신하지 않는다.

## 2. 폴더

```text
<project>/
├── project.json
├── evidence/
├── research/
├── hyperframes/
│   ├── projects/
│   └── renders/
├── deliverables/
│   └── <revision>/
│       ├── index.html
│       ├── media/
│       ├── manifest.json
│       └── qa/final-report.md
└── asset/
    ...

asset/
├── input/
├── ssot/
├── generated/
│   ├── pending/
│   │   ├── image/
│   │   └── gif/
│   ├── approved/
│   │   ├── image/
│   │   └── gif/
│   └── rejected/
│       ├── image/
│       └── gif/
├── output/
│   ├── page/
│   └── gif/
└── deprecated/
```

각 프로젝트의 파일 경로는 프로젝트 루트를 넘지 않는다. 공급처 번들, 시장 근거와
HyperFrames 원본도 프로젝트 안에 저장한다. 공용 실행 도구는 스킬이 제공하지만
프로젝트 데이터는 다른 프로젝트나 저장소 루트 폴더에 의존하지 않는다.

### `input/`

사용자가 촬영하거나 제공한 원본, 공급처 원본과 문서를 보존한다. 수정·보정·누끼
결과로 덮어쓰지 않는다.

`input/`의 실제 촬영 원본과 공급처 원본 픽셀은 제품 동일성을 잠그는 참조 전용이다.
고객용 상세페이지·공개 미리보기·GIF·게시 패키지에 직접 넣지 않는다. 공개 장면은
반드시 이 원본을 God Tibo의 이미지 참조로 연결해 상용 조명·배경·구도를 갖춘
파생 이미지로 만든 뒤 제품 동일성 QA와 사용자 검토를 거친다. 단순 크롭, 누끼,
배경색 교체만 한 원본은 상용 파생 이미지로 인정하지 않는다.

### `ssot/`

`input`을 해석해 제품의 절대 기준 자산을 저장한다. 누끼, 다각도 제품 뷰, 실제
구조·색·재질·로고·각인 기준과 사용자가 승격한 제품 모델이 여기에 속한다.
God Tibo 결과는 제품 동일성 검수, 옆 승인 세션과 사용자 승격을 통과한 경우에만
SSOT가 된다.

SSOT는 생성·검수의 기준이지 공개용 이미지 자동 승인이 아니다. 실제품 원본에서
유래한 SSOT 픽셀도 고객 화면에는 직접 노출하지 않으며, 공개 자산은 God Tibo
파생 manifest에 참조 원본, 생성 작업, 동일성 판정과 승인 상태를 기록해야 한다.

### `generated/pending/`

모든 신규 생성 이미지와 GIF의 첫 저장 위치다. QA 통과 여부와 관계없이 사용자
결정 전에는 여기서 벗어나지 않는다.

### `generated/approved/`

Studio v1에서 사용자가 명시적으로 승인한 파일만 저장한다. 상세페이지의 새 이미지
경로는 이 폴더만 선택할 수 있다.

### `generated/rejected/`

사용자가 반려한 파일을 보존한다. 다시 사용하거나 원위치로 되돌리지 않는다. 수정은
새 버전 파일로 만들어 `pending`에서 다시 시작한다.

### `output/`

승인된 에셋만 사용한 결과를 저장한다.

- `output/page/`: 게시용 HTML, 플랫폼용 연결 이미지와 최종 캡처
- `output/gif/`: 최종 확정 GIF

후보, QA 접촉판, 임시 렌더와 승인 대기 파일을 넣지 않는다.

### `deliverables/<revision>/`

사용자가 실제로 열고 전달하는 최종 패키지다. 진입점은 항상 `index.html`이며
해당 개정에서 쓰는 이미지·GIF만 `media/`에 복사한다. `asset/`와 `output/`은
작업·내보내기 중간 폴더이므로 사용자에게 최종 결과 위치로 안내하지 않는다.
한 개정 폴더에는 활성 `index.html`을 하나만 두고, 과거 개정은 덮어쓰지 않는다.

### `deprecated/`

구버전 SSOT, 이전 Studio 구조와 더 이상 쓰지 않는 과거 결과를 이동한다. 활성
폴더와 섞지 않고 삭제보다 이 이동을 우선한다.

## 3. 상태 전환

```text
generated/pending
├── 사용자 승인 → generated/approved
└── 사용자 반려 → generated/rejected
```

다음 규칙을 강제한다.

1. 옆 승인 세션의 `approved`와 사용자의 `좋다`, `이걸로 하자`, `승인`,
   `사용하자` 또는 Studio 승인 클릭이 모두 있어야 승인한다.
2. 제작 에이전트가 시각적으로 좋아 보인다는 이유로 승인하지 않는다.
3. 승인·반려 시 원본 파일명, 생성 방식, 버전, SHA-256, 옆 승인 세션과 결정 시각을
   `asset-manifest.json`, `approval-ledger.ndjson`, `planning/APPROVALS.md`에 기록한다.
4. 기존 파일을 덮어쓰지 않는다. 같은 대상 이름이 있으면 새 버전명을 요구한다.
5. 반려 파일은 수정하지 않는다. 새 파일을 `v02`, `v03`으로 만든다.
6. pending 필수 에셋이 하나라도 있으면 게시용 내보내기를 잠근다.

## 4. GIF 방식

생성 방식은 세 가지다.

| 방식 | 사용 |
|---|---|
| `imagegen-seq` | 레거시 생성 이미지 여러 프레임을 GIF로 합성 |
| `heygenframe` | HyperFrames로 움직임·시각 효과를 저작 |
| `hybrid` | God Tibo start·middle·end와 HyperFrames 모션·효과를 결합 |

이 프로젝트에서 `heygenframe`은 사용자와 파일명에서 쓰는 방식 라벨이며 실제
결정적 모션 저작 엔진은 HyperFrames다. 기본 방식은 `hybrid`다.

```text
SSOT
→ God Tibo start / middle / end
→ HyperFrames 모션·효과
→ GIF 렌더
→ generated/pending/gif
→ 옆 승인 세션
→ 사용자 승인
```

파일명에 순번, 역할, 방식과 버전을 기록한다.

```text
03-flex-hybrid-v01.gif
03-flex-imagegen-seq-v01.gif
03-flex-heygenframe-v01.gif
```

## 5. Studio v1 승인

활성 Studio는 `domeggook-60851997`의 직접 HTML 편집기를 일반화한 v1이다.
Studio v2는 실행하지 않는다.

Studio v1은 세 작업면만 둔다.

1. `상세 편집`: 360px 기본 캔버스, 직접 문구 편집, 이미지 선택, 섹션 순서와
   자동 높이
2. `에셋 승인`: pending 이미지·GIF 미리보기, 승인·반려
3. `최종 출력`: pending과 필수 미승인 0건일 때 단일 HTML 내보내기. G5·상용 QA
   97점·사용자 게시 승인까지 충족하면 780px WebP 기반 쿠팡 Wing 패키지 내보내기

승인 버튼은 `confirmedByUser: true`와 함께 로컬 API를 호출한다. 정적
`file://`이나 일반 HTTP 서버에서는 승인 상태를 변경하지 말고
`detail-page.mjs start`로 Studio v1 서버를 연다.

Studio에서 새 이미지로 교체할 때도 `generated/approved` 경로만 허용한다.
로컬 파일 미리보기, data URL과 pending 경로는 최종 교체로 인정하지 않는다.

## 6. 조립과 출력

조립 전에 다음을 확인한다.

- 페이지에 사용할 모든 신규 이미지·GIF가 `approved`
- `input/`·실제품 원본 SSOT 픽셀 직접 참조 0건
- 모든 공개 제품 이미지·GIF에 God Tibo 상용 파생 manifest와 동일성 QA가 존재
- SSOT와 제품 구조·색·로고·문자·부품 위치 일치
- 주장마다 전용 증거 에셋 연결
- 반려·pending·deprecated 경로 참조 0건
- 동일 에셋 중복 사용 0건

단일 HTML 내보내기는 CSS, 이미지와 GIF를 data URL로 포함하고 편집 스크립트와
상대 경로를 제거한다. 프로젝트 밖에서 열어 360·800px 렌더와 GIF 재생을 다시
검수한다.

최종 검수본은 `<project>/deliverables/<revision>/index.html`로 복제해 고정하고,
같은 폴더의 `manifest.json`에 원본 경로·SHA-256·사용 에셋 목록을 기록한다.
사용자에게는 이 진입점만 전달한다.

쿠팡 Wing 내보내기는 승인된 조립본의 각 섹션을 780px 완성형 WebP로 평탄화하고
이미지 전용 HTML, 로컬 미리보기, CDN 업로드 매니페스트를 별도 timestamp 폴더에
만든다. 이 패키지 생성은 CDN 게시 완료가 아니다. WebP 업로드와 원격
HTTP·MIME·캐시·SHA-256 검증을 끝내기 전에는 게시 상태로 전환하지 않는다.

## 7. 노바페이스 전환 규칙

`projects/domeggook-60851997/assets/`는 Studio v1 승인 게이트를 도입하기 전에
사용자가 확정한 현재 페이지의 동결 자산이다. 119MB를 복제하거나 경로를 급히
이동해 HyperFrames 원본과 기존 편집 상태를 깨지 않는다.

전환 뒤 새로 만들거나 교체하는 파일부터 canonical `asset/generated/pending/`에서
시작한다. 한 번 교체된 레거시 경로는 새 `approved` 경로로 바꾸고 과거 파일은
`deprecated` 대상으로 기록한다.
