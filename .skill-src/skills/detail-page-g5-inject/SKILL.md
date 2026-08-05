---
name: detail-page-g5-inject
description: detail-page-orchestrator 가 G5 에서 호출한다. DESIGN-GUIDE 의 무드를 플랜에 주입해 발행 플랜 flow-plan.json 을 만든다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G5 · 무드 주입

DESIGN-GUIDE 의 무드를 플랜에 주입해 발행 플랜 flow-plan.json 을 만든다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 가이드를 쓰고 끝냈다. still 프롬프트에 배경 키워드와 브랜드 hex 가 0건이었고, 그 상태로 스틸 30장이 생성됐다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- 가이드의 무드 문장을 **어느 컷에 붙일지** 정한다 (판단)
- `scripts/run.mjs` 가 초안에 주입해 `flow-plan.json` 을 쓴다
- 주입 후 배경 키워드와 브랜드 hex 가 프롬프트에 실제로 들어갔는지 확인한다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G5 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G5 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
