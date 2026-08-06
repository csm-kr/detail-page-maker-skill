#!/usr/bin/env node
// G4 목업. 첫 줄이 선행 게이트 검사다.
//
// 혼합 게이트다. **프롬프트 조립과 생성은 스크립트가** 하고, 가이드는 사람이 쓴다.
//
//   run.mjs --generate  → templates.md 를 전량 조립해 섹션마다 목업을 만든다
//   (사람)              → 목업 픽셀에서 팔레트·타이포·구성 요소를 실측해 가이드를 쓴다
//
// 1회차에는 `--generate` 가 없어서 사람이 ChatGPT 대화로 갔다. 23분 예산의 게이트가
// 가장 오래 걸렸고, 그 사이 톤이 갈렸다. 조립을 사람이 하면 블록도 빠진다 —
// 2회차에 1,208줄을 열지 않고 손으로 써서 5개 블록이 빠졌다.

import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { json, listFiles, text } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { BUNDLE_ROOT } from "../../detail-page-orchestrator/scripts/lib/extract.mjs";
import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";
import { assemblePrompt, mockupIndex, mockupItems } from "./lib/mockup.mjs";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF_REL = path.join("work", "design-ref");
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
  const ctx = await guard("G4");

  if (!process.argv.includes("--generate")) {
    checklist({
      gate: ctx.gate,
      items: [
        "`run.mjs --generate` 로 목업을 받는다. 프롬프트 조립은 스크립트가 한다 — 손으로 쓰지 않는다",
        "우리 HTML 을 렌더해 목업 자리에 놓지 않는다. 목업은 밖에서 온다 — 게이트가 `origin` 으로 거부한다",
        "`work/design-ref/mood/` 에 무드 레퍼런스를 최소 1장 둔다. identity 사진만으로는 톤이 나오지 않는다",
        "목업 픽셀에서 팔레트·타이포·구성 요소를 실측해 `DESIGN-GUIDE.md` 를 쓴다",
        "가이드에는 `## 팔레트` 와 `## 배경` 절이 있어야 한다. G5 가 그 두 절을 읽는다",
        "`harvest.md` 에 **무엇을 가져오고 무엇을 안 가져오는지** 적는다",
        "기준작 `benchmark/BENCHMARK.md` 의 팔레트·강조 장치와 대조한다. 저채도 단색은 상세페이지가 아니다",
      ],
      reading: [
        "references/templates.md",
        "references/design-reference.md",
        "../detail-page-orchestrator/references/benchmark/BENCHMARK.md",
      ],
    });
    process.exit(0);
  }

  // ── 생성 ────────────────────────────────────────────────────────────────
  const plan = await json(ctx.project, path.join("work", "flow-plan.draft.json"));
  if (!plan) throw new Error("PLAN_MISSING work/flow-plan.draft.json 을 읽을 수 없다");
  const sections = plan.sections ?? [];
  if (sections.length === 0) throw new Error("NO_SECTIONS 초안에 섹션이 없다");

  const template = await text(SKILL_ROOT, path.join("references", "templates.md"));
  if (!template) throw new Error("TEMPLATE_MISSING references/templates.md 가 없다");

  const face = ctx.policy?.model_face;
  if (!face) throw new Error("MODEL_FACE_MISSING 얼굴 정책이 없다. init 을 다시 돈다");

  const moodDir = path.join(ctx.project, REF_REL, "mood");
  const moodNames = await listFiles(moodDir, /\.(png|jpe?g|webp)$/i);
  if (moodNames.length === 0) {
    throw new Error(
      `MOOD_MISSING ${REF_REL}/mood/ 가 비어 있다. 기준작 캡처에서 무드를 최소 1장 넣는다`,
    );
  }
  const moods = moodNames.map((name) => path.join(moodDir, name));

  // 보낸 프롬프트를 남긴다. 게이트가 여기서 블록 누락을 본다.
  const sentDir = path.join(ctx.project, REF_REL, "prompts-sent");
  await mkdir(sentDir, { recursive: true });
  for (const [index, section] of sections.entries()) {
    const name = `${String(index + 1).padStart(2, "0")}-${section.id}.md`;
    await writeFile(path.join(sentDir, name), assemblePrompt({ template, section, face }), "utf8");
  }

  const mockupDir = path.join(ctx.project, REF_REL, "mockups");
  await mkdir(mockupDir, { recursive: true });
  const job = {
    size_mode: "controllable",
    target_size: "780x1040",
    workers: Math.min(32, sections.length),
    output_dir: mockupDir,
    items: mockupItems({ template, sections, face, moods }),
  };
  const jobPath = path.join(ctx.project, "work", "tibo-job-mockup.json");
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");

  out(`목업 생성  섹션 ${sections.length}개 · 무드 ${moods.length}장 · 얼굴 정책 ${face}`);
  await runNode(path.join(TIBO, "scripts", "tibo-batch.mjs"), ["--job", jobPath], TIBO);

  const files = (await readdir(mockupDir))
    .filter((name) => /^frame-\d+\.(png|webp|jpe?g)$/i.test(name))
    .sort();
  const indexPath = path.join(ctx.project, REF_REL, "mockup-index.json");
  try {
    await writeFile(indexPath, `${JSON.stringify(mockupIndex(sections, files), null, 2)}\n`, "utf8");
    out(`색인 완료 → ${REF_REL}/mockup-index.json (섹션 ${sections.length}개 ↔ 파일 ${files.length}개)`);
  } catch (error) {
    out("");
    out(`색인을 만들지 못했다: ${error.message.split("\n")[0]}`);
    out("실패한 장이 있다. 다시 돌리거나 빠진 섹션만 손으로 채운 뒤 색인을 쓴다.");
  }

  out("");
  out("이제 사람이 한다. **목업을 원본 해상도로 열어** 픽셀에서 실측한다.");
  out(`  ${REF_REL}/DESIGN-GUIDE.md   팔레트 · 타이포 · 구성 요소 · 배경`);
  out(`  ${REF_REL}/harvest.md        무엇을 가져오고 무엇을 안 가져오는지`);
  out("");
  out("기준작과 대조한다: ../detail-page-orchestrator/references/benchmark/BENCHMARK.md");
} catch (error) {
  refuse(error);
}
