# 첫 수정 가능 HTML 상세페이지와 모션 증거 검증

Type: prototype
Status: resolved
Blocked by: 02, 03, 12

## Question

도매꾹 상품 `43314131`의 원본 사진·치수·재질·소구를 근거로, ImageGen 참조 장면과 HyperFrames GIF를 포함한 수정 가능한 상업 HTML 상세페이지를 만들고 Behance 기준·360px·800px 브라우저 QA를 통과할 수 있는가?

## Comments

- 2026-07-24: 사용자가 계획 단계를 넘어 실제 `.html` 구현과 Behance 기준 QA 완료를 지시했다.
- 2026-07-24: `Precision Green` 디자인 디렉션으로 800px 반응형 HTML prototype을 구현했다.
- 2026-07-24: 도매꾹 원본과 제품 누끼를 ImageGen 동일성 참조로 사용해 오이 얇게 썰기 start/end keyframe을 만들었다.
- 2026-07-24: HyperFrames로 커터 위치 설명과 사용 전후 모션을 각각 4초 GIF·30fps QA MP4로 렌더했다.
- 사용자 다각도 실사진 SSOT와 가격·MOQ·옵션은 아직 없으므로 prototype 승인과 판매 게시 승인을 분리한다.

## Answer

[`prototypes/domeggook-43314131/detail-page/index.html`](../../../prototypes/domeggook-43314131/detail-page/index.html)에 800px 상한·360px 반응형 수정 가능 HTML 상세페이지를 완성했다.

- 도매꾹 공급처 기능·치수·재질·원산지 사실을 `data-fact-id`와 [`claim-evidence-map.json`](../../../prototypes/domeggook-43314131/detail-page/claim-evidence-map.json)에 연결했다.
- ImageGen 참조 start/end 장면과 HyperFrames로 오이 얇게 썰기 가이드 GIF를 만들었다.
- 실제 구조의 두 커터 위치를 고정 제품 위에서 순차 강조하는 HyperFrames GIF를 만들고, 잘못된 2D 반전 연출을 폐기했다.
- GIF 두 개는 4초·60프레임이며 각 HyperFrames check에서 오류·경고 0을 통과했다.
- Browser Harness에서 800px·360px 가로 overflow 0, 이미지 alt 누락 0, 61개 편집 카피, 9개 교체 자산, 44px 편집 버튼, 축소 모션 poster 전환을 검증했다.
- Behance 15개 원본 공통 문법과 상업 계약 rubric에서 88/100으로 prototype을 통과했다.
- `awesome-design-md`와 `ai-design-skills`에서 추출한 `EXP-001`은 동일 조건 A/B에서 78→85점으로 올라 `adopted-local`로 기록했다.

상세 QA는 [`qa/behance-rubric-report.md`](../../../prototypes/domeggook-43314131/detail-page/qa/behance-rubric-report.md)를 따른다. 공급처 사실은 모두 사용자 승인 전 `publishable: false`이고 사용자 실사진 SSOT·가격·MOQ·옵션·관리법이 없으므로 판매 게시 승인은 차단한다.
