import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { artifactSetDigest } from "./artifact-graph.mjs";

const VALIDATOR_SESSION_ID = "orchestrator-structural-validator";
const VALIDATOR_CODE_SHA256 = createHash("sha256")
  .update(readFileSync(fileURLToPath(import.meta.url)))
  .digest("hex");

export class StructuralValidationError extends Error {
  constructor(errors) {
    super("stage output structural validation에 실패했습니다.");
    this.name = "StructuralValidationError";
    this.code = "STRUCTURAL_VALIDATION_FAILED";
    this.details = { errors };
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sorted(values) {
  return [...values].map(String).sort();
}

function allowedOutputSets(workOrder) {
  return workOrder.allowed_output_variants?.length > 0
    ? workOrder.allowed_output_variants.map(sorted)
    : [sorted(workOrder.expected_output_types ?? [])];
}

export function createStructuralValidationReceipt({
  workOrder,
  outputArtifacts,
  workflowVersion,
  createdAt = new Date().toISOString(),
}) {
  const errors = [];
  const outputs = Array.isArray(outputArtifacts) ? outputArtifacts : [];
  const actualTypes = sorted(outputs.map((artifact) => artifact?.type));
  const allowedSets = allowedOutputSets(workOrder);
  const exactMatch = allowedSets.some(
    (expected) =>
      expected.length === actualTypes.length &&
      expected.every((type, index) => type === actualTypes[index]),
  );
  const repeatedFanOutMatch =
    Boolean(workOrder?.fan_out_key) &&
    allowedSets.some((expected) => {
      if (
        expected.length === 0 ||
        actualTypes.length < expected.length ||
        actualTypes.length % expected.length !== 0
      ) {
        return false;
      }
      const repetitionCount = actualTypes.length / expected.length;
      const repeatedExpected = sorted(
        Array.from({ length: repetitionCount }, () => expected).flat(),
      );
      return repeatedExpected.every(
        (type, index) => type === actualTypes[index],
      );
    });
  const matches = exactMatch || repeatedFanOutMatch;
  if (!matches) errors.push("OUTPUT_TYPE_MISMATCH");
  if (
    !workOrder?.work_order_id ||
    !workOrder?.stage_id ||
    !workOrder?.assigned_agent_session_id ||
    !workOrder?.gate_policy_id ||
    !/^[a-f0-9]{64}$/.test(String(workOrder?.input_set_digest || ""))
  ) {
    errors.push("INVALID_WORK_ORDER");
  }
  const artifactIds = new Set();
  for (const artifact of outputs) {
    if (
      !artifact?.artifact_id ||
      artifactIds.has(artifact.artifact_id) ||
      !artifact?.type ||
      !/^[a-f0-9]{64}$/.test(String(artifact?.manifest_sha256 || "")) ||
      !Array.isArray(artifact?.member_ids) ||
      artifact.member_ids.length === 0
    ) {
      errors.push(`INVALID_OUTPUT_ARTIFACT:${artifact?.artifact_id ?? "?"}`);
    }
    artifactIds.add(artifact?.artifact_id);
  }
  if (errors.length > 0) {
    throw new StructuralValidationError(errors);
  }

  const subjectDigest = artifactSetDigest(
    outputs.map((artifact) => ({
      artifact_id: artifact.artifact_id,
      manifest_sha256: artifact.manifest_sha256,
      member_ids: artifact.member_ids,
      relation: "evidence_for",
    })),
  );
  const policySha256 = sha256(
    JSON.stringify({
      workflow_version: workflowVersion,
      stage_id: workOrder.stage_id,
      gate_policy_id: workOrder.gate_policy_id,
    }),
  );
  return {
    validation_id: `structural-${sha256(
      [
        workOrder.work_order_id,
        subjectDigest,
        policySha256,
      ].join("\n"),
    ).slice(0, 16)}`,
    subject: {
      artifact_set_digest: subjectDigest,
      artifact_ids: outputs.map((artifact) => artifact.artifact_id),
    },
    validator: {
      name: "WorkflowOrchestratorStructuralValidator",
      version: "1.0.0",
      code_sha256: VALIDATOR_CODE_SHA256,
      agent_id: "workflow-orchestrator",
      agent_session_id: VALIDATOR_SESSION_ID,
    },
    producer: {
      agent_session_ids: [workOrder.assigned_agent_session_id],
    },
    policy: {
      policy_id: workOrder.gate_policy_id,
      policy_sha256: policySha256,
    },
    validator_kind: "deterministic",
    checks: outputs.map((artifact) => ({
      check_id: `structural.${artifact.type}`,
      status: "PASS",
      severity: "hard",
      evidence_artifact_ids: [artifact.artifact_id],
    })),
    score: 100,
    hard_failures: [],
    verdict: "PASS",
    input_set_digest: workOrder.input_set_digest,
    started_at: createdAt,
    finished_at: createdAt,
  };
}
