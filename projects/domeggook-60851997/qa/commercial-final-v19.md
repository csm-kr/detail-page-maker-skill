# 노바페이스 구조 모션 3종 상용 QA v19

검수일: 2026-07-27  
대상: `detail-page/index.html`, `detail-page/studio.html`

## 수정 결과

### 1. 휘어지는 만큼 유연하게

- ImageGen으로 파란 쿠션의 잘못된 생성 문자를 제거한 `flex-hand-v15-blank.png`를 제작했다.
- 실물 `evidence/local-import-20260727/root/image.png` 확대본을 기준으로 `ZOOM` 전용 글리프를 SVG path로 다시 만들었다.
- `Z`가 화면 오른쪽 위 뒤꿈치에서 시작하고 `M`이 왼쪽 아래 앞꿈치로 이어지며, `SPORTS`가 같은 방향의 둘째 줄에 놓인다.
- 제품 이미지, SVG 인쇄, 휨 곡선을 같은 `flex-product-scene` 그룹에 묶었다.
- 파란 곡선은 블루쿠션 인쇄를 가르지 않고 제품 왼쪽 외곽을 따라간다.

### 2. 입체 에어셀

- 블루쿠션이 없는 흰 PU 확대 소재 `air-cell-macro-v2.png`를 사용했다.
- 정육각형 반복 대신 사진에서 보이는 여섯 셀의 패인 홈을 각각 별도 SVG path로 추적했다.
- 렌즈·스캔·윤곽선은 제품 이미지와 같은 `air-cell-product-scene`에서 확대된다.
- 통풍·블루쿠션 효과는 이 GIF에 포함하지 않았다.

### 3. 3D 아치 컨투어

- 실제 윗면 구조를 반영한 `arch-support-keyvisual-v2.png`를 사용했다.
- 뒤꿈치 포켓과 눈에 보이는 측면 굴곡만 추적했다.
- 제품 밖의 큰 원형 펄스, 임의 상향 화살표, 평평한 중앙부를 가르는 장식선을 제거했다.

## 자동·육안 검수

- HyperFrames 0.7.73 `check --strict`
  - lint 오류 0 / 경고 0
  - runtime 오류 0 / 경고 0
  - layout 오류 0 / 경고 0
  - contrast 오류 0 / 경고 0
  - 증거: `qa/evidence/commercial-final-v19/hyperframes-check.json`
- 800×800 렌더 접촉판
  - `qa/evidence/commercial-final-v19/rendered/flex-contact.png`
  - `qa/evidence/commercial-final-v19/rendered/air-contact.png`
  - `qa/evidence/commercial-final-v19/rendered/arch-contact.png`
- 360×800 백그라운드 브라우저
  - 가로 overflow 0px
  - 세 GIF 모두 `800×800`, `complete=true`, `?v=19`
  - 1.2초 간격 A/B 캡처 해시가 세 장 모두 달라 실제 재생 확인
  - 증거 폴더: `qa/evidence/commercial-final-v19/browser-360/`
- Studio 회귀 테스트
  - 회귀 테스트 식별자: `novaface-edit-state.test.mjs`, `runtime-smoke.test.mjs`
  - 5개 통과 / 실패 0

## 최종 GIF

| GIF | 크기 | 프레임 | SHA-256 |
| --- | ---: | ---: | --- |
| `flex-photo-sequence.gif` | 14,477,979 bytes | 72 | `e9185146f2c769089ea730d8358d7821f4385bbcedb900bc7c9438f99ee69771` |
| `air-cell.gif` | 11,643,272 bytes | 72 | `df559c3eafb5f5c0ffed004371d723d62f50e35f38d286047dbe44dd35d6b1bf` |
| `arch-support.gif` | 10,519,445 bytes | 72 | `f149ca8ec96b2ccd051f032f10b5e404002a352074e2d700fa32c5eb23ca89c7` |

## 상용 점수

| 항목 | 점수 |
| --- | ---: |
| 첫 화면 제품·가치 인지 | 12 / 12 |
| 구매 서사와 문제 해결 | 14 / 14 |
| 제품 동일성과 주장 근거 | 19 / 20 |
| 이미지 아트디렉션 | 14 / 14 |
| 타이포·줄바꿈·가독성 | 12 / 12 |
| 섹션 리듬과 정보 밀도 | 9 / 10 |
| GIF 목적·프레임·가독성 | 10 / 10 |
| 편집성·반응형·접근성 | 8 / 8 |
| **합계** | **98 / 100** |

제품 동일성 1점은 생성 사진의 공장 인쇄를 그대로 승인하지 않고 전용 SVG path로 재구성한 관리 비용을 반영했다. 최종 GIF에서는 철자·글리프 방향·장축·행 순서가 고정되고 제품과 함께 변형된다.
