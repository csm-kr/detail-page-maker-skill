// 헤드리스 실행기 — 게이트 하나를 새 세션에서 돌린다.
//
// harness-framework 의 `template/scripts/execute.py` 에서 실행 모델만 가져왔다.
// 프레임워크는 설치하지 않는다 — 게이트 순서는 gates.mjs 가 소유하고(ADR-0001),
// 지시서는 SKILL.md 이고, 상태는 gates.json 이다. 없던 것은 실행기 하나뿐이었다.
//
// **가져오지 않은 것: 자식의 자기 보고.** harness 는 자식이 index.json 에
// "completed" 를 쓰면 그게 통과다. 우리는 부모가 check.mjs 를 다시 돌린다.
// 헤드리스로 가면 사람이 자식을 안 보므로 오히려 더 중요해진다.

import { spawn as nodeSpawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runCheck } from "./check.mjs";
import { buildPack } from "./contextpack.mjs";

/** harness 와 같다. 게이트 하나가 30분을 넘으면 그건 게이트가 큰 것이다. */
export const EXEC_TIMEOUT_MS = 30 * 60 * 1000;

/** 세 번까지. harness 와 같다 — 네 번째는 프롬프트가 아니라 게이트를 고칠 자리다. */
export const MAX_ATTEMPTS = 3;

const EXEC_REL = path.join("work", "exec");

/**
 * `claude -p` 인자. **프롬프트는 여기 없다 — stdin 으로 넘긴다.**
 * 팩이 30KB 이고 Windows 명령줄 상한은 32KB 다. argv 로 넘기면 어느 날 조용히 잘린다.
 */
export function execArgs() {
  return ["-p", "--dangerously-skip-permissions", "--output-format", "json"];
}

export function logPath(project, id, attempt) {
  return path.join(project, EXEC_REL, `${id}-${attempt}.json`);
}

export function promptPath(project, id, attempt) {
  return path.join(project, EXEC_REL, `${id}-${attempt}.prompt.md`);
}

/**
 * 자식이 남긴 한 줄. **이것만 다음 게이트로 넘어간다.**
 * SUMMARY 가 없으면 null 이다 — 대화 전문을 넘기면 맥락 분리가 무의미해진다.
 */
export function execSummary(stdout) {
  let text;
  try {
    text = JSON.parse(stdout)?.result;
  } catch {
    return null;
  }
  if (typeof text !== "string") return null;
  const found = [...text.matchAll(/^\s*SUMMARY:\s*(.+?)\s*$/gm)].pop();
  return found ? found[1] : null;
}

/** 재시도 프롬프트. 앞 시도가 무엇으로 거부됐는지 넣는다. */
export function retryText(packText, reasons, attempt) {
  return [
    packText,
    "",
    `## 앞 시도가 거부됐다 (${attempt - 1}회차)`,
    "",
    "check.mjs 가 이렇게 판정했다. 같은 것을 다시 하지 않는다.",
    "",
    ...reasons.map((reason) => `- ${reason}`),
    "",
  ].join("\n");
}

/** 기본 실행기. 테스트는 이 자리를 갈아 끼운다. */
function realSpawn({ command, args, stdin, cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = nodeSpawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 124, stdout, stderr: `${stderr}\nTIMEOUT ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`EXEC_SPAWN_FAILED ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

/**
 * 게이트 하나를 헤드리스로 돈다.
 *
 *   ctx   { workspace, project, state }
 *   spawn 실행기 (주입 가능)
 *   check 판정 (주입 가능). 기본은 runCheck — **부모가 돌린다**
 *
 * 반환 { ok, attempts, reasons, summary }
 */
export async function runExec(id, ctx, options = {}) {
  const {
    spawn = realSpawn,
    check = () => runCheck(id, ctx),
    onLine = () => {},
    command = "claude",
  } = options;

  const pack = await buildPack(id, ctx); // 결정적인 게이트면 여기서 던진다
  await mkdir(path.join(ctx.project, EXEC_REL), { recursive: true });

  const attempts = [];
  let reasons = [];
  let summary = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const stdin = attempt === 1 ? pack.text : retryText(pack.text, reasons, attempt);
    await writeFile(promptPath(ctx.project, id, attempt), stdin, "utf8");

    onLine(`${id} 시도 ${attempt}/${MAX_ATTEMPTS} · 팩 ${Buffer.byteLength(stdin, "utf8")}B`);
    const startedAt = Date.now();
    const child = await spawn({
      command,
      args: execArgs(),
      stdin,
      cwd: ctx.project,
      timeoutMs: EXEC_TIMEOUT_MS,
    });
    const elapsedMs = Date.now() - startedAt;

    // 자식이 무엇을 보고했든 **부모가 다시 판정한다.**
    const verdict = await check(attempt);
    reasons = verdict.reasons ?? [];
    const line = execSummary(child.stdout);
    if (line) summary = line;

    const record = {
      gate: id,
      attempt,
      started_at: new Date(startedAt).toISOString(),
      elapsed_ms: elapsedMs,
      pack_bytes: Buffer.byteLength(stdin, "utf8"),
      pack_sources: {
        canon: pack.canon.map((doc) => doc.rel),
        missing: pack.missing,
        inputs: pack.inputs.map((item) => item.spec),
      },
      child: { code: child.code, stderr: (child.stderr ?? "").slice(0, 4000) },
      summary: line,
      check: { ok: verdict.ok === true, reasons },
    };
    await writeFile(logPath(ctx.project, id, attempt), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    attempts.push(record);

    if (verdict.ok === true) {
      if (summary && ctx.state?.gates) {
        (ctx.state.gates[id] ??= {}).summary = summary;
      }
      onLine(`${id} 통과 · ${Math.round(elapsedMs / 1000)}초`);
      return { ok: true, attempts, reasons: [], summary };
    }

    onLine(`${id} 거부 ${reasons.length}건${attempt < MAX_ATTEMPTS ? " · 사유를 넣어 다시 돈다" : ""}`);
  }

  return { ok: false, attempts, reasons, summary };
}
