# 제작 피드백에서 누적하는 Taste 규칙

이 문서는 실제 상세페이지를 만들고 사용자 피드백·전후 QA·회귀 테스트로 확인한
시각 품질 규칙의 정본이다. 프로젝트명, 상품 고유 카피, 원본 이미지, 스크린샷,
좌표와 실패 원문은 승격하지 않는다.

## 누적 규칙

| ID | 계속 적용할 규칙 | 검증 기준 | 갱신일 |
| --- | --- | --- | --- |
| TR-001 | 고객 화면은 제작 과정·파일·승인 메타데이터가 아니라 제품 차이와 구매 효익을 말한다. | 공개 메타데이터 0건 | 2026-07-29 |
| TR-002 | 한 화면의 시각 초점과 제목은 하나로 맞추고, 정보가 많으면 섹션을 나누거나 위계를 낮춘다. | 390px 저작·780px 전달 초점 QA | 2026-07-30 |
| TR-003 | 각 해결 장점은 하나의 주매체 surface만 사용한다. motion이 주매체면 정지 이미지는 첫 프레임 poster fallback으로 쓰거나 별도 근거 section으로 옮겨 같은 주장 아래 still과 GIF를 겹쳐 쌓지 않는다. | 장점별 primary surface 1개, redundant still-motion stack 0건 | 2026-08-01 |
| TR-004 | 제품·라벨·바·점·치수선은 박스의 수학적 중앙보다 실제로 균형 있게 보이는 시각 중심을 우선한다. | 기준선 오버레이와 육안 QA | 2026-07-29 |
| TR-005 | GIF 타이포는 HTML과 동일한 위계·굵기·줄바꿈을 유지하고 780px에서 먼저 읽혀야 한다. | 첫·중간·마지막 프레임 가독성 | 2026-07-30 |
| TR-006 | 사용 맥락은 작은 제품을 장식처럼 반복하기보다 사람이 무엇을 하는지와 제품이 어디서 작동하는지를 먼저 보여 준다. | 행동·제품 위치 동시 식별 | 2026-07-29 |
| TR-007 | 배치 편집과 텍스트 편집을 분리하고 실행 취소·정렬·스냅·저장 상태를 명확히 제공한다. | Studio 상호작용 회귀 테스트 | 2026-07-29 |
| TR-008 | 작업 자산과 전달본을 분리하고 사용자·고객 진입점을 `output/detail-page.html` 하나로 고정한다. | 재오픈·이미지·motion·Wing parity 검사 | 2026-07-30 |
| TR-009 | 브랜드명은 제품·제조사 식별자로만 쓰고, 장점 용어는 구조·규격·적용 조건 중 하나와 함께 정의한다. 분위기 동사로 브랜드명이나 장점명을 반복하지 않는다. | 공개 카피 용어 검사와 360px·800px 줄바꿈 QA | 2026-07-29 |
| TR-010 | 고객 공개 카피는 내부 제작어·부품어보다 고객이 바로 이해하는 신체 부위와 상태를 쓴다. 예를 들어 설명 없는 `손등 커프`보다 `손등`, `손등 덮임`, `손등 부분`을 우선한다. | 용어 회귀 검사와 비전문 사용자 1회독 이해 여부 | 2026-07-29 |
| TR-011 | 미리보기 창 높이와 실제 결과 자르기를 같은 조작으로 취급하지 않는다. 명시적 저장 때 전체 section bottom과 문서 scrollHeight를 다시 계산하고 선택 크롭·자동 높이 복원·내보내기에 같은 규칙을 적용한다. | 390px 저장·재열기·내보내기 문서 끝 여백 0 회귀 검사 | 2026-07-30 |
| TR-012 | 긴 모바일 페이지는 화려한 감각 블록과 근거·사양 정보 블록을 교차하고, 문제 그룹과 해결 그룹 사이에는 제품의 한 문장 답을 둔다. | section density curve와 problem/answer/solution 분리 검사 | 2026-07-30 |
| TR-013 | 같은 로컬 브라우저의 활성 탭을 제어하는 수집 작업은 에이전트 수와 무관하게 단일 브라우저 lane에서 직렬 실행한다. | 동시 실행 시 상품 식별자 교차 오염이 재현되고 직렬 실행 시 입력 상품 식별자가 끝까지 일치한다. | 2026-07-30 |
| TR-014 | ProductionPlan을 제출하기 전 frozen KnowledgeSnapshot 객체를 validator context로 전달해 내부 manifest와 모든 개별 rule hash를 함께 검증한다. | context 없는 사전검사 결과와 무관하게 validateProductionPlan(plan, { knowledgeSnapshot })이 오류 0·orphan 0으로 PASS하고 plan의 knowledge manifest가 frozen snapshot 내부 manifest와 일치한다. | 2026-07-30 |
| TR-015 | 다수 모션 렌더처럼 시간이 긴 작업은 lease attempt와 fencing token을 유지한 heartbeat를 발행하고 만료된 실행의 산출물을 새 실행에 섞지 않는다. | heartbeat가 같은 session·attempt·token으로 lease를 연장하고 제출은 현재 lease의 결과만 받아들이며 만료 실행은 제외된다. | 2026-07-30 |
| TR-016 | 브라우저 캡처는 실행마다 전용 탭을 만들고 실제 상품 화면의 식별 신호를 확인한 뒤 overflow와 안정성 검사를 시작한다. | 새 캡처 대상 생성, 대상 식별 확인, 배경 탭 비활성, 오류 화면 오수락 0건을 함께 확인한다. | 2026-07-30 |
| TR-017 | CSS 뷰포트 캡처는 사이트 확대율을 정규화하고 단일 표면 한도를 넘는 고해상도 긴 페이지는 타일로 캡처해 병합한다. | 요구한 세 CSS 폭이 정확하고 장치 배율을 반영한 전체 높이 이미지가 누락·중복 타일 없이 생성된다. | 2026-07-30 |
| TR-018 | 공개 HTML 전달본은 승인된 불변 revision이 참조하는 모든 로컬 미디어를 함께 복제하고 각 파일의 크기와 해시를 export manifest에 기록한다. | HTML의 로컬 미디어 참조와 manifest 항목 수가 같고 누락 파일 0건이며 모든 파일 해시가 일치한다. | 2026-07-30 |
| TR-019 | 게시 freshness는 현재 승인 artifact에서 역방향으로 도달하는 sealed dependency 계보만 평가하고 현재 계보와 분리된 과거 stale 분기는 감사 이력으로 보존한다. | 현재 승인 계보의 stale·미해결 artifact는 0건이고 분리된 과거 분기가 있어도 현재 proof가 바뀌지 않는다. | 2026-07-30 |
| TR-020 | 기존 `output/detail-page.html`과 사용자 기준작을 current·positive·negative·approved 역할로 profile하고 섹션 흐름·자산 역할·밀도·전달 폭의 채택·변형·거절 판단을 G1 section에 연결한다. | 모든 reference hash/profile과 adoption matrix가 있고 고유 자산·카피 복제 0건 | 2026-07-31 |
| TR-021 | CR/TR/MR 적용은 ID·hash 목록이 아니라 실제 section·image job·GIF brief, required effect, acceptance check의 닫힌 바인딩으로 증명한다. | unbound rule 0건, 모든 image/GIF job의 applied rule이 target binding과 일치 | 2026-07-31 |
| TR-022 | 이미지 set은 역할·장면·제품 면·사용 맥락·조명·배경·점유율·차별화 목표로 coverage를 만들고 Hero와 핵심 기능은 후보 2개 이상을 비교한다. | contextual-use 1+, 필수 면·scene coverage 100%, 중복 differentiation goal 0건 | 2026-07-31 |
| TR-023 | 390px는 Studio 저작 기준, 780px는 고객 공개 HTML과 Wing 전달 기준으로 분리하며 390px 중앙 열을 780 결과로 간주하지 않는다. | 390 authoring과 780 public capture가 각각 폭 계약을 채우고 320·360 overflow 0건 | 2026-07-31 |
| TR-024 | 공개 export는 sanitizer 뒤 실제 output의 animation DOM·manifest·파일·frame count를 다시 닫고 poster-only를 실패시킨다. | planned/public/manifest animation 수 일치, frame 2+, poster-only 0건 | 2026-07-31 |
| TR-025 | Studio는 G4 조립·사전 QA 뒤에만 여는 최종 편집 UI다. exact working session 저장은 mutable G4 revision만 바꾸고, commit·capture·QA가 통과한 뒤에만 `output/detail-page.html`과 Wing을 파생한다. 조사·기획·에셋 승인·workflow는 사용자 Studio 탭으로 노출하지 않는다. | final session ID/digest 일치, working/save 사용, output/save 미사용, 최종 QA 뒤 public hash 계보 일치 | 2026-08-01 |
| TR-026 | 공용 category reference·ambition anchor·Studio runtime을 상품마다 복제하지 않고 새 프로젝트는 최소 input/output/숨은 authoring만 만든다. planning·evidence·generation·workflow·QA·backup·Wing은 첫 실제 write 때 생성하고 Studio runtime은 스킬에서 직접 제공한다. | 새 프로젝트 초기 폴더 집합과 lazy-create 회귀 검사, 프로젝트 Studio runtime 복사 0건, 루트 임의 폴더 0건 | 2026-07-31 |
| TR-027 | 제목 줄바꿈을 직접 설계하고 제목·본문·제품의 중앙축을 맞춘다. 390px 제목 28px·780px 제목 44px 이상, 주 시각 점유율 55% 이상을 기본으로 하며 의미 없는 큰 상하 여백을 허용하지 않는다. | 중앙축 편차 8px 이하, 최소 글자 크기·시각 점유율·빈 영역 검사 | 2026-08-01 |
| TR-028 | 상업용 제품 이미지는 실제 제품과 모델·사용 환경을 크게 사용하고 조명·원근·입자·콜아웃을 제품보다 앞서지 않게 제어한다. 같은 작은 제품 컷을 반복하지 않고 장면·각도·메시지 역할을 바꾼다. | 제품/사용 장면 우선순위, 장면·각도 coverage, 장식 우세 0건 | 2026-08-01 |
| TR-029 | 디스크의 공개 HTML과 Wing에는 내부 metadata와 Studio 링크가 0건이어야 한다. 로컬 Studio 서버가 공개 파일을 서비스할 때만 응답에 수정 런처를 주입하고 원본 bytes는 바꾸지 않는다. | canonical bytes 불변, public launcher 0, local served launcher 1 | 2026-08-01 |
| TR-030 | 제작 시간은 품질 gate를 줄이지 않고 G2 32장·32 provider workers 단일 배치, 준비된 G3 즉시 병렬, 결과 cache, 실패 member만 재시도, 변경 section QA와 최종 다중 viewport 1회 캡처로 줄인다. | performance trace의 순차 대비 절감 시간과 full rerun 0건 | 2026-08-01 |

## 업데이트 규칙

완성 결과와 HeyGenFrame Studio 편집 경험을 `exps/*.md`에
`promotion: auto`로 넣은 경우에는 trusted drop의 evidence·품질·독립 검토 gate를
통과한 TR만 이 표에 자동 반영한다. 일반 프로젝트 후보는 아래 수동 규칙을 따른다.

1. 실제 제작 피드백을 프로젝트 `.detail-page/planning/LEARNINGS.md`에
   `source_type: feedback`, `scope: candidate-shared`로 기록한다.
2. 다른 상품 1개 이상 또는 관련 회귀 테스트에서 다시 확인한다.
3. 상품명·카피·색·수치·좌표·스크린샷 경로를 제거하고 한 문장 규칙으로 만든다.
4. 이 표의 기존 규칙과 같으면 새 ID를 만들지 않고 문장·검증 기준·갱신일을
   업데이트한다.
5. `taste.md` 반영과 테스트 통과를 확인한 뒤 승격된 원문 블록을 프로젝트에서
   삭제한다.
