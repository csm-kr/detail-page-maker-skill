# 노바페이스 commercial-final v9 QA

- 대상: 도매꾹 `60851997`
- 브랜드 / 제품명: 노바페이스 / 발편한 기능성깔창
- 판정일: 2026-07-25
- 결과: **97.5 / 100, 하드 실패 0개, 게시 승인**

## 상용 타이트 루브릭

| 영역 | 배점 | 점수 | 판정 근거 |
|---|---:|---:|---|
| 상품 사실·동일성 | 25 | 24.5 | 실제품·사용자 승격 SSOT, 윗면/아랫면 surface map, 에어홀·에어셀·블루쿠션 위치, 이미지 픽셀 안의 제품 인쇄를 장면별 확인 |
| 주장-근거 | 20 | 20 | 고탄성 PU·에어메시·에어홀·블루쿠션·230~280mm·구성만 공개, 의료·시험·절대 효능 없음 |
| 정보 서사·전환 | 15 | 15 | 제품 인지 → 질문 3개 → 소재·통풍·쿠션·유연함 → 사이즈 → 4종 사용 → 삽입 → 선택 이유 → 사실·FAQ → 마감 |
| 시각 체계·리듬 | 15 | 15 | 네이비·코발트·화이트 일관성, ImageGen 신규 12장, 4종 사용 상황 분리, 정적·GIF 중복 삽입 섹션 병합 |
| 편집성·반응형 | 10 | 10 | HTML 텍스트 90개, 교체 이미지 17개, Studio 수정 모드, 320·360·390·768·800px 무결성 |
| 접근성 | 10 | 9.5 | 한국어 문서·제목·alt·FAQ·대비 통과. GIF 인접 HTML 설명 제공. 자동 GIF 자체의 일괄 정지 컨트롤은 후속 개선 가능 |
| 성능·모션 | 5 | 3.5 | GIF 8개 모두 목적·실재생·프레임 변화 확인. 총 66.61MiB, 최대 11.91MiB라 게시 채널에 따라 WebM 또는 추가 압축이 필요할 수 있음 |

## 자동·브라우저 검증

- HTML validator: 오류 0
- JSON manifest 4개: 파싱 오류 0
- HyperFrames v9 strict: lint 0, runtime 0, layout 0, motion 0, contrast 35/35
- master: 800×800, 15fps, 38.4초, 14,527,915바이트
- GIF: 8개, 800×800, 12fps, 각 4.83초·58프레임
- 8×3 접촉판: 시작·중간·마지막 상태 24프레임 통과
- 브라우저 이미지: 17개, 깨진 이미지 0, 중복 src 0
- FAQ: 4/4 초기 open
- 공개 DOM 금지어 `상면 / 하면`: 0
- 제품 인쇄 텍스트 오버레이: 0
- 320·360·390·768·800px: 수평 overflow 0, 경계 밖 요소 0, 잘린 텍스트 0
- Studio: 수정 모드 켜기 성공, contenteditable 90개, 교체 이미지 17개

## 핵심 피드백 회귀

- 군화·작업화·운동화·일상화: 각각 독립 ImageGen 이미지 사용
- 통풍: 에어홀 구역만 강조, 블루쿠션에서 바람 시작 없음
- 블루쿠션·유연함·통풍: 별도 흰 로고 오버레이 제거
- 소재 비교: 분할선·커서 `+224px → -224px → 0px`, 좌우 끝 상태 홀드
- 사용법: 정적 사진과 GIF 중복 제거, `기존 깔창을 빼고, 뒤꿈치부터 쏙.` 한 섹션으로 통합
- 말풍선: 본체와 꼬리 같은 흰색, stroke 겹침으로 접합 헤어라인 제거

## 증거

- `hyperframes-contact-v9.png`
- `v9-desktop-material.png`
- `v9-desktop-airflow.png`
- `v9-desktop-usecases.png`
- `v9-desktop-insert.png`
- `v9-desktop-faq.png`
- `v9-desktop-finale.png`
- `v9-mobile-airflow.png`
- `v9-mobile-usecases.png`
- `v9-mobile-faq.png`
- `v9-mobile-finale.png`
- `v9-studio-edit-mode.png`
- Browser Harness recording: `C:\Users\csm81\.config\browser-harness\agent-workspace\recordings\novaface-60851997-v9-qa`
