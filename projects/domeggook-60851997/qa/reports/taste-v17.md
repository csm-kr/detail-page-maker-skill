# 노바페이스 Taste pre-flight v17

검수일: 2026-07-27

## Design Read

기존 노바페이스 상용 상세페이지를 보존하는 모바일 중심 개정이다. 차가운 블루 브랜드 톤과 명확한 구매 정보 계층을 유지하고, 360px에서는 비대칭 장식보다 단일 열 정렬과 문장 역할 분리를 우선한다.

- `DESIGN_VARIANCE: 6`
- `MOTION_INTENSITY: 6`
- `VISUAL_DENSITY: 4`
- 디자인 시스템: 기존 단일 HTML과 CSS 토큰 유지
- 개정 모드: redesign-preserve

## 이번 개정

- 사이즈 섹션 제목과 GIF의 모바일 왼쪽 기준선을 일치시켰다.
- 사용 장면 카드의 번호, 신발명, 설명을 2열 내부 그리드로 고정했다.
- 공감 메시지 3개와 해시태그 6개의 역할을 분리하고, 360px 해시태그를 2열 정렬했다.
- 에어홀 위치 설명은 FAQ 안에만 유지했다.
- `255mm → 260`은 사이즈 GIF와 FAQ의 실사용 선택 예시에만 유지했다.
- Studio 문구 저장을 전체 순번에서 `section-id + text-id` 방식으로 변경했다.
- 이미지 교체 상태도 `asset-id` 또는 `section-id + image-id`에만 적용한다.
- 기존 v2 순번형 문구 상태는 이미지·섹션 설정만 이관하고, 위치가 밀릴 수 있는 문구 배열은 폐기한다.

## 최종 pre-flight

| 항목 | 결과 | 증거 |
|---|---|---|
| Brief inference와 다이얼 명시 | pass | 본 문서 |
| 기존 정보 구조 보존 | pass | 섹션 ID와 순서 유지 |
| 모바일 단일 열 복귀 | pass | 520px 이하 CSS |
| 카피 역할 분리 | pass | size, use-cases, customer-voice, faq DOM 감사 |
| 문구 저장 안정 ID | pass | Studio state schema v3 |
| 색상·모서리 시스템 유지 | pass | 기존 CSS 토큰과 radius 유지 |
| 버튼·폼 대비 | not-applicable | 해당 개정에 CTA 입력 UI 없음 |
| 모션 목적 유지 | pass | 기존 승인 GIF 변경 없음 |
| em dash·en dash 0건 | pass | 공개 HTML 검색 |
| 320·360·390px overflow | pass | Browser Harness에서 각 폭의 clientWidth와 scrollWidth 일치 |

최종 판정: **PASS**
