// GIF 는 **얼마나 오래 보이는가**가 내용의 일부다.
//
// 3회차에 구운 GIF 5개의 실측:
//
//   gif-01·02·03  12프레임 · 2.00초 · 프레임마다 0.167초 · 마지막에 머무름 없음
//   gif-04·05      3프레임 · 0.48초 · 프레임마다 0.16초
//
// 3장짜리 장면 전환이 0.48초에 끝난다. 읽기 전에 다시 시작한다.
// 옛 `references/motion.md` 는 이것을 이미 규칙으로 갖고 있었다 —
// MR-006 "결과 상태를 최소 1초 유지한다", MR-018 "첫 프레임 단독 1초 이해".
// 12게이트 재작성에서 그 규칙이 사라졌고, 속도를 재는 검사도 없었다.

import assert from "node:assert/strict";
import test from "node:test";

import { concatScript, framePacing, TWEEN_MS } from "../lib/gifasm.mjs";
import { readGifTiming } from "../lib/gifmeta.mjs";
import { PACING, pacingFaults } from "../lib/pacing.mjs";
import { fakeGif } from "./gif-fixture.mjs";

// ── 구운 GIF 를 열어 잰다 ──────────────────────────────────────────────────

test("프레임마다의 지연을 읽는다", () => {
  const timing = readGifTiming(fakeGif([80, 12, 12, 100]));
  assert.deepEqual(timing.delaysMs, [800, 120, 120, 1000]);
  assert.equal(timing.frames, 4);
  assert.equal(timing.totalMs, 2040);
});

test("첫 프레임과 마지막 프레임의 머무는 시간을 따로 준다", () => {
  const timing = readGifTiming(fakeGif([80, 12, 100]));
  assert.equal(timing.firstMs, 800);
  assert.equal(timing.lastMs, 1000);
});

test("주석·응용 확장이 섞여 있어도 프레임만 센다", () => {
  const gif = fakeGif([50, 50]);
  // NETSCAPE 반복 확장을 앞에 끼워 넣는다. 실제 GIF 에는 거의 항상 있다.
  const loop = Buffer.from([
    0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0", "ascii"), 0x03, 0x01, 0x00, 0x00, 0x00,
  ]);
  const spliced = Buffer.concat([gif.subarray(0, 19), loop, gif.subarray(19)]);
  assert.equal(readGifTiming(spliced).frames, 2);
});

test("GIF 가 아니면 거부한다", () => {
  assert.throws(() => readGifTiming(Buffer.from("PNG\r\n")), /NOT_A_GIF/);
});

// ── 하한 ──────────────────────────────────────────────────────────────────

test("3회차 GIF 는 전부 하한에 걸린다", () => {
  // 실제로 구운 것: 3프레임 · 0.16초씩.
  const faults = pacingFaults(readGifTiming(fakeGif([16, 16, 16])));
  assert.ok(faults.length >= 3, `걸린 항목이 ${faults.length}개다: ${faults.join(" · ")}`);
  assert.match(faults.join("\n"), /첫 프레임/);
  assert.match(faults.join("\n"), /마지막 프레임/);
  assert.match(faults.join("\n"), /한 바퀴/);
});

test("12프레임 2초짜리도 걸린다 — 프레임 수가 아니라 머무는 시간이다", () => {
  const faults = pacingFaults(readGifTiming(fakeGif(Array(12).fill(17))));
  assert.ok(faults.length > 0, "2.04초에 끝나고 머무름이 없는 GIF 를 통과시켰다");
});

test("너무 길어도 걸린다", () => {
  const faults = pacingFaults(readGifTiming(fakeGif([300, 300, 300, 300, 300])));
  assert.match(faults.join("\n"), /너무 길다/);
});

test("장면이 바뀌는 GIF 는 장면마다 읽을 시간을 요구한다", () => {
  // tibo-sequence 는 프레임 하나가 장면 하나다. 보간 프레임과 같은 잣대로 재지 않는다.
  const quick = readGifTiming(fakeGif([80, 20, 20, 20, 20, 100]));
  assert.deepEqual(pacingFaults(quick), [], "보간 GIF 로는 통과해야 한다");
  assert.match(pacingFaults(quick, { scenes: true }).join("\n"), /장면/);
});

// ── 우리가 굽는 쪽 ────────────────────────────────────────────────────────

test("조립기가 만드는 지연은 하한을 통과한다", () => {
  for (const [count, scenes] of [[2, false], [12, false], [24, false], [2, true], [6, true], [12, true]]) {
    {
      const ms = framePacing(count, { scenes });
      const timing = { frames: count, delaysMs: ms, totalMs: ms.reduce((a, b) => a + b, 0),
        firstMs: ms[0], lastMs: ms[count - 1] };
      assert.deepEqual(
        pacingFaults(timing, { scenes }),
        [],
        `${count}프레임 · scenes=${scenes} 에서 자기 하한에 걸린다`,
      );
    }
  }
});

test("보간 프레임은 촘촘하고 양 끝만 머문다", () => {
  const ms = framePacing(12);
  assert.ok(ms[0] >= PACING.firstHoldMs);
  assert.ok(ms[11] >= PACING.lastHoldMs);
  assert.equal(ms[5], TWEEN_MS);
});

test("프레임이 1장이면 GIF 를 만들지 않는다", () => {
  assert.throws(() => framePacing(1), /TOO_FEW_FRAMES/);
});

test("상한 안에 들어갈 수 없는 프레임 수는 조립 전에 거부한다", () => {
  // 장면 24개 × 0.9초 = 21.6초. 상한 12초 안에 못 들어간다.
  // 조용히 빨리 돌려서 맞추지 않는다 — 기획이 장면 수를 줄여야 한다.
  assert.throws(() => framePacing(24, { scenes: true }), /TOO_MANY_FRAMES/);
  assert.throws(() => framePacing(120), /TOO_MANY_FRAMES/);
});

test("concat 스크립트가 프레임마다 지속 시간을 준다", () => {
  const script = concatScript([
    { path: "/p/f0.png", ms: 800 },
    { path: "/p/f1.png", ms: 120 },
    { path: "/p/f2.png", ms: 1000 },
  ]);
  assert.match(script, /file '\/p\/f0\.png'\nduration 0\.800/);
  assert.match(script, /file '\/p\/f1\.png'\nduration 0\.120/);
  // 마지막 파일은 한 번 더 적어야 그 지속 시간이 적용된다 (ffmpeg concat demuxer 규칙).
  assert.ok(script.trimEnd().endsWith("file '/p/f2.png'"));
  assert.equal((script.match(/\/p\/f2\.png/g) ?? []).length, 2);
});

test("경로의 작은따옴표를 이스케이프한다", () => {
  assert.match(concatScript([{ path: "/p/it's.png", ms: 100 }]), /it'\\''s\.png/);
});
