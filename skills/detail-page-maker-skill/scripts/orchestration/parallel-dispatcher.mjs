import { createHash } from "node:crypto";

import { planParallelFrontier } from "./parallel-frontier.mjs";
import {
  resolveWorkerAllocation,
} from "./agent-capacity.mjs";
import {
  materializePlanningDocuments,
} from "./planning-materializer.mjs";

const PRODUCTION_FRONTIER_STAGES = new Set([
  "G2A_IMAGE",
  "G3P_PREVIEW",
  "G3R_RENDER",
]);

export class ParallelDispatcherError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ParallelDispatcherError";
    this.code = code;
    this.details = details;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function productionReadyStages(progress, status) {
  const ready = new Set(asArray(progress?.ready_stages));
  for (const item of asArray(status?.frontier_work_items)) {
    if (["running", "failed"].includes(item.status)) {
      ready.add(item.stage_id);
    }
  }
  return [...ready].filter((stageId) =>
    PRODUCTION_FRONTIER_STAGES.has(stageId),
  );
}

function failedDescendants(failure, productionPlan) {
  const descendants = new Set(
    asArray(failure?.descendant_work_item_ids).map(String),
  );
  if (failure?.stage_id !== "G2A_IMAGE") {
    return [...descendants];
  }
  for (const brief of asArray(
    productionPlan?.gif_brief_set?.briefs,
  )) {
    if (
      !asArray(brief?.source?.image_job_ids).includes(
        failure.member_id,
      )
    ) {
      continue;
    }
    descendants.add(`G3P_PREVIEW:${brief.brief_id}`);
    descendants.add(`G3R_RENDER:${brief.brief_id}`);
  }
  return [...descendants].sort();
}

function effectiveFailedMembers(
  status,
  suppliedFailures,
  productionPlan,
) {
  const failures = new Map();
  for (const failure of [
    ...asArray(suppliedFailures),
    ...asArray(status?.frontier_work_items).filter(
      (item) => item?.status === "failed",
    ),
  ]) {
    if (!failure?.work_item_id) continue;
    const previous = failures.get(failure.work_item_id);
    const merged = {
      ...(previous ?? {}),
      ...failure,
    };
    merged.descendant_work_item_ids = failedDescendants(
      {
        ...merged,
        descendant_work_item_ids: [
          ...asArray(previous?.descendant_work_item_ids),
          ...asArray(failure?.descendant_work_item_ids),
        ],
      },
      productionPlan,
    );
    failures.set(failure.work_item_id, merged);
  }
  return [...failures.values()];
}

export async function dispatchParallelProductionFrontier({
  engine,
  project_root,
  project_ref,
  advance_result,
  production_plan,
  plan_approval,
  approved_image_job_ids = [],
  worker_capacity,
  worker_session_ids,
  agent_capacity_environment = process.env,
  failed_members = [],
  retry_member_ids = [],
}) {
  const status = await engine.inspect(project_ref);
  const readyStageIds = productionReadyStages(
    advance_result,
    status,
  );
  if (readyStageIds.length === 0) return advance_result;
  const allocation = resolveWorkerAllocation({
    requestedCapacity:
      worker_capacity ?? agent_capacity_environment.DETAIL_PAGE_WORKER_CAPACITY,
    cliSessionIds: worker_session_ids,
    environment: agent_capacity_environment,
  });
  if (!production_plan || !plan_approval) {
    throw new ParallelDispatcherError(
      "PARALLEL_PLAN_INPUT_REQUIRED",
      "G2/G3 workflow-advance에는 ProductionPlan과 정확한 PlanApproval이 필요합니다.",
      { ready_stage_ids: readyStageIds },
    );
  }

  const existing = asArray(status.frontier_work_items).filter(
    (item) => readyStageIds.includes(item.stage_id),
  );
  const artifactStatusById = new Map(
    asArray(status.artifacts).map((artifact) => [
      artifact.artifact_id,
      artifact.status,
    ]),
  );
  const activeLeases = existing.filter(
    (item) => item.status === "running",
  );
  const completedWorkItemIds = existing
    .filter(
      (item) =>
        item.status === "completed" &&
        artifactStatusById.get(item.expected_artifact_id) ===
          "fresh",
    )
    .map((item) => item.work_item_id);
  const failedMembers = effectiveFailedMembers(
    status,
    failed_members,
    production_plan,
  );
  const retryMemberIds =
    asArray(retry_member_ids).length > 0
      ? asArray(retry_member_ids)
      : failedMembers
          .filter((failure) => failure.retryable !== false)
          .map((failure) => failure.work_item_id);
  const frontierPlan = planParallelFrontier({
    ready_stage_ids: readyStageIds,
    project_input_digest: project_ref.input_digest,
    production_plan,
    plan_approval,
    approved_image_job_ids,
    active_leases: activeLeases,
    completed_work_item_ids: completedWorkItemIds,
    failed_members: failedMembers,
    retry_member_ids: retryMemberIds,
    worker_capacity: allocation.worker_capacity,
    worker_session_ids: allocation.worker_session_ids,
  });
  const staleExpectedIdsByWorkItem = new Map(
    existing
      .filter(
        (item) =>
          item.status === "completed" &&
          artifactStatusById.get(item.expected_artifact_id) !==
            "fresh",
      )
      .map((item) => [
        item.work_item_id,
        item.expected_artifact_id,
      ]),
  );
  for (const item of frontierPlan.work_orders) {
    if (!staleExpectedIdsByWorkItem.has(item.work_item_id)) {
      continue;
    }
    const revisionToken =
      status.stages?.[item.stage_id]?.revision_reset_by;
    if (typeof revisionToken !== "string" || revisionToken === "") {
      continue;
    }
    item.exact_input_digest = sha256(
      `${item.exact_input_digest}\nrevision:${revisionToken}`,
    );
    const artifactKey = sha256(
      `${item.work_item_id}\n${item.exact_input_digest}`,
    ).slice(0, 24);
    item.expected_artifact_id = `artifact-${artifactKey}`;
    item.output_locator =
      `.detail-page/workflow/staging/` +
      `${item.stage_id.toLowerCase()}/${artifactKey}`;
  }
  if (!project_root) {
    throw new ParallelDispatcherError(
      "PROJECT_ROOT_REQUIRED",
      "사람용 기획 문서를 물질화하려면 project_root가 필요합니다.",
    );
  }
  const planningMaterialization =
    await materializePlanningDocuments({
      projectRoot: project_root,
      productionPlan: production_plan,
    });
  const leaseResult = await engine.leaseFrontier(project_ref, {
    worker_capacity: allocation.worker_capacity,
    agent_session_ids: allocation.worker_session_ids,
    stage_ids: readyStageIds,
    planned_work_items: frontierPlan.work_orders,
  });

  const activeWorkItemIds = new Set(
    activeLeases.map((item) => item.work_item_id),
  );
  const completedSet = new Set(completedWorkItemIds);
  const frontierComplete =
    frontierPlan.candidate_work_item_ids.length > 0 &&
    frontierPlan.candidate_work_item_ids.every((workItemId) =>
      completedSet.has(workItemId),
    ) &&
    frontierPlan.candidate_work_item_ids.every(
      (workItemId) => !activeWorkItemIds.has(workItemId),
    );
  let completion = null;
  if (frontierComplete) {
    completion = await engine.completeParallelFrontier(project_ref, {
      stage_id: readyStageIds[0],
      expected_work_item_ids:
        frontierPlan.candidate_work_item_ids,
    });
  }

  return {
    kind: completion
      ? "ParallelFrontierCompleted"
      : "ParallelFrontierDispatched",
    advance: advance_result,
    frontier_plan: {
      policy_id: frontierPlan.policy_id,
      policy_version: frontierPlan.policy_version,
      candidate_work_item_ids:
        frontierPlan.candidate_work_item_ids,
      completed_work_item_ids:
        frontierPlan.completed_work_item_ids,
      blocked_work_item_ids:
        frontierPlan.blocked_work_item_ids,
      remaining_candidate_count:
        frontierPlan.remaining_candidate_count,
      planned_count: frontierPlan.work_orders.length,
    },
    agent_capacity: allocation,
    planning_materialization: planningMaterialization,
    lease_result: leaseResult,
    completion,
  };
}
