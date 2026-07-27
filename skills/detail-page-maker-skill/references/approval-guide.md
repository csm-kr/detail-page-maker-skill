# Independent Approval Guide

상세페이지 제작 세션과 승인 세션을 분리한다. 옆 승인 세션의 기록과 명시적 사용자
결정이 없으면 다음 제작 단계로 이동하지 않는다.

## 역할 분리

- 제작 세션: 조사, 기획, 생성, 수정, 자동 검사, 증거 준비
- 옆 승인 세션: 원본·후보·근거·QA를 독립 검토하고 결정만 기록
- 사용자: Studio v1에서 개별 에셋 승인·반려, 상업 방향, 보류 해제, 최종 게시 결정
- Studio v1: pending→approved|rejected 파일 이동, 상태·해시·출력 잠금 강제

제작 세션은 자신이 만든 산출물을 `approved`로 표시하지 않는다. 옆 승인 세션은
산출물을 직접 수정하지 않고 `approved | changes_requested | held` 중 하나와 이유를
남긴다.
이 결정은 사용자에게 제안하는 독립 검토 결과다. 파일 상태를 실제 `approved`로
옮기는 최종 행위는 사용자의 명시적 확인 또는 Studio v1 승인 클릭이 있어야 한다.

## 필수 승인 게이트

| 게이트 | 승인 대상 | 다음 단계 |
|---|---|---|
| `G0 SOURCE_SSOT` | 공급처 원본, 실제품 사진, 제품 사실 SSOT | 상업 기획 |
| `G1 COMMERCIAL_PLAN` | 고객 문제, 제품 답, 선택 이유, 주장 경계, 페이지 카드 | 이미지 생성 |
| `G2 IMAGE_ASSETS` | God Tibo 후보, 제품 동일성, 무노이즈 QA | GIF·조립 |
| `G3 GIF_MOTION` | HyperFrames 미리보기, 첫·중간·마지막, manifest | 조립 |
| `G4 ASSEMBLED_HTML` | 고객 화면, 카피, 섹션 순서, 반응형 | 최종 QA |
| `G5 PUBLISH` | 최종 QA, 공개 파일, 제품정보, 사용자 결정 | 게시 |

## 승인 요청 묶음

옆 승인 세션에는 결론만 전달하지 않고 다음 원자료를 전달한다.

```text
gate_id
project_id
revision_id
artifact_paths
artifact_sha256
product_ssot
claim_ids
qa_report
known_warnings
requested_decision
```

이미지는 원본과 후보 한 개를 나란히 보여 준다. GIF는 미리보기와 첫·중간·마지막
접촉판을 함께 보여 준다. HTML은 고객 화면과 Studio 메타데이터 화면을 분리해
제공한다.

신규 파일의 물리 상태 전환과 폴더 계약은
[`asset-management.md`](asset-management.md)를 따른다.

## 프로젝트 기록

프로젝트 `planning/APPROVALS.md`에 게이트별로 기록한다.

```markdown
## G2 IMAGE_ASSETS

- revision_id:
- artifact_sha256:
- reviewer_session:
- decision:
- decided_at:
- findings:
- required_changes:
- user_confirmation:
```

`reviewer_session`은 옆 승인 세션을 식별할 수 있는 사용자가 정한 짧은 이름을 쓴다.
개인정보나 전체 대화 내용을 복사하지 않는다.

## 무효화

- 파일 바이트나 SHA-256이 바뀌면 해당 승인과 하위 승인을 무효화한다.
- COMMERCIAL 선택 이유가 바뀌면 연결된 이미지·GIF·HTML 승인을 다시 연다.
- 제품 SSOT가 바뀌면 그 제품이 등장하는 모든 파생 자산을 다시 검토한다.
- HTML 카피만 바뀌어도 주장 범위가 달라지면 연결 자산 승인을 다시 확인한다.
- 수정 없는 단순 경로 이동은 manifest 해시와 참조 무결성을 다시 검증한다.

## 승인 금지

- QA 실패를 사용자 취향으로 우회 승인
- 제품 동일성 하드 실패 승인
- 승인 세션 없이 제작 세션 메모만으로 단계 이동
- 사용자 확인 없이 Studio API를 직접 호출해 approved로 이동
- 네 개 배치 결과를 한 번에 묶어 개별 결함을 숨김
- 검토본과 다른 파일을 게시
- 해시 없는 구두 승인

Studio 상태 계약은 [`studio-workflow.md`](studio-workflow.md)를 따른다.
