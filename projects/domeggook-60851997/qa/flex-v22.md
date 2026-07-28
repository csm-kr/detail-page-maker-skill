# 휘어짐 GIF v22 QA

- 사용자 제공 AFTER: `evidence/local-import-20260727/root/453fe96f-3cf5-4648-9dd7-f0d517c47f20.png`
- AFTER SHA-256: `dcdf3057a8f01683565bde021161d215ddf110624f26ef1a5a8ca0e391f35ffa`
- 실제 제품 SSOT: `asset/ssot/cutout/actual-bottom-single-v1.png`
- 보조 SSOT: `asset/ssot/authoritative/Flux2-Klein_00355_.png`
- ImageGen BEFORE: `hyperframes/projects/domeggook-60851997-motion/assets/flex-straight-source-v22.png`
- ImageGen MID: `hyperframes/projects/domeggook-60851997-motion/assets/flex-mid-source-v22.png`
- 최종 GIF: `asset/generated/approved/gif/flex-photo-sequence.gif`
- 최종 GIF SHA-256: `bc0db8f051d886aaa87cb0ae65e268b56a7bd164264482bc9d1ee63bc32b736a`
- 규격: 800×800, 4.8초, 72프레임, 15fps 저작, 무음, 무한 반복
- 용량: 12,723,627 bytes
- 컴포지션: `hyperframes/projects/domeggook-60851997-motion/compositions/flex-sequence-v22.html`
- 접촉판: `hyperframes/projects/domeggook-60851997-motion/snapshots/v22-flex-review/contact-sheet.png`

## 결과

- 실제 촬영 SSOT에서 파란 뒤꿈치 패드, `ZOOM SPORTS`, 흰 본체 `STORTS`, 벌집형 돌기와 통기공 배열을 동일성 기준으로 고정했다.
- ImageGen으로 같은 대각 구도·고명도 배경의 평평한 BEFORE와 50% 굽힘 MID를 생성했다.
- HyperFrames에서 BEFORE → MID → AFTER의 제품 이미지 자체가 연속 전환된다. 선·파동·입자는 변형의 방향과 굽힘 지점만 보조한다.
- 최종 곡선선은 제품 외곽을 따라가며 파란 패드와 물리 로고를 가리지 않는다.
- 마지막 구간에서 AFTER → MID → BEFORE로 복귀해 루프 이음이 자연스럽다.
- `hyperframes check --strict`: 런타임·레이아웃·모션·대비 오류 0, 경고 0.
- 최종 GIF/MP4: 800×800, 4.8초, 72프레임 확인 완료.

## ImageGen 지시 요약

- BEFORE: 사용자 AFTER의 배경·카메라·제품 크기를 유지하고 물리 변형만 평평하게 되돌린다.
- MID: BEFORE와 AFTER의 정확한 중간 곡률을 만든다.
- 변경 금지: 단일 제품, 파란 패드, `ZOOM SPORTS`, `STORTS`, 벌집형 구조, 통기공, 외곽 실루엣, 바닥면 방향.
