# G0·G1·모델 승인판 QA

- 검사일: 2026-07-27
- 대상: `planning/approval-review.html`
- 도구: Browser Harness background target
- 포커스 안전: 통과 (`document.hasFocus() === false`)
- 이미지: 13장 로드, 깨진 이미지 0장
- 데스크톱: viewport 1091×818, document width 1077
- 모바일: viewport 390×844, document width 390, horizontal overflow 없음
- 데스크톱 증거: `qa/evidence/approval-review-rev003/desktop-1200-top.png`
- 모바일 증거: `qa/evidence/approval-review-rev003/mobile-390-top.png`
- 녹화: `qa/evidence/approval-review-rev003/recording`

## 시각 판정

- 첫 모바일 검사에서 마스트헤드 장식 원이 제품명 두 번째 줄 위에 겹치는 문제를 발견했다.
- 마스트헤드 콘텐츠의 z-index를 장식보다 높여 수정했다.
- 재검사에서 제품명 두 줄, 상태 배지, G0 설명이 모두 잘리지 않고 읽힌다.
- 데스크톱과 390px 모바일에서 페이지 전체 가로 넘침이 없다.
- 8개 사용자 원본, 4개 공급처 크롭, 원본 접촉시트가 모두 정상 로드된다.

## 내용 판정

- 제품명 `루즈핏 쿨토시`, 제조사 `살랑`, 제품 SSOT, G0 잠금 문장이 일치한다.
- 20대 여성 모델 캐릭터 시트 후보 8장 → G2A 한 장 승인 → 본 제작 40장의 의존성이 명시돼 있다.
- W×H는 세로·가로 비교·정사각 매크로·배경·긴 히어로·GIF 역할별로 분리돼 있다.
- 엄지홀 착용 방향 GIF와 금지 성능 주장이 분리돼 있다.

## 결과

`PASS`
