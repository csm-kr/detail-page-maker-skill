#!/usr/bin/env node
// G8 모션. 첫 줄이 선행 게이트 검사다.
//
// 혼합 게이트다. **컴포지션은 사람이 다시 쓴다** — 2회차에 옛 컴포지션을 재렌더해서
// brief 와 무관한 GIF 가 나왔다. 스크립트는 굽고 색인만 만든다.
//
//   run.mjs           → brief 와 용어 집합을 펼쳐 보여 준다. 그리고 멈춘다.
//   (사람)            → work/comps/<brief>/ 에 컴포지션과 meta.json 을 쓴다.
//   run.mjs --render  → 병렬로 구워 output/media/gifs/ 와 index.json 을 만든다.

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { json, section, text } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";
import { buildEntry, methodOverflow, missingKeywords, straySubtitles } from "./lib/comps.mjs";

const COMPS_REL = path.join("work", "comps");
const GIFS_REL = path.join("output", "media", "gifs");
const WORKERS = 4;

const out = (line) => process.stdout.write(`${line}\n`);

/** page-plan 의 용어 집합. check.mjs 와 같은 방식으로 읽는다. */
function pageTerms(page) {
  return (section(page ?? "", "용어 집합") ?? "")
    .split("\n")
    .map((line) => /^\s*(?:\d+\.|[-*])\s*(.+?)\s*$/.exec(line))
    .filter(Boolean)
    .map((match) => match[1].replace(/[`*]/g, "").trim())
    .filter(Boolean);
}

/** 컴포지션 디렉터리에서 가장 최근에 손댄 파일. 디렉터리 mtime 은 못 믿는다. */
async function newestFile(dir) {
  let best = null;
  const walk = async (current) => {
    for (const item of await readdir(current, { withFileTypes: true })) {
      if (item.name === "node_modules") continue;
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        await walk(full);
        continue;
      }
      const info = await stat(full);
      if (!best || info.mtimeMs > best.at) best = { path: full, at: info.mtimeMs };
    }
  };
  await walk(dir);
  return best?.path ?? null;
}

function render(cwd, output, hyperframes) {
  return new Promise((resolve, reject) => {
    const child = spawn(hyperframes, ["render", "--quality", "high", "--output", output], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      shell: process.platform === "win32",
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(new Error(`HYPERFRAMES_SPAWN_FAILED ${error.message}`)));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`RENDER_FAILED 종료 코드 ${code}${stderr ? ` — ${stderr.trim().split("\n")[0]}` : ""}`)),
    );
  });
}

/** 워커 풀. GIF 하나가 오래 걸려도 나머지가 기다리지 않는다. */
async function pool(items, workers, handler) {
  const results = [];
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(workers, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await handler(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

try {
  const ctx = await guard("G8");
  const doRender = process.argv.includes("--render");

  const plan = await json(ctx.project, "flow-plan.json");
  if (!plan) throw new Error("PLAN_MISSING flow-plan.json 을 JSON 으로 읽을 수 없다");
  const briefs = plan.gif_briefs ?? [];
  if (briefs.length === 0) throw new Error("NO_BRIEFS 플랜에 gif_brief 가 없다");

  const page = await text(ctx.project, path.join("work", "page-plan.md"));
  const terms = pageTerms(page);

  if (!doRender) {
    out(`brief ${briefs.length}개. 컴포지션을 **새로 쓴다** — 옛것을 재렌더하지 않는다.`);
    out("");
    if (terms.length === 0) {
      out("경고: page-plan.md 의 `## 용어 집합` 을 읽을 수 없다. 자막을 고를 근거가 없다.");
    } else {
      out(`자막은 이 용어에서만 고른다: ${terms.join(" · ")}`);
    }
    out("");
    for (const brief of briefs) {
      out(`  ${brief.id}  [${brief.method ?? "method 없음"}]  ${brief.question ?? ""}`);
      out(`      ${brief.start ?? ""} → ${brief.action ?? ""} → ${brief.result ?? ""}`);
      if (brief.keywords?.length) out(`      핵심 명사: ${brief.keywords.join(", ")}`);
    }
    out("");
    out(`각 brief 마다 ${COMPS_REL}/<brief>/ 에 컴포지션을 만들고 그 안에 meta.json 을 둔다.`);
    out('  { "method": "<brief 와 같은 수단>", "subtitles": ["<용어 집합에서>"] }');
    out("");
    out("다 쓰면 --render 로 굽는다.");
    process.exit(0);
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────
  const gifDir = path.join(ctx.project, GIFS_REL);
  await mkdir(gifDir, { recursive: true });
  const hyperframes = ctx.lock?.runtimes?.hyperframes?.bin ?? "npx hyperframes";

  const results = await pool(briefs, WORKERS, async (brief) => {
    const compDir = path.join(ctx.project, COMPS_REL, brief.id);
    const gifAbs = path.join(gifDir, `${brief.id}.gif`);
    let meta = null;
    try {
      meta = JSON.parse(await readFile(path.join(compDir, "meta.json"), "utf8"));
    } catch {
      return { brief: brief.id, error: `meta.json 이 없다: ${COMPS_REL}/${brief.id}/meta.json` };
    }
    const compFile = await newestFile(compDir).catch(() => null);
    if (!compFile) return { brief: brief.id, error: "컴포지션 파일이 없다" };

    try {
      await render(compDir, gifAbs, hyperframes);
    } catch (error) {
      return { brief: brief.id, error: error.message };
    }
    return {
      brief: brief.id,
      entry: buildEntry({
        brief: brief.id,
        meta,
        comp: path.relative(ctx.project, compFile).split(path.sep).join("/"),
        gif: `${GIFS_REL.split(path.sep).join("/")}/${brief.id}.gif`,
      }),
    };
  });

  const entries = results.filter((r) => r.entry).map((r) => r.entry);
  const failed = results.filter((r) => r.error);

  await mkdir(path.join(ctx.project, COMPS_REL), { recursive: true });
  await writeFile(
    path.join(ctx.project, COMPS_REL, "index.json"),
    `${JSON.stringify({ rendered_at: new Date().toISOString(), entries }, null, 2)}\n`,
    "utf8",
  );

  out(`렌더 완료  ${entries.length}/${briefs.length}개 → ${GIFS_REL}`);
  out(`  색인      ${COMPS_REL}/index.json`);

  // 게이트가 볼 것을 스크립트가 먼저 말한다.
  const overflow = methodOverflow(entries);
  if (overflow.length > 0) out(`  쏠림      ${overflow.join(" · ")} — 한 수단이 8개를 넘는다`);
  for (const entry of entries) {
    const brief = briefs.find((b) => b.id === entry.brief);
    const absent = missingKeywords(entry, brief);
    const stray = straySubtitles(entry, terms);
    if (brief && entry.method !== brief.method) {
      out(`  ! ${entry.brief} method 가 brief 와 다르다 (${brief.method} ≠ ${entry.method})`);
    }
    if (absent.length) out(`  ! ${entry.brief} 핵심 명사 누락: ${absent.join(", ")}`);
    if (stray.length) out(`  ! ${entry.brief} 자막이 용어 집합 밖: ${stray.join(", ")}`);
  }
  if (failed.length > 0) {
    out("");
    out(`굽지 못한 brief ${failed.length}개:`);
    for (const item of failed) out(`  - ${item.brief}: ${item.error}`);
  }
} catch (error) {
  refuse(error);
}
