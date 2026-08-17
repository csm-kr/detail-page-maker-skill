import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_RULE_REFERENCES,
  candidateHash,
} from "../learning-pipeline.mjs";
import {
  resolveLearningPaths,
} from "../../maintenance/learning-status.mjs";

const ADAPTER_ID = "learning-pipeline-execution-adapter";
const ADAPTER_VERSION = "1.0.0";
const ADAPTER_FILE = fileURLToPath(import.meta.url);
const PLAN_SCHEMA_VERSION = "1.0";
const RECEIPT_SCHEMA_VERSION = "1.0";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const LEARNING_MAINTENANCE_ACTIONS = Object.freeze({
  REFRESH_BEHANCE: "refresh-behance",
  REFRESH_HYPERFRAMES: "refresh-hyperframes",
  DISTILL: "distill",
  STATUS: "status",
});

const ACTION_ALLOWLIST = Object.freeze({
  [LEARNING_MAINTENANCE_ACTIONS.REFRESH_BEHANCE]: Object.freeze({
    runtime: "node",
    script_locator:
      "scripts/maintenance/refresh-browser-study.mjs",
  }),
  [LEARNING_MAINTENANCE_ACTIONS.REFRESH_HYPERFRAMES]:
    Object.freeze({
      runtime: "node",
      script_locator:
        "scripts/maintenance/refresh-browser-study.mjs",
    }),
  [LEARNING_MAINTENANCE_ACTIONS.DISTILL]: Object.freeze({
    runtime: "node",
    script_locator: "scripts/maintenance/distill-learnings.mjs",
  }),
  [LEARNING_MAINTENANCE_ACTIONS.STATUS]: Object.freeze({
    runtime: "node",
    script_locator: "scripts/maintenance/learning-status.mjs",
  }),
});

const ENVIRONMENT_KEYS = Object.freeze([
  "APPDATA",
  "COMSPEC",
  "HOMEDRIVE",
  "HOMEPATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "PATH",
  "Path",
  "PROGRAMDATA",
  "SYSTEMROOT",
  "SHELL",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "WINDIR",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
]);

export class LearningPipelineExecutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "LearningPipelineExecutionError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new LearningPipelineExecutionError(code, message, details);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function assertSha256(value, field) {
  if (!SHA256_PATTERN.test(String(value ?? ""))) {
    fail("INVALID_SHA256", `${field} must be a SHA-256 digest.`, {
      field,
    });
  }
  return String(value);
}

function assertNonEmpty(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    fail("FIELD_REQUIRED", `${field} is required.`, { field });
  }
  return normalized;
}

function assertAbsoluteRoot(value, field) {
  const normalized = String(value ?? "");
  if (!path.isAbsolute(normalized)) {
    fail("ABSOLUTE_ROOT_REQUIRED", `${field} must be absolute.`, {
      field,
      value: normalized,
    });
  }
  return path.resolve(normalized);
}

function assertCanonicalLocator(value, field) {
  const locator = String(value ?? "");
  if (
    !locator ||
    locator.includes("\\") ||
    locator.includes("\0") ||
    path.posix.isAbsolute(locator) ||
    /^[A-Za-z]:/.test(locator) ||
    path.posix.normalize(locator) !== locator ||
    locator
      .split("/")
      .some((part) => !part || part === "." || part === "..")
  ) {
    fail(
      "MAINTENANCE_PATH_ESCAPE",
      `${field} must be a canonical relative POSIX locator.`,
      { field, locator },
    );
  }
  return locator;
}

function pathIsWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function rootById(roots, rootId) {
  if (rootId === "skill") return roots.skillRoot;
  if (rootId === "project") return roots.projectRoot;
  fail("UNKNOWN_ROOT_ID", "The maintenance locator root is not allowed.", {
    root_id: rootId,
  });
}

function resolveLocator(roots, rootId, locator) {
  const root = rootById(roots, rootId);
  const canonical = assertCanonicalLocator(locator, "locator");
  const target = path.resolve(root, ...canonical.split("/"));
  if (!pathIsWithin(root, target) || target === root) {
    fail(
      "MAINTENANCE_PATH_ESCAPE",
      "The maintenance locator escapes its allowed root.",
      { root_id: rootId, locator: canonical },
    );
  }
  return target;
}

async function assertNoSymlinkPath(root, target, allowMissing = false) {
  const relative = path.relative(root, target);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    fail(
      "MAINTENANCE_PATH_ESCAPE",
      "The resolved path is outside its allowed root.",
      { root, target },
    );
  }
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (allowMissing && error?.code === "ENOENT") return;
      if (error?.code === "ENOENT") {
        fail("MAINTENANCE_FILE_MISSING", "A required file is missing.", {
          path: target,
        });
      }
      throw error;
    }
    if (info.isSymbolicLink()) {
      fail(
        "MAINTENANCE_SYMLINK_FORBIDDEN",
        "Maintenance inputs, scripts, and outputs cannot use symlinks.",
        { path: current },
      );
    }
  }
  const [realRoot, realTarget] = await Promise.all([
    realpath(root),
    realpath(target),
  ]);
  if (!pathIsWithin(realRoot, realTarget) || realTarget === realRoot) {
    fail(
      "MAINTENANCE_SYMLINK_ESCAPE",
      "The resolved real path escapes its allowed root.",
      { root, target },
    );
  }
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readSafeFile(roots, rootId, locator) {
  const root = rootById(roots, rootId);
  const target = resolveLocator(roots, rootId, locator);
  await assertNoSymlinkPath(root, target);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) {
    fail(
      "MAINTENANCE_INVALID_FILE",
      "The maintenance member must be a regular file.",
      { root_id: rootId, locator },
    );
  }
  return readFile(target);
}

async function optionalFileRecord(roots, rootId, locator, role) {
  const target = resolveLocator(roots, rootId, locator);
  if (!(await exists(target))) {
    return {
      root_id: rootId,
      locator,
      role,
      exists: false,
      sha256: null,
      size_bytes: null,
    };
  }
  const bytes = await readSafeFile(roots, rootId, locator);
  return {
    root_id: rootId,
    locator,
    role,
    exists: true,
    sha256: sha256(bytes),
    size_bytes: bytes.length,
  };
}

function sortFileRecords(records) {
  return [...records].sort(
    (left, right) =>
      left.root_id.localeCompare(right.root_id, "en") ||
      left.locator.localeCompare(right.locator, "en") ||
      left.role.localeCompare(right.role, "en"),
  );
}

async function projectLearningLocators(roots) {
  // 산출물 폴더 규약: 학습 근거도 이 프로젝트 안에서만 읽는다.
  const locator = ".detail-page/planning/LEARNINGS.md";
  const target = path.resolve(roots.projectRoot, ...locator.split("/"));
  if (!(await exists(target))) return [];
  await assertNoSymlinkPath(roots.projectRoot, target);
  return [locator];
}

function actionIdsForCaptured(captured) {
  const sourceType = String(
    captured?.raw_candidate?.source_type ?? "",
  ).toLowerCase();
  if (sourceType === "behance") {
    return [
      LEARNING_MAINTENANCE_ACTIONS.REFRESH_BEHANCE,
      LEARNING_MAINTENANCE_ACTIONS.DISTILL,
      LEARNING_MAINTENANCE_ACTIONS.STATUS,
    ];
  }
  if (sourceType === "motion") {
    return [
      LEARNING_MAINTENANCE_ACTIONS.REFRESH_HYPERFRAMES,
      LEARNING_MAINTENANCE_ACTIONS.DISTILL,
      LEARNING_MAINTENANCE_ACTIONS.STATUS,
    ];
  }
  if (sourceType === "feedback") {
    return [
      LEARNING_MAINTENANCE_ACTIONS.DISTILL,
      LEARNING_MAINTENANCE_ACTIONS.STATUS,
    ];
  }
  fail(
    "UNSUPPORTED_LEARNING_SOURCE",
    "The captured learning source has no maintenance route.",
    { source_type: sourceType },
  );
}

function assertCaptured(captured) {
  if (!captured || captured.status !== "CAPTURED") {
    fail(
      "INVALID_PIPELINE_STATE",
      "A CAPTURED learning intake receipt is required.",
    );
  }
  if (
    candidateHash(captured.raw_candidate) !==
    captured.raw_candidate_sha256
  ) {
    fail(
      "CANDIDATE_HASH_MISMATCH",
      "The captured candidate does not match its intake hash.",
    );
  }
  assertNonEmpty(captured.intake_receipt_id, "intake_receipt_id");
}

function fixedEnvironment(source = process.env) {
  const result = {};
  for (const key of ENVIRONMENT_KEYS) {
    if (
      source[key] !== undefined &&
      result[key] === undefined
    ) {
      result[key] = String(source[key]);
    }
  }
  result.PYTHONUTF8 = "1";
  result.PYTHONIOENCODING = "utf-8";
  return Object.freeze(
    Object.fromEntries(
      Object.entries(result).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    ),
  );
}

function commandArguments(actionId, roots, scriptPath) {
  const learning = resolveLearningPaths({
    projectRoot: roots.projectRoot,
    skillRoot: roots.skillRoot,
  });
  if (
    actionId === LEARNING_MAINTENANCE_ACTIONS.REFRESH_BEHANCE
  ) {
    return [
      scriptPath,
      "--kind",
      "behance",
      "--project",
      roots.projectRoot,
      "--max",
      "12",
    ];
  }
  if (
    actionId ===
    LEARNING_MAINTENANCE_ACTIONS.REFRESH_HYPERFRAMES
  ) {
    return [
      scriptPath,
      "--kind",
      "hyperframes",
      "--project",
      roots.projectRoot,
      "--max",
      "24",
    ];
  }
  if (actionId === LEARNING_MAINTENANCE_ACTIONS.DISTILL) {
    return [
      scriptPath,
      "--root",
      roots.projectRoot,
      "--source",
      learning.behanceReviewed,
      "--source",
      learning.gifReviewed,
      "--output",
      learning.candidateReport,
    ];
  }
  if (actionId === LEARNING_MAINTENANCE_ACTIONS.STATUS) {
    return [
      scriptPath,
      "--project",
      roots.projectRoot,
      "--json",
    ];
  }
  fail(
    "MAINTENANCE_ACTION_NOT_ALLOWLISTED",
    "The maintenance action is not allowlisted.",
    { action_id: actionId },
  );
}

async function buildCommand({
  actionId,
  sequence,
  roots,
  environment,
  timeoutMs,
}) {
  const descriptor = ACTION_ALLOWLIST[actionId];
  if (!descriptor) {
    fail(
      "MAINTENANCE_ACTION_NOT_ALLOWLISTED",
      "The maintenance action is not allowlisted.",
      { action_id: actionId },
    );
  }
  const scriptLocator = assertCanonicalLocator(
    descriptor.script_locator,
    "script_locator",
  );
  const scriptPath = resolveLocator(
    roots,
    "skill",
    scriptLocator,
  );
  const scriptBytes = await readSafeFile(
    roots,
    "skill",
    scriptLocator,
  );
  const executable = process.execPath;
  return {
    sequence,
    action_id: actionId,
    runtime: descriptor.runtime,
    executable,
    script_root_id: "skill",
    script_locator: scriptLocator,
    script_sha256: sha256(scriptBytes),
    script_size_bytes: scriptBytes.length,
    cwd_root_id: "skill",
    cwd_locator: ".",
    args: commandArguments(
      actionId,
      roots,
      scriptPath,
    ),
    args_sha256: canonicalSha256(
      commandArguments(actionId, roots, scriptPath),
    ),
    environment_keys: Object.keys(environment),
    environment_sha256: canonicalSha256(environment),
    timeout_ms: timeoutMs,
  };
}

function expectedOutputs(actionIds, planId) {
  const outputs = [];
  if (
    actionIds.includes(
      LEARNING_MAINTENANCE_ACTIONS.REFRESH_BEHANCE,
    )
  ) {
    outputs.push(
      {
        output_id: "behance-inbox",
        root_id: "project",
        locator: ".detail-page/learning/behance/inbox.md",
        kind: "markdown",
      },
      {
        output_id: "behance-reviewed",
        root_id: "project",
        locator: ".detail-page/learning/behance/reviewed.md",
        kind: "markdown",
      },
    );
  }
  if (
    actionIds.includes(
      LEARNING_MAINTENANCE_ACTIONS.REFRESH_HYPERFRAMES,
    )
  ) {
    outputs.push(
      {
        output_id: "gif-inbox",
        root_id: "project",
        locator: ".detail-page/learning/gif/inbox.md",
        kind: "markdown",
      },
      {
        output_id: "gif-reviewed",
        root_id: "project",
        locator: ".detail-page/learning/gif/reviewed.md",
        kind: "markdown",
      },
    );
  }
  if (actionIds.includes(LEARNING_MAINTENANCE_ACTIONS.DISTILL)) {
    outputs.push({
      output_id: "distilled-candidates",
      root_id: "project",
      locator: ".detail-page/learning/candidates.md",
      kind: "markdown",
    });
  }
  if (actionIds.includes(LEARNING_MAINTENANCE_ACTIONS.STATUS)) {
    outputs.push({
      output_id: "learning-status",
      root_id: "project",
      locator: `.detail-page/learning/runs/${planId}.status.json`,
      kind: "status",
    });
  }
  return outputs.sort((left, right) =>
    left.output_id.localeCompare(right.output_id, "en"),
  );
}

async function collectInputFiles(roots, actionIds) {
  const records = [];
  for (const actionId of actionIds) {
    const descriptor = ACTION_ALLOWLIST[actionId];
    records.push(
      await optionalFileRecord(
        roots,
        "skill",
        descriptor.script_locator,
        "maintenance-script",
      ),
    );
  }
  for (const reference of ACTIVE_RULE_REFERENCES) {
    records.push(
      await optionalFileRecord(
        roots,
        "skill",
        reference,
        "protected-active-reference",
      ),
    );
  }
  for (const locator of [
    ".detail-page/learning/behance/reviewed.md",
    ".detail-page/learning/gif/reviewed.md",
  ]) {
    records.push(
      await optionalFileRecord(
        roots,
        "project",
        locator,
        "reviewed-learning-input",
      ),
    );
  }
  for (const locator of await projectLearningLocators(roots)) {
    records.push(
      await optionalFileRecord(
        roots,
        "project",
        locator,
        "project-learning-input",
      ),
    );
  }
  return sortFileRecords(records);
}

function planCore(plan) {
  const {
    plan_id: _planId,
    plan_digest: _planDigest,
    ...core
  } = plan;
  return core;
}

export function learningMaintenancePlanDigest(plan) {
  return canonicalSha256(planCore(plan));
}

function rootBinding(roots) {
  return canonicalSha256({
    skill_root: roots.skillRoot,
    project_root: roots.projectRoot,
  });
}

function normalizeTimeout(value) {
  const timeout = Number(value ?? DEFAULT_TIMEOUT_MS);
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 100 ||
    timeout > MAX_TIMEOUT_MS
  ) {
    fail(
      "INVALID_MAINTENANCE_TIMEOUT",
      `timeout_ms must be between 100 and ${MAX_TIMEOUT_MS}.`,
      { timeout_ms: value },
    );
  }
  return timeout;
}

function pipelineBinding(captured) {
  return {
    candidate_id: captured.candidate_id,
    intake_receipt_id: captured.intake_receipt_id,
    raw_candidate_sha256: captured.raw_candidate_sha256,
    source_type: captured.raw_candidate.source_type,
    route: structuredClone(captured.route),
  };
}

async function buildPlan({
  captured,
  roots,
  environment,
  timeoutMs,
  executorAgentSessionId,
  validatorAgentSessionId,
}) {
  assertCaptured(captured);
  const executorSession = assertNonEmpty(
    executorAgentSessionId,
    "executor_agent_session_id",
  );
  const validatorSession = assertNonEmpty(
    validatorAgentSessionId,
    "validator_agent_session_id",
  );
  if (executorSession === validatorSession) {
    fail(
      "PRODUCER_VALIDATOR_NOT_SEPARATED",
      "Maintenance executor and structural validator sessions must differ.",
    );
  }
  const actionIds = actionIdsForCaptured(captured);
  const inputFiles = await collectInputFiles(roots, actionIds);
  if (
    inputFiles.some(
      (record) =>
        record.role === "maintenance-script" && !record.exists,
    )
  ) {
    fail(
      "MAINTENANCE_FILE_MISSING",
      "Every allowlisted maintenance script must exist at plan time.",
    );
  }
  if (
    inputFiles.some(
      (record) =>
        record.role === "protected-active-reference" &&
        !record.exists,
    )
  ) {
    fail(
      "ACTIVE_REFERENCE_MISSING",
      "Every protected active learning reference must exist.",
    );
  }
  const planSeed = {
    binding: pipelineBinding(captured),
    root_binding_sha256: rootBinding(roots),
    action_ids: actionIds,
    input_set_sha256: canonicalSha256(inputFiles),
  };
  const planId = `learning-maintenance-${canonicalSha256(
    planSeed,
  ).slice(0, 24)}`;
  const commands = [];
  for (const [index, actionId] of actionIds.entries()) {
    commands.push(
      await buildCommand({
        actionId,
        sequence: index + 1,
        roots,
        environment,
        timeoutMs,
      }),
    );
  }
  const core = {
    schema_version: PLAN_SCHEMA_VERSION,
    plan_type: "learning.maintenance.execution",
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    pipeline_binding: pipelineBinding(captured),
    root_binding_sha256: rootBinding(roots),
    action_ids: actionIds,
    commands,
    input_files: inputFiles,
    input_set_sha256: canonicalSha256(inputFiles),
    protected_references: ACTIVE_RULE_REFERENCES.map(
      (reference) => ({
        root_id: "skill",
        locator: reference,
      }),
    ),
    expected_outputs: expectedOutputs(actionIds, planId),
    result_locator: `.detail-page/learning/runs/${planId}.receipt.json`,
    executor_agent_session_id: executorSession,
    validator_agent_session_id: validatorSession,
  };
  const digest = canonicalSha256(core);
  return Object.freeze({
    ...core,
    plan_id: planId,
    plan_digest: digest,
  });
}

async function rebuildExpectedCommands(
  plan,
  roots,
  environment,
  expectedTimeoutMs,
) {
  const expected = [];
  for (const [index, actionId] of plan.action_ids.entries()) {
    expected.push(
      await buildCommand({
        actionId,
        sequence: index + 1,
        roots,
        environment,
        timeoutMs: expectedTimeoutMs,
      }),
    );
  }
  return expected;
}

async function assertPlan(
  plan,
  roots,
  environment,
  expectedTimeoutMs,
) {
  if (
    !plan ||
    plan.schema_version !== PLAN_SCHEMA_VERSION ||
    plan.plan_type !== "learning.maintenance.execution" ||
    plan.adapter_id !== ADAPTER_ID ||
    plan.adapter_version !== ADAPTER_VERSION
  ) {
    fail(
      "INVALID_MAINTENANCE_PLAN",
      "A LearningPipeline maintenance execution plan is required.",
    );
  }
  if (
    !Array.isArray(plan.action_ids) ||
    plan.action_ids.length === 0 ||
    !Array.isArray(plan.commands) ||
    plan.commands.length !== plan.action_ids.length
  ) {
    fail(
      "INVALID_MAINTENANCE_PLAN",
      "The maintenance plan must contain a 1:1 action and command sequence.",
    );
  }
  if (learningMaintenancePlanDigest(plan) !== plan.plan_digest) {
    fail(
      "MAINTENANCE_PLAN_DIGEST_MISMATCH",
      "The maintenance plan changed after planning.",
    );
  }
  if (rootBinding(roots) !== plan.root_binding_sha256) {
    fail(
      "MAINTENANCE_ROOT_BINDING_MISMATCH",
      "The plan is being executed against different roots.",
    );
  }
  const expectedPlanId = `learning-maintenance-${canonicalSha256({
    binding: plan.pipeline_binding,
    root_binding_sha256: plan.root_binding_sha256,
    action_ids: plan.action_ids,
    input_set_sha256: plan.input_set_sha256,
  }).slice(0, 24)}`;
  if (
    plan.plan_id !== expectedPlanId ||
    !/^learning-maintenance-[a-f0-9]{24}$/.test(plan.plan_id)
  ) {
    fail(
      "MAINTENANCE_PLAN_ID_MISMATCH",
      "The deterministic maintenance plan ID is invalid.",
    );
  }
  for (const command of plan.commands ?? []) {
    assertCanonicalLocator(
      command?.script_locator,
      "commands[].script_locator",
    );
    if (command?.cwd_locator !== ".") {
      assertCanonicalLocator(
        command?.cwd_locator,
        "commands[].cwd_locator",
      );
    }
  }
  const actionIds = actionIdsForCaptured({
    status: "CAPTURED",
    raw_candidate: {
      source_type: plan.pipeline_binding?.source_type,
    },
  });
  if (
    canonicalJson(actionIds) !==
      canonicalJson(plan.action_ids) ||
    actionIds.some((actionId) => !ACTION_ALLOWLIST[actionId])
  ) {
    fail(
      "MAINTENANCE_ACTION_NOT_ALLOWLISTED",
      "The plan action sequence is not allowlisted for its source.",
    );
  }
  const expectedCommands = await rebuildExpectedCommands(
    plan,
    roots,
    environment,
    expectedTimeoutMs,
  );
  if (
    canonicalJson(expectedCommands) !== canonicalJson(plan.commands)
  ) {
    fail(
      "MAINTENANCE_COMMAND_TAMPER",
      "Executable, script, cwd, environment, args, or timeout changed.",
    );
  }
  const expectedOutputSet = expectedOutputs(
    actionIds,
    plan.plan_id,
  );
  if (
    canonicalJson(expectedOutputSet) !==
    canonicalJson(plan.expected_outputs)
  ) {
    fail(
      "MAINTENANCE_OUTPUT_CONTRACT_TAMPER",
      "The expected output set changed after planning.",
    );
  }
  const expectedResultLocator =
    `.detail-page/learning/runs/${plan.plan_id}.receipt.json`;
  if (plan.result_locator !== expectedResultLocator) {
    fail(
      "MAINTENANCE_OUTPUT_CONTRACT_TAMPER",
      "The deterministic result locator changed after planning.",
    );
  }
  assertCanonicalLocator(
    expectedResultLocator,
    "result_locator",
  );
}

async function assertInputSet(plan, roots) {
  const current = await collectInputFiles(
    roots,
    plan.action_ids,
  );
  const currentDigest = canonicalSha256(current);
  if (
    currentDigest !== plan.input_set_sha256 ||
    canonicalJson(current) !== canonicalJson(plan.input_files)
  ) {
    fail(
      "MAINTENANCE_INPUT_DRIFT",
      "A maintenance input changed after planning.",
      {
        expected_input_set_sha256: plan.input_set_sha256,
        actual_input_set_sha256: currentDigest,
      },
    );
  }
}

async function snapshotActiveReferences(plan, roots) {
  const snapshots = [];
  for (const reference of plan.protected_references) {
    const bytes = await readSafeFile(
      roots,
      reference.root_id,
      reference.locator,
    );
    snapshots.push({
      ...reference,
      bytes,
      sha256: sha256(bytes),
    });
  }
  return snapshots;
}

async function atomicWrite(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  const staging = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(staging, bytes, { flag: "wx" });
    await rename(staging, target);
  } finally {
    await rm(staging, { force: true });
  }
}

async function restoreActiveReferences(snapshots, roots) {
  for (const snapshot of snapshots) {
    const target = resolveLocator(
      roots,
      snapshot.root_id,
      snapshot.locator,
    );
    const current = await readFile(target).catch(() => null);
    if (
      !current ||
      current.length !== snapshot.bytes.length ||
      !current.equals(snapshot.bytes)
    ) {
      await atomicWrite(target, snapshot.bytes);
    }
  }
}

async function assertActiveReferencesUnchanged(snapshots, roots) {
  for (const snapshot of snapshots) {
    const current = await readSafeFile(
      roots,
      snapshot.root_id,
      snapshot.locator,
    );
    if (sha256(current) !== snapshot.sha256) {
      fail(
        "ACTIVE_REFERENCE_MUTATED",
        "A maintenance script modified a protected active reference.",
        { locator: snapshot.locator },
      );
    }
  }
}

function runSpawn(command, environment, roots) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let spawnError = null;
    const cwd =
      command.cwd_locator === "."
        ? rootById(roots, command.cwd_root_id)
        : resolveLocator(
            roots,
            command.cwd_root_id,
            command.cwd_locator,
          );
    const child = spawn(command.executable, command.args, {
      cwd,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (chunks, name) => (chunk) => {
      const bytes = Buffer.from(chunk);
      if (name === "stdout") stdoutBytes += bytes.length;
      else stderrBytes += bytes.length;
      chunks.push(bytes);
      if (
        stdoutBytes + stderrBytes > MAX_OUTPUT_BYTES &&
        !outputLimitExceeded
      ) {
        outputLimitExceeded = true;
        child.kill();
      }
    };
    child.stdout.on("data", collect(stdoutChunks, "stdout"));
    child.stderr.on("data", collect(stderrChunks, "stderr"));
    child.on("error", (error) => {
      spawnError = error;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, command.timeout_ms);
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks);
      resolve({
        sequence: command.sequence,
        action_id: command.action_id,
        script_locator: command.script_locator,
        script_sha256: command.script_sha256,
        args_sha256: command.args_sha256,
        environment_sha256: command.environment_sha256,
        timeout_ms: command.timeout_ms,
        timed_out: timedOut,
        output_limit_exceeded: outputLimitExceeded,
        exit_code: exitCode,
        signal: signal ?? null,
        spawn_error_code: spawnError?.code ?? null,
        stdout_sha256: sha256(stdout),
        stdout_bytes: stdout.length,
        stderr_sha256: sha256(stderr),
        stderr_bytes: stderr.length,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        stdout,
        stderr,
      });
    });
  });
}

function publicCommandReceipt(receipt) {
  const {
    stdout: _stdout,
    stderr: _stderr,
    ...publicReceipt
  } = receipt;
  return publicReceipt;
}

async function materializeStatusOutput(
  plan,
  commandReceipts,
  roots,
) {
  const statusReceipt = [...commandReceipts]
    .reverse()
    .find(
      (receipt) =>
        receipt.action_id ===
        LEARNING_MAINTENANCE_ACTIONS.STATUS,
    );
  if (!statusReceipt) return;
  let parsed;
  try {
    parsed = JSON.parse(statusReceipt.stdout.toString("utf8"));
  } catch {
    fail(
      "LEARNING_STATUS_INVALID_JSON",
      "The allowlisted learning-status script did not return JSON.",
    );
  }
  const statusOutput = plan.expected_outputs.find(
    (output) => output.kind === "status",
  );
  const target = resolveLocator(
    roots,
    statusOutput.root_id,
    statusOutput.locator,
  );
  await assertNoSymlinkPath(
    rootById(roots, statusOutput.root_id),
    target,
    true,
  );
  await atomicWrite(
    target,
    Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, "utf8"),
  );
}

async function collectOutputHashSet(plan, roots) {
  const outputs = [];
  for (const expected of plan.expected_outputs) {
    const bytes = await readSafeFile(
      roots,
      expected.root_id,
      expected.locator,
    );
    outputs.push({
      ...expected,
      sha256: sha256(bytes),
      size_bytes: bytes.length,
    });
  }
  return outputs.sort((left, right) =>
    left.output_id.localeCompare(right.output_id, "en"),
  );
}

function executionReceipt({
  plan,
  commandReceipts,
  outputHashSet,
  adapterCodeSha256,
  status,
  failureCode = null,
}) {
  const publicCommands = commandReceipts.map(publicCommandReceipt);
  const startedAt =
    publicCommands[0]?.started_at ?? new Date().toISOString();
  const finishedAt =
    publicCommands.at(-1)?.finished_at ?? startedAt;
  const core = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    receipt_type: "learning.maintenance.execution",
    execution_id: `learning-execution-${plan.plan_digest.slice(
      0,
      24,
    )}`,
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    adapter_code_sha256: adapterCodeSha256,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    pipeline_binding: structuredClone(plan.pipeline_binding),
    input_set_sha256: plan.input_set_sha256,
    executor_agent_session_id:
      plan.executor_agent_session_id,
    commands: publicCommands,
    output_hash_set: structuredClone(outputHashSet),
    output_set_sha256: canonicalSha256(outputHashSet),
    status,
    failure_code: failureCode,
    started_at: startedAt,
    finished_at: finishedAt,
  };
  return {
    ...core,
    receipt_sha256: canonicalSha256(core),
  };
}

function structuralValidationReceipt({
  plan,
  execution,
  adapterCodeSha256,
}) {
  const pass = execution.status === "PASS";
  const outputIds = execution.output_hash_set.map(
    (output) => output.output_id,
  );
  const checks = [
    {
      check_id: "allowlisted-command-contract",
      severity: "hard",
      status: pass ? "PASS" : "FAIL",
      evidence_artifact_ids: outputIds,
    },
    {
      check_id: "input-hash-set",
      severity: "hard",
      status: pass ? "PASS" : "FAIL",
      evidence_artifact_ids: outputIds,
    },
    {
      check_id: "exit-timeout-output-hash-set",
      severity: "hard",
      status: pass ? "PASS" : "FAIL",
      evidence_artifact_ids: outputIds,
    },
    {
      check_id: "active-reference-immutability",
      severity: "hard",
      status: pass ? "PASS" : "FAIL",
      evidence_artifact_ids: outputIds,
    },
  ];
  const core = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    receipt_type: "learning.maintenance.structural-validation",
    validation_id: `learning-validation-${plan.plan_digest.slice(
      0,
      24,
    )}`,
    subject: {
      artifact_set_digest: execution.output_set_sha256,
      artifact_ids: outputIds,
      execution_receipt_sha256: execution.receipt_sha256,
    },
    validator: {
      name: "LearningPipelineMaintenanceStructuralValidator",
      version: ADAPTER_VERSION,
      code_sha256: adapterCodeSha256,
      agent_id: ADAPTER_ID,
      agent_session_id: plan.validator_agent_session_id,
    },
    producer: {
      agent_session_ids: [plan.executor_agent_session_id],
    },
    policy: {
      policy_id: "learning-maintenance-execution",
      policy_sha256: plan.plan_digest,
    },
    validator_kind: "deterministic",
    checks,
    score: pass ? 100 : 0,
    hard_failures: pass
      ? []
      : [execution.failure_code || "MAINTENANCE_EXECUTION_FAILED"],
    verdict: pass ? "PASS" : "FAIL",
    started_at: execution.started_at,
    finished_at: execution.finished_at,
  };
  return {
    ...core,
    receipt_sha256: canonicalSha256(core),
  };
}

function resultEnvelope({
  plan,
  execution,
  validation,
  idempotentReuse,
}) {
  return {
    schema_version: RECEIPT_SCHEMA_VERSION,
    status: execution.status,
    plan_id: plan.plan_id,
    plan_digest: plan.plan_digest,
    pipeline_binding: structuredClone(plan.pipeline_binding),
    execution_receipt: execution,
    execution_receipt_sha256: execution.receipt_sha256,
    validation_receipt: validation,
    validation_receipt_sha256: validation.receipt_sha256,
    output_hash_set: structuredClone(
      execution.output_hash_set,
    ),
    output_set_sha256: execution.output_set_sha256,
    idempotent_reuse: idempotentReuse,
  };
}

function storedEnvelope(result) {
  const persistent = {
    ...result,
    idempotent_reuse: false,
  };
  return {
    schema_version: RECEIPT_SCHEMA_VERSION,
    result: persistent,
    result_sha256: canonicalSha256(persistent),
  };
}

async function readStoredResult(plan, roots) {
  const target = resolveLocator(
    roots,
    "project",
    plan.result_locator,
  );
  if (!(await exists(target))) return null;
  const bytes = await readSafeFile(
    roots,
    "project",
    plan.result_locator,
  );
  let envelope;
  try {
    envelope = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(
      "MAINTENANCE_RECEIPT_INVALID",
      "The stored maintenance result is not valid JSON.",
    );
  }
  if (
    canonicalSha256(envelope.result) !==
      envelope.result_sha256 ||
    envelope.result?.plan_digest !== plan.plan_digest ||
    envelope.result?.status !== "PASS"
  ) {
    fail(
      "MAINTENANCE_RECEIPT_TAMPER",
      "The stored maintenance result failed integrity checks.",
    );
  }
  const currentOutputs = await collectOutputHashSet(plan, roots);
  if (
    canonicalJson(currentOutputs) !==
    canonicalJson(envelope.result.output_hash_set)
  ) {
    fail(
      "MAINTENANCE_OUTPUT_DRIFT",
      "A successful maintenance output changed after execution.",
      {
        expected_output_set_sha256:
          envelope.result.output_set_sha256,
        actual_output_set_sha256:
          canonicalSha256(currentOutputs),
      },
    );
  }
  return {
    ...structuredClone(envelope.result),
    idempotent_reuse: true,
  };
}

async function writeStoredResult(plan, result, roots) {
  const target = resolveLocator(
    roots,
    "project",
    plan.result_locator,
  );
  await assertNoSymlinkPath(
    roots.projectRoot,
    target,
    true,
  );
  await atomicWrite(
    target,
    Buffer.from(
      `${JSON.stringify(storedEnvelope(result), null, 2)}\n`,
      "utf8",
    ),
  );
}

function commandFailureCode(receipt) {
  if (receipt.timed_out) return "MAINTENANCE_TIMEOUT";
  if (receipt.output_limit_exceeded) {
    return "MAINTENANCE_OUTPUT_LIMIT";
  }
  if (receipt.spawn_error_code) return "MAINTENANCE_SPAWN_FAILED";
  if (receipt.exit_code !== 0) return "MAINTENANCE_EXIT_NONZERO";
  return null;
}

async function executePlan({
  plan,
  roots,
  environment,
  timeoutMs,
}) {
  await assertPlan(plan, roots, environment, timeoutMs);
  const adapterCodeSha256 = sha256(await readFile(ADAPTER_FILE));
  const reused = await readStoredResult(plan, roots);
  if (reused) return Object.freeze(reused);

  const lockLocator = `.detail-page/learning/runs/${plan.plan_id}.lock`;
  const lockPath = resolveLocator(
    roots,
    "project",
    lockLocator,
  );
  await assertNoSymlinkPath(
    roots.projectRoot,
    lockPath,
    true,
  );
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    await mkdir(lockPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail(
        "MAINTENANCE_EXECUTION_IN_PROGRESS",
        "The same maintenance plan is already executing.",
      );
    }
    throw error;
  }

  let activeSnapshots = [];
  const commandReceipts = [];
  try {
    const racedReuse = await readStoredResult(plan, roots);
    if (racedReuse) return Object.freeze(racedReuse);
    await assertInputSet(plan, roots);
    activeSnapshots = await snapshotActiveReferences(plan, roots);
    for (const command of plan.commands) {
      const receipt = await runSpawn(
        command,
        environment,
        roots,
      );
      commandReceipts.push(receipt);
      const failureCode = commandFailureCode(receipt);
      if (failureCode) {
        const execution = executionReceipt({
          plan,
          commandReceipts,
          outputHashSet: [],
          adapterCodeSha256,
          status: "FAIL",
          failureCode,
        });
        const validation = structuralValidationReceipt({
          plan,
          execution,
          adapterCodeSha256,
        });
        fail(
          failureCode,
          "An allowlisted maintenance script did not complete successfully.",
          {
            result: resultEnvelope({
              plan,
              execution,
              validation,
              idempotentReuse: false,
            }),
          },
        );
      }
    }
    await assertActiveReferencesUnchanged(
      activeSnapshots,
      roots,
    );
    await materializeStatusOutput(
      plan,
      commandReceipts,
      roots,
    );
    const outputHashSet = await collectOutputHashSet(plan, roots);
    const execution = executionReceipt({
      plan,
      commandReceipts,
      outputHashSet,
      adapterCodeSha256,
      status: "PASS",
    });
    const validation = structuralValidationReceipt({
      plan,
      execution,
      adapterCodeSha256,
    });
    const result = resultEnvelope({
      plan,
      execution,
      validation,
      idempotentReuse: false,
    });
    await writeStoredResult(plan, result, roots);
    return Object.freeze(result);
  } catch (error) {
    if (activeSnapshots.length > 0) {
      await restoreActiveReferences(activeSnapshots, roots);
    }
    throw error;
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

export async function createLearningMaintenancePlan({
  captured,
  skillRoot,
  projectRoot,
  executorAgentSessionId,
  validatorAgentSessionId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  environment = process.env,
} = {}) {
  const roots = {
    skillRoot: assertAbsoluteRoot(skillRoot, "skillRoot"),
    projectRoot: assertAbsoluteRoot(
      projectRoot,
      "projectRoot",
    ),
  };
  return buildPlan({
    captured,
    roots,
    environment: fixedEnvironment(environment),
    timeoutMs: normalizeTimeout(timeoutMs),
    executorAgentSessionId,
    validatorAgentSessionId,
  });
}

export async function executeLearningMaintenancePlan({
  plan,
  skillRoot,
  projectRoot,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  environment = process.env,
} = {}) {
  const roots = {
    skillRoot: assertAbsoluteRoot(skillRoot, "skillRoot"),
    projectRoot: assertAbsoluteRoot(
      projectRoot,
      "projectRoot",
    ),
  };
  return executePlan({
    plan,
    roots,
    environment: fixedEnvironment(environment),
    timeoutMs: normalizeTimeout(timeoutMs),
  });
}

export class LearningPipelineExecutionAdapter {
  constructor({
    skillRoot,
    projectRoot,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    environment = process.env,
  } = {}) {
    this.skillRoot = assertAbsoluteRoot(skillRoot, "skillRoot");
    this.projectRoot = assertAbsoluteRoot(
      projectRoot,
      "projectRoot",
    );
    this.timeoutMs = normalizeTimeout(timeoutMs);
    this.environment = fixedEnvironment(environment);
    Object.freeze(this);
  }

  plan(
    captured,
    {
      executorAgentSessionId,
      validatorAgentSessionId,
    } = {},
  ) {
    return buildPlan({
      captured,
      roots: {
        skillRoot: this.skillRoot,
        projectRoot: this.projectRoot,
      },
      environment: this.environment,
      timeoutMs: this.timeoutMs,
      executorAgentSessionId,
      validatorAgentSessionId,
    });
  }

  execute(plan) {
    return executePlan({
      plan,
      roots: {
        skillRoot: this.skillRoot,
        projectRoot: this.projectRoot,
      },
      environment: this.environment,
      timeoutMs: this.timeoutMs,
    });
  }
}
