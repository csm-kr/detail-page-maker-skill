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
import { RUN_GATES } from "./gates.mjs";
import { hashFile } from "./hashchain.mjs";

/** 어느 게이트도 이보다 오래 잡고 있지 않는다. */
export const EXEC_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * 게이트 하나의 밧줄. **예산에서 나온다.**
 *
 * 5회차 G11 은 예산 5분짜리인데 30분을 세 번 받아 **90분**을 썼다. 예산의 세 배를
 * 넘겼으면 그건 프롬프트가 아니라 게이트를 볼 자리다. 바닥 10분은 세션 시작 비용이다 —
 * 예산 2분짜리 게이트도 모델을 띄우고 파일을 읽는 데는 같은 시간이 든다.
 */
export function execTimeoutMs(g) {
  return Math.min(EXEC_TIMEOUT_MS, Math.max(10, (g?.budgetMin ?? 10) * 3) * 60 * 1000);
}

/** 세 번까지. harness 와 같다 — 네 번째는 프롬프트가 아니라 게이트를 고칠 자리다. */
export const MAX_ATTEMPTS = 3;

const EXEC_REL = path.join("work", "exec");

/**
 * 게이트 세션이 쓸 수 있는 도구. **게이트는 파일을 고치고 node 를 부른다. 그 이상은 없다.**
 * 프롬프트가 아니라 실행기가 정한다 — 프롬프트로 부탁한 제약은 제약이 아니다.
 */
export const ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "TodoWrite",
  "Bash(node *)",
];

/**
 * 막는 것. 수집은 `orchestrate capture` 가 하고 해시로 잠근다 —
 * 세션이 직접 받아 오면 근거가 잠금 밖에 생기고 회차가 재현되지 않는다.
 */
export const DISALLOWED_TOOLS = ["WebFetch", "WebSearch"];

/**
 * `claude -p` 인자. **프롬프트는 여기 없다 — stdin 으로 넘긴다.**
 * 팩이 30KB 이고 Windows 명령줄 상한은 32KB 다. argv 로 넘기면 어느 날 조용히 잘린다.
 *
 * 권한을 통째로 끄지 않는다. `--dangerously-skip-permissions` 를 게이트마다 도는 것은
 * 자식이 god-tibo 를 부르고 Chrome 을 띄우는 것을 무제한 허용하는 것이다.
 * 편집은 자동 승인하되(`acceptEdits`) 작업 범위는 **회차 폴더**로 묶는다.
 */
export function execArgs(project) {
  return [
    "-p",
    "--output-format",
    "json",
    "--permission-mode",
    "acceptEdits",
    "--add-dir",
    project,
    "--allowedTools",
    ALLOWED_TOOLS.join(","),
    "--disallowedTools",
    DISALLOWED_TOOLS.join(","),
  ];
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

/**
 * 자식이 무엇을 거부당했는가. **자식의 진단을 그대로 믿지 않기 위해 필요하다** —
 * 4회차 G1 은 두 회차 연속 "node 실행 권한이 막혔다" 고 보고했는데 그 명령을 그대로
 * 돌리면 거부 0건에 종료 코드 0 이었다. 없으면 빈 배열이다: "못 봤다" 와 구분한다.
 */
export function execDenials(stdout) {
  let list;
  try {
    list = JSON.parse(stdout)?.permission_denials;
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const name = item?.tool_name ?? "?";
    const input = item?.tool_input ?? {};
    const detail = input.command ?? input.file_path ?? input.url ?? "";
    return detail ? `${name}: ${detail}` : name;
  });
}

/**
 * 다른 게이트의 산출물. 팩은 "다른 게이트의 파일을 고치지 않는다" 고 말하지만
 * **말로 한 제약은 제약이 아니다.** 5회차에 두 번 어겼고 둘 다 git 을 열기 전에는 몰랐다.
 */
function foreignOutputs(id) {
  return RUN_GATES.filter((g) => g.id !== id).flatMap((g) =>
    (g.outputs ?? []).map((rel) => ({ owner: g.id, rel })),
  );
}

async function ownershipSnapshot(project, id) {
  const shot = new Map();
  for (const item of foreignOutputs(id)) {
    shot.set(`${item.owner}: ${item.rel}`, await hashFile(path.join(project, item.rel)));
  }
  return shot;
}

/** 스냅샷 뒤로 바뀐 남의 산출물. 막지는 않는다 — 판정은 언제나 check.mjs 다. */
async function trespassSince(project, id, before) {
  const changed = [];
  for (const [key, digest] of before) {
    const rel = key.slice(key.indexOf(": ") + 2);
    if ((await hashFile(path.join(project, rel))) !== digest) changed.push(key);
  }
  return changed;
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

/**
 * Windows 에서 `claude` 는 `.cmd` 셔임이라 셸 없이는 뜨지 않는다. 그런데 `shell: true`
 * 로 spawn 하면 Node 는 인자를 **이스케이프 없이 이어붙인다**(DEP0190 이 그렇게 경고한다).
 *
 * 4회차: 그래서 `--allowedTools ... Bash(node *)` 가 cmd.exe 에서 공백과 괄호로 쪼개졌고,
 * 자식은 깨진 허용 목록을 받아 **모든 Bash 를 거부당했다.** `node -e "console.log(1+1)"`
 * 조차 막혔다. 자식은 "node 실행 권한이 막혔다" 고 정확히 보고했는데, 실행기가 그 보고를
 * 남기지 않아 두 회차를 오진으로 흘려보냈다.
 */
export function shellQuote(arg) {
  const value = String(arg);
  return /^[A-Za-z0-9_.:\\/=-]+$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;
}

/** 기본 실행기. 테스트는 이 자리를 갈아 끼운다. */
function realSpawn({ command, args, stdin, cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const shell = process.platform === "win32";
    const child = nodeSpawn(command, shell ? args.map(shellQuote) : args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell,
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
    const owned = await ownershipSnapshot(ctx.project, id);
    const startedAt = Date.now();
    const child = await spawn({
      command,
      args: execArgs(ctx.project),
      stdin,
      cwd: ctx.project,
      timeoutMs: execTimeoutMs(pack.gate),
    });
    const elapsedMs = Date.now() - startedAt;

    // 끝까지 간 세션과 죽인 세션이 같아 보이면 안 된다. 5회차 G11 은 세 시도가 전부
    // 타임아웃이었는데 화면에는 `통과 · 1800초` 만 나왔다.
    const timedOut = child.code === 124;
    if (timedOut) {
      onLine(
        `${id} 시도 ${attempt} 타임아웃 ${Math.round(execTimeoutMs(pack.gate) / 60000)}분 — 자식을 죽였다`,
      );
    }

    // 자식이 무엇을 보고했든 **부모가 다시 판정한다.**
    const verdict = await check(attempt);
    reasons = verdict.reasons ?? [];
    const line = execSummary(child.stdout);
    if (line) summary = line;
    const denials = execDenials(child.stdout);
    if (denials.length > 0) onLine(`${id} 자식이 거부당한 것 ${denials.length}건 — ${denials[0]}`);

    const trespass = await trespassSince(ctx.project, id, owned);
    if (trespass.length > 0) {
      onLine(`${id} 남의 산출물을 만졌다 ${trespass.length}건 — ${trespass.join(" · ")}`);
    }

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
      child: {
        code: child.code,
        stderr: (child.stderr ?? "").slice(0, 4000),
        denials,
        timed_out: timedOut,
        trespass,
      },
      summary: line,
      check: { ok: verdict.ok === true, reasons },
    };
    await writeFile(logPath(ctx.project, id, attempt), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    attempts.push(record);

    if (verdict.ok === true) {
      if (summary && ctx.state?.gates) {
        (ctx.state.gates[id] ??= {}).summary = summary;
      }
      onLine(
        `${id} 통과 · ${Math.round(elapsedMs / 1000)}초${
          timedOut ? " · 다만 자식은 죽인 것이다. 산출물이 반쪽일 수 있다" : ""
        }`,
      );
      return { ok: true, attempts, reasons: [], summary };
    }

    onLine(`${id} 거부 ${reasons.length}건${attempt < MAX_ATTEMPTS ? " · 사유를 넣어 다시 돈다" : ""}`);
  }

  return { ok: false, attempts, reasons, summary };
}
