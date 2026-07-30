# 이미지·자산 상태·승인

## 생성 실행기

모든 생성형 이미지 제작·편집은
`.agents/skills/god-tibo-gpt-image2-skill/scripts/tibo-batch.mjs`로 실행한다.
내장 이미지 생성 도구나 다른 모델을 우회 경로로 사용하지 않는다.

- 작업 단위: 8개 `items`를 명시
- 8개 초과: 입력 순서를 보존해 8개씩 분할
- God Tibo의 기본값을 사용하지 않는다.
- 생성: 명시한 W×H를 갖는 `controllable`
- 편집: 입력 크기를 보존하는 `invariant`
- 모든 프롬프트: `QUALITY_GATE:CLEAN_COMMERCIAL`

결과에는 자글거림, 필름 그레인, 센서 노이즈, 색 노이즈, 디더링, 과한 샤픈,
더러운 그림자 입자가 없어야 한다.

Orchestrator의 논리 작업 단위는 한 image cut당 한 WorkOrder·한 worker다. adapter가
provider batch를 구성할 때만 준비된 독립 cut을 최대 8개 `items`로 묶으며 결과를
다시 cut별 artifact와 receipt로 분리한다. 가용 worker slot은 먼저 채우고 실패한
cut과 실제 descendant만 재실행한다.

모든 제품 cut은 같은 SKU의 공급처 이미지 SSOT를 ImageGen reference로 사용한다.
사용자가 `input/product/`에 실제 사진을 넣으면 추가 identity reference로
강화한다. 공급처 원본·쿠팡·Behance 이미지는 고객 광고 자산으로 직접 조립하지
않는다.

## 상태 수명주기

```text
input 또는 ssot
→ generated/pending
→ 자동 검사와 시각 QA
├─ 사용자 승인 → generated/approved
├─ 사용자 반려 → generated/rejected
└─ 수정 필요 → 새 pending 버전
```

파일을 덮어쓰지 않는다. 동일 역할의 새 결과는 버전이 다른 새 파일로 저장한다.
제작 세션의 QA를 사용자 승인으로 간주하지 않는다.

## Manifest 최소 필드

```json
{
  "asset_id": "ASSET-HERO-01",
  "kind": "image",
  "role": "hero-product",
  "status": "pending",
  "path": "asset/generated/pending/image/hero-v01.png",
  "sha256": "...",
  "source_refs": ["asset/ssot/product-front.png"],
  "claim_ids": ["CLAIM-001"],
  "qa": {"hard_failures": [], "warnings": []},
  "approval": null
}
```

## 승인

사용자의 Studio 승인 동작만 최종 결정으로 기록한다. 승인은 에셋 ID, 버전, 해시,
결정, 시각, 사용자 확인을 append-only 원장에 남긴다. 원본이나 관련 제품 사실이
바뀌면 영향받는 승인만 무효화한다.

## 조립 전 검사

- pending 필수 에셋 0개
- rejected 또는 deprecated 경로 참조 0개
- 승인 파일의 현재 SHA-256과 manifest 일치
- 제품 동일성 하드 실패 0개
- 각 공개 주장에 승인된 직접 증거 존재
- Hero는 제품 최대 시각·핵심 장점 한 개·정적 이미지
- 각 해결 장점에 승인 still과 전용 motion용 source frame 존재
- 390 CSS px 저작 화면과 780px 전달 자산 crop 안전영역 통과
