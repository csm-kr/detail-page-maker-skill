#!/usr/bin/env node
// G6 스틸. 첫 줄이 선행 게이트 검사다.
//
// 혼합 게이트다. 스크립트가 생성하고 발행하지만 **선별은 사람이 한다.**
//
//   run.mjs --base     → 기준 컷 한 장만 만든다. 이것이 나머지 29장의 canonical base 다.
//   run.mjs            → 기준 컷을 레퍼런스로 나머지를 만든다. 그리고 멈춘다.
//   (사람)             → 원본 해상도로 보고 work/selection.json 을 쓴다.
//   run.mjs --regen    → **탈락한 컷만** 다시 굽는다. 채택분은 건드리지 않는다.
//   run.mjs --publish  → 채택된 것만 output/media/images/ 로 780px 발행한다.
//
// 발행을 생성과 같은 실행에 두면 판정 없이 전부 나간다. 재생성을 전체 생성과 같은
// 실행에 두면 통과한 컷까지 날아간다. 넷으로 나눈 이유가 그것이다.

import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { json } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { BUNDLE_ROOT } from "../../detail-page-orchestrator/scripts/lib/extract.mjs";
import { publishImage } from "../../detail-page-orchestrator/scripts/lib/media.mjs";
import { guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";
import { stillsOf } from "../../detail-page-g9-build/scripts/lib/render.mjs";
import { buildItems, regenCutIds, regenItems } from "./lib/prompt.mjs";
import { stillSource } from "./lib/source.mjs";

const STAGE_REL = path.join("work", "stills");
const BASE_REL = path.join("work", "stills", "base");
const PUBLISH_REL = path.join("output", "media", "images");
const TIBO = path.join(BUNDLE_ROOT, "god-tibo-gpt-image2-skill");

const out = (line) => process.stdout.write(`${line}\n`);

function runNode(script, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, stdio: "inherit" });
    child.on("error", (error) => reject(new Error(`TIBO_SPAWN_FAILED ${error.message}`)));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`TIBO_FAILED 종료 코드 ${code}`)),
    );
  });
}

/** 생성기가 순번으로 쓴 파일. 정렬해야 items 순서와 맞는다. */
async function framesIn(dir) {
  return (await readdir(dir).catch(() => []))
    .filter((name) => /^frame-\d+\.(png|webp|jpg)$/i.test(name))
    .sort();
}

/** 다음 재생성 폴더. 이전 결과를 덮어쓰지 않는다. */
async function nextRegenDir(project) {
  const rounds = (await readdir(path.join(project, STAGE_REL)).catch(() => []))
    .map((name) => /^regen-(\d+)$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  return path.join(STAGE_REL, `regen-${Math.max(0, ...rounds) + 1}`);
}

async function generate({ project, items, dir, targetSize, label }) {
  const absolute = path.join(project, dir);
  await mkdir(absolute, { recursive: true });
  const job = {
    size_mode: "controllable",
    target_size: targetSize,
    workers: Math.min(32, items.length),
    output_dir: absolute,
    items,
  };
  const jobPath = path.join(project, "work", `tibo-job-${label}.json`);
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");
  out(`생성 시작  ${label} · 컷 ${items.length}개 → ${dir}`);
  await runNode(path.join(TIBO, "scripts", "tibo-batch.mjs"), ["--job", jobPath], TIBO);
}

try {
  const ctx = await guard("G6");
  const mode = ["--base", "--regen", "--publish"].find((flag) => process.argv.includes(flag));

  const plan = await json(ctx.project, "flow-plan.json");
  if (!plan) throw new Error("PLAN_MISSING flow-plan.json 을 JSON 으로 읽을 수 없다");
  const stills = stillsOf(plan);
  if (stills.length === 0) throw new Error("NO_STILLS 플랜에 컷이 없다");

  // 얼굴 정책은 init 이 물었다. 코드에 기본값이 없으므로 없으면 여기서 멈춘다.
  const face = ctx.policy?.model_face;
  if (!face && mode !== "--publish") {
    throw new Error("MODEL_FACE_MISSING 얼굴 정책이 없다. init 을 다시 돈다");
  }
  const targetSize = stills[0].target_size ?? "780x1040";

  // ── 기준 컷 ──────────────────────────────────────────────────────────────
  if (mode === "--base") {
    await generate({
      project: ctx.project,
      items: buildItems([stills[0]], { face }),
      dir: BASE_REL,
      targetSize,
      label: "base",
    });
    const frames = await framesIn(path.join(ctx.project, BASE_REL));
    out("");
    out(`기준 컷을 ${BASE_REL} 에 만들었다: ${frames.join(", ") || "(없음)"}`);
    out("**원본 해상도로 열어 본다.** 이 한 장이 나머지 전부의 제품 정체성을 정한다.");
    out("마음에 들면 그대로 두고, 아니면 이 명령을 다시 돌린다.");
    out("");
    out("다음: node scripts/run.mjs");
    process.exit(0);
  }

  const baseFrames = await framesIn(path.join(ctx.project, BASE_REL));
  const base = baseFrames.length
    ? path.join(ctx.project, BASE_REL, baseFrames[baseFrames.length - 1])
    : null;

  // ── 재생성 ──────────────────────────────────────────────────────────────
  if (mode === "--regen") {
    const selection = await json(ctx.project, path.join("work", "selection.json"));
    if (!selection) throw new Error("SELECTION_MISSING work/selection.json 이 없다");
    const items = regenItems(stills, selection, { face, base, baseCut: stills[0].id });
    if (items.length === 0) throw new Error("NO_REJECTS 탈락한 컷이 없다. 다시 구울 것이 없다");
    const dir = await nextRegenDir(ctx.project);
    await generate({ project: ctx.project, items, dir, targetSize, label: path.basename(dir) });

    const ids = regenCutIds(stills, selection);
    const frames = await framesIn(path.join(ctx.project, dir));
    out("");
    out(`다시 구운 컷 ${ids.length}개. 채택분은 건드리지 않았다.`);
    for (const [index, id] of ids.entries()) {
      out(`  ${id}  ←  ${dir.split(path.sep).join("/")}/${frames[index] ?? "(없음)"}`);
    }
    out("");
    out("원본 해상도로 다시 보고 selection.json 의 해당 항목을 고친다.");
    out('  decision 을 "accept" 로 바꾸고 `file` 에 위 경로를 적는다.');
    process.exit(0);
  }

  // ── 나머지 생성 ──────────────────────────────────────────────────────────
  if (mode !== "--publish") {
    if (!base) {
      throw new Error(
        `BASE_MISSING 기준 컷이 없다. 먼저 --base 로 한 장을 만든다 (${BASE_REL})`,
      );
    }
    await generate({
      project: ctx.project,
      items: buildItems(stills, { face, base, baseCut: stills[0].id }),
      dir: STAGE_REL,
      targetSize,
      label: "stills",
    });

    out("");
    out(`후보를 ${STAGE_REL} 에 만들었다. 기준 컷을 레퍼런스로 썼다. 여기서 멈춘다.`);
    out("");
    out("이제 사람이 판정한다. **원본 해상도로 열어서** 본다 — 썸네일로 판정하지 않는다.");
    out("work/selection.json 에 컷마다 이렇게 남긴다.");
    out("");
    out('  { "entries": [ { "cut": "<id>", "decision": "accept" | "reject",');
    out('      "reason": "<왜>", "checked_at_full_res": true,');
    out('      "file": "work/stills/frame-000.png",');
    out('      "face": "visible" | "hidden", "same_person": true,');
    out('      "no_product": false, "regen_job": "<탈락이면 재생성 프롬프트>" } ] }');
    out("");
    out("탈락이 있으면 --regen 으로 그것만 다시 굽는다. 끝나면 --publish 로 발행한다.");
    process.exit(0);
  }

  // ── 발행 ────────────────────────────────────────────────────────────────
  const selection = await json(ctx.project, path.join("work", "selection.json"));
  if (!selection) {
    throw new Error("SELECTION_MISSING work/selection.json 이 없다. 판정 없이 발행하지 않는다");
  }
  const accepted = (selection.entries ?? []).filter((entry) => entry.decision === "accept");
  if (accepted.length === 0) throw new Error("NO_ACCEPTED 채택된 컷이 없다");

  const format = ctx.policy?.photo_format ?? "webp-q85";
  const dir = path.join(ctx.project, PUBLISH_REL);
  const ffmpeg = ctx.lock?.runtimes?.ffmpeg_path ?? "ffmpeg";
  const done = [];
  const failed = [];
  for (const entry of accepted) {
    const src = path.join(ctx.project, stillSource(entry, STAGE_REL));
    try {
      await publishImage({ src, dir, id: entry.cut, format, ffmpeg });
      done.push(entry.cut);
    } catch (error) {
      failed.push(`${entry.cut}: ${error.message.split("\n")[0]}`);
    }
  }

  out(`발행 완료  ${done.length}개 → ${PUBLISH_REL} (${format}, 780px)`);
  if (failed.length > 0) {
    out("");
    out(`발행하지 못한 컷 ${failed.length}개:`);
    for (const line of failed.slice(0, 8)) out(`  - ${line}`);
    out("");
    out("판정 항목마다 `file` 에 실제 후보 경로를 적는다 (예: work/stills/frame-000.png).");
    out("생략하면 work/stills/<컷id>.png 를 찾는다 — 생성기가 순번으로 이름을 쓰면 어긋난다.");
  }
} catch (error) {
  refuse(error);
}
