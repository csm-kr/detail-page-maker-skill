---
name: detail-page-g8-motion
description: detail-page-orchestrator 가 G8 에서 호출한다. brief 로 컴포지션을 다시 쓰고 GIF 를 굽는다. 직접 호출하면 선행 게이트
  검사로 거부되므로 오케스트레이터를 통해 진입한다.
---

# G8 · 모션

brief 로 컴포지션을 다시 쓰고 GIF 를 굽는다.

## 이 게이트가 없으면 무엇이 조용히 깨지는가

2회차에 brief 10개를 고쳤지만 컴포지션은 1회차 설계를 그대로 재렌더했다. g06 의 부위명 5개가 페이지와 전부 달랐고 g07 은 두 결 대비를 담지 못했다. 그리고 10개 전부 HyperFrames 한 경로만 썼다.

## 진입

```bash
node scripts/run.mjs
```

첫 줄이 선행 게이트 검사다. 통과하지 않았으면 거부하고 부족한 게이트를 알려준다.
순서와 상태는 오케스트레이터가 소유하고 이 스킬은 **판정과 작업만** 소유한다.

## 해야 하는 것

- brief 마다 컴포지션을 **다시 쓴다.** 옛 컴포지션을 재렌더하지 않는다
- 자막 용어를 `page-plan.md` 의 용어 집합에서만 고른다
- brief 의 핵심 명사가 컴포지션에 실제로 들어갔는지 본다
- `method` 를 지켜 굽는다. 한 수단이 8개를 넘으면 편한 경로로 쏠린 것이다
- `work/comps/index.json` 에 brief↔컴포지션↔GIF 대응을 남긴다

## 통과

```bash
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G8 --check
node ../detail-page-orchestrator/scripts/orchestrate.mjs gate G8 --pass
```

`--pass` 는 언제나 `scripts/check.mjs` 를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
