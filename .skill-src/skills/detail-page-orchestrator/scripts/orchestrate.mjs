#!/usr/bin/env node
// 오케스트레이터. 순서·상태·검사·보고를 소유하고 **일은 하지 않는다.**
//
// 우회 플래그는 없다. --force 를 만들지 않는다 — 게이트가 틀렸으면 게이트를 고친다.

import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { capturePage } from "./lib/capture.mjs";
import {
  chooseExtractor,
  extractorPresent,
  findHarness,
  runExtractor,
} from "./lib/extract.mjs";
import { runCheck } from "./lib/check.mjs";
import { PACK_SHARE, buildPack, canonBytes, packableGates } from "./lib/contextpack.mjs";
import { runExec } from "./lib/exec.mjs";
import { Refusal, checkRuntimes, requireEnv } from "./lib/env.mjs";
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
import { recordRun } from "./lib/history.mjs";
import { exists, hashFile } from "./lib/hashchain.mjs";
import {
  SKILLS_ROOT,
  activePath,
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

const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;

/**
 * `input/photos/` 를 그대로 읽어 해시로 잠근다. 사진의 원본은 회차 폴더 안이고
 * 목록은 디스크가 소유한다 — 잠금 파일이 디스크보다 앞서면 없는 사진이 근거가 된다.
 */
async function scanPhotos(project) {
  const dir = path.join(project, "input", "photos");
  const entries = [];
  for (const file of (await readdir(dir).catch(() => [])).sort()) {
    if (!PHOTO_EXT.test(file)) continue;
    entries.push({
      file: `input/photos/${file}`,
      sha256: await hashFile(path.join(dir, file)),
    });
  }
  return entries;
}

async function cmdStart(argv) {
  const workspace = resolveWorkspace();
  const lock = await requireEnv(workspace);

  const name = flag(argv, "name");
  const supplierUrl = flag(argv, "supplier-url");
  const coupangUrl = flag(argv, "coupang-url");
  const photos = flag(argv, "photos");
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
  // 그 사진이 바뀌거나 사라졌을 때 회차를 재현할 수 없다. 그래서 사진이 사는 곳은
  // `input/photos/` 하나다. `--photos` 는 다른 데 있는 것을 들여올 때만 쓴다.
  if (typeof photos === "string") {
    const source = path.resolve(workspace, photos);
    const inputDir = path.join(project, "input", "photos");
    for (const file of (await readdir(source).catch(() => [])).sort()) {
      if (!PHOTO_EXT.test(file)) continue;
      await copyFile(path.join(source, file), path.join(inputDir, file));
    }
  }
  const photoEntries = await scanPhotos(project);

  await writeFile(
    path.join(project, "work", "inputs.lock.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        locked_at: new Date().toISOString(),
        supplier_url: supplierUrl,
        coupang_url: coupangUrl,
        photos: { count: photoEntries.length, entries: photoEntries },
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

  // 활성 프로젝트를 기록한다. 옛 회차를 검증용으로 남겨 둬도 명령마다 고르지 않는다.
  await writeFile(
    activePath(workspace),
    `${JSON.stringify({ project: path.basename(project), at: new Date().toISOString() }, null, 2)}
`,
    "utf8",
  );

  out(`프로젝트  ${path.relative(workspace, project)}`);
  out(`사진      ${photoEntries.length}장 · input/photos/ (더 넣으면 orchestrate photos)`);
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

/** 선행 게이트가 전부 통과했는지. 통과하지 않았으면 던진다. */
async function requireDeps(id, ctx) {
  const rows = await evaluate(ctx.state, ctx);
  const byId = new Map(rows.map((row) => [row.gate.id, row]));
  const blocked = gate(id)
    .deps.filter((dep) => dep !== "INIT")
    .filter((dep) => byId.get(dep)?.status !== PASSED);
  if (blocked.length > 0) {
    throw new Refusal("GATE_BLOCKED", `선행 게이트가 통과하지 않았다: ${blocked.join(", ")}`);
  }
}

/**
 * 게이트 하나를 헤드리스 세션에서 돈다. 컨텍스트는 팩(문서)으로만 넘어가고,
 * 통과 판정은 자식이 아니라 **여기서** check.mjs 를 다시 돌려 한다.
 */
async function execGate(id, ctx) {
  await requireDeps(id, ctx);
  const { state, project, workspace } = ctx;

  recordStart(state, id, { host: host() });
  await saveState(project, state);

  const result = await runExec(id, ctx, { onLine: (line) => out(`  ${line}`) });
  await saveState(project, state); // 자식이 남긴 한 줄 요약

  if (!result.ok) {
    recordReject(state, id, result.reasons);
    await saveState(project, state);
    throw new Refusal(
      "CHECK_FAILED",
      `${id} 를 ${result.attempts.length}회 돌렸으나 부족한 것 ${result.reasons.length}건
${result.reasons.map((r) => `- ${r}`).join("\n")}
로그: work/exec/${id}-*.json`,
    );
  }

  await recordPass(state, id, { project, workspace, host: host() });
  invalidateDownstream(state, id);
  await saveState(project, state);
  out(`${id} 통과 기록 (헤드리스 ${result.attempts.length}회).`);
  if (result.summary) out(`  요약  ${result.summary}`);
}

async function cmdGate(argv) {
  const id = argv[1];
  if (!id) throw new Refusal("USAGE", "gate <id> --start | --check | --pass | --exec");
  gate(id); // 없는 id 면 여기서 던진다

  const ctx = await context();
  const { workspace, project, state } = ctx;

  if (argv.includes("--exec")) {
    await execGate(id, ctx);
    await printTable(ctx);
    return;
  }

  if (argv.includes("--start")) {
    recordStart(state, id, { host: host() });
    await saveState(project, state);
    out(`${id} 시작 기록. ${new Date().toISOString()}`);
    return;
  }

  if (argv.includes("--check") || argv.includes("--pass")) {
    await requireDeps(id, ctx);

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

  throw new Refusal("USAGE", "gate <id> --start | --check | --pass | --exec");
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

// ─── photos ───────────────────────────────────────────────────────────────

/** 시작한 뒤에 `input/photos/` 에 넣은 사진을 다시 잠근다. */
async function cmdPhotos() {
  const { project } = await context();
  const entries = await scanPhotos(project);
  const lockFile = path.join(project, "work", "inputs.lock.json");
  const parsed = JSON.parse(await readFile(lockFile, "utf8"));
  parsed.photos = { count: entries.length, entries };
  await writeFile(lockFile, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  out(`사진 ${entries.length}장 잠금 · input/photos/`);
  for (const entry of entries) out(`  ${entry.file}`);
}

// ─── capture ──────────────────────────────────────────────────────────────

/**
 * 검증된 추출기로 수집한다. 등록하는 것은 번들의 manifest.json 하나다 —
 * 그 안에 자산별 해시가 들어 있고, 추출기가 그것을 검증한 뒤에만 승격한다.
 */
async function cmdCaptureByExtractor({ entry, url, label, workspace, project }) {
  const outDir = path.join(project, "input", "bundles", label);
  if (await exists(outDir)) {
    throw new Refusal(
      "BUNDLE_EXISTS",
      `이미 있다: input/bundles/${label}
  추출기는 정상 번들을 덮어쓰지 않는다. 다른 이름을 쓰거나 그 디렉터리를 치운다.`,
    );
  }

  out(`수집 중  ${url}`);
  out(`  추출기  ${entry.skill} (요청 최소화: ${entry.args.join(" ")})`);
  await runExtractor({ entry, url, outDir, onLine: (line) => line && out(`  │ ${line}`) });

  const manifest = path.join(outDir, "manifest.json");
  if (!(await exists(manifest))) {
    throw new Refusal(
      "BUNDLE_INCOMPLETE",
      `${entry.skill} 가 manifest.json 을 남기지 않았다. 번들을 근거로 쓸 수 없다.
  ${path.relative(workspace, outDir)} 의 evidence/ 에서 상태 코드를 확인한다.`,
    );
  }

  const lockFile = path.join(project, "work", "inputs.lock.json");
  const parsed = JSON.parse(await readFile(lockFile, "utf8"));
  parsed.captures[`input/bundles/${label}/manifest.json`] = {
    sha256: await hashFile(manifest),
    locked_at: new Date().toISOString(),
    url,
    by: "extract",
    skill: entry.skill,
  };
  await writeFile(lockFile, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  out(`  저장    input/bundles/${label}/`);
  out(`  등록    inputs.lock.json (manifest.json 해시)`);
}

async function cmdCapture(argv) {
  const url = flag(argv, "url");
  const label = flag(argv, "as");
  if (typeof url !== "string" || typeof label !== "string") {
    throw new Refusal("USAGE", "capture --url <url> --as <이름>");
  }
  const { workspace, project, lock } = await context();

  // 아는 호스트는 검증된 추출기로 보낸다. 내장 캡처에는 차단 판정도 상품 ID 대조도
  // 후기 개인정보 마스킹도 없다 — 같은 것을 다시 짜는 대신 부른다.
  const entry = chooseExtractor(url);
  if (entry && (await extractorPresent(entry))) {
    const harness = await findHarness();
    if (harness) {
      return cmdCaptureByExtractor({ entry, url, label, workspace, project });
    }
    out(`알림    ${entry.skill} 를 쓰려 했으나 ${entry.requires} 명령이 없다. 내장 캡처로 내려간다.`);
  }

  const cdp = lock.browser?.cdp;
  // 잠금 파일의 값만 믿지 않는다. 창은 닫힌다.
  const alive = cdp
    ? await fetch(`${cdp}/json/version`, { signal: AbortSignal.timeout(2000) })
        .then((r) => r.ok)
        .catch(() => false)
    : false;
  if (!alive) {
    throw new Refusal(
      "CDP_DEAD",
      `브라우저 CDP 에 붙을 수 없다 (${cdp ?? "기록 없음"}).
  detail-page-init 의 open-browser.mjs 로 다시 연다 — 쓰던 창은 닫지 않는다.`,
    );
  }

  const dir = path.join(project, "input", "captures");
  const png = path.join(dir, `${label}.png`);
  const txt = path.join(dir, `${label}.txt`);
  out(`수집 중  ${url}`);
  const asked = flag(argv, "min-height");
  const result = await capturePage({
    cdp,
    url,
    outPng: png,
    outText: txt,
    ...(typeof asked === "string" ? { minHeight: Number(asked) } : {}),
  });

  // 수집 스크립트만 등록할 수 있다. 손으로 놓은 파일은 lock 에 들어가지 않는다.
  const lockFile = path.join(project, "work", "inputs.lock.json");
  const parsed = JSON.parse(await readFile(lockFile, "utf8"));
  parsed.captures[`input/captures/${label}.png`] = {
    sha256: await hashFile(png),
    locked_at: new Date().toISOString(),
    url,
    title: result.title,
    size: `${result.width}x${result.height}`,
    text: `input/captures/${label}.txt`,
    chars: result.chars,
    by: "capture",
  };
  await writeFile(lockFile, `${JSON.stringify(parsed, null, 2)}
`, "utf8");

  out(`  제목    ${result.title}`);
  out(`  크기    ${result.width}x${result.height} · 본문 ${result.chars}자`);
  out(`  저장    input/captures/${label}.{png,txt}`);
  out(`  등록    inputs.lock.json`);
}

// ─── run ──────────────────────────────────────────────────────────────────

async function cmdRun(argv) {
  const parallel = argv.includes("--parallel");
  // --exec 는 판단 게이트도 멈추지 않고 헤드리스 세션으로 돈다. 컨텍스트는 팩으로만
  // 넘어가고 통과 판정은 언제나 부모의 check.mjs 다.
  const headless = argv.includes("--exec");
  const ctx = await context();

  for (const layer of layers()) {
    const rows = await evaluate(ctx.state, ctx);
    const byId = new Map(rows.map((row) => [row.gate.id, row]));
    const todo = layer.filter((id) => byId.get(id)?.status !== PASSED);
    if (todo.length === 0) continue;

    for (const id of todo) {
      const g = gate(id);
      if (g.actor === "script") continue;
      if (headless) {
        out(`${id} 헤드리스 (${g.skill})`);
        await execGate(id, ctx);
        continue;
      }
      out(`AGENT_GATE_STOP ${id}`);
      out(
        `  이 게이트는 ${g.actor === "agent" ? "에이전트" : "사람 또는 에이전트"}가 수행한다.`,
      );
      out(`  부를 스킬: ${g.skill}`);
      out(`  ${g.title} — ${g.summary}`);
      out(`  헤드리스로 돌리려면  gate ${id} --exec`);
      out("");
      await printTable(ctx);
      return;
    }

    // 결정적인 게이트. 세션을 띄우지 않는다 — 판단할 것이 없다.
    for (const id of todo.filter((item) => gate(item).actor === "script")) {
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

  // 막힌 회차도 남긴다. 재작업량은 완주한 회차가 아니라 막힌 회차에서 나온다.
  await recordRun(ctx.workspace, {
    project: ctx.project,
    state: ctx.state,
    rows,
    targetMin: ctx.lock?.policy?.wallclock_target_min ?? 95,
  });

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

// ─── pack ─────────────────────────────────────────────────────────────────

/**
 * 게이트가 헤드리스 세션에서 받는 것을 그대로 본다. 세션을 띄우지 않는다.
 * ADR-0012 의 채택 기준(전량 대비 1/3)을 이 명령으로 잰다.
 */
async function cmdPack(argv) {
  const ctx = await context();
  const id = argv[1];
  if (id && !id.startsWith("--")) {
    const pack = await buildPack(id, ctx);
    if (argv.includes("--write")) {
      const file = path.join(ctx.project, "work", "exec", `${id}-pack.md`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, pack.text, "utf8");
      out(`work/exec/${id}-pack.md · ${pack.bytes}B`);
      return;
    }
    out(pack.text);
    return;
  }

  const full = await canonBytes();
  out(`전량 주입 ${full}B · 상한 ${Math.floor(full * PACK_SHARE)}B (1/3)`);
  out("");
  for (const g of packableGates()) {
    const pack = await buildPack(g.id, ctx);
    const share = ((100 * pack.bytes) / full).toFixed(0);
    out(
      `  ${g.id.padEnd(4)} ${String(pack.bytes).padStart(7)}B ${share.padStart(3)}%  정본 ${pack.canon.length}${pack.missing.length > 0 ? ` · 누락 ${pack.missing.join(", ")}` : ""}`,
    );
  }
}

// ─── doctor ───────────────────────────────────────────────────────────────

async function cmdDoctor() {
  const workspace = resolveWorkspace();
  const lock = await requireEnv(workspace);
  const problems = await checkRuntimes(workspace, lock);

  out(`워크스페이스  ${workspace}`);
  out(`호스트        ${lock.hosts.join(", ")}`);
  out(`설치          ${lock.install.mode} · ${lock.install.skills}개`);
  out(`node          ${process.versions.node} (기록 ${lock.runtimes.node})`);
  out(`hyperframes   ${lock.runtimes.hyperframes.mode} ${lock.runtimes.hyperframes.path}`);
  out(`폰트          ${lock.runtimes.font}`);
  out(`CDP           ${lock.browser.cdp} (응답은 확인하지 않는다)`);
  out(`얼굴 정책     ${lock.policy.model_face}`);
  out(`게이트        ${RUN_GATES.length}개 · 예산 합계 ${budgetTotalMin()}분`);
  out("호스트 홈     오염 없음");

  if (problems.length > 0) {
    out("");
    throw new Refusal(problems[0].code, problems.map((p) => p.line).join("\n"));
  }
}

// ─── 진입 ─────────────────────────────────────────────────────────────────

const COMMANDS = {
  start: cmdStart,
  gates: cmdGates,
  gate: cmdGate,
  lock: cmdLock,
  photos: cmdPhotos,
  capture: cmdCapture,
  run: cmdRun,
  report: cmdReport,
  doctor: cmdDoctor,
  pack: cmdPack,
};

const argv = process.argv.slice(2);
const command = argv[0];

if (!command || !COMMANDS[command]) {
  out("orchestrate <start|gates|gate|lock|photos|capture|run|report|doctor|pack>");
  out("트래커는 track.mjs 로 띄운다.");
  process.exitCode = command ? 1 : 0;
} else {
  try {
    await COMMANDS[command](argv);
  } catch (error) {
    refuse(error);
  }
}
