#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MEDIA_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const ANIMATION_EXTENSIONS = new Set([".gif", ".webp"]);
const OUTPUT_WIDTH = 780;
const LEGACY_HALF_WIDTH_PATTERN = new RegExp(`\\b${OUTPUT_WIDTH / 2}(?:px)?\\b`, "i");

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function mediaInfo(file) {
  const result = spawnSync("ffprobe", [
    "-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=width,nb_read_frames,nb_frames",
    "-of", "json", file,
  ], { encoding: "utf8" });
  if (result.status !== 0) return { ok: false, detail: result.stderr.trim() };
  const stream = JSON.parse(result.stdout)?.streams?.[0] || {};
  const frames = Number(stream.nb_read_frames || stream.nb_frames || 0);
  return { ok: true, width: Number(stream.width || 0), frames };
}

function stripTags(value) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function validateHtmlProject(projectRoot, { strictMedia = false } = {}) {
  const root = path.resolve(projectRoot);
  const outputRoot = path.join(root, "output");
  const htmlPath = path.join(outputRoot, "detail-page.html");
  const errors = [];
  const warnings = [];
  if (!existsSync(htmlPath)) {
    return { ok: false, errors: [{ code: "HTML_MISSING", file: htmlPath }], warnings };
  }
  const html = readFileSync(htmlPath, "utf8");

  if (LEGACY_HALF_WIDTH_PATTERN.test(html)) {
    errors.push({ code: "LEGACY_WIDTH_FOUND", detail: "공개 HTML은 780px 전용이어야 합니다." });
  }
  if (!new RegExp(`${OUTPUT_WIDTH}px`, "i").test(html) &&
      !new RegExp(`content=["'][^"']*width=${OUTPUT_WIDTH}`, "i").test(html)) {
    errors.push({ code: "WIDTH_780_NOT_DECLARED" });
  }
  const forbidden = [
    /file:\/\//i,
    /\/Users\//,
    /\.detail-page\//,
    /data-(?:agent|approval|claim|edit|evidence|fact|prompt|qa|studio|workflow)[\w-]*=/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(html)) errors.push({ code: "INTERNAL_METADATA_EXPOSED", pattern: String(pattern) });
  }
  if (/\d[\d,.]*\s*<br\s*\/?>\s*(?:mm|cm|m|g|kg|ml|l|개|장|매|초|분|시간|%)/i.test(html)) {
    errors.push({ code: "NUMBER_UNIT_SPLIT" });
  }

  const headingPattern = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  for (const match of html.matchAll(headingPattern)) {
    const raw = match[2];
    const text = stripTags(raw).replace(/\s+/g, " ");
    if (text.length > 24 && !/<br\s*\/?>/i.test(raw)) {
      warnings.push({ code: "LONG_HEADLINE_WITHOUT_SEMANTIC_BREAK", text });
    }
  }

  const referenced = new Set();
  const sourcePattern = /\b(?:src|poster)=["']([^"']+)["']/gi;
  for (const [, source] of html.matchAll(sourcePattern)) {
    if (/^(?:https?:|data:|#)/i.test(source)) continue;
    const file = path.resolve(outputRoot, source.split(/[?#]/, 1)[0]);
    const relative = path.relative(outputRoot, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      errors.push({ code: "ASSET_PATH_ESCAPES_OUTPUT", source });
      continue;
    }
    referenced.add(file);
    if (!existsSync(file)) errors.push({ code: "ASSET_MISSING", source });
  }

  const images = walk(path.join(outputRoot, "media", "images"))
    .filter((file) => MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const gifs = walk(path.join(outputRoot, "media", "gifs"))
    .filter((file) => ANIMATION_EXTENSIONS.has(path.extname(file).toLowerCase()));
  if (strictMedia && (images.length < 28 || images.length > 32)) {
    errors.push({ code: "STILL_COUNT_OUT_OF_RANGE", count: images.length });
  }
  if (strictMedia && (gifs.length < 8 || gifs.length > 12)) {
    errors.push({ code: "GIF_COUNT_OUT_OF_RANGE", count: gifs.length });
  }

  for (const file of [...images, ...gifs]) {
    if (strictMedia && !referenced.has(file)) {
      errors.push({ code: "ORPHAN_MEDIA", file: path.relative(root, file) });
    }
    if (!strictMedia) continue;
    const info = mediaInfo(file);
    if (!info.ok) {
      errors.push({ code: "MEDIA_UNREADABLE", file: path.relative(root, file), detail: info.detail });
    } else {
      if (info.width !== OUTPUT_WIDTH) errors.push({ code: "MEDIA_WIDTH_NOT_780", file: path.relative(root, file), width: info.width });
      if (gifs.includes(file) && info.frames < 2) errors.push({ code: "ANIMATION_HAS_FEWER_THAN_TWO_FRAMES", file: path.relative(root, file) });
    }
  }

  return {
    ok: errors.length === 0,
    html: path.relative(root, htmlPath),
    media: { images: images.length, gifs: gifs.length },
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  const args = { strictMedia: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--project") args.project = argv[++index];
    else if (argv[index] === "--strict-media") args.strictMedia = true;
  }
  return args;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error("Usage: node scripts/lean-html-qa.mjs --project <folder> [--strict-media]");
    process.exit(2);
  }
  const report = validateHtmlProject(args.project, { strictMedia: args.strictMedia });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
