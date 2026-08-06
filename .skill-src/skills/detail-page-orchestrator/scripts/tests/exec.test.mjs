// 헤드리스 실행기 — harness-framework 의 `execute.py` 에 해당한다.
//
// 가져오는 것은 실행 모델이고, **자식의 자기 보고를 믿는 부분은 가져오지 않는다.**
// harness 는 자식이 index.json 에 "completed" 를 쓰면 그게 통과다. 우리는 부모가
// check.mjs 를 다시 돌린다. 헤드리스로 가면 사람이 안 보므로 오히려 더 중요하다.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  EXEC_TIMEOUT_MS,
  MAX_ATTEMPTS,
  execArgs,
  execSummary,
  logPath,
  runExec,
} from "../lib/exec.mjs";
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
  const args = execArgs();
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
