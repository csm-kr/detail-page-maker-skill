// 게이트 판정 호출. 판정 로직은 각 단계 스킬이 소유하고, 순서는 소유하지 않는다.

import path from "node:path";

import { gate } from "./gates.mjs";
import { exists } from "./hashchain.mjs";
import { SKILLS_ROOT, resolveArtifact } from "./project.mjs";

/** 산출물 존재 — 어느 게이트에나 적용되는 최소 조건이다. */
async function outputsPresent(id, ctx) {
  const reasons = [];
  for (const spec of gate(id).outputs) {
    if (!(await exists(resolveArtifact(spec, ctx)))) {
      reasons.push(`산출물 없음: ${spec}`);
    }
  }
  return reasons;
}

/**
 * 게이트 검사. 단계 스킬의 check.mjs 가 있으면 그것을 함께 돌린다.
 * 최소 조건(산출물 존재)은 스킬 검사와 무관하게 언제나 적용한다.
 */
export async function runCheck(id, ctx) {
  const reasons = await outputsPresent(id, ctx);

  const skill = gate(id).skill;
  if (skill) {
    const entry = path.join(SKILLS_ROOT, skill, "scripts", "check.mjs");
    if (await exists(entry)) {
      const module = await import(`file://${entry.split(path.sep).join("/")}`);
      const extra = await module.check(ctx);
      reasons.push(...(extra?.reasons ?? []));
    }
  }

  return { ok: reasons.length === 0, reasons };
}
