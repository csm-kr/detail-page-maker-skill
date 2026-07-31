import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCoupangWorkflowEnvelope,
  materializeCoupangBundle,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/coupang-bundle-adapter.mjs";
import {
  discoverMarketCandidates,
  verifyCandidateSelection,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/market-evidence.mjs";
import {
  createWorkflowEngine,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-engine.mjs";

const PRODUCT_ID = "123";
const ITEM_ID = "456";
const VENDOR_ITEM_ID = "789";
const DIRECT_URL =
  "https://www.coupang.com/vp/products/123?itemId=456&vendorItemId=789";
const INPUT_DIGEST = "8".repeat(64);
const CLI_PATH = path.resolve(
  import.meta.dirname,
  "../../skills/detail-page-maker-skill/scripts/detail-page.mjs",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function project(agentSessionId = "coordinator") {
  return {
    project_id: "project-coupang-g1a-integration",
    input_digest: INPUT_DIGEST,
    agent_session_id: agentSessionId,
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createPortableBundle({ status = "READY" } = {}) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "coupang-g1a-portable-"),
  );
  const rights = {
    scope: "research_reference_only",
    production_use_allowed: false,
    reviewer_identity_stored: false,
  };
  const reviewScope = {
    requested_max_reviews: 200,
    requested_latest_reviews: 100,
    requested_supplement_reviews: 100,
    reviews_observed: 1,
    complete_all_reviews: false,
  };
  const capture = {
    schema_version: "1.0",
    artifact_type: "coupang_product_evidence_capture",
    capture_id: "capture-g1a-integration",
    status,
    product: {
      normalized_url: DIRECT_URL,
      product_id: PRODUCT_ID,
      item_id: ITEM_ID,
      vendor_item_id: VENDOR_ITEM_ID,
    },
    reviews: {
      status,
      scope: reviewScope,
      items: [
        {
          rating: 2,
          review_text: "오래 사용하면 손에 열감이 느껴졌어요.",
        },
      ],
    },
    rights,
  };
  const page = {
    schema_version: "1.0",
    artifact_type: "coupang_extractor_page",
    status,
    normalized_url: DIRECT_URL,
    product_id: PRODUCT_ID,
    item_id: ITEM_ID,
    vendor_item_id: VENDOR_ITEM_ID,
    reviews: { status, scope: reviewScope },
    rights,
  };
  const reviews = {
    schema_version: "1.0",
    artifact_type: "coupang_public_review_capture",
    status,
    product_id: PRODUCT_ID,
    item_id: ITEM_ID,
    scope: reviewScope,
    author_identifiers_removed: true,
    reviews: [
      {
        rating: 2,
        review_text: "오래 사용하면 손에 열감이 느껴졌어요.",
      },
    ],
    rights,
  };
  const validation = {
    status: "VALID",
    errors: [],
    warnings: [],
  };
  await writeJson(path.join(root, "capture.json"), capture);
  await writeJson(path.join(root, "page.json"), page);
  await writeJson(path.join(root, "reviews", "reviews.json"), reviews);
  await writeJson(
    path.join(root, "evidence", "validation.json"),
    validation,
  );
  const relativePaths = [
    "capture.json",
    "evidence/validation.json",
    "page.json",
    "reviews/reviews.json",
  ];
  const artifacts = [];
  for (const relativePath of relativePaths) {
    const bytes = await readFile(
      path.join(root, ...relativePath.split("/")),
    );
    artifacts.push({
      path: relativePath,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  await writeJson(path.join(root, "manifest.json"), {
    schema_version: "1.0",
    artifact_type: "coupang_extractor_bundle_manifest",
    capture_id: "capture-g1a-integration",
    status,
    browser_mode: "visible_browser_harness",
    product_id: PRODUCT_ID,
    item_id: ITEM_ID,
    vendor_item_id: VENDOR_ITEM_ID,
    normalized_url: DIRECT_URL,
    review_scope: reviewScope,
    validation,
    rights,
    artifacts,
  });
  return root;
}

function selectionFixture() {
  const discovery = discoverMarketCandidates({
    search_criteria: {
      query: "휴대용 선풍기",
      category: "생활가전",
    },
    producer: {
      agent_id: "discovery-agent",
      agent_session_id: "discovery-session",
    },
    observed_candidates: [
      {
        url: DIRECT_URL,
        relevance_score: 93,
        relevance_reasons: [
          {
            dimension: "function",
            observation: "같은 휴대용 냉풍 기능을 판매한다.",
            source_locator: "search-result:1",
          },
        ],
      },
    ],
  });
  return verifyCandidateSelection({
    discovery,
    candidate_set_digest: discovery.candidate_set_digest,
    selected_candidate_ids: [discovery.candidates[0].candidate_id],
    review: {
      kind: "independent_validation",
      validator: {
        agent_id: "market-validator",
        agent_session_id: "market-validator-session",
      },
      checks: [
        {
          check_id: "market-relevance",
          status: "PASS",
          evidence_candidate_ids: [
            discovery.candidates[0].candidate_id,
          ],
        },
      ],
    },
  });
}

function genericEnvelope(workOrder, outputTypes, sessionId) {
  return {
    project_ref: project(sessionId),
    producer_agent_session_id: sessionId,
    input_set_digest: workOrder.input_set_digest,
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: outputTypes.map((type, index) => ({
      artifact_id: `${workOrder.stage_id.toLowerCase()}-${index}`,
      type,
      manifest_sha256: sha256(
        `${workOrder.work_order_id}:${type}:${index}`,
      ),
      member_ids: [`${type.replaceAll(".", "-")}.json`],
    })),
    execution_receipt: {
      execution_id: `execution-${workOrder.work_order_id}`,
      adapter_id: workOrder.runner_contract.adapter_id,
      adapter_version: "1.0.0",
      adapter_code_sha256: sha256(
        `adapter:${workOrder.runner_contract.adapter_id}`,
      ),
    },
  };
}

async function leaseAndSubmitGeneric(
  engine,
  stageId,
  outputTypes,
  sessionId,
) {
  const workOrder = await engine.lease(project(sessionId), {
    stage_ids: [stageId],
  });
  assert.equal(workOrder.stage_id, stageId);
  await engine.submit(
    workOrder.work_order_id,
    genericEnvelope(workOrder, outputTypes, sessionId),
  );
}

test("G1A lease→portable import→ResultEnvelope→submit→재시작 inspect가 market·receipt 실제 bytes를 재검증한다", async (t) => {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "coupang-g1a-project-"),
  );
  const bundleRoot = await createPortableBundle();
  const partialRoot = await createPortableBundle({
    status: "PARTIAL",
  });
  t.after(async () => {
    await Promise.all([
      rm(projectRoot, { recursive: true, force: true }),
      rm(bundleRoot, { recursive: true, force: true }),
      rm(partialRoot, { recursive: true, force: true }),
    ]);
  });

  const engine = createWorkflowEngine({ projectRoot });
  await leaseAndSubmitGeneric(
    engine,
    "S0_INTAKE",
    ["project.intake"],
    "intake-worker",
  );
  await leaseAndSubmitGeneric(
    engine,
    "G0B_PHOTO",
    ["identity.photo_set"],
    "photo-worker",
  );
  await leaseAndSubmitGeneric(
    engine,
    "G1B_KNOWLEDGE",
    ["knowledge.snapshot", "receipt.dependency_closure"],
    "knowledge-worker",
  );
  await leaseAndSubmitGeneric(
    engine,
    "G1D_DISCOVERY",
    ["market.competitor_candidates"],
    "discovery-worker",
  );

  const selection = selectionFixture();
  const selectionChallenge = await engine.advance(
    project("market-selector"),
  );
  assert.equal(selectionChallenge.stage_id, "G1DQ_SELECTION");
  await engine.decide(selectionChallenge.challenge.challenge_id, {
    project_ref: project("market-selector"),
    nonce: selectionChallenge.challenge.nonce,
    subject_artifact_set_digest:
      selectionChallenge.challenge.subject_artifact_set_digest,
    decision: "approved",
    decided_by: "market-selector",
    approval_channel: "coupang-adapter-integration",
    selection_artifact: selection.selection_artifact,
  });

  const workOrder = await engine.lease(project("coupang-worker"), {
    stage_ids: ["G1A_MARKET"],
  });
  assert.equal(workOrder.stage_id, "G1A_MARKET");
  assert.equal(
    workOrder.runner_contract.adapter_id,
    "CoupangExtractorAdapter",
  );
  const candidateId =
    selection.selection_artifact.selected_candidates[0].candidate_id;

  await assert.rejects(
    materializeCoupangBundle({
      bundleRoot: partialRoot,
      projectRoot,
      selection: selection.selection_artifact,
      candidateId,
      captureId: "partial-must-not-commit",
    }),
    (error) => error.code === "COUPANG_PROVIDER_NOT_READY",
  );

  const imported = await materializeCoupangBundle({
    bundleRoot,
    projectRoot,
    selection: selection.selection_artifact,
    candidateId,
    captureId: "capture-g1a-integration",
  });
  const envelope = buildCoupangWorkflowEnvelope({
    imported,
    workOrder,
    projectRef: project("coupang-worker"),
  });
  assert.deepEqual(
    envelope.output_artifacts
      .map((artifact) => artifact.type)
      .sort(),
    ["evidence.market_snapshot", "receipt.importer"],
  );
  assert.equal(envelope.fencing_token, workOrder.fencing_token);
  assert.equal(envelope.attempt, workOrder.attempt);
  assert.equal(
    envelope.input_set_digest,
    workOrder.input_set_digest,
  );
  const resultEnvelopePath = path.join(
    projectRoot,
    "g1a-coupang-result-envelope.json",
  );
  await writeJson(resultEnvelopePath, envelope);
  const submitted = spawnSync(
    process.execPath,
    [
      CLI_PATH,
      "worker-submit",
      "--project",
      projectRoot,
      "--work-order",
      workOrder.work_order_id,
      "--result",
      resultEnvelopePath,
    ],
    {
      cwd: path.dirname(CLI_PATH),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(submitted.status, 0, submitted.stderr);
  const submittedResult = JSON.parse(submitted.stdout);
  assert.equal(submittedResult.kind, "Committed");
  assert.equal(submittedResult.stage_id, "G1A_MARKET");

  const restarted = createWorkflowEngine({ projectRoot });
  const status = await restarted.inspect(project());
  assert.equal(status.stages.G1A_MARKET.status, "completed");
  const committed = status.artifacts.filter(
    (artifact) => artifact.produced_by_stage === "G1A_MARKET",
  );
  assert.deepEqual(
    committed.map((artifact) => artifact.type).sort(),
    ["evidence.market_snapshot", "receipt.importer"],
  );
  const market = committed.find(
    (artifact) => artifact.type === "evidence.market_snapshot",
  );
  const receipt = committed.find(
    (artifact) => artifact.type === "receipt.importer",
  );
  assert.ok(
    committed.every(
      (artifact) =>
        artifact.record_locator.startsWith(
          ".detail-page/workflow/artifacts/",
        ) && /^[a-f0-9]{64}$/.test(artifact.record_sha256),
    ),
  );
  const marketRecord = JSON.parse(
    await readFile(
      path.join(
        projectRoot,
        ...market.record_locator.split("/"),
      ),
      "utf8",
    ),
  );
  const receiptRecord = JSON.parse(
    await readFile(
      path.join(
        projectRoot,
        ...receipt.record_locator.split("/"),
      ),
      "utf8",
    ),
  );
  assert.equal(
    marketRecord.artifact.member_manifest.policy,
    "materialized",
  );
  assert.equal(
    marketRecord.artifact.member_manifest.members.length,
    5,
  );
  assert.equal(
    receiptRecord.artifact.member_manifest.policy,
    "materialized",
  );
  assert.equal(
    receiptRecord.artifact.member_manifest.members.length,
    1,
  );

  const receiptMember =
    receiptRecord.artifact.member_manifest.members[0];
  const receiptPath = path.join(
    projectRoot,
    ...receiptMember.locator.split("/"),
  );
  const storedReceiptBytes = await readFile(receiptPath);
  assert.equal(storedReceiptBytes.length, receiptMember.size_bytes);
  assert.equal(sha256(storedReceiptBytes), receiptMember.sha256);

  const tamperedReceipt = Buffer.from(storedReceiptBytes);
  tamperedReceipt[0] =
    tamperedReceipt[0] === 0x7b ? 0x5b : 0x7b;
  await writeFile(receiptPath, tamperedReceipt);
  await assert.rejects(
    createWorkflowEngine({ projectRoot }).inspect(project()),
    (error) => error.code === "MATERIALIZED_MEMBER_HASH_MISMATCH",
  );
});
