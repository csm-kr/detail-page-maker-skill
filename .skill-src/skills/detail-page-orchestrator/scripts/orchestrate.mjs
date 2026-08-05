#!/usr/bin/env node
// 오케스트레이터. 순서·상태·검사·보고를 소유하고 **일은 하지 않는다.**
//
// 우회 플래그는 없다. --force 를 만들지 않는다 — 게이트가 틀렸으면 게이트를 고친다.

import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { runCheck } from "./lib/check.mjs";
import { Refusal, requireEnv } from "./lib/env.mjs";
import {
  PASSED,
  RUNNING,
  STALE,
  SYMBOL,
  createState,
  evaluate,
  invalidateDownstream,
  loadState,
  persistEvaluation,
  recordPass,
  recordReject,
  recordStart,
  saveState,
  statePath,
} from "./lib/gates-state.mjs";
import { RUN_GATES, budgetTotalMin, gate, layers } from "./lib/gates.mjs";
import { exists, hashFile } from "./lib/hashchain.mjs";
import {
  SKILLS_ROOT,
  projectsRoot,
  resolveProject,
  resolveWorkspace,
} from "./lib/project.mjs";

const out = (text) => process.stdout.write(`${text}\n`);

function host() {
  return process.env.DETAIL_PAGE_HOST ?? "claude-code";
}

function flag(argv, name) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

function refuse(error) {
  const code = error instanceof Refusal ? error.code : "ERROR";
  const message =
    error instanceof Refusal ? error.message.slice(code.length + 1) : error.message;
  out(`REFUSED ${code}`);
  for (const line of message.split("\n")) out(`  ${line}`);
  process.exitCode = 1;
}

async function context() {
  const workspace = resolveWorkspace();
  const lock = await requireEnv(workspace);
  let project;
  try {
    project = resolveProject(workspace);
  } catch (error) {
    throw new Refusal("NOT_STARTED", error.message);
  }
  if (!(await exists(statePath(project)))) {
    throw new Refusal(
      "NOT_STARTED",
      "work/gates.json 이 없다. start 를 먼저 한다.",
    );
  }
  return { workspace, project, lock, state: await loadState(project) };
}

// ─── start ────────────────────────────────────────────────────────────────

async function cmdStart(argv) {
  const workspace = resolveWorkspace();
  const lock = await requireEnv(workspace);

  const name = flag(argv, "name");
  const supplierUrl = flag(argv, "supplier-url");
  const coupangUrl = flag(argv, "coupang-url");
  const photos = flag(argv, "photos") ?? "data";
  const modelFace = flag(argv, "model-face");

  const missing = [];
  if (typeof name !== "string") missing.push("--name");
  if (typeof supplierUrl !== "string") missing.push("--supplier-url");
  if (typeof coupangUrl !== "string") missing.push("--coupang-url");
  if (missing.length > 0) {
    throw new Refusal("INPUTS_MISSING", `필요한 인자가 없다: ${missing.join(" ")}`);
  }

  const project = path.join(projectsRoot(workspace), `${name}-${Date.now()}`);
  for (const dir of [
    "work",
    path.join("input", "photos"),
    path.join("output", "media"),
  ]) {
    await mkdir(path.join(project, dir), { recursive: true });
  }

  // 회차에 필요한 것은 전부 프로젝트 아래로 모은다. 사진을 워크스페이스에 두고 참조하면
  // 그 사진이 바뀌거나 사라졌을 때 회차를 재현할 수 없다.
  const source = path.resolve(workspace, photos);
  const inputDir = path.join(project, "input", "photos");
  const photoEntries = [];
  for (const file of (await readdir(source).catch(() => [])).sort()) {
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    await copyFile(path.join(source, file), path.join(inputDir, file));
    photoEntries.push({
      file: `input/photos/${file}`,
      sha256: await hashFile(path.join(inputDir, file)),
    });
  }

  await writeFile(
    path.join(project, "work", "inputs.lock.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        locked_at: new Date().toISOString(),
        supplier_url: supplierUrl,
        coupang_url: coupangUrl,
        photos: { source: photos, count: photoEntries.length, entries: photoEntries },
        policy: {
          model_face: typeof modelFace === "string" ? modelFace : lock.policy.model_face,
        },
        captures: {},
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const state = createState({ name, supplierUrl, coupangUrl });
  recordStart(state, "G0", { host: host() });
  const check = await runCheck("G0", { workspace, project });
  if (!check.ok) {
    recordReject(state, "G0", check.reasons);
    await saveState(project, state);
    throw new Refusal("CHECK_FAILED", `G0 검사 실패\n${check.reasons.join("\n")}`);
  }
  await recordPass(state, "G0", { project, workspace, host: host() });
  await saveState(project, state);

  out(`프로젝트  ${path.relative(workspace, project)}`);
  out(`사진      ${photoEntries.length}장 → input/photos/ (원본 ${photos}/)`);
  out(`얼굴 정책 ${typeof modelFace === "string" ? modelFace : lock.policy.model_face}`);
  out("");
  await printTable({ workspace, project, state });
}

// ─── 표 ───────────────────────────────────────────────────────────────────

async function printTable(ctx) {
  const rows = await evaluate(ctx.state, ctx);
  await persistEvaluation(ctx.project, ctx.state, rows);

  const target = ctx.lock?.policy?.wallclock_target_min ?? 95;
  const spent = rows.reduce((sum, row) => sum + (row.elapsedMin ?? 0), 0);
  const passed = rows.filter((row) => row.status === PASSED).length;

  out(
    `경과 ${spent.toFixed(0)}분 / 목표 ${target}분 · 예산 합계 ${budgetTotalMin()}분 · ${passed}/${rows.length}`,
  );
  out("");
  for (const row of rows) {
    const g = row.gate;
    const budget = g.budgetMin ? `${g.budgetMin}분` : "—";
    const spentText = row.elapsedMin === null ? "" : `${row.elapsedMin.toFixed(0)}분`;
    const over =
      row.elapsedMin !== null && g.budgetMin && row.elapsedMin > g.budgetMin ? " ⚠초과" : "";
    out(
      `  ${g.id.padEnd(4)} ${SYMBOL[row.status]} ${row.status.padEnd(8)} ${g.title.padEnd(8)} ${budget.padStart(4)} ${spentText.padStart(5)}${over}`,
    );
    if (row.reason) out(`         ${row.reason}`);
  }

  const next = rows.find((row) => row.status !== PASSED);
  out("");
  if (!next) {
    out("남은 게이트 없음. report 로 확정한다.");
    return null;
  }
  const label = next.gate.skill
    ? next.gate.skill
    : "orchestrate start (오케스트레이터가 직접 한다)";
  out(`다음  ${next.gate.id}  →  ${label}`);
  if (next.blockedBy.length > 0) {
    out(`      선행 미통과: ${next.blockedBy.join(", ")}`);
  }
  return next;
}

async function cmdGates() {
  const ctx = await context();
  await printTable(ctx);
}

// ─── gate ─────────────────────────────────────────────────────────────────

async function cmdGate(argv) {
  const id = argv[1];
  if (!id) throw new Refusal("USAGE", "gate <id> --start | --check | --pass");
  gate(id); // 없는 id 면 여기서 던진다

  const ctx = await context();
  const { workspace, project, state } = ctx;

  if (argv.includes("--start")) {
    recordStart(state, id, { host: host() });
    await saveState(project, state);
    out(`${id} 시작 기록. ${new Date().toISOString()}`);
    return;
  }

  if (argv.includes("--check") || argv.includes("--pass")) {
    const rows = await evaluate(state, ctx);
    const byId = new Map(rows.map((row) => [row.gate.id, row]));
    const blocked = gate(id)
      .deps.filter((dep) => dep !== "INIT")
      .filter((dep) => byId.get(dep)?.status !== PASSED);
    if (blocked.length > 0) {
      throw new Refusal(
        "GATE_BLOCKED",
        `선행 게이트가 통과하지 않았다: ${blocked.join(", ")}`,
      );
    }

    // 시간 기록은 통과의 전제다. 검사보다 먼저 본다 — 시간이 없으면 예산도 완화 판단도
    // 근거를 잃는다.
    if (argv.includes("--pass") && !state.gates[id]?.started_at) {
      throw new Refusal(
        "NOT_TIMED",
        `${id} 의 시작 시각이 없다. gate ${id} --start 를 먼저 한다.`,
      );
    }

    // --pass 는 언제나 검사를 다시 돌린다. 검사를 건너뛴 통과 기록은 남지 않는다.
    const check = await runCheck(id, { workspace, project });
    if (!check.ok) {
      if (argv.includes("--pass")) {
        recordReject(state, id, check.reasons);
        await saveState(project, state);
      }
      throw new Refusal(
        "CHECK_FAILED",
        `${id} 부족한 것 ${check.reasons.length}건\n${check.reasons.map((r) => `- ${r}`).join("\n")}`,
      );
    }

    if (argv.includes("--check")) {
      out(`${id} 검사 통과. --pass 로 기록한다.`);
      return;
    }

    const entry = state.gates[id];
    if (!entry?.started_at) {
      throw new Refusal(
        "NOT_TIMED",
        `${id} 의 시작 시각이 없다. gate ${id} --start 를 먼저 한다.`,
      );
    }

    await recordPass(state, id, { project, workspace, host: host() });
    invalidateDownstream(state, id);
    await saveState(project, state);
    out(`${id} 통과 기록.`);
    await printTable(ctx);
    return;
  }

  throw new Refusal("USAGE", "gate <id> --start | --check | --pass");
}

// ─── lock ─────────────────────────────────────────────────────────────────

async function cmdLock(argv) {
  const target = flag(argv, "read");
  if (typeof target !== "string") {
    throw new Refusal("USAGE", "lock --read <path> [--url <url>]");
  }
  const { workspace, project } = await context();
  const file = path.resolve(workspace, target);
  if (!(await exists(file))) {
    throw new Refusal("CAPTURE_MISSING", `파일이 없다: ${target}`);
  }
  const lockFile = path.join(project, "work", "inputs.lock.json");
  const parsed = JSON.parse(await readFile(lockFile, "utf8"));
  parsed.captures[path.relative(workspace, file).split(path.sep).join("/")] = {
    sha256: await hashFile(file),
    locked_at: new Date().toISOString(),
    url: typeof flag(argv, "url") === "string" ? flag(argv, "url") : null,
    by: "lock",
  };
  await writeFile(lockFile, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  out(`잠금 기록: ${target}`);
}

// ─── run ──────────────────────────────────────────────────────────────────

async function cmdRun(argv) {
  const parallel = argv.includes("--parallel");
  const ctx = await context();

  for (const layer of layers()) {
    const rows = await evaluate(ctx.state, ctx);
    const byId = new Map(rows.map((row) => [row.gate.id, row]));
    const todo = layer.filter((id) => byId.get(id)?.status !== PASSED);
    if (todo.length === 0) continue;

    for (const id of todo) {
      const g = gate(id);
      if (g.actor !== "script") {
        out(`AGENT_GATE_STOP ${id}`);
        out(
          `  이 게이트는 ${g.actor === "agent" ? "에이전트" : "사람 또는 에이전트"}가 수행한다.`,
        );
        out(`  부를 스킬: ${g.skill}`);
        out(`  ${g.title} — ${g.summary}`);
        out("");
        await printTable(ctx);
        return;
      }
    }

    // 스크립트 게이트만 남은 층. 여기만 자동으로 걸어간다.
    for (const id of todo) {
      const g = gate(id);
      out(`${id} 실행 (${g.skill})`);
      recordStart(ctx.state, id, { host: host() });
      await saveState(ctx.project, ctx.state);
      const entry = path.join(SKILLS_ROOT, g.skill, "scripts", "run.mjs");
      const result = spawnSync(process.execPath, [entry], {
        stdio: "inherit",
        env: { ...process.env, DETAIL_PAGE_WORKSPACE: ctx.workspace },
      });
      if (result.status !== 0) {
        throw new Refusal("STAGE_FAILED", `${id} 실행이 실패했다 (exit ${result.status})`);
      }
      const check = await runCheck(id, ctx);
      if (!check.ok) {
        recordReject(ctx.state, id, check.reasons);
        await saveState(ctx.project, ctx.state);
        throw new Refusal(
          "CHECK_FAILED",
          `${id} 부족한 것\n${check.reasons.map((r) => `- ${r}`).join("\n")}`,
        );
      }
      await recordPass(ctx.state, id, {
        project: ctx.project,
        workspace: ctx.workspace,
        host: host(),
      });
      await saveState(ctx.project, ctx.state);
    }
    if (!parallel) continue;
  }

  await printTable(ctx);
}

// ─── report ───────────────────────────────────────────────────────────────

async function cmdReport() {
  const ctx = await context();
  const rows = await evaluate(ctx.state, ctx);
  await persistEvaluation(ctx.project, ctx.state, rows);

  const left = rows.filter((row) => row.status !== PASSED);
  const lines = [
    `# 보고 — ${ctx.state.project}`,
    "",
    `- 생성 ${new Date().toISOString()}`,
    `- 공급처 ${ctx.state.inputs.supplier_url}`,
    `- 기준작 ${ctx.state.inputs.coupang_url}`,
    "",
    "| 게이트 | 상태 | 예산 | 경과 |",
    "| --- | --- | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${row.gate.id} ${row.gate.title} | ${row.status} | ${row.gate.budgetMin ?? "—"} | ${row.elapsedMin === null ? "—" : row.elapsedMin.toFixed(0)} |`,
    ),
  ];
  await writeFile(
    path.join(ctx.project, "work", "report.md"),
    `${lines.join("\n")}\n`,
    "utf8",
  );

  if (left.length > 0) {
    out("REPORT_INCOMPLETE");
    out(`  남은 게이트 ${left.length}개: ${left.map((row) => row.gate.id).join(", ")}`);
    out("  표를 그대로 붙이고 이 단어를 쓰지 않는다.");
    out("");
    await printTable(ctx);
    process.exitCode = 1;
    return;
  }
  out("모든 게이트 통과. work/report.md 를 썼다.");
}

// ─── doctor ───────────────────────────────────────────────────────────────

async function cmdDoctor() {
  const workspace = resolveWorkspace();
  const lock = await requireEnv(workspace);
  out(`워크스페이스  ${workspace}`);
  out(`호스트        ${lock.hosts.join(", ")}`);
  out(`설치          ${lock.install.mode} · ${lock.install.skills}개`);
  out(`hyperframes   ${lock.runtimes.hyperframes.mode} ${lock.runtimes.hyperframes.path}`);
  out(`폰트          ${lock.runtimes.font}`);
  out(`CDP           ${lock.browser.cdp}`);
  out(`얼굴 정책     ${lock.policy.model_face}`);
  out(`게이트        ${RUN_GATES.length}개 · 예산 합계 ${budgetTotalMin()}분`);
  out("호스트 홈     오염 없음");
}

// ─── 진입 ─────────────────────────────────────────────────────────────────

const COMMANDS = {
  start: cmdStart,
  gates: cmdGates,
  gate: cmdGate,
  lock: cmdLock,
  run: cmdRun,
  report: cmdReport,
  doctor: cmdDoctor,
};

const argv = process.argv.slice(2);
const command = argv[0];

if (!command || !COMMANDS[command]) {
  out("orchestrate <start|gates|gate|lock|run|report|doctor>");
  out("트래커는 track.mjs 로 띄운다.");
  process.exitCode = command ? 1 : 0;
} else {
  try {
    await COMMANDS[command](argv);
  } catch (error) {
    refuse(error);
  }
}
