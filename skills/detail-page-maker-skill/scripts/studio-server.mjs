import { createHash, randomUUID } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DomainError,
  approveAssetVersion,
  approveFinalQa,
  createCheckpoint,
  createJob,
  createRevision,
  lockAssembly,
  projectSummary,
  recordAssetQa,
  recordFinalQa,
  registerAssetVersion,
  saveHtmlLayer,
  updateJobState,
} from "./studio-domain.mjs";
import { createProjectStore } from "./project-store.mjs";

const MIME_BY_EXTENSION = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const EXTENSION_BY_MIME = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
};

function runtimeRoot() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "assets",
    "studio-runtime",
  );
}

function installedSkillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function resolveInside(root, relativePath) {
  const base = path.resolve(root);
  const target = path.resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new DomainError(
      "PATH_OUTSIDE_PROJECT",
      "프로젝트 밖 경로에는 접근할 수 없습니다.",
      403,
    );
  }
  return target;
}

function safeIdentifier(value, prefix = "asset") {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || `${prefix}-${randomUUID().slice(0, 8)}`;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([a-z0-9+/=\s]+)$/i,
  );
  if (!match) {
    throw new DomainError(
      "DATA_URL_INVALID",
      "지원하는 base64 데이터 URL이 필요합니다.",
    );
  }
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
  };
}

async function readJsonBody(request, maxBytes = 80 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new DomainError(
        "REQUEST_TOO_LARGE",
        "업로드 요청이 허용 크기를 초과했습니다.",
        413,
      );
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainError("JSON_INVALID", "JSON 요청을 읽을 수 없습니다.");
  }
}

function sendJson(response, status, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function serveFile(response, filePath, cache = false) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new DomainError("FILE_NOT_FOUND", "파일이 없습니다.", 404);
  const body = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type":
      MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": cache ? "public, max-age=3600" : "no-store",
  });
  response.end(body);
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function persistJobFile(projectRoot, job) {
  const directory = resolveInside(projectRoot, ".studio/jobs");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, `${safeIdentifier(job.id, "job")}.json`),
    `${JSON.stringify(job, null, 2)}\n`,
    "utf8",
  );
}

function currentSelection(state, assetId) {
  const revision = state.revisions.find(
    (item) => item.id === state.currentRevisionId,
  );
  return revision?.assetSelections?.[assetId] || null;
}

function exportLayerRuntime(state) {
  const payload = JSON.stringify({
    layerState: state.html.layerState,
    viewportOverrides: state.html.viewportOverrides,
  }).replace(/</g, "\\u003c");
  return `<script id="detail-page-layer-state">
(() => {
  const state = ${payload};
  const apply = (target, value) => {
    if (!target || !value) return;
    if (typeof value.text === "string") target.innerHTML = value.text;
    if (value.styles && typeof value.styles === "object") Object.assign(target.style, value.styles);
  };
  Object.entries(state.layerState || {}).forEach(([id, value]) => apply(document.querySelector('[data-layer-id="' + CSS.escape(id) + '"]'), value));
  const width = window.innerWidth <= 340 ? "320" : window.innerWidth <= 520 ? "390" : "800";
  Object.entries(state.viewportOverrides?.[width] || {}).forEach(([id, value]) => apply(document.querySelector('[data-layer-id="' + CSS.escape(id) + '"]'), value));
})();
</script>`;
}

async function inlineProjectMedia(projectRoot, htmlPath, html) {
  const htmlDirectory = path.dirname(htmlPath);
  const matches = [...html.matchAll(/\bsrc=(["'])([^"']+)\1/gi)];
  let output = html;
  for (const match of matches) {
    const source = match[2];
    if (
      /^(?:data:|https?:|blob:|#|\/\/)/i.test(source) ||
      source.includes("{{")
    ) {
      continue;
    }
    const clean = source.split(/[?#]/)[0];
    const target = resolveInside(projectRoot, path.relative(projectRoot, path.resolve(htmlDirectory, clean)));
    try {
      const buffer = await readFile(target);
      const mime =
        MIME_BY_EXTENSION[path.extname(target).toLowerCase()]?.split(";")[0] ||
        "application/octet-stream";
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      output = output.replace(match[0], `src=${match[1]}${dataUrl}${match[1]}`);
    } catch {
      // Broken media is caught by final QA. Preserve the original reference in drafts.
    }
  }
  return output;
}

async function buildSingleHtml(projectRoot, state, { draft }) {
  const entry = resolveInside(projectRoot, state.html.entry);
  let html = await readFile(entry, "utf8");
  html = await inlineProjectMedia(projectRoot, entry, html);
  const additions = [
    exportLayerRuntime(state),
    draft
      ? `<div style="position:fixed;z-index:2147483647;top:12px;right:12px;padding:9px 13px;border-radius:8px;background:#f7b955;color:#172033;font:800 12px/1.2 sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.22)">검토용 초안</div>`
      : "",
  ].join("");
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${additions}</body>`);
  } else {
    html += additions;
  }
  return html;
}

async function runTar({ cwd, output }) {
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", output, "-C", cwd, "."], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput || `tar exited with ${code}`));
    });
  });
}

async function buildProjectBundle(projectRoot, state) {
  const stagingRoot = resolveInside(
    projectRoot,
    `.studio/export-staging/${randomUUID()}`,
  );
  const projectStage = path.join(stagingRoot, "project");
  const runtimeStage = path.join(stagingRoot, "runtime");
  await mkdir(projectStage, { recursive: true });
  await mkdir(runtimeStage, { recursive: true });
  const projectEntries = [
    "project.json",
    "product",
    "assets",
    "hyperframes",
    "html",
    "qa",
    "revisions",
    ".studio/jobs",
    ".studio/checkpoints",
    ".studio/events.ndjson",
    ".studio/lock.json",
  ];
  for (const entry of projectEntries) {
    const source = resolveInside(projectRoot, entry);
    try {
      await access(source);
      await cp(source, path.join(projectStage, entry), { recursive: true });
    } catch {
      // Optional project entries are omitted when they do not exist yet.
    }
  }
  await cp(
    path.join(installedSkillRoot(), "assets", "studio-runtime"),
    path.join(runtimeStage, "assets", "studio-runtime"),
    { recursive: true },
  );
  await cp(
    path.join(installedSkillRoot(), "scripts"),
    path.join(runtimeStage, "scripts"),
    { recursive: true },
  );
  const exportDirectory = resolveInside(
    projectRoot,
    state.phase === "published" ? "exports/published" : "exports/drafts",
  );
  await mkdir(exportDirectory, { recursive: true });
  const archivePath = path.join(
    exportDirectory,
    `${safeIdentifier(state.name, "detail-page")}-${state.currentRevisionId}-studio-project.tar.gz`,
  );
  try {
    await runTar({ cwd: stagingRoot, output: archivePath });
  } finally {
    const verifiedStagingBase = resolveInside(
      projectRoot,
      ".studio/export-staging",
    );
    if (stagingRoot.startsWith(`${verifiedStagingBase}${path.sep}`)) {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }
  return archivePath;
}

export async function startStudioServer({
  projectRoot,
  port = 8896,
  host = "127.0.0.1",
  open = true,
}) {
  const root = path.resolve(projectRoot);
  await access(path.join(root, "project.json"));
  const store = createProjectStore(root);
  const clients = new Set();

  function publish(event, state) {
    const payload = `event: project\ndata: ${JSON.stringify({
      event,
      project: projectSummary(state),
    })}\n\n`;
    clients.forEach((response) => response.write(payload));
  }

  async function mutate(type, payload, command) {
    const result = await store.mutate(type, payload, command);
    publish(result.event, result.state);
    return result;
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (request.method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          projectRoot: root,
          now: new Date().toISOString(),
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
        clients.add(response);
        request.on("close", () => clients.delete(response));
        return;
      }

      if (request.method === "GET" && pathname === "/api/project") {
        sendJson(response, 200, projectSummary(await store.load()));
        return;
      }

      if (request.method === "GET" && pathname === "/api/assets") {
        sendJson(response, 200, projectSummary(await store.load()).assetList);
        return;
      }

      if (request.method === "GET" && pathname === "/api/jobs") {
        sendJson(response, 200, Object.values((await store.load()).jobs));
        return;
      }

      if (request.method === "POST" && pathname === "/api/jobs") {
        const body = await readJsonBody(request);
        const result = await mutate("job.created", body, (state) =>
          createJob(state, body),
        );
        await persistJobFile(root, result.result);
        sendJson(response, 201, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/assets/register") {
        const body = await readJsonBody(request);
        const parsed = parseDataUrl(body.dataUrl);
        const extension =
          EXTENSION_BY_MIME[parsed.mime] ||
          path.extname(body.fileName || "").toLowerCase() ||
          ".bin";
        const assetId = safeIdentifier(
          body.assetId || `asset-${body.role || body.name || randomUUID()}`,
        );
        const current = await store.load();
        const nextVersion =
          (current.assets[assetId]?.versions || []).reduce(
            (max, version) => Math.max(max, version.number),
            0,
          ) + 1;
        const relativePath = toPosix(
          path.join(
            "assets",
            current.assets[assetId] ? "candidates" : "source",
            assetId,
            `v${nextVersion}${extension}`,
          ),
        );
        const filePath = resolveInside(root, relativePath);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, parsed.buffer);
        const payload = {
          assetId,
          name: body.name || body.fileName || assetId,
          role: body.role || assetId,
          kind:
            body.kind ||
            (parsed.mime === "image/gif"
              ? "gif"
              : parsed.mime.startsWith("video/")
                ? "video"
                : "image"),
          required: body.required !== false,
          approvalMode: body.approvalMode || "individual",
          dependencies: body.dependencies || [],
          versionPath: relativePath,
          sha256: sha256(parsed.buffer),
          mime: parsed.mime,
          sourceRefs: body.sourceRefs || [],
          prompt: body.prompt || "",
          layers: body.layers || [],
        };
        const result = await mutate("asset.registered", payload, (state) => {
          const registered = registerAssetVersion(state, payload);
          const qaJob = createJob(state, {
            type: "qa.visual",
            assetId,
            version: registered.version.number,
            scope: "asset",
            confirmedByUser: true,
          });
          return { registered, qaJob };
        });
        await persistJobFile(root, result.result.qaJob);
        sendJson(response, 201, {
          asset: result.result.registered.asset,
          version: result.result.registered.version,
          qaJob: result.result.qaJob,
        });
        return;
      }

      const assetJobMatch = pathname.match(/^\/api\/assets\/([^/]+)\/jobs$/);
      if (request.method === "POST" && assetJobMatch) {
        const assetId = assetJobMatch[1];
        const body = await readJsonBody(request);
        const payload = {
          ...body,
          assetId,
          confirmedByUser: body.confirmedByUser === true,
        };
        const result = await mutate("job.created", payload, (state) =>
          createJob(state, payload),
        );
        await persistJobFile(root, result.result);
        sendJson(response, 201, result.result);
        return;
      }

      const jobStateMatch = pathname.match(
        /^\/api\/jobs\/([^/]+)\/(start|complete|fail|cancel)$/,
      );
      if (request.method === "POST" && jobStateMatch) {
        const [, jobId, action] = jobStateMatch;
        const body = await readJsonBody(request);
        const status =
          action === "start"
            ? "running"
            : action === "complete"
              ? "completed"
            : action === "fail"
              ? "failed"
              : "cancelled";
        const result = await mutate(`job.${status}`, { jobId, ...body }, (state) =>
          updateJobState(state, {
            jobId,
            status,
            error: body.error || null,
            result: body.result || null,
          }),
        );
        await persistJobFile(root, result.result);
        sendJson(response, 200, result.result);
        return;
      }

      const qaMatch = pathname.match(/^\/api\/assets\/([^/]+)\/qa$/);
      if (request.method === "POST" && qaMatch) {
        const assetId = qaMatch[1];
        const body = await readJsonBody(request);
        const payload = { ...body, assetId };
        const result = await mutate("asset.qa_recorded", payload, (state) =>
          recordAssetQa(state, payload),
        );
        sendJson(response, 200, result.result);
        return;
      }

      const approvalMatch = pathname.match(
        /^\/api\/assets\/([^/]+)\/approve$/,
      );
      if (request.method === "POST" && approvalMatch) {
        const assetId = approvalMatch[1];
        const body = await readJsonBody(request);
        const payload = { ...body, assetId };
        const result = await mutate("asset.approval_recorded", payload, (state) =>
          approveAssetVersion(state, payload),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/assembly/lock") {
        const body = await readJsonBody(request);
        const result = await mutate("assembly.locked", body, (state) =>
          lockAssembly(state, body),
        );
        await writeFile(
          resolveInside(root, ".studio/lock.json"),
          `${JSON.stringify(result.result, null, 2)}\n`,
          "utf8",
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/revisions") {
        const body = await readJsonBody(request);
        const result = await mutate("revision.created", body, (state) =>
          createRevision(state, body),
        );
        sendJson(response, 201, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/html/layers") {
        const body = await readJsonBody(request);
        const result = await mutate("html.layer_saved", body, (state) =>
          saveHtmlLayer(state, body),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/checkpoints") {
        const body = await readJsonBody(request);
        const result = await mutate("html.checkpoint_created", body, (state) =>
          createCheckpoint(state, body),
        );
        await writeFile(
          resolveInside(
            root,
            `.studio/checkpoints/${safeIdentifier(result.result.id, "checkpoint")}.json`,
          ),
          `${JSON.stringify(result.result, null, 2)}\n`,
          "utf8",
        );
        sendJson(response, 201, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/qa/final") {
        const body = await readJsonBody(request);
        const result = await mutate("qa.final_recorded", body, (state) =>
          recordFinalQa(state, body),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/qa/final/approve") {
        const body = await readJsonBody(request);
        const result = await mutate("qa.final_approved", body, (state) =>
          approveFinalQa(state, body),
        );
        sendJson(response, 200, result.result);
        return;
      }

      if (request.method === "POST" && pathname === "/api/export/draft") {
        const state = await store.load();
        const html = await buildSingleHtml(root, state, { draft: true });
        const filePath = resolveInside(
          root,
          `exports/drafts/${safeIdentifier(state.name, "detail-page")}-${state.currentRevisionId}-draft.html`,
        );
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, html, "utf8");
        sendJson(response, 201, {
          path: toPosix(path.relative(root, filePath)),
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/export/publish") {
        const state = await store.load();
        if (
          state.finalQa.status !== "passed" ||
          state.finalQa.score < 97 ||
          state.finalQa.hardFailures.length > 0 ||
          !state.finalQa.userApproved
        ) {
          throw new DomainError(
            "PUBLISH_GATE_FAILED",
            "게시용 HTML은 97점 이상·하드 실패 0건·사용자 최종 승인이 필요합니다.",
            409,
          );
        }
        const html = await buildSingleHtml(root, state, { draft: false });
        const filePath = resolveInside(
          root,
          `exports/published/${safeIdentifier(state.name, "detail-page")}-${state.currentRevisionId}.html`,
        );
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, html, "utf8");
        sendJson(response, 201, {
          path: toPosix(path.relative(root, filePath)),
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/export/project") {
        const state = await store.load();
        const archivePath = await buildProjectBundle(root, state);
        sendJson(response, 201, {
          path: toPosix(path.relative(root, archivePath)),
        });
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/project/")) {
        const relative = pathname.slice("/project/".length);
        await serveFile(response, resolveInside(root, relative));
        return;
      }

      if (request.method === "GET") {
        const relative =
          pathname === "/" || pathname === "/studio.html"
            ? "studio.html"
            : pathname.replace(/^\/+/, "");
        await serveFile(response, resolveInside(runtimeRoot(), relative), true);
        return;
      }

      sendJson(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: "요청한 Studio 경로가 없습니다.",
        },
      });
    } catch (error) {
      const status = error instanceof DomainError ? error.status : 500;
      sendJson(response, status, {
        error: {
          code:
            error instanceof DomainError
              ? error.code
              : "INTERNAL_SERVER_ERROR",
          message:
            error instanceof DomainError
              ? error.message
              : "Studio 서버에서 오류가 발생했습니다.",
          details: error instanceof DomainError ? error.details : undefined,
        },
      });
      if (!(error instanceof DomainError)) console.error(error);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}/studio.html`;
  if (open) openBrowser(url);
  return {
    server,
    url,
    projectRoot: root,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = args.project;
  if (!projectRoot) {
    console.error("--project 경로가 필요합니다.");
    process.exitCode = 1;
  } else {
    const result = await startStudioServer({
      projectRoot,
      port: Number(args.port || 8896),
      open: args["no-open"] !== true,
    });
    console.log(`Detail Page Studio: ${result.url}`);
    console.log(`Project: ${result.projectRoot}`);
  }
}
