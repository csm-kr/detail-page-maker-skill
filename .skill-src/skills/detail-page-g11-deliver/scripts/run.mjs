#!/usr/bin/env node
// G11 납품. 첫 줄이 선행 게이트 검사다.
//
// 혼합 게이트다. 스크립트가 할 수 있는 것은 **되살리기와 사실 확인**이고,
// "눈으로 봤다" 는 사람만 말할 수 있다. 그래서 둘을 나눈다.
//
//   run.mjs                   → 죽인 프로세스를 되살리고 Studio 주소를 준다. 그리고 멈춘다.
//   (사람)                    → Studio 를 눈으로 보고 Wing 으로 내보낸다.
//   run.mjs --record --wing <id> --reviewed --authoring-applied
//                             → 산출물이 실제로 있는지 확인한 뒤 delivery.json 을 쓴다.
//
// `--reviewed` 를 사람이 붙인다. 스크립트가 대신 참으로 만들지 않는다 — 그러면
// "봤다" 가 아무 뜻도 없는 값이 된다. 대신 Wing 산출물의 존재는 스크립트가 확인한다.

import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { json } from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

const KILLED_REL = path.join("work", "killed.json");
const DELIVERY_REL = path.join("work", "delivery.json");
const STUDIO = fileURLToPath(
  new URL("../../detail-page-orchestrator/scripts/lean-studio-server.mjs", import.meta.url),
);

const out = (line) => process.stdout.write(`${line}\n`);
const flag = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? "");
};

try {
  const ctx = await guard("G11");
  const record = process.argv.includes("--record");

  if (!record) {
    // ── 되살리기 ──────────────────────────────────────────────────────────
    // 우리 게이트는 프로세스를 죽이지 않는다. 그래도 기록이 있으면 되살린다.
    const killed = await json(ctx.project, KILLED_REL);
    const entries = killed?.entries ?? [];
    const pending = entries.filter((entry) => !entry.restored_at);

    if (pending.length > 0) {
      out(`되살릴 프로세스 ${pending.length}개`);
      for (const entry of pending) {
        if (!entry.cmd) {
          out(`  ! ${entry.pid ?? "?"} 에 cmd 가 없다. 무엇을 되살릴지 알 수 없다`);
          continue;
        }
        try {
          const child = spawn(entry.cmd, {
            detached: true,
            stdio: "ignore",
            shell: true,
          });
          child.unref();
          entry.restored_at = new Date().toISOString();
          out(`  ○ ${entry.cmd}`);
        } catch (error) {
          out(`  ! ${entry.cmd}: ${error.message}`);
        }
      }
      await writeFile(
        path.join(ctx.project, KILLED_REL),
        `${JSON.stringify({ ...killed, entries }, null, 2)}\n`,
        "utf8",
      );
      out("");
    } else if (entries.length > 0) {
      out(`죽인 프로세스 ${entries.length}개가 모두 되살아 있다.`);
      out("");
    }

    out("이제 사람이 확인한다.");
    out("");
    out(`  1. Studio 를 띄워 **눈으로** 본다`);
    out(`       node ${path.relative(process.cwd(), STUDIO)} --project ${path.relative(process.cwd(), ctx.project)}`);
    out(`  2. Wing 으로 내보낸다. export id 를 받아 둔다`);
    out(`  3. authoring 세션 결과를 HTML 에 반영한다`);
    out("");
    out("세 개를 끝내면 이렇게 기록한다.");
    out("");
    out("  node scripts/run.mjs --record --wing <exportId> --reviewed --authoring-applied");
    out("");
    out("붙이지 않은 항목은 거짓으로 남는다. 게이트가 그것을 본다.");
    process.exit(0);
  }

  // ── 기록 ────────────────────────────────────────────────────────────────
  const wing = flag("wing");
  if (!wing) throw new Error("WING_ID_MISSING --wing <exportId> 가 필요하다");

  // 산출물의 존재는 사람 말이 아니라 파일로 확인한다.
  const wingDir = path.join(ctx.project, "output", "wing", wing);
  let files = [];
  try {
    files = await readdir(wingDir);
  } catch {
    throw new Error(`WING_DIR_MISSING output/wing/${wing}/ 이 없다`);
  }
  if (files.length === 0) throw new Error(`WING_DIR_EMPTY output/wing/${wing}/ 이 비어 있다`);

  const delivery = {
    studio_reviewed: process.argv.includes("--reviewed"),
    authoring_applied: process.argv.includes("--authoring-applied"),
    wing_export_id: wing,
    wing_files: files.length,
    recorded_at: new Date().toISOString(),
  };
  await mkdir(path.join(ctx.project, "work"), { recursive: true });
  await writeFile(
    path.join(ctx.project, DELIVERY_REL),
    `${JSON.stringify(delivery, null, 2)}\n`,
    "utf8",
  );

  out(`기록 완료 → ${DELIVERY_REL}`);
  out(`  Wing      ${wing} · 파일 ${files.length}개`);
  out(`  Studio    ${delivery.studio_reviewed ? "봤다" : "보지 않았다"}`);
  out(`  authoring ${delivery.authoring_applied ? "반영" : "미반영"}`);
  if (!delivery.studio_reviewed || !delivery.authoring_applied) {
    out("");
    out("게이트는 통과하지 않는다. 남은 것을 끝낸 뒤 해당 플래그를 붙여 다시 기록한다.");
  } else {
    out("");
    out("`orchestrate report` 로 확정한다. exit 0 이 아니면 완료라고 말하지 않는다.");
  }
} catch (error) {
  refuse(error);
}
