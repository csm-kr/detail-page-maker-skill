#!/usr/bin/env node
// G5 무드 주입. 초안 플랜 + 가이드 → 발행 플랜.
//
// 초안과 발행 플랜을 나눈 이유는 순환을 끊는 것이다. G4 의 입력이 초안이므로 G5 가 같은
// 파일을 고치면 G4 가 무효화되고 서로를 되돌린다. 부수 효과로 **주입을 건너뛰면 발행
// 플랜이 아예 없다** — 2회차의 누락이 파일의 부재로 드러난다.

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { json } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";
import { moodBlock, readGuide } from "./lib/guide.mjs";

const DRAFT_REL = path.join("work", "flow-plan.draft.json");
const OUT_REL = "flow-plan.json";

try {
  const ctx = await guard("G5");
  const out = (text) => process.stdout.write(`${text}\n`);

  const draft = await json(ctx.project, DRAFT_REL);
  if (!draft) throw new Error(`DRAFT_MISSING ${DRAFT_REL} 을 JSON 으로 읽을 수 없다`);

  const guide = await readGuide(ctx.project);
  if (!guide.ok) {
    throw new Error(
      `GUIDE_INCOMPLETE 가이드에서 주입할 것을 찾을 수 없다\n  ${guide.reasons.join("\n  ")}`,
    );
  }

  // 컷 집합을 바꾸지 않는다. 주입은 프롬프트만 건드린다.
  const cuts = (draft.cuts ?? []).map((cut) => ({
    ...cut,
    prompt: `${cut.prompt}${moodBlock(guide, cut)}`,
  }));

  const published = {
    ...draft,
    schema: "lean-page-plan-v1",
    injected_at: new Date().toISOString(),
    tokens: guide.palette,
    mood: { background: guide.background },
    policy: { ...(draft.policy ?? {}), model_face: ctx.policy.model_face },
    cuts,
  };

  await writeFile(
    path.join(ctx.project, OUT_REL),
    `${JSON.stringify(published, null, 2)}\n`,
    "utf8",
  );

  out(`주입 완료 → ${OUT_REL}`);
  out(
    `  토큰      ${Object.entries(guide.palette).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
  );
  out(`  배경      ${guide.background.slice(0, 6).join(", ")}`);
  out(`  컷        ${cuts.length}개`);
  out(`  얼굴 정책 ${ctx.policy.model_face}`);
  out("");
  out("가이드의 무드 문장을 어느 컷에 더 붙일지는 판단이다. 필요하면 발행 플랜을 다듬은");
  out(`뒤 gate G5 --check 로 확인한다.`);
} catch (error) {
  refuse(error);
}
