# Editable HTML Detail Page Maker

## Destination

공급처 URL 하나에서 시작해 제품 사실·컷아웃 SSOT를 구축하고, ImageGen과 HyperFrames를 사용해 Behance 수준의 수정 가능한 HTML 상세페이지를 만드는 Codex 스킬의 구현 준비가 끝난 명세와 수치형 인수 기준을 완성한다.

## Notes

- 전체 대화의 통합 계획은 [`plan.md`](../../plan.md)에 기록한다.
- 도메인 용어는 [`CONTEXT.md`](../../CONTEXT.md)를 따른다.
- 조사에는 `research`와 `browser-harness`를 사용하고 1차 출처를 우선한다.
- 이미지 생성·편집 계약은 `imagegen`, 모션 계약은 `hyperframes`, 스킬 패키징은 `skill-creator`를 따른다.
- 이 Wayfinder 지도는 계획을 완성하는 데 집중한다. 실제 스킬 구현은 지도가 닫힌 뒤 별도 실행 단계로 넘긴다.

## Decisions so far

- [목적지와 핵심 증거 모델 확정](issues/01-lock-destination-and-evidence-model.md) —공급처 URL, 촬영 원본, 컷아웃 SSOT, ImageGen, HyperFrames와 수정 가능한 HTML의 역할을 분리했다.
- [Behance 우수 상세페이지의 디자인 문법 조사](issues/02-research-behance-design-grammar.md) —9개 제품군에서 구매 질문 중심 서사, 감성·정보·증거 리듬과 복제 방지 규칙을 추출했다.
- [상용 HTML에 적용할 AI 디자인 스킬 조사](issues/03-research-ai-design-skills.md) —디렉션 잠금부터 토큰·DOM, 다중 폭·접근성·성능·사람 비평까지의 검증 루프를 내부화하기로 했다.
- [HyperFrames에서 GIF까지의 공식 제작 계약 조사](issues/04-research-hyperframes-gif-pipeline.md) —동일 컷아웃 DOM, 결정적 seek 모션과 15fps 불투명 GIF 기본 계약을 확정했다.

## Not yet specified

- 제품군별로 몇 개의 디자인 템플릿이나 섹션 변형이 필요한지
- 코드 편집 외에 시각적 HTML 편집 UI가 필요한지
- 쿠팡 외 판매 채널 어댑터를 첫 버전에 포함할지
- 실제 상품 사진으로 컷아웃·다각도 뷰 생성 프로토타입을 수행할 시점

## Out of scope

- 이 지도에서 실제 판매 상품 상세페이지를 완성하거나 마켓에 게시하는 작업
- ImageGen 이외의 생성형 이미지·영상 모델 도입
- Behance 작품의 레이아웃·이미지·카피를 그대로 복제하는 작업
