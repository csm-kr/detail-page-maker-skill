#!/usr/bin/env node
// G6 스틸. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G6");
  checklist({
    gate: ctx.gate,
    items: [
          "`scripts/run.mjs` 가 batch 를 돌려 `work/gen/` 에 생성한다",
          "**컷마다 원본 해상도로 열어** 제품 동일성을 본다. 썸네일로 판정하지 않는다",
          "얼굴 정책과 어긋난 컷을 탈락시킨다",
          "`no_product` 컷에 착용 사진을 레퍼런스로 넣지 않는다",
          "`work/selection.json` 에 컷마다 채택·탈락과 이유, `checked_at_full_res` 를 남긴다",
          "탈락 컷은 재생성 job 을 만든다"
    ],
    reading: [
          "references/assets.md"
    ],
  });
} catch (error) {
  refuse(error);
}
