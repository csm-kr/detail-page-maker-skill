import assert from "node:assert/strict";
import test from "node:test";

import {
  assertValidationReceipt,
  validateValidationReceipt,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/receipt-contracts.mjs";

const SHA = {
  subject: "1".repeat(64),
  validator: "2".repeat(64),
  policy: "3".repeat(64),
};

function validReceipt() {
  return {
    validation_id: "validation-g2-image-001",
    subject: {
      artifact_set_digest: SHA.subject,
      artifact_ids: ["image-candidate-001", "product-ssot-001"],
    },
    validator: {
      name: "identity-qa",
      version: "1.0.0",
      code_sha256: SHA.validator,
      agent_id: "identity-qa-agent",
      agent_session_id: "qa-session",
    },
    producer: {
      agent_session_ids: ["image-session", "normalizer-session"],
    },
    policy: {
      policy_id: "policy.qa.image-identity.v1",
      policy_sha256: SHA.policy,
    },
    validator_kind: "model",
    checks: [
      {
        check_id: "identity.silhouette",
        status: "PASS",
        severity: "hard",
        evidence_artifact_ids: ["image-candidate-001"],
      },
    ],
    score: 100,
    hard_failures: [],
    verdict: "PASS",
    started_at: "2026-07-30T01:00:00.000Z",
    finished_at: "2026-07-30T01:01:00.000Z",
  };
}

test("검수 영수증은 exact input set과 분리된 validator session에 고정된다", () => {
  const receipt = validReceipt();
  const report = validateValidationReceipt(receipt, {
    expectedArtifactSetDigest: SHA.subject,
    expectedPolicyId: "policy.qa.image-identity.v1",
    validatorAgentSessionId: "qa-session",
    producerAgentSessionIds: ["image-session", "normalizer-session"],
    availableEvidenceArtifactIds: [
      "image-candidate-001",
      "product-ssot-001",
    ],
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.equal(assertValidationReceipt(receipt, report.context), receipt);
});

test("hard failure 또는 evidence가 없는 PASS self-report를 거부한다", () => {
  const receipt = validReceipt();
  receipt.validator.agent_session_id = "image-session";
  receipt.hard_failures = ["IDENTITY_DRIFT"];
  receipt.checks[0].evidence_artifact_ids = [];

  assert.throws(
    () =>
      assertValidationReceipt(receipt, {
        expectedArtifactSetDigest: SHA.subject,
        expectedPolicyId: "policy.qa.image-identity.v1",
        validatorAgentSessionId: "qa-session",
        producerAgentSessionIds: ["image-session", "normalizer-session"],
        availableEvidenceArtifactIds: [
          "image-candidate-001",
          "product-ssot-001",
        ],
      }),
    (error) =>
      error.code === "INVALID_VALIDATION_RECEIPT" &&
      error.details.errors.some(
        (item) => item.code === "VALIDATOR_SESSION_MISMATCH",
      ) &&
      error.details.errors.some(
        (item) => item.code === "VALIDATION_HARD_FAILURE",
      ) &&
      error.details.errors.some(
        (item) => item.code === "CHECK_EVIDENCE_REQUIRED",
      ),
  );
});
