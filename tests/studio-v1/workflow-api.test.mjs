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

import { createProject } from "../../skills/detail-page-maker-skill/scripts/lib/new-project.mjs";
import { artifactSetDigest } from "../../skills/detail-page-maker-skill/scripts/orchestration/artifact-graph.mjs";
import { createArtifactRecordStore } from "../../skills/detail-page-maker-skill/scripts/orchestration/artifact-record-store.mjs";
import { createFileStateStore } from "../../skills/detail-page-maker-skill/scripts/orchestration/file-state-store.mjs";
import { createStructuralValidationReceipt } from "../../skills/detail-page-maker-skill/scripts/orchestration/structural-validation.mjs";
import { createWorkflowEngine } from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-engine.mjs";
import { startStudioV1Server } from "../../skills/detail-page-maker-skill/scripts/runtime/studio-v1-server.mjs";

const INPUT_DIGEST = "a".repeat(64);
const SUBJECT_DIGEST = "b".repeat(64);
const ARTIFACT_HASH = "c".repeat(64);
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl2kAAAAASUVORK5CYII=",
  "base64",
);

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

async function attachFixtureRecords(
  state,
  projectRoot,
  {
    stageId,
    policyId,
    adapterId,
    producerSession,
    artifacts,
  },
) {
  const workOrder = {
    work_order_id: `fixture-${stageId}-${artifacts[0].artifact_id}`,
    stage_id: stageId,
    assigned_agent_session_id: producerSession,
    input_set_digest: "9".repeat(64),
    expected_output_types: artifacts.map((artifact) => artifact.type),
    allowed_output_variants: [],
    gate_policy_id: policyId,
  };
  const commitValidationReceipt =
    createStructuralValidationReceipt({
      workOrder,
      outputArtifacts: artifacts,
      workflowVersion: state.workflow_version,
      createdAt: "2026-07-30T10:00:00.000Z",
    });
  const recordStore = createArtifactRecordStore(projectRoot);
  for (const artifact of artifacts) {
    artifact.producer_agent_session_id = producerSession;
    artifact.commit_validation_receipt =
      structuredClone(commitValidationReceipt);
    const record = await recordStore.commit({
      project_id: state.project_id,
      work_order_id: workOrder.work_order_id,
      stage_id: stageId,
      input_set_digest: workOrder.input_set_digest,
      producer_agent_session_id: producerSession,
      artifact,
      execution_receipt: {
        execution_id: `execution-${workOrder.work_order_id}`,
        adapter_id: adapterId,
        adapter_version: "1.0.0",
        adapter_code_sha256: "8".repeat(64),
      },
      commit_validation_receipt: commitValidationReceipt,
    });
    artifact.record_locator = record.record_locator;
    artifact.record_sha256 = record.record_sha256;
  }
}

async function addVerifiedPublishApproval(
  state,
  projectRoot,
  {
    score = 100,
    behanceQualityScore = 100,
    criticalDimensionScore = 100,
    deterministicHardFailureCount = 0,
    hardFailures = [],
  } = {},
) {
  const publishBundle = {
    artifact_id: "g5-publish-bundle",
    type: "page.publish_bundle",
    manifest_sha256: "1".repeat(64),
    member_ids: ["publish.html"],
    status: "fresh",
    produced_by_stage: "G5_PUBLISH_QA",
  };
  const qaReceipt = {
    artifact_id: "g5-qa-receipt",
    type: "qa.validation_receipt",
    manifest_sha256: "2".repeat(64),
    member_ids: ["validation.json"],
    status: "fresh",
    produced_by_stage: "G5_PUBLISH_QA",
    verdict: "PASS",
    score,
    quality_metrics: {
      behance_quality_score: behanceQualityScore,
      critical_dimension_min_score: criticalDimensionScore,
      deterministic_hard_failure_count:
        deterministicHardFailureCount,
    },
    hard_failures: hardFailures,
  };
  const subjectArtifactSetDigest = artifactSetDigest(
    [publishBundle, qaReceipt].map((artifact) => ({
      artifact_id: artifact.artifact_id,
      manifest_sha256: artifact.manifest_sha256,
      member_ids: artifact.member_ids,
      relation: "evidence_for",
    })),
  );
  const approvalReceipt = {
    project_ref: {
      project_id: state.project_id,
      input_digest: state.input_digest,
      agent_session_id: "studio-v1-user",
    },
    nonce: "nonce-g5-exact",
    subject_artifact_set_digest: subjectArtifactSetDigest,
    decision: "approved",
    decided_by: "local-user",
    approval_channel: "studio-v1",
  };
  const approval = {
    artifact_id: "decision-g5u_approval-exact",
    type: "decision.publish_approval",
    manifest_sha256: sha256(JSON.stringify(approvalReceipt)),
    member_ids: ["decision.json"],
    status: "fresh",
    input_set_digest: subjectArtifactSetDigest,
    produced_by_stage: "G5U_APPROVAL",
    producer_agent_session_id: "studio-v1-user",
    approval_receipt: approvalReceipt,
  };
  await attachFixtureRecords(state, projectRoot, {
    stageId: "G5_PUBLISH_QA",
    policyId: "policy.qa.publish-97.v1",
    adapterId: "WorkflowOrchestratorInternalAdapter",
    producerSession: "g5-publish-producer",
    artifacts: [publishBundle, qaReceipt],
  });
  state.stages.G5U_APPROVAL.status = "approved";
  state.graph.artifacts = [publishBundle, qaReceipt, approval];
  state.graph.edges = [publishBundle, qaReceipt].map((artifact) => ({
    from: artifact.artifact_id,
    to: approval.artifact_id,
    relation: "evidence_for",
  }));
  return state;
}

async function addCommittedStudioRevision(state, projectRoot) {
  const html = [
    "<!doctype html>",
    '<html lang="ko"><body><main>',
    '<section data-section-id="hero"><h1>승인 상세페이지</h1></section>',
    "</main></body></html>",
  ].join("");
  const revisionBody = {
    schema_version: "1.0",
    revision_id: "studio-rev-export-fixture",
    revision_kind: "committed",
    mutable: false,
    artifact_id: "studio-artifact-export-fixture",
    artifact_sha256: "4".repeat(64),
    html_sha256: sha256(html),
    rubric_sha256: "5".repeat(64),
  };
  const revision = {
    ...revisionBody,
    commit_sha256: canonicalSha256(revisionBody),
    committed_at: "2026-07-30T12:00:00.000Z",
  };
  const revisionRoot = path.join(
    projectRoot,
    "studio",
    "revisions",
    revision.revision_id,
  );
  await mkdir(revisionRoot, { recursive: true });
  await writeFile(
    path.join(revisionRoot, "index.html"),
    html,
    "utf8",
  );
  await writeFile(
    path.join(revisionRoot, "revision.json"),
    `${JSON.stringify(revision, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(revisionRoot, "asset-manifest.json"),
    `${JSON.stringify({ schema_version: "1.0", assets: [] }, null, 2)}\n`,
    "utf8",
  );
  const artifact = {
    artifact_id: revision.artifact_id,
    type: "studio.committed_revision",
    manifest_sha256: revision.commit_sha256,
    member_ids: ["revision.json", "index.html"],
    status: "fresh",
    produced_by_stage: "G4C_STUDIO_COMMIT",
  };
  await attachFixtureRecords(state, projectRoot, {
    stageId: "G4C_STUDIO_COMMIT",
    policyId: "policy.studio.commit.v1",
    adapterId: "StudioCommitAdapter",
    producerSession: "studio-commit-producer",
    artifacts: [artifact],
  });
  state.stages.G4C_STUDIO_COMMIT.status = "completed";
  state.graph.artifacts.push(artifact);
  const publishBundle = state.graph.artifacts.find(
    (candidate) => candidate.type === "page.publish_bundle",
  );
  state.graph.edges.push({
    from: artifact.artifact_id,
    to: publishBundle.artifact_id,
    relation: "evidence_for",
  });
  return { revision, revisionRoot, html, artifact };
}

const CAPABILITY_BY_ORIGIN = new Map();

async function requestJson(baseUrl, pathname, body) {
  const capabilityToken = CAPABILITY_BY_ORIGIN.get(
    new URL(baseUrl).origin,
  );
  const response = await fetch(new URL(pathname, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-Detail-Page-Studio-Capability": capabilityToken,
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

async function createRunningStudio(t, { inputField = "inputDigest" } = {}) {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-workflow-api-"),
  );
  const created = await createProject({
    name: "워크플로 API 테스트 상품",
    supplierUrl: "https://supplier.example/123456",
    root: temporaryRoot,
  });
  const projectPath = path.join(created.projectRoot, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  project[inputField] = INPUT_DIGEST;
  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

  const started = await startStudioV1Server({
    projectRoot: created.projectRoot,
    port: 0,
    open: false,
  });
  const baseUrl = new URL(started.url).origin;
  CAPABILITY_BY_ORIGIN.set(baseUrl, started.capabilityToken);
  t.after(async () => {
    await new Promise((resolve, reject) =>
      started.server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  return {
    ...created,
    baseUrl,
    project,
    projectPath,
    workflowStatePath: path.join(
      created.projectRoot,
      ".detail-page",
      "workflow",
      `${project.id}.json`,
    ),
  };
}

test("GET workflow와 POST advance는 project.json id와 inputDigest의 persistent engine을 공유한다", async (t) => {
  const studio = await createRunningStudio(t);

  const first = await requestJson(studio.baseUrl, "/api/v1/workflow");
  assert.equal(first.response.status, 200);
  assert.equal(first.payload.workflow.project_id, studio.project.id);
  assert.equal(first.payload.workflow.input_digest, INPUT_DIGEST);
  assert.ok(first.payload.workflow.ready_stages.includes("S0_INTAKE"));

  const advanced = await requestJson(
    studio.baseUrl,
    "/api/v1/workflow/advance",
    { until: "next_user_gate" },
  );
  assert.equal(advanced.response.status, 200);
  assert.equal(advanced.payload.result.kind, "WorkAvailable");
  assert.deepEqual(advanced.payload.result.ready_stages, ["S0_INTAKE"]);

  const persisted = JSON.parse(
    await readFile(studio.workflowStatePath, "utf8"),
  );
  assert.equal(persisted.project_id, studio.project.id);
  assert.equal(persisted.input_digest, INPUT_DIGEST);
});

test("workflow decision API는 challenge_id와 exact nonce·artifact-set digest만 승인한다", async (t) => {
  const studio = await createRunningStudio(t, {
    inputField: "input_digest",
  });
  await requestJson(studio.baseUrl, "/api/v1/workflow");
  const stateStore = createFileStateStore(studio.projectRoot);
  const state = await stateStore.load(studio.project.id);
  const challengeId = "challenge-studio-exact-proof";
  state.stages.G0U_APPROVAL.status = "awaiting_user";
  state.graph = {
    artifacts: [
      {
        artifact_id: "product-ssot",
        type: "product.ssot",
        manifest_sha256: ARTIFACT_HASH,
        member_ids: ["product.json"],
        status: "fresh",
        produced_by_stage: "G0C_NORMALIZE",
      },
      {
        artifact_id: "g0-validation",
        type: "qa.validation_receipt",
        manifest_sha256: "d".repeat(64),
        member_ids: ["validation.json"],
        status: "fresh",
        produced_by_stage: "G0Q_QA",
      },
    ],
    edges: [],
  };
  await attachFixtureRecords(state, studio.projectRoot, {
    stageId: "G0C_NORMALIZE",
    policyId: "policy.fact-normalization.v1",
    adapterId: "WorkflowOrchestratorInternalAdapter",
    producerSession: "g0-normalize-producer",
    artifacts: [state.graph.artifacts[0]],
  });
  await attachFixtureRecords(state, studio.projectRoot, {
    stageId: "G0Q_QA",
    policyId: "policy.qa.g0.v2",
    adapterId: "WorkflowOrchestratorInternalAdapter",
    producerSession: "g0-qa-producer",
    artifacts: [state.graph.artifacts[1]],
  });
  state.challenges[challengeId] = {
    challenge_id: challengeId,
    project_id: studio.project.id,
    stage_id: "G0U_APPROVAL",
    nonce: "nonce-exact-once",
    subject_artifact_ids: ["product-ssot", "g0-validation"],
    subject_artifact_set_digest: SUBJECT_DIGEST,
    status: "awaiting_user",
    created_at: "2026-07-30T00:00:00.000Z",
  };
  await stateStore.save(studio.project.id, state);

  const wrongNonce = await requestJson(
    studio.baseUrl,
    "/api/v1/workflow/decision",
    {
      challenge_id: challengeId,
      nonce: "nonce-wrong",
      subject_artifact_set_digest: SUBJECT_DIGEST,
      decision: "approved",
    },
  );
  assert.equal(wrongNonce.response.status, 409);
  assert.equal(wrongNonce.payload.error.code, "INVALID_NONCE");

  const wrongDigest = await requestJson(
    studio.baseUrl,
    "/api/v1/workflow/decision",
    {
      challenge_id: challengeId,
      nonce: "nonce-exact-once",
      subject_artifact_set_digest: "f".repeat(64),
      decision: "approved",
    },
  );
  assert.equal(wrongDigest.response.status, 409);
  assert.equal(wrongDigest.payload.error.code, "APPROVAL_DIGEST_MISMATCH");

  const approved = await requestJson(
    studio.baseUrl,
    "/api/v1/workflow/decision",
    {
      challenge_id: challengeId,
      nonce: "nonce-exact-once",
      subject_artifact_set_digest: SUBJECT_DIGEST,
      decision: "approved",
    },
  );
  assert.equal(approved.response.status, 200);
  assert.equal(approved.payload.result.kind, "Approved");
  assert.equal(approved.payload.result.stage_id, "G0U_APPROVAL");

  const status = await requestJson(studio.baseUrl, "/api/v1/workflow");
  assert.equal(
    status.payload.workflow.stages.G0U_APPROVAL.status,
    "approved",
  );
});

test("legacy finalQa 사용자 flag만으로 Wing을 열지 않고 G5U approved·fresh를 요구한다", async (t) => {
  const studio = await createRunningStudio(t);
  const project = JSON.parse(await readFile(studio.projectPath, "utf8"));
  project.finalQa = {
    status: "passed",
    score: 100,
    hardFailures: [],
    warnings: [],
    userApproved: true,
    reportPath: null,
  };
  await writeFile(
    studio.projectPath,
    `${JSON.stringify(project, null, 2)}\n`,
    "utf8",
  );
  await requestJson(studio.baseUrl, "/api/v1/workflow");

  const legacyOnly = await requestJson(studio.baseUrl, "/api/v1/gate");
  assert.equal(legacyOnly.response.status, 200);
  assert.equal(legacyOnly.payload.legacyUserPublishApproved, true);
  assert.equal(legacyOnly.payload.workflowPublishApproved, false);
  assert.equal(legacyOnly.payload.coupangWingExportAllowed, false);
  assert.ok(
    legacyOnly.payload.coupangWingBlockers.some((item) =>
      item.includes("G5U_APPROVAL"),
    ),
  );

  const blockedExport = await requestJson(
    studio.baseUrl,
    "/api/v1/exports/coupang-wing",
    { cdnBaseUrl: "https://cdn.example.com/product" },
  );
  assert.equal(blockedExport.response.status, 409);
  assert.equal(
    blockedExport.payload.error.code,
    "COUPANG_WING_EXPORT_BLOCKED",
  );

  const stateStore = createFileStateStore(studio.projectRoot);
  const sealedStateBytes = await readFile(
    studio.workflowStatePath,
    "utf8",
  );
  const tamperedState = JSON.parse(sealedStateBytes);
  tamperedState.stages.G5U_APPROVAL.status = "approved";
  await writeFile(
    studio.workflowStatePath,
    `${JSON.stringify(tamperedState, null, 2)}\n`,
    "utf8",
  );

  const tampered = await requestJson(studio.baseUrl, "/api/v1/gate");
  assert.equal(tampered.payload.workflowPublishApproved, false);
  assert.equal(tampered.payload.coupangWingExportAllowed, false);
  assert.equal(
    tampered.payload.workflowError.code,
    "STATE_INTEGRITY_MISMATCH",
  );

  await writeFile(
    studio.workflowStatePath,
    sealedStateBytes,
    "utf8",
  );
  const state = await stateStore.load(studio.project.id);
  state.stages.G5U_APPROVAL.status = "approved";
  await stateStore.save(studio.project.id, state);
  const statusOnly = await requestJson(studio.baseUrl, "/api/v1/gate");
  assert.equal(statusOnly.payload.workflowStateIntegrity, "verified");
  assert.equal(statusOnly.payload.workflowStageStatus, "approved");
  assert.equal(statusOnly.payload.workflowPublishApprovalStatus, "missing");
  assert.equal(statusOnly.payload.workflowPublishApproved, false);
  assert.equal(statusOnly.payload.coupangWingExportAllowed, false);

  await addVerifiedPublishApproval(state, studio.projectRoot);
  state.graph.artifacts.push({
    artifact_id: "stale-old-export",
    type: "page.publish_bundle",
    manifest_sha256: ARTIFACT_HASH,
    member_ids: ["old.html"],
    status: "stale",
    produced_by_stage: "G5_PUBLISH_QA",
  });
  await attachFixtureRecords(state, studio.projectRoot, {
    stageId: "G5_PUBLISH_QA",
    policyId: "policy.qa.publish-97.v1",
    adapterId: "WorkflowOrchestratorInternalAdapter",
    producerSession: "g5-publish-producer",
    artifacts: [state.graph.artifacts.at(-1)],
  });
  await stateStore.save(studio.project.id, state);

  const stale = await requestJson(studio.baseUrl, "/api/v1/gate");
  assert.equal(stale.payload.workflowPublishApproved, true);
  assert.equal(stale.payload.workflowPublishApprovalStatus, "verified");
  assert.equal(stale.payload.workflowFresh, false);
  assert.equal(stale.payload.coupangWingExportAllowed, false);
  assert.ok(
    stale.payload.coupangWingBlockers.some((item) => item.includes("stale")),
  );

  state.graph.artifacts = state.graph.artifacts.filter(
    (artifact) => artifact.artifact_id !== "stale-old-export",
  );
  await stateStore.save(studio.project.id, state);
  const ready = await requestJson(studio.baseUrl, "/api/v1/gate");
  assert.equal(ready.payload.workflowPublishApproved, true);
  assert.equal(ready.payload.workflowFresh, true);
  assert.equal(ready.payload.coupangWingExportAllowed, true);
  assert.equal(ready.payload.userPublishApproved, true);

  const publishBundle = state.graph.artifacts.find(
    (artifact) => artifact.type === "page.publish_bundle",
  );
  const publishRecordPath = path.join(
    studio.projectRoot,
    ...publishBundle.record_locator.split("/"),
  );
  const publishRecordBytes = await readFile(publishRecordPath);
  await writeFile(publishRecordPath, "{}\n", "utf8");
  const tamperedWorkflow = await requestJson(
    studio.baseUrl,
    "/api/v1/workflow",
  );
  assert.equal(tamperedWorkflow.response.status, 409);
  assert.equal(
    tamperedWorkflow.payload.error.code,
    "ARTIFACT_RECORD_INTEGRITY_MISMATCH",
  );
  const tamperedRecord = await requestJson(
    studio.baseUrl,
    "/api/v1/gate",
  );
  assert.equal(tamperedRecord.payload.workflowPublishApproved, false);
  assert.equal(tamperedRecord.payload.coupangWingExportAllowed, false);
  assert.equal(
    tamperedRecord.payload.workflowError.code,
    "ARTIFACT_RECORD_INTEGRITY_MISMATCH",
  );
  await writeFile(publishRecordPath, publishRecordBytes);

  const publishApproval = state.graph.artifacts.find(
    (artifact) => artifact.type === "decision.publish_approval",
  );
  publishApproval.approval_receipt.project_ref.agent_session_id =
    "g5-publish-producer";
  publishApproval.producer_agent_session_id =
    "g5-publish-producer";
  publishApproval.manifest_sha256 = sha256(
    JSON.stringify(publishApproval.approval_receipt),
  );
  await stateStore.save(studio.project.id, state);
  const sameProducer = await requestJson(
    studio.baseUrl,
    "/api/v1/gate",
  );
  assert.equal(
    sameProducer.payload.workflowPublishApprovalStatus,
    "approver_producer_not_separated",
  );
  assert.equal(sameProducer.payload.workflowPublishApproved, false);
  assert.equal(sameProducer.payload.coupangWingExportAllowed, false);
});

test("legacy unsealed workflow는 inspect 가능하지만 publish에는 사용할 수 없다", async (t) => {
  const studio = await createRunningStudio(t);
  const project = JSON.parse(await readFile(studio.projectPath, "utf8"));
  project.finalQa = {
    status: "passed",
    score: 100,
    hardFailures: [],
    warnings: [],
    userApproved: true,
    reportPath: null,
  };
  await writeFile(
    studio.projectPath,
    `${JSON.stringify(project, null, 2)}\n`,
    "utf8",
  );
  const legacySourceRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-legacy-state-source-"),
  );
  t.after(() =>
    rm(legacySourceRoot, { recursive: true, force: true }),
  );
  const legacySourceEngine = createWorkflowEngine({
    projectRoot: legacySourceRoot,
  });
  await legacySourceEngine.inspect({
    project_id: studio.project.id,
    input_digest: INPUT_DIGEST,
    agent_session_id: "legacy-source",
  });
  const state = JSON.parse(
    await readFile(
      path.join(
        legacySourceRoot,
        ".detail-page",
        "workflow",
        `${studio.project.id}.json`,
      ),
      "utf8",
    ),
  );
  delete state._state_seal;
  await addVerifiedPublishApproval(state, studio.projectRoot);
  await mkdir(path.dirname(studio.workflowStatePath), {
    recursive: true,
  });
  await writeFile(
    studio.workflowStatePath,
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );

  const gate = await requestJson(studio.baseUrl, "/api/v1/gate");
  assert.equal(gate.response.status, 200);
  assert.equal(gate.payload.workflowStateIntegrity, "legacy_unsealed");
  assert.equal(gate.payload.workflowPublishApprovalStatus, "verified");
  assert.equal(gate.payload.workflowPublishApproved, false);
  assert.equal(gate.payload.coupangWingExportAllowed, false);
});

test("일반 HTML export는 sealed G5 proof와 exact immutable Studio revision만 전달본으로 만든다", async (t) => {
  const studio = await createRunningStudio(t);
  await requestJson(studio.baseUrl, "/api/v1/workflow");
  const stateStore = createFileStateStore(studio.projectRoot);
  const state = await stateStore.load(studio.project.id);
  await addVerifiedPublishApproval(state, studio.projectRoot);
  const committed = await addCommittedStudioRevision(
    state,
    studio.projectRoot,
  );
  await stateStore.save(studio.project.id, state);

  const gate = await requestJson(studio.baseUrl, "/api/v1/gate");
  assert.equal(gate.payload.publishQualityStatus, "verified");
  assert.equal(gate.payload.htmlExportAllowed, true);
  assert.match(gate.payload.workflowGraphDigest, /^[a-f0-9]{64}$/);
  assert.match(
    gate.payload.workflowPublishApprovalSubjectDigest,
    /^[a-f0-9]{64}$/,
  );

  const saved = await requestJson(
    studio.baseUrl,
    "/api/v1/output/save",
    { html: committed.html },
  );
  assert.equal(saved.response.status, 200);
  assert.equal(saved.payload.wing_export_required, true);

  const exported = await requestJson(
    studio.baseUrl,
    "/api/v1/exports/html",
    {},
  );
  assert.equal(exported.response.status, 200);
  assert.equal(exported.payload.result.status, "ready");
  assert.equal(
    exported.payload.result.output_path,
    "output/detail-page.html",
  );
  assert.equal(
    exported.payload.result.manifest_path,
    "output/export-manifest.json",
  );
  const publicHtml = await readFile(
    path.join(studio.projectRoot, "output", "detail-page.html"),
    "utf8",
  );
  assert.match(
    publicHtml,
    /승인 상세페이지/,
  );
  assert.doesNotMatch(publicHtml, /\sdata-[\w:-]+=/i);
  const exportManifest = JSON.parse(
    await readFile(
      path.join(studio.projectRoot, "output", "export-manifest.json"),
      "utf8",
    ),
  );
  assert.equal(exportManifest.export_type, "public-detail-page-html");
  assert.equal(
    exportManifest.revision_id,
    committed.revision.revision_id,
  );
  assert.equal(exportManifest.output.path, "output/detail-page.html");
  assert.match(exportManifest.output.sha256, /^[a-f0-9]{64}$/);
  assert.match(exportManifest.manifest_sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(
    readFile(path.join(studio.projectRoot, "deliverables")),
  );

  const reused = await requestJson(
    studio.baseUrl,
    "/api/v1/exports/html",
    {},
  );
  assert.equal(reused.response.status, 200);
  assert.equal(
    reused.payload.result.manifest.output.sha256,
    exported.payload.result.manifest.output.sha256,
  );

  committed.artifact.status = "stale";
  await stateStore.save(studio.project.id, state);
  const stale = await requestJson(
    studio.baseUrl,
    "/api/v1/exports/html",
    {},
  );
  assert.equal(stale.response.status, 409);
  assert.equal(stale.payload.error.code, "HTML_EXPORT_BLOCKED");
});

test("일반 HTML과 Wing 공통 gate는 97/90/85/hard0 각각의 미달을 차단한다", async (t) => {
  const cases = [
    {
      name: "publish score",
      quality: { score: 96 },
      blocker: "97점",
    },
    {
      name: "Behance quality",
      quality: { behanceQualityScore: 89 },
      blocker: "Behance quality 90점",
    },
    {
      name: "critical dimension",
      quality: { criticalDimensionScore: 84 },
      blocker: "critical dimension 85점",
    },
    {
      name: "hard failure",
      quality: {
        deterministicHardFailureCount: 1,
        hardFailures: ["IDENTITY"],
      },
      blocker: "hard failure",
    },
  ];
  for (const item of cases) {
    await t.test(item.name, async (t) => {
      const studio = await createRunningStudio(t);
      await requestJson(studio.baseUrl, "/api/v1/workflow");
      const stateStore = createFileStateStore(
        studio.projectRoot,
      );
      const state = await stateStore.load(studio.project.id);
      await addVerifiedPublishApproval(
        state,
        studio.projectRoot,
        item.quality,
      );
      await addCommittedStudioRevision(
        state,
        studio.projectRoot,
      );
      await stateStore.save(studio.project.id, state);

      const gate = await requestJson(
        studio.baseUrl,
        "/api/v1/gate",
      );
      assert.equal(gate.payload.publishExportAllowed, false);
      assert.equal(gate.payload.htmlExportAllowed, false);
      assert.equal(gate.payload.coupangWingExportAllowed, false);
      assert.ok(
        gate.payload.coupangWingBlockers.some((blocker) =>
          blocker.includes(item.blocker),
        ),
      );
      const html = await requestJson(
        studio.baseUrl,
        "/api/v1/exports/html",
        {},
      );
      assert.equal(html.response.status, 409);
      assert.equal(html.payload.error.code, "HTML_EXPORT_BLOCKED");
    });
  }
});

test("legacy asset decision은 호환되지만 workflow stage 승인을 대신하지 않는다고 반환한다", async (t) => {
  const studio = await createRunningStudio(t);
  const pendingRelative =
    ".detail-page/generation/pending/image/03-flex-hybrid-v01.png";
  await writeFile(
    path.join(studio.projectRoot, pendingRelative),
    ONE_PIXEL_PNG,
  );

  const decided = await requestJson(
    studio.baseUrl,
    "/api/v1/assets/decision",
    {
      relativePath: pendingRelative,
      decision: "approved",
      confirmedByUser: true,
    },
  );
  assert.equal(decided.response.status, 200);
  assert.equal(decided.payload.asset.status, "approved");
  assert.deepEqual(decided.payload.workflowApproval, {
    substitutesStageApproval: false,
    ledgerScope: "asset-file-only",
    requiredStages: [
      "G2U_APPROVAL",
      "G3U_APPROVAL",
      "G4U_APPROVAL",
      "G5U_APPROVAL",
    ],
  });
  assert.equal(decided.payload.gate.workflowPublishApproved, false);
});
