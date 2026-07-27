# 정기 디자인 학습

이 디렉터리는 Behance 상세페이지 후보와 Taste Skill 변경 신호를 정기적으로 모으는 검토 큐다.

- 실행 스크립트: [`../../../scripts/refresh-design-study.ps1`](../../../scripts/refresh-design-study.ps1)
- 예약 설치: [`../../../scripts/install-design-study-task.ps1`](../../../scripts/install-design-study-task.ps1)
- 실행 주기: 매주 월요일 09:30, Asia/Seoul
- 갱신 결과: `queue.md`, `state.json`
- 실패 기록: `last-error.md`

예약 작업은 후보 URL·분류·검토 가설만 갱신한다. 상용 HTML, 상품 사실,
`docs/references/commercial-detail-page.md`, `docs/references/design-study.md`를
자동 수정하지 않는다.

수동 실행:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\refresh-design-study.ps1
```

예약 작업 설치 또는 갱신:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-design-study-task.ps1
```
