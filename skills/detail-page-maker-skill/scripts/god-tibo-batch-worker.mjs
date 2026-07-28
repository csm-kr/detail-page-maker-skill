import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const GOD_TIBO_SKILL_NAME = "god-tibo-gpt-image2-skill";
export const DEFAULT_BATCH_SIZE = 8;
export const DEFAULT_TARGET_SIZE = "1024x1536";
const MAX_REFERENCE_IMAGES = 16;
const CURRENT_SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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
  if (!Number.isInteger(number)) return DEFAULT_BATCH_SIZE;
  return Math.min(DEFAULT_BATCH_SIZE, Math.max(1, number));
}

function safeAssetId(value) {
  return String(value || "product-asset")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
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
    // 표준화 참조가 없으면 사용자가 등록한 제품 SSOT 원본으로 돌아간다.
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

function runProcess(command, args, { cwd, timeoutMs = 900_000 } = {}) {
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
      reject(new Error("God Tibo GPT Image 2 배치 제한 시간을 초과했습니다."));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-24_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-24_000);
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
          `God Tibo GPT Image 2 종료 코드 ${code}: ${(stderr || stdout).trim().slice(-4000)}`,
        ),
      );
    });
  });
}

export function resolveGodTiboSkillRoot(explicitRoot) {
  const candidates = [
    explicitRoot,
    process.env.GOD_TIBO_GPT_IMAGE2_SKILL_ROOT,
    path.join(
      CURRENT_SKILL_ROOT,
      ".agents",
      "skills",
      GOD_TIBO_SKILL_NAME,
    ),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const root = path.resolve(candidate);
    const runner = path.join(root, "scripts", "tibo-batch.mjs");
    if (existsSync(runner)) return { root, runner };
  }
  throw new Error(
    "로컬 God Tibo GPT Image 2 스킬을 찾지 못했습니다. scripts/setup-local.ps1을 실행하세요.",
  );
}

async function ensureGodTiboRuntime(explicitRoot) {
  const resolved = resolveGodTiboSkillRoot(explicitRoot);
  const runtimePackage = path.join(
    resolved.root,
    "node_modules",
    "god-tibo-imagen",
    "package.json",
  );
  try {
    await Promise.all([access(resolved.runner), access(runtimePackage)]);
  } catch {
    throw new Error(
      `God Tibo GPT Image 2 런타임이 준비되지 않았습니다: ${resolved.root}. npm install --omit=dev를 실행하세요.`,
    );
  }
  return resolved;
}

async function readPng(filePath) {
  const buffer = await readFile(filePath);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`God Tibo 결과가 유효한 PNG가 아닙니다: ${filePath}`);
  }
  return buffer;
}

export async function executeGodTiboBatch({
  items,
  outputDirectory,
  workers = DEFAULT_BATCH_SIZE,
  detailLevel = 2,
  sizeMode = "controllable",
  targetSize = DEFAULT_TARGET_SIZE,
  skillRoot,
  dryRun = false,
}) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 8) {
    throw new Error("God Tibo items 배치는 1~8개여야 합니다.");
  }
  const runtime = await ensureGodTiboRuntime(skillRoot);
  await mkdir(outputDirectory, { recursive: true });
  const jobPath = path.join(outputDirectory, "job.json");
  const job = {
    items: items.map((item) => ({
      prompt: item.prompt,
      references: item.references || [],
    })),
    detail_level: detailLevel,
    workers: clampConcurrency(workers),
    size_mode: sizeMode,
    ...(sizeMode === "controllable" ? { target_size: targetSize } : {}),
    output_dir: ".",
  };
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");
  await runProcess(
    process.execPath,
    [
      runtime.runner,
      "--job",
      jobPath,
      ...(dryRun ? ["--dry-run"] : []),
    ],
    { cwd: runtime.root },
  );
  const manifestPath = path.join(outputDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest.images) || manifest.images.length !== items.length) {
    throw new Error(
      `God Tibo manifest 이미지 수가 요청과 다릅니다: ${manifest.images?.length ?? 0}/${items.length}`,
    );
  }
  const images = [];
  for (const image of manifest.images) {
    const savedPath = path.resolve(image.path);
    if (!dryRun) await readPng(savedPath);
    images.push({ savedPath, manifest: image });
  }
  return { jobPath, manifestPath, manifest, images };
}

async function failJob(studioUrl, job, error, fetchImpl) {
  await requestJson(
    studioUrl,
    `/api/jobs/${encodeURIComponent(job.id)}/fail`,
    {
      error: {
        code: error.code || "GOD_TIBO_GPT_IMAGE2_GENERATION_FAILED",
        message: String(error.message || error).slice(0, 2400),
      },
    },
    fetchImpl,
  ).catch(() => undefined);
}

async function prepareJob({
  studioUrl,
  projectRoot,
  job,
  assets,
  fetchImpl,
}) {
  await requestJson(
    studioUrl,
    `/api/jobs/${encodeURIComponent(job.id)}/start`,
    {},
    fetchImpl,
  );
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
  if (job.type === "imagegen.edit" && imagePaths.length === 0) {
    throw new Error("ImageGen 수정 작업에는 Image 1로 사용할 참조가 필요합니다.");
  }
  return {
    job,
    editedAsset,
    imagePaths,
    effectivePrompt: withCleanCommercialQuality(job.prompt),
    sizeMode: job.type === "imagegen.edit" ? "invariant" : "controllable",
  };
}

async function registerGeneratedAsset({
  studioUrl,
  projectRoot,
  prepared,
  savedPath,
  manifestPath,
  batchSize,
  workers,
  fetchImpl,
}) {
  const buffer = await readPng(savedPath);
  const { job, editedAsset, effectivePrompt } = prepared;
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
      dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
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
        executor: GOD_TIBO_SKILL_NAME,
        batchSize,
        workers,
        manifestPath: manifestPath
          ? path.relative(projectRoot, manifestPath).replaceAll("\\", "/")
          : null,
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
}

async function runInjectedImageWorkers({
  prepared,
  studioUrl,
  projectRoot,
  concurrency,
  size,
  executeImage,
  fetchImpl,
}) {
  const completed = [];
  const failed = [];
  let cursor = 0;
  const workerCount = Math.min(concurrency, prepared.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < prepared.length) {
      const item = prepared[cursor];
      cursor += 1;
      try {
        const generated = await executeImage({
          prompt: item.effectivePrompt,
          imagePaths: item.imagePaths,
          outputPath: path.join(
            projectRoot,
            ".studio",
            "generated",
            GOD_TIBO_SKILL_NAME,
            `${safeAssetId(item.job.id)}.png`,
          ),
          size,
          job: item.job,
        });
        let savedPath = generated?.savedPath;
        if (!savedPath && generated?.dataUrl) {
          savedPath = path.join(
            projectRoot,
            ".studio",
            "generated",
            GOD_TIBO_SKILL_NAME,
            `${safeAssetId(item.job.id)}.png`,
          );
          await mkdir(path.dirname(savedPath), { recursive: true });
          await writeFile(
            savedPath,
            Buffer.from(String(generated.dataUrl).split(",")[1], "base64"),
          );
        }
        completed.push(
          await registerGeneratedAsset({
            studioUrl,
            projectRoot,
            prepared: item,
            savedPath,
            manifestPath: null,
            batchSize: prepared.length,
            workers: workerCount,
            fetchImpl,
          }),
        );
      } catch (error) {
        await failJob(studioUrl, item.job, error, fetchImpl);
        failed.push({
          jobId: item.job.id,
          message: String(error.message || error),
        });
      }
    }
  });
  await Promise.all(workers);
  return { completed, failed, chunksExecuted: 0 };
}

function chunksOf(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function runGodTiboBatch({
  studioUrl,
  jobIds = [],
  concurrency = DEFAULT_BATCH_SIZE,
  size = DEFAULT_TARGET_SIZE,
  detailLevel = 2,
  executeBatch = executeGodTiboBatch,
  executeImage,
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

  const prepared = [];
  const failed = [];
  for (const job of selected) {
    try {
      prepared.push(
        await prepareJob({
          studioUrl,
          projectRoot: health.projectRoot,
          job,
          assets,
          fetchImpl,
        }),
      );
    } catch (error) {
      await failJob(studioUrl, job, error, fetchImpl);
      failed.push({ jobId: job.id, message: String(error.message || error) });
    }
  }

  const requestedWorkers = clampConcurrency(concurrency);
  if (executeImage) {
    const injected = await runInjectedImageWorkers({
      prepared,
      studioUrl,
      projectRoot: health.projectRoot,
      concurrency: requestedWorkers,
      size,
      executeImage,
      fetchImpl,
    });
    return {
      executor: GOD_TIBO_SKILL_NAME,
      concurrency: requestedWorkers,
      batchSize: DEFAULT_BATCH_SIZE,
      completed: injected.completed,
      failed: [...failed, ...injected.failed],
      chunksExecuted: injected.chunksExecuted,
    };
  }

  const completed = [];
  let chunksExecuted = 0;
  const batchRoot = path.join(
    health.projectRoot,
    ".studio",
    "generated",
    GOD_TIBO_SKILL_NAME,
    randomUUID(),
  );
  const groups = [
    prepared.filter((item) => item.sizeMode === "controllable"),
    prepared.filter((item) => item.sizeMode === "invariant"),
  ].filter((group) => group.length > 0);

  for (const group of groups) {
    for (const chunk of chunksOf(group, DEFAULT_BATCH_SIZE)) {
      chunksExecuted += 1;
      const outputDirectory = path.join(
        batchRoot,
        `chunk-${String(chunksExecuted).padStart(3, "0")}`,
      );
      try {
        const generated = await executeBatch({
          items: chunk.map((item) => ({
            prompt: item.effectivePrompt,
            references: item.imagePaths,
          })),
          outputDirectory,
          workers: requestedWorkers,
          detailLevel,
          sizeMode: chunk[0].sizeMode,
          targetSize: size,
        });
        for (let index = 0; index < chunk.length; index += 1) {
          const item = chunk[index];
          try {
            completed.push(
              await registerGeneratedAsset({
                studioUrl,
                projectRoot: health.projectRoot,
                prepared: item,
                savedPath: generated.images[index].savedPath,
                manifestPath: generated.manifestPath,
                batchSize: chunk.length,
                workers: requestedWorkers,
                fetchImpl,
              }),
            );
          } catch (error) {
            await failJob(studioUrl, item.job, error, fetchImpl);
            failed.push({
              jobId: item.job.id,
              message: String(error.message || error),
            });
          }
        }
      } catch (error) {
        for (const item of chunk) {
          await failJob(studioUrl, item.job, error, fetchImpl);
          failed.push({
            jobId: item.job.id,
            message: String(error.message || error),
          });
        }
      }
    }
  }
  return {
    executor: GOD_TIBO_SKILL_NAME,
    concurrency: requestedWorkers,
    batchSize: DEFAULT_BATCH_SIZE,
    completed,
    failed,
    chunksExecuted,
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
      concurrency: Number(args.concurrency || DEFAULT_BATCH_SIZE),
      size: args.size || DEFAULT_TARGET_SIZE,
      detailLevel: Number(args["detail-level"] || 2),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed.length > 0) process.exitCode = 1;
  }
}
