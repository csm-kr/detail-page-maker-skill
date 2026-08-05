// gates.history.json — 회차를 가로지르는 유일한 기록.
//
// 완화는 근거를 요구한다 (ADR-0007): 그 게이트가 **3회 연속 통과 + 잡은 결함 0건**.
// 그 판단은 한 회차의 gates.json 만으로는 할 수 없다. 여기에 쌓아야 볼 수 있다.
//
// 완주하지 못한 회차도 남긴다. 재작업량은 완주한 회차가 아니라 막힌 회차에서 나온다.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { makeProject, orchestrate } from "./fixture.mjs";

const HISTORY = path.join("work", "gates.history.json");

async function history(root) {
  return JSON.parse(await readFile(path.join(root, HISTORY), "utf8"));
}

test("report 가 워크스페이스에 회차를 누적한다", async () => {
  const ws = await makeProject();
  try {
    const result = orchestrate(["report"], { workspace: ws.root });
    assert.equal(result.code, 1, "미완 회차이므로 report 자체는 거부한다");

    const log = await history(ws.root);
    assert.equal(log.runs.length, 1);
    assert.equal(log.runs[0].project, path.basename(ws.project));
    assert.equal(log.runs[0].complete, false);
  } finally {
    await ws.cleanup();
  }
});

test("같은 회차를 다시 report 해도 줄이 늘지 않는다", async () => {
  const ws = await makeProject();
  try {
    orchestrate(["report"], { workspace: ws.root });
    orchestrate(["report"], { workspace: ws.root });
    orchestrate(["report"], { workspace: ws.root });

    const log = await history(ws.root);
    assert.equal(log.runs.length, 1, "회차 하나가 세 줄이 되면 3회 연속 통과를 셀 수 없다");
  } finally {
    await ws.cleanup();
  }
});

test("게이트가 --pass 에서 거부한 횟수가 결함으로 남는다", async () => {
  const ws = await makeProject();
  try {
    orchestrate(["gate", "G1", "--start"], { workspace: ws.root });
    // SSOT.md 가 없으므로 두 번 다 거부된다. 그 두 번이 G1 이 잡은 결함이다.
    assert.equal(orchestrate(["gate", "G1", "--pass"], { workspace: ws.root }).code, 1);
    assert.equal(orchestrate(["gate", "G1", "--pass"], { workspace: ws.root }).code, 1);
    orchestrate(["report"], { workspace: ws.root });

    const log = await history(ws.root);
    assert.equal(log.runs[0].gates.G1.rejections, 2);
    assert.equal(log.runs[0].gates.G2.rejections, 0);
  } finally {
    await ws.cleanup();
  }
});

test("히스토리는 게이트별 예산과 소요를 함께 남긴다", async () => {
  // 완화 대상을 고르려면 "예산 대비 얼마나 걸렸나"를 회차 너머로 봐야 한다.
  const ws = await makeProject();
  try {
    orchestrate(["gate", "G1", "--start"], { workspace: ws.root });
    orchestrate(["report"], { workspace: ws.root });

    const log = await history(ws.root);
    const g1 = log.runs[0].gates.G1;
    assert.equal(g1.budget_min, 8);
    assert.equal(typeof g1.elapsed_min, "number");
    assert.equal(log.runs[0].target_min, 95);
  } finally {
    await ws.cleanup();
  }
});

test("다른 회차는 줄을 추가한다", async () => {
  const ws = await makeProject();
  try {
    orchestrate(["report"], { workspace: ws.root });
    const second = orchestrate(
      [
        "start",
        "--name",
        "둘째",
        "--supplier-url",
        "https://domeggook.com/example-2",
        "--coupang-url",
        "https://www.coupang.com/vp/products/example-2",
      ],
      { workspace: ws.root },
    );
    assert.equal(second.code, 0, second.out);
    orchestrate(["report"], { workspace: ws.root });

    const log = await history(ws.root);
    assert.equal(log.runs.length, 2);
    assert.notEqual(log.runs[0].project, log.runs[1].project);
  } finally {
    await ws.cleanup();
  }
});

test("히스토리는 게이트 산출물이 아니다 — 워크스페이스에 있고 프로젝트에는 없다", async () => {
  const ws = await makeProject();
  try {
    orchestrate(["report"], { workspace: ws.root });
    const { exists } = await import("../lib/hashchain.mjs");
    assert.equal(await exists(path.join(ws.root, HISTORY)), true);
    assert.equal(await exists(path.join(ws.project, HISTORY)), false);
  } finally {
    await ws.cleanup();
  }
});
