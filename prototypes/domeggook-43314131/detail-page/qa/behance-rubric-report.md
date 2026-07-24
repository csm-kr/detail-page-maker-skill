# 다용도 미니 채칼 상업 HTML 상세페이지 QA

검수일: 2026-07-24
대상: [`../index.html`](../index.html)
기준: [`../../../../commetial-detail-page.md`](../../../../commetial-detail-page.md), Behance 원본 프로젝트 15개 공통 문법
판정 범위: 공급처 원문을 기준으로 완성한 `supplier-reference-v1`

## 결론

**최종 v1 통과: 94/100, 하드 실패 0개.**

사용자가 공급처 URL을 현재 버전의 기준 사실로 지정해 제품명·기능·구조·치수·재질·원산지·수입원을 공개 가능한 공급처 사실로 잠갔다. 가격·MOQ·옵션·세척·시험처럼 원문에서 확정할 수 없는 정보는 추정하지 않고 HTML에서 제외했다. 제품 누끼와 두 GIF는 교체 가능한 `supplier-reference-v1` 자산이며, 사용자 다각도 실사진이 들어오면 동일성 강화 버전으로 비파괴 교체한다.

## Behance 공통 문법 적용

- 첫 화면에서 제품 전체형, 제품 용도와 핵심 가치 후보를 즉시 보여준다.
- `제품·가치 → 기능 3종 → 사용 연출 → 구조 → 치수 → 재질 → 보관 → 구매 전 사실 → 요약` 순서로 구매 질문을 단계화했다.
- 감성형 라임 섹션, 사용 사진, 구조 모션, 규격·사실 블록을 교차해 같은 카드 구도가 세 번 연속되지 않게 했다.
- 제품 전체형, 손과 함께 보이는 사용 장면, 커터 매크로, 규격 설명의 네 가지 거리를 사용했다.
- 주장을 `data-fact-id`와 [`../claim-evidence-map.json`](../claim-evidence-map.json)에 연결했다.
- Behance 작품의 고유 팔레트·카피·레이아웃·모델 포즈는 복제하지 않았다.

## 100점 rubric

| 영역 | 배점 | 점수 | 판정 |
|---|---:|---:|---|
| 상품 사실·동일성 | 25 | 22 | 공급처 원본·해시·파생 관계, 제품명·치수·재질·원산지·수입원이 추적된다. 사용자 다각도 실사진 SSOT는 후속 동일성 강화 항목이다. |
| 주장-근거 | 20 | 20 | 공개 카피 9개 claim과 12개 공개 fact가 연결되고 기능 연출 한계와 금지 주장이 인접 표시된다. |
| 정보 서사·전환 | 15 | 15 | 가치→기능→사용 흐름→구조→규격→구매 확인이 명확하다. 미확인 가격·옵션·관리법은 추정 없이 제외했다. |
| 시각 체계·리듬 | 15 | 14 | Precision Green 팔레트, 대형 한글 타이포, 네 가지 장면 거리와 감성/증거 리듬이 일관된다. 공급처 사용 사진의 원본 품질은 생성 장면보다 낮다. |
| 편집성·반응형 | 10 | 10 | 실제 HTML 카피 61개, 교체 자산 9개, CSS 토큰, 저장 상태 피드백, HTML 저장, 320~800px 가로 overflow 0을 확인했다. |
| 접근성 | 10 | 9 | 한 개의 h1, 모든 img의 alt, 44px 편집 버튼, 16px 사실 본문, 12px 근거 캡션, 축소 모션 poster를 확인했다. 별도 수동 스크린리더 검수는 남아 있다. |
| 성능·모션 | 5 | 4 | 4초 GIF 두 개는 한 주장씩 설명하고 poster가 있다. GIF 합계 약 2.8MB이며 판매 채널 확정 후 용량 예산 재검수가 필요하다. |
| **합계** | **100** | **94** | **supplier-reference-v1 최종 통과** |

## 모션 QA

### 이중 커터 위치

- 원본: [`../../../../videos/dual-blade-motion/index.html`](../../../../videos/dual-blade-motion/index.html)
- 결과: `assets/dual-blade-function.gif`, 800×720, 4초, 60프레임
- HyperFrames check: 오류 0, 경고 0
- 수정: 같은 2D 제품을 `rotateY`로 거울 반전하던 초기안을 폐기했다.
- 최종: 제품을 정지시키고 실제 공급처 구조에서 확인한 안쪽 `껍질 제거 · 얇게 썰기`, 바깥쪽 `채썰기 커터` 위치를 각각 순차 강조한다.

### 오이 얇게 썰기 가이드

- 원본: [`../../../../videos/use-demo-motion/index.html`](../../../../videos/use-demo-motion/index.html)
- 결과: `assets/use-slice-motion.gif`, 800×600, 4초, 60프레임
- HyperFrames check: 오류 0, 경고 0
- ImageGen start/end keyframe은 공급처 구조 이미지와 제품 누끼를 reference로 사용했다.
- 이 장면은 실제 절삭 성능 증거가 아니라 기능 이해용 연출이며, HTML에 같은 한계를 명시했다.

## Browser Harness 검수

녹화:

`C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\detail-page-finalization-baseline`

최종 캡처:

- `.artifacts/final-v1-800.png`
- `.artifacts/final-v1-360.png`
- `.artifacts/final-v1-reduced-motion-800.png`
- `.artifacts/exp003-clean-800.png`
- `.artifacts/exp003-dirty-800.png`

DOM·좌표 결과:

- 320·360·390·768·800px 전부 `scrollWidth === clientWidth`
- 의미 섹션 10개, disclosure metadata 11개, 빈 fact ID 0개
- `img:not([alt])` 0개, GIF 2개 모두 로드 완료
- `content.json` 연결, 본문 `prototype` 노출 0개, 근거 없는 fact row 0개
- 편집 모드: `contenteditable` 61개, 교체 이미지 9개, 저장 버튼과 상태 피드백 표시
- 입력 후 `수정됨 · HTML 저장 필요`, 저장 후 `저장됨 · 수정본 다운로드 완료`
- 편집 버튼: 74×44px
- 축소 모션: 오이 GIF → `use-motion-end.png`, 커터 GIF → `dual-blade-function-poster.png`
- 축소 모션 상태에서 모든 reveal이 표시되고 가로 overflow가 없다.

## 디자인 학습 실험

[`../../../../study-desing-skill.md`](../../../../study-desing-skill.md)의 `EXP-001`과 `EXP-003`을 적용·검증했다.

- 기능 3컷 바로 아래에 공급처 시연 범위와 일정한 결과 비보장 캡션을 추가했다.
- 각 섹션에 `surface / intermediate / proof` 정보 층위 metadata를 추가했다.
- 동일한 800px·360px 조건에서 전후를 비교했다.
- 실험 rubric: 78→85점, +7점, 하드 실패 0개
- 판정: `adopted-local`
- 영구 계약 승격: 다른 상품군에서 한 번 더 독립 통과하기 전까지 금지
- `EXP-003`: 편집 패널 전용 저장 상태 피드백, 88→90점, +2점
- `EXP-003` 판정: `held`; 현재 상품 기능으로만 유지하고 영구 규칙으로 승격하지 않음

## 가장 약한 부분과 수정

초기 최약점은 제품 동일성 근거가 공급처 사진과 생성 컷아웃에 머물고, 기능 모션의 라벨 위치·근거 성격·편집 저장 상태가 모호했던 점이다.

이번 수정에서:

1. 커터 반전 모션을 폐기하고 두 커터의 실제 위치를 고정 제품 위에서 표시했다.
2. `MOTION PROOF`를 `MOTION GUIDE`로 낮추고 ImageGen 장면을 실제 성능 증거로 사용하지 않는다고 명시했다.
3. 기능 3컷 바로 아래에 공급처 시연 범위 캡션을 추가했다.
4. 모바일 GIF의 고정 높이 때문에 생긴 크롭을 `height: auto`로 수정했다.
5. 데스크톱 히어로에서 제품이 제목을 덮지 않게 제목 레이어를 앞으로 이동했다.
6. 구매자 화면의 `prototype`, ImageGen·HyperFrames 내부 제작 용어와 SSOT 대기 문구를 제거하고 근거 파일로 이동했다.
7. 제품 사양의 수입원을 `supplier-fact-013`으로 연결하고 공개 claim 9개를 모두 추적 가능하게 만들었다.
8. 편집 패널에 구매자 화면과 분리된 `clean / dirty / saved` 상태를 추가했다.

## 후속 동일성 강화와 채널 적용

- 사용자 다각도 실사진이 도착하면 현재 생성 누끼를 실제 사진 기반 제품 시트와 컷아웃으로 비파괴 교체한다.
- 가격·MOQ·옵션·배송·교환은 실제 판매 채널의 상품 선택 영역에서 관리하고, 확인 전에는 HTML 카피로 만들지 않는다.
- 세척·관리·안전 문구는 제조사 근거가 생길 때만 추가한다.
- 실제 판매 채널의 GIF 허용 여부와 파일 크기 예산으로 최종 업로드 패키지만 다시 검사한다.
