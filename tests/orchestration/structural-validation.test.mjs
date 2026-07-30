import assert from "node:assert/strict";
import test from "node:test";

import {
  createStructuralValidationReceipt,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/structural-validation.mjs";
import {
  assertValidationReceipt,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/receipt-contracts.mjs";

const HASH = "a".repeat(64);

test("모든 producer stage output에 Orchestrator 독립 structural ValidationReceipt를 만든다", () => {
  const workOrder = {
    work_order_id: "work-g2a",
    stage_id: "G2A_IMAGE",
    assigned_agent_session_id: "image-producer",
    input_set_digest: "b".repeat(64),
    expected_output_types: ["media.image_candidate_set"],
    allowed_output_variants: [],
    gate_policy_id: "policy.image.production.v1",
  };
  const outputs = [
    {
      artifact_id: "artifact-image-set",
      type: "media.image_candidate_set",
      manifest_sha256: HASH,
      member_ids: ["image-hero.png"],
    },
  ];

  const receipt = createStructuralValidationReceipt({
    workOrder,
    outputArtifacts: outputs,
    workflowVersion: "2.0.0",
    createdAt: "2026-07-30T09:00:00.000Z",
  });

  assert.equal(receipt.verdict, "PASS");
  assert.equal(
    receipt.validator.agent_session_id,
    "orchestrator-structural-validator",
  );
  assert.doesNotMatch(
    receipt.validator.agent_session_id,
    /image-producer/,
  );
  assertValidationReceipt(receipt, {
    expectedArtifactSetDigest: receipt.subject.artifact_set_digest,
    expectedPolicyId: workOrder.gate_policy_id,
    validatorAgentSessionId: "orchestrator-structural-validator",
    producerAgentSessionIds: ["image-producer"],
    availableEvidenceArtifactIds: ["artifact-image-set"],
  });
});

test("선언되지 않은 output type이나 잘못된 hash는 structural receipt 전에 거부한다", () => {
  const workOrder = {
    work_order_id: "work",
    stage_id: "S0_INTAKE",
    assigned_agent_session_id: "producer",
    input_set_digest: HASH,
    expected_output_types: ["project.intake"],
    allowed_output_variants: [],
    gate_policy_id: "policy.intake.v1",
  };
  assert.throws(
    () =>
      createStructuralValidationReceipt({
        workOrder,
        outputArtifacts: [
          {
            artifact_id: "bad",
            type: "other.type",
            manifest_sha256: "not-hash",
            member_ids: [],
          },
        ],
        workflowVersion: "2.0.0",
      }),
    (error) => error.code === "STRUCTURAL_VALIDATION_FAILED",
  );
});
