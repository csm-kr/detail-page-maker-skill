# 07. 공개 언어·제품 동일성·모션·반응형 최종 QA

- Type: task
- Status: resolved
- Label: ready-for-agent
- Blocked by: 06
- Created: 2026-07-28

## 할 일

- Browser Harness로 320·360·390·768·800px 렌더를 검사한다.
- 고객 화면 금지어, 허구 후기, 임의 수치, 제작 메타데이터를 전역 검사한다.
- 모든 이미지·GIF의 God Tibo 파생 provenance와 제품 동일성을 검사한다.
- 착용 상단 꼬임, 제품 길이, 엄지홀, 라벨, 한 쌍 대칭을 검사한다.
- 각 소구 바로 다음에 전용 증거가 있는지 흐름을 검사한다.
- 모든 GIF의 첫·중간·마지막 프레임과 반복 경계를 검사한다.
- 배경 이미지 위 카피 대비·안전영역·제품 비가림을 검사한다.

## 수락 기준

- 깨진 이미지·GIF, 가로 넘침, 텍스트 잘림, 한글 대체문자가 0건이다.
- 고객 화면 금지어와 내부 제작 문구가 0건이다.
- 제품 동일성 하드 실패가 0건이다.
- 소구-증거 거리 감사가 모두 `immediate`다.
- 상용 QA 97점 이상이며 사용자 검토용 보고서가 생성된다.

## Answer

Browser Harness로 320·360·390·768·800px의 정확한 뷰포트를 검사했다. 모든
뷰포트에서 가로 넘침 0건, 깨진 미디어 0건, 한글 대체문자 0건, 내부 제작
금지어 0건을 확인했다. 세 가지 불편과 10개 GIF, 13개 섹션도 DOM에서
재검증했다.

최종 보고서는 `deliverables/rev021-commercial/qa/final-report.md`, 브라우저
측정값은 `deliverables/rev021-commercial/qa/browser-harness-report.json`,
파일 해시와 패키지 목록은 `deliverables/rev021-commercial/manifest.json`에
저장했다. 결과는 QA 통과이며 최종 사용자 시각 검토만 남았다.
