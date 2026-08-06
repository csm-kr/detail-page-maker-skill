// 컨텍스트 팩 — 게이트가 헤드리스 세션에서 무엇을 받는가.
//
// ADR-0012 의 손익분기가 여기 있다. harness 의 `_load_guardrails()` 는 `docs/**/*.md` 를
// 통째로 넣는다. 우리가 그대로 하면 게이트마다 전량을 읽고, 그건 "컨텍스트가 너무 많아서
// 잘 못한다" 를 12번 반복하는 것이다. 그래서 팩 크기를 **유도된 상한**으로 고정한다.

import assert from "node:assert/strict";
import test from "node:test";

import {
  PACK_SHARE,
  buildPack,
  canonBytes,
  packableGates,
} from "../lib/contextpack.mjs";
import { gate } from "../lib/gates.mjs";
import { makeProject } from "./fixture.mjs";

async function bed() {
  const ws = await makeProject();
  const { loadState } = await import("../lib/gates-state.mjs");
  return {
    ...ws,
    ctx: {
      workspace: ws.root,
      project: ws.project,
      state: await loadState(ws.project),
    },
  };
}

test("스크립트 게이트는 팩을 만들지 않는다", async () => {
  // 결정적인 게이트에 세션을 띄우면 시작 비용만 늘고 판단할 것이 없다.
  for (const id of ["G0", "G9", "G10"]) {
    assert.equal(gate(id).actor, "script");
    assert.ok(!packableGates().some((g) => g.id === id), `${id} 가 팩 대상에 들어 있다`);
  }
});

test("판단이 필요한 게이트는 전부 팩 대상이다", async () => {
  // 목록을 손으로 적지 않는다. actor 가 정한다 — 적으면 gates.mjs 와 갈린다.
  const expected = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G11"];
  assert.deepEqual(packableGates().map((g) => g.id), expected);
});

test("팩이 지시서를 본문으로 담는다", async () => {
  const ws = await bed();
  try {
    const pack = await buildPack("G3", ws.ctx);
    // 목록이 아니라 본문이다. "SKILL.md 를 읽어라" 는 읽지 않아도 티가 안 난다.
    assert.match(pack.text, /섹션마다 `role` 을 적는다/);
  } finally {
    await ws.cleanup();
  }
});

test("팩이 정본 문서를 본문으로 담는다", async () => {
  const ws = await bed();
  try {
    const pack = await buildPack("G3", ws.ctx);
    assert.deepEqual(pack.canon.map((doc) => doc.rel), gate("G3").reads);
    // sales-story.md 의 이 문장이 3회차에 지켜지지 않았다. 세션이 읽지 않았기 때문이다.
    assert.match(pack.text, /공급처와 쿠팡이 쓰는 판매 표현/);
  } finally {
    await ws.cleanup();
  }
});

test("입력 산출물은 경로로 준다. 본문을 넣지 않는다", async () => {
  // flow-plan.json 하나가 정본 전체보다 크다. 넣으면 팩이 상한을 넘는다.
  const ws = await bed();
  try {
    const huge = "가".repeat(200_000);
    const { writeFile } = await import("node:fs/promises");
    const path = (await import("node:path")).default;
    await writeFile(path.join(ws.project, "work", "SSOT.md"), huge, "utf8");

    const pack = await buildPack("G3", ws.ctx);
    assert.ok(!pack.text.includes(huge), "입력 본문이 팩에 들어갔다");
    assert.ok(pack.text.includes("work/SSOT.md"), "입력 경로가 팩에 없다");
    assert.deepEqual(pack.inputs.map((i) => i.spec), gate("G3").inputs);
  } finally {
    await ws.cleanup();
  }
});

test("팩이 앞 게이트의 한 줄 요약을 담는다", async () => {
  const ws = await bed();
  try {
    ws.ctx.state.gates.G1 = { status: "PASSED", summary: "실물 사진 3장으로 사실 12건을 잠갔다" };
    const pack = await buildPack("G3", ws.ctx);
    assert.match(pack.text, /G1.*실물 사진 3장으로 사실 12건을 잠갔다/);
  } finally {
    await ws.cleanup();
  }
});

test("팩이 지금 부족한 것을 미리 알려준다", async () => {
  // 무엇으로 판정되는지 모르고 시작하면 다 하고 나서 거부당한다.
  const ws = await bed();
  try {
    const pack = await buildPack("G3", ws.ctx);
    assert.ok(pack.shortfalls.length > 0, "산출물이 없는데 부족한 것이 0건이다");
    assert.match(pack.text, /지금 부족한 것/);
    assert.ok(pack.text.includes(pack.shortfalls[0]));
  } finally {
    await ws.cleanup();
  }
});

test("팩이 우회 금지와 판정 주체를 명시한다", async () => {
  const ws = await bed();
  try {
    const pack = await buildPack("G8", ws.ctx);
    assert.match(pack.text, /--force/);
    assert.match(pack.text, /check\.mjs/);
  } finally {
    await ws.cleanup();
  }
});

test("모든 팩이 정본 전량의 1/3 이하다", async () => {
  // ADR-0012 의 채택 기준. 손으로 고른 상한이 아니라 실측에서 유도한다 —
  // 낮춰 잡은 하한이 면제였던 것처럼, 높게 잡은 상한은 상한이 아니다.
  const ws = await bed();
  try {
    const ceiling = Math.floor((await canonBytes()) * PACK_SHARE);
    const over = [];
    for (const g of packableGates()) {
      const pack = await buildPack(g.id, ws.ctx);
      if (pack.bytes > ceiling) over.push(`${g.id} ${pack.bytes}B > ${ceiling}B`);
    }
    assert.deepEqual(over, []);
  } finally {
    await ws.cleanup();
  }
});

test("팩이 주는 경로를 쉘이 그대로 쓸 수 있다", async () => {
  // 4회차 G1: 팩이 `node C:\a\b\orchestrate.mjs ... --check` 를 bash 블록으로 줬다.
  // Git Bash 에서 백슬래시는 이스케이프다 — 인자가 `C:ab...` 로 뭉개져
  // ENOENT 가 났고, 자식은 그것을 "샌드박스가 node 를 막았다" 로 보고했다.
  // 그래서 검사를 한 번도 못 돌렸다. 오진이 아니라 **팩이 못 쓰는 경로를 준 것**이다.
  const ws = await bed();
  try {
    const pack = await buildPack("G1", ws.ctx);
    const fenced = [...pack.text.matchAll(/```(?:bash)?\n([\s\S]*?)```/g)].map((m) => m[1]);
    assert.ok(fenced.length > 0, "팩에 코드 블록이 없다");
    for (const block of fenced) {
      assert.ok(!/[A-Za-z]:\\/.test(block), `백슬래시 경로가 남아 있다:\n${block}`);
    }
    assert.match(pack.text, /orchestrate\.mjs gate G1 --check/);
  } finally {
    await ws.cleanup();
  }
});

test("팩이 쉘에서 무엇이 거부되는지 알려준다", async () => {
  // 도구 허용은 `Bash(node *)` 다 — `node` 로 **시작하는** 명령만 매치한다.
  // 4회차 자식이 `node ... ; echo "EXIT_CODE=$?"` 를 붙였다가 거부당했다.
  // 실행기가 정한 제약이면 실행기가 말해 줘야 한다.
  const ws = await bed();
  try {
    const pack = await buildPack("G1", ws.ctx);
    assert.match(pack.text, /&&/);
    assert.match(pack.text, /거부/);
  } finally {
    await ws.cleanup();
  }
});

test("읽으라는 정본이 없으면 조용히 넘어가지 않는다", async () => {
  const ws = await bed();
  try {
    const pack = await buildPack("G3", { ...ws.ctx, skillsRoot: ws.root });
    assert.equal(pack.canon.length, 0);
    assert.equal(pack.missing.length, gate("G3").reads.length);
    assert.match(pack.text, /읽을 수 없다/);
  } finally {
    await ws.cleanup();
  }
});
