// 게이트 상태. 무효화 전파가 여기 있다 — 가장 강한 장치다.
//
// 규칙: 기록된 **입력** 해시와 현재 해시를 비교해 다르면 그 게이트와 모든 하류를
// 되돌린다. 출력은 비교하지 않는다. 산출물을 고친 사람은 그것을 만든 게이트가 아니라
// 그것을 **읽는** 게이트를 다시 돌려야 하기 때문이다.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { GATES, RUN_GATES, descendants, gate } from "./gates.mjs";
import { hashFile } from "./hashchain.mjs";
import { resolveArtifact } from "./project.mjs";

export const SCHEMA_VERSION = "1.0";

export const PENDING = "PENDING";
export const RUNNING = "RUNNING";
export const PASSED = "PASSED";
export const STALE = "STALE";
export const REJECTED = "REJECTED";

export const SYMBOL = {
  [PENDING]: "✗",
  [RUNNING]: "⟨⟩",
  [PASSED]: "○",
  [STALE]: "⚠",
  [REJECTED]: "⛔",
};

export function statePath(project) {
  return path.join(project, "work", "gates.json");
}

export function createState({ name, supplierUrl, coupangUrl }) {
  const gates = {};
  for (const g of RUN_GATES) gates[g.id] = { status: PENDING };
  return {
    schema_version: SCHEMA_VERSION,
    project: name,
    inputs: { supplier_url: supplierUrl, coupang_url: coupangUrl },
    gates,
  };
}

export async function loadState(project) {
  const raw = await readFile(statePath(project), "utf8");
  const parsed = JSON.parse(raw);
  for (const g of RUN_GATES) {
    parsed.gates[g.id] ??= { status: PENDING };
  }
  return parsed;
}

export async function saveState(project, state) {
  await mkdir(path.dirname(statePath(project)), { recursive: true });
  await writeFile(statePath(project), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function hashSpecs(specs, ctx) {
  const out = {};
  for (const spec of specs) {
    out[spec] = await hashFile(resolveArtifact(spec, ctx));
  }
  return out;
}

/** 시작 시각 기록. 이것이 없으면 --pass 가 거부된다. */
export function recordStart(state, id, { host }) {
  const entry = state.gates[id] ?? (state.gates[id] = {});
  entry.status = RUNNING;
  entry.started_at = new Date().toISOString();
  entry.by_host = host;
  delete entry.rejected;
  return entry;
}

/** 통과 기록. 이 함수는 기록 도구이고, 검사를 먼저 돌리는 것은 CLI 의 책임이다. */
export async function recordPass(state, id, { project, workspace, host }) {
  const g = gate(id);
  const ctx = { project, workspace };
  const entry = state.gates[id] ?? (state.gates[id] = {});
  entry.status = PASSED;
  entry.passed_at = new Date().toISOString();
  entry.ended_at = entry.passed_at;
  entry.by_host = host ?? entry.by_host ?? null;
  entry.inputs = await hashSpecs(g.inputs, ctx);
  entry.outputs = await hashSpecs(g.outputs, ctx);
  return entry;
}

/**
 * 거부 기록. 횟수를 누적한다 — 그 게이트가 **잡은 결함의 수**이고, 완화의 근거가 된다
 * (ADR-0007: 3회 연속 통과 + 결함 0건). 마지막 사유만 남기면 셀 수 없다.
 */
export function recordReject(state, id, reasons) {
  const entry = state.gates[id] ?? (state.gates[id] = {});
  entry.status = REJECTED;
  entry.rejections = (entry.rejections ?? 0) + 1;
  entry.rejected = { at: new Date().toISOString(), reasons };
  return entry;
}

function elapsedMin(entry) {
  if (!entry?.started_at) return null;
  const end = entry.ended_at ? Date.parse(entry.ended_at) : Date.now();
  return (end - Date.parse(entry.started_at)) / 60000;
}

/**
 * 현재 상태 판정. 저장된 값을 그대로 믿지 않고 매번 다시 계산한다.
 * 그래서 상류를 고치고 하류를 안 돌린 상태가 표에 드러난다.
 */
export async function evaluate(state, { workspace, project }) {
  const ctx = { workspace, project };
  const rows = new Map();

  for (const g of GATES) {
    if (g.id === "INIT") continue; // requireEnv 가 이미 본다
    const entry = state.gates[g.id] ?? { status: PENDING };
    let status = entry.status ?? PENDING;
    let reason = null;

    if (status === PASSED) {
      const current = await hashSpecs(g.inputs, ctx);
      const changed = Object.keys(current).filter(
        (spec) => (entry.inputs?.[spec] ?? null) !== current[spec],
      );
      if (changed.length > 0) {
        status = STALE;
        reason = `상류 변경: ${changed.join(", ")}`;
      }
    }

    const blockedBy = g.deps
      .filter((dep) => dep !== "INIT")
      .filter((dep) => (rows.get(dep)?.status ?? PENDING) !== PASSED);

    if (status === PASSED && blockedBy.length > 0) {
      status = STALE;
      reason = `선행 무효: ${blockedBy.join(", ")}`;
    }

    rows.set(g.id, {
      gate: g,
      status,
      reason,
      blockedBy,
      elapsedMin: elapsedMin(entry),
      entry,
    });
  }

  return [...rows.values()];
}

/** 무효화를 상태 파일에 되쓴다. 표만 바뀌고 파일이 안 바뀌면 다음 실행에서 갈린다. */
export async function persistEvaluation(project, state, rows) {
  let changed = false;
  for (const row of rows) {
    const entry = state.gates[row.gate.id];
    if (entry && entry.status !== row.status) {
      entry.status = row.status;
      if (row.reason) entry.stale_reason = row.reason;
      else delete entry.stale_reason;
      changed = true;
    }
  }
  if (changed) await saveState(project, state);
  return changed;
}

/** 상류가 흔들리면 하류 기록도 지워 둔다. 남겨 두면 다음 --pass 가 옛 해시를 본다. */
export function invalidateDownstream(state, id) {
  for (const child of descendants(id)) {
    const entry = state.gates[child];
    if (entry?.status === PASSED) entry.status = STALE;
  }
}
