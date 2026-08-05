#!/usr/bin/env node
// G10 QA. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G10");
  checklist({
    gate: ctx.gate,
    items: [
          "`scripts/run.mjs` 가 strict-media QA 와 용량·포맷 검사를 돌린다",
          "사진은 `policy.photo_format` 을 따른다. PNG 로 남기지 않는다",
          "미디어 총량이 `policy.media_budget_mb` 를 넘지 않게 한다"
    ],
    reading: [],
  });
} catch (error) {
  refuse(error);
}
