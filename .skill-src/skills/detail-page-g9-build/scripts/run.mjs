#!/usr/bin/env node
// G9 조립. 첫 줄이 선행 게이트 검사다.
//
// 플랜과 page-plan 만 보고 돈다. 상품 이름도, 문구도, 색도 이 스크립트에 없다.
// 화면에 나갈 한글은 전부 `say()` 를 지나가므로 플랜에 없는 문자열은 게이트가 아니라
// 여기서 터진다 — 고칠 곳이 플랜임을 바로 알 수 있다.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { json, text } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { hashFile } from "../../detail-page-orchestrator/scripts/lib/hashchain.mjs";
import { guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";
import { referencedMedia, renderHtml } from "./lib/render.mjs";

const HTML_REL = path.join("output", "detail-page.html");
const ANCHORS_REL = path.join("work", "anchors.json");
const EXT = { "webp-q85": ".webp", "jpeg-q88": ".jpg", png: ".png" };

try {
  const ctx = await guard("G9");
  const out = (line) => process.stdout.write(`${line}\n`);

  const plan = await json(ctx.project, "flow-plan.json");
  if (!plan) throw new Error("PLAN_MISSING flow-plan.json 을 JSON 으로 읽을 수 없다");

  // G7 의 판단이 없으면 조립할 근거가 없다. 게이트 입력이기도 하다.
  const pagePlan = await text(ctx.project, path.join("work", "page-plan.md"));
  if (!pagePlan) throw new Error("PAGE_PLAN_MISSING work/page-plan.md 이 없다");

  const imageExt = EXT[ctx.policy?.photo_format] ?? ".webp";
  const html = renderHtml(plan, { imageExt });

  await mkdir(path.join(ctx.project, "output"), { recursive: true });
  await writeFile(path.join(ctx.project, HTML_REL), html, "utf8");

  // 앵커. 좌표를 붙인 이미지가 바뀌면 좌표가 조용히 깨지므로 참조한 미디어 전부의
  // 해시를 남긴다. 없는 파일은 여기서 드러난다 — HTML 만 그럴듯하게 나오는 것을 막는다.
  const images = {};
  const missing = [];
  for (const rel of referencedMedia(html)) {
    try {
      images[rel] = await hashFile(path.join(ctx.project, rel));
    } catch {
      missing.push(rel);
    }
  }
  await mkdir(path.join(ctx.project, "work"), { recursive: true });
  await writeFile(
    path.join(ctx.project, ANCHORS_REL),
    `${JSON.stringify({ built_at: new Date().toISOString(), images }, null, 2)}\n`,
    "utf8",
  );

  out(`조립 완료 → ${HTML_REL}`);
  out(`  섹션      ${(plan.sections ?? []).length}개`);
  out(
    `  토큰      ${Object.keys(plan.tokens ?? {}).length}개 · 배경 ${(plan.mood?.background ?? []).length}개`,
  );
  out(`  미디어    참조 ${Object.keys(images).length + missing.length}개 · 앵커 ${Object.keys(images).length}개`);
  out(`  앵커      ${ANCHORS_REL}`);
  if (missing.length > 0) {
    out("");
    out(`없는 미디어 ${missing.length}개 — G6/G8 이 아직 발행하지 않았다:`);
    for (const rel of missing.slice(0, 8)) out(`  - ${rel}`);
    if (missing.length > 8) out(`  … ${missing.length - 8}개 더`);
  }
} catch (error) {
  refuse(error);
}
