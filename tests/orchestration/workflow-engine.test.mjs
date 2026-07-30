import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createWorkflowEngine,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-engine.mjs";
import { createFileStateStore } from "../../skills/detail-page-maker-skill/scripts/orchestration/file-state-store.mjs";
import { revisionImpactDigest } from "../../skills/detail-page-maker-skill/scripts/orchestration/revision-impact.mjs";

const HASHES = Array.from({ length: 12 }, (_, index) =>
  (index + 1).toString(16).repeat(64),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const PHOTO_BYTES = Buffer.from("immutable-photo-v2-bytes", "utf8");
const PHOTO_SHA256 = sha256(PHOTO_BYTES);
const PHOTO_LOCATOR = "input/product/photo-v2.png";

function project(agentSessionId = "coordinator") {
  return {
    project_id: "project-56328525",
    input_digest: HASHES[0],
    agent_session_id: agentSessionId,
  };
}

function result(workOrder, outputTypes, offset = 1) {
  const envelope = {
    project_ref: project(workOrder.assigned_agent_session_id),
    producer_agent_session_id: workOrder.assigned_agent_session_id,
    input_set_digest: workOrder.input_set_digest,
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: outputTypes.map((type, index) => ({
      artifact_id: `${workOrder.stage_id.toLowerCase()}-${index}`,
      type,
      manifest_sha256: HASHES[offset + index],
      member_ids: [`${type}.json`],
    })),
    execution_receipt: {
      execution_id: `execution-${workOrder.work_order_id}`,
      adapter_id: workOrder.runner_contract.adapter_id,
      adapter_version: "1.0.0",
      adapter_code_sha256: HASHES[11],
    },
  };
  if (
    workOrder.stage_id.endsWith("_QA") ||
    workOrder.stage_id === "G4Q_RUBRIC"
  ) {
    const producerSessions = [
      ...new Set(
        workOrder.input_artifacts.map(
          (artifact) => artifact.producer_agent_session_id,
        ),
      ),
    ];
    envelope.validation_receipt = {
      validation_id: `validation-${workOrder.work_order_id}`,
      subject: {
        artifact_set_digest: workOrder.input_set_digest,
        artifact_ids: workOrder.input_artifacts.map(
          (artifact) => artifact.artifact_id,
        ),
      },
      validator: {
        name: "fixture-qa",
        version: "1.0.0",
        code_sha256: HASHES[10],
        agent_id: "fixture-qa-agent",
        agent_session_id: workOrder.assigned_agent_session_id,
      },
      producer: { agent_session_ids: producerSessions },
      policy: {
        policy_id: workOrder.gate_policy_id,
        policy_sha256: HASHES[9],
      },
      validator_kind: "deterministic",
      checks: [
        {
          check_id: "fixture.pass",
          status: "PASS",
          severity: "hard",
          evidence_artifact_ids: [
            workOrder.input_artifacts[0]?.artifact_id ??
              envelope.output_artifacts[0].artifact_id,
          ],
        },
      ],
      score: 100,
      quality_metrics: {
        behance_quality_score: 100,
        critical_dimension_min_score: 100,
        deterministic_hard_failure_count: 0,
      },
      hard_failures: [],
      verdict: "PASS",
      started_at: "2026-07-30T01:00:00.000Z",
      finished_at: "2026-07-30T01:01:00.000Z",
    };
  }
  return envelope;
}

test("artifact record commit·verify store가 없으면 엔진 생성을 거부한다", () => {
  assert.throws(
    () =>
      createWorkflowEngine({
        stateStore: {
          async load() {
            return null;
          },
          async save() {},
        },
      }),
    (error) => error.code === "ARTIFACT_RECORD_STORE_REQUIRED",
  );
});

async function preparePhotoRevisionGraph(engine, root) {
  const photoPath = path.join(root, ...PHOTO_LOCATOR.split("/"));
  await mkdir(path.dirname(photoPath), { recursive: true });
  await writeFile(photoPath, PHOTO_BYTES);
  await leaseAndSubmit(engine, "S0_INTAKE", ["project.intake"], 1);
  await leaseAndSubmit(
    engine,
    "G0A_SUPPLIER",
    ["evidence.supplier_snapshot", "receipt.importer"],
    2,
  );
  await leaseAndSubmit(engine, "G0B_PHOTO", ["identity.photo_set"], 4);
  await leaseAndSubmit(engine, "G0R_RIGHTS", ["decision.rights_set"], 5);
  await leaseAndSubmit(engine, "G0C_NORMALIZE", ["product.ssot"], 6);
}

async function prepareUnrelatedMarketKnowledge(engine) {
  await leaseAndSubmit(
    engine,
    "G1B_KNOWLEDGE",
    ["knowledge.snapshot", "receipt.dependency_closure"],
    2,
  );
  await leaseAndSubmit(
    engine,
    "G1D_DISCOVERY",
    ["market.competitor_candidates"],
    4,
  );
  const selection = await engine.advance(project("market-selector"));
  assert.equal(selection.stage_id, "G1DQ_SELECTION");
  await engine.decide(selection.challenge.challenge_id, {
    project_ref: project("market-selector"),
    nonce: selection.challenge.nonce,
    subject_artifact_set_digest:
      selection.challenge.subject_artifact_set_digest,
    decision: "approved",
    decided_by: "market-selector",
    approval_channel: "workflow-engine-test",
  });
  await leaseAndSubmit(
    engine,
    "G1A_MARKET",
    ["evidence.market_snapshot", "receipt.importer"],
    5,
  );
}

async function approveCurrentG0(engine) {
  await leaseAndSubmit(
    engine,
    "G0Q_QA",
    ["qa.validation_receipt"],
    7,
  );
  const approval = await engine.advance(project("g0-approver"));
  assert.equal(approval.stage_id, "G0U_APPROVAL");
  await engine.decide(approval.challenge.challenge_id, {
    project_ref: project("g0-approver"),
    nonce: approval.challenge.nonce,
    subject_artifact_set_digest:
      approval.challenge.subject_artifact_set_digest,
    decision: "approved",
    decided_by: "g0-approver",
    approval_channel: "workflow-engine-test",
  });
}

function photoRevisionChange() {
  const subject = {
    artifact_id: "g0b-photo-revision-v2",
    manifest_sha256: HASHES[8],
    members: [
      {
        member_id: "photo-v2.png",
        member_sha256: PHOTO_SHA256,
      },
    ],
  };
  const rightsBody = {
    schema_version: "1.0",
    receipt_id: "photo-rights-v2",
    receipt_type: "photo_revision.rights_provenance",
    subject,
    classification: "identity_reference",
    production_use_allowed: false,
    evidence: {
      locator: "input/product/photo-v2.png",
      sha256: PHOTO_SHA256,
    },
  };
  const identityBody = {
    schema_version: "1.0",
    receipt_id: "photo-identity-v2",
    receipt_type: "photo_revision.identity_provenance",
    subject,
    decision: "verified",
    evidence: {
      locator: "input/product/photo-v2.png",
      sha256: PHOTO_SHA256,
    },
  };
  return {
    kind: "actual_product_photo_set_revision",
    old_artifact: {
      artifact_id: "g0b_photo-0",
      manifest_sha256: HASHES[4],
    },
    new_artifact: {
      artifact_id: "g0b-photo-revision-v2",
      type: "identity.photo_set",
      manifest_sha256: HASHES[8],
      member_ids: ["photo-v2.png"],
      members: [
        {
          member_id: "photo-v2.png",
          member_sha256: PHOTO_SHA256,
        },
      ],
      member_manifest: {
        schema_version: "1.0",
        policy: "materialized",
        members: [
          {
            member_id: "photo-v2.png",
            root_id: "project",
            locator: PHOTO_LOCATOR,
            sha256: PHOTO_SHA256,
            size_bytes: PHOTO_BYTES.length,
          },
        ],
      },
      producer_agent_session_id: "photo-revision-producer",
      rights_provenance: {
        ...rightsBody,
        receipt_sha256: revisionImpactDigest(rightsBody),
      },
      identity_provenance: {
        ...identityBody,
        receipt_sha256: revisionImpactDigest(identityBody),
      },
      revision_of: {
        artifact_id: "g0b_photo-0",
        manifest_sha256: HASHES[4],
      },
    },
  };
}

test("revision plan은 graph를 바꾸지 않고 immutable record로 재시작 뒤 commit된다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-revision-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const planner = createWorkflowEngine({ projectRoot: root });
  await preparePhotoRevisionGraph(planner, root);
  await prepareUnrelatedMarketKnowledge(planner);
  await approveCurrentG0(planner);
  const before = await planner.inspect(project());

  const planned = await planner.planRevision(
    project("revision-planner"),
    photoRevisionChange(),
  );

  assert.equal(planned.kind, "RevisionPlanned");
  assert.equal(planned.state_mutation, false);
  assert.match(planned.plan_digest, /^[a-f0-9]{64}$/);
  assert.match(
    planned.artifact_record.record_locator,
    /^\.detail-page\/workflow\/artifacts\//,
  );
  assert.match(
    planned.artifact_record.record_sha256,
    /^[a-f0-9]{64}$/,
  );
  assert.equal(
    planned.commit_validation_receipt.verdict,
    "PASS",
  );
  assert.deepEqual(await planner.inspect(project()), before);

  const restarted = createWorkflowEngine({ projectRoot: root });
  const committed = await restarted.commitRevision(
    project("revision-approver"),
    {
      planDigest: planned.plan_digest,
      decidedBy: "operator-1",
      reason: "실제품 사진 교체 승인",
    },
  );
  assert.equal(committed.kind, "RevisionCommitted");
  assert.ok(committed.stale_artifact_ids.includes("g0b_photo-0"));
  assert.ok(committed.stale_artifact_ids.includes("g0c_normalize-0"));
  assert.equal(
    committed.new_photo_artifact_id,
    "g0b-photo-revision-v2",
  );
  const after = await restarted.inspect(project());
  assert.equal(
    after.artifacts.find(
      (artifact) => artifact.artifact_id === "g0b_photo-0",
    ).status,
    "stale",
  );
  assert.equal(
    after.artifacts.find(
      (artifact) => artifact.artifact_id === "g0a_supplier-0",
    ).status,
    "fresh",
  );
  assert.equal(
    after.artifacts.find(
      (artifact) => artifact.artifact_id === "g1b_knowledge-0",
    ).status,
    "fresh",
  );
  assert.equal(
    after.artifacts.find(
      (artifact) => artifact.artifact_id === "g1a_market-0",
    ).status,
    "fresh",
  );
  assert.equal(
    after.artifacts.find(
      (artifact) => artifact.artifact_id === "g0c_normalize-0",
    ).status,
    "stale",
  );
  const newPhoto = after.artifacts.find(
    (artifact) =>
      artifact.artifact_id === "g0b-photo-revision-v2",
  );
  assert.equal(newPhoto.status, "fresh");
  assert.deepEqual(newPhoto.revision_of, {
    artifact_id: "g0b_photo-0",
    manifest_sha256: HASHES[4],
  });
  assert.equal(
    newPhoto.revision_envelope.envelope_type,
    "identity.photo_set.revision",
  );
  assert.equal(
    newPhoto.revision_envelope.plan_digest,
    planned.plan_digest,
  );
  assert.equal(
    newPhoto.rights_provenance_receipt_sha256,
    photoRevisionChange().new_artifact.rights_provenance
      .receipt_sha256,
  );
  assert.equal(
    newPhoto.identity_provenance_receipt_sha256,
    photoRevisionChange().new_artifact.identity_provenance
      .receipt_sha256,
  );
  assert.match(newPhoto.commit_validation_receipt_id, /^structural-/);
  assert.match(
    newPhoto.record_locator,
    /^\.detail-page\/workflow\/artifacts\//,
  );
  assert.equal(after.stages.G0B_PHOTO.status, "completed");
  assert.equal(after.stages.G0C_NORMALIZE.status, "pending");
  assert.equal(after.stages.G0Q_QA.status, "pending");
  assert.equal(after.stages.G0U_APPROVAL.status, "pending");
  assert.equal(
    after.artifacts.find(
      (artifact) =>
        artifact.produced_by_stage === "G0U_APPROVAL",
    ).status,
    "stale",
  );
  assert.equal(after.stages.G1B_KNOWLEDGE.status, "completed");
  assert.equal(after.stages.G1A_MARKET.status, "completed");
  assert.equal(after.state_integrity.status, "verified");

  await assert.rejects(
    () =>
      createWorkflowEngine({ projectRoot: root }).commitRevision(
        project("revision-approver"),
        {
          planDigest: planned.plan_digest,
          decidedBy: "operator-1",
          reason: "같은 계획 재사용",
        },
    ),
    (error) => error.code === "REVISION_PLAN_ALREADY_COMMITTED",
  );

  await writeFile(
    path.join(root, ...PHOTO_LOCATOR.split("/")),
    Buffer.alloc(PHOTO_BYTES.length, 0x78),
  );
  await assert.rejects(
    () =>
      createWorkflowEngine({ projectRoot: root }).inspect(project()),
    (error) =>
      error.code === "MATERIALIZED_MEMBER_HASH_MISMATCH",
  );
  await writeFile(
    path.join(root, ...PHOTO_LOCATOR.split("/")),
    PHOTO_BYTES,
  );

  await writeFile(
    path.join(
      root,
      ...newPhoto.record_locator.split("/"),
    ),
    "{}\n",
    "utf8",
  );
  await assert.rejects(
    () =>
      createWorkflowEngine({ projectRoot: root }).inspect(project()),
    (error) =>
      error.code === "ARTIFACT_RECORD_INTEGRITY_MISMATCH",
  );
});

test("photo revision은 rights·identity provenance 누락과 위조를 fail-closed한다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-revision-provenance-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });
  await preparePhotoRevisionGraph(engine, root);

  const missingRights = photoRevisionChange();
  delete missingRights.new_artifact.rights_provenance;
  await assert.rejects(
    () =>
      engine.planRevision(
        project("revision-planner"),
        missingRights,
      ),
    (error) => error.code === "INVALID_REVISION_IMPACT_INPUT",
  );

  const missingMemberManifest = photoRevisionChange();
  delete missingMemberManifest.new_artifact.member_manifest;
  await assert.rejects(
    () =>
      engine.planRevision(
        project("revision-planner"),
        missingMemberManifest,
      ),
    (error) => error.code === "PHOTO_MEMBER_MANIFEST_REQUIRED",
  );

  const missingIdentity = photoRevisionChange();
  delete missingIdentity.new_artifact.identity_provenance;
  await assert.rejects(
    () =>
      engine.planRevision(
        project("revision-planner"),
        missingIdentity,
      ),
    (error) => error.code === "INVALID_REVISION_IMPACT_INPUT",
  );

  const forgedRights = photoRevisionChange();
  forgedRights.new_artifact.rights_provenance.classification =
    "production_licensed";
  await assert.rejects(
    () =>
      engine.planRevision(
        project("revision-planner"),
        forgedRights,
      ),
    (error) =>
      error.code === "INVALID_PHOTO_RIGHTS_PROVENANCE" ||
      error.code === "FORGED_PHOTO_PROVENANCE",
  );
});

test("revision plan record 변조와 계획 뒤 graph drift를 commit 전에 거부한다", async (t) => {
  const tamperRoot = await mkdtemp(
    path.join(os.tmpdir(), "workflow-revision-tamper-"),
  );
  const driftRoot = await mkdtemp(
    path.join(os.tmpdir(), "workflow-revision-drift-"),
  );
  const envelopeRoot = await mkdtemp(
    path.join(os.tmpdir(), "workflow-revision-envelope-"),
  );
  t.after(() =>
    Promise.all([
      rm(tamperRoot, { recursive: true, force: true }),
      rm(driftRoot, { recursive: true, force: true }),
      rm(envelopeRoot, { recursive: true, force: true }),
    ]),
  );

  const tamperEngine = createWorkflowEngine({
    projectRoot: tamperRoot,
  });
  await preparePhotoRevisionGraph(tamperEngine, tamperRoot);
  const tamperedPlan = await tamperEngine.planRevision(
    project("revision-planner"),
    photoRevisionChange(),
  );
  await writeFile(
    path.join(
      tamperRoot,
      ...tamperedPlan.artifact_record.record_locator.split("/"),
    ),
    "{}\n",
    "utf8",
  );
  await assert.rejects(
    () =>
      tamperEngine.commitRevision(project("revision-approver"), {
        planDigest: tamperedPlan.plan_digest,
        decidedBy: "operator-1",
        reason: "변조된 record는 승인 불가",
      }),
    (error) =>
      error.code === "IMMUTABLE_ARTIFACT_RECORD_CONFLICT",
  );

  const envelopeEngine = createWorkflowEngine({
    projectRoot: envelopeRoot,
  });
  await preparePhotoRevisionGraph(envelopeEngine, envelopeRoot);
  const envelopePlan = await envelopeEngine.planRevision(
    project("revision-planner"),
    photoRevisionChange(),
  );
  await writeFile(
    path.join(
      envelopeRoot,
      ".detail-page",
      "workflow",
      "revision-plans",
      `${envelopePlan.plan_digest}.json`,
    ),
    "{}\n",
    "utf8",
  );
  await assert.rejects(
    () =>
      envelopeEngine.commitRevision(project("revision-approver"), {
        planDigest: envelopePlan.plan_digest,
        decidedBy: "operator-1",
        reason: "변조된 envelope는 승인 불가",
      }),
    (error) => error.code === "REVISION_PLAN_INTEGRITY_MISMATCH",
  );

  const driftEngine = createWorkflowEngine({ projectRoot: driftRoot });
  await preparePhotoRevisionGraph(driftEngine, driftRoot);
  const driftPlan = await driftEngine.planRevision(
    project("revision-planner"),
    photoRevisionChange(),
  );
  await leaseAndSubmit(
    driftEngine,
    "G1B_KNOWLEDGE",
    ["knowledge.snapshot", "receipt.dependency_closure"],
    2,
  );
  await assert.rejects(
    () =>
      driftEngine.commitRevision(project("revision-approver"), {
        planDigest: driftPlan.plan_digest,
        decidedBy: "operator-1",
        reason: "drift 뒤 commit 시도",
      }),
    (error) => error.code === "REVISION_PLAN_GRAPH_DRIFT",
  );
});

test("revision plan은 protected knowledge invalidation을 fail-closed한다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-revision-protected-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });
  await preparePhotoRevisionGraph(engine, root);
  await leaseAndSubmit(
    engine,
    "G1B_KNOWLEDGE",
    ["knowledge.snapshot", "receipt.dependency_closure"],
    2,
  );
  const store = createFileStateStore(root);
  const state = await store.load(project().project_id);
  state.graph.edges.push({
    from: "g0b_photo-0",
    to: "g1b_knowledge-0",
    relation: "evidence_for",
  });
  await store.save(state.project_id, state);

  await assert.rejects(
    () =>
      createWorkflowEngine({ projectRoot: root }).planRevision(
        project("revision-planner"),
        photoRevisionChange(),
      ),
    (error) =>
      error.code === "PROTECTED_INVALIDATION_FORBIDDEN" &&
      error.details.to === "g1b_knowledge-0",
  );
});

test("member revision commit은 선택한 member branch만 stale하고 approval을 reopen한다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-revision-member-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const internalRunner = {
    skill_id: "detail-page-maker-skill",
    adapter_id: "WorkflowOrchestratorInternalAdapter",
  };
  const stage = (
    stageId,
    requiredInputs,
    produces,
    consumers = [],
    userGate = false,
  ) => ({
    stage_id: stageId,
    required_inputs: requiredInputs,
    produces,
    gate_policy_id: `policy.${stageId}.v1`,
    consumers,
    input_producers: {},
    any_of_inputs: [],
    output_variants: [],
    repair_target_stages: [],
    runner_contract: userGate ? null : internalRunner,
    validation_policy: null,
    fan_out_key: null,
    user_gate: userGate,
    mutable_output: false,
  });
  const definition = {
    workflow_id: "revision-member-fixture",
    version: "1.0.0",
    stages: [
      stage("S0_INTAKE", [], ["project.intake"], ["G2A_IMAGE"]),
      stage(
        "G2A_IMAGE",
        ["project.intake"],
        ["media.image_approved"],
        ["G4A_ASSEMBLY"],
      ),
      stage(
        "G2Q_QA",
        ["never.qa"],
        ["qa.validation_receipt"],
      ),
      stage(
        "G2U_APPROVAL",
        ["media.image_approved"],
        ["decision.image_approval"],
        [],
        true,
      ),
      stage(
        "G4A_ASSEMBLY",
        ["media.image_approved"],
        [
          "page.section_graph_resolved",
          "page.section_graph_resolved",
        ],
      ),
    ],
  };
  const engine = createWorkflowEngine({ projectRoot: root, definition });
  await leaseAndSubmit(engine, "S0_INTAKE", ["project.intake"], 1);
  const imageWork = await engine.lease(project("image-producer"), {
    stage_ids: ["G2A_IMAGE"],
  });
  const imageResult = result(
    imageWork,
    ["media.image_approved"],
    2,
  );
  imageResult.output_artifacts[0].member_ids = ["image-a", "image-b"];
  imageResult.output_artifacts[0].members = [
    { member_id: "image-a", member_sha256: HASHES[7] },
    { member_id: "image-b", member_sha256: HASHES[8] },
  ];
  await engine.submit(imageWork.work_order_id, imageResult);
  await leaseAndSubmit(
    engine,
    "G4A_ASSEMBLY",
    [
      "page.section_graph_resolved",
      "page.section_graph_resolved",
    ],
    4,
  );
  const approval = await engine.advance(project("image-approver"));
  assert.equal(approval.kind, "AwaitUser");
  await engine.decide(approval.challenge.challenge_id, {
    project_ref: project("image-approver"),
    nonce: approval.challenge.nonce,
    subject_artifact_set_digest:
      approval.challenge.subject_artifact_set_digest,
    decision: "approved",
    decided_by: "image-approver",
    approval_channel: "workflow-engine-test",
  });
  assert.equal(
    (await engine.inspect(project())).stages.G2U_APPROVAL.status,
    "approved",
  );
  const store = createFileStateStore(root);
  const state = await store.load(project().project_id);
  for (const edge of state.graph.edges.filter(
    (candidate) =>
      candidate.from === "g2a_image-0" &&
      candidate.to.startsWith("g4a_assembly-"),
  )) {
    const branchIndex = edge.to.endsWith("-0") ? 0 : 1;
    edge.from_member_id = branchIndex === 0 ? "image-a" : "image-b";
    edge.from_member_sha256 =
      branchIndex === 0 ? HASHES[7] : HASHES[8];
  }
  await store.save(state.project_id, state);
  const receiptBody = {
    schema_version: "1.0",
    receipt_id: "reject-image-a",
    receipt_type: "revision.member_rejection",
    change_kind: "g2_image_member_rejection",
    decision: "REJECTED",
    gate_stage_id: "G2U_APPROVAL",
    subject: {
      artifact_id: "g2a_image-0",
      manifest_sha256: HASHES[2],
      member_id: "image-a",
      member_sha256: HASHES[7],
    },
    reason_code: "IDENTITY_MISMATCH",
  };
  const change = {
    kind: "g2_image_member_rejection",
    old_artifact: {
      ...receiptBody.subject,
    },
    rejection_receipt: {
      ...receiptBody,
      receipt_sha256: revisionImpactDigest(receiptBody),
    },
  };
  const planned = await createWorkflowEngine({
    projectRoot: root,
    definition,
  }).planRevision(project("revision-planner"), change);
  assert.ok(
    planned.plan.stale_artifact_ids.includes("g4a_assembly-0"),
  );
  assert.ok(
    planned.plan.stale_artifact_ids.some((artifactId) =>
      artifactId.startsWith("decision-g2u_approval-"),
    ),
  );
  assert.deepEqual(
    planned.plan.stale_member_refs.map((item) => item.member_id),
    ["image-a"],
  );
  assert.ok(planned.plan.protected_ids.includes("g2a_image-0#image-b"));

  await createWorkflowEngine({
    projectRoot: root,
    definition,
  }).commitRevision(project("revision-approver"), {
    planDigest: planned.plan_digest,
    decidedBy: "operator-1",
    reason: "image-a만 재생성",
  });
  const after = await createWorkflowEngine({
    projectRoot: root,
    definition,
  }).inspect(project());
  assert.equal(
    after.artifacts.find(
      (artifact) => artifact.artifact_id === "g2a_image-0",
    ).status,
    "partial_stale",
  );
  assert.deepEqual(
    after.artifacts.find(
      (artifact) => artifact.artifact_id === "g2a_image-0",
    ).stale_member_ids,
    ["image-a"],
  );
  assert.equal(
    after.artifacts.find(
      (artifact) => artifact.artifact_id === "g4a_assembly-0",
    ).status,
    "stale",
  );
  assert.equal(
    after.artifacts.find(
      (artifact) => artifact.artifact_id === "g4a_assembly-1",
    ).status,
    "fresh",
  );
  assert.equal(after.stages.G2U_APPROVAL.status, "pending");
});

async function leaseAndSubmit(engine, stageId, outputTypes, hashOffset = 1) {
  const workOrder = await engine.lease(project(`${stageId}-producer`), {
    stage_ids: [stageId],
  });
  assert.equal(workOrder.stage_id, stageId);
  await engine.submit(
    workOrder.work_order_id,
    result(workOrder, outputTypes, hashOffset),
  );
  return workOrder;
}

test("worker lease와 submit 상태는 엔진 재시작 뒤에도 resume된다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = createWorkflowEngine({ projectRoot: root });
  await leaseAndSubmit(first, "S0_INTAKE", ["project.intake"]);

  const second = createWorkflowEngine({ projectRoot: root });
  const status = await second.inspect(project());
  assert.equal(status.stages.S0_INTAKE.status, "completed");
  assert.ok(status.ready_stages.includes("G0A_SUPPLIER"));
  assert.ok(status.ready_stages.includes("G0B_PHOTO"));
  assert.ok(status.ready_stages.includes("G1D_DISCOVERY"));
  assert.ok(status.ready_stages.includes("G1B_KNOWLEDGE"));
  assert.match(
    status.artifacts[0].record_locator,
    /^\.detail-page\/workflow\/artifacts\//,
  );
  assert.match(status.artifacts[0].record_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(status.state_integrity, {
    status: "verified",
    algorithm: "hmac-sha256",
  });
  assert.deepEqual(status.artifact_summary, {
    total_count: 1,
    fresh_count: 1,
    stale_count: 0,
    by_type: { "project.intake": 1 },
  });
  assert.equal("execution_receipt" in status.artifacts[0], false);
  assert.equal("approval_receipt" in status.artifacts[0], false);

  const state = JSON.parse(
    await readFile(
      path.join(
        root,
        ".detail-page",
        "workflow",
        "project-56328525.json",
      ),
      "utf8",
    ),
  );
  const committedArtifact = state.graph.artifacts[0];
  assert.equal(
    committedArtifact.commit_validation_receipt.verdict,
    "PASS",
  );
  assert.equal(
    committedArtifact.commit_validation_receipt.validator
      .agent_session_id,
    "orchestrator-structural-validator",
  );
  const record = JSON.parse(
    await readFile(
      path.join(root, ...committedArtifact.record_locator.split("/")),
      "utf8",
    ),
  );
  assert.equal(
    record.commit_validation_receipt.validation_id,
    committedArtifact.commit_validation_receipt.validation_id,
  );
});

test("leaseFrontier는 준비된 G0 공급처·사진·시장·지식 작업을 worker capacity까지 실제 lease한다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-frontier-lease-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });
  await leaseAndSubmit(engine, "S0_INTAKE", ["project.intake"]);

  const frontier = await engine.leaseFrontier(project("coordinator"), {
    worker_capacity: 4,
    agent_session_ids: [
      "supplier-agent",
      "photo-agent",
      "market-agent",
      "knowledge-agent",
    ],
    stage_ids: [
      "G0A_SUPPLIER",
      "G0B_PHOTO",
      "G1D_DISCOVERY",
      "G1B_KNOWLEDGE",
    ],
  });

  assert.equal(frontier.kind, "FrontierLeased");
  assert.equal(frontier.issued_count, 4);
  assert.equal(frontier.capacity_filled, true);
  assert.deepEqual(
    frontier.work_orders.map((workOrder) => workOrder.stage_id),
    [
      "G0A_SUPPLIER",
      "G0B_PHOTO",
      "G1D_DISCOVERY",
      "G1B_KNOWLEDGE",
    ],
  );
  assert.equal(
    new Set(
      frontier.work_orders.map(
        (workOrder) => workOrder.assigned_agent_session_id,
      ),
    ).size,
    4,
  );
});

test("서로 다른 두 worker의 동시 submit은 lock+CAS retry 뒤 둘 다 state와 graph에 남는다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-concurrent-submit-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });
  await leaseAndSubmit(engine, "S0_INTAKE", ["project.intake"]);
  const frontier = await engine.leaseFrontier(project("coordinator"), {
    worker_capacity: 2,
    agent_session_ids: ["supplier-worker", "photo-worker"],
    stage_ids: ["G0A_SUPPLIER", "G0B_PHOTO"],
  });
  assert.equal(frontier.issued_count, 2);
  const [supplierWork, photoWork] = frontier.work_orders;

  await Promise.all([
    engine.submit(
      supplierWork.work_order_id,
      result(supplierWork, supplierWork.expected_output_types, 2),
    ),
    engine.submit(
      photoWork.work_order_id,
      result(photoWork, photoWork.expected_output_types, 4),
    ),
  ]);

  const state = await createFileStateStore(root).load(
    project().project_id,
  );
  assert.equal(
    state.work_orders[supplierWork.work_order_id].status,
    "completed",
  );
  assert.equal(
    state.work_orders[photoWork.work_order_id].status,
    "completed",
  );
  assert.equal(
    state.graph.artifacts.some(
      (artifact) =>
        artifact.produced_by_stage === "G0A_SUPPLIER",
    ),
    true,
  );
  assert.equal(
    state.graph.artifacts.some(
      (artifact) => artifact.produced_by_stage === "G0B_PHOTO",
    ),
    true,
  );
});

test("실제품 사진 없음 안내는 persistent state에 한 번만 기록되고 inspect·advance에서 반복되지 않는다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-photo-notice-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const firstEngine = createWorkflowEngine({ projectRoot: root });

  const first = await firstEngine.inspect(project("notice-reader"), {
    actual_product_photos_present: false,
  });
  assert.equal(first.notifications.length, 1);
  assert.equal(
    first.notifications[0].event_type,
    "missing_actual_product_photo_notice",
  );
  assert.equal(
    first.workflow_flags.missing_photo_notice_emitted,
    true,
  );
  assert.equal(first.event_summary.count, 1);

  const restarted = createWorkflowEngine({ projectRoot: root });
  const second = await restarted.advance(project("notice-advance"), {
    actual_product_photos_present: false,
  });
  assert.deepEqual(second.notifications, []);
  const third = await restarted.inspect(project("notice-reader-2"), {
    actual_product_photos_present: false,
  });
  assert.deepEqual(third.notifications, []);
  assert.equal(third.event_summary.count, 1);
  assert.deepEqual(third.event_summary.event_ids, [
    "notice-missing-actual-product-photo",
  ]);
});

test("sealed legacy state에 artifact record가 없으면 복구 안내와 함께 fail-closed한다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-engine-missing-record-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = createWorkflowEngine({ projectRoot: root });
  await leaseAndSubmit(first, "S0_INTAKE", ["project.intake"]);

  const store = createFileStateStore(root);
  const state = await store.load(project().project_id);
  delete state.graph.artifacts[0].record_locator;
  delete state.graph.artifacts[0].record_sha256;
  await store.save(project().project_id, state);

  const second = createWorkflowEngine({ projectRoot: root });
  await assert.rejects(
    () => second.inspect(project()),
    (error) =>
      error.code === "ARTIFACT_RECORD_MISSING" &&
      error.details.artifact_id === "s0_intake-0" &&
      /새 workflow run/.test(error.details.recovery),
  );
});

test("stage 계약에 없는 output type은 commit하지 않는다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });
  const workOrder = await engine.lease(project("intake-producer"), {
    stage_ids: ["S0_INTAKE"],
  });

  await assert.rejects(
    engine.submit(
      workOrder.work_order_id,
      result(workOrder, ["evidence.supplier_snapshot"]),
    ),
    (error) => error.code === "OUTPUT_TYPE_MISMATCH",
  );
  assert.equal((await engine.inspect(project())).stages.S0_INTAKE.status, "running");
});

test("ExecutionReceipt adapter는 WorkOrder runner contract와 exact 일치해야 한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });
  const workOrder = await engine.lease(project("intake-producer"), {
    stage_ids: ["S0_INTAKE"],
  });
  const envelope = result(workOrder, ["project.intake"]);
  envelope.execution_receipt.adapter_id = "BypassAdapter";

  await assert.rejects(
    engine.submit(workOrder.work_order_id, envelope),
    (error) => error.code === "EXECUTION_ADAPTER_MISMATCH",
  );
});

test("expired lease는 fencing 후 같은 input으로 다른 agent가 reclaim한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse("2026-07-30T10:00:00.000Z");
  const engine = createWorkflowEngine({
    projectRoot: root,
    clock: () => new Date(now),
    leaseDurationMs: 1_000,
  });

  const first = await engine.lease(project("agent-first"), {
    stage_ids: ["S0_INTAKE"],
  });
  assert.equal(first.attempt, 1);
  assert.match(first.fencing_token, /^fence-/);
  assert.equal(
    first.lease_expires_at,
    "2026-07-30T10:00:01.000Z",
  );

  now += 500;
  const heartbeat = await engine.heartbeat(first.work_order_id, {
    project_ref: project("agent-first"),
    fencing_token: first.fencing_token,
    attempt: first.attempt,
  });
  assert.equal(
    heartbeat.lease_expires_at,
    "2026-07-30T10:00:01.500Z",
  );

  now += 1_100;
  const second = await engine.lease(project("agent-second"), {
    stage_ids: ["S0_INTAKE"],
  });
  assert.equal(second.attempt, 2);
  assert.notEqual(second.fencing_token, first.fencing_token);
  assert.equal(second.input_set_digest, first.input_set_digest);

  await assert.rejects(
    engine.submit(
      first.work_order_id,
      result(first, ["project.intake"]),
    ),
    (error) => error.code === "WORK_ORDER_LEASE_EXPIRED",
  );
  assert.equal(
    (
      await engine.submit(
        second.work_order_id,
        result(second, ["project.intake"]),
      )
    ).kind,
    "Committed",
  );
});

test("G4Q/G5 semantic receipt는 definition quality threshold를 모두 통과해야 한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const qualityPolicy = {
    receipt_required: true,
    min_score: 97,
    min_behance_quality_score: 90,
    min_critical_dimension_score: 85,
    max_deterministic_hard_failures: 0,
  };
  const definition = {
    workflow_id: "quality-fixture",
    version: "1.0.0",
    stages: [
      {
        stage_id: "G4Q_RUBRIC",
        required_inputs: [],
        produces: ["qa.rubric_result"],
        gate_policy_id: "policy.qa.behance-rubric.v1",
        consumers: [],
        input_producers: {},
        any_of_inputs: [],
        output_variants: [],
        repair_target_stages: [],
        validation_policy: qualityPolicy,
        runner_contract: {
          skill_id: "browser-harness",
          adapter_id: "BrowserCaptureAdapter",
        },
        fan_out_key: null,
        user_gate: false,
        mutable_output: false,
      },
    ],
  };
  const engine = createWorkflowEngine({ projectRoot: root, definition });
  const workOrder = await engine.lease(project("rubric-validator"), {
    stage_ids: ["G4Q_RUBRIC"],
  });
  const low = result(workOrder, ["qa.rubric_result"]);
  low.validation_receipt.quality_metrics.behance_quality_score = 89;

  await assert.rejects(
    engine.submit(workOrder.work_order_id, low),
    (error) => error.code === "STAGE_VALIDATION_POLICY_FAILED",
  );

  const passing = result(workOrder, ["qa.rubric_result"]);
  assert.equal(
    (await engine.submit(workOrder.work_order_id, passing)).kind,
    "Committed",
  );
});

test("generic G5 direct 실행은 materialized studio revision 없이 lease조차 받을 수 없다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-g5-direct-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const definition = {
    workflow_id: "g5-direct-bypass-fixture",
    version: "1.0.0",
    stages: [
      {
        stage_id: "G5_PUBLISH_QA",
        required_inputs: [],
        produces: [
          "page.publish_bundle",
          "qa.validation_receipt",
        ],
        gate_policy_id: "policy.qa.publish-97.v1",
        consumers: [],
        input_producers: {},
        any_of_inputs: [],
        output_variants: [],
        repair_target_stages: [],
        validation_policy: {
          receipt_required: true,
          min_score: 97,
          min_behance_quality_score: 90,
          min_critical_dimension_score: 85,
          max_deterministic_hard_failures: 0,
        },
        runner_contract: {
          skill_id: "publish-fixture",
          adapter_id: "GenericPublishQaAdapter",
        },
        fan_out_key: null,
        user_gate: false,
        mutable_output: false,
      },
    ],
  };
  const engine = createWorkflowEngine({
    projectRoot: root,
    definition,
  });
  await assert.rejects(
    engine.lease(project("generic-g5-runner"), {
      stage_ids: ["G5_PUBLISH_QA"],
    }),
    (error) =>
      error.code === "G5_STUDIO_REVISION_REQUIRED",
  );
});

test("inspect와 advance는 graph의 artifact record bytes를 다시 검증한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });
  await leaseAndSubmit(engine, "S0_INTAKE", ["project.intake"]);
  const status = await engine.inspect(project());
  const recordPath = path.join(
    root,
    ...status.artifacts[0].record_locator.split("/"),
  );
  await writeFile(recordPath, "{}\n", "utf8");

  await assert.rejects(
    engine.inspect(project()),
    (error) => error.code === "ARTIFACT_RECORD_INTEGRITY_MISMATCH",
  );
  await assert.rejects(
    engine.advance(project()),
    (error) => error.code === "ARTIFACT_RECORD_INTEGRITY_MISMATCH",
  );
});

test("inspect와 advance는 commit 뒤 evidence·media·HTML member bytes를 다시 해시한다", async (t) => {
  const cases = [
    {
      stage_id: "G0A_SUPPLIER",
      type: "evidence.supplier_snapshot",
      locator: "evidence/supplier/source.json",
    },
    {
      stage_id: "G2A_IMAGE",
      type: "media.image_approved",
      locator: "asset/generated/approved/image/hero.png",
    },
    {
      stage_id: "G4A_ASSEMBLY",
      type: "page.html_revision",
      locator: "html/index.html",
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.type, async (subtest) => {
      const root = await mkdtemp(
        path.join(os.tmpdir(), "workflow-materialized-"),
      );
      subtest.after(() =>
        rm(root, { recursive: true, force: true }),
      );
      const definition = {
        workflow_id: `materialized-${fixture.stage_id}`,
        version: "1.0.0",
        stages: [
          {
            stage_id: fixture.stage_id,
            required_inputs: [],
            produces: [fixture.type],
            gate_policy_id: `policy.${fixture.stage_id}.v1`,
            consumers: [],
            input_producers: {},
            any_of_inputs: [],
            output_variants: [],
            repair_target_stages: [],
            runner_contract: {
              skill_id: "detail-page-maker-skill",
              adapter_id: "FixtureMaterializedAdapter",
            },
            validation_policy: null,
            fan_out_key: null,
            user_gate: false,
            mutable_output: false,
          },
        ],
      };
      const target = path.join(
        root,
        ...fixture.locator.split("/"),
      );
      await mkdir(path.dirname(target), { recursive: true });
      const original = Buffer.from("materialized-original");
      await writeFile(target, original);
      const engine = createWorkflowEngine({
        projectRoot: root,
        definition,
      });
      const workOrder = await engine.lease(
        project(`${fixture.stage_id}-producer`),
        { stage_ids: [fixture.stage_id] },
      );
      const envelope = result(workOrder, [fixture.type], 2);
      const artifact = envelope.output_artifacts[0];
      artifact.member_ids = ["member-file"];
      artifact.member_manifest = {
        schema_version: "1.0",
        policy: "materialized",
        members: [
          {
            member_id: "member-file",
            root_id: "project",
            locator: fixture.locator,
            sha256: sha256(original),
            size_bytes: original.length,
          },
        ],
      };
      await engine.submit(workOrder.work_order_id, envelope);

      const unrelated = path.join(root, "unrelated.tmp");
      await writeFile(unrelated, "not in member manifest", "utf8");
      const cleanStatus = await engine.inspect(project());
      assert.equal(cleanStatus.artifacts[0].status, "fresh");

      await writeFile(target, Buffer.from("Materialized-original"));
      await assert.rejects(
        engine.inspect(project()),
        (error) =>
          error.code === "MATERIALIZED_MEMBER_HASH_MISMATCH",
      );
      await assert.rejects(
        engine.advance(project()),
        (error) =>
          error.code === "MATERIALIZED_MEMBER_HASH_MISMATCH",
      );
    });
  }
});

test("G0Q까지 exact artifact graph가 완성되어야 G0U 승인 challenge가 열린다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });

  await leaseAndSubmit(engine, "S0_INTAKE", ["project.intake"], 1);
  await leaseAndSubmit(
    engine,
    "G0A_SUPPLIER",
    ["evidence.supplier_snapshot", "receipt.importer"],
    2,
  );
  await leaseAndSubmit(engine, "G0B_PHOTO", ["identity.photo_set"], 4);
  await leaseAndSubmit(engine, "G0R_RIGHTS", ["decision.rights_set"], 5);
  await leaseAndSubmit(engine, "G0C_NORMALIZE", ["product.ssot"], 6);

  let progress = await engine.advance(project(), {
    until: "next_user_gate",
  });
  assert.equal(progress.kind, "WorkAvailable");
  assert.ok(progress.ready_stages.includes("G0Q_QA"));

  await leaseAndSubmit(engine, "G0Q_QA", ["qa.validation_receipt"], 7);
  progress = await engine.advance(project(), { until: "next_user_gate" });
  assert.equal(progress.kind, "AwaitUser");
  assert.equal(progress.stage_id, "G0U_APPROVAL");
  assert.match(progress.challenge.subject_artifact_set_digest, /^[a-f0-9]{64}$/);

  await assert.rejects(
    engine.decide(progress.challenge.challenge_id, {
      project_ref: project("G0Q_QA-producer"),
      nonce: progress.challenge.nonce,
      subject_artifact_set_digest:
        progress.challenge.subject_artifact_set_digest,
      decision: "approved",
      decided_by: "same-producer",
      approval_channel: "studio-v1",
    }),
    (error) => error.code === "APPROVER_PRODUCER_NOT_SEPARATED",
  );

  const decision = await engine.decide(progress.challenge.challenge_id, {
    project_ref: project("studio-user"),
    nonce: progress.challenge.nonce,
    subject_artifact_set_digest:
      progress.challenge.subject_artifact_set_digest,
    decision: "approved",
    decided_by: "local-user",
    approval_channel: "studio-v1",
  });
  assert.equal(decision.kind, "Approved");
  assert.equal(
    (await engine.inspect(project())).stages.G0U_APPROVAL.status,
    "approved",
  );
});

test("reject 결정은 승인 artifact를 만들지 않고 해당 gate를 rejected로 고정한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });

  await leaseAndSubmit(engine, "S0_INTAKE", ["project.intake"], 1);
  await leaseAndSubmit(
    engine,
    "G0A_SUPPLIER",
    ["evidence.supplier_snapshot", "receipt.importer"],
    2,
  );
  await leaseAndSubmit(engine, "G0B_PHOTO", ["identity.photo_set"], 4);
  await leaseAndSubmit(engine, "G0R_RIGHTS", ["decision.rights_set"], 5);
  await leaseAndSubmit(engine, "G0C_NORMALIZE", ["product.ssot"], 6);
  await leaseAndSubmit(engine, "G0Q_QA", ["qa.validation_receipt"], 7);
  const awaiting = await engine.advance(project(), {
    until: "next_user_gate",
  });

  const rejected = await engine.decide(awaiting.challenge.challenge_id, {
    project_ref: project("studio-user"),
    nonce: awaiting.challenge.nonce,
    subject_artifact_set_digest:
      awaiting.challenge.subject_artifact_set_digest,
    decision: "rejected",
    decided_by: "local-user",
    approval_channel: "studio-v1",
    reason: "사실 근거를 보완해야 함",
  });

  assert.equal(rejected.kind, "Rejected");
  assert.equal(
    (await engine.inspect(project())).stages.G0U_APPROVAL.status,
    "rejected",
  );
});

test("독립 QA stage는 exact input set ValidationReceipt 없이는 commit하지 않는다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });

  await leaseAndSubmit(engine, "S0_INTAKE", ["project.intake"], 1);
  await leaseAndSubmit(
    engine,
    "G0A_SUPPLIER",
    ["evidence.supplier_snapshot", "receipt.importer"],
    2,
  );
  await leaseAndSubmit(engine, "G0B_PHOTO", ["identity.photo_set"], 4);
  await leaseAndSubmit(engine, "G0R_RIGHTS", ["decision.rights_set"], 5);
  await leaseAndSubmit(engine, "G0C_NORMALIZE", ["product.ssot"], 6);
  const workOrder = await engine.lease(project("qa-session"), {
    stage_ids: ["G0Q_QA"],
  });
  const envelope = result(
    workOrder,
    ["qa.validation_receipt"],
    7,
  );
  delete envelope.validation_receipt;

  await assert.rejects(
    engine.submit(workOrder.work_order_id, envelope),
    (error) => error.code === "INVALID_VALIDATION_RECEIPT",
  );
});

test("producer session은 자신이 만든 artifact의 QA lease 자체를 받을 수 없다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-self-qa-lease-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });

  await leaseAndSubmit(engine, "S0_INTAKE", ["project.intake"], 1);
  await leaseAndSubmit(
    engine,
    "G0A_SUPPLIER",
    ["evidence.supplier_snapshot", "receipt.importer"],
    2,
  );
  await leaseAndSubmit(engine, "G0B_PHOTO", ["identity.photo_set"], 4);
  await leaseAndSubmit(engine, "G0R_RIGHTS", ["decision.rights_set"], 5);
  await leaseAndSubmit(engine, "G0C_NORMALIZE", ["product.ssot"], 6);

  await assert.rejects(
    engine.lease(project("G0C_NORMALIZE-producer"), {
      stage_ids: ["G0Q_QA"],
    }),
    (error) => error.code === "PRODUCER_SELF_QA_FORBIDDEN",
  );
});
