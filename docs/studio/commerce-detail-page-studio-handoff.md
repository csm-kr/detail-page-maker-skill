# Commerce Detail Page Studio — Handoff

이 문서는 `commerce-detail-page-studio`를 유지보수하거나 서비스로 확장할 개발자를 위한 인수인계 문서다. 실행 절차는 `SKILL.md`에, 세부 제작 규칙은 다른 `references/` 문서에 있다. 여기서는 제품 경계, 데이터 계약, 개발 우선순위, 품질 게이트를 다룬다.

## 목차

1. 목표와 비목표
2. 절대 지켜야 할 계약
3. 현재 구성
4. 레이어별 책임
5. 권장 데이터 모델
6. 실행 파이프라인
7. 스킬과 서비스의 경계
8. 개발 우선순위
9. 검증과 회귀 테스트
10. 주요 실패 패턴
11. 완료 정의
12. 다음 개발자의 첫 작업

## 1. 목표와 비목표

### 목표

- 제품 사진, 확인된 정보, 옵션, 패널 수, 레퍼런스를 받아 완성도 높은 세로형 상세페이지를 만든다.
- 기본 산출물은 폭 `780px`, 패널당 `780 × 1560px`, 정확한 `1:2` 비율의 독립 실행형 HTML이다.
- 원본 제품의 정체성을 유지하면서 imagegen으로 캠페인 수준의 이미지 자산을 만든다.
- CSS 또는 HyperFrames 모션을 기능 설명에 사용한다.
- 자동 검증과 브라우저 시각 QA를 모두 통과한 결과만 전달한다.

### 비목표

- 제품 정보나 성능을 추측해 판매 문구로 확정하지 않는다.
- 의료 효능, 인증, 시험 결과, 리뷰, 판매량, 할인율, 수치 성능을 생성하지 않는다.
- 레퍼런스의 로고, 문구, 일러스트, 고유한 트레이드 드레스를 복제하지 않는다.
- HyperFrames를 이미지 생성기로 취급하지 않는다.
- 장식용 모션을 품질의 대체물로 사용하지 않는다.

## 2. 절대 지켜야 할 계약

### 제품 진실성

모든 사실은 다음 상태 중 하나여야 한다.

| 상태 | 의미 | 판매 문구 사용 |
|---|---|---:|
| `confirmed` | 사용자가 제공했거나 사진에서 직접 확인 가능 | 가능 |
| `inferred` | 합리적 추정이지만 증명되지 않음 | 불가 |
| `unknown` | 확인 자료 없음 | 불가 |
| `prohibited` | 사용자 또는 정책상 사용 금지 | 불가 |

제품명, 실제 판매 옵션명, 사이즈 가이드에 표시할 치수는 차단 필드다. 누락되면 한 번에 묶어 질문하고 임의 값으로 진행하지 않는다.

### 제품 동일성

생성 이미지에서 다음 항목을 보존한다.

- 실루엣과 비율
- 색상과 재질 인상
- 두께와 곡률
- 구멍, 봉제, 모서리, 패턴
- 로고 위치와 포함 부품

하나라도 실물과 달라지면 해당 이미지는 폐기한다. “더 예뻐 보임”은 동일성 훼손의 예외 사유가 아니다.

### 출력 규격

- 기본 폭: `780px`
- 패널 크기: `780 × 1560px`
- 기본 패널 수: 8
- 가로 오버플로: 없음
- 모바일: 비율을 유지하며 축소
- 이미지: 독립 실행형 HTML에 임베드
- 접근성: 의미 있는 `alt`
- 모션: `prefers-reduced-motion` 대응
- 기본 파일 크기 목표: 25MB 이하

## 3. 현재 구성

```text
commerce-detail-page-studio/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── references/
│   ├── input-schema.md
│   ├── page-architecture.md
│   ├── visual-direction.md
│   ├── motion-storyboard.md
│   ├── hyperframes-motion.md
│   ├── quality-rubric.md
│   └── handoff.md
└── scripts/
    └── validate_detail_page.py
```

문서 역할:

- `input-schema.md`: 입력 필드, 사진 역할, 사실 상태
- `page-architecture.md`: 8/10패널 판매 서사와 밀도
- `visual-direction.md`: 4개 타입 역할과 포스터 아키타입
- `motion-storyboard.md`: CSS/HyperFrames 선택과 모션 비트
- `hyperframes-motion.md`: 렌더 프로젝트 계약과 검증
- `quality-rubric.md`: 100점 기준, 차단 실패, 시각 QA
- `validate_detail_page.py`: 소스 수준의 최소 불변조건 검사

## 4. 레이어별 책임

| 레이어 | 책임 | 맡기지 말아야 할 일 |
|---|---|---|
| Product truth | 확인된 정보, 옵션, 치수, 금지 문구 | 추정치를 사실로 승격 |
| Skill | 질문, 사실 분류, 서사, 아트디렉션, 반복 판단 | 업로드 저장소와 장기 작업 큐 |
| imagegen | 제품 장면, 재질 매크로, 동작 상태, 빛과 사진적 FX | 한국어 타이포그래피, 제품 정보 확정 |
| HTML/CSS | 긴 상세페이지, 타이포, 배치, 접근성, 경량 루프 | 제품 변형 생성, 프레임 정확한 영상 렌더 |
| HyperFrames | 장면 타이밍, 전환, GSAP, 미디어 합성, MP4 | 제품 사진 생성, 상세 정보의 원본 관리 |
| FFmpeg | MP4 압축, WebP/GIF 파생본 | 마스터 장면 설계 |
| Validator | 패널 수, 비율 선언, 이미지 임베드 등 자동 검사 | 미감, 제품 동일성, 실제 브라우저 geometry |
| Browser QA | 실제 크기, 클리핑, 모션 상태, 시각 점수 | 사실성 판단의 원천 |

핵심 원칙은 “HTML이 제품 정보의 원본이고, 렌더 영상은 파생 자산”이라는 점이다.

## 5. 권장 데이터 모델

서비스 또는 자동화 코드를 만들 때 자연어만 전달하지 말고 아래 계약을 명시적으로 저장한다.

### `ProductBrief`

```json
{
  "product_name": "string",
  "category": "string",
  "target_width": 780,
  "panel_count": 8,
  "options": [],
  "target_customer": "string|null",
  "marketplace": "generic",
  "visual_references": [],
  "motion_mode": "none|css-loop|hyperframes-loop"
}
```

### `FactLedger`

```json
{
  "facts": [
    {
      "field": "material",
      "value": "string|null",
      "status": "confirmed|inferred|unknown|prohibited",
      "source": "user|photo|document",
      "source_ref": "string|null",
      "publishable": false
    }
  ]
}
```

`publishable`은 `status == confirmed`일 때만 `true`가 될 수 있어야 한다. 코드에서 강제한다.

### `PhotoInventory`

각 원본에 다음을 저장한다.

- `asset_id`
- `path`
- `role`: `identity-primary`, `identity-detail`, `geometry`, `demonstration`, `exclude`
- `visible_facts`
- `identity_priority`
- `allowed_uses`

### `PanelPlan`

각 패널은 다음을 가져야 한다.

- `panel_id`
- `sales_question`
- `headline`
- `visual_anchor`
- `supporting_proof`
- `poster_archetype`
- `type_composition`
- `transition`
- `fact_ids`
- `asset_ids`

동일한 `fact_id`를 여러 패널의 핵심 주장으로 중복 사용하지 않는다.

### `AssetManifest`

```json
{
  "asset": "hero-v1.webp",
  "kind": "generated-image",
  "source_roles": ["identity-primary", "geometry"],
  "prompt": "string",
  "prohibited_mutations": ["shape", "logo", "hole pattern"],
  "campaign_bible_version": "v1",
  "status": "accepted|rejected",
  "rejection_reason": null
}
```

최종 HTML에 포함된 이미지와 manifest를 대조할 수 있어야 한다.

### `MotionSpec`

- `mode`: `css-loop` 또는 `hyperframes-loop`
- `question`: 모션이 답하는 한 가지 제품 질문
- `beats`: `authored-start`, `action`, `return`
- `duration_ms`
- `proof_times_ms`
- `reduced_motion_asset`
- `master_asset`
- `derivatives`
- `hyperframes_version`

### `QaReport`

- 9개 품질 항목 점수와 총점
- 차단 실패 목록
- 가장 약한 항목
- 한 번의 목표 수정
- 패널 geometry 결과
- 모션 가시성 샘플
- 제품 동일성 판정
- 레퍼런스 대비 부족한 항목

## 6. 실행 파이프라인

```text
입력 수집
  → 사진 역할 분류
  → FactLedger 확정
  → 차단 필드 질문
  → 레퍼런스 방향 시트
  → PanelPlan
  → 캠페인 바이블
  → imagegen 생성·동일성 승인
  → HTML/CSS 조립
  → 필요 시 HyperFrames 파생 모션
  → 자동 validator
  → 브라우저 geometry·시각 QA
  → 가장 약한 항목 1회 수정
  → 재검증
  → HTML·자산·manifest·QA 보고서 전달
```

각 단계의 산출물을 저장해야 재생성, 비교, 버전 롤백이 가능하다. 이미지 파일만 저장하고 프롬프트나 승인 이유를 버리면 안 된다.

## 7. 스킬과 서비스의 경계

### 스킬에 남길 것

- 어떤 질문을 해야 하는지 판단
- 사실과 추정을 분리
- 판매 서사와 패널 순서 설계
- 레퍼런스에서 원칙 추출
- 이미지 프롬프트와 동일성 판단
- CSS와 HyperFrames 중 적합한 모션 경로 선택
- QA에서 가장 약한 항목을 골라 반복 수정

### 서비스로 개발할 것

- 제품 사진 업로드와 역할 지정 UI
- 제품 정보/옵션/치수 입력 폼
- 프로젝트와 버전 저장
- imagegen 및 렌더 작업 큐
- 자산 manifest와 승인/폐기 기록
- 패널 미리보기와 순서 편집
- 검증 결과 표시
- HTML/MP4/WebP/GIF 내보내기
- 마켓플레이스별 프리셋

권장 구조는 “스킬을 기획 엔진으로 유지하고, 서비스가 타입이 있는 입력과 반복 가능한 실행 환경을 제공”하는 방식이다. 초기 버전에서 창의적 판단을 고정 템플릿 규칙으로 과도하게 옮기지 않는다.

## 8. 개발 우선순위

### P0 — 안전하고 반복 가능한 MVP

1. `ProductBrief`와 `FactLedger` JSON Schema
2. 차단 필드와 금지 주장 검사
3. `PanelPlan` 생성 및 중복 주장 검사
4. `AssetManifest`와 이미지 승인 기록
5. 독립 실행형 HTML exporter
6. 실제 브라우저 `780 × 1560` geometry 검사
7. 결과와 QA 보고서 버전 저장

### P1 — 품질 자동화

1. 캠페인 바이블 버전 관리
2. 생성 이미지와 identity reference 비교 화면
3. 패널별 스크린샷과 100점 rubric 입력
4. 전체 이미지 inventory를 통한 미처리 원본 탐지
5. 모션 0ms/action/return proof 자동 캡처
6. HyperFrames lint/check/snapshot/render 래퍼
7. 레퍼런스 대비 항목별 비교 보고서

### P2 — 제품화

1. 마켓플레이스별 크기와 용량 프리셋
2. 패널 재정렬과 부분 재생성
3. 팀 코멘트, 승인, 롤백
4. 렌더 큐와 비용/시간 추적
5. 재사용 가능한 브랜드 디자인 토큰
6. 템플릿 성과 분석과 A/B 변형

## 9. 검증과 회귀 테스트

현재 자동 검사는 다음 명령으로 실행한다.

```bash
python scripts/validate_detail_page.py \
  --html <standalone-html> \
  --expected-panels <count>
```

현재 검사 범위:

- `.panel` 개수
- `1:2` aspect-ratio 선언
- 로컬 이미지의 data URL 임베드
- 페이지 카운터 의심 패턴
- `prefers-reduced-motion`

추가 개발이 필요한 검사:

- Playwright 기반 실제 bounding box
- 가로 overflow와 텍스트 clipping
- `alt` 누락
- HTML 총 용량과 이미지별 용량
- 이미지 inventory와 manifest 불일치
- 처리되지 않은 원본 사진 잔존
- 모션 한 주기에서 최소 한 프레임 가시성
- 비디오 첫 프레임 black 여부
- MP4 duration, dimensions, fps
- HyperFrames 버전 pin 여부
- 금지 주장 사전과 `FactLedger` 연결

회귀 fixture는 최소 네 종류를 둔다.

1. 정적 8패널 정상 사례
2. CSS 3상태 루프 사례
3. HyperFrames 영상 포함 사례
4. 의도적으로 실패하는 주장/geometry/누락 이미지 사례

## 10. 주요 실패 패턴

| 실패 | 원인 | 방지 |
|---|---|---|
| 원본 사진과 생성 이미지가 다른 제품처럼 보임 | 이미지 품질만 보고 동일성을 후순위 처리 | identity checklist와 승인 상태를 필수화 |
| 모든 패널이 카드 UI처럼 보임 | 재사용 컴포넌트가 아트디렉션을 지배 | 패널마다 poster archetype과 dominant axis 저장 |
| 고급 이미지 사이에 사무실 원본 사진이 섞임 | 일부 자산만 생성 | fully art-directed 모드에서 전체 `<img>` inventory 검사 |
| 모션 첫 프레임이 평범하거나 비어 있음 | CSS 효과가 늦게 시작 | imagegen authored start와 영구 base frame |
| 같은 장점을 여러 패널에서 반복 | 문구 단위로만 중복 검사 | `fact_id`와 `sales_question` 단위 중복 검사 |
| 자동 검증은 통과하지만 실제 비율이 다름 | CSS 선언만 검사 | 브라우저 computed geometry를 별도 게이트로 운영 |
| GIF 용량과 밴딩이 심함 | GIF를 마스터로 제작 | MP4 마스터 후 WebP/GIF 파생 |
| 레퍼런스와 비슷하지만 고유성이 없음 | 표면 요소를 복제 | 방향 시트에서 원칙만 추출하고 금지 항목 기록 |

## 11. 완료 정의

다음 조건이 모두 충족되어야 완료다.

- 차단 필드가 확인되었다.
- 게시된 모든 사실이 `confirmed` 항목과 연결된다.
- 제품 동일성 차단 실패가 없다.
- 패널 수와 실제 geometry가 맞는다.
- 깨진 이미지와 가로 overflow가 없다.
- 품질 점수 85점 이상이고 차단 실패가 없다.
- 모션이 한 가지 제품 질문에 답하며 첫 프레임이 완성되어 있다.
- HyperFrames 사용 시 lint/check/proof/render 검증을 통과했다.
- 최종 HTML, 제작 자산, 프롬프트 기록, manifest, QA 보고서가 함께 존재한다.
- 사용한 오픈소스 코드와 폰트의 라이선스 조건을 지켰다.

## 12. 다음 개발자의 첫 작업

1. `schemas/` 또는 서비스 계층에 `ProductBrief`, `FactLedger`, `PanelPlan`, `AssetManifest`, `QaReport` 스키마를 만든다.
2. `validate_detail_page.py`를 브라우저 기반 validator와 분리하고 두 검사를 한 명령으로 묶는다.
3. 정상/실패 HTML fixture를 추가해 validator 회귀 테스트를 만든다.
4. imagegen 자산 승인 화면 또는 최소 manifest CLI를 만든다.
5. 동일한 입력으로 HTML과 QA 보고서를 재생성할 수 있는 한 번의 end-to-end 실행을 만든다.

새 기능을 추가할 때는 먼저 이 질문에 답한다.

> 이 기능이 제품 진실성, 제품 동일성, 시각 품질, 재현성 중 무엇을 개선하며, 어느 검증 게이트가 그 개선을 증명하는가?
