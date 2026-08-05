#!/usr/bin/env node
// G2 기준작 판독. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G2");
  checklist({
    gate: ctx.gate,
    items: [
          "기준작 전체를 캡처하고 `orchestrate lock --read <캡처> --url <쿠팡>` 로 등록한다",
          "캡처를 **열어서** 본다. 길면 나눠 본다",
          "`work/flow-map.md` 에 네 개 절을 쓴다 — `## 섹션 순서` `## 고객 질문` `## 증명 방식` `## 디자인 분위기`",
          "분위기 절에는 **픽셀에서 실측한 hex 를 3개 이상** 적는다. 눈대중은 쓰지 않는다",
          "권리 있는 문장·이미지·후기를 복제하지 않는다. 판매 논리만 재구성한다"
    ],
    reading: [
          "references/flow-map-guide.md"
    ],
  });
} catch (error) {
  refuse(error);
}
