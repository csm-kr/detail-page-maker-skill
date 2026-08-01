import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_ONCE_FAST_PATH_POLICY_ID,
  PLAN_APPROVAL_TIMEOUT_MS,
  createWorkflowEngine,
  hasAcceptedPlanApproval,
  hasManualPlanApproval,
  hasVerifiedActualProductPhotoSet,
  hasVerifiedSupplierSameSkuSet,
  planOnceFastPathDecision,
} from "../orchestration/workflow-engine.mjs";
import {
  WORKFLOW_DEFINITION,
  validateWorkflowDefinition,
} from "../orchestration/workflow-definition.mjs";

function stateWithActualPhotos() {
  return {
    graph: {
      artifacts: [
        {
          artifact_id: "identity-photo-set-1",
          type: "identity.photo_set",
          status: "fresh",
          member_ids: ["front.jpg"],
          member_manifest: {
            schema_version: "1.0",
            policy: "materialized",
            members: [
              {
                member_id: "front.jpg",
                root_id: "project",
                locator: "input/product/front.jpg",
                size_bytes: 1024,
                sha256: "a".repeat(64),
              },
            ],
          },
        },
      ],
    },
  };
}

function addManualPlanApproval(state) {
  state.graph.artifacts.push({
    artifact_id: "decision-plan-1",
    type: "decision.plan_approval",
    status: "fresh",
    produced_by_stage: "G1U_APPROVAL",
    approval_receipt: {
      decision: "approved",
      decided_by: "local-user",
      approval_channel: "studio-v1",
    },
  });
  return state;
}

function stateWithSupplierSameSku() {
  return {
    graph: {
      artifacts: [
        {
          artifact_id: "supplier-snapshot-1",
          type: "evidence.supplier_snapshot",
          status: "fresh",
          member_ids: ["thumb.jpg"],
          member_manifest: {
            schema_version: "1.0",
            policy: "materialized",
            members: [
              {
                member_id: "thumb.jpg",
                root_id: "project",
                locator: ".detail-page/evidence/supplier/thumb.jpg",
                size_bytes: 2048,
                sha256: "b".repeat(64),
              },
            ],
          },
          payload: {
            files: [
              {
                member_id: "thumb.jpg",
                kind: "product_thumbnail",
                source_kind: "supplier_same_sku",
                same_sku_verified: true,
                classification: "identity_reference",
              },
            ],
          },
        },
      ],
    },
  };
}

test("원본 사진이 검증되면 G1 전 gate는 자동이고 G1 기획은 수동이다", () => {
  const state = stateWithActualPhotos();
  assert.equal(hasVerifiedActualProductPhotoSet(state), true);
  assert.deepEqual(
    planOnceFastPathDecision(state, "G0U_APPROVAL"),
    {
      auto_approve: true,
      phase: "before_manual_plan",
      policy_id: PLAN_ONCE_FAST_PATH_POLICY_ID,
    },
  );
  assert.deepEqual(
    planOnceFastPathDecision(state, "G1U_APPROVAL"),
    {
      auto_approve: false,
      reason: "plan_approval_or_timeout_required",
      timeout_ms: PLAN_APPROVAL_TIMEOUT_MS,
    },
  );
  assert.equal(
    planOnceFastPathDecision(state, "G2U_APPROVAL")
      .auto_approve,
    false,
  );
});

test("사진이 없어도 검증된 공급처 동일 SKU로 URL-only fast path를 연다", () => {
  const state = stateWithSupplierSameSku();
  assert.equal(hasVerifiedSupplierSameSkuSet(state), true);
  assert.equal(
    planOnceFastPathDecision(state, "G0U_APPROVAL").auto_approve,
    true,
  );
});

test("G1 기획 공개 후 120초 무응답이면 명시적 반려 없이 자동 진행한다", () => {
  const state = stateWithSupplierSameSku();
  const challenge = {
    status: "awaiting_user",
    auto_continue_at: "2026-08-01T00:02:00.000Z",
  };
  assert.equal(
    planOnceFastPathDecision(state, "G1U_APPROVAL", {
      challenge,
      now: new Date("2026-08-01T00:01:59.999Z"),
    }).auto_approve,
    false,
  );
  assert.deepEqual(
    planOnceFastPathDecision(state, "G1U_APPROVAL", {
      challenge,
      now: new Date("2026-08-01T00:02:00.000Z"),
    }),
    {
      auto_approve: true,
      phase: "plan_timeout",
      policy_id: PLAN_ONCE_FAST_PATH_POLICY_ID,
    },
  );
});

test("120초 정책 승인도 이후 G2~G5 진행의 유효한 기획 승인이다", () => {
  const state = stateWithSupplierSameSku();
  state.graph.artifacts.push({
    artifact_id: "decision-plan-timeout",
    type: "decision.plan_approval",
    status: "fresh",
    produced_by_stage: "G1U_APPROVAL",
    approval_receipt: {
      decision: "approved",
      decided_by: "url-only-autocontinue-policy",
      approval_channel: "policy_auto_after_timeout",
    },
  });
  assert.equal(hasManualPlanApproval(state), false);
  assert.equal(hasAcceptedPlanApproval(state), true);
  assert.equal(
    planOnceFastPathDecision(state, "G5U_APPROVAL").auto_approve,
    true,
  );
});

test("사용자 G1 승인 뒤 G2~G5 user gate는 자동 진행한다", () => {
  const state = addManualPlanApproval(stateWithActualPhotos());
  assert.equal(hasManualPlanApproval(state), true);
  for (const stageId of [
    "G2S_CONFIG_APPROVAL",
    "G2U_APPROVAL",
    "G3V_PREVIEW_APPROVAL",
    "G3U_APPROVAL",
    "G4U_APPROVAL",
    "G5U_APPROVAL",
  ]) {
    assert.deepEqual(
      planOnceFastPathDecision(state, stageId),
      {
        auto_approve: true,
        phase: "after_manual_plan",
        policy_id: PLAN_ONCE_FAST_PATH_POLICY_ID,
      },
    );
  }
});

test("input/product 밖의 파일이나 policy 자체 승인은 fast path 근거가 아니다", () => {
  const state = stateWithActualPhotos();
  state.graph.artifacts[0].member_manifest.members[0].locator =
    "output/media/images/front.jpg";
  addManualPlanApproval(state);
  state.graph.artifacts.at(-1).approval_receipt.approval_channel =
    "policy_auto_after_plan";
  assert.equal(hasVerifiedActualProductPhotoSet(state), false);
  assert.equal(hasManualPlanApproval(state), false);
  assert.equal(
    planOnceFastPathDecision(state, "G5U_APPROVAL").auto_approve,
    false,
  );
});

test("workflow 정의에는 G1 하나만 수동 gate로 남는다", () => {
  assert.deepEqual(validateWorkflowDefinition(WORKFLOW_DEFINITION), {
    ok: true,
    errors: [],
  });
  const manual = WORKFLOW_DEFINITION.stages.filter(
    (stage) => stage.plan_once_approval === "manual_plan",
  );
  assert.deepEqual(
    manual.map((stage) => stage.stage_id),
    ["G1U_APPROVAL"],
  );
  assert.equal(
    WORKFLOW_DEFINITION.stages
      .filter((stage) => stage.user_gate)
      .every((stage) => stage.plan_once_approval !== null),
    true,
  );
});

test("ready 사용자 gate는 AwaitUser 대신 exact policy receipt로 commit된다", async () => {
  const projectRef = {
    project_id: "plan-once-test",
    input_digest: "f".repeat(64),
    agent_session_id: "coordinator-session",
  };
  let stored = {
    version: 2,
    workflow_id: WORKFLOW_DEFINITION.workflow_id,
    workflow_version: WORKFLOW_DEFINITION.version,
    project_id: projectRef.project_id,
    input_digest: projectRef.input_digest,
    stages: Object.fromEntries(
      WORKFLOW_DEFINITION.stages.map((stage) => [
        stage.stage_id,
        { status: "completed", run_ids: [] },
      ]),
    ),
    graph: {
      artifacts: [
        ...stateWithActualPhotos().graph.artifacts.map(
          (artifact) => ({
            ...artifact,
            produced_by_stage: "G0B_PHOTO",
            producer_agent_session_id: "photo-session",
            manifest_sha256: "1".repeat(64),
          }),
        ),
        {
          artifact_id: "product-ssot-1",
          type: "product.ssot",
          status: "fresh",
          produced_by_stage: "G0C_NORMALIZE",
          producer_agent_session_id: "normalize-session",
          manifest_sha256: "2".repeat(64),
          member_ids: [],
        },
        {
          artifact_id: "qa-g0-1",
          type: "qa.validation_receipt",
          status: "fresh",
          produced_by_stage: "G0Q_QA",
          producer_agent_session_id: "qa-session",
          manifest_sha256: "3".repeat(64),
          member_ids: [],
        },
      ],
      edges: [],
    },
    work_orders: {},
    challenges: {},
    used_nonces: [],
    events: [],
    flags: { missing_photo_notice_emitted: false },
    repair_loop: {
      status: "IDLE",
      history: [],
      results: {},
      transitions: {},
    },
    _state_seal: { status: "legacy_unsealed" },
  };
  stored.stages.G0U_APPROVAL.status = "pending";
  stored.stages.G1C_PLAN.status = "pending";
  const stateStore = {
    async load() {
      return structuredClone(stored);
    },
    async save(_projectId, next) {
      stored = structuredClone(next);
    },
  };
  const engine = createWorkflowEngine({
    stateStore,
    artifactRecordStore: {
      async commit() {
        throw new Error("not used");
      },
      async verify() {
        throw new Error("legacy state skips record verification");
      },
    },
    clock: () => new Date("2026-07-31T08:00:00Z"),
  });
  const result = await engine.advance(projectRef);
  assert.equal(result.kind, "Waiting");
  assert.deepEqual(
    result.auto_approvals.map((item) => item.stage_id),
    ["G0U_APPROVAL"],
  );
  const approval = stored.graph.artifacts.find(
    (artifact) => artifact.type === "decision.ssot_approval",
  );
  assert.equal(
    approval.approval_receipt.approval_channel,
    "policy_auto_after_plan",
  );
  assert.equal(
    approval.input_set_digest,
    approval.approval_receipt.subject_artifact_set_digest,
  );
  assert.equal(
    stored.stages.G0U_APPROVAL.status,
    "approved",
  );
});
