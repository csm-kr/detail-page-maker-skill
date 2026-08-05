#!/usr/bin/env node
// G3 플랜. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G3");
  checklist({
    gate: ctx.gate,
    items: [
          "섹션 집합을 **flow-map 의 `## 섹션 순서` 와 일치**시킨다. 공급처 순서를 베끼지 않는다",
          "**화면에 보이는 모든 문자열**을 플랜에 넣는다. 빌더에 한글을 박지 않는다",
          "약 30개 still job 과 약 10개 GIF brief 를 함께 확정한다",
          "GIF brief 마다 `method` 를 고른다 (hyperframes / god-tibo / ffmpeg / mockup-overlay)",
          "출처 없는 성능·효능·인증·수치·후기·판매량을 만들지 않는다"
    ],
    reading: [
          "references/art-direction.md"
    ],
  });
} catch (error) {
  refuse(error);
}
