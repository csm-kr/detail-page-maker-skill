import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const run = promisify(execFile);
const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../motion/extract-locator-guides.mjs",
);

function ppm(width, height, markers = []) {
  const pixels = Buffer.alloc(width * height * 3, 255);
  for (const { left, top, size } of markers) {
    for (let y = top; y < top + size; y += 1) {
      for (let x = left; x < left + size; x += 1) {
        const offset = (y * width + x) * 3;
        pixels[offset] = 255;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 255;
      }
    }
  }
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), pixels]);
}

test("God Tibo 고대비 점을 정규화 좌표와 780 canvas 좌표로 추출한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "locator-guide-"));
  try {
    await writeFile(path.join(root, "clean.ppm"), ppm(100, 80));
    await writeFile(path.join(root, "guide.ppm"), ppm(100, 80, [
      { left: 10, top: 20, size: 5 },
      { left: 80, top: 60, size: 5 },
    ]));
    await writeFile(path.join(root, "spec.json"), JSON.stringify({
      schema_version: "1.0",
      canvas: { width: 780, height: 780 },
      guides: [{
        id: "action-direction",
        source: "clean.ppm",
        path: "guide.ppm",
        expected: 2,
        group: "points",
        roles: ["physical-action-origin", "physical-interaction-target"],
      }],
    }));

    const output = path.join(root, "anchors.json");
    await run(process.execPath, [SCRIPT, "--spec", path.join(root, "spec.json"), "--output", output]);
    const result = JSON.parse(await readFile(output, "utf8"));
    const record = result.guides["action-direction"];

    assert.equal(record.detected_marker_count, 2);
    assert.equal(record.clean_source_asset.size.width, 100);
    assert.equal(record.guide_asset.size.height, 80);
    assert.equal(record.points[0].semantic_role, "physical-action-origin");
    assert.equal(record.points[0].x, 12);
    assert.equal(record.points[0].y, 22);
    assert.equal(record.points[0].normalized.x, 0.12);
    assert.equal(record.points[0].canvas.x, 93.6);
    assert.equal(record.points[1].semantic_role, "physical-interaction-target");
    assert.match(record.guide_asset.sha256, /^[a-f0-9]{64}$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
