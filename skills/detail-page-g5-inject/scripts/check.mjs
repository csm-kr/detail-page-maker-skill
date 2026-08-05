// G5 판정. 2회차 최대 누락 — 가이드를 쓰고 프롬프트에 넣지 않았다.

import path from "node:path";

import {
  hexes,
  json,
  section,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

export async function check({ project }) {
  const reasons = [];
  const guide = await text(project, path.join("work", "design-ref", "DESIGN-GUIDE.md"));
  const plan = await json(project, "flow-plan.json");
  const draft = await json(project, path.join("work", "flow-plan.draft.json"));

  if (!plan) {
    reasons.push("flow-plan.json 을 JSON 으로 읽을 수 없다. 주입 결과가 발행 플랜이다");
    return { reasons };
  }
  if (!guide) {
    reasons.push("DESIGN-GUIDE.md 가 없다");
    return { reasons };
  }

  const brand = hexes(guide);
  const background = (section(guide, "배경") ?? section(guide, "배경과 장식") ?? "")
    .split(/[\s,·]+/)
    .map((word) => word.replace(/[`*_()]/g, "").trim())
    .filter((word) => /^[가-힣]{2,}$/.test(word));

  const cuts = plan.cuts ?? [];
  want(reasons, cuts.length > 0, "발행 플랜에 cuts 가 없다");

  const noHex = cuts.filter((cut) => !brand.some((hex) => (cut.prompt ?? "").toUpperCase().includes(hex)));
  want(
    reasons,
    noHex.length === 0,
    `브랜드 hex 가 프롬프트에 없는 컷 ${noHex.length}개: ${noHex.slice(0, 5).map((c) => c.id).join(", ")}`,
  );

  if (background.length > 0) {
    const noMood = cuts.filter((cut) => !background.some((word) => (cut.prompt ?? "").includes(word)));
    want(
      reasons,
      noMood.length === 0,
      `가이드 배경 키워드가 없는 컷 ${noMood.length}개: ${noMood.slice(0, 5).map((c) => c.id).join(", ")}`,
    );
  } else {
    reasons.push("DESIGN-GUIDE.md 에 `## 배경` 절이 없어 주입할 배경 키워드를 찾을 수 없다");
  }

  // 초안과 컷 집합이 같아야 한다. 주입이 컷을 늘리거나 줄이면 안 된다.
  if (draft) {
    const before = (draft.cuts ?? []).map((c) => c.id).sort();
    const after = cuts.map((c) => c.id).sort();
    want(
      reasons,
      JSON.stringify(before) === JSON.stringify(after),
      "주입 전후로 컷 집합이 달라졌다. 주입은 프롬프트만 바꾼다",
    );
  }

  return { reasons };
}
