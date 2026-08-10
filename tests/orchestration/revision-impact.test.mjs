import assert from "node:assert/strict";
import test from "node:test";

import {
  REVISION_CHANGE_KINDS,
  createRevisionImpactPlan,
  revisionImpactDigest,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/revision-impact.mjs";
import { WORKFLOW_DEFINITION } from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-definition.mjs";

const H = Object.freeze({
  intake: "0".repeat(64),
  photo: "1".repeat(64),
  photoMember: "2".repeat(64),
  ssot: "3".repeat(64),
  ssotApproval: "4".repeat(64),
  market: "5".repeat(64),
  knowledge: "6".repeat(64),
  plan: "7".repeat(64),
  planApproval: "8".repeat(64),
  imageConfig: "9".repeat(64),
  imageSet: "a".repeat(64),
  imageA: "b".repeat(64),
  imageB: "c".repeat(64),
  gifSet: "d".repeat(64),
  gifA: "e".repeat(64),
  gifB: "f".repeat(64),
  sectionA: "10".repeat(32),
  sectionB: "11".repeat(32),
  html: "12".repeat(32),
  capture: "13".repeat(32),
  working: "14".repeat(32),
  committed: "15".repeat(32),
  rubric: "16".repeat(32),
  pageApproval: "17".repeat(32),
  publish: "18".repeat(32),
  publishApproval: "19".repeat(32),
  newPhoto: "20".repeat(32),
  newPhotoMember: "21".repeat(32),
});

function artifact({
  id,
  type,
  hash,
  stage,
  members = [],
  protected: isProtected = false,
}) {
  return {
    artifact_id: id,
    type,
    manifest_sha256: hash,
    member_ids: members.map((member) => member.member_id),
    members,
    status: "fresh",
    producer_stage_id: stage,
    protected: isProtected,
  };
}

function member(memberId, memberSha256) {
  return {
    member_id: memberId,
    member_sha256: memberSha256,
  };
}

function edge(from, to, relation, memberBinding = {}) {
  return { from, to, relation, ...memberBinding };
}

function fixtureGraph() {
  const artifacts = [
    artifact({
      id: "intake",
      type: "project.intake",
      hash: H.intake,
      stage: "S0_INTAKE",
    }),
    artifact({
      id: "photo-set",
      type: "identity.photo_set",
      hash: H.photo,
      stage: "G0B_PHOTO",
      members: [member("photo-a", H.photoMember)],
    }),
    artifact({
      id: "ssot",
      type: "product.ssot",
      hash: H.ssot,
      stage: "G0C_NORMALIZE",
    }),
    artifact({
      id: "ssot-approval",
      type: "decision.ssot_approval",
      hash: H.ssotApproval,
      stage: "G0U_APPROVAL",
    }),
    artifact({
      id: "market",
      type: "evidence.market_snapshot",
      hash: H.market,
      stage: "G1A_MARKET",
    }),
    artifact({
      id: "knowledge",
      type: "knowledge.snapshot",
      hash: H.knowledge,
      stage: "G1B_KNOWLEDGE",
    }),
    artifact({
      id: "plan",
      type: "production.plan",
      hash: H.plan,
      stage: "G1C_PLAN",
    }),
    artifact({
      id: "plan-approval",
      type: "decision.plan_approval",
      hash: H.planApproval,
      stage: "G1U_APPROVAL",
    }),
    artifact({
      id: "image-config",
      type: "decision.image_config_approval",
      hash: H.imageConfig,
      stage: "G2S_CONFIG_APPROVAL",
    }),
    artifact({
      id: "image-approved",
      type: "media.image_approved",
      hash: H.imageSet,
      stage: "G2U_APPROVAL",
      members: [
        member("image-a", H.imageA),
        member("image-b", H.imageB),
      ],
    }),
    artifact({
      id: "gif-approved",
      type: "media.gif_approved",
      hash: H.gifSet,
      stage: "G3U_APPROVAL",
      members: [
        member("gif-a", H.gifA),
        member("gif-b", H.gifB),
      ],
    }),
    artifact({
      id: "section-a",
      type: "page.section_graph_resolved",
      hash: H.sectionA,
      stage: "G4A_ASSEMBLY",
    }),
    artifact({
      id: "section-b",
      type: "page.section_graph_resolved",
      hash: H.sectionB,
      stage: "G4A_ASSEMBLY",
    }),
    artifact({
      id: "html",
      type: "page.html_revision",
      hash: H.html,
      stage: "G4A_ASSEMBLY",
    }),
    artifact({
      id: "capture",
      type: "qa.render_capture_set",
      hash: H.capture,
      stage: "G4Q0_PRE_STUDIO_QA",
    }),
    artifact({
      id: "working",
      type: "studio.working_revision",
      hash: H.working,
      stage: "S1_STUDIO_WORKING",
    }),
    artifact({
      id: "committed",
      type: "studio.committed_revision",
      hash: H.committed,
      stage: "G4C_STUDIO_COMMIT",
    }),
    artifact({
      id: "rubric",
      type: "qa.rubric_result",
      hash: H.rubric,
      stage: "G4Q_RUBRIC",
    }),
    artifact({
      id: "page-approval",
      type: "decision.page_approval",
      hash: H.pageApproval,
      stage: "G4U_APPROVAL",
    }),
    artifact({
      id: "publish",
      type: "page.publish_bundle",
      hash: H.publish,
      stage: "G5_PUBLISH_QA",
    }),
    artifact({
      id: "publish-approval",
      type: "decision.publish_approval",
      hash: H.publishApproval,
      stage: "G5U_APPROVAL",
    }),
  ];

  const edges = [
    edge(
      "photo-set",
      "ssot",
      "identity_reference_for",
    ),
    edge(
      "photo-set",
      "image-approved",
      "identity_reference_for",
    ),
    edge("ssot", "ssot-approval", "evaluates"),
    edge("ssot-approval", "plan", "evidence_for"),
    edge("market", "plan", "evidence_for"),
    edge("knowledge", "plan", "evidence_for"),
    edge("plan", "plan-approval", "evaluates"),
    edge("plan-approval", "image-config", "evaluates"),
    edge("image-config", "image-approved", "evidence_for"),
    edge(
      "image-approved",
      "gif-approved",
      "motion_derived_from",
      {
        from_member_id: "image-a",
        from_member_sha256: H.imageA,
        to_member_id: "gif-a",
        to_member_sha256: H.gifA,
      },
    ),
    edge(
      "image-approved",
      "gif-approved",
      "motion_derived_from",
      {
        from_member_id: "image-b",
        from_member_sha256: H.imageB,
        to_member_id: "gif-b",
        to_member_sha256: H.gifB,
      },
    ),
    edge(
      "image-approved",
      "section-a",
      "media_fills_slot",
      {
        from_member_id: "image-a",
        from_member_sha256: H.imageA,
      },
    ),
    edge(
      "image-approved",
      "section-b",
      "media_fills_slot",
      {
        from_member_id: "image-b",
        from_member_sha256: H.imageB,
      },
    ),
    edge(
      "gif-approved",
      "section-a",
      "media_fills_slot",
      {
        from_member_id: "gif-a",
        from_member_sha256: H.gifA,
      },
    ),
    edge(
      "gif-approved",
      "section-b",
      "media_fills_slot",
      {
        from_member_id: "gif-b",
        from_member_sha256: H.gifB,
      },
    ),
    edge("section-a", "html", "section_contains"),
    edge("section-b", "html", "section_contains"),
    edge("html", "capture", "evaluates"),
    edge("capture", "working", "evaluates"),
    edge("working", "committed", "revision_of"),
    edge("committed", "rubric", "evaluates"),
    edge("rubric", "page-approval", "evaluates"),
    edge("page-approval", "publish", "evidence_for"),
    edge("publish", "publish-approval", "evaluates"),
  ];

  return { artifacts, edges };
}

function oldArtifactRef(
  artifactId,
  manifestSha256,
  memberId,
  memberSha256,
) {
  return {
    artifact_id: artifactId,
    manifest_sha256: manifestSha256,
    ...(memberId
      ? { member_id: memberId, member_sha256: memberSha256 }
      : {}),
  };
}

function rejectionReceipt({
  kind,
  gateStageId,
  artifactId,
  artifactSha256,
  memberId,
  memberSha256,
}) {
  const body = {
    schema_version: "1.0",
    receipt_id: `reject-${memberId}`,
    receipt_type: "revision.member_rejection",
    change_kind: kind,
    decision: "REJECTED",
    gate_stage_id: gateStageId,
    reason_code: "USER_REJECTED_VISUAL",
    subject: {
      artifact_id: artifactId,
      manifest_sha256: artifactSha256,
      member_id: memberId,
      member_sha256: memberSha256,
    },
  };
  return {
    ...body,
    receipt_sha256: revisionImpactDigest(body),
  };
}

function imageRejection() {
  return {
    kind: REVISION_CHANGE_KINDS.G2_IMAGE_MEMBER_REJECTION,
    old_artifact: oldArtifactRef(
      "image-approved",
      H.imageSet,
      "image-a",
      H.imageA,
    ),
    rejection_receipt: rejectionReceipt({
      kind: REVISION_CHANGE_KINDS.G2_IMAGE_MEMBER_REJECTION,
      gateStageId: "G2U_APPROVAL",
      artifactId: "image-approved",
      artifactSha256: H.imageSet,
      memberId: "image-a",
      memberSha256: H.imageA,
    }),
  };
}

function gifRejection() {
  return {
    kind: REVISION_CHANGE_KINDS.G3_GIF_MEMBER_REJECTION,
    old_artifact: oldArtifactRef(
      "gif-approved",
      H.gifSet,
      "gif-a",
      H.gifA,
    ),
    rejection_receipt: rejectionReceipt({
      kind: REVISION_CHANGE_KINDS.G3_GIF_MEMBER_REJECTION,
      gateStageId: "G3U_APPROVAL",
      artifactId: "gif-approved",
      artifactSha256: H.gifSet,
      memberId: "gif-a",
      memberSha256: H.gifA,
    }),
  };
}

function photoRevision() {
  const subject = {
    artifact_id: "photo-set-v2",
    manifest_sha256: H.newPhoto,
    members: [member("photo-b", H.newPhotoMember)],
  };
  const rightsBody = {
    schema_version: "1.0",
    receipt_id: "photo-rights-v2",
    receipt_type: "photo_revision.rights_provenance",
    subject,
    classification: "identity_reference",
    production_use_allowed: false,
    evidence: {
      locator: "input/product/photo-b.png",
      sha256: H.newPhotoMember,
    },
  };
  const identityBody = {
    schema_version: "1.0",
    receipt_id: "photo-identity-v2",
    receipt_type: "photo_revision.identity_provenance",
    subject,
    decision: "verified",
    evidence: {
      locator: "input/product/photo-b.png",
      sha256: H.newPhotoMember,
    },
  };
  return {
    kind: REVISION_CHANGE_KINDS.ACTUAL_PRODUCT_PHOTO_SET_REVISION,
    old_artifact: oldArtifactRef("photo-set", H.photo),
    new_artifact: {
      artifact_id: "photo-set-v2",
      type: "identity.photo_set",
      manifest_sha256: H.newPhoto,
      member_ids: ["photo-b"],
      members: [member("photo-b", H.newPhotoMember)],
      member_manifest: {
        schema_version: "1.0",
        policy: "materialized",
        members: [
          {
            member_id: "photo-b",
            root_id: "project",
            locator: "input/product/photo-b.png",
            sha256: H.newPhotoMember,
            size_bytes: 1024,
          },
        ],
      },
      producer_agent_session_id: "photo-revision-producer",
      rights_provenance: {
        ...rightsBody,
        receipt_sha256: revisionImpactDigest(rightsBody),
      },
      identity_provenance: {
        ...identityBody,
        receipt_sha256: revisionImpactDigest(identityBody),
      },
      revision_of: {
        artifact_id: "photo-set",
        manifest_sha256: H.photo,
      },
    },
  };
}

function calculate(graphSnapshot, changeRequest) {
  return createRevisionImpactPlan({
    graphSnapshot,
    workflowDefinition: WORKFLOW_DEFINITION,
    changeRequest,
  });
}

test("G2 image member rejection invalidates only its exact descendant branch", () => {
  const graph = fixtureGraph();
  const before = structuredClone(graph);

  const plan = calculate(graph, imageRejection());

  assert.equal(plan.plan_type, "RevisionImpactPlan");
  assert.equal(plan.scope.mode, "member_exact");
  assert.deepEqual(plan.scope.expanded_at_artifact_ids, []);
  assert.ok(plan.stale_ids.includes("image-approved#image-a"));
  assert.ok(plan.stale_ids.includes("gif-approved#gif-a"));
  assert.ok(plan.stale_artifact_ids.includes("section-a"));
  assert.ok(plan.stale_artifact_ids.includes("html"));
  assert.ok(!plan.stale_ids.includes("image-approved#image-b"));
  assert.ok(!plan.stale_ids.includes("gif-approved#gif-b"));
  assert.ok(!plan.stale_artifact_ids.includes("section-b"));
  assert.ok(plan.protected_ids.includes("image-approved#image-b"));
  assert.ok(plan.protected_ids.includes("gif-approved#gif-b"));
  assert.ok(plan.protected_artifact_ids.includes("section-b"));
  assert.ok(plan.protected_artifact_ids.includes("ssot"));
  assert.ok(plan.protected_artifact_ids.includes("market"));
  assert.ok(plan.protected_artifact_ids.includes("knowledge"));
  assert.deepEqual(plan.approval_gates_to_reopen, [
    "G2U_APPROVAL",
    "G3U_APPROVAL",
    "G4U_APPROVAL",
    "G5U_APPROVAL",
  ]);
  for (const stageId of [
    "G2A_IMAGE",
    "G2Q_QA",
    "G2U_APPROVAL",
    "G3R_RENDER",
    "G3Q_QA",
    "G3U_APPROVAL",
    "G4A_ASSEMBLY",
    "G4Q0_PRE_STUDIO_QA",
    "S1_STUDIO_WORKING",
    "G4C_STUDIO_COMMIT",
    "G4Q_RUBRIC",
    "G4U_APPROVAL",
    "G5_PUBLISH_QA",
    "G5U_APPROVAL",
  ]) {
    assert.ok(plan.reset_stage_ids.includes(stageId), stageId);
  }
  assert.deepEqual(plan.state_mutation, {
    allowed: false,
    performed: false,
  });
  assert.deepEqual(graph, before);
  const { digest, ...body } = plan;
  assert.equal(digest, revisionImpactDigest(body));
});

test("G3 GIF member rejection preserves every image and sibling GIF/section branch", () => {
  const plan = calculate(fixtureGraph(), gifRejection());

  assert.equal(plan.scope.mode, "member_exact");
  assert.ok(plan.stale_ids.includes("gif-approved#gif-a"));
  assert.ok(plan.stale_artifact_ids.includes("section-a"));
  assert.ok(!plan.stale_ids.some((id) => id.startsWith("image-approved#")));
  assert.ok(!plan.stale_ids.includes("gif-approved#gif-b"));
  assert.ok(!plan.stale_artifact_ids.includes("section-b"));
  assert.ok(plan.protected_ids.includes("image-approved#image-a"));
  assert.ok(plan.protected_ids.includes("image-approved#image-b"));
  assert.ok(plan.protected_ids.includes("gif-approved#gif-b"));
  assert.deepEqual(plan.approval_gates_to_reopen, [
    "G3U_APPROVAL",
    "G4U_APPROVAL",
    "G5U_APPROVAL",
  ]);
  assert.ok(!plan.reset_stage_ids.includes("G2A_IMAGE"));
  assert.ok(!plan.reset_stage_ids.includes("G3V_PREVIEW_APPROVAL"));
});

test("actual product photo-set revision resets identity descendants and preserves market knowledge", () => {
  const plan = calculate(fixtureGraph(), photoRevision());

  assert.deepEqual(plan.roots, [
    {
      root_kind: "artifact_revision",
      old_artifact_id: "photo-set",
      old_manifest_sha256: H.photo,
      new_artifact_id: "photo-set-v2",
      new_manifest_sha256: H.newPhoto,
    },
  ]);
  assert.equal(plan.scope.mode, "artifact_revision");
  assert.deepEqual(plan.scope.protected_boundary_artifact_ids, []);
  assert.ok(plan.stale_artifact_ids.includes("photo-set"));
  assert.ok(plan.stale_artifact_ids.includes("ssot"));
  assert.ok(plan.stale_artifact_ids.includes("ssot-approval"));
  assert.ok(plan.stale_artifact_ids.includes("plan"));
  assert.ok(plan.stale_artifact_ids.includes("image-approved"));
  assert.ok(plan.stale_artifact_ids.includes("section-a"));
  assert.ok(plan.stale_artifact_ids.includes("section-b"));
  assert.ok(plan.protected_artifact_ids.includes("market"));
  assert.ok(plan.protected_artifact_ids.includes("knowledge"));
  assert.ok(!plan.reset_stage_ids.includes("G0B_PHOTO"));
  assert.ok(plan.reset_stage_ids.includes("G0C_NORMALIZE"));
  assert.ok(plan.reset_stage_ids.includes("G0Q_QA"));
  assert.ok(plan.reset_stage_ids.includes("G0U_APPROVAL"));
  assert.ok(plan.approval_gates_to_reopen.includes("G0U_APPROVAL"));
  assert.ok(plan.approval_gates_to_reopen.includes("G1U_APPROVAL"));
});

test("actual product photo-set revision은 input/product 밖의 legacy locator를 거부한다", () => {
  const change = photoRevision();
  change.new_artifact.member_manifest.members[0].locator =
    "asset/input/product/photo-b.png";

  assert.throws(
    () => calculate(fixtureGraph(), change),
    (error) =>
      error.code === "PHOTO_MEMBER_OUTSIDE_INPUT_PRODUCT" &&
      error.details.locator ===
        "asset/input/product/photo-b.png",
  );
});

test("photo provenance는 exact input/product member locator와 hash를 함께 고정한다", () => {
  const change = photoRevision();
  change.new_artifact.rights_provenance.evidence.locator =
    "input/product/other-photo.png";
  const receipt = change.new_artifact.rights_provenance;
  const body = Object.fromEntries(
    Object.entries(receipt).filter(
      ([key]) => key !== "receipt_sha256",
    ),
  );
  receipt.receipt_sha256 = revisionImpactDigest(body);

  assert.throws(
    () => calculate(fixtureGraph(), change),
    (error) =>
      error.code === "PHOTO_PROVENANCE_EVIDENCE_MISMATCH",
  );
});

test("missing member provenance widens only to explicit artifact descendants, never the full graph", () => {
  const graph = fixtureGraph();
  graph.edges = graph.edges.filter(
    (item) => item.from !== "image-approved",
  );
  graph.edges.push(
    edge("image-approved", "section-a", "media_fills_slot"),
  );

  const plan = calculate(graph, imageRejection());

  assert.equal(plan.scope.mode, "artifact_fallback");
  assert.deepEqual(plan.scope.expanded_at_artifact_ids, [
    "image-approved",
  ]);
  assert.equal(plan.scope.full_graph_invalidation, false);
  assert.ok(plan.stale_artifact_ids.includes("section-a"));
  assert.ok(!plan.stale_artifact_ids.includes("section-b"));
  assert.ok(!plan.stale_ids.includes("gif-approved#gif-a"));
  assert.ok(plan.protected_artifact_ids.includes("section-b"));
  assert.ok(plan.protected_artifact_ids.includes("gif-approved"));
  assert.ok(plan.protected_artifact_ids.includes("market"));
});

test("forged member edge hash is rejected before impact calculation", () => {
  const graph = fixtureGraph();
  const memberEdge = graph.edges.find(
    (item) =>
      item.from === "image-approved" &&
      item.from_member_id === "image-a",
  );
  memberEdge.from_member_sha256 = H.imageB;

  assert.throws(
    () => calculate(graph, imageRejection()),
    (error) => error.code === "FORGED_MEMBER_EDGE",
  );
});

test("missing root edge is rejected instead of silently widening to all artifacts", () => {
  const graph = fixtureGraph();
  graph.edges = graph.edges.filter(
    (item) => item.from !== "image-approved",
  );

  assert.throws(
    () => calculate(graph, imageRejection()),
    (error) => error.code === "MISSING_IMPACT_EDGE",
  );
});

test("an edge into protected market/knowledge/SSOT state is rejected", () => {
  const graph = fixtureGraph();
  graph.edges.push(
    edge(
      "image-approved",
      "knowledge",
      "claim_used_by",
      {
        from_member_id: "image-a",
        from_member_sha256: H.imageA,
      },
    ),
  );

  assert.throws(
    () => calculate(graph, imageRejection()),
    (error) =>
      error.code === "PROTECTED_INVALIDATION_FORBIDDEN" &&
      error.details.to === "knowledge",
  );
});

test("old hashes, replacement revision link, and signed rejection receipt are exact", () => {
  const wrongOldHash = imageRejection();
  wrongOldHash.old_artifact.manifest_sha256 = H.gifSet;
  assert.throws(
    () => calculate(fixtureGraph(), wrongOldHash),
    (error) => error.code === "CHANGE_ROOT_MISMATCH",
  );

  const forgedReceipt = imageRejection();
  forgedReceipt.rejection_receipt.reason_code = "CHANGED_AFTER_SIGNING";
  assert.throws(
    () => calculate(fixtureGraph(), forgedReceipt),
    (error) => error.code === "FORGED_REJECTION_RECEIPT",
  );

  const wrongRevision = photoRevision();
  wrongRevision.new_artifact.revision_of.manifest_sha256 = H.market;
  assert.throws(
    () => calculate(fixtureGraph(), wrongRevision),
    (error) => error.code === "INVALID_PHOTO_SET_REVISION",
  );
});

test("same immutable inputs always produce the same plan and digest", () => {
  const graph = fixtureGraph();
  const change = imageRejection();
  const first = calculate(graph, change);
  const second = calculate(graph, change);

  assert.deepEqual(first, second);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
});
