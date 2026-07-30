import assert from "node:assert/strict";
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
import { fileURLToPath } from "node:url";

import {
  LearningPipelineExecutionAdapter,
  LearningPipelineExecutionError,
  learningMaintenancePlanDigest,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/learning-pipeline-adapter.mjs";
import {
  ACTIVE_RULE_REFERENCES,
  LearningPipelineAdapter,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/learning-pipeline.mjs";
import {
  validateValidationReceipt,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/receipt-contracts.mjs";

const PROJECT_SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../skills/detail-page-maker-skill",
);
const H = {
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
};
const POLICY = {
  policy_id: "learning-promotion-policy",
  version: "1.0.0",
  sha256: H.a,
};
const RUBRIC = {
  rubric_id: "learning-generalization-rubric",
  version: "1.1.0",
  sha256: H.b,
};

function candidate(sourceType = "feedback") {
  return {
    candidate_id: `LEARN-${sourceType.toUpperCase()}-001`,
    source_type: sourceType,
    category: sourceType === "feedback" ? "layout" : "commercial",
    title: "Evidence-led page sequencing",
    rule_text:
      "Sequence the problem, proof, and product benefit in distinct sections.",
    source_locator: `source-${sourceType}-fixture`,
    producer_session_id: "learning-producer",
    captured_at: "2026-07-30T09:00:00.000Z",
    sensitive_terms: {
      product_names: [],
      unique_copy: [],
    },
  };
}

function pipeline() {
  return new LearningPipelineAdapter({
    policy: POLICY,
    rubric: RUBRIC,
  });
}

function reviewEvidence() {
  return ["case-a", "case-b", "case-c"].map((caseId) => ({
    evidence_kind: "case",
    case_id: caseId,
    outcome: "PASS",
    artifact_sha256: H.c,
  }));
}

function distillScript(mode) {
  if (mode === "failure") {
    return [
      'import { writeFileSync } from "node:fs";',
      'writeFileSync("references/commercial.md", "MUTATED\\n");',
      'process.stderr.write("fixture failure\\n");',
      "process.exitCode = 7;",
      "",
    ].join("\n");
  }
  if (mode === "timeout") {
    return [
      'import { writeFileSync } from "node:fs";',
      'writeFileSync("references/motion.md", "MUTATED\\n");',
      "setTimeout(() => {}, 10_000);",
      "",
    ].join("\n");
  }
  return [
    'import { mkdirSync, writeFileSync } from "node:fs";',
    'import path from "node:path";',
    "const args = process.argv.slice(2);",
    'const outputIndex = args.indexOf("--output");',
    'if (outputIndex < 0) throw new Error("missing --output");',
    "const output = args[outputIndex + 1];",
    "mkdirSync(path.dirname(output), { recursive: true });",
    'writeFileSync(output, "# Distilled learning candidates\\n\\n| fixture | LEARN-FEEDBACK-001 |\\n");',
    'process.stdout.write("updated=" + output + "\\ncandidates=1\\n");',
    "",
  ].join("\n");
}

function statusScript() {
  return [
    "const args = process.argv.slice(2);",
    'const workspaceIndex = args.indexOf("--workspace");',
    'if (workspaceIndex < 0 || !args.includes("--json")) throw new Error("fixed args missing");',
    "process.stdout.write(JSON.stringify({",
    "  workspaceRoot: args[workspaceIndex + 1],",
    "  counts: { distilledCandidates: 1 },",
    "  flows: { feedback: [\"intake\", \"sanitize\", \"review\", \"promotion\"] }",
    "}) + \"\\n\");",
    "",
  ].join("\n");
}

function refreshBehanceScript() {
  return [
    "param([string]$WorkspaceRoot, [int]$MaxProjects)",
    "$learningRoot = Join-Path $WorkspaceRoot '.workspace\\learning\\behance'",
    "New-Item -ItemType Directory -Path $learningRoot -Force | Out-Null",
    "$utf8 = [System.Text.UTF8Encoding]::new($false)",
    "[System.IO.File]::WriteAllText((Join-Path $learningRoot 'inbox.md'), '# fixture inbox', $utf8)",
    "[System.IO.File]::WriteAllText((Join-Path $learningRoot 'reviewed.md'), '### LEARN-BEHANCE-001', $utf8)",
    'Write-Output "candidates=$MaxProjects"',
    "",
  ].join("\n");
}

async function createFixture(mode = "success") {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "learning-execution-"),
  );
  const skillRoot = path.join(root, "skill");
  const workspaceRoot = path.join(root, "workspace");
  const maintenanceRoot = path.join(
    skillRoot,
    "scripts",
    "maintenance",
  );
  await Promise.all([
    mkdir(maintenanceRoot, { recursive: true }),
    mkdir(path.join(skillRoot, "references"), {
      recursive: true,
    }),
    mkdir(
      path.join(
        workspaceRoot,
        ".workspace",
        "projects",
        "fixture-project",
        "planning",
      ),
      { recursive: true },
    ),
  ]);
  await Promise.all([
    ...ACTIVE_RULE_REFERENCES.map((reference) =>
      writeFile(
        path.join(skillRoot, ...reference.split("/")),
        `# protected ${reference}\n`,
        "utf8",
      ),
    ),
    writeFile(
      path.join(maintenanceRoot, "distill-learnings.mjs"),
      distillScript(mode),
      "utf8",
    ),
    writeFile(
      path.join(maintenanceRoot, "learning-status.mjs"),
      statusScript(),
      "utf8",
    ),
    writeFile(
      path.join(maintenanceRoot, "refresh-behance-study.ps1"),
      refreshBehanceScript(),
      "utf8",
    ),
    writeFile(
      path.join(
        maintenanceRoot,
        "refresh-hyperframes-study.ps1",
      ),
      refreshBehanceScript(),
      "utf8",
    ),
    writeFile(
      path.join(
        workspaceRoot,
        ".workspace",
        "projects",
        "fixture-project",
        "planning",
        "LEARNINGS.md",
      ),
      [
        "# fixture",
        "## LEARN-FEEDBACK-001",
        "- `scope`: candidate-shared",
        "- `source_type`: feedback",
      ].join("\n"),
      "utf8",
    ),
  ]);
  return {
    root,
    skillRoot,
    workspaceRoot,
    runner: new LearningPipelineExecutionAdapter({
      skillRoot,
      workspaceRoot,
      timeoutMs: mode === "timeout" ? 100 : 5_000,
    }),
  };
}

async function planFixture(fixture, sourceType = "feedback") {
  const learning = pipeline();
  const captured = learning.intake(candidate(sourceType));
  const plan = await fixture.runner.plan(captured, {
    executorAgentSessionId: "maintenance-executor",
    validatorAgentSessionId: "maintenance-validator",
  });
  return { learning, captured, plan };
}

async function activeReferenceBytes(skillRoot) {
  return Object.fromEntries(
    await Promise.all(
      ACTIVE_RULE_REFERENCES.map(async (reference) => [
        reference,
        await readFile(
          path.join(skillRoot, ...reference.split("/")),
        ),
      ]),
    ),
  );
}

function assertSameBuffers(actual, expected) {
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
  for (const key of Object.keys(expected)) {
    assert.equal(actual[key].equals(expected[key]), true, key);
  }
}

test("allowlisted distill/status를 실행하고 receipt를 intake→sanitize→review→promotion에 연결한다", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const { learning, captured, plan } = await planFixture(fixture);

  assert.deepEqual(plan.action_ids, ["distill", "status"]);
  assert.deepEqual(
    plan.commands.map((command) => command.script_locator),
    [
      "scripts/maintenance/distill-learnings.mjs",
      "scripts/maintenance/learning-status.mjs",
    ],
  );
  assert.ok(
    plan.commands.every(
      (command) =>
        command.cwd_root_id === "skill" &&
        command.cwd_locator === "." &&
        command.args_sha256.length === 64 &&
        command.environment_sha256.length === 64,
    ),
  );

  const first = await fixture.runner.execute(plan);
  assert.equal(first.status, "PASS");
  assert.equal(first.idempotent_reuse, false);
  assert.equal(first.execution_receipt.commands.length, 2);
  assert.ok(
    first.execution_receipt.commands.every(
      (command) =>
        command.exit_code === 0 &&
        command.timed_out === false &&
        command.stdout_sha256.length === 64 &&
        command.stderr_sha256.length === 64,
    ),
  );
  assert.equal(first.validation_receipt.verdict, "PASS");
  assert.equal(
    validateValidationReceipt(first.validation_receipt, {
      expectedArtifactSetDigest: first.output_set_sha256,
      expectedPolicyId: "learning-maintenance-execution",
      validatorAgentSessionId: "maintenance-validator",
      producerAgentSessionIds: ["maintenance-executor"],
      availableEvidenceArtifactIds: first.output_hash_set.map(
        (output) => output.output_id,
      ),
    }).ok,
    true,
  );
  assert.deepEqual(
    first.output_hash_set.map((output) => output.kind).sort(),
    ["markdown", "status"],
  );

  const attached = learning.attachMaintenanceExecution(
    captured,
    first,
  );
  const sanitized = learning.sanitize(attached);
  const reviewed = learning.review(sanitized, {
    decision: "approve",
    reviewer_session_id: "learning-reviewer",
    reviewed_at: "2026-07-30T10:00:00.000Z",
    evidence: reviewEvidence(),
  });
  const promotion = learning.createPromotionPlan(reviewed, {
    proposed_rule_id: "TR-099",
    proposed_rule_text:
      "Sequence customer context before proof and product benefit.",
  });
  assert.equal(attached.maintenance_plan.executed, true);
  assert.equal(
    promotion.maintenance_execution.execution_receipt_sha256,
    first.execution_receipt_sha256,
  );
  assert.equal(
    promotion.maintenance_execution.validation_receipt_sha256,
    first.validation_receipt_sha256,
  );

  const second = await fixture.runner.execute(plan);
  assert.equal(second.idempotent_reuse, true);
  assert.equal(
    second.execution_receipt_sha256,
    first.execution_receipt_sha256,
  );
  assert.equal(
    second.validation_receipt_sha256,
    first.validation_receipt_sha256,
  );
});

test("실패와 timeout은 exit/timeout receipt를 남기고 active reference bytes를 복원한다", async (t) => {
  for (const mode of ["failure", "timeout"]) {
    await t.test(mode, async (inner) => {
      const fixture = await createFixture(mode);
      inner.after(() =>
        rm(fixture.root, { recursive: true, force: true }),
      );
      const { plan } = await planFixture(fixture);
      const before = await activeReferenceBytes(fixture.skillRoot);
      await assert.rejects(
        fixture.runner.execute(plan),
        (error) => {
          assert.equal(
            error instanceof LearningPipelineExecutionError,
            true,
          );
          assert.equal(
            error.code,
            mode === "timeout"
              ? "MAINTENANCE_TIMEOUT"
              : "MAINTENANCE_EXIT_NONZERO",
          );
          const receipt =
            error.details.result.execution_receipt.commands[0];
          assert.equal(
            receipt.timed_out,
            mode === "timeout",
          );
          if (mode === "failure") {
            assert.equal(receipt.exit_code, 7);
          }
          assert.match(receipt.stdout_sha256, /^[a-f0-9]{64}$/);
          assert.match(receipt.stderr_sha256, /^[a-f0-9]{64}$/);
          assert.equal(
            error.details.result.validation_receipt.verdict,
            "FAIL",
          );
          return true;
        },
      );
      const after = await activeReferenceBytes(fixture.skillRoot);
      assertSameBuffers(after, before);
    });
  }
});

test(
  "fixture refresh→distill→status 전체 allowlist chain을 실제 실행한다",
  { skip: process.platform !== "win32" },
  async (t) => {
    const fixture = await createFixture();
    t.after(() =>
      rm(fixture.root, { recursive: true, force: true }),
    );
    const { plan } = await planFixture(fixture, "behance");
    const result = await fixture.runner.execute(plan);
    assert.deepEqual(
      result.execution_receipt.commands.map(
        (command) => command.action_id,
      ),
      ["refresh-behance", "distill", "status"],
    );
    assert.ok(
      result.execution_receipt.commands.every(
        (command) => command.exit_code === 0,
      ),
    );
    assert.deepEqual(
      result.output_hash_set
        .map((output) => output.output_id)
        .sort(),
      [
        "behance-inbox",
        "behance-reviewed",
        "distilled-candidates",
        "learning-status",
      ],
    );
  },
);

test("path escape와 executable/args/script tamper를 spawn 전에 차단한다", async (t) => {
  await t.test("path escape", async (inner) => {
    const fixture = await createFixture();
    inner.after(() =>
      rm(fixture.root, { recursive: true, force: true }),
    );
    const { plan } = await planFixture(fixture);
    const tampered = structuredClone(plan);
    tampered.commands[0].script_locator = "../evil.mjs";
    tampered.plan_digest =
      learningMaintenancePlanDigest(tampered);
    await assert.rejects(
      fixture.runner.execute(tampered),
      (error) =>
        error.code === "MAINTENANCE_PATH_ESCAPE",
    );
  });

  await t.test("command args", async (inner) => {
    const fixture = await createFixture();
    inner.after(() =>
      rm(fixture.root, { recursive: true, force: true }),
    );
    const { plan } = await planFixture(fixture);
    const tampered = structuredClone(plan);
    tampered.commands[0].args.push("--unsafe");
    tampered.commands[0].args_sha256 = "0".repeat(64);
    tampered.plan_digest =
      learningMaintenancePlanDigest(tampered);
    await assert.rejects(
      fixture.runner.execute(tampered),
      (error) =>
        error.code === "MAINTENANCE_COMMAND_TAMPER",
    );
  });

  await t.test("script bytes", async (inner) => {
    const fixture = await createFixture();
    inner.after(() =>
      rm(fixture.root, { recursive: true, force: true }),
    );
    const { plan } = await planFixture(fixture);
    await writeFile(
      path.join(
        fixture.skillRoot,
        "scripts",
        "maintenance",
        "distill-learnings.mjs",
      ),
      `${distillScript("success")}\n// changed after plan\n`,
      "utf8",
    );
    await assert.rejects(
      fixture.runner.execute(plan),
      (error) =>
        error.code === "MAINTENANCE_COMMAND_TAMPER",
    );
  });
});

test("성공 후 Markdown/status output drift는 idempotent reuse를 거부한다", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const { plan } = await planFixture(fixture);
  await fixture.runner.execute(plan);
  await writeFile(
    path.join(
      fixture.workspaceRoot,
      ".workspace",
      "learning",
      "candidates.md",
    ),
    "# tampered candidates\n",
    "utf8",
  );
  await assert.rejects(
    fixture.runner.execute(plan),
    (error) => error.code === "MAINTENANCE_OUTPUT_DRIFT",
  );
});

test("plan 뒤 project learning input drift는 첫 spawn 전에 거부한다", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const { plan } = await planFixture(fixture);
  await writeFile(
    path.join(
      fixture.workspaceRoot,
      ".workspace",
      "projects",
      "fixture-project",
      "planning",
      "LEARNINGS.md",
    ),
    "# changed after plan\n",
    "utf8",
  );
  await assert.rejects(
    fixture.runner.execute(plan),
    (error) => error.code === "MAINTENANCE_INPUT_DRIFT",
  );
  assert.equal(
    await readFile(
      path.join(
        fixture.workspaceRoot,
        ".workspace",
        "learning",
        "candidates.md",
      ),
      "utf8",
    ).catch(() => null),
    null,
  );
});

test("production plan은 기존 refresh/distill/status maintenance scripts를 그대로 allowlist한다", async (t) => {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "learning-production-plan-"),
  );
  t.after(() =>
    rm(workspaceRoot, { recursive: true, force: true }),
  );
  const learning = pipeline();
  const captured = learning.intake(candidate("behance"));
  const runner = new LearningPipelineExecutionAdapter({
    skillRoot: PROJECT_SKILL_ROOT,
    workspaceRoot,
  });
  const plan = await runner.plan(captured, {
    executorAgentSessionId: "production-maintenance-executor",
    validatorAgentSessionId: "production-maintenance-validator",
  });
  assert.deepEqual(
    plan.commands.map((command) => command.script_locator),
    [
      "scripts/maintenance/refresh-behance-study.ps1",
      "scripts/maintenance/distill-learnings.mjs",
      "scripts/maintenance/learning-status.mjs",
    ],
  );
  assert.ok(
    plan.commands.every(
      (command) =>
        command.script_sha256.length === 64 &&
        command.script_size_bytes > 0,
    ),
  );
});
