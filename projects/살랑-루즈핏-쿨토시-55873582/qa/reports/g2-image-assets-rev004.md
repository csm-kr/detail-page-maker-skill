# G2 이미지 소재 QA · rev004

- 제품명: 루즈핏 쿨토시
- 제조사: 살랑
- 생성기: 로컬 `god-tibo-gpt-image2-skill`
- 상태: G2 사용자 승인 완료 (2026-07-27T13:43:27.450Z)

## 사용자 피드백

> 음 x 자 에서 두개가 겹쳐서 나와서 리젝, 이거 여러개 만들어서 괜찮은거 찾아서 해줘

D08 v03은 `changes_requested`로 보존했다. 사용자 실사 한 쌍을 Image 1 제품 SSOT로 고정하고 8개 워커로 1024×1024 후보 8장을 병렬 생성했다.

## 하드 판정 기준

- 정확히 두 개의 토시
- 두 제품 사이가 위에서 아래까지 연속된 배경으로 분리
- 접촉·교차·겹침·X자·서로의 그림자 침범 없음
- 두 제품의 전체 외곽과 네 끝이 모두 노출
- 전체 길이·폭·상단 밴딩·긴 커프·엄지 구멍·라벨·재질 일치
- 정확한 1024×1024와 SHA-256 무결성

## 선택 결과

- 생성 후보: 8장
- 선택: `D08-C03` · `frame-002.png`
- 선택 버전: D08 v04
- 선택 이유: 연속 배경 간격, 상·하단 수평 정렬, 좌우 비례, 미러 커프·엄지 구멍·라벨 구조가 가장 안정적
- 차선: D08-C08 · 간격과 상단 안전 여백이 선택본보다 좁아 미선택
- 이전 D08 v03: X자 겹침으로 반려·비파괴 보존
- 본 제작 누적 생성: 61장
- 캐릭터 시트 후보 포함 누적 생성: 69장
- 전체 선택본 지정 W×H 및 SHA-256 통과: 40개

## 선택본 QA

| 검사 항목 | 판정 |
|---|---|
| 제품 수량 2개 | PASS |
| 제품 간 접촉·교차·겹침 없음 | PASS |
| 위에서 아래까지 연속 배경 간격 | PASS |
| 두 제품 전체 외곽 노출 | PASS |
| 좌우 길이·폭·밴딩·커프 일치 | PASS |
| 엄지 구멍과 라벨 미러 구조 | PASS |
| 실사 재질·드레이프 동일성 | PASS |
| 1024×1024 및 SHA-256 | PASS |

## 검토 증거

- 후보 8장: `qa/evidence/g2-image-assets/d08-rev004-candidates-8up.jpg`
- 실사·반려 v03·선택 v04: `qa/evidence/g2-image-assets/d08-rev004-rejected-selected.jpg`
- 전체 D그룹: `qa/evidence/g2-image-assets/contact-D-rev004.jpg`
- 선택 원본: `asset/generated/pending/image/production-rev004-feedback/correction-06-d08-nonoverlap-candidates/frame-002.png`
- 기계 원장: `qa/reports/g2-image-assets-rev004.json`
- 후보 판정 원장: `production/d08-nonoverlap-candidates-report.json`

## 승인 결과

- 사용자 확인: `승인`
- 승인 시각: `2026-07-27T13:43:27.450Z`
- 승인 범위: D08 v04를 포함한 현재 선택본 40개
- 다음 게이트: `G3 GIF_MOTION`

D08 v01~v03과 다른 반려본은 `changes_requested` 상태로 비파괴 보존한다. 승인된 40개만 다음 GIF 제작의 입력으로 사용할 수 있다.
