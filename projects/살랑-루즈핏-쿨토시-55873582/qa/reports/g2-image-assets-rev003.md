# G2 이미지 소재 QA · rev003

- 제품명: 루즈핏 쿨토시
- 제조사: 살랑
- 생성기: 로컬 `god-tibo-gpt-image2-skill`
- 상태: D08 동일 한 쌍 교정 QA 통과, G2 재승인 대기

## 사용자 피드백

> d08만 2개 같아야 하는데 이거 같게해줘.

D08 v02는 덮어쓰지 않고 `changes_requested`로 보존했다. 기존 1024×1024 교차 플랫레이를 Image 1로 고정하고, 사용자 실사 한 쌍을 보조 동일성 기준으로 사용해 D08 v03만 새로 생성했다.

## D08 v03 판정

| 검사 항목 | 판정 |
|---|---|
| 정확히 두 개의 토시 | PASS |
| 두 토시의 전체 길이·폭 일치 | PASS |
| 상단 밴딩 폭·주름 밀도 일치 | PASS |
| 긴 손등 커프 길이·폭 일치 | PASS |
| 엄지 구멍 구조 일치 | PASS |
| `HELLO / CUTE SLEEVE` 라벨 크기·상대 위치 일치 | PASS |
| 얇은 광택·미세 가로결·세로 드레이프 일치 | PASS |
| 1024×1024 크기 | PASS |

## 선택 결과

- 이전 버전: D08 v02 · `changes_requested` · 비파괴 보존
- 선택 버전: D08 v03 · `pending` · G2 사용자 재승인 대기
- 선택 경로: `asset/generated/pending/image/production-rev003-feedback/correction-05-d08/frame-000.png`
- SHA-256: `328029cf4a73cc94a898f3ac221413e6a935c828505e3b63dd6c9843c93a377b`
- 전체 선택 소재: 40개
- 본 제작 누적 생성: 53장
- 캐릭터 시트 후보 포함 누적 생성: 61장
- 지정 W×H 및 SHA-256 통과: 40개

## 검토 증거

- 실사·v02·v03 비교: `qa/evidence/g2-image-assets/d08-rev003-rejected-revised.jpg`
- 전체 D그룹: `qa/evidence/g2-image-assets/contact-D-rev003.jpg`
- 전체 선택본: `qa/evidence/g2-image-assets/contact-A-rev003.jpg`, `qa/evidence/g2-image-assets/contact-B-rev003.jpg`, `qa/evidence/g2-image-assets/contact-C-rev003.jpg`, `qa/evidence/g2-image-assets/contact-D-rev003.jpg`, `qa/evidence/g2-image-assets/contact-E-rev003.jpg`
- 기계 원장: `qa/reports/g2-image-assets-rev003.json`
- D08 교정 원장: `production/d08-matched-pair-correction-report.json`

## 승인 경계

내부 QA 통과는 사용자 승인을 대신하지 않는다. D08 v03은 `asset/generated/pending/image`에 보관했으며 사용자의 명시적 G2 재승인 전에는 다음 GIF·상세페이지 조립 단계로 넘기지 않는다.
