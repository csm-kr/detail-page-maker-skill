// G7 판정. 목업 이탈 무기록과 "전부 SVG/CSS" 편향을 잡는다.

import path from "node:path";

import {
  headings,
  json,
  listIds,
  section,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

const MEANS = ["html", "css", "svg", "crop", "generate"];

export async function check({ project }) {
  const reasons = [];
  const page = await text(project, path.join("work", "page-plan.md"));
  const plan = await json(project, "flow-plan.json");
  const harvest = await text(project, path.join("work", "design-ref", "harvest.md"));

  if (!page) {
    reasons.push("work/page-plan.md 이 없다");
    return { reasons };
  }

  const sections = headings(page).filter((title) => title !== "용어 집합");
  const planned = (plan?.sections ?? []).map((s) => s.id);
  if (planned.length > 0) {
    want(
      reasons,
      sections.length === planned.length,
      `섹션 수가 다르다. 플랜 ${planned.length} · page-plan ${sections.length}`,
    );
  }

  want(
    reasons,
    /harvest\.md/.test(page),
    "page-plan.md 이 harvest.md 를 참조하지 않는다. 무엇을 크롭하고 무엇을 새로 만들지가 여기서 갈린다",
  );

  const terms = listIds(section(page, "용어 집합"));
  const termLines = (section(page, "용어 집합") ?? "").split("\n").filter((l) => l.trim());
  want(
    reasons,
    termLines.length >= 3,
    "`## 용어 집합` 이 비어 있다. G8 자막이 이 집합을 따른다",
  );

  // 수단 열. 섹션마다 최소 한 줄의 `수단:` 이 있어야 한다.
  const found = [];
  for (const title of sections) {
    const block = section(page, title) ?? "";
    const means = [...block.matchAll(/수단:\s*([a-z, ]+)/g)].flatMap((m) =>
      m[1].split(",").map((s) => s.trim()).filter(Boolean),
    );
    if (means.length === 0) {
      reasons.push(`섹션 ${title} 에 \`수단:\` 이 없다. 컴포넌트마다 구현 수단을 고른다`);
      continue;
    }
    const unknown = means.filter((mean) => !MEANS.includes(mean));
    want(
      reasons,
      unknown.length === 0,
      `섹션 ${title} 의 모르는 수단: ${unknown.join(", ")} (${MEANS.join(" / ")})`,
    );
    found.push(...means);

    if (/이탈/.test(block)) {
      want(
        reasons,
        /이탈 이유:\s*\S/.test(block),
        `섹션 ${title} 이 목업에서 이탈하는데 \`이탈 이유:\` 가 없다`,
      );
    }
  }

  // 2회차 편향. 전부 SVG/CSS 면 목업의 강점을 버린 것이므로 이유를 요구한다.
  const onlyFlat = found.length > 0 && found.every((mean) => mean === "svg" || mean === "css");
  if (onlyFlat) {
    want(
      reasons,
      /전부 SVG 이유:\s*\S/.test(page),
      "수단이 전부 svg/css 다. 목업의 이펙트·이모지를 버리는 선택이므로 `전부 SVG 이유:` 를 적는다",
    );
  }

  if (harvest && /크롭/.test(harvest)) {
    want(
      reasons,
      found.includes("crop") || /전부 SVG 이유:/.test(page),
      "harvest.md 는 크롭을 계획했는데 page-plan 에 crop 수단이 없다",
    );
  }

  return { reasons, terms };
}
