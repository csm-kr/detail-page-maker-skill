# 루즈핏 쿨토시 — 40개 Image Asset Plan

## 실행 계약

- `provider`: `god-tibo-gpt-image2-skill`
- `character_sheet_candidates`: 8
- `production_jobs`: 40
- `total_generated_images_planned`: 48
- `production_batch_layout`: 8 + 8 + 8 + 8 + 8
- `wave_1`: Batch A + Batch B = 16
- `wave_2`: Batch C + Batch D = 16
- `wave_3`: Batch E = 8
- `effective_parallel_workers`: 16
- `provider_hard_limit_per_batch`: 8
- `character_sheet_start_condition`: G0 SOURCE_SSOT 승인 + G1 COMMERCIAL_PLAN 승인
- `production_start_condition`: G2A 캐릭터 시트 승인
- `current_status`: HELD
- `final_detail_module_size`: `800x2000`

먼저 God Tibo 8-worker 한 배치로 캐릭터 시트 후보 8장을 만든다. 그중 한 장을 G2A에서 승인받아 인간 모델 SSOT로 잠근 뒤, 본 제작 40장은 8-worker 배치 5개로 나눈다. 최대 두 배치를 동시에 실행해 `16 + 16 + 8` 세 웨이브로 완료한다. 모든 신규 이미지 생성은 로컬 `god-tibo-gpt-image2-skill`의 `tibo-batch.mjs`만 사용한다.

## W×H 결정 원칙

한 가지 크기로 통일하지 않고 실제 배치 역할에 맞춰 생성한다.

| 용도 | 생성 W×H | 사용 방식 |
|---|---:|---|
| 상세페이지 세로 장면 | 1024×1536 | 800×2000 모듈 안에서 세로 크롭·카피 여백 확보 |
| 전체 피날레·긴 히어로 | 2160×3840 | 첫/마지막 모듈의 깊은 세로 크롭 |
| 제품 두 면·한 쌍 비교 | 1536×1024 | 좌우 비교 후 상세 모듈에 분할 배치 |
| 구조 매크로·GIF 소스 | 1024×1024 | 정사각 증거 카드 및 800×800 GIF 제작 |
| 배경 전용 | 2048×1152 | 제품과 분리 생성 후 합성·확장 |
| 최종 GIF | 800×800 | HyperFrames 렌더 결과 |
| 최종 상세페이지 모듈 | 800×2000 | 생성 이미지가 아니라 승인 이미지로 조립 |

편집 작업은 기준 이미지의 W×H를 유지한다. 배경만 필요한 경우 제품 SSOT를 참조하지 않고 배경만 생성하며, 제품이 들어가는 모든 장면은 승인된 사용자 원본을 1순위로 참조한다.

## 모든 작업의 공통 불변 조건

- 화이트 쿨토시 한 쌍 또는 명시된 한 짝만 등장
- 길고 여유 있는 튜브형 실루엣
- 가늘고 불규칙한 세로 플리츠
- 팔뚝 밴딩, 넓은 손등 커프, 엄지홀 유지
- 손등 라벨은 한 손당 한 개, 흰색 바탕, 검정 2단 `HELLO / CUTE SLEEVE`
- 압박형 스포츠 토시, 골지 니트, 메쉬, 지퍼, 조절끈, 논슬립 돌기 추가 금지
- 추가 광고 문구·아이콘·워터마크 금지
- 인체가 나오는 장면은 승인된 20대 여성 캐릭터 시트를 참조하고 얼굴·헤어·체형·피부톤을 유지
- UV 차단율, UPF, 냉감 수치, 흡한속건, 통풍, 미끄럼 방지 성능을 이미지로 암시하지 않음

## Batch A — 제품 동일성과 핵심 구조

### A01 — Pair Flatlay Hero

- `role`: pair-flatlay-hero
- `target_wxh`: 1536×1024
- `purpose`: 히어로·한 쌍 실물 확인
- `source_mode`: product-ssot
- `scene`: 밝은 아이보리 배경에 화이트 쿨토시 한 쌍을 전체 길이가 잘리지 않게 나란히 펼친 프리미엄 플랫레이
- `must_show`: 좌우 한 쌍, 대칭 길이, 플리츠, 손등 커프, 라벨

### A02 — Single Front

- `role`: single-front
- `target_wxh`: 1024×1536
- `purpose`: 앞면 구조
- `source_mode`: product-ssot
- `scene`: 단품 한 짝을 수직으로 펼친 제품 사진
- `must_show`: 팔뚝 밴딩부터 손등 커프까지 전체 길이

### A03 — Single Reverse and Label Direction

- `role`: single-reverse-label
- `target_wxh`: 1536×1024
- `purpose`: 앞뒤·라벨 위치 확인
- `source_mode`: product-ssot
- `scene`: 단품의 반대 면과 손등 면을 차분하게 병치한 제품 사진
- `must_show`: 봉제 방향, 라벨이 손등 면에만 한 개

### A04 — Pleat Macro

- `role`: pleat-macro
- `target_wxh`: 1024×1024
- `purpose`: 플리츠·얇은 소재 결
- `source_mode`: product-ssot
- `scene`: 가늘고 불규칙한 세로 플리츠와 얇은 직물 결을 보여주는 매크로
- `must_show`: 실제 화이트 색, 과도한 광택 없는 직물

### A05 — Thumb Hole and Hand Cover

- `role`: thumb-hole-hand-cover
- `target_wxh`: 1024×1024
- `purpose`: 엄지홀·손등 덮임 및 GIF 시작 프레임
- `source_mode`: product-ssot
- `scene`: 승인된 20대 여성 모델의 실제 손에 착용해 손등 방향과 엄지홀을 크게 보여주는 클로즈업
- `must_show`: 정상 손가락, 엄지홀, 손등 커프, 라벨 방향

### A06 — Upper Band and Seam

- `role`: upper-band-seam
- `target_wxh`: 1024×1024
- `purpose`: 팔뚝 밴딩·끝단 봉제
- `source_mode`: product-ssot
- `scene`: 상단 밴딩과 플리츠 연결 봉제를 보여주는 제품 단독 매크로
- `must_show`: 확인된 봉제만 표현, 실리콘·조절장치 없음

### A07 — Loose Drape on Arm

- `role`: loose-drape-arm
- `target_wxh`: 1024×1536
- `purpose`: 루즈핏 증거
- `source_mode`: product-ssot
- `scene`: 승인된 20대 여성 모델의 얼굴과 팔 전체가 함께 보이는 자연스러운 측면 장면
- `must_show`: 팔꿈치 위부터 손등까지, 몸에 달라붙지 않는 자연스러운 여유 주름

### A08 — Daylight Thinness

- `role`: daylight-thinness
- `target_wxh`: 1024×1536
- `purpose`: 밝은 빛의 얇은 인상과 비침 안내
- `source_mode`: product-ssot
- `scene`: 승인된 20대 여성 모델이 부드러운 창가 자연광 아래 착용한 근접 사진
- `must_show`: 화이트 소재의 실제적인 얇음, 피부와 원단 경계를 정직하게 표현

## Batch B — 사용 장면·배경·최종 조립용

### B01 — Parked Car Driving Structure

- `role`: parked-car-driving
- `target_wxh`: 1024×1536
- `purpose`: 운전 사용 장면
- `source_mode`: product-ssot
- `scene`: 승인된 20대 여성 모델이 정차 차량에서 양손으로 운전대를 자연스럽게 잡은 팔·손 중심 사진
- `must_show`: 손등 커버, 엄지홀, 손바닥 접촉 구조

### B02 — Summer Walk

- `role`: summer-walk
- `target_wxh`: 1024×1536
- `purpose`: 산책 사용 장면
- `source_mode`: product-ssot
- `scene`: 승인된 20대 여성 모델이 밝은 여름 산책길에서 팔을 자연스럽게 내린 상반신 장면
- `must_show`: 양팔 전체 길이와 플리츠 드레이프

### B03 — Grocery Cart

- `role`: grocery-cart
- `target_wxh`: 1024×1536
- `purpose`: 장보기 사용 장면
- `source_mode`: product-ssot
- `scene`: 승인된 20대 여성 모델이 밝은 마트에서 카트 손잡이를 잡은 팔·손 중심 장면
- `must_show`: 손등 커프와 손바닥 방향

### B04 — Window Desk Background

- `role`: window-desk-background
- `target_wxh`: 2048×1152
- `purpose`: 실내 일상 섹션의 넓은 배경
- `source_mode`: background-only
- `scene`: 부드러운 여름 창가 빛, 밝은 테이블, 얕은 그림자, 제품과 인체가 없는 깨끗한 실사 배경
- `must_show`: 합성 여백, 자연광 방향, 텍스트·제품·사람 없음

### B05 — Folded in Small Pouch

- `role`: folded-pouch
- `target_wxh`: 1024×1024
- `purpose`: 보관·휴대
- `source_mode`: product-ssot
- `scene`: 한 쌍을 부드럽게 접어 작은 여름 파우치 옆에 둔 플랫레이
- `must_show`: 구성은 한 쌍, 제품을 지나치게 압축하거나 변형하지 않음

### B06 — Palm Side Structure

- `role`: palm-side-structure
- `target_wxh`: 1024×1024
- `purpose`: 손바닥 개방 범위 및 GIF 종료 프레임
- `source_mode`: product-ssot
- `scene`: 승인된 20대 여성 모델의 손바닥이 카메라를 향한 착용 근접컷
- `must_show`: 엄지홀, 손바닥 쪽 실제 개방 구조, 정상 손가락

### B07 — Measurement Flatlay

- `role`: measurement-flatlay
- `target_wxh`: 1024×1536
- `purpose`: 47×14cm 공급처 표기 시각화용 원본
- `source_mode`: product-ssot
- `scene`: 단품을 곧게 펼치고 자를 나란히 둔 직교 플랫레이
- `must_show`: 전체 제품과 측정 시작·끝점, 숫자 텍스트는 생성하지 않음

### B08 — Final Pair and Worn Recap

- `role`: final-recap-hero
- `target_wxh`: 2160×3840
- `purpose`: 첫 화면·최종 선택 이유 요약
- `source_mode`: product-ssot
- `scene`: 승인된 20대 여성 모델의 실착과 한 쌍 제품이 한 화면에서 자연스럽게 연결되는 프리미엄 세로 피날레
- `must_show`: 루즈핏, 손등 커버, 화이트 플리츠, 라벨, 위아래 카피 여백

## Batch C — 승인 모델의 데일리 라이프스타일

Batch C의 모든 인물은 G2A에서 잠근 `model-20f-airfit-01` 캐릭터 시트를 참조한다.

| ID | 역할 | W×H | 장면 | 필수 조건 |
|---|---|---:|---|---|
| C01 | model-editorial-front | 1024×1536 | 화이트·샌드 톤의 여름 스튜디오에서 정면을 바라보는 상반신 에디토리얼 | 얼굴·헤어·체형과 양팔 제품 동일성 |
| C02 | model-editorial-three-quarter | 1024×1536 | 3/4 방향으로 서서 한쪽 손등을 자연스럽게 보여주는 장면 | 얼굴 3/4, 라벨 한 개, 정상 손 |
| C03 | model-side-drape | 1024×1536 | 옆모습으로 팔을 편하게 내린 루즈 드레이프 증거 | 팔꿈치 위 길이와 주름 여유 |
| C04 | iced-drink-hand | 1024×1536 | 투명한 아이스 음료를 든 손·상반신 일상 장면 | 손등 커프, 엄지홀, 라벨 방향 |
| C05 | phone-use-close | 1024×1536 | 스마트폰을 사용하는 두 손과 자연스러운 표정 | 손가락 정상, 화면 내용·로고 없음 |
| C06 | tote-walk | 1024×1536 | 밝은 산책길에서 토트백을 들고 걷는 전신 장면 | 승인 모델 얼굴·헤어, 양팔 한 쌍 |
| C07 | balcony-reading | 1024×1536 | 그늘진 발코니에서 책을 읽는 반신 장면 | 과도한 햇빛·UV 성능 암시 없음 |
| C08 | neutral-full-body | 1024×1536 | 밝은 중립 배경의 전신 패션 컷 | 제품 전체 길이, 단정한 여름 의상 |

## Batch D — 제품 컷아웃·좌우·매크로 보강

| ID | 역할 | W×H | 장면 | 필수 조건 |
|---|---|---:|---|---|
| D01 | pair-clean-cutout | 1536×1024 | 밝은 중립 배경의 한 쌍 정면 컷아웃 | 좌우 길이·라벨 방향 대칭 |
| D02 | single-front-cutout | 1024×1536 | 단품 앞면 세로 컷아웃 | 전체 길이 무크롭 |
| D03 | single-reverse-cutout | 1024×1536 | 단품 뒷면 세로 컷아웃 | 엄지홀 절개·봉제 보존 |
| D04 | left-thumb-detail | 1024×1024 | 왼손 착용 엄지홀 근접 | 정상 손가락과 손등 커버 |
| D05 | right-thumb-detail | 1024×1024 | 오른손 착용 엄지홀 근접 | D04와 좌우 대응 |
| D06 | label-macro-clean | 1024×1024 | 직조 라벨과 커프 원단 매크로 | 정확한 HELLO / CUTE SLEEVE |
| D07 | seam-macro-clean | 1024×1024 | 팔뚝 밴딩과 끝단 봉제 매크로 | 미확인 실리콘·논슬립 없음 |
| D08 | folded-pair-stack | 1024×1024 | 한 쌍을 느슨하게 접은 보관 컷 | 2개입이 구분되고 과도한 압축 없음 |

## Batch E — 배경·합성·대체 히어로

| ID | 역할 | W×H | 장면 | 필수 조건 |
|---|---|---:|---|---|
| E01 | ivory-paper-background | 2048×1152 | 미세한 종이 결의 아이보리 배경 | 제품·사람·문자 없음 |
| E02 | summer-blue-shadow-background | 2048×1152 | 옅은 하늘색 벽과 부드러운 잎 그림자 | 기능성 아이콘·태양 그래픽 없음 |
| E03 | pale-coral-table-background | 2048×1152 | 옅은 코랄 테이블과 여백이 큰 배경 | 제품 합성용 광원 방향 명확 |
| E04 | parked-car-interior-background | 2048×1152 | 정차 차량의 밝고 깨끗한 운전석 배경 | 사람·손·브랜드 로고 없음 |
| E05 | grocery-aisle-background | 2048×1152 | 밝고 정돈된 마트 통로 배경 | 상표·가격표·사람 없음 |
| E06 | model-product-split-hero | 2160×3840 | 승인 모델 실착과 한 쌍 제품을 상하로 연결한 긴 히어로 | 얼굴·제품 두 SSOT 동시 고정 |
| E07 | pair-wide-banner | 1536×1024 | 한 쌍을 오른쪽에 두고 왼쪽 카피 여백을 둔 배너 | 문자 자체는 생성하지 않음 |
| E08 | thumbhole-procedure-mid | 1024×1024 | 손이 엄지홀을 찾는 절차 중간 자세 | GIF용 구조, 정상 손가락, 라벨 고정 |

## GIF 파생

- GIF-001은 A05, E08, B06의 승인본을 시작·중간·종료 키프레임으로 사용한다.
- GIF-002~010은 G2 승인본 A01, D01, D02, D03, A04, A06, D07, D06, A03, A07, C03, C04, C05, B02, C06, D08, B05만 사용한다.
- ImageGen으로 임의의 중간 프레임을 대량 생성하지 않는다.
- HyperFrames에서 각 `800×800`, 3.2초, 96프레임으로 렌더한다.
- 총 10개 GIF는 엄지홀 방향, 한 쌍 실루엣, 앞·뒤 구조, 플리츠, 밴드·봉제, 라벨, 루즈핏, 일상 착용, 외출 착장, 보관 형태를 각각 한 소구씩 담당한다.
- GIF-001은 G3 승인 완료, GIF-002~010은 렌더 완료 후 사용자 일괄 검토 전까지 `pending`으로 유지한다.

## 생성 후 판정

- 좌우 길이·엄지홀 위치·라벨 방향이 SSOT와 다르면 즉시 거절
- 손가락 수·엄지홀·손바닥 구조 오류는 즉시 거절
- 텍스트·워터마크·UV/냉감 아이콘이 생기면 즉시 거절
- 지정 W×H와 다른 출력은 재생성 또는 비파괴 리사이즈 후보로 분리
- 캐릭터 시트 후보 8장 중 승인되지 않은 7장은 제작 참조로 사용하지 않음
- 승인된 본 제작 이미지와 배경만 상세페이지 조립 입력으로 승격

## Rev-018 추가 증거 자산

기존 40장과 GIF 10개는 삭제하지 않고 승인 자산 풀로 보존한다. 아래 항목은 새로운
네 장점과 착용법을 직접 보여주기 위한 추가 제작 대상이다.

| ID | 역할 | W×H | 연결 주장 | 증거 방식 |
|---|---|---:|---|---|
| COOL-01 | cool-material-qualitative-graph | 1600×1200 | CLAIM-MFR-COOLING | 실제 플리츠 원단 매크로 + 숫자 없는 착용 전→후 온도 하강 곡선 |
| STYLE-01 | three-look-style-board | 1600×1200 | CLAIM-STYLE-VERSATILITY | 동일 모델·동일 제품의 캐주얼·출근·페미닌 3룩 |
| HOWTO-01 | wear-three-step-board | 1600×1200 | CLAIM-HOW-TO-WEAR | 팔 넣기·엄지홀 찾기·손등 정돈 3단계 |
| GIF-011 | cool-temperature-direction | 800×800 | CLAIM-MFR-COOLING | 따뜻한 색→시원한 색, 숫자 없는 하강 그래프 |
| GIF-012 | three-look-transition | 800×800 | CLAIM-STYLE-VERSATILITY | 같은 포즈에서 의상만 3단계 전환 |
| GIF-013 | wear-three-step | 800×800 | CLAIM-HOW-TO-WEAR | 실제로 한 번에 입는 순서 |

`COOL-01`과 `GIF-011`에는 `MFR-CLAIM-COOL-MATERIAL` 범위의 쿨링 그래픽을
허용한다. 기존의 냉감 아이콘 금지는 출처 없는 일반 자산에 계속 적용한다. 제조사가
제공하지 않은 °C, 퍼센트, 시간, 시험기관, 표본 수와 정밀 눈금은 생성하지 않는다.
