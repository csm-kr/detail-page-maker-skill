# 루즈핏 쿨토시 — G0 SOURCE_SSOT 승인 기록

## 상태

- `preparation_status`: approved
- `decision`: approved
- `user_confirmation`: 2026-07-27 이후 사용자 명시 승인
- `generation_blocked`: no
- `revision_reason`: 사용자가 `inputs`에 고해상도 실물 원본 8장을 추가해 기존 G0 후보를 교체함
- `canonical_manifest`: `assets/product-ssot/manifest.json`

## 제안 SSOT

### 1순위 — 사용자가 추가한 동일 SKU 고해상도 실물 원본 8장

프로젝트 보존 위치:

- 정식 SSOT: `assets/product-ssot/source/user-real-original/`
- 입력 보존본: `asset/input/user-real-original/`
- 검토용 접촉시트: `qa/evidence/g0-input-review/originals-contact.jpg`

원본별 역할:

1. `photo-2026-07-05-411f8795.jpg` — 단품 정면, 전체 길이, 라벨 위치
2. `photo-2026-07-05-d63f66f5.jpg` — 단품 뒷면, 엄지홀 절개, 봉제 방향
3. `photo-2026-07-14-005edfc9.jpg` — 단품 정면 반복 확인
4. `photo-2026-07-14-0bd7c853.jpg` — 실제 착용 길이, 루즈한 드레이프, 엄지홀
5. `photo-2026-07-14-62b5cece.jpg` — 라벨 문구·색·배치 근접 확인
6. `photo-2026-07-27-45c0af96.jpg` — 중립 배경 단품 정면
7. `photo-2026-07-27-4605aff2.jpg` — 한 쌍 구성과 좌우 길이
8. `photo-2026-07-27-fd874f53.jpg` — 중립 배경 플리츠·커프·라벨

보존·검증:

- 입력 폴더 원본은 이동·삭제·재인코딩하지 않았다.
- `assets/product-ssot/source/user-real-original/`의 정식 SSOT 복사본 8장과 입력 보존본의 SHA-256은 일치한다.
- 각 파일은 인코딩 기준 5712×4284, EXIF Orientation 6, 표시 기준 4284×5712다.
- 기존 300×400 저해상도 복구본 7장은 삭제하지 않고 이력용으로만 보존하며, 앞으로의 이미지 생성 참조에서는 제외한다.

### 2순위 — 공급처 원본 크롭 4장

1. `assets/product-ssot/source/supplier-crops/01-pair-full.png`
2. `assets/product-ssot/source/supplier-crops/02-stretch-structure.png`
3. `assets/product-ssot/source/supplier-crops/03-pleat-macro.png`
4. `assets/product-ssot/source/supplier-crops/04-hand-label-structure.png`

원본, 좌표, 파일 해시는 `product/product-manifest.json`에 기록했다. 공급처 크롭은 사용자가 제공한 실물 원본에 없는 구조를 보조 확인하는 2순위 자료로만 사용한다.

## 잠글 동일성

- 판매 옵션: 화이트
- 구성: 1세트 2개입, 좌우 한 쌍
- 제조사: 살랑 — 사용자 직접 확인
- 색상: 밝은 화이트
- 실루엣: 길고 여유 있는 튜브형
- 표면: 가늘고 불규칙한 세로 플리츠
- 팔뚝 쪽: 밴딩 마감
- 손 쪽: 넓은 손등 커프와 엄지홀
- 라벨: 흰색 직조 라벨, 검정 2단 문구 `HELLO / CUTE SLEEVE`
- 공급처 표기 치수: 길이 47cm, 평면 폭 14cm

## 출처 충돌 처리

- 라벨 문구·라벨 방향·실물 색·한 쌍 구성은 고해상도 사용자 원본을 최우선으로 판정한다.
- 공급처 일부 사진의 흐린 라벨은 동일성 텍스트 근거로 사용하지 않는다.
- 공급처 크롭은 형태·플리츠·엄지홀·손등 커프와 공급처 표기 치수를 보조하는 참조다.

## 생성 시 불변 조건

- 압박형 스포츠 토시처럼 몸에 딱 붙게 만들지 않는다.
- 플리츠를 규칙적인 골지 니트나 메쉬로 바꾸지 않는다.
- 엄지홀을 없애거나 손바닥 전체를 막지 않는다.
- 라벨을 손바닥이나 팔뚝 쪽으로 옮기지 않는다.
- 라벨은 한 손당 한 개만 둔다.
- 라벨 문구를 다른 브랜드·기호·긴 문장으로 바꾸지 않는다.
- 화이트 외 색상을 섞지 않는다.
- 확인되지 않은 실리콘·논슬립·지퍼·조절끈을 추가하지 않는다.
- 한 쌍의 좌우 길이와 엄지홀 위치를 대칭으로 유지한다.

## G0 승인 문장

> `inputs`에 추가한 고해상도 화이트 실물 원본 8장이 이 상품과 같은 SKU이고, 제품명은 `루즈핏 쿨토시`, 제조사는 `살랑`, 라벨은 `HELLO / CUTE SLEEVE`, 구성은 1세트 2개입이 맞습니다. 이 원본 8장과 공급처 크롭 4장을 제품 SSOT로 승인합니다.

위 승인은 `product/product-manifest.json`의 `locked-g0` 상태와 사용자 승인 이력으로 확정됐다. 이후 생성·GIF·HTML에서는 `assets/product-ssot/manifest.json`을 제품 동일성의 단일 진실원본으로 사용한다.
