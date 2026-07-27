# Projects

이 폴더의 각 하위 디렉터리는 독립된 상세페이지 프로젝트다.

프로젝트는 제품 근거, 공급처 증거, 이미지·GIF, HyperFrames 원본, QA, 승인 기록과
HTML을 자기 폴더 안에 보존한다. 다른 프로젝트나 저장소 공용 폴더를 파일
의존성으로 참조하지 않는다.

```bash
node skills/detail-page-maker-skill/scripts/detail-page.mjs list
node skills/detail-page-maker-skill/scripts/detail-page.mjs validate
node skills/detail-page-maker-skill/scripts/detail-page.mjs start \
  --project projects/<project-id>
```

새 프로젝트는 저장소의 `config/workspace.json`을 발견하면 이 폴더에
생성된다. 설치형 스킬을 다른 폴더에서 사용할 때는 기존 기본값인
`Documents/DetailPageStudio/projects`를 사용한다.

## 표준 역할

```text
<project-id>/
├─ README.md             프로젝트 목적·상태·주요 진입점
├─ project.json          Studio 상태와 자기완결 계약
├─ evidence/             공급처 원본·외부 캡처·hash 원장
├─ research/             이 상품에만 적용되는 시장·경쟁·프롬프트 조사
├─ assets/ 또는 asset/   제품 SSOT, 생성 후보·승인본과 출력 자산
├─ hyperframes/          편집 가능한 모션 원본과 렌더
├─ detail-page/ 또는 html/  수정 가능한 HTML과 게시 출력
├─ qa/                   보고서와 최종 판정에 사용한 캡처
└─ planning/
   └─ LEARNINGS.md       상품 한정 학습과 공용 규칙 후보
```

레거시 프로젝트는 제작 당시 구조를 억지로 통일하지 않는다. 대신 `project.json`,
README, 내부 상대 경로와 `planning/LEARNINGS.md`를 갖추고 프로젝트 밖 파일
의존성이 없음을 `validate`로 검사한다. `README.md`나 `planning/LEARNINGS.md`가
없어도 검사는 실패한다.

## 종료와 피드백

1. QA와 사용자 승인을 마친다.
2. `planning/LEARNINGS.md`에 근거 경로와 재사용 위험을 기록한다.
3. 상품 고유 내용은 `project-only`로 유지한다.
4. 공용 후보는 `candidate-shared`로 표시한다.
5. 저장소에서는 `docs/issues/` 검증 티켓에 연결한다.
6. 다른 프로젝트 또는 회귀 테스트에서 재현된 규칙만 스킬에 승격한다.
