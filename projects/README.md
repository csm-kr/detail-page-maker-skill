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
