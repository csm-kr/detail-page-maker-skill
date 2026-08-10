import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  RightsPolicyError,
  assertRightsDecisionSet,
  buildG0RRightsWorkflowEnvelope,
  createRightsDecisionSet,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/rights-policy.mjs";
import {
  buildDmkRightsSubject,
  importDmkBundle,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/dmk-bundle-adapter.mjs";

const H = {
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
  d: "d".repeat(64),
  e: "e".repeat(64),
};

const POLICY = {
  policy_id: "policy.rights.v1",
  policy_sha256: H.e,
};

const PRODUCER = {
  agent_id: "rights-producer",
  agent_session_id: "rights-producer-session",
};

const REVIEWER = {
  agent_id: "rights-reviewer",
  agent_session_id: "rights-reviewer-session",
};

function supplierSubject(overrides = {}) {
  const {
    payload: payloadOverrides = {},
    ...subjectOverrides
  } = overrides;
  const payload = {
    schema_version: "2.0-draft",
    artifact_id: "art-supplier-test",
    artifact_type: "supplier.snapshot",
    source_provider: "dmk-extractor",
    manifest_sha256: H.a,
    member_ids: ["supplier-file-a", "supplier-file-b"],
    files: [
      {
        member_id: "supplier-file-a",
        source_path: "thumbnail/thumbnail.png",
        kind: "product_thumbnail",
        object_sha256: H.b,
        rights_observation: {
          text: "사용허용",
          locator: "page.json#/image_usage_observation",
        },
      },
      {
        member_id: "supplier-file-b",
        source_path: "reviews/reviews.json",
        kind: "sanitized_public_reviews",
        object_sha256: H.c,
        rights_observation: {
          text: "공개 후기 표본",
          locator: "reviews/reviews.json#/scope",
        },
      },
    ],
    ...payloadOverrides,
  };
  return {
    artifact_id: payload.artifact_id,
    type: "evidence.supplier_snapshot",
    manifest_sha256: H.d,
    member_ids: payload.member_ids,
    payload,
    ...subjectOverrides,
  };
}

function evidenceOnlyDecisions(subject = supplierSubject()) {
  return subject.payload.files.map((file) => ({
    member_id: file.member_id,
    object_sha256: file.object_sha256,
    classification:
      file.kind === "product_thumbnail"
        ? "identity_reference"
        : "evidence_reference",
    production_use_allowed: false,
  }));
}

function createSet(overrides = {}) {
  const subject = overrides.supplier_artifact ?? supplierSubject();
  return createRightsDecisionSet({
    supplier_artifact: subject,
    decisions: overrides.decisions ?? evidenceOnlyDecisions(subject),
    policy: overrides.policy ?? POLICY,
    producer: overrides.producer ?? PRODUCER,
    reviewer: overrides.reviewer ?? REVIEWER,
    reviewed_at: "2026-07-30T12:00:00.000Z",
  });
}

test("G0A의 모든 member_id+sha256에 1:1 deterministic RightsDecisionReceipt를 만든다", () => {
  const subject = supplierSubject();
  const first = createSet({ supplier_artifact: subject });
  const second = createSet({
    supplier_artifact: subject,
    decisions: evidenceOnlyDecisions(subject).reverse(),
  });

  assert.deepEqual(first, second);
  assert.equal(first.artifact_type, "decision.rights_set");
  assert.equal(first.supplier_artifact_id, subject.artifact_id);
  assert.equal(first.supplier_manifest_sha256, subject.manifest_sha256);
  assert.equal(first.rights_decision_receipts.length, 2);
  assert.equal(first.production_rights_status, "HOLD");
  assert.equal(first.summary.production_allowed_count, 0);
  assert.deepEqual(
    first.rights_decision_receipts.map((receipt) => receipt.member_id).sort(),
    subject.member_ids.toSorted(),
  );
  for (const receipt of first.rights_decision_receipts) {
    assert.match(receipt.receipt_id, /^rights-decision-[a-f0-9]{24}$/);
    assert.match(receipt.receipt_sha256, /^[a-f0-9]{64}$/);
    assert.match(receipt.object_sha256, /^[a-f0-9]{64}$/);
    assert.equal(receipt.policy.policy_id, POLICY.policy_id);
    assert.equal(receipt.policy.policy_sha256, POLICY.policy_sha256);
    assert.equal(
      receipt.producer.agent_session_id,
      PRODUCER.agent_session_id,
    );
    assert.equal(
      receipt.reviewer.agent_session_id,
      REVIEWER.agent_session_id,
    );
    assert.ok(receipt.rights_observation.locator);
  }
  assert.deepEqual(assertRightsDecisionSet(first, subject), first);
});

test("명시적 상업 제작 license 문구와 근거 locator/hash가 있을 때만 production use를 연다", () => {
  const subject = supplierSubject();
  const decisions = evidenceOnlyDecisions(subject);
  decisions[0] = {
    member_id: "supplier-file-a",
    object_sha256: H.b,
    classification: "production_licensed",
    production_use_allowed: true,
    license_evidence: {
      exact_text:
        "판매 상세페이지와 상업 광고 제작에 해당 이미지를 사용하는 것을 허용합니다.",
      locator: "license.json#/permissions/0",
      evidence_artifact_id: "license-evidence-a",
      evidence_sha256: H.a,
    },
  };

  const allowed = createSet({ supplier_artifact: subject, decisions });
  const receipt = allowed.rights_decision_receipts.find(
    (item) => item.member_id === "supplier-file-a",
  );
  assert.equal(receipt.production_use_allowed, true);
  assert.equal(receipt.classification, "production_licensed");
  assert.equal(allowed.production_rights_status, "PARTIAL");
  assert.deepEqual(assertRightsDecisionSet(allowed, subject), allowed);

  const generic = structuredClone(decisions);
  generic[0].license_evidence.exact_text = "사용허용";
  assert.throws(
    () => createSet({ supplier_artifact: subject, decisions: generic }),
    (error) =>
      error instanceof RightsPolicyError &&
      error.code === "LICENSE_EVIDENCE_INSUFFICIENT",
  );

  const missingLocator = structuredClone(decisions);
  delete missingLocator[0].license_evidence.locator;
  assert.throws(
    () =>
      createSet({
        supplier_artifact: subject,
        decisions: missingLocator,
      }),
    (error) => error.code === "LICENSE_EVIDENCE_INSUFFICIENT",
  );
});

test("producer와 reviewer session이 같으면 권리 결정을 거부한다", () => {
  assert.throws(
    () =>
      createSet({
        reviewer: {
          agent_id: "self-review",
          agent_session_id: PRODUCER.agent_session_id,
        },
      }),
    (error) => error.code === "RIGHTS_SELF_REVIEW_FORBIDDEN",
  );
});

test("권리 결정의 누락·중복·member hash mismatch를 각각 차단한다", async (t) => {
  const subject = supplierSubject();
  const decisions = evidenceOnlyDecisions(subject);

  await t.test("missing", () => {
    assert.throws(
      () =>
        createSet({
          supplier_artifact: subject,
          decisions: decisions.slice(0, 1),
        }),
      (error) => error.code === "RIGHTS_COVERAGE_MISMATCH",
    );
  });

  await t.test("duplicate", () => {
    assert.throws(
      () =>
        createSet({
          supplier_artifact: subject,
          decisions: [...decisions, decisions[0]],
        }),
      (error) => error.code === "DUPLICATE_RIGHTS_DECISION",
    );
  });

  await t.test("hash mismatch", () => {
    const changed = structuredClone(decisions);
    changed[0].object_sha256 = H.a;
    assert.throws(
      () =>
        createSet({
          supplier_artifact: subject,
          decisions: changed,
        }),
      (error) => error.code === "RIGHTS_MEMBER_HASH_MISMATCH",
    );
  });
});

test("후기와 쿠팡 research-only 자산은 production_licensed로 승격할 수 없다", async (t) => {
  const supplier = supplierSubject();
  const reviewPromotion = evidenceOnlyDecisions(supplier);
  reviewPromotion[1] = {
    member_id: "supplier-file-b",
    object_sha256: H.c,
    classification: "production_licensed",
    production_use_allowed: true,
    license_evidence: {
      exact_text: "상업 광고 제작에 공개 후기 원문을 사용하는 것을 허용합니다.",
      locator: "license.json#/reviews",
      evidence_artifact_id: "license-review",
      evidence_sha256: H.a,
    },
  };
  await t.test("review", () => {
    assert.throws(
      () =>
        createSet({
          supplier_artifact: supplier,
          decisions: reviewPromotion,
        }),
      (error) => error.code === "REVIEW_ASSET_PROMOTION_FORBIDDEN",
    );
  });

  const coupang = supplierSubject({
    payload: {
      source_provider: "coupang-extractor",
      rights: "research_reference_only",
      files: [
        {
          member_id: "supplier-file-a",
          source_path: "detail/detail.png",
          kind: "seller_detail_source_asset",
          object_sha256: H.b,
          rights: "research_reference_only",
          rights_observation: {
            text: "경쟁상품 조사 자산",
            locator: "manifest.json#/rights",
          },
        },
      ],
      member_ids: ["supplier-file-a"],
    },
  });
  const coupangPromotion = [
    {
      member_id: "supplier-file-a",
      object_sha256: H.b,
      classification: "production_licensed",
      production_use_allowed: true,
      license_evidence: {
        exact_text: "상업 광고 제작에 이미지를 사용하는 것을 허용합니다.",
        locator: "license.json#/image",
        evidence_artifact_id: "license-coupang",
        evidence_sha256: H.a,
      },
    },
  ];
  await t.test("coupang research", () => {
    assert.throws(
      () =>
        createSet({
          supplier_artifact: coupang,
          decisions: coupangPromotion,
        }),
      (error) => error.code === "RESEARCH_ASSET_PROMOTION_FORBIDDEN",
    );
  });
});

test("aggregate decision.rights_set을 exact G0R WorkOrder ResultEnvelope로 만든다", () => {
  const subject = supplierSubject();
  const rightsSet = createSet({ supplier_artifact: subject });
  const workOrder = {
    work_order_id: "work-g0r-001",
    stage_id: "G0R_RIGHTS",
    assigned_agent_session_id: REVIEWER.agent_session_id,
    input_set_digest: H.a,
    input_artifacts: [
      {
        artifact_id: subject.artifact_id,
        type: "evidence.supplier_snapshot",
        manifest_sha256: subject.manifest_sha256,
      },
    ],
    expected_output_types: ["decision.rights_set"],
    gate_policy_id: POLICY.policy_id,
  };
  const projectRef = {
    project_id: "project-56328525",
    input_digest: H.b,
    agent_session_id: REVIEWER.agent_session_id,
  };
  const envelope = buildG0RRightsWorkflowEnvelope({
    rightsSet,
    workOrder,
    projectRef,
  });

  assert.equal(
    envelope.producer_agent_session_id,
    REVIEWER.agent_session_id,
  );
  assert.equal(envelope.input_set_digest, workOrder.input_set_digest);
  assert.deepEqual(
    envelope.output_artifacts.map((item) => item.type),
    ["decision.rights_set"],
  );
  assert.equal(
    envelope.output_artifacts[0].manifest_sha256,
    rightsSet.manifest_sha256,
  );
  assert.deepEqual(
    envelope.output_artifacts[0].member_ids,
    rightsSet.rights_decision_receipt_ids,
  );
  assert.match(
    envelope.execution_receipt.adapter_code_sha256,
    /^[a-f0-9]{64}$/,
  );
});

test("dmk adapter가 G0R용 member·원문 observation을 보존하며 fixture는 전부 production false/HOLD다", async () => {
  const imported = await importDmkBundle({
    bundleRoot: fileURLToPath(
      new URL("../fixtures/orchestration/dmk-minimal/", import.meta.url),
    ),
    expectedProductId: "56328525",
    expectedSupplierUrl: "https://domeggook.com/56328525",
  });
  const subject = buildDmkRightsSubject(imported);

  assert.equal(subject.type, "evidence.supplier_snapshot");
  assert.deepEqual(subject.payload.consumers, ["G0R_RIGHTS"]);
  assert.equal(subject.member_ids.length, subject.payload.files.length);
  for (const file of subject.payload.files) {
    assert.ok(file.member_id);
    assert.ok(file.rights_observation.locator);
    assert.equal(file.production_use_allowed, false);
  }

  const decisions = subject.payload.files.map((file) => ({
    member_id: file.member_id,
    object_sha256: file.object_sha256,
    classification:
      file.kind === "product_thumbnail"
        ? "identity_reference"
        : "evidence_reference",
    production_use_allowed: false,
  }));
  const rightsSet = createSet({
    supplier_artifact: subject,
    decisions,
  });
  assert.equal(rightsSet.production_rights_status, "HOLD");
  assert.equal(rightsSet.summary.production_allowed_count, 0);
});
