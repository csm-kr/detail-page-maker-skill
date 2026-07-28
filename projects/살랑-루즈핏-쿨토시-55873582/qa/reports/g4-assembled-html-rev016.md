# G4 조립 HTML QA 보고서

- 상태: **PASS, 사용자 G4 검토 대기**
- 점수: **98/100**
- 제품: 살랑 루즈핏 쿨토시
- 판매처: 쿠팡
- 검토본: `html/index.html`
- 자산 잠금: `assembly/assets-lock-rev016.json`

## 조립 결과

- 구매 여정 섹션: 12개
- 승인 이미지: 40개
- 승인 GIF: 10개
- 공개 자산 합계: 50개
- 중복 자산: 0개
- 깨진 자산: 0개
- pending/rejected 경로: 0개
- 구매자 화면 제작 메타데이터 노출: 0개
- alt 누락: 0개

## 반응형 검사

| CSS 뷰포트 | 로드 자산 | 깨진 자산 | 가로 넘침 | 외부 이탈 텍스트 | 최소 구매자 글자 |
|---:|---:|---:|:---:|---:|---:|
| 320px | 50 | 0 | 없음 | 0 | 14px |
| 360px | 50 | 0 | 없음 | 0 | 14px |
| 390px | 50 | 0 | 없음 | 0 | 14px |
| 768px | 50 | 0 | 없음 | 0 | 17px |
| 800px | 50 | 0 | 없음 | 0 | 17px |

## 확인 사항

- 003, 005, 009는 사용자 피드백 반영 v02를 사용했습니다.
- 모든 공개 이미지와 GIF는 `asset/generated/approved` 아래 승인본입니다.
- HTML, CSS, 편집 런타임과 사용 자산 50개의 SHA-256을 자산 잠금 파일에 기록했습니다.
- 320, 360, 390, 768, 800px CSS 뷰포트에서 가로 넘침과 깨진 자산이 없었습니다.
- 캡처 증빙은 시간 의존 GIF 프레임을 정지해 레이아웃을 확인했으며 실제 HTML에는 승인 GIF 10개가 재생됩니다.

## 증빙

- `qa/evidence/g4-assembled-html/rev016/viewport-320-top.png`
- `qa/evidence/g4-assembled-html/rev016/viewport-390-contact.png`
- `qa/evidence/g4-assembled-html/rev016/viewport-390-construction.png`
- `qa/evidence/g4-assembled-html/rev016/viewport-390-finale.png`

## 다음 게이트

현재 결과는 G4 조립본입니다. 사용자 승인 뒤에만 G5 게시 패키징과 최종 공개 QA를 진행합니다.
