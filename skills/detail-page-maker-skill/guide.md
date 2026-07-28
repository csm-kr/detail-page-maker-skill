# Detail Page Maker 문서 지도

`SKILL.md`를 읽은 다음 이 지도로 현재 작업에 필요한 문서만 선택한다. 모든 작업에서
`workflow.md`와 `approval-guide.md`는 필수다.

## 항상 읽기

1. [`references/workflow.md`](references/workflow.md): 전체 제작 순서와 단계별 산출물
2. [`references/approval-guide.md`](references/approval-guide.md): 옆 승인 세션과 무효화 규칙
3. [`references/asset-management.md`](references/asset-management.md): 원본·SSOT·pending·approved·rejected·output 상태 전환
4. [`references/public-output-policy.md`](references/public-output-policy.md): 고객 화면과 제작 메타데이터 분리

## 작업별 라우팅

| 작업 | 필수 문서 | 필요할 때 추가 |
|---|---|---|
| 프로젝트 목록·격리 검사 | [`portable-install.md`](references/portable-install.md), [`asset-management.md`](references/asset-management.md) | `detail-page.mjs list`, `detail-page.mjs validate` |
| 공급처 URL 수집 | [`domeggook-supplier-extraction.md`](references/domeggook-supplier-extraction.md) | 다른 공급처는 같은 원본·locator·사실 분리 원칙 적용 |
| 제품 SSOT | [`product-identity.md`](references/product-identity.md) | 생성 이미지까지 쓰면 [`product-identity-imagegen.md`](references/product-identity-imagegen.md) |
| 상업 기획·카피 | [`commercial.md`](references/commercial.md), [`BUYER-JOURNEY.md`](references/BUYER-JOURNEY.md) | [`korean-copy-typography.md`](references/korean-copy-typography.md), [`commercial-detail-page.md`](references/commercial-detail-page.md) |
| 커머셜 말투·고객 목소리 | [`commercial-copy-tone-guide.md`](references/commercial-copy-tone-guide.md) | 고객 장면·비유·말풍선·내부 표현 제거 |
| 이미지 생성·자산 상태 | [`asset-gen-guide.md`](references/asset-gen-guide.md), [`asset-management.md`](references/asset-management.md), [`product-identity-imagegen.md`](references/product-identity-imagegen.md) | 제품별 상세 규약은 `commercial-detail-page.md`의 해당 절만 탐색 |
| GIF·모션 | [`gif-guide.md`](references/gif-guide.md), [`hyperframes.md`](references/hyperframes.md), [`commercial-effects-and-claim-proof.md`](references/commercial-effects-and-claim-proof.md) | 패턴은 [`gif-motion-pattern-library.md`](references/gif-motion-pattern-library.md), QA는 [`hyperframes-gif-qa.md`](references/hyperframes-gif-qa.md) |
| Studio v1 조립·편집 | [`studio-workflow.md`](references/studio-workflow.md), [`asset-management.md`](references/asset-management.md) | 고객 화면 정책은 `public-output-policy.md` |
| 디자인 실험 | 설치된 `design-taste-frontend` 스킬 | [`design-study.md`](references/design-study.md), [`behance-commercial-analysis.md`](references/behance-commercial-analysis.md) |
| 게시 전 QA | [`commercial-qa.md`](references/commercial-qa.md), [`user-feedback-quality-gates.md`](references/user-feedback-quality-gates.md) | GIF가 있으면 `hyperframes-gif-qa.md` |
| 프로젝트 종료·피드백 승격 | [`learning-loop.md`](references/learning-loop.md) | `planning/LEARNINGS.md`, 저장소에서는 `docs/issues/` |
| 기능성 깔창·노바페이스 규칙 | [`novaface-insole-learnings.md`](references/novaface-insole-learnings.md) | 고유 카피·부품명은 다른 상품에 복제 금지 |
| 새 컴퓨터 설치·E2E | [`portable-install.md`](references/portable-install.md) | `dependencies.json`, `scripts/setup-local.ps1`, `scripts/e2e.mjs` |

## 기본 실행 경로

```text
공급처 원본·실제품 입력
├─ G0 트랙: 제품 사실·SSOT 후보·미확인 항목
└─ G1 초안 트랙: 동종 제품·공개 후기·MARKET_PAIN
                  ·COMMERCIAL·DESIGN·BUYER-JOURNEY
→ G0 SOURCE_SSOT 승인
→ 제품 답·선택 이유·주장-증거 연결 확정
→ G1 COMMERCIAL_PLAN 승인
→ God Tibo 이미지 배치 4개
→ generated/pending/image 저장
→ 옆 승인 세션: 에셋 승인
→ Studio v1 사용자 승인·approved/image 이동
→ HyperFrames GIF
→ generated/pending/gif 저장
→ 옆 승인 세션: 모션 승인
→ Studio v1 사용자 승인·approved/gif 이동
→ Studio v1 상세 편집
→ 옆 승인 세션: 조립본 승인
→ 최종 QA·사용자 게시 승인
→ LEARNINGS 회고·공용 후보 이슈
→ 재검증 뒤 reference·테스트·스킬 갱신
```

## 문서 계층

- 실행 계약: `workflow`, `commercial`, `asset-gen-guide`, `gif-guide`,
  `approval-guide`, `studio-workflow`
- 전문 규약: 제품 동일성, HyperFrames, 한글 카피, 공개 출력, QA
- 연구 메모리: `design-study`, `behance-commercial-analysis`,
  `commercial-detail-page`의 프로젝트별 후반 절

연구 메모리는 제품 사실의 출처가 아니다. 사례의 색·카피·좌표·제품명·이미지 수를
복사하지 않고 여러 프로젝트에서 재검증된 구조만 실행 계약으로 승격한다.

## 충돌 우선순위

```text
법령·플랫폼 정책
→ 승인된 제품 사실 SSOT
→ 명시적 사용자 승인
→ 옆 승인 세션 기록
→ 승인된 COMMERCIAL·DESIGN·BUYER-JOURNEY
→ 실행 계약
→ 전문 규약
→ 연구 메모리와 취향
```
