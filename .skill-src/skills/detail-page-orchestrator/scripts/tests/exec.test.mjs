// 헤드리스 실행기 — harness-framework 의 `execute.py` 에 해당한다.
//
// 가져오는 것은 실행 모델이고, **자식의 자기 보고를 믿는 부분은 가져오지 않는다.**
// harness 는 자식이 index.json 에 "completed" 를 쓰면 그게 통과다. 우리는 부모가
// check.mjs 를 다시 돌린다. 헤드리스로 가면 사람이 안 보므로 오히려 더 중요하다.

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  ALLOWED_TOOLS,
  EXEC_TIMEOUT_MS,
  MAX_ATTEMPTS,
  execArgs,
  execDenials,
  execSummary,
  execTimeoutMs,
  logPath,
  runExec,
  shellQuote,
} from "../lib/exec.mjs";
import { gate } from "../lib/gates.mjs";
import { loadState } from "../lib/gates-state.mjs";
import { makeProject, orchestrate } from "./fixture.mjs";

/** claude -p 의 출력 모양. --output-format json 은 result 에 최종 텍스트를 담는다. */
function childOutput(text) {
  return { code: 0, stdout: JSON.stringify({ type: "result", result: text }), stderr: "" };
}

async function bed() {
  const ws = await makeProject();
  return {
    ...ws,
    ctx: { workspace: ws.root, project: ws.project, state: await loadState(ws.project) },
  };
}

test("프롬프트는 argv 가 아니라 stdin 으로 넘긴다", async () => {
  // 팩이 30KB 다. Windows 의 명령줄 상한은 32KB 이고 인용까지 하면 더 짧다.
  // argv 로 넘기면 게이트 하나가 커진 날 조용히 잘린다.
  const args = execArgs("/tmp/p");
  assert.ok(args.includes("-p"), "-p 가 없다");
  assert.deepEqual(args.slice(args.indexOf("--output-format"), args.indexOf("--output-format") + 2), [
    "--output-format",
    "json",
  ]);
  assert.ok(
    !args.some((arg) => arg.length > 200),
    `프롬프트가 argv 에 들어 있다: ${args.join(" ")}`,
  );
});

test("권한을 통째로 끄지 않는다", async () => {
  // --dangerously-skip-permissions 를 루프에서 7번 도는 것이 앞선 위험이었다.
  // 게이트는 파일을 고치고 node 를 부른다. 그 이상은 필요 없다.
  const args = execArgs("/tmp/project");
  assert.ok(
    !args.includes("--dangerously-skip-permissions"),
    "권한을 통째로 껐다",
  );
  assert.deepEqual(
    args.slice(args.indexOf("--permission-mode"), args.indexOf("--permission-mode") + 2),
    ["--permission-mode", "acceptEdits"],
  );
  // 작업 범위는 회차 폴더다. 워크스페이스 전체가 아니다.
  assert.deepEqual(args.slice(args.indexOf("--add-dir"), args.indexOf("--add-dir") + 2), [
    "--add-dir",
    "/tmp/project",
  ]);
});

test("게이트 세션은 웹을 직접 받지 않는다", async () => {
  // 수집은 orchestrate capture 가 하고 해시로 잠근다. 세션이 직접 받아 오면
  // 근거가 잠금 밖에 생기고 회차가 재현되지 않는다.
  const args = execArgs("/tmp/project");
  const disallowed = args[args.indexOf("--disallowedTools") + 1] ?? "";
  for (const tool of ["WebFetch", "WebSearch"]) {
    assert.ok(disallowed.includes(tool), `${tool} 이 막혀 있지 않다`);
  }
});

test("허용 도구는 파일 편집과 node 뿐이다", async () => {
  const args = execArgs("/tmp/project");
  const allowed = args[args.indexOf("--allowedTools") + 1] ?? "";
  assert.match(allowed, /Bash\(node \*\)/, "게이트는 node 로만 일한다");
  for (const tool of ["Read", "Write", "Edit"]) {
    assert.ok(allowed.includes(tool), `${tool} 이 없다`);
  }
  assert.ok(!/Bash\(\*\)|Bash(?!\()/.test(allowed), `Bash 를 통째로 열었다: ${allowed}`);
});

test("타임아웃은 harness 와 같은 30분이다", () => {
  assert.equal(EXEC_TIMEOUT_MS, 30 * 60 * 1000);
});

test("결정적인 게이트는 세션을 띄우지 않는다", async () => {
  const ws = await bed();
  try {
    await assert.rejects(
      () => runExec("G9", ws.ctx, { spawn: async () => childOutput("했다"), check: async () => ({ ok: true, reasons: [] }) }),
      /NOT_AN_AGENT_GATE/,
    );
  } finally {
    await ws.cleanup();
  }
});

test("자식이 끝났다고 해도 부모가 check 를 다시 돌린다", async () => {
  // 3회차의 `origin: self-rendered` 는 자식이 "했다" 고 보고한 상태였다.
  const ws = await bed();
  try {
    let checked = 0;
    const result = await runExec("G3", ws.ctx, {
      spawn: async () => childOutput("전부 마쳤다\nSUMMARY: 섹션 13개 플랜을 썼다"),
      check: async () => {
        checked += 1;
        return { ok: false, reasons: ["산출물 없음: work/flow-plan.draft.json"] };
      },
    });
    assert.equal(result.ok, false, "자식의 보고만으로 통과했다");
    assert.equal(checked, MAX_ATTEMPTS, "시도마다 검사를 다시 돌리지 않았다");
  } finally {
    await ws.cleanup();
  }
});

test("Windows 셸에서 허용 목록이 쪼개지지 않는다", () => {
  // 4회차의 진짜 원인. `shell: true` 로 spawn 하면 Node 는 인자를 **이스케이프 없이
  // 이어붙인다**(DEP0190 이 그렇게 경고한다). 그러면 cmd.exe 가 `Bash(node *)` 의
  // 공백과 괄호에서 인자를 쪼개고, 자식은 **깨진 허용 목록**을 받는다.
  // 그 세션에서는 `node -e "console.log(1+1)"` 조차 거부됐다.
  assert.equal(shellQuote("Read,Bash(node *)"), '"Read,Bash(node *)"');
  assert.equal(shellQuote("-p"), "-p", "단순한 인자까지 감싸면 읽기 어렵다");

  const quoted = execArgs("C:/p/해충끈끈이-1").map(shellQuote);
  assert.ok(
    quoted.includes(`"${ALLOWED_TOOLS.join(",")}"`),
    `허용 목록이 한 인자로 남지 않았다: ${quoted.join(" ")}`,
  );
  assert.ok(quoted.includes('"C:/p/해충끈끈이-1"'), "한글 경로가 감싸이지 않았다");
});

test("남의 산출물을 만졌으면 로그와 화면에 남는다", async () => {
  // 5회차에 두 번 있었다.
  //   G3 이 G2 의 flow-map.md 를 고쳤다 — 팩이 금지한 일이다
  //   G11 이 G9 의 detail-page.html 을 고쳤다 — 정본은 허락하지만 그래프는 모른다
  // 둘 다 **git 을 열어보기 전에는 아무도 몰랐다.** 막지는 않는다. 판정은 check.mjs 다.
  const ws = await bed();
  try {
    const lines = [];
    await runExec("G3", ws.ctx, {
      spawn: async () => {
        // G2 의 산출물이다. G3 의 것이 아니다.
        await writeFile(path.join(ws.project, "work", "flow-map.md"), "고쳤다", "utf8");
        return childOutput("SUMMARY: 했다");
      },
      check: async () => ({ ok: true, reasons: [] }),
      onLine: (line) => lines.push(line),
    });
    const record = JSON.parse(await readFile(logPath(ws.project, "G3", 1), "utf8"));
    assert.deepEqual(record.child.trespass, ["G2: work/flow-map.md"]);
    assert.ok(lines.some((line) => /남의 산출물/.test(line)), lines.join(" / "));
  } finally {
    await ws.cleanup();
  }
});

test("자기 산출물을 쓰는 것은 침범이 아니다", async () => {
  const ws = await bed();
  try {
    await runExec("G3", ws.ctx, {
      spawn: async () => {
        await writeFile(path.join(ws.project, "work", "flow-plan.draft.json"), "{}", "utf8");
        return childOutput("SUMMARY: 했다");
      },
      check: async () => ({ ok: true, reasons: [] }),
    });
    const record = JSON.parse(await readFile(logPath(ws.project, "G3", 1), "utf8"));
    assert.deepEqual(record.child.trespass, []);
  } finally {
    await ws.cleanup();
  }
});

test("타임아웃은 예산에서 나온다. 게이트마다 다르다", () => {
  // 5회차 G11 은 예산 5분짜리인데 30분 밧줄을 세 번 받아 **90분**을 썼다.
  // 예산의 세 배를 넘겼으면 그건 프롬프트가 아니라 게이트를 볼 자리다.
  assert.ok(execTimeoutMs(gate("G11")) < EXEC_TIMEOUT_MS, "예산 5분 게이트가 상한을 다 쓴다");
  assert.ok(execTimeoutMs(gate("G4")) > execTimeoutMs(gate("G11")), "예산이 큰 게이트가 더 짧다");
  assert.ok(execTimeoutMs(gate("G5")) >= 10 * 60_000, "예산 2분 게이트에 시작 비용도 못 준다");
});

test("타임아웃으로 죽인 자식을 조용히 통과시키지 않는다", async () => {
  // 5회차 G11 은 세 시도가 전부 정확히 1800초였다. 로그에는 `code: 124` 가 남았는데
  // 화면에는 `G11 통과 · 1800초` 만 나왔다. **끝까지 간 세션과 죽인 세션이 같아 보였다.**
  // 판정은 그대로 check.mjs 가 한다 — 다만 반쪽일 수 있다는 사실은 남긴다.
  const ws = await bed();
  try {
    const lines = [];
    const result = await runExec("G3", ws.ctx, {
      spawn: async () => ({ code: 124, stdout: "", stderr: "TIMEOUT 1800000ms" }),
      check: async () => ({ ok: true, reasons: [] }),
      onLine: (line) => lines.push(line),
    });
    assert.equal(result.ok, true, "판정은 check.mjs 가 한다");
    assert.ok(lines.some((line) => /타임아웃/.test(line)), lines.join(" / "));
    const record = JSON.parse(await readFile(logPath(ws.project, "G3", 1), "utf8"));
    assert.equal(record.child.timed_out, true);
  } finally {
    await ws.cleanup();
  }
});

test("자식이 무엇을 거부당했는지 로그에 남는다", async () => {
  // 4회차 G1 은 두 회차 연속 "node 실행 권한이 막혔다" 고 보고했다. 실제로 그 명령을
  // 그대로 돌려 보면 거부 0건에 종료 코드 0 이다 — **자식의 진단을 검증할 수단이 없었다.**
  // `claude -p --output-format json` 이 permission_denials 를 주는데 실행기가 버리고 있었다.
  const ws = await bed();
  try {
    const denied = [{ tool_name: "Bash", tool_input: { command: 'node x.mjs; echo "$?"' } }];
    await runExec("G3", ws.ctx, {
      spawn: async () => ({
        code: 0,
        stdout: JSON.stringify({ result: "SUMMARY: 했다", permission_denials: denied }),
        stderr: "",
      }),
      check: async () => ({ ok: true, reasons: [] }),
    });
    const record = JSON.parse(await readFile(logPath(ws.project, "G3", 1), "utf8"));
    assert.deepEqual(record.child.denials, ['Bash: node x.mjs; echo "$?"']);
  } finally {
    await ws.cleanup();
  }
});

test("거부가 없으면 없다고 남는다", async () => {
  // 빈 배열이어야 "못 봤다" 와 "없었다" 가 구분된다.
  const ws = await bed();
  try {
    await runExec("G3", ws.ctx, {
      spawn: async () => childOutput("SUMMARY: 했다"),
      check: async () => ({ ok: true, reasons: [] }),
    });
    const record = JSON.parse(await readFile(logPath(ws.project, "G3", 1), "utf8"));
    assert.deepEqual(record.child.denials, []);
  } finally {
    await ws.cleanup();
  }
});

test("실패하면 사유를 프롬프트에 넣어 재시도한다", async () => {
  const ws = await bed();
  try {
    const prompts = [];
    let calls = 0;
    const result = await runExec("G3", ws.ctx, {
      spawn: async ({ stdin }) => {
        prompts.push(stdin);
        return childOutput("SUMMARY: 고쳤다");
      },
      check: async () => {
        calls += 1;
        return calls === 1
          ? { ok: false, reasons: ["`## 소구점` 을 3개 이상 쓰지 않았다"] }
          : { ok: true, reasons: [] };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(prompts.length, 2);
    assert.ok(!prompts[0].includes("앞 시도가 거부됐다"), "첫 시도에 재시도 문구가 있다");
    assert.match(prompts[1], /앞 시도가 거부됐다/);
    assert.match(prompts[1], /소구점` 을 3개 이상 쓰지 않았다/);
  } finally {
    await ws.cleanup();
  }
});

test("재시도는 MAX_ATTEMPTS 를 넘지 않는다", async () => {
  const ws = await bed();
  try {
    let spawned = 0;
    const result = await runExec("G3", ws.ctx, {
      spawn: async () => {
        spawned += 1;
        return childOutput("SUMMARY: 못 했다");
      },
      check: async () => ({ ok: false, reasons: ["아직 없다"] }),
    });
    assert.equal(spawned, MAX_ATTEMPTS);
    assert.equal(result.ok, false);
    assert.deepEqual(result.reasons, ["아직 없다"]);
  } finally {
    await ws.cleanup();
  }
});

test("자식이 죽어도 사유를 남기고 재시도한다", async () => {
  const ws = await bed();
  try {
    let spawned = 0;
    await runExec("G3", ws.ctx, {
      spawn: async () => {
        spawned += 1;
        return { code: 1, stdout: "", stderr: "그런 명령이 없다" };
      },
      check: async () => ({ ok: false, reasons: ["산출물 없음"] }),
    });
    assert.equal(spawned, MAX_ATTEMPTS, "자식이 죽자 재시도를 멈췄다");
  } finally {
    await ws.cleanup();
  }
});

test("시도마다 로그가 파일로 남는다", async () => {
  // 세션이 분리되면 무엇을 왜 그렇게 했는지가 대화가 아니라 여기에만 남는다.
  const ws = await bed();
  try {
    await runExec("G3", ws.ctx, {
      spawn: async () => childOutput("SUMMARY: 썼다"),
      check: async () => ({ ok: true, reasons: [] }),
    });
    const log = JSON.parse(await readFile(logPath(ws.project, "G3", 1), "utf8"));
    assert.equal(log.gate, "G3");
    assert.equal(log.attempt, 1);
    assert.ok(log.pack_bytes > 0);
    assert.deepEqual(log.check.reasons, []);
    assert.ok(log.elapsed_ms >= 0);
    // 팩 자체도 남긴다. 무엇을 줬는지 모르면 왜 그렇게 했는지 못 읽는다.
    const prompt = await readFile(
      path.join(ws.project, "work", "exec", "G3-1.prompt.md"),
      "utf8",
    );
    assert.match(prompt, /지금 부족한 것/);
  } finally {
    await ws.cleanup();
  }
});

test("자식의 마지막 SUMMARY 한 줄만 다음 게이트로 넘어간다", () => {
  const stdout = JSON.stringify({
    result: "여러 줄을 썼다\n중간 설명\nSUMMARY: 섹션 13개 · 소구점 4개 사용",
  });
  assert.equal(execSummary(stdout), "섹션 13개 · 소구점 4개 사용");
  // SUMMARY 가 없으면 대화 전문을 넘기지 않는다. 그게 맥락 유실 방지의 핵심이다.
  assert.equal(execSummary(JSON.stringify({ result: "그냥 끝냈다" })), null);
  assert.equal(execSummary("JSON 이 아니다"), null);
  assert.deepEqual(execDenials("JSON 이 아니다"), []);
  assert.deepEqual(execDenials(JSON.stringify({ result: "x" })), []);
});

test("CLI 는 선행 게이트가 막혀 있으면 세션을 띄우지 않는다", async () => {
  // 세션을 띄운 뒤에 거부하면 시작 비용을 버린다. 띄우기 전에 본다.
  const ws = await makeProject();
  try {
    const result = orchestrate(["gate", "G3", "--exec"], { workspace: ws.root });
    assert.equal(result.code, 1);
    assert.match(result.out, /GATE_BLOCKED/);
    assert.match(result.out, /G1, G2/);
  } finally {
    await ws.cleanup();
  }
});

test("CLI 는 결정적인 게이트에 --exec 를 허용하지 않는다", async () => {
  const ws = await makeProject();
  try {
    const result = orchestrate(["gate", "G9", "--exec"], { workspace: ws.root });
    assert.equal(result.code, 1);
    assert.match(result.out, /GATE_BLOCKED|NOT_AN_AGENT_GATE/);
  } finally {
    await ws.cleanup();
  }
});

test("pack 명령이 게이트마다의 팩 크기를 잰다", async () => {
  // ADR-0012 의 채택 기준을 사람이 눈으로 확인하는 자리다.
  const ws = await makeProject();
  try {
    const result = orchestrate(["pack"], { workspace: ws.root });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /전량 주입 \d+B · 상한 \d+B \(1\/3\)/);
    assert.match(result.out, /G3\s+\d+B\s+\d+%/);
  } finally {
    await ws.cleanup();
  }
});

test("통과하면 요약이 상태에 남아 다음 게이트의 팩으로 간다", async () => {
  const ws = await bed();
  try {
    const result = await runExec("G3", ws.ctx, {
      spawn: async () => childOutput("SUMMARY: 섹션 13개를 썼다"),
      check: async () => ({ ok: true, reasons: [] }),
    });
    assert.equal(result.summary, "섹션 13개를 썼다");
    assert.equal(ws.ctx.state.gates.G3.summary, "섹션 13개를 썼다");
  } finally {
    await ws.cleanup();
  }
});
