import { createHash } from "node:crypto";

import {
  RepairPlanner,
  ScopeResolver,
  assertInvalidationAllowed,
  assertRubricDefinition,
  assertRubricResult,
  createRubricDelta,
  evaluatePublishGate,
  evaluateStopPolicy,
} from "./rubric-loop.mjs";

export class RepairLoopControllerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RepairLoopControllerError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new RepairLoopControllerError(code, message, details);
}

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

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function graphArtifactMap(graphSnapshot) {
  return new Map(
    (graphSnapshot?.artifacts ?? []).map((artifact) => [
      artifact.artifact_id,
      artifact,
    ]),
  );
}

function protectedArtifact(artifact) {
  return (
    artifact?.protected === true ||
    artifact?.type === "product.ssot" ||
    String(artifact?.type ?? "").startsWith("evidence.") ||
    String(artifact?.type ?? "").startsWith("knowledge.") ||
    String(artifact?.type ?? "") === "decision.plan_approval"
  );
}

function assertResultBoundToFreshGraph(result, graphSnapshot) {
  const artifacts = graphArtifactMap(graphSnapshot);
  const subject = artifacts.get(result.subject.artifact_id);
  if (!subject) {
    fail(
      "RUBRIC_SUBJECT_NOT_FOUND",
      "rubric subject artifact가 현재 graph에 없습니다.",
      { artifact_id: result.subject.artifact_id },
    );
  }
  if (
    subject.status !== "fresh" ||
    subject.manifest_sha256 !== result.subject.manifest_sha256
  ) {
    fail(
      "RUBRIC_SUBJECT_NOT_FRESH",
      "rubric subject는 현재 fresh artifact의 exact hash여야 합니다.",
      {
        artifact_id: result.subject.artifact_id,
        expected_manifest_sha256: subject.manifest_sha256,
        actual_manifest_sha256: result.subject.manifest_sha256,
        status: subject.status,
      },
    );
  }

  const missingEvidence = uniqueSorted(
    result.checks.flatMap((check) =>
      check.evidence_artifact_ids.filter((artifactId) => {
        const artifact = artifacts.get(artifactId);
        return !artifact || artifact.status !== "fresh";
      }),
    ),
  );
  if (missingEvidence.length > 0) {
    fail(
      "RUBRIC_EVIDENCE_NOT_FRESH",
      "rubric check의 모든 evidence artifact가 현재 graph에서 fresh여야 합니다.",
      { artifact_ids: missingEvidence },
    );
  }
}

function attemptFromResult(result, scopeKind = "full_page") {
  const failedChecks = result.checks.filter(
    (check) => check.status === "FAIL",
  );
  return {
    attempt_id: result.result_id,
    result_sha256: digest(result),
    scope_kind: scopeKind,
    section_ids: uniqueSorted(
      failedChecks.map((check) => check.section_id ?? "*"),
    ),
    failed_issue_keys: uniqueSorted(
      failedChecks.map(
        (check) =>
          `${check.issue_code}::${check.section_id ?? "*"}`,
      ),
    ),
    score: result.score,
  };
}

function assertPriorAttempts(priorAttempts) {
  if (!Array.isArray(priorAttempts)) {
    fail(
      "INVALID_REPAIR_HISTORY",
      "priorAttempts는 배열이어야 합니다.",
    );
  }
  const ids = new Set();
  for (const attempt of priorAttempts) {
    if (
      !attempt?.attempt_id ||
      !Number.isFinite(attempt.score) ||
      !Array.isArray(attempt.section_ids) ||
      !Array.isArray(attempt.failed_issue_keys)
    ) {
      fail(
        "INVALID_REPAIR_HISTORY",
        "repair history attempt 계약이 올바르지 않습니다.",
      );
    }
    if (ids.has(attempt.attempt_id)) {
      fail(
        "REPAIR_ATTEMPT_REPLAY",
        "같은 rubric result를 repair history에 두 번 기록할 수 없습니다.",
        { attempt_id: attempt.attempt_id },
      );
    }
    ids.add(attempt.attempt_id);
  }
  return ids;
}

export function createRepairLoopTransition({
  rubricDefinition,
  graphSnapshot,
  currentResult,
  previousResult = null,
  priorAttempts = [],
  budget = { state: "AVAILABLE" },
  scopeKind = "full_page",
  thresholds = {
    target_score: 97,
    behance_weighted_target: 90,
    critical_dimension_target: 85,
  },
}) {
  const definition = assertRubricDefinition(rubricDefinition);
  const current = assertRubricResult(currentResult, definition);
  assertResultBoundToFreshGraph(current, graphSnapshot);
  const seenAttemptIds = assertPriorAttempts(priorAttempts);
  if (seenAttemptIds.has(current.result_id)) {
    fail(
      "REPAIR_ATTEMPT_REPLAY",
      "이미 기록된 rubric result는 다시 적용할 수 없습니다.",
      { result_id: current.result_id },
    );
  }

  let delta = null;
  if (previousResult) {
    const previous = assertRubricResult(previousResult, definition);
    delta = createRubricDelta(previous, current, definition);
  }

  const attempt = attemptFromResult(current, scopeKind);
  const history = [...priorAttempts, attempt];
  const publishGate = evaluatePublishGate(
    current,
    definition,
    thresholds,
  );
  const stopDecision = evaluateStopPolicy({
    policy: definition.stop_policy,
    history,
    budget,
  });

  let repairPlan = null;
  let invalidationRoots = [];
  let action;
  if (publishGate.publish_allowed) {
    action = "PUBLISH_READY";
  } else if (stopDecision.action !== "CONTINUE") {
    action = stopDecision.action;
  } else {
    const planner = new RepairPlanner({
      scopeResolver: new ScopeResolver({
        artifacts: graphSnapshot?.artifacts ?? [],
      }),
    });
    repairPlan = planner.propose({
      rubric_result_id: current.result_id,
      checks: current.checks,
    });
    invalidationRoots = uniqueSorted(
      repairPlan.proposals.flatMap(
        (proposal) => proposal.root_artifact_ids,
      ),
    );
    assertInvalidationAllowed(repairPlan, invalidationRoots);
    if (repairPlan.proposals.length === 0 || invalidationRoots.length === 0) {
      fail(
        "EMPTY_REPAIR_SCOPE",
        "게시 실패를 수정할 deterministic artifact root가 없습니다.",
        { result_id: current.result_id },
      );
    }
    action = "REPAIR_REQUIRED";
  }

  const body = {
    schema_version: "1.0",
    rubric_id: definition.rubric_id,
    rubric_version: definition.version,
    rubric_sha256: definition.rubric_sha256,
    result_id: current.result_id,
    result_sha256: digest(current),
    subject: structuredClone(current.subject),
    previous_result_id: previousResult?.result_id ?? null,
    delta,
    attempt,
    history,
    publish_gate: publishGate,
    stop_decision: stopDecision,
    repair_plan: repairPlan,
    invalidation_root_artifact_ids: invalidationRoots,
    action,
    auto_publish_allowed:
      action === "PUBLISH_READY" && publishGate.publish_allowed,
  };
  return {
    ...body,
    transition_sha256: digest(body),
  };
}

export function resolveRepairMutation({
  transition,
  graphSnapshot,
  workflowDefinition,
}) {
  if (transition?.action !== "REPAIR_REQUIRED") {
    return {
      stale_artifact_ids: [],
      reset_stage_ids: [],
      approval_gates_to_reopen: [],
    };
  }
  const roots = transition.invalidation_root_artifact_ids ?? [];
  if (roots.length === 0) {
    fail(
      "EMPTY_REPAIR_SCOPE",
      "repair transition에는 하나 이상의 invalidation root가 필요합니다.",
    );
  }
  const artifacts = graphArtifactMap(graphSnapshot);
  const outgoing = new Map();
  for (const edge of graphSnapshot?.edges ?? []) {
    const edges = outgoing.get(edge.from) ?? [];
    edges.push(edge.to);
    outgoing.set(edge.from, edges);
  }
  const queue = [...roots];
  const staleIds = new Set();
  while (queue.length > 0) {
    const artifactId = queue.shift();
    if (staleIds.has(artifactId)) continue;
    const artifact = artifacts.get(artifactId);
    if (!artifact) {
      fail(
        "REPAIR_ROOT_NOT_FOUND",
        "repair root artifact가 현재 graph에 없습니다.",
        { artifact_id: artifactId },
      );
    }
    if (protectedArtifact(artifact)) {
      fail(
        "PROTECTED_REPAIR_DESCENDANT",
        "repair mutation은 SSOT·근거·지식 artifact를 무효화할 수 없습니다.",
        { artifact_id: artifactId, type: artifact.type },
      );
    }
    staleIds.add(artifactId);
    for (const childId of outgoing.get(artifactId) ?? []) {
      queue.push(childId);
    }
  }

  const definitions = new Map(
    (workflowDefinition?.stages ?? []).map((stage) => [
      stage.stage_id,
      stage,
    ]),
  );
  const resetStages = new Set(
    [...staleIds]
      .map((artifactId) => artifacts.get(artifactId)?.produced_by_stage)
      .filter((stageId) => definitions.has(stageId)),
  );
  const stageQueue = [...resetStages];
  while (stageQueue.length > 0) {
    const stageId = stageQueue.shift();
    for (const consumerId of definitions.get(stageId)?.consumers ?? []) {
      if (resetStages.has(consumerId)) continue;
      resetStages.add(consumerId);
      stageQueue.push(consumerId);
    }
  }
  const resetStageIds = [...resetStages].sort();
  return {
    stale_artifact_ids: [...staleIds].sort(),
    reset_stage_ids: resetStageIds,
    approval_gates_to_reopen: resetStageIds
      .filter((stageId) => definitions.get(stageId)?.user_gate === true)
      .sort(),
  };
}
