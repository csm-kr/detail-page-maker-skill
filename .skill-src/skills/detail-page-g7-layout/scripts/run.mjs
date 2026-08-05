#!/usr/bin/env node
// G7 레이아웃. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G7");
  checklist({
    gate: ctx.gate,
    items: [
          "`harvest.md` 를 보고 무엇을 크롭하고 무엇을 새로 만들지 정한다",
          "섹션마다 컴포넌트를 적고 **구현 수단을 고른다** — HTML텍스트 / CSS / SVG / 목업크롭 / 신규생성",
          "목업에서 이탈하는 섹션은 **이유를 적는다**",
          "페이지에서 쓸 **부위 용어 집합**을 확정한다. G8 자막이 이 집합을 따른다"
    ],
    reading: [
          "references/layout.md",
          "work/design-ref/harvest.md"
    ],
  });
} catch (error) {
  refuse(error);
}
