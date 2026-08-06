#!/usr/bin/env node
// G2 기준작 판독. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G2");
  checklist({
    gate: ctx.gate,
    items: [
          "기준작 전체를 받는다 — `orchestrate capture --url <쿠팡> --as reference`",
          "캡처를 **열어서** 본다. 길면 나눠 본다",
          "`work/flow-map.md` 에 다섯 개 절을 쓴다 — `## 섹션 순서` `## 고객 질문` `## 증명 방식` `## 소구점` `## 디자인 분위기`",
          "분위기 절에는 **픽셀에서 실측한 hex 를 3개 이상** 적는다. 눈대중은 쓰지 않는다",
          "`## 소구점` 에 공급처와 쿠팡이 실제로 쓰는 표현을 **원문 그대로** 6개 이상 옮긴다. `백틱` 이나 \"따옴표\" 로 감싸고 출처를 적는다. 과장이어도 원문에 있으면 옮긴다 — G3 이 이 중 3개 이상을 화면에 쓰는지 본다",
          "문장·이미지·후기를 **통째로** 복제하지 않는다. 판매 논리와 판매 표현을 재구성한다"
    ],
    reading: [
          "../detail-page-g1-fact/references/commercial.md"
    ],
  });
} catch (error) {
  refuse(error);
}
