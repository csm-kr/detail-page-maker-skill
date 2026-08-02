---
name: detail-page-maker-skill
description: 공급처 URL과 지정 쿠팡 URL을 받아 쿠팡의 판매 흐름을 현재 상품에 맞게 재기획하고, 약 30개 이미지와 약 10개 GIF가 포함된 폭 780px 상세페이지 HTML·Studio·Wing 출력을 만든다.
---

# Detail Page Maker

지정한 쿠팡 상세페이지의 판매 흐름을 빠르게 읽어 현재 상품의 사실과 자산으로
재구성한다. 기본 목표는 60분 안에 `output/detail-page.html`을 완성하는 것이다.

## 시작

1. 항상 [`references/workflow.md`](references/workflow.md)를 읽는다.
2. 조사·카피에는 [`references/commercial.md`](references/commercial.md), 이미지·GIF에는
   [`references/assets.md`](references/assets.md), Studio·Wing에는
   [`references/studio.md`](references/studio.md)를 필요한 시점에만 읽는다.
3. 설치·진단 요청일 때만 [`references/install.md`](references/install.md)를 읽는다.
4. 입력은 `supplier_url`, `coupang_url`, 선택적 실제 제품 사진이다. 사진은 한 번만
   확인하고 없으면 공급처의 동일 SKU 사진으로 계속한다.
5. `node scripts/detail-page.mjs doctor`로 내장 의존 스킬을 확인한다.

## 실행 원칙

- 지정 쿠팡 URL 하나를 기준작으로 삼는다. 시장 전체 검색, 경쟁사 순위화, 대량 후기
  분석, A/B/C 조립, Behance 조사는 기본 실행하지 않는다.
- 쿠팡에서 섹션 순서, 고객 질문, 카피 전략, 증명 방식, 밀도와 리듬을 Flow Map으로
  추출하고 공급처 사실에 연결해 자사 카피로 다시 쓴다.
- 중간 승인과 고정 대기시간 없이 끝까지 진행한다. 입력 접근 불가, 제품 불일치,
  사실·권리 근거 부족 또는 게시 실패일 때만 멈추고 필요한 한 가지를 요청한다.
- Orchestrator는 가용 slot을 채워 공급처 SSOT, 쿠팡 Flow Map, 카피·미디어 기획,
  제작, 독립 QA를 sub-agent에 병렬 위임한다. 한 생산자가 자기 결과의 유일한
  검수자가 되지 않는다.
- 같은 로컬 브라우저를 쓰는 수집만 한 lane에서 직렬화하고, 저장된 자료의 분석과
  기획은 병렬 실행한다. God Tibo provider 동시성은 agent slot과 별개다.
- 강제 안전선과 출력 계약을 제외한 섹션 수, 표현, 스타일, 자산 선택과 작업 분배는
  AI가 제품과 기준작에 맞게 자유롭게 판단한다.

## 제작

1. G0: 공급처와 선택 사진에서 제품 identity 및 공개에 필요한 사실만 잠근다.
2. G1: 쿠팡 Flow Map과 자사 카피, 약 30개 still job, 약 10개 GIF brief를 하나의
   Lean Page Plan으로 확정한다.
3. G2: 내장 `god-tibo-gpt-image2-skill`의 `tibo-batch.mjs`로 이미지를 한 번의
   동시 batch에 생성하고, 제품 동일성이 맞는 결과를 선별한다.
4. G3: HyperFrames 무음 MP4에서 GIF/WebP를 만들고 각 모션이 기능·변화·사용법 중
   한 질문에 답하게 한다.
5. G4: 승인된 자산을 폭 780px HTML로 조립하고 QA한 뒤 Studio working session을
   제공한다. Studio를 열지 않아도 완성본 생성은 멈추지 않는다.
6. G5: `output/detail-page.html`, `output/media/{images,gifs}/`, 요청된 경우 새
   namespace의 `output/wing/<export-id>/`를 검증해 확정한다.

## 필수 안전선

- 실제 사진이 있으면 최우선, 없으면 공급처 동일 SKU를 기준으로 실루엣·색·부품·
  수량·방향을 유지한다.
- 부품의 가동 범위, 분리 가능 여부, 결합 방향과 사용 자세 제약을 identity와 함께
  잠근다. 실물에서 불가능한 자세·결합·분리로 그려진 컷은 사용하지 않는다.
- 출처 없는 성능·효능·인증·수치·후기·판매량을 만들지 않는다.
- 권리 없는 쿠팡의 고유 이미지·문장·후기를 직접 복제하지 않고 판매 논리만 재구성한다.
- 모든 공개 이미지·GIF·HTML은 폭 780px에서 제품 동일성, 애니메이션, 누락,
  줄바꿈, 정렬, 가로 스크롤을 검사한다.
- 공개 HTML과 Wing에 프롬프트·모델·agent·파일명·경로·hash·QA·승인 상태 같은
  제작 메타데이터를 남기지 않는다.
