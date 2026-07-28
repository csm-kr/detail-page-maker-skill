# Detail Page Studio v2 아키텍처 (Deprecated)

> 상태: 폐기. 활성 서버는
> `skills/detail-page-maker-skill/scripts/studio-v1-server.mjs`다.

## 목차

1. 시스템 구조
2. 깊은 모듈과 인터페이스
3. 프로젝트 파일 구조
4. 상태 모델
5. 데이터 계약
6. 작업 대기열
7. 승인·조립·개정판 불변식
8. HTTP 인터페이스
9. 보안과 복구
10. 구현 순서

## 1. 시스템 구조

```text
studio.html
  │ HTTP + SSE
  ▼
Local Studio Server
  ├─ Project Store
  ├─ Asset Registry
  ├─ Job Queue
  ├─ Approval Gate
  ├─ Dependency Graph
  ├─ Assembly Lock
  └─ Exporter
       │
       ├─ Codex worker → ImageGen
       └─ Codex worker → HyperFrames
```

브라우저에는 API 키를 두지 않는다. Studio는 요청을 구조화해 프로젝트의 작업 대기열에 기록한다. Codex가 작업을 처리하고 결과·QA를 프로젝트 저장소에 등록한다.

## 2. 깊은 모듈과 인터페이스

### Project Store

작은 인터페이스:

```text
load()
mutate(command)
snapshot()
```

원자 저장, 스키마 버전, 이벤트 이력, 체크포인트와 복구는 구현 안에 숨긴다.

### Approval Gate

작은 인터페이스:

```text
evaluate(assetVersion)
approve(assetVersion, decision)
canAssemble(revision)
```

QA 상태, 하드 실패, 사용자 승인, 필수 역할과 미처리 작업을 내부에서 계산한다.

### Dependency Graph

작은 인터페이스:

```text
affectedBy(assetVersion)
```

에셋 → HyperFrames 컴포지션 → GIF → HTML 섹션 연결을 내부에서 추적한다.

### Generation Adapter seam

두 어댑터가 실제로 달라지는 seam이다.

- ImageGen adapter
- HyperFrames adapter

Studio와 서버는 생성 도구별 세부 명령을 알지 않고 같은 작업 계약만 사용한다.

## 3. 프로젝트 파일 구조

```text
<project>/
├─ project.json
├─ product/
│  ├─ supplier/
│  ├─ ssot/
│  └─ product-manifest.json
├─ assets/
│  ├─ source/
│  ├─ candidates/
│  ├─ approved/
│  └─ asset-manifest.json
├─ hyperframes/
│  ├─ projects/
│  └─ renders/
├─ html/
│  ├─ index.html
│  ├─ content.json
│  └─ layer-state.json
├─ qa/
│  ├─ reports/
│  └─ captures/
├─ revisions/
│  └─ <revision-id>/
├─ exports/
│  ├─ drafts/
│  └─ published/
└─ .studio/
   ├─ jobs/
   ├─ events.ndjson
   ├─ checkpoints/
   └─ lock.json
```

프로젝트에는 사용자 데이터, 재현 manifest, HTML Studio 런타임, 공급처 증거와
HyperFrames 원본을 함께 보존한다. 실행 CLI와 생성 도구는 설치된 스킬이 제공하지만
프로젝트 파일은 다른 프로젝트나 저장소 루트 경로에 의존하지 않는다. Studio
프로젝트 묶음을 내보낼 때도 프로젝트 내부 파일만 포장한다.

## 4. 상태 모델

### Project phase

```text
planning
asset_production
asset_review
assembly_ready
html_editing
final_qa
published
```

`html_editing` 이후 에셋·GIF 변경 명령은 거부한다. 조회 명령은 계속 허용한다.

### Asset version state

```text
draft
queued
generating
qa_pending
review_ready
approved
rejected
superseded
```

### Job state

```text
queued
running
completed
failed
cancelled
```

## 5. 데이터 계약

### Asset

```json
{
  "id": "asset-heel-cushion",
  "role": "heel-cushion",
  "kind": "image",
  "required": true,
  "dependencies": [],
  "versions": []
}
```

### Asset version

```json
{
  "version": 3,
  "status": "review_ready",
  "path": "assets/candidates/asset-heel-cushion/v3.png",
  "sha256": "...",
  "sourceRefs": ["ssot-bottom-v2"],
  "prompt": "...",
  "lockedProductFields": ["shape", "ratio", "material", "logo", "part-position"],
  "qa": {
    "status": "passed",
    "hardFailures": [],
    "warnings": [],
    "evidence": []
  },
  "approval": null
}
```

### 사용자 촬영 제품 SSOT

```json
{
  "id": "ssot-user-...",
  "originalFileName": "화이트-정면.jpg",
  "path": "product/ssot/user/ssot-user-.../original.jpg",
  "sha256": "...",
  "mime": "image/jpeg",
  "provenance": "user-captured-same-sku",
  "role": "identity-primary",
  "allowedUse": "product-identity-reference",
  "identityStatus": "pending-review",
  "variantColor": "화이트"
}
```

사용자 촬영 원본은 여러 장을 한 요청으로 등록하되 각각 독립된 SSOT 항목과 해시를 가진다. `product/ssot/`에 원본 그대로 저장하고 일반 광고 에셋 목록에는 섞지 않는다.

잠금 시 서버는 모든 원본의 현재 SHA-256을 다시 검증하고 라벨 문구·색상·현재 개정판·대상 SSOT ID를 `ssotLock`에 기록한다. 각 항목은 `identityStatus: locked`로 바뀌며 `qa/reports/product-ssot-identity-review-<revision>.json`이 생성된다. 잠긴 묶음에는 사진을 추가할 수 없다.

`SSOT로 에셋 제작` 요청은 잠긴 현재 개정판에서만 허용한다. 서버가 모든 원본 경로를 `sourceRefs`로 붙인 `imagegen.generate.product-ssot` 작업을 만들고, 생성 결과는 일반 에셋 버전으로 등록한 뒤 시각 QA와 사용자 승인을 별도로 거친다.

`전체 에셋 일괄 제작`은 최대 40개 대상을 검증한 뒤 한 store mutation에서 작업을 모두 만든다. Studio의 유일한 이미지 생성 실행기는 로컬 `god-tibo-gpt-image2-skill`이며 기본 8장 `items` 배치로 실행하고 각 완료 결과를 독립 에셋으로 등록한다. 8개를 넘으면 입력 순서를 보존해 `8 + 나머지`로 나눈다. 이 실행기는 로컬 Codex 로그인 상태를 재사용하고 비공개 Codex 요청 계약에 의존하므로, UI에 경고를 표시하고 실패를 작업별로 격리한다. 대기열만 등록하는 `queue`는 생성기가 아니라 실행 전 작업 보관 상태로 유지한다.

생성 결과는 전체 에셋 보드에 카드로 펼쳐진다. 각 카드는 원본 보기, 수정, 검수·비교를 제공한다. 수정은 `imagegen.edit` 작업과 새 후보 버전을 만들고 기존 파일을 덮어쓰지 않는다. 비교 화면은 모든 버전 칩을 제공하며, QA를 통과한 버전을 승인하면 현재 개정판의 `assetSelections`가 그 버전으로 이동한다.

실물을 직접 확인한 사용자의 판단은 생성형 시각 QA보다 우선할 수 있다. `사용자 판단으로 채택`은 `approvedBy: local-user`, `userOverride: true`, 비어 있지 않은 `overrideReason`을 요구한다. 이 경우 QA 대기·실패 버전도 채택할 수 있지만 승인 원장에 override와 사유가 보존되며, 자동 실행기나 Codex가 대신 호출하지 않는다.

### HyperFrames layer manifest

```json
{
  "id": "airflow-title",
  "name": "에어홀 상태 라벨",
  "type": "text",
  "group": "copy",
  "start": 0,
  "end": 2.4,
  "x": 96,
  "y": 112,
  "scale": 100,
  "opacity": 100,
  "text": "에어홀 확인",
  "fontSize": 48,
  "color": "#ffffff"
}
```

제품 레이어는 `locked: true`와 제품 동일성 참조 ID를 추가한다. Studio 속성 변경은 manifest를 직접 덮어쓰지 않고 `hyperframes.edit` 작업을 생성한다.

### Job

```json
{
  "id": "job-...",
  "type": "imagegen.edit",
  "scope": {
    "assetId": "asset-heel-cushion",
    "version": 2,
    "selection": "layer:product"
  },
  "prompt": "...",
  "sourceRefs": ["ssot-bottom-v2"],
  "executor": {
    "provider": "god-tibo-gpt-image2-skill",
    "concurrency": 8,
    "size": "1024x1536",
    "batchId": "batch-..."
  },
  "confirmedByUser": true,
  "status": "queued"
}
```

### Assembly lock

```json
{
  "revisionId": "rev-001",
  "lockedAt": "2026-07-26T00:00:00.000Z",
  "assets": {
    "asset-heel-cushion": {
      "version": 3,
      "sha256": "..."
    }
  },
  "approvedBy": "local-user"
}
```

## 6. 작업 대기열

1. 사용자가 프롬프트와 범위를 확인한다.
2. 서버가 `confirmedByUser: true` 작업만 큐에 넣는다.
3. 실행기는 큐에서 `queued` 작업을 가져오며 일괄 생성 기본값은 최대 8장 동시 실행이다.
4. 정지 이미지는 `god-tibo-gpt-image2-skill`, 모션은 HyperFrames 어댑터로 결과를 만든다.
5. 새 에셋 버전과 SHA-256을 등록한다.
6. 자동 검사와 Codex 시각 QA를 수행한다.
7. `review_ready`가 되면 Studio에 알린다.
8. 사용자가 승인·재생성·보류한다.

생성 실패는 기존 승인본에 영향을 주지 않는다.

선행 제작 로드맵은 `studio-roadmap.js`의 단일 계약을 사용한다. 쿨토시
프로젝트는 제품·누끼/뷰 8개, 모델 후보 4개, 배경 5개, 착용 예시 7개,
구조 증거 4개의 선행 에셋 28개를 계획한다. 모델 후보는 네 개를 모두 생성할
수 있지만 모델 SSOT로 잠그는 버전은 하나다. 실제품 접촉판과 필수 선행 에셋,
선택 모델을 합친 25개 준비·승인 게이트 뒤에 최종 14장과 HyperFrames GIF
2개를 연다.

생성 참조는 로드맵의 `sourceMode`가 결정한다. `product-ssot`은 실제품 원본,
`scene-reference`와 `model-candidate`는 빈 참조, `product-and-model-ssot`은
실제품 원본과 승인 모델 버전을 사용한다. 서버는 UI가 보낸 모드를 다시 검증하고
모델 의존 작업을 항상 `product-and-model-ssot`으로 강제한다.
`god-tibo-gpt-image2-skill` 워커는 빈 참조에 제품 SSOT를 암묵적으로 추가하지 않는다.
직접 참조인 승인 모델을 먼저 보존하고, 남는 입력 슬롯에만 정규화 제품 SSOT를
채운다.

모델 의존 작업은 `target.requiresModel: true`와 선택 모델 에셋 ID를
`target.dependencies`에 기록한다. 작업의 `sourceRefs`는 제품 사실 SSOT 뒤에
승인 모델 버전 경로를 추가한다. 모델 잠금이 없거나 경로·해시가 현재 에셋
버전과 다르면 `MODEL_SSOT_REQUIRED`로 거부한다.

## 7. 승인·조립·개정판 불변식

### 승인

- `qa.status === passed`
- `qa.hardFailures.length === 0`
- 현재 project phase가 조립 이전
- 사용자 최종 결정이 존재

### 조립

- 모든 필수 에셋에 승인 버전이 존재
- 미처리 생성·QA 작업이 없음
- 각 승인 파일의 실제 SHA-256이 manifest와 일치
- 사용자가 조립 확인창을 승인

### 조립 뒤

- 에셋 등록·교체·생성·GIF 재렌더 명령 거부
- 읽기·비교·이력 조회 허용
- HTML layer state 변경 허용

### 새 개정판

- 현재 assembly lock을 복제해 새 revision을 만든다.
- 사용자가 선택한 변경 에셋과 `affectedBy()` 결과만 승인 상태를 해제한다.
- 영향받지 않은 에셋의 승인과 해시는 승계한다.
- 현재 잠긴 revision은 변경하지 않는다.

## 8. HTTP 인터페이스

```text
GET    /api/health
GET    /api/project
GET    /api/assets
GET    /api/product/ssot
GET    /api/production-roadmap
GET    /api/jobs
POST   /api/jobs
POST   /api/assets/register
POST   /api/product/ssot/register
POST   /api/product/ssot/lock
POST   /api/product/ssot/generation-jobs
POST   /api/product/ssot/batch-generation-jobs
POST   /api/assets/:id/jobs
POST   /api/assets/:id/qa
POST   /api/assets/:id/approve
POST   /api/model/ssot/approve
POST   /api/jobs/:id/start
POST   /api/jobs/:id/complete
POST   /api/jobs/:id/fail
POST   /api/jobs/:id/cancel
POST   /api/assembly/lock
POST   /api/revisions
POST   /api/html/layers
POST   /api/checkpoints
POST   /api/qa/final
POST   /api/qa/final/approve
POST   /api/export/draft
POST   /api/export/publish
POST   /api/export/project
GET    /api/events
```

모든 변경 요청은 프로젝트 phase와 revision을 함께 검증한다.

## 9. 보안과 복구

- 서버는 기본적으로 `127.0.0.1`에만 바인딩한다.
- 프로젝트 루트 밖 경로를 읽거나 쓰지 않는다.
- 업로드 파일명은 서버가 새로 만든다.
- JSON은 임시 파일에 쓴 뒤 원자적으로 교체한다.
- 모든 변경은 `.studio/events.ndjson`에 append-only로 기록한다.
- 체크포인트는 project state와 HTML layer state를 함께 보존한다.
- API 키와 외부 토큰을 project.json에 저장하지 않는다.

## 10. 구현 순서

1. 설치형 스킬과 프로젝트 생성기
2. Project Store와 상태 검증
3. 에셋 등록·작업 큐·QA·승인
4. 조립 잠금·의존성 개정판
5. 통합 Studio UI
6. HTML 레이어 편집과 viewport override
7. 초안·게시·프로젝트 묶음 내보내기
8. 설치부터 게시까지 회귀 QA
