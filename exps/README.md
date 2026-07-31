# Trusted experience drop

`exps/`는 완성 결과에서 추출한 공용 경험을 넣는 신뢰 경계다. 이 폴더의 일반
`.md` 파일은 다음 skill 실행의 `experience-sync`, `new`, `start`,
`workflow-advance`, `workflow-resume` 진입 때 자동 검사·승격된다.

파일을 이 폴더에 두는 행위는 그 파일 안의 안전한 공용 규칙에 대한 사전 승인을
뜻한다. 그러나 증거 hash, 독립 session, 품질 조건, 일반화 검사를 통과하지 못하면
active reference를 바꾸지 않고 `.workspace/learning/exps/quarantine/`에 기록한다.

폴더는 더 나누지 않는다. 한 조사 묶음이나 한 완성 run마다 Markdown 하나를 만들고,
그 안에 여러 `EXP-*` 블록을 둘 수 있다.

- Behance 반복 관찰: `source_kind: commercial-research` → `commercial.md`의 CR
- HeyGenFrame motion·frame: `source_kind: frame-production` → `motion.md`의 MR
- HeyGenFrame Studio 편집 UX: `source_kind: completed-result`, `category: studio`
  → `taste.md`의 TR
- 일반 사용자 전후 피드백: `source_kind: user-feedback` → category에 따라 TR/MR

Behance 검색 결과 페이지 자체는 승격 근거가 아니다. 서로 다른 프로젝트 세 개
이상을 열어 반복된 정보 구조만 기록한다. HeyGenFrame은 strict frame-check와
첫·중간·끝 프레임 근거를 남긴다.

## EXP-EXAMPLE-001

- `source_kind`: completed-result
- `category`: layout
- `scope`: shared
- `promotion`: auto
- `rule_text`: 한 화면의 핵심 메시지는 하나로 제한하고 보조 정보는 다음 위계로 낮춘다.
- `validation_criterion`: 390px과 780px에서 주요 초점이 하나이고 overflow가 없다.
- `evidence_paths`: projects/example/output/detail-page.html; projects/example/.detail-page/qa/reports/g5.json
- `evidence_sha256`: <첫 파일 sha256>; <둘째 파일 sha256>
- `producer_session_id`: producer-session
- `reviewer_session_id`: independent-reviewer-session
- `case_count`: 1
- `quality_score`: 97
- `behance_quality_score`: 90
- `critical_dimension_min_score`: 85
- `hard_failure_count`: 0
- `frame_check`: PASS
- `public_output_qa`: PASS
- `reference_comparison`: PASS
- `user_approval`: true
- `producer_run_id`: RUN-production
- `qa_run_id`: RUN-independent-public-output-qa
- `before_after`: 수정 전 문제와 수정 후 검증 결과
- `sensitive_terms`: 상품명; 고유 카피
- `supersedes_rule_id`:
- `created_at`: 2026-07-30T00:00:00.000Z
