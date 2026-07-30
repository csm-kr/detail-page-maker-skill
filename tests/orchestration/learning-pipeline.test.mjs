import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ACTIVE_RULE_REFERENCES,
  LearningPipelineAdapter,
  LearningPipelineError,
  candidateHash,
  createPromotionPlan,
  createSourceDeletionReceipt,
  deterministicEvidenceId,
  intakeLearningCandidate,
  reviewLearningCandidate,
  sanitizeLearningCandidate,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/learning-pipeline.mjs";

const H = {
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
  d: "d".repeat(64),
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

function safeCandidate(overrides = {}) {
  return {
    candidate_id: "LEARN-20260730-001",
    source_type: "behance",
    category: "layout",
    title: "Problem-first section sequencing",
    rule_text:
      "Open with a recognizable problem, then alternate proof and benefit sections.",
    source_locator: "behance-review-batch-20260730",
    producer_session_id: "producer-session-1",
    captured_at: "2026-07-30T10:00:00.000Z",
    sensitive_terms: {
      product_names: [],
      unique_copy: [],
    },
    ...overrides,
  };
}

function evidence(kind, id, extra = {}) {
  return {
    evidence_kind: kind,
    case_id: id,
    outcome: "PASS",
    artifact_sha256: H.c,
    ...extra,
  };
}

function reviewOptions(overrides = {}) {
  return {
    decision: "approve",
    reviewer_session_id: "reviewer-session-2",
    reviewed_at: "2026-07-30T11:00:00.000Z",
    evidence: [
      evidence("case", "case-a"),
      evidence("case", "case-b"),
      evidence("case", "case-c"),
    ],
    ...overrides,
  };
}

test("intake routes Behance, motion, and feedback through existing maintenance scripts", () => {
  const behance = intakeLearningCandidate(safeCandidate(), {
    policy: POLICY,
    rubric: RUBRIC,
  });
  const motion = intakeLearningCandidate(
    safeCandidate({
      candidate_id: "LEARN-20260730-002",
      source_type: "motion",
      category: "gif",
    }),
    { policy: POLICY, rubric: RUBRIC },
  );
  const feedbackMotion = intakeLearningCandidate(
    safeCandidate({
      candidate_id: "LEARN-20260730-003",
      source_type: "feedback",
      category: "animation",
    }),
    { policy: POLICY, rubric: RUBRIC },
  );
  const feedbackTaste = intakeLearningCandidate(
    safeCandidate({
      candidate_id: "LEARN-20260730-004",
      source_type: "feedback",
      category: "copy",
    }),
    { policy: POLICY, rubric: RUBRIC },
  );

  assert.equal(behance.route.target_reference, "references/commercial.md");
  assert.equal(motion.route.target_reference, "references/motion.md");
  assert.equal(feedbackMotion.route.target_reference, "references/motion.md");
  assert.equal(feedbackTaste.route.target_reference, "references/taste.md");
  assert.match(
    behance.maintenance_plan.capture.command,
    /refresh-behance-study\.ps1/,
  );
  assert.match(
    motion.maintenance_plan.capture.command,
    /refresh-hyperframes-study\.ps1/,
  );
  assert.equal(feedbackTaste.maintenance_plan.capture, null);
  for (const captured of [behance, motion, feedbackMotion, feedbackTaste]) {
    assert.match(captured.maintenance_plan.distill.command, /distill-learnings\.mjs/);
    assert.match(captured.maintenance_plan.status.command, /learning-status\.mjs/);
    assert.equal(captured.maintenance_plan.executed, false);
    assert.equal(captured.status, "CAPTURED");
  }
});

test("sanitization accepts generalized rules and quarantines product names, URLs, unique copy, and file paths", () => {
  const safe = intakeLearningCandidate(safeCandidate(), {
    policy: POLICY,
    rubric: RUBRIC,
  });
  const sanitized = sanitizeLearningCandidate(safe);
  assert.equal(sanitized.status, "SANITIZED");
  assert.equal(sanitized.candidate_sha256, candidateHash(sanitized.candidate));

  const unsafeInputs = [
    {
      rule_text: "Use AlphaBottle as the hero.",
      sensitive_terms: { product_names: ["AlphaBottle"], unique_copy: [] },
      violation: "PRODUCT_NAME",
    },
    {
      rule_text: "Reuse the layout from https://example.com/project.",
      violation: "URL",
    },
    {
      rule_text: "Repeat the phrase Exact winning sentence.",
      sensitive_terms: {
        product_names: [],
        unique_copy: ["Exact winning sentence"],
      },
      violation: "UNIQUE_COPY",
    },
    {
      rule_text: "Load C:\\projects\\alpha\\hero.png before rendering.",
      violation: "FILE_PATH",
    },
  ];

  for (const [index, unsafe] of unsafeInputs.entries()) {
    const captured = intakeLearningCandidate(
      safeCandidate({
        candidate_id: `LEARN-UNSAFE-${index}`,
        ...unsafe,
      }),
      { policy: POLICY, rubric: RUBRIC },
    );
    const result = sanitizeLearningCandidate(captured);
    assert.equal(result.status, "QUARANTINED");
    assert.ok(result.violations.some((item) => item.code === unsafe.violation));
    assert.equal(result.candidate, null);
  }
});

test("review requires three distinct cases or different-product plus regression evidence and uses deterministic IDs", () => {
  const sanitized = sanitizeLearningCandidate(
    intakeLearningCandidate(safeCandidate(), {
      policy: POLICY,
      rubric: RUBRIC,
    }),
  );
  const approved = reviewLearningCandidate(
    sanitized,
    reviewOptions(),
    { policy: POLICY, rubric: RUBRIC },
  );
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.evidence_mode, "THREE_CASES");
  assert.equal(approved.evidence_ids.length, 3);
  assert.equal(
    deterministicEvidenceId(evidence("case", "case-a")),
    deterministicEvidenceId({
      artifact_sha256: H.c,
      outcome: "PASS",
      case_id: "case-a",
      evidence_kind: "case",
    }),
  );

  const alternative = reviewLearningCandidate(
    sanitized,
    reviewOptions({
      evidence: [
        evidence("different_product", "different-product-a"),
        evidence("regression", "regression-suite-a"),
      ],
    }),
    { policy: POLICY, rubric: RUBRIC },
  );
  assert.equal(alternative.status, "APPROVED");
  assert.equal(alternative.evidence_mode, "DIFFERENT_PRODUCT_AND_REGRESSION");

  const insufficient = reviewLearningCandidate(
    sanitized,
    reviewOptions({
      evidence: [
        evidence("case", "case-a"),
        evidence("case", "case-b"),
      ],
    }),
    { policy: POLICY, rubric: RUBRIC },
  );
  assert.equal(insufficient.status, "QUARANTINED");
  assert.deepEqual(insufficient.reason_codes, [
    "INSUFFICIENT_VALIDATION_EVIDENCE",
  ]);
});

test("review receipt binds the exact candidate hash, separates producer/reviewer sessions, and freezes policy/rubric versions", () => {
  const sanitized = sanitizeLearningCandidate(
    intakeLearningCandidate(safeCandidate(), {
      policy: POLICY,
      rubric: RUBRIC,
    }),
  );

  assert.throws(
    () =>
      reviewLearningCandidate(
        sanitized,
        reviewOptions({ reviewer_session_id: "producer-session-1" }),
        { policy: POLICY, rubric: RUBRIC },
      ),
    (error) =>
      error instanceof LearningPipelineError &&
      error.code === "SELF_REVIEW_FORBIDDEN",
  );
  assert.throws(
    () =>
      reviewLearningCandidate(
        { ...sanitized, candidate_sha256: H.d },
        reviewOptions(),
        { policy: POLICY, rubric: RUBRIC },
      ),
    (error) => error.code === "CANDIDATE_HASH_MISMATCH",
  );
  assert.throws(
    () =>
      reviewLearningCandidate(sanitized, reviewOptions(), {
        policy: { ...POLICY, version: "2.0.0" },
        rubric: RUBRIC,
      }),
    (error) => error.code === "POLICY_VERSION_MISMATCH",
  );
  assert.throws(
    () =>
      reviewLearningCandidate(sanitized, reviewOptions(), {
        policy: POLICY,
        rubric: { ...RUBRIC, sha256: H.d },
      }),
    (error) => error.code === "RUBRIC_VERSION_MISMATCH",
  );
});

test("reject and quarantine are terminal receipts and cannot produce promotion plans", () => {
  const sanitized = sanitizeLearningCandidate(
    intakeLearningCandidate(safeCandidate(), {
      policy: POLICY,
      rubric: RUBRIC,
    }),
  );
  const rejected = reviewLearningCandidate(
    sanitized,
    reviewOptions({
      decision: "reject",
      reason_codes: ["NOT_GENERALIZABLE"],
      evidence: [],
    }),
    { policy: POLICY, rubric: RUBRIC },
  );
  assert.equal(rejected.status, "REJECTED");
  assert.throws(
    () => createPromotionPlan(rejected),
    (error) => error.code === "PROMOTION_NOT_APPROVED",
  );

  const quarantined = reviewLearningCandidate(
    sanitized,
    reviewOptions({ evidence: [] }),
    { policy: POLICY, rubric: RUBRIC },
  );
  assert.equal(quarantined.status, "QUARANTINED");
  assert.throws(
    () => createPromotionPlan(quarantined),
    (error) => error.code === "PROMOTION_NOT_APPROVED",
  );
});

test("promotion is a deterministic plan only and never modifies active commercial/taste/motion references", async () => {
  const directory = path.join(
    tmpdir(),
    `learning-pipeline-${process.pid}-${Date.now()}`,
  );
  const activeFiles = Object.fromEntries(
    ACTIVE_RULE_REFERENCES.map((reference, index) => [
      reference,
      path.join(directory, `active-${index}.md`),
    ]),
  );
  await mkdir(directory, { recursive: true });
  await Promise.all(
    Object.entries(activeFiles).map(async ([reference, file]) => {
      await writeFile(file, `protected:${reference}\n`, "utf8");
    }),
  );
  const before = Object.fromEntries(
    await Promise.all(
      Object.entries(activeFiles).map(async ([reference, file]) => [
        reference,
        await readFile(file, "utf8"),
      ]),
    ),
  );

  const adapter = new LearningPipelineAdapter({
    policy: POLICY,
    rubric: RUBRIC,
  });
  const captured = adapter.intake(safeCandidate());
  const sanitized = adapter.sanitize(captured);
  const receipt = adapter.review(sanitized, reviewOptions());
  const first = adapter.createPromotionPlan(receipt, {
    proposed_rule_id: "CR-CANDIDATE-001",
    proposed_rule_text:
      "Sequence a relatable problem before proof and product benefit.",
  });
  const second = adapter.createPromotionPlan(receipt, {
    proposed_rule_id: "CR-CANDIDATE-001",
    proposed_rule_text:
      "Sequence a relatable problem before proof and product benefit.",
  });

  assert.deepEqual(first, second);
  assert.equal(first.action, "PROPOSE_ACTIVE_RULE_PATCH");
  assert.equal(first.target_reference, "references/commercial.md");
  assert.equal(first.write_allowed, false);
  assert.equal(first.writes_performed, false);
  assert.equal(first.candidate_sha256, sanitized.candidate_sha256);
  assert.deepEqual(first.protected_references, ACTIVE_RULE_REFERENCES);

  const after = Object.fromEntries(
    await Promise.all(
      Object.entries(activeFiles).map(async ([reference, file]) => [
        reference,
        await readFile(file, "utf8"),
      ]),
    ),
  );
  assert.deepEqual(after, before);
});

test("source deletion receipt allows cleanup only after verified promotion, regression, and learning-status update", () => {
  const adapter = new LearningPipelineAdapter({
    policy: POLICY,
    rubric: RUBRIC,
  });
  const sanitized = adapter.sanitize(adapter.intake(safeCandidate()));
  const reviewed = adapter.review(sanitized, reviewOptions());
  const plan = adapter.createPromotionPlan(reviewed, {
    proposed_rule_id: "CR-CANDIDATE-001",
    proposed_rule_text:
      "Sequence a relatable problem before proof and product benefit.",
  });
  const denied = createSourceDeletionReceipt(plan, {
    promotion_applied: true,
    active_reference: "references/commercial.md",
    active_reference_sha256: H.c,
    promoted_rule_id: "CR-CANDIDATE-001",
    promoted_rule_sha256: H.d,
    regression_passed: false,
    regression_receipt_id: "regression-1",
    learning_status_updated: true,
    learning_status_receipt_id: "learning-status-1",
    transient_source_ids: ["behance-review-batch-20260730"],
  });
  assert.equal(denied.deletion_allowed, false);
  assert.equal(denied.deletion_performed, false);
  assert.ok(denied.blocked_reasons.includes("REGRESSION_NOT_PASSED"));

  const allowed = adapter.createSourceDeletionReceipt(plan, {
    promotion_applied: true,
    active_reference: "references/commercial.md",
    active_reference_sha256: H.c,
    promoted_rule_id: "CR-CANDIDATE-001",
    promoted_rule_sha256: plan.proposed_rule_sha256,
    regression_passed: true,
    regression_receipt_id: "regression-1",
    regression_receipt_sha256: H.c,
    learning_status_updated: true,
    learning_status_receipt_id: "learning-status-1",
    learning_status_receipt_sha256: H.d,
    transient_source_ids: ["behance-review-batch-20260730"],
  });
  assert.equal(allowed.deletion_allowed, true);
  assert.equal(allowed.deletion_performed, false);
  assert.deepEqual(allowed.transient_source_ids, [
    "behance-review-batch-20260730",
  ]);
  assert.equal(allowed.candidate_sha256, sanitized.candidate_sha256);
});
