import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MIME_BY_EXTENSION = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const ASSET_STATES = ["pending", "approved", "rejected"];
const ASSET_KINDS = ["image", "gif"];
const IMAGE_EXTENSIONS = new Set([".jpeg", ".jpg", ".png", ".svg", ".webp"]);

class StudioV1Error extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function resolveInside(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new StudioV1Error(
      "PATH_OUTSIDE_PROJECT",
      "프로젝트 밖의 파일에는 접근할 수 없습니다.",
      403,
    );
  }
  return target;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  const body = await readFile(filePath);
  return createHash("sha256").update(body).digest("hex");
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isAllowedAssetFile(fileName, kind) {
  const extension = path.extname(fileName).toLowerCase();
  return kind === "gif" ? extension === ".gif" : IMAGE_EXTENSIONS.has(extension);
}

function assetRecord(projectRoot, filePath, status, kind) {
  const relativePath = toPosix(path.relative(projectRoot, filePath));
  return {
    id: relativePath,
    fileName: path.basename(filePath),
    relativePath,
    previewUrl: `/${relativePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    status,
    kind,
  };
}

async function listAssets(projectRoot) {
  const assets = [];
  for (const status of ASSET_STATES) {
    for (const kind of ASSET_KINDS) {
      const directory = path.join(
        projectRoot,
        "asset",
        "generated",
        status,
        kind,
      );
      await mkdir(directory, { recursive: true });
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (
          !entry.isFile() ||
          entry.name.startsWith(".") ||
          !isAllowedAssetFile(entry.name, kind)
        ) {
          continue;
        }
        assets.push(
          assetRecord(
            projectRoot,
            path.join(directory, entry.name),
            status,
            kind,
          ),
        );
      }
    }
  }
  return assets.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "ko"),
  );
}

async function readManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, "asset", "asset-manifest.json");
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    return {
      schemaVersion: 1,
      studioVersion: 1,
      defaultGifMethod: "hybrid",
      assets: [],
      ...parsed,
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    };
  } catch {
    return {
      schemaVersion: 1,
      studioVersion: 1,
      defaultGifMethod: "hybrid",
      assets: [],
    };
  }
}

async function writeManifest(projectRoot, manifest) {
  const directory = path.join(projectRoot, "asset");
  const target = path.join(directory, "asset-manifest.json");
  const temporary = path.join(directory, ".asset-manifest.json.tmp");
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

function parsePendingAssetPath(relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  const match = normalized.match(
    /^asset\/generated\/pending\/(image|gif)\/([^/]+)$/,
  );
  if (!match) {
    throw new StudioV1Error(
      "PENDING_ASSET_PATH_REQUIRED",
      "pending의 이미지 또는 GIF 파일만 결정할 수 있습니다.",
    );
  }
  return { normalized, kind: match[1], fileName: match[2] };
}

async function decideAsset(projectRoot, payload) {
  if (payload?.confirmedByUser !== true) {
    throw new StudioV1Error(
      "USER_CONFIRMATION_REQUIRED",
      "사용자의 명시적인 승인 또는 반려 확인이 필요합니다.",
      409,
    );
  }
  if (!["approved", "rejected"].includes(payload?.decision)) {
    throw new StudioV1Error(
      "ASSET_DECISION_INVALID",
      "결정은 approved 또는 rejected여야 합니다.",
    );
  }
  const { normalized, kind, fileName } = parsePendingAssetPath(
    payload.relativePath,
  );
  if (!isAllowedAssetFile(fileName, kind)) {
    throw new StudioV1Error(
      "ASSET_FILE_TYPE_INVALID",
      "image에는 PNG·JPG·WEBP·SVG, gif에는 GIF 파일만 사용할 수 있습니다.",
    );
  }
  if (
    kind === "gif" &&
    !/^\d{2,}-[a-z0-9-]+-(?:imagegen-seq|heygenframe|hybrid)-v\d{2,}\.gif$/i.test(
      fileName,
    )
  ) {
    throw new StudioV1Error(
      "GIF_FILE_NAME_INVALID",
      "GIF 파일명에는 순번, 역할, 생성 방식, 버전을 기록하세요. 예: 03-flex-hybrid-v01.gif",
      409,
    );
  }
  const source = resolveInside(projectRoot, normalized);
  if (!(await exists(source))) {
    throw new StudioV1Error(
      "PENDING_ASSET_NOT_FOUND",
      "승인 대기 파일을 찾을 수 없습니다.",
      404,
    );
  }
  const targetRelative = `asset/generated/${payload.decision}/${kind}/${fileName}`;
  const target = resolveInside(projectRoot, targetRelative);
  if (await exists(target)) {
    throw new StudioV1Error(
      "TARGET_EXISTS",
      "같은 이름의 대상 파일이 이미 있습니다. 새 버전 파일명을 사용하세요.",
      409,
    );
  }

  await mkdir(path.dirname(target), { recursive: true });
  await rename(source, target);
  const decidedAt = new Date().toISOString();
  const digest = await sha256(target);
  const record = {
    id: `${kind}:${fileName}`,
    fileName,
    kind,
    method: /-(imagegen-seq|heygenframe|hybrid)-v\d+/i.exec(fileName)?.[1] || null,
    sourcePath: normalized,
    relativePath: targetRelative,
    status: payload.decision,
    sha256: digest,
    approvedBy:
      payload.decision === "approved" ? "local-user" : null,
    rejectedBy:
      payload.decision === "rejected" ? "local-user" : null,
    decidedAt,
    note: String(payload.note || "").trim() || null,
  };

  const manifest = await readManifest(projectRoot);
  manifest.assets = manifest.assets.filter(
    (item) => item?.relativePath !== normalized && item?.id !== record.id,
  );
  manifest.assets.push(record);
  manifest.updatedAt = decidedAt;
  await writeManifest(projectRoot, manifest);
  await appendFile(
    path.join(projectRoot, "asset", "approval-ledger.ndjson"),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );

  return {
    ...assetRecord(projectRoot, target, payload.decision, kind),
    sha256: digest,
    decidedAt,
  };
}

async function gateStatus(projectRoot) {
  const assets = await listAssets(projectRoot);
  const manifest = await readManifest(projectRoot);
  const pendingCount = assets.filter((asset) => asset.status === "pending").length;
  const missingRequired = manifest.assets.filter(
    (asset) => asset?.required === true && asset?.status !== "approved",
  );
  return {
    studioVersion: 1,
    pendingCount,
    missingRequiredCount: missingRequired.length,
    exportAllowed: pendingCount === 0 && missingRequired.length === 0,
  };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new StudioV1Error("JSON_TOO_LARGE", "요청이 너무 큽니다.", 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new StudioV1Error("JSON_INVALID", "JSON 요청을 읽을 수 없습니다.");
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

async function serveFile(response, filePath) {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new StudioV1Error("FILE_NOT_FOUND", "파일이 없습니다.", 404);
  }
  const body = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type":
      MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? { file: "cmd", args: ["/c", "start", "", url] }
      : process.platform === "darwin"
        ? { file: "open", args: [url] }
        : { file: "xdg-open", args: [url] };
  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function resolvePageDirectory(projectRoot) {
  const legacyPageDirectory = path.join(projectRoot, "detail-page");
  if (await exists(path.join(legacyPageDirectory, "studio.html"))) {
    return legacyPageDirectory;
  }
  return path.join(projectRoot, "html");
}

export async function startStudioV1Server({
  projectRoot,
  port = 8896,
  host = "127.0.0.1",
  open = true,
}) {
  const root = path.resolve(projectRoot);
  const rootInfo = await stat(root);
  if (!rootInfo.isDirectory()) {
    throw new Error(`프로젝트 폴더가 아닙니다: ${root}`);
  }
  const pageDirectory = await resolvePageDirectory(root);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (request.method === "GET" && pathname === "/api/v1/assets") {
        sendJson(response, 200, { assets: await listAssets(root) });
        return;
      }
      if (request.method === "GET" && pathname === "/api/v1/gate") {
        sendJson(response, 200, await gateStatus(root));
        return;
      }
      if (
        request.method === "POST" &&
        pathname === "/api/v1/assets/decision"
      ) {
        const asset = await decideAsset(root, await readJson(request));
        sendJson(response, 200, { asset, gate: await gateStatus(root) });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        throw new StudioV1Error(
          "METHOD_NOT_ALLOWED",
          "지원하지 않는 요청 방식입니다.",
          405,
        );
      }

      if (pathname === "/" || pathname === "/studio.html") {
        await serveFile(response, path.join(pageDirectory, "studio.html"));
        return;
      }
      const pageFile = path.join(pageDirectory, pathname.replace(/^\/+/, ""));
      if (pathname !== "/" && (await exists(pageFile))) {
        await serveFile(response, pageFile);
        return;
      }

      await serveFile(
        response,
        resolveInside(root, pathname.replace(/^\/+/, "")),
      );
    } catch (error) {
      const status = error instanceof StudioV1Error ? error.status : 500;
      sendJson(response, status, {
        error: {
          code:
            error instanceof StudioV1Error
              ? error.code
              : "INTERNAL_SERVER_ERROR",
          message:
            error instanceof StudioV1Error
              ? error.message
              : "Studio v1 서버에서 오류가 발생했습니다.",
        },
      });
      if (!(error instanceof StudioV1Error)) console.error(error);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}/studio.html`;
  if (open) openBrowser(url);
  return { server, url, projectRoot: root };
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
  if (!args.project) {
    console.error("--project 경로가 필요합니다.");
    process.exitCode = 1;
  } else {
    const result = await startStudioV1Server({
      projectRoot: args.project,
      port: Number(args.port || 8896),
      open: args["no-open"] !== true,
    });
    console.log(`Detail Page Studio v1: ${result.url}`);
    console.log(`Project: ${result.projectRoot}`);
  }
}
