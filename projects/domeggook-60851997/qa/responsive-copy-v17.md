# 노바페이스 360px 문구 계층·정렬 QA v17

검수일: 2026-07-27

## 원인

구형 Studio 상태가 수정 문구를 페이지 전체 순번으로 저장했다. 개정 과정에서 문구 수가 달라지자 FAQ, 사이즈 예시, 사용 장면, 마감 카피가 다음 섹션으로 한 칸씩 밀렸다.

## 수정

- Studio 상태 스키마를 v3으로 변경
- 문구: `section ID + text layer ID`로 저장·복원
- 이미지: `asset ID` 또는 `section ID + image layer ID`로 저장·복원
- 구형 v2 상태에서는 문구 순번 배열을 이관하지 않음
- 사이즈 제목과 GIF의 모바일 좌우 기준선을 동일한 18px로 통일
- 사용 장면 카드의 번호와 신발명·상황 설명을 내부 그리드로 정렬
- 360px 공감 메시지는 한 열, 해시태그는 동일 폭 2열로 정렬
- 320px 해시태그는 한 열로 전환

## 문구 역할 검사

| 문구 | 올바른 위치 | 결과 |
|---|---|---|
| `발길이 255mm / 260 선택` | 사이즈 GIF와 FAQ | PASS |
| `군화 / 작업화 / 운동화 / 일상화` | 사용 장면 카드 | PASS |
| `에어홀로 신발 속 답답함을 덜어줘요.` | 선택 이유 카드 | PASS |
| `발길이에 맞춰 고르니 사이즈 선택이 쉬워요.` | 선택 이유 카드 | PASS |
| `에어홀은 어디에 있나요?` | FAQ | PASS |
| 에어홀 위치 답변 | FAQ 답변 | PASS |
| 마감 모션 헤더 | `발 아래 한 켤레의 작은 변화` | PASS |

## Browser Harness 반응형 검사

- 백그라운드 탭 사용, `document.hasFocus() === false`
- 320px: 문서·대상 섹션 `clientWidth === scrollWidth === 320`
- 360px: 문서·대상 섹션 `clientWidth === scrollWidth === 360`
- 390px: 문서·대상 섹션 `clientWidth === scrollWidth === 390`
- 360px 사이즈 헤더·GIF: `left 18px / right 342px / width 324px`
- 360px 사용 장면 4개: 제목·설명 모두 `left 87px / right 319px`
- 360px 해시태그: `152px + 152px`, 열 간격 8px
- 320px 해시태그: 한 열 272px
- 390px 해시태그: `167px + 167px`, 열 간격 8px

## 시각 증거

- `.scratch/qa/v17/360/size.png`
- `.scratch/qa/v17/360/use-cases.jpg`
- `.scratch/qa/v17/360/voice.jpg`
- `.scratch/qa/v17/360/faq.jpg`

## 자동 회귀

- Studio·도메인·노바페이스 문구 맵 테스트: 14/14 PASS
- Node 문법 검사: PASS
- 스킬 패키지 검사: PASS
- 공개 HTML em dash·en dash: 0건
- `git diff --check`: PASS

최종 판정: **PASS**
