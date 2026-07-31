import {
  validateHeroOutputGate,
} from "./hero-output-gate.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_DETAIL_LEVELS = new Set(["low", "medium", "high"]);
const CANDIDATE_STATUSES = new Set(["passed", "failed"]);
const STUDIO_DOWNSTREAM_CONSUMERS = new Set([
  "G4Q_RUBRIC",
  "G5_PUBLISH_QA",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return SHA256.test(String(value ?? ""));
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isTimestamp(value) {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function addError(errors, code, path, message, details = undefined) {
  errors.push({
    code,
    path,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function result(errors) {
  return { ok: errors.length === 0, errors };
}

function unique(values) {
  return new Set(values).size === values.length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasDataAttribute(html, attribute, value) {
  const escapedAttribute = escapeRegExp(attribute);
  const escapedValue = escapeRegExp(value);
  return new RegExp(
    `\\b${escapedAttribute}\\s*=\\s*(?:"${escapedValue}"|'${escapedValue}')`,
    "i",
  ).test(html);
}

function openingTags(html) {
  return String(html).match(/<[a-z][^>]*>/gi) ?? [];
}

function hasMediaBinding(html, slotId, artifactId) {
  return openingTags(html).some(
    (tag) =>
      hasDataAttribute(tag, "data-slot-id", slotId) &&
      hasDataAttribute(tag, "data-artifact-id", artifactId),
  );
}

function canonicalText(html) {
  return String(html)
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

export class ProductionContractError extends Error {
  constructor(code, message, errors) {
    super(message);
    this.name = "ProductionContractError";
    this.code = code;
    this.details = { errors };
  }
}

function assertContract(validation, code, message) {
  if (!validation.ok) {
    throw new ProductionContractError(code, message, validation.errors);
  }
  return validation;
}

function validateImageSize(config, errors) {
  const target = config?.target_size;
  const reference = config?.reference_size;
  const validDimensions = (size) =>
    isObject(size) &&
    isPositiveInteger(size.width) &&
    isPositiveInteger(size.height);

  if (!isNonEmptyString(config?.size_confirmation_decision_id)) {
    addError(
      errors,
      "SIZE_CONFIRMATION_REQUIRED",
      "execution_config.size_confirmation_decision_id",
      "이미지 크기는 사용자 확인 decision에 고정되어야 합니다.",
    );
  }

  if (config?.size_mode === "target") {
    if (!validDimensions(target) || reference !== undefined) {
      addError(
        errors,
        "INVALID_TARGET_SIZE",
        "execution_config.target_size",
        "target 모드는 유효한 target_size만 가져야 합니다.",
      );
    }
    return;
  }

  if (config?.size_mode === "reference") {
    if (
      !validDimensions(reference) ||
      !isNonEmptyString(reference.reference_artifact_id) ||
      target !== undefined
    ) {
      addError(
        errors,
        "INVALID_REFERENCE_SIZE",
        "execution_config.reference_size",
        "reference 모드는 크기와 reference_artifact_id를 가진 reference_size만 가져야 합니다.",
      );
    }
    return;
  }

  addError(
    errors,
    "INVALID_SIZE_MODE",
    "execution_config.size_mode",
    "size_mode는 target 또는 reference여야 합니다.",
  );
}

function validateFanOut(config, errors) {
  const fanOut = Array.isArray(config?.fan_out) ? config.fan_out : [];
  if (!Array.isArray(config?.fan_out) || fanOut.length === 0) {
    addError(
      errors,
      "FAN_OUT_REQUIRED",
      "execution_config.fan_out",
      "candidate별 독립 fan-out이 필요합니다.",
    );
    return new Map();
  }

  if (config.items !== fanOut.length || config.workers !== fanOut.length) {
    addError(
      errors,
      "ONE_CUT_PER_WORKER_REQUIRED",
      "execution_config.fan_out",
      "items, workers, fan_out 수는 같아야 하며 worker 하나가 candidate 하나만 담당해야 합니다.",
    );
  }

  const candidateIds = fanOut.map((candidate) => candidate?.candidate_id);
  const workerIds = fanOut.map((candidate) => candidate?.worker_id);
  if (!unique(candidateIds.filter(isNonEmptyString))) {
    addError(
      errors,
      "DUPLICATE_CANDIDATE",
      "execution_config.fan_out",
      "candidate_id는 중복될 수 없습니다.",
    );
  }
  if (!unique(workerIds.filter(isNonEmptyString))) {
    addError(
      errors,
      "WORKER_REUSED",
      "execution_config.fan_out",
      "같은 worker를 둘 이상의 candidate에 배정할 수 없습니다.",
    );
  }

  const index = new Map();
  fanOut.forEach((candidate, candidateIndex) => {
    const path = `execution_config.fan_out[${candidateIndex}]`;
    if (
      !isNonEmptyString(candidate?.candidate_id) ||
      !isNonEmptyString(candidate?.worker_id)
    ) {
      addError(
        errors,
        "INVALID_FAN_OUT_MEMBER",
        path,
        "fan-out member에는 candidate_id와 worker_id가 필요합니다.",
      );
    }
    if (
      !isSha256(candidate?.input_sha256) ||
      !isSha256(candidate?.output_sha256)
    ) {
      addError(
        errors,
        "CANDIDATE_HASH_REQUIRED",
        path,
        "각 candidate는 입력과 출력 SHA-256을 모두 가져야 합니다.",
      );
    }
    if (!CANDIDATE_STATUSES.has(candidate?.status)) {
      addError(
        errors,
        "INVALID_CANDIDATE_STATUS",
        `${path}.status`,
        "candidate status는 passed 또는 failed여야 합니다.",
      );
    }
    if (isNonEmptyString(candidate?.candidate_id)) {
      index.set(candidate.candidate_id, candidate);
    }
  });
  return index;
}

function validateImageRetry(config, currentCandidates, errors) {
  if (config?.retry === undefined) return;
  const retry = config.retry;
  const requested = Array.isArray(retry?.requested_candidate_ids)
    ? retry.requested_candidate_ids
    : [];
  const previous = Array.isArray(retry?.previous_candidates)
    ? retry.previous_candidates
    : [];

  if (
    !isObject(retry) ||
    requested.length === 0 ||
    previous.length === 0 ||
    !unique(requested)
  ) {
    addError(
      errors,
      "INVALID_RETRY_PLAN",
      "execution_config.retry",
      "retry에는 중복 없는 requested_candidate_ids와 previous_candidates가 필요합니다.",
    );
    return;
  }

  const previousIndex = new Map();
  previous.forEach((candidate, candidateIndex) => {
    const path = `execution_config.retry.previous_candidates[${candidateIndex}]`;
    if (
      !isNonEmptyString(candidate?.candidate_id) ||
      !isSha256(candidate?.input_sha256) ||
      !isSha256(candidate?.output_sha256) ||
      !CANDIDATE_STATUSES.has(candidate?.status)
    ) {
      addError(
        errors,
        "INVALID_PREVIOUS_CANDIDATE",
        path,
        "이전 candidate에는 ID, 입출력 SHA-256, 상태가 필요합니다.",
      );
    }
    previousIndex.set(candidate?.candidate_id, candidate);
  });

  for (const candidateId of requested) {
    const before = previousIndex.get(candidateId);
    const after = currentCandidates.get(candidateId);
    if (!before || !after) {
      addError(
        errors,
        "RETRY_CANDIDATE_NOT_FOUND",
        "execution_config.retry.requested_candidate_ids",
        "retry candidate는 이전 결과와 현재 fan-out에 모두 있어야 합니다.",
        { candidate_id: candidateId },
      );
      continue;
    }
    if (before.status !== "failed") {
      addError(
        errors,
        "RETRY_PASSED_CANDIDATE",
        "execution_config.retry.requested_candidate_ids",
        "통과한 candidate는 재시도할 수 없습니다.",
        { candidate_id: candidateId },
      );
    }
    if (before.input_sha256 !== after.input_sha256) {
      addError(
        errors,
        "RETRY_INPUT_HASH_CHANGED",
        `execution_config.fan_out[${candidateId}].input_sha256`,
        "부분 재시도는 이전 candidate와 같은 입력 hash를 사용해야 합니다.",
        { candidate_id: candidateId },
      );
    }
  }

  const requestedSet = new Set(requested);
  for (const [candidateId, before] of previousIndex) {
    if (before?.status !== "passed" || requestedSet.has(candidateId)) continue;
    const after = currentCandidates.get(candidateId);
    if (
      !after ||
      after.input_sha256 !== before.input_sha256 ||
      after.output_sha256 !== before.output_sha256
    ) {
      addError(
        errors,
        "PASSED_CANDIDATE_MUTATED",
        `execution_config.fan_out[${candidateId}]`,
        "부분 재시도 중 통과한 candidate의 입출력 hash는 보존되어야 합니다.",
        { candidate_id: candidateId },
      );
    }
  }
}

export function validateImageWorkOrder(workOrder) {
  const errors = [];
  const config = workOrder?.execution_config;
  if (workOrder?.stage_id !== "G2A_IMAGE" || !isObject(config)) {
    addError(
      errors,
      "INVALID_IMAGE_STAGE",
      "stage_id",
      "G2 image WorkOrder는 G2A_IMAGE execution_config여야 합니다.",
    );
    return result(errors);
  }

  if (!isPositiveInteger(config.items) || config.items > 8) {
    addError(
      errors,
      "IMAGE_ITEM_LIMIT_EXCEEDED",
      "execution_config.items",
      "items는 명시적인 1~8 정수여야 합니다.",
    );
  }
  if (
    !isPositiveInteger(config.workers) ||
    config.workers > 8 ||
    config.workers > config.items
  ) {
    addError(
      errors,
      "INVALID_IMAGE_WORKERS",
      "execution_config.workers",
      "workers는 items 이하의 명시적인 1~8 정수여야 합니다.",
    );
  }
  if (!IMAGE_DETAIL_LEVELS.has(config.detail_level)) {
    addError(
      errors,
      "DETAIL_LEVEL_REQUIRED",
      "execution_config.detail_level",
      "detail_level은 low, medium, high 중 하나여야 합니다.",
    );
  }
  if (config.gif !== "forbidden") {
    addError(
      errors,
      "GIF_MUST_BE_FORBIDDEN",
      "execution_config.gif",
      "G2 image WorkOrder에서는 GIF 생성을 금지해야 합니다.",
    );
  }

  validateImageSize(config, errors);
  const currentCandidates = validateFanOut(config, errors);
  validateImageRetry(config, currentCandidates, errors);
  return result(errors);
}

export function assertImageWorkOrder(workOrder) {
  return assertContract(
    validateImageWorkOrder(workOrder),
    "INVALID_IMAGE_WORK_ORDER",
    "G2 image WorkOrder 계약을 충족하지 못했습니다.",
  );
}

function validateMotionFanOut(config, errors) {
  const fanOut = Array.isArray(config?.fan_out) ? config.fan_out : [];
  if (!Array.isArray(config?.fan_out) || fanOut.length === 0) {
    addError(
      errors,
      "MOTION_FAN_OUT_REQUIRED",
      "execution_config.fan_out",
      "motion brief별 독립 fan-out이 필요합니다.",
    );
    return new Map();
  }
  if (config.modules !== fanOut.length || config.workers !== fanOut.length) {
    addError(
      errors,
      "ONE_MOTION_MODULE_PER_WORKER_REQUIRED",
      "execution_config.fan_out",
      "modules, workers, fan_out 수는 같아야 하며 worker 하나가 motion module 하나만 담당해야 합니다.",
    );
  }
  const briefIds = fanOut.map((member) => member?.motion_brief_id);
  const workerIds = fanOut.map((member) => member?.worker_id);
  if (!unique(briefIds.filter(isNonEmptyString))) {
    addError(
      errors,
      "DUPLICATE_MOTION_BRIEF",
      "execution_config.fan_out",
      "motion_brief_id는 중복될 수 없습니다.",
    );
  }
  if (!unique(workerIds.filter(isNonEmptyString))) {
    addError(
      errors,
      "MOTION_WORKER_REUSED",
      "execution_config.fan_out",
      "같은 worker를 둘 이상의 motion module에 배정할 수 없습니다.",
    );
  }

  const index = new Map();
  fanOut.forEach((member, memberIndex) => {
    const path = `execution_config.fan_out[${memberIndex}]`;
    if (
      !isNonEmptyString(member?.motion_brief_id) ||
      !isNonEmptyString(member?.worker_id)
    ) {
      addError(
        errors,
        "INVALID_MOTION_FAN_OUT_MEMBER",
        path,
        "fan-out member에는 motion_brief_id와 worker_id가 필요합니다.",
      );
    }
    if (
      !isSha256(member?.input_sha256) ||
      !isSha256(member?.output_sha256)
    ) {
      addError(
        errors,
        "MOTION_MODULE_HASH_REQUIRED",
        path,
        "각 motion module은 exact 입력과 출력 SHA-256을 가져야 합니다.",
      );
    }
    if (!CANDIDATE_STATUSES.has(member?.status)) {
      addError(
        errors,
        "INVALID_MOTION_MODULE_STATUS",
        `${path}.status`,
        "motion module status는 passed 또는 failed여야 합니다.",
      );
    }
    if (
      !["product_reference", "approved_image_job"].includes(
        member?.source?.kind,
      ) ||
      !Array.isArray(member?.source?.artifact_ids) ||
      member.source.artifact_ids.length === 0
    ) {
      addError(
        errors,
        "MOTION_SOURCE_NOT_READY",
        `${path}.source`,
        "motion module에는 제품 참조 또는 승인 image job의 exact source artifact가 필요합니다.",
      );
    }
    if (
      member?.source?.kind === "approved_image_job" &&
      !isSha256(member?.source?.approval_receipt_sha256)
    ) {
      addError(
        errors,
        "MOTION_IMAGE_APPROVAL_REQUIRED",
        `${path}.source.approval_receipt_sha256`,
        "image job 기반 motion은 승인 receipt에 고정되어야 합니다.",
      );
    }
    if (isNonEmptyString(member?.motion_brief_id)) {
      index.set(member.motion_brief_id, member);
    }
  });
  return index;
}

function validateMotionRetry(config, currentModules, errors) {
  if (config?.retry === undefined) return;
  const retry = config.retry;
  const requested = asArray(retry?.requested_motion_brief_ids);
  const previous = asArray(retry?.previous_modules);
  if (
    !isObject(retry) ||
    requested.length === 0 ||
    previous.length === 0 ||
    !unique(requested)
  ) {
    addError(
      errors,
      "INVALID_MOTION_RETRY_PLAN",
      "execution_config.retry",
      "retry에는 중복 없는 requested_motion_brief_ids와 previous_modules가 필요합니다.",
    );
    return;
  }
  const previousIndex = new Map(
    previous.map((member) => [member?.motion_brief_id, member]),
  );
  for (const briefId of requested) {
    const before = previousIndex.get(briefId);
    const after = currentModules.get(briefId);
    if (!before || !after || before.status !== "failed") {
      addError(
        errors,
        "MOTION_RETRY_FAILED_MEMBER_ONLY",
        "execution_config.retry.requested_motion_brief_ids",
        "실패한 motion member만 재시도할 수 있습니다.",
        { motion_brief_id: briefId },
      );
      continue;
    }
    if (before.input_sha256 !== after.input_sha256) {
      addError(
        errors,
        "MOTION_RETRY_INPUT_HASH_CHANGED",
        `execution_config.fan_out[${briefId}].input_sha256`,
        "부분 재시도는 실패 당시와 같은 exact input hash를 사용해야 합니다.",
      );
    }
  }
  const requestedSet = new Set(requested);
  for (const [briefId, before] of previousIndex) {
    if (before?.status !== "passed" || requestedSet.has(briefId)) continue;
    const after = currentModules.get(briefId);
    if (
      !after ||
      after.input_sha256 !== before.input_sha256 ||
      after.output_sha256 !== before.output_sha256
    ) {
      addError(
        errors,
        "PASSED_MOTION_MEMBER_MUTATED",
        `execution_config.fan_out[${briefId}]`,
        "부분 재시도 중 통과한 motion member의 입출력 hash는 보존되어야 합니다.",
      );
    }
  }
}

export function validateMotionWorkOrder(workOrder) {
  const errors = [];
  const config = workOrder?.execution_config;
  if (
    !["G3P_PREVIEW", "G3R_RENDER"].includes(workOrder?.stage_id) ||
    !isObject(config)
  ) {
    addError(
      errors,
      "INVALID_MOTION_STAGE",
      "stage_id",
      "motion WorkOrder는 G3P_PREVIEW 또는 G3R_RENDER execution_config여야 합니다.",
    );
    return result(errors);
  }
  if (
    !isPositiveInteger(config.modules) ||
    !isPositiveInteger(config.workers) ||
    config.workers !== config.modules
  ) {
    addError(
      errors,
      "INVALID_MOTION_WORKERS",
      "execution_config.workers",
      "motion module 수와 worker 수는 같은 양의 정수여야 합니다.",
    );
  }
  const currentModules = validateMotionFanOut(config, errors);
  validateMotionRetry(config, currentModules, errors);
  return result(errors);
}

export function assertMotionWorkOrder(workOrder) {
  return assertContract(
    validateMotionWorkOrder(workOrder),
    "INVALID_MOTION_WORK_ORDER",
    "G3 motion WorkOrder 계약을 충족하지 못했습니다.",
  );
}

function validateMotionPiece(piece, name, errors) {
  if (!isObject(piece)) {
    addError(
      errors,
      "MOTION_CHAIN_MEMBER_REQUIRED",
      name,
      `${name} 산출물이 필요합니다.`,
    );
    return false;
  }
  if (!isTimestamp(piece.created_at)) {
    addError(
      errors,
      "MOTION_TIMESTAMP_REQUIRED",
      `${name}.created_at`,
      `${name}에는 실행 순서를 증명할 timestamp가 필요합니다.`,
    );
  }
  return true;
}

function checkDigestEdge(errors, actual, expected, path) {
  if (!isSha256(actual) || actual !== expected) {
    addError(
      errors,
      "MOTION_CHAIN_DIGEST_MISMATCH",
      path,
      "motion 단계는 바로 앞 승인/산출물 digest에 고정되어야 합니다.",
      { expected, actual },
    );
  }
}

export function validateMotionProductionChain(chain) {
  const errors = [];
  const names = [
    "brief",
    "motion_project",
    "preview",
    "preview_approval",
    "render",
    "gif",
    "final_qa",
    "asset_approval",
  ];
  const present = names.every((name) =>
    validateMotionPiece(chain?.[name], name, errors),
  );
  if (!present) return result(errors);

  const pieces = names.map((name) => chain[name]);
  const identityDigest = chain.brief.source_identity_digest;
  if (
    !isSha256(identityDigest) ||
    !Array.isArray(chain.brief.source_image_artifact_ids) ||
    chain.brief.source_image_artifact_ids.length === 0
  ) {
    addError(
      errors,
      "MOTION_SOURCE_IDENTITY_REQUIRED",
      "brief",
      "GIF brief는 승인 source image와 identity digest를 가져야 합니다.",
    );
  }
  names.forEach((name) => {
    if (chain[name].source_identity_digest !== identityDigest) {
      addError(
        errors,
        "SOURCE_IMAGE_IDENTITY_DRIFT",
        `${name}.source_identity_digest`,
        "모든 GIF 제작 단계는 brief의 source image identity를 보존해야 합니다.",
      );
    }
  });

  for (let index = 1; index < pieces.length; index += 1) {
    if (
      isTimestamp(pieces[index - 1].created_at) &&
      isTimestamp(pieces[index].created_at) &&
      Date.parse(pieces[index].created_at) <=
        Date.parse(pieces[index - 1].created_at)
    ) {
      addError(
        errors,
        "MOTION_STAGE_OUT_OF_ORDER",
        `${names[index]}.created_at`,
        "GIF 제작 단계는 brief부터 asset approval까지 순서대로 완료되어야 합니다.",
      );
    }
  }

  for (const [name, piece] of names
    .map((name) => [name, chain[name]])
    .filter(([name]) => !["asset_approval"].includes(name))) {
    if (!isSha256(piece.digest)) {
      addError(
        errors,
        "MOTION_DIGEST_REQUIRED",
        `${name}.digest`,
        `${name} digest가 필요합니다.`,
      );
    }
  }

  checkDigestEdge(
    errors,
    chain.motion_project.brief_digest,
    chain.brief.digest,
    "motion_project.brief_digest",
  );
  checkDigestEdge(
    errors,
    chain.preview.motion_project_digest,
    chain.motion_project.digest,
    "preview.motion_project_digest",
  );
  checkDigestEdge(
    errors,
    chain.preview_approval.subject_preview_digest,
    chain.preview.digest,
    "preview_approval.subject_preview_digest",
  );
  checkDigestEdge(
    errors,
    chain.render.motion_project_digest,
    chain.motion_project.digest,
    "render.motion_project_digest",
  );
  checkDigestEdge(
    errors,
    chain.render.preview_approval_digest,
    chain.preview_approval.digest,
    "render.preview_approval_digest",
  );
  checkDigestEdge(
    errors,
    chain.gif.render_digest,
    chain.render.digest,
    "gif.render_digest",
  );
  checkDigestEdge(
    errors,
    chain.final_qa.subject_gif_digest,
    chain.gif.digest,
    "final_qa.subject_gif_digest",
  );
  checkDigestEdge(
    errors,
    chain.asset_approval.subject_gif_digest,
    chain.gif.digest,
    "asset_approval.subject_gif_digest",
  );
  checkDigestEdge(
    errors,
    chain.asset_approval.validation_digest,
    chain.final_qa.digest,
    "asset_approval.validation_digest",
  );

  if (chain.preview_approval.decision !== "approved") {
    addError(
      errors,
      "PREVIEW_NOT_APPROVED",
      "preview_approval.decision",
      "승인된 preview digest 없이는 final render를 만들 수 없습니다.",
    );
  }
  if (
    chain.final_qa.verdict !== "PASS" ||
    !Array.isArray(chain.final_qa.hard_failures) ||
    chain.final_qa.hard_failures.length > 0
  ) {
    addError(
      errors,
      "GIF_QA_NOT_PASSED",
      "final_qa",
      "GIF는 hard failure가 없는 PASS QA를 통과해야 합니다.",
    );
  }
  const semanticQa = chain.final_qa.semantic_motion_quality;
  const semanticFrameDigests = [
    semanticQa?.first_frame_sha256,
    semanticQa?.mid_frame_sha256,
    semanticQa?.last_frame_sha256,
  ];
  if (
    !isObject(semanticQa) ||
    semanticQa?.customer_question_answered !== true ||
    semanticQa?.meaningful_state_change !== true ||
    semanticQa?.static_superiority !== true ||
    semanticQa?.pattern_distinct_from_adjacent !== true ||
    semanticQa?.overlay_only !== false ||
    !isNonEmptyString(semanticQa?.visible_delta_observation) ||
    !Number.isFinite(semanticQa?.answer_within_seconds) ||
    semanticQa.answer_within_seconds <= 0 ||
    semanticQa.answer_within_seconds > 2 ||
    semanticFrameDigests.some((digest) => !isSha256(digest)) ||
    new Set(semanticFrameDigests).size < 2
  ) {
    addError(
      errors,
      "GIF_SEMANTIC_QA_NOT_PASSED",
      "final_qa.semantic_motion_quality",
      "Motion QA는 구매 질문, 의미 상태 변화, 정지 대비 설명력, 인접 패턴 차이와 first/mid/last frame evidence를 검증해야 합니다.",
    );
  }
  if (chain.asset_approval.decision !== "approved") {
    addError(
      errors,
      "GIF_ASSET_NOT_APPROVED",
      "asset_approval.decision",
      "최종 GIF asset은 사용자 승인을 받아야 합니다.",
    );
  }
  return result(errors);
}

export function assertMotionProductionChain(chain) {
  return assertContract(
    validateMotionProductionChain(chain),
    "INVALID_MOTION_PRODUCTION_CHAIN",
    "G3 GIF 제작 chain 계약을 충족하지 못했습니다.",
  );
}

function collectHtmlCopy(section) {
  const copy = [];
  if (Array.isArray(section?.html_copy)) copy.push(...section.html_copy);
  for (const claim of Array.isArray(section?.claims) ? section.claims : []) {
    if (Array.isArray(claim?.html_copy)) copy.push(...claim.html_copy);
  }
  return copy;
}

export function validateEditableHtmlContract(contract) {
  const errors = [];
  const sections = contract?.resolved_section_graph?.sections;
  const artifacts = contract?.approved_artifacts;
  const html = contract?.html;
  if (!Array.isArray(sections) || sections.length === 0) {
    addError(
      errors,
      "RESOLVED_SECTION_GRAPH_REQUIRED",
      "resolved_section_graph.sections",
      "resolved section graph에는 하나 이상의 section이 필요합니다.",
    );
  }
  if (!Array.isArray(artifacts)) {
    addError(
      errors,
      "APPROVED_ARTIFACT_INDEX_REQUIRED",
      "approved_artifacts",
      "승인 artifact index가 필요합니다.",
    );
  }
  if (!isNonEmptyString(html)) {
    addError(
      errors,
      "HTML_REVISION_REQUIRED",
      "html",
      "수정 가능한 HTML revision이 필요합니다.",
    );
  }
  if (
    !Array.isArray(sections) ||
    !Array.isArray(artifacts) ||
    !isNonEmptyString(html)
  ) {
    return result(errors);
  }

  const artifactIndex = new Map();
  for (const artifact of artifacts) {
    if (artifactIndex.has(artifact?.artifact_id)) {
      addError(
        errors,
        "DUPLICATE_APPROVED_ARTIFACT",
        "approved_artifacts",
        "artifact_id는 중복될 수 없습니다.",
      );
    }
    artifactIndex.set(artifact?.artifact_id, artifact);
  }

  const htmlText = canonicalText(html);
  sections.forEach((section, sectionIndex) => {
    const sectionPath = `resolved_section_graph.sections[${sectionIndex}]`;
    if (
      !isNonEmptyString(section?.section_id) ||
      !hasDataAttribute(html, "data-section-id", section?.section_id)
    ) {
      addError(
        errors,
        "HTML_SECTION_ROOT_MISSING",
        sectionPath,
        "각 section은 같은 data-section-id를 가진 HTML root가 필요합니다.",
      );
    }

    const claims = Array.isArray(section?.claims) ? section.claims : [];
    claims.forEach((claim, claimIndex) => {
      if (
        !isNonEmptyString(claim?.claim_id) ||
        !hasDataAttribute(html, "data-claim-id", claim?.claim_id)
      ) {
        addError(
          errors,
          "HTML_CLAIM_BINDING_MISSING",
          `${sectionPath}.claims[${claimIndex}]`,
          "각 claim은 data-claim-id로 HTML에 연결되어야 합니다.",
        );
      }
    });

    const mediaSlots = Array.isArray(section?.media_slots)
      ? section.media_slots
      : [];
    if (mediaSlots.length === 0) {
      addError(
        errors,
        "MEDIA_SLOT_REQUIRED",
        `${sectionPath}.media_slots`,
        "각 resolved section은 하나 이상의 media slot을 가져야 합니다.",
      );
    }
    mediaSlots.forEach((slot, slotIndex) => {
      const slotPath = `${sectionPath}.media_slots[${slotIndex}]`;
      const artifact = artifactIndex.get(slot?.approved_artifact_id);
      if (
        !isNonEmptyString(slot?.approved_artifact_id) ||
        artifact?.approval_status !== "approved"
      ) {
        addError(
          errors,
          "MEDIA_ARTIFACT_NOT_APPROVED",
          `${slotPath}.approved_artifact_id`,
          "모든 media slot은 approved artifact ID를 가져야 합니다.",
        );
      }
      if (
        !isNonEmptyString(slot?.slot_id) ||
        !hasMediaBinding(
          html,
          slot?.slot_id,
          slot?.approved_artifact_id,
        )
      ) {
        addError(
          errors,
          "HTML_MEDIA_BINDING_MISSING",
          slotPath,
          "media element는 data-slot-id와 data-artifact-id를 함께 가져야 합니다.",
        );
      }
      if (
        slot?.embedded_text_policy !== "none" ||
        artifact?.copy_embedded !== false
      ) {
        addError(
          errors,
          "COPY_MUST_REMAIN_HTML_CANONICAL",
          slotPath,
          "판매 카피는 이미지에 굽지 않고 HTML이 정본이어야 합니다.",
        );
      }
    });

    collectHtmlCopy(section).forEach((copy, copyIndex) => {
      if (
        !isNonEmptyString(copy) ||
        !htmlText.includes(canonicalText(copy))
      ) {
        addError(
          errors,
          "CANONICAL_COPY_MISSING",
          `${sectionPath}.html_copy[${copyIndex}]`,
          "resolved graph의 canonical copy가 HTML text에 그대로 있어야 합니다.",
        );
      }
    });
  });

  const heroReport = validateHeroOutputGate({
    manifest: contract?.hero_assurance?.manifest,
    validationReceipt:
      contract?.hero_assurance?.validation_receipt,
    commercialValidationReceipt:
      contract?.hero_assurance?.commercial_validation_receipt,
    resolvedSectionGraph: contract?.resolved_section_graph,
    approvedArtifacts: contract?.approved_artifacts,
    identitySourceArtifacts:
      contract?.identity_source_artifacts,
    html,
  });
  for (const error of heroReport.errors) {
    addError(
      errors,
      error.code,
      `hero_assurance.${error.path}`,
      error.message,
      error.details,
    );
  }
  return result(errors);
}

export function assertEditableHtmlContract(contract) {
  return assertContract(
    validateEditableHtmlContract(contract),
    "INVALID_EDITABLE_HTML_CONTRACT",
    "G4 editable HTML 계약을 충족하지 못했습니다.",
  );
}

export function validateStudioDownstreamEligibility(revision, consumerStage) {
  const errors = [];
  if (!STUDIO_DOWNSTREAM_CONSUMERS.has(consumerStage)) {
    addError(
      errors,
      "STUDIO_CONSUMER_NOT_ALLOWED",
      "consumer_stage",
      "Studio commit은 rubric 또는 publish QA에만 직접 전달할 수 있습니다.",
    );
  }
  if (revision?.revision_kind === "working" || revision?.mutable === true) {
    addError(
      errors,
      "WORKING_REVISION_DOWNSTREAM_FORBIDDEN",
      "revision",
      "mutable Studio working revision은 downstream 입력이 될 수 없습니다.",
    );
  }
  if (
    revision?.revision_kind !== "committed" ||
    revision?.mutable !== false ||
    !isNonEmptyString(revision?.artifact_id) ||
    !isSha256(revision?.artifact_sha256) ||
    !isSha256(revision?.commit_sha256) ||
    !isSha256(revision?.hero_assurance_manifest_sha256) ||
    !isSha256(
      revision?.hero_assurance_validation_receipt_sha256,
    ) ||
    !isSha256(
      revision?.hero_commercial_validation_receipt_sha256,
    ) ||
    !isSha256(
      revision?.hero_identity_validation_receipt_sha256,
    ) ||
    !isSha256(revision?.hero_assurance_bundle_sha256) ||
    revision?.hero_assurance_member_id !==
      "hero-assurance.json" ||
    !isNonEmptyString(
      revision?.hero_assurance_member_locator,
    ) ||
    revision.hero_assurance_member_locator.includes("\\") ||
    revision.hero_assurance_member_locator
      .split("/")
      .some(
        (part) => !part || part === "." || part === "..",
      ) ||
    revision?.hero_assurance_member_sha256 !==
      revision?.hero_assurance_bundle_sha256 ||
    !Number.isSafeInteger(
      revision?.hero_assurance_member_size_bytes,
    ) ||
    revision.hero_assurance_member_size_bytes <= 0 ||
    !isTimestamp(revision?.committed_at)
  ) {
    addError(
      errors,
      "IMMUTABLE_STUDIO_COMMIT_REQUIRED",
      "revision",
      "downstream에는 content와 Hero assurance receipt hash, commit 시각이 고정된 immutable Studio revision만 허용됩니다.",
    );
  }
  return result(errors);
}

export function assertStudioDownstreamEligible(revision, consumerStage) {
  return assertContract(
    validateStudioDownstreamEligibility(revision, consumerStage),
    "STUDIO_REVISION_NOT_ELIGIBLE",
    "Studio revision을 downstream으로 전달할 수 없습니다.",
  );
}
