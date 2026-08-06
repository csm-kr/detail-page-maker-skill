#!/usr/bin/env node
// G10 QA. 첫 줄이 선행 게이트 검사다.
//
// 2회차에 38 MB 를 발행했다. 그때 QA 를 "돌렸다"고 적었지만 --strict-media 가 아니었다.
// 그래서 이 스크립트는 항상 strict 로 돌리고, 그 사실을 보고서에 남긴다 — check.mjs 가
// `strict_media === true` 를 본다. 끄는 방법을 두지 않는다.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { json } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";
import { validateHtmlProject } from "../../detail-page-orchestrator/scripts/lean-html-qa.mjs";
import { shapeReport } from "./lib/report.mjs";

const OUT_REL = path.join("work", "qa-report.json");

try {
  const ctx = await guard("G10");
  const out = (text) => process.stdout.write(`${text}\n`);

  // 수량은 **이 회차가 계획한 만큼**을 본다. 예전에는 28~32 라는 임의의 범위였고,
  // 그래서 엄격한 선별이 12장만 채택했을 때 통과할 방법이 없었다.
  const selection = await json(ctx.project, path.join("work", "selection.json"));
  const comps = await json(ctx.project, path.join("work", "comps", "index.json"));
  const expected =
    selection || comps
      ? {
          images: (selection?.entries ?? []).filter((entry) => entry.decision === "accept").length,
          gifs: (comps?.entries ?? []).length,
        }
      : null;

  const result = validateHtmlProject(ctx.project, { strictMedia: true, expected });
  const report = shapeReport(result, { strictMedia: true });

  await mkdir(path.join(ctx.project, "work"), { recursive: true });
  await writeFile(
    path.join(ctx.project, OUT_REL),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  out(`QA 완료 → ${OUT_REL}`);
  out(`  HTML      ${report.html ?? "없음"}`);
  out(`  미디어    이미지 ${report.media.images}개 · GIF ${report.media.gifs}개`);
  if (expected) out(`  계획      이미지 ${expected.images}개 · GIF ${expected.gifs}개`);
  out(`  오류      ${report.errors.length}건`);
  for (const line of report.errors.slice(0, 10)) out(`    - ${line}`);
  if (report.errors.length > 10) out(`    … ${report.errors.length - 10}건 더`);
  out(`  경고      ${report.warnings.length}건`);
  for (const line of report.warnings.slice(0, 5)) out(`    - ${line}`);
  out("");

  if (report.errors.length > 0) {
    // 보고서는 남긴다. 게이트는 통과하지 않는다 — 고칠 곳이 보이는 상태로 멈춘다.
    out("오류를 고친 뒤 다시 돌린다. 포맷·폭·프레임 문제는 G6/G8 로 돌아가야 할 수 있다.");
  } else {
    out(`포맷과 용량은 gate G10 --check 가 정책값으로 다시 본다.`);
  }
} catch (error) {
  refuse(error);
}
