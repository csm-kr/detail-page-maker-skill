# 아쿠아핏 워터 슈즈 상업 HTML 상세페이지 최종 QA

검수일: 2026-07-25

대상: [`../index.html`](../index.html)

기준: [`../../../../commetial-detail-page.md`](../../../../commetial-detail-page.md), Behance 우수 상세페이지 공통 문법, Taste 보조 기준
판정 범위: `supplier-reference-v1-commercial`

## 결론

**최종 통과: 97/100, 하드 실패 0개.**

도매꾹 원본에서 확인한 제품명·색상·사이즈·발길이·두께·무게·원산지·수입원·보이는 구조를 사실 SSOT로 사용했다. 동종 아쿠아슈즈 세 상품의 공개 후기에서 반복된 불편은 `MARKET_PAIN`으로 분리해 구매 질문에만 사용했고, 현재 SKU의 단점이나 해결 성능으로 전환하지 않았다. ImageGen 장면은 제품 동일성 참조와 착화 맥락에만 사용하고, HyperFrames는 사이즈와 치수 위치처럼 검증 가능한 정보만 움직였다.

## 100점 rubric

| 영역 | 배점 | 점수 | 판정 |
|---|---:|---:|---|
| 상품 사실·동일성 | 25 | 24 | 공급처 원본·fact ID·locator·파생 자산 해시가 추적된다. 사용자 다각도 실사진 SSOT는 후속 강화 항목이다. |
| 주장-근거 | 20 | 20 | 게시 claim 9개가 승인 fact에 연결되고, 밑창 소재 충돌과 시험 없는 성능 주장은 차단됐다. |
| 정보 서사·전환 | 15 | 15 | 구매 불안→보이는 구조→착화 맥락→발길이→두께→수치→색상→구매 확인으로 자연스럽게 이어진다. |
| 시각 체계·리듬 | 15 | 15 | 아이보리·민트·딥그린·라임 체계, 큰 수치 블록, 제품 컷과 모션의 리듬이 일관된다. |
| 편집성·반응형 | 10 | 10 | 카피 100개, CSS 토큰, 편집·저장·JSON 내보내기·모션 토글을 제공하며 320~800px에서 overflow가 없다. |
| 접근성 | 10 | 9 | h1 1개, 누락·빈 alt 0개, 이름 없는 버튼 0개, 모션 정지 버튼을 확인했다. 수동 스크린리더 검수는 남아 있다. |
| 성능·모션 | 5 | 4 | GIF 3개가 실제로 움직이고 포스터를 제공한다. 합계 약 5.8MB로 실사용 가능하지만 채널별 제한에 따라 추가 압축 여지가 있다. |
| **합계** | **100** | **97** | **상용 후보 통과** |

## 문제→해결 기획 QA

동종 제품 세 상품의 후기에서 다음 불편이 반복됐다.

- 사이즈가 크거나 헐겁게 느껴짐: 3/3 상품
- 뒤꿈치 또는 봉제 마찰: 3/3 상품
- 젖은 바닥에서의 미끄럼 불안: 3/3 상품
- 모래 유입: 3/3 상품
- 배수 체감: 2/3 상품
- 깔창 또는 갑피 손상: 2/3 상품
- 색상 차이 또는 오배송: 2/3 상품

현재 페이지는 이 내용을 “사이즈를 발길이 기준으로 확인했는가”, “뒤꿈치와 입구 봉제 구조가 보이는가”, “시험 없는 미끄럼 성능을 과장하지 않았는가”라는 구매 질문으로 변환했다. 현재 SKU가 해당 문제를 해결한다고 주장하지 않는다.

상세 근거: [`../../research/market-pain-research.json`](../../research/market-pain-research.json)

## ImageGen 소재 QA

- `product-green-side.png`: 공급처의 그린 측면 제품을 참조하고 `Sport Keeper` 레터링, 뒤꿈치 고리, 입구 봉제, 보강 패턴을 눈검수했다.
- 투명 누끼는 1,870×841 RGBA이며 SHA-256은 `5fffb93e...f32ddb0`이다.
- 생성 과정에서 만든 보이지 않는 밑창 시안은 형태를 추정했기 때문에 증거 사용에서 탈락시켰다.
- `aqua-use-context.gif`의 기반 장면은 승인 컷아웃과 공급처 참조를 사용한 착화 연출이다. 미끄럼·배수·건조 성능 장면이 아니다.

## HyperFrames QA

| 구성 | 결과 | HyperFrames check | 게시 자산 |
|---|---|---|---|
| 발길이 선택 | 800×800, 5.2초, 15fps | lint·runtime·layout·motion 오류/경고 0, 대비 83/83 | `aqua-fit-guide.gif` |
| 바닥 기준 두께 | 800×760, 4초, 15fps | lint·runtime·layout·motion 오류/경고 0, 대비 23/23 | `aqua-thickness.gif` |
| 착화 맥락 | 640×800 웹 최적화, 4.26초, 8fps | 검사 통과, 대비 13/13 | `aqua-use-context.gif` |

사용자가 지적한 두께 모션의 위쪽 가로 기준선은 `y=471`에서 `y=449`로 22px 올렸다. 최종 프레임에서 제품과 선이 닿지 않으며, 제품 오른쪽에서 독립적인 치수 기호로 보인다.

## 실제 GIF 재생 검증

세 GIF의 0.1초와 2.1초 프레임을 추출해 SHA-256이 서로 다른지 확인했다.

| GIF | 0.1초 프레임 | 2.1초 프레임 | 판정 |
|---|---|---|---|
| 발길이 | `a4c89402...25de` | `a20c3583...ebea` | 움직임 확인 |
| 두께 | `d918f2b0...102c` | `0f1b2444...dc3` | 움직임 확인 |
| 착화 맥락 | `b328f20a...ac6` | `c8ca749a...d7ac` | 움직임 확인 |

브라우저 DOM에서도 기본 상태의 보이는 `.motion-gif`가 3개이며 natural size가 각각 800×800, 800×760, 640×800임을 확인했다. `모션 끄기`를 누르면 GIF 0개·포스터 3개, 다시 `모션 보기`를 누르면 GIF 3개로 복귀한다.

검수 프레임:

- [`screenshots/gif-fit-guide-active.png`](screenshots/gif-fit-guide-active.png)
- [`screenshots/gif-thickness-active.png`](screenshots/gif-thickness-active.png)
- [`screenshots/gif-use-context-active.png`](screenshots/gif-use-context-active.png)

## Browser Harness 검수

녹화:

`C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\aqua-detail-page-qa-20260725`

DOM 결과:

- 의미 섹션 10개
- `data-editable` 100개
- h1 1개
- 누락 alt 0개, 빈 alt 0개
- 이름 없는 버튼 0개
- 중복 ID 0개
- 깨진 이미지 0개
- 구매자 화면의 `도매꾹`, `공급처 원문`, `원문 기준` 노출 0개
- 편집 시작 시 100개 요소가 `contenteditable=true`, 종료 시 0개로 복귀

반응형 결과:

| 뷰포트 | 가로 overflow | 잘린 단일행 편집 문구 | 깨진 이미지 | 보이는 GIF |
|---:|---:|---:|---:|---:|
| 320 | 0 | 0 | 0 | 3 |
| 360 | 0 | 0 | 0 | 3 |
| 390 | 0 | 0 | 0 | 3 |
| 768 | 0 | 0 | 0 | 3 |
| 800 | 0 | 0 | 0 | 3 |

전체 캡처:

- [`screenshots/desktop-800-visual.png`](screenshots/desktop-800-visual.png)
- [`screenshots/mobile-390-visual.png`](screenshots/mobile-390-visual.png)

## 남은 비차단 항목

- 사용자 다각도 실사진이 도착하면 현재 공급처 참조 컷아웃과 착화 장면을 실사진 기반 제품 시트·누끼·다중 뷰 SSOT로 교체한다.
- 실제 판매 채널의 GIF 총 용량 제한이 5.8MB보다 작으면 착화 맥락 GIF를 우선 압축하거나 poster로 전환한다.
- 수동 스크린리더 검수와 실제 판매 옵션·배송·교환 데이터 결합은 게시 직전에 수행한다.
