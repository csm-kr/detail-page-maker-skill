#!/usr/bin/env node
// G11 납품. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G11");
  checklist({
    gate: ctx.gate,
    items: [
          "Studio 를 띄워 **눈으로** 본다",
          "Wing 산출물을 새 namespace 로 내보낸다",
          "`work/killed.json` 의 프로세스를 전량 되살린다",
          "`orchestrate report` 로 확정한다. exit 0 이 아니면 완료라고 말하지 않는다"
    ],
    reading: [
          "references/studio.md"
    ],
  });
} catch (error) {
  refuse(error);
}
