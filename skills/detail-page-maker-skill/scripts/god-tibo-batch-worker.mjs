import { spawn } from "node:child_process";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const GTI_PACKAGE = "god-tibo-imagen@0.3.1";
const DEFAULT_SIZE = "1024x1536";
const MAX_REFERENCE_IMAGES = 5;
export const CLEAN_COMMERCIAL_QUALITY_BLOCK = `QUALITY_GATE:CLEAN_COMMERCIAL
Clean commercial product photography with controlled studio lighting,
smooth continuous gradients, crisp but natural edges, clean shadow transitions,
physically plausible material texture only, low-ISO clarity.
No film grain, no sensor noise, no chromatic noise, no dithering, no speckle,
no crunchy micro-texture, no halftone, no JPEG artifacts, no oversharpening,
no dirty shadow noise, no artificial surface glitter.
Do not hide detail with waxy blur or plastic skin smoothing.`;

export function withCleanCommercialQuality(prompt) {
  const source = String(prompt || "").trim();
  if (source.includes("QUALITY_GATE:CLEAN_COMMERCIAL")) return source;
  return [source, CLEAN_COMMERCIAL_QUALITY_BLOCK].filter(Boolean).join("\n\n");
}

function clampConcurrency(value) {
  const number = Number(value);
  if (!Number.isInteger(number)) return 4;
  return Math.min(4, Math.max(1, number));
}

function safeAssetId(value) {
  return String(value || "product-asset")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requestJson(studioUrl, pathname, body, fetchImpl = fetch) {
  const response = await fetchImpl(new URL(pathname, studioUrl), {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error?.message || `Studio 요청 실패: HTTP ${response.status}`,
    );
    error.code = payload.error?.code || "STUDIO_REQUEST_FAILED";
    throw error;
  }
  return payload;
}

function resolveProjectPath(projectRoot, relativePath) {
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, String(relativePath || ""));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("프로젝트 밖 참조 이미지는 실행기에 전달할 수 없습니다.");
  }
  return target;
}

async function preferredReferencePaths(projectRoot, sourceRefs) {
  const references = Array.isArray(sourceRefs)
    ? sourceRefs.filter(Boolean)
    : [];
  if (references.length === 0) return [];
  const productReferences = references.filter((reference) =>
    String(reference)
      .replaceAll("\\", "/")
      .startsWith("product/ssot/"),
  );
  const directReferences = references.filter(
    (reference) => !productReferences.includes(reference),
  );
  const directPaths = directReferences
    .slice(0, MAX_REFERENCE_IMAGES)
    .map((relativePath) => resolveProjectPath(projectRoot, relativePath));
  const remainingSlots = Math.max(
    0,
    MAX_REFERENCE_IMAGES - directPaths.length,
  );
  if (productReferences.length === 0 || remainingSlots === 0) {
    return directPaths;
  }
  const derivedDirectory = path.join(
    projectRoot,
    "product",
    "ssot",
    "derived",
    "imagegen-reference",
  );
  try {
    const derived = (await readdir(derivedDirectory))
      .filter((name) => name.toLowerCase().endsWith(".png"))
      .sort()
      .slice(0, remainingSlots)
      .map((name) => path.join(derivedDirectory, name));
    if (derived.length > 0) return [...directPaths, ...derived];
  } catch {
    // 정규화 참조가 없으면 잠긴 원본을 제한된 수만 사용한다.
  }
  return [
    ...directPaths,
    ...productReferences
      .slice(0, remainingSlots)
      .map((relativePath) =>
        resolveProjectPath(projectRoot, relativePath),
      ),
  ];
}

function runProcess(command, args, { cwd, timeoutMs = 360_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: "1",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("god-tibo-imagen 생성 시간이 제한을 초과했습니다."));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-12_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-12_000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `god-tibo-imagen 종료 코드 ${code}: ${(stderr || stdout).trim().slice(-2000)}`,
        ),
      );
    });
  });
}

export async function executeGodTiboImage({
  prompt,
  imagePaths,
  outputPath,
  size = DEFAULT_SIZE,
  provider = "private-codex",
}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const npxArgs = [
    "--yes",
    GTI_PACKAGE,
    "--provider",
    provider,
    "--prompt",
    prompt,
    "--size",
    size,
    "--output",
    outputPath,
  ];
  for (const imagePath of imagePaths) {
    npxArgs.push("--image", imagePath);
  }
  const command = process.platform === "win32" ? process.execPath : "npx";
  const args =
    process.platform === "win32"
      ? [
          path.join(
            path.dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            "npx-cli.js",
          ),
          ...npxArgs,
        ]
      : npxArgs;
  await runProcess(command, args, { cwd: path.dirname(outputPath) });
  const buffer = await readFile(outputPath);
  const pngSignature = buffer.subarray(0, 8).toString("hex");
  if (pngSignature !== "89504e470d0a1a0a") {
    throw new Error("god-tibo-imagen 결과가 유효한 PNG가 아닙니다.");
  }
  return {
    savedPath: outputPath,
    dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
  };
}

async function runOneJob({
  studioUrl,
  projectRoot,
  job,
  assets,
  executeImage,
  size,
  provider,
  fetchImpl,
}) {
  await requestJson(
    studioUrl,
    `/api/jobs/${encodeURIComponent(job.id)}/start`,
    {},
    fetchImpl,
  );
  try {
    const referencePaths = await preferredReferencePaths(
      projectRoot,
      job.sourceRefs || [],
    );
    const editedAsset = job.assetId
      ? assets.find((asset) => asset.id === job.assetId)
      : null;
    const imagePaths = editedAsset?.selectedData?.path
      ? [
          resolveProjectPath(projectRoot, editedAsset.selectedData.path),
          ...referencePaths,
        ].slice(0, MAX_REFERENCE_IMAGES)
      : referencePaths;
    const outputPath = path.join(
      projectRoot,
      ".studio",
      "generated",
      "god-tibo-imagen",
      `${safeAssetId(job.id)}.png`,
    );
    const effectivePrompt = withCleanCommercialQuality(job.prompt);
    const generated = await executeImage({
      prompt: effectivePrompt,
      imagePaths,
      outputPath,
      size,
      provider,
      job,
    });
    let dataUrl = generated?.dataUrl;
    if (!dataUrl && generated?.savedPath) {
      const buffer = await readFile(generated.savedPath);
      dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    }
    if (!dataUrl) {
      throw new Error("생성 실행기가 PNG 데이터나 저장 경로를 반환하지 않았습니다.");
    }
    const assetId = safeAssetId(
      job.assetId || job.target?.role || job.target?.name,
    );
    const registered = await requestJson(
      studioUrl,
      "/api/assets/register",
      {
        assetId,
        name: editedAsset?.name || job.target?.name || assetId,
        role: editedAsset?.role || job.target?.role || assetId,
        kind: editedAsset?.kind || "image",
        required:
          editedAsset?.required ?? (job.target?.required !== false),
        dependencies:
          editedAsset?.dependencies || job.target?.dependencies || [],
        fileName: `${assetId}.png`,
        dataUrl,
        sourceRefs: job.sourceRefs || [],
        prompt: effectivePrompt,
        provenance: "imagegen-derived",
        derivedFrom: [
          ...(job.sourceRefs || []),
          ...(editedAsset?.selectedData?.path
            ? [editedAsset.selectedData.path]
            : []),
        ],
      },
      fetchImpl,
    );
    await requestJson(
      studioUrl,
      `/api/jobs/${encodeURIComponent(job.id)}/complete`,
      {
        result: {
          executor: GTI_PACKAGE,
          assetId: registered.asset.id,
          version: registered.version.number,
          path: registered.version.path,
          qaStatus: "pending",
          qualityGate: "CLEAN_COMMERCIAL",
        },
      },
      fetchImpl,
    );
    return {
      jobId: job.id,
      assetId: registered.asset.id,
      version: registered.version.number,
      path: registered.version.path,
    };
  } catch (error) {
    await requestJson(
      studioUrl,
      `/api/jobs/${encodeURIComponent(job.id)}/fail`,
      {
        error: {
          code: error.code || "GOD_TIBO_GENERATION_FAILED",
          message: String(error.message || error).slice(0, 2400),
        },
      },
      fetchImpl,
    ).catch(() => undefined);
    throw error;
  }
}

export async function runGodTiboBatch({
  studioUrl,
  jobIds = [],
  concurrency = 4,
  size = DEFAULT_SIZE,
  provider = "private-codex",
  executeImage = executeGodTiboImage,
  fetchImpl = fetch,
}) {
  const health = await requestJson(
    studioUrl,
    "/api/health",
    undefined,
    fetchImpl,
  );
  const jobs = await requestJson(studioUrl, "/api/jobs", undefined, fetchImpl);
  const assets = await requestJson(
    studioUrl,
    "/api/assets",
    undefined,
    fetchImpl,
  );
  const wanted = new Set(jobIds);
  const selected = jobs.filter(
    (job) =>
      wanted.has(job.id) &&
      [
        "imagegen.generate.product-ssot",
        "imagegen.edit",
      ].includes(job.type) &&
      job.status === "queued",
  );
  if (selected.length !== wanted.size) {
    throw new Error("대기 중인 이미지 생성·수정 작업을 모두 찾지 못했습니다.");
  }
  const completed = [];
  const failed = [];
  let cursor = 0;
  const workerCount = Math.min(clampConcurrency(concurrency), selected.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < selected.length) {
      const job = selected[cursor];
      cursor += 1;
      try {
        completed.push(
          await runOneJob({
            studioUrl,
            projectRoot: health.projectRoot,
            job,
            assets,
            executeImage,
            size,
            provider,
            fetchImpl,
          }),
        );
      } catch (error) {
        failed.push({
          jobId: job.id,
          message: String(error.message || error),
        });
      }
    }
  });
  await Promise.all(workers);
  return {
    executor: GTI_PACKAGE,
    concurrency: workerCount,
    completed,
    failed,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args["studio-url"] || !args.jobs) {
    console.error("--studio-url과 --jobs가 필요합니다.");
    process.exitCode = 1;
  } else {
    const result = await runGodTiboBatch({
      studioUrl: args["studio-url"],
      jobIds: String(args.jobs).split(",").filter(Boolean),
      concurrency: Number(args.concurrency || 4),
      size: args.size || DEFAULT_SIZE,
      provider: args.provider || "private-codex",
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed.length > 0) process.exitCode = 1;
  }
}
