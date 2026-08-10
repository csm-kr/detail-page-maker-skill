import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  validateImageWorkOrder,
} from "../production-contracts.mjs";
import {
  SALES_MOTION_SHOT_TYPES,
  SALES_MOTION_TEMPLATE_IDS,
} from "../sales-motion-pipeline-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_MEMBER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DETAIL_LEVEL = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
});
const SHOT_TYPES = new Set(SALES_MOTION_SHOT_TYPES);
const TEMPLATE_IDS = new Set(SALES_MOTION_TEMPLATE_IDS);
const RUNNER_SEGMENTS = Object.freeze([
  ".agents",
  "skills",
  "god-tibo-gpt-image2-skill",
  "scripts",
  "tibo-batch.mjs",
]);

export class GodTiboAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GodTiboAdapterError";
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function requireDirectory(directoryPath, code, message) {
  const resolved = path.resolve(String(directoryPath ?? ""));
  let info;
  try {
    info = await lstat(resolved);
  } catch (error) {
    throw new GodTiboAdapterError(code, message, {
      path: resolved,
      cause: error?.code,
    });
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new GodTiboAdapterError(code, message, { path: resolved });
  }
  return realpath(resolved);
}

async function resolveStagingRoots(
  allowedStagingRoot,
  stagingRoot,
) {
  const allowed = await requireDirectory(
    allowedStagingRoot,
    "ALLOWED_STAGING_ROOT_REQUIRED",
    "허용 staging root는 실제 일반 디렉터리여야 합니다.",
  );
  const staging = await requireDirectory(
    stagingRoot,
    "STAGING_ROOT_REQUIRED",
    "staging root는 실제 일반 디렉터리여야 합니다.",
  );
  if (!isWithin(allowed, staging)) {
    throw new GodTiboAdapterError(
      "STAGING_ROOT_OUTSIDE_ALLOWED_ROOT",
      "staging root가 WorkOrder의 허용 경로 밖입니다.",
      {
        allowed_staging_root: allowed,
        staging_root: staging,
      },
    );
  }
  return { allowed, staging };
}

async function resolveRunner(skillRoot) {
  const localSkillRoot = await requireDirectory(
    skillRoot,
    "PROJECT_LOCAL_SKILL_ROOT_REQUIRED",
    "프로젝트 로컬 skill root가 필요합니다.",
  );
  const runnerPath = path.resolve(
    localSkillRoot,
    ...RUNNER_SEGMENTS,
  );
  if (!isWithin(localSkillRoot, runnerPath)) {
    throw new GodTiboAdapterError(
      "PROJECT_LOCAL_TIBO_RUNNER_REQUIRED",
      "God Tibo runner가 프로젝트 로컬 skill root 밖입니다.",
      { runner_path: runnerPath },
    );
  }
  let info;
  try {
    info = await lstat(runnerPath);
  } catch (error) {
    throw new GodTiboAdapterError(
      "PROJECT_LOCAL_TIBO_RUNNER_REQUIRED",
      "프로젝트 로컬 tibo-batch.mjs를 찾을 수 없습니다.",
      { runner_path: runnerPath, cause: error?.code },
    );
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new GodTiboAdapterError(
      "PROJECT_LOCAL_TIBO_RUNNER_REQUIRED",
      "tibo-batch.mjs는 프로젝트 로컬 일반 파일이어야 합니다.",
      { runner_path: runnerPath },
    );
  }
  return {
    runnerPath,
    runnerSha256: sha256(await readFile(runnerPath)),
  };
}

function assertWorkOrder(workOrder) {
  const validation = validateImageWorkOrder(workOrder);
  if (!validation.ok) {
    throw new GodTiboAdapterError(
      "INVALID_IMAGE_WORK_ORDER",
      "God Tibo command plan 전에 G2 image WorkOrder 검증이 필요합니다.",
      { errors: validation.errors },
    );
  }
}

function assertIdempotencyKey(idempotencyKey) {
  if (!SHA256.test(String(idempotencyKey ?? ""))) {
    throw new GodTiboAdapterError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "실행 계획에는 SHA-256 idempotency key가 필요합니다.",
    );
  }
}

function assertSafeMemberId(value, field) {
  if (!SAFE_MEMBER_ID.test(String(value ?? ""))) {
    throw new GodTiboAdapterError(
      "UNSAFE_FAN_OUT_MEMBER_ID",
      `${field}는 staging 경로에 안전한 식별자여야 합니다.`,
      { field, value },
    );
  }
}

function itemSpecIndex(itemSpecs, fanOut) {
  if (
    !Array.isArray(itemSpecs) ||
    itemSpecs.length !== fanOut.length
  ) {
    throw new GodTiboAdapterError(
      "IMAGE_ITEM_SPEC_SET_MISMATCH",
      "itemSpecs는 WorkOrder fan_out 전체와 정확히 일치해야 합니다.",
      {
        expected_items: fanOut.length,
        actual_items: Array.isArray(itemSpecs)
          ? itemSpecs.length
          : null,
      },
    );
  }
  const fanOutIds = new Set(
    fanOut.map((member) => member.candidate_id),
  );
  const index = new Map();
  for (const spec of itemSpecs) {
    const candidateId = String(spec?.candidate_id ?? "");
    if (
      !fanOutIds.has(candidateId) ||
      index.has(candidateId)
    ) {
      throw new GodTiboAdapterError(
        "IMAGE_ITEM_SPEC_SET_MISMATCH",
        "itemSpecs candidate_id는 fan_out과 중복 없이 일치해야 합니다.",
        { candidate_id: candidateId },
      );
    }
    if (
      typeof spec.prompt !== "string" ||
      spec.prompt.trim().length === 0
    ) {
      throw new GodTiboAdapterError(
        "IMAGE_PROMPT_REQUIRED",
        "각 candidate에는 명시적인 prompt가 필요합니다.",
        { candidate_id: candidateId },
      );
    }
    if (
      !Array.isArray(spec.references) ||
      spec.references.some(
        (reference) =>
          typeof reference !== "string" ||
          reference.trim().length === 0,
      )
    ) {
      throw new GodTiboAdapterError(
        "IMAGE_REFERENCES_INVALID",
        "references는 경로 문자열 배열이어야 합니다.",
        { candidate_id: candidateId },
      );
    }
    if (
      spec.gif !== undefined ||
      /\.gif$/i.test(String(spec.output_path ?? ""))
    ) {
      throw new GodTiboAdapterError(
        "GOD_TIBO_GIF_OUTPUT_FORBIDDEN",
        "God Tibo adapter에서는 GIF 출력 설정을 사용할 수 없습니다.",
        { candidate_id: candidateId },
      );
    }
    if (
      !SHOT_TYPES.has(spec?.shot_type) ||
      !TEMPLATE_IDS.has(spec?.recommended_template) ||
      typeof spec?.consistency_group !== "string" ||
      spec.consistency_group.trim().length === 0
    ) {
      throw new GodTiboAdapterError(
        "IMAGE_SHOT_TEMPLATE_METADATA_REQUIRED",
        "각 candidate는 shot_type, 추천 HyperFrames 템플릿과 consistency group을 가져야 합니다.",
        { candidate_id: candidateId },
      );
    }
    index.set(candidateId, {
      candidate_id: candidateId,
      prompt: spec.prompt.trim(),
      references: spec.references.map((reference) =>
        path.resolve(reference),
      ),
      shot_type: spec.shot_type,
      recommended_template: spec.recommended_template,
      consistency_group: spec.consistency_group.trim(),
    });
  }
  return index;
}

function retryCandidateIds(config) {
  if (config.retry === undefined) {
    return {
      retryMode: "initial",
      candidateIds: config.fan_out.map(
        (member) => member.candidate_id,
      ),
    };
  }
  const previousById = new Map(
    config.retry.previous_candidates.map((candidate) => [
      candidate.candidate_id,
      candidate,
    ]),
  );
  for (const candidateId of config.retry.requested_candidate_ids) {
    if (previousById.get(candidateId)?.status !== "failed") {
      throw new GodTiboAdapterError(
        "FAILED_MEMBER_RETRY_ONLY",
        "God Tibo 부분 재시도는 이전에 실패한 member만 허용합니다.",
        { candidate_id: candidateId },
      );
    }
  }
  return {
    retryMode: "failed_members_only",
    candidateIds: [...config.retry.requested_candidate_ids],
  };
}

function tiboSizeConfig(config, spec) {
  if (config.size_mode === "target") {
    return {
      size_mode: "controllable",
      target_size: `${config.target_size.width}x${config.target_size.height}`,
    };
  }
  if (spec.references.length === 0) {
    throw new GodTiboAdapterError(
      "REFERENCE_IMAGE_REQUIRED",
      "reference size mode의 각 item에는 canonical Image 1이 필요합니다.",
      { candidate_id: spec.candidate_id },
    );
  }
  return { size_mode: "invariant" };
}

function withQualityGate(prompt) {
  return /QUALITY_GATE:CLEAN_COMMERCIAL/.test(prompt)
    ? prompt
    : `${prompt}\nQUALITY_GATE:CLEAN_COMMERCIAL`;
}

function batchCommand({
  runnerPath,
  staging,
  idempotencyKey,
  config,
  members,
  specs,
}) {
  if (
    !Array.isArray(members) ||
    members.length === 0 ||
    !Array.isArray(specs) ||
    specs.length !== members.length
  ) {
    throw new GodTiboAdapterError(
      "IMAGE_PROVIDER_BATCH_INVALID",
      "God Tibo provider batch에는 같은 수의 member와 item spec이 필요합니다.",
    );
  }
  members.forEach((member) => {
    assertSafeMemberId(member.candidate_id, "candidate_id");
    assertSafeMemberId(member.worker_id, "worker_id");
  });
  const batchRoot = path.join(
    staging,
    "god-tibo",
    idempotencyKey,
    "provider-batch",
  );
  const jobPath = path.join(batchRoot, "job.json");
  const outputDir = path.join(batchRoot, "output");
  const jobSpec = {
    items: specs.map((spec) => ({
        prompt: withQualityGate(spec.prompt),
        references: [...spec.references],
      })),
    detail_level: DETAIL_LEVEL[config.detail_level],
    workers: members.length,
    ...tiboSizeConfig(config, specs[0]),
    output_dir: outputDir,
    gif: false,
  };
  const candidateBindings = members.map((member, index) => ({
    sequence: index,
    candidate_id: member.candidate_id,
    worker_id: member.worker_id,
    input_sha256: member.input_sha256,
    expected_output_sha256: member.output_sha256,
    shot_type: specs[index].shot_type,
    recommended_template: specs[index].recommended_template,
    consistency_group: specs[index].consistency_group,
  }));
  return {
    batch_id: `god-tibo-${idempotencyKey.slice(0, 16)}`,
    provider_batch_size: members.length,
    provider_workers: members.length,
    candidate_bindings: candidateBindings,
    command: process.execPath,
    argv: [runnerPath, "--job", jobPath],
    cwd: path.dirname(runnerPath),
    env: {
      DETAIL_PAGE_IDEMPOTENCY_KEY: idempotencyKey,
      DETAIL_PAGE_PROVIDER_BATCH_SIZE: String(members.length),
    },
    job_path: jobPath,
    job_spec: jobSpec,
    job_spec_sha256: sha256(canonicalJson(jobSpec)),
  };
}

export async function buildGodTiboCommandPlan({
  skillRoot,
  workOrder,
  itemSpecs,
  allowedStagingRoot,
  stagingRoot,
  idempotencyKey,
} = {}) {
  assertWorkOrder(workOrder);
  assertIdempotencyKey(idempotencyKey);
  const { staging } = await resolveStagingRoots(
    allowedStagingRoot,
    stagingRoot,
  );
  const { runnerPath, runnerSha256 } =
    await resolveRunner(skillRoot);
  const config = workOrder.execution_config;
  const specsById = itemSpecIndex(itemSpecs, config.fan_out);
  const { retryMode, candidateIds } =
    retryCandidateIds(config);
  const candidatesById = new Map(
    config.fan_out.map((member) => [
      member.candidate_id,
      member,
    ]),
  );
  const members = candidateIds.map((candidateId) =>
    candidatesById.get(candidateId),
  );
  const specs = candidateIds.map((candidateId) =>
    specsById.get(candidateId),
  );
  const commands = [
    batchCommand({
      runnerPath,
      staging,
      idempotencyKey,
      config,
      members,
      specs,
    }),
  ];
  const planPayload = {
    adapter: "GodTiboImageAdapter",
    runner_path: runnerPath,
    runner_sha256: runnerSha256,
    work_order_sha256: sha256(canonicalJson(workOrder)),
    idempotency_key: idempotencyKey,
    staging_root: staging,
    retry_mode: retryMode,
    commands,
  };
  const commandPlanSha256 = sha256(canonicalJson(planPayload));

  return Object.freeze({
    ...planPayload,
    planning_receipt: {
      receipt_type: "production.command_plan",
      adapter: "GodTiboImageAdapter",
      command_plan_sha256: commandPlanSha256,
      runner_sha256: runnerSha256,
      work_order_sha256: planPayload.work_order_sha256,
      idempotency_key: idempotencyKey,
      items: config.items,
      workers: config.workers,
      detail_level: config.detail_level,
      size_mode: config.size_mode,
      size_confirmation_decision_id:
        config.size_confirmation_decision_id,
      gif_output: "forbidden",
      planned_candidate_ids: [...candidateIds],
      provider_batch_count: 1,
      provider_batch_size: candidateIds.length,
      provider_workers: candidateIds.length,
    },
  });
}
