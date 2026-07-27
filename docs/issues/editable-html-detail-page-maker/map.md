# Editable HTML Detail Page Maker

## Destination

공급처 URL 하나에서 시작해 제품 사실·컷아웃 SSOT를 구축하고, ImageGen과 HyperFrames를 사용해 Behance 수준의 수정 가능한 HTML 상세페이지를 만드는 Codex 스킬과 첫 최종 납품본을 완성한다.

## Notes

- 전체 대화의 통합 계획은 [`plan.md`](../../plan.md)에 기록한다.
- 도메인 용어는 [`CONTEXT.md`](../../CONTEXT.md)를 따른다.
- 조사에는 `research`와 `browser-harness`를 사용하고 1차 출처를 우선한다.
- 이미지 생성·편집 계약은 `imagegen`, 모션 계약은 `hyperframes`, 스킬 패키징은 `skill-creator`를 따른다.
- 이 Wayfinder 지도는 조사·계약·구현·최종 QA 결정을 함께 추적한다.

## Decisions so far

- [목적지와 핵심 증거 모델 확정](issues/01-lock-destination-and-evidence-model.md) —공급처 URL, 촬영 원본, 컷아웃 SSOT, ImageGen, HyperFrames와 수정 가능한 HTML의 역할을 분리했다.
- [Behance 우수 상세페이지의 디자인 문법 조사](issues/02-research-behance-design-grammar.md) —15개 원본 프로젝트에서 구매 질문 중심 서사, 감성·정보·증거 리듬과 복제 방지 규칙을 추출했다.
- [상용 HTML에 적용할 AI 디자인 스킬 조사](issues/03-research-ai-design-skills.md) —디렉션 잠금부터 토큰·DOM, 다중 폭·접근성·성능·사람 비평까지의 검증 루프를 내부화하기로 했다.
- [HyperFrames에서 GIF까지의 공식 제작 계약 조사](issues/04-research-hyperframes-gif-pipeline.md) —동일 컷아웃 DOM, 결정적 seek 모션과 15fps 불투명 GIF 기본 계약을 확정했다.
- [공급처 URL 추출 계약 결정](issues/05-decide-supplier-extraction-contract.md) —도매꾹 portable bundle을 원본 증거로 보존하고 출처 locator가 붙은 사실표를 별도로 만들기로 했다.
- [실제 도매꾹 URL 추출과 사실 정규화 검증](issues/12-prototype-domeggook-extraction.md) —원본 캡처·무결성은 통과했고, 원본 사진·치수·소구 후보·기획을 분리했다. 상세 root provenance, 정지 GIF 분류, 가격·MOQ·옵션과 OCR locator 보완을 후속 과제로 확정했다.
- [첫 수정 가능 HTML 상세페이지와 모션 증거 검증](issues/15-build-and-qa-first-editable-html-prototype.md) —ImageGen 참조 장면, HyperFrames GIF 2개, 편집 모드와 360·800px QA를 연결해 88/100 prototype을 완성했다. 실사진 SSOT와 사실 승인 전 판매 게시 게이트는 차단했다.
- [공급처 기준 v1 최종 납품본 마감](issues/16-finalize-supplier-reference-v1.md) —공급처 사실 12개와 공개 claim 9개를 잠그고 prototype·내부 제작 문구를 제거했으며, 콘텐츠 데이터·편집 저장 상태·320~800px QA를 갖춘 94/100 최종 HTML로 마감했다.
- [동종 후기 서사와 네 모션을 갖춘 v3 업그레이드](issues/17-upgrade-to-market-pain-and-four-motion-v3.md) —동종 제품 실제 후기 기반 문제→해결, ImageGen 소재, 감자 눈·치수 HyperFrames를 더해 97/100·하드 실패 0개로 마감했다.
- [Taste Skill·정기 학습·도매꾹 인기상품 반복 루프](issues/18-queue-taste-cron-and-popular-loop.md) —Taste 검증, Behance 정기 학습 큐와 인기상품 1개씩의 전체 파이프라인을 다음 실행 순서로 잠갔다.
- [도매꾹 인기 1위 아쿠아슈즈 전체 파이프라인](issues/19-prototype-popular-aqua-shoes-pipeline.md) —상품 66475839의 공급처 사실과 동종 후기 시장 불편을 분리하고, ImageGen 제품 참조·착화 장면, HyperFrames GIF 3개, 수정 가능 HTML을 제작해 97/100·하드 실패 0개로 마감했다.
- [경쟁상품 후기 개인정보 검증 보강](issues/20-fix-competitor-review-privacy-validation.md) —추출 결과의 review_text에 작성자·판매자 헤더가 남는 결함을 발견해 원문 번들 커밋을 차단하고 validator 회귀 조건을 정의했다.
- [아쿠아슈즈 사진 중심 상세페이지와 독립 Studio](issues/21-photo-led-detail-page-studio.md) —사용 맥락 ImageGen 장면 5개, HTML 카피 117개, 별도 Studio와 단일 HTML 내보내기, 발길이 바·점 정렬 교정을 완료했다.
- [도매꾹 23824901 commercial-tight v2 프로토타입](issues/22-prototype-domeggook-23824901-commercial-tight-v2.md) —새 공급처 추출부터 핵심 소구, 새 Behance 조사, 누끼 SSOT, 다섯 ImageGen·HyperFrames 역할, SVG 말풍선, 95/97점 하드 게이트까지 실행 순서를 잠갔다.
- [실제품 기반 노바페이스 기능성 깔창 commercial-final v11](issues/24-prototype-actual-product-air-cushion-insole.md) —흰 PU `SPORTS`·블루쿠션 `ZOOM SPORTS`, 장축 정렬, U자 굽힘 곡선, 255→260 화살표 시각 중심, 맥락 카드 인셋 제거, HTML-GIF 타이포 동기화와 5개 폭 QA를 연결해 98/100·하드 실패 0개로 마감했다.

## Not yet specified

- 제품군별로 몇 개의 디자인 템플릿이나 섹션 변형이 필요한지
- 코드 편집 외에 시각적 HTML 편집 UI가 필요한지
- 쿠팡 외 판매 채널 어댑터를 첫 버전에 포함할지
- 실제 상품 사진으로 컷아웃·다각도 뷰 생성 프로토타입을 수행할 시점
- 서로 다른 도매꾹 상품·판매자 레이아웃으로 일반 추출기를 회귀 검증할 fixture 구성
- [말풍선·텍스트·GIF 박스 레이어 편집 Studio](issues/25-build-layer-editable-detail-page-studio.md) —현재 광고 완료 뒤 layer ID·스냅·안전영역·반응형 오버라이드 기반으로 검토할 후속 프로토타입

## Out of scope

- 외부 마켓 계정에 상품을 실제 게시하거나 가격·배송·옵션을 변경하는 작업
- ImageGen 이외의 생성형 이미지·영상 모델 도입
- Behance 작품의 레이아웃·이미지·카피를 그대로 복제하는 작업
## 2026-07-25 완료 갱신

- [도매꾹 23824901 commercial-tight v2 프로토타입](issues/22-prototype-domeggook-23824901-commercial-tight-v2.md)은 13섹션 HTML, 별도 Studio, ImageGen 소재 5종, 역할이 다른 HyperFrames GIF 5종, SVG 말풍선, 단일 HTML 내보내기와 5개 폭 Browser Harness QA를 마쳤다.
- 최종 판정은 `completed`, commercial-tight v2 `98/100`, 하드 실패 `0개`다.

## 2026-07-25 기능성 깔창 확장 프로토타입

- [도매꾹 기능성 깔창 확장 미디어 프로토타입](issues/23-prototype-functional-insole-expanded-media.md) —도매꾹 `44358530`의 성형형 인솔을 선택해 공급처 근거, 확장 ImageGen 장면, 역할이 다른 6개 이상 GIF, 15개 이상 섹션, Studio와 skill 학습 갱신을 한 번에 검증한다.

## 2026-07-25 기능성 깔창 완료

- [도매꾹 기능성 깔창 확장 미디어 프로토타입](issues/23-prototype-functional-insole-expanded-media.md)은 ImageGen 8장, HyperFrames GIF 7개, 실제 시연 GIF 3개, 20개 섹션과 독립 Studio를 구현했다.
- 5개 반응형 폭, GIF 10/10, HyperFrames strict, HTML validator를 통과했고 `98/100`, 하드 실패 `0개`로 완료했다.
