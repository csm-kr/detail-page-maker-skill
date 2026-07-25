# 노바페이스 commercial-final v11 QA

- 대상: 도매꾹 `60851997`
- 브랜드 / 제품명: 노바페이스 / 발편한 기능성깔창
- 판정일: 2026-07-26
- 결과: **98 / 100, 하드 실패 0개, 게시 승인**

## 상용 타이트 루브릭

| 영역 | 배점 | 점수 | 판정 근거 |
|---|---:|---:|---|
| 제품 사실·동일성 | 25 | 25 | 사용자 실제품 SSOT와 대조했다. 블루쿠션 `ZOOM SPORTS`, 흰 PU 양각 `SPORTS`, 윗면·아랫면 부품, 좌우 아치와 장축을 장면별로 확인했다. |
| 주장-근거 | 20 | 20 | 에어메시·에어홀·에어셀·블루쿠션·PU·230~280mm·좌우 한 세트만 말한다. 치료·교정·시험 수치·과장 효능은 없다. |
| 정보 서사·전환 | 15 | 15 | 문제 질문→윗면/아랫면→쿠션·통풍·유연성→사이즈→사용 상황→삽입→구성→FAQ→보행 마감으로 구매 질문을 순서대로 닫는다. |
| 시각 체계·리듬 | 15 | 15 | 네이비·코발트·화이트 체계, 세 제품 거리, ImageGen 상용 소재, 역할이 다른 HyperFrames GIF 9개, 맥락 카드 인셋 제거로 초점을 정리했다. |
| 편집성·반응형 | 10 | 10 | 18개 독립 섹션, 실제 HTML 텍스트 96개, 교체 이미지 19개, CSS 토큰, Studio 저장·내보내기 구조를 유지했다. |
| 접근성·가독성 | 10 | 10 | HTML과 GIF 폰트 계열·굵기를 맞추고 두 줄 제목 겹침을 제거했다. HyperFrames 대비 34/34, FAQ 4/4 open, alt와 한글 줄바꿈을 확인했다. |
| 성능·모션 | 5 | 3 | 9개 GIF가 모두 역할·상태 변화·루프를 갖는다. 총 81,064,471바이트라 채널별 WebM/지연 로딩 최적화 여지는 남는다. |

## 사용자 지적별 회귀 판정

- 3·4번째 장 흰 PU 각인: `STORTS` 0, 정확한 `SPORTS` 2/2.
- 블루쿠션 인쇄: `ZOOM SPORTS` 철자와 두 줄 순서 유지, 부품·제품 장축 정렬.
- 굽힘 장면: `ZZOM/ZZOOM` 0, 아래로 볼록한 U자 곡선.
- 255mm→260 화살표: 320·360·390px에서 좌우 6px/6px, 767·800px에서 14px/14px.
- 사이즈 GIF: 260 커서가 카드 내부에 도착해 눌리고, 하단 결과바는 첫 프레임부터 유지.
- 사용 상황: 군화·작업화·운동화·일상화 카드의 작은 제품 인셋 0.
- GIF 타이포: HTML과 같은 `Detail Sans` 계열, 제목 900~950, 라벨 700 이상, 두 줄 글리프 겹침 0.
- 공개 참조 회귀 검색: `STORTS`, `ZZOM`, `ZZOOM`, 구버전 네 소재, `.use-product` 0.

## 자동·브라우저 검증

- HTML validator: 오류·경고 0.
- JSON: asset manifest, GIF manifest, 제품 identity, content 4개 파싱 오류 0.
- HyperFrames 0.7.71 strict:
  - lint 0
  - runtime 0
  - layout 0
  - warning 0
  - contrast 34/34
- master v11:
  - 800×800, H.264, 15fps, 648프레임, 43.2초
  - 15,457,494바이트
  - SHA-256 `095ad84e4f13ecc3b11fcd776219ea6655da6fb3eee971ffcca967288d636638`
- GIF:
  - 9개, 각 800×800, 58프레임, 약 4.83초, 무음·무한 반복
  - 합계 81,064,471바이트
- Browser Harness 실제 CSS 폭:
  - 320·360·390·767·800px에서 가로 경계 밖 요소 0, 잘린 편집 텍스트 0, 깨진 이미지 0
  - 이미지 19, GIF 9, duplicate ID 0, duplicate image source 0
  - FAQ 4/4 open, `.use-product` 0
  - stylesheet `styles.css?v=6`, GIF 9개 `?v=13`

## 시각 증거

- HyperFrames 9장 접촉판: `v11-hyperframes-contact.png`
- 게시 GIF 9장 접촉판: `v11-gif-contact.png`
- 사이즈 화살표 확대: `v11-size-arrow.png`
- 페이지 캡처:
  - `v11-desktop-heel.png`
  - `v11-desktop-flex.png`
  - `v11-desktop-size.png`
  - `v11-desktop-usecases.png`
  - `v11-desktop-finale.png`
  - `v11-mobile-size.png`
  - `v11-mobile-usecases.png`
  - `v11-mobile-finale.png`
- Browser Harness 기록:
  - `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\novaface-v11-page-qa`
  - `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\novaface-v11-cache-final`
- ImageGen 프롬프트·출력 경로: `../research/imagegen-v11-correction-prompts.md`

## 최종 결론

제품 문자·장축·굽힘 방향·사이즈 화살표·사용 카드 초점·모션 타이포를 다시 잠갔다. 현재 공개 HTML은 **98/100, 하드 실패 0개**이며 바로 검토 가능한 상용 후보로 승인한다.
