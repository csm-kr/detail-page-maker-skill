// 트래커 — docs/ARCHITECTURE.md §7
//
// 두 가지가 지켜지는지 본다: 상태를 만들지 않는다, 막지 않는다.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { makeProject } from "./fixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRACK = path.resolve(HERE, "..", "track.mjs");

async function withTracker(workspace, body) {
  const child = spawn(process.execPath, [TRACK], {
    env: { ...process.env, DETAIL_PAGE_WORKSPACE: workspace, DETAIL_PAGE_TRACK_PORT: "9411" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`시작하지 않았다: ${buffer}`)), 10000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.stderr.on("data", (chunk) => {
      buffer += chunk;
    });
    child.on("exit", () => {
      clearTimeout(timer);
      reject(new Error(`죽었다: ${buffer}`));
    });
  });
  try {
    await body(url);
  } finally {
    child.kill();
  }
}

test("상태를 읽어 맵과 게이트를 준다", async () => {
  const p = await makeProject();
  try {
    await withTracker(p.root, async (url) => {
      const state = await fetch(`${url}/state`).then((r) => r.json());
      assert.equal(state.project, "테스트");
      assert.equal(state.target, 95);
      assert.ok(state.budget > 0, "예산 합계가 없다");
      assert.ok(Array.isArray(state.layers) && state.layers.length > 0);

      const g0 = state.gates.find((g) => g.id === "G0");
      const g1 = state.gates.find((g) => g.id === "G1");
      assert.equal(g0.status, "PASSED");
      assert.equal(g1.status, "PENDING");
      assert.equal(g1.actor, "agent");
      assert.equal(g1.skill, "detail-page-g1-fact");

      const page = await fetch(url).then((r) => r.text());
      assert.match(page, /@keyframes pulse/, "진행 중 노드가 맥동하지 않는다");
      assert.match(page, /남은 검사|부족한 것/);
    });
  } finally {
    await p.cleanup();
  }
});

test("클릭 시 검사를 돌려 부족한 것을 준다", async () => {
  const p = await makeProject();
  try {
    await withTracker(p.root, async (url) => {
      const result = await fetch(`${url}/check/G1`).then((r) => r.json());
      assert.equal(result.ok, false);
      assert.ok(result.reasons.length > 0);
      assert.ok(
        result.reasons.some((reason) => reason.includes("SSOT.md")),
        `SSOT.md 부족이 안 보인다: ${result.reasons.join(" / ")}`,
      );
    });
  } finally {
    await p.cleanup();
  }
});

test("gates.json 을 쓰지 않는다", async () => {
  const p = await makeProject();
  const file = path.join(p.project, "work", "gates.json");
  try {
    const before = await readFile(file, "utf8");
    await withTracker(p.root, async (url) => {
      await fetch(`${url}/state`).then((r) => r.json());
      await fetch(`${url}/check/G1`).then((r) => r.json());
      await fetch(`${url}/state`).then((r) => r.json());
    });
    assert.equal(await readFile(file, "utf8"), before, "트래커가 상태를 바꿨다");
  } finally {
    await p.cleanup();
  }
});
