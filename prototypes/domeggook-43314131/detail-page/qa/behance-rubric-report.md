# 다용도 미니 채칼 상업 HTML 상세페이지 QA

검수일: 2026-07-24
대상: [`../index.html`](../index.html)
기준: [`../../../../commetial-detail-page.md`](../../../../commetial-detail-page.md), Behance 원본 프로젝트 15개 공통 문법
판정 범위: 판매 게시물이 아닌 `prototype-only`

## 결론

**Prototype 통과: 88/100, 하드 실패 0개.**
**판매 게시 차단:** 공급처 사실이 모두 사용자 승인 전 `publishable: false`이고, 사용자 다각도 실사진 제품 SSOT·가격·MOQ·옵션·관리법이 없다.

이 결과는 상업 상세페이지의 디자인·편집·모션·반응형 구조를 검증한 prototype이다. 현재 파일을 그대로 공개 판매 페이지로 게시하지 않는다.

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
| 상품 사실·동일성 | 25 | 19 | 공급처 원본·해시·파생 관계는 추적된다. ImageGen 컷아웃과 사용 장면은 실사진 SSOT 도착 전 prototype이다. |
| 주장-근거 | 20 | 18 | 섹션 fact ID, claim map, 기능 시연 한계와 금지 주장을 인접 표시했다. 모든 사실이 사용자 승인 전이라 게시 점수는 보류했다. |
| 정보 서사·전환 | 15 | 14 | 가치→기능→구조→규격→구매 확인이 명확하다. 가격·옵션·관리법은 근거가 없어 의도적으로 제외했다. |
| 시각 체계·리듬 | 15 | 14 | Precision Green 팔레트, 대형 한글 타이포, 네 가지 장면 거리와 감성/증거 리듬이 일관된다. 공급처 사용 사진의 원본 품질은 생성 장면보다 낮다. |
| 편집성·반응형 | 10 | 10 | 실제 HTML 카피 61개, 교체 자산 9개, CSS 토큰, HTML 저장, 360·800px 가로 overflow 0을 확인했다. |
| 접근성 | 10 | 9 | 한 개의 h1, 모든 img의 alt, 44px 편집 버튼, 16px 사실 본문, 12px 근거 캡션, 축소 모션 poster를 확인했다. 별도 수동 스크린리더 검수는 남아 있다. |
| 성능·모션 | 5 | 4 | 4초 GIF 두 개는 한 주장씩 설명하고 poster가 있다. GIF 합계 약 2.8MB이며 판매 채널 확정 후 용량 예산 재검수가 필요하다. |
| **합계** | **100** | **88** | **Prototype 통과** |

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

`C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\detail-page-exp001-final-qa`

최종 캡처:

- `.artifacts/final-800.png`
- `.artifacts/final-360.png`
- `.artifacts/final-reduced-motion-800.png`

DOM·좌표 결과:

- 800px: `clientWidth 800`, `scrollWidth 800`, 상세페이지 폭 800
- 360px: `clientWidth 360`, `scrollWidth 360`, 상세페이지 폭 360
- 의미 섹션 10개, disclosure metadata 11개, 빈 fact ID 0개
- `img:not([alt])` 0개, GIF 2개 모두 로드 완료
- 360px 모션 크기: 오이 330×247.5px, 커터 330×297px
- 편집 모드: `contenteditable` 61개, 교체 이미지 9개, 저장 버튼 표시, 종료 후 `aria-pressed=false`
- 편집 버튼: 73.5×44px
- 축소 모션: 오이 GIF → `use-motion-end.png`, 커터 GIF → `dual-blade-function-poster.png`
- 축소 모션 상태에서 모든 reveal이 표시되고 가로 overflow가 없다.

## 디자인 학습 실험

[`../../../../study-desing-skill.md`](../../../../study-desing-skill.md)의 `EXP-001`을 적용했다.

- 기능 3컷 바로 아래에 공급처 시연 범위와 일정한 결과 비보장 캡션을 추가했다.
- 각 섹션에 `surface / intermediate / proof` 정보 층위 metadata를 추가했다.
- 동일한 800px·360px 조건에서 전후를 비교했다.
- 실험 rubric: 78→85점, +7점, 하드 실패 0개
- 판정: `adopted-local`
- 영구 계약 승격: 다른 상품군에서 한 번 더 독립 통과하기 전까지 금지

## 가장 약한 부분과 수정

초기 최약점은 제품 동일성 근거가 공급처 사진과 생성 컷아웃에 머물고, 기능 모션의 라벨 위치와 근거 성격이 모호했던 점이다.

이번 수정에서:

1. 커터 반전 모션을 폐기하고 두 커터의 실제 위치를 고정 제품 위에서 표시했다.
2. `MOTION PROOF`를 `MOTION GUIDE`로 낮추고 ImageGen 장면을 실제 성능 증거로 사용하지 않는다고 명시했다.
3. 기능 3컷 바로 아래에 공급처 시연 범위 캡션을 추가했다.
4. 모바일 GIF의 고정 높이 때문에 생긴 크롭을 `height: auto`로 수정했다.
5. 데스크톱 히어로에서 제품이 제목을 덮지 않게 제목 레이어를 앞으로 이동했다.

## 게시 전 필수 보완

- 사용자 촬영 정면·후면·좌우·상하·3/4·구조 매크로 원본을 등록한다.
- 사용자 원본에서 승인된 누끼·제품 뷰 SSOT를 다시 만든다.
- 모든 공급처 fact와 카피의 `publishable` 상태를 사용자 승인으로 갱신한다.
- 가격, 최소 주문 수량, 판매 단위, 옵션, 배송·교환 정보를 추가한다.
- 세척·관리·안전 문구는 제조사 근거가 있을 때만 추가한다.
- 실제 판매 채널의 GIF 허용 여부와 파일 크기 예산으로 다시 검사한다.
