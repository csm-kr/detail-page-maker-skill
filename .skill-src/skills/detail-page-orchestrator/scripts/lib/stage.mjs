// 단계 스킬 공통 진입. 모든 run.mjs 의 첫 줄이 guard() 다.
//
// 사용자가 단계 스킬을 직접 불러도 여기서 거부된다.

import { Refusal, requireEnv } from "./env.mjs";
import { PASSED, evaluate, loadState } from "./gates-state.mjs";
import { gate } from "./gates.mjs";
import { resolveProject, resolveWorkspace } from "./project.mjs";

export { Refusal };

export function refuse(error) {
  const code = error instanceof Refusal ? error.code : "ERROR";
  const message = error instanceof Refusal ? error.message.slice(code.length + 1) : error.message;
  process.stdout.write(`REFUSED ${code}\n  ${message}\n`);
  process.exitCode = 1;
}

/**
 * 선행 게이트 검사. 통과하지 않았으면 Refusal GATE_BLOCKED.
 * 성공하면 이 단계가 쓸 경로와 정책을 준다.
 */
export async function guard(id) {
  const workspace = resolveWorkspace();
  const lock = await requireEnv(workspace);

  let project;
  try {
    project = resolveProject(workspace);
  } catch (error) {
    throw new Refusal("NOT_STARTED", error.message);
  }

  let state;
  try {
    state = await loadState(project);
  } catch {
    throw new Refusal(
      "NOT_STARTED",
      "work/gates.json 이 없다. orchestrate start 를 먼저 한다.",
    );
  }

  const rows = await evaluate(state, { workspace, project });
  const byId = new Map(rows.map((row) => [row.gate.id, row]));
  const blocked = gate(id)
    .deps.filter((dep) => dep !== "INIT")
    .filter((dep) => byId.get(dep)?.status !== PASSED);

  if (blocked.length > 0) {
    const detail = blocked
      .map((dep) => `${dep} (${byId.get(dep)?.status ?? "PENDING"})`)
      .join(", ");
    throw new Refusal(
      "GATE_BLOCKED",
      `선행 게이트가 통과하지 않았다: ${detail}\n  orchestrate gates 로 첫 미통과 게이트부터 진행한다.`,
      blocked,
    );
  }

  return { workspace, project, state, lock, gate: gate(id), policy: lock.policy };
}

/**
 * 판단이 필요한 게이트의 run.mjs 는 일을 하지 않는다.
 * 무엇을 해야 하는지와 어디를 읽어야 하는지만 출력하고 멈춘다.
 */
export function checklist({ gate: g, items, reading = [] }) {
  const lines = [
    `${g.id}  ${g.title} — ${g.summary}`,
    `주체 ${g.actor}${g.budgetMin ? ` · 예산 ${g.budgetMin}분` : ""}`,
    "",
    "해야 하는 것",
    ...items.map((item) => `  - ${item}`),
  ];
  if (reading.length > 0) {
    lines.push("", "읽을 것", ...reading.map((item) => `  - ${item}`));
  }
  lines.push(
    "",
    `끝나면  orchestrate gate ${g.id} --check  로 부족한 것을 확인하고`,
    `        orchestrate gate ${g.id} --pass   로 통과 기록을 남긴다`,
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}
