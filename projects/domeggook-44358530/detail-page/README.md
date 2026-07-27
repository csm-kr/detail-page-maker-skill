# 랩몬스터 기능성 인솔 상세페이지 프로젝트

## 열기

로컬 서버에서 `studio.html`을 열면 텍스트·이미지 경로·대체 텍스트·강조색을 수정하고 현재 상태를 HTML로 내보낼 수 있다. `index.html`은 구매자용 화면이다.

## 구성

- 20개 상업 상세 섹션
- ImageGen 장면 8개
- 제품 SSOT 누끼 3개
- HyperFrames GIF 7개
- 실제 제품 시연 GIF 3개
- 편집 텍스트 88개, 안정된 `data-asset-id`를 가진 교체 이미지 21개
- `data-fact-id`와 `claim-evidence-map.json`으로 연결된 주장 근거

## 실행

```powershell
python -m http.server 8891 --bind 127.0.0.1 --directory .
```

그다음 `http://127.0.0.1:8891/studio.html`을 연다. `file://`로 직접 열면 브라우저 보안 정책 때문에 일부 저장·내보내기 동작이 달라질 수 있다.

## 원본

- 공급처 사실: `../supplier-facts.json`
- 기획: `../supplier-planning-brief.json`
- HyperFrames: `../hyperframes/projects/insole-motion-studio`
- 상용 QA: `qa/qa-report.md`
