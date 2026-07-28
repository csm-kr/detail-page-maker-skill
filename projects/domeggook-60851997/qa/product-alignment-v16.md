# 노바페이스 정렬·제품 동일성 QA v16

검수일: 2026-07-27

## 변경 범위

- Q3 말풍선: 데스크톱·모바일 모두 이전 위치에서 정확히 10px 위로 이동
- 발뒤꿈치 쿠션구조: HyperFrames 파동 중심을 실제 뒤꿈치 접지광에 맞춰 39px 아래로 보정
- 휘어지는 만큼 유연하게: 흰 PU `STORTS`를 화면 수평이 아닌 굽어진 제품 장축에 맞춘 `flex-hand-v13.png`로 교체
- 상세페이지와 Studio 캐시 버전: v16

## 제품 동일성 하드 게이트

| 항목 | 기준 | 결과 |
|---|---|---|
| 블루쿠션 문자 | `ZOOM SPORTS`, 두 줄, 부품 장축 정렬 | PASS |
| 흰 PU 양각 | `STORTS`, 제품 장축·굽힘 원근 정렬 | PASS |
| 제품 구조 | 흰 PU 에어셀·에어홀·뒤꿈치 블루쿠션 유지 | PASS |
| 접촉 이펙트 | 파동 중심과 실제 접지광 중심 일치 | PASS |
| 모션 회귀 | 기존 손 위치·휨·카피·곡선 유지 | PASS |

## 렌더·조립 검수

- HyperFrames 0.7.73 `check --strict --snapshots`: lint 0, runtime 0, layout 0, motion 0, contrast 33/33
- `cell-scan-v16.gif`: 800×800, 58프레임, 12fps, 무한 반복
- `flex-photo-sequence-v16.gif`: 800×800, 58프레임, 12fps, 무한 반복
- 상세페이지 `index.html`과 읽기 전용 수정본에서 두 GIF 모두 `?v=16` 참조
- Studio 미리보기와 새 창 링크 모두 `index.html?v=16` 참조

## 시각 증거

- `.scratch/qa/v16/cell-scan-v16-contact.jpg`
- `.scratch/qa/v16/flex-v16-contact.jpg`
- `hyperframes/projects/domeggook-60851997-motion/snapshots/frame-00-at-7.2s.png`
- `hyperframes/projects/domeggook-60851997-motion/snapshots/frame-01-at-16.8s.png`

최종 판정: **PASS**
