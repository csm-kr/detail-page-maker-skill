# Asset Generation Guide

God Tibo 이미지 배치 생성, 제품 동일성, 무노이즈 상업 품질과 승인 절차를 정의한다.

## 기본 실행기

- 실행기: `scripts/god-tibo-batch-worker.mjs`
- 필수 로컬 스킬: `.agents/skills/god-tibo-gpt-image2-skill`
- 실제 생성 명령: `scripts/tibo-batch.mjs --job <job.json>`
- 기본 크기: `1024x1536`
- 한 배치 최대 작업: 8개
- 기본 동시 워커: 8개
- 한 작업의 최대 참조 이미지: 16개

12개 자산이면 `8 + 4` 두 배치로 실행한다. 여덟 작업은 서로 다른 자산 역할을
기본으로 하며 같은 프롬프트를 무의미하게 여덟 번 복제하지 않는다.

```powershell
node scripts/god-tibo-batch-worker.mjs `
  --studio-url "http://127.0.0.1:8896" `
  --jobs "job-01,job-02,job-03,job-04,job-05,job-06,job-07,job-08" `
  --concurrency 8
```

작업 수가 8개보다 적으면 실제 작업 수만큼만 워커를 연다. 동시성은 8을 넘기지
않는다.

새 이미지 생성은 `size_mode: "controllable"`과 사용자가 선택한 `target_size`를
사용한다. 기존 후보 수정은 첫 참조를 Image 1로 두고
`size_mode: "invariant"`로 원본 W×H와 구도·포즈를 보존한다. 실행 뒤에는 반드시
God Tibo가 작성한 `manifest.json`의 파일 경로, SHA-256, 응답 ID와 크기 검사를
확인한다.

## 배치 단위

한 배치는 구매 서사의 같은 단계에서 필요한 서로 다른 역할로 묶는다.

- 배치 A: 제품 히어로, 상면, 하면, 판매 구성
- 배치 B: 기능 증거, 매크로, 사용법, 선택 규칙
- 배치 C: 사용 상황, 문제 장면, 마감 장면, 순수 배경

제품이 없는 순수 배경 작업에는 제품 SSOT를 억지로 넣지 않는다. 제품이 있는
작업은 승인된 SSOT와 해당 면 참조를 우선한다.

## 무노이즈·무자글 품질 블록

모든 God Tibo 프롬프트 끝에 다음 품질 의도를 한 번만 넣는다.

```text
QUALITY_GATE:CLEAN_COMMERCIAL
Clean commercial product photography with controlled studio lighting,
smooth continuous gradients, crisp but natural edges, clean shadow transitions,
physically plausible material texture only, low-ISO clarity.
No film grain, no sensor noise, no chromatic noise, no dithering, no speckle,
no crunchy micro-texture, no halftone, no JPEG artifacts, no oversharpening,
no dirty shadow noise, no artificial surface glitter.
Do not hide detail with waxy blur or plastic skin smoothing.
```

자글거림을 흐림으로 덮지 않는다. 제품 표면·원단·피부의 실제 질감은 남기고,
무작위 색점·거친 입자·압축 무늬·과도한 샤프닝만 제거한다.

## 생성 순서

1. 제품 SSOT와 주장-증거 맵을 잠근다.
2. 자산마다 `role`, `claim_id`, `component_id`, `sourceRefs`, `prompt`를 기록한다.
3. Studio에 사용자 확인된 queued job을 만든다.
4. 최대 8개 job ID를 God Tibo 배치 워커에 전달한다.
5. 결과를 새 버전 파일명으로 `asset/generated/pending/image`에 저장하고
   `qaStatus: pending`으로 둔다.
6. 제품 동일성·카피·무노이즈 QA를 수행한다.
7. 원본과 후보를 옆 승인 세션에 전달한다.
8. 옆 승인 세션 검토 뒤 사용자가 Studio v1에서 승인한 파일만
   `asset/generated/approved/image`로 이동한다.
9. 승인된 버전만 GIF와 HTML 조립에 사용한다.

## 무노이즈 QA

100%와 200% 확대에서 다음 영역을 본다.

- 단색·그라데이션 배경의 점상 노이즈와 밴딩
- 제품 흰색·회색·검정 표면의 컬러 스페클
- 손·얼굴 피부의 모래 같은 입자와 왁스 질감
- 섬유의 실제 결을 덮는 과도한 디테일 생성
- 그림자 경계의 얼룩과 압축 블록
- 얇은 제품 외곽의 halo와 oversharpening

하나라도 상업 화면에서 눈에 띄면 후보를 승인하지 않는다. 후처리 블러로 통과시키지
말고 프롬프트와 조명을 교정해 새 버전을 생성한다.

## 제품 동일성 QA

- 실루엣·면·부품·수량·방향이 SSOT와 같다.
- 고유 인쇄·라벨·구멍·봉제·아치·패드 위치가 맞다.
- 좌우 한 쌍은 복제가 아니라 실제 거울 대칭이다.
- 손과 제품의 접촉, 삽입, 눌림이 물리적으로 자연스럽다.
- 생성 배경이 제품 구조의 새로운 사실을 만들지 않는다.

상세 게이트는 [`product-identity-imagegen.md`](product-identity-imagegen.md)를 따른다.

## 승인과 재생성

제작 세션은 생성 결과를 자가 승인하지 않는다. 한 배치의 여덟 결과는 개별 에셋으로
QA하고 옆 승인 세션에서 각각 `approved | changes_requested | held` 결정을 받는다.

수정은 기존 파일을 덮지 않고 새 후보 버전을 만든다. 승인 해시 뒤 픽셀이 바뀌면
이전 승인은 무효다.
