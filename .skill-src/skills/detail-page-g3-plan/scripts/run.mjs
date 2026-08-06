#!/usr/bin/env node
// G3 플랜. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G3");
  checklist({
    gate: ctx.gate,
    items: [
          "섹션마다 `role` 을 적는다 — hero / pain / solution / compare / usage / spec / caution / closing",
          "**문제(pain) 를 먼저 보여 주고 장점(solution) 으로 넘어간다.** 장점은 3개 이상, 섹션 총합 13개 이상 (기준작 실측)",
          "섹션 집합을 **flow-map 의 `## 섹션 순서` 와 일치**시킨다. 공급처 순서를 베끼지 않는다",
          "**화면에 보이는 모든 문자열**을 플랜에 넣는다. 빌더에 한글을 박지 않는다",
          "flow-map 의 `## 소구점` 에서 **3개 이상을 화면 문자열에 실제로 쓴다.** 과장이어도 원문에 있으면 쓴다 — 같은 상품의 판매 언어다",
          "`section.figure` 와 `section.stats` 로 큰 숫자를 준다. 근거 있는 수치만 — 없으면 그 장치는 안 나온다",
          "고객 화면에 제작 과정을 쓰지 않는다. 한계 고지는 `footer_notice` 한 줄로 모은다",
          "약 30개 still job 과 약 10개 GIF brief 를 함께 확정한다",
          "GIF brief 마다 `method` 를 고른다 (still-motion / tibo-sequence). 둘 다 써야 한다",
          "GIF brief 마다 `source_still` 을 정한다. GIF 는 발행된 스틸에서 시작한다",
          "`tibo-sequence` 의 `frames` 는 장면 하나에 0.9초씩 든다. 12장을 넘기지 않는다",
          "출처 없는 성능·효능·인증·수치·후기·판매량을 만들지 않는다"
    ],
    reading: [
          "../detail-page-orchestrator/references/sales-story.md",
          "../detail-page-orchestrator/references/benchmark/BENCHMARK.md",
          "../detail-page-g9-build/references/art-direction.md"
    ],
  });
} catch (error) {
  refuse(error);
}
