# Detail Page Studio v2 Specification (Deprecated)

Status: wontfix

2026-07-27 사용자 결정으로 폐기됐다. 활성 구현은
`.scratch/studio-v1-asset-approval/spec.md`와 노바페이스 기반 Studio v1을 따른다.

## Problem

현재 Studio는 카피·섹션 순서·이미지 경로를 수정할 수 있지만, 조립 전 이미지·GIF의 제품 동일성과 디자인 일관성을 사용자에게 승인받는 상태 모델이 없다. 생성 결과를 바로 HTML에 넣으면 제품 구조·로고·부품 위치·타이포가 서로 다른 상태로 조립되고, 수정과 재생성을 반복할수록 어떤 버전이 승인본인지 잃기 쉽다.

## Outcome

Studio를 다음 다섯 작업면으로 통합한다.

1. 에셋 검수
2. GIF·HyperFrames 레이어 편집
3. 상세페이지 조립
4. HTML 인터랙티브 편집
5. 최종 QA와 내보내기

에셋 검수 작업면의 첫 화면에는 다음 제작 지도를 항상 표시한다.

1. 사용자 촬영 원본과 제품 사실 SSOT
2. 제품 원형·누끼·방향별 제품 뷰
3. 인간 모델 후보와 모델 SSOT 승인
4. 제품이 없는 배경·공간 레퍼런스
5. 승인 모델과 제품을 함께 쓰는 착용·사용 예시
6. 소재·구조·동작 증거
7. 선행 에셋 승인 게이트
8. 위 승인 에셋을 사용하는 commercial-max 상세페이지 14장과 HyperFrames GIF 2개

새 Studio 프로젝트의 선행 에셋 로드맵은 최소 24개여야 한다. 살랑 루즈핏
쿨토시 프로젝트는 28개 선행 에셋을 계획하며, 각 항목은 용도·참조 원장·모델
필요 여부·사용될 상세페이지를 공개한다. 선행 에셋 승인 게이트를 통과하기 전에는
최종 상세페이지 이미지와 HyperFrames GIF 키프레임·모션을 만들지 않는다.

## Non-negotiable invariants

- 필수 에셋이 모두 사용자 승인되기 전에는 조립할 수 없다.
- 사람 얼굴·체형·헤어·피부톤·의상이 보이는 에셋은 승인된 모델 SSOT가 없으면 생성할 수 없다.
- 모델 후보의 승인 버전과 SHA-256을 모델 SSOT로 잠그며 이후 인간 장면은 그 버전을 참조한다.
- 모델 SSOT 승인 전에도 제품 원형·누끼·배경·비인간 구조 증거는 생성할 수 있다.
- 제품 단독 생성은 제품 SSOT만 참조하고, 배경과 모델 후보는 제품 원본을 참조하지 않으며, 인간 사용 장면은 제품 SSOT와 승인 모델 SSOT를 함께 참조한다.
- 제품 동일성 하드 실패가 있으면 승인할 수 없다.
- 재생성은 파일을 덮어쓰지 않고 새 버전을 만든다.
- ImageGen은 생성만 담당하고 자가 승인하지 않는다.
- 조립 순간 승인 에셋 ID·버전·해시를 잠근다.
- 조립 뒤 에셋·GIF 화면은 읽기 전용이다.
- 에셋 교체는 새 개정판에서만 수행한다.
- 새 개정판은 변경 에셋과 그 의존 항목만 재승인한다.
- 게시용 내보내기는 97점 이상·하드 실패 0건·사용자 최종 승인 뒤에만 허용한다.

## Distribution

- GitHub: `csm-kr/detail-page-maker-skill`
- 설치: `npx skills add csm-kr/detail-page-maker-skill --full-depth`
- 기본 프로젝트: `문서/DetailPageStudio/projects/<상품명>-<상품번호>/`
- 런타임: Node.js 기본 모듈 기반 로컬 서버
- 게시 결과: 서버 없이 열리는 독립 HTML

## Canonical documentation

- 제품 요구사항: [`../../studio/product-spec.md`](../../studio/product-spec.md)
- 아키텍처와 데이터 계약: [`../../studio/architecture.md`](../../studio/architecture.md)
