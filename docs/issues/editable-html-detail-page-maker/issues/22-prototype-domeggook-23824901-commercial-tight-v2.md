# 도매꾹 23824901 commercial-tight v2 프로토타입

상태: completed
결정일: 2026-07-25
최종 점수: 98/100
하드 실패: 0

## 입력

- 공급처 URL: `https://domeggook.com/23824901?from=popular100`
- 상품: 아이스 쿨패치, 1팩 2매입
- 목적: 공급처 URL 하나에서 시작해 사실·시장 불편·제품 SSOT·ImageGen·HyperFrames·편집 HTML·Studio·QA까지 전체 과정을 완주한다.

## 완료

- [x] dmk-extractor 원본 번들 검증
- [x] 사실·주장·치수·재질·구성·사용법·주의사항 분리
- [x] 첫 소구를 “손에 들지 않고 붙이는 제품 형태”로 확정
- [x] 미관찰 Behance 4종과 공개 시장 불편 조사
- [x] RGBA 제품 앞면·필름 반제거 SSOT
- [x] ImageGen 맥락·소재 5종
- [x] SVG 좌우 말풍선 2개
- [x] 문제·준비·필름 제거·치수·주의 HyperFrames GIF 5개
- [x] 13섹션 편집 가능 HTML
- [x] 별도 Studio와 JSON·단일 HTML 내보내기
- [x] 320·360·390·768·800px Browser Harness QA
- [x] GIF 실제 프레임 변화 5/5
- [x] standalone 재오픈, 이미지 13·GIF 5·깨짐 0
- [x] commercial-tight v2 98/100, 하드 실패 0

## 핵심 결정

1. `약 5×12cm`와 `냉장 1–2시간`은 보조 정보다.
2. 첫 소구는 `더운 순간, 손에 들지 않고 붙이는 제품 형태`다.
3. 공개 시장 불편은 현재 SKU 사실과 분리하고 고지한다.
4. 접착력, 온도 하락, 최대 지속 시간, 저자극, 치료 효능, 인증 배지는 근거 전까지 차단한다.
5. 생성 이미지는 분위기와 맥락만 담당하고 사실·수치·한글은 HTML/SVG로 유지한다.
6. 치수선과 점은 같은 좌표를 사용하고 제품과 최소 24px 떨어뜨린다.

## 결과물

- `projects/domeggook-23824901/detail-page/index.html`
- `projects/domeggook-23824901/detail-page/studio.html`
- `projects/domeggook-23824901/detail-page/qa/export/cool-patch-detail-page-standalone.html`
- `projects/domeggook-23824901/hyperframes/projects/cool-patch-motion-studio/`
- `projects/domeggook-23824901/detail-page/qa/commercial-tight-v2-report.md`

## 롤백 조건

- 실제 사용자 촬영 사진이 들어오면 파생 누끼 SSOT를 실제 사진 기반 SSOT로 교체한다.
- 공급처 사실이 변경되거나 인증 원본이 들어오면 claim-evidence-map과 게시 승인을 다시 검토한다.
- 새 상품에서 같은 비주얼 문법이 제품 특성을 약화하면 팔레트·소재·장면 구성을 상품별로 다시 설계한다.
