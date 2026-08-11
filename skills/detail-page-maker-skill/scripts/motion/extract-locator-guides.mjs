#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
  process.stderr.write(`extract-locator-guides: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) fail(`unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`missing value for ${key}`);
    values[key.slice(2)] = value;
    index += 1;
  }
  if (!values.spec) fail("--spec is required");
  if (!values.output) fail("--output is required");
  return values;
}

function asPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) fail(`${name} must be a positive integer`);
  return value;
}

function rounded(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveFrom(base, locator, name) {
  if (typeof locator !== "string" || locator.trim() === "") {
    fail(`${name} must be a non-empty path`);
  }
  return path.resolve(base, locator);
}

function readImageSize(file, ffprobe) {
  let parsed;
  try {
    parsed = JSON.parse(execFileSync(
      ffprobe,
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "json",
        file,
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    ));
  } catch (error) {
    fail(`ffprobe failed for ${file}: ${error.message}`);
  }
  const stream = parsed?.streams?.[0];
  return {
    width: asPositiveInteger(stream?.width, `${file} width`),
    height: asPositiveInteger(stream?.height, `${file} height`),
  };
}

function readRgb(file, expectedBytes, ffmpeg) {
  let bytes;
  try {
    bytes = execFileSync(
      ffmpeg,
      [
        "-v", "error",
        "-i", file,
        "-frames:v", "1",
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        "pipe:1",
      ],
      { encoding: "buffer", maxBuffer: Math.max(expectedBytes + 1024, 256 * 1024 * 1024) },
    );
  } catch (error) {
    fail(`ffmpeg failed for ${file}: ${error.message}`);
  }
  if (bytes.length !== expectedBytes) {
    fail(`${file} decoded to ${bytes.length} bytes; expected ${expectedBytes}`);
  }
  return bytes;
}

function markerPixel(r, g, b, thresholds) {
  return (
    r >= thresholds.r_min &&
    g <= thresholds.g_max &&
    b >= thresholds.b_min &&
    r - g >= thresholds.rg_gap_min &&
    b - g >= thresholds.bg_gap_min
  );
}

function detectComponents(data, width, height, options) {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 3;
    if (markerPixel(data[offset], data[offset + 1], data[offset + 2], options)) {
      mask[index] = 1;
    }
  }

  const seen = new Uint8Array(mask.length);
  const components = [];
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];

  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || seen[seed]) continue;
    const queue = [seed];
    seen[seed] = 1;
    let cursor = 0;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (cursor < queue.length) {
      const current = queue[cursor++];
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const [dx, dy] of neighbors) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const fill = count / (boxWidth * boxHeight);
    const aspect = Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight);
    if (
      count >= options.min_component_pixels &&
      count <= options.max_component_pixels &&
      boxWidth <= options.max_component_side &&
      boxHeight <= options.max_component_side &&
      fill >= options.min_fill_ratio &&
      aspect >= options.min_aspect_ratio
    ) {
      components.push({
        x: rounded(sumX / count, 3),
        y: rounded(sumY / count, 3),
        pixels: count,
        bounds: { minX, minY, maxX, maxY, width: boxWidth, height: boxHeight },
      });
    }
  }
  return components;
}

function sortPoints(points, order) {
  const sorted = [...points];
  if (order === "y_then_x") return sorted.sort((a, b) => a.y - b.y || a.x - b.x);
  if (order !== undefined && order !== "x_then_y") fail(`unsupported sort: ${order}`);
  return sorted.sort((a, b) => a.x - b.x || a.y - b.y);
}

function withCoordinates(point, width, height, canvas, role) {
  return {
    ...(role ? { semantic_role: role } : {}),
    ...point,
    normalized: {
      x: rounded(point.x / width),
      y: rounded(point.y / height),
    },
    canvas: {
      x: rounded((point.x / width) * canvas.width, 2),
      y: rounded((point.y / height) * canvas.height, 2),
    },
  };
}

function boxFromPoints(points, width, height, canvas) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    normalized: {
      left: rounded(minX / width),
      top: rounded(minY / height),
      right: rounded(maxX / width),
      bottom: rounded(maxY / height),
      width: rounded((maxX - minX) / width),
      height: rounded((maxY - minY) / height),
    },
    canvas: {
      left: rounded((minX / width) * canvas.width, 2),
      top: rounded((minY / height) * canvas.height, 2),
      right: rounded((maxX / width) * canvas.width, 2),
      bottom: rounded((maxY / height) * canvas.height, 2),
      width: rounded(((maxX - minX) / width) * canvas.width, 2),
      height: rounded(((maxY - minY) / height) * canvas.height, 2),
    },
  };
}

const args = parseArgs(process.argv.slice(2));
const specPath = path.resolve(args.spec);
const outputPath = path.resolve(args.output);
const specRoot = path.dirname(specPath);
let spec;
try {
  spec = JSON.parse(readFileSync(specPath, "utf8"));
} catch (error) {
  fail(`cannot read spec: ${error.message}`);
}

if (spec?.schema_version !== "1.0" || !Array.isArray(spec?.guides) || spec.guides.length === 0) {
  fail("spec must have schema_version 1.0 and a non-empty guides array");
}

const canvas = {
  width: asPositiveInteger(spec?.canvas?.width ?? 780, "canvas.width"),
  height: asPositiveInteger(spec?.canvas?.height ?? 780, "canvas.height"),
};
const thresholds = {
  r_min: spec?.marker_thresholds?.r_min ?? 205,
  g_max: spec?.marker_thresholds?.g_max ?? 90,
  b_min: spec?.marker_thresholds?.b_min ?? 175,
  rg_gap_min: spec?.marker_thresholds?.rg_gap_min ?? 120,
  bg_gap_min: spec?.marker_thresholds?.bg_gap_min ?? 100,
  min_component_pixels: spec?.component_filter?.min_pixels ?? 20,
  max_component_pixels: spec?.component_filter?.max_pixels ?? 10000,
  max_component_side: spec?.component_filter?.max_side ?? 120,
  min_fill_ratio: spec?.component_filter?.min_fill_ratio ?? 0.2,
  min_aspect_ratio: spec?.component_filter?.min_aspect_ratio ?? 0.5,
};

const ids = new Set();
const result = {
  schema_version: "1.0",
  coordinate_space: "normalized_0_1_and_target_canvas",
  canvas,
  guides: {},
};

for (const guide of spec.guides) {
  if (typeof guide?.id !== "string" || guide.id.trim() === "" || ids.has(guide.id)) {
    fail("every guide id must be non-empty and unique");
  }
  ids.add(guide.id);
  const expected = asPositiveInteger(guide.expected, `${guide.id}.expected`);
  const guidePath = resolveFrom(specRoot, guide.path, `${guide.id}.path`);
  const guideBytes = readFileSync(guidePath);
  const size = readImageSize(guidePath, args.ffprobe ?? "ffprobe");
  const rgb = readRgb(guidePath, size.width * size.height * 3, args.ffmpeg ?? "ffmpeg");
  const detected = sortPoints(
    detectComponents(rgb, size.width, size.height, thresholds),
    guide.sort,
  );
  if (detected.length !== expected) {
    fail(`${guide.id}: expected ${expected} marker components, found ${detected.length}`);
  }
  if (guide.roles !== undefined && (
    !Array.isArray(guide.roles) ||
    guide.roles.length !== expected ||
    guide.roles.some((role) => typeof role !== "string" || role.trim() === "")
  )) {
    fail(`${guide.id}.roles must contain exactly ${expected} non-empty values`);
  }

  let sourceRecord;
  if (guide.source !== undefined) {
    const sourcePath = resolveFrom(specRoot, guide.source, `${guide.id}.source`);
    const sourceBytes = readFileSync(sourcePath);
    const sourceSize = readImageSize(sourcePath, args.ffprobe ?? "ffprobe");
    if (sourceSize.width !== size.width || sourceSize.height !== size.height) {
      fail(`${guide.id}: clean source and locator guide must have identical pixel dimensions`);
    }
    sourceRecord = {
      locator: guide.source,
      sha256: sha256(sourceBytes),
      size: sourceSize,
    };
  }

  const record = {
    guide_asset: { locator: guide.path, sha256: sha256(guideBytes), size },
    ...(sourceRecord ? { clean_source_asset: sourceRecord } : {}),
    expected_marker_count: expected,
    detected_marker_count: detected.length,
    marker_hex: "#FF00FF",
    points: detected.map((point, index) =>
      withCoordinates(point, size.width, size.height, canvas, guide.roles?.[index]),
    ),
  };

  if (guide.group === "bbox") {
    record.product_box = boxFromPoints(detected, size.width, size.height, canvas);
  } else if (guide.group === "boxes") {
    const count = asPositiveInteger(guide.box_count, `${guide.id}.box_count`);
    const pointsPerBox = asPositiveInteger(
      guide.points_per_box,
      `${guide.id}.points_per_box`,
    );
    if (count * pointsPerBox !== expected) {
      fail(`${guide.id}: box_count * points_per_box must equal expected`);
    }
    record.product_boxes = Array.from({ length: count }, (_, index) =>
      boxFromPoints(
        detected.slice(index * pointsPerBox, (index + 1) * pointsPerBox),
        size.width,
        size.height,
        canvas,
      ),
    );
  } else if (![undefined, "points", "curve"].includes(guide.group)) {
    fail(`${guide.id}: unsupported group ${guide.group}`);
  }
  result.guides[guide.id] = record;
}

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${outputPath}\n`);
