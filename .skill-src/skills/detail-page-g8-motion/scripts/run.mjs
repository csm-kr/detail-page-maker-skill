#!/usr/bin/env node
// G8 모션. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G8");
  checklist({
    gate: ctx.gate,
    items: [
          "brief 마다 컴포지션을 **다시 쓴다.** 옛 컴포지션을 재렌더하지 않는다",
          "자막 용어를 `page-plan.md` 의 용어 집합에서만 고른다",
          "brief 의 핵심 명사가 컴포지션에 실제로 들어갔는지 본다",
          "`method` 를 지켜 굽는다. 한 수단이 8개를 넘으면 편한 경로로 쏠린 것이다",
          "`work/comps/index.json` 에 brief↔컴포지션↔GIF 대응을 남긴다"
    ],
    reading: [
          "work/page-plan.md"
    ],
  });
} catch (error) {
  refuse(error);
}
