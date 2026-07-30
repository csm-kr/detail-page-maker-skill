import { createHash } from "node:crypto";

import DETAIL_PAGE_FLOW_POLICY from "../../policies/detail-page-flow-v1.json" with { type: "json" };
import {
  validateCommercialFlowContract,
  validateProductionPlan,
} from "./production-plan.mjs";

const G0_PARALLEL_PREPARATION = Object.freeze([
  "G0A_SUPPLIER",
  "G0B_PHOTO",
  "G1D_DISCOVERY",
  "G1B_KNOWLEDGE",
]);

export class ParallelFrontierError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ParallelFrontierError";
    this.code = code;
    this.details = details;
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function canonicalSha256(value) {
  return sha256(canonicalJson(value));
}

export function productionPlanDigest(plan) {
  return canonicalSha256(plan);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertHash(value, field) {
  if (!/^[a-f0-9]{64}$/.test(String(value ?? ""))) {
    throw new ParallelFrontierError(
      "INVALID_FRONTIER_HASH",
      `${field}는 SHA-256이어야 합니다.`,
      { field },
    );
  }
}

function assertPlanApproval(productionPlan, approval) {
  if (!productionPlan) return null;
  const commercialFlowValidation =
    validateCommercialFlowContract(productionPlan);
  if (!commercialFlowValidation.ok) {
    throw new ParallelFrontierError(
      "COMMERCIAL_FLOW_GATE_BLOCKED",
      "필수 불편→해결→motion commercial flow가 검증되지 않아 G1 이후 frontier를 발급할 수 없습니다.",
      { errors: commercialFlowValidation.errors },
    );
  }
  const productionPlanValidation =
    validateProductionPlan(productionPlan);
  if (!productionPlanValidation.ok) {
    throw new ParallelFrontierError(
      "PRODUCTION_PLAN_GATE_BLOCKED",
      "전체 ProductionPlan 계약이 검증되지 않아 G2/G3 frontier를 발급할 수 없습니다.",
      { errors: productionPlanValidation.errors },
    );
  }
  const planDigest = canonicalSha256(productionPlan);
  if (
    approval?.decision !== "approved" ||
    approval?.subject_plan_sha256 !== planDigest ||
    !nonEmpty(approval?.decision_id)
  ) {
    throw new ParallelFrontierError(
      "PLAN_APPROVAL_REQUIRED",
      "G2/G3 frontier는 exact ProductionPlan 승인에 고정되어야 합니다.",
      { expected_plan_sha256: planDigest },
    );
  }
  return planDigest;
}

function frontierItem({
  stageId,
  memberId,
  kind,
  input,
  outputType,
  parallelLane,
}) {
  const exactInputDigest = canonicalSha256(input);
  const workItemId = `${stageId}:${memberId}`;
  const artifactKey = sha256(`${workItemId}\n${exactInputDigest}`).slice(
    0,
    24,
  );
  return {
    work_item_id: workItemId,
    stage_id: stageId,
    member_id: memberId,
    kind,
    parallel_lane: parallelLane,
    exact_input_digest: exactInputDigest,
    expected_artifact_id: `artifact-${artifactKey}`,
    expected_output_type: outputType,
    output_locator:
      `orchestration/staging/${stageId.toLowerCase()}/${artifactKey}`,
    requires_execution_receipt: true,
    requires_independent_validation_receipt: true,
  };
}

function g0Items(ready, projectInputDigest) {
  return G0_PARALLEL_PREPARATION.filter((stageId) =>
    ready.has(stageId),
  ).map((stageId) =>
    frontierItem({
      stageId,
      memberId: "stage",
      kind: "preparation",
      input: { project_input_digest: projectInputDigest, stage_id: stageId },
      outputType: "stage.output",
      parallelLane: "g0-preparation",
    }),
  );
}

function imageItems(ready, plan, planDigest) {
  if (!ready.has("G2A_IMAGE") || !plan) return [];
  return asArray(plan?.image_job_set?.jobs).map((job) => {
    if (!nonEmpty(job?.job_id)) {
      throw new ParallelFrontierError(
        "IMAGE_JOB_ID_REQUIRED",
        "G2 frontier image job에는 job_id가 필요합니다.",
      );
    }
    return frontierItem({
      stageId: "G2A_IMAGE",
      memberId: job.job_id,
      kind: "image_cut",
      input: { plan_sha256: planDigest, image_job: job },
      outputType: "media.image_candidate",
      parallelLane: "image",
    });
  });
}

function motionSourceReady(brief, approvedImageJobIds) {
  if (brief?.source?.kind === "product_reference") return true;
  if (brief?.source?.kind !== "approved_image_job") return false;
  const dependencies = asArray(brief?.source?.image_job_ids);
  return (
    dependencies.length > 0 &&
    dependencies.every((jobId) => approvedImageJobIds.has(jobId))
  );
}

function motionItems(ready, plan, planDigest, approvedImageJobIds) {
  const stageId = ready.has("G3P_PREVIEW")
    ? "G3P_PREVIEW"
    : ready.has("G3R_RENDER")
      ? "G3R_RENDER"
      : null;
  if (!stageId || !plan) return [];
  return asArray(plan?.gif_brief_set?.briefs)
    .filter((brief) => motionSourceReady(brief, approvedImageJobIds))
    .map((brief) => {
      if (!nonEmpty(brief?.brief_id)) {
        throw new ParallelFrontierError(
          "MOTION_BRIEF_ID_REQUIRED",
          "G3 frontier motion brief에는 brief_id가 필요합니다.",
        );
      }
      return frontierItem({
        stageId,
        memberId: brief.brief_id,
        kind: "motion_module",
        input: { plan_sha256: planDigest, motion_brief: brief },
        outputType:
          stageId === "G3P_PREVIEW"
            ? "motion.preview"
            : "media.gif_candidate",
        parallelLane: "motion",
      });
    });
}

function qaItems(ready, qaSubject) {
  if (!ready.has("G4_PARALLEL_QA")) return [];
  if (
    !nonEmpty(qaSubject?.artifact_id) ||
    !Array.isArray(qaSubject?.producer_agent_session_ids)
  ) {
    throw new ParallelFrontierError(
      "QA_SUBJECT_REQUIRED",
      "병렬 QA에는 exact artifact와 producer session 집합이 필요합니다.",
    );
  }
  assertHash(qaSubject.manifest_sha256, "qa_subject.manifest_sha256");
  return DETAIL_PAGE_FLOW_POLICY.orchestration.independent_qa_lanes.map(
    (lane) =>
      frontierItem({
        stageId: `G4Q_${lane.toUpperCase()}_QA`,
        memberId: lane,
        kind: "independent_qa",
        input: {
          artifact_id: qaSubject.artifact_id,
          manifest_sha256: qaSubject.manifest_sha256,
          qa_lane: lane,
        },
        outputType: `qa.${lane}_result`,
        parallelLane: `qa-${lane}`,
      }),
  );
}

function interleave(left, right) {
  const output = [];
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    if (left[index]) output.push(left[index]);
    if (right[index]) output.push(right[index]);
  }
  return output;
}

function retryScope(candidates, retryMemberIds, failedMembers) {
  if (retryMemberIds.length === 0) {
    if (failedMembers.length > 0) {
      throw new ParallelFrontierError(
        "FAILED_RETRY_SCOPE_REQUIRED",
        "실패 멤버가 있으면 재시도 root를 명시해야 하며 전체 후보를 다시 발급할 수 없습니다.",
        {
          failed_work_item_ids: failedMembers.map(
            (failure) => failure?.work_item_id ?? null,
          ),
        },
      );
    }
    return candidates;
  }
  const failedIndex = new Map(
    failedMembers.map((failure) => [failure?.work_item_id, failure]),
  );
  const allowed = new Set();
  for (const workItemId of retryMemberIds) {
    const failure = failedIndex.get(workItemId);
    if (!failure) {
      throw new ParallelFrontierError(
        "RETRY_FAILED_MEMBER_ONLY",
        "재시도 root는 실패한 member여야 합니다.",
        { work_item_id: workItemId },
      );
    }
    allowed.add(workItemId);
    for (const descendant of asArray(failure.descendant_work_item_ids)) {
      allowed.add(descendant);
    }
  }
  return candidates.filter((item) => allowed.has(item.work_item_id));
}

export function planParallelFrontier({
  ready_stage_ids = [],
  project_input_digest,
  production_plan = null,
  plan_approval = null,
  approved_image_job_ids = [],
  active_leases = [],
  completed_work_item_ids = [],
  failed_members = [],
  retry_member_ids = [],
  worker_capacity,
  worker_session_ids = [],
  qa_subject = null,
}) {
  assertHash(project_input_digest, "project_input_digest");
  if (!Number.isInteger(worker_capacity) || worker_capacity < 1) {
    throw new ParallelFrontierError(
      "INVALID_WORKER_CAPACITY",
      "worker_capacity는 1 이상의 정수여야 합니다.",
    );
  }
  const sessions = [...new Set(worker_session_ids.filter(nonEmpty))];
  if (sessions.length < worker_capacity) {
    throw new ParallelFrontierError(
      "WORKER_SESSION_CAPACITY_INSUFFICIENT",
      "worker capacity를 채울 서로 다른 agent session이 부족합니다.",
      { worker_capacity, available_sessions: sessions.length },
    );
  }

  const ready = new Set(ready_stage_ids);
  const planDigest = assertPlanApproval(production_plan, plan_approval);
  const active = active_leases.filter(
    (lease) => lease?.status === "running",
  );
  const activeItemIds = new Set(active.map((lease) => lease.work_item_id));
  const completedItemIds = new Set(
    asArray(completed_work_item_ids).map(String),
  );
  if (activeItemIds.size !== active.length) {
    throw new ParallelFrontierError(
      "DUPLICATE_ACTIVE_LEASE",
      "같은 work item의 active lease가 둘 이상 존재합니다.",
    );
  }

  const preparation = g0Items(ready, project_input_digest);
  const images = imageItems(ready, production_plan, planDigest);
  const motions = motionItems(
    ready,
    production_plan,
    planDigest,
    new Set(approved_image_job_ids),
  );
  const qa = qaItems(ready, qa_subject);
  const allCandidates = [
    ...preparation,
    ...interleave(images, motions),
    ...qa,
  ];
  let candidates = allCandidates.filter(
    (item) =>
      !activeItemIds.has(item.work_item_id) &&
      !completedItemIds.has(item.work_item_id),
  );
  candidates = retryScope(
    candidates,
    asArray(retry_member_ids),
    asArray(failed_members),
  );

  const activeSessions = new Set(
    active.map((lease) => lease.producer_agent_session_id),
  );
  const availableSessions = sessions.filter(
    (sessionId) => !activeSessions.has(sessionId),
  );
  const remainingCapacity = Math.max(0, worker_capacity - active.length);
  const selected = [];
  const qaProducerSessions = new Set(
    qa_subject?.producer_agent_session_ids ?? [],
  );
  for (const candidate of candidates) {
    if (selected.length >= remainingCapacity) break;
    const sessionIndex = availableSessions.findIndex(
      (sessionId) =>
        candidate.kind !== "independent_qa" ||
        !qaProducerSessions.has(sessionId),
    );
    if (sessionIndex < 0) {
      if (candidate.kind === "independent_qa") continue;
      break;
    }
    const [producerSessionId] = availableSessions.splice(sessionIndex, 1);
    selected.push({
      ...candidate,
      producer_agent_session_id: producerSessionId,
      validation_session_constraint: {
        must_differ_from: [producerSessionId],
        subject_input_digest: candidate.exact_input_digest,
      },
    });
  }

  return {
    policy_id: DETAIL_PAGE_FLOW_POLICY.policy_id,
    policy_version: DETAIL_PAGE_FLOW_POLICY.version,
    worker_capacity,
    active_worker_count: active.length,
    issued_count: selected.length,
    capacity_filled:
      selected.length === Math.min(remainingCapacity, candidates.length),
    work_orders: selected,
    blocked_work_item_ids: [...activeItemIds].sort(),
    completed_work_item_ids: [...completedItemIds].sort(),
    candidate_work_item_ids: allCandidates.map(
      (item) => item.work_item_id,
    ),
    remaining_candidate_count: candidates.length,
  };
}

export function validateParallelQaCompletion({
  qa_subject,
  results = [],
}) {
  const expectedItems = qaItems(
    new Set(["G4_PARALLEL_QA"]),
    qa_subject,
  );
  const expectedByLane = new Map(
    expectedItems.map((item) => [item.member_id, item]),
  );
  const errors = [];
  const sessions = new Set();
  const pageProducerSessions = new Set(
    qa_subject?.producer_agent_session_ids ?? [],
  );
  const seenLanes = new Set();

  for (const result of asArray(results)) {
    const lane = result?.qa_lane;
    const expected = expectedByLane.get(lane);
    if (!expected || seenLanes.has(lane)) {
      errors.push({
        code: "QA_LANE_DUPLICATE_OR_UNKNOWN",
        qa_lane: lane ?? null,
      });
      continue;
    }
    seenLanes.add(lane);
    const sessionId = result?.producer_agent_session_id;
    if (
      !nonEmpty(sessionId) ||
      sessions.has(sessionId) ||
      pageProducerSessions.has(sessionId)
    ) {
      errors.push({
        code: "QA_SESSION_NOT_INDEPENDENT",
        qa_lane: lane,
      });
    }
    sessions.add(sessionId);
    if (
      !nonEmpty(result?.artifact_id) ||
      result?.exact_input_digest !== expected.exact_input_digest ||
      !nonEmpty(result?.output_locator)
    ) {
      errors.push({
        code: "QA_ARTIFACT_CONTRACT_INVALID",
        qa_lane: lane,
      });
    }
    if (
      !nonEmpty(result?.execution_receipt?.execution_id) ||
      !nonEmpty(result?.execution_receipt?.adapter_id) ||
      !/^[a-f0-9]{64}$/.test(
        String(result?.execution_receipt?.adapter_code_sha256 ?? ""),
      )
    ) {
      errors.push({
        code: "QA_EXECUTION_RECEIPT_REQUIRED",
        qa_lane: lane,
      });
    }
    const validation = result?.validation_receipt;
    const validationProducerSessions = new Set(
      validation?.producer?.agent_session_ids ?? [],
    );
    if (
      validation?.subject?.artifact_set_digest !==
        expected.exact_input_digest ||
      validation?.validator?.agent_session_id !== sessionId ||
      validation?.verdict !== "PASS" ||
      asArray(validation?.hard_failures).length > 0 ||
      validationProducerSessions.size !== pageProducerSessions.size ||
      [...pageProducerSessions].some(
        (producer) => !validationProducerSessions.has(producer),
      )
    ) {
      errors.push({
        code: "QA_VALIDATION_RECEIPT_INVALID",
        qa_lane: lane,
      });
    }
  }

  for (const lane of expectedByLane.keys()) {
    if (!seenLanes.has(lane)) {
      errors.push({ code: "QA_LANE_MISSING", qa_lane: lane });
    }
  }
  const ok = errors.length === 0;
  return {
    ok,
    errors,
    qa_bundle_sha256: ok
      ? canonicalSha256(
          results.map((result) => ({
            qa_lane: result.qa_lane,
            artifact_id: result.artifact_id,
            exact_input_digest: result.exact_input_digest,
            output_locator: result.output_locator,
            producer_agent_session_id:
              result.producer_agent_session_id,
            execution_id: result.execution_receipt.execution_id,
            validation_id:
              result.validation_receipt.validation_id,
          })),
        )
      : null,
  };
}
