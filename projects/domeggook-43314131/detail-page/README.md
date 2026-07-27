# 다용도 미니 채칼 HTML 상세페이지

최종 상태: `supplier-reference-v3-commercial`

[`index.html`](index.html)을 브라우저로 열면 이미지·GIF·편집 기능이 포함된 상세페이지를 바로 확인할 수 있다.

## 편집 방법

- 우측 상단 `편집 모드`를 누르면 68개 카피가 직접 편집된다.
- 편집 중 제품·사용 이미지를 누르면 로컬 이미지로 교체할 수 있다.
- 배경·강조·종이 색상 입력은 CSS 토큰을 변경한다.
- 변경 전에는 `편집 준비 · 변경 없음`, 변경 후에는 `수정됨 · HTML 저장 필요`가 표시된다.
- `HTML 저장`을 누르면 현재 카피·색상·교체 이미지를 포함한 `detail-page-edited.html`이 내려받아진다.
- 모션 감소 설정에서는 GIF 대신 검수된 대표 정지 이미지를 표시한다.

## 데이터와 근거

- [`content.json`](content.json): 섹션 카피, 치수, 대체 텍스트와 자산 경로
- [`../supplier-facts.json`](../supplier-facts.json): 공급처 원문에서 정규화한 제품 사실과 공개 상태
- [`../market-voice-evidence.json`](../market-voice-evidence.json): 동종 제품 공개 후기에서 분리한 문제·주의 언어와 사용 범위
- [`claim-evidence-map.json`](claim-evidence-map.json): 공개 제품 claim 10개와 사실·섹션·자산의 연결
- [`publication-approval.json`](publication-approval.json): 현재 v3의 승인 범위와 제외 항목
- [`assets/manifest.json`](assets/manifest.json): 공급처 원본, ImageGen 파생 이미지와 HyperFrames GIF의 출처·해시·역할

사용자가 공급처 URL을 현재 버전의 기준 사실로 지정해 제품명·기능·구조·치수·재질·원산지·수입원은 공개 가능 상태다. 동종 후기는 문제 제기와 사용 주의에만 사용했다. 녹 방지·위생·내구·안전 성능·일정한 절삭 결과·세척 성능·시험·가격·옵션은 근거가 없어 사용하지 않았다.

제품 컷아웃은 공급처 원본을 참조한 교체 가능한 `supplier-reference-v1` 자산이다. 사용자 다각도 실사진이 들어오면 기존 HTML 구조와 카피를 유지하면서 실제 사진 기반 제품 시트와 누끼로 교체한다.

## 모션 원본

- 이중 커터 위치 설명: [`hyperframes/projects/dual-blade-motion`](../hyperframes/projects/dual-blade-motion)
- 오이 얇게 썰기 사용 흐름: [`hyperframes/projects/use-demo-motion`](../hyperframes/projects/use-demo-motion)
- 치수 구간 설명: [`hyperframes/projects/dimension-guide-motion`](../hyperframes/projects/dimension-guide-motion)
- 감자 눈 제거 돌기 접촉: [`hyperframes/projects/potato-eye-motion`](../hyperframes/projects/potato-eye-motion)

네 모션은 HyperFrames `check`에서 오류·경고 0을 통과한 4~4.2초·15fps 반복 GIF다. 30fps MP4는 QA용으로 각 프로젝트의 `renders/`에 보존한다. 사용 장면은 성능 증거가 아니라 이해를 돕는 연출로 명시했다.

## 최종 QA

[`qa/behance-rubric-report.md`](qa/behance-rubric-report.md)에 Behance 공통 문법, 320~800px 반응형, 접근성, 축소 모션, 편집 상태와 주장 근거 검수를 기록했다.

최종 판정은 **97/100, 하드 실패 0개**다.
