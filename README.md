# Detail Page Maker Skill

공급처 상품 URL에서 제품 사실 SSOT, ImageGen 상업 이미지, HyperFrames GIF와 수정 가능한 HTML 상세페이지를 만드는 설치형 Codex 스킬입니다.

생성된 이미지와 GIF를 바로 조립하지 않고 제품 동일성 QA와 사용자 승인을 거친 버전만 최종 HTML에 사용합니다.

## 설치

```powershell
npx skills add csm-kr/detail-page-maker-skill --full-depth
```

설치 후 Codex에서 다음과 같이 요청할 수 있습니다.

```text
$detail-page-maker-skill로 이 공급처 상품의 새 Studio 프로젝트를 만들어줘:
https://domeggook.com/상품번호
```

## 로컬 실행

저장소에서 실행 환경을 확인합니다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs doctor
```

새 상품 프로젝트를 만듭니다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs new `
  --name "노바페이스 발편한 기능성깔창" `
  --supplier-url "https://domeggook.com/60851997"
```

프로젝트를 생성하면 Studio 서버가 시작되고 다음 주소가 브라우저에서 열립니다.

```text
http://127.0.0.1:8896/studio.html
```

기존 프로젝트를 다시 열려면 다음 명령을 사용합니다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs start `
  --project "C:\Users\<사용자>\Documents\DetailPageStudio\projects\<상품명>-<상품번호>"
```

## 기본 저장 위치

상품 프로젝트는 스킬 소스와 분리해 사용자 문서 폴더에 저장합니다.

```text
C:\Users\<사용자>\Documents\DetailPageStudio\projects\<상품명>-<상품번호>\
```

현재 사용자 계정의 예:

```text
C:\Users\csm81\Documents\DetailPageStudio\projects\노바페이스-발편한-기능성깔창-60851997\
```

Studio의 모든 승인, 개정판과 HTML 편집 상태는 이 상품 프로젝트 안에 저장됩니다. 외부 클라우드 데이터베이스는 사용하지 않습니다.

## 프로젝트 폴더 구성

```text
<상품명>-<상품번호>/
├─ project.json              전체 상태·승인·현재 개정판
├─ product/
│  ├─ supplier/              공급처 원문과 근거
│  ├─ ssot/                  실제품 사진과 제품 사실 SSOT
│  └─ product-manifest.json
├─ assets/
│  ├─ source/                원본 이미지
│  ├─ candidates/            ImageGen·재생성 후보
│  ├─ approved/              승인 에셋
│  └─ asset-manifest.json
├─ hyperframes/
│  ├─ projects/              수정 가능한 모션 원본
│  └─ renders/               MP4·GIF 렌더 결과
├─ html/
│  └─ index.html             편집 중인 상세페이지
├─ qa/
│  ├─ reports/               QA 보고서
│  └─ captures/              검수 캡처
├─ revisions/                개정판 기록
├─ exports/
│  ├─ drafts/                검토용 HTML
│  └─ published/             게시용 단일 HTML
└─ .studio/
   ├─ jobs/                  ImageGen·HyperFrames 작업 요청
   ├─ checkpoints/           이름 있는 체크포인트
   ├─ events.ndjson          변경 이력
   └─ lock.json              조립 잠금 기록
```

## 저장 위치 변경

`--root` 옵션으로 상품 프로젝트 상위 폴더를 지정할 수 있습니다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs new `
  --name "상품명" `
  --supplier-url "https://supplier.example/item/123456" `
  --root "D:\DetailPageProjects"
```

이 경우 저장 위치는 다음과 같습니다.

```text
D:\DetailPageProjects\<상품명>-<상품번호>\
```

## Studio 작업 순서

1. 공급처 원문과 실제품 사진을 등록해 제품 사실 SSOT를 고정합니다.
2. ImageGen 이미지와 HyperFrames GIF 후보를 만듭니다.
3. 원본·후보 비교와 Codex 시각 QA를 수행합니다.
4. 사용자가 필수 에셋을 개별 승인합니다.
5. 승인 버전과 SHA-256을 조립 잠금에 기록합니다.
6. 조립 뒤 에셋과 GIF는 읽기 전용으로 유지하고 HTML만 편집합니다.
7. 상용 QA 97점 이상, 하드 실패 0건과 사용자 최종 승인 뒤 게시용 HTML을 내보냅니다.

Studio는 브라우저에서 ImageGen API를 직접 호출하지 않습니다. 작업 센터에 생성 요청을 등록한 뒤 Codex에 다음과 같이 요청합니다.

```text
Studio 작업 센터에 등록된 ImageGen과 HyperFrames 작업을 처리하고 QA해줘.
```

## 저장소

- GitHub: <https://github.com/csm-kr/detail-page-maker-skill>
- 공개 범위: Private
- 설치 스킬: [`skills/detail-page-maker-skill/`](skills/detail-page-maker-skill/)
- Studio 제품 명세: [`docs/studio/product-spec.md`](docs/studio/product-spec.md)
- Studio 아키텍처: [`docs/studio/architecture.md`](docs/studio/architecture.md)
