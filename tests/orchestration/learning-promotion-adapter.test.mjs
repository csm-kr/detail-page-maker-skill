import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LearningPromotionAdapterError,
  commitLearningPromotion,
  createLearningPromotionChallenge,
  createSourceArchivePlan,
  inspectLearningPromotionState,
  listLearningPromotionRevisions,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/learning-promotion-adapter.mjs";
import {
  LearningPipelineAdapter,
  createSourceDeletionReceipt,
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function reference(title, prefix) {
  return [
    `# ${title}`,
    "",
    "## 누적 규칙",
    "",
    "| ID | 계속 적용할 규칙 | 검증 기준 | 갱신일 |",
    "| --- | --- | --- | --- |",
    `| ${prefix}-001 | 기존 ${prefix} 규칙을 적용한다. | 기존 ${prefix} 회귀 검사 | 2026-07-29 |`,
    "",
    "표 아래 설명은 그대로 보존한다.",
    "",
  ].join("\n");
}

async function createFixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "learning-promotion-"),
  );
  const skillRoot = path.join(root, "skill");
  const workspaceRoot = path.join(root, "workspace");
  const referencesRoot = path.join(skillRoot, "references");
  await Promise.all([
    mkdir(referencesRoot, { recursive: true }),
    mkdir(workspaceRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      path.join(referencesRoot, "commercial.md"),
      reference("Commercial", "CR"),
      "utf8",
    ),
    writeFile(
      path.join(referencesRoot, "taste.md"),
      reference("Taste", "TR"),
      "utf8",
    ),
    writeFile(
      path.join(referencesRoot, "motion.md"),
      reference("Motion", "MR"),
      "utf8",
    ),
    writeFile(
      path.join(referencesRoot, "learning.md"),
      "# Learning\n",
      "utf8",
    ),
  ]);
  return {
    root,
    skillRoot,
    workspaceRoot,
    commercialPath: path.join(
      referencesRoot,
      "commercial.md",
    ),
    tastePath: path.join(referencesRoot, "taste.md"),
    motionPath: path.join(referencesRoot, "motion.md"),
  };
}

function evidence(kind, caseId) {
  return {
    evidence_kind: kind,
    case_id: caseId,
    outcome: "PASS",
    artifact_sha256: H.c,
  };
}

function routeCandidate(route, overrides = {}) {
  const routes = {
    commercial: {
      source_type: "behance",
      category: "layout",
    },
    taste: {
      source_type: "feedback",
      category: "copy",
    },
    motion: {
      source_type: "feedback",
      category: "motion",
    },
  };
  return {
    candidate_id: `LEARN-${route.toUpperCase()}-001`,
    ...routes[route],
    title: `${route} general rule`,
    rule_text:
      "구매 질문 다음 화면에서 제품의 답과 검증 가능한 근거를 연결한다.",
    source_locator: `source-${route}-batch`,
    producer_session_id: "candidate-producer-session",
    captured_at: "2026-07-30T09:00:00.000Z",
    sensitive_terms: {
      product_names: ["특정상품"],
      unique_copy: ["세상에 하나뿐인 문장"],
    },
    ...overrides,
  };
}

function createPipelineArtifacts({
  route = "commercial",
  proposedRuleId = "CR-002",
  proposedRuleText =
    "구매 질문 다음 화면에서 제품의 답과 검증 가능한 근거를 연결한다.",
} = {}) {
  const adapter = new LearningPipelineAdapter({
    policy: POLICY,
    rubric: RUBRIC,
  });
  const captured = adapter.intake(routeCandidate(route));
  const sanitized = adapter.sanitize(captured);
  const reviewReceipt = adapter.review(sanitized, {
    decision: "approve",
    reviewer_session_id: "candidate-reviewer-session",
    reviewed_at: "2026-07-30T10:00:00.000Z",
    evidence: [
      evidence("case", "case-a"),
      evidence("case", "case-b"),
      evidence("case", "case-c"),
    ],
  });
  const promotionPlan = adapter.createPromotionPlan(
    reviewReceipt,
    {
      proposed_rule_id: proposedRuleId,
      proposed_rule_text: proposedRuleText,
    },
  );
  return {
    adapter,
    captured,
    sanitized,
    reviewReceipt,
    promotionPlan,
  };
}

function sanitizationContext(candidateSha256, overrides = {}) {
  const body = {
    candidate_sha256: candidateSha256,
    product_names: ["특정상품"],
    unique_copy: ["세상에 하나뿐인 문장"],
    scanner_code_sha256: H.d,
    ...overrides,
  };
  return {
    ...body,
    context_sha256: canonicalSha256(body),
  };
}

function regressionEvidence(
  promotionPlan,
  overrides = {},
) {
  const body = {
    schema_version: "1.0",
    receipt_type: "learning.promotion.regression",
    receipt_id: "regression-learning-001",
    status: "PASS",
    promotion_plan_id: promotionPlan.promotion_plan_id,
    candidate_sha256: promotionPlan.candidate_sha256,
    target_reference: promotionPlan.target_reference,
    proposed_rule_id: promotionPlan.proposed_rule_id,
    validation_criterion:
      "서로 다른 상품의 질문-답 인접성과 회귀 테스트를 검사",
    case_ids: ["different-product-a", "regression-suite-a"],
    validator_session_id: "regression-validator-session",
    validator_code_sha256: H.c,
    completed_at: "2026-07-30T11:00:00.000Z",
    ...overrides,
  };
  return {
    ...body,
    receipt_sha256: canonicalSha256(body),
  };
}

function approvalProof(
  challenge,
  overrides = {},
) {
  const body = {
    schema_version: "1.0",
    approval_kind: "user_promotion_approval",
    challenge_id: challenge.challenge_id,
    challenge_sha256: challenge.challenge_sha256,
    promotion_plan_sha256:
      challenge.promotion_plan_sha256,
    nonce: challenge.nonce,
    decision: "approved",
    approver: {
      kind: "user",
      approver_id: "user-owner-1",
      session_id: "user-approval-session",
    },
    approval_channel: "codex-workflow-decide",
    decision_id: "decision-learning-001",
    approved_at: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
  return {
    ...body,
    approval_proof_sha256: canonicalSha256(body),
  };
}

async function challengeFixture(
  fixture,
  artifacts,
  {
    nonce = "1".repeat(64),
    regressionOverrides = {},
    sanitizationOverrides = {},
  } = {},
) {
  const snapshot = await inspectLearningPromotionState({
    promotionPlan: artifacts.promotionPlan,
    reviewReceipt: artifacts.reviewReceipt,
    skillRoot: fixture.skillRoot,
    workspaceRoot: fixture.workspaceRoot,
  });
  const regression = regressionEvidence(
    artifacts.promotionPlan,
    regressionOverrides,
  );
  const context = sanitizationContext(
    artifacts.promotionPlan.candidate_sha256,
    sanitizationOverrides,
  );
  const challenge = await createLearningPromotionChallenge({
    promotionPlan: artifacts.promotionPlan,
    reviewReceipt: artifacts.reviewReceipt,
    regressionEvidence: regression,
    sanitizationContext: context,
    skillRoot: fixture.skillRoot,
    workspaceRoot: fixture.workspaceRoot,
    frozenActiveReferenceSha256:
      snapshot.active_reference_sha256,
    learningStatusBeforeSha256:
      snapshot.learning_status_sha256,
    nonce,
  });
  return { snapshot, regression, context, challenge };
}

function expectCode(code) {
  return (error) => {
    assert.ok(
      error instanceof LearningPromotionAdapterError,
    );
    assert.equal(error.code, code);
    return true;
  };
}

test("exact plan·before hash·nonce challenge는 사용자 승인 전 active reference를 수정하지 않는다", async () => {
  const fixture = await createFixture();
  try {
    const artifacts = createPipelineArtifacts();
    const before = await readFile(
      fixture.commercialPath,
      "utf8",
    );
    const prepared = await challengeFixture(
      fixture,
      artifacts,
    );
    assert.equal(
      prepared.challenge.active_reference_write_allowed,
      false,
    );
    assert.equal(prepared.challenge.writes_performed, false);
    assert.equal(
      prepared.challenge.promotion_plan_sha256,
      canonicalSha256(artifacts.promotionPlan),
    );
    assert.equal(
      prepared.challenge.frozen_active_reference_sha256,
      sha256(Buffer.from(before)),
    );
    assert.equal(prepared.challenge.rule_action, "insert");
    assert.equal(
      await readFile(fixture.commercialPath, "utf8"),
      before,
    );
    assert.deepEqual(
      await listLearningPromotionRevisions({
        workspaceRoot: fixture.workspaceRoot,
      }),
      [],
    );

    await assert.rejects(
      commitLearningPromotion({
        challenge: prepared.challenge,
        approvalProof: null,
        promotionPlan: artifacts.promotionPlan,
        reviewReceipt: artifacts.reviewReceipt,
        regressionEvidence: prepared.regression,
        sanitizationContext: prepared.context,
        skillRoot: fixture.skillRoot,
        workspaceRoot: fixture.workspaceRoot,
      }),
      expectCode("USER_APPROVAL_REQUIRED"),
    );
    assert.equal(
      await readFile(fixture.commercialPath, "utf8"),
      before,
    );
  } finally {
    await rm(fixture.root, {
      recursive: true,
      force: true,
    });
  }
});

test("사용자 승인 뒤 CR 새 row를 atomic revision으로 commit하고 before/after hash를 receipt에 남긴다", async () => {
  const fixture = await createFixture();
  try {
    const artifacts = createPipelineArtifacts();
    const prepared = await challengeFixture(
      fixture,
      artifacts,
    );
    const result = await commitLearningPromotion({
      challenge: prepared.challenge,
      approvalProof: approvalProof(prepared.challenge),
      promotionPlan: artifacts.promotionPlan,
      reviewReceipt: artifacts.reviewReceipt,
      regressionEvidence: prepared.regression,
      sanitizationContext: prepared.context,
      skillRoot: fixture.skillRoot,
      workspaceRoot: fixture.workspaceRoot,
    });

    assert.equal(result.status, "committed");
    assert.equal(
      result.stage_id,
      "P1_LEARNING_PROMOTION",
    );
    const receipt = result.promotion_receipt;
    assert.equal(receipt.rule_action, "insert");
    assert.equal(receipt.rule_row.rule_id, "CR-002");
    assert.match(
      receipt.rule_row.rule_row_sha256,
      /^[a-f0-9]{64}$/,
    );
    assert.equal(
      receipt.active_reference.sha256_before,
      prepared.snapshot.active_reference_sha256,
    );
    assert.notEqual(
      receipt.active_reference.sha256_after,
      receipt.active_reference.sha256_before,
    );
    assert.equal(
      receipt.learning_status.counts_before
        .commercialRules,
      1,
    );
    assert.equal(
      receipt.learning_status.counts_after
        .commercialRules,
      2,
    );
    assert.notEqual(
      receipt.learning_status.sha256_after,
      receipt.learning_status.sha256_before,
    );
    assert.equal(receipt.raw_source_deleted, false);
    assert.equal(
      receipt.source_deletion_allowed,
      false,
    );
    const active = await readFile(
      fixture.commercialPath,
      "utf8",
    );
    assert.match(active, /^\| CR-002 \|/m);
    assert.equal(
      sha256(Buffer.from(active)),
      receipt.active_reference.sha256_after,
    );
    assert.equal(
      await readFile(
        path.join(result.revision_path, "reference.md"),
        "utf8",
      ),
      active,
    );
    assert.deepEqual(
      (
        await readdir(result.revision_path)
      ).sort(),
      [
        "commit-intent.json",
        "promotion-receipt.json",
        "reference.md",
      ],
    );
    assert.deepEqual(
      await listLearningPromotionRevisions({
        workspaceRoot: fixture.workspaceRoot,
      }),
      [receipt.promotion_revision_id],
    );
    const revisionRoot = path.dirname(
      result.revision_path,
    );
    assert.equal(
      (await readdir(revisionRoot)).some((entry) =>
        entry.startsWith(".staging-"),
      ),
      false,
    );
  } finally {
    await rm(fixture.root, {
      recursive: true,
      force: true,
    });
  }
});

test("TR update와 MR insert를 route의 정본 표에만 적용한다", async (t) => {
  await t.test("TR existing row update", async () => {
    const fixture = await createFixture();
    try {
      const artifacts = createPipelineArtifacts({
        route: "taste",
        proposedRuleId: "TR-001",
        proposedRuleText:
          "고객 화면에서는 제작 메타데이터를 제거하고 구매 판단 정보만 보여 준다.",
      });
      const prepared = await challengeFixture(
        fixture,
        artifacts,
        { nonce: "2".repeat(64) },
      );
      assert.equal(prepared.challenge.rule_action, "update");
      const commercialBefore = await readFile(
        fixture.commercialPath,
        "utf8",
      );
      const result = await commitLearningPromotion({
        challenge: prepared.challenge,
        approvalProof: approvalProof(
          prepared.challenge,
          { decision_id: "decision-tr-update" },
        ),
        promotionPlan: artifacts.promotionPlan,
        reviewReceipt: artifacts.reviewReceipt,
        regressionEvidence: prepared.regression,
        sanitizationContext: prepared.context,
        skillRoot: fixture.skillRoot,
        workspaceRoot: fixture.workspaceRoot,
      });
      assert.equal(
        result.promotion_receipt.rule_action,
        "update",
      );
      assert.equal(
        result.promotion_receipt.learning_status
          .counts_before.tasteRules,
        1,
      );
      assert.equal(
        result.promotion_receipt.learning_status
          .counts_after.tasteRules,
        1,
      );
      assert.match(
        await readFile(fixture.tastePath, "utf8"),
        /고객 화면에서는 제작 메타데이터/,
      );
      assert.equal(
        await readFile(
          fixture.commercialPath,
          "utf8",
        ),
        commercialBefore,
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  await t.test("MR new row insert", async () => {
    const fixture = await createFixture();
    try {
      const artifacts = createPipelineArtifacts({
        route: "motion",
        proposedRuleId: "MR-002",
        proposedRuleText:
          "모션은 한 주장과 한 상태 변화만 보여 주고 정지 fallback을 유지한다.",
      });
      const prepared = await challengeFixture(
        fixture,
        artifacts,
        { nonce: "3".repeat(64) },
      );
      const result = await commitLearningPromotion({
        challenge: prepared.challenge,
        approvalProof: approvalProof(
          prepared.challenge,
          { decision_id: "decision-mr-insert" },
        ),
        promotionPlan: artifacts.promotionPlan,
        reviewReceipt: artifacts.reviewReceipt,
        regressionEvidence: prepared.regression,
        sanitizationContext: prepared.context,
        skillRoot: fixture.skillRoot,
        workspaceRoot: fixture.workspaceRoot,
      });
      assert.equal(
        result.promotion_receipt.target_reference,
        "references/motion.md",
      );
      assert.equal(
        result.promotion_receipt.learning_status
          .counts_after.motionRules,
        2,
      );
      assert.match(
        await readFile(fixture.motionPath, "utf8"),
        /^\| MR-002 \|/m,
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });
});

test("approver가 producer/reviewer와 같거나 proof가 변조되면 active reference를 변경하지 않는다", async (t) => {
  const fixture = await createFixture();
  try {
    const artifacts = createPipelineArtifacts();
    const prepared = await challengeFixture(
      fixture,
      artifacts,
    );
    const before = await readFile(
      fixture.commercialPath,
      "utf8",
    );

    await t.test("producer self approval", async () => {
      const proof = approvalProof(prepared.challenge, {
        approver: {
          kind: "user",
          approver_id: "producer",
          session_id:
            artifacts.reviewReceipt.producer_session_id,
        },
      });
      await assert.rejects(
        commitLearningPromotion({
          challenge: prepared.challenge,
          approvalProof: proof,
          promotionPlan: artifacts.promotionPlan,
          reviewReceipt: artifacts.reviewReceipt,
          regressionEvidence: prepared.regression,
          sanitizationContext: prepared.context,
          skillRoot: fixture.skillRoot,
          workspaceRoot: fixture.workspaceRoot,
        }),
        expectCode("APPROVER_SEPARATION_REQUIRED"),
      );
    });

    await t.test("reviewer self approval", async () => {
      const proof = approvalProof(prepared.challenge, {
        approver: {
          kind: "user",
          approver_id: "reviewer",
          session_id:
            artifacts.reviewReceipt.reviewer_session_id,
        },
      });
      await assert.rejects(
        commitLearningPromotion({
          challenge: prepared.challenge,
          approvalProof: proof,
          promotionPlan: artifacts.promotionPlan,
          reviewReceipt: artifacts.reviewReceipt,
          regressionEvidence: prepared.regression,
          sanitizationContext: prepared.context,
          skillRoot: fixture.skillRoot,
          workspaceRoot: fixture.workspaceRoot,
        }),
        expectCode("APPROVER_SEPARATION_REQUIRED"),
      );
    });

    await t.test("proof hash tamper", async () => {
      const proof = approvalProof(prepared.challenge);
      proof.approval_proof_sha256 = H.d;
      await assert.rejects(
        commitLearningPromotion({
          challenge: prepared.challenge,
          approvalProof: proof,
          promotionPlan: artifacts.promotionPlan,
          reviewReceipt: artifacts.reviewReceipt,
          regressionEvidence: prepared.regression,
          sanitizationContext: prepared.context,
          skillRoot: fixture.skillRoot,
          workspaceRoot: fixture.workspaceRoot,
        }),
        expectCode(
          "USER_APPROVAL_PROOF_HASH_MISMATCH",
        ),
      );
    });

    assert.equal(
      await readFile(fixture.commercialPath, "utf8"),
      before,
    );
  } finally {
    await rm(fixture.root, {
      recursive: true,
      force: true,
    });
  }
});

test("active reference drift, learning-status drift, reused nonce를 각각 차단한다", async (t) => {
  await t.test("active reference drift", async () => {
    const fixture = await createFixture();
    try {
      const artifacts = createPipelineArtifacts();
      const prepared = await challengeFixture(
        fixture,
        artifacts,
      );
      await writeFile(
        fixture.commercialPath,
        `${await readFile(fixture.commercialPath, "utf8")}\n외부 수정\n`,
        "utf8",
      );
      await assert.rejects(
        commitLearningPromotion({
          challenge: prepared.challenge,
          approvalProof: approvalProof(
            prepared.challenge,
          ),
          promotionPlan: artifacts.promotionPlan,
          reviewReceipt: artifacts.reviewReceipt,
          regressionEvidence: prepared.regression,
          sanitizationContext: prepared.context,
          skillRoot: fixture.skillRoot,
          workspaceRoot: fixture.workspaceRoot,
        }),
        expectCode("ACTIVE_REFERENCE_DRIFT"),
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  await t.test("learning-status drift", async () => {
    const fixture = await createFixture();
    try {
      const artifacts = createPipelineArtifacts();
      const prepared = await challengeFixture(
        fixture,
        artifacts,
      );
      const reviewed = path.join(
        fixture.workspaceRoot,
        ".workspace",
        "learning",
        "behance",
        "reviewed.md",
      );
      await mkdir(path.dirname(reviewed), {
        recursive: true,
      });
      await writeFile(
        reviewed,
        "## LEARN-NEW\n",
        "utf8",
      );
      await assert.rejects(
        commitLearningPromotion({
          challenge: prepared.challenge,
          approvalProof: approvalProof(
            prepared.challenge,
          ),
          promotionPlan: artifacts.promotionPlan,
          reviewReceipt: artifacts.reviewReceipt,
          regressionEvidence: prepared.regression,
          sanitizationContext: prepared.context,
          skillRoot: fixture.skillRoot,
          workspaceRoot: fixture.workspaceRoot,
        }),
        expectCode("LEARNING_STATUS_DRIFT"),
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  await t.test("one-time nonce reuse", async () => {
    const fixture = await createFixture();
    try {
      const artifacts = createPipelineArtifacts();
      const prepared = await challengeFixture(
        fixture,
        artifacts,
      );
      const input = {
        challenge: prepared.challenge,
        approvalProof: approvalProof(
          prepared.challenge,
        ),
        promotionPlan: artifacts.promotionPlan,
        reviewReceipt: artifacts.reviewReceipt,
        regressionEvidence: prepared.regression,
        sanitizationContext: prepared.context,
        skillRoot: fixture.skillRoot,
        workspaceRoot: fixture.workspaceRoot,
      };
      await commitLearningPromotion(input);
      await assert.rejects(
        commitLearningPromotion(input),
        expectCode("PROMOTION_NONCE_REUSED"),
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });
});

test("상품명·URL·경로·고유 카피를 challenge와 commit 직전에 재검사한다", async (t) => {
  const unsafeCases = [
    {
      label: "product name",
      sanitizationOverrides: {
        product_names: ["구매 질문"],
      },
    },
    {
      label: "unique copy",
      sanitizationOverrides: {
        unique_copy: ["제품의 답과 검증 가능한 근거"],
      },
    },
    {
      label: "URL in validation criterion",
      regressionOverrides: {
        validation_criterion:
          "https://example.com 결과와 비교",
      },
    },
    {
      label: "file path in validation criterion",
      regressionOverrides: {
        validation_criterion:
          "C:\\private\\screenshots\\proof.png 확인",
      },
    },
  ];

  for (const [index, unsafe] of unsafeCases.entries()) {
    await t.test(unsafe.label, async () => {
      const fixture = await createFixture();
      try {
        const artifacts = createPipelineArtifacts();
        const snapshot =
          await inspectLearningPromotionState({
            promotionPlan: artifacts.promotionPlan,
            reviewReceipt: artifacts.reviewReceipt,
            skillRoot: fixture.skillRoot,
            workspaceRoot: fixture.workspaceRoot,
          });
        const regression = regressionEvidence(
          artifacts.promotionPlan,
          unsafe.regressionOverrides,
        );
        const context = sanitizationContext(
          artifacts.promotionPlan.candidate_sha256,
          unsafe.sanitizationOverrides,
        );
        await assert.rejects(
          createLearningPromotionChallenge({
            promotionPlan: artifacts.promotionPlan,
            reviewReceipt: artifacts.reviewReceipt,
            regressionEvidence: regression,
            sanitizationContext: context,
            skillRoot: fixture.skillRoot,
            workspaceRoot: fixture.workspaceRoot,
            frozenActiveReferenceSha256:
              snapshot.active_reference_sha256,
            learningStatusBeforeSha256:
              snapshot.learning_status_sha256,
            nonce: String(index + 4).repeat(64),
          }),
          expectCode("PROMOTION_SANITIZATION_FAILED"),
        );
      } finally {
        await rm(fixture.root, {
          recursive: true,
          force: true,
        });
      }
    });
  }
});

test("잘못된 target과 active table의 duplicate ID를 fail-closed 차단한다", async (t) => {
  await t.test("wrong target", async () => {
    const fixture = await createFixture();
    try {
      const artifacts = createPipelineArtifacts();
      const invalid = {
        ...artifacts.promotionPlan,
        target_reference: "references/learning.md",
      };
      await assert.rejects(
        inspectLearningPromotionState({
          promotionPlan: invalid,
          reviewReceipt: artifacts.reviewReceipt,
          skillRoot: fixture.skillRoot,
          workspaceRoot: fixture.workspaceRoot,
        }),
        expectCode("WRONG_PROMOTION_TARGET"),
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  await t.test("duplicate ID", async () => {
    const fixture = await createFixture();
    try {
      await writeFile(
        fixture.commercialPath,
        reference("Commercial", "CR").replace(
          "\n\n표 아래",
          "\n| CR-001 | 중복 규칙 | 중복 검사 | 2026-07-30 |\n\n표 아래",
        ),
        "utf8",
      );
      const artifacts = createPipelineArtifacts();
      await assert.rejects(
        inspectLearningPromotionState({
          promotionPlan: artifacts.promotionPlan,
          reviewReceipt: artifacts.reviewReceipt,
          skillRoot: fixture.skillRoot,
          workspaceRoot: fixture.workspaceRoot,
        }),
        expectCode("DUPLICATE_RULE_ID"),
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });
});

test("별도 deletion_allowed receipt 뒤에도 raw 삭제 없이 archive plan만 반환한다", async () => {
  const fixture = await createFixture();
  try {
    const artifacts = createPipelineArtifacts();
    const prepared = await challengeFixture(
      fixture,
      artifacts,
    );
    const result = await commitLearningPromotion({
      challenge: prepared.challenge,
      approvalProof: approvalProof(prepared.challenge),
      promotionPlan: artifacts.promotionPlan,
      reviewReceipt: artifacts.reviewReceipt,
      regressionEvidence: prepared.regression,
      sanitizationContext: prepared.context,
      skillRoot: fixture.skillRoot,
      workspaceRoot: fixture.workspaceRoot,
    });
    const rawSource = path.join(
      fixture.workspaceRoot,
      ".workspace",
      "learning",
      "raw-source.txt",
    );
    await mkdir(path.dirname(rawSource), {
      recursive: true,
    });
    await writeFile(rawSource, "raw evidence\n", "utf8");

    const denied = createSourceDeletionReceipt(
      artifacts.promotionPlan,
      {},
    );
    assert.throws(
      () =>
        createSourceArchivePlan({
          promotionReceipt: result.promotion_receipt,
          sourceDeletionReceipt: denied,
        }),
      expectCode("SOURCE_DELETION_RECEIPT_MISMATCH"),
    );

    const receipt = createSourceDeletionReceipt(
      artifacts.promotionPlan,
      {
        promotion_applied: true,
        active_reference:
          artifacts.promotionPlan.target_reference,
        active_reference_sha256:
          result.promotion_receipt.active_reference
            .sha256_after,
        promoted_rule_id:
          artifacts.promotionPlan.proposed_rule_id,
        promoted_rule_sha256:
          artifacts.promotionPlan.proposed_rule_sha256,
        regression_passed: true,
        regression_receipt_id:
          prepared.regression.receipt_id,
        regression_receipt_sha256:
          prepared.regression.receipt_sha256,
        learning_status_updated: true,
        learning_status_receipt_id:
          result.promotion_receipt.promotion_receipt_id,
        learning_status_receipt_sha256:
          result.promotion_receipt.learning_status
            .sha256_after,
        transient_source_ids: [
          "behance-review-batch-20260730",
        ],
      },
    );
    assert.equal(receipt.deletion_allowed, true);
    const archivePlan = createSourceArchivePlan({
      promotionReceipt: result.promotion_receipt,
      sourceDeletionReceipt: receipt,
    });
    assert.equal(
      archivePlan.action,
      "ARCHIVE_TRANSIENT_SOURCES",
    );
    assert.equal(archivePlan.raw_delete_allowed, false);
    assert.equal(archivePlan.deletion_performed, false);
    assert.equal(archivePlan.archive_performed, false);
    assert.deepEqual(archivePlan.operations, [
      {
        source_id: "behance-review-batch-20260730",
        operation: "archive",
        archive_relative_locator:
          `${result.promotion_receipt.promotion_revision_id}/${sha256(
            "behance-review-batch-20260730",
          ).slice(0, 20)}.archive`,
      },
    ]);
    assert.equal(
      await readFile(rawSource, "utf8"),
      "raw evidence\n",
    );
  } finally {
    await rm(fixture.root, {
      recursive: true,
      force: true,
    });
  }
});
