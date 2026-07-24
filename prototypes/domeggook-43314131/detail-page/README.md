# 다용도 미니 채칼 HTML prototype

`index.html`을 브라우저로 열면 된다.

- 우측 상단 `편집 모드`: 점선으로 표시되는 모든 카피를 직접 수정한다.
- 편집 모드에서 제품·사용 이미지를 클릭하면 로컬 이미지로 교체한다.
- 색상 입력으로 기본 배경·강조·종이 색상을 변경한다.
- `HTML 저장`: 현재 카피, 색상과 교체 이미지를 포함한 수정본을 내려받는다.
- 모션 감소 설정에서는 GIF 대신 검수된 대표 정지 이미지를 표시한다.

제품 사실은 상위 [`supplier-facts.json`](../supplier-facts.json)에 연결되어 있고, 페이지 카피와 섹션의 연결은 [`claim-evidence-map.json`](claim-evidence-map.json)에 기록했다. 모든 공급처 사실은 현재 `publishable: false`인 prototype 상태다. 제품 컷아웃은 공급처 원본을 참조한 ImageGen prototype이므로 사용자 다각도 실사진 SSOT가 들어오면 교체·재승인한다.

## 모션 원본

- 이중 커터 위치 설명: [`videos/dual-blade-motion`](../../../videos/dual-blade-motion)
- 오이 얇게 썰기 사용 전후: [`videos/use-demo-motion`](../../../videos/use-demo-motion)

두 모션은 HyperFrames `check`에서 오류·경고 0을 통과한 뒤 4초·15fps·무한 반복 GIF로 삽입했다. 30fps MP4는 QA용으로 각 프로젝트의 `renders/`에 보존한다.

최종 Behance·반응형·접근성 검수는 [`qa/behance-rubric-report.md`](qa/behance-rubric-report.md)에 기록했다. 판정은 prototype 88/100 통과이며 판매 게이트는 사용자 실사진 SSOT와 사실 승인 전까지 차단한다.
