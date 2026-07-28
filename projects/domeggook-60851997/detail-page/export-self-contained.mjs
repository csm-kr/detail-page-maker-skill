import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const inputPath = path.resolve(args.get("--input") || "index.html");
const outputPath = path.resolve(
  args.get("--output") || path.join(process.env.USERPROFILE, "Desktop", "novaface-detail-page-v23-390-self-contained.html"),
);
const targetWidth = Number(args.get("--width") || 390);
const inputDir = path.dirname(inputPath);

if (!Number.isFinite(targetWidth) || targetWidth < 280 || targetWidth > 800) {
  throw new Error(`지원하지 않는 출력 폭입니다: ${targetWidth}`);
}

const mimeByExtension = new Map([
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function unwrapMediaQuery(css, marker) {
  const markerIndex = css.indexOf(marker);
  if (markerIndex < 0) throw new Error(`모바일 CSS 구간을 찾지 못했습니다: ${marker}`);

  const openIndex = css.indexOf("{", markerIndex);
  let depth = 0;
  let closeIndex = -1;
  for (let index = openIndex; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        closeIndex = index;
        break;
      }
    }
  }
  if (closeIndex < 0) throw new Error(`모바일 CSS 닫는 괄호를 찾지 못했습니다: ${marker}`);

  const mobileRules = css.slice(openIndex + 1, closeIndex);
  return `${css.slice(0, markerIndex)}\n/* 390px export: mobile rules forced on */\n${mobileRules}\n${css.slice(closeIndex + 1)}`;
}

let html = await fs.readFile(inputPath, "utf8");
const stylesheetMatch = html.match(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i);
if (!stylesheetMatch) throw new Error("인라인할 스타일시트를 찾지 못했습니다.");

const stylesheetPath = path.resolve(inputDir, stylesheetMatch[1].split(/[?#]/)[0]);
let css = await fs.readFile(stylesheetPath, "utf8");
css = unwrapMediaQuery(css, "@media (max-width: 520px)");
css += `

/* Self-contained ${targetWidth}px delivery profile */
html {
  min-width: 0;
  background: #e9eff7;
}
body {
  width: ${targetWidth}px;
  max-width: 100%;
  margin: 0 auto;
}
.detail-page {
  width: ${targetWidth}px;
  max-width: 100%;
  margin: 0 auto;
}
`;

html = html.replace(
  stylesheetMatch[0],
  `<style data-inline-source="${path.basename(stylesheetPath)}" data-export-width="${targetWidth}">\n${css}\n</style>`,
);

const imageSourcePattern = /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi;
const sourceValues = [...html.matchAll(imageSourcePattern)].map((match) => match[2]);
const encodedBySource = new Map();

for (const source of new Set(sourceValues)) {
  if (/^(?:data:|https?:|blob:)/i.test(source)) continue;
  const cleanSource = source.split(/[?#]/)[0];
  const assetPath = path.resolve(inputDir, cleanSource);
  const extension = path.extname(assetPath).toLowerCase();
  const mime = mimeByExtension.get(extension);
  if (!mime) throw new Error(`지원하지 않는 이미지 형식입니다: ${assetPath}`);
  const bytes = await fs.readFile(assetPath);
  encodedBySource.set(source, `data:${mime};base64,${bytes.toString("base64")}`);
}

html = html.replace(imageSourcePattern, (full, prefix, source, suffix) => {
  const encoded = encodedBySource.get(source);
  return encoded ? `${prefix}${encoded}${suffix}` : full;
});

html = html
  .replace(/\s*<script\b[\s\S]*?<\/script>/gi, "")
  .replace(/<html\b([^>]*)>/i, `<html$1 data-export="self-contained-v23-${targetWidth}">`)
  .replace(
    /<head>/i,
    `<head>\n    <!-- v23 · ${targetWidth}px · ${sourceValues.length} images/GIFs embedded as data URIs -->`,
  );

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html, "utf8");

const outputStat = await fs.stat(outputPath);
process.stdout.write(
  `${JSON.stringify(
    {
      output: outputPath,
      width: targetWidth,
      embedded_images: sourceValues.length,
      unique_embedded_assets: encodedBySource.size,
      bytes: outputStat.size,
    },
    null,
    2,
  )}\n`,
);
