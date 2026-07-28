import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Map();

for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const inputPath = path.resolve(args.get("--input") || "index.html");
const outputPath = path.resolve(
  args.get("--output") || path.join(path.dirname(inputPath), "detail-page-360-optimized.html"),
);
const targetWidth = Number(args.get("--width") || 360);
const assetWidth = Number(args.get("--asset-width") || 540);
const animationFps = Number(args.get("--fps") || 12);
const animationQuality = Number(args.get("--animation-quality") || 50);
const staticQuality = Number(args.get("--static-quality") || 65);
const inputDir = path.dirname(inputPath);

if (!Number.isFinite(targetWidth) || targetWidth < 280 || targetWidth > 800) {
  throw new Error(`지원하지 않는 출력 너비입니다: ${targetWidth}`);
}

if (!Number.isFinite(assetWidth) || assetWidth < targetWidth || assetWidth > 1600) {
  throw new Error(`지원하지 않는 자산 너비입니다: ${assetWidth}`);
}

function unwrapMediaQuery(css, marker) {
  const markerIndex = css.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`모바일 CSS 구간을 찾지 못했습니다: ${marker}`);
  }

  const openIndex = css.indexOf("{", markerIndex);
  let depth = 0;

  for (let index = openIndex; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] !== "}") continue;

    depth -= 1;
    if (depth === 0) {
      const mobileRules = css.slice(openIndex + 1, index);
      return `${css.slice(0, markerIndex)}
/* ${targetWidth}px export: mobile rules forced on */
${mobileRules}
${css.slice(index + 1)}`;
    }
  }

  throw new Error(`모바일 CSS의 닫는 괄호를 찾지 못했습니다: ${marker}`);
}

async function encodeAsWebp(assetPath, destinationPath) {
  const extension = path.extname(assetPath).toLowerCase();
  const animated = extension === ".gif";
  const filter = animated
    ? `fps=${animationFps},scale=${assetWidth}:-2:flags=lanczos`
    : `scale=${assetWidth}:-2:flags=lanczos`;
  const codecArgs = animated
    ? [
        "-c:v",
        "libwebp_anim",
        "-lossless",
        "0",
        "-quality",
        String(animationQuality),
        "-compression_level",
        "6",
        "-loop",
        "0",
      ]
    : [
        "-c:v",
        "libwebp",
        "-lossless",
        "0",
        "-quality",
        String(staticQuality),
        "-compression_level",
        "6",
        "-frames:v",
        "1",
      ];

  await execFileAsync(
    "ffmpeg",
    ["-y", "-v", "error", "-i", assetPath, "-vf", filter, ...codecArgs, "-an", destinationPath],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  return animated;
}

let html = await fs.readFile(inputPath, "utf8");
const stylesheetMatch = html.match(
  /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i,
);

if (!stylesheetMatch) {
  throw new Error("인라인 처리할 스타일시트를 찾지 못했습니다.");
}

const stylesheetPath = path.resolve(inputDir, stylesheetMatch[1].split(/[?#]/)[0]);
let css = await fs.readFile(stylesheetPath, "utf8");
css = unwrapMediaQuery(css, "@media (max-width: 520px)");
css += `

/* Self-contained ${targetWidth}px optimized delivery profile */
html {
  min-width: 0;
  background: #e9eff7;
}
body,
.detail-page {
  width: ${targetWidth}px;
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
}
`;

html = html.replace(
  stylesheetMatch[0],
  `<style data-inline-source="${path.basename(stylesheetPath)}" data-export-width="${targetWidth}">
${css}
</style>`,
);

const imageSourcePattern = /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi;
const sourceValues = [...html.matchAll(imageSourcePattern)].map((match) => match[2]);
const encodedBySource = new Map();
const report = [];
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "detail-page-360-"));

try {
  let assetIndex = 0;

  for (const source of new Set(sourceValues)) {
    if (/^(?:data:|https?:|blob:)/i.test(source)) continue;

    const cleanSource = source.split(/[?#]/)[0];
    const assetPath = path.resolve(inputDir, cleanSource);
    const optimizedPath = path.join(workDir, `${String(assetIndex).padStart(2, "0")}.webp`);
    const originalStat = await fs.stat(assetPath);
    const animated = await encodeAsWebp(assetPath, optimizedPath);
    const optimizedBytes = await fs.readFile(optimizedPath);

    encodedBySource.set(source, `data:image/webp;base64,${optimizedBytes.toString("base64")}`);
    report.push({
      source,
      animated,
      original_bytes: originalStat.size,
      optimized_bytes: optimizedBytes.length,
    });
    assetIndex += 1;
  }

  html = html.replace(imageSourcePattern, (full, prefix, source, suffix) => {
    const encoded = encodedBySource.get(source);
    return encoded ? `${prefix}${encoded}${suffix}` : full;
  });

  html = html
    .replace(/\s*<script\b[\s\S]*?<\/script>/gi, "")
    .replace(
      /<html\b([^>]*)>/i,
      `<html$1 data-export="self-contained-optimized-${targetWidth}">`,
    )
    .replace(
      /<head>/i,
      `<head>
    <!-- ${targetWidth}px optimized standalone: ${sourceValues.length} images embedded as WebP -->`,
    );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, "utf8");

  const outputStat = await fs.stat(outputPath);
  const originalAssetBytes = report.reduce((sum, item) => sum + item.original_bytes, 0);
  const optimizedAssetBytes = report.reduce((sum, item) => sum + item.optimized_bytes, 0);

  process.stdout.write(
    `${JSON.stringify(
      {
        output: outputPath,
        width: targetWidth,
        asset_width: assetWidth,
        animation_fps: animationFps,
        embedded_images: sourceValues.length,
        unique_embedded_assets: encodedBySource.size,
        original_asset_bytes: originalAssetBytes,
        optimized_asset_bytes: optimizedAssetBytes,
        output_bytes: outputStat.size,
        assets: report,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await fs.rm(workDir, { recursive: true, force: true });
}
