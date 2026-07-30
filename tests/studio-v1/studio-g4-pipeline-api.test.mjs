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
import { deflateSync } from "node:zlib";

import { createProject } from "../../skills/detail-page-maker-skill/scripts/lib/new-project.mjs";
import { createArtifactRecordStore } from "../../skills/detail-page-maker-skill/scripts/orchestration/artifact-record-store.mjs";
import { createFileStateStore } from "../../skills/detail-page-maker-skill/scripts/orchestration/file-state-store.mjs";
import { createStructuralValidationReceipt } from "../../skills/detail-page-maker-skill/scripts/orchestration/structural-validation.mjs";
import { createWorkflowEngine } from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-engine.mjs";
import { startStudioV1Server } from "../../skills/detail-page-maker-skill/scripts/runtime/studio-v1-server.mjs";
import {
  attachValidHeroAssurance,
} from "../helpers/hero-assurance-fixture.mjs";

const POLICY_URL = new URL(
  "../../skills/detail-page-maker-skill/policies/behance-commerce-v0.1.json",
  import.meta.url,
);
const INPUT_DIGEST = "a".repeat(64);
const CAPABILITY_BY_ORIGIN = new Map();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

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

async function attachRecord(
  state,
  projectRoot,
  { stageId, policyId, adapterId, producerSession, artifact },
) {
  const workOrder = {
    work_order_id: `fixture-${stageId}-${artifact.artifact_id}`,
    stage_id: stageId,
    assigned_agent_session_id: producerSession,
    input_set_digest: "9".repeat(64),
    expected_output_types: [artifact.type],
    allowed_output_variants: [],
    gate_policy_id: policyId,
  };
  const receipt = createStructuralValidationReceipt({
    workOrder,
    outputArtifacts: [artifact],
    workflowVersion: state.workflow_version,
    createdAt: "2026-07-30T10:00:00.000Z",
  });
  artifact.producer_agent_session_id = producerSession;
  artifact.commit_validation_receipt = structuredClone(receipt);
  const record = await createArtifactRecordStore(projectRoot).commit({
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
    commit_validation_receipt: receipt,
  });
  artifact.record_locator = record.record_locator;
  artifact.record_sha256 = record.record_sha256;
}

function html(copy) {
  return `<!doctype html>
<html lang="ko"><body>
<main>
  <section data-section-id="section-hero">
    <h2 data-copy-id="copy-hero" data-claim-id="claim-fast">${copy}</h2>
    <figure data-slot-id="slot-hero" data-artifact-id="image-approved-001">
      <img src="assets/hero.bin" alt="제품">
    </figure>
  </section>
</main>
</body></html>`;
}

function editableContract(currentHtml, copy) {
  return attachValidHeroAssurance({
    resolved_section_graph: {
      graph_id: "resolved-graph-studio-pipeline",
      sections: [
        {
          section_id: "section-hero",
          role: "hero",
          html_copy: [copy],
          claims: [
            {
              claim_id: "claim-fast",
              html_copy: [copy],
            },
          ],
          media_slots: [
            {
              slot_id: "slot-hero",
              kind: "image",
              approved_artifact_id: "image-approved-001",
              embedded_text_policy: "none",
            },
          ],
        },
      ],
    },
    approved_artifacts: [
      {
        artifact_id: "image-approved-001",
        approval_status: "approved",
        copy_embedded: false,
      },
    ],
    html: currentHtml,
  }, {
    heroArtifactSha256: sha256(
      Buffer.from("approved-product-image\n", "utf8"),
    ),
  });
}

function rubricResult(
  definition,
  subject,
  viewportCaptureIds,
  { score = 100, suffix = "pass" } = {},
) {
  const evaluatorKinds = [
    ...new Set(definition.dimensions.map((item) => item.validator_kind)),
  ];
  const evaluators = evaluatorKinds.map((kind) => ({
    evaluator_id: `${kind}-validator`,
    validator_kind: kind,
    code_sha256: "6".repeat(64),
    model_id: kind === "model" ? "pinned-visual-model" : null,
    prompt_sha256: kind === "model" ? "7".repeat(64) : null,
  }));
  return {
    schema_version: "1.0",
    result_id: `rubric-${suffix}-${subject.manifest_sha256.slice(0, 16)}`,
    rubric_id: definition.rubric_id,
    rubric_version: definition.version,
    rubric_sha256: definition.rubric_sha256,
    subject: structuredClone(subject),
    benchmark_sha256: definition.source_snapshot.sha256,
    evaluators,
    viewport_capture_ids: [...viewportCaptureIds],
    score,
    checks: definition.dimensions.map((dimension) => ({
      check_id: `${suffix}-${dimension.dimension_id}`,
      dimension_id: dimension.dimension_id,
      evaluator_kind: dimension.validator_kind,
      evaluator_id: `${dimension.validator_kind}-validator`,
      issue_code: null,
      section_id: "section-hero",
      status: "PASS",
      severity: "info",
      score: 100,
      confidence: 1,
      evidence_artifact_ids: [...viewportCaptureIds],
      evidence_locators: viewportCaptureIds.map(
        (captureId) => `artifact://${captureId}`,
      ),
    })),
    evaluated_at: "2026-07-30T12:00:00.000Z",
  };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function createPng(width, height) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const scanlines = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function materializeCaptureExecution(projectRoot, planned) {
  const outputRoot = planned.work_order.output_root;
  await mkdir(outputRoot, { recursive: true });
  const captures = [];
  for (const expected of planned.work_order.captures) {
    const height = 1100 + expected.viewport.width;
    const physicalWidth =
      expected.viewport.width * expected.viewport.device_scale_factor;
    const physicalHeight =
      height * expected.viewport.device_scale_factor;
    const bytes = createPng(physicalWidth, physicalHeight);
    await writeFile(
      path.join(outputRoot, expected.relative_path),
      bytes,
    );
    const digest = sha256(bytes);
    captures.push({
      capture_id: expected.capture_id,
      capture_set_id: expected.capture_set_id,
      relative_path: expected.relative_path,
      viewport: structuredClone(expected.viewport),
      full_page: true,
      background_focus: false,
      recording_locator: path.join(
        projectRoot,
        "qa",
        "recordings",
        planned.work_order.recording.name,
      ),
      png_sha256: digest,
      png_bytes: bytes.length,
      png_width: physicalWidth,
      png_height: physicalHeight,
      no_overflow: {
        status: "PASS",
        viewport_width: expected.viewport.width,
        document_client_width: expected.viewport.width,
        document_scroll_width: expected.viewport.width,
        body_scroll_width: expected.viewport.width,
        offender_count: 0,
        offenders: [],
        focus_observed: false,
      },
      stable_frame: {
        status: "PASS",
        sample_interval_ms: 250,
        first_png_sha256: digest,
        second_png_sha256: digest,
        reduced_motion: true,
        web_animations_paused: true,
        css_transitions_disabled: true,
      },
    });
  }
  return {
    schema_version: "1.0",
    receipt_type: "browser_harness.capture_execution",
    work_order_sha256: planned.work_order.work_order_sha256,
    command_plan_sha256:
      planned.command_plan.command_plan_sha256,
    capture_set_id: planned.work_order.capture_set_id,
    subject: structuredClone(planned.work_order.subject),
    browser_harness: structuredClone(
      planned.work_order.browser_harness,
    ),
    recording: {
      required: true,
      name: planned.work_order.recording.name,
      locator: captures[0].recording_locator,
    },
    captures,
    completed_at: "2026-07-30T12:10:00.000Z",
  };
}

async function createRunningFixture(t) {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "studio-g4-api-"),
  );
  const created = await createProject({
    name: "Studio G4 API 통합 테스트",
    supplierUrl: "https://supplier.example/product",
    root: temporaryRoot,
  });
  const projectPath = path.join(created.projectRoot, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  project.inputDigest = INPUT_DIGEST;
  await writeFile(
    projectPath,
    `${JSON.stringify(project, null, 2)}\n`,
    "utf8",
  );

  const sourceCopy = "원본 제품 문구";
  const workingCopy = "Studio에서 편집한 문구";
  const sourceHtml = html(sourceCopy);
  const currentHtml = html(workingCopy);
  const assemblyRoot = path.join(
    created.projectRoot,
    "html",
    "assembly-source",
  );
  const workingRoot = path.join(
    created.projectRoot,
    "studio",
    "working",
    "studio-working-e2e",
  );
  const assetBytes = Buffer.from("approved-product-image\n", "utf8");
  const assetManifest = {
    schema_version: "1.0",
    assets: [
      {
        artifact_id: "image-approved-001",
        path: "assets/hero.bin",
        bytes: assetBytes.length,
        sha256: sha256(assetBytes),
        approval_status: "approved",
        production_use_allowed: true,
      },
    ],
  };
  const assetManifestBytes =
    `${JSON.stringify(assetManifest, null, 2)}\n`;
  const assemblyManifest = {
    schema_version: "1.0",
    artifact_id: "assembly-artifact-e2e",
    html_sha256: sha256(sourceHtml),
    asset_manifest_sha256: sha256(assetManifestBytes),
  };
  const assemblyManifestBytes =
    `${JSON.stringify(assemblyManifest, null, 2)}\n`;
  await Promise.all([
    mkdir(assemblyRoot, { recursive: true }),
    mkdir(path.join(workingRoot, "assets"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(assemblyRoot, "index.html"), sourceHtml, "utf8"),
    writeFile(
      path.join(assemblyRoot, "manifest.json"),
      assemblyManifestBytes,
      "utf8",
    ),
    writeFile(path.join(workingRoot, "index.html"), currentHtml, "utf8"),
    writeFile(
      path.join(workingRoot, "asset-manifest.json"),
      assetManifestBytes,
      "utf8",
    ),
    writeFile(path.join(workingRoot, "assets", "hero.bin"), assetBytes),
  ]);
  const assembly = {
    artifact_id: assemblyManifest.artifact_id,
    manifest_path: path.join(assemblyRoot, "manifest.json"),
    manifest_sha256: sha256(assemblyManifestBytes),
    html_path: path.join(assemblyRoot, "index.html"),
    html_sha256: sha256(sourceHtml),
    asset_manifest_sha256: sha256(assetManifestBytes),
  };
  const workingState = {
    working_id: "studio-working-e2e",
    root: workingRoot,
    imported_assembly_artifact_id: assembly.artifact_id,
    imported_assembly_manifest_sha256: assembly.manifest_sha256,
    imported_html_sha256: assembly.html_sha256,
    producer_agent_session_id: "studio-editor-e2e",
  };
  const rubricDefinition = JSON.parse(
    await readFile(POLICY_URL, "utf8"),
  );

  const started = await startStudioV1Server({
    projectRoot: created.projectRoot,
    port: 0,
    open: false,
  });
  t.after(async () => {
    await new Promise((resolve, reject) =>
      started.server.close((error) =>
        error ? reject(error) : resolve(),
      ),
    );
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  const baseUrl = new URL(started.url).origin;
  CAPABILITY_BY_ORIGIN.set(baseUrl, started.capabilityToken);
  await requestJson(baseUrl, "/api/v1/workflow");
  const stateStore = createFileStateStore(created.projectRoot);
  const state = await stateStore.load(project.id);
  const pageArtifact = {
    artifact_id: assembly.artifact_id,
    type: "page.html_revision",
    manifest_sha256: assembly.manifest_sha256,
    member_ids: ["index.html", "manifest.json"],
    status: "fresh",
    produced_by_stage: "G4A_ASSEMBLY",
  };
  const preStudioRubric = {
    artifact_id: "rubric-pre-studio-e2e",
    type: "qa.rubric_result",
    manifest_sha256: "4".repeat(64),
    member_ids: ["rubric-result.json"],
    status: "fresh",
    produced_by_stage: "G4Q0_PRE_STUDIO_QA",
  };
  await attachRecord(state, created.projectRoot, {
    stageId: "G4A_ASSEMBLY",
    policyId: "policy.html.assembly.v1",
    adapterId: "HtmlAssemblyAdapter",
    producerSession: "assembly-producer-e2e",
    artifact: pageArtifact,
  });
  await attachRecord(state, created.projectRoot, {
    stageId: "G4Q0_PRE_STUDIO_QA",
    policyId: "policy.qa.pre-studio.v1",
    adapterId: "BrowserCaptureAdapter",
    producerSession: "pre-studio-qa-e2e",
    artifact: preStudioRubric,
  });
  state.stages.G4A_ASSEMBLY.status = "completed";
  state.stages.G4Q0_PRE_STUDIO_QA.status = "completed";
  state.graph.artifacts = [pageArtifact, preStudioRubric];
  state.graph.edges = [];
  await stateStore.save(project.id, state);
  return {
    ...created,
    project,
    projectPath,
    baseUrl,
    assembly,
    workingState,
    workingRoot,
    currentHtml,
    workingCopy,
    rubricDefinition,
    stateStore,
  };
}

test("Studio v1 API가 320·360 내부 QA와 390@2x 전달 캡처를 사용한다", async (t) => {
  const fixture = await createRunningFixture(t);
  const imported = await requestJson(
    fixture.baseUrl,
    "/api/v1/studio/working/import",
    {
      session_id: "studio-session-e2e",
      editor_session_id: "studio-editor-e2e",
      commit_session_id: "studio-commit-e2e",
      validator_session_id: "studio-validator-e2e",
      assembly: fixture.assembly,
      working_state: fixture.workingState,
      editable_html_contract: editableContract(
        fixture.currentHtml,
        fixture.workingCopy,
      ),
    },
  );
  assert.equal(imported.response.status, 200);
  assert.equal(imported.payload.session.status, "working");

  const conflict = await requestJson(
    fixture.baseUrl,
    "/api/v1/studio/working/save",
    {
      session_id: "studio-session-e2e",
      expected_working_snapshot_digest: "f".repeat(64),
      html: fixture.currentHtml,
      editable_html_contract: editableContract(
        fixture.currentHtml,
        fixture.workingCopy,
      ),
    },
  );
  assert.equal(conflict.response.status, 409);
  assert.equal(
    conflict.payload.error.code,
    "STUDIO_WORKING_SNAPSHOT_CONFLICT",
  );

  const savedCopy = "저장 후에도 다시 수정 가능한 문구";
  const savedHtml = html(savedCopy);
  const saved = await requestJson(
    fixture.baseUrl,
    "/api/v1/studio/working/save",
    {
      session_id: "studio-session-e2e",
      expected_working_snapshot_digest:
        imported.payload.session.working_snapshot_digest,
      html: savedHtml,
      editable_html_contract: editableContract(savedHtml, savedCopy),
    },
  );
  assert.equal(saved.response.status, 200);
  const snapshotDigest =
    saved.payload.session.working_snapshot_digest;

  const precommitSubject = {
    artifact_id: fixture.workingState.working_id,
    manifest_sha256: snapshotDigest,
  };
  const lowRubric = rubricResult(
    fixture.rubricDefinition,
    precommitSubject,
    ["pre-capture-320", "pre-capture-360", "pre-capture-390"],
    { score: 96, suffix: "low" },
  );
  const blocked = await requestJson(
    fixture.baseUrl,
    "/api/v1/studio/commit",
    {
      session_id: "studio-session-e2e",
      expected_working_snapshot_digest: snapshotDigest,
      rubric_definition: fixture.rubricDefinition,
      precommit_rubric_result: lowRubric,
      browser_harness: {
        executable: "browser-harness",
        version: "0.1.8-test",
        code_sha256: "c".repeat(64),
      },
    },
  );
  assert.equal(blocked.response.status, 409);
  assert.equal(blocked.payload.error.code, "STUDIO_RUBRIC_GATE_BLOCKED");

  const precommitRubric = rubricResult(
    fixture.rubricDefinition,
    precommitSubject,
    ["pre-capture-320", "pre-capture-360", "pre-capture-390"],
    { suffix: "precommit" },
  );
  const committed = await requestJson(
    fixture.baseUrl,
    "/api/v1/studio/commit",
    {
      session_id: "studio-session-e2e",
      expected_working_snapshot_digest: snapshotDigest,
      rubric_definition: fixture.rubricDefinition,
      precommit_rubric_result: precommitRubric,
      browser_harness: {
        executable: "browser-harness",
        version: "0.1.8-test",
        code_sha256: "c".repeat(64),
      },
    },
  );
  assert.equal(
    committed.response.status,
    200,
    JSON.stringify(committed.payload),
  );
  assert.equal(committed.payload.revision.mutable, false);
  const committedState = await fixture.stateStore.load(
    fixture.project.id,
  );
  const committedGraphArtifact =
    committedState.graph.artifacts.find(
      (artifact) =>
        artifact.type === "studio.committed_revision",
    );
  for (const field of [
    "hero_assurance_bundle_sha256",
    "hero_assurance_manifest_sha256",
    "hero_identity_validation_receipt_sha256",
    "hero_commercial_validation_receipt_sha256",
    "hero_assurance_validation_receipt_sha256",
  ]) {
    assert.match(committedGraphArtifact[field], /^[a-f0-9]{64}$/);
  }
  assert.equal(
    committedGraphArtifact.hero_assurance_member.member_id,
    "hero-assurance.json",
  );
  const committedRecord = JSON.parse(
    await readFile(
      path.join(
        fixture.projectRoot,
        ...committedGraphArtifact.record_locator.split("/"),
      ),
      "utf8",
    ),
  );
  assert.equal(
    committedRecord.artifact.hero_assurance_bundle_sha256,
    committedGraphArtifact.hero_assurance_bundle_sha256,
  );
  assert.equal(
    committedRecord.artifact.hero_assurance_member.sha256,
    committedGraphArtifact.hero_assurance_bundle_sha256,
  );
  assert.deepEqual(
    committed.payload.capture_plan.work_order.captures.map(
      (capture) => capture.viewport.width,
    ),
    [320, 360, 390],
  );
  assert.deepEqual(
    committed.payload.capture_plan.work_order.captures.map(
      (capture) => capture.viewport.device_scale_factor,
    ),
    [1, 1, 2],
  );
  const revisionRoot = path.join(
    fixture.projectRoot,
    "studio",
    "revisions",
    committed.payload.revision.revision_id,
  );
  assert.equal(
    await readFile(path.join(revisionRoot, "index.html"), "utf8"),
    savedHtml,
  );

  const observedExecution = await materializeCaptureExecution(
    fixture.projectRoot,
    committed.payload.capture_plan,
  );
  const captureIds =
    committed.payload.capture_plan.work_order.captures.map(
      (capture) => capture.capture_id,
    );
  const postcommitRubric = rubricResult(
    fixture.rubricDefinition,
    {
      artifact_id: committed.payload.revision.artifact_id,
      manifest_sha256:
        committed.payload.revision.commit_sha256,
    },
    captureIds,
    { suffix: "postcommit" },
  );
  const tamperedExecution = structuredClone(observedExecution);
  tamperedExecution.captures[0].png_sha256 = "d".repeat(64);
  const tampered = await requestJson(
    fixture.baseUrl,
    "/api/v1/studio/capture/complete",
    {
      session_id: "studio-session-e2e",
      observed_execution: tamperedExecution,
      rubric_result: postcommitRubric,
    },
  );
  assert.equal(tampered.response.status, 409);
  assert.equal(tampered.payload.error.code, "CAPTURE_FILE_HASH_MISMATCH");

  const completed = await requestJson(
    fixture.baseUrl,
    "/api/v1/studio/capture/complete",
    {
      session_id: "studio-session-e2e",
      observed_execution: observedExecution,
      rubric_result: postcommitRubric,
    },
  );
  assert.equal(
    completed.response.status,
    200,
    JSON.stringify(completed.payload),
  );
  assert.equal(completed.payload.challenge.stage_id, "G4U_APPROVAL");
  assert.equal(
    completed.payload.repair_loop.kind,
    "RubricPublishReady",
  );
  assert.equal(
    completed.payload.repair_loop.transition.action,
    "PUBLISH_READY",
  );
  assert.deepEqual(
    completed.payload.capture_artifact.member_ids,
    captureIds,
  );
  assert.equal(
    completed.payload.workflow.stages.S1_STUDIO_WORKING.status,
    "completed",
  );
  assert.equal(
    completed.payload.workflow.stages.G4C_STUDIO_COMMIT.status,
    "completed",
  );
  assert.equal(
    completed.payload.workflow.stages.G4Q_RUBRIC.status,
    "completed",
  );
  assert.equal(
    completed.payload.workflow.stages.G4U_APPROVAL.status,
    "awaiting_user",
  );
  assert.equal(
    completed.payload.workflow.repair_loop.status,
    "PUBLISH_READY",
  );

  const publishEngine = createWorkflowEngine({
    projectRoot: fixture.projectRoot,
  });
  const approvalRef = {
    project_id: fixture.project.id,
    input_digest: INPUT_DIGEST,
    agent_session_id: "studio-g4-approver-e2e",
  };
  await publishEngine.decide(
    completed.payload.challenge.challenge_id,
    {
      project_ref: approvalRef,
      nonce: completed.payload.challenge.nonce,
      subject_artifact_set_digest:
        completed.payload.challenge.subject_artifact_set_digest,
      decision: "approved",
      decided_by: "studio-g4-approver-e2e",
      approval_channel: "studio-g4-pipeline-test",
    },
  );
  const publishWorkOrder = await publishEngine.lease(
    {
      ...approvalRef,
      agent_session_id: "studio-g5-validator-e2e",
    },
    { stage_ids: ["G5_PUBLISH_QA"] },
  );
  assert.equal(publishWorkOrder.stage_id, "G5_PUBLISH_QA");
  const publishProducerSessions = [
    ...new Set(
      publishWorkOrder.input_artifacts.map(
        (artifact) => artifact.producer_agent_session_id,
      ),
    ),
  ];
  const publishEnvelope = {
    project_ref: {
      ...approvalRef,
      agent_session_id: "studio-g5-validator-e2e",
    },
    producer_agent_session_id: "studio-g5-validator-e2e",
    input_set_digest: publishWorkOrder.input_set_digest,
    fencing_token: publishWorkOrder.fencing_token,
    attempt: publishWorkOrder.attempt,
    output_artifacts: [
      {
        artifact_id: "publish-bundle-e2e",
        type: "page.publish_bundle",
        manifest_sha256: "8".repeat(64),
        member_ids: ["publish-bundle.json"],
      },
      {
        artifact_id: "publish-validation-e2e",
        type: "qa.validation_receipt",
        manifest_sha256: "9".repeat(64),
        member_ids: ["publish-validation.json"],
      },
    ],
    execution_receipt: {
      execution_id: "execution-g5-publish-e2e",
      adapter_id: publishWorkOrder.runner_contract.adapter_id,
      adapter_version: "1.0.0",
      adapter_code_sha256: "b".repeat(64),
    },
    validation_receipt: {
      validation_id: "validation-g5-publish-e2e",
      subject: {
        artifact_set_digest: publishWorkOrder.input_set_digest,
        artifact_ids: publishWorkOrder.input_artifacts.map(
          (artifact) => artifact.artifact_id,
        ),
      },
      validator: {
        name: "PublishQaFixture",
        version: "1.0.0",
        code_sha256: "c".repeat(64),
        agent_id: "studio-g5-validator",
        agent_session_id: "studio-g5-validator-e2e",
      },
      producer: {
        agent_session_ids: publishProducerSessions,
      },
      policy: {
        policy_id: publishWorkOrder.gate_policy_id,
        policy_sha256: "d".repeat(64),
      },
      validator_kind: "deterministic",
      checks: [
        {
          check_id: "publish.exact-hero-assurance",
          status: "PASS",
          severity: "hard",
          evidence_artifact_ids: [
            publishWorkOrder.input_artifacts[0].artifact_id,
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
      started_at: "2026-07-30T12:10:00.000Z",
      finished_at: "2026-07-30T12:11:00.000Z",
    },
  };
  const published = await publishEngine.submit(
    publishWorkOrder.work_order_id,
    publishEnvelope,
  );
  assert.equal(published.kind, "Committed");

  const sessionPath = path.join(
    fixture.projectRoot,
    ".detail-page",
    "workflow",
    "studio-sessions",
    "studio-session-e2e.json",
  );
  const session = JSON.parse(await readFile(sessionPath, "utf8"));
  session.status = "working";
  await writeFile(
    sessionPath,
    `${JSON.stringify(session, null, 2)}\n`,
    "utf8",
  );
  const sessionTamper = await requestJson(
    fixture.baseUrl,
    "/api/v1/studio/session?session_id=studio-session-e2e",
  );
  assert.equal(sessionTamper.response.status, 409);
  assert.equal(
    sessionTamper.payload.error.code,
    "STUDIO_SESSION_INTEGRITY_MISMATCH",
  );
});
