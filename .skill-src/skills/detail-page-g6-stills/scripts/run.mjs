#!/usr/bin/env node
// G6 스틸. 첫 줄이 선행 게이트 검사다.
//
// 혼합 게이트다. 스크립트가 생성하고 발행하지만 **선별은 사람이 한다.** 2회차에 건너뛴
// 단계가 바로 이 선별이었고, 그래서 여기서 두 번 멈춘다.
//
//   run.mjs            → work/stills/ 에 후보를 만든다. 그리고 멈춘다.
//   (사람)             → 원본 해상도로 보고 work/selection.json 을 쓴다.
//   run.mjs --publish  → 채택된 것만 output/media/images/ 로 780px 발행한다.
//
// 발행을 생성과 같은 실행에 두면 판정 없이 전부 나간다. 나눈 이유가 그것이다.

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { json } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { BUNDLE_ROOT } from "../../detail-page-orchestrator/scripts/lib/extract.mjs";
import { publishImage } from "../../detail-page-orchestrator/scripts/lib/media.mjs";
import { guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";
import { stillsOf } from "../../detail-page-g9-build/scripts/lib/render.mjs";

const STAGE_REL = path.join("work", "stills");
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

try {
  const ctx = await guard("G6");
  const publish = process.argv.includes("--publish");

  const plan = await json(ctx.project, "flow-plan.json");
  if (!plan) throw new Error("PLAN_MISSING flow-plan.json 을 JSON 으로 읽을 수 없다");
  const stills = stillsOf(plan);
  if (stills.length === 0) throw new Error("NO_STILLS 플랜에 컷이 없다");

  if (!publish) {
    // ── 생성 ──────────────────────────────────────────────────────────────
    const stageDir = path.join(ctx.project, STAGE_REL);
    await mkdir(stageDir, { recursive: true });

    // 얼굴 정책은 init 이 물었다. 코드에 기본값이 없으므로 없으면 여기서 멈춘다.
    const face = ctx.policy?.model_face;
    if (!face) throw new Error("MODEL_FACE_MISSING 얼굴 정책이 없다. init 을 다시 돈다");

    const job = {
      size_mode: "controllable",
      target_size: "780x1040",
      workers: 4,
      output_dir: stageDir,
      items: stills.map((cut) => ({
        prompt: cut.prompt,
        ...(cut.references?.length ? { references: cut.references } : {}),
      })),
    };
    const jobPath = path.join(ctx.project, "work", "tibo-job.json");
    await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");

    out(`생성 시작  컷 ${stills.length}개 · 얼굴 정책 ${face}`);
    await runNode(path.join(TIBO, "scripts", "tibo-batch.mjs"), ["--job", jobPath], TIBO);

    out("");
    out(`후보를 ${STAGE_REL} 에 만들었다. 여기서 멈춘다.`);
    out("");
    out("이제 사람이 판정한다. **원본 해상도로 열어서** 본다 — 썸네일로 판정하지 않는다.");
    out("work/selection.json 에 컷마다 이렇게 남긴다.");
    out("");
    out('  { "entries": [ { "cut": "<id>", "decision": "accept" | "reject",');
    out('      "reason": "<왜>", "checked_at_full_res": true,');
    out('      "face": "visible" | "hidden", "same_person": true,');
    out('      "no_product": false, "regen_job": "<탈락이면 재생성 프롬프트>" } ] }');
    out("");
    out("판정을 끝내면 --publish 로 채택분만 발행한다.");
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
    const src = path.join(ctx.project, STAGE_REL, `${entry.cut}.png`);
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
    out("후보 파일 이름이 work/stills/<컷id>.png 인지 확인한다.");
  }
} catch (error) {
  refuse(error);
}
