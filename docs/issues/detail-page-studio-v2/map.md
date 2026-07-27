# Detail Page Studio v2

## Destination

공급처 URL에서 시작한 이미지·GIF·HyperFrames·HTML 자산을 조립 전에 개별 검수하고, 사용자 승인된 버전만 수정 가능한 HTML 상세페이지로 조립하는 설치형 Studio를 완성한다.

## Notes

- 제품 동일성 하드 실패는 사용자도 우회 승인할 수 없다.
- ImageGen은 생성만 담당하고 결과를 자가 승인하지 않는다.
- 조립 뒤 에셋·GIF 단계는 읽기 전용이며 변경은 새 개정판에서만 수행한다.
- 설치 스킬과 사용자 상품 프로젝트를 서로 다른 폴더에 둔다.
- 기존 결과는 `projects/` 아래의 독립 프로젝트로 전환하고 프로젝트 전용
  `videos/`·증거 번들은 각 프로젝트 안으로 이동한다. 공용 `research/`와 코드
  회귀 `tests/`만 저장소 루트에 남긴다.

## Decisions so far

- 하나의 `studio.html`에 에셋 검수, GIF 레이어 편집, 조립, HTML 편집, 최종 QA를 탭으로 통합한다.
- 이미지·GIF·HTML 생성 요청은 로컬 작업 대기열을 통해 Codex가 처리한다.
- 제품 포함 이미지·GIF·인포그래픽은 개별 승인하고 순수 장식은 묶음 승인할 수 있다.
- 프롬프트 수정은 원본과 후보 한 개를 비교하고, 재생성할 때 새 후보 버전을 만든다.
- GIF 프롬프트 범위는 레이어, 그룹, 장면 전체를 지원한다.
- 조립 뒤에는 승인 근거를 읽을 수 있지만 에셋을 직접 교체할 수 없다.
- 변경 시 에셋 의존성 그래프가 영향받은 GIF와 HTML 섹션을 자동으로 다시 연다.
- 게시용 단일 HTML과 완전한 Studio 프로젝트 묶음을 함께 내보낸다.
- 게시 기준은 상용 QA 97점 이상과 하드 실패 0건이다.
- 구현 계약은 [01 제품 명세](issues/01-document-studio-contract.md), 설치 단위는 [02 설치형 스킬](issues/02-package-installable-skill.md)에 고정했다.
- 실행 결과는 [03 로컬 서버](issues/03-build-local-studio-server.md), [04 통합 UI](issues/04-build-integrated-studio-ui.md), [05 회귀 QA](issues/05-verify-studio-runtime.md)에 기록했다.

## Frontier

없음. 첫 실행형 Studio v2 수직 슬라이스를 완료했다.

## Completed

- [Studio 제품 명세와 상태 계약 고정](issues/01-document-studio-contract.md)
- [설치형 스킬 패키지 구성](issues/02-package-installable-skill.md)
- [로컬 Studio 서버와 작업 대기열 구현](issues/03-build-local-studio-server.md)
- [통합 Studio UI 구현](issues/04-build-integrated-studio-ui.md)
- [설치·상태·승인·내보내기 QA](issues/05-verify-studio-runtime.md)

## Out of scope

- ImageGen 이외의 생성형 이미지·영상 모델
- 승인된 현재 조립본을 파괴적으로 잠금 해제하는 기능
- 실시간 다중 사용자 공동 편집
- 외부 판매 채널에 자동 게시
