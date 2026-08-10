import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  productionPlanDigest,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/parallel-frontier.mjs";
import {
  WORKFLOW_DEFINITION,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-definition.mjs";
import { createWorkflowEngine } from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-engine.mjs";
import { revisionImpactDigest } from "../../skills/detail-page-maker-skill/scripts/orchestration/revision-impact.mjs";
import {
  createParallelProductionPlan,
} from "../fixtures/orchestration/parallel-production-plan.mjs";

const CLI = path.resolve(
  "skills/detail-page-maker-skill/scripts/detail-page.mjs",
);
const INPUT_DIGEST = "1".repeat(64);
const PHOTO_BYTES = Buffer.from("cli-immutable-photo-v2", "utf8");
const PHOTO_SHA256 = createHash("sha256")
  .update(PHOTO_BYTES)
  .digest("hex");
const PHOTO_LOCATOR = "input/product/photo-v2.png";

async function submitStage(engine, stageId, outputTypes, offset) {
  const projectRef = {
    project_id: "project-56328525",
    input_digest: INPUT_DIGEST,
    agent_session_id: `${stageId}-producer`,
  };
  const workOrder = await engine.lease(projectRef, {
    stage_ids: [stageId],
  });
  const outputArtifacts = outputTypes.map((type, index) => ({
    artifact_id: `${stageId.toLowerCase()}-${index}`,
    type,
    manifest_sha256: (offset + index).toString(16).repeat(64),
    member_ids: [`${type}.json`],
  }));
  const envelope = {
    project_ref: projectRef,
    producer_agent_session_id: projectRef.agent_session_id,
    input_set_digest: workOrder.input_set_digest,
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: outputArtifacts,
    execution_receipt: {
      execution_id: `execution-${workOrder.work_order_id}`,
      adapter_id: workOrder.runner_contract.adapter_id,
      adapter_version: "1.0.0",
      adapter_code_sha256: "f".repeat(64),
    },
  };
  if (stageId.endsWith("_QA") || stageId === "G4Q_RUBRIC") {
    envelope.validation_receipt = {
      validation_id: `validation-${workOrder.work_order_id}`,
      subject: {
        artifact_set_digest: workOrder.input_set_digest,
        artifact_ids: workOrder.input_artifacts.map(
          (artifact) => artifact.artifact_id,
        ),
      },
      validator: {
        name: "cli-fixture-validator",
        version: "1.0.0",
        code_sha256: "e".repeat(64),
        agent_id: `agent-${stageId}`,
        agent_session_id: projectRef.agent_session_id,
      },
      producer: {
        agent_session_ids: [
          ...new Set(
            workOrder.input_artifacts.map(
              (artifact) => artifact.producer_agent_session_id,
            ),
          ),
        ],
      },
      policy: {
        policy_id: workOrder.gate_policy_id,
        policy_sha256: "d".repeat(64),
      },
      validator_kind: "deterministic",
      checks: [
        {
          check_id: `${stageId}.fixture`,
          status: "PASS",
          severity: "hard",
          evidence_artifact_ids: [
            workOrder.input_artifacts[0].artifact_id,
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
  await engine.submit(workOrder.work_order_id, envelope);
}

async function submitFrontierWorkOrder(engine, workOrder) {
  const outputArtifacts = workOrder.expected_output_types.map(
    (type, index) => ({
      artifact_id:
        index === 0
          ? workOrder.frontier_expected_artifact_id
          : `${workOrder.frontier_expected_artifact_id}-${index}`,
      type,
      manifest_sha256: createHash("sha256")
        .update(`${workOrder.work_item_id}:${type}:${index}`)
        .digest("hex"),
      member_ids: [
        `${workOrder.member_id}-${type.replaceAll(".", "-")}.json`,
      ],
    }),
  );
  await engine.submit(workOrder.work_order_id, {
    project_ref: {
      project_id: workOrder.project_id,
      input_digest: INPUT_DIGEST,
      agent_session_id: workOrder.assigned_agent_session_id,
    },
    producer_agent_session_id:
      workOrder.assigned_agent_session_id,
    input_set_digest: workOrder.input_set_digest,
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: outputArtifacts,
    execution_receipt: {
      execution_id: `execution-${workOrder.work_item_id}`,
      adapter_id: workOrder.runner_contract.adapter_id,
      adapter_version: "1.0.0",
      adapter_code_sha256: "c".repeat(64),
    },
  });
}

function legacyParallelProductionPlanFixture() {
  const gifIds = [
    "gif-problem-tightness",
    "gif-problem-rollup",
    "gif-benefit-relaxed-fit",
    "gif-benefit-stable-edge",
    "gif-benefit-cooling",
    "gif-usage",
    "gif-comparison",
  ];
  const painRows = [
    ["tightness", "오래 착용하면 조임이 불편해요", "relaxed-fit"],
    ["rollup", "움직일 때 자꾸 말려 올라가요", "stable-edge"],
    ["heat", "더운 날에는 금방 답답해져요", "cooling"],
  ];
  return {
    plan_id: "cli-parallel-plan",
    claim_graph: {
      claims: [
        {
          claim_id: "claim-benefit",
          fact_ids: ["fact-product-structure"],
        },
      ],
    },
    section_graph_draft: {
      sections: [{ section_id: "section-main" }],
    },
    image_job_set: {
      jobs: ["hero", "benefit", "usage"].map((name) => ({
        job_id: `image-${name}`,
        prompt: name,
      })),
    },
    gif_brief_set: {
      briefs: gifIds.map((briefId) => ({
        brief_id: briefId,
        source: {
          kind: "product_reference",
          asset_ids: ["supplier-product"],
        },
      })),
    },
    commercial_flow: {
      hero: {
        section_id: "section-main",
        static: true,
        primary_benefit_claim_ids: ["claim-benefit"],
        product_visual_priority: "largest",
        commercial_intensity: "high",
        product_identity_change_allowed: false,
      },
      section_role_order: [
        "hero",
        "pain",
        "product_answer",
        "solution_group",
        "usage",
        "comparison",
        "choice_and_fit",
        "specification_and_caution",
        "objection_and_faq",
        "decision_recap",
      ],
      problem_quotes: painRows.map(([painId, text]) => ({
        quote_id: `quote-${painId}`,
        pain_id: `pain-${painId}`,
        text: `“${text}”`,
        claim_id: "claim-benefit",
      })),
      product_answer: {
        section_id: "section-main",
        sentence: "조임과 말림 부담을 줄이는 제품입니다.",
      },
      solution_modules: painRows.map(
        ([painId, , solutionId], index) => ({
          solution_id: `solution-${solutionId}`,
          pain_id: `pain-${painId}`,
          claim_id: "claim-benefit",
          section_id: "section-main",
          customer_benefit_copy: "착용 중 불편 부담을 줄여줍니다.",
          still_image_job_id: [
            "image-hero",
            "image-benefit",
            "image-usage",
          ][index],
          benefit_motion_brief_id: [
            "gif-benefit-relaxed-fit",
            "gif-benefit-stable-edge",
            "gif-benefit-cooling",
          ][index],
          fact_or_condition_id: "fact-product-structure",
          experiential_quote: "“착용할 때 부담이 한결 덜해요”",
        }),
      ),
      problem_motion_brief_ids: [
        "gif-problem-tightness",
        "gif-problem-rollup",
      ],
      usage: {
        section_id: "section-main",
        sequence: ["preparation", "use", "result"],
      },
      usage_motion_brief_ids: ["gif-usage"],
      comparison: {
        section_id: "section-main",
        prior_inconvenience: "기존 착용 조건에서는 조임이 있었습니다.",
        verified_difference: "제품 구조가 착용 부담을 줄입니다.",
        competitor_attack: false,
      },
      comparison_motion_brief_ids: ["gif-comparison"],
      motion_target: { planned_total: 7 },
      actual_review: {
        section_present: false,
        verified_same_sku_receipt_id: null,
      },
      public_presentation: {
        review_ui: false,
        fake_transaction_ui: false,
      },
    },
  };
}

function parallelProductionPlan() {
  return createParallelProductionPlan();
}

async function prepareUntilG2(root) {
  const engine = createWorkflowEngine({ projectRoot: root });
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const progress = await engine.advance({
      project_id: "project-56328525",
      input_digest: INPUT_DIGEST,
      agent_session_id: "cli-preparer",
    });
    if (
      progress.kind === "WorkAvailable" &&
      progress.ready_stages.includes("G2A_IMAGE")
    ) {
      return engine;
    }
    if (progress.kind === "AwaitUser") {
      await engine.decide(progress.challenge.challenge_id, {
        project_ref: {
          project_id: "project-56328525",
          input_digest: INPUT_DIGEST,
          agent_session_id: `user-${progress.stage_id}`,
        },
        nonce: progress.challenge.nonce,
        subject_artifact_set_digest:
          progress.challenge.subject_artifact_set_digest,
        decision: "approved",
        decided_by: "cli-fixture-user",
        approval_channel: "cli-fixture",
      });
      continue;
    }
    assert.equal(progress.kind, "WorkAvailable");
    const stageId = progress.ready_stages[0];
    const stage = WORKFLOW_DEFINITION.stages.find(
      (candidate) => candidate.stage_id === stageId,
    );
    await submitStage(
      engine,
      stageId,
      stage.output_variants?.[0] ?? stage.produces,
      2 + (iteration % 12),
    );
  }
  throw new Error("G2A_IMAGE was not reached");
}

async function prepareCliRevisionGraph(root) {
  const photoPath = path.join(root, ...PHOTO_LOCATOR.split("/"));
  await mkdir(path.dirname(photoPath), { recursive: true });
  await writeFile(photoPath, PHOTO_BYTES);
  const engine = createWorkflowEngine({ projectRoot: root });
  await submitStage(engine, "S0_INTAKE", ["project.intake"], 2);
  await submitStage(
    engine,
    "G0A_SUPPLIER",
    ["evidence.supplier_snapshot", "receipt.importer"],
    3,
  );
  await submitStage(engine, "G0B_PHOTO", ["identity.photo_set"], 5);
  await submitStage(engine, "G0R_RIGHTS", ["decision.rights_set"], 6);
  await submitStage(engine, "G0C_NORMALIZE", ["product.ssot"], 7);
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8",
    windowsHide: true,
  });
}

test("CLI workflow-status와 worker-lease는 같은 persistent engine을 사용한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const common = [
    "--project",
    root,
    "--project-id",
    "project-56328525",
    "--input-digest",
    INPUT_DIGEST,
    "--json",
  ];

  const statusResult = run(["workflow-status", ...common]);
  assert.equal(statusResult.status, 0, statusResult.stderr);
  const status = JSON.parse(statusResult.stdout);
  assert.ok(status.ready_stages.includes("S0_INTAKE"));
  assert.equal(status.notifications.length, 1);
  assert.equal(
    status.notifications[0].event_id,
    "notice-missing-actual-product-photo",
  );

  const repeatedStatusResult = run([
    "workflow-status",
    ...common,
  ]);
  assert.equal(
    repeatedStatusResult.status,
    0,
    repeatedStatusResult.stderr,
  );
  const repeatedStatus = JSON.parse(
    repeatedStatusResult.stdout,
  );
  assert.deepEqual(repeatedStatus.notifications, []);
  assert.equal(repeatedStatus.event_summary.count, 1);

  const leaseResult = run([
    "worker-lease",
    ...common,
    "--agent-session",
    "intake-agent",
    "--stage",
    "S0_INTAKE",
  ]);
  assert.equal(leaseResult.status, 0, leaseResult.stderr);
  const workOrder = JSON.parse(leaseResult.stdout);
  assert.equal(workOrder.stage_id, "S0_INTAKE");
  assert.equal(workOrder.attempt, 1);
  assert.match(workOrder.fencing_token, /^fence-/);

  const heartbeatResult = run([
    "worker-heartbeat",
    ...common,
    "--agent-session",
    "intake-agent",
    "--work-order",
    workOrder.work_order_id,
    "--fencing-token",
    workOrder.fencing_token,
    "--attempt",
    String(workOrder.attempt),
  ]);
  assert.equal(heartbeatResult.status, 0, heartbeatResult.stderr);
  const heartbeat = JSON.parse(heartbeatResult.stdout);
  assert.equal(heartbeat.work_order_id, workOrder.work_order_id);
  assert.equal(heartbeat.fencing_token, workOrder.fencing_token);
  assert.ok(
    Date.parse(heartbeat.lease_expires_at) >=
      Date.parse(workOrder.lease_expires_at),
  );

  const resumed = run(["workflow-resume", ...common]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).kind, "Waiting");
});

test("CLI는 input/product의 실제 사진을 단일 입력 판정으로 사용해 누락 안내를 만들지 않는다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-cli-photo-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "input", "product"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "input", "product", "actual-product.webp"),
    Buffer.from("actual-product-photo"),
  );

  const statusResult = run([
    "workflow-status",
    "--project",
    root,
    "--project-id",
    "project-56328525",
    "--input-digest",
    INPUT_DIGEST,
    "--json",
  ]);
  assert.equal(statusResult.status, 0, statusResult.stderr);
  const status = JSON.parse(statusResult.stdout);
  assert.deepEqual(status.notifications, []);
  assert.equal(status.event_summary.count, 0);
});

test("CLI workflow-advance는 G2 직전 planParallelFrontier 결과를 가용 slot만큼 영속 lease한다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-cli-parallel-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = await prepareUntilG2(root);
  const productionPlan = parallelProductionPlan();
  const planApproval = {
    decision_id: "decision-cli-parallel-plan",
    decision: "approved",
    subject_plan_sha256: productionPlanDigest(productionPlan),
  };
  const planPath = path.join(root, "production-plan.json");
  const approvalPath = path.join(root, "plan-approval.json");
  await writeFile(
    planPath,
    `${JSON.stringify(productionPlan, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    approvalPath,
    `${JSON.stringify(planApproval, null, 2)}\n`,
    "utf8",
  );
  const baseAdvanceArgs = [
    "workflow-advance",
    "--project",
    root,
    "--project-id",
    "project-56328525",
    "--input-digest",
    INPUT_DIGEST,
    "--agent-session",
    "cli-parallel-coordinator",
  ];
  const missingCapacity = run(baseAdvanceArgs);
  assert.equal(missingCapacity.status, 1);
  assert.match(
    missingCapacity.stderr,
    /AGENT_SESSIONS_REQUIRED/,
  );
  const missingPlan = run([
    ...baseAdvanceArgs,
    "--worker-capacity",
    "2",
    "--worker-sessions",
    "image-worker-a,image-worker-b",
  ]);
  assert.equal(missingPlan.status, 1);
  assert.match(missingPlan.stderr, /PARALLEL_PLAN_INPUT_REQUIRED/);

  const parallelArgs = [
    ...baseAdvanceArgs,
    "--worker-capacity",
    "2",
    "--worker-sessions",
    "image-worker-a,image-worker-b,image-worker-spare",
    "--production-plan",
    planPath,
    "--plan-approval",
    approvalPath,
  ];
  const dispatched = run(parallelArgs);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const result = JSON.parse(dispatched.stdout);
  assert.equal(result.kind, "ParallelFrontierDispatched");
  assert.equal(result.advance.kind, "WorkAvailable");
  assert.deepEqual(result.advance.ready_stages, ["G2A_IMAGE"]);
  assert.equal(result.frontier_plan.planned_count, 2);
  assert.equal(result.frontier_plan.remaining_candidate_count, 5);
  assert.equal(result.lease_result.kind, "FrontierLeased");
  assert.equal(result.lease_result.issued_count, 2);
  assert.equal(result.lease_result.capacity_filled, true);
  assert.deepEqual(
    result.lease_result.work_orders.map(
      (workOrder) => workOrder.work_item_id,
    ),
    ["G2A_IMAGE:image-hero", "G2A_IMAGE:image-benefit"],
  );
  assert.deepEqual(
    result.lease_result.work_orders.map(
      (workOrder) => workOrder.assigned_agent_session_id,
    ),
    ["image-worker-a", "image-worker-b"],
  );
  assert.ok(
    result.lease_result.work_orders.every(
      (workOrder) =>
        workOrder.input_set_digest ===
          workOrder.frontier_exact_input_digest &&
        workOrder.fan_out_key === "image_job_id" &&
        workOrder.requires_execution_receipt === true &&
        workOrder.requires_independent_validation_receipt === true,
    ),
  );

  const status = await engine.inspect({
    project_id: "project-56328525",
    input_digest: INPUT_DIGEST,
    agent_session_id: "assertion-session",
  });
  assert.equal(status.stages.G2A_IMAGE.status, "running");
  assert.equal(status.stages.G2A_IMAGE.parallel_frontier, true);
  assert.deepEqual(
    status.frontier_work_items.map((item) => item.work_item_id),
    ["G2A_IMAGE:image-hero", "G2A_IMAGE:image-benefit"],
  );
  assert.ok(
    status.frontier_work_items.every(
      (item) => item.status === "running",
    ),
  );

  for (const workOrder of result.lease_result.work_orders) {
    await submitFrontierWorkOrder(engine, workOrder);
  }
  const secondBatchResult = run(parallelArgs);
  assert.equal(
    secondBatchResult.status,
    0,
    secondBatchResult.stderr,
  );
  const secondBatch = JSON.parse(secondBatchResult.stdout);
  assert.equal(secondBatch.frontier_plan.planned_count, 2);
  assert.equal(secondBatch.lease_result.issued_count, 2);
  assert.deepEqual(
    secondBatch.lease_result.work_orders.map(
      (workOrder) => workOrder.work_item_id,
    ),
    [
      "G2A_IMAGE:image-usage",
      "G2A_IMAGE:image-comparison",
    ],
  );
  for (const workOrder of secondBatch.lease_result.work_orders) {
    await submitFrontierWorkOrder(engine, workOrder);
  }

  const thirdBatchResult = run(parallelArgs);
  assert.equal(
    thirdBatchResult.status,
    0,
    thirdBatchResult.stderr,
  );
  const thirdBatch = JSON.parse(thirdBatchResult.stdout);
  assert.equal(thirdBatch.frontier_plan.planned_count, 1);
  assert.equal(thirdBatch.lease_result.issued_count, 1);
  assert.equal(
    thirdBatch.lease_result.work_orders[0].work_item_id,
    "G2A_IMAGE:image-outcome",
  );
  await submitFrontierWorkOrder(
    engine,
    thirdBatch.lease_result.work_orders[0],
  );

  const g2CompletedResult = run(parallelArgs);
  assert.equal(
    g2CompletedResult.status,
    0,
    g2CompletedResult.stderr,
  );
  const g2Completed = JSON.parse(g2CompletedResult.stdout);
  assert.equal(g2Completed.kind, "ParallelFrontierCompleted");
  assert.equal(
    g2Completed.completion.kind,
    "ParallelFrontierCommitted",
  );
  assert.equal(g2Completed.completion.stage_id, "G2A_IMAGE");
  assert.deepEqual(
    g2Completed.completion.completed_work_item_ids,
    [
      "G2A_IMAGE:image-benefit",
      "G2A_IMAGE:image-comparison",
      "G2A_IMAGE:image-hero",
      "G2A_IMAGE:image-outcome",
      "G2A_IMAGE:image-usage",
    ],
  );

  let progress = await engine.advance({
    project_id: "project-56328525",
    input_digest: INPUT_DIGEST,
    agent_session_id: "g3-preparer",
  });
  assert.deepEqual(progress.ready_stages, ["G2Q_QA"]);
  const g2QaDefinition = WORKFLOW_DEFINITION.stages.find(
    (stage) => stage.stage_id === "G2Q_QA",
  );
  await submitStage(
    engine,
    "G2Q_QA",
    g2QaDefinition.produces,
    10,
  );
  progress = await engine.advance({
    project_id: "project-56328525",
    input_digest: INPUT_DIGEST,
    agent_session_id: "g3-preparer",
  });
  assert.equal(progress.kind, "AwaitUser");
  assert.equal(progress.stage_id, "G2U_APPROVAL");
  await engine.decide(progress.challenge.challenge_id, {
    project_ref: {
      project_id: "project-56328525",
      input_digest: INPUT_DIGEST,
      agent_session_id: "user-g2-approval",
    },
    nonce: progress.challenge.nonce,
    subject_artifact_set_digest:
      progress.challenge.subject_artifact_set_digest,
    decision: "approved",
    decided_by: "cli-fixture-user",
    approval_channel: "cli-fixture",
  });
  const g3DecisionDefinition = WORKFLOW_DEFINITION.stages.find(
    (stage) => stage.stage_id === "G3N_MOTION_DECISION",
  );
  await submitStage(
    engine,
    "G3N_MOTION_DECISION",
    g3DecisionDefinition.produces,
    11,
  );

  const g3DispatchedResult = run([
    ...parallelArgs.filter(
      (_, index, values) =>
        !(
          values[index - 1] === "--worker-capacity" ||
          values[index - 1] === "--worker-sessions"
        ) &&
        values[index] !== "--worker-capacity" &&
        values[index] !== "--worker-sessions",
    ),
    "--worker-capacity",
    "3",
    "--worker-sessions",
    "motion-worker-a,motion-worker-b,motion-worker-c",
  ]);
  assert.equal(
    g3DispatchedResult.status,
    0,
    g3DispatchedResult.stderr,
  );
  const g3Dispatched = JSON.parse(g3DispatchedResult.stdout);
  assert.equal(g3Dispatched.kind, "ParallelFrontierDispatched");
  assert.deepEqual(
    g3Dispatched.advance.ready_stages,
    ["G3P_PREVIEW"],
  );
  assert.equal(g3Dispatched.frontier_plan.planned_count, 3);
  assert.equal(g3Dispatched.lease_result.issued_count, 3);
  assert.ok(
    g3Dispatched.lease_result.work_orders.every(
      (workOrder) =>
        workOrder.stage_id === "G3P_PREVIEW" &&
        workOrder.fan_out_key === "gif_brief_id" &&
        workOrder.parallel_lane === "motion",
    ),
  );
});

test("worker 실패 영수증은 exact lease만 failed로 원자 기록하고 CLI 재시도는 그 member만 자동 발급한다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-cli-failed-retry-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = await prepareUntilG2(root);
  const productionPlan = parallelProductionPlan();
  const planApproval = {
    decision_id: "decision-cli-failed-retry-plan",
    decision: "approved",
    subject_plan_sha256: productionPlanDigest(productionPlan),
  };
  const planPath = path.join(root, "production-plan.json");
  const approvalPath = path.join(root, "plan-approval.json");
  await writeFile(
    planPath,
    `${JSON.stringify(productionPlan, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    approvalPath,
    `${JSON.stringify(planApproval, null, 2)}\n`,
    "utf8",
  );
  const advanceArgs = [
    "workflow-advance",
    "--project",
    root,
    "--project-id",
    "project-56328525",
    "--input-digest",
    INPUT_DIGEST,
    "--agent-session",
    "retry-coordinator",
    "--worker-capacity",
    "2",
    "--worker-sessions",
    "failure-worker,passed-worker",
    "--production-plan",
    planPath,
    "--plan-approval",
    approvalPath,
  ];
  const initial = run(advanceArgs);
  assert.equal(initial.status, 0, initial.stderr);
  const initialDispatch = JSON.parse(initial.stdout);
  const failedWorkOrder =
    initialDispatch.lease_result.work_orders.find(
      (item) => item.work_item_id === "G2A_IMAGE:image-hero",
    );
  const passedWorkOrder =
    initialDispatch.lease_result.work_orders.find(
      (item) =>
        item.work_item_id === "G2A_IMAGE:image-benefit",
    );
  assert.ok(failedWorkOrder);
  assert.ok(passedWorkOrder);

  const failureEnvelope = {
    project_ref: {
      project_id: "project-56328525",
      input_digest: INPUT_DIGEST,
      agent_session_id:
        failedWorkOrder.assigned_agent_session_id,
    },
    producer_agent_session_id:
      failedWorkOrder.assigned_agent_session_id,
    input_set_digest: failedWorkOrder.input_set_digest,
    fencing_token: failedWorkOrder.fencing_token,
    attempt: failedWorkOrder.attempt,
    failure_receipt: {
      receipt_type: "frontier.failure.v1",
      failure_id: "failure-image-hero-provider",
      work_order_id: failedWorkOrder.work_order_id,
      work_item_id: failedWorkOrder.work_item_id,
      failed_member_id: failedWorkOrder.member_id,
      stage_id: failedWorkOrder.stage_id,
      input_set_digest: failedWorkOrder.input_set_digest,
      producer_agent_session_id:
        failedWorkOrder.assigned_agent_session_id,
      fencing_token: failedWorkOrder.fencing_token,
      attempt: failedWorkOrder.attempt,
      failure_kind: "execution_failed",
      failure_code: "PROVIDER_RENDER_FAILED",
      retryable: true,
      occurred_at: "2026-07-30T13:00:00.000Z",
      evidence: {
        kind: "execution_log",
        sha256: "7".repeat(64),
      },
    },
  };
  const forgedFailurePath = path.join(
    root,
    "forged-failure.json",
  );
  const forgedFailure = structuredClone(failureEnvelope);
  forgedFailure.producer_agent_session_id = "attacker";
  forgedFailure.project_ref.agent_session_id = "attacker";
  await writeFile(
    forgedFailurePath,
    `${JSON.stringify(forgedFailure, null, 2)}\n`,
    "utf8",
  );
  const forged = run([
    "worker-submit",
    "--project",
    root,
    "--work-order",
    failedWorkOrder.work_order_id,
    "--result",
    forgedFailurePath,
  ]);
  assert.equal(forged.status, 1);
  assert.match(forged.stderr, /SESSION_MISMATCH/);
  let status = await engine.inspect({
    project_id: "project-56328525",
    input_digest: INPUT_DIGEST,
    agent_session_id: "failure-assertion",
  });
  assert.equal(
    status.frontier_work_items.find(
      (item) =>
        item.work_order_id === failedWorkOrder.work_order_id,
    ).status,
    "running",
  );

  await submitFrontierWorkOrder(engine, passedWorkOrder);
  const failurePath = path.join(root, "failure.json");
  await writeFile(
    failurePath,
    `${JSON.stringify(failureEnvelope, null, 2)}\n`,
    "utf8",
  );
  const failed = run([
    "worker-submit",
    "--project",
    root,
    "--work-order",
    failedWorkOrder.work_order_id,
    "--result",
    failurePath,
  ]);
  assert.equal(failed.status, 0, failed.stderr);
  const failureResult = JSON.parse(failed.stdout);
  assert.equal(failureResult.kind, "FrontierMemberFailed");
  assert.match(
    failureResult.failure_receipt_sha256,
    /^[a-f0-9]{64}$/,
  );
  status = await engine.inspect({
    project_id: "project-56328525",
    input_digest: INPUT_DIGEST,
    agent_session_id: "failure-assertion",
  });
  const persistedFailure = status.frontier_work_items.find(
    (item) =>
      item.work_order_id === failedWorkOrder.work_order_id,
  );
  assert.equal(persistedFailure.status, "failed");
  assert.equal(persistedFailure.retryable, true);
  assert.match(
    persistedFailure.failure_receipt_sha256,
    /^[a-f0-9]{64}$/,
  );

  const retry = run([
    ...advanceArgs.slice(0, advanceArgs.indexOf("--worker-capacity")),
    "--worker-capacity",
    "1",
    "--worker-sessions",
    "retry-worker",
    "--production-plan",
    planPath,
    "--plan-approval",
    approvalPath,
  ]);
  assert.equal(retry.status, 0, retry.stderr);
  const retryDispatch = JSON.parse(retry.stdout);
  assert.equal(retryDispatch.frontier_plan.planned_count, 1);
  assert.deepEqual(
    retryDispatch.lease_result.work_orders.map(
      (item) => item.work_item_id,
    ),
    ["G2A_IMAGE:image-hero"],
  );
  assert.equal(
    retryDispatch.lease_result.work_orders[0].attempt,
    2,
  );
});

test("CLI revision plan과 commit은 exact digest로 persistent engine을 갱신한다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-cli-revision-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  await prepareCliRevisionGraph(root);
  const changePath = path.join(root, "revision-change.json");
  const provenanceSubject = {
    artifact_id: "photo-set-v2",
    manifest_sha256: "8".repeat(64),
    members: [
      {
        member_id: "photo-v2.png",
        member_sha256: PHOTO_SHA256,
      },
    ],
  };
  const rightsBody = {
    schema_version: "1.0",
    receipt_id: "cli-photo-rights-v2",
    receipt_type: "photo_revision.rights_provenance",
    subject: provenanceSubject,
    classification: "identity_reference",
    production_use_allowed: false,
    evidence: {
      locator: "input/product/photo-v2.png",
      sha256: PHOTO_SHA256,
    },
  };
  const identityBody = {
    schema_version: "1.0",
    receipt_id: "cli-photo-identity-v2",
    receipt_type: "photo_revision.identity_provenance",
    subject: provenanceSubject,
    decision: "verified",
    evidence: {
      locator: "input/product/photo-v2.png",
      sha256: PHOTO_SHA256,
    },
  };
  await writeFile(
    changePath,
    `${JSON.stringify({
      kind: "actual_product_photo_set_revision",
      old_artifact: {
        artifact_id: "g0b_photo-0",
        manifest_sha256: "5".repeat(64),
      },
      new_artifact: {
        artifact_id: "photo-set-v2",
        type: "identity.photo_set",
        manifest_sha256: "8".repeat(64),
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
        producer_agent_session_id: "cli-photo-producer",
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
          manifest_sha256: "5".repeat(64),
        },
      },
    })}\n`,
    "utf8",
  );
  const common = [
    "--project",
    root,
    "--project-id",
    "project-56328525",
    "--input-digest",
    INPUT_DIGEST,
  ];
  const plannedResult = run([
    "workflow-revision-plan",
    ...common,
    "--agent-session",
    "revision-planner",
    "--change",
    changePath,
  ]);
  assert.equal(plannedResult.status, 0, plannedResult.stderr);
  const planned = JSON.parse(plannedResult.stdout);
  assert.equal(planned.kind, "RevisionPlanned");

  const committedResult = run([
    "workflow-revision-commit",
    ...common,
    "--agent-session",
    "revision-approver",
    "--plan-digest",
    planned.plan_digest,
    "--decided-by",
    "operator-1",
    "--reason",
    "CLI 사진 교체 승인",
  ]);
  assert.equal(committedResult.status, 0, committedResult.stderr);
  assert.equal(
    JSON.parse(committedResult.stdout).kind,
    "RevisionCommitted",
  );
  assert.equal(
    JSON.parse(committedResult.stdout).new_photo_artifact_id,
    "photo-set-v2",
  );

  const statusResult = run(["workflow-status", ...common]);
  assert.equal(statusResult.status, 0, statusResult.stderr);
  const status = JSON.parse(statusResult.stdout);
  assert.equal(
    status.artifacts.find(
      (artifact) => artifact.artifact_id === "g0b_photo-0",
    ).status,
    "stale",
  );
  assert.equal(
    status.artifacts.find(
      (artifact) => artifact.artifact_id === "photo-set-v2",
    ).status,
    "fresh",
  );
});

test("CLI는 persistent rubric repair 기록·상태 명령을 노출한다", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-cli-rubric-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /workflow-rubric-record/);
  assert.match(help.stdout, /workflow-rubric-status/);

  const statusResult = run([
    "workflow-rubric-status",
    "--project",
    root,
    "--project-id",
    "project-56328525",
    "--input-digest",
    INPUT_DIGEST,
  ]);
  assert.equal(statusResult.status, 0, statusResult.stderr);
  const status = JSON.parse(statusResult.stdout);
  assert.equal(status.repair_loop.status, "IDLE");
  assert.equal(status.repair_loop.attempts_used, 0);
});
