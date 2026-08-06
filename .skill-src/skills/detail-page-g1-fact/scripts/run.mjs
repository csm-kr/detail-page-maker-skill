#!/usr/bin/env node
// G1 사실 잠금. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G1");
  checklist({
    gate: ctx.gate,
    items: [
          "공급처 페이지를 **다시** 받는다 — `orchestrate capture --url <공급처> --as supplier`",
          "실물 사진은 `input/photos/` 에만 있다. start 뒤에 넣었으면 `orchestrate photos` 로 잠근다 — 잠기지 않은 사진이 남아 있으면 거부한다",
          "사진이 없으면 공급처 동일 SKU 근거로 진행한다. 그 사실을 SSOT.md 에 적는다",
          "사진이 있으면 **원본 해상도로** 열어 실루엣·색·부품·수량·방향을 확인한다",
          "부품의 가동 범위, 분리 가능 여부, 결합 방향, 사용 자세 제약을 함께 적는다",
          "`work/SSOT.md` 에 **공개 가능한 사실만** 쓴다. 근거 없는 제약을 규칙으로 적지 않는다",
          "사진이 있으면 확인을 `확인: 원본 해상도` 한 줄로 SSOT.md 에 남긴다"
    ],
  });
} catch (error) {
  refuse(error);
}
