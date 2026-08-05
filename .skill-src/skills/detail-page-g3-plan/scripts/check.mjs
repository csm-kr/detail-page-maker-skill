// G3 판정. 섹션 순서 상속과 "화면 문자열이 플랜 밖" 을 잡는다.

import path from "node:path";

import {
  json,
  listIds,
  section,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

// 근거 없이 쓰면 안 되는 표현. 2회차 SSOT 가 "자외선 차단은 쓰지 않는다" 로 잠근 것들.
const FORBIDDEN = [
  "자외선 차단",
  "UV 차단",
  "100%",
  "완치",
  "치료",
  "최고",
  "1위",
  "무조건",
];

const METHODS = ["hyperframes", "god-tibo", "ffmpeg", "mockup-overlay"];

export async function check({ project }) {
  const reasons = [];
  const plan = await json(project, path.join("work", "flow-plan.draft.json"));
  const map = await text(project, path.join("work", "flow-map.md"));

  if (!plan) {
    reasons.push("work/flow-plan.draft.json 을 JSON 으로 읽을 수 없다");
    return { reasons };
  }

  const sections = plan.sections ?? [];
  want(reasons, sections.length > 0, "플랜에 sections 가 없다");

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
  for (const brief of briefs) {
    want(
      reasons,
      METHODS.includes(brief.method),
      `brief ${brief.id ?? "?"} 의 method 가 없거나 모르는 값이다 (${METHODS.join(" / ")})`,
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
  for (const term of FORBIDDEN) {
    want(reasons, !blob.includes(term), `근거 없는 표현이 플랜에 있다: "${term}"`);
  }

  return { reasons };
}
