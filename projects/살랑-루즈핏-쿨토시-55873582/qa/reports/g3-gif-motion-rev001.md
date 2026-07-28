# G3 GIF Motion — Rev 001

## 결과

- 상태: `PASS_PRE_RENDER`
- 방식: `hybrid` — G2 승인 이미지 3장 + HyperFrames 결정적 모션
- 규격: 800×800, 30fps, 3.2초
- 패턴: `MOTION-PROCEDURE`
- 렌더 상태: 사용자 미리보기·렌더 선택 전이므로 아직 MP4·GIF를 만들지 않음

## 주장과 근거

- `claim_id`: `CLAIM-HAND-COVER`
- `component_id`: `COMPONENT-THUMB-HOLE-CUFF`
- `fact_id`: `FACT-REAL-THUMB-HOLE`
- `section_id`: `reason-hand-cover`
- 단일 주장: 엄지홀을 기준으로 손등 커버와 손바닥 방향을 구분할 수 있다.

소스는 G2 승인된 A05 v01, E08 v03, B06 v02만 사용했다. 세 사진의 엄지홀을
공통 화면 앵커로 맞췄고, 손 모양을 보간하거나 형태를 변형하지 않았다.

## 모션

1. A05 손등·엄지홀 포스터 상태
2. 오른쪽에서 왼쪽으로 이동하는 단일 경계 마스크로 E08 착용 길이 공개
3. 같은 방향의 마스크로 B06 손바닥 면 공개
4. A05의 시작 좌표·스케일로 복귀한 뒤 짧게 홀드

교차용해에서 보였던 손 이중 노출은 제거했다. 전환은 이미지 픽셀을 변형하지 않고
마스크, 위치, 스케일과 불투명도만 사용한다.

## 자동 검사

- `HyperFrames 0.7.76 check --strict`: PASS
- lint: 오류 0, 경고 0
- runtime: 오류 0, 경고 0
- layout: 오류 0, 경고 0
- motion: 오류 0, 경고 0
- contrast: 오류 0, 경고 0
- 전체 검사 시점 23개, 전환 검사 시점 22개
- 시작 프레임과 루프 종료 프레임 SHA-256:
  `932d3fafd7ce8f05d683cc8ca59e7bf34e2aa53bc343f7c92852d58df51a9485`
  로 바이트 단위까지 동일

## 수동 검사

- 시작·착용 길이·손바닥·복귀 프레임에서 엄지홀과 커프가 보임
- 승인 소스별 손가락 수와 제품 구조 유지
- 해부학적 morph, 이중 노출, 생성 텍스트 없음
- 냉감·UV 차단·통풍·신축 복원·흘러내림 방지 암시 없음

## 증거

- `qa/evidence/g3-gif-motion/rev001/contact-start-worn-palm-loop-rev001.png`
- `qa/evidence/g3-gif-motion/rev001/frame-start-0.000.png`
- `qa/evidence/g3-gif-motion/rev001/frame-worn-1.380.png`
- `qa/evidence/g3-gif-motion/rev001/frame-palm-2.380.png`
- `qa/evidence/g3-gif-motion/rev001/frame-loop-3.166.png`
- `qa/evidence/g3-gif-motion/rev001/thumbhole-loop-strip.png`

## 다음 결정

HyperFrames 컴포지션 미리보기를 먼저 열거나, 사용자의 렌더 승인 뒤 QA용 MP4와
게시용 무음 무한 반복 GIF를 `asset/generated/pending/gif`에 만든다.
