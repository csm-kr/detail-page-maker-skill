# 아쿠아핏 워터 슈즈 수정 가능 HTML 상세페이지

도매꾹 상품 `66475839`의 공급처 원본, 동종 제품 공개 후기, 승인된 ImageGen 제품 참조 자산과 HyperFrames 모션을 연결한 `supplier-reference-v1-commercial` 결과물이다.

## 실행

프로젝트 루트에서 정적 서버를 연 뒤 다음 주소로 접속한다.

```powershell
python -m http.server 8899 --bind 127.0.0.1
```

```text
http://127.0.0.1:8899/projects/domeggook-66475839/detail-page/index.html
```

파일을 직접 열어도 대부분 보이지만, 브라우저 보안 정책과 JSON 내보내기 확인을 위해 로컬 서버 사용을 권장한다.

## 편집

- `편집 시작`: `data-editable` 문구 100개를 바로 수정한다.
- `모션 끄기`: GIF 3개를 포스터로 전환한다. 기본값은 모션 재생이다.
- `저장`: 현재 문구를 브라우저 `localStorage`에 저장한다.
- `JSON 내보내기`: 카피와 디자인 토큰을 JSON으로 내보낸다.
- `초기화`: 브라우저에 저장한 문구를 삭제하고 원본으로 되돌린다.
- 전역 색과 간격은 `index.html` 상단 CSS 변수에서 수정한다.
- 이미지 교체 시 `assets/manifest.json`의 해시와 출처도 함께 갱신한다.

## 근거 구조

- 공급처 사실: [`../supplier-facts.json`](../supplier-facts.json)
- 경쟁상품 시장 불편: [`../research/market-pain-research.json`](../research/market-pain-research.json)
- 페이지 콘텐츠: [`content.json`](content.json)
- 주장-근거: [`claim-evidence-map.json`](claim-evidence-map.json)
- 게시 범위: [`publication-approval.json`](publication-approval.json)
- 자산 해시: [`assets/manifest.json`](assets/manifest.json)
- 최종 QA: [`qa/behance-rubric-report.md`](qa/behance-rubric-report.md)

## 자산

- `product-green-side.png`: 공급처 원본을 참조해 ImageGen으로 정리하고 누끼 검수한 제품 컷아웃.
- `aqua-use-context.gif`: ImageGen 착화 연출에 HyperFrames 카메라·파형 모션을 적용한 사용 맥락.
- `aqua-fit-guide.gif`: S부터 XXXL까지 발길이 선택 흐름.
- `aqua-thickness.gif`: 제품에서 떨어진 치수선으로 바닥 기준 약 1.5cm 위치를 설명.
- 모든 GIF에는 같은 이름의 PNG 포스터가 있다.

## 게시 제한

미끄럼 방지, 통기, 빠른 건조, 충격 흡수, 720도 유연성, 질환 예방은 시험 근거가 없어 게시하지 않는다. 밑창 소재도 공급처의 TPR·고무 표기가 충돌해 페이지에서 제외했다. 착화 장면은 사용 맥락 연출이며 실제 성능 증거가 아니다.

사용자 다각도 실사진이 도착하면 현재 카피와 레이아웃은 유지하고 제품 시트·누끼·다중 뷰 SSOT만 교체한다.
