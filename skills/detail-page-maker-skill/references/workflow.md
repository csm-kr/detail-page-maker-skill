# 빠른 제작 플로우

이 문서는 모든 제작에서 읽는 실행 정본이다. 목표는 조사보다 제작에 시간을 쓰며
벽시계 80분 안에 폭 780px 완성 HTML을 만드는 것이다.
G1.5 목업 구간이 18분을 쓰고 G2가 그 결과를 기다리므로 이 구간은 병렬로 숨길 수 없다.
실제보다 낮은 숫자를 목표로 두면 범위 이탈 감지 기능이 죽는다.

## 입력과 완료

필수 입력은 공급처 URL과 사용자가 지정한 쿠팡 URL이다. 실제 제품 사진은 선택이며
최초 한 번만 확인한다. 없으면 같은 SKU의 공급처 사진을 제품 기준으로 사용한다.

완료물은 다음과 같다.

```text
output/detail-page.html
output/media/images/
output/media/gifs/
output/wing/<export-id>/   # Wing Export를 실행한 경우
```

HTML, 섹션 이미지, GIF/WebP의 작업 폭은 모두 780px다.

## 60분 실행 예산

| 구간 | 권장 벽시계 | 결과 |
| --- | ---: | --- |
| G0+G1 | 10분 | Product Card, Coupang Flow Map, Lean Page Plan |
| G1.5 | 18분 | 섹션별 목업, DESIGN-GUIDE.md, 무드가 주입된 플랜 |
| G2 | 15분 | 약 30개 still 자산 |
| G3 | 20분 | 약 10개 GIF/WebP |
| G4+G5 | 15분 | HTML, QA, Studio, 선택적 Wing |

시간은 품질을 해치는 중단선이 아니라 병렬화와 범위 이탈을 감지하는 목표다. 지정
쿠팡 페이지가 충분하면 다른 시장 조사로 넓히지 않는다.

## 병렬 실행

가용한 sub-agent를 적극 사용한다.

- Evidence agent: 공급처/사진에서 identity와 실제 사용할 사실을 추출한다.
- Flow agent: 지정 쿠팡 페이지를 캡처하고 섹션별 판매 문법을 정리한다.
- Planning agent: 두 결과를 받아 카피, still job, GIF brief를 만든다.
- Design agent: ChatGPT로 섹션별 목업을 받고 DESIGN-GUIDE.md를 쓴다. 브라우저를 쓰므로
  캡처 lane과 같은 lane에서 직렬 실행한다.
- Production agents: 이미지와 motion을 병렬 제작한다.
- QA agent: 생산자와 다른 session에서 identity, media, HTML을 검수한다.

동일 로컬 Browser Harness를 쓰는 URL 캡처는 한 lane에서 직렬 실행한다. 캡처가
저장되는 즉시 분석, 카피, 프롬프트, 모션 설계는 서로 병렬 진행한다. 이미지 API의
동시 worker 수를 Codex sub-agent 수로 제한하지 않는다.

## 단계

### G0 — Quick Product Card

공급처 전체를 보관하려 하지 말고 공개 카피와 생성에 필요한 항목만 수집한다.

- 상품명, 옵션, 구성품, 수량, 규격, 소재, 사용법, 주의사항
- 제품 실루엣, 색, 면 방향, 부품과 결합부 위치
- 공급처가 실제로 말한 기능과 조건
- 대표 identity 이미지 3~6장 또는 사용자 사진

### G1 — Reference Flow Map

지정 쿠팡을 full-page 기준으로 다음만 추출한다.

- 섹션 순서와 각 패널이 답하는 고객 질문
- 후킹, 문제 제기, 해결, 기능 증거, 사용 장면, 선택, 구매 확신의 연결
- 카피 공식과 헤드라인 길이, 이미지/GIF 선택, 화면 밀도와 강약

각 항목을 Product Card의 사실과 연결해 새 문장으로 쓰고 Lean Page Plan 하나에
section, copy, fact, still job, GIF brief, 다음 섹션 이유를 기록한다. 맞지 않는
기준작 기능은 버리고 현재 상품의 확인된 장점으로 대체한다.

### G1.5 — Design Reference

확정된 플랜과 실물 사진을 ChatGPT에 넣어 섹션별 목업을 받고 무드를 확정한다.
절차와 브라우저 조작 함정은 [design-reference.md](design-reference.md)에 있다.

- 4장씩 나눠 요청한다. 한 턴에 전량을 요청하면 앞선 턴과 다른 해석이 나와 톤이 갈린다.
- 목업 픽셀에서 팔레트를 뽑는다. 눈대중으로 적지 않는다.
- 실물과 대조해 identity 오류를 가이드에 남긴다. 목업은 실물에 없는 라벨을 만들어 붙인다.
- 목업은 발행하지 않는다. 한글이 없는 영역만 배경으로 크롭할 수 있다.

### G2~G5 — 제작과 출력

God Tibo로 still을 한 번의 동시 batch에 만들고, 준비된 장면부터 HyperFrames
motion을 시작한다. 완성 자산은 HTML에 조립해 780px로 검사한다. Studio는 완성본의
최종 편집에만 쓰며 중간 승인 화면으로 사용하지 않는다. Wing은 새 export namespace로
파생하고 원격 파일 검증 뒤 확정한다.

## 자율성과 중단

중간 승인이나 고정 대기시간은 없다. AI는 기준작의 설득력을 보존하는 범위에서
섹션 수, still/GIF 비율, 카피 톤, 시각 스타일, agent 배치를 자유롭게 결정한다.
다음 경우에만 멈춘다.

- 두 필수 URL 중 하나에 접근할 수 없고 캡처/원문도 없는 경우
- G1.5에 필요한 브라우저 CDP endpoint나 ChatGPT 로그인이 없는 경우 (`doctor`의 `browser_cdp`)
- 제품 SKU 또는 identity가 충돌하는 경우
- 필요한 주장을 사실로 뒷받침할 수 없는 경우
- 권리 없는 고유 자산을 직접 사용해야만 진행 가능한 경우
- 최종 HTML 또는 Wing 검증이 반복 실패하는 경우
