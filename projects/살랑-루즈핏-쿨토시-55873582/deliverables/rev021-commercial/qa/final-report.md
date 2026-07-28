# 살랑 루즈핏 쿨토시 rev021 최종 QA

결과: `QA PASS · GIF-016~021 USER REVIEW PENDING`

## 산출물

- 진입점: `index.html`
- 고객용 이미지: 16개
- 고객용 GIF: 11개
- HTML에서 읽히는 전체 이미지 요소: 24개
- 승인 이미지 소재 풀: 40개 이상
- 세 가지 불편 카드: 정확히 3개
- 페이지 직접 참조: `media/` 안의 파일만 사용

## 브라우저

Browser Harness 백그라운드 탭으로 320·360·390·768·800px을 검사했다.

- 깨진 이미지·GIF: 0
- 가로 넘침: 0
- 한글 대체문자: 0
- 고객 화면 금지어: 0
- 외부·작업 폴더 미디어 참조: 0
- 사용자 탭 포커스 이동: 0
- 쿨링 그래프·막대·꺾은선: 0
- 규격표 바로 위 47cm 위치 GIF: 1

수치 원장: `browser-harness-report.json`

시각 캡처:

- `viewport-390-top.png`
- `viewport-390-mid.png`
- `viewport-390-bottom.png`
- `viewport-800-top.png`
- `viewport-800-mid.png`
- `viewport-800-bottom.png`

## 흐름

```text
히어로
→ 서로 다른 불편 3개
→ 제품의 답
→ 루즈핏 + 즉시 GIF
→ 손등 커버 + 즉시 GIF
→ 쿨 소재 + 즉시 GIF
→ 스타일 + 즉시 GIF
→ 착용법
→ 고객 질문과 해결 요약
→ 상품 구성
→ 47cm 위치 GIF
→ 사이즈·상세 스펙
→ 실제 길이가 보이는 피날레
```

- 후기 원문이 없으므로 별점·구매 인증·작성자·체험담을 만들지 않았다.
- 제조사 제공 쿨 소재 사실은 고객 언어로만 표현했다.
- 근거 없는 온도·비율·시간·시험 수치는 없다.
- 쿨링은 그래프가 아니라 열감 오버레이 제거·쿨 스윕·공기 흐름·서리 입자로
  표현했다.
- 모든 활성 GIF에 해당 주장과 직접 연결된 주 FX가 1개 이상 있다.
- 외부 카피와 GIF 내부 문구의 완전 문장 중복은 없다.
- 제작 도구·검수 방식·내부 근거 문구는 고객 DOM에 없다.
- 모바일 피날레는 세로 이미지를 통째로 보여 상완부터 손등까지 길이가 보인다.

## Studio 연결

- 최종 진입점을 로컬에서 열면 `Studio에서 편집` 버튼이 나타난다.
- 실제 클릭 후 `http://127.0.0.1:8898/studio.html` 이동을 확인했다.
- Studio 편집본은 `html/index.html`, 사용자 전달본은 현재 `deliverables`
  패키지에 분리한다.
- 외부 고객 호스트에서는 Studio 버튼을 생성하지 않는다.
- Studio rev021 섹션 13개, 미디어 24개, 편집 문구 78개를 확인했다.
- 깨진 Studio 미디어: 0
- 모든 의미 있는 가시 요소 선택, 1px 위치 이동, Gmarket Sans, 글자색, 텍스트
  비우기와 실행 취소 복원을 실제 브라우저에서 확인했다.
- 상세 기록: `studio-link-report.json`, `studio-controls-report.json`

## 승인 상태

신규 GIF-016~021은 HyperFrames strict 검사와 브라우저 조립 검사를 통과했지만,
사용자 일괄 검토 전이므로
`asset/generated/pending/gif/rev022-commercial-fx-v01/`에 유지한다. 사용자가
승인하기 전 `approved`로 이동하거나 쿠팡 게시 완료로 표시하지 않는다.
