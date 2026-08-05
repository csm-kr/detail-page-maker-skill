---
name: detail-page-g2-reference
description: detail-page-orchestrator 가 G2 에서 호출한다. 지정 쿠팡 기준작 캡처를 읽어 섹션 흐름과 디자인 분위기를 flow-map.md 로 뽑는다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G2 · 기준작 판독

지정 쿠팡 기준작 캡처를 읽어 섹션 흐름과 디자인 분위기를 flow-map.md 로 뽑는다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 이 게이트가 없어 기준작을 한 번도 열지 않았다. 섹션 흐름을 공급처 페이지에서 베꼈고 목업 스타일이 ChatGPT 기본값으로 나왔다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- 기준작 전체를 캡처하고 `orchestrate lock --read <캡처> --url <쿠팡>` 로 등록한다
- 캡처를 **열어서** 본다. 길면 나눠 본다
- `work/flow-map.md` 에 네 개 절을 쓴다 — `## 섹션 순서` `## 고객 질문` `## 증명 방식` `## 디자인 분위기`
- 분위기 절에는 **픽셀에서 실측한 hex 를 3개 이상** 적는다. 눈대중은 쓰지 않는다
- 권리 있는 문장·이미지·후기를 복제하지 않는다. 판매 논리만 재구성한다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G2 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G2 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
