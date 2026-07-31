import { createHash } from "node:crypto";

import { ARTIFACT_EDGE_RELATIONS } from "./artifact-graph.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const REVISION_CHANGE_KINDS = Object.freeze({
  ACTUAL_PRODUCT_PHOTO_SET_REVISION:
    "actual_product_photo_set_revision",
  MARKET_CANDIDATE_SET_REVISION:
    "market_candidate_set_revision",
  PRODUCTION_PLAN_PROVENANCE_CORRECTION:
    "production_plan_provenance_correction",
  G2_IMAGE_MEMBER_REJECTION: "g2_image_member_rejection",
  G3_GIF_MEMBER_REJECTION: "g3_gif_member_rejection",
});

const MEMBER_REJECTION_CONTRACTS = Object.freeze({
  [REVISION_CHANGE_KINDS.G2_IMAGE_MEMBER_REJECTION]: Object.freeze({
    artifact_types: Object.freeze([
      "media.image_candidate_set",
      "media.image_approved",
    ]),
    gate_stage_id: "G2U_APPROVAL",
    required_reset_stages: Object.freeze([
      "G2A_IMAGE",
      "G2Q_QA",
      "G2U_APPROVAL",
    ]),
  }),
  [REVISION_CHANGE_KINDS.G3_GIF_MEMBER_REJECTION]: Object.freeze({
    artifact_types: Object.freeze([
      "media.gif_candidate",
      "media.gif_approved",
    ]),
    gate_stage_id: "G3U_APPROVAL",
    required_reset_stages: Object.freeze([
      "G3R_RENDER",
      "G3Q_QA",
      "G3U_APPROVAL",
    ]),
  }),
});

const TYPE_RESET_PROFILES = Object.freeze({
  "media.image_candidate_set": Object.freeze([
    "G2A_IMAGE",
    "G2Q_QA",
    "G2U_APPROVAL",
  ]),
  "media.image_approved": Object.freeze([
    "G2A_IMAGE",
    "G2Q_QA",
    "G2U_APPROVAL",
  ]),
  "media.gif_candidate": Object.freeze([
    "G3R_RENDER",
    "G3Q_QA",
    "G3U_APPROVAL",
  ]),
  "media.gif_approved": Object.freeze([
    "G3R_RENDER",
    "G3Q_QA",
    "G3U_APPROVAL",
  ]),
});

export class RevisionImpactError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RevisionImpactError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new RevisionImpactError(code, message, details);
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

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function revisionImpactDigest(value) {
  return createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex");
}

function assertObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_REVISION_IMPACT_INPUT", `${field} must be an object.`, {
      field,
    });
  }
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(
      "INVALID_REVISION_IMPACT_INPUT",
      `${field} must be a non-empty string.`,
      { field },
    );
  }
}

function assertSha256(value, field) {
  if (!SHA256_PATTERN.test(String(value ?? ""))) {
    fail("INVALID_REVISION_IMPACT_HASH", `${field} must be a SHA-256.`, {
      field,
    });
  }
}

function normalizedArtifactType(artifact) {
  return String(artifact?.type ?? artifact?.artifact_type ?? "");
}

function normalizedMemberHash(member) {
  return String(
    member?.member_sha256 ??
      member?.sha256 ??
      member?.object_sha256 ??
      member?.manifest_sha256 ??
      "",
  );
}

function normalizeMembers(artifact, artifactId) {
  const memberIds = artifact.member_ids ?? [];
  if (!Array.isArray(memberIds)) {
    fail(
      "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
      "artifact.member_ids must be an array.",
      { artifact_id: artifactId },
    );
  }

  const declaredIds = memberIds.map(String);
  if (new Set(declaredIds).size !== declaredIds.length) {
    fail(
      "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
      "artifact.member_ids contains a duplicate.",
      { artifact_id: artifactId },
    );
  }

  const rawMembers = artifact.members ?? artifact.member_records ?? [];
  if (!Array.isArray(rawMembers)) {
    fail(
      "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
      "artifact.members must be an array.",
      { artifact_id: artifactId },
    );
  }

  const members = new Map();
  for (const rawMember of rawMembers) {
    const memberId = String(rawMember?.member_id ?? "");
    assertNonEmptyString(
      memberId,
      `artifacts[${artifactId}].members[].member_id`,
    );
    const memberSha256 = normalizedMemberHash(rawMember);
    assertSha256(
      memberSha256,
      `artifacts[${artifactId}].members[${memberId}].member_sha256`,
    );
    if (members.has(memberId)) {
      fail(
        "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
        "artifact.members contains a duplicate member_id.",
        { artifact_id: artifactId, member_id: memberId },
      );
    }
    members.set(memberId, {
      member_id: memberId,
      member_sha256: memberSha256,
    });
  }

  const memberHashes =
    artifact.member_hashes ?? artifact.member_sha256_by_id ?? {};
  if (
    memberHashes === null ||
    typeof memberHashes !== "object" ||
    Array.isArray(memberHashes)
  ) {
    fail(
      "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
      "artifact.member_hashes must be an object.",
      { artifact_id: artifactId },
    );
  }
  for (const [memberId, hash] of Object.entries(memberHashes)) {
    assertSha256(
      hash,
      `artifacts[${artifactId}].member_hashes[${memberId}]`,
    );
    const existing = members.get(memberId);
    if (existing && existing.member_sha256 !== hash) {
      fail(
        "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
        "member hash declarations conflict.",
        { artifact_id: artifactId, member_id: memberId },
      );
    }
    members.set(memberId, {
      member_id: memberId,
      member_sha256: String(hash),
    });
  }

  if (
    declaredIds.length > 0 &&
    members.size > 0 &&
    (declaredIds.length !== members.size ||
      declaredIds.some((memberId) => !members.has(memberId)))
  ) {
    fail(
      "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
      "member_ids and hashed member records do not describe the same set.",
      { artifact_id: artifactId },
    );
  }

  return {
    member_ids:
      declaredIds.length > 0
        ? [...declaredIds].sort()
        : [...members.keys()].sort(),
    members,
  };
}

function normalizeArtifacts(snapshot) {
  if (!Array.isArray(snapshot.artifacts)) {
    fail(
      "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
      "graphSnapshot.artifacts must be an array.",
    );
  }

  const artifacts = new Map();
  for (const source of snapshot.artifacts) {
    assertObject(source, "graphSnapshot.artifacts[]");
    const artifactId = String(source.artifact_id ?? "");
    const type = normalizedArtifactType(source);
    assertNonEmptyString(artifactId, "artifact.artifact_id");
    assertNonEmptyString(type, `artifacts[${artifactId}].type`);
    assertSha256(
      source.manifest_sha256,
      `artifacts[${artifactId}].manifest_sha256`,
    );
    if (artifacts.has(artifactId)) {
      fail(
        "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
        "artifact_id must be unique.",
        { artifact_id: artifactId },
      );
    }
    const normalizedMembers = normalizeMembers(source, artifactId);
    artifacts.set(artifactId, {
      artifact_id: artifactId,
      type,
      manifest_sha256: String(source.manifest_sha256),
      status: String(source.status ?? "fresh"),
      producer_stage_id:
        source.producer_stage_id ??
        source.producer?.stage_id ??
        source.stage_id ??
        null,
      protected: source.protected === true,
      ...normalizedMembers,
      source,
    });
  }
  return artifacts;
}

function assertMemberReference({
  artifact,
  memberId,
  memberSha256,
  edgeIndex,
  endpoint,
}) {
  const member = artifact.members.get(memberId);
  if (!member) {
    fail(
      "FORGED_MEMBER_EDGE",
      `${endpoint} member is absent from its artifact.`,
      {
        edge_index: edgeIndex,
        artifact_id: artifact.artifact_id,
        member_id: memberId,
      },
    );
  }
  assertSha256(
    memberSha256,
    `graphSnapshot.edges[${edgeIndex}].${endpoint}_member_sha256`,
  );
  if (member.member_sha256 !== memberSha256) {
    fail(
      "FORGED_MEMBER_EDGE",
      `${endpoint} member hash does not match its artifact.`,
      {
        edge_index: edgeIndex,
        artifact_id: artifact.artifact_id,
        member_id: memberId,
      },
    );
  }
}

function normalizeEdges(snapshot, artifacts) {
  if (!Array.isArray(snapshot.edges)) {
    fail(
      "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
      "graphSnapshot.edges must be an array.",
    );
  }

  const edges = [];
  const edgeKeys = new Set();
  snapshot.edges.forEach((source, edgeIndex) => {
    assertObject(source, `graphSnapshot.edges[${edgeIndex}]`);
    const from = String(source.from ?? "");
    const to = String(source.to ?? "");
    const relation = String(source.relation ?? "");
    const fromArtifact = artifacts.get(from);
    const toArtifact = artifacts.get(to);
    if (!fromArtifact || !toArtifact) {
      fail(
        "FORGED_ARTIFACT_EDGE",
        "artifact edge endpoint is absent from the snapshot.",
        { edge_index: edgeIndex, from, to },
      );
    }
    if (!ARTIFACT_EDGE_RELATIONS.includes(relation)) {
      fail(
        "FORGED_ARTIFACT_EDGE",
        "artifact edge relation is not allowed.",
        { edge_index: edgeIndex, relation },
      );
    }
    if (
      source.from_manifest_sha256 !== undefined &&
      source.from_manifest_sha256 !== fromArtifact.manifest_sha256
    ) {
      fail(
        "FORGED_ARTIFACT_EDGE",
        "from artifact hash does not match the snapshot.",
        { edge_index: edgeIndex, artifact_id: from },
      );
    }
    if (
      source.to_manifest_sha256 !== undefined &&
      source.to_manifest_sha256 !== toArtifact.manifest_sha256
    ) {
      fail(
        "FORGED_ARTIFACT_EDGE",
        "to artifact hash does not match the snapshot.",
        { edge_index: edgeIndex, artifact_id: to },
      );
    }

    const fromMemberId =
      source.from_member_id === undefined
        ? null
        : String(source.from_member_id);
    const toMemberId =
      source.to_member_id === undefined
        ? null
        : String(source.to_member_id);
    if (
      fromMemberId === null &&
      source.from_member_sha256 !== undefined
    ) {
      fail(
        "FORGED_MEMBER_EDGE",
        "from_member_sha256 requires from_member_id.",
        { edge_index: edgeIndex },
      );
    }
    if (toMemberId === null && source.to_member_sha256 !== undefined) {
      fail(
        "FORGED_MEMBER_EDGE",
        "to_member_sha256 requires to_member_id.",
        { edge_index: edgeIndex },
      );
    }
    if (fromMemberId !== null) {
      assertMemberReference({
        artifact: fromArtifact,
        memberId: fromMemberId,
        memberSha256: source.from_member_sha256,
        edgeIndex,
        endpoint: "from",
      });
    }
    if (toMemberId !== null) {
      assertMemberReference({
        artifact: toArtifact,
        memberId: toMemberId,
        memberSha256: source.to_member_sha256,
        edgeIndex,
        endpoint: "to",
      });
    }

    const edge = {
      from,
      to,
      relation,
      from_member_id: fromMemberId,
      from_member_sha256:
        fromMemberId === null ? null : String(source.from_member_sha256),
      to_member_id: toMemberId,
      to_member_sha256:
        toMemberId === null ? null : String(source.to_member_sha256),
    };
    const edgeKey = canonicalJson(edge);
    if (edgeKeys.has(edgeKey)) {
      fail(
        "INVALID_ARTIFACT_GRAPH_SNAPSHOT",
        "duplicate artifact edge is not allowed.",
        { edge_index: edgeIndex },
      );
    }
    edgeKeys.add(edgeKey);
    edges.push(edge);
  });
  return edges;
}

function normalizeWorkflow(workflowDefinition) {
  assertObject(workflowDefinition, "workflowDefinition");
  if (!Array.isArray(workflowDefinition.stages)) {
    fail(
      "INVALID_WORKFLOW_DEFINITION",
      "workflowDefinition.stages must be an array.",
    );
  }

  const stages = new Map();
  const producerIdsByType = new Map();
  workflowDefinition.stages.forEach((source, index) => {
    const stageId = String(source?.stage_id ?? "");
    assertNonEmptyString(
      stageId,
      `workflowDefinition.stages[${index}].stage_id`,
    );
    if (stages.has(stageId)) {
      fail(
        "INVALID_WORKFLOW_DEFINITION",
        "workflow stage_id must be unique.",
        { stage_id: stageId },
      );
    }
    if (!Array.isArray(source.produces)) {
      fail(
        "INVALID_WORKFLOW_DEFINITION",
        "workflow stage produces must be an array.",
        { stage_id: stageId },
      );
    }
    const stage = {
      stage_id: stageId,
      produces: source.produces.map(String),
      user_gate: source.user_gate === true,
      order: index,
    };
    stages.set(stageId, stage);
    for (const type of stage.produces) {
      const producerIds = producerIdsByType.get(type) ?? [];
      producerIds.push(stageId);
      producerIdsByType.set(type, producerIds);
    }
  });
  return { stages, producerIdsByType };
}

function findMember(artifact, memberId, memberSha256) {
  const member = artifact.members.get(String(memberId ?? ""));
  if (!member || member.member_sha256 !== memberSha256) {
    fail(
      "CHANGE_ROOT_MISMATCH",
      "old member id/hash does not match the graph snapshot.",
      {
        artifact_id: artifact.artifact_id,
        member_id: memberId ?? null,
      },
    );
  }
  return member;
}

function validateOldArtifactRef(artifacts, oldArtifact) {
  assertObject(oldArtifact, "changeRequest.old_artifact");
  const artifact = artifacts.get(String(oldArtifact.artifact_id ?? ""));
  if (
    !artifact ||
    artifact.manifest_sha256 !== oldArtifact.manifest_sha256
  ) {
    fail(
      "CHANGE_ROOT_MISMATCH",
      "old artifact id/hash does not match the graph snapshot.",
      { artifact_id: oldArtifact.artifact_id ?? null },
    );
  }
  if (artifact.status === "stale") {
    fail(
      "STALE_CHANGE_ROOT",
      "a stale artifact cannot be used as a new revision root.",
      { artifact_id: artifact.artifact_id },
    );
  }
  return artifact;
}

function receiptBody(receipt) {
  return Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "receipt_sha256"),
  );
}

function validatePhotoProvenanceReceipt({
  receipt,
  kind,
  artifactId,
  manifestSha256,
  members,
  materializedMembers,
}) {
  assertObject(
    receipt,
    `changeRequest.new_artifact.${kind}_provenance`,
  );
  assertNonEmptyString(
    receipt.receipt_id,
    `changeRequest.new_artifact.${kind}_provenance.receipt_id`,
  );
  const expectedType = `photo_revision.${kind}_provenance`;
  if (receipt.receipt_type !== expectedType) {
    fail(
      "INVALID_PHOTO_PROVENANCE",
      `${kind} provenance receipt_type is invalid.`,
      { expected: expectedType, actual: receipt.receipt_type ?? null },
    );
  }
  const expectedSubject = {
    artifact_id: artifactId,
    manifest_sha256: manifestSha256,
    members: [...members.values()].sort((left, right) =>
      left.member_id.localeCompare(right.member_id),
    ),
  };
  const receivedSubject = structuredClone(receipt.subject);
  if (Array.isArray(receivedSubject?.members)) {
    receivedSubject.members.sort((left, right) =>
      String(left?.member_id ?? "").localeCompare(
        String(right?.member_id ?? ""),
      ),
    );
  }
  if (
    canonicalJson(receivedSubject) !== canonicalJson(expectedSubject)
  ) {
    fail(
      "PHOTO_PROVENANCE_SUBJECT_MISMATCH",
      `${kind} provenance does not bind the exact photo artifact members.`,
      { artifact_id: artifactId },
    );
  }
  assertObject(
    receipt.evidence,
    `changeRequest.new_artifact.${kind}_provenance.evidence`,
  );
  assertNonEmptyString(
    receipt.evidence.locator,
    `changeRequest.new_artifact.${kind}_provenance.evidence.locator`,
  );
  assertSha256(
    receipt.evidence.sha256,
    `changeRequest.new_artifact.${kind}_provenance.evidence.sha256`,
  );
  if (
    !materializedMembers.some(
      (member) =>
        member.locator === receipt.evidence.locator &&
        member.sha256 === receipt.evidence.sha256,
    )
  ) {
    fail(
      "PHOTO_PROVENANCE_EVIDENCE_MISMATCH",
      `${kind} provenance evidence locator/hash is not an exact input/product photo member.`,
      { artifact_id: artifactId },
    );
  }
  if (kind === "rights") {
    const allowed = {
      identity_reference: false,
      production_licensed: true,
    };
    if (
      !(receipt.classification in allowed) ||
      receipt.production_use_allowed !==
        allowed[receipt.classification]
    ) {
      fail(
        "INVALID_PHOTO_RIGHTS_PROVENANCE",
        "photo rights classification and production use flag conflict.",
        { artifact_id: artifactId },
      );
    }
  } else if (receipt.decision !== "verified") {
    fail(
      "INVALID_PHOTO_IDENTITY_PROVENANCE",
      "photo identity provenance must be verified.",
      { artifact_id: artifactId },
    );
  }
  assertSha256(
    receipt.receipt_sha256,
    `changeRequest.new_artifact.${kind}_provenance.receipt_sha256`,
  );
  if (
    receipt.receipt_sha256 !==
    revisionImpactDigest(receiptBody(receipt))
  ) {
    fail(
      "FORGED_PHOTO_PROVENANCE",
      `${kind} provenance receipt digest is invalid.`,
      { artifact_id: artifactId },
    );
  }
}

function validatePhotoMemberManifest(newArtifact, normalizedMembers) {
  const manifest = newArtifact.member_manifest;
  if (
    !manifest ||
    manifest.schema_version !== "1.0" ||
    manifest.policy !== "materialized" ||
    !Array.isArray(manifest.members) ||
    manifest.members.length !== normalizedMembers.members.size
  ) {
    fail(
      "PHOTO_MEMBER_MANIFEST_REQUIRED",
      "new photo-set revision requires a materialized member_manifest.",
      { artifact_id: newArtifact.artifact_id },
    );
  }
  const seen = new Set();
  for (const member of manifest.members) {
    const memberId = String(member?.member_id ?? "");
    const expected = normalizedMembers.members.get(memberId);
    if (
      !expected ||
      seen.has(memberId) ||
      member?.root_id !== "project" ||
      typeof member?.locator !== "string" ||
      !member.locator ||
      member.locator.includes("\\") ||
      member.locator.split("/").some(
        (part) => !part || part === "." || part === "..",
      ) ||
      member.sha256 !== expected.member_sha256 ||
      !Number.isSafeInteger(member.size_bytes) ||
      member.size_bytes < 1
    ) {
      fail(
        "INVALID_PHOTO_MEMBER_MANIFEST",
        "photo member manifest must bind every member to immutable project bytes.",
        {
          artifact_id: newArtifact.artifact_id,
          member_id: memberId || null,
        },
      );
    }
    if (!member.locator.startsWith("input/product/")) {
      fail(
        "PHOTO_MEMBER_OUTSIDE_INPUT_PRODUCT",
        "actual product photo members must be regular files below input/product/.",
        {
          artifact_id: newArtifact.artifact_id,
          member_id: memberId,
          locator: member.locator,
        },
      );
    }
    seen.add(memberId);
  }
  if (
    [...normalizedMembers.members.keys()].some(
      (memberId) => !seen.has(memberId),
    )
  ) {
    fail(
      "INVALID_PHOTO_MEMBER_MANIFEST",
      "photo member manifest is not an exact member set.",
      { artifact_id: newArtifact.artifact_id },
    );
  }
}

function validateRejectionReceipt({
  receipt,
  changeKind,
  contract,
  artifact,
  member,
}) {
  assertObject(receipt, "changeRequest.rejection_receipt");
  assertNonEmptyString(
    receipt.receipt_id,
    "changeRequest.rejection_receipt.receipt_id",
  );
  if (
    receipt.receipt_type !== "revision.member_rejection" ||
    receipt.change_kind !== changeKind ||
    receipt.decision !== "REJECTED" ||
    receipt.gate_stage_id !== contract.gate_stage_id
  ) {
    fail(
      "INVALID_REJECTION_RECEIPT",
      "rejection receipt contract does not match the requested gate.",
      { receipt_id: receipt.receipt_id ?? null },
    );
  }
  assertObject(
    receipt.subject,
    "changeRequest.rejection_receipt.subject",
  );
  const subject = receipt.subject;
  if (
    subject.artifact_id !== artifact.artifact_id ||
    subject.manifest_sha256 !== artifact.manifest_sha256 ||
    subject.member_id !== member.member_id ||
    subject.member_sha256 !== member.member_sha256
  ) {
    fail(
      "INVALID_REJECTION_RECEIPT",
      "rejection receipt subject is not the exact old member.",
      { receipt_id: receipt.receipt_id },
    );
  }
  assertSha256(
    receipt.receipt_sha256,
    "changeRequest.rejection_receipt.receipt_sha256",
  );
  const expectedDigest = revisionImpactDigest(receiptBody(receipt));
  if (receipt.receipt_sha256 !== expectedDigest) {
    fail(
      "FORGED_REJECTION_RECEIPT",
      "rejection receipt digest is invalid.",
      { receipt_id: receipt.receipt_id },
    );
  }
}

function validateNewPhotoArtifact({
  newArtifact,
  oldArtifact,
  artifacts,
}) {
  assertObject(newArtifact, "changeRequest.new_artifact");
  const artifactId = String(newArtifact.artifact_id ?? "");
  const type = normalizedArtifactType(newArtifact);
  assertNonEmptyString(artifactId, "changeRequest.new_artifact.artifact_id");
  assertSha256(
    newArtifact.manifest_sha256,
    "changeRequest.new_artifact.manifest_sha256",
  );
  if (artifactId === oldArtifact.artifact_id || artifacts.has(artifactId)) {
    fail(
      "INVALID_PHOTO_SET_REVISION",
      "new photo-set revision must use a new artifact_id.",
      { artifact_id: artifactId },
    );
  }
  if (
    type !== "identity.photo_set" ||
    type !== oldArtifact.type ||
    newArtifact.manifest_sha256 === oldArtifact.manifest_sha256
  ) {
    fail(
      "INVALID_PHOTO_SET_REVISION",
      "new photo-set revision must have the same type and a new hash.",
      { artifact_id: artifactId, type },
    );
  }
  assertObject(
    newArtifact.revision_of,
    "changeRequest.new_artifact.revision_of",
  );
  if (
    newArtifact.revision_of.artifact_id !== oldArtifact.artifact_id ||
    newArtifact.revision_of.manifest_sha256 !==
      oldArtifact.manifest_sha256
  ) {
    fail(
      "INVALID_PHOTO_SET_REVISION",
      "revision_of must pin the exact old photo-set artifact.",
      { artifact_id: artifactId },
    );
  }

  const normalizedMembers = normalizeMembers(newArtifact, artifactId);
  if (
    !Array.isArray(newArtifact.member_ids) ||
    newArtifact.member_ids.length === 0 ||
    normalizedMembers.members.size === 0
  ) {
    fail(
      "INVALID_PHOTO_SET_REVISION",
      "new photo-set revision must contain hashed members.",
      { artifact_id: artifactId },
    );
  }
  validatePhotoMemberManifest(newArtifact, normalizedMembers);
  assertNonEmptyString(
    newArtifact.producer_agent_session_id,
    "changeRequest.new_artifact.producer_agent_session_id",
  );
  validatePhotoProvenanceReceipt({
    receipt: newArtifact.rights_provenance,
    kind: "rights",
    artifactId,
    manifestSha256: String(newArtifact.manifest_sha256),
    members: normalizedMembers.members,
    materializedMembers: newArtifact.member_manifest.members,
  });
  validatePhotoProvenanceReceipt({
    receipt: newArtifact.identity_provenance,
    kind: "identity",
    artifactId,
    manifestSha256: String(newArtifact.manifest_sha256),
    members: normalizedMembers.members,
    materializedMembers: newArtifact.member_manifest.members,
  });
  return {
    artifact_id: artifactId,
    manifest_sha256: String(newArtifact.manifest_sha256),
    type,
  };
}

function isCoreProtectedArtifact(artifact, changeKind) {
  const { type } = artifact;
  if (
    changeKind ===
      REVISION_CHANGE_KINDS.MARKET_CANDIDATE_SET_REVISION &&
    (type.startsWith("market.") ||
      type === "evidence.market_snapshot")
  ) {
    return false;
  }
  if (
    changeKind ===
      REVISION_CHANGE_KINDS.ACTUAL_PRODUCT_PHOTO_SET_REVISION &&
    [
      "product.ssot",
      "decision.ssot_approval",
      "decision.plan_approval",
      "decision.image_config_approval",
    ].includes(type)
  ) {
    return false;
  }
  return (
    artifact.protected ||
    type === "product.ssot" ||
    type === "decision.ssot_approval" ||
    type === "decision.plan_approval" ||
    type === "decision.image_config_approval" ||
    type === "evidence.market_snapshot" ||
    type.startsWith("market.") ||
    type.startsWith("knowledge.")
  );
}

function producerStageId(artifact, workflow) {
  if (artifact.producer_stage_id) {
    const stage = workflow.stages.get(String(artifact.producer_stage_id));
    if (!stage) {
      fail(
        "UNKNOWN_ARTIFACT_PRODUCER",
        "artifact producer stage is absent from the workflow.",
        {
          artifact_id: artifact.artifact_id,
          producer_stage_id: artifact.producer_stage_id,
        },
      );
    }
    if (!stage.produces.includes(artifact.type)) {
      fail(
        "FORGED_ARTIFACT_PRODUCER",
        "artifact producer does not produce the artifact type.",
        {
          artifact_id: artifact.artifact_id,
          artifact_type: artifact.type,
          producer_stage_id: stage.stage_id,
        },
      );
    }
    return stage.stage_id;
  }

  const candidates = workflow.producerIdsByType.get(artifact.type) ?? [];
  if (candidates.length !== 1) {
    fail(
      "AMBIGUOUS_ARTIFACT_PRODUCER",
      "impacted artifact must identify its producer when the type is ambiguous.",
      {
        artifact_id: artifact.artifact_id,
        artifact_type: artifact.type,
        producer_stage_ids: [...candidates],
      },
    );
  }
  return candidates[0];
}

function addResetProfile(resetStages, type, workflow) {
  for (const stageId of TYPE_RESET_PROFILES[type] ?? []) {
    if (!workflow.stages.has(stageId)) {
      fail(
        "INVALID_WORKFLOW_DEFINITION",
        "required repair stage is absent from the workflow.",
        { stage_id: stageId, artifact_type: type },
      );
    }
    resetStages.add(stageId);
  }
}

function memberLocator(reference) {
  return `${reference.artifact_id}#${reference.member_id}`;
}

function sortedMemberRefs(references) {
  return [...references.values()].sort(
    (left, right) =>
      left.artifact_id.localeCompare(right.artifact_id) ||
      left.member_id.localeCompare(right.member_id),
  );
}

function buildChangeRoot({
  artifacts,
  changeRequest,
  changeKind,
}) {
  const oldArtifact = validateOldArtifactRef(
    artifacts,
    changeRequest.old_artifact,
  );
  if (
    changeKind ===
    REVISION_CHANGE_KINDS.ACTUAL_PRODUCT_PHOTO_SET_REVISION
  ) {
    if (oldArtifact.type !== "identity.photo_set") {
      fail(
        "INVALID_CHANGE_ROOT_TYPE",
        "actual product photo revision requires identity.photo_set.",
        { artifact_type: oldArtifact.type },
      );
    }
    const replacement = validateNewPhotoArtifact({
      newArtifact: changeRequest.new_artifact,
      oldArtifact,
      artifacts,
    });
    return {
      oldArtifact,
      member: null,
      root: {
        root_kind: "artifact_revision",
        old_artifact_id: oldArtifact.artifact_id,
        old_manifest_sha256: oldArtifact.manifest_sha256,
        new_artifact_id: replacement.artifact_id,
        new_manifest_sha256: replacement.manifest_sha256,
      },
      requiredResetStages: [
        "G0C_NORMALIZE",
        "G0Q_QA",
        "G0U_APPROVAL",
      ],
    };
  }
  if (
    changeKind ===
    REVISION_CHANGE_KINDS.MARKET_CANDIDATE_SET_REVISION
  ) {
    if (oldArtifact.type !== "market.competitor_candidates") {
      fail(
        "INVALID_CHANGE_ROOT_TYPE",
        "market candidate revision requires market.competitor_candidates.",
        { artifact_type: oldArtifact.type },
      );
    }
    const replacementCandidateIds =
      changeRequest.replacement_candidate_ids;
    if (
      !Array.isArray(replacementCandidateIds) ||
      replacementCandidateIds.length === 0 ||
      replacementCandidateIds.some(
        (candidateId) =>
          typeof candidateId !== "string" ||
          candidateId.trim() === "",
      ) ||
      new Set(replacementCandidateIds).size !==
        replacementCandidateIds.length
    ) {
      fail(
        "INVALID_MARKET_REPLACEMENT_SET",
        "market candidate revision requires unique replacement_candidate_ids.",
      );
    }
    const approval = changeRequest.approval_receipt;
    assertObject(
      approval,
      "changeRequest.approval_receipt",
    );
    if (
      approval.decision !== "APPROVED" ||
      typeof approval.decided_by !== "string" ||
      approval.decided_by.trim() === "" ||
      typeof approval.approval_channel !== "string" ||
      approval.approval_channel.trim() === "" ||
      approval.subject?.artifact_id !==
        oldArtifact.artifact_id ||
      approval.subject?.manifest_sha256 !==
        oldArtifact.manifest_sha256 ||
      canonicalJson(approval.replacement_candidate_ids) !==
        canonicalJson(replacementCandidateIds)
    ) {
      fail(
        "INVALID_MARKET_REPLACEMENT_APPROVAL",
        "market replacement approval must bind the old candidate set and exact replacement IDs.",
      );
    }
    return {
      oldArtifact,
      member: null,
      root: {
        root_kind: "market_candidate_set_revision",
        old_artifact_id: oldArtifact.artifact_id,
        old_manifest_sha256: oldArtifact.manifest_sha256,
        replacement_candidate_ids: [
          ...replacementCandidateIds,
        ],
        decided_by: approval.decided_by,
        approval_channel: approval.approval_channel,
      },
      requiredResetStages: [
        "G1D_DISCOVERY",
        "G1DQ_SELECTION",
        "G1A_MARKET",
        "G1C_PLAN",
        "G1Q_QA",
        "G1U_APPROVAL",
      ],
    };
  }
  if (
    changeKind ===
    REVISION_CHANGE_KINDS.PRODUCTION_PLAN_PROVENANCE_CORRECTION
  ) {
    if (oldArtifact.type !== "production.plan") {
      fail(
        "INVALID_CHANGE_ROOT_TYPE",
        "production plan provenance correction requires production.plan.",
        { artifact_type: oldArtifact.type },
      );
    }
    const qaFailure = changeRequest.qa_failure;
    assertObject(
      qaFailure,
      "changeRequest.qa_failure",
    );
    if (
      qaFailure.code !== "PLAN_RULE_SNAPSHOT_MISMATCH" ||
      qaFailure.path !== "provenance.applied_rules" ||
      typeof qaFailure.validator_session_id !== "string" ||
      qaFailure.validator_session_id.trim() === "" ||
      qaFailure.validator_session_id ===
        oldArtifact.producer_agent_session_id ||
      !SHA256_PATTERN.test(
        String(qaFailure.actual_manifest_sha256 ?? ""),
      ) ||
      !SHA256_PATTERN.test(
        String(qaFailure.expected_manifest_sha256 ?? ""),
      ) ||
      qaFailure.actual_manifest_sha256 ===
        qaFailure.expected_manifest_sha256
    ) {
      fail(
        "INVALID_PRODUCTION_PLAN_QA_FAILURE",
        "production plan provenance correction requires an independent exact KnowledgeSnapshot manifest mismatch finding.",
      );
    }
    return {
      oldArtifact,
      member: null,
      allowRootOnly: true,
      root: {
        root_kind: "production_plan_provenance_correction",
        old_artifact_id: oldArtifact.artifact_id,
        old_manifest_sha256: oldArtifact.manifest_sha256,
        qa_failure_code: qaFailure.code,
        qa_failure_path: qaFailure.path,
        validator_session_id: qaFailure.validator_session_id,
        actual_manifest_sha256:
          qaFailure.actual_manifest_sha256,
        expected_manifest_sha256:
          qaFailure.expected_manifest_sha256,
      },
      requiredResetStages: [
        "G1C_PLAN",
        "G1Q_QA",
        "G1U_APPROVAL",
      ],
    };
  }

  const contract = MEMBER_REJECTION_CONTRACTS[changeKind];
  if (!contract) {
    fail(
      "UNSUPPORTED_REVISION_CHANGE",
      "changeRequest.kind is not supported.",
      { kind: changeKind },
    );
  }
  if (!contract.artifact_types.includes(oldArtifact.type)) {
    fail(
      "INVALID_CHANGE_ROOT_TYPE",
      "member rejection artifact type does not match its gate.",
      {
        kind: changeKind,
        artifact_type: oldArtifact.type,
      },
    );
  }
  const member = findMember(
    oldArtifact,
    changeRequest.old_artifact.member_id,
    changeRequest.old_artifact.member_sha256,
  );
  validateRejectionReceipt({
    receipt: changeRequest.rejection_receipt,
    changeKind,
    contract,
    artifact: oldArtifact,
    member,
  });
  return {
    oldArtifact,
    member,
    root: {
      root_kind: "member_rejection",
      artifact_id: oldArtifact.artifact_id,
      manifest_sha256: oldArtifact.manifest_sha256,
      member_id: member.member_id,
      member_sha256: member.member_sha256,
      rejection_receipt_id:
        changeRequest.rejection_receipt.receipt_id,
      rejection_receipt_sha256:
        changeRequest.rejection_receipt.receipt_sha256,
    },
    requiredResetStages: [...contract.required_reset_stages],
  };
}

function selectOutgoingEdges(outgoing, memberId, expandedAt) {
  if (memberId === null) return outgoing;
  const exact = outgoing.filter(
    (edge) => edge.from_member_id === memberId,
  );
  const artifactLevel = outgoing.filter(
    (edge) => edge.from_member_id === null,
  );
  if (artifactLevel.length > 0) expandedAt.add(outgoing[0]?.from);
  return [...exact, ...artifactLevel];
}

/**
 * Computes a deterministic, read-only RevisionImpactPlan.
 *
 * Member-aware edges extend the ArtifactGraph snapshot edge with:
 *   from_member_id, from_member_sha256, to_member_id, to_member_sha256.
 * Missing member provenance falls back only to explicit artifact-level edges.
 */
export function createRevisionImpactPlan({
  graphSnapshot,
  workflowDefinition,
  changeRequest,
}) {
  assertObject(graphSnapshot, "graphSnapshot");
  assertObject(changeRequest, "changeRequest");
  const changeKind = String(changeRequest.kind ?? "");
  if (
    !Object.values(REVISION_CHANGE_KINDS).includes(changeKind)
  ) {
    fail(
      "UNSUPPORTED_REVISION_CHANGE",
      "changeRequest.kind is not supported.",
      { kind: changeKind },
    );
  }

  const artifacts = normalizeArtifacts(graphSnapshot);
  const edges = normalizeEdges(graphSnapshot, artifacts);
  const workflow = normalizeWorkflow(workflowDefinition);
  const changeRoot = buildChangeRoot({
    artifacts,
    changeRequest,
    changeKind,
  });

  const outgoingByArtifact = new Map();
  for (const edge of edges) {
    const outgoing = outgoingByArtifact.get(edge.from) ?? [];
    outgoing.push(edge);
    outgoingByArtifact.set(edge.from, outgoing);
  }
  for (const outgoing of outgoingByArtifact.values()) {
    outgoing.sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right)),
    );
  }

  const staleArtifactIds = new Set();
  const staleMemberRefs = new Map();
  const protectedBoundaries = new Set();
  const expandedAt = new Set();
  const queue = [
    {
      artifact_id: changeRoot.oldArtifact.artifact_id,
      member_id: changeRoot.member?.member_id ?? null,
    },
  ];
  const visited = new Set();
  let selectedRootEdgeCount = 0;

  if (changeRoot.member) {
    staleMemberRefs.set(
      memberLocator({
        artifact_id: changeRoot.oldArtifact.artifact_id,
        member_id: changeRoot.member.member_id,
      }),
      {
        artifact_id: changeRoot.oldArtifact.artifact_id,
        manifest_sha256: changeRoot.oldArtifact.manifest_sha256,
        member_id: changeRoot.member.member_id,
        member_sha256: changeRoot.member.member_sha256,
      },
    );
  } else {
    staleArtifactIds.add(changeRoot.oldArtifact.artifact_id);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const visitKey = `${current.artifact_id}\u0000${
      current.member_id ?? ""
    }`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    const outgoing = outgoingByArtifact.get(current.artifact_id) ?? [];
    const selected = selectOutgoingEdges(
      outgoing,
      current.member_id,
      expandedAt,
    );
    if (
      current.artifact_id === changeRoot.oldArtifact.artifact_id &&
      current.member_id === (changeRoot.member?.member_id ?? null)
    ) {
      selectedRootEdgeCount = selected.length;
    }

    for (const edge of selected) {
      const destination = artifacts.get(edge.to);
      if (isCoreProtectedArtifact(destination, changeKind)) {
        fail(
          "PROTECTED_INVALIDATION_FORBIDDEN",
          "impact edge attempts to invalidate a protected artifact.",
          {
            from: edge.from,
            to: edge.to,
            relation: edge.relation,
            protected_type: destination.type,
          },
        );
      }

      if (edge.to_member_id !== null) {
        const locator = memberLocator({
          artifact_id: destination.artifact_id,
          member_id: edge.to_member_id,
        });
        staleMemberRefs.set(locator, {
          artifact_id: destination.artifact_id,
          manifest_sha256: destination.manifest_sha256,
          member_id: edge.to_member_id,
          member_sha256: edge.to_member_sha256,
        });
      } else {
        staleArtifactIds.add(destination.artifact_id);
      }
      queue.push({
        artifact_id: destination.artifact_id,
        member_id: edge.to_member_id,
      });
    }
  }

  if (
    selectedRootEdgeCount === 0 &&
    changeRoot.allowRootOnly !== true
  ) {
    fail(
      "MISSING_IMPACT_EDGE",
      "change root has no exact member or artifact-level descendant edge.",
      {
        artifact_id: changeRoot.oldArtifact.artifact_id,
        member_id: changeRoot.member?.member_id ?? null,
      },
    );
  }

  for (const artifactId of staleArtifactIds) {
    for (const [locator, reference] of staleMemberRefs) {
      if (reference.artifact_id === artifactId) {
        staleMemberRefs.delete(locator);
      }
    }
  }

  const impactedArtifactIds = new Set([
    ...staleArtifactIds,
    ...[...staleMemberRefs.values()].map(
      (reference) => reference.artifact_id,
    ),
  ]);
  if (
    artifacts.size > 1 &&
    impactedArtifactIds.size === artifacts.size
  ) {
    fail(
      "FULL_GRAPH_INVALIDATION_FORBIDDEN",
      "revision impact may not invalidate the full artifact graph.",
      { artifact_count: artifacts.size },
    );
  }

  const resetStages = new Set(changeRoot.requiredResetStages);
  for (const artifactId of impactedArtifactIds) {
    const artifact = artifacts.get(artifactId);
    if (
      !(
        changeKind ===
          REVISION_CHANGE_KINDS.ACTUAL_PRODUCT_PHOTO_SET_REVISION &&
        artifactId === changeRoot.oldArtifact.artifact_id
      )
    ) {
      resetStages.add(producerStageId(artifact, workflow));
    }
    addResetProfile(resetStages, artifact.type, workflow);
  }
  for (const stageId of resetStages) {
    if (!workflow.stages.has(stageId)) {
      fail(
        "INVALID_WORKFLOW_DEFINITION",
        "required reset stage is absent from the workflow.",
        { stage_id: stageId },
      );
    }
  }

  const sortedStaleArtifacts = [...staleArtifactIds].sort();
  const sortedStaleMembers = sortedMemberRefs(staleMemberRefs);
  const protectedArtifactIds = [...artifacts.keys()]
    .filter((artifactId) => !staleArtifactIds.has(artifactId))
    .sort();
  const protectedMemberRefs = [];
  const staleMemberLocators = new Set(
    sortedStaleMembers.map(memberLocator),
  );
  for (const artifact of artifacts.values()) {
    if (staleArtifactIds.has(artifact.artifact_id)) continue;
    for (const member of artifact.members.values()) {
      const reference = {
        artifact_id: artifact.artifact_id,
        manifest_sha256: artifact.manifest_sha256,
        member_id: member.member_id,
        member_sha256: member.member_sha256,
      };
      if (!staleMemberLocators.has(memberLocator(reference))) {
        protectedMemberRefs.push(reference);
      }
    }
  }
  protectedMemberRefs.sort(
    (left, right) =>
      left.artifact_id.localeCompare(right.artifact_id) ||
      left.member_id.localeCompare(right.member_id),
  );

  const resetStageIds = [...resetStages].sort(
    (left, right) =>
      workflow.stages.get(left).order -
        workflow.stages.get(right).order ||
      left.localeCompare(right),
  );
  const approvalGates = resetStageIds.filter(
    (stageId) => workflow.stages.get(stageId).user_gate,
  );
  const staleIds = [
    ...sortedStaleArtifacts,
    ...sortedStaleMembers.map(memberLocator),
  ].sort();
  const protectedIds = [
    ...protectedArtifactIds,
    ...protectedMemberRefs.map(memberLocator),
  ].sort();

  const planBody = {
    schema_version: "1.0",
    plan_type: "RevisionImpactPlan",
    change_kind: changeKind,
    graph_snapshot_digest: revisionImpactDigest(graphSnapshot),
    workflow_definition_digest:
      revisionImpactDigest(workflowDefinition),
    roots: [changeRoot.root],
    scope: {
      mode:
        expandedAt.size > 0
          ? "artifact_fallback"
          : changeRoot.member
            ? "member_exact"
            : "artifact_revision",
      expanded_at_artifact_ids: [...expandedAt].sort(),
      full_graph_invalidation: false,
      protected_boundary_artifact_ids: [
        ...protectedBoundaries,
      ].sort(),
    },
    stale_ids: staleIds,
    stale_artifact_ids: sortedStaleArtifacts,
    stale_member_refs: sortedStaleMembers,
    reset_stage_ids: resetStageIds,
    protected_ids: protectedIds,
    protected_artifact_ids: protectedArtifactIds,
    protected_member_refs: protectedMemberRefs,
    approval_gates_to_reopen: approvalGates,
    state_mutation: {
      allowed: false,
      performed: false,
    },
  };
  return {
    ...planBody,
    digest: revisionImpactDigest(planBody),
  };
}

export const calculateRevisionImpact = createRevisionImpactPlan;
