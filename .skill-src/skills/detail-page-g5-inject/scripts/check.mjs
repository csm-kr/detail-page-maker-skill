// G5 판정. 2회차 최대 누락 — 가이드를 쓰고 프롬프트에 넣지 않았다.
//
// run.mjs 와 같은 `lib/guide.mjs` 를 쓴다. 무엇을 주입할지의 정의가 갈리면
// "주입했다는데 검사는 못 찾는" 상태가 된다. 검사의 독립성은 **산출물을 읽는 데서** 온다.

import path from "node:path";

import { json, want } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { readGuide } from "./lib/guide.mjs";

export async function check({ project }) {
  const reasons = [];
  const plan = await json(project, "flow-plan.json");
  const draft = await json(project, path.join("work", "flow-plan.draft.json"));

  if (!plan) {
    reasons.push(
      "flow-plan.json 을 JSON 으로 읽을 수 없다. 주입 결과가 발행 플랜이다 — 주입을 건너뛰면 이 파일이 없다",
    );
    return { reasons };
  }

  const guide = await readGuide(project);
  if (!guide.ok) {
    reasons.push(...guide.reasons);
    return { reasons };
  }

  // 토큰. 페이지와 GIF 가 같은 색을 보게 하는 유일한 출처다.
  want(
    reasons,
    plan.tokens && Object.keys(plan.tokens).length >= 3,
    "발행 플랜에 tokens 가 없다. 가이드의 팔레트를 플랜으로 옮긴다",
  );
  for (const [name, hex] of Object.entries(guide.palette)) {
    want(
      reasons,
      plan.tokens?.[name] === hex,
      `토큰 ${name} 이 가이드와 다르다 (가이드 ${hex} · 플랜 ${plan.tokens?.[name] ?? "없음"})`,
    );
  }

  const cuts = plan.cuts ?? [];
  want(reasons, cuts.length > 0, "발행 플랜에 cuts 가 없다");

  const brand = guide.palette.brand;
  const noHex = cuts.filter((cut) => !(cut.prompt ?? "").toUpperCase().includes(brand));
  want(
    reasons,
    noHex.length === 0,
    `브랜드 색 ${brand} 이 프롬프트에 없는 컷 ${noHex.length}개: ${noHex.slice(0, 5).map((c) => c.id).join(", ")}`,
  );

  const noMood = cuts.filter(
    (cut) => !guide.background.some((word) => (cut.prompt ?? "").includes(word)),
  );
  want(
    reasons,
    noMood.length === 0,
    `가이드 배경 키워드가 없는 컷 ${noMood.length}개: ${noMood.slice(0, 5).map((c) => c.id).join(", ")}`,
  );

  // 주입은 프롬프트만 바꾼다. 컷이 늘거나 줄면 플랜이 갈린 것이다.
  if (draft) {
    const before = (draft.cuts ?? []).map((c) => c.id).sort();
    const after = cuts.map((c) => c.id).sort();
    want(
      reasons,
      JSON.stringify(before) === JSON.stringify(after),
      "주입 전후로 컷 집합이 달라졌다. 주입은 프롬프트만 바꾼다",
    );
  }

  want(
    reasons,
    Boolean(plan.policy?.model_face),
    "발행 플랜에 policy.model_face 가 없다. G6 선별이 이 값을 본다",
  );

  return { reasons };
}
