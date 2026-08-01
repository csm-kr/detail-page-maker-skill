import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  completeBrowserCaptureWorkOrder,
  createBrowserCaptureWorkOrder,
  verifyBrowserCaptureHeroAssurance,
} from "../orchestration/adapters/browser-capture-adapter.mjs";
import {
  commitStudioRevision,
  inspectStudioWorkingState,
} from "../orchestration/adapters/studio-commit-adapter.mjs";
import {
  assertRubricDefinition,
  assertRubricResult,
  createRubricDelta,
  evaluatePublishGate,
} from "../orchestration/rubric-loop.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_WORKING_HTML_BYTES = 25 * 1024 * 1024;
const FIXED_THRESHOLDS = Object.freeze({
  qa_score: 97,
  target_score: 97,
  behance_weighted_target: 90,
  critical_dimension_target: 85,
});

export class StudioG4PipelineError extends Error {
  constructor(code, message, status = 409, details = {}) {
    super(message);
    this.name = "StudioG4PipelineError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function fail(code, message, status = 409, details = {}) {
  throw new StudioG4PipelineError(code, message, status, details);
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

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value) {
  return sha256Bytes(JSON.stringify(canonicalize(value)));
}

function assertSha256(value, field) {
  if (!SHA256_PATTERN.test(String(value ?? ""))) {
    fail("INVALID_STUDIO_DIGEST", `${field}에는 SHA-256이 필요합니다.`, 400, {
      field,
    });
  }
}

function assertSessionId(value) {
  const sessionId = String(value ?? "");
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    fail(
      "INVALID_STUDIO_SESSION_ID",
      "Studio session ID 형식이 잘못됐습니다.",
      400,
    );
  }
  return sessionId;
}

function posix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function resolveInside(root, candidate, field) {
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(candidate);
  const relative = path.relative(absoluteRoot, absolute);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    relative.length === 0
  ) {
    fail(
      "STUDIO_PATH_OUTSIDE_PROJECT",
      `${field}는 프로젝트 내부 하위 경로여야 합니다.`,
      403,
      { field, candidate: absolute },
    );
  }
  return absolute;
}

function workflowDigest(workflow) {
  return canonicalSha256({
    project_id: workflow.project_id,
    input_digest: workflow.input_digest,
    stages: Object.fromEntries(
      Object.entries(workflow.stages ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([stageId, stage]) => [
          stageId,
          {
            status: stage.status,
            revision_reset_by: stage.revision_reset_by ?? null,
          },
        ]),
    ),
    artifacts: (workflow.artifacts ?? [])
      .map((artifact) => ({
        artifact_id: artifact.artifact_id,
        type: artifact.type,
        status: artifact.status,
        manifest_sha256: artifact.manifest_sha256,
        record_locator: artifact.record_locator,
        record_sha256: artifact.record_sha256,
        produced_by_stage: artifact.produced_by_stage,
      }))
      .sort((left, right) =>
        left.artifact_id.localeCompare(right.artifact_id),
      ),
  });
}

function sessionBody(document) {
  const body = structuredClone(document);
  delete body.session_sha256;
  return body;
}

function sessionDocument(body) {
  return {
    ...structuredClone(body),
    session_sha256: canonicalSha256(body),
  };
}

async function atomicWrite(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, target);
}

function artifactByType(workflow, type, producerStage) {
  return (workflow.artifacts ?? []).filter(
    (artifact) =>
      artifact.type === type &&
      artifact.status === "fresh" &&
      (!producerStage || artifact.produced_by_stage === producerStage),
  );
}

function requireReadyStage(workflow, stageId) {
  if (!(workflow.ready_stages ?? []).includes(stageId)) {
    fail(
      "STUDIO_STAGE_NOT_READY",
      `${stageId}가 현재 workflow에서 실행 가능한 상태가 아닙니다.`,
      409,
      {
        stage_id: stageId,
        ready_stages: workflow.ready_stages ?? [],
      },
    );
  }
}

function evidenceIds(result) {
  return [
    ...new Set([
      ...(result.viewport_capture_ids ?? []),
      ...(result.checks ?? []).flatMap(
        (check) => check.evidence_artifact_ids ?? [],
      ),
    ]),
  ].sort();
}

function scoreForDimension(result, dimensionId) {
  const checks = (result.checks ?? []).filter(
    (check) => check.dimension_id === dimensionId,
  );
  if (checks.length === 0) return null;
  return (
    checks.reduce((sum, check) => sum + Number(check.score), 0) /
    checks.length
  );
}

function qualityMetrics(result, definition) {
  const gate = evaluatePublishGate(result, definition, FIXED_THRESHOLDS);
  const criticalScores = definition.dimensions
    .filter((dimension) => dimension.critical === true)
    .map((dimension) =>
      scoreForDimension(result, dimension.dimension_id),
    )
    .filter(Number.isFinite);
  const deterministicHardFailureCount = result.checks.filter(
    (check) =>
      check.evaluator_kind === "deterministic" &&
      check.status === "FAIL" &&
      check.severity === "hard",
  ).length;
  return {
    gate,
    metrics: {
      behance_quality_score:
        gate.behance_weighted_score ?? result.score,
      critical_dimension_min_score:
        criticalScores.length > 0
          ? Math.min(...criticalScores)
          : result.score,
      deterministic_hard_failure_count:
        deterministicHardFailureCount,
      ...(result?.quality_metrics?.reference_comparison
        ? {
            reference_comparison: structuredClone(
              result.quality_metrics.reference_comparison,
            ),
          }
        : {}),
      ...(result?.quality_metrics
        ?.category_reference_comparison
        ? {
            category_reference_comparison: structuredClone(
              result.quality_metrics
                .category_reference_comparison,
            ),
          }
        : {}),
    },
  };
}

function assertPublishQuality(result, definition, phase) {
  const verified = assertRubricResult(result, definition);
  const quality = qualityMetrics(verified, definition);
  if (
    !quality.gate.publish_allowed ||
    verified.score < FIXED_THRESHOLDS.target_score ||
    quality.metrics.behance_quality_score <
      FIXED_THRESHOLDS.behance_weighted_target ||
    quality.metrics.critical_dimension_min_score <
      FIXED_THRESHOLDS.critical_dimension_target ||
    quality.metrics.deterministic_hard_failure_count > 0
  ) {
    fail(
      "STUDIO_RUBRIC_GATE_BLOCKED",
      `${phase} rubric이 97/90/85/hard-0 gate를 통과하지 못했습니다.`,
      409,
      {
        reasons: quality.gate.reasons,
        score: verified.score,
        quality_metrics: quality.metrics,
      },
    );
  }
  return { result: verified, ...quality };
}

function buildValidationReceipt({
  subjectArtifactSetDigest,
  subjectArtifactIds,
  validatorSessionId,
  producerSessionIds,
  policyId,
  policySha256,
  evidenceArtifactIds,
  score,
  metrics,
  validatorCodeSha256,
  validationIdPrefix,
}) {
  const now = new Date().toISOString();
  return {
    validation_id:
      `${validationIdPrefix}-${subjectArtifactSetDigest.slice(0, 16)}`,
    subject: {
      artifact_set_digest: subjectArtifactSetDigest,
      artifact_ids: [...subjectArtifactIds],
    },
    validator: {
      name: "StudioV1G4PipelineValidator",
      version: "1.0.0",
      code_sha256: validatorCodeSha256,
      agent_id: "studio-v1-g4-validator",
      agent_session_id: validatorSessionId,
    },
    producer: {
      agent_session_ids: [...new Set(producerSessionIds)].sort(),
    },
    policy: {
      policy_id: policyId,
      policy_sha256: policySha256,
    },
    validator_kind: "deterministic",
    checks: [
      {
        check_id: `${validationIdPrefix}.exact-gate`,
        status: "PASS",
        severity: "hard",
        evidence_artifact_ids: [...evidenceArtifactIds],
      },
    ],
    score,
    quality_metrics: structuredClone(metrics),
    hard_failures: [],
    verdict: "PASS",
    started_at: now,
    finished_at: now,
  };
}

function executionReceipt(workOrder, adapterCodeSha256) {
  return {
    execution_id: `execution-${workOrder.work_order_id}`,
    adapter_id: workOrder.runner_contract.adapter_id,
    adapter_version: "1.0.0",
    adapter_code_sha256: adapterCodeSha256,
  };
}

function resultEnvelope({
  projectRef,
  workOrder,
  outputArtifacts,
  adapterCodeSha256,
  validationReceipt,
}) {
  return {
    project_ref: projectRef,
    producer_agent_session_id:
      workOrder.assigned_agent_session_id,
    input_set_digest: workOrder.input_set_digest,
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: outputArtifacts,
    execution_receipt: executionReceipt(
      workOrder,
      adapterCodeSha256,
    ),
    ...(validationReceipt
      ? { validation_receipt: validationReceipt }
      : {}),
  };
}

function bindRubricEvidenceToCommittedGraph(
  result,
  committedArtifacts,
) {
  const evidenceArtifactIds = committedArtifacts
    .map((artifact) => artifact.artifact_id)
    .sort();
  return {
    ...structuredClone(result),
    checks: result.checks.map((check) => ({
      ...structuredClone(check),
      evidence_artifact_ids: evidenceArtifactIds,
    })),
  };
}

export function createStudioG4Pipeline({
  projectRoot,
  workflowEngine,
  projectRefFor,
  baseUrlFor,
}) {
  const root = path.resolve(projectRoot);
  const canonicalRootPromise = realpath(root);
  const sessionRoot = path.join(
    root,
    ".detail-page",
    "workflow",
    "studio-sessions",
  );
  let adapterHashesPromise;

  async function adapterHashes() {
    if (!adapterHashesPromise) {
      adapterHashesPromise = Promise.all([
        readFile(new URL(import.meta.url)),
        readFile(
          new URL(
            "../orchestration/adapters/studio-commit-adapter.mjs",
            import.meta.url,
          ),
        ),
        readFile(
          new URL(
            "../orchestration/adapters/browser-capture-adapter.mjs",
            import.meta.url,
          ),
        ),
      ]).then(([pipeline, studioCommit, browserCapture]) => ({
        pipeline: sha256Bytes(pipeline),
        studioCommit: sha256Bytes(studioCommit),
        browserCapture: sha256Bytes(browserCapture),
      }));
    }
    return adapterHashesPromise;
  }

  function sessionPath(sessionId) {
    return path.join(sessionRoot, `${assertSessionId(sessionId)}.json`);
  }

  async function saveSession(body) {
    const document = sessionDocument(body);
    await atomicWrite(
      sessionPath(document.session_id),
      `${JSON.stringify(document, null, 2)}\n`,
    );
    return document;
  }

  async function loadSession(sessionId) {
    const target = sessionPath(sessionId);
    let document;
    try {
      document = JSON.parse(await readFile(target, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") {
        fail(
          "STUDIO_SESSION_NOT_FOUND",
          "Studio working session을 찾을 수 없습니다.",
          404,
        );
      }
      throw error;
    }
    const actual = canonicalSha256(sessionBody(document));
    if (document.session_sha256 !== actual) {
      fail(
        "STUDIO_SESSION_INTEGRITY_MISMATCH",
        "Studio session seal이 현재 bytes와 다릅니다.",
      );
    }
    return document;
  }

  async function inspectSession(sessionId) {
    const session = await loadSession(sessionId);
    return {
      session_id: session.session_id,
      status: session.status,
      working_id: session.working_state.working_id,
      working_snapshot_digest:
        session.working_snapshot.artifact_set_digest,
      revision_id: session.revision?.revision_id ?? null,
      capture_set_id:
        session.capture_plan?.work_order?.capture_set_id ?? null,
      challenge: session.challenge ?? null,
      session_sha256: session.session_sha256,
    };
  }

  async function readWorkingForEditor(sessionId) {
    const session = await loadSession(sessionId);
    if (session.status !== "working") {
      fail(
        "STUDIO_SESSION_NOT_MUTABLE",
        "최종 수정은 working 상태의 Studio session에서만 가능합니다.",
      );
    }
    const htmlPath = path.join(
      path.resolve(session.working_state.root),
      "index.html",
    );
    resolveInside(
      await canonicalRootPromise,
      htmlPath,
      "working index.html",
    );
    return {
      session: await inspectSession(sessionId),
      html: await readFile(htmlPath, "utf8"),
      editable_html_contract: structuredClone(
        session.editable_html_contract,
      ),
    };
  }

  async function latestWorkingSession() {
    let entries = [];
    try {
      entries = await readdir(sessionRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    const sessions = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const session = await loadSession(entry.name.slice(0, -5));
        if (session.status === "working") sessions.push(session);
      } catch {
        // 손상되거나 다른 버전인 세션은 최종 편집 후보에서 제외한다.
      }
    }
    sessions.sort(
      (left, right) =>
        Date.parse(right.updated_at ?? right.imported_at ?? 0) -
        Date.parse(left.updated_at ?? left.imported_at ?? 0),
    );
    return sessions[0] ? inspectSession(sessions[0].session_id) : null;
  }

  async function importWorking(payload) {
    const projectRef = await projectRefFor(
      payload.editor_session_id ?? "studio-v1-editor",
    );
    const workflow = await workflowEngine.inspect(projectRef);
    requireReadyStage(workflow, "S1_STUDIO_WORKING");
    const assembly = structuredClone(payload.assembly);
    const workingState = structuredClone(payload.working_state);
    const editableHtmlContract = structuredClone(
      payload.editable_html_contract,
    );
    const workflowManifestSha256 =
      assembly?.workflow_manifest_sha256 ??
      assembly?.manifest_sha256;
    assertSha256(
      workflowManifestSha256,
      "assembly.workflow_manifest_sha256",
    );
    const pageCandidates = artifactByType(
      workflow,
      "page.html_revision",
      "G4A_ASSEMBLY",
    ).filter(
      (artifact) =>
        artifact.artifact_id === assembly?.artifact_id &&
        artifact.manifest_sha256 === workflowManifestSha256,
    );
    if (pageCandidates.length !== 1) {
      fail(
        "VERIFIED_G4_HTML_REQUIRED",
        "현재 G4A의 fresh page.html_revision과 assembly ID/hash가 정확히 같아야 합니다.",
      );
    }
    let canonicalWorkingRoot;
    try {
      canonicalWorkingRoot = await realpath(
        path.resolve(String(workingState?.root ?? "")),
      );
    } catch {
      fail(
        "STUDIO_PATH_OUTSIDE_PROJECT",
        "working_state.root는 프로젝트 내부의 실제 디렉터리여야 합니다.",
        403,
        { field: "working_state.root" },
      );
    }
    resolveInside(
      await canonicalRootPromise,
      canonicalWorkingRoot,
      "working_state.root",
    );
    workingState.root = canonicalWorkingRoot;
    const snapshot = await inspectStudioWorkingState({
      projectRoot: root,
      assembly,
      workingState,
      editableHtmlContract,
    });
    const sessionId = assertSessionId(
      payload.session_id ?? workingState.working_id,
    );
    const now = new Date().toISOString();
    const body = {
      schema_version: "1.0",
      session_id: sessionId,
      status: "working",
      project_ref: {
        project_id: projectRef.project_id,
        input_digest: projectRef.input_digest,
      },
      editor_session_id:
        payload.editor_session_id ?? "studio-v1-editor",
      commit_session_id:
        payload.commit_session_id ?? "studio-v1-commit",
      validator_session_id:
        payload.validator_session_id ?? "studio-v1-rubric-validator",
      assembly,
      working_state: workingState,
      editable_html_contract: editableHtmlContract,
      imported_workflow_digest: workflowDigest(workflow),
      imported_page_artifact: pageCandidates[0],
      working_snapshot: snapshot,
      imported_at: now,
      updated_at: now,
    };
    const saved = await saveSession(body);
    return {
      session: await inspectSession(saved.session_id),
      imported_page_artifact: saved.imported_page_artifact,
    };
  }

  async function saveWorking(payload) {
    const session = await loadSession(payload.session_id);
    if (session.status !== "working") {
      fail(
        "STUDIO_SESSION_NOT_MUTABLE",
        "working 상태의 Studio session만 저장할 수 있습니다.",
      );
    }
    assertSha256(
      payload.expected_working_snapshot_digest,
      "expected_working_snapshot_digest",
    );
    if (
      payload.expected_working_snapshot_digest !==
      session.working_snapshot.artifact_set_digest
    ) {
      fail(
        "STUDIO_WORKING_SNAPSHOT_CONFLICT",
        "저장 기준 working digest가 현재 session과 다릅니다.",
      );
    }
    if (
      typeof payload.html !== "string" ||
      Buffer.byteLength(payload.html, "utf8") === 0 ||
      Buffer.byteLength(payload.html, "utf8") >
        MAX_WORKING_HTML_BYTES
    ) {
      fail(
        "INVALID_STUDIO_WORKING_HTML",
        "저장할 Studio HTML bytes가 없거나 허용 크기를 넘었습니다.",
        400,
      );
    }
    const editableHtmlContract = structuredClone(
      payload.editable_html_contract,
    );
    const htmlPath = path.join(
      path.resolve(session.working_state.root),
      "index.html",
    );
    resolveInside(
      await canonicalRootPromise,
      htmlPath,
      "working index.html",
    );
    const previousBytes = await readFile(htmlPath);
    try {
      await atomicWrite(htmlPath, payload.html);
      const snapshot = await inspectStudioWorkingState({
        projectRoot: root,
        assembly: session.assembly,
        workingState: session.working_state,
        editableHtmlContract,
      });
      const updated = await saveSession({
        ...sessionBody(session),
        editable_html_contract: editableHtmlContract,
        working_snapshot: snapshot,
        updated_at: new Date().toISOString(),
      });
      return {
        session: await inspectSession(updated.session_id),
        semantic_dom_diff: snapshot.semantic_dom_diff,
      };
    } catch (error) {
      await atomicWrite(htmlPath, previousBytes);
      throw error;
    }
  }

  async function commitAndPlanCapture(payload) {
    const session = await loadSession(payload.session_id);
    if (session.status !== "working") {
      fail(
        "STUDIO_SESSION_NOT_COMMITTABLE",
        "working 상태의 Studio session만 commit할 수 있습니다.",
      );
    }
    assertSha256(
      payload.expected_working_snapshot_digest,
      "expected_working_snapshot_digest",
    );
    const projectRef = await projectRefFor(session.editor_session_id);
    const workflowBefore = await workflowEngine.inspect(projectRef);
    requireReadyStage(workflowBefore, "S1_STUDIO_WORKING");
    if (
      workflowDigest(workflowBefore) !==
      session.imported_workflow_digest
    ) {
      fail(
        "STUDIO_IMPORT_WORKFLOW_DRIFT",
        "verified HTML import 이후 workflow graph가 바뀌었습니다.",
      );
    }
    const snapshot = await inspectStudioWorkingState({
      projectRoot: root,
      assembly: session.assembly,
      workingState: session.working_state,
      editableHtmlContract: session.editable_html_contract,
    });
    if (
      snapshot.artifact_set_digest !==
        session.working_snapshot.artifact_set_digest ||
      snapshot.artifact_set_digest !==
        payload.expected_working_snapshot_digest
    ) {
      fail(
        "STUDIO_WORKING_DRIFT",
        "save된 working snapshot과 commit 대상 bytes가 다릅니다.",
      );
    }
    const definition = assertRubricDefinition(
      payload.rubric_definition,
    );
    if (
      payload.precommit_rubric_result?.subject?.artifact_id !==
        snapshot.working_id ||
      payload.precommit_rubric_result?.subject?.manifest_sha256 !==
        snapshot.artifact_set_digest
    ) {
      fail(
        "STUDIO_PRECOMMIT_RUBRIC_SUBJECT_MISMATCH",
        "pre-commit rubric이 현재 working snapshot을 평가하지 않았습니다.",
      );
    }
    const precommit = assertPublishQuality(
      payload.precommit_rubric_result,
      definition,
      "pre-commit",
    );
    const hashes = await adapterHashes();
    const precommitEvidenceIds = evidenceIds(precommit.result);
    const precommitQa = buildValidationReceipt({
      subjectArtifactSetDigest: snapshot.artifact_set_digest,
      subjectArtifactIds: [snapshot.working_id],
      validatorSessionId: session.validator_session_id,
      producerSessionIds: [
        session.working_state.producer_agent_session_id,
      ],
      policyId: "policy.studio-final-qa.v1",
      policySha256: definition.policy.sha256,
      evidenceArtifactIds: precommitEvidenceIds,
      score: precommit.result.score,
      metrics: precommit.metrics,
      validatorCodeSha256: hashes.pipeline,
      validationIdPrefix: "validation-studio-precommit",
    });
    const committed = await commitStudioRevision({
      projectRoot: root,
      assembly: session.assembly,
      workingState: session.working_state,
      editableHtmlContract: session.editable_html_contract,
      expectedWorkingSnapshot: snapshot,
      rubricDefinition: definition,
      rubricResult: precommit.result,
      qaReceipt: precommitQa,
      qaContext: {
        expectedPolicyId: "policy.studio-final-qa.v1",
        validatorAgentSessionId: session.validator_session_id,
        producerAgentSessionIds: [
          session.working_state.producer_agent_session_id,
        ],
        availableEvidenceArtifactIds: precommitEvidenceIds,
      },
      thresholds: FIXED_THRESHOLDS,
      committedAt: new Date().toISOString(),
    });

    const s1ProjectRef = await projectRefFor(
      session.editor_session_id,
    );
    const s1WorkOrder = await workflowEngine.lease(s1ProjectRef, {
      stage_ids: ["S1_STUDIO_WORKING"],
    });
    if (!s1WorkOrder) {
      fail(
        "STUDIO_WORKING_LEASE_UNAVAILABLE",
        "S1_STUDIO_WORKING lease를 얻지 못했습니다.",
      );
    }
    const workingArtifact = {
      artifact_id: snapshot.working_id,
      type: "studio.working_revision",
      manifest_sha256: snapshot.artifact_set_digest,
      member_ids: [
        "index.html",
        "asset-manifest.json",
        ...snapshot.asset_files.map((file) => file.path),
      ],
      working_snapshot: snapshot,
      mutable: true,
    };
    await workflowEngine.submit(
      s1WorkOrder.work_order_id,
      resultEnvelope({
        projectRef: s1ProjectRef,
        workOrder: s1WorkOrder,
        outputArtifacts: [workingArtifact],
        adapterCodeSha256: hashes.pipeline,
      }),
    );

    const commitProjectRef = await projectRefFor(
      session.commit_session_id,
    );
    const commitWorkOrder = await workflowEngine.lease(
      commitProjectRef,
      { stage_ids: ["G4C_STUDIO_COMMIT"] },
    );
    if (!commitWorkOrder) {
      fail(
        "STUDIO_COMMIT_LEASE_UNAVAILABLE",
        "G4C_STUDIO_COMMIT lease를 얻지 못했습니다.",
      );
    }
    const revisionRelativePath = posix(
      path.relative(
        await canonicalRootPromise,
        committed.revision_path,
      ),
    );
    const committedArtifact = {
      artifact_id: committed.revision.artifact_id,
      type: "studio.committed_revision",
      manifest_sha256: committed.revision.commit_sha256,
      member_ids: [...committed.member_ids],
      member_manifest: structuredClone(
        committed.member_manifest,
      ),
      revision_id: committed.revision.revision_id,
      revision_path: revisionRelativePath,
      revision_commit_sha256:
        committed.revision.commit_sha256,
      html_sha256: committed.revision.html_sha256,
      hero_assurance_bundle_sha256:
        committed.revision.hero_assurance_bundle_sha256,
      hero_assurance_manifest_sha256:
        committed.revision.hero_assurance_manifest_sha256,
      hero_identity_validation_receipt_sha256:
        committed.revision
          .hero_identity_validation_receipt_sha256,
      hero_commercial_validation_receipt_sha256:
        committed.revision
          .hero_commercial_validation_receipt_sha256,
      hero_assurance_validation_receipt_sha256:
        committed.revision
          .hero_assurance_validation_receipt_sha256,
      hero_assurance_member: structuredClone(
        committed.member_manifest.members.find(
          (member) =>
            member.member_id === "hero-assurance.json",
        ),
      ),
      revision: structuredClone(committed.revision),
      mutable: false,
    };
    const htmlArtifact = {
      artifact_id:
        `html-${committed.revision.revision_id}`,
      type: "page.html_revision",
      manifest_sha256: committed.revision.html_sha256,
      member_ids: ["index.html"],
      member_manifest: {
        schema_version: "1.0",
        policy: "materialized",
        members: committed.member_manifest.members.filter(
          (member) => member.member_id === "index.html",
        ),
      },
      revision_id: committed.revision.revision_id,
      revision_commit_sha256:
        committed.revision.commit_sha256,
      revision_path: revisionRelativePath,
    };
    await workflowEngine.submit(
      commitWorkOrder.work_order_id,
      resultEnvelope({
        projectRef: commitProjectRef,
        workOrder: commitWorkOrder,
        outputArtifacts: [committedArtifact, htmlArtifact],
        adapterCodeSha256: hashes.studioCommit,
      }),
    );

    const renderUrl =
      `${baseUrlFor()}/${revisionRelativePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}/index.html`;
    const htmlManifestBody = {
      schema_version: "1.0",
      artifact_type: "page.html_revision",
      artifact_id: htmlArtifact.artifact_id,
      revision_id: committed.revision.revision_id,
      revision_commit_sha256:
        committed.revision.commit_sha256,
      html_sha256: committed.revision.html_sha256,
      render_url: renderUrl,
    };
    const htmlManifest = {
      ...htmlManifestBody,
      manifest_sha256: canonicalSha256(htmlManifestBody),
    };
    const heroAssuranceVerification =
      await verifyBrowserCaptureHeroAssurance({
        projectRoot: root,
        revisionArtifact: committedArtifact,
      });
    const allowedOutputRoot = path.join(
      root,
      ".detail-page",
      "qa",
      "captures",
    );
    const outputRoot = path.join(
      allowedOutputRoot,
      committed.revision.revision_id,
    );
    await mkdir(allowedOutputRoot, { recursive: true });
    const capturePlan = createBrowserCaptureWorkOrder({
      revision: committed.revision,
      htmlManifest,
      url: renderUrl,
      rubricDefinition: definition,
      browserHarness: payload.browser_harness,
      projectRoot: root,
      allowedOutputRoot,
      outputRoot,
    });
    const baselineRubricResult = assertRubricResult(
      {
        ...precommit.result,
        result_id:
          `${precommit.result.result_id}-immutable-baseline`,
        subject: {
          artifact_id: committed.revision.artifact_id,
          manifest_sha256: committed.revision.commit_sha256,
        },
      },
      definition,
    );
    const updated = await saveSession({
      ...sessionBody(session),
      status: "capture_planned",
      working_snapshot: snapshot,
      rubric_definition: definition,
      precommit_rubric_result: precommit.result,
      immutable_baseline_rubric_result:
        baselineRubricResult,
      precommit_qa_receipt: precommitQa,
      revision: committed.revision,
      revision_path: revisionRelativePath,
      committed_artifacts: [committedArtifact, htmlArtifact],
      hero_assurance_verification:
        heroAssuranceVerification,
      html_manifest: htmlManifest,
      capture_plan: capturePlan,
      updated_at: new Date().toISOString(),
    });
    return {
      session: await inspectSession(updated.session_id),
      revision: committed.revision,
      html_manifest: htmlManifest,
      capture_plan: capturePlan,
      workflow: await workflowEngine.inspect(commitProjectRef),
    };
  }

  async function completeCaptureAndOpenApproval(payload) {
    const session = await loadSession(payload.session_id);
    if (session.status !== "capture_planned") {
      fail(
        "STUDIO_CAPTURE_NOT_PLANNED",
        "capture_planned 상태의 Studio session이 필요합니다.",
      );
    }
    const committedRevisionArtifact =
      session.committed_artifacts.find(
        (artifact) =>
          artifact.type === "studio.committed_revision",
      );
    await verifyBrowserCaptureHeroAssurance({
      projectRoot: root,
      revisionArtifact: committedRevisionArtifact,
    });
    const capture = await completeBrowserCaptureWorkOrder({
      planned: session.capture_plan,
      observedExecution: payload.observed_execution,
    });
    const definition = assertRubricDefinition(
      session.rubric_definition,
    );
    if (
      payload.rubric_result?.subject?.artifact_id !==
        session.revision.artifact_id ||
      payload.rubric_result?.subject?.manifest_sha256 !==
        session.revision.commit_sha256
    ) {
      fail(
        "STUDIO_POSTCOMMIT_RUBRIC_SUBJECT_MISMATCH",
        "post-commit rubric이 exact immutable revision을 평가하지 않았습니다.",
      );
    }
    const requiredCaptureIds =
      capture.output_artifacts[0].member_ids;
    const actualCaptureIds = [
      ...new Set(payload.rubric_result?.viewport_capture_ids ?? []),
    ].sort();
    if (
      canonicalSha256(actualCaptureIds) !==
      canonicalSha256([...requiredCaptureIds].sort())
    ) {
      fail(
        "STUDIO_RUBRIC_CAPTURE_SET_MISMATCH",
        "rubric result가 exact 320@1x·360@1x·390@2x capture set을 사용하지 않았습니다.",
      );
    }
    const graphBoundRubric = bindRubricEvidenceToCommittedGraph(
      payload.rubric_result,
      session.committed_artifacts,
    );
    const verifiedRubric = assertRubricResult(
      graphBoundRubric,
      definition,
    );
    const delta = createRubricDelta(
      session.immutable_baseline_rubric_result,
      verifiedRubric,
      definition,
    );
    const hashes = await adapterHashes();
    const validatorProjectRef = await projectRefFor(
      session.validator_session_id,
    );
    const coordinatorProjectRef = await projectRefFor(
      "studio-v1-g4-coordinator",
    );
    const recordRepairLoop = () =>
      workflowEngine.recordRubricIteration(
        coordinatorProjectRef,
        {
          evaluator_agent_session_id:
            session.validator_session_id,
          rubric_result: verifiedRubric,
          budget: payload.budget ?? { state: "AVAILABLE" },
          scope_kind: payload.scope_kind ?? "full_page",
        },
      );
    let postcommit;
    try {
      postcommit = assertPublishQuality(
        verifiedRubric,
        definition,
        "post-commit",
      );
    } catch (error) {
      if (
        !(error instanceof StudioG4PipelineError) ||
        error.code !== "STUDIO_RUBRIC_GATE_BLOCKED"
      ) {
        throw error;
      }
      const repairLoop = await recordRepairLoop();
      if (repairLoop.kind === "RubricPublishReady") {
        throw error;
      }
      const updated = await saveSession({
        ...sessionBody(session),
        status:
          repairLoop.kind === "RubricRepairScheduled"
            ? "repair_required"
            : "awaiting_rubric_user",
        capture_artifact: capture.output_artifacts[0],
        capture_execution_receipt: capture.execution_receipt,
        rubric_result: verifiedRubric,
        rubric_delta: delta,
        repair_loop: repairLoop,
        updated_at: new Date().toISOString(),
      });
      return {
        session: await inspectSession(updated.session_id),
        capture_artifact: capture.output_artifacts[0],
        rubric_result: verifiedRubric,
        rubric_delta: delta,
        repair_loop: repairLoop,
        challenge: null,
        workflow: await workflowEngine.inspect(
          coordinatorProjectRef,
        ),
      };
    }
    const workOrder = await workflowEngine.lease(
      validatorProjectRef,
      { stage_ids: ["G4Q_RUBRIC"] },
    );
    if (!workOrder) {
      fail(
        "STUDIO_RUBRIC_LEASE_UNAVAILABLE",
        "G4Q_RUBRIC lease를 얻지 못했습니다.",
      );
    }
    const rubricArtifact = {
      artifact_id: postcommit.result.result_id,
      type: "qa.rubric_result",
      manifest_sha256: canonicalSha256(postcommit.result),
      member_ids: ["rubric-result.json"],
      rubric_result: postcommit.result,
    };
    const deltaArtifact = {
      artifact_id: delta.delta_id,
      type: "qa.rubric_delta",
      manifest_sha256: canonicalSha256(delta),
      member_ids: ["rubric-delta.json"],
      rubric_delta: delta,
    };
    const outputArtifacts = [
      capture.output_artifacts[0],
      rubricArtifact,
      deltaArtifact,
    ];
    const validationReceipt = buildValidationReceipt({
      subjectArtifactSetDigest: workOrder.input_set_digest,
      subjectArtifactIds: workOrder.input_artifacts.map(
        (artifact) => artifact.artifact_id,
      ),
      validatorSessionId: session.validator_session_id,
      producerSessionIds: workOrder.input_artifacts.map(
        (artifact) => artifact.producer_agent_session_id,
      ),
      policyId: workOrder.gate_policy_id,
      policySha256: definition.policy.sha256,
      evidenceArtifactIds: outputArtifacts.map(
        (artifact) => artifact.artifact_id,
      ),
      score: postcommit.result.score,
      metrics: postcommit.metrics,
      validatorCodeSha256: hashes.browserCapture,
      validationIdPrefix: "validation-studio-postcommit",
    });
    await workflowEngine.submit(
      workOrder.work_order_id,
      resultEnvelope({
        projectRef: validatorProjectRef,
        workOrder,
        outputArtifacts,
        adapterCodeSha256: hashes.browserCapture,
        validationReceipt,
      }),
    );
    const repairLoop = await recordRepairLoop();
    if (repairLoop.kind !== "RubricPublishReady") {
      fail(
        "RUBRIC_LOOP_GATE_DIVERGENCE",
        "G4Q publish quality와 persistent rubric transition이 서로 다릅니다.",
        409,
        { repair_loop_kind: repairLoop.kind },
      );
    }
    const approval = await workflowEngine.advance(
      coordinatorProjectRef,
      { until: "next_user_gate" },
    );
    const workflowAfterApproval = await workflowEngine.inspect(
      coordinatorProjectRef,
    );
    const manualApprovalOpened =
      approval.kind === "AwaitUser" &&
      approval.stage_id === "G4U_APPROVAL";
    const planOnceAutoApproved =
      workflowAfterApproval?.stages?.G4U_APPROVAL?.status ===
      "approved";
    if (!manualApprovalOpened && !planOnceAutoApproved) {
      fail(
        "G4_APPROVAL_CHALLENGE_NOT_OPENED",
        "post-commit QA 뒤 G4U approval 또는 plan-once 자동 승인이 확인되지 않았습니다.",
      );
    }
    const updated = await saveSession({
      ...sessionBody(session),
      status: planOnceAutoApproved
        ? "g4_approved"
        : "awaiting_g4_approval",
      capture_artifact: capture.output_artifacts[0],
      capture_execution_receipt: capture.execution_receipt,
      rubric_result: postcommit.result,
      rubric_delta: delta,
      g4_validation_receipt: validationReceipt,
      repair_loop: repairLoop,
      challenge: manualApprovalOpened
        ? approval.challenge
        : null,
      updated_at: new Date().toISOString(),
    });
    return {
      session: await inspectSession(updated.session_id),
      capture_artifact: capture.output_artifacts[0],
      rubric_result: postcommit.result,
      rubric_delta: delta,
      validation_receipt: validationReceipt,
      repair_loop: repairLoop,
      challenge: manualApprovalOpened
        ? approval.challenge
        : null,
      workflow: workflowAfterApproval,
    };
  }

  return Object.freeze({
    importWorking,
    saveWorking,
    commitAndPlanCapture,
    completeCaptureAndOpenApproval,
    inspectSession,
    readWorkingForEditor,
    latestWorkingSession,
  });
}
