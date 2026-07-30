# Behance 상세페이지 추상 루브릭 v0.1

- 조사일: 2026-07-30
- 조사 범위: Behance의 한국어 상품 상세페이지 단일 프로젝트 8개
- 용도: 기획·이미지·GIF·수정 가능한 HTML 결과의 선행 품질 평가
- 정책 정본: `policies/behance-commerce-v0.1.json`

## 사용 경계

표본의 카피·색·서체·인물·제품 연출·레이아웃 조합은 고유 표현이므로 복제하지 않는다. 표본 이미지와 녹화는 모두 `research-only`이며 production asset, 생성 참조 이미지, pixel-similarity 목표로 사용할 수 없다.

이 문서가 재사용하는 것은 여러 표본에서 관찰한 추상 속성뿐이다. Behance의 조회수·추천·시각적 완성도는 판매 전환, 제품 효능, 시험 결과의 진위를 증명하지 않는다.

## Primary sources

| ID | 범주 | 원문 | 제한된 관찰 용도 |
| --- | --- | --- | --- |
| S01 | 헤어케어 | <https://www.behance.net/gallery/246328393/_> | 감각 이미지와 조건이 표시된 비교·시험 근거의 인접성 |
| S02 | 식품·건강 | <https://www.behance.net/gallery/240887707/_> | 공정 차이를 대칭 비교하는 정보 구조 |
| S03 | 신선식품 | <https://www.behance.net/gallery/252430373/_> | 원물·단면·질감 역할과 짧은 motion의 제한적 효용 |
| S04 | 육가공·밀키트 | <https://www.behance.net/gallery/241954161/Detail-page-> | 친근한 판촉 어투와 첫 화면 메시지 밀도의 trade-off |
| S05 | 뷰티 디바이스 | <https://www.behance.net/gallery/238107975/-makeON-LED-> | 구조·작동 설명 motion과 과도한 페이지 길이·반복의 위험 |
| S06 | 생활·구강 | <https://www.behance.net/gallery/213100701/-product-detail-page> | 단정한 브랜딩과 정적 구조 도해만으로 충분한 경우 |
| S07 | 가상 음료 콘셉트 | <https://www.behance.net/gallery/220227061/-Lemon-juice-Product-page> | 강한 대비와 3D motion의 시각 패턴만 참고. 주장·증거에는 사용 금지 |
| S08 | 스킨케어 | <https://www.behance.net/gallery/241274633/_> | 수치뿐 아니라 대상·기간·측정 조건을 함께 보이는 증거 카드 |

표본은 뷰티, 식품, 신선식품, 육가공, 디바이스, 생활용품을 포함한다. 2026-07-30 조사에서 주요 상세 모듈 폭은 800~1,000px였고, 8개 중 최소 3개에서 GIF source를 관찰했다. 길이와 GIF 수는 품질 지표로 사용하지 않는다.

## 추상 제작 원리

1. 첫 화면은 제품 정체성과 한 가지 핵심 선택 이유를 짧게 확정한다.
2. `고객 질문 → 검증된 claim → 가까운 evidence → 사용·선택 정보`가 끊기지 않아야 한다.
3. 이미지는 `identity`, `desire`, `mechanism`, `proof`, `usage`, `choice` 중 한 가지 주 역할을 가진다.
4. 긴 페이지는 감각 이미지·여백과 비교·시험·사양 블록을 교차해 밀도 리듬을 만든다.
5. motion은 작동·상태 변화·사용 순서·범위 차이를 설명한다. 개수는 Behance의
   보편 법칙이 아니라 `detail-page-flow-v1` 하우스 규칙을 적용한다.
6. 본문·시험 조건·사양·주의사항의 편집 정본은 Studio HTML section에 유지하고,
   고객 전달본은 같은 내용을 폭 780px WebP section stack으로 렌더할 수 있다.
7. 390px 저작 화면과 780px 전달 렌더에서 동일한 section graph와 읽기 순서를 보존한다.
8. 정지 fallback만으로도 motion의 필수 메시지를 이해할 수 있어야 한다.

## 평가 축

각 축은 0~100으로 평가하고 JSON 정책의 가중치로 합산한다.

| ID | 축 | 가중치 | 주요 owner | 핵심 증거 |
| --- | --- | ---: | --- | --- |
| R01 | 주장·근거 무결성 | 18 | Evidence QA | claim/fact/evidence graph, source hash, DOM 거리 |
| R02 | 구매 여정과 정보 구조 | 12 | Commercial Benchmark | section graph, 고객 질문, 중복과 전이 |
| R03 | 첫 화면 명료성 | 8 | Visual Benchmark | mobile 첫 1.5 viewport, 제품·선택 이유 |
| R04 | 제품 동일성·연속성 | 10 | Identity QA | SSOT와 형상·부품·색·패키지 비교 |
| R05 | 이미지 역할과 아트 디렉션 | 10 | Visual QA | 역할 enum, 질문 coverage, crop, 권리 |
| R06 | GIF·motion coverage와 품질 | 6 | Motion QA | 문제 2+, 장점별 1+, 사용·비교, total, first/middle/last, loop, fallback |
| R07 | 시각 계층·타이포그래피 | 8 | Visual·Technical QA | heading, CSS type, 대비, DOM/OCR |
| R08 | 색·밀도·리듬·브랜드 일관성 | 7 | Visual Benchmark | token, 밀도 곡선, 강조와 tone guide |
| R09 | 사용·규격·구성·주의·구매 정보 | 8 | Evidence QA | 필수 field coverage, 단위, 옵션·주의 |
| R10 | 모바일 가독성과 전달 구조 | 8 | Mobile QA | 390 authoring·780 delivery, 숨은 320/360 overflow, crop, 줄바꿈 |
| R11 | Studio 편집·출력 parity·성능·접근성 | 5 | Technical QA | editable source, CDN stack parity, asset, alt, fallback |
|  | 합계 | 100 |  |  |

원 연구 메모의 사용자 검토 후보 기준은 88점이었다. 프로젝트 정본 정책은 이를 그대로 게시 기준으로 쓰지 않고 더 엄격하게 분리한다.

- deterministic hard failure: 0
- 게시 QA: 97 이상
- Behance 추상 속성 가중 점수: 90 이상
- critical R01·R04·R10: 각각 85 이상
- exact artifact에 대한 사용자 승인: 필수

모델 점수가 높더라도 deterministic hard failure가 하나 있으면 게시할 수 없다.

## 매체별 기획 계약

모든 section은 같은 `section_id`, `claim_id`, `evidence_id`를 image·GIF·HTML에 전달한다.

### Image

- 한 job은 한 고객 질문과 한 주 역할만 가진다.
- 실제 제품 reference의 형상·부품·패키지 금지 변경을 고정한다.
- atmosphere image를 proof로 사용하지 않는다.
- 비슷한 후보의 반복보다 image-role coverage를 우선한다.
- 제품 카피는 기본적으로 이미지에 굽지 않는다.

### GIF

- motion의 역할과 시간축 증거를 기획에 기록한다.
- 문제 2+, 해결 장점별 1+, 사용 1+, 비교 1+, 전체 최소 5·기본 7~9를
  deterministic coverage로 검사한다.
- 첫·중간·마지막 frame과 실제 loop seam을 검사한다.
- poster·fallback과 인접 HTML 설명을 제공한다.
- 역할 coverage 미달은 content-flow hard failure다.

### HTML

- copy, 수치, 시험 조건, 사양, 주의사항의 정본은 editable Studio section이다.
- 각 block은 section·claim·asset provenance를 보존한다.
- 모바일에서는 비교 block을 세로로 바꿀 수 있지만 의미 관계는 유지한다.
- 명시적 저장은 현재 `output/detail-page.html`을 덮어쓰고 내부 복구 snapshot과
  immutable 검증 receipt를 남긴 뒤 다시 평가한다.

## 검수와 repair loop

```text
candidate revision
→ deterministic hard-fail 검사
→ Evidence / Identity / Visual / Motion / Mobile QA 병렬 실행
→ rubric result와 evidence artifact commit
→ issue code를 deterministic repair scope로 변환
→ 실패 root와 descendant만 stale
→ 부분 수정·재capture·재검수
→ gate 통과
→ 사용자 검토
```

- producer와 유일한 semantic validator가 같은 session이면 결과를 인정하지 않는다.
- 각 점수는 subject digest, rubric hash, validator code·model·prompt hash, viewport capture와 evidence locator를 가진다.
- 전체 페이지 자동 수정은 최대 3회, 같은 section은 2회로 제한한다.
- 같은 issue의 반복 또는 최근 두 개선폭이 각각 2점 미만이면 사용자 판단을 기다린다.
- 비용·시간 budget이 끝나면 자동 생성을 멈춘다.
- protected SSOT·근거·승인 artifact는 repair loop가 무효화할 수 없다.

## No-copy 승격 규칙

Behance 관찰을 공용 규칙으로 승격하려면 다음을 모두 만족해야 한다.

1. 8개 중 5개 이상과 최소 3개 상품 범주에서 반복된다.
2. 작품 URL·고유 카피·색·서체·레이아웃을 제거해도 설명할 수 있다.
3. 다른 실제 상품 2개 이상 또는 명시적 회귀 fixture에서 개선된다.
4. claim/evidence, 제품 동일성, 권리 정책과 충돌하지 않는다.
5. 독립 검증과 사용자 승인 뒤 versioned rule과 회귀 테스트로 함께 고정된다.

생산 run은 웹 원문을 매번 다시 읽지 않고 이 문서와 JSON 정책이 포함된 KnowledgeSnapshot을 사용한다.

## 연구 한계

- 표본은 2026-07-30 검색 노출의 편의 표본이며 통계적 대표성이 없다.
- Behance는 실제 판매 채널이 아니라 portfolio presentation이다.
- 제품 주장·시험 결과의 진위와 전환율은 조사하지 않았다.
- S07은 가상 제품이므로 시각·motion 패턴 외에는 사용하지 않는다.
- 일부 프로젝트는 지연 로딩된 대형 래스터여서 DOM text와 접근성을 충분히 평가할 수 없었다.
- 800~1,000px 래스터 관찰을 390px Studio 가독성의 정답으로 사용하지 않는다.
- 표본 screenshot·GIF·녹화는 research-only이며 production에 재사용할 수 없다.
