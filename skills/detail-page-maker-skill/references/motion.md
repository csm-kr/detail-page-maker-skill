# GIF·HyperFrames 증거 모션

## 필요성

motion은 이 스킬의 필수 판매·근거 매체다. 정지 이미지보다 상태 변화, 불편의 발생,
해결 작동, 비교 경계, 사용 순서, 구성 공개, 치수 위치를 더 명확하게 보여 준다.
한 motion은 주장 하나, 부품 하나, 상태 변화 하나를 맡는다.

## 필수 coverage

- 전체 hard floor 5개, 필수 역할을 적용한 실제 최소 7개, 기획 기본 7~9개, 상한 없음
- 고객 불편 motion 2개 이상
- 해결 장점 3~5개 각각에 전용 motion 1개 이상
- 준비→사용→결과 motion 1개 이상
- 기존 불편→검증된 제품 차이 비교 motion 1개 이상

같은 파일을 여러 역할에 중복 집계하지 않는다. 시간축 근거가 더 명확한 제품은
기본 범위를 넘어 추가한다. 장식만 움직이는 motion은 개수와 증거에 포함하지 않는다.
G1의 deterministic content-flow validator가 coverage를 통과하기 전 G3 제작
WorkOrder를 발급하지 않는다.

## 제작 순서

1. 고객 구매 질문, `claim_id`, 부품, 시작·중간·끝 상태와 눈에 보이는 변화량을
   잠근다.
2. `fixed-product-graphics | aligned-state-pair | verified-layered-assets` 중
   증명에 필요한 최소 정보 전달 방식을 고른다.
3. 주장과 직접 연결된 주 FX를 하나 고르고, 장식 FX는 보조로만 둔다.
4. 승인 제품 이미지와 실제 좌표를 입력으로 사용한다.
5. HyperFrames 원본을 `.detail-page/generation/hyperframes/projects/`에 만든다.
6. `check --strict --frame-check`를 통과한다.
7. 첫·중간·마지막 프레임과 반복 경계를 검사한다.
8. 결과를 `asset/generated/pending/gif/`에 등록한다.
9. 사용자 승인 또는 원본 사진+G1 승인 계보의 plan-once policy 승인 뒤 해당
   주장 바로 다음에 배치한다.

각 motion BRIEF에는 다음 필드가 모두 필요하다.

- `customer_question`, `feature_part`, `method`, `pattern_id`
- `start_state`, `mid_state`, `end_state`, `visible_delta`
- `motion_reason`, `static_insufficiency`, `background_contrast`
- `template_id: T1~T10`, `one_message: true`, `answer_within_seconds` 1 이하
- `information_delivery_mode`, `decorative_overlay_only: false`,
  `product_geometry_locked: true`, `generative_product_morphing_allowed: false`
- 전환 계열과 강조 전환 계획. 개수 상한은 없다. 강한 효과의 허용 용도
- 폭 780 canvas, FPS, 길이, `gif | animated-webp | gif+animated-webp`
- `placement_scale: chapter | full-width`
- `applied_rule_ids`, frozen rule packet digest, reference profile digest

각 motion은 별도 WorkOrder와 worker session으로 병렬 제작한다. 입력 이미지가
승인된 motion은 다른 이미지·motion과 동시에 실행할 수 있다. 생산자와 Motion QA
session은 달라야 하며 실패한 motion과 실제 descendant만 다시 실행한다.

## 제작 방법 선택

| 방법 | 사용할 때 | 필수 원본 |
| --- | --- | --- |
| `fixed-product-graphics` | 치수선·콜아웃·단계·수량·데이터 카드처럼 좌표 기반 설명이 핵심일 때 | 승인 이미지와 실제 anchor/bbox |
| `aligned-state-pair` | 설치 전후·열림/닫힘 등 실제 두 상태 비교가 핵심일 때 | 중심·크기·방향·카메라가 정렬된 실제 pair |
| `verified-layered-assets` | 실제 다층·구성요소의 분리·재결합이 핵심일 때 | 검증된 layer PNG 또는 구성품 자산 |

상세 템플릿·샷 계약·신뢰도 fallback·변환 명령은
[`hyperframes-sales-motion.md`](hyperframes-sales-motion.md)를 따른다.

## 주 패턴

| 질문 | 패턴 |
| --- | --- |
| 무엇이 다른가 | 비교 와이프·슬라이더 |
| 어느 면·부품인가 | 면 뒤집기·구조 추적 |
| 어떻게 작동하는가 | 국소 이펙트 |
| 어떤 순서인가 | 절차 진행 |
| 몇 개가 오는가 | 구성 리빌 |
| 어디부터 어디까지인가 | 치수 위치 가이드 |
| 분위기·상태가 어떻게 바뀌는가 | 짧은 매치컷·쿨 스윕 |

정보가 늘지 않는 줌·광선·입자는 증거로 인정하지 않는다. 제품은 고정되어 있어도
정확한 선·원·라벨·카드가 치수·부위·단계·구성·작동 원리를 새로 설명하면 유효한
정보형 모션이다. 인접 motion은 같은 `pattern_id`를 반복하지 않으며 꼭 필요한 경우
구매 질문이 달라지는 구체적 사유를 남긴다.

## 검증된 누적 모션 규칙

| ID | 계속 적용할 규칙 | 검증 기준 | 갱신일 |
| --- | --- | --- | --- |
| MR-001 | 비교는 두 상태의 크기·기준점을 고정하고 한 개의 경계선·마스크만 움직여 차이가 아니라 화면 전환을 보게 되는 문제를 막는다. | 시작·중간·끝 프레임의 기준점 편차와 경계 동기 검사 | 2026-07-29 |
| MR-002 | 길이는 제품 중앙 축 위에서 상단부터 하단까지, 폭은 실제 제품 외곽 사이에서 SVG 측정선을 서로 다른 축으로 순차 그린다. 자 옆이나 빈 배경에 선을 그리거나 숫자만 확대하지 않는다. | 제품 중앙 세로선, 세로 시작·끝 앵커, 가로 시작·끝 앵커, 두 라벨이 각각 존재 | 2026-07-29 |
| MR-003 | 사람이 있는 장면은 의도 없는 얼굴·머리·손끝 잘림을 금지하고 `object-fit: contain`을 기본값으로 둔다. 손 구조 주장은 엄지홀·손등·손가락을 같은 프레임에 남긴다. | 첫·중간·끝 `--frame-check`와 사람·손 안전영역 육안 QA | 2026-07-29 |
| MR-004 | 소재 흐름 FX는 실제 플리츠·구멍·접합부 같은 제품 구조에서 시작한다. 근거 없는 서리·입자·열화상·막대는 주 FX로 쓰지 않는다. | FX 시작점이 제품 구조 좌표와 연결되고 금지 FX 0건 | 2026-07-29 |
| MR-005 | 슬라이드는 새 정보가 나타나는 순간에만 쓰고, 느림→직선 이동→긴 감속의 3단 이동으로 원인과 결과를 연결한다. 같은 와이프를 모든 주장에 재사용하지 않는다. | 주장별 `pattern_id` 중복 사유와 세 구간 키프레임 검사 | 2026-07-29 |
| MR-006 | SVG 경로는 실제 `getTotalLength()`로 측정해 `stroke-dashoffset`을 0까지 그리며, 결과 상태를 최소 1초 유지한다. | 추정 길이 상수 0건, 최종 상태 1초 이상, exact final 프레임 검사 | 2026-07-29 |
| MR-007 | 보관·정돈 장면에는 실제 구성품이 아닌 파우치·주머니·보따리·바구니·포장·끈을 제품 옆에 두지 않는다. 포함 근거가 확인된 소품만 보여 주며, 그 외에는 판매 제품만 사용한다. | 미제공 소품 0건, `included_prop_gate` 통과, 제품만 남긴 첫·중간·끝 프레임 검사 | 2026-07-29 |
| MR-008 | GIF 내부 카피는 제목·설명·상태 라벨·미디어의 안전영역을 분리하고, 한 영역의 문구가 다른 영역이나 증거 FX 위로 침범하지 않게 한다. | 800×800 첫·중간·끝 프레임에서 문자 상자 교차 0건, 잘림 0건 | 2026-07-29 |
| MR-009 | 내부 카피·측정선·비교선이 들어간 GIF는 제작 캔버스 비율을 그대로 표시한다. 정사각 GIF를 `16:10`이나 다른 비율의 `cover` 박스에 넣지 않고 `contain`으로 전체 프레임을 보존한다. | 360px에서 렌더 비율=원본 비율, `object-fit: contain`, 내부 문자·선 잘림 0건 | 2026-07-29 |
| MR-010 | 외부 모션 도구의 복합 옵션은 분할 추정하지 않고 검증된 단일 인자 값으로 보존하며 strict check와 render 영수증에 실제 실행 인자 전체를 기록한다. | preview와 render가 같은 정규화 옵션을 쓰고 실행 영수증의 exact 인자로 재현되며 strict 오류·경고가 0건이다. | 2026-07-30 |
| MR-011 | 여러 motion의 preview와 render 결과는 member 식별자를 정렬한 manifest로 집계하고 fan-out 전체를 반복 검증한 뒤 독립 QA에 제출한다. | 계획된 motion 집합과 제출 집합이 정확히 같고 중복·누락 0건이며 모든 first·mid·last와 반복 경계가 PASS한다. | 2026-07-30 |
| MR-012 | 정지 QA는 승인 poster로 모션 소스를 제거하고 이미지 decode를 마친 뒤 두 번 촬영하며 GPU 재샘플링은 변화 픽셀 비율과 유의·심각 차이 임계치를 함께 기록해 실제 모션과 구분한다. | 실제 모션 잔존 0건, 두 촬영의 구조 동일, 유의·심각 차이가 허용 임계치 이하이고 최대 채널 차이가 기록된다. | 2026-07-30 |
| MR-013 | 각 motion은 고객 질문, 기능 부위, 시작·중간·끝 정보 상태, visible delta, 정지 한계, 1초 내 답, 배경 대비를 잠근다. 제품이 고정돼도 검증된 치수·위치·단계·구성 정보를 전달하는 overlay는 인정하고 정보가 늘지 않는 장식-only만 금지한다. | first/mid/last semantic frame evidence, 질문 답변 1초 이하, decorative-overlay-only 0건 | 2026-08-01 |
| MR-014 | 인접 motion은 같은 pattern과 구도를 반복하지 않고 주장에 맞는 비교·구조 추적·국소 작동·절차·구성·치수 패턴을 구분한다. | 인접 pattern ID 중복 0건 또는 구매 질문이 달라지는 구체적 재사용 사유 | 2026-07-31 |
| MR-015 | 공개 export는 저작 motion source를 실제 animation src로 보존하고 public DOM·manifest·`output/media/gifs` bytes·frame count를 post-export에서 닫는다. Poster는 fallback일 뿐 전달 motion으로 세지 않는다. | planned/public/manifest/file 수 일치, animation frame 2+, poster-only 0건 | 2026-07-31 |
| MR-016 | 선택 category cohort의 필수 motion family를 실제 GIF brief에 바인딩하고 전체에서 서로 다른 pattern을 4종 이상 사용한다. G5 공개 결과의 motion semantic delta가 cohort보다 낮으면 개수와 기술 점수에 관계없이 실패한다. | family→brief 누락 0, distinct pattern 4+, category cohort motion delta 회귀 0 | 2026-07-31 |
| MR-017 | GIF마다 목적·카메라·핵심 변화·전환·강조 그래픽을 표로 먼저 정하고 인접 GIF는 이 네 축 중 최소 두 축이 달라야 한다. GIF 수보다 서로 다른 증명 방식의 수를 우선한다. | 인접 모션 differing-axis 2+, 목적 중복 0건 | 2026-08-01 |
| MR-018 | 모든 GIF 첫 프레임은 제품 또는 문제 상황, 한 줄 핵심 메시지, 기능을 이해할 시각 근거를 함께 보여 주며 애니메이션은 이미 이해된 메시지를 강화해야 한다. | first-frame 단독 1초 이해 QA와 필수 요소 3개 | 2026-08-01 |
| MR-019 | 좋은 loop는 첫·끝 픽셀 경계뿐 아니라 속도·방향·밝기·카메라 움직임의 지각적 연속성을 통과해야 하며 ping-pong·순환·고정 콜아웃·가림 초기화·연속 슬라이드 중 목적에 맞는 방식을 고른다. | pixel boundary와 perceptual continuity 모두 PASS | 2026-08-01 |
| MR-020 | 모든 생성·모션 프레임은 canonical 제품 참조와 색·형태·부품·비율·구성의 불변 조건 네 개 이상을 유지하며 제품 구조가 중간에 바뀌는 생성형 모핑을 금지한다. | first/mid/last identity invariant PASS, morphing 0건 | 2026-08-01 |

HeyGenFrame/HyperFrames 제작 run을 `exps/*.md`에 `frame-production`,
`promotion: auto`로 넣으면 strict frame-check PASS, 시작·중간·끝 근거,
독립 reviewer를 통과한 일반화 규칙만 MR로 자동 반영한다. Studio 조작·레이아웃
경험은 이 표가 아니라 `taste.md`의 TR로 분리한다.

## 정성 주장

정량 시험이 없는 냉감·통풍·열감은 그래프, 막대, 꺾은선, 온도 숫자, 가짜
열화상으로 표현하지 않는다. 승인 제품 또는 사용 장면 위의 짧은 쿨 스윕과 실제
구조에서 시작하는 공기 흐름으로 방향만 보여 준다.

## 치수

길이·폭·높이처럼 위치를 알아야 하는 규격은 규격표 바로 위에 전용 GIF를 둔다.
승인 제품의 실제 외곽에 측정 시작점·끝점·선을 맞추고 치수 라벨을 고정한다.
세로·가로 규격이 함께 있으면 `세로선 → 세로 라벨 → 가로선 → 가로 라벨` 순서로
각 축을 분리한다. 세로선은 자나 배경이 아니라 제품의 중앙 축 위에 놓고 실제 상단과
하단을 연결한다. 숫자만 다시 보여 주는 모션으로 대체하지 않는다.

## 구성품 오인 방지

- 제품과 함께 제공되지 않는 파우치, 주머니, 보따리, 바구니, 상자, 포장, 리본,
  스트랩은 보관·정돈 장면의 소품으로 사용하지 않는다.
- 소품이 필요하면 상품 구성표나 공급처 원문에서 포함 여부를 먼저 확인하고
  `included_prop_gate`에 근거를 기록한다.
- 포함 근거가 없으면 승인된 판매 제품만으로 정돈 전후를 구성한다.

## 사람·손 안전영역

- 인물이 핵심인 장면은 머리 위, 턱, 어깨, 손끝 중 하나라도 프레임 밖으로 잘리면
  실패다. 원본 자체가 상반신 구도인 경우에도 원본 경계를 추가 확대해 자르지 않는다.
- 손 구조 장면은 얼굴을 반만 남기지 않는다. 손만 보여 주거나 얼굴 전체와 손을 함께
  보여 주는 둘 중 하나를 선택한다.
- `cover`는 질감 매크로에만 허용한다. 사람·착용·사용법·스타일 장면의 기본은
  `contain`이다.
- `--frame-check` 통과만으로 손등 위치가 맞다고 보지 않는다. 첫·중간·끝 프레임에서
  손등, 엄지홀, 손가락을 육안으로 다시 확인한다.

## 카피 분담

외부 HTML은 고객 상황과 효익을, GIF 내부 문구는 상태명·단계명·수량을 맡는다.
두 곳에서 같은 문장을 반복하지 않는다.

## 재생과 전달

- 일반 HTML은 `IntersectionObserver`로 보이는 motion만 재생한다.
- 화면 밖에서는 정지 poster를 보이고 다시 진입하면 첫 프레임부터 시작한다.
- `prefers-reduced-motion`에서는 poster와 같은 HTML 설명만 보여 준다.
- Wing은 viewport 제어를 지원하지 않으므로 motion section을 폭 780px
  애니메이션 WebP로 변환해 지속 재생한다.
- Studio의 390 CSS px 편집 화면과 780px 전달 자산은 같은 section order와
  첫·마지막 메시지를 유지한다.
- HyperFrames는 결정론적 무음 MP4를 한 번 렌더한다. GIF와 animated WebP는
  그 MP4에서 FFmpeg로 파생하며 HyperFrames 직접 GIF 렌더를 기본 경로로 쓰지 않는다.

## 하드 게이트

- 제품 외곽·부품·문자·방향 회귀 0개
- 주장과 무관한 주 FX 0개
- 첫·중간·마지막 프레임의 사람·손·제품 잘림과 빈 프레임 0개
- 800px 기준 한글 가독성 확보
- 미제공 소품과 구성품 오인 가능성 0건
- 제목·설명·상태 라벨·증거 FX의 겹침 0건
- `check --strict --frame-check` 오류·경고 0개
- 승인된 원본, 렌더 명령, FPS, 길이, 해시 기록
- `detail-page-flow-v1`의 역할 coverage와 전체 motion 개수 통과
- 구매 질문 하나를 1초 안에 답하고 first/mid/last 중 적어도 두 정보 상태가 의미적으로
  다르며 정지 이미지보다 설명력이 크다는 독립 QA
- 인접 pattern 차별성, decorative-overlay-only 0건, 정보 overlay 정확성,
  visible delta observation
- 일반 HTML offscreen poster·재진입 재시작·reduced-motion 검사
- 일반 HTML과 Wing의 public DOM→manifest→실파일 closure, animation frame 2+,
  780px·반복·파일 hash 검사. Poster는 fallback일 뿐 전달 motion으로 세지 않는다.
