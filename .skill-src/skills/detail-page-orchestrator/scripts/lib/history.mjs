// 회차를 가로지르는 기록. 완화 판단의 유일한 근거다 (ADR-0007).
//
// 완화는 "그 게이트가 3회 연속 통과 + 잡은 결함 0건" 을 요구한다. 한 회차의 gates.json
// 으로는 판정할 수 없어서 워크스페이스에 쌓는다.
//
// 회차 키는 프로젝트 디렉터리 이름이다. 같은 회차를 다시 report 하면 **덮어쓴다** —
// 줄을 늘리면 report 를 여러 번 부른 것이 "여러 회차" 로 보여 연속 통과를 셀 수 없다.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PASSED } from "./gates-state.mjs";

export const SCHEMA_VERSION = "1.0";

export function historyPath(workspace) {
  return path.join(workspace, "work", "gates.history.json");
}

async function load(workspace) {
  try {
    return JSON.parse(await readFile(historyPath(workspace), "utf8"));
  } catch {
    return { schema_version: SCHEMA_VERSION, runs: [] };
  }
}

const round = (n) => Number(n.toFixed(1));

/**
 * 회차 한 줄을 쓴다. `report` 가 부른다.
 *
 * **완주하지 못한 회차도 남긴다.** 재작업량은 완주한 회차가 아니라 막힌 회차에서
 * 나오고, 그것이 빠진 검사의 비용이다.
 */
export async function recordRun(workspace, { project, state, rows, targetMin }) {
  const log = await load(workspace);

  const gates = {};
  for (const row of rows) {
    gates[row.gate.id] = {
      status: row.status,
      budget_min: row.gate.budgetMin ?? null,
      elapsed_min: row.elapsedMin === null ? null : round(row.elapsedMin),
      rejections: state.gates[row.gate.id]?.rejections ?? 0,
    };
  }

  const entry = {
    project: path.basename(project),
    name: state.project,
    recorded_at: new Date().toISOString(),
    target_min: targetMin,
    spent_min: round(rows.reduce((sum, row) => sum + (row.elapsedMin ?? 0), 0)),
    complete: rows.every((row) => row.status === PASSED),
    gates,
  };

  const at = log.runs.findIndex((run) => run.project === entry.project);
  if (at === -1) log.runs.push(entry);
  else log.runs[at] = entry;

  await mkdir(path.dirname(historyPath(workspace)), { recursive: true });
  await writeFile(historyPath(workspace), `${JSON.stringify(log, null, 2)}\n`, "utf8");
  return entry;
}
