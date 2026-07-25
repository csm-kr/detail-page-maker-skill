# 노바페이스 발편한 기능성깔창 — commercial-final v8

- 판정일: 2026-07-25
- 공급처: `https://domeggook.com/60851997?from=lstGen`
- 배포 후보: `detail-page/index.html`
- 편집 화면: `detail-page/studio.html`
- 최종 판정: **98/100 · 상용 승인 · 하드 실패 0개**

## 타이트 루브릭

| 항목 | 배점 | 점수 | 판정 근거 |
|---|---:|---:|---|
| 제품 동일성 | 20 | 20 | 사용자 승격 SSOT와 상면·하면 면 지도를 적용했다. 에어홀·에어셀·블루쿠션을 구분하고 에어홀·블루쿠션·유연함 장면의 `ZOOM SPORTS`를 보존했다. |
| 주장·근거 | 12 | 12 | 고탄성 PU, 에어메시, 에어홀, 블루쿠션, 230–280mm, 좌우 한 세트를 공급처·SSOT 범위 안에서 사용했다. 블루쿠션에서 통풍 효과가 시작되는 오류를 제거했다. |
| 구매 서사·전환 | 14 | 13 | 가치 인지 → 질문 3개 → 구조·소재 → 에어홀 → 쿠션 → 유연성 → 사이즈 → 삽입 → 소구 메시지 → 구성·정보·FAQ 순서다. 실제 구매후기 표본을 가장하지 않고 소구형 메시지로 대체한 한계를 1점 감점했다. |
| 아트디렉션 | 14 | 13 | 코발트 블루·미드나이트 네이비·화이트, 세 가지 제품 거리, 사진·정보·모션의 리듬과 인접 모듈 차별화를 유지했다. 실제 착화 라이프스타일 원본이 제한적이어서 1점 감점했다. |
| 한글 타이포·카피 | 10 | 10 | 의미 단위 줄바꿈, 모바일 본문 크기, 사진 위 대비, 금지된 제작 메타 0건, 말풍선 본체·꼬리의 색상 이음선 0건을 확인했다. |
| GIF·모션 | 12 | 12 | 역할이 다른 GIF 8개, 시작·중간·마지막 프레임, 전후 상태, 실제 `.gif` 로딩을 확인했다. HyperFrames check에서 런타임·레이아웃·모션 오류 0, WCAG AA 35/35다. |
| 반응형·접근성 | 10 | 10 | 320·360·390·768·800px에서 horizontal overflow 0, 경계 밖 요소 0, 잘린 텍스트 0, 깨진 이미지 0이다. HTML validator 오류·경고 0이다. |
| 편집성·인계 | 8 | 8 | 실제 HTML 텍스트 95개, 안정된 이미지 ID, CSS 토큰, 로컬 저장·초기화·GIF 재생·이미지 적용·HTML 다운로드를 제공한다. Studio 편집 모드와 텍스트 변경·복원을 실제 브라우저에서 확인했다. |
| **합계** | **100** | **98** | **하드 실패 0개** |

## 브라우저·파일 증거

- 페이지 구조: 18 sections, H1 1개, 편집 텍스트 95개, 이미지 13개, GIF 8개
- 자산: broken 0, duplicate ID 0, duplicate image source 0
- 금지 문구: `사용자 제공`, `공급처 상세 원문 기준`, `ImageGen`, `실물 위치 그대로`, `특정 사용자의 실제 인용`, `공개 후기`, `원문과 표본` 공개 DOM 0건
- 말풍선: 본체 배경 `rgb(255,255,255)`, 꼬리 색 `rgb(255,255,255)`, 곡선 SVG 3개
- 문제 질문 3개와 대응 답변 3개
- 소구 메시지 3개:
  - 오래 서 있는 날에도 발바닥을 포근하게 받쳐줘요.
  - 에어홀로 신발 속 답답함을 덜어줘요.
  - 발길이에 맞춰 고르니 사이즈 선택이 쉬워요.
- 소구 메시지에는 별점·실명·구매 인증·가짜 출처를 사용하지 않았다.
- 반응형 Browser Harness 결과:
  - `320`: overflow 0, outside 0, textOutside 0, GIF 8, broken 0
  - `360`: overflow 0, outside 0, textOutside 0, GIF 8, broken 0
  - `390`: overflow 0, outside 0, textOutside 0, GIF 8, broken 0
  - `768`: overflow 0, outside 0, textOutside 0, GIF 8, broken 0
  - `800`: overflow 0, outside 0, textOutside 0, GIF 8, broken 0
- HyperFrames master: 800×800, 30fps, 38.4초, 1,152프레임, 14,738,428 bytes
- HyperFrames check: lint 0, runtime 0, layout 0/373 samples, motion 0, contrast 35/35
- GIF manifest: 800×800, 12fps, 각 4.83초·58프레임, 8개 SHA-256 기록

## 시각 확인

- 질문·말풍선 데스크톱: `.scratch/novaface-final-questions-800.png`
- 질문·말풍선 모바일: `.scratch/novaface-final-questions-360.png`
- 에어홀 흐름 데스크톱: `.scratch/novaface-final-airflow-800.png`
- 에어홀 흐름 모바일: `.scratch/novaface-final-airflow-360.png`
- 블루쿠션 인쇄 확대: `.scratch/novaface-final-heel-print-800.png`
- 유연성: `.scratch/novaface-final-flex-800.png`
- 소구 메시지 모바일: `.scratch/novaface-final-voice-360.png`
- GIF 8×3 접촉판: `.scratch/novaface-gif-qa-v8/contact.png`

## 하드 게이트

- [x] 블루쿠션에서 바람·통풍 입자가 시작하지 않는다.
- [x] 에어홀·블루쿠션·유연함 장면에 `ZOOM SPORTS`가 유지된다.
- [x] 말풍선 본체와 꼬리의 투명도·색 차이 이음선이 없다.
- [x] 상면과 하면의 구조가 섞이지 않는다.
- [x] 제작 과정·원본 보존·생성 모델 설명이 구매자 화면에 없다.
- [x] 후기처럼 읽히는 소구 메시지가 있으나 실제 후기 출처를 가장하지 않는다.
- [x] 모든 GIF가 HTML에서 실제로 재생된다.
- [x] HTML과 Studio가 수정 가능하고 원본 문구를 복원한다.
