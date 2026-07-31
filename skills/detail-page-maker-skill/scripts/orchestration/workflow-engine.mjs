import { createHash, randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import BEHANCE_RUBRIC_POLICY from "../../policies/behance-commerce-v0.1.json" with { type: "json" };
import {
  ArtifactGraph,
  artifactSetDigest,
} from "./artifact-graph.mjs";
import {
  createArtifactRecordStore,
} from "./artifact-record-store.mjs";
import { createFileStateStore } from "./file-state-store.mjs";
import {
  verifyMaterializedHeroAssurance,
} from "./materialized-hero-assurance.mjs";
import { assertValidationReceipt } from "./receipt-contracts.mjs";
import {
  createRepairLoopTransition,
  resolveRepairMutation,
} from "./repair-loop-controller.mjs";
import {
  createRevisionImpactPlan,
  revisionImpactDigest,
} from "./revision-impact.mjs";
import { assertStageValidationPolicy } from "./stage-validation-policy.mjs";
import { createStructuralValidationReceipt } from "./structural-validation.mjs";
import { resolveWorkflowStorage } from "./storage-paths.mjs";
import { WORKFLOW_DEFINITION } from "./workflow-definition.mjs";

const REPAIR_LOOP_STAGE_ID = "INTERNAL_RUBRIC_REPAIR";
const REPAIR_LOOP_ADAPTER_ID =
  "WorkflowOrchestratorRepairLoopAdapter";
const REPAIR_LOOP_ADAPTER_CODE_SHA256 = createHash("sha256")
  .update("repair-loop-controller.mjs@1.0.0")
  .digest("hex");
const REPAIR_BLOCKING_ACTIONS = new Set([
  "REPAIR_REQUIRED",
  "PLATEAU_AWAITING_USER",
  "BUDGET_AWAITING_USER",
]);
const ITEM_FRONTIER_ONLY_STAGES = new Set([
  "G2A_IMAGE",
  "G3P_PREVIEW",
  "G3R_RENDER",
]);
export const PLAN_ONCE_FAST_PATH_POLICY_ID =
  "policy.approval.plan-once-with-actual-photos.v1";
const PLAN_ONCE_MANUAL_GATE = "G1U_APPROVAL";
const PLAN_ONCE_PRE_PLAN_AUTO_GATES = new Set([
  "G0U_APPROVAL",
  "G1DQ_SELECTION",
]);
const PLAN_ONCE_POST_PLAN_AUTO_GATES = new Set([
  "G2S_CONFIG_APPROVAL",
  "G2U_APPROVAL",
  "G3V_PREVIEW_APPROVAL",
  "G3U_APPROVAL",
  "G4U_APPROVAL",
  "G5U_APPROVAL",
]);
const PLAN_ONCE_AUTO_APPROVER_SESSION =
  "orchestrator-plan-once-fast-path";

export class WorkflowEngineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "WorkflowEngineError";
    this.code = code;
    this.details = details;
  }
}

export function assertAggregateLeaseAllowed(stageId) {
  if (ITEM_FRONTIER_ONLY_STAGES.has(stageId)) {
    throw new WorkflowEngineError(
      "ITEM_FRONTIER_REQUIRED",
      "G2/G3 제작 단계는 aggregate lease를 허용하지 않으며 ProductionPlan item별 frontier로만 실행합니다.",
      { stage_id: stageId },
    );
  }
  return stageId;
}

function isActualProductPhotoLocator(locator) {
  const normalized = String(locator ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
  return (
    normalized.startsWith("input/product/") &&
    normalized.length > "input/product/".length &&
    !normalized.split("/").includes("..") &&
    !path.posix.isAbsolute(normalized)
  );
}

export function hasVerifiedActualProductPhotoSet(state) {
  return (state?.graph?.artifacts ?? []).some((artifact) => {
    if (
      artifact?.type !== "identity.photo_set" ||
      artifact?.status !== "fresh" ||
      !Array.isArray(artifact.member_ids) ||
      artifact.member_ids.length === 0
    ) {
      return false;
    }
    const members = artifact?.member_manifest?.members;
    if (
      artifact?.member_manifest?.policy !== "materialized" ||
      !Array.isArray(members) ||
      members.length !== artifact.member_ids.length
    ) {
      return false;
    }
    const expectedIds = new Set(artifact.member_ids.map(String));
    return members.every(
      (member) =>
        expectedIds.has(String(member?.member_id ?? "")) &&
        member?.root_id === "project" &&
        Number.isSafeInteger(member?.size_bytes) &&
        member.size_bytes > 0 &&
        /^[a-f0-9]{64}$/.test(String(member?.sha256 ?? "")) &&
        isActualProductPhotoLocator(member?.locator),
    );
  });
}

export function hasManualPlanApproval(state) {
  return (state?.graph?.artifacts ?? []).some((artifact) => {
    const receipt = artifact?.approval_receipt;
    return (
      artifact?.type === "decision.plan_approval" &&
      artifact?.status === "fresh" &&
      artifact?.produced_by_stage === PLAN_ONCE_MANUAL_GATE &&
      receipt?.decision === "approved" &&
      receipt?.approval_channel !== "policy_auto_after_plan" &&
      typeof receipt?.decided_by === "string" &&
      receipt.decided_by.trim().length > 0
    );
  });
}

export function planOnceFastPathDecision(state, stageId) {
  if (stageId === PLAN_ONCE_MANUAL_GATE) {
    return {
      auto_approve: false,
      reason: "manual_plan_approval_required",
    };
  }
  if (!hasVerifiedActualProductPhotoSet(state)) {
    return {
      auto_approve: false,
      reason: "verified_actual_product_photos_required",
    };
  }
  if (PLAN_ONCE_PRE_PLAN_AUTO_GATES.has(stageId)) {
    return {
      auto_approve: true,
      phase: "before_manual_plan",
      policy_id: PLAN_ONCE_FAST_PATH_POLICY_ID,
    };
  }
  if (PLAN_ONCE_POST_PLAN_AUTO_GATES.has(stageId)) {
    if (!hasManualPlanApproval(state)) {
      return {
        auto_approve: false,
        reason: "manual_plan_approval_required",
      };
    }
    return {
      auto_approve: true,
      phase: "after_manual_plan",
      policy_id: PLAN_ONCE_FAST_PATH_POLICY_ID,
    };
  }
  return {
    auto_approve: false,
    reason: "gate_not_in_plan_once_fast_path",
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertSha256(value, field) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ""))) {
    throw new WorkflowEngineError(
      "INVALID_HASH",
      `${field}는 SHA-256이어야 합니다.`,
      { field },
    );
  }
}

function assertProjectRef(projectRef) {
  if (!projectRef?.project_id) {
    throw new WorkflowEngineError(
      "INVALID_PROJECT",
      "project_id가 필요합니다.",
    );
  }
  assertSha256(projectRef.input_digest, "input_digest");
}

function initialState(projectRef, definition) {
  return {
    version: 2,
    workflow_id: definition.workflow_id,
    workflow_version: definition.version,
    project_id: projectRef.project_id,
    input_digest: projectRef.input_digest,
    stages: Object.fromEntries(
      definition.stages.map((item) => [
        item.stage_id,
        { status: "pending", run_ids: [] },
      ]),
    ),
    graph: { artifacts: [], edges: [] },
    work_orders: {},
    challenges: {},
    used_nonces: [],
    events: [],
    flags: {
      missing_photo_notice_emitted: false,
    },
    repair_loop: {
      status: "IDLE",
      history: [],
      results: {},
      transitions: {},
    },
  };
}

function stageMap(definition) {
  return new Map(definition.stages.map((item) => [item.stage_id, item]));
}

function emitMissingPhotoNotice(state, options, createdAt) {
  if (
    options?.actual_product_photos_present !== false ||
    state.flags?.missing_photo_notice_emitted === true
  ) {
    return [];
  }
  state.events ??= [];
  state.flags ??= {};
  const event = {
    event_id: "notice-missing-actual-product-photo",
    event_type: "missing_actual_product_photo_notice",
    severity: "info",
    message:
      "실제 제품 사진이 있으면 input/product에 추가해 주세요. 없으면 동일 SKU 공급처 이미지를 기준으로 계속 진행합니다.",
    created_at: createdAt,
  };
  state.events.push(event);
  state.flags.missing_photo_notice_emitted = true;
  return [event];
}

function freshArtifacts(state) {
  return state.graph.artifacts.filter(
    (artifact) => artifact.status === "fresh",
  );
}

function stageInputs(state, definition, stageId) {
  const item = stageMap(definition).get(stageId);
  const all = freshArtifacts(state);
  const acceptedTypes = [
    ...item.required_inputs,
    ...(item.any_of_inputs ?? []).flat(),
  ];
  return [...new Set(acceptedTypes)].flatMap((type) => {
    const allowedProducers = item.input_producers?.[type] ?? [];
    return all.filter(
      (artifact) =>
        artifact.type === type &&
        (allowedProducers.length === 0 ||
          allowedProducers.includes(artifact.produced_by_stage)),
    );
  });
}

function stageReady(state, definition, stageId) {
  const item = stageMap(definition).get(stageId);
  const stateEntry = state.stages[stageId];
  if (!item || stateEntry.status !== "pending") return false;
  if (
    ["G4U_APPROVAL", "G5_PUBLISH_QA", "G5U_APPROVAL"].includes(stageId) &&
    REPAIR_BLOCKING_ACTIONS.has(state.repair_loop?.status)
  ) {
    return false;
  }
  const inputs = stageInputs(state, definition, stageId);
  const requiredReady = item.required_inputs.every((type) =>
    inputs.some((artifact) => artifact.type === type),
  );
  const alternativesReady = (item.any_of_inputs ?? []).every((group) =>
    group.some((type) =>
      inputs.some((artifact) => artifact.type === type),
    ),
  );
  return requiredReady && alternativesReady;
}

function readyStages(state, definition) {
  return definition.stages
    .filter((item) => stageReady(state, definition, item.stage_id))
    .map((item) => item.stage_id);
}

function workOrderInputRefs(inputs) {
  return inputs.map((artifact) => ({
    artifact_id: artifact.artifact_id,
    manifest_sha256: artifact.manifest_sha256,
    member_ids: artifact.member_ids ?? [],
    relation: "evidence_for",
  }));
}

function validateExecutionReceipt(receipt, expectedAdapterId) {
  for (const field of [
    "execution_id",
    "adapter_id",
    "adapter_version",
    "adapter_code_sha256",
  ]) {
    if (!receipt?.[field]) {
      throw new WorkflowEngineError(
        "INVALID_EXECUTION_RECEIPT",
        `ExecutionReceipt.${field}가 필요합니다.`,
      );
    }
  }
  assertSha256(
    receipt.adapter_code_sha256,
    "execution_receipt.adapter_code_sha256",
  );
  if (receipt.adapter_id !== expectedAdapterId) {
    throw new WorkflowEngineError(
      "EXECUTION_ADAPTER_MISMATCH",
      "ExecutionReceipt.adapter_id가 WorkOrder runner contract와 다릅니다.",
      {
        expected: expectedAdapterId,
        actual: receipt.adapter_id,
      },
    );
  }
}

function sorted(values) {
  return [...values].sort();
}

function semanticValidationRequired(stageId) {
  return stageId.endsWith("_QA") || stageId === "G4Q_RUBRIC";
}

function leaseAttempt(state, stageId, inputSetDigest) {
  return (
    Math.max(
      0,
      ...Object.values(state.work_orders)
        .filter(
          (workOrder) =>
            workOrder.stage_id === stageId &&
            workOrder.input_set_digest === inputSetDigest,
        )
        .map((workOrder) => Number(workOrder.attempt) || 0),
    ) + 1
  );
}

const REVISION_PLAN_STAGE_ID = "REVISION_IMPACT_PLAN";
const REVISION_PLAN_POLICY_ID = "policy.revision-impact-plan.v1";
const REVISION_PLAN_ARTIFACT_TYPE = "plan.revision_impact";
const REVISION_PLAN_MEMBER_ID = "revision-impact-plan.json";
const REVISION_PLAN_ADAPTER_ID = "RevisionImpactPlannerAdapter";
const REVISION_PLAN_ADAPTER_CODE_SHA256 = sha256(
  "RevisionImpactPlannerAdapter@1.0.0",
);

function assertNonEmptyString(value, field, code = "INVALID_REVISION_DECISION") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new WorkflowEngineError(
      code,
      `${field} must be a non-empty string`,
      { field },
    );
  }
}

function revisionGraphSnapshot(graph) {
  return {
    artifacts: (graph?.artifacts ?? []).map((artifact) => ({
      ...structuredClone(artifact),
      producer_stage_id:
        artifact.producer_stage_id ?? artifact.produced_by_stage ?? null,
    })),
    edges: (graph?.edges ?? []).map((edge) => structuredClone(edge)),
  };
}

function revisionPlanBody(plan) {
  const body = structuredClone(plan);
  delete body.digest;
  return body;
}

function calculateEngineRevisionPlan(
  graph,
  workflowDefinition,
  changeRequest,
) {
  const calculated = createRevisionImpactPlan({
    graphSnapshot: revisionGraphSnapshot(graph),
    workflowDefinition,
    changeRequest,
  });
  const body = {
    ...revisionPlanBody(calculated),
    graph_snapshot_digest: revisionImpactDigest(graph),
  };
  return {
    ...body,
    digest: revisionImpactDigest(body),
  };
}

function revisionPlanArtifact(plan, changeRequest) {
  const manifestSha256 = revisionImpactDigest({
    plan,
    change_request: changeRequest,
  });
  return {
    artifact_id: `revision-impact-plan-${plan.digest}`,
    type: REVISION_PLAN_ARTIFACT_TYPE,
    manifest_sha256: manifestSha256,
    member_ids: [REVISION_PLAN_MEMBER_ID],
    revision_impact_plan: structuredClone(plan),
    change_request: structuredClone(changeRequest),
    state_mutation: false,
  };
}

function stateIntegritySummary(state) {
  const seal = state?._state_seal;
  return {
    status:
      seal?.status === "verified"
        ? "verified"
        : seal?.status === "legacy_sha256"
          ? "legacy_sha256"
        : seal?.status === "legacy_unsealed"
          ? "legacy_unsealed"
          : "unknown",
    algorithm:
      seal?.algorithm === "hmac-sha256"
        ? "hmac-sha256"
        : seal?.algorithm === "sha256"
          ? "sha256"
          : null,
  };
}

function artifactSummary(state) {
  const artifacts = state.graph?.artifacts ?? [];
  const byType = {};
  for (const type of sorted(new Set(artifacts.map((artifact) => artifact.type)))) {
    byType[type] = artifacts.filter(
      (artifact) => artifact.type === type,
    ).length;
  }
  return {
    total_count: artifacts.length,
    fresh_count: artifacts.filter(
      (artifact) => artifact.status === "fresh",
    ).length,
    stale_count: artifacts.filter(
      (artifact) => artifact.status === "stale",
    ).length,
    by_type: byType,
  };
}

function publishApprovalFailure(status, artifact = null) {
  return {
    status,
    valid: false,
    artifact_id: artifact?.artifact_id ?? null,
    subject_artifact_set_digest: null,
  };
}

function publishApprovalSummary(state) {
  const artifacts = state.graph?.artifacts ?? [];
  const candidates = artifacts.filter(
    (artifact) => artifact.type === "decision.publish_approval",
  );
  if (candidates.length === 0) {
    return publishApprovalFailure("missing");
  }
  const freshCandidates = candidates.filter(
    (artifact) => artifact.status === "fresh",
  );
  if (freshCandidates.length === 0) {
    return publishApprovalFailure("stale", candidates[0]);
  }
  if (freshCandidates.length !== 1) {
    return publishApprovalFailure("ambiguous");
  }

  const artifact = freshCandidates[0];
  if (artifact.produced_by_stage !== "G5U_APPROVAL") {
    return publishApprovalFailure("producer_mismatch", artifact);
  }
  const receipt = artifact.approval_receipt;
  if (
    receipt?.decision !== "approved" ||
    receipt?.project_ref?.project_id !== state.project_id ||
    receipt?.project_ref?.input_digest !== state.input_digest ||
    !receipt?.project_ref?.agent_session_id ||
    !receipt?.nonce ||
    !receipt?.decided_by ||
    !receipt?.approval_channel ||
    artifact.producer_agent_session_id !==
      receipt.project_ref.agent_session_id
  ) {
    return publishApprovalFailure("receipt_invalid", artifact);
  }
  if (artifact.manifest_sha256 !== sha256(JSON.stringify(receipt))) {
    return publishApprovalFailure("receipt_hash_mismatch", artifact);
  }

  const incomingEdges = (state.graph?.edges ?? []).filter(
    (edge) => edge.to === artifact.artifact_id,
  );
  const sourcesById = new Map(
    artifacts.map((source) => [source.artifact_id, source]),
  );
  const sources = incomingEdges.map((edge) => ({
    edge,
    source: sourcesById.get(edge.from),
  }));
  if (
    sources.some(
      ({ source }) =>
        !source?.producer_agent_session_id ||
        source.producer_agent_session_id ===
          receipt.project_ref.agent_session_id,
    )
  ) {
    return publishApprovalFailure(
      "approver_producer_not_separated",
      artifact,
    );
  }
  if (
    sources.length === 0 ||
    sources.some(
      ({ edge, source }) =>
        !source ||
        source.status !== "fresh" ||
        edge.relation !== "evidence_for" ||
        source.produced_by_stage !== "G5_PUBLISH_QA" ||
        !["page.publish_bundle", "qa.validation_receipt"].includes(
          source.type,
        ),
    ) ||
    !["page.publish_bundle", "qa.validation_receipt"].every((type) =>
      sources.some(({ source }) => source.type === type),
    )
  ) {
    return publishApprovalFailure("subject_invalid", artifact);
  }
  const subjectArtifactSetDigest = artifactSetDigest(
    sources.map(({ edge, source }) => ({
      artifact_id: source.artifact_id,
      manifest_sha256: source.manifest_sha256,
      member_ids: source.member_ids ?? [],
      relation: edge.relation,
    })),
  );
  if (
    artifact.input_set_digest !== subjectArtifactSetDigest ||
    receipt.subject_artifact_set_digest !== subjectArtifactSetDigest
  ) {
    return publishApprovalFailure("subject_digest_mismatch", artifact);
  }
  return {
    status: "verified",
    valid: true,
    artifact_id: artifact.artifact_id,
    subject_artifact_set_digest: subjectArtifactSetDigest,
  };
}

export function createWorkflowEngine({
  projectRoot,
  definition = WORKFLOW_DEFINITION,
  rubricDefinition = BEHANCE_RUBRIC_POLICY,
  stateStore = createFileStateStore(projectRoot),
  allowedMaterializedRoots = {},
  artifactRecordStore = projectRoot
    ? createArtifactRecordStore(projectRoot, {
        allowedMaterializedRoots,
      })
    : null,
  clock = () => new Date(),
  leaseDurationMs = 30 * 60 * 1000,
} = {}) {
  if (!projectRoot && !stateStore) {
    throw new WorkflowEngineError(
      "PROJECT_ROOT_REQUIRED",
      "projectRoot 또는 stateStore가 필요합니다.",
    );
  }
  if (
    typeof artifactRecordStore?.commit !== "function" ||
    typeof artifactRecordStore?.verify !== "function"
  ) {
    throw new WorkflowEngineError(
      "ARTIFACT_RECORD_STORE_REQUIRED",
      "artifact record store must provide commit and verify",
    );
  }
  if (
    typeof clock !== "function" ||
    !Number.isFinite(leaseDurationMs) ||
    leaseDurationMs <= 0
  ) {
    throw new WorkflowEngineError(
      "INVALID_LEASE_CONFIGURATION",
      "clock 함수와 양수 leaseDurationMs가 필요합니다.",
    );
  }
  const definitions = stageMap(definition);
  const revisionPlansRoot = projectRoot
    ? resolveWorkflowStorage(projectRoot, "revision-plans")
    : null;

  async function verifyPublishHeroAssurance(
    artifacts,
    phase,
  ) {
    const revisionArtifacts = (artifacts ?? []).filter(
      (artifact) =>
        artifact?.type === "studio.committed_revision",
    );
    if (revisionArtifacts.length !== 1) {
      throw new WorkflowEngineError(
        "G5_STUDIO_REVISION_REQUIRED",
        "G5에는 검증 가능한 studio.committed_revision 정확히 하나가 필요합니다.",
        { phase, count: revisionArtifacts.length },
      );
    }
    try {
      return await verifyMaterializedHeroAssurance({
        projectRoot,
        revisionArtifact: revisionArtifacts[0],
        consumerStage: "G5_PUBLISH_QA",
      });
    } catch (error) {
      throw new WorkflowEngineError(
        "G5_HERO_ASSURANCE_REVALIDATION_FAILED",
        "G5 직전 materialized Hero assurance 재검증에 실패했습니다.",
        {
          phase,
          cause: error?.code ?? error?.message,
          details: error?.details,
        },
      );
    }
  }

  function revisionPlanPath(planDigest) {
    assertSha256(planDigest, "plan_digest");
    if (!revisionPlansRoot) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_STORE_REQUIRED",
        "revision planning requires a projectRoot-backed plan store",
      );
    }
    return path.join(revisionPlansRoot, `${planDigest}.json`);
  }

  function validateRevisionPlanEnvelope(
    envelope,
    {
      projectRef,
      expectedPlanDigest,
      expectedChangeRequest = undefined,
    },
  ) {
    const body = structuredClone(envelope);
    delete body.envelope_sha256;
    if (
      !envelope?.envelope_sha256 ||
      revisionImpactDigest(body) !== envelope.envelope_sha256
    ) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_INTEGRITY_MISMATCH",
        "revision plan envelope digest does not match its contents",
      );
    }
    if (
      envelope.schema_version !== "1.0" ||
      envelope.project_id !== projectRef.project_id ||
      envelope.input_digest !== projectRef.input_digest ||
      envelope.plan_digest !== expectedPlanDigest ||
      envelope.plan?.digest !== expectedPlanDigest ||
      revisionImpactDigest(revisionPlanBody(envelope.plan)) !==
        expectedPlanDigest
    ) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_SUBJECT_MISMATCH",
        "revision plan envelope does not match the requested project and plan",
      );
    }
    if (
      expectedChangeRequest !== undefined &&
      revisionImpactDigest(envelope.change_request) !==
        revisionImpactDigest(expectedChangeRequest)
    ) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_CHANGE_MISMATCH",
        "the existing immutable plan was created for another change request",
      );
    }
    if (
      envelope.state_mutation !== false ||
      envelope.plan.state_mutation?.allowed !== false ||
      envelope.plan.state_mutation?.performed !== false ||
      envelope.artifact?.state_mutation !== false ||
      envelope.commit_validation_receipt?.input_set_digest !==
        envelope.plan.graph_snapshot_digest
    ) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_MUTATION_FORBIDDEN",
        "revision planning must remain read-only",
      );
    }
    const expectedArtifact = revisionPlanArtifact(
      envelope.plan,
      envelope.change_request,
    );
    if (
      revisionImpactDigest(envelope.artifact) !==
      revisionImpactDigest(expectedArtifact)
    ) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_ARTIFACT_MISMATCH",
        "revision plan artifact does not bind the exact immutable plan",
      );
    }
    assertValidationReceipt(envelope.commit_validation_receipt, {
      expectedArtifactSetDigest: artifactSetDigest([
        {
          artifact_id: envelope.artifact.artifact_id,
          manifest_sha256: envelope.artifact.manifest_sha256,
          member_ids: envelope.artifact.member_ids,
          relation: "evidence_for",
        },
      ]),
      expectedPolicyId: REVISION_PLAN_POLICY_ID,
      validatorAgentSessionId:
        "orchestrator-structural-validator",
      producerAgentSessionIds: [
        envelope.producer_agent_session_id,
      ],
      availableEvidenceArtifactIds: [
        envelope.artifact.artifact_id,
      ],
    });
    validateExecutionReceipt(
      envelope.execution_receipt,
      REVISION_PLAN_ADAPTER_ID,
    );
    return envelope;
  }

  async function readRevisionPlanEnvelope(
    projectRef,
    planDigest,
    { allowMissing = false } = {},
  ) {
    const target = revisionPlanPath(planDigest);
    let raw;
    try {
      raw = await readFile(target, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissing) return null;
      if (error?.code === "ENOENT") {
        throw new WorkflowEngineError(
          "REVISION_PLAN_NOT_FOUND",
          "the requested revision plan does not exist",
          { plan_digest: planDigest },
        );
      }
      throw error;
    }
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      throw new WorkflowEngineError(
        "REVISION_PLAN_INTEGRITY_MISMATCH",
        "revision plan envelope is not valid JSON",
      );
    }
    return validateRevisionPlanEnvelope(envelope, {
      projectRef,
      expectedPlanDigest: planDigest,
    });
  }

  async function persistRevisionPlanEnvelope(envelope) {
    const target = revisionPlanPath(envelope.plan_digest);
    await mkdir(revisionPlansRoot, { recursive: true });
    const staging = path.join(
      revisionPlansRoot,
      `.${envelope.plan_digest}.${randomUUID()}.tmp`,
    );
    const bytes = `${JSON.stringify(envelope, null, 2)}\n`;
    try {
      await writeFile(staging, bytes, { flag: "wx" });
      try {
        await link(staging, target);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
    } finally {
      await rm(staging, { force: true });
    }
    return readRevisionPlanEnvelope(
      {
        project_id: envelope.project_id,
        input_digest: envelope.input_digest,
      },
      envelope.plan_digest,
    );
  }

  async function commitAndVerifyRevisionPlanRecord(envelope) {
    const record = await artifactRecordStore.commit({
      project_id: envelope.project_id,
      work_order_id: envelope.work_order_id,
      stage_id: REVISION_PLAN_STAGE_ID,
      input_set_digest: envelope.plan.graph_snapshot_digest,
      producer_agent_session_id:
        envelope.producer_agent_session_id,
      artifact: envelope.artifact,
      execution_receipt: envelope.execution_receipt,
      commit_validation_receipt:
        envelope.commit_validation_receipt,
    });
    const verified = await artifactRecordStore.verify({
      project_id: envelope.project_id,
      artifact_id: envelope.artifact.artifact_id,
      manifest_sha256: envelope.artifact.manifest_sha256,
      record_locator: record.record_locator,
      record_sha256: record.record_sha256,
    });
    if (
      revisionImpactDigest(verified.commit_validation_receipt) !==
      revisionImpactDigest(envelope.commit_validation_receipt)
    ) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_RECORD_MISMATCH",
        "revision plan record does not preserve its structural receipt",
      );
    }
    return record;
  }

  async function commitPhotoRevisionArtifact(state, envelope) {
    if (
      envelope.change_request.kind !==
      "actual_product_photo_set_revision"
    ) {
      return null;
    }
    const source = envelope.change_request.new_artifact;
    const oldReference = source.revision_of;
    const oldArtifact = state.graph.artifacts.find(
      (artifact) =>
        artifact.artifact_id === oldReference.artifact_id &&
        artifact.manifest_sha256 ===
          oldReference.manifest_sha256,
    );
    if (!oldArtifact || oldArtifact.status !== "fresh") {
      throw new WorkflowEngineError(
        "PHOTO_REVISION_ROOT_MISMATCH",
        "the previous photo-set revision is absent or no longer fresh",
      );
    }
    const stageDefinition = definitions.get("G0B_PHOTO");
    if (
      !stageDefinition ||
      !stageDefinition.produces.includes("identity.photo_set")
    ) {
      throw new WorkflowEngineError(
        "PHOTO_REVISION_STAGE_MISSING",
        "G0B_PHOTO cannot commit identity.photo_set",
      );
    }
    const inputSetDigest = artifactSetDigest([
      {
        artifact_id: oldArtifact.artifact_id,
        manifest_sha256: oldArtifact.manifest_sha256,
        member_ids: oldArtifact.member_ids ?? [],
        relation: "revision_of",
      },
    ]);
    const revisionEnvelope = {
      schema_version: "1.0",
      envelope_type: "identity.photo_set.revision",
      plan_digest: envelope.plan_digest,
      revision_of: structuredClone(oldReference),
      rights_provenance_receipt_sha256:
        source.rights_provenance.receipt_sha256,
      identity_provenance_receipt_sha256:
        source.identity_provenance.receipt_sha256,
      producer_agent_session_id:
        source.producer_agent_session_id,
      state_mutation: "commit",
    };
    const artifact = {
      artifact_id: source.artifact_id,
      type: "identity.photo_set",
      manifest_sha256: source.manifest_sha256,
      member_ids: [...source.member_ids].map(String).sort(),
      members: structuredClone(
        source.rights_provenance.subject.members,
      ).sort((left, right) =>
        left.member_id.localeCompare(right.member_id),
      ),
      member_manifest: structuredClone(source.member_manifest),
      revision_of: structuredClone(oldReference),
      rights_provenance: structuredClone(
        source.rights_provenance,
      ),
      identity_provenance: structuredClone(
        source.identity_provenance,
      ),
      revision_envelope: revisionEnvelope,
    };
    const workOrder = {
      work_order_id: `revision-photo-${envelope.plan_digest}`,
      stage_id: "G0B_PHOTO",
      assigned_agent_session_id:
        source.producer_agent_session_id,
      input_set_digest: inputSetDigest,
      expected_output_types: ["identity.photo_set"],
      allowed_output_variants: [],
      gate_policy_id: stageDefinition.gate_policy_id,
    };
    const commitValidationReceipt =
      createStructuralValidationReceipt({
        workOrder,
        outputArtifacts: [artifact],
        workflowVersion: definition.version,
        createdAt: envelope.created_at,
      });
    assertValidationReceipt(commitValidationReceipt, {
      expectedArtifactSetDigest:
        commitValidationReceipt.subject.artifact_set_digest,
      expectedPolicyId: stageDefinition.gate_policy_id,
      validatorAgentSessionId:
        "orchestrator-structural-validator",
      producerAgentSessionIds: [
        source.producer_agent_session_id,
      ],
      availableEvidenceArtifactIds: [artifact.artifact_id],
    });
    const executionReceipt = {
      execution_id: `execution-revision-photo-${envelope.plan_digest}`,
      adapter_id:
        stageDefinition.runner_contract.adapter_id,
      adapter_version: "1.0.0",
      adapter_code_sha256:
        REVISION_PLAN_ADAPTER_CODE_SHA256,
    };
    const record = await artifactRecordStore.commit({
      project_id: state.project_id,
      work_order_id: workOrder.work_order_id,
      stage_id: workOrder.stage_id,
      input_set_digest: inputSetDigest,
      producer_agent_session_id:
        source.producer_agent_session_id,
      artifact,
      execution_receipt: executionReceipt,
      commit_validation_receipt:
        commitValidationReceipt,
    });
    const verified = await artifactRecordStore.verify({
      project_id: state.project_id,
      artifact_id: artifact.artifact_id,
      manifest_sha256: artifact.manifest_sha256,
      record_locator: record.record_locator,
      record_sha256: record.record_sha256,
    });
    if (
      revisionImpactDigest(verified.commit_validation_receipt) !==
      revisionImpactDigest(commitValidationReceipt)
    ) {
      throw new WorkflowEngineError(
        "PHOTO_REVISION_RECORD_MISMATCH",
        "photo revision record does not preserve its structural receipt",
      );
    }
    const graph = new ArtifactGraph(state.graph);
    graph.addArtifact(
      {
        ...artifact,
        record_locator: record.record_locator,
        record_sha256: record.record_sha256,
        member_manifest: structuredClone(record.member_manifest),
        produced_by_stage: "G0B_PHOTO",
        producer_agent_session_id:
          source.producer_agent_session_id,
        execution_receipt: executionReceipt,
        commit_validation_receipt:
          commitValidationReceipt,
      },
      [
        {
          from: oldArtifact.artifact_id,
          relation: "revision_of",
        },
      ],
    );
    state.graph = graph.snapshot();
    state.stages.G0B_PHOTO.latest_revision_artifact_id =
      artifact.artifact_id;
    state.stages.G0B_PHOTO.latest_revision_plan_digest =
      envelope.plan_digest;
    return {
      artifact_id: artifact.artifact_id,
      record,
      commit_validation_receipt: commitValidationReceipt,
    };
  }

  async function verifyArtifactRecords(state) {
    const receiptGroups = new Map();
    for (const artifact of state.graph?.artifacts ?? []) {
      const producer = definitions.get(artifact.produced_by_stage);
      if (producer?.user_gate === true) continue;
      if (!artifact.record_locator || !artifact.record_sha256) {
        if (state?._state_seal?.status === "legacy_unsealed") {
          continue;
        }
        throw new WorkflowEngineError(
          "ARTIFACT_RECORD_MISSING",
          "현재 artifact 계약보다 오래된 state이거나 record가 누락되었습니다. 검증 가능한 record locator/hash 없이 재개할 수 없습니다.",
          {
            artifact_id: artifact.artifact_id,
            recovery:
              "원본 evidence bundle에서 새 workflow run을 시작해 해당 stage를 다시 실행하세요. 과거 결과에 receipt를 사후 합성하지 마세요.",
          },
        );
      }
      if (!artifact.commit_validation_receipt?.validation_id) {
        if (state?._state_seal?.status === "legacy_unsealed") {
          continue;
        }
        throw new WorkflowEngineError(
          "COMMIT_VALIDATION_RECEIPT_MISSING",
          "non-user stage artifact에는 structural validation receipt가 필요합니다.",
          { artifact_id: artifact.artifact_id },
        );
      }
      if (!artifactRecordStore?.verify) {
        throw new WorkflowEngineError(
          "ARTIFACT_RECORD_STORE_REQUIRED",
          "artifact record 검증 store가 필요합니다.",
        );
      }
      const verified = await artifactRecordStore.verify({
        project_id: state.project_id,
        artifact_id: artifact.artifact_id,
        manifest_sha256: artifact.manifest_sha256,
        member_manifest: artifact.member_manifest,
        record_locator: artifact.record_locator,
        record_sha256: artifact.record_sha256,
      });
      if (
        !artifact.commit_validation_receipt ||
        JSON.stringify(artifact.commit_validation_receipt) !==
          JSON.stringify(verified.commit_validation_receipt)
      ) {
        throw new WorkflowEngineError(
          "COMMIT_VALIDATION_RECEIPT_MISMATCH",
          "graph와 artifact record의 structural validation receipt가 다릅니다.",
          { artifact_id: artifact.artifact_id },
        );
      }
      const validationId =
        artifact.commit_validation_receipt.validation_id;
      const group = receiptGroups.get(validationId) ?? [];
      group.push(artifact);
      receiptGroups.set(validationId, group);
    }
    for (const artifacts of receiptGroups.values()) {
      const receipt = artifacts[0].commit_validation_receipt;
      if (
        artifacts.some(
          (artifact) =>
            JSON.stringify(artifact.commit_validation_receipt) !==
            JSON.stringify(receipt),
        )
      ) {
        throw new WorkflowEngineError(
          "COMMIT_VALIDATION_RECEIPT_MISMATCH",
          "같은 structural validation ID의 receipt 내용이 다릅니다.",
        );
      }
      const stageId = artifacts[0].produced_by_stage;
      if (
        artifacts.some(
          (artifact) => artifact.produced_by_stage !== stageId,
        )
      ) {
        throw new WorkflowEngineError(
          "COMMIT_VALIDATION_RECEIPT_MISMATCH",
          "structural validation receipt는 단일 stage output만 묶을 수 있습니다.",
        );
      }
      assertValidationReceipt(receipt, {
        expectedArtifactSetDigest: artifactSetDigest(
          artifacts.map((artifact) => ({
            artifact_id: artifact.artifact_id,
            manifest_sha256: artifact.manifest_sha256,
            member_ids: artifact.member_ids ?? [],
            relation: "evidence_for",
          })),
        ),
        expectedPolicyId:
          stageId === REPAIR_LOOP_STAGE_ID
            ? rubricDefinition.policy.policy_id
            : definitions.get(stageId)?.gate_policy_id,
        validatorAgentSessionId:
          "orchestrator-structural-validator",
        producerAgentSessionIds: [
          ...new Set(
            artifacts.map(
              (artifact) => artifact.producer_agent_session_id,
            ),
          ),
        ],
        availableEvidenceArtifactIds: artifacts.map(
          (artifact) => artifact.artifact_id,
        ),
      });
    }
  }

  function nowDate() {
    const value = clock();
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new WorkflowEngineError(
        "INVALID_CLOCK_VALUE",
        "clock은 유효한 날짜를 반환해야 합니다.",
      );
    }
    return date;
  }

  function reclaimExpiredLeases(state, now) {
    let changed = false;
    for (const workOrder of Object.values(state.work_orders)) {
      if (
        workOrder.status !== "running" ||
        !workOrder.lease_expires_at ||
        Date.parse(workOrder.lease_expires_at) > now.getTime()
      ) {
        continue;
      }
      workOrder.status = "expired";
      workOrder.expired_at = now.toISOString();
      const stageEntry = state.stages[workOrder.stage_id];
      if (stageEntry?.status === "running") {
        const siblingStillRunning = Object.values(
          state.work_orders,
        ).some(
          (candidate) =>
            candidate.work_order_id !== workOrder.work_order_id &&
            candidate.stage_id === workOrder.stage_id &&
            candidate.status === "running",
        );
        stageEntry.status = siblingStillRunning
          ? "running"
          : "pending";
      }
      changed = true;
    }
    return changed;
  }

  async function loadOrCreate(projectRef) {
    assertProjectRef(projectRef);
    let state = await stateStore.load(projectRef.project_id);
    if (!state) {
      state = initialState(projectRef, definition);
      await stateStore.save(projectRef.project_id, state);
      state = await stateStore.load(projectRef.project_id);
      await verifyArtifactRecords(state);
      return state;
    }
    if (state.input_digest !== projectRef.input_digest) {
      throw new WorkflowEngineError(
        "STALE_PROJECT_INPUT",
        "프로젝트 입력 digest가 기존 실행과 다릅니다. 새 revision으로 시작해야 합니다.",
        {
          stored: state.input_digest,
          received: projectRef.input_digest,
        },
      );
    }
    let changed = false;
    for (const item of definition.stages) {
      if (!state.stages[item.stage_id]) {
        state.stages[item.stage_id] = {
          status: "pending",
          run_ids: [],
        };
        changed = true;
      }
    }
    if (state.workflow_version !== definition.version) {
      state.workflow_version = definition.version;
      changed = true;
    }
    if (!state.repair_loop) {
      state.repair_loop = {
        status: "IDLE",
        history: [],
        results: {},
        transitions: {},
      };
      changed = true;
    }
    if (!Array.isArray(state.events)) {
      state.events = [];
      changed = true;
    }
    if (!state.flags) {
      state.flags = {
        missing_photo_notice_emitted: false,
      };
      changed = true;
    }
    if (reclaimExpiredLeases(state, nowDate())) {
      changed = true;
    }
    if (changed) {
      await stateStore.save(state.project_id, state);
      state = await stateStore.load(state.project_id);
    }
    await verifyArtifactRecords(state);
    return state;
  }

  async function inspect(projectRef, options = {}) {
    const state = await loadOrCreate(projectRef);
    const notifications = emitMissingPhotoNotice(
      state,
      options,
      nowDate().toISOString(),
    );
    if (notifications.length > 0) {
      await stateStore.save(state.project_id, state);
    }
    return structuredClone({
      project_id: state.project_id,
      input_digest: state.input_digest,
      workflow_id: state.workflow_id,
      workflow_version: state.workflow_version,
      notifications,
      workflow_flags: state.flags,
      event_summary: {
        count: state.events.length,
        event_ids: state.events.map((event) => event.event_id),
      },
      stages: state.stages,
      ready_stages: readyStages(state, definition),
      artifact_count: state.graph.artifacts.length,
      stale_artifact_count: state.graph.artifacts.filter(
        (artifact) => artifact.status === "stale",
      ).length,
      state_integrity: stateIntegritySummary(state),
      artifact_summary: artifactSummary(state),
      publish_approval: publishApprovalSummary(state),
      repair_loop: {
        status: state.repair_loop.status,
        latest_result_id:
          state.repair_loop.latest_result_id ?? null,
        latest_transition_sha256:
          state.repair_loop.latest_transition_sha256 ?? null,
        attempts_used: state.repair_loop.history.length,
        stop_decision:
          state.repair_loop.stop_decision ?? null,
      },
      frontier_work_items: Object.values(state.work_orders)
        .filter((workOrder) => workOrder.work_item_id)
        .map((workOrder) => ({
          work_order_id: workOrder.work_order_id,
          work_item_id: workOrder.work_item_id,
          stage_id: workOrder.stage_id,
          member_id: workOrder.member_id,
          status: workOrder.status,
          producer_agent_session_id:
            workOrder.assigned_agent_session_id,
          exact_input_digest:
            workOrder.frontier_exact_input_digest,
          expected_artifact_id:
            workOrder.frontier_expected_artifact_id,
          output_locator: workOrder.frontier_output_locator,
          descendant_work_item_ids: structuredClone(
            workOrder.descendant_work_item_ids ?? [],
          ),
          failure_code: workOrder.failure_code ?? null,
          failure_kind: workOrder.failure_kind ?? null,
          retryable: workOrder.failure_retryable ?? null,
          failure_receipt_sha256:
            workOrder.failure_receipt_sha256 ?? null,
        })),
      artifacts: state.graph.artifacts.map((artifact) => ({
        artifact_id: artifact.artifact_id,
        type: artifact.type,
        status: artifact.status,
        manifest_sha256: artifact.manifest_sha256,
        record_locator: artifact.record_locator ?? null,
        record_sha256: artifact.record_sha256 ?? null,
        produced_by_stage: artifact.produced_by_stage,
        revision_of: artifact.revision_of ?? null,
        revision_envelope: artifact.revision_envelope ?? null,
        rights_provenance_receipt_sha256:
          artifact.rights_provenance?.receipt_sha256 ?? null,
        identity_provenance_receipt_sha256:
          artifact.identity_provenance?.receipt_sha256 ?? null,
        commit_validation_receipt_id:
          artifact.commit_validation_receipt?.validation_id ?? null,
        stale_member_ids: (artifact.stale_member_refs ?? []).map(
          (reference) => reference.member_id,
        ),
      })),
    });
  }

  async function recordRubricIteration(projectRef, payload) {
    assertNonEmptyString(
      projectRef?.agent_session_id,
      "project_ref.agent_session_id",
      "INVALID_RUBRIC_COORDINATOR",
    );
    assertNonEmptyString(
      payload?.evaluator_agent_session_id,
      "evaluator_agent_session_id",
      "INVALID_RUBRIC_EVALUATOR",
    );
    if (
      payload.evaluator_agent_session_id ===
      projectRef.agent_session_id
    ) {
      throw new WorkflowEngineError(
        "RUBRIC_EVALUATOR_NOT_SEPARATED",
        "rubric evaluator session은 coordinator session과 분리되어야 합니다.",
      );
    }
    const state = await loadOrCreate(projectRef);
    const currentResult = payload?.rubric_result;
    const previousResult = state.repair_loop.latest_result_id
      ? state.repair_loop.results[
          state.repair_loop.latest_result_id
        ]
      : null;
    const comparablePrevious =
      (previousResult?.subject?.lineage_id ??
        previousResult?.subject?.artifact_id) ===
      (currentResult?.subject?.lineage_id ??
        currentResult?.subject?.artifact_id)
        ? previousResult
        : null;
    const transition = createRepairLoopTransition({
      rubricDefinition,
      graphSnapshot: state.graph,
      currentResult,
      previousResult: comparablePrevious,
      priorAttempts: state.repair_loop.history,
      budget: payload?.budget ?? { state: "AVAILABLE" },
      scopeKind: payload?.scope_kind ?? "full_page",
    });
    const mutation = resolveRepairMutation({
      transition,
      graphSnapshot: state.graph,
      workflowDefinition: definition,
    });

    const graphArtifacts = new Map(
      state.graph.artifacts.map((artifact) => [
        artifact.artifact_id,
        artifact,
      ]),
    );
    const inputArtifactIds = [
      currentResult.subject.artifact_id,
      ...currentResult.checks.flatMap(
        (check) => check.evidence_artifact_ids,
      ),
    ].filter(
      (artifactId, index, values) =>
        values.indexOf(artifactId) === index,
    );
    const inputArtifacts = inputArtifactIds.map((artifactId) => {
      const artifact = graphArtifacts.get(artifactId);
      if (!artifact) {
        throw new WorkflowEngineError(
          "RUBRIC_INPUT_ARTIFACT_MISSING",
          "rubric transition 입력 artifact가 graph에 없습니다.",
          { artifact_id: artifactId },
        );
      }
      return artifact;
    });
    const inputSetDigest = artifactSetDigest(
      inputArtifacts.map((artifact) => ({
        artifact_id: artifact.artifact_id,
        manifest_sha256: artifact.manifest_sha256,
        member_ids: artifact.member_ids ?? [],
        relation: "evaluates",
      })),
    );
    const transitionArtifact = {
      artifact_id:
        `repair-transition-${transition.transition_sha256.slice(0, 20)}`,
      type: "qa.repair_transition",
      manifest_sha256: transition.transition_sha256,
      member_ids: ["repair-transition.json"],
    };
    const workOrder = {
      work_order_id:
        `repair-loop-${transition.transition_sha256}`,
      stage_id: REPAIR_LOOP_STAGE_ID,
      assigned_agent_session_id:
        payload.evaluator_agent_session_id,
      input_set_digest: inputSetDigest,
      expected_output_types: ["qa.repair_transition"],
      allowed_output_variants: [],
      gate_policy_id: rubricDefinition.policy.policy_id,
    };
    const createdAt = nowDate().toISOString();
    const commitValidationReceipt =
      createStructuralValidationReceipt({
        workOrder,
        outputArtifacts: [transitionArtifact],
        workflowVersion: definition.version,
        createdAt,
      });
    const executionReceipt = {
      execution_id:
        `execution-repair-${transition.transition_sha256}`,
      adapter_id: REPAIR_LOOP_ADAPTER_ID,
      adapter_version: "1.0.0",
      adapter_code_sha256:
        REPAIR_LOOP_ADAPTER_CODE_SHA256,
    };
    const record = await artifactRecordStore.commit({
      project_id: state.project_id,
      work_order_id: workOrder.work_order_id,
      stage_id: REPAIR_LOOP_STAGE_ID,
      input_set_digest: inputSetDigest,
      producer_agent_session_id:
        payload.evaluator_agent_session_id,
      artifact: transitionArtifact,
      execution_receipt: executionReceipt,
      commit_validation_receipt:
        commitValidationReceipt,
    });
    const verifiedRecord = await artifactRecordStore.verify({
      project_id: state.project_id,
      artifact_id: transitionArtifact.artifact_id,
      manifest_sha256: transitionArtifact.manifest_sha256,
      record_locator: record.record_locator,
      record_sha256: record.record_sha256,
    });
    if (
      JSON.stringify(verifiedRecord.commit_validation_receipt) !==
      JSON.stringify(commitValidationReceipt)
    ) {
      throw new WorkflowEngineError(
        "REPAIR_TRANSITION_RECORD_MISMATCH",
        "repair transition record가 exact structural receipt를 보존하지 않습니다.",
      );
    }

    const graph = new ArtifactGraph(state.graph);
    graph.addArtifact(
      {
        ...transitionArtifact,
        record_locator: record.record_locator,
        record_sha256: record.record_sha256,
        produced_by_stage: REPAIR_LOOP_STAGE_ID,
        producer_agent_session_id:
          payload.evaluator_agent_session_id,
        execution_receipt: executionReceipt,
        commit_validation_receipt:
          commitValidationReceipt,
      },
      inputArtifacts.map((artifact) => ({
        from: artifact.artifact_id,
        relation: "evaluates",
      })),
    );
    state.graph = graph.snapshot();

    if (transition.action === "REPAIR_REQUIRED") {
      const staleReason =
        `rubric-repair:${transition.transition_sha256}`;
      const staleIds = new Set([
        ...mutation.stale_artifact_ids,
        transitionArtifact.artifact_id,
      ]);
      for (const artifact of state.graph.artifacts) {
        if (!staleIds.has(artifact.artifact_id)) continue;
        artifact.status = "stale";
        artifact.stale_reason = staleReason;
      }
      const resetStageIds = new Set(mutation.reset_stage_ids);
      for (const stageId of resetStageIds) {
        const stageEntry = state.stages[stageId];
        if (!stageEntry) continue;
        stageEntry.status = "pending";
        stageEntry.repair_reset_by =
          transition.transition_sha256;
        delete stageEntry.skip_reason;
      }
      for (const workOrderEntry of Object.values(
        state.work_orders,
      )) {
        if (
          workOrderEntry.status === "running" &&
          resetStageIds.has(workOrderEntry.stage_id)
        ) {
          workOrderEntry.status = "superseded";
          workOrderEntry.superseded_at = createdAt;
          workOrderEntry.superseded_by_repair =
            transition.transition_sha256;
        }
      }
      const approvalGates = new Set(
        mutation.approval_gates_to_reopen,
      );
      for (const challenge of Object.values(state.challenges)) {
        if (!approvalGates.has(challenge.stage_id)) continue;
        challenge.invalidated_by_repair =
          transition.transition_sha256;
        challenge.invalidated_at = createdAt;
        if (challenge.status === "awaiting_user") {
          challenge.status = "superseded";
        }
      }
    }

    state.repair_loop.status = transition.action;
    state.repair_loop.history = structuredClone(
      transition.history,
    );
    state.repair_loop.results[currentResult.result_id] =
      structuredClone(currentResult);
    state.repair_loop.transitions[
      transition.transition_sha256
    ] = {
      transition: structuredClone(transition),
      mutation: structuredClone(mutation),
      artifact_id: transitionArtifact.artifact_id,
      artifact_record: structuredClone(record),
      evaluator_agent_session_id:
        payload.evaluator_agent_session_id,
      recorded_at: createdAt,
    };
    state.repair_loop.latest_result_id =
      currentResult.result_id;
    state.repair_loop.latest_transition_sha256 =
      transition.transition_sha256;
    state.repair_loop.stop_decision =
      structuredClone(transition.stop_decision);
    await stateStore.save(state.project_id, state);

    return structuredClone({
      kind:
        transition.action === "PUBLISH_READY"
          ? "RubricPublishReady"
          : transition.action === "REPAIR_REQUIRED"
            ? "RubricRepairScheduled"
            : "RubricAwaitUser",
      transition,
      mutation,
      artifact_record: record,
      commit_validation_receipt:
        commitValidationReceipt,
      ready_stages: readyStages(state, definition),
    });
  }

  async function planRevision(projectRef, changeRequest) {
    assertNonEmptyString(
      projectRef?.agent_session_id,
      "project_ref.agent_session_id",
      "INVALID_REVISION_PLANNER",
    );
    const state = await loadOrCreate(projectRef);
    const plan = calculateEngineRevisionPlan(
      state.graph,
      definition,
      changeRequest,
    );
    const existing = await readRevisionPlanEnvelope(
      projectRef,
      plan.digest,
      { allowMissing: true },
    );
    let envelope = existing;
    if (envelope) {
      validateRevisionPlanEnvelope(envelope, {
        projectRef,
        expectedPlanDigest: plan.digest,
        expectedChangeRequest: changeRequest,
      });
    } else {
      const artifact = revisionPlanArtifact(plan, changeRequest);
      const workOrder = {
        work_order_id: `revision-plan-${plan.digest}`,
        stage_id: REVISION_PLAN_STAGE_ID,
        assigned_agent_session_id: projectRef.agent_session_id,
        input_set_digest: plan.graph_snapshot_digest,
        expected_output_types: [REVISION_PLAN_ARTIFACT_TYPE],
        allowed_output_variants: [],
        gate_policy_id: REVISION_PLAN_POLICY_ID,
      };
      const createdAt = nowDate().toISOString();
      const commitValidationReceipt =
        createStructuralValidationReceipt({
          workOrder,
          outputArtifacts: [artifact],
          workflowVersion: definition.version,
          createdAt,
        });
      const executionReceipt = {
        execution_id: `execution-revision-plan-${plan.digest}`,
        adapter_id: REVISION_PLAN_ADAPTER_ID,
        adapter_version: "1.0.0",
        adapter_code_sha256:
          REVISION_PLAN_ADAPTER_CODE_SHA256,
      };
      const body = {
        schema_version: "1.0",
        project_id: state.project_id,
        input_digest: state.input_digest,
        work_order_id: workOrder.work_order_id,
        plan_digest: plan.digest,
        producer_agent_session_id:
          projectRef.agent_session_id,
        plan: structuredClone(plan),
        change_request: structuredClone(changeRequest),
        artifact,
        execution_receipt: executionReceipt,
        commit_validation_receipt:
          commitValidationReceipt,
        created_at: createdAt,
        state_mutation: false,
      };
      envelope = await persistRevisionPlanEnvelope({
        ...body,
        envelope_sha256: revisionImpactDigest(body),
      });
      validateRevisionPlanEnvelope(envelope, {
        projectRef,
        expectedPlanDigest: plan.digest,
        expectedChangeRequest: changeRequest,
      });
    }
    const artifactRecord =
      await commitAndVerifyRevisionPlanRecord(envelope);
    return structuredClone({
      kind: "RevisionPlanned",
      plan_digest: envelope.plan_digest,
      graph_snapshot_digest:
        envelope.plan.graph_snapshot_digest,
      state_mutation: false,
      plan: envelope.plan,
      artifact_record: artifactRecord,
      commit_validation_receipt:
        envelope.commit_validation_receipt,
    });
  }

  async function commitRevision(projectRef, decision) {
    assertSha256(decision?.planDigest, "plan_digest");
    assertNonEmptyString(decision?.decidedBy, "decided_by");
    assertNonEmptyString(decision?.reason, "reason");
    assertNonEmptyString(
      projectRef?.agent_session_id,
      "project_ref.agent_session_id",
      "INVALID_REVISION_APPROVER",
    );
    const state = await loadOrCreate(projectRef);
    const envelope = await readRevisionPlanEnvelope(
      projectRef,
      decision.planDigest,
    );
    await commitAndVerifyRevisionPlanRecord(envelope);
    if (state.revision_commits?.[decision.planDigest]) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_ALREADY_COMMITTED",
        "the revision plan has already been committed",
        { plan_digest: decision.planDigest },
      );
    }

    const currentGraphDigest = revisionImpactDigest(state.graph);
    if (
      currentGraphDigest !==
      envelope.plan.graph_snapshot_digest
    ) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_GRAPH_DRIFT",
        "the artifact graph changed after revision planning",
        {
          planned: envelope.plan.graph_snapshot_digest,
          current: currentGraphDigest,
        },
      );
    }
    if (
      revisionImpactDigest(definition) !==
      envelope.plan.workflow_definition_digest
    ) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_WORKFLOW_DRIFT",
        "the workflow definition changed after revision planning",
      );
    }
    const recalculated = calculateEngineRevisionPlan(
      state.graph,
      definition,
      envelope.change_request,
    );
    if (
      recalculated.digest !== envelope.plan_digest ||
      revisionImpactDigest(recalculated) !==
        revisionImpactDigest(envelope.plan)
    ) {
      throw new WorkflowEngineError(
        "REVISION_PLAN_RECALCULATION_MISMATCH",
        "the persisted plan is not the exact current impact calculation",
      );
    }

    const photoRevision = await commitPhotoRevisionArtifact(
      state,
      envelope,
    );
    const artifactsById = new Map(
      state.graph.artifacts.map((artifact) => [
        artifact.artifact_id,
        artifact,
      ]),
    );
    const staleReason =
      `revision-plan:${decision.planDigest}:${decision.reason.trim()}`;
    for (const artifactId of envelope.plan.stale_artifact_ids) {
      const artifact = artifactsById.get(artifactId);
      if (!artifact) {
        throw new WorkflowEngineError(
          "REVISION_PLAN_ARTIFACT_MISSING",
          "a planned stale artifact is absent from the current graph",
          { artifact_id: artifactId },
        );
      }
      artifact.status = "stale";
      artifact.stale_reason = staleReason;
      delete artifact.stale_member_refs;
    }
    for (const reference of envelope.plan.stale_member_refs) {
      const artifact = artifactsById.get(reference.artifact_id);
      if (!artifact) {
        throw new WorkflowEngineError(
          "REVISION_PLAN_ARTIFACT_MISSING",
          "a planned stale member artifact is absent from the graph",
          { artifact_id: reference.artifact_id },
        );
      }
      const members = artifact.members ?? artifact.member_records ?? [];
      const memberHashes =
        artifact.member_hashes ?? artifact.member_sha256_by_id ?? {};
      const member = members.find(
        (candidate) =>
          String(candidate.member_id) === reference.member_id,
      );
      const memberSha256 = String(
        member?.member_sha256 ??
          member?.sha256 ??
          member?.object_sha256 ??
          member?.manifest_sha256 ??
          memberHashes[reference.member_id] ??
          "",
      );
      if (memberSha256 !== reference.member_sha256) {
        throw new WorkflowEngineError(
          "REVISION_PLAN_MEMBER_MISMATCH",
          "a planned stale member no longer matches the graph",
          {
            artifact_id: reference.artifact_id,
            member_id: reference.member_id,
          },
        );
      }
      const existing = artifact.stale_member_refs ?? [];
      artifact.stale_member_refs = [
        ...existing.filter(
          (candidate) =>
            candidate.member_id !== reference.member_id,
        ),
        {
          ...structuredClone(reference),
          stale_reason: staleReason,
        },
      ].sort((left, right) =>
        left.member_id.localeCompare(right.member_id),
      );
      artifact.status = "partial_stale";
      artifact.stale_reason = staleReason;
    }

    const resetStageIds = new Set(envelope.plan.reset_stage_ids);
    for (const stageId of resetStageIds) {
      const stageEntry = state.stages[stageId];
      if (!stageEntry) {
        throw new WorkflowEngineError(
          "REVISION_PLAN_STAGE_MISSING",
          "a planned reset stage is absent from workflow state",
          { stage_id: stageId },
        );
      }
      stageEntry.status = "pending";
      stageEntry.revision_reset_by = decision.planDigest;
      delete stageEntry.skip_reason;
    }
    for (const workOrder of Object.values(state.work_orders)) {
      if (
        workOrder.status === "running" &&
        resetStageIds.has(workOrder.stage_id)
      ) {
        workOrder.status = "superseded";
        workOrder.superseded_at = nowDate().toISOString();
        workOrder.superseded_by_revision =
          decision.planDigest;
      }
    }
    const approvalGates = new Set(
      envelope.plan.approval_gates_to_reopen,
    );
    for (const challenge of Object.values(state.challenges)) {
      if (!approvalGates.has(challenge.stage_id)) continue;
      challenge.invalidated_by_revision =
        decision.planDigest;
      challenge.invalidated_at = nowDate().toISOString();
      if (challenge.status === "awaiting_user") {
        challenge.status = "superseded";
      }
    }

    const committedAt = nowDate().toISOString();
    state.revision_commits ??= {};
    state.revision_commits[decision.planDigest] = {
      plan_digest: decision.planDigest,
      graph_snapshot_digest:
        envelope.plan.graph_snapshot_digest,
      decided_by: decision.decidedBy.trim(),
      reason: decision.reason.trim(),
      approver_agent_session_id:
        projectRef.agent_session_id,
      committed_at: committedAt,
      stale_artifact_ids: [
        ...envelope.plan.stale_artifact_ids,
      ],
      stale_member_refs: structuredClone(
        envelope.plan.stale_member_refs,
      ),
      reset_stage_ids: [...envelope.plan.reset_stage_ids],
      approval_gates_reopened: [
        ...envelope.plan.approval_gates_to_reopen,
      ],
    };
    await stateStore.save(state.project_id, state);
    return structuredClone({
      kind: "RevisionCommitted",
      plan_digest: decision.planDigest,
      committed_at: committedAt,
      new_photo_artifact_id:
        photoRevision?.artifact_id ?? null,
      new_photo_artifact_record:
        photoRevision?.record ?? null,
      new_photo_commit_validation_receipt:
        photoRevision?.commit_validation_receipt ?? null,
      stale_artifact_ids:
        envelope.plan.stale_artifact_ids,
      stale_member_refs: envelope.plan.stale_member_refs,
      reset_stage_ids: envelope.plan.reset_stage_ids,
      approval_gates_reopened:
        envelope.plan.approval_gates_to_reopen,
    });
  }

  async function lease(projectRef, capabilities = {}) {
    const state = await loadOrCreate(projectRef);
    const allowed = new Set(capabilities.stage_ids ?? []);
    const ready = readyStages(state, definition).filter((stageId) => {
      const item = definitions.get(stageId);
      return (
        !item.user_gate &&
        (allowed.size === 0 || allowed.has(stageId))
      );
    });
    const stageId = ready[0];
    if (!stageId) return null;

    const inputs = stageInputs(state, definition, stageId);
    if (stageId === "G5_PUBLISH_QA") {
      await verifyPublishHeroAssurance(inputs, "lease");
    }
    const inputRefs = workOrderInputRefs(inputs);
    const inputSetDigest = artifactSetDigest(inputRefs);
    const leasedAt = nowDate();
    const stageDefinition = definitions.get(stageId);
    assertAggregateLeaseAllowed(stageId);
    if (
      semanticValidationRequired(stageId) &&
      inputs.some(
        (artifact) =>
          artifact.producer_agent_session_id ===
          projectRef.agent_session_id,
      )
    ) {
      throw new WorkflowEngineError(
        "PRODUCER_SELF_QA_FORBIDDEN",
        "생산자는 자신의 artifact QA lease를 받을 수 없습니다.",
        {
          stage_id: stageId,
          agent_session_id: projectRef.agent_session_id,
          subject_artifact_ids: inputs.map(
            (artifact) => artifact.artifact_id,
          ),
        },
      );
    }
    const workOrderId = `work-${randomUUID()}`;
    const workOrder = {
      work_order_id: workOrderId,
      project_id: state.project_id,
      stage_id: stageId,
      assigned_agent_session_id: projectRef.agent_session_id,
      input_artifacts: inputs.map((artifact) => ({
        artifact_id: artifact.artifact_id,
        type: artifact.type,
        manifest_sha256: artifact.manifest_sha256,
        member_ids: artifact.member_ids ?? [],
        producer_agent_session_id:
          artifact.producer_agent_session_id,
      })),
      input_set_digest: inputSetDigest,
      expected_output_types:
        stageDefinition.output_variants?.[0] ??
        stageDefinition.produces,
      allowed_output_variants:
        stageDefinition.output_variants ?? [],
      gate_policy_id: stageDefinition.gate_policy_id,
      validation_policy: stageDefinition.validation_policy,
      runner_contract: structuredClone(stageDefinition.runner_contract),
      fan_out_key: stageDefinition.fan_out_key,
      allowed_staging_root:
        `.detail-page/workflow/staging/${state.project_id}/${workOrderId}`,
      attempt: leaseAttempt(state, stageId, inputSetDigest),
      fencing_token: `fence-${randomUUID()}`,
      status: "running",
      leased_at: leasedAt.toISOString(),
      lease_expires_at: new Date(
        leasedAt.getTime() + leaseDurationMs,
      ).toISOString(),
    };
    state.work_orders[workOrder.work_order_id] = workOrder;
    state.stages[stageId].status = "running";
    state.stages[stageId].run_ids.push(workOrder.work_order_id);
    await stateStore.save(state.project_id, state);
    return structuredClone(workOrder);
  }

  async function leaseFrontier(projectRef, capabilities = {}) {
    const workerCapacity = Number(capabilities.worker_capacity);
    if (!Number.isInteger(workerCapacity) || workerCapacity < 1) {
      throw new WorkflowEngineError(
        "INVALID_WORKER_CAPACITY",
        "worker_capacity는 1 이상의 정수여야 합니다.",
      );
    }
    const sessionIds = [
      ...new Set(
        (capabilities.agent_session_ids ?? [])
          .map(String)
          .filter((value) => value.trim() !== ""),
      ),
    ];
    if (sessionIds.length < workerCapacity) {
      throw new WorkflowEngineError(
        "WORKER_SESSION_CAPACITY_INSUFFICIENT",
        "worker capacity를 채울 서로 다른 agent session이 부족합니다.",
        {
          worker_capacity: workerCapacity,
          available_sessions: sessionIds.length,
        },
      );
    }

    const state = await loadOrCreate(projectRef);
    const activeSessionIds = new Set(
      Object.values(state.work_orders)
        .filter((workOrder) => workOrder.status === "running")
        .map((workOrder) => workOrder.assigned_agent_session_id),
    );
    const activeWorkerCount = activeSessionIds.size;
    const remainingCapacity = Math.max(
      0,
      workerCapacity - activeWorkerCount,
    );
    const availableSessionIds = sessionIds.filter(
      (sessionId) => !activeSessionIds.has(sessionId),
    );
    const plannedWorkItems = capabilities.planned_work_items ?? [];
    if (Array.isArray(capabilities.planned_work_items)) {
      const allowedStages = new Set(capabilities.stage_ids ?? []);
      const seenWorkItemIds = new Set();
      const existingWorkItemIds = new Set(
        Object.values(state.work_orders)
          .filter((workOrder) =>
            ["running", "completed"].includes(workOrder.status),
          )
          .map((workOrder) => workOrder.work_item_id)
          .filter(Boolean),
      );
      const issuedAt = nowDate();
      const workOrders = [];
      for (const item of plannedWorkItems) {
        if (workOrders.length >= remainingCapacity) break;
        const stageDefinition = definitions.get(item?.stage_id);
        const stageEntry = state.stages[item?.stage_id];
        if (
          !stageDefinition ||
          stageDefinition.user_gate ||
          !stageDefinition.fan_out_key ||
          (allowedStages.size > 0 &&
            !allowedStages.has(item.stage_id))
        ) {
          throw new WorkflowEngineError(
            "INVALID_PLANNED_FRONTIER_STAGE",
            "계획된 frontier 항목은 fan-out 제작 단계여야 합니다.",
            { stage_id: item?.stage_id ?? null },
          );
        }
        if (
          stageEntry.status !== "pending" &&
          !(
            stageEntry.status === "running" &&
            stageEntry.parallel_frontier === true
          )
        ) {
          throw new WorkflowEngineError(
            "PLANNED_FRONTIER_STAGE_NOT_READY",
            "계획된 frontier 단계가 준비 또는 실행 중 상태가 아닙니다.",
            { stage_id: item.stage_id, status: stageEntry.status },
          );
        }
        if (
          typeof item.work_item_id !== "string" ||
          !item.work_item_id.startsWith(`${item.stage_id}:`) ||
          seenWorkItemIds.has(item.work_item_id)
        ) {
          throw new WorkflowEngineError(
            "INVALID_PLANNED_WORK_ITEM",
            "계획된 frontier work_item_id는 고유해야 하며 단계 namespace를 사용해야 합니다.",
            { work_item_id: item?.work_item_id ?? null },
          );
        }
        seenWorkItemIds.add(item.work_item_id);
        if (existingWorkItemIds.has(item.work_item_id)) continue;
        assertSha256(
          item.exact_input_digest,
          "planned_work_item.exact_input_digest",
        );
        if (
          !availableSessionIds.includes(
            item.producer_agent_session_id,
          )
        ) {
          throw new WorkflowEngineError(
            "PLANNED_WORKER_SESSION_UNAVAILABLE",
            "계획자가 선택한 worker session은 현재 임대 용량에서 사용할 수 없습니다.",
            {
              work_item_id: item.work_item_id,
              agent_session_id:
                item.producer_agent_session_id ?? null,
            },
          );
        }
        if (
          typeof item.output_locator !== "string" ||
          !item.output_locator.startsWith(
            ".detail-page/workflow/staging/",
          ) ||
          item.output_locator.includes("..")
        ) {
          throw new WorkflowEngineError(
            "INVALID_PLANNED_OUTPUT_LOCATOR",
            "계획된 frontier 출력 위치는 격리된 staging root여야 합니다.",
            { output_locator: item?.output_locator ?? null },
          );
        }
        if (
          !Number.isInteger(item.time_budget_ms) ||
          item.time_budget_ms < 60 * 1000 ||
          item.heartbeat_policy?.required !== true ||
          !Number.isInteger(item.heartbeat_policy?.interval_ms) ||
          item.heartbeat_policy.interval_ms < 10 * 1000 ||
          item.heartbeat_policy.interval_ms >
            Math.floor(item.time_budget_ms / 2)
        ) {
          throw new WorkflowEngineError(
            "FRONTIER_TIME_BUDGET_REQUIRED",
            "각 G2/G3 item은 양수 time budget과 주기적 heartbeat 정책을 가져야 합니다.",
            { work_item_id: item?.work_item_id ?? null },
          );
        }
        const sessionIndex = availableSessionIds.indexOf(
          item.producer_agent_session_id,
        );
        availableSessionIds.splice(sessionIndex, 1);
        const inputs = stageInputs(
          state,
          definition,
          item.stage_id,
        );
        const upstreamArtifactSetDigest = artifactSetDigest(
          workOrderInputRefs(inputs),
        );
        const workOrderId = `work-${randomUUID()}`;
        const workOrder = {
          work_order_id: workOrderId,
          work_item_id: item.work_item_id,
          member_id: item.member_id,
          parallel_lane: item.parallel_lane,
          project_id: state.project_id,
          stage_id: item.stage_id,
          assigned_agent_session_id:
            item.producer_agent_session_id,
          input_artifacts: inputs.map((artifact) => ({
            artifact_id: artifact.artifact_id,
            type: artifact.type,
            manifest_sha256: artifact.manifest_sha256,
            member_ids: artifact.member_ids ?? [],
            producer_agent_session_id:
              artifact.producer_agent_session_id,
          })),
          input_set_digest: item.exact_input_digest,
          upstream_artifact_set_digest: upstreamArtifactSetDigest,
          frontier_exact_input_digest: item.exact_input_digest,
          frontier_expected_artifact_id:
            item.expected_artifact_id,
          frontier_expected_output_type:
            item.expected_output_type,
          frontier_output_locator: item.output_locator,
          descendant_work_item_ids: structuredClone(
            item.descendant_work_item_ids ?? [],
          ),
          requires_execution_receipt:
            item.requires_execution_receipt === true,
          requires_independent_validation_receipt:
            item.requires_independent_validation_receipt === true,
          validation_session_constraint: structuredClone(
            item.validation_session_constraint ?? null,
          ),
          expected_output_types:
            stageDefinition.output_variants?.[0] ??
            stageDefinition.produces,
          allowed_output_variants:
            stageDefinition.output_variants ?? [],
          gate_policy_id: stageDefinition.gate_policy_id,
          validation_policy: stageDefinition.validation_policy,
          runner_contract: structuredClone(
            stageDefinition.runner_contract,
          ),
          fan_out_key: stageDefinition.fan_out_key,
          allowed_staging_root: item.output_locator,
          attempt: leaseAttempt(
            state,
            item.stage_id,
            item.exact_input_digest,
          ),
          fencing_token: `fence-${randomUUID()}`,
          status: "running",
          leased_at: issuedAt.toISOString(),
          time_budget_ms: item.time_budget_ms,
          deadline_at: new Date(
            issuedAt.getTime() + item.time_budget_ms,
          ).toISOString(),
          heartbeat_policy: structuredClone(
            item.heartbeat_policy,
          ),
          lease_expires_at: new Date(
            Math.min(
              issuedAt.getTime() + leaseDurationMs,
              issuedAt.getTime() + item.time_budget_ms,
            ),
          ).toISOString(),
        };
        state.work_orders[workOrderId] = workOrder;
        stageEntry.status = "running";
        stageEntry.parallel_frontier = true;
        stageEntry.run_ids.push(workOrderId);
        workOrders.push(workOrder);
      }
      await stateStore.save(state.project_id, state);
      return {
        kind:
          workOrders.length > 0
            ? "FrontierLeased"
            : "NoWorkAvailable",
        worker_capacity: workerCapacity,
        active_worker_count: activeWorkerCount,
        issued_count: workOrders.length,
        capacity_filled:
          activeWorkerCount + workOrders.length >= workerCapacity,
        work_orders: structuredClone(workOrders),
      };
    }
    const workOrders = [];
    for (const agentSessionId of availableSessionIds) {
      if (workOrders.length >= remainingCapacity) break;
      let workOrder;
      try {
        workOrder = await lease(
          {
            ...projectRef,
            agent_session_id: agentSessionId,
          },
          { stage_ids: capabilities.stage_ids ?? [] },
        );
      } catch (error) {
        if (error?.code === "PRODUCER_SELF_QA_FORBIDDEN") {
          continue;
        }
        throw error;
      }
      if (!workOrder) break;
      workOrders.push(workOrder);
    }
    return {
      kind: workOrders.length > 0 ? "FrontierLeased" : "NoWorkAvailable",
      worker_capacity: workerCapacity,
      active_worker_count: activeWorkerCount,
      issued_count: workOrders.length,
      capacity_filled:
        activeWorkerCount + workOrders.length >= workerCapacity,
      work_orders: workOrders,
    };
  }

  async function completeParallelFrontier(projectRef, completion) {
    const state = await loadOrCreate(projectRef);
    const stageId = String(completion?.stage_id ?? "");
    const expectedWorkItemIds = [
      ...new Set(
        (completion?.expected_work_item_ids ?? []).map(String),
      ),
    ];
    const stageEntry = state.stages[stageId];
    if (
      !stageEntry ||
      stageEntry.parallel_frontier !== true ||
      expectedWorkItemIds.length === 0
    ) {
      throw new WorkflowEngineError(
        "INVALID_FRONTIER_COMPLETION",
        "병렬 frontier 완료에는 단계와 예상 작업 항목 목록이 필요합니다.",
        { stage_id: stageId },
      );
    }
    const completed = new Set(
      Object.values(state.work_orders)
        .filter(
          (workOrder) =>
            workOrder.stage_id === stageId &&
            workOrder.status === "completed",
        )
        .map((workOrder) => workOrder.work_item_id),
    );
    const missingWorkItemIds = expectedWorkItemIds.filter(
      (workItemId) => !completed.has(workItemId),
    );
    if (missingWorkItemIds.length > 0) {
      throw new WorkflowEngineError(
        "FRONTIER_MEMBERS_INCOMPLETE",
        "병렬 frontier의 모든 예상 멤버가 커밋되어야 합니다.",
        { stage_id: stageId, missing_work_item_ids: missingWorkItemIds },
      );
    }
    const stillRunning = Object.values(state.work_orders).some(
      (workOrder) =>
        workOrder.stage_id === stageId &&
        workOrder.status === "running",
    );
    if (stillRunning) {
      throw new WorkflowEngineError(
        "FRONTIER_MEMBERS_STILL_RUNNING",
        "실행 중인 병렬 frontier 임대가 있어 단계를 완료할 수 없습니다.",
        { stage_id: stageId },
      );
    }
    stageEntry.status = "completed";
    stageEntry.parallel_frontier_completed_at =
      nowDate().toISOString();
    stageEntry.completed_work_item_ids =
      expectedWorkItemIds.sort();
    await stateStore.save(state.project_id, state);
    return {
      kind: "ParallelFrontierCommitted",
      stage_id: stageId,
      completed_work_item_ids:
        stageEntry.completed_work_item_ids,
      ready_stages: readyStages(state, definition),
    };
  }

  async function heartbeat(workOrderId, heartbeatProof) {
    const state = await loadOrCreate(heartbeatProof?.project_ref);
    const workOrder = state.work_orders[workOrderId];
    if (!workOrder) {
      throw new WorkflowEngineError(
        "WORK_ORDER_NOT_FOUND",
        "heartbeat 대상 WorkOrder를 찾을 수 없습니다.",
      );
    }
    if (workOrder.status === "expired") {
      throw new WorkflowEngineError(
        "WORK_ORDER_LEASE_EXPIRED",
        "만료되어 reclaim된 WorkOrder lease는 연장할 수 없습니다.",
      );
    }
    if (workOrder.status !== "running") {
      throw new WorkflowEngineError(
        "WORK_ORDER_NOT_RUNNING",
        "실행 중인 WorkOrder lease만 연장할 수 있습니다.",
      );
    }
    if (
      heartbeatProof.project_ref.agent_session_id !==
      workOrder.assigned_agent_session_id
    ) {
      throw new WorkflowEngineError(
        "SESSION_MISMATCH",
        "lease를 받은 agent session만 heartbeat할 수 있습니다.",
      );
    }
    if (heartbeatProof.fencing_token !== workOrder.fencing_token) {
      throw new WorkflowEngineError(
        "FENCING_TOKEN_MISMATCH",
        "heartbeat fencing token이 현재 lease와 다릅니다.",
      );
    }
    if (heartbeatProof.attempt !== workOrder.attempt) {
      throw new WorkflowEngineError(
        "LEASE_ATTEMPT_MISMATCH",
        "heartbeat attempt가 현재 lease와 다릅니다.",
      );
    }

    const heartbeatAt = nowDate();
    const deadlineAt = Date.parse(workOrder.deadline_at ?? "");
    if (
      Number.isFinite(deadlineAt) &&
      heartbeatAt.getTime() >= deadlineAt
    ) {
      throw new WorkflowEngineError(
        "WORK_ITEM_TIME_BUDGET_EXCEEDED",
        "WorkOrder의 단계별 time budget을 넘겨 lease를 연장할 수 없습니다.",
        {
          work_order_id: workOrderId,
          deadline_at: workOrder.deadline_at,
        },
      );
    }
    workOrder.heartbeat_at = heartbeatAt.toISOString();
    workOrder.heartbeat_count =
      Number(workOrder.heartbeat_count ?? 0) + 1;
    workOrder.lease_expires_at = new Date(
      Number.isFinite(deadlineAt)
        ? Math.min(
            heartbeatAt.getTime() + leaseDurationMs,
            deadlineAt,
          )
        : heartbeatAt.getTime() + leaseDurationMs,
    ).toISOString();
    await stateStore.save(state.project_id, state);
    return structuredClone({
      work_order_id: workOrder.work_order_id,
      stage_id: workOrder.stage_id,
      attempt: workOrder.attempt,
      fencing_token: workOrder.fencing_token,
      heartbeat_at: workOrder.heartbeat_at,
      heartbeat_count: workOrder.heartbeat_count,
      deadline_at: workOrder.deadline_at ?? null,
      lease_expires_at: workOrder.lease_expires_at,
    });
  }

  async function failFrontierWorkItemOnce(
    workOrderId,
    failureEnvelope,
  ) {
    const state = await loadOrCreate(
      failureEnvelope?.project_ref,
    );
    const workOrder = state.work_orders[workOrderId];
    if (!workOrder?.work_item_id) {
      throw new WorkflowEngineError(
        "FRONTIER_WORK_ORDER_NOT_FOUND",
        "실패 처리할 frontier WorkOrder를 찾을 수 없습니다.",
      );
    }
    if (workOrder.status !== "running") {
      throw new WorkflowEngineError(
        "WORK_ORDER_NOT_RUNNING",
        "실행 중인 frontier WorkOrder만 실패 처리할 수 있습니다.",
      );
    }
    if (
      failureEnvelope?.producer_agent_session_id !==
        workOrder.assigned_agent_session_id ||
      failureEnvelope?.project_ref?.agent_session_id !==
        workOrder.assigned_agent_session_id
    ) {
      throw new WorkflowEngineError(
        "SESSION_MISMATCH",
        "lease를 받은 agent session만 실패 영수증을 제출할 수 있습니다.",
      );
    }
    if (
      failureEnvelope?.fencing_token !==
      workOrder.fencing_token
    ) {
      throw new WorkflowEngineError(
        "FENCING_TOKEN_MISMATCH",
        "FailureEnvelope fencing token이 현재 lease와 다릅니다.",
      );
    }
    if (failureEnvelope?.attempt !== workOrder.attempt) {
      throw new WorkflowEngineError(
        "LEASE_ATTEMPT_MISMATCH",
        "FailureEnvelope attempt가 현재 lease와 다릅니다.",
      );
    }
    if (
      failureEnvelope?.input_set_digest !==
      workOrder.input_set_digest
    ) {
      throw new WorkflowEngineError(
        "INPUT_SET_DIGEST_MISMATCH",
        "FailureEnvelope가 WorkOrder의 exact input set과 다릅니다.",
      );
    }

    const receipt = failureEnvelope?.failure_receipt;
    const exactFields = {
      receipt_type: "frontier.failure.v1",
      work_order_id: workOrder.work_order_id,
      work_item_id: workOrder.work_item_id,
      failed_member_id: workOrder.member_id,
      stage_id: workOrder.stage_id,
      input_set_digest: workOrder.input_set_digest,
      producer_agent_session_id:
        workOrder.assigned_agent_session_id,
      fencing_token: workOrder.fencing_token,
      attempt: workOrder.attempt,
    };
    const mismatchedField = Object.entries(exactFields).find(
      ([field, expected]) => receipt?.[field] !== expected,
    );
    if (mismatchedField) {
      throw new WorkflowEngineError(
        "FAILURE_RECEIPT_SUBJECT_MISMATCH",
        "failure receipt가 현재 lease와 exact member/input에 고정되지 않았습니다.",
        {
          field: mismatchedField[0],
          expected: mismatchedField[1],
          actual: receipt?.[mismatchedField[0]] ?? null,
        },
      );
    }
    if (
      !/^failure-[A-Za-z0-9._-]+$/.test(
        String(receipt?.failure_id ?? ""),
      ) ||
      !["execution_failed", "validation_failed"].includes(
        receipt?.failure_kind,
      ) ||
      !/^[A-Z][A-Z0-9_]{2,79}$/.test(
        String(receipt?.failure_code ?? ""),
      ) ||
      typeof receipt?.retryable !== "boolean" ||
      !Number.isFinite(Date.parse(receipt?.occurred_at))
    ) {
      throw new WorkflowEngineError(
        "INVALID_FAILURE_RECEIPT",
        "typed failure receipt의 ID·kind·code·retryable·시각이 유효하지 않습니다.",
      );
    }
    const expectedEvidenceKind =
      receipt.failure_kind === "validation_failed"
        ? "validation_receipt"
        : "execution_log";
    if (
      receipt?.evidence?.kind !== expectedEvidenceKind ||
      !/^[a-f0-9]{64}$/.test(
        String(receipt?.evidence?.sha256 ?? ""),
      )
    ) {
      throw new WorkflowEngineError(
        "FAILURE_EVIDENCE_REQUIRED",
        "failure kind에 맞는 검증 가능한 evidence SHA-256이 필요합니다.",
      );
    }

    const failureReceipt = structuredClone(receipt);
    const failureReceiptSha256 = sha256(
      JSON.stringify(failureReceipt),
    );
    workOrder.status = "failed";
    workOrder.failed_at = receipt.occurred_at;
    workOrder.failure_code = receipt.failure_code;
    workOrder.failure_kind = receipt.failure_kind;
    workOrder.failure_retryable = receipt.retryable;
    workOrder.failure_receipt = failureReceipt;
    workOrder.failure_receipt_sha256 =
      failureReceiptSha256;
    const stageEntry = state.stages[workOrder.stage_id];
    const siblingStillRunning = Object.values(
      state.work_orders,
    ).some(
      (candidate) =>
        candidate.work_order_id !== workOrder.work_order_id &&
        candidate.stage_id === workOrder.stage_id &&
        candidate.status === "running",
    );
    stageEntry.status = siblingStillRunning
      ? "running"
      : "pending";
    stageEntry.parallel_frontier = true;
    await stateStore.save(state.project_id, state);
    return structuredClone({
      kind: "FrontierMemberFailed",
      work_order_id: workOrder.work_order_id,
      work_item_id: workOrder.work_item_id,
      failed_member_id: workOrder.member_id,
      stage_id: workOrder.stage_id,
      retryable: workOrder.failure_retryable,
      failure_code: workOrder.failure_code,
      failure_receipt_sha256: failureReceiptSha256,
    });
  }

  async function failFrontierWorkItem(
    workOrderId,
    failureEnvelope,
  ) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await failFrontierWorkItemOnce(
          workOrderId,
          failureEnvelope,
        );
      } catch (error) {
        if (
          error?.code !== "STATE_CAS_MISMATCH" ||
          attempt === 4
        ) {
          throw error;
        }
      }
    }
    throw new WorkflowEngineError(
      "STATE_CAS_RETRY_EXHAUSTED",
      "동시 failure state 갱신 재시도 한도를 초과했습니다.",
    );
  }

  async function submitOnce(
    workOrderId,
    resultEnvelope,
    commitCreatedAt,
  ) {
    const projectRef = resultEnvelope?.project_ref;
    const state = await loadOrCreate(projectRef);
    const workOrder = state.work_orders[workOrderId];
    if (!workOrder) {
      throw new WorkflowEngineError(
        "WORK_ORDER_NOT_FOUND",
        "WorkOrder를 찾을 수 없습니다.",
      );
    }
    if (workOrder.status === "expired") {
      throw new WorkflowEngineError(
        "WORK_ORDER_LEASE_EXPIRED",
        "만료되어 reclaim된 WorkOrder 결과는 제출할 수 없습니다.",
      );
    }
    if (workOrder.status !== "running") {
      throw new WorkflowEngineError(
        "WORK_ORDER_NOT_RUNNING",
        "실행 중인 WorkOrder만 제출할 수 있습니다.",
      );
    }
    if (
      resultEnvelope.producer_agent_session_id !==
      workOrder.assigned_agent_session_id
    ) {
      throw new WorkflowEngineError(
        "SESSION_MISMATCH",
        "lease를 받은 agent session만 결과를 제출할 수 있습니다.",
      );
    }
    if (resultEnvelope.fencing_token !== workOrder.fencing_token) {
      throw new WorkflowEngineError(
        "FENCING_TOKEN_MISMATCH",
        "ResultEnvelope fencing token이 현재 lease와 다릅니다.",
      );
    }
    if (resultEnvelope.attempt !== workOrder.attempt) {
      throw new WorkflowEngineError(
        "LEASE_ATTEMPT_MISMATCH",
        "ResultEnvelope attempt가 현재 lease와 다릅니다.",
      );
    }
    const submittedAtMs = nowDate().getTime();
    const deadlineAtMs = Date.parse(workOrder.deadline_at ?? "");
    if (
      Number.isFinite(deadlineAtMs) &&
      submittedAtMs > deadlineAtMs
    ) {
      throw new WorkflowEngineError(
        "WORK_ITEM_TIME_BUDGET_EXCEEDED",
        "단계별 time budget을 넘긴 결과는 현재 frontier에 제출할 수 없습니다.",
      );
    }
    const heartbeatIntervalMs =
      workOrder.heartbeat_policy?.interval_ms;
    const leasedAtMs = Date.parse(workOrder.leased_at ?? "");
    if (
      workOrder.heartbeat_policy?.required === true &&
      Number.isFinite(heartbeatIntervalMs) &&
      Number.isFinite(leasedAtMs) &&
      submittedAtMs - leasedAtMs >
        heartbeatIntervalMs * 2 &&
      !Number.isFinite(Date.parse(workOrder.heartbeat_at ?? ""))
    ) {
      throw new WorkflowEngineError(
        "WORK_ITEM_HEARTBEAT_REQUIRED",
        "장기 G2/G3 item은 heartbeat 없이 완료 처리할 수 없습니다.",
      );
    }
    if (resultEnvelope.input_set_digest !== workOrder.input_set_digest) {
      throw new WorkflowEngineError(
        "INPUT_SET_DIGEST_MISMATCH",
        "WorkOrder와 ResultEnvelope의 input set digest가 다릅니다.",
      );
    }
    validateExecutionReceipt(
      resultEnvelope.execution_receipt,
      workOrder.runner_contract.adapter_id,
    );
    if (workOrder.stage_id === "G5_PUBLISH_QA") {
      const currentInputs = workOrder.input_artifacts.map(
        (input) =>
          state.graph.artifacts.find(
            (artifact) =>
              artifact.artifact_id === input.artifact_id &&
              artifact.manifest_sha256 ===
                input.manifest_sha256,
          ),
      );
      if (currentInputs.some((artifact) => !artifact)) {
        throw new WorkflowEngineError(
          "G5_INPUT_ARTIFACT_DRIFT",
          "G5 lease 이후 input artifact가 바뀌었습니다.",
        );
      }
      await verifyPublishHeroAssurance(
        currentInputs,
        "submit",
      );
    }

    const outputArtifacts = resultEnvelope.output_artifacts ?? [];
    if (
      workOrder.work_item_id &&
      !outputArtifacts.some(
        (artifact) =>
          artifact.artifact_id ===
          workOrder.frontier_expected_artifact_id,
      )
    ) {
      throw new WorkflowEngineError(
        "FRONTIER_ARTIFACT_ID_MISMATCH",
        "병렬 frontier 결과에는 계획자가 고정한 예상 산출물 ID가 포함되어야 합니다.",
        {
          expected_artifact_id:
            workOrder.frontier_expected_artifact_id,
          actual_artifact_ids: outputArtifacts.map(
            (artifact) => artifact.artifact_id,
          ),
        },
      );
    }
    const actualTypes = sorted(
      outputArtifacts.map((artifact) => artifact.type),
    );
    const allowedTypeSets =
      workOrder.allowed_output_variants?.length > 0
        ? workOrder.allowed_output_variants.map(sorted)
        : [sorted(workOrder.expected_output_types)];
    const exactOutputMatches = allowedTypeSets.some(
      (expectedTypes) =>
        actualTypes.length === expectedTypes.length &&
        actualTypes.every(
          (type, index) => type === expectedTypes[index],
        ),
    );
    const stageDefinition = definitions.get(workOrder.stage_id);
    const repeatedFanOutMatches =
      Boolean(stageDefinition?.fan_out_key) &&
      allowedTypeSets.some((expectedTypes) => {
        if (
          expectedTypes.length === 0 ||
          actualTypes.length < expectedTypes.length ||
          actualTypes.length % expectedTypes.length !== 0
        ) {
          return false;
        }
        const repetitionCount =
          actualTypes.length / expectedTypes.length;
        const repeatedExpected = sorted(
          Array.from(
            { length: repetitionCount },
            () => expectedTypes,
          ).flat(),
        );
        return actualTypes.every(
          (type, index) => type === repeatedExpected[index],
        );
      });
    const outputMatches =
      exactOutputMatches || repeatedFanOutMatches;
    if (!outputMatches) {
      throw new WorkflowEngineError(
        "OUTPUT_TYPE_MISMATCH",
        "stage가 선언한 output type 집합과 제출 결과가 다릅니다.",
        { expected: allowedTypeSets, actual: actualTypes },
      );
    }
    if (semanticValidationRequired(workOrder.stage_id)) {
      assertValidationReceipt(resultEnvelope.validation_receipt, {
        expectedArtifactSetDigest: workOrder.input_set_digest,
        expectedPolicyId: workOrder.gate_policy_id,
        validatorAgentSessionId:
          workOrder.assigned_agent_session_id,
        producerAgentSessionIds: [
          ...new Set(
            workOrder.input_artifacts.map(
              (artifact) => artifact.producer_agent_session_id,
            ),
          ),
        ],
        availableEvidenceArtifactIds: [
          ...workOrder.input_artifacts.map(
            (artifact) => artifact.artifact_id,
          ),
          ...outputArtifacts.map((artifact) => artifact.artifact_id),
        ],
      });
      assertStageValidationPolicy(
        resultEnvelope.validation_receipt,
        definitions.get(workOrder.stage_id).validation_policy,
      );
    }

    const commitValidationReceipt =
      createStructuralValidationReceipt({
        workOrder,
        outputArtifacts,
        workflowVersion: definition.version,
        createdAt: commitCreatedAt,
      });
    assertValidationReceipt(commitValidationReceipt, {
      expectedArtifactSetDigest:
        commitValidationReceipt.subject.artifact_set_digest,
      expectedPolicyId: workOrder.gate_policy_id,
      validatorAgentSessionId:
        "orchestrator-structural-validator",
      producerAgentSessionIds: [
        workOrder.assigned_agent_session_id,
      ],
      availableEvidenceArtifactIds: outputArtifacts.map(
        (artifact) => artifact.artifact_id,
      ),
    });

    const graph = new ArtifactGraph(state.graph);
    for (const artifact of outputArtifacts) {
      assertSha256(artifact.manifest_sha256, "artifact.manifest_sha256");
      const record = artifactRecordStore
        ? await artifactRecordStore.commit({
            project_id: state.project_id,
            work_order_id: workOrder.work_order_id,
            stage_id: workOrder.stage_id,
            input_set_digest: workOrder.input_set_digest,
            producer_agent_session_id:
              workOrder.assigned_agent_session_id,
            artifact,
            execution_receipt: resultEnvelope.execution_receipt,
            commit_validation_receipt:
              commitValidationReceipt,
          })
        : null;
      graph.addArtifact(
        {
          ...artifact,
          ...(record
            ? {
                record_locator: record.record_locator,
                record_sha256: record.record_sha256,
                member_manifest: structuredClone(
                  record.member_manifest,
                ),
              }
            : {}),
          produced_by_stage: workOrder.stage_id,
          producer_agent_session_id:
            workOrder.assigned_agent_session_id,
          execution_receipt: structuredClone(
            resultEnvelope.execution_receipt,
          ),
          commit_validation_receipt: structuredClone(
            commitValidationReceipt,
          ),
        },
        workOrder.input_artifacts.map((input) => ({
          from: input.artifact_id,
          relation:
            resultEnvelope.input_relations?.[input.artifact_id] ??
            "evidence_for",
        })),
      );
    }
    state.graph = graph.snapshot();
    workOrder.status = "completed";
    workOrder.completed_at = commitCreatedAt;
    if (workOrder.work_item_id) {
      for (const previousAttempt of Object.values(
        state.work_orders,
      )) {
        if (
          previousAttempt.work_order_id ===
            workOrder.work_order_id ||
          previousAttempt.work_item_id !==
            workOrder.work_item_id ||
          previousAttempt.status !== "failed"
        ) {
          continue;
        }
        previousAttempt.status = "resolved";
        previousAttempt.resolved_at = commitCreatedAt;
        previousAttempt.resolved_by_work_order_id =
          workOrder.work_order_id;
      }
      const siblingStillRunning = Object.values(
        state.work_orders,
      ).some(
        (candidate) =>
          candidate.work_order_id !== workOrder.work_order_id &&
          candidate.stage_id === workOrder.stage_id &&
          candidate.status === "running",
      );
      state.stages[workOrder.stage_id].status =
        siblingStillRunning ? "running" : "pending";
    } else {
      state.stages[workOrder.stage_id].status = "completed";
    }
    await stateStore.save(state.project_id, state);
    return {
      kind: "Committed",
      stage_id: workOrder.stage_id,
      output_artifact_ids: outputArtifacts.map(
        (artifact) => artifact.artifact_id,
      ),
      ready_stages: readyStages(state, definition),
    };
  }

  async function submit(workOrderId, resultEnvelope) {
    const commitCreatedAt = nowDate().toISOString();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await submitOnce(
          workOrderId,
          resultEnvelope,
          commitCreatedAt,
        );
      } catch (error) {
        if (
          error?.code !== "STATE_CAS_MISMATCH" ||
          attempt === 4
        ) {
          throw error;
        }
      }
    }
    throw new WorkflowEngineError(
      "STATE_CAS_RETRY_EXHAUSTED",
      "동시 state 갱신 재시도 한도를 초과했습니다.",
    );
  }

  function createApprovalChallenge(state, userGate, inputs) {
    const challenge = {
      challenge_id: `challenge-${randomUUID()}`,
      project_id: state.project_id,
      stage_id: userGate.stage_id,
      nonce: `nonce-${randomUUID()}`,
      subject_artifact_ids: inputs.map(
        (artifact) => artifact.artifact_id,
      ),
      subject_artifact_set_digest: artifactSetDigest(
        workOrderInputRefs(inputs),
      ),
      status: "awaiting_user",
      created_at: nowDate().toISOString(),
    };
    state.challenges[challenge.challenge_id] = challenge;
    state.stages[userGate.stage_id].status = "awaiting_user";
    return challenge;
  }

  function autoApprovePlanOnceGate(
    state,
    userGate,
    challenge,
    inputs,
    fastPath,
  ) {
    const selectedCandidates = inputs.flatMap((artifact) => [
      ...(artifact?.candidates ?? []),
      ...(artifact?.candidate_records ?? []),
    ]);
    const selectedCandidateIds = selectedCandidates
      .map((candidate) => candidate?.candidate_id)
      .filter(Boolean);
    const productionPlan = freshArtifacts(state).find(
      (artifact) => artifact.type === "production.plan",
    );
    const manualPlanApproval = freshArtifacts(state).find(
      (artifact) =>
        artifact.type === "decision.plan_approval" &&
        artifact.produced_by_stage === PLAN_ONCE_MANUAL_GATE,
    );
    const decisionProof = {
      project_ref: {
        project_id: state.project_id,
        input_digest: state.input_digest,
        agent_session_id: PLAN_ONCE_AUTO_APPROVER_SESSION,
      },
      nonce: challenge.nonce,
      subject_artifact_set_digest:
        challenge.subject_artifact_set_digest,
      decision: "approved",
      decision_id: `auto-${userGate.stage_id.toLowerCase()}-${sha256(
        challenge.subject_artifact_set_digest,
      ).slice(0, 12)}`,
      reason:
        "검증된 input/product 원본 사진과 사용자 승인 G1 ProductionPlan에 따른 자동 진행",
      decided_by: "plan-once-fast-path-policy",
      approval_channel: "policy_auto_after_plan",
      policy_id: PLAN_ONCE_FAST_PATH_POLICY_ID,
      automatic: true,
      phase: fastPath.phase,
      source_plan_approval_artifact_id:
        manualPlanApproval?.artifact_id ?? null,
      subject_plan_sha256:
        productionPlan?.manifest_sha256 ?? null,
      selection_mode:
        userGate.stage_id === "G1DQ_SELECTION"
          ? "all_verified_candidates"
          : null,
      selected_candidate_ids:
        userGate.stage_id === "G1DQ_SELECTION"
          ? [...new Set(selectedCandidateIds)].sort()
          : [],
    };
    const producerSessionIds = new Set(
      inputs
        .map((artifact) => artifact.producer_agent_session_id)
        .filter(Boolean),
    );
    if (producerSessionIds.has(PLAN_ONCE_AUTO_APPROVER_SESSION)) {
      throw new WorkflowEngineError(
        "AUTO_APPROVER_PRODUCER_NOT_SEPARATED",
        "plan-once 자동 승인자는 대상 산출물 producer와 달라야 합니다.",
        { stage_id: userGate.stage_id },
      );
    }

    state.used_nonces.push(challenge.nonce);
    challenge.status = "approved";
    challenge.auto_approved = true;
    challenge.decided_at = nowDate().toISOString();
    challenge.decision_proof = structuredClone(decisionProof);
    const graph = new ArtifactGraph(state.graph);
    const artifactId = `decision-${userGate.stage_id.toLowerCase()}-${sha256(
      JSON.stringify(decisionProof),
    ).slice(0, 12)}`;
    const marketCandidateSet = inputs.find(
      (artifact) =>
        artifact.type === "market.competitor_candidates",
    );
    const marketSelectionFields =
      userGate.stage_id === "G1DQ_SELECTION"
        ? {
            artifact_type: "market.competitor_selection",
            selection_receipt_id: decisionProof.decision_id,
            selected_candidates: structuredClone(
              selectedCandidates,
            ),
            candidate_set_digest:
              marketCandidateSet?.candidate_set_digest ??
              marketCandidateSet?.manifest_sha256 ??
              null,
            discovery_id:
              marketCandidateSet?.discovery_id ?? null,
          }
        : {};
    graph.addArtifact(
      {
        artifact_id: artifactId,
        type: userGate.produces[0],
        manifest_sha256: sha256(JSON.stringify(decisionProof)),
        member_ids: ["decision.json"],
        produced_by_stage: userGate.stage_id,
        producer_agent_session_id:
          PLAN_ONCE_AUTO_APPROVER_SESSION,
        approval_receipt: structuredClone(decisionProof),
        approval_policy_id: PLAN_ONCE_FAST_PATH_POLICY_ID,
        ...marketSelectionFields,
      },
      challenge.subject_artifact_ids.map((artifactId) => ({
        from: artifactId,
        relation: "evidence_for",
      })),
    );
    state.graph = graph.snapshot();
    state.stages[userGate.stage_id].status = "approved";
    state.flags ??= {};
    const previous =
      state.flags.plan_once_fast_path?.auto_approved_stage_ids ?? [];
    state.flags.plan_once_fast_path = {
      policy_id: PLAN_ONCE_FAST_PATH_POLICY_ID,
      actual_product_photos_verified: true,
      manual_plan_approval_verified:
        hasManualPlanApproval(state),
      auto_approved_stage_ids: [
        ...new Set([...previous, userGate.stage_id]),
      ],
      last_auto_approved_at: challenge.decided_at,
    };
    return {
      stage_id: userGate.stage_id,
      decision_artifact_id: artifactId,
      policy_id: PLAN_ONCE_FAST_PATH_POLICY_ID,
      phase: fastPath.phase,
    };
  }

  async function advance(projectRef, options = {}) {
    const state = await loadOrCreate(projectRef);
    const notifications = emitMissingPhotoNotice(
      state,
      options,
      nowDate().toISOString(),
    );
    let noticePersisted = false;
    const persistNotice = async () => {
      if (notifications.length > 0 && !noticePersisted) {
        await stateStore.save(state.project_id, state);
        noticePersisted = true;
      }
    };
    const autoApprovals = [];
    while (true) {
      const ready = readyStages(state, definition);
      const awaitingChallenge = Object.values(
        state.challenges,
      ).find((entry) => entry.status === "awaiting_user");
      const userGate = awaitingChallenge
        ? definitions.get(awaitingChallenge.stage_id)
        : definition.stages.find(
            (item) =>
              item.user_gate &&
              ready.includes(item.stage_id),
          );
      if (userGate) {
        const fastPath = planOnceFastPathDecision(
          state,
          userGate.stage_id,
        );
        const workReady = ready.filter(
          (stageId) => !definitions.get(stageId).user_gate,
        );
        const photoIntakeStatus =
          state.stages.G0B_PHOTO?.status;
        if (
          fastPath.reason ===
            "verified_actual_product_photos_required" &&
          PLAN_ONCE_PRE_PLAN_AUTO_GATES.has(userGate.stage_id) &&
          ["pending", "running"].includes(photoIntakeStatus)
        ) {
          await persistNotice();
          return workReady.length > 0
            ? {
                kind: "WorkAvailable",
                until:
                  options.until ?? "next_user_gate",
                ready_stages: workReady,
                notifications,
                auto_approvals: autoApprovals,
                deferred_user_gate: userGate.stage_id,
              }
            : {
                kind: "Waiting",
                ready_stages: [],
                notifications,
                auto_approvals: autoApprovals,
                deferred_user_gate: userGate.stage_id,
              };
        }
        let challenge =
          awaitingChallenge?.stage_id === userGate.stage_id
            ? awaitingChallenge
            : Object.values(state.challenges).find(
                (entry) =>
                  entry.stage_id === userGate.stage_id &&
                  entry.status === "awaiting_user",
              );
        const inputs = stageInputs(
          state,
          definition,
          userGate.stage_id,
        );
        if (!challenge) {
          challenge = createApprovalChallenge(
            state,
            userGate,
            inputs,
          );
        }
        if (fastPath.auto_approve) {
          autoApprovals.push(
            autoApprovePlanOnceGate(
              state,
              userGate,
              challenge,
              inputs,
              fastPath,
            ),
          );
          await stateStore.save(state.project_id, state);
          noticePersisted = true;
          continue;
        }
        await stateStore.save(state.project_id, state);
        noticePersisted = true;
        await persistNotice();
        return {
          kind: "AwaitUser",
          stage_id: userGate.stage_id,
          challenge: structuredClone(challenge),
          notifications,
          auto_approvals: autoApprovals,
        };
      }
      const workReady = ready.filter(
        (stageId) => !definitions.get(stageId).user_gate,
      );
      if (workReady.length > 0) {
        await persistNotice();
        return {
          kind: "WorkAvailable",
          until: options.until ?? "next_user_gate",
          ready_stages: workReady,
          notifications,
          auto_approvals: autoApprovals,
        };
      }
      const unfinished = Object.values(state.stages).some(
        (entry) =>
          ["pending", "running", "awaiting_user"].includes(
            entry.status,
          ),
      );
      await persistNotice();
      return unfinished
        ? {
            kind: "Waiting",
            ready_stages: [],
            notifications,
            auto_approvals: autoApprovals,
          }
        : {
            kind: "Complete",
            ready_stages: [],
            notifications,
            auto_approvals: autoApprovals,
          };
    }
  }

  async function resume(projectRef, options = {}) {
    return advance(projectRef, options);
  }

  async function decide(challengeId, decisionProof) {
    const state = await loadOrCreate(decisionProof?.project_ref);
    const challenge = state.challenges[challengeId];
    if (!challenge || challenge.status !== "awaiting_user") {
      throw new WorkflowEngineError(
        "CHALLENGE_NOT_FOUND",
        "대기 중인 사용자 승인 challenge를 찾을 수 없습니다.",
      );
    }
    if (state.used_nonces.includes(decisionProof.nonce)) {
      throw new WorkflowEngineError(
        "NONCE_REUSED",
        "이미 사용된 nonce입니다.",
      );
    }
    if (decisionProof.nonce !== challenge.nonce) {
      throw new WorkflowEngineError(
        "INVALID_NONCE",
        "승인 nonce가 일치하지 않습니다.",
      );
    }
    if (
      decisionProof.subject_artifact_set_digest !==
      challenge.subject_artifact_set_digest
    ) {
      throw new WorkflowEngineError(
        "APPROVAL_DIGEST_MISMATCH",
        "결정 대상 artifact set digest가 challenge와 다릅니다.",
      );
    }
    if (
      !["approved", "rejected"].includes(decisionProof.decision) ||
      !decisionProof.decided_by ||
      !decisionProof.approval_channel ||
      !decisionProof.project_ref?.agent_session_id
    ) {
      throw new WorkflowEngineError(
        "INVALID_DECISION_PROOF",
        "decision, decided_by, approval_channel이 필요합니다.",
      );
    }
    if (
      decisionProof.decision === "rejected" &&
      !String(decisionProof.reason || "").trim()
    ) {
      throw new WorkflowEngineError(
        "REJECTION_REASON_REQUIRED",
        "반려에는 reason이 필요합니다.",
      );
    }
    const subjectProducerSessionIds = new Set(
      state.graph.artifacts
        .filter((artifact) =>
          challenge.subject_artifact_ids.includes(
            artifact.artifact_id,
          ),
        )
        .map((artifact) => artifact.producer_agent_session_id)
        .filter(Boolean),
    );
    if (
      subjectProducerSessionIds.has(
        decisionProof.project_ref.agent_session_id,
      )
    ) {
      throw new WorkflowEngineError(
        "APPROVER_PRODUCER_NOT_SEPARATED",
        "승인자는 challenge 대상 산출물의 producer session과 달라야 합니다.",
      );
    }

    state.used_nonces.push(challenge.nonce);
    challenge.status = decisionProof.decision;
    challenge.decided_at = new Date().toISOString();
    challenge.decision_proof = structuredClone(decisionProof);
    const stageEntry = state.stages[challenge.stage_id];
    if (decisionProof.decision === "rejected") {
      stageEntry.status = "rejected";
      await stateStore.save(state.project_id, state);
      return { kind: "Rejected", stage_id: challenge.stage_id };
    }

    const item = definitions.get(challenge.stage_id);
    const graph = new ArtifactGraph(state.graph);
    const artifactId = `decision-${challenge.stage_id.toLowerCase()}-${sha256(
      JSON.stringify(decisionProof),
    ).slice(0, 12)}`;
    graph.addArtifact(
      {
        artifact_id: artifactId,
        type: item.produces[0],
        manifest_sha256: sha256(JSON.stringify(decisionProof)),
        member_ids: ["decision.json"],
        produced_by_stage: challenge.stage_id,
        producer_agent_session_id:
          decisionProof.project_ref.agent_session_id,
        approval_receipt: structuredClone(decisionProof),
      },
      challenge.subject_artifact_ids.map((artifactId) => ({
        from: artifactId,
        relation: "evidence_for",
      })),
    );
    state.graph = graph.snapshot();
    stageEntry.status = "approved";
    await stateStore.save(state.project_id, state);
    return {
      kind: "Approved",
      stage_id: challenge.stage_id,
      decision_artifact_id: artifactId,
      ready_stages: readyStages(state, definition),
    };
  }

  return Object.freeze({
    inspect,
    advance,
    resume,
    decide,
    recordRubricIteration,
    planRevision,
    commitRevision,
    lease,
    leaseFrontier,
    completeParallelFrontier,
    heartbeat,
    failFrontierWorkItem,
    submit,
  });
}
