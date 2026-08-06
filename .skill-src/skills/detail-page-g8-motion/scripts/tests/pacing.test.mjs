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

import { concatScript, ffmpegArgs, frameFiles, framePacing, GRID_MS, TWEEN_MS } from "../lib/gifasm.mjs";
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
});

test("마지막 파일을 한 번 더 적지 않는다 — 그것이 40ms 짜리 진짜 프레임이 됐다", () => {
  // 5회차 실측. 마지막 파일을 다시 적으면 그 지속 시간이 적용되기는 한다.
  // 그런데 **다시 적은 줄 자체가 프레임이 된다** — 12장을 구웠는데 13장이 나왔고
  // 13번째가 40ms 였다. 게이트가 GIF 를 열어 그것을 잡았다 (MR-006).
  //   요청 [900,900,1000] → 파일 [920,880,1000,40]
  // 마지막 머무름은 gif 먹서의 --final_delay 가 준다.
  const script = concatScript([{ path: "/p/f0.png", ms: 900 }, { path: "/p/f1.png", ms: 1000 }]);
  assert.equal((script.match(/\/p\/f1\.png/g) ?? []).length, 1, "마지막 파일이 두 번 적혀 있다");
});

test("마지막 머무름을 gif 먹서에 센티초로 준다", () => {
  const args = ffmpegArgs({ concatPath: "/p/list.txt", outputPath: "/p/out.gif", finalDelayMs: 1000 });
  const at = args.indexOf("-final_delay");
  assert.ok(at >= 0, "--final_delay 가 없으면 마지막 프레임이 기본값 40ms 로 나간다");
  assert.equal(args[at + 1], "100");
});

// ── 용량 ──────────────────────────────────────────────────────────────────
//
// 5회차에 미디어 총량이 12.6MB 로 상한 12MB 를 넘었고 그중 84%가 GIF 였다.
// 왜 컸는지를 실측했다 (같은 프레임, 조립만 바꿔 다시 구움 · 합계 5개 GIF):
//
//   base  c256 · bayer_scale=3      5734KB
//   c256 · bayer_scale=5            5124KB   -10.6%
//   c192 · bayer_scale=5            ~4800KB  -16%     ← 눈으로 base 와 구분되지 않는다
//   c160 · bayer_scale=5            4400KB            그라데이션에 띠가 보인다
//   c128 · sierra2_4a               4600KB            잎 가장자리에 색점이 생긴다
//   paletteuse=diff_mode=rectangle  5734KB    0%      ← 한 바이트도 줄지 않는다
//
// 마지막 줄이 중요하다. 화면 전체가 움직이는 GIF 라 "변한 사각형" 이 프레임 전체다.
// 그럴듯해 보인다는 이유로 다시 붙이지 않게 여기에 적어 둔다.

test("팔레트 색 수를 명시한다 — 기본값 256색이 5회차의 12.6MB 였다", () => {
  const chain = ffmpegArgs({ concatPath: "/p/list.txt", outputPath: "/p/out.gif" }).join(" ");
  const colors = /max_colors=(\d+)/.exec(chain);
  assert.ok(colors, "palettegen 에 max_colors 가 없으면 256색으로 굽는다");
  assert.ok(
    Number(colors[1]) <= 192,
    `max_colors=${colors[1]} 다. 실측에서 192색을 넘으면 예산 안에 못 들어간다`,
  );
});

test("디더 격자가 성기다 — 촘촘한 패턴 자체가 파일을 키운다", () => {
  // bayer 디더는 평평한 면에 격자 무늬를 새긴다. 그 무늬가 LZW 가 이어 붙일 것을
  // 끊어서 파일이 10% 커진다. 성긴 격자(5)는 무늬가 안 보이고 더 작다.
  const chain = ffmpegArgs({ concatPath: "/p/list.txt", outputPath: "/p/out.gif" }).join(" ");
  const scale = /bayer_scale=(\d+)/.exec(chain);
  assert.ok(scale, "bayer_scale 을 주지 않으면 기본값 2 — 무늬가 가장 촘촘하다");
  assert.ok(Number(scale[1]) >= 5, `bayer_scale=${scale[1]} 이다. 실측에서 5 가 가장 작았다`);
});

test("지연은 조립기가 실제로 올려놓을 수 있는 격자 위에 있다", () => {
  // concat demuxer 는 프레임을 40ms(25fps) 격자에 올린다 — 실측이다.
  // 900ms 를 요청하면 920·880 이 번갈아 나오고 880 은 장면 하한(900ms)을 깬다.
  // 그래서 조립기가 **미리 올림한다.** 올림이므로 어떤 하한도 깨지 않는다.
  for (const [count, scenes] of [[12, false], [3, true], [4, true], [6, true]]) {
    for (const ms of framePacing(count, { scenes })) {
      assert.equal(ms % GRID_MS, 0, `${ms}ms 는 ${GRID_MS}ms 격자 밖이다`);
    }
  }
});

test("경로의 작은따옴표를 이스케이프한다", () => {
  assert.match(concatScript([{ path: "/p/it's.png", ms: 100 }]), /it'\\''s\.png/);
});

// ── 무엇이 프레임인가 ─────────────────────────────────────────────────────
//
// 렌더러는 프레임 옆에 자기 부산물을 같이 남긴다. "이미지면 프레임" 으로 세면
// 12장을 요청하고 14장을 받고, 이름순 정렬이면 contact-sheet 가 **첫 프레임**이 된다.

test("hyperframes 가 곁에 남긴 contact-sheet 는 프레임이 아니다", () => {
  // 5회차 실측: snapshot --at 으로 12장을 요청했더니 디렉터리에 14개가 있었다.
  assert.deepEqual(
    frameFiles([
      "contact-sheet-1.jpg",
      "contact-sheet-2.jpg",
      "frame-01-at-0.109s.png",
      "frame-00-at-0s.png",
    ]),
    ["frame-00-at-0s.png", "frame-01-at-0.109s.png"],
  );
});

test("god-tibo 가 남긴 원본과 manifest 도 프레임이 아니다", () => {
  // 프레임이 실패하면 `raw-000.png` 가 그대로 남는다. 그것이 GIF 에 들어가면 안 된다.
  assert.deepEqual(
    frameFiles(["manifest.json", "raw-000.png", "frame-001.png", "frame-000.png", "tibo-job.json"]),
    ["frame-000.png", "frame-001.png"],
  );
});
