import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  assertEditableHtmlContract,
  assertStudioDownstreamEligible,
} from "../production-contracts.mjs";
import {
  assertValidationReceipt,
} from "../receipt-contracts.mjs";
import {
  assertRubricResult,
  evaluatePublishGate,
} from "../rubric-loop.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const RESERVED_WORKING_FILES = new Set([
  "asset-manifest.json",
  "index.html",
]);

export class StudioCommitAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "StudioCommitAdapterError";
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function canonicalJsonBytes(value) {
  return Buffer.from(
    `${JSON.stringify(canonicalize(value))}\n`,
    "utf8",
  );
}

function heroAssuranceBundle(editableHtmlContract) {
  return {
    schema_version: "1.0",
    manifest: structuredClone(
      editableHtmlContract.hero_assurance.manifest,
    ),
    commercial_validation_receipt: structuredClone(
      editableHtmlContract.hero_assurance
        .commercial_validation_receipt,
    ),
    validation_receipt: structuredClone(
      editableHtmlContract.hero_assurance.validation_receipt,
    ),
    resolved_section_graph: structuredClone(
      editableHtmlContract.resolved_section_graph,
    ),
    approved_artifacts: structuredClone(
      editableHtmlContract.approved_artifacts,
    ),
    identity_source_artifacts: structuredClone(
      editableHtmlContract.identity_source_artifacts,
    ),
  };
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function assertSha256(value, field) {
  if (!SHA256.test(String(value ?? ""))) {
    throw new StudioCommitAdapterError(
      "INVALID_INPUT_DIGEST",
      `${field}는 SHA-256이어야 합니다.`,
      { field, value },
    );
  }
}

async function requireDirectory(directoryPath, code, message) {
  const resolved = path.resolve(String(directoryPath ?? ""));
  let info;
  try {
    info = await lstat(resolved);
  } catch (error) {
    throw new StudioCommitAdapterError(code, message, {
      path: resolved,
      cause: error?.code,
    });
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new StudioCommitAdapterError(code, message, {
      path: resolved,
    });
  }
  return realpath(resolved);
}

async function readRegularFile(filePath, code, message) {
  let info;
  try {
    info = await lstat(filePath);
  } catch (error) {
    throw new StudioCommitAdapterError(code, message, {
      path: filePath,
      cause: error?.code,
    });
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new StudioCommitAdapterError(code, message, {
      path: filePath,
    });
  }
  return readFile(filePath);
}

function parseJson(bytes, code, filePath) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new StudioCommitAdapterError(
      code,
      "JSON 파일을 해석할 수 없습니다.",
      { path: filePath },
    );
  }
}

async function resolveProjectFile(projectRoot, filePath, code) {
  const lexicalPath = path.resolve(String(filePath ?? ""));
  let info;
  let resolved;
  try {
    [info, resolved] = await Promise.all([
      lstat(lexicalPath),
      realpath(lexicalPath),
    ]);
  } catch {
    return lexicalPath;
  }
  if (info.isSymbolicLink() || !isWithin(projectRoot, resolved)) {
    throw new StudioCommitAdapterError(
      code,
      "파일 경로가 project root 밖을 가리킵니다.",
      { path: resolved, project_root: projectRoot },
    );
  }
  return resolved;
}

function resolveManifestAssetPath(root, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    RESERVED_WORKING_FILES.has(relativePath)
  ) {
    throw new StudioCommitAdapterError(
      "INVALID_ASSET_PATH",
      "asset path는 working root 내부의 canonical POSIX 상대 경로여야 합니다.",
      { path: relativePath },
    );
  }
  const absolute = path.resolve(
    root,
    ...relativePath.split("/"),
  );
  if (!isWithin(root, absolute)) {
    throw new StudioCommitAdapterError(
      "INVALID_ASSET_PATH",
      "asset path가 working root 밖을 가리킵니다.",
      { path: relativePath },
    );
  }
  return absolute;
}

async function listWorkingFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path
      .relative(root, absolute)
      .split(path.sep)
      .join("/");
    if (entry.isSymbolicLink()) {
      throw new StudioCommitAdapterError(
        "WORKING_SYMLINK_FORBIDDEN",
        "Studio working state에는 symbolic link를 둘 수 없습니다.",
        { path: relative },
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await listWorkingFiles(root, absolute)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

async function verifyAssetManifest(workingRoot, manifest) {
  if (
    manifest?.schema_version !== "1.0" ||
    !Array.isArray(manifest?.assets) ||
    manifest.assets.length === 0
  ) {
    throw new StudioCommitAdapterError(
      "INVALID_ASSET_MANIFEST",
      "asset-manifest.json에는 하나 이상의 versioned asset이 필요합니다.",
    );
  }
  const paths = new Set();
  const assetFiles = [];
  for (const asset of manifest.assets) {
    if (
      typeof asset?.artifact_id !== "string" ||
      asset.artifact_id.length === 0 ||
      !Number.isSafeInteger(asset?.bytes) ||
      asset.bytes < 0 ||
      !SHA256.test(String(asset?.sha256 ?? "")) ||
      asset.approval_status !== "approved" ||
      asset.production_use_allowed !== true
    ) {
      throw new StudioCommitAdapterError(
        "INVALID_ASSET_MANIFEST",
        "asset에는 ID, bytes, hash, approved와 production 권리가 필요합니다.",
        { path: asset?.path },
      );
    }
    if (paths.has(asset.path)) {
      throw new StudioCommitAdapterError(
        "INVALID_ASSET_MANIFEST",
        "asset manifest path는 중복될 수 없습니다.",
        { path: asset.path },
      );
    }
    paths.add(asset.path);
    const absolutePath = resolveManifestAssetPath(
      workingRoot,
      asset.path,
    );
    const bytes = await readRegularFile(
      absolutePath,
      "ASSET_FILE_MISSING",
      "asset manifest의 파일을 읽을 수 없습니다.",
    );
    const actualSha256 = sha256(bytes);
    if (
      bytes.length !== asset.bytes ||
      actualSha256 !== asset.sha256
    ) {
      throw new StudioCommitAdapterError(
        "ASSET_INTEGRITY_MISMATCH",
        "asset manifest의 bytes 또는 SHA-256이 실제 파일과 다릅니다.",
        {
          path: asset.path,
          expected_bytes: asset.bytes,
          actual_bytes: bytes.length,
          expected_sha256: asset.sha256,
          actual_sha256: actualSha256,
        },
      );
    }
    assetFiles.push({
      artifact_id: asset.artifact_id,
      path: asset.path,
      bytes: bytes.length,
      sha256: actualSha256,
      approval_status: "approved",
      production_use_allowed: true,
    });
  }

  const diskFiles = await listWorkingFiles(workingRoot);
  const expectedFiles = [
    ...paths,
    "asset-manifest.json",
    "index.html",
  ].sort();
  if (
    JSON.stringify(diskFiles) !== JSON.stringify(expectedFiles)
  ) {
    throw new StudioCommitAdapterError(
      "WORKING_FILE_SET_MISMATCH",
      "working root의 모든 파일은 index, asset manifest 또는 manifest asset이어야 합니다.",
      { disk_files: diskFiles, expected_files: expectedFiles },
    );
  }
  return assetFiles.sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function attributeValues(html, attribute) {
  const pattern = new RegExp(
    `\\b${attribute}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`,
    "gi",
  );
  const values = [];
  for (const match of String(html).matchAll(pattern)) {
    values.push(match[1] ?? match[2]);
  }
  return [...new Set(values)].sort();
}

function slotBindings(html) {
  const bindings = [];
  for (const tag of String(html).match(/<[a-z][^>]*>/gi) ?? []) {
    const slot = attributeValues(tag, "data-slot-id")[0];
    const artifact = attributeValues(
      tag,
      "data-artifact-id",
    )[0];
    if (slot && artifact) bindings.push(`${slot}=>${artifact}`);
  }
  return [...new Set(bindings)].sort();
}

function canonicalText(value) {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function copyMap(html) {
  const map = new Map();
  const pattern =
    /<([a-z][a-z0-9:-]*)\b([^>]*\bdata-copy-id\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of String(html).matchAll(pattern)) {
    map.set(match[3] ?? match[4], canonicalText(match[5]));
  }
  return map;
}

function setDiff(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

function semanticDomDiff(sourceHtml, workingHtml) {
  const sourceSections = attributeValues(
    sourceHtml,
    "data-section-id",
  );
  const workingSections = attributeValues(
    workingHtml,
    "data-section-id",
  );
  const sourceClaims = attributeValues(
    sourceHtml,
    "data-claim-id",
  );
  const workingClaims = attributeValues(
    workingHtml,
    "data-claim-id",
  );
  const sourceSlots = slotBindings(sourceHtml);
  const workingSlots = slotBindings(workingHtml);
  const sourceCopies = copyMap(sourceHtml);
  const workingCopies = copyMap(workingHtml);
  const copyIds = [...new Set([
    ...sourceCopies.keys(),
    ...workingCopies.keys(),
  ])].sort();
  const changedCopyIds = copyIds.filter(
    (copyId) =>
      sourceCopies.has(copyId) &&
      workingCopies.has(copyId) &&
      sourceCopies.get(copyId) !== workingCopies.get(copyId),
  );
  const addedCopyIds = copyIds.filter(
    (copyId) =>
      !sourceCopies.has(copyId) && workingCopies.has(copyId),
  );
  const removedCopyIds = copyIds.filter(
    (copyId) =>
      sourceCopies.has(copyId) && !workingCopies.has(copyId),
  );
  const summary = {
    added_section_ids: setDiff(
      workingSections,
      sourceSections,
    ),
    removed_section_ids: setDiff(
      sourceSections,
      workingSections,
    ),
    added_claim_ids: setDiff(workingClaims, sourceClaims),
    removed_claim_ids: setDiff(sourceClaims, workingClaims),
    added_slot_bindings: setDiff(workingSlots, sourceSlots),
    removed_slot_bindings: setDiff(sourceSlots, workingSlots),
    added_copy_ids: addedCopyIds,
    removed_copy_ids: removedCopyIds,
    changed_copy_ids: changedCopyIds,
    source_text_sha256: sha256(canonicalText(sourceHtml)),
    working_text_sha256: sha256(canonicalText(workingHtml)),
  };
  return {
    ...summary,
    semantic_diff_sha256: canonicalSha256(summary),
  };
}

async function inspectAssembly(projectRoot, assembly) {
  if (
    typeof assembly?.artifact_id !== "string" ||
    assembly.artifact_id.length === 0
  ) {
    throw new StudioCommitAdapterError(
      "ASSEMBLY_ARTIFACT_REQUIRED",
      "G4 assembly artifact_id가 필요합니다.",
    );
  }
  for (const field of [
    "manifest_sha256",
    "html_sha256",
    "asset_manifest_sha256",
  ]) {
    assertSha256(assembly[field], `assembly.${field}`);
  }
  const [manifestPath, htmlPath] = await Promise.all([
    resolveProjectFile(
      projectRoot,
      assembly.manifest_path,
      "ASSEMBLY_PATH_OUTSIDE_PROJECT",
    ),
    resolveProjectFile(
      projectRoot,
      assembly.html_path,
      "ASSEMBLY_PATH_OUTSIDE_PROJECT",
    ),
  ]);
  const [manifestBytes, htmlBytes] = await Promise.all([
    readRegularFile(
      manifestPath,
      "ASSEMBLY_MANIFEST_MISSING",
      "assembly manifest를 읽을 수 없습니다.",
    ),
    readRegularFile(
      htmlPath,
      "ASSEMBLY_HTML_MISSING",
      "assembly HTML을 읽을 수 없습니다.",
    ),
  ]);
  if (sha256(manifestBytes) !== assembly.manifest_sha256) {
    throw new StudioCommitAdapterError(
      "ASSEMBLY_MANIFEST_DIGEST_MISMATCH",
      "assembly manifest bytes가 입력 digest와 다릅니다.",
    );
  }
  if (sha256(htmlBytes) !== assembly.html_sha256) {
    throw new StudioCommitAdapterError(
      "ASSEMBLY_HTML_DIGEST_MISMATCH",
      "assembly HTML bytes가 입력 digest와 다릅니다.",
    );
  }
  const manifest = parseJson(
    manifestBytes,
    "INVALID_ASSEMBLY_MANIFEST",
    manifestPath,
  );
  if (
    manifest.artifact_id !== assembly.artifact_id ||
    manifest.html_sha256 !== assembly.html_sha256 ||
    manifest.asset_manifest_sha256 !==
      assembly.asset_manifest_sha256
  ) {
    throw new StudioCommitAdapterError(
      "ASSEMBLY_MANIFEST_CONTRACT_MISMATCH",
      "assembly manifest의 artifact·HTML·asset digest가 입력과 다릅니다.",
    );
  }
  return {
    manifestPath,
    htmlPath,
    sourceHtml: htmlBytes.toString("utf8"),
  };
}

function assertWorkingImport(workingState, assembly) {
  if (
    typeof workingState?.working_id !== "string" ||
    workingState.working_id.length === 0 ||
    workingState.imported_assembly_artifact_id !==
      assembly.artifact_id ||
    workingState.imported_assembly_manifest_sha256 !==
      assembly.manifest_sha256 ||
    workingState.imported_html_sha256 !== assembly.html_sha256 ||
    typeof workingState.producer_agent_session_id !== "string" ||
    workingState.producer_agent_session_id.length === 0
  ) {
    throw new StudioCommitAdapterError(
      "STUDIO_IMPORT_DIGEST_MISMATCH",
      "working state가 exact G4 assembly import에 고정되지 않았습니다.",
    );
  }
}

export async function inspectStudioWorkingState({
  projectRoot,
  assembly,
  workingState,
  editableHtmlContract,
} = {}) {
  const project = await requireDirectory(
    projectRoot,
    "PROJECT_ROOT_REQUIRED",
    "detail page project root가 필요합니다.",
  );
  assertWorkingImport(workingState, assembly);
  const workingRoot = await requireDirectory(
    workingState.root,
    "STUDIO_WORKING_ROOT_REQUIRED",
    "Studio working root가 필요합니다.",
  );
  if (!isWithin(project, workingRoot)) {
    throw new StudioCommitAdapterError(
      "WORKING_ROOT_OUTSIDE_PROJECT",
      "Studio working root가 project 밖입니다.",
      { working_root: workingRoot, project_root: project },
    );
  }
  const assemblyInspection = await inspectAssembly(
    project,
    assembly,
  );
  const htmlPath = path.join(workingRoot, "index.html");
  const assetManifestPath = path.join(
    workingRoot,
    "asset-manifest.json",
  );
  const [htmlBytes, assetManifestBytes] = await Promise.all([
    readRegularFile(
      htmlPath,
      "STUDIO_WORKING_HTML_MISSING",
      "Studio working index.html을 읽을 수 없습니다.",
    ),
    readRegularFile(
      assetManifestPath,
      "ASSET_MANIFEST_MISSING",
      "Studio working asset-manifest.json을 읽을 수 없습니다.",
    ),
  ]);
  const currentHtml = htmlBytes.toString("utf8");
  if (editableHtmlContract?.html !== currentHtml) {
    throw new StudioCommitAdapterError(
      "EDITABLE_HTML_CONTENT_MISMATCH",
      "editable HTML contract가 현재 working index.html bytes와 다릅니다.",
    );
  }
  assertEditableHtmlContract(editableHtmlContract);
  const heroAssuranceManifestSha256 = canonicalSha256(
    editableHtmlContract.hero_assurance.manifest,
  );
  const heroAssuranceValidationReceiptSha256 = canonicalSha256(
    editableHtmlContract.hero_assurance.validation_receipt,
  );
  const heroCommercialValidationReceiptSha256 = canonicalSha256(
    editableHtmlContract.hero_assurance
      .commercial_validation_receipt,
  );
  const identitySource =
    editableHtmlContract.identity_source_artifacts.find(
      (artifact) =>
        artifact.artifact_id ===
        editableHtmlContract.hero_assurance.manifest
          .identity_source.artifact_id,
    );
  const heroIdentityValidationReceiptSha256 = canonicalSha256(
    identitySource.g2_identity_validation_receipt,
  );
  const assuranceBundle = heroAssuranceBundle(
    editableHtmlContract,
  );
  const heroAssuranceBundleSha256 = sha256(
    canonicalJsonBytes(assuranceBundle),
  );
  const assetManifestSha256 = sha256(assetManifestBytes);
  if (
    assetManifestSha256 !==
    assembly.asset_manifest_sha256
  ) {
    throw new StudioCommitAdapterError(
      "ASSET_MANIFEST_DIGEST_MISMATCH",
      "Studio에서 읽기 전용인 asset manifest가 assembly 이후 바뀌었습니다.",
      {
        expected_asset_manifest_sha256:
          assembly.asset_manifest_sha256,
        actual_asset_manifest_sha256: assetManifestSha256,
      },
    );
  }
  const assetManifest = parseJson(
    assetManifestBytes,
    "INVALID_ASSET_MANIFEST",
    assetManifestPath,
  );
  const assetFiles = await verifyAssetManifest(
    workingRoot,
    assetManifest,
  );
  const htmlSha256 = sha256(htmlBytes);
  const contentPayload = {
    working_id: workingState.working_id,
    assembly_artifact_id: assembly.artifact_id,
    assembly_manifest_sha256: assembly.manifest_sha256,
    imported_html_sha256: workingState.imported_html_sha256,
    html_sha256: htmlSha256,
    asset_manifest_sha256: assetManifestSha256,
    hero_assurance_manifest_sha256:
      heroAssuranceManifestSha256,
    hero_assurance_validation_receipt_sha256:
      heroAssuranceValidationReceiptSha256,
    hero_commercial_validation_receipt_sha256:
      heroCommercialValidationReceiptSha256,
    hero_identity_validation_receipt_sha256:
      heroIdentityValidationReceiptSha256,
    hero_assurance_bundle_sha256: heroAssuranceBundleSha256,
    asset_files: assetFiles.map((asset) => ({
      artifact_id: asset.artifact_id,
      path: asset.path,
      bytes: asset.bytes,
      sha256: asset.sha256,
    })),
  };
  const artifactSetDigest = canonicalSha256(contentPayload);
  const semanticDiff = semanticDomDiff(
    assemblyInspection.sourceHtml,
    currentHtml,
  );
  const snapshotBody = {
    schema_version: "1.0",
    artifact_type: "studio.working_snapshot",
    working_id: workingState.working_id,
    project_root: project,
    working_root: workingRoot,
    assembly_artifact_id: assembly.artifact_id,
    assembly_manifest_sha256: assembly.manifest_sha256,
    imported_html_sha256: workingState.imported_html_sha256,
    html_sha256: htmlSha256,
    asset_manifest_sha256: assetManifestSha256,
    hero_assurance_manifest_sha256:
      heroAssuranceManifestSha256,
    hero_assurance_validation_receipt_sha256:
      heroAssuranceValidationReceiptSha256,
    hero_commercial_validation_receipt_sha256:
      heroCommercialValidationReceiptSha256,
    hero_identity_validation_receipt_sha256:
      heroIdentityValidationReceiptSha256,
    hero_assurance_bundle_sha256: heroAssuranceBundleSha256,
    asset_files: assetFiles,
    artifact_set_digest: artifactSetDigest,
    semantic_dom_diff: semanticDiff,
  };
  return Object.freeze({
    ...snapshotBody,
    snapshot_sha256: canonicalSha256(snapshotBody),
  });
}

function assertExpectedSnapshot(expected, actual) {
  if (
    !expected ||
    expected.working_id !== actual.working_id ||
    expected.artifact_set_digest !==
      actual.artifact_set_digest ||
    expected.snapshot_sha256 !== actual.snapshot_sha256
  ) {
    throw new StudioCommitAdapterError(
      "WORKING_SNAPSHOT_CHANGED",
      "QA 이후 Studio working bytes가 바뀌었습니다. 새 snapshot과 검수가 필요합니다.",
      {
        expected_snapshot_sha256: expected?.snapshot_sha256,
        actual_snapshot_sha256: actual.snapshot_sha256,
      },
    );
  }
}

function assertThresholds(thresholds) {
  const normalized = {
    qa_score: thresholds?.qa_score ?? 97,
    target_score: thresholds?.target_score ?? 97,
    behance_weighted_target:
      thresholds?.behance_weighted_target ?? 90,
    critical_dimension_target:
      thresholds?.critical_dimension_target ?? 85,
  };
  for (const [field, value] of Object.entries(normalized)) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new StudioCommitAdapterError(
        "INVALID_STUDIO_COMMIT_THRESHOLD",
        `${field}는 0~100 점수여야 합니다.`,
        { field, value },
      );
    }
  }
  return normalized;
}

function validateRubricGate(
  rubricResult,
  rubricDefinition,
  snapshot,
  thresholds,
) {
  if (
    rubricResult?.subject?.artifact_id !== snapshot.working_id ||
    rubricResult?.subject?.manifest_sha256 !==
      snapshot.artifact_set_digest
  ) {
    throw new StudioCommitAdapterError(
      "RUBRIC_SUBJECT_DIGEST_MISMATCH",
      "rubric 결과가 현재 Studio working exact input을 평가하지 않았습니다.",
    );
  }
  const result = assertRubricResult(
    rubricResult,
    rubricDefinition,
  );
  const anyHardFailure = result.checks.some(
    (check) =>
      check.status === "FAIL" && check.severity === "hard",
  );
  const gate = evaluatePublishGate(
    result,
    rubricDefinition,
    {
      target_score: thresholds.target_score,
      behance_weighted_target:
        thresholds.behance_weighted_target,
      critical_dimension_target:
        thresholds.critical_dimension_target,
    },
  );
  if (anyHardFailure || !gate.publish_allowed) {
    throw new StudioCommitAdapterError(
      "RUBRIC_GATE_FAILED",
      "hard failure가 없고 모든 Studio rubric threshold를 충족해야 합니다.",
      { any_hard_failure: anyHardFailure, gate },
    );
  }
  return gate;
}

function validateQaGate(
  qaReceipt,
  qaContext,
  snapshot,
  thresholds,
) {
  const context = {
    ...structuredClone(qaContext ?? {}),
    expectedArtifactSetDigest: snapshot.artifact_set_digest,
  };
  const receipt = assertValidationReceipt(
    qaReceipt,
    context,
  );
  if (
    !receipt.subject.artifact_ids.includes(
      snapshot.working_id,
    )
  ) {
    throw new StudioCommitAdapterError(
      "QA_SUBJECT_ARTIFACT_MISMATCH",
      "QA receipt가 Studio working artifact ID를 포함하지 않습니다.",
    );
  }
  if (receipt.score < thresholds.qa_score) {
    throw new StudioCommitAdapterError(
      "QA_THRESHOLD_NOT_MET",
      "Studio 최종 QA score가 threshold보다 낮습니다.",
      {
        score: receipt.score,
        required_score: thresholds.qa_score,
      },
    );
  }
  return receipt;
}

async function validateParent(projectRoot, previousRevision) {
  if (previousRevision === undefined || previousRevision === null) {
    return null;
  }
  if (
    typeof previousRevision.revision_id !== "string" ||
    previousRevision.revision_id.length === 0 ||
    !SHA256.test(
      String(previousRevision.commit_sha256 ?? ""),
    )
  ) {
    throw new StudioCommitAdapterError(
      "INVALID_PARENT_REVISION",
      "parent revision에는 revision_id와 commit SHA-256이 필요합니다.",
    );
  }
  const revisionPath = path.join(
    projectRoot,
    "studio",
    "revisions",
    previousRevision.revision_id,
  );
  const manifestPath = path.join(revisionPath, "revision.json");
  let bytes;
  try {
    bytes = await readFile(manifestPath);
  } catch (error) {
    throw new StudioCommitAdapterError(
      "PARENT_REVISION_NOT_FOUND",
      "previous revision manifest를 찾을 수 없습니다.",
      {
        revision_id: previousRevision.revision_id,
        cause: error?.code,
      },
    );
  }
  const manifest = parseJson(
    bytes,
    "INVALID_PARENT_REVISION",
    manifestPath,
  );
  if (
    manifest.revision_kind !== "committed" ||
    manifest.mutable !== false ||
    manifest.revision_id !== previousRevision.revision_id ||
    manifest.commit_sha256 !==
      previousRevision.commit_sha256
  ) {
    throw new StudioCommitAdapterError(
      "PARENT_REVISION_DIGEST_MISMATCH",
      "previous revision의 실제 immutable commit hash가 다릅니다.",
    );
  }
  return previousRevision.commit_sha256;
}

async function copySnapshotToStaging(
  snapshot,
  stagingRoot,
  heroAssuranceBytes,
) {
  await copyFile(
    path.join(snapshot.working_root, "index.html"),
    path.join(stagingRoot, "index.html"),
  );
  await writeFile(
    path.join(stagingRoot, "hero-assurance.json"),
    heroAssuranceBytes,
  );
  await copyFile(
    path.join(snapshot.working_root, "asset-manifest.json"),
    path.join(stagingRoot, "asset-manifest.json"),
  );
  for (const asset of snapshot.asset_files) {
    const source = resolveManifestAssetPath(
      snapshot.working_root,
      asset.path,
    );
    const destination = resolveManifestAssetPath(
      stagingRoot,
      asset.path,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function verifyCommittedFiles(revisionRoot, snapshot) {
  const [
    htmlBytes,
    assetManifestBytes,
    heroAssuranceBytes,
  ] = await Promise.all([
    readRegularFile(
      path.join(revisionRoot, "index.html"),
      "COMMITTED_FILE_MISSING",
      "committed index.html이 없습니다.",
    ),
    readRegularFile(
      path.join(revisionRoot, "asset-manifest.json"),
      "COMMITTED_FILE_MISSING",
      "committed asset manifest가 없습니다.",
    ),
    readRegularFile(
      path.join(revisionRoot, "hero-assurance.json"),
      "COMMITTED_FILE_MISSING",
      "committed Hero assurance bundle이 없습니다.",
    ),
  ]);
  if (
    sha256(htmlBytes) !== snapshot.html_sha256 ||
    sha256(assetManifestBytes) !==
      snapshot.asset_manifest_sha256 ||
    sha256(heroAssuranceBytes) !==
      snapshot.hero_assurance_bundle_sha256
  ) {
    throw new StudioCommitAdapterError(
      "COMMITTED_CONTENT_DIGEST_MISMATCH",
      "committed HTML, asset manifest 또는 Hero assurance hash가 snapshot과 다릅니다.",
    );
  }
  for (const asset of snapshot.asset_files) {
    const bytes = await readRegularFile(
      resolveManifestAssetPath(revisionRoot, asset.path),
      "COMMITTED_FILE_MISSING",
      "committed asset 파일이 없습니다.",
    );
    if (
      bytes.length !== asset.bytes ||
      sha256(bytes) !== asset.sha256
    ) {
      throw new StudioCommitAdapterError(
        "COMMITTED_CONTENT_DIGEST_MISMATCH",
        "committed asset bytes가 snapshot과 다릅니다.",
        { path: asset.path },
      );
    }
  }
}

async function committedMemberManifest(
  projectRoot,
  revisionRoot,
  snapshot,
) {
  const files = [
    {
      member_id: "revision.json",
      absolute_path: path.join(revisionRoot, "revision.json"),
    },
    {
      member_id: "index.html",
      absolute_path: path.join(revisionRoot, "index.html"),
    },
    {
      member_id: "asset-manifest.json",
      absolute_path: path.join(
        revisionRoot,
        "asset-manifest.json",
      ),
    },
    {
      member_id: "hero-assurance.json",
      absolute_path: path.join(
        revisionRoot,
        "hero-assurance.json",
      ),
    },
    ...snapshot.asset_files.map((asset) => ({
      member_id: asset.artifact_id,
      absolute_path: resolveManifestAssetPath(
        revisionRoot,
        asset.path,
      ),
    })),
  ];
  const members = [];
  for (const file of files) {
    const bytes = await readRegularFile(
      file.absolute_path,
      "COMMITTED_FILE_MISSING",
      "committed member 파일이 없습니다.",
    );
    const relative = path.relative(
      projectRoot,
      file.absolute_path,
    );
    if (
      !relative ||
      relative.startsWith("..") ||
      path.isAbsolute(relative)
    ) {
      throw new StudioCommitAdapterError(
        "PROJECT_PATH_ESCAPE",
        "committed member locator가 project root 밖입니다.",
        { path: file.absolute_path },
      );
    }
    members.push({
      member_id: file.member_id,
      root_id: "project",
      locator: relative.split(path.sep).join("/"),
      sha256: sha256(bytes),
      size_bytes: bytes.length,
    });
  }
  members.sort((left, right) =>
    left.member_id.localeCompare(right.member_id),
  );
  return {
    schema_version: "1.0",
    policy: "materialized",
    members,
  };
}

async function existingRevisionResult(
  revisionPath,
  expectedRevision,
  snapshot,
) {
  let existing;
  try {
    existing = parseJson(
      await readFile(path.join(revisionPath, "revision.json")),
      "INVALID_EXISTING_REVISION",
      path.join(revisionPath, "revision.json"),
    );
  } catch (error) {
    if (error instanceof StudioCommitAdapterError) throw error;
    return null;
  }
  if (
    existing.revision_id !== expectedRevision.revision_id ||
    existing.commit_sha256 !==
      expectedRevision.commit_sha256 ||
    existing.source_working_artifact_set_digest !==
      snapshot.artifact_set_digest
  ) {
    throw new StudioCommitAdapterError(
      "DETERMINISTIC_REVISION_COLLISION",
      "같은 deterministic revision ID에 다른 내용이 있습니다.",
      { revision_path: revisionPath },
    );
  }
  await verifyCommittedFiles(revisionPath, snapshot);
  assertStudioDownstreamEligible(existing, "G4Q_RUBRIC");
  const memberManifest = await committedMemberManifest(
    snapshot.project_root,
    revisionPath,
    snapshot,
  );
  return {
    status: "committed",
    idempotent_reuse: true,
    revision_path: revisionPath,
    revision: existing,
    member_ids: memberManifest.members.map(
      (member) => member.member_id,
    ),
    member_manifest: memberManifest,
  };
}

export async function commitStudioRevision({
  projectRoot,
  assembly,
  workingState,
  editableHtmlContract,
  expectedWorkingSnapshot,
  rubricDefinition,
  rubricResult,
  qaReceipt,
  qaContext,
  thresholds: suppliedThresholds,
  previousRevision,
  committedAt = new Date().toISOString(),
} = {}) {
  let snapshot;
  try {
    snapshot = await inspectStudioWorkingState({
      projectRoot,
      assembly,
      workingState,
      editableHtmlContract,
    });
  } catch (error) {
    if (error?.code === "EDITABLE_HTML_CONTENT_MISMATCH") {
      throw new StudioCommitAdapterError(
        "WORKING_SNAPSHOT_CHANGED",
        "QA 이후 working HTML이 바뀌었습니다. 새 snapshot이 필요합니다.",
        { cause: error.code },
      );
    }
    throw error;
  }
  assertExpectedSnapshot(expectedWorkingSnapshot, snapshot);
  const heroAssuranceBytes = canonicalJsonBytes(
    heroAssuranceBundle(editableHtmlContract),
  );
  if (
    sha256(heroAssuranceBytes) !==
    snapshot.hero_assurance_bundle_sha256
  ) {
    throw new StudioCommitAdapterError(
      "HERO_ASSURANCE_SNAPSHOT_CHANGED",
      "Hero assurance가 working snapshot 이후 바뀌었습니다.",
    );
  }
  const thresholds = assertThresholds(suppliedThresholds);
  const rubricGate = validateRubricGate(
    rubricResult,
    rubricDefinition,
    snapshot,
    thresholds,
  );
  validateQaGate(
    qaReceipt,
    qaContext,
    snapshot,
    thresholds,
  );
  if (
    typeof committedAt !== "string" ||
    Number.isNaN(Date.parse(committedAt))
  ) {
    throw new StudioCommitAdapterError(
      "INVALID_COMMIT_TIME",
      "committedAt은 ISO timestamp여야 합니다.",
    );
  }
  const project = snapshot.project_root;
  const parentCommitSha256 = await validateParent(
    project,
    previousRevision,
  );
  const rubricResultSha256 = canonicalSha256(rubricResult);
  const qaReceiptSha256 = canonicalSha256(qaReceipt);
  const revisionInputs = {
    assembly_manifest_sha256: assembly.manifest_sha256,
    working_artifact_set_digest:
      snapshot.artifact_set_digest,
    rubric_result_sha256: rubricResultSha256,
    qa_receipt_sha256: qaReceiptSha256,
    hero_assurance_manifest_sha256:
      snapshot.hero_assurance_manifest_sha256,
    hero_assurance_validation_receipt_sha256:
      snapshot.hero_assurance_validation_receipt_sha256,
    hero_commercial_validation_receipt_sha256:
      snapshot.hero_commercial_validation_receipt_sha256,
    hero_identity_validation_receipt_sha256:
      snapshot.hero_identity_validation_receipt_sha256,
    hero_assurance_bundle_sha256:
      snapshot.hero_assurance_bundle_sha256,
    parent_commit_sha256: parentCommitSha256,
  };
  const revisionId = `studio-rev-${canonicalSha256(
    revisionInputs,
  ).slice(0, 20)}`;
  const heroAssuranceMemberLocator = [
    "studio",
    "revisions",
    revisionId,
    "hero-assurance.json",
  ].join("/");
  const revisionBody = {
    schema_version: "1.0",
    revision_id: revisionId,
    revision_kind: "committed",
    mutable: false,
    artifact_id: `studio-artifact-${revisionId.slice(-20)}`,
    artifact_sha256: snapshot.artifact_set_digest,
    source_working_id: snapshot.working_id,
    source_working_artifact_set_digest:
      snapshot.artifact_set_digest,
    assembly_artifact_id: assembly.artifact_id,
    assembly_manifest_sha256: assembly.manifest_sha256,
    html_sha256: snapshot.html_sha256,
    asset_manifest_sha256: snapshot.asset_manifest_sha256,
    hero_assurance_manifest_sha256:
      snapshot.hero_assurance_manifest_sha256,
    hero_assurance_validation_receipt_sha256:
      snapshot.hero_assurance_validation_receipt_sha256,
    hero_commercial_validation_receipt_sha256:
      snapshot.hero_commercial_validation_receipt_sha256,
    hero_identity_validation_receipt_sha256:
      snapshot.hero_identity_validation_receipt_sha256,
    hero_assurance_bundle_sha256:
      snapshot.hero_assurance_bundle_sha256,
    hero_assurance_member_id: "hero-assurance.json",
    hero_assurance_member_locator: heroAssuranceMemberLocator,
    hero_assurance_member_sha256:
      snapshot.hero_assurance_bundle_sha256,
    hero_assurance_member_size_bytes:
      heroAssuranceBytes.length,
    asset_content_set_sha256: canonicalSha256(
      snapshot.asset_files.map((asset) => ({
        path: asset.path,
        bytes: asset.bytes,
        sha256: asset.sha256,
      })),
    ),
    semantic_dom_diff: snapshot.semantic_dom_diff,
    rubric_result_sha256: rubricResultSha256,
    rubric_sha256: rubricDefinition.rubric_sha256,
    rubric_gate: rubricGate,
    qa_receipt_sha256: qaReceiptSha256,
    thresholds,
    parent_commit_sha256: parentCommitSha256,
  };
  const revision = {
    ...revisionBody,
    commit_sha256: canonicalSha256(revisionBody),
    committed_at: committedAt,
  };
  assertStudioDownstreamEligible(revision, "G4Q_RUBRIC");

  const revisionsRoot = path.join(
    project,
    "studio",
    "revisions",
  );
  const revisionPath = path.join(revisionsRoot, revisionId);
  try {
    const existing = await existingRevisionResult(
      revisionPath,
      revision,
      snapshot,
    );
    if (existing) return existing;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await mkdir(revisionsRoot, { recursive: true });
  const stagingRoot = await mkdtemp(
    path.join(revisionsRoot, `.staging-${revisionId}-`),
  );
  let promoted = false;
  try {
    await copySnapshotToStaging(
      snapshot,
      stagingRoot,
      heroAssuranceBytes,
    );
    await verifyCommittedFiles(stagingRoot, snapshot);
    await writeFile(
      path.join(stagingRoot, "revision.json"),
      `${JSON.stringify(revision, null, 2)}\n`,
      "utf8",
    );
    try {
      await rename(stagingRoot, revisionPath);
      promoted = true;
    } catch (error) {
      if (
        !["EEXIST", "ENOTEMPTY", "EPERM"].includes(
          error?.code,
        )
      ) {
        throw error;
      }
      const existing = await existingRevisionResult(
        revisionPath,
        revision,
        snapshot,
      );
      if (!existing) throw error;
      return existing;
    }
  } finally {
    if (!promoted) {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }
  await verifyCommittedFiles(revisionPath, snapshot);
  const memberManifest = await committedMemberManifest(
    project,
    revisionPath,
    snapshot,
  );
  return {
    status: "committed",
    idempotent_reuse: false,
    revision_path: revisionPath,
    revision,
    member_ids: memberManifest.members.map(
      (member) => member.member_id,
    ),
    member_manifest: memberManifest,
  };
}
