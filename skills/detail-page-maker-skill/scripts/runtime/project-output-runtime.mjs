import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  validatePublicConversionHtml,
} from "../orchestration/coupang-conversion-contract.mjs";

const BACKUP_LIMIT = 20;
const UNSAFE_PUBLIC_ATTRIBUTE =
  /\s+(?:(?:data-[^\s=/>]+)|(?:contenteditable|spellcheck)(?=\s|=|\/?>)|(?:on[a-z][^\s=/>]*))(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;
const PUBLIC_URL_ATTRIBUTE =
  /\s+(action|archive|background|cite|codebase|data|formaction|href|longdesc|manifest|ping|poster|profile|src|srcset|usemap|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const BLOCKED_PUBLIC_ELEMENTS = new Set([
  "base",
  "embed",
  "foreignobject",
  "iframe",
  "math",
  "object",
  "svg",
]);
const PUBLIC_MOTION_RUNTIME = `<script>(()=>{"use strict";const originals=new WeakMap();const posters=new WeakMap();const visible=new WeakMap();const stopped=new WeakMap();const posterChecks=new WeakMap();const preference=window.matchMedia("(prefers-reduced-motion: reduce)");const gifs=()=>Array.from(document.images).filter(image=>{const source=image.getAttribute("src")||"";return /\\.gif(?:[?#]|$)/i.test(source)||/^data:image\\/gif[;,]/i.test(source)});const canvasFor=(width,height)=>{const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;return canvas};const visibleFallback=image=>{const width=Math.max(1,image.naturalWidth||image.width||320);const height=Math.max(1,image.naturalHeight||image.height||180);try{const canvas=canvasFor(width,height);const context=canvas.getContext("2d",{alpha:false});if(context){context.fillStyle="#f3f4f6";context.fillRect(0,0,width,height);context.fillStyle="#4b5563";context.textAlign="center";context.textBaseline="middle";context.font=Math.max(12,Math.min(24,Math.round(width/18)))+"px sans-serif";context.fillText((image.getAttribute("alt")||"움직임이 정지된 이미지").slice(0,40),width/2,height/2)}return canvas.toDataURL("image/png")}catch{return "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='320'%20height='180'%20viewBox='0%200%20320%20180'%3E%3Crect%20width='320'%20height='180'%20fill='%23f3f4f6'/%3E%3Ctext%20x='160'%20y='96'%20text-anchor='middle'%20font-family='sans-serif'%20font-size='16'%20fill='%234b5563'%3EPaused%20motion%3C/text%3E%3C/svg%3E"}};const conventionalPoster=original=>{if(/^data:/i.test(original))return null;const url=new URL(original,document.baseURI);if(!/\\.gif$/i.test(url.pathname))return null;url.pathname=url.pathname.replace(/\\.gif$/i,"-poster.webp");url.search="";url.hash="";return url.href};const verifyConventionalPoster=(image,original)=>{if(posterChecks.has(image))return;const candidate=conventionalPoster(original);if(!candidate||typeof Image!=="function")return;posterChecks.set(image,true);const probe=new Image();probe.onload=()=>{if(probe.naturalWidth<1||probe.naturalHeight<1)return;posters.set(image,candidate);if(stopped.get(image))image.setAttribute("src",candidate)};probe.onerror=()=>{};probe.src=candidate};const capture=image=>{if(posters.has(image))return posters.get(image);const width=Math.max(1,image.naturalWidth||image.width||1);const height=Math.max(1,image.naturalHeight||image.height||1);let poster=null;try{const canvas=canvasFor(width,height);const context=canvas.getContext("2d",{alpha:true});if(context){context.drawImage(image,0,0,width,height);poster=canvas.toDataURL("image/png")}}catch{}if(!poster){poster=visibleFallback(image);posters.set(image,poster);verifyConventionalPoster(image,originals.get(image));return poster}posters.set(image,poster);return poster};const stop=image=>{stopped.set(image,true);const poster=capture(image);if(image.getAttribute("src")!==poster)image.setAttribute("src",poster)};let sequence=0;const restart=image=>{if(preference.matches){stop(image);return}const original=originals.get(image);if(!original)return;stopped.set(image,false);sequence+=1;if(/^data:/i.test(original)){image.removeAttribute("src");requestAnimationFrame(()=>image.setAttribute("src",original));return}const url=new URL(original,document.baseURI);url.searchParams.set("_motion_restart",String(Date.now())+"-"+String(sequence));image.setAttribute("src",url.href)};let observer=null;const inViewport=image=>{const rect=image.getBoundingClientRect();return rect.bottom>0&&rect.right>0&&rect.top<(window.innerHeight||document.documentElement.clientHeight)&&rect.left<(window.innerWidth||document.documentElement.clientWidth)};const images=[];const initialize=()=>{for(const image of gifs()){const original=image.currentSrc||image.getAttribute("src");if(!original||originals.has(image))continue;originals.set(image,original);images.push(image);stop(image)}if(!("IntersectionObserver"in window)){for(const image of images)stop(image);return}observer=new IntersectionObserver(entries=>{for(const entry of entries){const image=entry.target;visible.set(image,entry.isIntersecting);if(entry.isIntersecting)restart(image);else stop(image)}},{threshold:0.01});for(const image of images)observer.observe(image)};const onPreferenceChange=()=>{for(const image of images){if(preference.matches||!observer)stop(image);else if(visible.get(image)||inViewport(image))restart(image)}};if(typeof preference.addEventListener==="function")preference.addEventListener("change",onPreferenceChange);else if(typeof preference.addListener==="function")preference.addListener(onPreferenceChange);if(document.readyState==="complete")initialize();else window.addEventListener("load",initialize,{once:true})})()</script>`;

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function posix(value) {
  return value.split(path.sep).join("/");
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function projectPaths(projectRoot) {
  const root = path.resolve(projectRoot);
  return {
    root,
    authoring: path.join(root, ".detail-page", "authoring", "detail-page.html"),
    output: path.join(root, "output", "detail-page.html"),
    exportManifest: path.join(root, "output", "export-manifest.json"),
    backups: path.join(root, ".detail-page", "backups"),
    workflow: path.join(root, ".detail-page", "workflow"),
    outputState: path.join(root, ".detail-page", "output-state.json"),
    legacyOutputState: path.join(
      root,
      ".detail-page",
      "workflow",
      "output-state.json",
    ),
  };
}

function forceContentHeight(html) {
  const style =
    "<style>html,body,#detailPage{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}body{display:block!important;margin:0 auto!important;width:100%!important;max-width:780px!important}#detailPage{box-sizing:border-box!important;width:100%!important;max-width:780px!important;margin:0 auto!important}</style>";
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${style}</head>`);
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}${style}`);
  }
  return `${style}${html}`;
}

function decodePublicUrlEntities(value) {
  return String(value)
    .replace(
      /&#(?:x([0-9a-f]+)|([0-9]+));?/gi,
      (match, hexadecimal, decimal) => {
        const point = Number.parseInt(hexadecimal || decimal, hexadecimal ? 16 : 10);
        if (!Number.isFinite(point) || point < 0 || point > 0x10ffff) {
          return match;
        }
        try {
          return String.fromCodePoint(point);
        } catch {
          return match;
        }
      },
    )
    .replace(/&colon;?/gi, ":")
    .replace(/&(?:tab|newline);?/gi, " ");
}

function normalizedPublicUrl(value) {
  return decodePublicUrlEntities(value)
    .replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, "")
    .toLowerCase();
}

function isUnsafePublicUrl(value, tagName, attributeName) {
  const normalized = normalizedPublicUrl(value);
  if (/^(?:javascript|vbscript):/.test(normalized)) return true;
  if (!normalized.startsWith("data:")) return false;
  return !(
    tagName === "img" &&
    attributeName === "src" &&
    /^data:image\/(?:avif|gif|jpe?g|png|webp)(?:[;,])/.test(normalized)
  );
}

function isUnsafePublicUrlAttribute(value, tagName, attributeName) {
  if (attributeName !== "srcset") {
    return isUnsafePublicUrl(value, tagName, attributeName);
  }
  const candidates = String(value)
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/, 1)[0])
    .filter(Boolean);
  return (
    candidates.length === 0 ||
    candidates.some((candidate) =>
      isUnsafePublicUrl(candidate, tagName, "srcset"),
    )
  );
}

function attributeValue(tag, attributeName) {
  const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(
      `\\s+${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : null;
}

function escapedAttributeValue(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
}

function replaceTagAttribute(tag, attributeName, value) {
  const escapedName = attributeName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const pattern = new RegExp(
    `(\\s+${escapedName}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s>]+)`,
    "i",
  );
  const encoded = `"${escapedAttributeValue(value)}"`;
  if (pattern.test(tag)) {
    return tag.replace(pattern, `$1${encoded}`);
  }
  return tag.replace(/\s*\/?>$/, (ending) =>
    ending.startsWith("/")
      ? ` ${attributeName}=${encoded}/>`
      : ` ${attributeName}=${encoded}>`,
  );
}

function promotePublicMotionSources(html) {
  return String(html).replace(
    /<(figure|div)\b([^>]*\sdata-motion-src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*)>([\s\S]*?)<\/\1\s*>/gi,
    (block, _tagName, openingAttributes) => {
      const openingTag = `<figure${openingAttributes}>`;
      const motionSource = attributeValue(
        openingTag,
        "data-motion-src",
      );
      if (
        !motionSource ||
        isUnsafePublicUrl(motionSource, "img", "src")
      ) {
        return block;
      }
      return block.replace(
        /<img\b[^>]*>/i,
        (imageTag) =>
          replaceTagAttribute(
            imageTag,
            "src",
            motionSource,
          ),
      );
    },
  );
}

function isMetaRefresh(tag) {
  const value = attributeValue(tag, "http-equiv");
  if (value === null) return false;
  return normalizedPublicUrl(value) === "refresh";
}

function stripUnsafePublicUrls(tag, tagName) {
  return tag.replace(
    PUBLIC_URL_ATTRIBUTE,
    (match, attributeName, doubleQuoted, singleQuoted, unquoted) => {
      const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
      return isUnsafePublicUrlAttribute(
        value,
        tagName,
        attributeName.toLowerCase(),
      )
        ? ""
        : match;
    },
  );
}

function hasPublicGif(html) {
  for (const match of html.matchAll(PUBLIC_URL_ATTRIBUTE)) {
    if (match[1].toLowerCase() !== "src") continue;
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    const normalized = normalizedPublicUrl(value);
    if (
      /\.gif(?:[?#]|$)/i.test(value) ||
      /^data:image\/gif(?:[;,])/.test(normalized)
    ) {
      return true;
    }
  }
  return false;
}

function injectPublicMotionRuntime(html) {
  if (!hasPublicGif(html)) return html;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${PUBLIC_MOTION_RUNTIME}</body>`);
  }
  return `${html}${PUBLIC_MOTION_RUNTIME}`;
}

function stripBlockedPublicElementContents(html) {
  let output = html;
  for (const elementName of [
    "iframe",
    "object",
    "foreignobject",
    "svg",
    "math",
  ]) {
    const paired = new RegExp(
      `<${elementName}\\b[\\s\\S]*?<\\/${elementName}\\s*>`,
      "gi",
    );
    for (let depth = 0; depth < 32; depth += 1) {
      const next = output.replace(paired, "");
      if (next === output) break;
      output = next;
    }
  }
  return output;
}

function stripUnsafePublicAttributes(html) {
  let output = "";
  let cursor = 0;
  while (cursor < html.length) {
    const tagStart = html.indexOf("<", cursor);
    if (tagStart < 0) {
      output += html.slice(cursor);
      break;
    }
    output += html.slice(cursor, tagStart);
    const prefix = html
      .slice(tagStart + 1)
      .match(/^\s*(\/?)\s*([A-Za-z][\w:-]*)/);
    if (!prefix) {
      output += "<";
      cursor = tagStart + 1;
      continue;
    }
    let quote = "";
    let tagEnd = tagStart + 1;
    for (; tagEnd < html.length; tagEnd += 1) {
      const character = html[tagEnd];
      if (quote) {
        if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === ">") break;
    }
    if (tagEnd >= html.length) {
      output += html.slice(tagStart);
      break;
    }
    const tag = html.slice(tagStart, tagEnd + 1);
    const closing = prefix[1] === "/";
    const tagName = prefix[2].toLowerCase();
    if (
      BLOCKED_PUBLIC_ELEMENTS.has(tagName) ||
      (!closing && tagName === "meta" && isMetaRefresh(tag))
    ) {
      cursor = tagEnd + 1;
      continue;
    }
    if (closing) {
      output += tag;
      cursor = tagEnd + 1;
      continue;
    }
    const withoutUnsafeAttributes = tag.replace(UNSAFE_PUBLIC_ATTRIBUTE, "");
    output += stripUnsafePublicUrls(withoutUnsafeAttributes, tagName);
    cursor = tagEnd + 1;
  }
  return output;
}

export function sanitizePublicHtml(authoringHtml) {
  let html = String(authoringHtml || "");
  html = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi, "");
  html = promotePublicMotionSources(html);
  html = stripBlockedPublicElementContents(html);
  html = stripUnsafePublicAttributes(html);
  return injectPublicMotionRuntime(forceContentHeight(html));
}

function gifFrameCount(bytes) {
  if (
    bytes.length < 10 ||
    bytes.subarray(0, 3).toString("ascii") !== "GIF"
  ) {
    return 0;
  }
  let frames = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x2c) frames += 1;
  }
  return frames;
}

function animatedWebpFrameCount(bytes) {
  if (
    bytes.length < 16 ||
    bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
    bytes.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return 0;
  }
  let frames = 0;
  for (let index = 12; index + 4 <= bytes.length; index += 1) {
    if (bytes.subarray(index, index + 4).toString("ascii") === "ANMF") {
      frames += 1;
      index += 3;
    }
  }
  return frames;
}

function animationFrameCount(fileName, bytes) {
  if (/\.gif$/i.test(fileName)) return gifFrameCount(bytes);
  if (/\.webp$/i.test(fileName)) {
    return animatedWebpFrameCount(bytes);
  }
  return null;
}

function localMotionSources(html, attributeName) {
  const escaped = attributeName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const values = [];
  for (const match of String(html).matchAll(
    new RegExp(
      `\\s+${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "gi",
    ),
  )) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (
      /\.(?:gif|webp)(?:[?#]|$)/i.test(value) &&
      !/^(?:data:|https?:|\/\/)/i.test(value)
    ) {
      values.push(value);
    }
  }
  return values;
}

export function validatePublicMotionClosure({
  authoringHtml,
  publicHtml,
  mediaFiles,
}) {
  const authoringMotionSources = localMotionSources(
    authoringHtml,
    "data-motion-src",
  );
  const publicMotionSources = localMotionSources(publicHtml, "src");
  const publicMotionFiles = new Map(
    asArray(mediaFiles)
      .filter((file) => file.path.startsWith("media/gifs/"))
      .map((file) => [file.path, file]),
  );
  const missing = [];
  const posterOnly = [];
  for (const source of authoringMotionSources) {
    let fileName;
    try {
      fileName = path.basename(
        decodeURIComponent(source.split(/[?#]/, 1)[0]),
      );
    } catch {
      missing.push(source);
      continue;
    }
    const publicPath = `media/gifs/${encodeURIComponent(fileName)}`;
    const publicRefFound = publicMotionSources.some((candidate) =>
      candidate.split(/[?#]/, 1)[0].endsWith(
        `media/gifs/${encodeURIComponent(fileName)}`,
      ),
    );
    const materialized = publicMotionFiles.get(publicPath);
    if (!publicRefFound || !materialized) {
      missing.push(source);
      continue;
    }
    if (
      !Number.isInteger(materialized.animation_frame_count) ||
      materialized.animation_frame_count < 2
    ) {
      posterOnly.push(publicPath);
    }
  }
  if (missing.length > 0 || posterOnly.length > 0) {
    const error = new Error(
      "공개 motion의 DOM → manifest → output/media animation bytes closure가 실패했습니다.",
    );
    error.code = "PUBLIC_MOTION_CLOSURE_FAILED";
    error.details = {
      planned_motion_count: authoringMotionSources.length,
      public_motion_count: publicMotionSources.length,
      missing,
      poster_only: posterOnly,
    };
    throw error;
  }
  return {
    status: "PASS",
    planned_motion_count: authoringMotionSources.length,
    public_motion_count: authoringMotionSources.length,
    poster_only_count: 0,
    animation_paths: authoringMotionSources.map((source) => {
      const fileName = path.basename(
        decodeURIComponent(source.split(/[?#]/, 1)[0]),
      );
      return `media/gifs/${encodeURIComponent(fileName)}`;
    }),
  };
}

async function atomicWrite(target, bytes) {
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}

async function readOutputState(paths) {
  for (const candidate of [
    paths.outputState,
    paths.legacyOutputState,
  ]) {
    try {
      return JSON.parse(await readFile(candidate, "utf8"));
    } catch {
      // Continue to the legacy location before returning defaults.
    }
  }
  return {
    schema_version: "1.0",
    canonical_entry: "output/detail-page.html",
    wing_export_required: true,
    source_revision_id: null,
    current_source_revision_sha256: null,
    current_authoring_sha256: null,
    current_public_sha256: null,
    updated_at: null,
  };
}

async function writeOutputState(paths, state) {
  await atomicWrite(
    paths.outputState,
    Buffer.from(`${JSON.stringify(state, null, 2)}\n`, "utf8"),
  );
}

function backupId(now = new Date()) {
  return `${now
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replaceAll(":", "")
    .replaceAll("-", "")
    .replace("T", "-")}-${randomUUID().slice(0, 8)}`;
}

function sourceRevisionId(now, sourceSha256) {
  return `source-${now
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replaceAll(":", "")
    .replaceAll("-", "")
    .replace("T", "-")}-${sourceSha256.slice(0, 12)}`;
}

async function createBackup(paths, previousAuthoring, previousOutput, now) {
  if (previousAuthoring === null && previousOutput === null) return null;
  const id = backupId(now);
  const root = path.join(paths.backups, id);
  await mkdir(root, { recursive: false });
  if (previousAuthoring !== null) {
    await writeFile(path.join(root, "authoring.html"), previousAuthoring);
  }
  if (previousOutput !== null) {
    await writeFile(path.join(root, "detail-page.html"), previousOutput);
  }
  const manifest = {
    schema_version: "1.0",
    backup_id: id,
    created_at: now.toISOString(),
    authoring_sha256:
      previousAuthoring === null ? null : sha256Bytes(previousAuthoring),
    public_sha256:
      previousOutput === null ? null : sha256Bytes(previousOutput),
  };
  await writeFile(
    path.join(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

async function enforceBackupRetention(paths) {
  try {
    await access(paths.backups);
  } catch {
    return;
  }
  const entries = await readdir(paths.backups, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = path.join(paths.backups, entry.name);
    const info = await stat(target);
    backups.push({ target, name: entry.name, mtimeMs: info.mtimeMs });
  }
  backups.sort(
    (left, right) =>
      right.name.localeCompare(left.name) || right.mtimeMs - left.mtimeMs,
  );
  await Promise.all(
    backups.slice(BACKUP_LIMIT).map((item) =>
      rm(item.target, { recursive: true, force: true }),
    ),
  );
}

async function readMaybe(target) {
  try {
    return await readFile(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function restorePrevious(target, previous) {
  if (previous === null) {
    await rm(target, { force: true });
    return;
  }
  await atomicWrite(target, previous);
}

async function materializeReferencedMedia(
  paths,
  publicHtml,
  backup,
  immutableMediaRoot = null,
) {
  const approvedPattern =
    /(\bsrc\s*=\s*)(["'])(\/?\.detail-page\/generation\/approved\/(image|gif)\/([^"'/?#]+))\2/gi;
  const immutablePattern =
    /(\bsrc\s*=\s*)(["'])(media\/(images|gifs)\/([^"'/?#]+))\2/gi;
  const changes = [];
  const files = new Map();
  let rewritten = publicHtml;

  async function materialize({
    source,
    kind,
    encodedFileName,
    originalReference,
    attributePrefix,
    quote,
  }) {
    const decodedFileName = decodeURIComponent(encodedFileName);
    const fileName = path.basename(decodedFileName);
    if (fileName !== decodedFileName) {
      throw new Error("미디어 파일명에 경로 구분자를 사용할 수 없습니다.");
    }
    const target = path.join(
      paths.root,
      "output",
      "media",
      kind,
      fileName,
    );
    const sourceBytes = await readFile(source);
    const previous = await readMaybe(target);
    if (
      previous === null ||
      sha256Bytes(previous) !== sha256Bytes(sourceBytes)
    ) {
      if (backup?.backup_id) {
        if (previous !== null) {
          const backupTarget = path.join(
            paths.backups,
            backup.backup_id,
            "media",
            kind,
            fileName,
          );
          await mkdir(path.dirname(backupTarget), { recursive: true });
          await writeFile(backupTarget, previous);
        }
        backup.media = backup.media || [];
        backup.media.push({
          path: `media/${kind}/${fileName}`,
          existed_before: previous !== null,
          sha256: previous === null ? null : sha256Bytes(previous),
        });
      }
      await atomicWrite(target, sourceBytes);
      changes.push({ target, previous });
    }
    const publicPath = `media/${kind}/${encodeURIComponent(fileName)}`;
    rewritten = rewritten.replaceAll(
      `${attributePrefix}${quote}${originalReference}${quote}`,
      `${attributePrefix}${quote}${publicPath}${quote}`,
    );
    files.set(publicPath, {
      path: publicPath,
      bytes: sourceBytes.length,
      sha256: sha256Bytes(sourceBytes),
      animation_frame_count: animationFrameCount(
        fileName,
        sourceBytes,
      ),
    });
  }

  for (const match of publicHtml.matchAll(approvedPattern)) {
    const kind = match[4] === "gif" ? "gifs" : "images";
    const encodedFileName = match[5];
    const fileName = decodeURIComponent(encodedFileName);
    await materialize({
      source: path.join(
        paths.root,
        ".detail-page",
        "generation",
        "approved",
        match[4],
        fileName,
      ),
      kind,
      encodedFileName,
      originalReference: match[3],
      attributePrefix: match[1],
      quote: match[2],
    });
  }
  if (immutableMediaRoot) {
    for (const match of publicHtml.matchAll(immutablePattern)) {
      const kind = match[4];
      const encodedFileName = match[5];
      const fileName = decodeURIComponent(encodedFileName);
      await materialize({
        source: path.join(
          immutableMediaRoot,
          kind,
          fileName,
        ),
        kind,
        encodedFileName,
        originalReference: match[3],
        attributePrefix: match[1],
        quote: match[2],
      });
    }
  }
  if (backup?.backup_id && backup.media?.length) {
    await writeFile(
      path.join(paths.backups, backup.backup_id, "manifest.json"),
      `${JSON.stringify(backup, null, 2)}\n`,
      "utf8",
    );
  }
  return {
    html: rewritten,
    changes,
    files: [...files.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

async function rollbackMedia(changes) {
  await Promise.all(
    changes.map(({ target, previous }) =>
      restorePrevious(target, previous),
    ),
  );
}

export async function saveProjectOutput(
  projectRoot,
  {
    html,
    now = new Date(),
    failureInjection = null,
    exportManifest = null,
    validateBeforeCommit = null,
    immutableMediaRoot = null,
  } = {},
) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") === 0) {
    throw new Error("저장할 Studio HTML이 필요합니다.");
  }
  const paths = projectPaths(projectRoot);
  const nextAuthoring = Buffer.from(html, "utf8");
  const [previousAuthoring, previousOutput, previousExportManifest, previousState] =
    await Promise.all([
    readMaybe(paths.authoring),
    readMaybe(paths.output),
    readMaybe(paths.exportManifest),
    readOutputState(paths),
    ]);
  if (previousAuthoring !== null || previousOutput !== null) {
    await mkdir(paths.backups, { recursive: true });
  }
  const backup = await createBackup(
    paths,
    previousAuthoring,
    previousOutput,
    now,
  );
  let mediaChanges = [];
  try {
    await atomicWrite(paths.authoring, nextAuthoring);
    if (failureInjection === "after-authoring") {
      throw new Error("injected save failure after authoring");
    }
    const materialized = await materializeReferencedMedia(
      paths,
      sanitizePublicHtml(html),
      backup,
      immutableMediaRoot,
    );
    mediaChanges = materialized.changes;
    const publicMotionQa = validatePublicMotionClosure({
      authoringHtml: html,
      publicHtml: materialized.html,
      mediaFiles: materialized.files,
    });
    const publicConversionQa = validatePublicConversionHtml(materialized.html);
    if (!publicConversionQa.ok) {
      const error = new Error("공개 결과물의 내부 메타데이터 제거 계약을 통과하지 못했습니다.");
      error.code = "PUBLIC_CONVERSION_QA_FAILED";
      error.details = publicConversionQa;
      throw error;
    }
    const nextOutput = Buffer.from(materialized.html, "utf8");
    await atomicWrite(paths.output, nextOutput);
    if (failureInjection === "after-output") {
      throw new Error("injected save failure after output");
    }
    let sealedExportManifest = null;
    if (exportManifest) {
      const manifestBody = {
        ...exportManifest,
        output: {
          path: "output/detail-page.html",
          bytes: nextOutput.length,
          sha256: sha256Bytes(nextOutput),
        },
        media: materialized.files,
        public_output_qa: {
          motion_closure: publicMotionQa,
          conversion: publicConversionQa,
        },
        generated_at: now.toISOString(),
      };
      sealedExportManifest = {
        ...manifestBody,
        manifest_sha256: sha256Bytes(
          Buffer.from(JSON.stringify(manifestBody), "utf8"),
        ),
      };
      await atomicWrite(
        paths.exportManifest,
        Buffer.from(
          `${JSON.stringify(sealedExportManifest, null, 2)}\n`,
          "utf8",
        ),
      );
    } else {
      await rm(paths.exportManifest, { force: true });
    }
    if (failureInjection === "after-export-manifest") {
      throw new Error("injected save failure after export manifest");
    }
    if (typeof validateBeforeCommit === "function") {
      await validateBeforeCommit({
        authoring_sha256: sha256Bytes(nextAuthoring),
        public_sha256: sha256Bytes(nextOutput),
        export_manifest: sealedExportManifest,
        public_output_qa: {
          motion_closure: publicMotionQa,
          conversion: publicConversionQa,
        },
      });
    }
    const state = {
      ...previousState,
      schema_version: "1.0",
      canonical_entry: "output/detail-page.html",
      wing_export_required: true,
      source_revision_id: sourceRevisionId(
        now,
        sha256Bytes(nextAuthoring),
      ),
      current_source_revision_sha256:
        sha256Bytes(nextAuthoring),
      current_authoring_sha256: sha256Bytes(nextAuthoring),
      current_public_sha256: sha256Bytes(nextOutput),
      last_save_backup_id: backup?.backup_id ?? null,
      updated_at: now.toISOString(),
    };
    await writeOutputState(paths, state);
    await enforceBackupRetention(paths);
    return {
      status: "saved",
      canonical_entry: state.canonical_entry,
      source_revision_id: state.source_revision_id,
      authoring_path: posix(path.relative(paths.root, paths.authoring)),
      output_path: posix(path.relative(paths.root, paths.output)),
      authoring_sha256: state.current_authoring_sha256,
      public_sha256: state.current_public_sha256,
      backup_id: backup?.backup_id ?? null,
      wing_export_required: true,
      export_manifest_path: sealedExportManifest
        ? "output/export-manifest.json"
        : null,
      export_manifest: sealedExportManifest,
      media: materialized.files,
      public_output_qa: {
        motion_closure: publicMotionQa,
        conversion: publicConversionQa,
      },
    };
  } catch (error) {
    await Promise.all([
      restorePrevious(paths.authoring, previousAuthoring),
      restorePrevious(paths.output, previousOutput),
      restorePrevious(paths.exportManifest, previousExportManifest),
      writeOutputState(paths, previousState),
      rollbackMedia(mediaChanges),
    ]);
    throw error;
  }
}

export async function listProjectBackups(projectRoot) {
  const paths = projectPaths(projectRoot);
  try {
    await access(paths.backups);
  } catch {
    return [];
  }
  const entries = await readdir(paths.backups, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      backups.push(
        JSON.parse(
          await readFile(
            path.join(paths.backups, entry.name, "manifest.json"),
            "utf8",
          ),
        ),
      );
    } catch {
      // An incomplete backup is not restorable and is deliberately hidden.
    }
  }
  return backups.sort((left, right) =>
    right.backup_id.localeCompare(left.backup_id),
  );
}

export async function restoreProjectBackup(projectRoot, backupId) {
  if (!/^[a-zA-Z0-9-]+$/.test(String(backupId || ""))) {
    throw new Error("유효한 backup_id가 필요합니다.");
  }
  const paths = projectPaths(projectRoot);
  const backupRoot = path.join(paths.backups, backupId);
  const [authoring, output, manifest, previousAuthoring, previousOutput, previousState] =
    await Promise.all([
      readFile(path.join(backupRoot, "authoring.html")),
      readFile(path.join(backupRoot, "detail-page.html")),
      readFile(path.join(backupRoot, "manifest.json"), "utf8").then(JSON.parse),
      readMaybe(paths.authoring),
      readMaybe(paths.output),
      readOutputState(paths),
    ]);
  try {
    await atomicWrite(paths.authoring, authoring);
    await atomicWrite(paths.output, output);
    await rm(paths.exportManifest, { force: true });
    for (const media of manifest.media || []) {
      const target = path.join(paths.root, "output", media.path);
      if (!media.existed_before) {
        await rm(target, { force: true });
        continue;
      }
      await atomicWrite(
        target,
        await readFile(path.join(backupRoot, media.path)),
      );
    }
    const state = {
      ...previousState,
      canonical_entry: "output/detail-page.html",
      wing_export_required: true,
      source_revision_id: sourceRevisionId(
        new Date(),
        sha256Bytes(authoring),
      ),
      current_source_revision_sha256:
        sha256Bytes(authoring),
      current_authoring_sha256: sha256Bytes(authoring),
      current_public_sha256: sha256Bytes(output),
      restored_from_backup_id: backupId,
      updated_at: new Date().toISOString(),
    };
    await writeOutputState(paths, state);
    return {
      status: "restored",
      backup_id: backupId,
      wing_export_required: true,
      authoring_sha256: state.current_authoring_sha256,
      public_sha256: state.current_public_sha256,
    };
  } catch (error) {
    await Promise.all([
      restorePrevious(paths.authoring, previousAuthoring),
      restorePrevious(paths.output, previousOutput),
      writeOutputState(paths, previousState),
    ]);
    throw error;
  }
}

export async function markWingExportCompleted(
  projectRoot,
  { exportId, cdnHtml, manifestSha256 },
) {
  if (!/^[a-zA-Z0-9-]+$/.test(String(exportId || ""))) {
    throw new Error("유효한 exportId가 필요합니다.");
  }
  const paths = projectPaths(projectRoot);
  const previousState = await readOutputState(paths);
  const wingHtmlPath = path.join(
    paths.root,
    "output",
    "wing",
    String(exportId),
    "detail-page.html",
  );
  const previousWingHtml = await readMaybe(wingHtmlPath);
  const nextWingHtml = Buffer.from(String(cdnHtml), "utf8");
  try {
    await atomicWrite(wingHtmlPath, nextWingHtml);
    const state = {
      ...previousState,
      wing_export_required: false,
      completed_wing_export_id: exportId,
      completed_wing_manifest_sha256: manifestSha256,
      completed_wing_html_path: posix(
        path.relative(paths.root, wingHtmlPath),
      ),
      completed_wing_html_sha256:
        sha256Bytes(nextWingHtml),
      updated_at: new Date().toISOString(),
    };
    await writeOutputState(paths, state);
    return state;
  } catch (error) {
    await Promise.all([
      restorePrevious(wingHtmlPath, previousWingHtml),
      writeOutputState(paths, previousState),
    ]);
    throw error;
  }
}

export async function readProjectOutputState(projectRoot) {
  return readOutputState(projectPaths(projectRoot));
}

export { BACKUP_LIMIT };
