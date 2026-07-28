# G3 GIF Motion — Rendered Rev 002

## 결과

- 상태: `PASS_RENDERED_PENDING_USER_APPROVAL`
- 방식: `hybrid`
- 엔진: HyperFrames 0.7.76
- 규격: 800×800, 30fps, 3.2초, 96프레임
- 오디오: 없음
- GIF 반복: `NETSCAPE2.0`, loop count 0 — 무한 반복

## 렌더 산출물

- GIF: `asset/generated/pending/gif/gif-001-thumbhole-direction-hybrid-v01.gif`
  - 21,070,456바이트
  - SHA-256 `1bf5be35e5c0c73fb531750051b3e5415bc3c23efb35c9a5cc7450a87a7db8aa`
- QA MP4: `hyperframes/renders/gif-001-thumbhole-direction-hybrid-v01.mp4`
  - 1,303,027바이트
  - SHA-256 `6cecc938938f2c74621b676e18ebcae6c0d0273a45a38309c3d6ca295c0263c0`

## 실제 렌더 QA

- 홀드 프레임 0·41·71·95와 전환 프레임 26·56·84를 실제 GIF에서 추출해 확인했다.
- 엄지홀, 손등 커프, 손바닥 개방 구조와 정상 손가락을 유지한다.
- 손 해부학 morph와 교차용해 이중 노출이 없다.
- 냉감·UV 차단·통풍·신축 복원·흘러내림 방지 성능을 암시하지 않는다.
- 첫 프레임과 마지막 프레임의 추출 PNG SHA-256이
  `71a0c25f5e4a25b31af8512f069d42e8519d797f0302df1d47c1adceb9509dd2`로
  바이트 단위까지 동일하다.

## 검토 자료

- `qa/evidence/g3-gif-motion/rev001/rendered-v01/rendered-contact-start-worn-palm-loop-v01.png`
- `qa/evidence/g3-gif-motion/rev001/rendered-v01/rendered-transition-01.png`
- `qa/evidence/g3-gif-motion/rev001/rendered-v01/rendered-transition-02.png`
- `qa/evidence/g3-gif-motion/rev001/rendered-v01/rendered-transition-03.png`

현재 GIF는 30fps 고품질 마스터다. 쿠팡 조립 단계에서 파일 용량 제한이 확인되면
이 원본을 보존하고 별도 최적화 파생본을 만든다.

## 다음 결정

사용자가 렌더 결과를 승인하면 manifest와 해시를 유지한 채
`asset/generated/approved/gif`로 이동하고 G3를 승인 완료한다. 수정 요청이면 이
v01을 반려 경로에 보존하고 v02를 새로 만든다.
