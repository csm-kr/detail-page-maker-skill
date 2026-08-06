// G3 판정. 섹션 순서 상속과 "화면 문자열이 플랜 밖" 을 잡는다.

import path from "node:path";

import {
  json,
  listIds,
  section,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import {
  MIN_USED,
  appealPhrases,
  unusedAppeals,
} from "../../detail-page-orchestrator/scripts/lib/appeal.mjs";
import { FLOOR } from "../../detail-page-orchestrator/scripts/lib/benchmark.mjs";
import { producerLanguage } from "../../detail-page-orchestrator/scripts/lib/copy.mjs";
import { storyFaults } from "../../detail-page-orchestrator/scripts/lib/story.mjs";
import { METHODS } from "../../detail-page-g8-motion/scripts/lib/motion.mjs";

/**
 * **원문에 있어도** 쓰지 않는다. 약사법·의료기기법이 걸린다 — 출처가 있어도 위법이다.
 */
const NEVER = ["완치", "치료"];

/**
 * 지어내면 안 되는 표현. **원문에 있으면 쓴다.**
 *
 * 지정한 쿠팡 페이지는 같은 상품이다. 그 페이지가 `완벽 포획` 이라고 쓰고 있는데
 * 우리만 안 쓰면 같은 물건이 덜 좋아 보인다. `references/sales-story.md` 는 이것을
 * 이미 적고 있었다 — "공급처에 있는 표현은 과장이어도 쓴다."
 *
 * 3회차에는 이 목록이 무조건 금지였고, flow-map 도 그에 맞춰 공급처·쿠팡 표현을
 * 전부 "옮겨 오지 않는 것" 으로 분류했다. 그래서 소구점이 하나도 없는 페이지가 나왔다.
 * 지어내는 것과 옮기는 것은 다르다. 출처는 `## 소구점` 이 갖는다.
 */
const UNLESS_SOURCED = [
  "자외선 차단",
  "UV 차단",
  "100%",
  "최고",
  "1위",
  "무조건",
  // 5회차에 히어로가 `걸어두면 완벽 포획` 으로 나갔다. 기준작에 있는 표현이라 옮긴 것
  // 자체는 맞다. 그런데 `완벽` 은 어느 목록에도 없어서 **출처 없이 지어내도 통과했다.**
  // SSOT 의 판정문이 정확했다 — "`완벽` 은 **근거 없는** 절대 표현이다". 근거를 요구한다.
  "완벽",
];


export async function check({ project }) {
  const reasons = [];
  const plan = await json(project, path.join("work", "flow-plan.draft.json"));
  const map = await text(project, path.join("work", "flow-map.md"));

  if (!plan) {
    reasons.push("work/flow-plan.draft.json 을 JSON 으로 읽을 수 없다");
    return { reasons };
  }

  const sections = plan.sections ?? [];
  // 하한은 `lib/benchmark.mjs` 가 소유한다. 여기 숫자를 다시 적으면 갈린다.
  want(
    reasons,
    sections.length >= FLOOR.sections,
    `섹션이 ${sections.length}개다. 기준작 하한은 ${FLOOR.sections}개다`,
  );

  if (map) {
    const expected = listIds(section(map, "섹션 순서"));
    const actual = sections.map((s) => s.id);
    const missing = expected.filter((id) => !actual.includes(id));
    const extra = actual.filter((id) => !expected.includes(id));
    want(
      reasons,
      missing.length === 0 && extra.length === 0,
      `섹션 집합이 flow-map 과 다르다. 빠짐 [${missing.join(", ")}] 추가 [${extra.join(", ")}]`,
    );
  }

  // 판매 서사. role 이 없으면 스펙 나열이 그대로 통과한다 — 1회차가 그랬다.
  for (const fault of storyFaults(sections)) reasons.push(fault);

  // 제작자 언어. **화면 문자열만** 본다 — cuts.prompt 와 gif_briefs 는 화면에 안 나간다.
  const { cuts: _cuts, gif_briefs: _briefs, ...onScreen } = plan;
  for (const hit of producerLanguage(JSON.stringify(onScreen))) {
    reasons.push(`제작자 언어가 화면 문자열에 있다: "${hit.sample}"`);
  }

  // 화면 문자열은 전량 플랜 안에 있어야 한다. 섹션마다 헤드라인이 없으면 빌더가 만들게 된다.
  for (const s of sections) {
    want(
      reasons,
      typeof s.headline === "string" && s.headline.trim().length > 0,
      `섹션 ${s.id} 에 headline 이 없다. 화면 문자열을 빌더에 박지 않는다`,
    );
  }

  const cuts = plan.cuts ?? [];
  want(reasons, cuts.length >= 20, `still job 이 ${cuts.length}개다. 약 30개를 확정한다`);
  for (const cut of cuts) {
    want(reasons, Boolean(cut.id && cut.prompt), `컷 ${cut.id ?? "?"} 에 id 와 prompt 가 필요하다`);
    want(
      reasons,
      typeof cut.target_size === "string",
      `컷 ${cut.id} 에 target_size 가 없다. 발행 비율을 컷마다 정한다`,
    );
  }

  const briefs = plan.gif_briefs ?? [];
  want(reasons, briefs.length >= 6, `GIF brief 가 ${briefs.length}개다. 약 10개를 확정한다`);
  const cutIds = new Set(cuts.map((cut) => cut.id));
  for (const brief of briefs) {
    want(
      reasons,
      METHODS.includes(brief.method),
      `brief ${brief.id ?? "?"} 의 method 가 없거나 모르는 값이다 (${METHODS.join(" / ")})`,
    );
    // GIF 의 입력은 이미지다. 1회차에 컴포지션 10개 전부 도형이었다.
    want(
      reasons,
      Boolean(brief.source_still),
      `brief ${brief.id ?? "?"} 에 source_still 이 없다. GIF 는 발행된 스틸에서 시작한다`,
    );
    if (brief.source_still && cutIds.size > 0) {
      want(
        reasons,
        cutIds.has(brief.source_still),
        `brief ${brief.id} 의 source_still 이 플랜의 컷이 아니다: ${brief.source_still}`,
      );
    }
  }
  // 두 수단은 서로 다른 것을 증명한다. 한쪽만 쓰면 절반을 안 한 것이다.
  for (const method of METHODS) {
    want(
      reasons,
      briefs.some((brief) => brief.method === method),
      `method ${method} 를 쓴 brief 가 없다. 두 수단을 모두 쓴다`,
    );
  }
  const counts = new Map();
  for (const brief of briefs) counts.set(brief.method, (counts.get(brief.method) ?? 0) + 1);
  for (const [method, count] of counts) {
    want(
      reasons,
      count <= 8,
      `method ${method} 가 ${count}개다. 한 수단이 8개를 넘으면 편한 경로로 쏠린 것이다`,
    );
  }

  const blob = JSON.stringify(plan);

  // 소구점. G2 가 모은 표현을 플랜이 **실제로 쓰는가.**
  // 모으기만 하고 안 쓰면 3회차와 같다 — flow-map 에는 다 적혀 있었다.
  const phrases = appealPhrases(map ?? "");
  if (phrases.length > 0) {
    const used = phrases.length - unusedAppeals(phrases, JSON.stringify(onScreen)).length;
    want(
      reasons,
      used >= MIN_USED,
      `flow-map 이 모은 소구점 ${phrases.length}개 중 ${used}개를 쓴다. ${MIN_USED}개 이상 쓴다 —
  같은 상품을 팔면서 그 상품의 판매 언어를 안 쓰면 팔리지 않는다`,
    );
  }

  for (const term of NEVER) {
    want(reasons, !blob.includes(term), `약사법에 걸리는 표현이 플랜에 있다: "${term}"`);
  }
  // 원문에 있으면 쓴다. 없으면 지어낸 것이다.
  const sourced = phrases.join(" ");
  for (const term of UNLESS_SOURCED) {
    want(
      reasons,
      !blob.includes(term) || sourced.includes(term),
      `근거 없는 표현이 플랜에 있다: "${term}". 공급처·쿠팡 원문에 있으면 \`## 소구점\` 에 인용하고 쓴다`,
    );
  }

  return { reasons };
}
