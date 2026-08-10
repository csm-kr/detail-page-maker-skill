import assert from "node:assert/strict";
import {
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
import {
  rubricDefinitionHash,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/rubric-loop.mjs";

const H = {
  input: "1".repeat(64),
  html1: "2".repeat(64),
  capture1: "3".repeat(64),
  html2: "4".repeat(64),
  capture2: "5".repeat(64),
  policy: "6".repeat(64),
  snapshot: "7".repeat(64),
  code: "8".repeat(64),
};

const DEFINITION = Object.freeze({
  workflow_id: "repair-loop-fixture",
  version: "1.0.0",
  stages: [
    {
      stage_id: "G4A_ASSEMBLY",
      required_inputs: [],
      any_of_inputs: [],
      input_producers: {},
      produces: ["page.html_revision"],
      output_variants: [],
      consumers: ["CAPTURE_STAGE"],
      gate_policy_id: "fixture.html",
      user_gate: false,
      runner_contract: {
        skill_name: "fixture",
        adapter_id: "FixtureHtmlAdapter",
      },
    },
    {
      stage_id: "CAPTURE_STAGE",
      required_inputs: ["page.html_revision"],
      any_of_inputs: [],
      input_producers: {},
      produces: ["qa.render_capture_set"],
      output_variants: [],
      consumers: ["G4U_APPROVAL"],
      gate_policy_id: "fixture.capture",
      user_gate: false,
      runner_contract: {
        skill_name: "fixture",
        adapter_id: "FixtureCaptureAdapter",
      },
    },
    {
      stage_id: "G4U_APPROVAL",
      required_inputs: [
        "page.html_revision",
        "qa.render_capture_set",
      ],
      any_of_inputs: [],
      input_producers: {},
      produces: ["decision.page_approval"],
      output_variants: [],
      consumers: ["G5_PUBLISH_QA"],
      gate_policy_id: "fixture.approval",
      user_gate: true,
      runner_contract: {
        skill_name: "internal",
        adapter_id: "WorkflowOrchestratorInternalAdapter",
      },
    },
    {
      stage_id: "G5_PUBLISH_QA",
      required_inputs: ["decision.page_approval"],
      any_of_inputs: [],
      input_producers: {},
      produces: ["page.publish_bundle"],
      output_variants: [],
      consumers: [],
      gate_policy_id: "fixture.publish",
      user_gate: false,
      runner_contract: {
        skill_name: "fixture",
        adapter_id: "FixturePublishAdapter",
      },
    },
  ],
});

function rubricDefinition() {
  const body = {
    schema_version: "1.0",
    rubric_id: "behance-commerce",
    version: "1.0.0",
    source_snapshot: {
      snapshot_id: "behance-fixture",
      sha256: H.snapshot,
    },
    policy: {
      policy_id: "policy.qa.behance-rubric.v1",
      sha256: H.policy,
    },
    dimensions: [
      {
        dimension_id: "technical-integrity",
        validator_kind: "deterministic",
        weight: 100,
        evidence_requirement: ["capture", "dom"],
        min_score: 100,
        hard_gate: true,
        applicable_section_types: ["all"],
        issue_to_repair_scope_code: {
          MOBILE_OVERFLOW: "html.section-css",
        },
        hard_failure_codes: ["MOBILE_OVERFLOW"],
      },
    ],
    stop_policy: {
      policy_id: "repair-stop",
      version: "1.0.0",
      max_total_attempts: 3,
      max_section_attempts: 2,
      recurring_issue_limit: 2,
      plateau_window: 2,
      min_score_improvement: 2,
    },
  };
  return {
    ...body,
    rubric_sha256: rubricDefinitionHash(body),
  };
}

function project(agent = "coordinator") {
  return {
    project_id: "repair-project",
    input_digest: H.input,
    agent_session_id: agent,
  };
}

async function submitNext(engine, stageId, artifact) {
  const workOrder = await engine.lease(
    project(`producer-${stageId}-${artifact.artifact_id}`),
    { stage_ids: [stageId] },
  );
  assert.equal(workOrder.stage_id, stageId);
  await engine.submit(workOrder.work_order_id, {
    project_ref: project(workOrder.assigned_agent_session_id),
    producer_agent_session_id:
      workOrder.assigned_agent_session_id,
    input_set_digest: workOrder.input_set_digest,
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: [artifact],
    execution_receipt: {
      execution_id: `execution-${workOrder.work_order_id}`,
      adapter_id: workOrder.runner_contract.adapter_id,
      adapter_version: "1.0.0",
      adapter_code_sha256: H.code,
    },
  });
}

async function buildCandidate(engine, suffix) {
  const htmlArtifact = {
    artifact_id: `html-${suffix}`,
    type: "page.html_revision",
    manifest_sha256: suffix === "1" ? H.html1 : H.html2,
    member_ids: ["index.html"],
    section_ids: ["spec"],
  };
  const captureArtifact = {
    artifact_id: `capture-${suffix}`,
    type: "qa.render_capture_set",
    manifest_sha256:
      suffix === "1" ? H.capture1 : H.capture2,
    member_ids: ["capture.png"],
  };
  await submitNext(engine, "G4A_ASSEMBLY", htmlArtifact);
  await submitNext(
    engine,
    "CAPTURE_STAGE",
    captureArtifact,
  );
  return { htmlArtifact, captureArtifact };
}

function rubricResult({
  id,
  htmlArtifact,
  captureArtifact,
  pass = false,
  score = pass ? 100 : 90,
}) {
  return {
    schema_version: "1.0",
    result_id: id,
    rubric_id: "behance-commerce",
    rubric_version: "1.0.0",
    rubric_sha256: rubricDefinition().rubric_sha256,
    subject: {
      artifact_id: htmlArtifact.artifact_id,
      manifest_sha256: htmlArtifact.manifest_sha256,
      lineage_id: "detail-page-main",
    },
    benchmark_sha256: H.snapshot,
    evaluators: [
      {
        evaluator_id: "technical-evaluator",
        validator_kind: "deterministic",
        code_sha256: H.code,
      },
    ],
    viewport_capture_ids: [captureArtifact.artifact_id],
    score,
    checks: [
      {
        check_id: `check-${id}`,
        dimension_id: "technical-integrity",
        evaluator_kind: "deterministic",
        evaluator_id: "technical-evaluator",
        issue_code: pass ? null : "MOBILE_OVERFLOW",
        section_id: "spec",
        status: pass ? "PASS" : "FAIL",
        severity: pass ? "info" : "hard",
        score: pass ? 100 : 0,
        confidence: 1,
        evidence_artifact_ids: [captureArtifact.artifact_id],
        evidence_locators: [
          `artifact://${captureArtifact.artifact_id}`,
        ],
      },
    ],
    evaluated_at: "2026-07-30T12:00:00.000Z",
  };
}

test("rubric repair는 persistent selective stale 뒤 재평가하고 반복 실패에서 awaiting-user로 멈춘다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-repair-loop-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({
    projectRoot: root,
    definition: DEFINITION,
    rubricDefinition: rubricDefinition(),
  });
  const first = await buildCandidate(engine, "1");
  const repaired = await engine.recordRubricIteration(
    project("repair-coordinator"),
    {
      evaluator_agent_session_id: "rubric-evaluator-1",
      rubric_result: rubricResult({
        id: "rubric-1",
        ...first,
      }),
      budget: { state: "AVAILABLE" },
    },
  );
  assert.equal(repaired.kind, "RubricRepairScheduled");
  assert.deepEqual(repaired.mutation.stale_artifact_ids, [
    "capture-1",
    "html-1",
  ]);

  const restarted = createWorkflowEngine({
    projectRoot: root,
    definition: DEFINITION,
    rubricDefinition: rubricDefinition(),
  });
  const afterRepair = await restarted.inspect(project());
  assert.equal(afterRepair.repair_loop.status, "REPAIR_REQUIRED");
  assert.equal(afterRepair.stages.G4A_ASSEMBLY.status, "pending");
  assert.equal(
    afterRepair.artifacts.find(
      (artifact) => artifact.artifact_id === "html-1",
    ).status,
    "stale",
  );

  const second = await buildCandidate(restarted, "2");
  const stopped = await restarted.recordRubricIteration(
    project("repair-coordinator"),
    {
      evaluator_agent_session_id: "rubric-evaluator-2",
      rubric_result: rubricResult({
        id: "rubric-2",
        score: 91,
        ...second,
      }),
      budget: { state: "AVAILABLE" },
    },
  );
  assert.equal(stopped.kind, "RubricAwaitUser");
  assert.equal(
    stopped.transition.action,
    "PLATEAU_AWAITING_USER",
  );
  assert.equal(stopped.transition.delta.score_delta, 1);
  assert.equal(
    stopped.transition.delta.subject_lineage_id,
    "detail-page-main",
  );
  const blocked = await restarted.inspect(project());
  assert.equal(
    blocked.repair_loop.status,
    "PLATEAU_AWAITING_USER",
  );
  assert.deepEqual(blocked.ready_stages, []);
});

test("rubric 통과 transition만 G4 사용자 승인 gate를 연다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workflow-repair-pass-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({
    projectRoot: root,
    definition: DEFINITION,
    rubricDefinition: rubricDefinition(),
  });
  const candidate = await buildCandidate(engine, "1");
  const passed = await engine.recordRubricIteration(
    project("repair-coordinator"),
    {
      evaluator_agent_session_id: "rubric-evaluator",
      rubric_result: rubricResult({
        id: "rubric-pass",
        pass: true,
        ...candidate,
      }),
      budget: { state: "AVAILABLE" },
    },
  );

  assert.equal(passed.kind, "RubricPublishReady");
  assert.equal(passed.transition.action, "PUBLISH_READY");
  assert.deepEqual(passed.ready_stages, ["G4U_APPROVAL"]);
  await assert.rejects(
    () =>
      engine.recordRubricIteration(
        project("same-session"),
        {
          evaluator_agent_session_id: "same-session",
          rubric_result: rubricResult({
            id: "rubric-self",
            pass: true,
            ...candidate,
          }),
        },
      ),
    (error) => error.code === "RUBRIC_EVALUATOR_NOT_SEPARATED",
  );

  const recordPath = path.join(
    root,
    ...passed.artifact_record.record_locator.split("/"),
  );
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  record.artifact.manifest_sha256 = H.input;
  await writeFile(
    recordPath,
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
  await assert.rejects(
    () => engine.inspect(project()),
    (error) =>
      error.code === "ARTIFACT_RECORD_INTEGRITY_MISMATCH",
  );
});
