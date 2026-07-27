# Detail Page Studio 아키텍처

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
3. Codex는 큐에서 첫 `queued` 작업을 가져온다.
4. ImageGen 또는 HyperFrames 어댑터로 결과를 만든다.
5. 새 에셋 버전과 SHA-256을 등록한다.
6. 자동 검사와 Codex 시각 QA를 수행한다.
7. `review_ready`가 되면 Studio에 알린다.
8. 사용자가 승인·재생성·보류한다.

생성 실패는 기존 승인본에 영향을 주지 않는다.

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
GET    /api/jobs
POST   /api/jobs
POST   /api/assets/register
POST   /api/assets/:id/jobs
POST   /api/assets/:id/qa
POST   /api/assets/:id/approve
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
