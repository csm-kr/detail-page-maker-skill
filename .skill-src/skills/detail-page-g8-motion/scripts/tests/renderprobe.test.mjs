// 렌더 경로 프로브 — 굽기 전에 "이 경로가 예산 안에 도는가" 를 실측한다.
//
// 3회차에 hyperframes CLI 가 240초에 타임아웃했다. 그래서 Chrome 스크린샷으로
// 갈아탔고 **그 우회가 굳었다.** 의존성은 계속 벤더링돼 있었고 문서는 계속
// hyperframes 를 가리켰다. 아무도 다시 재지 않았기 때문이다.
//
// 재는 것을 게이트로 만든다. 죽은 경로는 죽었다고 적히고, 느린 경로는 느리다고 적힌다.

import assert from "node:assert/strict";
import test from "node:test";

import {
  PROBE_MAX_AGE_H,
  RENDER_BUDGET_MS,
  probeFaults,
  probeLine,
  probeVerdict,
} from "../lib/renderprobe.mjs";

const HOUR = 3600 * 1000;
const NOW = Date.parse("2026-08-06T12:00:00.000Z");

function probe(paths, { agoH = 0 } = {}) {
  return {
    at: new Date(NOW - agoH * HOUR).toISOString(),
    budget_ms: RENDER_BUDGET_MS,
    paths,
  };
}

test("예산은 3회차에 타임아웃한 값 그대로다", () => {
  // 값을 늘려 통과시키지 않는다. 240초를 넘는 렌더는 10개 GIF 에 40분이다.
  assert.equal(RENDER_BUDGET_MS, 240_000);
});

test("예산 안에 끝나면 살아 있다", () => {
  const verdict = probeVerdict({ ok: true, elapsedMs: 7_300 });
  assert.equal(verdict.status, "alive");
  assert.match(verdict.line, /7\.3초/);
});

test("끝나긴 했는데 예산을 넘으면 느리다고 적는다", () => {
  // 조용히 통과시키지 않는다. 3회차가 정확히 이 자리에서 우회로 갔다.
  const verdict = probeVerdict({ ok: true, elapsedMs: RENDER_BUDGET_MS + 1 });
  assert.equal(verdict.status, "slow");
  assert.match(verdict.line, /240초/);
});

test("실패하면 죽었다고 적고 이유를 남긴다", () => {
  const verdict = probeVerdict({ ok: false, elapsedMs: 1_200, error: "TIMEOUT 240000ms" });
  assert.equal(verdict.status, "dead");
  assert.match(verdict.line, /TIMEOUT 240000ms/);
});

test("프로브가 없으면 사유가 된다", () => {
  const faults = probeFaults(null, NOW);
  assert.equal(faults.length, 1);
  assert.match(faults[0], /run\.mjs --probe/);
});

test("하루 지난 프로브는 근거가 아니다", () => {
  const stale = probe([{ name: "chrome", ok: true, elapsed_ms: 4_000 }], {
    agoH: PROBE_MAX_AGE_H + 1,
  });
  const faults = probeFaults(stale, NOW);
  assert.equal(faults.length, 1);
  assert.match(faults[0], /오래됐다/);
});

test("살아 있는 경로가 하나도 없으면 굽지 못한다", () => {
  const dead = probe([
    { name: "hyperframes", ok: false, elapsed_ms: 240_000, error: "TIMEOUT" },
    { name: "chrome", ok: false, elapsed_ms: 300, error: "CHROME_NOT_FOUND" },
  ]);
  const faults = probeFaults(dead, NOW);
  assert.equal(faults.length, 1);
  assert.match(faults[0], /살아 있는 렌더 경로가 없다/);
  assert.match(faults[0], /TIMEOUT/);
});

test("한 경로가 죽어도 다른 경로가 살아 있으면 통과한다", () => {
  // 우회 자체가 잘못은 아니다. **우회했다는 사실이 안 적히는 것**이 잘못이다.
  const mixed = probe([
    { name: "hyperframes", ok: false, elapsed_ms: 240_000, error: "TIMEOUT" },
    { name: "chrome", ok: true, elapsed_ms: 4_100 },
  ]);
  assert.deepEqual(probeFaults(mixed, NOW), []);
});

test("한 줄로 전달한다 — 컨텍스트 팩과 체크리스트가 같은 줄을 쓴다", () => {
  const mixed = probe([
    { name: "hyperframes", ok: false, elapsed_ms: 240_000, error: "TIMEOUT" },
    { name: "chrome", ok: true, elapsed_ms: 4_100 },
  ]);
  const line = probeLine(mixed, NOW);
  assert.match(line, /hyperframes/);
  assert.match(line, /chrome/);
  assert.match(line, /4\.1초/);
  assert.equal(line.split("\n").length, 1, "한 줄이 아니다");
  assert.match(probeLine(null, NOW), /재지 않았다/);
});
