#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".txt",
  ".yaml",
  ".yml",
]);

const LEGACY_DIRECTORY_MAPPINGS = [
  ["assets/gifs/", "asset/generated/approved/gif/"],
  ["assets/posters/", "asset/output/gif/posters/"],
  ["assets/product-ssot/source/", "asset/input/product-ssot/"],
  ["assets/product-ssot/verified/", "asset/ssot/verified/"],
  ["assets/product-ssot/cutout/", "asset/ssot/cutout/"],
  ["assets/generated/", "asset/deprecated/image/generated-backgrounds/"],
];

function parseArguments(argv) {
  const options = {
    apply: false,
    json: false,
    project: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--project") options.project = argv[++index] || "";
    else throw new Error(`알 수 없는 인자입니다: ${argument}`);
  }
  if (!options.project) {
    throw new Error("--project <프로젝트 폴더>가 필요합니다.");
  }
  return options;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function safeSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function resolveInside(root, relativePath) {
  const base = path.resolve(root);
  const target = path.resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error(`프로젝트 밖 경로는 사용할 수 없습니다: ${relativePath}`);
  }
  return target;
}

async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  await visit(root);
  return files.sort((left, right) => left.localeCompare(right, "ko"));
}

async function sha256(filePath) {
  const digest = createHash("sha256");
  await new Promise((resolve, reject) => {
    const input = createReadStream(filePath);
    input.on("data", (chunk) => digest.update(chunk));
    input.on("error", reject);
    input.on("end", resolve);
  });
  return digest.digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function pageAssetReferences(html) {
  const references = new Map();
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const source = tag[0].match(/\bsrc="([^"]+)"/i)?.[1] || "";
    if (!source.includes("../assets/")) continue;
    const withoutQuery = source.replace(/[?#].*$/, "");
    const projectRelative = withoutQuery.replace(/^\.\.\//, "");
    const assetId =
      tag[0].match(/\bdata-asset-id="([^"]+)"/i)?.[1] ||
      tag[0].match(/\bdata-image-id="([^"]+)"/i)?.[1] ||
      `LEGACY-${safeSlug(path.basename(projectRelative, path.extname(projectRelative)))}`;
    references.set(projectRelative, assetId);
  }
  return references;
}

function destinationFor({
  legacyRelative,
  acceptedCommercial,
  deprecatedCommercial,
  publishedGifs,
}) {
  const normalized = toPosix(legacyRelative);
  const fileName = path.posix.basename(normalized);

  if (normalized === "commercial/asset-manifest.json") {
    return "asset/manifests/commercial-asset-manifest.json";
  }
  if (normalized.startsWith("commercial/")) {
    if (acceptedCommercial.has(fileName)) {
      return `asset/generated/approved/image/${fileName}`;
    }
    const category = deprecatedCommercial.has(fileName)
      ? "image"
      : "image/unclassified";
    return `asset/deprecated/${category}/${fileName}`;
  }

  if (normalized === "gifs/gif-manifest.json") {
    return "asset/manifests/gif-manifest.json";
  }
  if (normalized === "gifs/README.md") {
    return "asset/manifests/gifs-README.md";
  }
  if (normalized.startsWith("gifs/")) {
    return publishedGifs.has(fileName)
      ? `asset/generated/approved/gif/${fileName}`
      : `asset/deprecated/gif/${fileName}`;
  }

  if (normalized.startsWith("posters/")) {
    return `asset/output/gif/posters/${normalized.slice("posters/".length)}`;
  }

  if (normalized === "generated/asset-manifest.json") {
    return "asset/manifests/legacy-generated-asset-manifest.json";
  }
  if (normalized.startsWith("generated/")) {
    return `asset/deprecated/image/generated-backgrounds/${normalized.slice(
      "generated/".length,
    )}`;
  }

  if (
    normalized ===
    "product-ssot/source/real-product-raw/Flux2-Klein_00355_.png"
  ) {
    return "asset/ssot/authoritative/Flux2-Klein_00355_.png";
  }
  if (normalized.startsWith("product-ssot/source/")) {
    return `asset/input/product-ssot/${normalized.slice(
      "product-ssot/source/".length,
    )}`;
  }
  if (normalized.startsWith("product-ssot/verified/")) {
    return `asset/ssot/verified/${normalized.slice(
      "product-ssot/verified/".length,
    )}`;
  }
  if (normalized.startsWith("product-ssot/cutout/")) {
    return `asset/ssot/cutout/${normalized.slice(
      "product-ssot/cutout/".length,
    )}`;
  }

  return `asset/deprecated/legacy-assets-root/${normalized}`;
}

function relativeReference(fromFile, toFile) {
  const result = path.posix.relative(
    path.posix.dirname(toPosix(fromFile)),
    toPosix(toFile),
  );
  return result.startsWith(".") ? result : `./${result}`;
}

async function rewriteTextFile({
  filePath,
  oldRelativePath,
  newRelativePath,
  mappings,
  projectRoot,
}) {
  let body = await readFile(filePath, "utf8");
  let changed = false;
  for (const mapping of mappings) {
    const oldProjectPath = `assets/${mapping.legacyRelative}`;
    const newProjectPath = mapping.targetRelative;
    const oldRelativeReference = relativeReference(
      oldRelativePath,
      oldProjectPath,
    );
    const newRelativeReference = relativeReference(
      newRelativePath,
      newProjectPath,
    );
    const replacements = [
      [oldProjectPath, newProjectPath],
      [oldRelativeReference, newRelativeReference],
    ];
    for (const [before, after] of replacements) {
      if (!body.includes(before)) continue;
      body = body.replaceAll(before, after);
      changed = true;
    }
  }
  for (const [oldProjectPath, newProjectPath] of LEGACY_DIRECTORY_MAPPINGS) {
    const oldRelativeReference = relativeReference(
      oldRelativePath,
      oldProjectPath,
    );
    const newRelativeReference = relativeReference(
      newRelativePath,
      newProjectPath,
    );
    for (const [before, after] of [
      [oldProjectPath, newProjectPath],
      [oldRelativeReference, newRelativeReference],
    ]) {
      if (!body.includes(before)) continue;
      body = body.replaceAll(before, after);
      changed = true;
    }
  }
  if (changed) await writeFile(filePath, body, "utf8");
  return changed ? toPosix(path.relative(projectRoot, filePath)) : null;
}

async function collectLiveTextFiles(projectRoot) {
  const files = [];
  const roots = ["detail-page", "research", "planning", "qa", "hyperframes"];
  for (const relativeRoot of roots) {
    const root = resolveInside(projectRoot, relativeRoot);
    if (!(await exists(root))) continue;
    for (const filePath of await walkFiles(root)) {
      const relative = toPosix(path.relative(projectRoot, filePath));
      if (relative.startsWith("qa/evidence/")) continue;
      if (!TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue;
      if ((await stat(filePath)).size > 2_000_000) continue;
      files.push(filePath);
    }
  }
  files.push(resolveInside(projectRoot, "project.json"));
  return files;
}

function manifestRecord(mapping, pageReferences) {
  const isApprovedImage = mapping.targetRelative.includes(
    "/generated/approved/image/",
  );
  const isApprovedGif = mapping.targetRelative.includes(
    "/generated/approved/gif/",
  );
  const isSsot = mapping.targetRelative.includes("/ssot/");
  const pageId = pageReferences.get(`assets/${mapping.legacyRelative}`);
  if (!isApprovedImage && !isApprovedGif && !isSsot) return null;
  const kind = isSsot ? "ssot" : isApprovedGif ? "gif" : "image";
  return {
    id:
      pageId ||
      `${kind.toUpperCase()}-${safeSlug(
        path.basename(mapping.targetRelative, path.extname(mapping.targetRelative)),
      )}`,
    relativePath: mapping.targetRelative,
    sourcePath: `assets/${mapping.legacyRelative}`,
    status: "approved",
    kind,
    required: Boolean(pageId),
    sha256: mapping.targetSha256 || mapping.sha256,
    bytes: mapping.targetBytes ?? mapping.bytes,
    provenance: isSsot
      ? "user-promoted-or-verified-product-ssot"
      : "legacy-user-confirmed-page-migration",
    migratedAt: mapping.migratedAt,
  };
}

async function migrate(options) {
  const projectRoot = path.resolve(options.project);
  const legacyRoot = resolveInside(projectRoot, "assets");
  const canonicalRoot = resolveInside(projectRoot, "asset");
  if (!(await exists(path.join(projectRoot, "project.json")))) {
    throw new Error(`project.json이 없습니다: ${projectRoot}`);
  }
  if (!(await exists(legacyRoot))) {
    throw new Error(`복수형 레거시 루트가 없습니다: ${legacyRoot}`);
  }

  const pagePath = resolveInside(projectRoot, "detail-page/index.html");
  const pageHtml = await readFile(pagePath, "utf8");
  const pageReferences = pageAssetReferences(pageHtml);
  const commercialManifest = await readJson(
    path.join(legacyRoot, "commercial/asset-manifest.json"),
  );
  const acceptedCommercial = new Set(
    (commercialManifest.accepted || []).map((item) => item.file),
  );
  const deprecatedCommercial = new Set(
    (commercialManifest.deprecated || []).map((item) => item.file),
  );
  const publishedGifs = new Set(
    [...pageReferences.keys()]
      .filter((item) => item.startsWith("assets/gifs/"))
      .map((item) => path.posix.basename(item)),
  );

  const legacyFiles = await walkFiles(legacyRoot);
  const migratedAt = new Date().toISOString();
  const mappings = [];
  for (const sourcePath of legacyFiles) {
    const legacyRelative = toPosix(path.relative(legacyRoot, sourcePath));
    const targetRelative = destinationFor({
      legacyRelative,
      acceptedCommercial,
      deprecatedCommercial,
      publishedGifs,
    });
    const targetPath = resolveInside(projectRoot, targetRelative);
    if (await exists(targetPath)) {
      throw new Error(`대상 파일이 이미 존재합니다: ${targetRelative}`);
    }
    const fileStat = await stat(sourcePath);
    mappings.push({
      sourcePath,
      legacyRelative,
      targetPath,
      targetRelative,
      bytes: fileStat.size,
      sha256: await sha256(sourcePath),
      migratedAt,
    });
  }

  const summary = {
    projectRoot,
    apply: options.apply,
    sourceRoot: "assets",
    targetRoot: "asset",
    fileCount: mappings.length,
    bytes: mappings.reduce((total, item) => total + item.bytes, 0),
    pageAssetCount: pageReferences.size,
    targets: {
      input: mappings.filter((item) => item.targetRelative.startsWith("asset/input/"))
        .length,
      ssot: mappings.filter((item) => item.targetRelative.startsWith("asset/ssot/"))
        .length,
      approvedImage: mappings.filter((item) =>
        item.targetRelative.startsWith("asset/generated/approved/image/"),
      ).length,
      approvedGif: mappings.filter((item) =>
        item.targetRelative.startsWith("asset/generated/approved/gif/"),
      ).length,
      output: mappings.filter((item) =>
        item.targetRelative.startsWith("asset/output/"),
      ).length,
      deprecated: mappings.filter((item) =>
        item.targetRelative.startsWith("asset/deprecated/"),
      ).length,
      manifests: mappings.filter((item) =>
        item.targetRelative.startsWith("asset/manifests/"),
      ).length,
    },
  };
  if (!options.apply) return summary;

  for (const mapping of mappings) {
    await mkdir(path.dirname(mapping.targetPath), { recursive: true });
    await rename(mapping.sourcePath, mapping.targetPath);
    const migratedDigest = await sha256(mapping.targetPath);
    if (migratedDigest !== mapping.sha256) {
      throw new Error(`이동 뒤 SHA-256이 달라졌습니다: ${mapping.targetRelative}`);
    }
  }

  const rewrittenFiles = [];
  for (const mapping of mappings) {
    if (!TEXT_EXTENSIONS.has(path.extname(mapping.targetPath).toLowerCase())) {
      continue;
    }
    const rewritten = await rewriteTextFile({
      filePath: mapping.targetPath,
      oldRelativePath: `assets/${mapping.legacyRelative}`,
      newRelativePath: mapping.targetRelative,
      mappings,
      projectRoot,
    });
    if (rewritten) rewrittenFiles.push(rewritten);
  }
  for (const filePath of await collectLiveTextFiles(projectRoot)) {
    const relativePath = toPosix(path.relative(projectRoot, filePath));
    const rewritten = await rewriteTextFile({
      filePath,
      oldRelativePath: relativePath,
      newRelativePath: relativePath,
      mappings,
      projectRoot,
    });
    if (rewritten) rewrittenFiles.push(rewritten);
  }
  for (const mapping of mappings) {
    mapping.targetSha256 = await sha256(mapping.targetPath);
    mapping.targetBytes = (await stat(mapping.targetPath)).size;
  }

  const currentManifestPath = resolveInside(projectRoot, "asset/asset-manifest.json");
  let currentManifest = {};
  if (await exists(currentManifestPath)) {
    currentManifest = await readJson(currentManifestPath);
  }
  const assetRecords = mappings
    .map((mapping) => manifestRecord(mapping, pageReferences))
    .filter(Boolean);
  await writeFile(
    currentManifestPath,
    `${JSON.stringify(
      {
        ...currentManifest,
        schemaVersion: 2,
        studioVersion: 1,
        assetRoot: "asset",
        defaultGifMethod: currentManifest.defaultGifMethod || "hybrid",
        migration: {
          status: "completed",
          from: "assets",
          completedAt: migratedAt,
          manifest: "asset/manifests/legacy-root-migration.json",
          provenance: "legacy-user-confirmed-page",
        },
        assets: assetRecords,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const ssotMappings = mappings.filter((item) =>
    item.targetRelative.startsWith("asset/ssot/"),
  );
  const primarySsot =
    ssotMappings.find((item) =>
      item.targetRelative.endsWith(
        "ssot/authoritative/Flux2-Klein_00355_.png",
      ),
    ) ||
    ssotMappings.find((item) =>
      item.targetRelative.endsWith("ssot/verified/actual-bottom-pair.webp"),
    ) ||
    ssotMappings[0];
  await mkdir(resolveInside(projectRoot, "asset/ssot"), { recursive: true });
  await writeFile(
    resolveInside(projectRoot, "asset/ssot/product-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        productId: (await readJson(path.join(projectRoot, "project.json"))).productId,
        lockedAt: migratedAt,
        primary: primarySsot
          ? {
              id: "product-ssot",
              path: primarySsot.targetRelative,
              sha256: primarySsot.targetSha256,
              provenance: "user-promoted-product-reference",
            }
          : null,
        ssot: ssotMappings.map((item) => ({
          path: item.targetRelative,
          sha256: item.targetSha256,
          bytes: item.targetBytes,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const project = await readJson(path.join(projectRoot, "project.json"));
  if (primarySsot) {
    project.modelSsot = {
      status: "locked",
      assetId: "product-ssot",
      version: 1,
      path: primarySsot.targetRelative,
      sha256: primarySsot.targetSha256,
      approvedBy: "legacy-user-confirmed-migration",
      approvedAt: migratedAt,
    };
  }
  project.assets = Object.fromEntries(
    assetRecords.map((record) => [
      record.id,
      {
        status: record.status,
        kind: record.kind,
        path: record.relativePath,
        sha256: record.sha256,
        required: record.required,
      },
    ]),
  );
  project.updatedAt = migratedAt;
  await writeFile(
    path.join(projectRoot, "project.json"),
    `${JSON.stringify(project, null, 2)}\n`,
    "utf8",
  );

  const migrationManifestPath = resolveInside(
    projectRoot,
    "asset/manifests/legacy-root-migration.json",
  );
  await mkdir(path.dirname(migrationManifestPath), { recursive: true });
  await writeFile(
    migrationManifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        ...summary,
        projectRoot: ".",
        apply: true,
        migratedAt,
        rewrittenFiles: [...new Set(rewrittenFiles)].sort(),
        files: mappings.map((item) => ({
          source: `assets/${item.legacyRelative}`,
          target: item.targetRelative,
          sourceBytes: item.bytes,
          targetBytes: item.targetBytes,
          sourceSha256: item.sha256,
          targetSha256: item.targetSha256,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const approvalLedgerPath = resolveInside(
    projectRoot,
    "asset/approval-ledger.ndjson",
  );
  for (const record of assetRecords.filter((item) => item.status === "approved")) {
    await appendFile(
      approvalLedgerPath,
      `${JSON.stringify({
        ...record,
        decision: "approved",
        decisionSource: "legacy-user-confirmed-page-migration",
        confirmedByUser: true,
        decidedAt: migratedAt,
      })}\n`,
      "utf8",
    );
  }

  const remaining = await walkFiles(legacyRoot);
  if (remaining.length !== 0) {
    throw new Error(`레거시 루트에 ${remaining.length}개 파일이 남았습니다.`);
  }
  await rm(legacyRoot, { recursive: true });

  return {
    ...summary,
    apply: true,
    migratedAt,
    rewrittenFiles: [...new Set(rewrittenFiles)].sort(),
    modelSsot: project.modelSsot,
    legacyRootRemoved: !(await exists(legacyRoot)),
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  migrate(parseArguments(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(
        `${JSON.stringify(result, null, result.apply ? 2 : 0)}\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}

export { migrate };
