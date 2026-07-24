# 다용도 미니 채칼 상업 HTML 상세페이지 최종 QA

검수일: 2026-07-25
대상: [`../index.html`](../index.html)
기준: [`../../../../commetial-detail-page.md`](../../../../commetial-detail-page.md), Behance 상세페이지 원본 프로젝트 공통 문법
판정 범위: `supplier-reference-v3-commercial`

## 결론

**최종 통과: 97/100, 하드 실패 0개.**

공급처 원문에서 직접 확인한 제품명·기능·구조·치수·재질·원산지·수입원을 사실 SSOT로 사용했다. 동종 제품 공개 후기에서 반복된 생활 불편을 별도 `MARKET_PAIN` 근거로 분리해, 현재 SKU의 성능 후기처럼 사용하지 않고 문제 제기 언어로만 연결했다. ImageGen 장면은 소재 배경과 동작 설명에만 사용하고, 실제 제품 구조 주장은 공급처 증거·컷아웃·HyperFrames 도해에 연결했다.

## 100점 rubric

| 영역 | 배점 | 점수 | 판정 |
|---|---:|---:|---|
| 상품 사실·동일성 | 25 | 24 | 공급처 원본·fact ID·locator·해시·파생 관계가 추적된다. 사용자 다각도 실사진 SSOT는 후속 강화 항목이다. |
| 주장-근거 | 20 | 20 | 공개 제품 claim 10개가 supplier fact에 연결되고, 동종 후기 문제 카피는 별도 voice ID와 금지 범위를 가진다. |
| 정보 서사·전환 | 15 | 15 | 제품 가치→실제 생활 불편→한 자루의 해결 구조→사용→커터 전환→치수·재질·보관→구매 확인이 연결된다. |
| 시각 체계·리듬 | 15 | 15 | 아이보리 소재 장면, 실제 제품 레이어, 라임 기능 장면, 짙은 구조 장면과 수치 블록의 리듬이 일관된다. |
| 편집성·반응형 | 10 | 10 | HTML 카피 68개, 교체 자산 11개, CSS 토큰, 편집 모드와 HTML 저장을 제공한다. 320~800px overflow·텍스트 잘림 0개다. |
| 접근성 | 10 | 9 | h1 1개, 누락 alt 0개, 빈 fact/asset ID 0개, 버튼 이름, 축소 모션 poster와 reveal 표시를 확인했다. 별도 수동 스크린리더 검수는 남아 있다. |
| 성능·모션 | 5 | 4 | 4개 GIF가 각각 한 정보만 설명하고 poster를 제공한다. GIF 합계 약 8MB로 상용 상세 범위지만 판매 채널별 예산 확정 후 추가 압축 여지가 있다. |
| **합계** | **100** | **97** | **상용 후보 통과** |

## 문제→해결 근거 QA

- 오늘의집 동종 제품 후기: 적은 양을 손질할 때 큰 채칼을 꺼내는 번거로움.
- 다이소몰 동종 제품 후기: 감자 눈 제거 돌기가 없어 별도 칼이 필요한 아쉬움.
- 다나와 소비자 사용기: 감자 눈 제거 돌기는 약간의 사용 요령이 필요할 수 있음.
- 현재 페이지 적용:
  - 문제: `잠깐 채썰자고 큰 채칼을 꺼내기 번거롭고.`
  - 문제: `감자 눈 제거 돌기가 없으면 칼끝을 다시 잡게 되고.`
  - 해결: `한 자루 안에서, 손질에 맞는 면만.`
  - 근거: supplier fact의 두 커터 구조와 오른쪽 감자 눈 제거 돌기.
- 금지 확장: 더 적은 힘, 일정한 절삭 굵기, 미끄럼 방지, 안전 보관, 만족도·판매량.
- 상세 근거: [`../../market-voice-evidence.json`](../../market-voice-evidence.json)

## ImageGen 소재 QA

- `ingredient-still-life.png`: 제품·도구·문구·로고 없이 감자·오이·당근과 HTML 카피 여백만 생성했다.
- 실제 제품은 `product-cutout.png`를 HTML 레이어로 분리해 생성 배경이 SKU 사실을 바꾸지 않게 했다.
- `potato-eye-start.png`와 `potato-eye-contact.png`: 공급처의 오른쪽 돌기와 감자 눈 접촉 방향을 동작 SSOT로 사용했다.
- ImageGen 장면은 성능 결과가 아니라 구조·접촉 위치 설명으로만 표시했다.

## HyperFrames QA

| 구성 | 결과 | HyperFrames check | 게시 자산 |
|---|---|---|---|
| 얇게 썰기 흐름 | 800×600, 4초, 15fps | 오류 0, 경고 0 | `use-slice-motion.gif` |
| 양면 커터 전환 | 800×720, 4초, 15fps | 오류 0, 경고 0 | `dual-blade-function.gif` |
| 치수 안내 | 800×900, 4.2초, 15fps | 오류 0, 경고 0. 가로선과 제품 상단 분리 | `dimension-guide.gif` |
| 감자 눈 접촉 | 800×800, 4초, 15fps | 오류 0, 경고 0 | `potato-eye-motion.gif` |

감자 눈 모션은 점, 안내선 끝과 강조 원의 중심을 하나의 좌표로 고정했다. 제품 사진 전체 확대를 제거해 GIF를 약 7.2MB에서 약 2.7MB로 줄였다. 치수 모션의 가로선은 `y=88`에서 `y=52`로, 끝점 하단은 `y=100`에서 `y=64`로 올려 제품 헤드와 닿지 않게 했다.

## 실제 GIF 재생 검증

브라우저에서 `prefers-reduced-motion: no-preference`로 전환한 뒤 네 이미지의 `currentSrc`가 실제 `.gif`이고 natural size가 기대값과 같은지 확인했다.

- `potato-eye-motion`: 800×800
- `use-slice-motion`: 800×600
- `dual-blade-function`: 800×720
- `dimension-guide`: 800×900

같은 뷰포트에서 1.15초 간격으로 저장한 각 GIF의 전후 PNG SHA-256이 모두 달랐다. 정지 poster가 아니라 브라우저에서 실제 프레임이 변한다.

- `gif-potato-final-t0.png` ≠ `gif-potato-final-t1.png`
- `gif-use-t0.png` ≠ `gif-use-t1.png`
- `gif-dual-t0.png` ≠ `gif-dual-t1.png`
- `gif-dimension-gap-t0.png` ≠ `gif-dimension-gap-t1.png`

축소 모션에서는 네 GIF가 각각 PNG poster로 바뀌며 숨은 `.reveal` 요소는 0개였다.

## Browser Harness 검수

녹화:

- `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\final-page-qa-v3`
- `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\responsive-final-v3`
- `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\dimension-gap-and-taste-final`
- `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\taste-edit-mode-final-dom`

DOM 결과:

- 의미 섹션 11개
- `data-editable` 68개
- `data-replaceable` 11개
- `img:not([alt])` 0개
- 빈 fact ID 0개, 빈 asset ID 0개, 중복 ID 0개
- h1 1개, 이름 없는 버튼 0개, 깨진 이미지 0개
- 구매자 화면의 `도매꾹`, `공급처 원문`, `원문 기준` 노출 0개
- 편집 모드 진입·종료 시 68개 요소의 contenteditable 상태 전환 통과

Taste Skill v2 보조 검수:

- 의미 섹션 10개에 눈썹 라벨 4개로 `ceil(10/3)=4` 상한 통과
- 구매자 노출 텍스트의 em dash·en dash 0개
- `SECTION 01`, `MODE 01`, `POINT 01`형 숫자 메타 라벨 0개
- 숫자 장식을 없앤 뒤에도 기능명·제품 사실·근거 캡션과 정보 순서는 유지
- 현재 상업 상세페이지 rubric은 97/100, 하드 실패 0개로 유지

반응형 결과:

| 뷰포트 | 문서 폭 | 가로 overflow | 잘린 편집 텍스트 | 깨진 이미지 |
|---:|---:|---:|---:|---:|
| 320 | 320 | 0 | 0 | 0 |
| 360 | 360 | 0 | 0 | 0 |
| 390 | 390 | 0 | 0 | 0 |
| 768 | 768 | 0 | 0 | 0 |
| 800 | 800 | 0 | 0 | 0 |

## 최종 캡처

- `06-problem-solution.png`
- `07-potato-eye-motion.png`
- `08-dimensions-v2.png`
- `11-dimension-gap-final.png`
- `09-storage-v2.png`
- `10-mobile-390-problem.png`
- `taste-after-800-top.png`
- `taste-after-390-top.png`
- `gif-potato-final-t0.png`, `gif-potato-final-t1.png`

## 남은 비차단 항목

- 사용자 다각도 실사진이 도착하면 현재 제품 컷아웃과 ImageGen 동작 프레임을 실사진 기반 다중 뷰 SSOT로 교체한다.
- 실제 판매 채널의 GIF 총 용량 제한이 8MB 미만이면 우선순위가 낮은 모션을 poster 또는 MP4/WebP로 대체한다.
- 수동 스크린리더 검수와 판매 채널의 배송·교환·옵션 데이터 결합은 게시 직전에 수행한다.
