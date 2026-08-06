// G6 판정. 30장 만들어 30장 그대로 발행한 것을 잡는다. 선별이 통과 조건이다.

import path from "node:path";

import {
  json,
  listFiles,
  policy,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

export async function check({ workspace, project }) {
  const reasons = [];
  const plan = await json(project, "flow-plan.json");
  const selection = await json(project, path.join("work", "selection.json"));
  const { model_face: modelFace } = await policy(workspace);

  // 기준 컷. 이것이 없으면 30장이 각자 따로 생성된다 — 1회차에 references 가 전부
  // 비어 있었고 18장이 제품 동일성으로 탈락했다.
  const base = await listFiles(
    path.join(project, "work", "stills", "base"),
    /\.(png|webp|jpe?g)$/i,
  );
  want(
    reasons,
    base.length > 0,
    "기준 컷이 없다 (work/stills/base). --base 로 한 장을 먼저 만들어 나머지의 레퍼런스로 쓴다",
  );

  if (!selection) {
    reasons.push("work/selection.json 이 없다. 컷마다 채택·탈락과 이유를 남긴다");
    return { reasons };
  }

  const entries = selection.entries ?? [];
  const cuts = plan?.cuts ?? [];

  if (cuts.length > 0) {
    const judged = new Set(entries.map((e) => e.cut));
    const missing = cuts.filter((cut) => !judged.has(cut.id)).map((cut) => cut.id);
    want(
      reasons,
      missing.length === 0,
      `판정하지 않은 컷 ${missing.length}개: ${missing.slice(0, 8).join(", ")}`,
    );
  }

  const unchecked = entries.filter((e) => e.checked_at_full_res !== true);
  want(
    reasons,
    unchecked.length === 0,
    `원본 해상도로 보지 않은 컷 ${unchecked.length}개. 썸네일로 판정하지 않는다`,
  );

  const noReason = entries.filter((e) => !e.decision || !e.reason);
  want(
    reasons,
    noReason.length === 0,
    `decision 또는 reason 이 없는 컷 ${noReason.length}개`,
  );

  const rejected = entries.filter((e) => e.decision === "reject");
  const withoutRegen = rejected.filter((e) => !e.regen_job);
  want(
    reasons,
    withoutRegen.length === 0,
    `탈락했는데 재생성 job 이 없는 컷 ${withoutRegen.length}개`,
  );

  const accepted = entries.filter((e) => e.decision === "accept");
  want(reasons, accepted.length > 0, "채택된 컷이 없다");

  if (modelFace === "none" || modelFace === "crop-below-chin") {
    const violating = accepted.filter((e) => e.face === "visible");
    want(
      reasons,
      violating.length === 0,
      `얼굴 정책 ${modelFace} 인데 얼굴이 보이는 컷이 채택됐다: ${violating.map((e) => e.cut).join(", ")}`,
    );
  }
  if (modelFace === "allow") {
    const withFace = accepted.filter((e) => e.face === "visible");
    const unverified = withFace.filter((e) => e.same_person !== true);
    want(
      reasons,
      unverified.length === 0,
      `얼굴이 보이는 컷에 동일 인물 확인(same_person)이 없다: ${unverified.map((e) => e.cut).join(", ")}`,
    );
  }

  // no_product 컷에 착용 사진을 레퍼런스로 넣으면 제품이 끼어든다.
  const noProduct = entries.filter((e) => e.no_product === true && (e.references ?? []).length > 0);
  want(
    reasons,
    noProduct.length === 0,
    `no_product 컷에 레퍼런스가 붙어 있다: ${noProduct.map((e) => e.cut).join(", ")}`,
  );

  return { reasons };
}
