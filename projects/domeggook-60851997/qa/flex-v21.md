# 휘어짐 GIF v21 QA

- 원본: `evidence/local-import-20260727/root/a382db5b-3c15-4c29-a6b7-f25864105355.png`
- 원본 SHA-256: `53356c7e3e573485a5d31da4ada2d2163bdad3b52bfcb1ac16b46bb39260b773`
- 최종 GIF: `asset/generated/approved/gif/flex-photo-sequence.gif`
- 최종 SHA-256: `adc0623abf88eaba9ed1902ae99d8967a1cd319e05639f39849f998474e76213`
- 규격: 800×800, 4.8초, 72프레임, 15fps 작성, 무음, 무한 반복
- 용량: 14,796,956 bytes
- 컴포지션: `hyperframes/projects/domeggook-60851997-motion/compositions/flex-sequence-v21.html`
- 접촉판: `.scratch/flex-v21-final-qa/contact-sheet.png`
- 로고 확대: `.scratch/flex-v21-final-qa/logo-crop-3x.png`

## 결과

- 제품 사진은 단일 이미지 레이어로 유지했고 색·형상·인쇄·타공 픽셀을 재생성하지 않았다.
- 카메라 변환은 제품 이미지와 외곽 곡률선이 들어 있는 같은 `product-scene` 그룹에 적용했다.
- 전기 청색 곡률선은 제품 바깥 윤곽을 따라가며 블루쿠션과 흰 PU 인쇄를 가리지 않는다.
- 파동과 결정적 입자는 굴곡 지점의 그래픽 강조로만 사용했으며 통풍·치료·내구성·수치 효능을 암시하지 않는다.
- 첫 프레임과 마지막 프레임에서 제품·헤드라인·결과바가 함께 읽히고, 루프 복귀 시 흰 화면이나 제품 점프가 없다.
- 한글 설명은 의미 단위로 한 줄에 유지되며 고아 글자 줄바꿈이 없다.
- `npm run check -- --strict`: 오류 0, 경고 0.
