import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CANONICAL_RELATIVE_PATH = path.join("output", "detail-page.html");
const BACKUP_RELATIVE_ROOT = path.join(
  ".detail-page",
  "backups",
  "lean-studio",
);
const BACKUP_LIMIT = 10;
const MAX_HTML_BYTES = 30 * 1024 * 1024;
const OUTPUT_WIDTH = 780;

const MIME_BY_EXTENSION = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export class LeanStudioError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = "LeanStudioError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function resolveInside(root, relativePath, label = "path") {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new LeanStudioError(
      "PATH_OUTSIDE_PROJECT",
      `${label}가 프로젝트 밖을 가리킵니다.`,
      403,
    );
  }
  return target;
}

function projectPaths(projectRoot) {
  const root = path.resolve(projectRoot);
  return {
    root,
    outputRoot: path.join(root, "output"),
    canonical: path.join(root, CANONICAL_RELATIVE_PATH),
    backups: path.join(root, BACKUP_RELATIVE_ROOT),
  };
}

async function atomicWrite(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${randomUUID()}`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function decodeHtmlText(value) {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function attributeValue(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(
      `\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : null;
}

function normalizedAssetReference(value) {
  const withoutQuery = String(value || "").split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
}

function gifFrameCount(bytes) {
  if (
    bytes.length < 10 ||
    bytes.subarray(0, 3).toString("ascii") !== "GIF"
  ) {
    return 0;
  }
  let count = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x2c) count += 1;
  }
  return count;
}

function animatedWebpFrameCount(bytes) {
  if (
    bytes.length < 16 ||
    bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
    bytes.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return 0;
  }
  let count = 0;
  for (let index = 12; index + 4 <= bytes.length; index += 1) {
    if (bytes.subarray(index, index + 4).toString("ascii") === "ANMF") {
      count += 1;
      index += 3;
    }
  }
  return count;
}

async function inspectLocalImage(projectRoot, reference) {
  const decoded = normalizedAssetReference(reference);
  if (decoded === null || decoded.includes("\0")) {
    throw new LeanStudioError(
      "ASSET_URL_INVALID",
      `이미지 경로를 해석할 수 없습니다: ${reference}`,
    );
  }
  let relative;
  if (decoded.startsWith("/output/")) {
    relative = decoded.slice("/output/".length);
  } else if (decoded.startsWith("/")) {
    throw new LeanStudioError(
      "ASSET_OUTSIDE_OUTPUT",
      `로컬 이미지는 output 아래에 있어야 합니다: ${reference}`,
    );
  } else {
    relative = decoded;
  }
  const outputRoot = path.join(path.resolve(projectRoot), "output");
  const target = resolveInside(outputRoot, relative, "image");
  const info = await lstat(target).catch(() => null);
  if (!info || !info.isFile() || info.isSymbolicLink() || info.size < 1) {
    throw new LeanStudioError(
      "ASSET_MISSING",
      `이미지 파일이 없거나 비어 있습니다: ${reference}`,
    );
  }
  const bytes = await readFile(target);
  const normalized = relative.split(path.sep).join("/");
  let frames = null;
  if (/\.gif$/i.test(normalized)) frames = gifFrameCount(bytes);
  if (/\.webp$/i.test(normalized) && /(?:^|\/)media\/gifs\//i.test(normalized)) {
    frames = animatedWebpFrameCount(bytes);
  }
  return {
    path: `output/${normalized}`,
    bytes: bytes.length,
    sha256: sha256(bytes),
    animation_frame_count: frames,
  };
}

/**
 * Fast, deterministic checks for the few contracts the lean workflow controls.
 * Visual judgment remains with the agent/operator in the 780px Studio preview.
 */
export async function runLeanQa(projectRoot, html) {
  const source = String(html || "");
  const errors = [];
  const warnings = [];
  const media = [];
  const byteLength = Buffer.byteLength(source, "utf8");

  if (byteLength < 1) {
    errors.push({ code: "HTML_EMPTY", message: "HTML이 비어 있습니다." });
  }
  if (byteLength > MAX_HTML_BYTES) {
    errors.push({
      code: "HTML_TOO_LARGE",
      message: `HTML은 ${MAX_HTML_BYTES} bytes를 넘을 수 없습니다.`,
    });
  }
  if (!/<html\b/i.test(source) || !/<body\b/i.test(source)) {
    errors.push({
      code: "HTML_DOCUMENT_REQUIRED",
      message: "완성된 <html>과 <body> 문서가 필요합니다.",
    });
  }
  if (/\{\{[^{}]+\}\}|\[\[[^\[\]]+\]\]/.test(source)) {
    errors.push({
      code: "UNRESOLVED_PLACEHOLDER",
      message: "고객 HTML에 미치환 placeholder가 남아 있습니다.",
    });
  }
  const retiredWidth = OUTPUT_WIDTH / 2;
  const retiredWidthPattern = new RegExp(
    `(?:^|[{;\\s"'])(?:width|max-width|min-width)\\s*[:=]\\s*["']?${retiredWidth}(?:px)?\\b`,
    "i",
  );
  if (retiredWidthPattern.test(source)) {
    errors.push({
      code: "LEGACY_NARROW_WIDTH",
      message: "이 경로는 780px 단일 제작 기준입니다. 과거 축소 폭 규칙을 제거하세요.",
    });
  }
  const internalMetadataPatterns = [
    {
      code: "INTERNAL_DATA_ATTRIBUTE",
      pattern:
        /\sdata-(?:agent|prompt|qa|approval|workflow|studio|edit)(?:-[a-z0-9_-]+)?\s*=/i,
      message: "고객 HTML에 제작·QA·Studio 내부 data 속성을 남길 수 없습니다.",
    },
    {
      code: "LOCAL_FILE_URL_EXPOSED",
      pattern: /file:\/\//i,
      message: "고객 HTML에 file:// URL을 남길 수 없습니다.",
    },
    {
      code: "LOCAL_USER_PATH_EXPOSED",
      pattern: /\/Users\//,
      message: "고객 HTML에 로컬 사용자 경로를 남길 수 없습니다.",
    },
    {
      code: "INTERNAL_PROJECT_PATH_EXPOSED",
      pattern: /\.detail-page\//i,
      message: "고객 HTML에 .detail-page 내부 경로를 남길 수 없습니다.",
    },
  ];
  for (const rule of internalMetadataPatterns) {
    if (rule.pattern.test(source)) {
      errors.push({ code: rule.code, message: rule.message });
    }
  }
  if (!/780(?:px)?\b/i.test(source)) {
    warnings.push({
      code: "DELIVERY_WIDTH_IMPLICIT",
      message: "HTML에 780px 전달 폭이 명시적으로 보이지 않습니다. Studio 미리보기에서 너비를 확인하세요.",
    });
  }

  const imageTags = [...source.matchAll(/<img\b[^>]*>/gi)].map(
    (match) => match[0],
  );
  for (let index = 0; index < imageTags.length; index += 1) {
    const tag = imageTags[index];
    const src = attributeValue(tag, "src");
    const alt = attributeValue(tag, "alt");
    if (!src) {
      errors.push({
        code: "IMAGE_SRC_MISSING",
        message: `${index + 1}번째 이미지에 src가 없습니다.`,
      });
      continue;
    }
    if (alt === null || !alt.trim()) {
      warnings.push({
        code: "IMAGE_ALT_MISSING",
        message: `${index + 1}번째 이미지의 alt를 확인하세요.`,
      });
    }
    if (/^(?:data:image\/|https:\/\/)/i.test(src)) continue;
    if (/^(?:javascript:|data:(?!image\/)|blob:|file:|http:\/\/)/i.test(src)) {
      errors.push({
        code: "IMAGE_URL_UNSAFE",
        message: `공개본에 적합하지 않은 이미지 URL입니다: ${src}`,
      });
      continue;
    }
    try {
      const item = await inspectLocalImage(projectRoot, src);
      media.push(item);
      if (
        Number.isInteger(item.animation_frame_count) &&
        item.animation_frame_count < 2
      ) {
        errors.push({
          code: "MOTION_NOT_ANIMATED",
          message: `움직임 자산에 2개 이상의 프레임이 필요합니다: ${src}`,
        });
      }
    } catch (error) {
      errors.push({
        code: error.code || "ASSET_CHECK_FAILED",
        message: error.message,
      });
    }
  }

  if (imageTags.length === 0) {
    warnings.push({
      code: "NO_IMAGES",
      message: "상세페이지에 이미지가 없습니다.",
    });
  }

  const headingPattern = /<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of source.matchAll(headingPattern)) {
    const inner = match[2];
    const text = decodeHtmlText(inner);
    const lineBreakCount = (inner.match(/<br\b/gi) || []).length;
    if (lineBreakCount > 2) {
      warnings.push({
        code: "HEADING_TOO_MANY_LINES",
        message: `제목은 2~3줄을 기본으로 검토하세요: ${text.slice(0, 60)}`,
      });
    }
    if (text.replace(/\s/g, "").length >= 22 && lineBreakCount === 0) {
      warnings.push({
        code: "HEADING_CHUNKING_REVIEW",
        message: `긴 제목의 문맥·의미 단위 줄바꿈을 확인하세요: ${text.slice(0, 60)}`,
      });
    }
    if (
      /\d[\d,.]*\s*<br\b[^>]*>\s*(?:mm|cm|m|ml|l|g|kg|%|개|매|개입|세트|초|분|시간)(?=\s|<|$)/i.test(
        inner,
      )
    ) {
      errors.push({
        code: "NUMBER_UNIT_SPLIT",
        message: `숫자와 단위를 서로 다른 줄로 나누지 마세요: ${text.slice(0, 60)}`,
      });
    }
  }

  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
      width_css_px: OUTPUT_WIDTH,
    errors,
    warnings,
    summary: {
      html_bytes: byteLength,
      image_count: imageTags.length,
      local_media_count: media.length,
      motion_count: media.filter(
        (item) =>
          Number.isInteger(item.animation_frame_count) &&
          item.animation_frame_count >= 2,
      ).length,
    },
    media,
  };
}

async function listBackups(paths) {
  if (!(await exists(paths.backups))) return [];
  const entries = await readdir(paths.backups, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
    const target = path.join(paths.backups, entry.name);
    const info = await stat(target);
    const bytes = await readFile(target);
    backups.push({
      id: entry.name.slice(0, -".html".length),
      bytes: info.size,
      sha256: sha256(bytes),
      saved_at: info.mtime.toISOString(),
    });
  }
  return backups.sort((left, right) => right.id.localeCompare(left.id));
}

async function trimBackups(paths) {
  const backups = await listBackups(paths);
  await Promise.all(
    backups.slice(BACKUP_LIMIT).map((backup) =>
      rm(path.join(paths.backups, `${backup.id}.html`), { force: true }),
    ),
  );
}

async function createBackup(paths, bytes, now = new Date()) {
  if (!bytes || bytes.length === 0) return null;
  await mkdir(paths.backups, { recursive: true });
  const timestamp = now.toISOString().replace(/[-:.]/g, "");
  const id = `${timestamp}-${sha256(bytes).slice(0, 10)}-${randomUUID().slice(0, 6)}`;
  await writeFile(path.join(paths.backups, `${id}.html`), bytes, { flag: "wx" });
  await trimBackups(paths);
  return id;
}

async function readCanonical(paths) {
  let bytes;
  try {
    const info = await lstat(paths.canonical);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("not a file");
    bytes = await readFile(paths.canonical);
  } catch {
    throw new LeanStudioError(
      "CANONICAL_HTML_MISSING",
      `정본 HTML을 찾을 수 없습니다: ${CANONICAL_RELATIVE_PATH}`,
      404,
    );
  }
  return {
    html: bytes.toString("utf8"),
    bytes,
    sha256: sha256(bytes),
  };
}

async function saveCanonical(paths, html, expectedSha256) {
  const current = await readCanonical(paths);
  if (expectedSha256 && expectedSha256 !== current.sha256) {
    throw new LeanStudioError(
      "EDIT_CONFLICT",
      "다른 작업이 정본 HTML을 변경했습니다. 최신본을 다시 불러오세요.",
      409,
      { expected_sha256: expectedSha256, current_sha256: current.sha256 },
    );
  }
  const nextBytes = Buffer.from(String(html || ""), "utf8");
  const qa = await runLeanQa(paths.root, nextBytes.toString("utf8"));
  if (qa.status !== "PASS") {
    throw new LeanStudioError(
      "LEAN_QA_FAILED",
      "저장 전 lean QA를 통과하지 못했습니다.",
      422,
      qa,
    );
  }
  if (sha256(nextBytes) === current.sha256) {
    return {
      status: "unchanged",
      sha256: current.sha256,
      backup_id: null,
      qa,
    };
  }
  const backupId = await createBackup(paths, current.bytes);
  await atomicWrite(paths.canonical, nextBytes);
  return {
    status: "saved",
    sha256: sha256(nextBytes),
    backup_id: backupId,
    qa,
  };
}

async function restoreBackup(paths, backupId, expectedSha256) {
  if (!/^[a-zA-Z0-9-]+$/.test(String(backupId || ""))) {
    throw new LeanStudioError("BACKUP_ID_INVALID", "올바른 백업 ID가 필요합니다.");
  }
  const backupPath = resolveInside(
    paths.backups,
    `${backupId}.html`,
    "backup",
  );
  const html = await readFile(backupPath, "utf8").catch(() => null);
  if (html === null) {
    throw new LeanStudioError("BACKUP_NOT_FOUND", "백업을 찾을 수 없습니다.", 404);
  }
  return saveCanonical(paths, html, expectedSha256);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_HTML_BYTES + 1024 * 1024) {
      throw new LeanStudioError("REQUEST_TOO_LARGE", "요청이 너무 큽니다.", 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new LeanStudioError("JSON_INVALID", "JSON 요청을 해석할 수 없습니다.");
  }
}

function sendJson(response, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendHtml(response, html) {
  const body = Buffer.from(html, "utf8");
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function studioHtml(capabilityToken) {
  const token = JSON.stringify(capabilityToken);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Detail Page Lean Studio</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#17202a;background:#eef1f4}
    *{box-sizing:border-box}body{margin:0}.bar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;padding:10px 14px;background:#17202a;color:#fff;box-shadow:0 2px 12px #0003}
    button{border:0;border-radius:8px;padding:9px 13px;font-weight:700;cursor:pointer}.primary{background:#ffca28}.danger{background:#ff6b6b}.ghost{background:#fff;color:#17202a}.status{margin-left:auto;max-width:42vw;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    main{padding:18px}.stage{width:824px;margin:0 auto}.label{display:flex;justify-content:space-between;margin:0 0 8px;color:#58636f;font-size:13px}.viewport{width:804px;padding:12px;background:#d9dde2;border-radius:12px;box-shadow:0 12px 36px #1b263533;overflow:hidden}
    iframe{display:block;width:780px;min-height:760px;border:0;background:#fff}.source{display:none;width:780px;min-height:760px;padding:18px;border:0;resize:vertical;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}.source.open{display:block}.source.open+iframe{display:none}
    .panel{width:804px;margin:14px auto;padding:12px 14px;border-radius:10px;background:#fff;color:#303942;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}.panel.pass{border-left:5px solid #2f9e44}.panel.fail{border-left:5px solid #e03131}.panel.warn{border-left:5px solid #f59f00}
    @media(max-width:860px){main{padding:10px}.stage{margin:0}.status{display:none}}
  </style>
</head>
<body>
  <header class="bar">
    <button class="primary" id="save">Save + QA</button>
    <button class="ghost" id="sourceToggle">HTML source</button>
    <button class="ghost" id="reload">Reload</button>
    <button class="ghost" id="backups">Backups</button>
    <button class="ghost" id="dryRun">Wing dry-run</button>
    <button class="danger" id="publish">Wing CDN publish</button>
    <span class="status" id="status">Loading…</span>
  </header>
  <main>
    <section class="stage">
      <div class="label"><b>780px canonical preview</b><span id="metrics"></span></div>
      <div class="viewport">
        <textarea class="source" id="source" spellcheck="false"></textarea>
        <iframe id="preview" sandbox="allow-same-origin" title="780px detail page preview"></iframe>
      </div>
    </section>
    <pre class="panel" id="result">저장 전에 미리보기에서 카피 줄바꿈과 중앙 정렬을 확인하세요.</pre>
  </main>
  <script>
    const TOKEN=${token};
    const preview=document.querySelector('#preview');
    const source=document.querySelector('#source');
    const result=document.querySelector('#result');
    const status=document.querySelector('#status');
    const metrics=document.querySelector('#metrics');
    let digest='';
    let sourceMode=false;
    const api=async(url,options={})=>{
      const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','x-lean-studio-token':TOKEN,...(options.headers||{})}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(payload.message||'Request failed');error.payload=payload;throw error}return payload;
    };
    const show=(payload)=>{
      const qa=payload.qa||payload.details||payload;
      result.className='panel '+(qa.status==='FAIL'?'fail':qa.warnings?.length?'warn':'pass');
      result.textContent=JSON.stringify(payload,null,2);
    };
    const setEditable=()=>{
      const doc=preview.contentDocument;if(!doc)return;
      try{doc.designMode='on'}catch{}
      const width=Math.ceil(Math.max(doc.documentElement.scrollWidth,doc.body?.scrollWidth||0));
      const overflow=Math.max(0,width-780);
      metrics.textContent='rendered '+width+'px'+(overflow?' · overflow +'+overflow+'px':' · no overflow');
      metrics.style.color=overflow?'#c92a2a':'#2b8a3e';
      preview.style.height=Math.min(6000,Math.max(760,doc.documentElement.scrollHeight))+'px';
    };
    preview.addEventListener('load',setEditable);
    const load=async()=>{
      const documentState=await api('/api/document');digest=documentState.sha256;
      source.value=documentState.html;preview.src='/output/detail-page.html?edit='+Date.now();
      status.textContent='Loaded '+digest.slice(0,10);show(documentState.qa);
    };
    const serializePreview=()=>{
      const doc=preview.contentDocument;if(!doc?.documentElement)throw new Error('Preview is not ready');
      const doctype=doc.doctype?'<!doctype '+doc.doctype.name+'>\\n':'<!doctype html>\\n';
      return doctype+doc.documentElement.outerHTML;
    };
    const serialize=()=>sourceMode?source.value:serializePreview();
    document.querySelector('#sourceToggle').onclick=()=>{
      sourceMode=!sourceMode;source.classList.toggle('open',sourceMode);
      if(sourceMode){source.value=serializePreview();source.focus()}else{preview.srcdoc=source.value}
    };
    document.querySelector('#reload').onclick=load;
    document.querySelector('#save').onclick=async()=>{
      try{status.textContent='Saving…';const payload=await api('/api/document',{method:'POST',body:JSON.stringify({html:serialize(),expected_sha256:digest})});digest=payload.sha256;status.textContent='Saved '+digest.slice(0,10);show(payload);await load()}catch(error){status.textContent='Save failed';show(error.payload||{message:error.message})}
    };
    document.querySelector('#backups').onclick=async()=>{
      try{const payload=await api('/api/backups');show(payload);const id=prompt('복구할 backup ID (취소하면 조회만):',payload.backups?.[0]?.id||'');if(!id)return;const restored=await api('/api/restore',{method:'POST',body:JSON.stringify({backup_id:id,expected_sha256:digest})});show(restored);await load()}catch(error){show(error.payload||{message:error.message})}
    };
    document.querySelector('#dryRun').onclick=async()=>{try{status.textContent='Planning Wing export…';const payload=await api('/api/wing/export',{method:'POST',body:JSON.stringify({mode:'dry-run'})});show(payload);status.textContent='Wing dry-run ready'}catch(error){show(error.payload||{message:error.message});status.textContent='Wing dry-run failed'}};
    document.querySelector('#publish').onclick=async()=>{if(!confirm('새 CDN namespace로 실제 게시할까요? 이전 export는 덮어쓰지 않습니다.'))return;try{status.textContent='Publishing Wing…';const payload=await api('/api/wing/export',{method:'POST',body:JSON.stringify({mode:'publish',confirm:'PUBLISH_CDN'})});show(payload);status.textContent='Wing published'}catch(error){show(error.payload||{message:error.message});status.textContent='Wing publish failed'}};
    load().catch(error=>show(error.payload||{message:error.message}));
  </script>
</body>
</html>`;
}

function requestPath(request) {
  let parsed;
  try {
    parsed = new URL(request.url, "http://127.0.0.1");
  } catch {
    throw new LeanStudioError("URL_INVALID", "요청 URL이 올바르지 않습니다.");
  }
  return parsed;
}

function assertMutationAuthorized(request, capabilityToken) {
  if (request.headers["x-lean-studio-token"] !== capabilityToken) {
    throw new LeanStudioError("CAPABILITY_REQUIRED", "Studio 저장 권한이 필요합니다.", 403);
  }
}

async function serveOutputFile(response, paths, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname.slice("/output/".length));
  } catch {
    throw new LeanStudioError("PATH_INVALID", "파일 경로를 해석할 수 없습니다.");
  }
  if (decoded.includes("\\") || decoded.includes("\0")) {
    throw new LeanStudioError("PATH_INVALID", "파일 경로가 올바르지 않습니다.");
  }
  const target = resolveInside(paths.outputRoot, decoded, "output file");
  const info = await lstat(target).catch(() => null);
  if (!info || !info.isFile() || info.isSymbolicLink()) {
    throw new LeanStudioError("FILE_NOT_FOUND", "파일을 찾을 수 없습니다.", 404);
  }
  const body = await readFile(target);
  response.writeHead(200, {
    "Content-Type": MIME_BY_EXTENSION.get(path.extname(target).toLowerCase()) || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

export async function startLeanStudioServer({
  projectRoot,
  host = "127.0.0.1",
  port = 0,
  capabilityToken = randomBytes(24).toString("hex"),
} = {}) {
  if (!projectRoot) {
    throw new LeanStudioError("PROJECT_REQUIRED", "projectRoot가 필요합니다.");
  }
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    throw new LeanStudioError(
      "LOOPBACK_ONLY",
      "Lean Studio는 로컬 loopback 주소에서만 실행합니다.",
    );
  }
  const paths = projectPaths(projectRoot);
  await readCanonical(paths);
  let mutationQueue = Promise.resolve();
  const enqueue = (operation) => {
    const queued = mutationQueue.then(operation, operation);
    mutationQueue = queued.catch(() => {});
    return queued;
  };

  const server = http.createServer(async (request, response) => {
    try {
      const url = requestPath(request);
      if (request.method === "GET" && url.pathname === "/") {
        sendHtml(response, studioHtml(capabilityToken));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/document") {
        const current = await readCanonical(paths);
        sendJson(response, 200, {
          canonical_path: "output/detail-page.html",
          html: current.html,
          sha256: current.sha256,
          qa: await runLeanQa(paths.root, current.html),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/document") {
        assertMutationAuthorized(request, capabilityToken);
        const body = await readJson(request);
        const saved = await enqueue(() =>
          saveCanonical(paths, body.html, body.expected_sha256),
        );
        sendJson(response, 200, saved);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/qa") {
        assertMutationAuthorized(request, capabilityToken);
        const body = await readJson(request);
        const html =
          typeof body.html === "string"
            ? body.html
            : (await readCanonical(paths)).html;
        sendJson(response, 200, await runLeanQa(paths.root, html));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/backups") {
        sendJson(response, 200, { backups: await listBackups(paths) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/restore") {
        assertMutationAuthorized(request, capabilityToken);
        const body = await readJson(request);
        const restored = await enqueue(() =>
          restoreBackup(paths, body.backup_id, body.expected_sha256),
        );
        sendJson(response, 200, restored);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/wing/export") {
        assertMutationAuthorized(request, capabilityToken);
        const body = await readJson(request);
        const mode = body.mode === "publish" ? "publish" : "dry-run";
        if (mode === "publish" && body.confirm !== "PUBLISH_CDN") {
          throw new LeanStudioError(
            "PUBLISH_CONFIRMATION_REQUIRED",
            "실제 CDN 게시에는 PUBLISH_CDN 확인이 필요합니다.",
          );
        }
        const { runLeanWingExport } = await import("./lean-wing-export.mjs");
        const address = server.address();
        const authority = `${host === "::1" ? "[::1]" : host}:${address.port}`;
        const exported = await runLeanWingExport({
          projectRoot: paths.root,
          mode,
          confirm: body.confirm,
          pageUrl: `http://${authority}/output/detail-page.html`,
        });
        sendJson(response, 200, exported);
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/output/")) {
        await serveOutputFile(response, paths, url.pathname);
        return;
      }
      throw new LeanStudioError("NOT_FOUND", "경로를 찾을 수 없습니다.", 404);
    } catch (error) {
      const status = error instanceof LeanStudioError ? error.status : 500;
      sendJson(response, status, {
        code: error.code || "LEAN_STUDIO_ERROR",
        message: error.message || "Lean Studio 오류",
        ...(error.details ? { details: error.details } : {}),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const authority = `${host === "::1" ? "[::1]" : host}:${address.port}`;
  return {
    server,
    token: capabilityToken,
    url: `http://${authority}/`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") options.projectRoot = argv[++index];
    else if (arg === "--host") options.host = argv[++index];
    else if (arg === "--port") options.port = Number.parseInt(argv[++index], 10);
    else throw new LeanStudioError("ARGUMENT_INVALID", `알 수 없는 인자: ${arg}`);
  }
  return options;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.projectRoot) throw new LeanStudioError("PROJECT_REQUIRED", "--project 경로가 필요합니다.");
    const runtime = await startLeanStudioServer(options);
    process.stdout.write(`Lean Studio: ${runtime.url}\n`);
  } catch (error) {
    process.stderr.write(`ERROR [${error.code || "LEAN_STUDIO_ERROR"}] ${error.message}\n`);
    process.exitCode = 1;
  }
}

export { BACKUP_LIMIT, CANONICAL_RELATIVE_PATH };
