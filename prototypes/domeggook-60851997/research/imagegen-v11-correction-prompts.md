# 노바페이스 v11 ImageGen 교정 프롬프트

- 실행 모드: built-in `image_gen`
- 분류: `precise-object-edit`
- 제품 기준: `assets/product-ssot/source/real-product-raw/normalized-ref/photo-2026-07-19-9774f18f-ref.png`
- 공통 불변 조건: 깔창 실루엣, 길이·폭, 흰 PU 에어셀, 에어홀 수와 위치, 블루쿠션 위치·크기, 조명, 카메라, 배경을 유지한다.
- 공통 금지: `STORTS`, `ZZOM`, `ZZOOM`, 화면 위에 떠 있는 별도 타이포, 임의 로고, 새 구멍·부품.

## 1. 아랫면 한 쌍 양각 교정

- 편집 대상: `assets/commercial/surface-bottom-studio-v3.png`
- 최종 파일: `assets/commercial/surface-bottom-studio-v4.png`
- 선택 결과 원본: `C:\Users\csm81\.codex\generated_images\019f9327-ee9f-7201-83d8-9bba5749362d\call_WLkybiZ7wjcDPRBM5VnWDckl.png`

```text
Use case: precise-object-edit.
Edit only the raised word molded into the white PU body of both insoles.
Replace the incorrect word with the exact uppercase text "SPORTS" on both products, letter by letter S-P-O-R-T-S.
Keep the molded/embossed material appearance and align each word with the long axis of its insole.
Preserve the exact pair geometry, mirrored left/right arches, holes, air cells, blue heel cushions, their existing "ZOOM SPORTS" print, camera, lighting and background.
Do not write STORTS, ZZOM or ZZOOM. Do not add floating overlay text.
```

## 2. 히어로 아랫면 한 쌍 양각 교정

- 편집 대상: `assets/commercial/hero-underside-pair-v2.png`
- 최종 파일: `assets/commercial/hero-underside-pair-v3.png`
- 선택 결과 원본: `C:\Users\csm81\.codex\generated_images\019f9327-ee9f-7201-83d8-9bba5749362d\call_rPUc3u2egiLujEoQKTvEAuZT.png`

```text
Use case: precise-object-edit.
On both white PU insole bodies, change only the raised molded word to exact uppercase "SPORTS", S-P-O-R-T-S.
Keep the original dark commercial hero composition, product scale, perspective, left/right pair, air holes, air cells and blue cushions unchanged.
Preserve the blue cushion print as exact "ZOOM SPORTS" and follow each product's long axis.
No STORTS, ZZOM, ZZOOM, extra lettering or floating text.
```

## 3. 블루쿠션 장축 인쇄 교정

- 편집 대상: `assets/commercial/heel-macro-v4.png`
- 최종 파일: `assets/commercial/heel-macro-v5.png`
- 선택 결과 원본: `C:\Users\csm81\.codex\generated_images\019f9327-ee9f-7201-83d8-9bba5749362d\call_55j1vuDtQJyUHedOfUo6bhRs.png`

```text
Use case: precise-object-edit.
Edit only the factory print inside the blue heel cushion.
Render exact two-line text: first line "ZOOM", second line "SPORTS".
Center the two-line block inside the cushion and rotate its baseline to follow the blue oval and insole long axis from lower-left toward upper-right.
Preserve the cushion shape, surrounding white PU air cells, nearby holes, crop, lighting and navy background.
No crooked screen-horizontal label, no STORTS, ZZOM, ZZOOM and no separate overlay.
```

## 4. 굽힘 장면 인쇄 교정

- 편집 대상: `assets/commercial/flex-hand-v7.png`
- 최종 파일: `assets/commercial/flex-hand-v8.png`
- 선택 결과 원본: `C:\Users\csm81\.codex\generated_images\019f9327-ee9f-7201-83d8-9bba5749362d\call_9D1zFm3JLBxJal0QVbZHnqfr.png`

```text
Use case: precise-object-edit.
Edit only the dark factory print embedded in the blue heel cushion.
The upper word must read exact "ZOOM", Z-O-O-M, and the lower word exact "SPORTS", S-P-O-R-T-S.
Align both lines with the cushion and bent insole long axis.
Preserve the hand, bend amount, underside geometry, white PU air cells, holes, cushion position, camera and soft commercial background.
Do not write ZZOM, ZZOOM or STORTS. Do not add HTML-like or floating text.
```

## 승인 결과

- `surface-bottom-studio-v4.png`: 흰 PU 양각 `SPORTS` 2/2
- `hero-underside-pair-v3.png`: 흰 PU 양각 `SPORTS` 2/2
- `heel-macro-v5.png`: 블루쿠션 `ZOOM / SPORTS`, 제품 장축 정렬
- `flex-hand-v8.png`: 블루쿠션 `ZOOM / SPORTS`, 굽힘 제품 장축 정렬
- 네 최종 파일은 프로젝트 안에 복사했고 공개 HTML 또는 HyperFrames에서 직접 참조한다.
