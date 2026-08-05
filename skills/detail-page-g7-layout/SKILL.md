---
name: detail-page-g7-layout
description: detail-page-orchestrator 가 G7 에서 호출한다. 섹션별 레이아웃과 컴포넌트 구현 수단을 page-plan.md 로 정한다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G7 · 레이아웃

섹션별 레이아웃과 컴포넌트 구현 수단을 page-plan.md 로 정한다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 섹션 4개가 목업에서 이탈했는데 기록이 없었다. 컴포넌트를 전부 CSS+선 아이콘으로 재현해 목업의 과장된 이펙트와 이모지를 버렸다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- `harvest.md` 를 보고 무엇을 크롭하고 무엇을 새로 만들지 정한다
- 섹션마다 컴포넌트를 적고 **구현 수단을 고른다** — HTML텍스트 / CSS / SVG / 목업크롭 / 신규생성
- 목업에서 이탈하는 섹션은 **이유를 적는다**
- 페이지에서 쓸 **부위 용어 집합**을 확정한다. G8 자막이 이 집합을 따른다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G7 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G7 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
