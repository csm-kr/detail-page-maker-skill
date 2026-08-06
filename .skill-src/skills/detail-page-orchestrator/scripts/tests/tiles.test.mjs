// 긴 상세 원본을 세션이 **원본 해상도로** 읽을 수 있게 자른다.
//
// 4회차 G1: 도매꾹 상세는 800×16820 한 장이었다. 세션이 열면 95×2000 축소본이 되어
// 문자를 하나도 못 읽었고, 하네스 프레임 두 구간(약 13%)만 판독됐다. 그래서 규격·구성·
// 소재·안전 문구가 전부 `unknowns` 로 남았다. **자료는 받아 놨는데 읽을 수가 없었다.**
//
// 기준작(쿠팡)은 이 문제가 없다 — 추출기가 780×1080 단위로 이미 쪼갠다.
// 문제는 "한 장으로 오는 공급처" 쪽이고, 그건 수집 단계가 메울 자리다.

import assert from "node:assert/strict";
import test from "node:test";

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  TILE_MAX_H,
  TILE_OVERLAP,
  cropArgs,
  pngSize,
  tileBundle,
  tilePlan,
} from "../lib/tiles.mjs";

/** 헤더만 있는 PNG. tilePlan 은 IHDR 만 본다 — 픽셀을 만들 이유가 없다. */
async function fakePng(file, width, height) {
  await mkdir(path.dirname(file), { recursive: true });
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  await writeFile(file, buf);
}

test("짧은 이미지는 자르지 않는다", () => {
  // 780×1080 은 그대로 읽힌다. 자르면 파일만 늘고 판독은 나아지지 않는다.
  assert.deepEqual(tilePlan(1080), []);
  assert.deepEqual(tilePlan(TILE_MAX_H), []);
});

test("긴 이미지를 상한 이하 조각으로 덮는다", () => {
  const tiles = tilePlan(16820);
  assert.ok(tiles.length > 1);
  for (const tile of tiles) assert.ok(tile.h <= TILE_MAX_H, `${tile.h} > ${TILE_MAX_H}`);
  assert.equal(tiles[0].y, 0, "첫 조각이 0 에서 시작하지 않는다");
  const last = tiles.at(-1);
  assert.equal(last.y + last.h, 16820, "마지막까지 덮지 못했다");
});

test("조각이 겹친다 — 경계에 걸린 글줄이 양쪽에서 잘리지 않게", () => {
  const tiles = tilePlan(16820);
  for (let i = 1; i < tiles.length; i += 1) {
    const prevEnd = tiles[i - 1].y + tiles[i - 1].h;
    assert.ok(
      prevEnd - tiles[i].y >= TILE_OVERLAP,
      `${i}번 조각이 앞과 ${prevEnd - tiles[i].y}px 만 겹친다`,
    );
  }
});

test("조각 번호가 1부터 순서대로다", () => {
  const tiles = tilePlan(5000);
  assert.deepEqual(tiles.map((t) => t.index), tiles.map((_, i) => i + 1));
});

test("PNG 헤더에서 크기를 읽는다", () => {
  // IHDR 은 항상 같은 자리다. 이미지 라이브러리를 새로 들이지 않는다.
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(800, 16);
  buf.writeUInt32BE(16820, 20);
  assert.deepEqual(pngSize(buf), { width: 800, height: 16820 });
});

test("PNG 가 아니면 크기를 만들어내지 않는다", () => {
  assert.equal(pngSize(Buffer.from("이건 PNG 가 아니다")), null);
});

test("번들에서 긴 것만 자른다", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tiles-"));
  try {
    await fakePng(path.join(dir, "detail", "detail-page.png"), 800, 16820);
    await fakePng(path.join(dir, "detail", "assets", "detail-05.png"), 780, 1080);
    await fakePng(path.join(dir, "thumbnail", "thumbnail.png"), 760, 760);

    const calls = [];
    const report = await tileBundle({ dir, run: (args) => calls.push(args) });

    assert.equal(report.length, 1, "긴 것 하나만 잘라야 한다");
    assert.match(report[0].src, /detail-page\.png$/);
    assert.equal(report[0].tiles, calls.length);
    assert.ok(calls.every((args) => args.some((a) => String(a).startsWith("crop=800:"))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("같은 이미지를 두 번 자르지 않는다", async () => {
  // dmk 번들은 상세 원본을 `detail/detail-page.png` 와 `detail/assets/detail-01.png` 로
  // **두 번** 담는다(해시 동일). 그대로 자르면 세션이 읽을 이미지가 두 배가 된다.
  const dir = await mkdtemp(path.join(os.tmpdir(), "tiles-"));
  try {
    await fakePng(path.join(dir, "detail", "detail-page.png"), 800, 16820);
    await fakePng(path.join(dir, "detail", "assets", "detail-01.png"), 800, 16820);

    const report = await tileBundle({ dir, run: () => {} });
    assert.equal(report.length, 1, `${report.length}장을 잘랐다`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PNG 가 아닌 파일에서 멈추지 않는다", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tiles-"));
  try {
    await mkdir(path.join(dir, "detail"), { recursive: true });
    await writeFile(path.join(dir, "detail", "manifest.json"), "{}", "utf8");
    await writeFile(path.join(dir, "detail", "broken.png"), "PNG 가 아니다", "utf8");
    assert.deepEqual(await tileBundle({ dir, run: () => {} }), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ffmpeg 인자가 조각의 위치를 그대로 자른다", () => {
  const args = cropArgs({
    src: "/b/detail-page.png",
    width: 800,
    tile: { index: 3, y: 3000, h: 1600 },
    dest: "/b/tiles/detail-page-03.png",
  });
  assert.ok(args.includes("crop=800:1600:0:3000"), args.join(" "));
  assert.ok(args.includes("-y"), "덮어쓰기가 없으면 재수집에서 멈춘다");
  assert.equal(args.at(-1), "/b/tiles/detail-page-03.png");
});
