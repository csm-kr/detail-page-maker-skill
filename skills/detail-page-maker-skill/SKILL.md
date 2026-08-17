---
name: detail-page-maker-skill
description: 공급처 URL에서 근거를 수집해 쿠팡 1초 전달형 판매 논리, ChatGPT Image 2/God Tibo 32장·32 provider workers 동시 이미지 배치, HyperFrames 정보형 세일즈 모션과 MP4→FFmpeg GIF/WebP, 390px 편집 Studio, 공개 메타데이터 0건의 output/detail-page.html과 Wing 출력을 만든다. 상세페이지 신규 제작·카피·제품 이미지·GIF·Studio 편집·게시 QA·부분 수정·연구 학습·로컬 설치에 사용한다.
---

# Detail Page Maker

근거가 고정된 같은 SKU만 광고하고 승인된 자산만 조립한다. 판매 흐름은
`policies/detail-page-flow-v1.json`, 실행 순서·산출물 연결·검증·승인은
persistent Orchestrator가 강제한다.

## 실행

1. 항상 [`references/content-contract.md`](references/content-contract.md)와
   [`references/workflow.md`](references/workflow.md)를 읽는다. 제작 run이면
   [`references/build-flow.md`](references/build-flow.md)도 함께 읽고 그 실행
   순서와 판단 방식을 따른다.
2. 두 문서와 충돌하는 레거시 문서·프로젝트 관행은 적용하지 않는다.
3. 아래 표에서 현재 작업에 필요한 reference만 추가로 읽는다.
4. 이 스킬 폴더의 `.agents/skills/`에서 내장 의존 스킬을 찾는다.
5. `node scripts/detail-page.mjs doctor`로 단일 스킬 번들의 의존성을 검사한다.
6. G1 전에 `reference-library`로 주 아키타입 하나와 선택적 보조 아키타입
   하나를 고르고 category reference cohort와 공통 visual ambition anchor를
   ProductionPlan의 모든 section·image job·GIF brief에 바인딩한다.
7. `reference-profile`로 기존 `output/detail-page.html`과 사용자가 준 기준
   HTML을 hash/profile로 등록하고 adoption matrix를 작성한다.
8. mutating 진입점은 대상 프로젝트의 `.detail-page/exps/*.md`를 먼저 reconcile하고, 머신
   CPU/RAM 권장치·호스트 agent slot·실제 session 수의 최솟값으로 worker capacity를
   정한다. 호스트 session ID를 추측하거나 생성하지 않는다.
9. `workflow-status`로 sealed state와 다음 gate를 확인한다.
10. `workflow-advance` 또는 `workflow-resume`으로 다음 WorkOrder를 발급한다.
11. 준비된 frontier WorkOrder를 가용 sub-agent 수만큼 lease한다. 작업 하나씩
   기다리지 말고 독립 작업을 동시에 실행한다.
12. 하위 스킬은 WorkOrder의 runner로만 호출하고 결과를
   `worker-lease → 실행 → worker-submit`으로 제출한다.
13. 실제 원본 사진이 없으면 사용자 gate를 exact digest와 nonce로
   `workflow-decide` 승인한다. `input/product/` 원본 bytes가 검증된 run은
   G1 ProductionPlan만 사용자가 승인하고 나머지는 plan-once policy receipt로
   자동 진행한다.
14. `G0 → G1 → G2 → G3 → G4 → G5` 검증 순서는 건너뛰지 않는다. Fast path는
   사용자 확인 횟수만 줄이고 단계와 QA를 생략하지 않는다.
15. 승인 후 사진·이미지·GIF를 바꿀 때는
   `workflow-revision-plan → 사용자 검토 → workflow-revision-commit`을 따른다.
16. 오래 걸리는 run은 `performance-profile`로 stage trace를 분석한다. G2는 기본
   32장·32 provider workers의 단일 동시 배치, G3는 입력이 준비된 motion의 즉시
   병렬 시작, QA는 변경 member 우선 검사와 최종 다중 viewport 1회 캡처를 쓴다.

```sh
node scripts/detail-page.mjs doctor
node scripts/detail-page.mjs reference-library
node scripts/detail-page.mjs reference-profile --project "<project-path>" --reference "<reference.html>" --role positive_reference
node scripts/detail-page.mjs workflow-status --project "<project-path>" --project-id "<project-id>" --input-digest "<sha256>"
node scripts/detail-page.mjs workflow-advance --project "<project-path>" --project-id "<project-id>" --input-digest "<sha256>"
node scripts/detail-page.mjs performance-profile --trace "<trace.json>"
```

나머지 CLI 인자는 [`references/install.md`](references/install.md)와
[`references/workflow.md`](references/workflow.md)를 따른다.

## 작업별 reference

| 작업 | 읽을 문서 |
| --- | --- |
| 고정 판매 흐름·입출력·공개 형식 | [`content-contract.md`](references/content-contract.md) |
| 완주 run 실행 순서·실패 대응·검수 방식·작업 로그 | [`build-flow.md`](references/build-flow.md) |
| 공급처 근거·실제품·권리·SSOT | [`evidence.md`](references/evidence.md) |
| 시장 조사·상업 기획·카피 | [`commercial.md`](references/commercial.md) |
| ImageGen·pending·에셋 승인 | [`assets.md`](references/assets.md) |
| GIF·HyperFrames·필수 motion coverage | [`motion.md`](references/motion.md) |
| HyperFrames+ChatGPT Image 2 32장 샷·T1~T10·MP4 변환 | [`hyperframes-sales-motion.md`](references/hyperframes-sales-motion.md) |
| Studio 편집·덮어쓰기·복구 snapshot | [`studio.md`](references/studio.md) |
| 게시 QA·Wing·전달본 | [`publish.md`](references/publish.md) |
| Cloudflare owner·bootstrap·runtime integrity | [`cloudflare-security.md`](references/cloudflare-security.md) |
| 설치·진단·프로젝트 격리 | [`install.md`](references/install.md) |
| 연구·피드백·규칙 승격 | [`learning.md`](references/learning.md) |
| 디자인·어투 규칙 | [`taste.md`](references/taste.md) |
| 상태·artifact·adapter 내부 구조 | [`orchestration.md`](references/orchestration.md) |
| aisync 이미지형 flow 비교 | [`aisync-flow-comparison.md`](references/aisync-flow-comparison.md) |
| Behance 평가·부분 repair | [`behance-rubric.md`](references/behance-rubric.md) |
| 카테고리 분류·reference cohort·화려함 anchor | [`category-reference-library.md`](references/category-reference-library.md) |

## 하위 스킬

의존 스킬은 이 배포 폴더의 `.agents/skills/`만 사용한다. 하위 작업을 시작하기
전에 해당 폴더의 `SKILL.md` 원문을 끝까지 읽고 그 절차를 WorkOrder 안에서
실행한다. 별도 sibling·전역 스킬을 정상 경로로 사용하지 않는다.

- 공급처 근거: `dmk-extractor` (HTTP 직접 수집, 브라우저 불필요)
- 쿠팡 경쟁상품·상세·후기 근거: `coupang-extractor`와 `browser-harness`
- 기획·HTML: `design-taste-frontend`
- 이미지: `god-tibo-gpt-image2-skill`
- GIF: `hyperframes`, `hyperframes-core`, `hyperframes-animation`,
  `hyperframes-creative`, `hyperframes-cli`, `motion-graphics`

하나라도 누락되면 불완전한 배포본이므로 실행하지 않고 Git 원본에서 이 스킬
하나를 다시 설치하거나 업데이트한다. 이미지 작업은 내장 God Tibo의
`tibo-batch.mjs` 실행기만 사용한다. 기본은 서로 다른 목적의 `items` 32개를
한 job에 넣고 `workers: 32`로 즉시 실행하는 단일 provider batch다. 여기서
provider worker는 이미지 API 동시 요청이며 Codex sub-agent 수와 혼동하지 않는다.

## 멀티에이전트 실행

- G0 공급처 추출과 G1 시장 조사를 병렬 준비한다. 승인만 G0→G1 순서로 잠근다.
- G2는 한 이미지 cut당 한 worker를 배정하고 가용 slot을 채운다.
- G3는 한 motion module당 한 worker를 배정한다. 입력 이미지가 승인된 module은
  다른 이미지·motion과 병렬 실행한다.
- Commercial·Evidence·Identity·Visual·Motion·Technical QA는 서로 다른
  validator session으로 병렬 실행한다.
- 생산 agent가 자기 결과의 유일한 검수자가 될 수 없다.
- `worker_capacity = min(머신 권장치, 호스트 worker slot, 실제 고유 session 수)`를
  기본 auto 정책으로 쓴다. 메인 Orchestrator slot 하나는 예약한다.
- worker capacity는 연산 작업의 상한이다. 같은 로컬 Chrome/Browser Harness를
  공유하는 extractor는 별도 `browser_lane_capacity = 1`로 직렬 실행한다.
  서로 격리된 remote browser endpoint가 증명된 경우에만 browser lane을 늘린다.
- 실패 member와 실제 descendant만 다시 실행하고 통과한 형제 산출물은 재사용한다.
- G2의 기본 32개 provider 요청을 8개씩 나누거나 8×4 순차 배치로 실행하지 않는다.
  실패한 item만 같은 입력 digest로 재시도한다.
- artifact ID, 입력 digest, 실제 출력 위치, 다음 consumer, ExecutionReceipt,
  독립 ValidationReceipt가 하나라도 없으면 완료로 세지 않는다.

## 하드 계약

- 제작 run은 [`references/build-flow.md`](references/build-flow.md)의 실행 순서와
  판단 방식을 따른다. 이 문서는 플로우만 규정한다. 상품별 값(공급처·기준작 URL,
  사양, 카피, 좌표, 팔레트)은 담겨 있지 않으며 매 run의 근거에서 새로 확정한다.
  이전 run의 값을 다음 run으로 옮기지 않는다.
- run마다 `.detail-page/planning/BUILD-LOG.md`를 사후 기록으로 남긴다. 실제 실행한
  명령, 실제 받은 출력, 실패 코드, 재시도 결과, 그때의 판단 근거를 순서대로 적고
  실패를 지우고 성공만 적지 않는다. `하지 않은 것과 그 이유`와 `남은 리스크` 두
  절을 반드시 포함한다.
- 공급처 URL과 같은 SKU의 공급처 원문·이미지·locator·권리로 G0 제품 SSOT를
  잠근다. 실제 제품 사진은 선택 사항이며 없으면 최초 한 번만 알리고 계속한다.
- `input/product/`의 원본 사진 materialized bytes/hash가 검증되면
  `policy.approval.plan-once-with-actual-photos.v1`을 기본 적용한다.
  이때 G1 기획 승인만 수동이며 G0 SSOT·경쟁후보와 G2~G5 사용자 gate는 준비
  조건과 독립 QA PASS 뒤 exact subject digest에 자동 승인 receipt를 남긴다.
  원본 사진이 없으면 기존 수동 gate를 유지한다.
- 도매꾹은 `dmk-extractor`, 쿠팡은 `coupang-extractor`의 실제 portable bundle과
  검증 receipt를 사용한다. agent의 기억이나 검색 요약으로 대체하지 않는다.
- 공급처 이미지는 제품 동일성 SSOT와 ImageGen 참조로 사용하고 고객 광고에
  원본을 직접 싣지 않는다. 쿠팡·Behance 자산은 research-only다.
- G0 근거와 G1 시장 조사는 병렬 준비할 수 있지만 최종 승인은 순차로 한다.
- 공개 주장은 `claim → fact → evidence → section → media/HTML`로 추적한다.
- 확인되지 않은 효능·수치·후기·시험 결과를 만들지 않는다.
- 관찰 가능한 형상·부품은 `observable_structure`, 제조사 주장은
  `manufacturer_claim`, 독립 시험 효능은 `verified_efficacy`로 분리한다.
  효능 근거 부족을 이유로 눈으로 확인되는 구조 차별점까지 제거하지 않는다.
- 기존 output과 기준작의 section·구매 질문·image/motion 역할·390/780 밀도를
  비교하며 고유 자산·카피를 복제하지 않는다.
- 기준작이 같은 SKU면 고객 문제, 첫 장점, 장점 순서, 증명 방식, 사용법 위치,
  마지막 결정을 판매 논리로 추출해 적극 재구성한다. 유사 상품은 가설로만,
  다른 상품은 광고 문법으로만 사용하며 고유 이미지·문장은 복제하지 않는다.
- `coupang-wing-detail-780.html`은 기본 템플릿이 아니라 모든 카테고리의
  Hero 강도·챕터 리듬·장면 다양성·motion coverage·구매 마무리 수준을 정하는
  공통 visual ambition anchor다. 상품별 구매 문법은 선택한 category reference
  cohort를 따른다.
- 초기 분류는 구조·작동, 감각·질감, 착용·움직임, 공간·호환, 비교·구성,
  신뢰·근거의 6개 상위 아키타입이다. 주 아키타입 1개와 보조 최대 1개만
  선택하며 새 분류는 서로 다른 제품과 reference 3개 이상에서 반복된 뒤 늘린다.
- 선택한 주 아키타입의 개별 Behance reference card를 2개 이상 고르고 모든
  section·image job·GIF brief에 trait·변형 의도·acceptance check를 연결한다.
  누락 target이 있거나 이미지 역할 5종·장면 4종·단독 제품 35% 이하·motion
  pattern 4종을 충족하지 못하면 G2/G3를 시작하지 않는다.
- `Hero → 불편 → 제품 답 → 해결 → 사용 → 비교 → 선택 → 사양·주의 → FAQ →
  리마인드` 순서를 지킨다.
- 쿠팡 고객의 빠른 스크롤을 기준으로 각 section은 1초 안에 문제·핵심 장점·실제
  사용 또는 결과 중 해당 역할 하나가 이해되어야 한다. 한 section은 핵심 메시지
  하나, 직접 설계한 1~3줄 제목, 이를 즉시 증명하는 주 시각 하나만 갖는다.
- 제목·본문·제품의 중앙축을 일치시키고 제목은 390px에서 28px, 780px에서 44px
  이상을 기본으로 한다. 제품·사용 장면·결과·기능 확대·비교 중 하나가 화면의
  55% 이상을 차지하며 의미 없는 큰 상하 여백을 허용하지 않는다.
- Hero는 화려한 정적 화면, 제품 최대 크기, 핵심 장점 한 개로 제한한다.
- 불편 인용 말풍선은 3~5개, 문제 motion은 2개 이상이며 각 불편은 같은 순서의
  해결 장점에 1:1로 연결한다.
- 해결 장점은 3~5개이며 각각 정지 이미지·전용 motion·검증 근거·무기명 체감
  의견을 갖는다.
- motion hard floor는 5개지만 필수 역할을 적용한 실제 최소는 7개이며 기본
  범위는 7~9개다. 시간 변화가 더 명확하면 상한 없이 늘린다. 문제 2+, 해결
  장점별 1+, 사용 1+, 비교 1+ 역할을 빠뜨리지 않는다.
- 기획은 `policies/detail-page-flow-v1.json`의 deterministic validator를
  통과하기 전 G2 WorkOrder를 받을 수 없다.
- 각 artifact에 exact input digest, ExecutionReceipt, 독립
  ValidationReceipt와 immutable record를 남긴다.
- materialized member는 inspect·advance·resume·export 때 실제 bytes를 다시
  해시한다. 누락·변조·경로 이탈·symlink는 fail-closed한다.
- worker는 staging에만 쓴다. Orchestrator만 검증 후 state와 artifact graph를
  commit한다.
- 이미지·GIF는 `pending`에서 시작하고 사용자 승인 또는 plan-once 자동 승인
  receipt가 있는 member만 조립한다.
- 이미지 job은 one-cut-per-worker로 실행하고 실패 member만 재시도한다.
- 기본 image candidate 총합은 정확히 32이며 God Tibo 하나의 `items: 32`,
  `workers: 32` provider batch로 실행한다. 서로 다른 역할·장면을 기획 전에 배정한다.
- 이미지 job마다 역할·장면·제품 면·사용 맥락·조명·배경·점유율·차별화 목표를
  잠근다. Hero와 핵심 기능은 후보 2개 이상이며 실제 사용 맥락 coverage가 필요하다.
- CR/TR/MR은 ID/hash 목록만으로 적용 처리하지 않는다. 실제
  section/image job/GIF brief, required effect, acceptance check에 연결한다.
- GIF는 고객 질문, 시작·중간·끝 정보 상태, visible delta, 방식, 780 canvas, FPS,
  전달 형식과 MR packet을 가진다. 새 정보를 주지 않는 장식-only overlay는 motion으로
  세지 않지만, 치수·위치·단계·구성을 설명하는 정확한 overlay는 핵심 증거다.
- GIF 전에 샷 리스트를 확정하고 ChatGPT Image 2/God Tibo 32개 후보를 역할별로
  계획하되 물리 실행은 `items: 32`, `workers: 32` 단일 동시 batch로 유지한다.
  생성 후 8~15개를 선별하고 shot/template/anchor/bbox/safe-area/pair metadata를
  HyperFrames에 전달한다.
- HyperFrames 정보형 모션은 T1 Hero, T2 Dimension, T3 Hotspot, T4 Detail,
  T5 Before/After, T6 Steps, T7 Material, T8 Components, T9 Exploded,
  T10 Info Cards에서 선택한다. 한 GIF는 한 메시지를 1초 안에 설명한다.
- 제품 고정 이미지 위 정확한 SVG·마스크·콜아웃·데이터 카드 합성을 우선한다.
  정보가 늘지 않는 장식-only 움직임만 금지하며, 검증된 치수·부위·단계·구성을
  설명하는 overlay는 핵심 증명 방식으로 인정한다.
- 치수선·기능 콜아웃·사용 방향 화살표처럼 실제 위치가 핵심인 overlay는 승인된
  깨끗한 motion 배경을 Image 1로 둔 God Tibo `invariant` 내부 가이드 컷에
  `#FF00FF` 점만 추가하고, `scripts/motion/extract-locator-guides.mjs`로 좌표를
  추출한다. HyperFrames는 추출 좌표를 깨끗한 원본 위 SVG에만 사용하며 가이드
  이미지는 렌더·HTML·Wing·공개 media에 넣지 않는다.
- 방향 화살표는 장식적 빈 공간이 아니라 실제 동작 시작점과 손·도구·결합부의
  상호작용 끝점을 잇는다. 치수선은 실제 제품 외곽의 축별 시작·끝점을 잇고,
  source/guide의 픽셀 크기나 제품 geometry가 다르면 정밀 overlay를 만들지 않는다.
- 콜아웃은 confidence 0.85 이상 anchor, 0.60~0.85 bbox, 0.60 미만 별도 detail
  card로 전환한다. 실제 치수나 전후 pair가 없으면 해당 모션을 생성하지 않는다.
- HyperFrames 정본은 결정론적 무음 MP4다. GIF와 animated WebP는 FFmpeg로
  MP4에서 파생하고 HyperFrames 직접 GIF 렌더를 기본 경로로 사용하지 않는다.
- 모든 GIF는 목적, 카메라, 핵심 변화, 전환, 강조 그래픽을 먼저 표로 정한다.
  인접 GIF는 이 네 축 중 최소 두 축이 달라야 한다. 첫 프레임에 제품/문제·한 줄
  메시지·시각 근거가 모두 있어야 하며 픽셀 경계와 지각적 연속성을 함께 검사한다.
  색·형태·부품·비율·구성의 제품 불변 조건을 유지하고 생성형 모핑을 금지한다.
- 같은 주장을 정지 이미지와 GIF로 연속해서 중복하지 않는다. motion이 주매체면
  정지 이미지는 첫 프레임 poster fallback으로만 쓰거나 다른 증명 section으로 옮긴다.
- Studio는 편집 UI이며 저장한 working snapshot이 즉시 최신 편집 정본 revision이
  된다. 사용자가 확인하는 최신 진입점은 `output/detail-page.html` 하나이고,
  commit·QA·Wing export는 같은 저장 digest의 검증·파생 단계일 뿐 새 편집
  원본을 만들지 않는다.
- 디자인 기준은 390 CSS px, 전달 자산은 폭 780px다.
- 390px 저작 레이아웃을 고객 780px 화면의 좁은 중앙 열로 그대로 내보내지 않는다.
  공개 HTML도 780px 전달 프로필을 채워야 한다.
- 명시적 저장은 현재 `output/detail-page.html`을 덮어쓰고 콘텐츠 높이에 맞춘다.
  내부 복구 snapshot은 최근 20개만 유지한다.
- 고객 진입점은 `output/detail-page.html`이다. `deliverables/`와 공개
  `index.html`을 만들지 않는다.
- G5 완료는 export 후 실제 공개 HTML, manifest, `output/media/gifs` animation
  bytes와 2개 이상의 프레임을 다시 검사한다. Poster-only 전달은 hard fail이다.
- G2/G3 aggregate lease는 금지하고 item frontier만 사용한다. 각 item은 시간
  예산과 heartbeat 정책을 가지며 변경된 member와 descendant만 다시 실행한다.
- Wing Export마다 새 `{project_key}/{export_id}/section-NN.webp` CDN 경로를
  만들고 이전 경로를 덮어쓰지 않는다.
- 고객 HTML과 Wing에는 내부 ID·프롬프트·파일명·hash·QA·agent·생성 방식이
  0건이어야 한다.
- 디스크의 공개 `output/detail-page.html`에는 Studio 링크도 넣지 않는다. 로컬
  Studio 서버가 이 파일을 서비스할 때만 응답에 `Studio에서 수정하기` 런처를
  주입하며 원본 bytes와 Wing에는 반영하지 않는다.
- 현재 run은 승인된 KnowledgeSnapshot과 현재 상품 연구를 사용한다. 공용 규칙은
  독립 검증과 사용자 승인 뒤에만 다음 run의 active reference로 승격한다.
  예외적으로 사용자가 프로젝트의 `.detail-page/exps/`를 trusted drop으로 선택한 경우,
  `<project>/.detail-page/exps/*.md` 배치는 해당 문서의 안전한 규칙에 대한 standing approval이다.
  그래도 완료 품질·evidence bytes/hash·독립 session·일반화 검사를 통과하지 못한
  항목은 자동 승격하지 않고 quarantine한다.
- 같은 제작 run의 자체 점수는 그 run을 성공 경험으로 승격할 독립 근거가 아니다.
  Public-output QA와 기준 비교 또는 사용자 승인이 추가로 필요하다.
- Behance 경험과 HeyGenFrame 경험은 같은 `<project>/.detail-page/exps/` flat folder에 별도 Markdown으로
  둔다. Behance 반복 상업 원리는 CR, HeyGenFrame motion/frame은 MR, Studio
  편집 UX는 TR로 분리한다.
- 프로젝트 최상위 폴더는 `.detail-page`, `input`, `output`과 승인 migration용
  `.migration-archive`만 허용한다. 단계별 하위 폴더는 실제 사용 시 lazy-create하고
  루트에 임의 `assets`, `research`, `tmp`, `deliverables`를 만들지 않는다.
- 공용 category reference, ambition anchor, Studio runtime을 상품 프로젝트마다
  복제하지 않는다. 새 프로젝트는 `input/product`, `output/detail-page.html`,
  최소 `.detail-page` 상태만 만들고 planning·generation·QA·backup·Wing 폴더는
  실제 첫 write 때 생성한다.
- **입력 intake 규약.** 사용자가 워크스페이스 루트에 둔 제품 사진과 사진 압축본은
  프로젝트 입력이므로 루트에 남기지 않는다.
  - `new`는 루트 최상위의 이미지·`.zip`을 새 프로젝트로 흡수한다. `--no-intake`로만 끈다.
  - 기존 프로젝트로 옮길 때는 `intake --project <폴더> [--file <이름[,이름]>]`를 쓴다.
    남은 후보는 `intake-status`로 확인한다.
  - 이미지는 `input/product/`, 압축본은 이미지 멤버를 풀고 원본을 `input/source/`에 둔다.
  - 같은 SHA-256이 이미 `input/product/`에 있으면 다시 풀지 않는다.
  - **삭제하지 않고 이동만 한다.** 중복 원본도 `input/source/`에 보존한다.
  - 읽어내지 못한 압축본은 조용히 옮기지 않고 루트에 남긴 뒤 실패로 보고한다.
  - `projects/`, `.agents/`, `.claude/`, 점으로 시작하는 파일은 intake 대상이 아니다.
  - 기계 정본은 `scripts/lib/workspace-intake.mjs`, 회귀 검사는
    `scripts/tests/workspace-intake.test.mjs`다.
- **산출물 폴더 규약.** 이 스킬이 만드는 모든 파일은 프로젝트 폴더 하나에만 쌓인다.
  - 산출물 루트는 `<workspace>/projects/<프로젝트 폴더>/` 하나다.
  - 워크스페이스 루트에는 `projects/` 말고 어떤 폴더도 만들지 않는다. 특히 `exps/`와
    `.workspace/`를 만들지 않는다.
  - 워크스페이스 루트에 제품 사진·압축본을 방치하지 않는다. 위 intake 규약으로 흡수한다.
  - 스킬 설치 폴더(`.agents/skills/…`, `.claude/skills/…`)와 Git 저장소 안에는 산출물을
    쓰지 않는다. 스킬 폴더는 읽기 전용 입력이다.
  - 경험 drop은 `<project>/.detail-page/exps/`, 학습 receipt·격리·승격·run 기록은
    `<project>/.detail-page/learning/` 아래에 둔다.
  - 워크스페이스는 스킬 설치 위치에서 결정한다. cwd를 위로 훑지 않고 홈 디렉터리로
    fallback하지 않으므로, 어느 폴더에서 몇 번을 실행해도 같은 경로에 산출된다.
  - 규약 판정의 기계 정본은 `scripts/lib/output-location.mjs`이고 회귀 검사는
    `scripts/tests/output-location-contract.test.mjs`다.

## 완료

일반 HTML과 쿠팡 Wing은 같은 서버측 G5 gate를 사용한다. fresh artifact graph와
state seal, 게시 QA 97 이상, Behance quality 90 이상, critical dimension 85 이상,
content-flow hard failure 0, fresh G5 QA record, 사용자 게시 승인 또는 검증된
plan-once publish receipt, versioned CDN 원격 검증을 모두 확인한 뒤에만 완료로
보고한다. 선택 category cohort보다 낮은 여섯 시각 차원이 하나라도 있으면 점수와
무관하게 실패한다. plateau·budget 대기 또는
근거·권리 부족 상태는 완료가 아니라 `HOLD`다.
