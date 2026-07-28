# 루즈핏 쿨토시 - Project Learnings

## Source

- `supplier_url`: http://domeggook.com/55873582?affid=
- `status`: REV-021_LEARNING_CAPTURED
- `guide`: `detail-page-maker-skill/references/learning-loop.md`

## LEARN-001

- `category`: product-fact
- `scope`: project-only
- `observation`: 완전한 단품은 공급처 표기 47×14cm의 약 3.36:1 비율로 길고 좁게 보여야 하며, 라벨은 손등 커프 면에 평평하게 봉제된 상태로만 보여야 한다.
- `evidence_paths`: `product/PRODUCT-SSOT.md`, `qa/reports/g2-image-assets-rev004.json`, `asset/asset-manifest.json`
- `before_after`: 짧거나 넓어진 후보와 손바닥 쪽 라벨 후보를 반려하고 A01·A03·A04·D01·D08·E07·E08 수정본을 승인했다.
- `risk_if_reused`: 다른 상품의 치수와 라벨 위치에 적용하면 제품 동일성을 훼손한다.
- `next_validation`: 이 프로젝트의 신규 파생 이미지나 썸네일을 만들 때 동일한 길이 비율과 라벨 면을 다시 검사한다.
- `promotion_status`: local

## LEARN-002

- `category`: gif
- `scope`: candidate-shared
- `observation`: GIF를 애니메이션 WebP로 최적화할 때 연속 동일 프레임은 병합될 수 있으나 총 재생시간과 반복 설정을 기준으로 동작 동일성을 검증할 수 있다.
- `evidence_paths`: `asset/output/page/rev017/package-manifest.json`, `qa/reports/g5-publish-rev017.json`
- `before_after`: 승인 GIF 10개 227.14MiB를 애니메이션 WebP 10개로 변환하면서 각 3,200ms와 무한 반복을 유지했다.
- `risk_if_reused`: 프레임 수만 비교하거나 장면 전환이 중요한 GIF에 무조건 적용하면 타이밍 오류를 놓칠 수 있다.
- `next_validation`: 다른 제품 프로젝트 1개 이상에서 시작·중간·끝 프레임과 총 재생시간을 함께 회귀 검사한다.
- `promotion_status`: local

## LEARN-003

- `category`: qa
- `scope`: candidate-shared
- `observation`: 편집용 DOM에서 제작 메타데이터와 스크립트를 제거한 구조 동등 공개본을 먼저 HTML 검증하고, 최종 독립 실행본은 내장 자산 수·해시·재오픈을 별도로 확인하면 대용량 출력도 안정적으로 검증할 수 있다.
- `evidence_paths`: `.scratch/g5-public-skeleton-rev017.html`, `qa/reports/g5-publish-rev017.json`, `qa/evidence/g5-publish/rev017/`
- `before_after`: 편집본의 자산 ID와 편집 런타임을 제거하고 50개 WebP를 내장한 독립 실행 HTML을 생성해 5개 뷰포트에서 검사했다.
- `risk_if_reused`: 구조 동등본과 최종 출력 사이의 변환 단계가 달라지면 검증 결과를 신뢰할 수 없다.
- `next_validation`: 패키징 스크립트가 HTML 구조 변경 없이 `src` 값만 치환하는지 자동 회귀 테스트로 고정한다.
- `promotion_status`: local

## LEARN-004

- `category`: public-copy
- `scope`: candidate-shared
- `observation`: 고객 화면은 제조사 확인·생성 방식·검수 과정을 설명하는 곳이 아니다. 내부 사실을 고객의 상황, 망설임과 편익의 방향으로 번역해야 상업 문장으로 읽힌다.
- `evidence_paths`: `docs/research/behance-commercial-language-study-55.md`, `docs/references/commercial-copy-tone-guide.md`, `planning/COMMERCIAL.md`
- `before_after`: 구조 직역과 감성 반복을 줄이고 `조이지 않게 여유롭고, 손등까지 길게`처럼 제품 차이와 구매 효익을 첫 화면에서 직접 말하도록 전환했다.
- `risk_if_reused`: 비유가 제품 사실을 넘어 성능 보장으로 읽히지 않도록 주장 경계가 필요하다.
- `next_validation`: 다른 상세페이지 1개에서 고객 이해도와 내부 용어 0건을 회귀 검사한다.
- `promotion_status`: skill-adopted

## LEARN-005

- `category`: buyer-journey
- `scope`: candidate-shared
- `observation`: 서로 다른 불편 3개를 먼저 보여 주고 각 장점 바로 다음에 전용 GIF를 붙이면 문제와 증거의 연결이 끊기지 않는다.
- `evidence_paths`: `planning/BUYER-JOURNEY.md`, `planning/GIF.md`, `skills/detail-page-maker-skill/references/commercial-effects-and-claim-proof.md`
- `before_after`: 페이지 뒤쪽에 상세 증거를 모으던 구조를 제거하고 비교·쿨링·스타일·사용법·구성 GIF를 해당 주장 직후로 이동했다.
- `risk_if_reused`: 장점 수만 늘리면 페이지가 반복되므로 서로 다른 구매 질문인지 먼저 검사해야 한다.
- `next_validation`: rev021 5개 뷰포트에서 주장 다음 첫 동적 증거까지의 거리를 검사한다.
- `promotion_status`: skill-adopted

## LEARN-006

- `category`: image-identity
- `scope`: project-only
- `observation`: 이 제품의 위쪽 밴드는 평평한 하나의 링이며 두 줄이 교차해 꽈배기처럼 보이면 다른 제품으로 읽힌다.
- `evidence_paths`: `product/PRODUCT-SSOT.md`, `planning/GIF.md`, `planning/COMMERCIAL-CREATIVE-MEMORY.md`
- `before_after`: 착용 전환 프롬프트와 GIF 하드 QA에 무꼬임·무교차 조건을 추가했다.
- `risk_if_reused`: 다른 제품의 의도된 꼬임 구조에는 적용하면 안 된다.
- `next_validation`: 모든 신규 실착 후보와 GIF의 첫·중간·끝을 200%로 확인한다.
- `promotion_status`: project-only

## LEARN-007

- `category`: output-contract
- `scope`: candidate-shared
- `observation`: `asset/`와 `output/`이 함께 있으면 사용자에게 실제 결과 위치가 모호하다. 작업 폴더와 전달 폴더를 분리하고 개정별 `deliverables/<revision>/index.html` 하나를 진입점으로 고정해야 한다.
- `evidence_paths`: `.scratch/issues/sallang-rev021-commercial-refresh/spec.md`, `skills/detail-page-maker-skill/references/asset-management.md`
- `before_after`: rev021부터 사용자용 결과를 `deliverables/rev021-commercial/index.html`로 고정하고 media·manifest·최종 QA만 같은 개정 폴더에 둔다.
- `risk_if_reused`: 빌드 산출물이 갱신됐는데 deliverables 복사가 누락되면 오래된 결과를 열 수 있다.
- `next_validation`: manifest 해시와 deliverables 파일 해시 일치 검사를 자동화한다.
- `promotion_status`: skill-adopted

## LEARN-008

- `category`: gif-claim-fx
- `scope`: candidate-shared
- `observation`: 모든 GIF에 주장과 직접 연결된 주 FX를 최소 1개 지정해야 움직임이 장식이 아니라 증거로 읽힌다.
- `evidence_paths`: `planning/GIF-FX-MAP.md`, `hyperframes/projects/gif-core-016-020-commercial-v03/index.html`, `asset/generated/pending/gif/rev022-commercial-fx-v01/manifest.json`
- `before_after`: 단순 줌·광선 중심 표현을 비교 와이프, 쿨 스윕, 매치컷, 단계 진행, 구성 리빌, 측정선으로 바꿨다.
- `risk_if_reused`: 효과 수만 채우면 다시 장식이 되므로 `claim_fx`가 어떤 구매 질문을 답하는지 기록해야 한다.
- `next_validation`: 다른 상품의 모든 GIF manifest에서 `claimFx.length >= 1`을 검사한다.
- `promotion_status`: skill-adopted

## LEARN-009

- `category`: gif-copy
- `scope`: candidate-shared
- `observation`: GIF 위의 HTML 카피는 고객 상황과 편익을, GIF 내부 문구는 상태·단계·수량을 맡겨야 같은 메시지를 두 번 읽지 않는다.
- `evidence_paths`: `planning/GIF-FX-MAP.md`, `deliverables/rev021-commercial/index.html`
- `before_after`: 착용 GIF의 `EASY 3 STEP`과 구성 GIF의 `ONE SET / TWO SLEEVES` 중복 문구를 제거하고 각각 `3 STEP`, `1 SET / 2 PCS`만 남겼다.
- `risk_if_reused`: 단어 하나가 겹친다는 이유로 필요한 상태 라벨까지 지우면 이해가 어려워질 수 있다. 문장·역할 중복을 검사한다.
- `next_validation`: 외부 figcaption과 내부 문구의 정규화된 완전 일치 0건을 자동 검사한다.
- `promotion_status`: skill-adopted

## LEARN-010

- `category`: qualitative-claim
- `scope`: candidate-shared
- `observation`: 정량 시험이 없는 쿨 소재는 그래프처럼 측정 결과로 보이는 형식보다 승인 실착 위 열감 오버레이 제거·쿨 스윕·공기 흐름으로 정성 방향을 보여 주는 편이 정확하고 즉각적이다.
- `evidence_paths`: `research/coupang-9623659088-ad-reference-20260728.md`, `planning/GIF-FX-MAP.md`, `asset/generated/pending/gif/rev022-commercial-fx-v01/gif-017-cooling-sweep-v04.gif`
- `before_after`: 무수치 막대·꺾은선 그래프와 제품과 무관한 서리 연출을 제거하고 실제 모델 착용 장면 위 짧은 쿨 스윕으로 교체했다.
- `risk_if_reused`: FX가 실제 온도 측정이나 즉시 냉각 보장으로 읽히지 않도록 수치·열화상 범례·시험 문구를 금지해야 한다.
- `next_validation`: 다른 정성 기능 상품에서 그래프 금지와 주장 이해도를 회귀 검사한다.
- `promotion_status`: skill-adopted

## LEARN-011

- `category`: size-proof
- `scope`: candidate-shared
- `observation`: 길이 숫자만 표에 쓰면 어느 구간인지 알기 어렵다. 규격표 바로 위에서 승인 제품의 실제 두 끝점을 잇는 전용 치수 위치 GIF가 필요하다.
- `evidence_paths`: `asset/generated/approved/image/b07-measurement-flatlay-v01.png`, `asset/generated/pending/gif/rev022-commercial-fx-v01/gif-021-size-47cm-guide-v01.gif`, `deliverables/rev021-commercial/index.html`
- `before_after`: `47cm` 표기만 있던 규격 장에 위쪽 밴드부터 손등 커프 끝까지 측정선·끝단 캡·`약 47 cm` 라벨이 움직이는 GIF를 추가했다.
- `risk_if_reused`: 상품마다 축과 측정 기준이 다르므로 이 프로젝트의 47cm 값이나 좌표를 복제하면 안 된다.
- `next_validation`: 다음 상품에서 공급처 치수의 시작점·끝점과 규격표 직전 배치를 검사한다.
- `promotion_status`: skill-adopted

## LEARN-012

- `category`: studio-and-archive
- `scope`: candidate-shared
- `observation`: 모든 가시 요소 선택, 위치·글꼴·색·텍스트 비우기·실행 취소를 한 패널에서 제공하고 비활성 자산은 체크섬과 복구 경로를 남겨 archive로 이동하면 편집성과 보존성을 함께 확보할 수 있다.
- `evidence_paths`: `html/studio.html`, `html/studio-v1.js`, `archive/legacy-assets/2026-07-28/README.md`, `archive/legacy-assets/2026-07-28/checksums.sha256`
- `before_after`: 텍스트·이미지 일부만 편집하던 Studio를 전체 의미 요소 선택과 6개 글꼴·색·위치·undo로 확장하고, 충돌하던 `assets/`는 삭제 대신 archive로 이동했다.
- `risk_if_reused`: 자동 선택자가 장식용 내부 노드까지 과도하게 선택하거나 archive 이동 뒤 활성 참조가 남을 수 있다.
- `next_validation`: Studio 런타임 계약 테스트와 archive 체크섬·활성 경로 0건 검사를 유지한다.
- `promotion_status`: skill-adopted

## LEARN-013

- `category`: sales-copy
- `scope`: candidate-shared
- `observation`: 감성 문장만 반복하면 제품이 예뻐 보여도 결제 질문에 늦게 답한다. 판매 정보 70 : 브랜드 감성 30, 제품 우선 Hero, `특징 → 고객 효익 → 사용 장면 → 즉시 증거`가 필요하다.
- `evidence_paths`: `deliverables/rev022-sales-first/index.html`, `docs/references/sales-copy-and-purchase-confidence.md`, `qa/reports/rev022-sales-first.md`
- `before_after`: 모델 중심 감성 Hero와 후반 구매 질문을 제품 한 쌍 중심의 직접 Hero와 앞쪽 BEFORE YOU CHOOSE로 바꿨다. 라벨 소구를 제거하고 핏 비교는 팔 중심으로 크롭했다.
- `risk_if_reused`: 판매 정보 비율을 채우기 위해 확인되지 않은 소재·치수·효능을 만들면 안 된다.
- `next_validation`: 다른 상품 한 개에서 구매 질문의 앞쪽 배치, 장점 반복 2회 이하, 제품 중심 비교를 회귀 검사한다.
- `promotion_status`: skill-adopted

## LEARN-014

- `category`: studio-editing
- `scope`: candidate-shared
- `observation`: 위치 이동과 텍스트 입력이 같은 모드에 있으면 드래그와 편집이 충돌한다. `V 요소 배치`와 `T 텍스트 변환`을 분리하고 중심·안전선 스냅, 네 정렬, 삭제·undo를 제공해야 한다.
- `evidence_paths`: `html/studio.html`, `html/studio-v1.js`, `html/app.js`, `docs/studio/v1-editor-contract.md`
- `before_after`: 단일 수정 모드를 상호 배타적인 두 도구로 나누고 좌우 8% 안전선·캔버스 중심·섹션 중심 보조선과 단축키를 추가했다.
- `risk_if_reused`: 텍스트 입력 중 V/T/Backspace를 도구 단축키가 가로채면 문구 편집이 손상된다.
- `next_validation`: 브라우저에서 텍스트 입력·정렬, 요소 드래그·스냅·삭제·undo를 회귀 검사한다.
- `promotion_status`: skill-adopted

상품 고유 부품명, 카피, 색, 수치와 고객 상황은 `project-only`로 유지한다.
`candidate-shared` 항목은 다른 프로젝트 또는 회귀 테스트로 재검증하기 전까지 공용 스킬 규약에 반영하지 않는다.
