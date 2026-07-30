function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function sameSet(left, right) {
  const a = [...new Set(left ?? [])].sort();
  const b = [...new Set(right ?? [])].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export class ReceiptContractError extends Error {
  constructor(errors) {
    super("ValidationReceipt 계약을 충족하지 못했습니다.");
    this.name = "ReceiptContractError";
    this.code = "INVALID_VALIDATION_RECEIPT";
    this.details = { errors };
  }
}

export function validateValidationReceipt(receipt, context = {}) {
  const errors = [];
  const add = (code, path, message) =>
    errors.push({ code, path, message });
  const required = [
    ["validation_id", receipt?.validation_id],
    ["subject.artifact_set_digest", receipt?.subject?.artifact_set_digest],
    ["subject.artifact_ids", receipt?.subject?.artifact_ids],
    ["validator.name", receipt?.validator?.name],
    ["validator.version", receipt?.validator?.version],
    ["validator.code_sha256", receipt?.validator?.code_sha256],
    ["validator.agent_id", receipt?.validator?.agent_id],
    [
      "validator.agent_session_id",
      receipt?.validator?.agent_session_id,
    ],
    ["producer.agent_session_ids", receipt?.producer?.agent_session_ids],
    ["policy.policy_id", receipt?.policy?.policy_id],
    ["policy.policy_sha256", receipt?.policy?.policy_sha256],
    ["validator_kind", receipt?.validator_kind],
    ["checks", receipt?.checks],
    ["score", receipt?.score],
    ["hard_failures", receipt?.hard_failures],
    ["verdict", receipt?.verdict],
    ["started_at", receipt?.started_at],
    ["finished_at", receipt?.finished_at],
  ];
  for (const [path, value] of required) {
    if (value === undefined || value === null || value === "") {
      add("FIELD_REQUIRED", path, `${path}가 필요합니다.`);
    }
  }
  for (const [path, value] of [
    ["subject.artifact_set_digest", receipt?.subject?.artifact_set_digest],
    ["validator.code_sha256", receipt?.validator?.code_sha256],
    ["policy.policy_sha256", receipt?.policy?.policy_sha256],
  ]) {
    if (!isSha256(value)) {
      add("INVALID_SHA256", path, `${path}는 SHA-256이어야 합니다.`);
    }
  }
  if (
    receipt?.subject?.artifact_set_digest !==
    context.expectedArtifactSetDigest
  ) {
    add(
      "SUBJECT_DIGEST_MISMATCH",
      "subject.artifact_set_digest",
      "검수 대상이 WorkOrder의 exact input set과 다릅니다.",
    );
  }
  if (receipt?.policy?.policy_id !== context.expectedPolicyId) {
    add(
      "POLICY_MISMATCH",
      "policy.policy_id",
      "검수 정책이 stage의 고정 정책과 다릅니다.",
    );
  }
  if (
    receipt?.validator?.agent_session_id !==
    context.validatorAgentSessionId
  ) {
    add(
      "VALIDATOR_SESSION_MISMATCH",
      "validator.agent_session_id",
      "검수 결과는 lease를 받은 validator session이 제출해야 합니다.",
    );
  }
  if (
    !sameSet(
      receipt?.producer?.agent_session_ids,
      context.producerAgentSessionIds,
    )
  ) {
    add(
      "PRODUCER_SESSION_MISMATCH",
      "producer.agent_session_ids",
      "검수 대상의 실제 producer session 집합과 다릅니다.",
    );
  }
  if (
    (receipt?.producer?.agent_session_ids ?? []).includes(
      receipt?.validator?.agent_session_id,
    )
  ) {
    add(
      "PRODUCER_VALIDATOR_NOT_SEPARATED",
      "validator.agent_session_id",
      "생산자와 semantic validator session은 달라야 합니다.",
    );
  }
  if (
    !["deterministic", "model", "human"].includes(
      receipt?.validator_kind,
    )
  ) {
    add(
      "INVALID_VALIDATOR_KIND",
      "validator_kind",
      "validator_kind가 허용된 값이 아닙니다.",
    );
  }
  const evidenceIds = new Set(
    context.availableEvidenceArtifactIds ?? [],
  );
  if (!Array.isArray(receipt?.checks) || receipt.checks.length === 0) {
    add("CHECK_REQUIRED", "checks", "검수 check가 하나 이상 필요합니다.");
  } else {
    receipt.checks.forEach((check, index) => {
      if (!check?.check_id) {
        add(
          "CHECK_ID_REQUIRED",
          `checks[${index}].check_id`,
          "check_id가 필요합니다.",
        );
      }
      if (check?.status !== "PASS") {
        add(
          "CHECK_NOT_PASS",
          `checks[${index}].status`,
          "gate에 쓰는 모든 check는 PASS여야 합니다.",
        );
      }
      if (!["hard", "warning", "info"].includes(check?.severity)) {
        add(
          "INVALID_CHECK_SEVERITY",
          `checks[${index}].severity`,
          "check severity가 잘못되었습니다.",
        );
      }
      if (
        !Array.isArray(check?.evidence_artifact_ids) ||
        check.evidence_artifact_ids.length === 0
      ) {
        add(
          "CHECK_EVIDENCE_REQUIRED",
          `checks[${index}].evidence_artifact_ids`,
          "각 check에는 실제 evidence artifact가 필요합니다.",
        );
      } else {
        for (const artifactId of check.evidence_artifact_ids) {
          if (!evidenceIds.has(artifactId)) {
            add(
              "CHECK_EVIDENCE_NOT_FOUND",
              `checks[${index}].evidence_artifact_ids`,
              `evidence artifact ${artifactId}를 찾을 수 없습니다.`,
            );
          }
        }
      }
    });
  }
  if (
    receipt?.verdict !== "PASS" ||
    !Array.isArray(receipt?.hard_failures) ||
    receipt.hard_failures.length > 0
  ) {
    add(
      "VALIDATION_HARD_FAILURE",
      "hard_failures",
      "hard failure가 있거나 verdict가 PASS가 아닙니다.",
    );
  }
  if (
    !Number.isFinite(receipt?.score) ||
    receipt.score < 0 ||
    receipt.score > 100
  ) {
    add("INVALID_SCORE", "score", "score는 0~100이어야 합니다.");
  }
  if (
    Number.isNaN(Date.parse(receipt?.started_at)) ||
    Number.isNaN(Date.parse(receipt?.finished_at)) ||
    Date.parse(receipt?.finished_at) < Date.parse(receipt?.started_at)
  ) {
    add(
      "INVALID_VALIDATION_TIME",
      "started_at",
      "검수 시작·종료 시각이 유효하지 않습니다.",
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    context: structuredClone(context),
  };
}

export function assertValidationReceipt(receipt, context) {
  const report = validateValidationReceipt(receipt, context);
  if (!report.ok) throw new ReceiptContractError(report.errors);
  return receipt;
}
