# 루즈핏 쿨토시

- 공급처: http://domeggook.com/55873582?affid=
- 제조사: 살랑
- 프로젝트 격리: `self-contained`
- 외부 파일 의존성: 없음
- 생성 계획: 캐릭터 시트 후보 8장 → G2A 한 장 승인 → 본 제작 40장
- 병렬 실행: God Tibo 8-worker 배치, 본 제작 `16 + 16 + 8`

프로젝트의 제품 근거, 생성 자산, HyperFrames 원본, QA, 승인 기록과 HTML은 이
폴더 안에서만 관리합니다. 다른 프로젝트나 저장소 공용 폴더를 파일 경로로
참조하지 않습니다.

## Studio

저장소 루트에서 다음 명령으로 현재 rev021 편집본을 연다.

```powershell
node skills/detail-page-maker-skill/scripts/detail-page.mjs start `
  --project "projects/살랑-루즈핏-쿨토시-55873582" `
  --port 8898
```

- Studio 주소: `http://127.0.0.1:8898/studio.html`
- Studio 편집 원본: `html/index.html`
- 사용자 최종 검토본: `deliverables/rev021-commercial/index.html`
- Studio 동기화: `node production/scripts/sync-rev021-studio.mjs`

Studio 편집 원본과 사용자 전달 패키지를 섞지 않는다. 완료 안내와 외부 전달에는
항상 `deliverables/<revision>/index.html`만 사용한다.
최종 검토본을 로컬 파일 또는 로컬 서버에서 열면 우측 상단의
`Studio에서 편집` 버튼으로 실행 중인 Studio에 이동할 수 있다. 외부 고객
호스트에서는 이 버튼을 생성하지 않는다.
