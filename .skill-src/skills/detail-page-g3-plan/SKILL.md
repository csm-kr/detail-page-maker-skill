---
name: detail-page-g3-plan
description: detail-page-orchestrator 가 G3 에서 호출한다. SSOT 와 flow-map 으로 Lean Page Plan 초안을 쓴다. 화면 문자열을 전량 담는다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G3 · 플랜

SSOT 와 flow-map 으로 Lean Page Plan 초안을 쓴다. 화면 문자열을 전량 담는다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 화면 문자열 약 100개가 빌더 안에 박혀 있어 플랜 밖에서 카피가 바뀌었다. 섹션 순서는 공급처 페이지 순서를 상속했다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- 섹션마다 `role` 을 적는다 — hero / pain / solution / compare / usage / spec / caution / closing
- **문제(pain) 를 먼저 보여 주고 장점(solution) 으로 넘어간다.** 장점은 3개 이상, 섹션 총합 13개 이상 (기준작 실측)
- 섹션 집합을 **flow-map 의 `## 섹션 순서` 와 일치**시킨다. 공급처 순서를 베끼지 않는다
- **화면에 보이는 모든 문자열**을 플랜에 넣는다. 빌더에 한글을 박지 않는다
- flow-map 의 `## 소구점` 에서 **3개 이상을 화면 문자열에 실제로 쓴다.** 과장이어도 원문에 있으면 쓴다 — 같은 상품의 판매 언어다
- `section.figure` 와 `section.stats` 로 큰 숫자를 준다. 근거 있는 수치만 — 없으면 그 장치는 안 나온다
- 고객 화면에 제작 과정을 쓰지 않는다. 한계 고지는 `footer_notice` 한 줄로 모은다
- 약 30개 still job 과 약 10개 GIF brief 를 함께 확정한다
- GIF brief 마다 `method` 를 고른다 (still-motion / tibo-sequence). 둘 다 써야 한다
- GIF brief 마다 `source_still` 을 정한다. GIF 는 발행된 스틸에서 시작한다
- `tibo-sequence` 의 `frames` 는 장면 하나에 0.9초씩 든다. 12장을 넘기지 않는다
- 출처 없는 성능·효능·인증·수치·후기·판매량을 만들지 않는다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G3 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G3 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
