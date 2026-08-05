#!/usr/bin/env node
// G9 조립. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G9");
  checklist({
    gate: ctx.gate,
    items: [
          "**모든 문자열을 `flow-plan.json` 에서 읽는다.** 빌더에 한글을 박지 않는다",
          "`page-plan.md` 의 수단대로 컴포넌트를 만든다",
          "좌표를 붙인 이미지의 해시를 `work/anchors.json` 에 남긴다",
          "색은 토큰 한 곳에서만 온다. CSS 선택자 안에 hex 를 흘리지 않는다"
    ],
    reading: [
          "references/pipeline.md",
          "references/art-direction.md"
    ],
  });
} catch (error) {
  refuse(error);
}
