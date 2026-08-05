#!/usr/bin/env node
// G1 사실 잠금. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G1");
  checklist({
    gate: ctx.gate,
    items: [
          "공급처 페이지를 **다시** 받고 `orchestrate lock --read <캡처> --url <공급처>` 로 등록한다",
          "실물 사진을 **원본 해상도로** 열어 실루엣·색·부품·수량·방향을 확인한다",
          "부품의 가동 범위, 분리 가능 여부, 결합 방향, 사용 자세 제약을 함께 적는다",
          "`work/SSOT.md` 에 **공개 가능한 사실만** 쓴다. 근거 없는 제약을 규칙으로 적지 않는다",
          "사진 확인을 `확인: 원본 해상도` 한 줄로 SSOT.md 에 남긴다"
    ],
    reading: [
          "references/commercial.md"
    ],
  });
} catch (error) {
  refuse(error);
}
