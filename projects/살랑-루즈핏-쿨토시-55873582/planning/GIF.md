# 루즈핏 쿨토시 — GIF Plan

## Source

- `supplier_url`: https://domeggook.com/55873582?affid=
- `status`: REV-022_RENDERED_QA_PASS_USER_REVIEW_PENDING
- `planning_phase`: `G3_QA_PASSED_USER_REVIEW_PENDING`
- `g0_dependency`: approved
- `model_sheet_dependency`: approved G2A
- `g2_dependency`: approved

## GIF Decision

- `motion_required`: yes
- `gif_count`: 11 active deliverable / 10 minimum satisfied
- `motion_type`: procedure + product structure + material detail + lifestyle
- `decision_reason`: 사용자가 GIF 10개 이상과 이미지 40개 이상을 요청했다. 기존 엄지홀 방향 GIF를 유지하고 승인 이미지에서 서로 겹치지 않는 제품 구조·질감·착용·보관 소구 9개를 추가했다.
- `manufacturer_claim_motion`: MFR-CLAIM-COOL-MATERIAL 범위의 쿨링 방향은 승인 실착 위 쿨 스윕·공기 흐름·서리 입자 FX로 표현한다.
- `blocked_motion_claims`: 제조사가 제공하지 않은 정확한 °C·비율·시간·시험기관·비교군, 통풍 수치, UV 차단률, 신축 복원, 흘러내림 방지는 움직임으로 만들지 않는다.

## Rev-021 Authoritative Motion Set

고객 페이지에는 11개 GIF를 장점·사용법·구성·규격 가까이에 분산 배치한다. 뒤쪽
증거 갤러리에 다시 모으지 않는다. 기존 승인 렌더는 보존하고, 아래 여섯 개를
HyperFrames로 새로 제작한다.

| ID | 역할 | 패턴 | 핵심 QA |
|---|---|---|---|
| GIF-016 | 압박형과 루즈핏 비교 | `MOTION-COMPARE-WIPE` | 같은 팔 위치·스케일, 분할선과 마스크 동기화 |
| GIF-017 | 시원한 쿨 소재 방향 | `MOTION-COOL-SWEEP` | 그래프 없이 열감 오버레이 제거·푸른 공기 흐름·서리 입자 |
| GIF-018 | 세 가지 데일리 스타일 | `MOTION-STYLE-MATCH-CUT` | 동일 모델·제품·라벨·길이, 상단 밴드 무꼬임 |
| GIF-019 | 간단한 착용법 | `MOTION-PROCEDURE` | 팔 넣기→엄지홀→손등 정돈, 위쪽 밴드 평평함 |
| GIF-020 | 화이트 한 쌍 구성 | `MOTION-HERO-REVEAL` | 두 개 동일 크기, X자 겹침 없음, 실제 긴 비율 |
| GIF-021 | 약 47cm 치수 위치 | `MOTION-MEASUREMENT-GUIDE` | 위쪽 밴드→손등 커프 끝, 측정선·끝단 캡·라벨 축 일치 |

기존 풀에서는 GIF-001, GIF-004, GIF-006, GIF-007, GIF-010을 재검증해 사용한다.
따라서 현행 세트는 001·004·006·007·010·016·017·018·019·020·021의 11개다.

### Placement Contract

- GIF-016은 루즈핏 카피 바로 다음.
- GIF-001은 손등 커버 카피 바로 다음.
- GIF-017은 쿨 소재 카피 바로 다음.
- GIF-018은 스타일 카피 바로 다음.
- GIF-019는 착용법 단계와 같은 모듈.
- GIF-020은 상품 구성 제목과 같은 모듈.
- GIF-021은 규격표 바로 위 모듈.
- 나머지 구조·질감 GIF도 설명하는 사실 바로 아래에 배치한다.

### FX and Copy Contract

- 모든 GIF는 바로 앞 소구와 직접 연결된 주 FX를 최소 1개 사용한다.
- HTML 외부 카피는 고객 상황·편익을 설명하고 GIF 내부 문구는 상태·단계·수량만
  표시한다. 같은 문장을 안팎에서 반복하지 않는다.
- GIF-017에는 그래프·막대·꺾은선·온도·퍼센트·시간·가짜 열화상 범례를 쓰지 않는다.
- GIF-021은 규격표 바로 위에서 위쪽 밴드부터 손등 커프 끝까지 `약 47 cm`를
  애니메이션하며, 이 배치는 이후 상세페이지 개정에서도 제거하지 않는다.

### Upper-Band Twist Hard Failure

실착 첫·중간·마지막 프레임에서 위쪽 밴드는 팔 둘레를 평평하게 감싸는 하나의
링이어야 한다. 원단 두 줄이 교차하거나 밴드가 로프·꽈배기처럼 꼬이면 해당 프레임과
GIF를 모두 반려한다.

## GIF-001 — 엄지홀 착용 방향

- `id`: GIF-001
- `section_id`: reason-hand-cover
- `claim_id`: CLAIM-HAND-COVER
- `component_id`: COMPONENT-THUMB-HOLE-CUFF
- `fact_id`: FACT-REAL-THUMB-HOLE
- `final_wxh`: 800×800
- `fps`: 30
- `duration_target`: 3.2s
- `loop`: seamless
- `source_start`: A05 v01 `thumb-hole-hand-cover`, SHA-256 `4a3d02d672b5de32a8f6e1c409b558a20a5b1b461c2c3c1b59b074c24be2415e`
- `source_middle`: E08 v03 `thumbhole-procedure-mid`, SHA-256 `822a1597b37e27a3234159e1e4c2d73f881d72065ceb14145332a84ba6c69f8c`
- `source_end`: B06 v02 `palm-side-structure`, SHA-256 `5d3d364b40bea5ba4f0b57978ffc1bd400b33935c92b4e2c34881992583cffcc`
- `source_status`: G2 approved
- `product_ssot`: `product/product-manifest.json`, `asset/ssot/model-sheet-c00-03-v01.png`
- `implementation`: HyperFrames 0.7.76 / 방식 라벨 `hybrid`
- `pattern_id`: MOTION-PROCEDURE
- `motion_pattern`: 오른쪽에서 왼쪽으로 이동하는 단일 경계 마스크 — 손등 면 → 착용 길이 → 손바닥 면 → 시작 프레임 복귀
- `single_claim`: 엄지홀을 기준으로 손등 커버와 손바닥 방향을 구분할 수 있다.
- `text_policy`: GIF 내부 생성 텍스트 없음. 필요한 설명은 HTML 오버레이로 제공한다.
- `forbidden_claims`: 냉감, 통풍, UV 차단, 신축 복원, 흘러내림 방지
- `composition_path`: `hyperframes/projects/gif-001-thumbhole-direction/index.html`
- `render_path`: `asset/generated/approved/gif/gif-001-thumbhole-direction-hybrid-v01.gif`
- `qa_mp4_path`: `hyperframes/renders/gif-001-thumbhole-direction-hybrid-v01.mp4`
- `manifest_path`: `asset/generated/approved/gif/gif-001-thumbhole-direction-hybrid-v01.manifest.json`
- `manifest_sha256`: `fba0b0a35d7d2b15a5a0390ae0c9fbee1be3b687a0e6f7770a2ae670f96f9b66`
- `poster_path`: `qa/evidence/g3-gif-motion/rev001/rendered-v01/rendered-frame-01.png`
- `qa_report`: `qa/reports/g3-gif-motion-rev002.json`
- `approval_status`: approved
- `approved_at`: 2026-07-27T20:46:16.590Z
- `approved_by`: human_user
- `user_confirmation`: 승인
- `render_metadata`: 800×800, 30fps, 3.2초, 96프레임, 오디오 없음
- `gif_loop`: `NETSCAPE2.0`, loop count 0 — 무한 반복
- `gif_bytes`: 21,070,456
- `gif_sha256`: `1bf5be35e5c0c73fb531750051b3e5415bc3c23efb35c9a5cc7450a87a7db8aa`
- `qa_mp4_sha256`: `6cecc938938f2c74621b676e18ebcae6c0d0273a45a38309c3d6ca295c0263c0`
- `reduced_motion_poster`: A05 승인본의 800×800 시작 프레임
- `loop_boundary`: 실제 GIF의 첫 프레임과 마지막 프레임 추출 PNG SHA-256이 `71a0c25f5e4a25b31af8512f069d42e8519d797f0302df1d47c1adceb9509dd2`로 바이트 단위까지 동일

## GIF-002~010 — 추가 일괄 렌더

- `status`: rendered_pending_user_review
- `render_policy`: 중간 승인 없이 9개 전부 렌더 후 일괄 검토
- `user_instruction`: `gif 는 내 승인 받지말고 다 만든후에 나에게 알려 그때 검토해줄게`
- `composition_path`: `hyperframes/projects/gif-batch-002-010/index.html`
- `rows_path`: `hyperframes/projects/gif-batch-002-010/rows.json`
- `batch_manifest`: `hyperframes/projects/gif-batch-002-010/renders/manifest.json`
- `asset_manifest`: `asset/generated/pending/gif/gif-batch-002-010-manifest.json`
- `qa_report`: `qa/reports/g3-gif-batch-002-010-rev001.json`
- `review_contact`: `qa/evidence/g3-gif-motion/batch-002-010-rev001/gif-002-010-review-contact-9x5.png`
- `render_metadata`: 각 800×800, authoring 30fps, 3.2초, 96프레임, 오디오 없음
- `gif_loop`: 9개 모두 `NETSCAPE2.0`, loop count 0
- `loop_boundary`: 실제 디코딩 frame 0과 frame 95의 SHA-256이 9개 모두 동일
- `batch_result`: completed 9, failed 0
- `g2_approved_image_count`: 40

| ID | 단일 소구 | 승인 소스 | 결과 경로 |
| --- | --- | --- | --- |
| GIF-002 | 한 쌍 전체 실루엣 | A01 v02, D01 v02 | `asset/generated/pending/gif/gif-002-pair-silhouette-v01.gif` |
| GIF-003 | 동일 크기 단일 구조 | D01 v02 승인본의 좌·우 비파괴 크롭 | `asset/generated/pending/gif/gif-003-matched-single-structure-v02.gif` |
| GIF-004 | 플리츠 질감 | A04 v02 | `asset/generated/pending/gif/gif-004-pleat-texture-v01.gif` |
| GIF-005 | 밴드·봉제 구조 | A06 v01, D07 v01 clean crop | `asset/generated/pending/gif/gif-005-band-seam-construction-v02.gif` |
| GIF-006 | 라벨 디테일·위치 | D06 v01, A03 v04 | `asset/generated/pending/gif/gif-006-label-placement-v01.gif` |
| GIF-007 | 루즈핏 드레이프 | A07 v01, C03 v01 | `asset/generated/pending/gif/gif-007-loose-drape-silhouette-v01.gif` |
| GIF-008 | 음료·휴대폰 일상 착용 | C04 v01, C05 v01 | `asset/generated/pending/gif/gif-008-daily-hand-use-v01.gif` |
| GIF-009 | 여름 외출·일상 착장 | B02 v01, C07 v01 | `asset/generated/pending/gif/gif-009-summer-outing-style-v02.gif` |
| GIF-010 | 한 쌍·접은 보관 형태 | D08 v04, B05 v01 | `asset/generated/pending/gif/gif-010-folded-storage-form-v01.gif` |

추가 9개는 사용자 일괄 검토 전까지 `pending`에 유지하고 상세페이지 HTML에는 연결하지 않는다.

### 사용자 피드백 rev002

- `affected_ids`: GIF-003, GIF-005, GIF-009
- `preserved_ids`: GIF-001, GIF-002, GIF-004, GIF-006, GIF-007, GIF-008, GIF-010
- `feedback`: `003 은 엄지홀이 너무 잘보이고 뒷면의 크기가 달라 | 005 band seam 은 갑자기 왼쪽에 제품이 생겨 | 009 는 라벨이 손등위치로 자연스럽게 가야해. 이 3개만 변경해줘`
- `GIF-003 v02`: 동일한 D01 v02 한 쌍을 각각 크롭해 두 장의 크기를 맞추고 큰 엄지홀 노출을 제거했다.
- `GIF-005 v02`: D07 v01에서 밴드·봉제 부분만 크롭해 왼쪽 보조 제품을 제거했다.
- `GIF-009 v02`: 라벨이 손등 커프에 자연스럽게 놓인 B02 v01·C07 v01로 교체했다.
- `qa_report`: `qa/reports/g3-gif-feedback-rev002.json`
- `changed_contact`: `qa/evidence/g3-gif-motion/batch-002-010-rev002-feedback/gif-003-005-009-review-contact-v02.png`
- `current_set_contact`: `qa/evidence/g3-gif-motion/batch-002-010-rev002-feedback/gif-002-010-current-review-contact-9x5.png`

## Rev-018 Core Advantage Motion Map — superseded history

기존 승인 GIF는 지우거나 덮어쓰지 않고 자산 풀로 보존한다. 다음 조립본의 네 장점과
사용법에는 아래 전용 GIF를 배정한다.

| 역할 | claim_id | motion_evidence_asset_id | 상태 |
| --- | --- | --- | --- |
| 루즈핏 | CLAIM-LOOSE-DRAPE | GIF-007 | 기존 승인본 재사용 |
| 손등 커버 | CLAIM-HAND-COVER | GIF-001 | 기존 승인본 재사용 |
| 쿨 소재 | CLAIM-MFR-COOLING | GIF-011 | 신규 제작·G3 승인 필요 |
| 스타일 호환 | CLAIM-STYLE-VERSATILITY | GIF-012 | 신규 제작·G3 승인 필요 |
| 착용법 | CLAIM-HOW-TO-WEAR | GIF-013 | 신규 제작·G3 승인 필요 |

### GIF-011 — 쿨 소재 온도 하강 방향 — superseded by GIF-017 v04

- `single_claim`: 제조사 확인 쿨 소재는 착용 시 착용 부위 표면 온도가 낮아지는 방향의 쿨링 기능을 가진다.
- `fact_id`: MFR-CLAIM-COOL-MATERIAL
- `pattern`: 과거 계획 기록. 현행본은 승인 실착 위 쿨 스윕·공기 흐름·서리 입자로 교체했다.
- `must_show`: 현행 적용 금지. `GIF-017 v04`를 사용한다.
- `forbidden`: 임의 °C, 퍼센트, 시간, 표본, 시험기관, 비교 제품, 열화상 시험처럼 보이는 수치 범례

### GIF-012 — 세 가지 스타일 전환

- `single_claim`: 화이트 플리츠가 캐주얼·출근·페미닌 룩에 자연스럽게 이어진다.
- `fact_id`: FACT-WHITE-VARIANT
- `pattern`: 승인된 동일 20대 여성 모델의 같은 포즈에서 의상만 3단계 전환
- `must_show`: 얼굴·헤어·체형·손·쿨토시 길이·플리츠·엄지홀·라벨 아이덴티티 고정
- `forbidden`: 제품 색·길이·라벨 위치 변경, 인물 교체, 네 번째 기능 주장

### GIF-013 — 간단한 착용법

- `single_claim`: 팔을 넣고 엄지홀을 찾은 뒤 손등 커프를 정돈해 착용한다.
- `fact_id`: FACT-REAL-THUMB-HOLE
- `pattern`: 팔 넣기 → 엄지 넣기 → 손등 정돈의 실제 동작 3단계
- `html_support`: `① 팔 넣기 🫳  ② 엄지홀 찾기 👍  ③ 손등 정돈 ✨`
- `forbidden`: 이모지를 GIF 픽셀에 굽기, 손가락 수·엄지홀·라벨 방향 변화

## 제작 제한

- G0·G1 승인 전에 이미지 생성이나 모션 제작을 시작하지 않는다.
- G2에서 A05, E08, B06이 모두 승인된 뒤 HyperFrames 제작을 시작한다.
- ImageGen으로 연속 중간 프레임을 만들어 제품 구조를 변형하지 않는다.
- 엄지홀 위치, 손가락 수, 커프, 라벨 방향은 모든 프레임에서 동일해야 한다.
- 800×800이 아닌 결과는 G3 후보로 제출하지 않는다.
- GIF는 G3 사용자 승인 전 상세페이지에 연결하지 않는다.
- 사용자의 `gif 렌더하자` 확인을 받아 MP4·GIF 렌더를 완료했다.

## Final QA

- `motion_required`: yes
- `reduced_motion_poster`: ready
- `manifest_updated`: rendered asset manifest ready
- `hyperframes_strict`: pass — 오류 0, 경고 0
- `rendered_frame_inspection`: pass — 홀드 0·41·71·95, 전환 26·56·84
- `first_middle_last_contact`: `qa/evidence/g3-gif-motion/rev001/rendered-v01/rendered-contact-start-worn-palm-loop-v01.png`
- `html_current_src`: GIF-001만 approved path로 연결 가능. GIF-002~010은 검토 전 연결 금지.
- `user_approval`: GIF-001 approved / GIF-002~010 pending_user_review
