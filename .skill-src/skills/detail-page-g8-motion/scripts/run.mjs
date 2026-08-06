#!/usr/bin/env node
// G8 모션. 첫 줄이 선행 게이트 검사다.
//
// **GIF 의 입력은 발행된 스틸이다.** 1회차에 컴포지션 10개를 손으로 썼고 10개 전부
// 이미지가 0건이었다 — 도형에 애니메이션을 걸었다. 그래서 스크립트가 스틸을 박아
// 컴포지션을 만들고, 사람은 패턴과 자막만 고친다.
//
//   run.mjs --probe     → 렌더 경로가 예산(240초) 안에 도는지 실측한다. 굽기 전에 한다.
//   run.mjs --scaffold  → brief 마다 컴포지션을 만든다. 스틸이 이미 들어가 있다.
//   (사람)              → 패턴·자막을 손본다. 스틸을 지우지 않는다.
//   run.mjs --render    → 두 수단 모두 **프레임까지만** 만들고 GIF 조립은 lib/gifasm.mjs 가 한다.

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { findChrome } from "../../detail-page-init/scripts/lib/browser.mjs";

import { json, section, text } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { BUNDLE_ROOT } from "../../detail-page-orchestrator/scripts/lib/extract.mjs";
import { guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";
import { buildEntry, methodOverflow, missingKeywords, straySubtitles } from "./lib/comps.mjs";
import { concatScript, ffmpegArgs, framePacing } from "./lib/gifasm.mjs";
import {
  COMP_SIZE,
  STILL_MOTION_FRAMES,
  scaffoldStillMotion,
  tiboSequenceJob,
} from "./lib/motion.mjs";
import { RENDER_BUDGET_MS, probeLine } from "./lib/renderprobe.mjs";

const COMPS_REL = path.join("work", "comps");
const GIFS_REL = path.join("output", "media", "gifs");
const IMAGES_REL = path.join("output", "media", "images");
const TIBO = path.join(BUNDLE_ROOT, "god-tibo-gpt-image2-skill");
const EXT = { "webp-q85": ".webp", "jpeg-q88": ".jpg", png: ".png" };
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

function spawnTool(command, args, cwd, useShell = false, timeoutMs = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      shell: useShell && process.platform === "win32",
    });
    let stderr = "";
    // 예산이 있으면 그 안에 끝나야 한다. 무한정 기다린 것이 3회차의 240초였다.
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            child.kill();
            reject(new Error(`TIMEOUT ${timeoutMs}ms 안에 끝나지 않았다`));
          }, timeoutMs)
        : null;
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`SPAWN_FAILED ${error.message}`));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(
            new Error(`RENDER_FAILED 종료 코드 ${code}${stderr ? ` — ${stderr.trim().split("\n")[0]}` : ""}`),
          );
    });
  });
}

/**
 * 프레임 이미지 → GIF. **두 수단이 같은 조립기를 쓴다.**
 *
 * 3회차에는 hyperframes 와 god-tibo 가 각자 조립했고 둘 다 일정 fps 였다.
 * 그래서 프레임마다 머무는 시간을 줄 방법이 없었고 3장이 0.48초에 지나갔다.
 * 지연은 `lib/gifasm.mjs` 가 소유한다.
 */
async function assembleGif({ framePaths, outputPath, scenes, workDir }) {
  const ms = framePacing(framePaths.length, { scenes });
  const listPath = path.join(workDir, "gif-frames.txt");
  await writeFile(
    listPath,
    concatScript(framePaths.map((file, index) => ({ path: file, ms: ms[index] }))),
    "utf8",
  );
  await spawnTool("ffmpeg", ffmpegArgs({ concatPath: listPath, outputPath }), workDir, true);
  return ms;
}

/** 디렉터리의 프레임 이미지. 이름 순서가 곧 프레임 순서다. */
async function framesIn(dir) {
  return (await readdir(dir))
    .filter((name) => /\.(png|webp|jpe?g)$/i.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

/**
 * 컴포지션의 프레임을 한 장씩 찍는다. `scaffoldStillMotion` 이 `?f=N` 을 읽는다.
 * headless Chrome 을 쓴다 — 이 경로가 실제로 도는 것을 3회차에 확인했다.
 */
async function shootFrames({ chrome, indexPath, frameDir, count }) {
  if (!chrome) throw new Error("CHROME_NOT_FOUND 컴포지션을 찍을 브라우저가 없다");
  const url = pathToFileURL(indexPath).href;
  const paths = [];
  for (let index = 0; index < count; index += 1) {
    const file = path.join(frameDir, `frame-${String(index).padStart(3, "0")}.png`);
    await spawnTool(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${COMP_SIZE.width},${COMP_SIZE.height}`,
        `--screenshot=${file}`,
        `${url}?f=${index}`,
      ],
      frameDir,
    );
    paths.push(file);
  }
  return paths;
}

/**
 * 렌더 경로 실측. **굽기 전에 한다.**
 *
 * 3회차에 hyperframes CLI 가 240초에 타임아웃하자 Chrome 스크린샷으로 갈아탔고
 * 그 우회가 굳었다. 의존성은 계속 벤더링돼 있었고 문서는 계속 hyperframes 를
 * 가리켰다 — 아무도 다시 재지 않았기 때문이다. 이제 잰 것만 근거가 된다.
 */
async function probeRenderPaths({ workspace, lock, scratch }) {
  const paths = [];

  const timed = async (name, work) => {
    const startedAt = Date.now();
    try {
      const detail = await work();
      paths.push({ name, ok: true, elapsed_ms: Date.now() - startedAt, detail });
    } catch (error) {
      paths.push({
        name,
        ok: false,
        elapsed_ms: Date.now() - startedAt,
        error: error.message.split("\n")[0],
      });
    }
  };

  // hyperframes — 벤더링된 CLI 가 쓸 수 있는 상태인가. doctor 가 Chrome 캐시와
  // ffmpeg 를 확인한다. 3회차의 240초는 첫 실행에서 Chrome 을 내려받은 시간이었다.
  const vendored = lock?.runtimes?.hyperframes?.path;
  await timed("hyperframes", async () => {
    if (!vendored) throw new Error("VENDOR_MISSING env.lock.json 에 hyperframes 경로가 없다");
    const dir = path.resolve(workspace, vendored);
    const bin = path.join(dir, "node_modules", "hyperframes", "bin", "hyperframes.mjs");
    await stat(bin);
    await spawnTool(process.execPath, [bin, "doctor"], dir, false, RENDER_BUDGET_MS);
    return "doctor";
  });

  // chrome — G8 이 실제로 프레임을 찍는 경로. 한 장 찍는 데 얼마나 드는가.
  await timed("chrome", async () => {
    const chrome = await findChrome();
    if (!chrome) throw new Error("CHROME_NOT_FOUND 컴포지션을 찍을 브라우저가 없다");
    await mkdir(scratch, { recursive: true });
    const page = path.join(scratch, "probe.html");
    await writeFile(page, `<html><body style="background:#111"></body></html>`, "utf8");
    const shot = path.join(scratch, "probe.png");
    await spawnTool(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        `--window-size=${COMP_SIZE.width},${COMP_SIZE.height}`,
        `--screenshot=${shot}`,
        pathToFileURL(page).href,
      ],
      scratch,
      false,
      RENDER_BUDGET_MS,
    );
    await stat(shot);
    return `프레임 1장 ${COMP_SIZE.width}x${COMP_SIZE.height}`;
  });

  return { at: new Date().toISOString(), budget_ms: RENDER_BUDGET_MS, paths };
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
  const mode = ["--probe", "--scaffold", "--render"].find((flag) => process.argv.includes(flag));

  // ── 렌더 경로 실측 ───────────────────────────────────────────────────────
  // 플랜보다 먼저 본다. 경로가 죽어 있으면 brief 를 아무리 잘 써도 못 굽는다.
  if (mode === "--probe") {
    const probeDir = path.join(ctx.project, COMPS_REL);
    await mkdir(probeDir, { recursive: true });
    const probe = await probeRenderPaths({
      workspace: ctx.workspace,
      lock: ctx.lock,
      scratch: path.join(probeDir, ".probe"),
    });
    await writeFile(
      path.join(probeDir, "render-probe.json"),
      `${JSON.stringify(probe, null, 2)}\n`,
      "utf8",
    );
    out(probeLine(probe));
    out(`  기록  ${COMPS_REL}/render-probe.json`);
    for (const item of probe.paths) {
      if (!item.ok) out(`  ! ${item.name} 을 쓸 수 없다 — ${item.error}`);
    }
    process.exit(0);
  }

  const plan = await json(ctx.project, "flow-plan.json");
  if (!plan) throw new Error("PLAN_MISSING flow-plan.json 을 JSON 으로 읽을 수 없다");
  const briefs = plan.gif_briefs ?? [];
  if (briefs.length === 0) throw new Error("NO_BRIEFS 플랜에 gif_brief 가 없다");

  const page = await text(ctx.project, path.join("work", "page-plan.md"));
  const terms = pageTerms(page);
  const imageExt = EXT[ctx.policy?.photo_format] ?? ".webp";

  // ── 컴포지션 만들기 ──────────────────────────────────────────────────────
  if (mode === "--scaffold") {
    const made = [];
    const skipped = [];
    for (const brief of briefs) {
      const dir = path.join(ctx.project, COMPS_REL, brief.id);
      await mkdir(dir, { recursive: true });
      const meta = {
        method: brief.method,
        source_still: brief.source_still ?? null,
        subtitles: (brief.frames ?? []).filter((frame) => terms.includes(frame)),
      };
      await writeFile(path.join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");

      if (brief.method !== "still-motion") {
        skipped.push(`${brief.id} (${brief.method} — --render 가 직접 굽는다)`);
        continue;
      }
      try {
        const html = scaffoldStillMotion({
          brief,
          imageExt,
          subtitles: meta.subtitles,
          tokens: plan.tokens ?? {},
        });
        await writeFile(path.join(dir, "index.html"), html, "utf8");
        made.push(brief.id);
      } catch (error) {
        skipped.push(`${brief.id}: ${error.message.split("\n")[0]}`);
      }
    }

    out(`컴포지션 ${made.length}개를 만들었다 → ${COMPS_REL}/<brief>/index.html`);
    out("스틸이 이미 `<img>` 로 들어가 있다. **지우지 않는다** — 게이트가 본다.");
    if (terms.length === 0) {
      out("");
      out("경고: page-plan.md 의 `## 용어 집합` 을 읽을 수 없어 자막을 비웠다.");
    } else {
      out(`자막은 이 용어에서만 고른다: ${terms.join(" · ")}`);
    }
    if (skipped.length > 0) {
      out("");
      for (const line of skipped) out(`  - ${line}`);
    }
    out("");
    out("패턴·자막을 손본 뒤 --render 로 굽는다.");
    process.exit(0);
  }

  if (mode !== "--render") {
    out(`brief ${briefs.length}개.`);
    out("");
    for (const brief of briefs) {
      out(`  ${brief.id}  [${brief.method ?? "method 없음"}]  ${brief.question ?? ""}`);
      out(`      스틸 ${brief.source_still ?? "없음"} · 패턴 ${brief.pattern ?? "없음"}`);
      if (brief.frames?.length) out(`      프레임: ${brief.frames.join(" → ")}`);
    }
    out("");
    out("--scaffold 로 컴포지션을 만든 뒤 --render 로 굽는다.");
    process.exit(0);
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────
  const gifDir = path.join(ctx.project, GIFS_REL);
  await mkdir(gifDir, { recursive: true });
  const chrome = await findChrome();

  const results = await pool(briefs, WORKERS, async (brief) => {
    const compDir = path.join(ctx.project, COMPS_REL, brief.id);
    const gifAbs = path.join(gifDir, `${brief.id}.gif`);
    let meta = null;
    try {
      meta = JSON.parse(await readFile(path.join(compDir, "meta.json"), "utf8"));
    } catch {
      return { brief: brief.id, error: `meta.json 이 없다. --scaffold 를 먼저 돌린다` };
    }

    // 연속 프레임은 god-tibo 가 스틸을 레퍼런스로 프레임을 만들고 GIF 까지 조립한다.
    if (brief.method === "tibo-sequence") {
      const stillPath = path.join(ctx.project, IMAGES_REL, `${brief.source_still}${imageExt}`);
      try {
        await stat(stillPath);
      } catch {
        return { brief: brief.id, error: `스틸이 발행되지 않았다: ${brief.source_still}` };
      }
      const job = tiboSequenceJob({
        brief,
        stillPath,
        outputDir: compDir,
        targetSize: "780x520",
      });
      const jobPath = path.join(compDir, "tibo-job.json");
      try {
        await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");
        await spawnTool(process.execPath, [path.join(TIBO, "scripts", "tibo-batch.mjs"), "--job", jobPath], TIBO);
        // 프레임 하나가 장면 하나다. 보간보다 오래 머물러야 읽힌다.
        await assembleGif({
          framePaths: await framesIn(compDir),
          outputPath: gifAbs,
          scenes: true,
          workDir: compDir,
        });
      } catch (error) {
        return { brief: brief.id, error: error.message };
      }
      return {
        brief: brief.id,
        entry: buildEntry({
          brief: brief.id,
          meta,
          comp: path.relative(ctx.project, jobPath).split(path.sep).join("/"),
          gif: `${GIFS_REL.split(path.sep).join("/")}/${brief.id}.gif`,
          sourceStill: brief.source_still,
          frames: job.prompts.length,
        }),
      };
    }

    const compFile = await newestFile(compDir).catch(() => null);
    if (!compFile) return { brief: brief.id, error: "컴포지션 파일이 없다" };
    try {
      // 컴포지션은 `?f=N` 으로 프레임 하나를 그린다. 프레임을 먼저 다 찍고 조립한다 —
      // 렌더러에게 GIF 까지 맡기면 일정 fps 가 되어 속도를 제어할 수 없다.
      const frameDir = path.join(compDir, "frames");
      await mkdir(frameDir, { recursive: true });
      const framePaths = await shootFrames({
        chrome,
        indexPath: path.join(compDir, "index.html"),
        frameDir,
        count: STILL_MOTION_FRAMES,
      });
      await assembleGif({ framePaths, outputPath: gifAbs, scenes: false, workDir: compDir });
    } catch (error) {
      return { brief: brief.id, error: error.message };
    }
    return {
      brief: brief.id,
      entry: buildEntry({
        brief: brief.id,
        meta,
        comp: path.relative(ctx.project, path.join(compDir, "index.html")).split(path.sep).join("/"),
        gif: `${GIFS_REL.split(path.sep).join("/")}/${brief.id}.gif`,
        sourceStill: brief.source_still,
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
    if (!entry.source_still) out(`  ! ${entry.brief} 에 source_still 이 없다 — 이미지에서 시작하지 않았다`);
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
