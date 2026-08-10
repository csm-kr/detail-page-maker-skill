#!/usr/bin/env node

// Approval-bound, recoverable migration for projects using the legacy `assets/` root.
import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
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
    approval: null,
    apply: false,
    json: false,
    project: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--project") options.project = argv[++index] || "";
    else if (argument === "--approval") {
      const rawApproval = argv[++index] || "";
      try {
        options.approval = JSON.parse(rawApproval);
      } catch (error) {
        throw new Error(`--approval은 JSON 객체여야 합니다: ${error.message}`);
      }
    }
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Value(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function withReceiptHash(receipt) {
  return {
    ...receipt,
    receipt_sha256: sha256Value(receipt),
  };
}

function assertReceiptHash(receipt, label) {
  if (!receipt || typeof receipt !== "object") {
    throw new Error(`${label} receipt가 없습니다.`);
  }
  const { receipt_sha256: claimed, ...body } = receipt;
  if (!/^[a-f0-9]{64}$/.test(String(claimed || ""))) {
    throw new Error(`${label} receipt SHA-256이 없습니다.`);
  }
  if (sha256Value(body) !== claimed) {
    throw new Error(`${label} receipt hash가 일치하지 않습니다.`);
  }
}

function normalizeApproval(value) {
  const approval =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch (error) {
            throw new Error(`approval JSON을 해석할 수 없습니다: ${error.message}`);
          }
        })()
      : value;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    throw new Error(
      "apply에는 --approval <json> 또는 approval API 객체가 필요합니다.",
    );
  }
  if (!/^[a-f0-9]{64}$/.test(String(approval.preview_digest || ""))) {
    throw new Error("approval.preview_digest는 SHA-256이어야 합니다.");
  }
  if (!/^[a-f0-9]{48}$/.test(String(approval.nonce || ""))) {
    throw new Error("approval.nonce가 유효하지 않습니다.");
  }
  if (approval.approved !== true) {
    throw new Error("approval.approved=true인 명시적 승인만 허용합니다.");
  }
  if (
    typeof approval.decided_by !== "string" ||
    approval.decided_by.trim().length === 0
  ) {
    throw new Error("approval.decided_by가 필요합니다.");
  }
  return {
    preview_digest: approval.preview_digest,
    nonce: approval.nonce,
    approved: true,
    decided_by: approval.decided_by.trim(),
  };
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

async function atomicWriteFile(filePath, body) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomBytes(12).toString("hex")}.tmp`,
  );
  await writeFile(temporaryPath, body);
  await rename(temporaryPath, filePath);
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
  if (changed) await atomicWriteFile(filePath, body);
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
      : "legacy-migration-approval-receipt",
    migratedAt: mapping.migratedAt,
  };
}

async function migrate(options) {
  const projectRoot = path.resolve(options.project);
  const legacyRoot = resolveInside(projectRoot, "assets");
  const projectPath = resolveInside(projectRoot, "project.json");
  if (!(await exists(projectPath))) {
    throw new Error(`project.json이 없습니다: ${projectRoot}`);
  }
  const projectIdentity = await readJson(projectPath);

  let requestedApproval = null;
  let challengeReceipt = null;
  let archiveRoot = null;
  let archiveAssetsRoot = null;
  let consumedNoncePath = null;
  if (options.apply) {
    requestedApproval = normalizeApproval(options.approval);
    archiveRoot = resolveInside(
      projectRoot,
      `.migration-archive/${requestedApproval.preview_digest}`,
    );
    archiveAssetsRoot = path.join(archiveRoot, "assets");
    const challengePath = path.join(
      archiveRoot,
      "challenges",
      `${requestedApproval.nonce}.json`,
    );
    consumedNoncePath = path.join(
      archiveRoot,
      "consumed-nonces",
      `${requestedApproval.nonce}.json`,
    );
    if (await exists(consumedNoncePath)) {
      throw new Error(
        `approval nonce가 이미 소비되어 재사용할 수 없습니다: ${requestedApproval.nonce}`,
      );
    }
    if (!(await exists(challengePath))) {
      throw new Error(
        `approval nonce에 대응하는 challenge receipt가 없습니다: ${requestedApproval.nonce}`,
      );
    }
    challengeReceipt = await readJson(challengePath);
    assertReceiptHash(challengeReceipt, "challenge");
    if (
      challengeReceipt.receipt_type !==
        "legacy_asset_migration_challenge" ||
      challengeReceipt.preview_digest !== requestedApproval.preview_digest ||
      challengeReceipt.nonce !== requestedApproval.nonce
    ) {
      throw new Error("approval과 challenge receipt의 digest/nonce가 다릅니다.");
    }
    if (challengeReceipt.project_id !== projectIdentity.id) {
      throw new Error("challenge receipt의 project_id가 현재 프로젝트와 다릅니다.");
    }
    if (
      sha256Value(challengeReceipt.subject) !==
      requestedApproval.preview_digest
    ) {
      throw new Error("challenge receipt의 canonical preview subject가 손상됐습니다.");
    }
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

  const previewFiles = mappings.map((item) => ({
    source: `assets/${item.legacyRelative}`,
    target: item.targetRelative,
    bytes: item.bytes,
    sha256: item.sha256,
  }));
  const previewSubject = {
    schema_version: "1.0",
    source_root: "assets",
    target_root: "asset",
    files: previewFiles,
  };
  const previewDigest = sha256Value(previewSubject);
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
    preview_digest: previewDigest,
    files: previewFiles,
  };
  if (!options.apply) {
    const nonce = randomBytes(24).toString("hex");
    const challenge = withReceiptHash({
      schema_version: "1.0",
      receipt_type: "legacy_asset_migration_challenge",
      project_id: projectIdentity.id,
      preview_digest: previewDigest,
      nonce,
      status: "issued",
      created_at: migratedAt,
      subject: previewSubject,
    });
    const challengeRelative = `.migration-archive/${previewDigest}/challenges/${nonce}.json`;
    const challengePath = resolveInside(projectRoot, challengeRelative);
    await mkdir(path.dirname(challengePath), { recursive: true });
    await writeFile(
      challengePath,
      `${JSON.stringify(challenge, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    return {
      ...summary,
      nonce,
      challenge_receipt: challengeRelative,
      challenge_receipt_sha256: challenge.receipt_sha256,
    };
  }

  if (previewDigest !== requestedApproval.preview_digest) {
    throw new Error(
      `preview_digest 이후 입력이 변경되었습니다(drift): expected=${requestedApproval.preview_digest} actual=${previewDigest}`,
    );
  }
  if (await exists(archiveAssetsRoot)) {
    throw new Error(
      `migration archive 복구 경로가 이미 점유되어 있습니다: ${toPosix(
        path.relative(projectRoot, archiveAssetsRoot),
      )}`,
    );
  }

  const approvalReceiptBody = {
    schema_version: "1.0",
    receipt_type: "legacy_asset_migration_approval",
    project_id: projectIdentity.id,
    preview_digest: requestedApproval.preview_digest,
    nonce: requestedApproval.nonce,
    approved: requestedApproval.approved,
    decided_by: requestedApproval.decided_by,
    decided_at: migratedAt,
    challenge_receipt_sha256: challengeReceipt.receipt_sha256,
  };
  const approvalReceipt = withReceiptHash({
    ...approvalReceiptBody,
    receipt_id: `migration-approval-${sha256Value(approvalReceiptBody).slice(
      0,
      16,
    )}`,
  });
  await mkdir(path.dirname(consumedNoncePath), { recursive: true });
  await writeFile(
    consumedNoncePath,
    `${JSON.stringify(
      withReceiptHash({
        schema_version: "1.0",
        receipt_type: "legacy_asset_migration_nonce_consumption",
        project_id: projectIdentity.id,
        preview_digest: previewDigest,
        nonce: requestedApproval.nonce,
        approval_receipt_sha256: approvalReceipt.receipt_sha256,
        consumed_at: migratedAt,
      }),
      null,
      2,
    )}\n`,
    { encoding: "utf8", flag: "wx" },
  );

  const rollbackManifestPath = path.join(
    archiveRoot,
    "rollback-manifest.json",
  );
  const failedAttemptRoot = path.join(
    archiveRoot,
    "failed-attempts",
    approvalReceipt.receipt_id,
  );
  if (await exists(rollbackManifestPath)) {
    const priorRollbackPath = path.join(
      archiveRoot,
      "rollback-history",
      `${requestedApproval.nonce}.prior.json`,
    );
    await mkdir(path.dirname(priorRollbackPath), { recursive: true });
    await copyFile(
      rollbackManifestPath,
      priorRollbackPath,
      fsConstants.COPYFILE_EXCL,
    );
  }
  const backupRecords = [];
  const backupByRelative = new Map();
  const createdFiles = new Set();
  const rewrittenFiles = [];

  const backupFile = async (filePath) => {
    const relative = toPosix(path.relative(projectRoot, filePath));
    if (backupByRelative.has(relative) || !(await exists(filePath))) return;
    const backupRelative = `rollback/${approvalReceipt.receipt_id}/live/${relative}`;
    const backupPath = path.join(archiveRoot, ...backupRelative.split("/"));
    await mkdir(path.dirname(backupPath), { recursive: true });
    await copyFile(filePath, backupPath, fsConstants.COPYFILE_EXCL);
    const record = {
      target: relative,
      backup: backupRelative,
      bytes: (await stat(filePath)).size,
      sha256: await sha256(filePath),
    };
    backupRecords.push(record);
    backupByRelative.set(relative, record);
  };
  const markCreatedIfNeeded = async (filePath) => {
    const relative = toPosix(path.relative(projectRoot, filePath));
    if (!(await exists(filePath)) && !backupByRelative.has(relative)) {
      createdFiles.add(relative);
    }
  };

  const liveTextFiles = await collectLiveTextFiles(projectRoot);
  const currentManifestPath = resolveInside(
    projectRoot,
    "asset/asset-manifest.json",
  );
  const productManifestPath = resolveInside(
    projectRoot,
    "asset/ssot/product-manifest.json",
  );
  const migrationManifestPath = resolveInside(
    projectRoot,
    "asset/manifests/legacy-root-migration.json",
  );
  const approvalLedgerPath = resolveInside(
    projectRoot,
    "asset/approval-ledger.ndjson",
  );
  for (const filePath of [
    ...liveTextFiles,
    currentManifestPath,
    productManifestPath,
    migrationManifestPath,
    approvalLedgerPath,
  ]) {
    await backupFile(filePath);
  }

  let project = null;
  let rollbackManifest = null;
  try {
    for (const mapping of mappings) {
      await mkdir(path.dirname(mapping.targetPath), { recursive: true });
      createdFiles.add(mapping.targetRelative);
      await copyFile(
        mapping.sourcePath,
        mapping.targetPath,
        fsConstants.COPYFILE_EXCL,
      );
      mapping.copiedTargetSha256 = await sha256(mapping.targetPath);
      if (mapping.copiedTargetSha256 !== mapping.sha256) {
        throw new Error(
          `복사 뒤 SHA-256이 달라졌습니다: ${mapping.targetRelative}`,
        );
      }
    }

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
    for (const filePath of liveTextFiles) {
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

    let currentManifest = {};
    if (await exists(currentManifestPath)) {
      currentManifest = await readJson(currentManifestPath);
    }
    const assetRecords = mappings
      .map((mapping) => manifestRecord(mapping, pageReferences))
      .filter(Boolean);
    await markCreatedIfNeeded(currentManifestPath);
    await atomicWriteFile(
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
            previewDigest,
            manifest: "asset/manifests/legacy-root-migration.json",
            approvalReceiptSha256: approvalReceipt.receipt_sha256,
            provenance: "legacy-migration-approval-receipt",
          },
          assets: assetRecords,
        },
        null,
        2,
      )}\n`,
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
    await markCreatedIfNeeded(productManifestPath);
    await atomicWriteFile(
      productManifestPath,
      `${JSON.stringify(
        {
          schemaVersion: 2,
          productId: projectIdentity.productId,
          lockedAt: migratedAt,
          approvalReceiptSha256: approvalReceipt.receipt_sha256,
          primary: primarySsot
            ? {
                id: "product-ssot",
                path: primarySsot.targetRelative,
                sha256: primarySsot.targetSha256,
                provenance: "migration-approval-receipt",
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
    );

    project = await readJson(projectPath);
    if (primarySsot) {
      project.modelSsot = {
        status: "locked",
        assetId: "product-ssot",
        version: 1,
        path: primarySsot.targetRelative,
        sha256: primarySsot.targetSha256,
        approvedBy: approvalReceipt.decided_by,
        approvedAt: approvalReceipt.decided_at,
        approvalReceiptSha256: approvalReceipt.receipt_sha256,
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
    await atomicWriteFile(
      projectPath,
      `${JSON.stringify(project, null, 2)}\n`,
    );

    const migrationManifest = {
      schemaVersion: 2,
      ...summary,
      projectRoot: ".",
      apply: true,
      migratedAt,
      preview_digest: previewDigest,
      approval_receipt: approvalReceipt,
      archive: `.migration-archive/${previewDigest}/assets`,
      rewrittenFiles: [...new Set(rewrittenFiles)].sort(),
      files: mappings.map((item) => ({
        source: `assets/${item.legacyRelative}`,
        archive: `assets/${item.legacyRelative}`,
        target: item.targetRelative,
        sourceBytes: item.bytes,
        targetBytes: item.targetBytes,
        sourceSha256: item.sha256,
        copiedTargetSha256: item.copiedTargetSha256,
        targetSha256: item.targetSha256,
      })),
    };
    await markCreatedIfNeeded(migrationManifestPath);
    await atomicWriteFile(
      migrationManifestPath,
      `${JSON.stringify(migrationManifest, null, 2)}\n`,
    );

    let ledgerBody = "";
    if (await exists(approvalLedgerPath)) {
      ledgerBody = await readFile(approvalLedgerPath, "utf8");
      if (ledgerBody && !ledgerBody.endsWith("\n")) ledgerBody += "\n";
    }
    for (const record of assetRecords.filter(
      (item) => item.status === "approved",
    )) {
      ledgerBody += `${JSON.stringify({
        ...record,
        decision: "approved",
        decisionSource: "legacy-migration-approval-receipt",
        approval_receipt: approvalReceipt,
        approval_receipt_sha256: approvalReceipt.receipt_sha256,
        decidedAt: approvalReceipt.decided_at,
      })}\n`;
    }
    await markCreatedIfNeeded(approvalLedgerPath);
    await atomicWriteFile(approvalLedgerPath, ledgerBody);

    rollbackManifest = {
      schema_version: "1.0",
      manifest_type: "legacy_asset_migration_rollback",
      status: "prepared",
      project_id: projectIdentity.id,
      preview_digest: previewDigest,
      approval_receipt_sha256: approvalReceipt.receipt_sha256,
      created_at: migratedAt,
      archive_root: "assets",
      legacy_restore_target: "assets",
      files: mappings.map((item) => ({
        source: `assets/${item.legacyRelative}`,
        archive: `assets/${item.legacyRelative}`,
        target: item.targetRelative,
        sourceBytes: item.bytes,
        sourceSha256: item.sha256,
        archiveSha256: null,
      })),
      restore: {
        live_files: backupRecords.sort((left, right) =>
          left.target.localeCompare(right.target),
        ),
        created_files: [...createdFiles].sort(),
      },
    };
    await atomicWriteFile(
      rollbackManifestPath,
      `${JSON.stringify(rollbackManifest, null, 2)}\n`,
    );

    await rename(legacyRoot, archiveAssetsRoot);
    for (const [index, mapping] of mappings.entries()) {
      const archivePath = path.join(
        archiveAssetsRoot,
        ...mapping.legacyRelative.split("/"),
      );
      const archiveSha256 = await sha256(archivePath);
      if (archiveSha256 !== mapping.sha256) {
        throw new Error(
          `archive SHA-256이 원본과 다릅니다: assets/${mapping.legacyRelative}`,
        );
      }
      rollbackManifest.files[index].archiveSha256 = archiveSha256;
    }
    rollbackManifest.status = "completed";
    rollbackManifest.completed_at = new Date().toISOString();
    rollbackManifest.manifest_sha256 = sha256Value(rollbackManifest);
    await atomicWriteFile(
      rollbackManifestPath,
      `${JSON.stringify(rollbackManifest, null, 2)}\n`,
    );

    return {
      ...summary,
      apply: true,
      migratedAt,
      approval_receipt: approvalReceipt,
      rewrittenFiles: [...new Set(rewrittenFiles)].sort(),
      modelSsot: project.modelSsot,
      archiveRoot: `.migration-archive/${previewDigest}/assets`,
      rollbackManifest: `.migration-archive/${previewDigest}/rollback-manifest.json`,
      legacyRootArchived:
        !(await exists(legacyRoot)) && (await exists(archiveAssetsRoot)),
      legacyRootDeleted: false,
    };
  } catch (error) {
    const recoveryErrors = [];
    try {
      if (!(await exists(legacyRoot)) && (await exists(archiveAssetsRoot))) {
        await rename(archiveAssetsRoot, legacyRoot);
      }
    } catch (recoveryError) {
      recoveryErrors.push(`legacy restore: ${recoveryError.message}`);
    }
    for (const record of backupRecords) {
      try {
        const backupPath = path.join(
          archiveRoot,
          ...record.backup.split("/"),
        );
        const targetPath = resolveInside(projectRoot, record.target);
        await atomicWriteFile(targetPath, await readFile(backupPath));
      } catch (recoveryError) {
        recoveryErrors.push(
          `live restore ${record.target}: ${recoveryError.message}`,
        );
      }
    }
    for (const relative of [...createdFiles].sort().reverse()) {
      try {
        const createdPath = resolveInside(projectRoot, relative);
        if (!(await exists(createdPath))) continue;
        const failedPath = path.join(
          failedAttemptRoot,
          ...relative.split("/"),
        );
        await mkdir(path.dirname(failedPath), { recursive: true });
        await rename(createdPath, failedPath);
      } catch (recoveryError) {
        recoveryErrors.push(
          `created file quarantine ${relative}: ${recoveryError.message}`,
        );
      }
    }
    const failureManifest = {
      ...(rollbackManifest || {
        schema_version: "1.0",
        manifest_type: "legacy_asset_migration_rollback",
        project_id: projectIdentity.id,
        preview_digest: previewDigest,
        approval_receipt_sha256: approvalReceipt.receipt_sha256,
        archive_root: "assets",
        legacy_restore_target: "assets",
        files: [],
        restore: {
          live_files: backupRecords,
          created_files: [...createdFiles].sort(),
        },
      }),
      status: "failed_recovered",
      failed_at: new Date().toISOString(),
      failure: error.message,
      original_root_preserved: await exists(legacyRoot),
      recovery_errors: recoveryErrors,
    };
    const failureManifestBody = `${JSON.stringify(
      failureManifest,
      null,
      2,
    )}\n`;
    await atomicWriteFile(
      path.join(failedAttemptRoot, "rollback-manifest.json"),
      failureManifestBody,
    );
    await atomicWriteFile(rollbackManifestPath, failureManifestBody);
    if (recoveryErrors.length > 0) {
      throw new Error(
        `${error.message}; rollback 오류: ${recoveryErrors.join("; ")}`,
        { cause: error },
      );
    }
    throw error;
  }
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
