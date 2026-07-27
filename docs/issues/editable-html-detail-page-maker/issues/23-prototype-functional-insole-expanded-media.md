# 도매꾹 기능성 깔창 확장 미디어 프로토타입

Type: prototype
Status: completed
결정일: 2026-07-25

## 질문

도매꾹 공급처 URL 하나에서 시작해, 이전 쿨패치 프로토타입보다 더 많은 ImageGen 장면과 서로 다른 정보 역할의 GIF를 사용하면서도 제품 동일성·주장 근거·편집성·반응형을 유지한 상용 상세페이지를 만들 수 있는가?

## 선택 상품

- 상품번호: `44358530`
- 공급처 URL: `https://domeggook.com/44358530?from=lstGen`
- 공급처 표시명: `랩몬스터 내발에 맞게 성형되는 기능성 인솔 깔창 자가맞춤 변신 평발 아치 깔창`
- 선택 이유: 성형 과정, 제품 구조, 사이즈, 착용 맥락과 다수의 공급처 원본 GIF가 있어 시간 변화가 필요한 구매 질문을 서로 다른 모션으로 분리하기 좋다.
- 공개 차단 후보: 평발·족저근막염 개선·예방, 통증 완화, 교정, 압력 분산, 충격 흡수처럼 시험 범위가 필요한 효능 표현.

## 완료 조건

- [x] `dmk-extractor` portable bundle과 SHA-256 원장을 검증한다.
- [x] 공급처 사실, 공급처 주장, 시장 불편, 공개 금지 주장을 분리한다.
- [x] 실제 제품 컷아웃 SSOT와 파생 관계를 기록한다.
- [x] ImageGen 장면을 이전 프로토타입보다 늘리되 제품 사실 증거로 사용하지 않는다.
- [x] 역할이 겹치지 않는 HyperFrames GIF를 최소 6개 만들고 실제 프레임 변화를 검증한다.
- [x] 15개 이상의 구매 섹션과 별도 편집 Studio를 구현한다.
- [x] 한글 카피·수치·치수·주의사항은 HTML·SVG로 유지한다.
- [x] 320·360·390·768·800px에서 오버플로·잘림·선·점·라벨 오차를 검수한다.
- [x] commercial-tight v2 97점 이상, 하드 실패 0개를 달성한다.
- [x] 검증된 학습만 `docs/PLAN.md`, `docs/references/commercial-detail-page.md`, `docs/references/design-study.md`, `SKILL.md`에 반영한다.

## Comments

- 사용자 요청: ImageGen과 GIF 양을 늘리고, 기능성 깔창 새 프로토타입으로 전체 스킬을 업데이트한다.

## Result

- 선택 상품: 도매꾹 `44358530`
- 결과물: `projects/domeggook-44358530/detail-page/index.html`, `studio.html`
- ImageGen 8장, 제품 SSOT 3개, HyperFrames GIF 7개, 공급처 실제 시연 GIF 3개
- 20개 섹션, 편집 텍스트 88개, 교체 이미지 21개
- HyperFrames check 오류·경고 0, 대비 42/42
- 320·360·390·768·800px overflow·깨진 이미지 0
- commercial-tight v3 `98/100`, 하드 실패 `0개`
- Browser Harness: `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\functional-insole-prototype-qa-20260725`
