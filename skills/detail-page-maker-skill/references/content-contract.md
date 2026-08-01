# 상세페이지 절대 콘텐츠 계약

이 문서는 상세페이지의 판매 흐름·매체 수·사용자 공개 형식을 정하는 사람용
정본이다. 기획 compiler와 gate가 읽는 기계 정본은
`policies/detail-page-flow-v1.json`이다. 두 정본과 충돌하는 과거 reference,
template, 프로젝트 관행은 적용하지 않는다.

## 입력과 SSOT

- G1 전에 기존 `output/detail-page.html`을 `current_output` baseline으로
  profile한다. 사용자가 준 HTML·스크린샷은 `positive_reference`, 과거 실패본은
  `negative_reference`, 승인 결과는 `approved_exemplar`로 분리한다.
- Reference는 hash·section density·image/motion 역할·폭 profile만 연구에 쓰며
  고유 자산·카피·색상 조합을 복제하지 않는다. 모든 reference trait는
  `adopt | adapt | reject` 판단과 이유, 적용 section을 가진다.
- 모든 상품은 6개 상위 증명 아키타입 중 주 아키타입 하나와 보조 아키타입
  최대 하나를 선택한다. 주 아키타입의 Behance project card 2개 이상과 공통
  visual ambition anchor를 모든 section·image job·GIF brief에 바인딩한다.
  기준 원본은 스킬 안에 한 번만 두고 상품 프로젝트에 복제하지 않는다.
- 필수 사용자 입력은 공급처 URL 하나다. 실제 제품 사진은 최초 한 번만 요청하고
  있으면 `input/product/`의 최우선 SSOT로 쓴다. 없거나 답이 없으면 도매꾹
  공급처 동일 SKU를 SSOT로 선택하고 두 번째 질문 없이 계속한다.
- G1은 쿠팡 우선으로 최소 3개 경쟁사를 동일 SKU → 동일 카테고리 상위 판매상품
  → 보조 커머스 순으로 수집한다. 판매량·카테고리 순위·후기 수·평점 중 실제
  관찰 가능한 신호를 근거로 순위를 매긴다.
- 가장 좋은 A 페이지를 판매 흐름의 뼈대로 쓰고 B·C의 더 좋은 설명·소구·장점을
  보강한다. 섹션별 디자인 레퍼런스를 따로 정하고 순서를 잠근 뒤 모든 카피와
  시각은 현재 상품 SSOT·claim·evidence boundary로 다시 만든다.
- G1 ProductionPlan과 `BENCHMARK-ASSEMBLY.md`를 보여 준다. 사용자가 즉시 승인하면
  그대로 진행하고 명시적 반려가 없으면 exact challenge의 120초
  `auto_continue_at` 뒤 `policy_auto_after_timeout` receipt로 승인한다.
- G0의 SSOT·경쟁후보와 G2~G5 user gate는 각 단계 독립 QA PASS 뒤
  `policy_auto_after_plan` receipt로 자동 승인한다.
- Fast path는 사용자 확인을 줄이는 정책이다. 제품 불일치, 권리·근거 실패,
  deterministic QA 실패, animation 누락, 원격 게시 실패는 자동 통과시키지 않는다.
- 공급처 URL과 같은 SKU의 공급처 이미지는 필수다. 공급처 이미지는 제품 동일성
  SSOT와 ImageGen 참조로 최대한 사용하되 광고에 원본을 바로 싣지 않는다.
- 쿠팡·Behance 이미지와 카피는 조사 전용이다. 메시지 의도·구매 흐름·추상 시각
  문법은 배울 수 있지만 원본 자산과 고유 표현을 production에 복제하지 않는다.
- 동일 SKU reference는 상품의 물리적 특징과 구매 이유가 같을 수 있으므로 문제
  시작점, 첫 장점, 장점 순서, 증명 연출, 사용법 위치, 마지막 결정을 판매 논리로
  추출해 적극 재구성한다. 유사 상품은 소구 가설로, 다른 상품은 section 구조와
  광고 문법으로만 사용한다.
- 공급처·시장 출처와 내부 재구성 경로는 evidence에 보존하되 고객 화면에는
  표시하지 않는다.

제품 주장은 다음 경계를 사용한다.

- `observable_structure`: 실제 이미지에서 보이는 형상·부품·구멍·셀·굴곡.
  관찰 범위만 말하고 효과 크기를 붙이지 않는다.
- `manufacturer_claim`: 제조사 원문과 적용 조건을 함께 보존한다.
- `verified_efficacy`: 독립 검증 artifact가 있을 때만 성능·정량 결과를 사용한다.

효능 근거가 없다고 관찰 가능한 구조까지 구매 차별점에서 제거하지 않는다.
관찰 구조·제조사 근거·검증 효능에 해당하는 장점은 구매 이유로 적극 표현한다.
인증서가 필요한 주장과 확인되지 않은 정량 결과만 보류한다.

## 고정 판매 흐름

아래 순서를 건너뛰거나 문제와 해결을 한 카드에 합치지 않는다.

```text
화려한 정적 Hero
→ 고객 불편 인용 말풍선 3~5개
→ 핵심 불편 motion 2개 이상
→ 제품의 한 문장 답
→ 해결 장점 3~5개
→ 사용 과정
→ 기존 불편과 검증된 차이 비교
→ 사용 환경·호환·선택 기준
→ 구성·사이즈·사양·주의
→ 구매 불안 해소·FAQ
→ 문제와 해결 리마인드
```

Hero는 제품을 가장 크게 보여 주고 가장 중요한 장점 하나만 말한다. 조명·입자·광선·
원근·강한 대비로 상업적 강도를 높일 수 있지만 제품의 형태·부품·수량·색을 바꾸거나
분위기를 성능 증거로 사용하지 않는다.

Hero의 `largest`·`high`·동일성 보존은 기획 필드나 공개 DOM의 `data-*`
자기선언으로 통과시키지 않는다. G4 commit 전에 비공개 Hero assurance bundle을
만들어 현재 HTML SHA-256, 390 CSS px·2x capture, Hero section/product/다른
시각 요소의 bounding box, G2 같은 SKU source→승인 Hero asset identity trace,
Hero subtree의 GIF·video·animation·runtime 대상 0건, 핵심 benefit claim 정확히
1개를 기록한다. 제품 bbox는 Hero 면적의 35% 이상이면서 다른 모든 시각 요소보다
커야 하고, 별도 model ValidationReceipt의 상업 시각 점수는 90점 이상이어야 한다.
이 값과 validator code·prompt·정책 hash는
`policies/detail-page-flow-v1.json`의 `content.hero.output_assurance`에 고정한다.
독립 deterministic ValidationReceipt까지 exact digest로 일치해야 G4/G5가
소비할 수 있으며 bundle은 내부 revision에만 저장하고 고객 HTML에는 투영하지
않는다.

모든 section은 쿠팡 고객이 빠르게 스크롤해도 1초 안에 역할이 이해되어야 한다.
한 section에는 고객에게 전달할 한 문장, 직접 설계한 1~3줄 제목, 그 문장을 바로
증명할 이미지 또는 GIF 하나, 보조 근거 최대 2~3개, 다음 section으로 넘어갈 이유를
고정한다. 제목·본문·제품은 같은 중앙축에 두고 390px 제목 28px·780px 제목 44px
이상, 주 시각 점유율 55% 이상을 기본으로 한다.

## 문제와 해결의 1:1 연결

- 불편은 소구점으로 해결할 수 있는 내용만 3~5개 고른다.
- 공개 말풍선은 `“오래 입으면 답답하고 자꾸 말려 올라가요”` 같은 짧은
  비질문형·1인칭 의견으로 쓴다.
- 공개 화면에는 작성자·별점·구매 인증·`고객 불편 재구성` 표기를 붙이지 않는다.
- 내부 기획에는 각 불편의 근거와 `pain_id → solution_id → claim_id`를 보존한다.
- 시장 원문에서 적절한 문장을 찾지 못하면 검증된 사용 상황과 소구점에서 불편을
  재구성할 수 있으나 실제 후기로 표시하지 않는다.
- 문제 그룹 뒤에는 제품의 한 문장 답을 두고, 그 다음 별도 해결 그룹에서 같은
  순서로 3~5개 해결 장점을 제시한다.

각 해결 장점은 다음 다섯 요소를 모두 가진다.

1. 고객 효익 카피
2. 승인된 주매체 하나: 정지 이미지 또는 그 장점만 설명하는 전용 motion
3. motion을 쓸 때의 첫 프레임 poster, 또는 별도 근거 section의 정지 이미지
4. 검증된 제품 사실·구조·조건
5. `“오래 착용해도 조임 부담이 덜해요”` 같은 무기명 체감 의견

체감 의견은 검증된 장점을 고객 언어로 번역한 카피이지 실제 후기 레코드가 아니다.
실제 동일 SKU 후기가 생긴 뒤에만 작성자·별점·구매 인증이 있는 후기 섹션을 별도로
만든다. 실제 후기가 없으면 후기 섹션 자체를 생략한다.

## Motion 하우스 규칙

- 전체 motion hard floor는 5개다. 문제 2+·해결 최소 3·사용 1·비교 1 역할을
  적용한 실제 최소는 7개이며 기획 기본 범위는 7~9개다. 상한은 두지 않는다.
- 문제 2개 이상, 해결 장점마다 1개, 사용 과정 1개 이상, 비교 1개 이상을 배정한다.
- 시간 변화가 근거와 표현을 더 명확하게 만들면 기본 범위를 넘어 추가한다.
- 한 motion은 주장 하나·상태 변화 하나를 맡고 중복 장식 motion은 세지 않는다.
- 각 motion은 목적·카메라·핵심 변화·전환·강조 그래픽을 먼저 정하고 인접 motion은
  네 축 중 최소 두 축이 달라야 한다.
- 첫 프레임만 보여도 제품 또는 문제, 한 줄 메시지, 시각 근거가 함께 이해되어야 한다.
- loop는 첫·끝 픽셀뿐 아니라 속도·방향·밝기·카메라 움직임의 지각적 연속성을
  검사한다. 색·형태·부품·비율·구성의 제품 불변 조건을 유지하고 모핑을 금지한다.
- 같은 주장 아래 정지 이미지와 GIF를 연속으로 쌓지 않는다. motion이 주매체면
  정지 이미지는 poster fallback 또는 다른 증명을 위한 별도 section으로만 쓴다.
- 일반 HTML은 보이는 motion만 재생하고, 화면 밖에서는 poster를 보이며, 다시
  진입하면 처음부터 재생한다.
- Wing은 viewport 제어가 없으므로 애니메이션 WebP로 지속 재생한다.
- 첫·중간·끝, 반복 경계, 제품 동일성, 한글, 점멸, fallback을 모두 검증한다.
- 고객 구매 질문, 기능 부위, 시작·중간·끝 정보 상태, visible delta, 정지 이미지의
  한계, 1초 내 답, 패턴 차별성까지 검증한다. 제품이 고정되어도 검증된 선·라벨·
  카드가 치수·위치·단계·구성을 새로 설명하면 인정하고, 새 정보가 없는 장식-only
  움직임은 coverage에 포함하지 않는다.
- HyperFrames는 결정론적 무음 MP4를 정본으로 렌더하고 FFmpeg가 GIF와 animated
  WebP를 파생한다. HyperFrames 직접 GIF 렌더는 기본 제작 경로가 아니다.

## 390 최종 Studio와 공개 출력

- Studio의 유일한 디자인 기준은 논리 폭 390 CSS px이다.
- 이미지·motion·Wing 섹션 자산은 물리 폭 780px로 만든다.
- 고객 공개 HTML의 콘텐츠 폭도 780px 전달 profile을 채운다. 390px 저작
  레이아웃을 780px 안의 좁은 중앙 열로 두는 결과는 실패다.
- Studio는 G4 조립과 사전 QA 뒤에만 여는 최종 편집 UI다. 조사·기획·에셋 승인·
  workflow 제어는 Studio의 사용자 단계로 두지 않는다.
- exact `session_id`의 `/studio/working/state`와 `/studio-working.html`을 불러오고
  `최종 수정 저장`은 `/studio/working/save`로 mutable G4 working revision만
  갱신한다. 공개 HTML은 이후 commit·capture·QA가 통과해야 갱신한다.
- Studio 저장마다 내부 snapshot을 남기고 최근 20개를 유지한다.
- 디스크의 `output/detail-page.html`과 Wing에는 Studio 링크를 저장하지 않는다.
  로컬 Studio 서버가 이 파일을 서비스할 때만 응답에 exact session의
  `Studio에서 최종 수정` 링크를
  주입하고 canonical bytes는 보존한다.
- 저장 뒤에는 QA·commit·`wing_export_required` 처리를 자동 재개한다. 이 상태의
  로컬 preview는 편집 결과와 같지만 아직 새 CDN 게시본은 아니다.
- Wing Export와 원격 검증이 끝나면
  `output/wing/<export-id>/detail-page.html` 파생 전달본만 확정한다.
  검증된 `output/detail-page.html`은 임의로 덮어쓰지 않고
  `wing_export_required`를 해제한다.

```text
<project>/
├─ input/
│  └─ product/
├─ output/
│  ├─ detail-page.html
│  ├─ media/
│  │  ├─ images/
│  │  └─ gifs/
│  └─ wing/
└─ .detail-page/
   └─ authoring/               숨은 최신 editable revision
```

새 프로젝트가 처음 만드는 것은 위 최소 경로뿐이다. `planning`, `evidence`,
`generation`, `workflow`, `backups`, `research`, `qa`, Wing과 media는 해당
단계의 첫 실제 write에서만 만든다. Studio runtime은 스킬에서 직접 제공하며
프로젝트 안에 만들지 않는다. 프로젝트 루트 directory는
`input`, `output`, `.detail-page`, `.migration-archive`만 허용한다.

`deliverables/`와 공개 `index.html`은 만들지 않는다.

## Wing과 CDN

Studio 저장은 CDN을 바꾸지 않는다. `Wing Export`를 누를 때마다 새 `export_id`를
만들고 다음 경로 아래에 모든 섹션을 새로 올린다.

```text
{cdn_root}/{project_key}/{export_id}/section-01.webp
```

정적 섹션은 정적 WebP, motion 섹션은 애니메이션 WebP다. 이전 export 경로를
덮어쓰거나 삭제하지 않는다. 로컬·원격 manifest에는 순서·URL·바이트·MIME·SHA-256을
남기고 원격 검증을 통과해야 Wing HTML을 완료한다. 복구는 이전 export manifest를
선택하는 방식으로 한다.

CDN 주소와 인증정보는 Studio 입력값이 아니다. 서버가 프로젝트의 secret 없는
`.detail-page/cloudflare-pages.json`과 OS keyring OAuth를 사전 검증하고
`public_base_url/{project_key}/{export_id}`를 파생한다. 프로젝트 로컬 pinned
Wrangler 이외의 전역·즉석 다운로드 CLI는 실행하지 않는다. config에는 표시용
`publisher_id`, 프로젝트 로컬 Wrangler entrypoint bytes의
`wrangler_entry_sha256`, 전체 `node_modules` dependency tree의
`wrangler_runtime_tree_sha256`, machine-local HMAC-derived
`writer_owner_digest`를 고정한다. owner HMAC은 target·branch·Wrangler
version·entry/tree hash·canonical runtime/lock/bootstrap path·permission
execution policy를 함께 결박한다. canonical file manifest·package
version·entry hash·전체 tree hash·symlink/reparse 검증 중 하나라도 실패하면
CLI를 시작하지 않는다. production runner는 Node 22.15+ permission launcher에서
전체 tree를 다시 검증하고 manifest-pinned memory bytes를 load hook으로 반환한다.
package `main`·`exports`·`imports`와 bare/self/relative resolution도 봉인된
metadata/file set만 사용하고 Node의 다음 resolver에는 builtin만 위임한다.
CommonJS는 exact-byte memory loader에서 실행한다. disk snapshot은 만들지 않고
child·worker·native addon·WASI 권한도 열지 않는다.

Cloudflare Pages 배포는 원격 `deploy-index.json`에 기록된 모든 과거 namespace를
새 snapshot에도 포함해야 한다. 과거 경로 보존을 증명할 수 없거나 새 namespace에
HTTP 200 파일이 이미 있으면 fail-closed한다. 새·과거 자산의 HTTP·MIME·크기·
SHA-256·immutable cache 검증이 모두 통과하기 전에는 새 Wing export를 완료
처리하거나 `wing_export_required`를 바꾸지 않는다. 성공한 Wing도 Studio
Save가 만든 `output/detail-page.html` 편집 정본을 덮어쓰지 않는다.
deploy-index의 owner는 config 문자열이 아니라 machine-local writer
identity/secret에서 파생한 HMAC `writer_owner_digest`로 고정하고 generation은
배포마다 정확히 1 증가한다. config pin과 local-derived owner가 다르거나 원격
index가 ownerless·다른 owner면 정상 uploader는 어떤 migration receipt도 받지
않고 중단한다. writer 이전에는 새 Pages project/base URL이 필요하다. 최초
404·deployment 0 상태도 target·owner에 결박되고 machine-local HMAC으로 서명된
typed bootstrap receipt가 필수다. 동일 머신의 같은 Pages 대상은 OS temp가 아닌 stable machine-local
shared exclusive lock 안에서 원격 index read부터 staging·배포 직전
bytes/generation CAS·deploy·own generation과 전체 자산 검증까지 실행한다.
다른 머신은 같은 `publisher_id`를 복사해도 owner secret이 없어 게시할 수 없다.
세부 형식은 `cloudflare-security.md`를 따른다.

## 공개 금지

고객 화면에는 제품 사실·효익·사용·선택 정보만 둔다. 다음은 0건이어야 한다.

- claim·fact·evidence ID
- 프롬프트·모델·agent·생성 방식
- 파일명·로컬 경로·hash·QA 점수·승인 상태
- 재구성·제조사 확인 같은 제작 과정 표기
- 로컬 Studio 런처와 모든 `data-*` 저작 속성
- 가짜 후기·가짜 구매 버튼·출처 없는 수치

접근성 `alt`는 내부 메타데이터가 아니라 고객이 이해할 제품 설명이므로 유지한다.
