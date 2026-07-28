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
- `before_after`: `팔에는 여유를, 손등에는 이어지는 길이를` 같은 구조 설명에서 `그늘은 길게, 실루엣은 가볍게`처럼 고객이 기억할 대비와 이미지 언어로 전환했다.
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

상품 고유 부품명, 카피, 색, 수치와 고객 상황은 `project-only`로 유지한다.
`candidate-shared` 항목은 다른 프로젝트 또는 회귀 테스트로 재검증하기 전까지 공용 스킬 규약에 반영하지 않는다.
