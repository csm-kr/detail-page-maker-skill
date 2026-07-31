import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  validateMotionProductionChain,
} from "../production-contracts.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const RENDER_FPS = new Set([24, 30, 60]);

export class HyperframesAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "HyperframesAdapterError";
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

function isTimestamp(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

async function requireDirectory(directoryPath, code, message) {
  const resolved = path.resolve(String(directoryPath ?? ""));
  let info;
  try {
    info = await lstat(resolved);
  } catch (error) {
    throw new HyperframesAdapterError(code, message, {
      path: resolved,
      cause: error?.code,
    });
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new HyperframesAdapterError(code, message, {
      path: resolved,
    });
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
    throw new HyperframesAdapterError(
      "STAGING_ROOT_OUTSIDE_ALLOWED_ROOT",
      "HyperFrames staging root가 허용 경로 밖입니다.",
      {
        allowed_staging_root: allowed,
        staging_root: staging,
      },
    );
  }
  return { allowed, staging };
}

async function resolveProjectLocalCli(projectRoot) {
  const project = await requireDirectory(
    projectRoot,
    "HYPERFRAMES_PROJECT_REQUIRED",
    "HyperFrames project root가 필요합니다.",
  );
  const nodeModulesRoot = path.join(project, "node_modules");
  const packageRoot = path.join(nodeModulesRoot, "hyperframes");
  const packagePath = path.join(packageRoot, "package.json");
  let packageInfo;
  let packageJson;
  try {
    packageInfo = await lstat(packagePath);
    packageJson = JSON.parse(
      await readFile(packagePath, "utf8"),
    );
  } catch (error) {
    throw new HyperframesAdapterError(
      "PROJECT_LOCAL_HYPERFRAMES_CLI_REQUIRED",
      "project node_modules의 hyperframes package가 필요합니다.",
      {
        package_path: packagePath,
        cause: error?.code ?? "INVALID_PACKAGE_JSON",
      },
    );
  }
  if (!packageInfo.isFile() || packageInfo.isSymbolicLink()) {
    throw new HyperframesAdapterError(
      "PROJECT_LOCAL_HYPERFRAMES_CLI_REQUIRED",
      "hyperframes package.json은 프로젝트 로컬 일반 파일이어야 합니다.",
      { package_path: packagePath },
    );
  }
  const bin =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.hyperframes;
  if (typeof bin !== "string" || bin.length === 0) {
    throw new HyperframesAdapterError(
      "PROJECT_LOCAL_HYPERFRAMES_CLI_REQUIRED",
      "hyperframes package.json에 bin.hyperframes가 필요합니다.",
      { package_path: packagePath },
    );
  }
  const cliPath = path.resolve(packageRoot, bin);
  if (!isWithin(packageRoot, cliPath)) {
    throw new HyperframesAdapterError(
      "PROJECT_LOCAL_HYPERFRAMES_CLI_REQUIRED",
      "HyperFrames bin entry가 package 밖을 가리킵니다.",
      { package_path: packagePath, bin },
    );
  }
  let info;
  try {
    info = await lstat(cliPath);
  } catch (error) {
    throw new HyperframesAdapterError(
      "PROJECT_LOCAL_HYPERFRAMES_CLI_REQUIRED",
      "hyperframes package의 CLI entry를 찾을 수 없습니다.",
      { cli_path: cliPath, cause: error?.code },
    );
  }
  if (!info.isFile() && !info.isSymbolicLink()) {
    throw new HyperframesAdapterError(
      "PROJECT_LOCAL_HYPERFRAMES_CLI_REQUIRED",
      "프로젝트 로컬 HyperFrames CLI entry가 파일이 아닙니다.",
      { cli_path: cliPath },
    );
  }
  const resolvedCli = await realpath(cliPath);
  if (!isWithin(nodeModulesRoot, resolvedCli)) {
    throw new HyperframesAdapterError(
      "PROJECT_LOCAL_HYPERFRAMES_CLI_REQUIRED",
      "HyperFrames CLI가 project node_modules 밖을 가리킵니다.",
      { cli_path: cliPath, resolved_cli_path: resolvedCli },
    );
  }
  return {
    project,
    cliPath,
    cliSha256: sha256(await readFile(resolvedCli)),
    cliVersion:
      typeof packageJson.version === "string"
        ? packageJson.version
        : null,
  };
}

async function verifyBrief(project, briefPath, brief) {
  const resolvedBrief = path.resolve(String(briefPath ?? ""));
  if (path.basename(resolvedBrief).toUpperCase() !== "BRIEF.MD") {
    throw new HyperframesAdapterError(
      "PROJECT_BRIEF_REQUIRED",
      "BRIEF.md는 HyperFrames project 안에 있어야 합니다.",
      { brief_path: resolvedBrief },
    );
  }
  let info;
  let bytes;
  let canonicalBrief;
  try {
    info = await lstat(resolvedBrief);
    canonicalBrief = await realpath(resolvedBrief);
    bytes = await readFile(resolvedBrief);
  } catch (error) {
    throw new HyperframesAdapterError(
      "PROJECT_BRIEF_REQUIRED",
      "HyperFrames BRIEF.md를 읽을 수 없습니다.",
      { brief_path: resolvedBrief, cause: error?.code },
    );
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new HyperframesAdapterError(
      "PROJECT_BRIEF_REQUIRED",
      "BRIEF.md는 프로젝트 내부 일반 파일이어야 합니다.",
      { brief_path: resolvedBrief },
    );
  }
  if (!isWithin(project, canonicalBrief)) {
    throw new HyperframesAdapterError(
      "PROJECT_BRIEF_REQUIRED",
      "BRIEF.md는 HyperFrames project 안에 있어야 합니다.",
      { brief_path: canonicalBrief },
    );
  }
  const actualDigest = sha256(bytes);
  if (
    !SHA256.test(String(brief?.digest ?? "")) ||
    actualDigest !== brief.digest
  ) {
    throw new HyperframesAdapterError(
      "BRIEF_DIGEST_MISMATCH",
      "BRIEF.md bytes가 motion chain brief digest와 다릅니다.",
      {
        expected_brief_digest: brief?.digest ?? null,
        actual_brief_digest: actualDigest,
      },
    );
  }
  const semantic = brief?.semantic_contract;
  const appliedRuleIds = Array.isArray(brief?.applied_rule_ids)
    ? brief.applied_rule_ids
    : [];
  const compiledPacket = {
    semantic_contract: semantic,
    applied_rule_ids: appliedRuleIds,
    reference_profile_digest: brief?.reference_profile_digest,
    knowledge_rule_packet_digest:
      brief?.knowledge_rule_packet_digest,
  };
  const briefText = bytes.toString("utf8");
  const requiredLiterals = [
    semantic?.customer_question,
    semantic?.feature_part,
    semantic?.start_state,
    semantic?.mid_state,
    semantic?.end_state,
    semantic?.visible_delta,
    ...appliedRuleIds,
  ].filter((value) => typeof value === "string" && value.trim() !== "");
  if (
    !semantic ||
    typeof semantic !== "object" ||
    appliedRuleIds.length === 0 ||
    appliedRuleIds.some(
      (ruleId) => !/^MR-\d{3}$/.test(String(ruleId)),
    ) ||
    !SHA256.test(String(brief?.reference_profile_digest ?? "")) ||
    !SHA256.test(
      String(brief?.knowledge_rule_packet_digest ?? ""),
    ) ||
    brief?.compiled_contract_sha256 !==
      sha256(canonicalJson(compiledPacket)) ||
    requiredLiterals.some((literal) => !briefText.includes(literal))
  ) {
    throw new HyperframesAdapterError(
      "BRIEF_EXECUTABLE_RULE_PACKET_REQUIRED",
      "BRIEF.md에는 reference profile, MR rule packet과 semantic start/mid/end 계약이 실제 문구로 컴파일되어야 합니다.",
    );
  }
  return { briefPath: canonicalBrief, briefSha256: actualDigest };
}

function assertMotionPrefix(chain) {
  const names = ["brief", "motion_project", "preview"];
  for (const name of names) {
    const piece = chain?.[name];
    if (
      !piece ||
      typeof piece !== "object" ||
      !SHA256.test(String(piece.digest ?? "")) ||
      !SHA256.test(
        String(piece.source_identity_digest ?? ""),
      ) ||
      !isTimestamp(piece.created_at)
    ) {
      throw new HyperframesAdapterError(
        "INVALID_MOTION_PREFIX",
        `${name}에는 digest, source identity, timestamp가 필요합니다.`,
        { member: name },
      );
    }
  }
  if (
    !Array.isArray(chain.brief.source_image_artifact_ids) ||
    chain.brief.source_image_artifact_ids.length === 0
  ) {
    throw new HyperframesAdapterError(
      "INVALID_MOTION_PREFIX",
      "GIF brief에는 승인 source image artifact가 필요합니다.",
    );
  }
  const identity = chain.brief.source_identity_digest;
  if (
    chain.motion_project.source_identity_digest !== identity ||
    chain.preview.source_identity_digest !== identity
  ) {
    throw new HyperframesAdapterError(
      "SOURCE_IMAGE_IDENTITY_DRIFT",
      "preview까지 source image identity가 바뀌면 안 됩니다.",
    );
  }
  if (
    chain.motion_project.brief_digest !== chain.brief.digest ||
    chain.preview.motion_project_digest !==
      chain.motion_project.digest
  ) {
    throw new HyperframesAdapterError(
      "MOTION_CHAIN_DIGEST_MISMATCH",
      "BRIEF→project→preview digest edge가 일치하지 않습니다.",
    );
  }
  const times = names.map((name) =>
    Date.parse(chain[name].created_at),
  );
  if (!(times[0] < times[1] && times[1] < times[2])) {
    throw new HyperframesAdapterError(
      "MOTION_STAGE_OUT_OF_ORDER",
      "BRIEF→project→preview 순서가 timestamp로 증명돼야 합니다.",
    );
  }
}

function assertPreviewApproval(chain, expectedDigest) {
  const approval = chain?.preview_approval;
  if (
    !approval ||
    approval.decision !== "approved" ||
    !SHA256.test(String(approval.digest ?? "")) ||
    approval.subject_preview_digest !== chain.preview.digest ||
    approval.source_identity_digest !==
      chain.brief.source_identity_digest ||
    !isTimestamp(approval.created_at) ||
    Date.parse(approval.created_at) <=
      Date.parse(chain.preview.created_at)
  ) {
    throw new HyperframesAdapterError(
      "PREVIEW_APPROVAL_REQUIRED",
      "exact preview에 대한 후속 사용자 승인이 필요합니다.",
    );
  }
  if (
    !SHA256.test(String(expectedDigest ?? "")) ||
    approval.digest !== expectedDigest
  ) {
    throw new HyperframesAdapterError(
      "PREVIEW_APPROVAL_DIGEST_MISMATCH",
      "G3R WorkOrder의 preview approval digest가 chain과 다릅니다.",
      {
        expected_preview_approval_digest: expectedDigest,
        actual_preview_approval_digest: approval.digest,
      },
    );
  }
}

function assertExecutionOptions({
  mode,
  idempotencyKey,
  previewPort,
  durationSec,
  renderFps,
  gifFps,
  fallback,
}) {
  if (!["preview", "render"].includes(mode)) {
    throw new HyperframesAdapterError(
      "INVALID_HYPERFRAMES_MODE",
      "mode는 preview 또는 render여야 합니다.",
    );
  }
  if (!SHA256.test(String(idempotencyKey ?? ""))) {
    throw new HyperframesAdapterError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "HyperFrames 계획에는 SHA-256 idempotency key가 필요합니다.",
    );
  }
  if (
    !Number.isInteger(previewPort) ||
    previewPort < 1 ||
    previewPort > 65535
  ) {
    throw new HyperframesAdapterError(
      "INVALID_PREVIEW_PORT",
      "previewPort는 1~65535 정수여야 합니다.",
    );
  }
  if (
    typeof durationSec !== "number" ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  ) {
    throw new HyperframesAdapterError(
      "INVALID_MOTION_DURATION",
      "durationSec는 0보다 큰 유한 숫자여야 합니다.",
    );
  }
  if (!RENDER_FPS.has(renderFps)) {
    throw new HyperframesAdapterError(
      "INVALID_RENDER_FPS",
      "renderFps는 24, 30, 60 중 하나여야 합니다.",
    );
  }
  if (
    !Number.isInteger(gifFps) ||
    gifFps < 1 ||
    gifFps > 30
  ) {
    throw new HyperframesAdapterError(
      "INVALID_GIF_FPS",
      "gifFps는 1~30 정수여야 합니다.",
    );
  }
  if (
    !fallback ||
    typeof fallback.static_artifact_id !== "string" ||
    fallback.static_artifact_id.length === 0 ||
    typeof fallback.reason !== "string" ||
    fallback.reason.length === 0 ||
    fallback.object_fit !== "contain"
  ) {
    throw new HyperframesAdapterError(
      "STATIC_FALLBACK_REQUIRED",
      "승인된 정지 이미지 contain fallback이 필요합니다.",
    );
  }
}

function command(cliPath, project, idempotencyKey, argv, extra = {}) {
  return {
    kind: "command",
    command: process.execPath,
    argv: [cliPath, ...argv],
    cwd: project,
    env: { HYPERFRAMES_RUN_ID: idempotencyKey },
    shell: false,
    ...extra,
  };
}

function roundSeconds(value) {
  return Number(value.toFixed(6));
}

function qaSpec(
  durationSec,
  renderFps,
  fallback,
  semanticContract,
) {
  return {
    frames: [
      { label: "first", at_seconds: 0 },
      {
        label: "mid",
        at_seconds: roundSeconds(durationSec / 2),
      },
      {
        label: "last",
        at_seconds: roundSeconds(
          Math.max(0, durationSec - 1 / renderFps),
        ),
      },
    ],
    frame_check_required: true,
    loop_boundary_required: true,
    checks: [
      "source_identity",
      "product_parts",
      "empty_frame",
      "human_and_hand_crop",
      "copy_overlap",
      "korean_legibility",
      "unsupported_props",
      "loop_boundary",
      "customer_question_answered",
      "meaningful_state_change",
      "static_superiority",
      "pattern_distinct_from_adjacent",
      "overlay_only_forbidden",
    ],
    semantic_contract: structuredClone(semanticContract),
    fallback: structuredClone(fallback),
  };
}

export async function buildHyperframesCommandPlan({
  mode,
  projectRoot,
  briefPath,
  chain,
  expectedPreviewApprovalDigest,
  allowedStagingRoot,
  stagingRoot,
  idempotencyKey,
  previewPort,
  durationSec,
  renderFps,
  gifFps,
  fallback,
} = {}) {
  assertExecutionOptions({
    mode,
    idempotencyKey,
    previewPort,
    durationSec,
    renderFps,
    gifFps,
    fallback,
  });
  assertMotionPrefix(chain);
  const { project, cliPath, cliSha256, cliVersion } =
    await resolveProjectLocalCli(projectRoot);
  const { staging } = await resolveStagingRoots(
    allowedStagingRoot,
    stagingRoot,
  );
  const { briefPath: verifiedBriefPath, briefSha256 } =
    await verifyBrief(project, briefPath, chain.brief);
  const preApprovalSteps = [
    {
      kind: "brief",
      artifact_id: chain.brief.artifact_id,
      path: verifiedBriefPath,
      sha256: briefSha256,
    },
    command(
      cliPath,
      project,
      idempotencyKey,
      [
        "check",
        ".",
        "--json",
        "--strict",
        "--frame-check=severity=error;seek=0,.5,.991667;tol=2",
      ],
      {
        step_id: "strict-frame-check",
        subject_motion_project_digest:
          chain.motion_project.digest,
      },
    ),
    command(
      cliPath,
      project,
      idempotencyKey,
      ["preview", "--port", String(previewPort)],
      {
        step_id: "studio-preview",
        subject_preview_digest: chain.preview.digest,
      },
    ),
  ];
  const outputRoot = path.join(
    staging,
    "hyperframes",
    idempotencyKey,
  );
  const renderCommands = [];
  if (mode === "render") {
    assertPreviewApproval(chain, expectedPreviewApprovalDigest);
    renderCommands.push(
      command(
        cliPath,
        project,
        idempotencyKey,
        [
          "render",
          ".",
          "--quality",
          "high",
          "--fps",
          String(renderFps),
          "--format",
          "mp4",
          "--output",
          path.join(outputRoot, "render.mp4"),
          "--strict",
        ],
        {
          step_id: "final-render",
          preview_approval_digest:
            chain.preview_approval.digest,
          expected_artifact_type: "motion.render",
        },
      ),
      command(
        cliPath,
        project,
        idempotencyKey,
        [
          "render",
          ".",
          "--quality",
          "high",
          "--fps",
          String(gifFps),
          "--format",
          "gif",
          "--gif-loop",
          "0",
          "--output",
          path.join(outputRoot, "animation.gif"),
          "--strict",
        ],
        {
          step_id: "gif-render",
          preview_approval_digest:
            chain.preview_approval.digest,
          expected_artifact_type: "motion.gif",
        },
      ),
    );
  }
  const qualitySpec = qaSpec(
    durationSec,
    renderFps,
    fallback,
    chain.brief.semantic_contract,
  );
  const planPayload = {
    adapter: "HyperFramesMotionAdapter",
    mode,
    cli_path: cliPath,
    cli_sha256: cliSha256,
    cli_version: cliVersion,
    project_root: project,
    staging_root: staging,
    idempotency_key: idempotencyKey,
    brief_digest: chain.brief.digest,
    semantic_contract: structuredClone(
      chain.brief.semantic_contract,
    ),
    applied_motion_rule_ids: structuredClone(
      chain.brief.applied_rule_ids,
    ),
    reference_profile_digest:
      chain.brief.reference_profile_digest,
    knowledge_rule_packet_digest:
      chain.brief.knowledge_rule_packet_digest,
    compiled_contract_sha256:
      chain.brief.compiled_contract_sha256,
    motion_project_digest: chain.motion_project.digest,
    preview_digest: chain.preview.digest,
    preview_approval_digest:
      chain.preview_approval?.digest ?? null,
    pre_approval_steps: preApprovalSteps,
    render_commands: renderCommands,
    qa_spec: qualitySpec,
    fallback_spec: structuredClone(fallback),
    gate_status:
      mode === "render"
        ? "preview_approved"
        : "awaiting_preview_approval",
  };
  const commandPlanSha256 = sha256(canonicalJson(planPayload));
  return Object.freeze({
    ...planPayload,
    planning_receipt: {
      receipt_type: "production.command_plan",
      adapter: "HyperFramesMotionAdapter",
      command_plan_sha256: commandPlanSha256,
      cli_sha256: cliSha256,
      cli_version: cliVersion,
      idempotency_key: idempotencyKey,
      brief_digest: chain.brief.digest,
      motion_project_digest: chain.motion_project.digest,
      preview_digest: chain.preview.digest,
      preview_approval_digest:
        chain.preview_approval?.digest ?? null,
      strict_check: true,
      frame_check: true,
      render_authorized: mode === "render",
      fallback_artifact_id: fallback.static_artifact_id,
    },
  });
}

function assertObservedQaFrames(observedQaFrames) {
  const expectedLabels = ["first", "mid", "last"];
  if (
    !Array.isArray(observedQaFrames) ||
    observedQaFrames.length !== expectedLabels.length
  ) {
    throw new HyperframesAdapterError(
      "FIRST_MID_LAST_QA_REQUIRED",
      "first/mid/last 세 QA frame이 모두 필요합니다.",
    );
  }
  observedQaFrames.forEach((frame, index) => {
    if (
      frame?.label !== expectedLabels[index] ||
      !SHA256.test(String(frame?.sha256 ?? "")) ||
      frame?.verdict !== "PASS"
    ) {
      throw new HyperframesAdapterError(
        "FIRST_MID_LAST_QA_REQUIRED",
        "first/mid/last QA는 순서대로 SHA-256과 PASS를 가져야 합니다.",
        { frame_index: index },
      );
    }
  });
}

export function buildHyperframesExecutionReceipt({
  commandPlan,
  completedChain,
  observedQaFrames,
} = {}) {
  if (
    commandPlan?.adapter !== "HyperFramesMotionAdapter" ||
    commandPlan?.mode !== "render" ||
    commandPlan?.gate_status !== "preview_approved" ||
    !SHA256.test(
      String(
        commandPlan?.planning_receipt?.command_plan_sha256 ??
          "",
      ),
    ) ||
    !Array.isArray(commandPlan.render_commands) ||
    commandPlan.render_commands.length !== 2
  ) {
    throw new HyperframesAdapterError(
      "APPROVED_RENDER_COMMAND_PLAN_REQUIRED",
      "완료 receipt에는 preview 승인에 고정된 render command plan이 필요합니다.",
    );
  }
  const validation =
    validateMotionProductionChain(completedChain);
  if (!validation.ok) {
    throw new HyperframesAdapterError(
      "INVALID_MOTION_PRODUCTION_CHAIN",
      "완료된 HyperFrames chain이 G3 production 계약을 충족하지 못했습니다.",
      { errors: validation.errors },
    );
  }
  if (
    completedChain.preview_approval.digest !==
      commandPlan.preview_approval_digest ||
    completedChain.preview.digest !== commandPlan.preview_digest ||
    completedChain.motion_project.digest !==
      commandPlan.motion_project_digest ||
    completedChain.brief.digest !== commandPlan.brief_digest
  ) {
    throw new HyperframesAdapterError(
      "COMMAND_PLAN_CHAIN_DIGEST_MISMATCH",
      "완료 chain이 승인된 command plan의 exact digest와 다릅니다.",
    );
  }
  assertObservedQaFrames(observedQaFrames);
  const receiptPayload = {
    receipt_type: "production.execution",
    adapter: "HyperFramesMotionAdapter",
    command_plan_sha256:
      commandPlan.planning_receipt.command_plan_sha256,
    idempotency_key: commandPlan.idempotency_key,
    brief_digest: completedChain.brief.digest,
    motion_project_digest:
      completedChain.motion_project.digest,
    preview_digest: completedChain.preview.digest,
    preview_approval_digest:
      completedChain.preview_approval.digest,
    render_digest: completedChain.render.digest,
    gif_digest: completedChain.gif.digest,
    final_qa_digest: completedChain.final_qa.digest,
    asset_approval_id:
      completedChain.asset_approval.decision_id,
    motion_chain_validation: "PASS",
    qa_frame_sha256s: structuredClone(observedQaFrames),
    qa_spec_sha256: sha256(
      canonicalJson(commandPlan.qa_spec),
    ),
    fallback_spec_sha256: sha256(
      canonicalJson(commandPlan.fallback_spec),
    ),
  };
  return Object.freeze({
    ...receiptPayload,
    execution_receipt_sha256: sha256(
      canonicalJson(receiptPayload),
    ),
  });
}
