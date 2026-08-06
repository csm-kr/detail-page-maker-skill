// 게이트 판정 호출. 판정 로직은 각 단계 스킬이 소유하고, 순서는 소유하지 않는다.

import path from "node:path";

import { gate } from "./gates.mjs";
import { exists } from "./hashchain.mjs";
import { SKILLS_ROOT, resolveArtifact } from "./project.mjs";

/**
 * 단계 스킬의 판정 모듈. **부를 때마다 디스크의 현재 판을 읽는다.**
 *
 * ESM 은 한 번 import 한 모듈을 프로세스가 끝날 때까지 캐시한다. 부모는 팩을 만들 때
 * 이미 그 게이트의 check.mjs 를 부르고, 그 뒤로 헤드리스 세션을 세 번 돌리는 동안 살아
 * 있다. 우회 플래그가 없는 설계라 **틀린 게이트를 고치는 것이 정상 경로인데**, 캐시된 판이
 * 다시 판정하면 고친 게이트가 같은 회차에서 영영 반영되지 않는다. 5회차 G7 이 그렇게
 * 3회 연속 거부됐다 — 새 프로세스로 돌린 같은 검사는 통과했다.
 */
export async function loadCheck(entry) {
  const url = `file://${entry.split(path.sep).join("/")}`;
  loadCheck.reads += 1;
  return import(`${url}?read=${loadCheck.reads}`);
}
loadCheck.reads = 0;

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
      const module = await loadCheck(entry);
      const extra = await module.check(ctx);
      reasons.push(...(extra?.reasons ?? []));
    }
  }

  return { ok: reasons.length === 0, reasons };
}
