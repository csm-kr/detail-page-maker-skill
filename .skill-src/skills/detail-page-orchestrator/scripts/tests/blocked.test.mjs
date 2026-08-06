// BLOCKED — 사람이 봐야 끝나는 자리를 실패와 구분한다.
//
// G6 의 컷 선별, init 의 두 로그인처럼 **에이전트가 아무리 잘해도 못 끝내는** 게이트가
// 실제로 있다. 지금까지 그런 게이트는 REJECTED 로 남았고, 표를 보는 사람은
// "검사에 걸렸다" 와 "네가 봐야 한다" 를 구분할 수 없었다.
//
// 헤드리스로 가면 이 구분이 더 필요해진다. 재시도로 풀리는 것과 안 풀리는 것이 다르다.

import assert from "node:assert/strict";
import test from "node:test";

import { BLOCKED, PASSED, SYMBOL, recordBlock, recordStart } from "../lib/gates-state.mjs";
import { makeProject, orchestrate } from "./fixture.mjs";

test("BLOCKED 는 REJECTED 와 다른 상태다", () => {
  assert.equal(BLOCKED, "BLOCKED");
  assert.ok(SYMBOL[BLOCKED], "표에 쓸 기호가 없다");
  assert.notEqual(SYMBOL[BLOCKED], SYMBOL[PASSED]);
});

test("사유 없이 막을 수 없다", async () => {
  // "왜 막혔는지" 가 없으면 사람이 무엇을 해야 하는지 모른다. 그러면 REJECTED 와 같다.
  const state = { gates: { G6: {} } };
  assert.throws(() => recordBlock(state, "G6", ""), /BLOCK_REASON_REQUIRED/);
});

test("막으면 사유와 시각이 남는다", async () => {
  const state = { gates: { G6: {} } };
  recordStart(state, "G6", { host: "claude-code" });
  recordBlock(state, "G6", "컷 30장을 원본 해상도로 봐야 한다");
  assert.equal(state.gates.G6.status, BLOCKED);
  assert.equal(state.gates.G6.blocked.reason, "컷 30장을 원본 해상도로 봐야 한다");
  assert.ok(state.gates.G6.blocked.at);
  // 거부 횟수를 늘리지 않는다. 막힌 것은 그 게이트가 잡은 결함이 아니다.
  assert.equal(state.gates.G6.rejections ?? 0, 0);
});

test("CLI 로 막고, 표에 사유가 보인다", async () => {
  const ws = await makeProject();
  try {
    const blocked = orchestrate(
      ["gate", "G6", "--block", "컷을 원본 해상도로 봐야 한다"],
      { workspace: ws.root },
    );
    assert.equal(blocked.code, 0, blocked.out);

    const table = orchestrate(["gates"], { workspace: ws.root });
    assert.match(table.out, /G6\s+.*BLOCKED/);
    assert.match(table.out, /컷을 원본 해상도로 봐야 한다/);
  } finally {
    await ws.cleanup();
  }
});

test("막힌 게이트는 통과가 아니다 — 하류가 계속 막힌다", async () => {
  const ws = await makeProject();
  try {
    orchestrate(["gate", "G6", "--block", "사람이 봐야 한다"], { workspace: ws.root });
    const downstream = orchestrate(["gate", "G7", "--check"], { workspace: ws.root });
    assert.equal(downstream.code, 1);
    assert.match(downstream.out, /GATE_BLOCKED/);
  } finally {
    await ws.cleanup();
  }
});

test("사유 없는 --block 은 거부한다", async () => {
  const ws = await makeProject();
  try {
    const result = orchestrate(["gate", "G6", "--block"], { workspace: ws.root });
    assert.equal(result.code, 1);
    assert.match(result.out, /USAGE|BLOCK_REASON_REQUIRED/);
  } finally {
    await ws.cleanup();
  }
});

test("막힌 자리를 다시 돌리면 상태가 풀린다", async () => {
  // 사람이 보고 나면 다시 진행한다. 막힌 것은 영구 표시가 아니다.
  const ws = await makeProject();
  try {
    orchestrate(["gate", "G6", "--block", "사람이 봐야 한다"], { workspace: ws.root });
    const restarted = orchestrate(["gate", "G6", "--start"], { workspace: ws.root });
    assert.equal(restarted.code, 0, restarted.out);
    const table = orchestrate(["gates"], { workspace: ws.root });
    assert.ok(!/G6\s+.*BLOCKED/.test(table.out), "다시 시작했는데 아직 막혀 있다");
  } finally {
    await ws.cleanup();
  }
});
