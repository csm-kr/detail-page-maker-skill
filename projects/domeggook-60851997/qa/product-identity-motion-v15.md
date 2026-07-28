# 노바페이스 제품 동일성·모션 회귀 QA v15

- 검사일: 2026-07-26
- 범위: 흰 PU 양각, 블루쿠션 인쇄, 유연함 손 디테일, 에어홀·에어셀·뒤집기·소재 비교·한 세트 GIF
- 결과: PASS
- 회귀 점수: 100 / 100

| 항목 | 배점 | 점수 | 근거 |
|---|---:|---:|---|
| 제품 문자 동일성 | 30 | 30 | 블루쿠션은 `ZOOM / SPORTS`, 흰 PU는 실제품 그대로 `STORTS`로 부품별 분리 |
| 제품 구조 동일성 | 20 | 20 | 블루쿠션 위치, 에어셀, 에어홀, 아랫면 실루엣과 장축 유지 |
| 유연함 모션 회귀 | 20 | 20 | 승인된 기존 GIF 피크 프레임을 구도 SSOT로 사용하고 HyperFrames 타임라인·곡선·카피를 유지 |
| 효과 사실성 | 10 | 10 | 통풍 효과는 에어홀에서만 시작하고 블루쿠션은 고체 부품으로 유지 |
| 손·표면 품질 | 10 | 10 | 손의 거친 노이즈와 제품의 자글거리는 미세 질감을 제거 |
| 렌더 기술 규격 | 10 | 10 | 800×800, 58프레임, 4.83초, 무한 반복, HyperFrames 검사 오류·경고 0 |

## 통과 자산

- `hero-underside-pair-v4.png`
- `surface-bottom-studio-v5.png`
- `ventilation-airflow-v7.png`
- `cushion-impact-v5.png`
- `flex-hand-v12.png`
- `top-bottom-reveal.gif`
- `material-cross-section.gif`
- `perforation-path.gif`
- `cell-scan.gif`
- `flex-photo-sequence.gif`
- `one-pair-contents.gif`

## 시각 증거

- `hyperframes/projects/domeggook-60851997-motion/snapshots/v15-product-identity-contact.png`
- 유연함 중간 프레임에서 기존 아래로 휘는 곡선, 손 접점, 제품 위치를 확인했다.
- 에어홀·에어셀 중간 프레임에서 흰 PU `STORTS`와 블루쿠션 `ZOOM / SPORTS`를 동시에 확대 확인했다.
- 뒤집기·소재 비교·한 세트 장면에서 교정된 아랫면 소스가 첫·중간·마지막 프레임에 유지된다.

## 하드 실패 감사

- 흰 PU의 `SPORTS`·`SIORTS`: 0
- 블루쿠션의 `ZZOM`·`ZZOOM`·`SIORTS`: 0
- 제품 인쇄용 HTML·SVG·HyperFrames 오버레이: 0
- 블루쿠션에서 시작하는 통풍 효과: 0
- 공개 HTML과 Studio의 구버전 자산 참조: 0
