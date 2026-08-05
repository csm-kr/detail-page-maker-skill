#!/usr/bin/env node
// detail-page-init — 사용자가 "$init" 이라 부르는 단계.
// 환경 인터뷰 + 로컬 세팅 + 정리. 워크스페이스 1회.
//
// 다른 기계에서 스킬만 받아도 여기서 시작할 수 있어야 한다. 그래서 없는 디렉터리를
// 먼저 만든다.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hashTree } from "../../detail-page-orchestrator/scripts/lib/hashchain.mjs";
import { blockers, detect } from "./lib/detect.mjs";
import { HOST_DIRS, installSkills } from "./lib/install.mjs";
import { InterviewError, ask, readAnswers, validate, writeAnswers } from "./lib/interview.mjs";
import { AUTO, CONFIRM, classify, moveToTrash } from "./lib/prune.mjs";
import { vendorFont, vendorHyperframes } from "./lib/vendor.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = (text = "") => process.stdout.write(`${text}\n`);

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

/** 워크스페이스. init 은 아직 env.lock 이 없으므로 스킬 위치에서 위로 올라간다. */
function resolveWorkspace() {
  if (process.env.DETAIL_PAGE_WORKSPACE) return path.resolve(process.env.DETAIL_PAGE_WORKSPACE);
  let current = path.resolve(HERE);
  while (true) {
    const parent = path.dirname(current);
    if (path.basename(current) === "skills" && path.basename(parent).startsWith(".")) {
      return path.dirname(parent);
    }
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

const WORKSPACE = resolveWorkspace();

async function bootstrap() {
  const created = [];
  for (const dir of [
    "work",
    "data",
    "projects",
    "motion",
    path.join("runtime", "fonts"),
    HOST_DIRS["claude-code"],
    HOST_DIRS.codex,
  ]) {
    const full = path.join(WORKSPACE, dir);
    try {
      await mkdir(full, { recursive: true });
      created.push(dir);
    } catch {
      // 이미 있으면 넘어간다
    }
  }
  return created;
}

function row(label, value, mark) {
  out(`  ${label.padEnd(14)}${String(value).padEnd(30)}${mark}`);
}

function printDetection(result, missing) {
  out("── 탐지 ──────────────────────────────");
  row("OS", `${result.platform} ${result.arch}`, "○");
  row("Node", result.node, result.nodeOk ? "○" : "✗");
  row(
    "Python",
    result.python
      ? `${result.python} (PIL ${result.pythonModules.pil ? "○" : "✗"} fontTools ${result.pythonModules.fonttools ? "○" : "✗"})`
      : "없음",
    result.python && result.pythonModules.pil && result.pythonModules.fonttools ? "○" : "✗",
  );
  row("ffmpeg", result.ffmpeg ? result.ffmpeg.split(" ").slice(0, 3).join(" ") : "없음", result.ffmpeg ? "○" : "✗");
  row("브라우저 CDP", result.cdp ?? "없음", result.cdp ? "○" : "✗");
  row("한글 폰트", result.fonts[0] ?? "없음", result.fonts.length > 0 ? "○" : "✗");
  row(
    "이미지 인증",
    result.auth.codex_auth ? "~/.codex/auth.json 있음" : "없음 (codex login)",
    result.auth.codex_auth ? "○" : "✗",
  );
  row("호스트 오염", result.pollution.length === 0 ? "없음" : `${result.pollution.length}개`, result.pollution.length === 0 ? "○" : "✗");
  if (missing.length > 0) {
    out();
    out("  막히는 것 — 이대로는 제작을 시작할 수 없다");
    for (const item of missing) out(`    - ${item}`);
  }
}

async function cmdPrune() {
  const apply = process.argv.includes("--apply");
  const source = path.resolve(WORKSPACE, flag("source") ?? path.join(".skill-src", "skills"));
  const detection = await detect(WORKSPACE);

  let installedSkills = [];
  try {
    const lock = JSON.parse(await readFile(path.join(WORKSPACE, "work", "env.lock.json"), "utf8"));
    installedSkills = lock.install?.skills_list ?? [];
  } catch {
    installedSkills = [];
  }
  if (installedSkills.length === 0) {
    const { readdir } = await import("node:fs/promises");
    installedSkills = (await readdir(source).catch(() => [])).filter((name) =>
      name.startsWith("detail-page"),
    );
  }

  const entries = await classify({
    workspace: WORKSPACE,
    installedSkills,
    pollution: detection.pollution,
  });
  const auto = entries.filter((entry) => entry.grade === AUTO);
  const confirm = entries.filter((entry) => entry.grade === CONFIRM);

  out(`── 정리 대상 (${apply ? "실행" : "dry-run"}) ────────────────`);
  out(` A 자동 (${auto.length})`);
  for (const entry of auto) out(`   ${entry.rel.padEnd(44)}${entry.why}`);
  out(` B 확인 (${confirm.length})`);
  for (const entry of confirm) out(`   ${entry.rel.padEnd(44)}${entry.why}`);
  out(" C 제외   .skill-src · docs · data · projects/*/output · work/env.* · 인증");

  if (!apply) {
    out("──────────────────────────────────────");
    out(" --apply 를 붙이면 .trash/<타임스탬프>/ 로 옮긴다. 삭제하지 않는다.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const { base, moved, skipped } = await moveToTrash({
    workspace: WORKSPACE,
    entries: auto,
    stamp,
  });
  out("──────────────────────────────────────");
  out(` 옮김 ${moved.length}개 → ${path.relative(WORKSPACE, base)}`);
  for (const entry of skipped) {
    out(`  건너뜀 ${entry.rel} — ${entry.error} (사용 중이면 프로세스를 죽이지 않는다)`);
  }
  if (confirm.length > 0) {
    out(` B ${confirm.length}개는 옮기지 않았다. 대화형으로 실행해 하나씩 확인한다.`);
  }

  const lockFile = path.join(WORKSPACE, "work", "env.lock.json");
  try {
    const lock = JSON.parse(await readFile(lockFile, "utf8"));
    lock.pruned = {
      at: new Date().toISOString(),
      trash: path.relative(WORKSPACE, base).split(path.sep).join("/"),
      entries: moved.length,
      skipped: skipped.length,
    };
    lock.host_dirs_clean = (await detect(WORKSPACE)).pollution.length === 0;
    await writeFile(lockFile, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  } catch {
    // env.lock 이 아직 없을 수 있다
  }
}

async function cmdInit() {
  const apply = process.argv.includes("--apply");
  const source = path.resolve(WORKSPACE, flag("source") ?? path.join(".skill-src", "skills"));
  const installMode = typeof flag("install-mode") === "string" ? flag("install-mode") : "auto";

  const created = await bootstrap();
  const detection = await detect(WORKSPACE);
  const missing = blockers(detection);
  printDetection(detection, missing);

  out();
  out("── 인터뷰 ────────────────────────────");
  const existing = await readAnswers(WORKSPACE);
  const answers = apply
    ? validate({ ...existing, chatgpt_login: existing.chatgpt_login ?? Boolean(detection.cdp) })
    : await ask(WORKSPACE, existing);
  await writeAnswers(WORKSPACE, answers);
  for (const [key, value] of Object.entries(answers)) {
    row(key, Array.isArray(value) ? value.join(", ") : String(value), "");
  }

  out();
  out("── 세팅 ──────────────────────────────");
  const install = await installSkills({
    workspace: WORKSPACE,
    source,
    hosts: answers.hosts,
    mode: installMode,
  });
  row("설치", `${install.skills.length}개 · ${install.mode}`, "○");
  for (const [host, dir] of Object.entries(install.targets)) row("", `${host} → ${dir}`, "");

  const hyperframes = await vendorHyperframes({
    workspace: WORKSPACE,
    install: answers.vendor_hyperframes === true,
  });
  row(
    "hyperframes",
    `${hyperframes.mode} ${hyperframes.path}${hyperframes.installed ? "" : " (미설치)"}`,
    hyperframes.installed ? "○" : "✗",
  );
  const font = await vendorFont({ workspace: WORKSPACE, candidates: detection.fonts });
  row("폰트", font ?? "없음", font ? "○" : "✗");

  const primary = install.targets["claude-code"] ?? Object.values(install.targets)[0];
  const sha256 = await hashTree(path.join(WORKSPACE, primary));

  const ready = missing.length === 0 && hyperframes.installed && Boolean(font);
  const lock = {
    schema_version: "1.0",
    initialized_at: new Date().toISOString(),
    ready,
    blocked: ready ? [] : [...missing, ...(hyperframes.installed ? [] : ["hyperframes 미설치"])],
    hosts: answers.hosts,
    install: {
      mode: install.mode,
      source: path.relative(WORKSPACE, source).split(path.sep).join("/"),
      targets: install.targets,
      skills: install.skills.length,
      skills_list: install.skills,
      sha256,
    },
    runtimes: {
      node: detection.node,
      python: detection.python,
      ffmpeg: detection.ffmpeg,
      hyperframes,
      font,
    },
    browser: { cdp: detection.cdp, chatgpt_login: answers.chatgpt_login === true },
    auth: {
      god_tibo: {
        source: "~/.codex/auth.json",
        present: detection.auth.codex_auth,
        installation_id: detection.auth.codex_installation_id,
      },
    },
    policy: {
      host_install: "forbidden",
      project_root: answers.project_root,
      model_face: answers.model_face,
      media_budget_mb: answers.media_budget_mb,
      photo_format: answers.photo_format,
      capture_max_age_days: answers.capture_max_age_days,
      wallclock_target_min: answers.wallclock_target_min,
    },
    relaxations: [],
    host_dirs_clean: detection.pollution.length === 0,
  };

  await writeFile(
    path.join(WORKSPACE, "work", "env.lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
    "utf8",
  );

  out();
  out("── 결과 ──────────────────────────────");
  row("워크스페이스", WORKSPACE, "");
  row("만든 디렉터리", created.length, "");
  if (ready) {
    out("  env.lock.json 작성. 다음: orchestrate start");
  } else {
    out("  env.lock.json 을 썼지만 ready=false 다. 위의 막히는 것을 먼저 해결한다.");
    out("  이 상태에서 orchestrate start 는 거부한다.");
  }
}

try {
  if (process.argv.includes("--prune")) await cmdPrune();
  else await cmdInit();
} catch (error) {
  const code = error instanceof InterviewError ? error.code : "ERROR";
  const message = error instanceof InterviewError ? error.message.slice(code.length + 1) : error.message;
  out(`REFUSED ${code}`);
  for (const line of String(message).split("\n")) out(`  ${line}`);
  process.exitCode = 1;
}
