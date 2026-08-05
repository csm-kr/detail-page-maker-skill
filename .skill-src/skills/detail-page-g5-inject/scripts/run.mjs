#!/usr/bin/env node
// G5 무드 주입. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G5");
  checklist({
    gate: ctx.gate,
    items: [
          "가이드의 무드 문장을 **어느 컷에 붙일지** 정한다 (판단)",
          "`scripts/run.mjs` 가 초안에 주입해 `flow-plan.json` 을 쓴다",
          "주입 후 배경 키워드와 브랜드 hex 가 프롬프트에 실제로 들어갔는지 확인한다"
    ],
    reading: [
          "work/design-ref/DESIGN-GUIDE.md"
    ],
  });
} catch (error) {
  refuse(error);
}
