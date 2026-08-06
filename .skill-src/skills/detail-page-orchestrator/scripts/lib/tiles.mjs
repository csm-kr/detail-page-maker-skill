// 긴 캡처를 세션이 읽을 수 있는 조각으로 자른다.
//
// 4회차 G1 이 800×16820 상세 원본을 받고도 13%만 읽었다. 세션이 이미지를 열면
// 축소본이 되고, 축소본에서는 문자가 사라진다. **받은 것과 읽은 것은 다른 일이다.**
//
// 새 의존성을 들이지 않는다 — 크기는 PNG 헤더에서 직접 읽고, 자르는 것은 이미
// 필수 런타임인 ffmpeg 이 한다.

import { spawn } from "node:child_process";
import { mkdir, open, readdir } from "node:fs/promises";
import path from "node:path";

import { hashFile } from "./hashchain.mjs";

/** 이 높이까지는 세션이 문자를 읽는다. 넘으면 자른다. */
export const TILE_MAX_H = 1600;

/** 경계에 걸친 글줄이 양쪽에서 잘리지 않도록 겹치는 폭. */
export const TILE_OVERLAP = 100;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG 의 IHDR 은 언제나 같은 자리다. 아니면 null — 크기를 만들어내지 않는다. */
export function pngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * 세로로 덮는 계획. 상한 이하면 빈 배열이다 — 자를 이유가 없다.
 * 마지막 조각은 끝에 맞춰 위로 당긴다. 그래야 꼬리가 잘리지 않는다.
 */
export function tilePlan(height, max = TILE_MAX_H, overlap = TILE_OVERLAP) {
  if (height <= max) return [];
  const step = max - overlap;
  const tiles = [];
  for (let y = 0; y < height; y += step) {
    const start = Math.min(y, height - max);
    tiles.push({ index: tiles.length + 1, y: start, h: Math.min(max, height - start) });
    if (start + max >= height) break;
  }
  return tiles;
}

/** ffmpeg 인자. 자르는 것 말고는 아무것도 하지 않는다. */
export function cropArgs({ src, width, tile, dest }) {
  return ["-v", "error", "-y", "-i", src, "-vf", `crop=${width}:${tile.h}:0:${tile.y}`, dest];
}

/** 조각이 놓이는 자리. 원본 옆 `tiles/` 다 — 어느 원본에서 나왔는지 이름에 남는다. */
export function tilePath(src, tile) {
  const dir = path.join(path.dirname(src), "tiles");
  const base = path.basename(src, path.extname(src));
  return path.join(dir, `${base}-${String(tile.index).padStart(2, "0")}.png`);
}

/** 헤더 24바이트만 연다. 8.9MB 를 통째로 읽을 이유가 없다. */
async function headSize(file) {
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return null;
  try {
    const buf = Buffer.alloc(24);
    const { bytesRead } = await handle.read(buf, 0, 24, 0);
    return pngSize(buf.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => reject(new Error(`TILE_FFMPEG ${error.message}`)));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`TILE_FFMPEG exit ${code}\n${stderr.slice(0, 500)}`)),
    );
  });
}

/**
 * 번들 안의 긴 PNG 를 전부 자른다. 짧은 것은 건드리지 않는다 —
 * 기준작처럼 추출기가 이미 쪼개 주는 번들에서는 아무 일도 일어나지 않는다.
 */
export async function tileBundle({ dir, run = ffmpeg, onLine = () => {} }) {
  const report = [];
  const seen = new Set(); // dmk 번들은 상세 원본을 두 자리에 똑같이 담는다
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "tiles") await walk(full);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".png")) continue;
      const size = await headSize(full);
      if (!size) continue;
      const tiles = tilePlan(size.height);
      if (tiles.length === 0) continue;

      const digest = await hashFile(full);
      if (seen.has(digest)) continue;
      seen.add(digest);

      await mkdir(path.join(path.dirname(full), "tiles"), { recursive: true });
      for (const tile of tiles) {
        await run(cropArgs({ src: full, width: size.width, tile, dest: tilePath(full, tile) }));
      }
      onLine(`  조각    ${path.basename(full)} ${size.width}×${size.height} → ${tiles.length}장`);
      report.push({ src: full, height: size.height, tiles: tiles.length });
    }
  };
  await walk(dir);
  return report;
}
