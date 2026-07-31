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
import {
  planParallelFrontier,
  productionPlanDigest,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/parallel-frontier.mjs";
import {
  createParallelProductionPlan,
} from "../fixtures/orchestration/parallel-production-plan.mjs";
import {
  attachValidHeroAssurance,
} from "../helpers/hero-assurance-fixture.mjs";

const hash = (value) =>
  createHash("sha256").update(String(value)).digest("hex");

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
  return hash(JSON.stringify(canonicalize(value)));
}

function canonicalJsonBytes(value) {
  return Buffer.from(
    `${JSON.stringify(canonicalize(value))}\n`,
    "utf8",
  );
}

async function materializedG4Envelope(root, workOrder) {
  const revisionId = "studio-rev-e2e-materialized";
  const revisionRelativeRoot =
    `.detail-page/workflow/revisions/${revisionId}`;
  const revisionRoot = path.join(
    root,
    ...revisionRelativeRoot.split("/"),
  );
  const htmlBytes = Buffer.from(
    `<!doctype html>
<html lang="ko"><body><main>
  <section data-section-id="section-hero">
    <h2 data-copy-id="copy-hero" data-claim-id="claim-fast">빠르고 편안한 핵심 장점</h2>
    <figure data-slot-id="slot-hero" data-artifact-id="image-approved-001">
      <img src="assets/hero.bin" alt="">
    </figure>
  </section>
</main></body></html>`,
    "utf8",
  );
  const heroAssetBytes = Buffer.from(
    "approved-image-fixture\n",
    "utf8",
  );
  const assetManifestBytes = Buffer.from(
    `${JSON.stringify({
      schema_version: "1.0",
      assets: [
        {
          artifact_id: "image-approved-001",
          path: "assets/hero.bin",
          bytes: heroAssetBytes.length,
          sha256: hash(heroAssetBytes),
        },
      ],
    })}\n`,
    "utf8",
  );
  const contract = attachValidHeroAssurance({
    resolved_section_graph: {
      graph_id: "resolved-graph-e2e-materialized",
      sections: [
        {
          section_id: "section-hero",
          role: "hero",
          html_copy: ["빠르고 편안한 핵심 장점"],
          claims: [
            {
              claim_id: "claim-fast",
              html_copy: ["빠르고 편안한 핵심 장점"],
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
    html: htmlBytes.toString("utf8"),
  }, {
    heroArtifactSha256: hash(heroAssetBytes),
  });
  const assuranceBundle = {
    schema_version: "1.0",
    manifest: contract.hero_assurance.manifest,
    commercial_validation_receipt:
      contract.hero_assurance.commercial_validation_receipt,
    validation_receipt:
      contract.hero_assurance.validation_receipt,
    resolved_section_graph: contract.resolved_section_graph,
    approved_artifacts: contract.approved_artifacts,
    identity_source_artifacts:
      contract.identity_source_artifacts,
  };
  const assuranceBytes = canonicalJsonBytes(assuranceBundle);
  const identitySource =
    assuranceBundle.identity_source_artifacts.find(
      (artifact) =>
        artifact.artifact_id ===
        assuranceBundle.manifest.identity_source.artifact_id,
    );
  const revisionBody = {
    schema_version: "1.0",
    revision_id: revisionId,
    revision_kind: "committed",
    mutable: false,
    artifact_id: `studio-artifact-${revisionId}`,
    artifact_sha256: hash("e2e-materialized-artifact-set"),
    source_working_id: "studio-working-e2e",
    source_working_artifact_set_digest:
      hash("e2e-materialized-working-set"),
    assembly_artifact_id: "assembly-e2e",
    assembly_manifest_sha256: hash("assembly-e2e"),
    html_sha256: hash(htmlBytes),
    asset_manifest_sha256: hash(assetManifestBytes),
    hero_assurance_manifest_sha256: canonicalSha256(
      assuranceBundle.manifest,
    ),
    hero_assurance_validation_receipt_sha256:
      canonicalSha256(assuranceBundle.validation_receipt),
    hero_commercial_validation_receipt_sha256:
      canonicalSha256(
        assuranceBundle.commercial_validation_receipt,
      ),
    hero_identity_validation_receipt_sha256:
      canonicalSha256(
        identitySource.g2_identity_validation_receipt,
      ),
    hero_assurance_bundle_sha256: hash(assuranceBytes),
    hero_assurance_member_id: "hero-assurance.json",
    hero_assurance_member_locator:
      `${revisionRelativeRoot}/hero-assurance.json`,
    hero_assurance_member_sha256: hash(assuranceBytes),
    hero_assurance_member_size_bytes: assuranceBytes.length,
    asset_content_set_sha256: hash("e2e-assets"),
    semantic_dom_diff: {
      changed: false,
      structural_changes: [],
    },
    rubric_result_sha256: hash("e2e-rubric"),
    rubric_sha256: hash("e2e-rubric-definition"),
    rubric_gate: { status: "PASS", score: 100 },
    qa_receipt_sha256: hash("e2e-qa-receipt"),
    thresholds: {
      qa_score: 97,
      target_score: 97,
      behance_weighted_target: 90,
      critical_dimension_target: 85,
    },
    parent_commit_sha256: null,
  };
  const revision = {
    ...revisionBody,
    commit_sha256: canonicalSha256(revisionBody),
    committed_at: "2026-07-30T03:03:00.000Z",
  };
  const revisionBytes = canonicalJsonBytes(revision);
  const materializedFiles = [
    {
      member_id: "revision.json",
      locator: `${revisionRelativeRoot}/revision.json`,
      bytes: revisionBytes,
    },
    {
      member_id: "index.html",
      locator: `${revisionRelativeRoot}/index.html`,
      bytes: htmlBytes,
    },
    {
      member_id: "asset-manifest.json",
      locator: `${revisionRelativeRoot}/asset-manifest.json`,
      bytes: assetManifestBytes,
    },
    {
      member_id: "hero-assurance.json",
      locator: `${revisionRelativeRoot}/hero-assurance.json`,
      bytes: assuranceBytes,
    },
    {
      member_id: "image-approved-001",
      locator: `${revisionRelativeRoot}/assets/hero.bin`,
      bytes: heroAssetBytes,
    },
  ];
  await mkdir(path.join(revisionRoot, "assets"), {
    recursive: true,
  });
  await Promise.all(
    materializedFiles.map((member) =>
      writeFile(
        path.join(root, ...member.locator.split("/")),
        member.bytes,
      ),
    ),
  );
  const members = materializedFiles
    .map((member) => ({
      member_id: member.member_id,
      root_id: "project",
      locator: member.locator,
      sha256: hash(member.bytes),
      size_bytes: member.bytes.length,
    }))
    .sort((left, right) =>
      left.member_id.localeCompare(right.member_id),
    );
  const memberManifest = {
    schema_version: "1.0",
    policy: "materialized",
    members,
  };
  const assuranceMember = members.find(
    (member) => member.member_id === "hero-assurance.json",
  );
  const committedArtifact = {
    artifact_id: revision.artifact_id,
    type: "studio.committed_revision",
    manifest_sha256: revision.commit_sha256,
    member_ids: members.map((member) => member.member_id),
    member_manifest: memberManifest,
    revision_id: revision.revision_id,
    revision_path: revisionRelativeRoot,
    revision_commit_sha256: revision.commit_sha256,
    html_sha256: revision.html_sha256,
    hero_assurance_bundle_sha256:
      revision.hero_assurance_bundle_sha256,
    hero_assurance_manifest_sha256:
      revision.hero_assurance_manifest_sha256,
    hero_identity_validation_receipt_sha256:
      revision.hero_identity_validation_receipt_sha256,
    hero_commercial_validation_receipt_sha256:
      revision.hero_commercial_validation_receipt_sha256,
    hero_assurance_validation_receipt_sha256:
      revision.hero_assurance_validation_receipt_sha256,
    hero_assurance_member: assuranceMember,
    revision,
    mutable: false,
  };
  const htmlMember = members.find(
    (member) => member.member_id === "index.html",
  );
  const htmlArtifact = {
    artifact_id: `html-${revision.revision_id}`,
    type: "page.html_revision",
    manifest_sha256: revision.html_sha256,
    member_ids: ["index.html"],
    member_manifest: {
      schema_version: "1.0",
      policy: "materialized",
      members: [htmlMember],
    },
    revision_id: revision.revision_id,
    revision_commit_sha256: revision.commit_sha256,
    revision_path: revisionRelativeRoot,
  };
  return {
    ...envelope(workOrder),
    output_artifacts: [committedArtifact, htmlArtifact],
  };
}

function project(agentSessionId = "e2e-coordinator") {
  return {
    project_id: "project-56328525-e2e",
    input_digest: hash("https://domeggook.com/56328525"),
    agent_session_id: agentSessionId,
  };
}

function envelope(workOrder, motionRequired = true) {
  const selectedOutputTypes =
    workOrder.stage_id === "G3N_MOTION_DECISION" &&
    motionRequired === false
      ? ["decision.motion_not_required"]
      : workOrder.expected_output_types;
  const outputArtifacts = selectedOutputTypes.map(
    (type, index) => ({
      artifact_id: `artifact-${workOrder.stage_id.toLowerCase()}-${index}`,
      type,
      manifest_sha256: hash(
        `${workOrder.stage_id}:${type}:${index}`,
      ),
      member_ids: [`${type.replaceAll(".", "-")}.json`],
    }),
  );
  const result = {
    project_ref: project(workOrder.assigned_agent_session_id),
    producer_agent_session_id: workOrder.assigned_agent_session_id,
    input_set_digest: workOrder.input_set_digest,
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: outputArtifacts,
    execution_receipt: {
      execution_id: `execution-${workOrder.work_order_id}`,
      adapter_id: workOrder.runner_contract.adapter_id,
      adapter_version: "1.0.0",
      adapter_code_sha256: hash(
        `adapter:${workOrder.stage_id}:1.0.0`,
      ),
    },
  };
  if (
    workOrder.stage_id.endsWith("_QA") ||
    workOrder.stage_id === "G4Q_RUBRIC"
  ) {
    result.validation_receipt = {
      validation_id: `validation-${workOrder.work_order_id}`,
      subject: {
        artifact_set_digest: workOrder.input_set_digest,
        artifact_ids: workOrder.input_artifacts.map(
          (artifact) => artifact.artifact_id,
        ),
      },
      validator: {
        name: `fixture-${workOrder.stage_id.toLowerCase()}`,
        version: "1.0.0",
        code_sha256: hash(`validator:${workOrder.stage_id}`),
        agent_id: `agent-${workOrder.stage_id.toLowerCase()}`,
        agent_session_id: workOrder.assigned_agent_session_id,
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
        policy_sha256: hash(workOrder.gate_policy_id),
      },
      validator_kind: "deterministic",
      checks: [
        {
          check_id: `${workOrder.stage_id}.fixture-pass`,
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
        reference_comparison: {
          status: "PASS",
          reference_ids: ["current-output-baseline"],
          dimensions: [
            "desire_formation",
            "observable_differentiation",
            "scene_diversity",
            "motion_semantic_delta",
            "delivery_780",
            "decision_close",
          ].map((criterionId) => ({
            criterion_id: criterionId,
            current_score: 100,
            reference_score: 90,
            observation:
              "공개 output이 기준 산출물보다 낮아지지 않았다.",
          })),
        },
        category_reference_comparison: {
          status: "PASS",
          library_sha256: "a".repeat(64),
          reference_card_ids: [
            "behance-makeon-led-mask",
            "behance-replaceable-toothbrush",
          ],
          target: "meet_or_exceed_selected_cohort",
          dimensions: [
            "desire_formation",
            "observable_differentiation",
            "scene_diversity",
            "motion_semantic_delta",
            "delivery_780",
            "decision_close",
          ].map((criterionId) => ({
            criterion_id: criterionId,
            current_score: 100,
            cohort_score: 90,
            observation:
              "공개 output이 선택 cohort의 시각적 기준을 충족했다.",
          })),
        },
      },
      hard_failures: [],
      verdict: "PASS",
      started_at: "2026-07-30T01:00:00.000Z",
      finished_at: "2026-07-30T01:01:00.000Z",
    };
  }
  return result;
}

async function completeParallelProductionStage(
  engine,
  stageId,
  productionPlan,
) {
  const workerSessionIds = Array.from(
    { length: 16 },
    (_, index) => `frontier-${stageId.toLowerCase()}-${index + 1}`,
  );
  const frontierPlan = planParallelFrontier({
    ready_stage_ids: [stageId],
    project_input_digest: project().input_digest,
    production_plan: productionPlan,
    plan_approval: {
      decision_id: "decision-plan-e2e",
      decision: "approved",
      subject_plan_sha256:
        productionPlanDigest(productionPlan),
    },
    approved_image_job_ids:
      productionPlan.image_job_set.jobs.map(
        (job) => job.job_id,
      ),
    worker_capacity: workerSessionIds.length,
    worker_session_ids: workerSessionIds,
  });
  const leased = await engine.leaseFrontier(
    project(`frontier-coordinator-${stageId}`),
    {
      worker_capacity: workerSessionIds.length,
      agent_session_ids: workerSessionIds,
      stage_ids: [stageId],
      planned_work_items: frontierPlan.work_orders,
    },
  );
  for (const workOrder of leased.work_orders) {
    const outputArtifacts =
      workOrder.expected_output_types.map((type, index) => ({
        artifact_id:
          index === 0
            ? workOrder.frontier_expected_artifact_id
            : `${workOrder.frontier_expected_artifact_id}-${index}`,
        type,
        manifest_sha256: hash(
          `${workOrder.work_item_id}:${type}:${index}`,
        ),
        member_ids: [
          `${workOrder.member_id}-${type.replaceAll(".", "-")}.json`,
        ],
      }));
    await engine.submit(workOrder.work_order_id, {
      project_ref: project(
        workOrder.assigned_agent_session_id,
      ),
      producer_agent_session_id:
        workOrder.assigned_agent_session_id,
      input_set_digest: workOrder.input_set_digest,
      fencing_token: workOrder.fencing_token,
      attempt: workOrder.attempt,
      output_artifacts: outputArtifacts,
      execution_receipt: {
        execution_id:
          `execution-${workOrder.work_item_id}`,
        adapter_id: workOrder.runner_contract.adapter_id,
        adapter_version: "1.0.0",
        adapter_code_sha256: hash(
          `adapter:${workOrder.work_item_id}`,
        ),
      },
    });
  }
  await engine.completeParallelFrontier(project(), {
    stage_id: stageId,
    expected_work_item_ids:
      frontierPlan.candidate_work_item_ids,
  });
}

test("fixture adapter로 G0→G5 전체가 receipt와 exact approval을 거쳐 완료된다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-e2e-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });
  const productionPlan = createParallelProductionPlan();

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const status = await engine.inspect(project());
    if (status.stages.G5U_APPROVAL.status === "approved") break;
    const progress = await engine.advance(project(), {
      until: "publish_ready",
    });
    if (progress.kind === "AwaitUser") {
      await engine.decide(progress.challenge.challenge_id, {
        project_ref: project(`user-${progress.stage_id}`),
        nonce: progress.challenge.nonce,
        subject_artifact_set_digest:
          progress.challenge.subject_artifact_set_digest,
        decision: "approved",
        decided_by: "e2e-user",
        approval_channel: "studio-v1-fixture",
      });
      continue;
    }
    assert.equal(progress.kind, "WorkAvailable");
    const stageId = progress.ready_stages[0];
    if (
      ["G2A_IMAGE", "G3P_PREVIEW", "G3R_RENDER"].includes(
        stageId,
      )
    ) {
      await completeParallelProductionStage(
        engine,
        stageId,
        productionPlan,
      );
      continue;
    }
    const workOrder = await engine.lease(
      project(`producer-${stageId}`),
      { stage_ids: [stageId] },
    );
    await engine.submit(
      workOrder.work_order_id,
      stageId === "G4C_STUDIO_COMMIT"
        ? await materializedG4Envelope(root, workOrder)
        : envelope(workOrder),
    );
  }

  const completed = await engine.inspect(project());
  assert.equal(completed.stages.G5U_APPROVAL.status, "approved");
  assert.equal(completed.state_integrity.status, "verified");
  assert.equal(completed.publish_approval.status, "verified");
  assert.equal(completed.publish_approval.valid, true);
  assert.match(
    completed.publish_approval.artifact_id,
    /^decision-g5u_approval-/,
  );
  assert.match(
    completed.publish_approval.subject_artifact_set_digest,
    /^[a-f0-9]{64}$/,
  );
  assert.ok(
    Object.values(completed.stages).every((entry) =>
      ["completed", "approved"].includes(entry.status),
    ),
  );
  const state = JSON.parse(
    await readFile(
      path.join(
        root,
        ".detail-page",
        "workflow",
        "project-56328525-e2e.json",
      ),
      "utf8",
    ),
  );
  assert.ok(state.graph.artifacts.length >= 30);
  assert.ok(state.graph.edges.length >= 30);
  assert.ok(
    state.graph.artifacts
      .filter((artifact) => !artifact.approval_receipt)
      .every((artifact) => artifact.execution_receipt),
  );
  assert.equal(
    state.graph.artifacts.filter(
      (artifact) => artifact.status !== "fresh",
    ).length,
    0,
  );
});

test("필수 motion을 not_required로 우회하면 G3 결정 commit을 거부한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-static-e2e-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = createWorkflowEngine({ projectRoot: root });
  const productionPlan = createParallelProductionPlan();

  let bypassRejected = false;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const progress = await engine.advance(project(), {
      until: "publish_ready",
    });
    if (progress.kind === "AwaitUser") {
      await engine.decide(progress.challenge.challenge_id, {
        project_ref: project(`user-${progress.stage_id}`),
        nonce: progress.challenge.nonce,
        subject_artifact_set_digest:
          progress.challenge.subject_artifact_set_digest,
        decision: "approved",
        decided_by: "e2e-user",
        approval_channel: "studio-v1-fixture",
      });
      continue;
    }
    assert.equal(progress.kind, "WorkAvailable");
    const stageId = progress.ready_stages[0];
    if (
      ["G2A_IMAGE", "G3P_PREVIEW", "G3R_RENDER"].includes(
        stageId,
      )
    ) {
      await completeParallelProductionStage(
        engine,
        stageId,
        productionPlan,
      );
      continue;
    }
    const workOrder = await engine.lease(
      project(`producer-${stageId}`),
      { stage_ids: [stageId] },
    );
    if (stageId === "G3N_MOTION_DECISION") {
      await assert.rejects(
        engine.submit(
          workOrder.work_order_id,
          envelope(workOrder, false),
        ),
        (error) => error.code === "OUTPUT_TYPE_MISMATCH",
      );
      bypassRejected = true;
      break;
    }
    await engine.submit(
      workOrder.work_order_id,
      envelope(workOrder),
    );
  }

  assert.equal(bypassRejected, true);
  const blocked = await engine.inspect(project());
  assert.equal(blocked.stages.G3N_MOTION_DECISION.status, "running");
  assert.equal(blocked.stages.G4A_ASSEMBLY.status, "pending");
});
