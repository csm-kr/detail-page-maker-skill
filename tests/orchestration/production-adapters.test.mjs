import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildGodTiboCommandPlan,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/god-tibo-adapter.mjs";
import {
  buildHyperframesCommandPlan,
  buildHyperframesExecutionReceipt,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/hyperframes-adapter.mjs";

const SKILL_ROOT = path.resolve(
  import.meta.dirname,
  "../../skills/detail-page-maker-skill",
);
const SHA = Object.freeze({
  idempotency: "0".repeat(64),
  inputA: "1".repeat(64),
  inputB: "2".repeat(64),
  outputA: "3".repeat(64),
  outputB: "4".repeat(64),
  identity: "5".repeat(64),
  project: "6".repeat(64),
  preview: "7".repeat(64),
  approval: "8".repeat(64),
  render: "9".repeat(64),
  gif: "a".repeat(64),
  qa: "b".repeat(64),
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function imageWorkOrder({ retry = false } = {}) {
  const workOrder = {
    stage_id: "G2A_IMAGE",
    execution_config: {
      items: 2,
      workers: 2,
      detail_level: "high",
      size_mode: "target",
      target_size: { width: 800, height: 2000 },
      size_confirmation_decision_id: "decision-size-001",
      gif: "forbidden",
      fan_out: [
        {
          candidate_id: "candidate-a",
          worker_id: "worker-a",
          input_sha256: SHA.inputA,
          output_sha256: SHA.outputA,
          status: "passed",
        },
        {
          candidate_id: "candidate-b",
          worker_id: "worker-b",
          input_sha256: SHA.inputB,
          output_sha256: SHA.outputB,
          status: "failed",
        },
      ],
    },
  };
  if (retry) {
    workOrder.execution_config.retry = {
      requested_candidate_ids: ["candidate-b"],
      previous_candidates: [
        {
          candidate_id: "candidate-a",
          input_sha256: SHA.inputA,
          output_sha256: SHA.outputA,
          status: "passed",
        },
        {
          candidate_id: "candidate-b",
          input_sha256: SHA.inputB,
          output_sha256: "f".repeat(64),
          status: "failed",
        },
      ],
    };
  }
  return workOrder;
}

function imageItemSpecs(referenceRoot) {
  return [
    {
      candidate_id: "candidate-a",
      prompt: "제품의 정면 구조를 깨끗한 상업 사진으로 보여 준다.",
      references: [path.join(referenceRoot, "front-a.png")],
    },
    {
      candidate_id: "candidate-b",
      prompt: "제품의 사용 상태를 동일한 구조로 보여 준다.",
      references: [path.join(referenceRoot, "front-b.png")],
    },
  ];
}

async function withStaging(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "production-adapter-"));
  const stagingRoot = path.join(root, "staging");
  await mkdir(stagingRoot);
  try {
    return await run({ root, stagingRoot });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createHyperframesProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), "hf-adapter-"));
  const packageRoot = path.join(
    root,
    "node_modules",
    "hyperframes",
  );
  const packagePath = path.join(packageRoot, "package.json");
  const cliPath = path.join(packageRoot, "dist", "cli.mjs");
  const briefPath = path.join(root, "BRIEF.md");
  await mkdir(path.dirname(cliPath), { recursive: true });
  await writeFile(
    packagePath,
    `${JSON.stringify({
      name: "hyperframes",
      version: "9.9.9-fixture",
      bin: { hyperframes: "dist/cli.mjs" },
    })}\n`,
    "utf8",
  );
  await writeFile(
    cliPath,
    "#!/usr/bin/env node\n// local hyperframes fixture\n",
    "utf8",
  );
  await writeFile(
    briefPath,
    "# BRIEF\n\n승인 제품의 상태 변화를 보여 준다.\n",
    "utf8",
  );
  const briefDigest = sha256(
    "# BRIEF\n\n승인 제품의 상태 변화를 보여 준다.\n",
  );
  return { root, cliPath, briefPath, briefDigest };
}

function motionPrefix(briefDigest, { approved = false } = {}) {
  const chain = {
    brief: {
      artifact_id: "gif-brief-001",
      digest: briefDigest,
      source_image_artifact_ids: ["image-approved-001"],
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:00:00.000Z",
    },
    motion_project: {
      artifact_id: "motion-project-001",
      digest: SHA.project,
      brief_digest: briefDigest,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:01:00.000Z",
    },
    preview: {
      artifact_id: "motion-preview-001",
      digest: SHA.preview,
      motion_project_digest: SHA.project,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:02:00.000Z",
    },
  };
  if (approved) {
    chain.preview_approval = {
      decision_id: "decision-preview-001",
      digest: SHA.approval,
      decision: "approved",
      subject_preview_digest: SHA.preview,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:03:00.000Z",
    };
  }
  return chain;
}

function completeMotionChain(briefDigest) {
  return {
    ...motionPrefix(briefDigest, { approved: true }),
    render: {
      artifact_id: "motion-render-001",
      digest: SHA.render,
      motion_project_digest: SHA.project,
      preview_approval_digest: SHA.approval,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:04:00.000Z",
    },
    gif: {
      artifact_id: "gif-candidate-001",
      digest: SHA.gif,
      render_digest: SHA.render,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:05:00.000Z",
    },
    final_qa: {
      validation_id: "validation-gif-001",
      digest: SHA.qa,
      subject_gif_digest: SHA.gif,
      source_identity_digest: SHA.identity,
      verdict: "PASS",
      hard_failures: [],
      created_at: "2026-07-30T01:06:00.000Z",
    },
    asset_approval: {
      decision_id: "decision-gif-001",
      decision: "approved",
      subject_gif_digest: SHA.gif,
      validation_digest: SHA.qa,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:07:00.000Z",
    },
  };
}

function fallbackSpec() {
  return {
    static_artifact_id: "image-approved-001",
    reason: "모션을 표시할 수 없는 환경에서는 승인된 마지막 상태를 사용한다.",
    object_fit: "contain",
  };
}

test("God Tibo adapter는 로컬 runner와 명시적 one-cut-per-worker argv만 만든다", async () => {
  await withStaging(async ({ stagingRoot }) => {
    const plan = await buildGodTiboCommandPlan({
      skillRoot: SKILL_ROOT,
      workOrder: imageWorkOrder(),
      itemSpecs: imageItemSpecs(stagingRoot),
      allowedStagingRoot: stagingRoot,
      stagingRoot,
      idempotencyKey: SHA.idempotency,
    });

    const expectedRunner = path.join(
      SKILL_ROOT,
      ".agents",
      "skills",
      "god-tibo-gpt-image2-skill",
      "scripts",
      "tibo-batch.mjs",
    );
    assert.equal(plan.adapter, "GodTiboImageAdapter");
    assert.equal(plan.runner_path, expectedRunner);
    assert.equal(plan.commands.length, 2);
    assert.deepEqual(
      plan.commands.map((command) => command.candidate_id),
      ["candidate-a", "candidate-b"],
    );
    for (const command of plan.commands) {
      assert.equal(command.command, process.execPath);
      assert.equal(Array.isArray(command.argv), true);
      assert.equal(command.argv[0], expectedRunner);
      assert.equal(command.argv[1], "--job");
      assert.equal(command.argv.length, 3);
      assert.equal(command.job_spec.items.length, 1);
      assert.equal(command.job_spec.workers, 1);
      assert.equal(command.job_spec.detail_level, 3);
      assert.equal(command.job_spec.size_mode, "controllable");
      assert.equal(command.job_spec.target_size, "800x2000");
      assert.equal(command.job_spec.gif, false);
      assert.match(
        command.job_spec.items[0].prompt,
        /QUALITY_GATE:CLEAN_COMMERCIAL/,
      );
      assert.equal(
        path.relative(stagingRoot, command.job_path).startsWith(".."),
        false,
      );
      assert.equal(
        path.relative(stagingRoot, command.job_spec.output_dir).startsWith(
          "..",
        ),
        false,
      );
    }
    assert.equal(
      plan.planning_receipt.size_confirmation_decision_id,
      "decision-size-001",
    );
    assert.equal(
      plan.planning_receipt.gif_output,
      "forbidden",
    );
    assert.match(plan.planning_receipt.command_plan_sha256, /^[a-f0-9]{64}$/);
  });
});

test("God Tibo retry는 실패한 member만 같은 input hash로 다시 계획한다", async () => {
  await withStaging(async ({ stagingRoot }) => {
    const plan = await buildGodTiboCommandPlan({
      skillRoot: SKILL_ROOT,
      workOrder: imageWorkOrder({ retry: true }),
      itemSpecs: imageItemSpecs(stagingRoot),
      allowedStagingRoot: stagingRoot,
      stagingRoot,
      idempotencyKey: SHA.idempotency,
    });

    assert.equal(plan.retry_mode, "failed_members_only");
    assert.deepEqual(
      plan.commands.map((command) => command.candidate_id),
      ["candidate-b"],
    );
    assert.equal(plan.commands[0].input_sha256, SHA.inputB);
  });
});

test("God Tibo adapter는 GIF·기본 설정·staging 탈출을 허용하지 않는다", async (t) => {
  await withStaging(async ({ root, stagingRoot }) => {
    await t.test("GIF enabled", async () => {
      const invalid = imageWorkOrder();
      invalid.execution_config.gif = "allowed";
      await assert.rejects(
        buildGodTiboCommandPlan({
          skillRoot: SKILL_ROOT,
          workOrder: invalid,
          itemSpecs: imageItemSpecs(stagingRoot),
          allowedStagingRoot: stagingRoot,
          stagingRoot,
          idempotencyKey: SHA.idempotency,
        }),
        (error) => error.code === "INVALID_IMAGE_WORK_ORDER",
      );
    });

    await t.test("missing explicit detail", async () => {
      const invalid = imageWorkOrder();
      delete invalid.execution_config.detail_level;
      await assert.rejects(
        buildGodTiboCommandPlan({
          skillRoot: SKILL_ROOT,
          workOrder: invalid,
          itemSpecs: imageItemSpecs(stagingRoot),
          allowedStagingRoot: stagingRoot,
          stagingRoot,
          idempotencyKey: SHA.idempotency,
        }),
        (error) => error.code === "INVALID_IMAGE_WORK_ORDER",
      );
    });

    await t.test("staging escape", async () => {
      await assert.rejects(
        buildGodTiboCommandPlan({
          skillRoot: SKILL_ROOT,
          workOrder: imageWorkOrder(),
          itemSpecs: imageItemSpecs(stagingRoot),
          allowedStagingRoot: stagingRoot,
          stagingRoot: root,
          idempotencyKey: SHA.idempotency,
        }),
        (error) => error.code === "STAGING_ROOT_OUTSIDE_ALLOWED_ROOT",
      );
    });
  });
});

test("HyperFrames preview plan은 로컬 CLI로 BRIEF→strict frame-check→preview까지만 만든다", async () => {
  const fixture = await createHyperframesProject();
  const allowedStagingRoot = path.join(fixture.root, ".staging");
  await mkdir(allowedStagingRoot);
  try {
    const plan = await buildHyperframesCommandPlan({
      mode: "preview",
      projectRoot: fixture.root,
      briefPath: fixture.briefPath,
      chain: motionPrefix(fixture.briefDigest),
      allowedStagingRoot,
      stagingRoot: allowedStagingRoot,
      idempotencyKey: SHA.idempotency,
      previewPort: 3017,
      durationSec: 4,
      renderFps: 30,
      gifFps: 15,
      fallback: fallbackSpec(),
    });

    assert.equal(plan.adapter, "HyperFramesMotionAdapter");
    assert.equal(plan.cli_path, fixture.cliPath);
    assert.equal(plan.gate_status, "awaiting_preview_approval");
    assert.equal(plan.pre_approval_steps[0].kind, "brief");
    assert.deepEqual(plan.pre_approval_steps[1].argv.slice(1), [
      "check",
      ".",
      "--strict",
      "--frame-check",
      "--json",
    ]);
    assert.deepEqual(plan.pre_approval_steps[2].argv.slice(1), [
      "preview",
      "--port",
      "3017",
    ]);
    assert.equal(
      plan.pre_approval_steps
        .filter((step) => step.kind === "command")
        .every(
          (step) =>
            step.command === process.execPath &&
            step.argv[0] === fixture.cliPath &&
            Array.isArray(step.argv) &&
            step.cwd === fixture.root,
        ),
      true,
    );
    assert.deepEqual(plan.render_commands, []);
    assert.deepEqual(
      plan.qa_spec.frames.map((frame) => frame.label),
      ["first", "mid", "last"],
    );
    assert.deepEqual(plan.fallback_spec, fallbackSpec());
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("HyperFrames render/GIF argv는 exact preview approval digest 뒤에만 생긴다", async () => {
  const fixture = await createHyperframesProject();
  const allowedStagingRoot = path.join(fixture.root, ".staging");
  await mkdir(allowedStagingRoot);
  try {
    const plan = await buildHyperframesCommandPlan({
      mode: "render",
      projectRoot: fixture.root,
      briefPath: fixture.briefPath,
      chain: motionPrefix(fixture.briefDigest, { approved: true }),
      expectedPreviewApprovalDigest: SHA.approval,
      allowedStagingRoot,
      stagingRoot: allowedStagingRoot,
      idempotencyKey: SHA.idempotency,
      previewPort: 3017,
      durationSec: 4,
      renderFps: 30,
      gifFps: 15,
      fallback: fallbackSpec(),
    });

    assert.equal(plan.gate_status, "preview_approved");
    assert.equal(plan.render_commands.length, 2);
    assert.deepEqual(
      plan.render_commands.map((command) => command.argv.slice(1, 3)),
      [
        ["render", "."],
        ["render", "."],
      ],
    );
    assert.equal(
      plan.render_commands[0].argv.includes("mp4"),
      true,
    );
    assert.equal(
      plan.render_commands[1].argv.includes("gif"),
      true,
    );
    assert.equal(
      plan.render_commands.every(
        (command) =>
          command.preview_approval_digest === SHA.approval &&
          command.command === process.execPath &&
          command.argv[0] === fixture.cliPath &&
          Array.isArray(command.argv),
      ),
      true,
    );
    assert.deepEqual(
      plan.qa_spec.frames.map((frame) => frame.at_seconds),
      [0, 2, 3.966667],
    );
    assert.equal(plan.qa_spec.frame_check_required, true);
    assert.equal(plan.qa_spec.loop_boundary_required, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("HyperFrames는 preview approval가 없거나 digest가 다르면 render command를 만들지 않는다", async (t) => {
  const fixture = await createHyperframesProject();
  const allowedStagingRoot = path.join(fixture.root, ".staging");
  await mkdir(allowedStagingRoot);
  const base = {
    mode: "render",
    projectRoot: fixture.root,
    briefPath: fixture.briefPath,
    allowedStagingRoot,
    stagingRoot: allowedStagingRoot,
    idempotencyKey: SHA.idempotency,
    previewPort: 3017,
    durationSec: 4,
    renderFps: 30,
    gifFps: 15,
    fallback: fallbackSpec(),
  };
  try {
    await t.test("approval absent", async () => {
      await assert.rejects(
        buildHyperframesCommandPlan({
          ...base,
          chain: motionPrefix(fixture.briefDigest),
          expectedPreviewApprovalDigest: SHA.approval,
        }),
        (error) => error.code === "PREVIEW_APPROVAL_REQUIRED",
      );
    });
    await t.test("approval digest mismatch", async () => {
      await assert.rejects(
        buildHyperframesCommandPlan({
          ...base,
          chain: motionPrefix(fixture.briefDigest, { approved: true }),
          expectedPreviewApprovalDigest: "f".repeat(64),
        }),
        (error) => error.code === "PREVIEW_APPROVAL_DIGEST_MISMATCH",
      );
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("HyperFrames 완료 receipt는 기존 motion chain validator와 first/mid/last QA를 재검증한다", async () => {
  const fixture = await createHyperframesProject();
  const allowedStagingRoot = path.join(fixture.root, ".staging");
  await mkdir(allowedStagingRoot);
  try {
    const commandPlan = await buildHyperframesCommandPlan({
      mode: "render",
      projectRoot: fixture.root,
      briefPath: fixture.briefPath,
      chain: motionPrefix(fixture.briefDigest, { approved: true }),
      expectedPreviewApprovalDigest: SHA.approval,
      allowedStagingRoot,
      stagingRoot: allowedStagingRoot,
      idempotencyKey: SHA.idempotency,
      previewPort: 3017,
      durationSec: 4,
      renderFps: 30,
      gifFps: 15,
      fallback: fallbackSpec(),
    });
    const receipt = buildHyperframesExecutionReceipt({
      commandPlan,
      completedChain: completeMotionChain(fixture.briefDigest),
      observedQaFrames: [
        { label: "first", sha256: "c".repeat(64), verdict: "PASS" },
        { label: "mid", sha256: "d".repeat(64), verdict: "PASS" },
        { label: "last", sha256: "e".repeat(64), verdict: "PASS" },
      ],
    });

    assert.equal(receipt.adapter, "HyperFramesMotionAdapter");
    assert.equal(receipt.motion_chain_validation, "PASS");
    assert.equal(receipt.preview_approval_digest, SHA.approval);
    assert.deepEqual(
      receipt.qa_frame_sha256s.map((frame) => frame.label),
      ["first", "mid", "last"],
    );

    const invalid = completeMotionChain(fixture.briefDigest);
    invalid.gif.render_digest = "f".repeat(64);
    assert.throws(
      () =>
        buildHyperframesExecutionReceipt({
          commandPlan,
          completedChain: invalid,
          observedQaFrames: [
            {
              label: "first",
              sha256: "c".repeat(64),
              verdict: "PASS",
            },
            { label: "mid", sha256: "d".repeat(64), verdict: "PASS" },
            {
              label: "last",
              sha256: "e".repeat(64),
              verdict: "PASS",
            },
          ],
        }),
      (error) => error.code === "INVALID_MOTION_PRODUCTION_CHAIN",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("HyperFrames adapter는 프로젝트 로컬 CLI와 허용 staging root를 강제한다", async (t) => {
  const fixture = await createHyperframesProject();
  const allowedStagingRoot = path.join(fixture.root, ".staging");
  await mkdir(allowedStagingRoot);
  try {
    await t.test("missing local CLI", async () => {
      await rm(fixture.cliPath);
      await assert.rejects(
        buildHyperframesCommandPlan({
          mode: "preview",
          projectRoot: fixture.root,
          briefPath: fixture.briefPath,
          chain: motionPrefix(fixture.briefDigest),
          allowedStagingRoot,
          stagingRoot: allowedStagingRoot,
          idempotencyKey: SHA.idempotency,
          previewPort: 3017,
          durationSec: 4,
          renderFps: 30,
          gifFps: 15,
          fallback: fallbackSpec(),
        }),
        (error) => error.code === "PROJECT_LOCAL_HYPERFRAMES_CLI_REQUIRED",
      );
    });

    await t.test("staging escape", async () => {
      await writeFile(
        fixture.cliPath,
        "#!/usr/bin/env node\n// local hyperframes fixture\n",
        "utf8",
      );
      await assert.rejects(
        buildHyperframesCommandPlan({
          mode: "preview",
          projectRoot: fixture.root,
          briefPath: fixture.briefPath,
          chain: motionPrefix(fixture.briefDigest),
          allowedStagingRoot,
          stagingRoot: fixture.root,
          idempotencyKey: SHA.idempotency,
          previewPort: 3017,
          durationSec: 4,
          renderFps: 30,
          gifFps: 15,
          fallback: fallbackSpec(),
        }),
        (error) => error.code === "STAGING_ROOT_OUTSIDE_ALLOWED_ROOT",
      );
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
