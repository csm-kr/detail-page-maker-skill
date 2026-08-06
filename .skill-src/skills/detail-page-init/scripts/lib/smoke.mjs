// 세팅 때 이미지 생성이 실제로 되는지 한 장으로 확인한다.
//
// 인증 파일이 있다는 것과 이미지가 나온다는 것은 다른 일이다. 1회차 init 은 앞의 것만
// 봤고, 뒤의 것은 G6 에서 30장을 요청하고 나서야 알 수 있었다. 여기서 30분 앞당긴다.

import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SMOKE_REL = path.join("work", "smoke");

/** 한 장짜리 작업. 상품과 무관한 도형이면 된다 — 경로가 살아 있는지만 본다. */
export function smokeJob(outputDir) {
  return {
    size_mode: "controllable",
    target_size: "512x512",
    workers: 1,
    output_dir: outputDir,
    items: [
      {
        prompt:
          "A plain matte grey sphere resting on a light grey seamless studio backdrop, " +
          "soft top light. No text, letters, logos or watermarks anywhere in the image.",
      },
    ],
  };
}

function spawnTibo(script, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 180000,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(new Error(error.message)));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`종료 코드 ${code}${stderr ? ` — ${stderr.trim().split("\n")[0]}` : ""}`)),
    );
  });
}

/**
 * 한 장을 실제로 만들어 본다.
 * `run` 은 테스트가 갈아 끼운다 — 세팅 검사가 네트워크에 묶이면 테스트가 못 돈다.
 */
export async function smokeGodTibo({ tiboRoot, workspace, run = spawnTibo }) {
  const script = path.join(tiboRoot, "scripts", "tibo-batch.mjs");
  if (run === spawnTibo) {
    try {
      await stat(script);
    } catch {
      return { ok: false, detail: `생성기가 없다: ${script}` };
    }
  }

  const outputDir = path.join(workspace, SMOKE_REL);
  await mkdir(outputDir, { recursive: true });
  const job = smokeJob(outputDir);
  const jobPath = path.join(outputDir, "job.json");
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");

  try {
    await run(script, ["--job", jobPath], tiboRoot, outputDir);
  } catch (error) {
    return { ok: false, detail: error.message };
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(outputDir, "manifest.json"), "utf8"));
  } catch {
    return { ok: false, detail: "manifest.json 이 없다" };
  }

  const first = manifest.images?.[0]?.path;
  if (!first) return { ok: false, detail: "manifest 에 images 가 없다" };
  try {
    const info = await stat(first);
    if (info.size === 0) return { ok: false, detail: `이미지 파일이 0바이트다: ${first}` };
  } catch {
    return { ok: false, detail: `이미지 파일이 없다: ${first}` };
  }

  return { ok: true, detail: path.basename(first), image: first };
}
