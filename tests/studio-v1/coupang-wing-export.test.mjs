import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/lib/new-project.mjs";
import { artifactSetDigest } from "../../skills/detail-page-maker-skill/scripts/orchestration/artifact-graph.mjs";
import { createArtifactRecordStore } from "../../skills/detail-page-maker-skill/scripts/orchestration/artifact-record-store.mjs";
import { createFileStateStore } from "../../skills/detail-page-maker-skill/scripts/orchestration/file-state-store.mjs";
import { createStructuralValidationReceipt } from "../../skills/detail-page-maker-skill/scripts/orchestration/structural-validation.mjs";
import { CloudflarePagesUploaderError } from "../../skills/detail-page-maker-skill/scripts/runtime/cloudflare-pages-uploader.mjs";
import {
  publishCoupangWingToCloudflare,
  startStudioV1Server,
} from "../../skills/detail-page-maker-skill/scripts/runtime/studio-v1-server.mjs";

const CAPABILITY_BY_ORIGIN = new Map();

async function requestJson(baseUrl, pathname, body) {
  const capabilityToken = CAPABILITY_BY_ORIGIN.get(
    new URL(baseUrl).origin,
  );
  const response = await fetch(new URL(pathname, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-Detail-Page-Studio-Capability": capabilityToken,
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}


async function closeServer(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function addVerifiedPublishApproval(state, projectRoot) {
  const sources = [
    {
      artifact_id: "g5-publish-bundle",
      type: "page.publish_bundle",
      manifest_sha256: "1".repeat(64),
      member_ids: ["publish.html"],
      status: "fresh",
      produced_by_stage: "G5_PUBLISH_QA",
    },
    {
      artifact_id: "g5-qa-receipt",
      type: "qa.validation_receipt",
      manifest_sha256: "2".repeat(64),
      member_ids: ["validation.json"],
      status: "fresh",
      produced_by_stage: "G5_PUBLISH_QA",
      verdict: "PASS",
      score: 100,
      quality_metrics: {
        behance_quality_score: 100,
        critical_dimension_min_score: 100,
        deterministic_hard_failure_count: 0,
      },
      hard_failures: [],
    },
  ];
  const subjectDigest = artifactSetDigest(
    sources.map((artifact) => ({
      artifact_id: artifact.artifact_id,
      manifest_sha256: artifact.manifest_sha256,
      member_ids: artifact.member_ids,
      relation: "evidence_for",
    })),
  );
  const receipt = {
    project_ref: {
      project_id: state.project_id,
      input_digest: state.input_digest,
      agent_session_id: "studio-v1-user",
    },
    nonce: "nonce-g5-exact",
    subject_artifact_set_digest: subjectDigest,
    decision: "approved",
    decided_by: "local-user",
    approval_channel: "studio-v1",
  };
  const approval = {
    artifact_id: "decision-g5u_approval-exact",
    type: "decision.publish_approval",
    manifest_sha256: createHash("sha256")
      .update(JSON.stringify(receipt))
      .digest("hex"),
    member_ids: ["decision.json"],
    status: "fresh",
    input_set_digest: subjectDigest,
    produced_by_stage: "G5U_APPROVAL",
    producer_agent_session_id: "studio-v1-user",
    approval_receipt: receipt,
  };
  const workOrder = {
    work_order_id: "fixture-g5-publish",
    stage_id: "G5_PUBLISH_QA",
    assigned_agent_session_id: "g5-publish-producer",
    input_set_digest: "9".repeat(64),
    expected_output_types: sources.map((artifact) => artifact.type),
    allowed_output_variants: [],
    gate_policy_id: "policy.qa.publish-97.v1",
  };
  const commitValidationReceipt =
    createStructuralValidationReceipt({
      workOrder,
      outputArtifacts: sources,
      workflowVersion: state.workflow_version,
      createdAt: "2026-07-30T10:00:00.000Z",
    });
  const recordStore = createArtifactRecordStore(projectRoot);
  for (const source of sources) {
    source.producer_agent_session_id = "g5-publish-producer";
    source.commit_validation_receipt =
      structuredClone(commitValidationReceipt);
    const record = await recordStore.commit({
      project_id: state.project_id,
      work_order_id: workOrder.work_order_id,
      stage_id: workOrder.stage_id,
      input_set_digest: workOrder.input_set_digest,
      producer_agent_session_id: "g5-publish-producer",
      artifact: source,
      execution_receipt: {
        execution_id: "execution-fixture-g5-publish",
        adapter_id: "WorkflowOrchestratorInternalAdapter",
        adapter_version: "1.0.0",
        adapter_code_sha256: "8".repeat(64),
      },
      commit_validation_receipt: commitValidationReceipt,
    });
    source.record_locator = record.record_locator;
    source.record_sha256 = record.record_sha256;
  }
  state.stages.G5U_APPROVAL.status = "approved";
  state.graph.artifacts = [...sources, approval];
  state.graph.edges = sources.map((artifact) => ({
    from: artifact.artifact_id,
    to: approval.artifact_id,
    relation: "evidence_for",
  }));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

// Wing 내보내기는 workflow artifact와 일치하는 immutable revision
// directory 하나를 요구한다.
async function addCommittedStudioRevision(state, projectRoot) {
  const html = [
    "<!doctype html>",
    '<html lang="ko"><body><main>',
    '<section data-section-id="hero"><h1>승인 상세페이지</h1></section>',
    "</main></body></html>",
  ].join("");
  const revisionBody = {
    schema_version: "1.0",
    revision_id: "studio-rev-wing-fixture",
    revision_kind: "committed",
    mutable: false,
    artifact_id: "studio-artifact-wing-fixture",
    artifact_sha256: "4".repeat(64),
    html_sha256: sha256(html),
    rubric_sha256: "5".repeat(64),
  };
  const revision = {
    ...revisionBody,
    commit_sha256: canonicalSha256(revisionBody),
    committed_at: "2026-07-30T12:00:00.000Z",
  };
  const revisionRoot = path.join(
    projectRoot,
    ".detail-page",
    "workflow",
    "revisions",
    revision.revision_id,
  );
  await mkdir(revisionRoot, { recursive: true });
  await writeFile(path.join(revisionRoot, "index.html"), html, "utf8");
  await writeFile(
    path.join(revisionRoot, "revision.json"),
    `${JSON.stringify(revision, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(revisionRoot, "asset-manifest.json"),
    `${JSON.stringify({ schema_version: "1.0", assets: [] }, null, 2)}\n`,
    "utf8",
  );

  const artifact = {
    artifact_id: revision.artifact_id,
    type: "studio.committed_revision",
    manifest_sha256: revision.commit_sha256,
    member_ids: ["revision.json", "index.html"],
    status: "fresh",
    produced_by_stage: "G4C_STUDIO_COMMIT",
    producer_agent_session_id: "studio-commit-producer",
  };
  const workOrder = {
    work_order_id: "fixture-g4c-studio-commit",
    stage_id: "G4C_STUDIO_COMMIT",
    assigned_agent_session_id: "studio-commit-producer",
    input_set_digest: "9".repeat(64),
    expected_output_types: [artifact.type],
    allowed_output_variants: [],
    gate_policy_id: "policy.studio.commit.v1",
  };
  const commitValidationReceipt = createStructuralValidationReceipt({
    workOrder,
    outputArtifacts: [artifact],
    workflowVersion: state.workflow_version,
    createdAt: "2026-07-30T10:00:00.000Z",
  });
  artifact.commit_validation_receipt = structuredClone(
    commitValidationReceipt,
  );
  const record = await createArtifactRecordStore(projectRoot).commit({
    project_id: state.project_id,
    work_order_id: workOrder.work_order_id,
    stage_id: workOrder.stage_id,
    input_set_digest: workOrder.input_set_digest,
    producer_agent_session_id: "studio-commit-producer",
    artifact,
    execution_receipt: {
      execution_id: "execution-fixture-g4c-studio-commit",
      adapter_id: "StudioCommitAdapter",
      adapter_version: "1.0.0",
      adapter_code_sha256: "8".repeat(64),
    },
    commit_validation_receipt: commitValidationReceipt,
  });
  artifact.record_locator = record.record_locator;
  artifact.record_sha256 = record.record_sha256;

  state.stages.G4C_STUDIO_COMMIT.status = "completed";
  state.graph.artifacts.push(artifact);
  const publishBundle = state.graph.artifacts.find(
    (candidate) => candidate.type === "page.publish_bundle",
  );
  state.graph.edges.push({
    from: artifact.artifact_id,
    to: publishBundle.artifact_id,
    relation: "evidence_for",
  });
}


test("쿠팡 Wing 내보내기는 G5 뒤 config namespace로 render·upload·verify하고 client URL을 무시한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-v1-wing-export-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "테스트 상품",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    const configuredBaseUrl = "https://configured-assets.pages.dev";
    const renderedCdnBases = [];
    const uploaded = [];
    const remoteAssets = new Map();
    const started = await startStudioV1Server({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
      cloudflarePreflightImpl: async () => ({
        status: "connected",
        state: "connected",
        provider: "cloudflare-pages",
        pagesProject: "configured-assets",
        publicBaseUrl: configuredBaseUrl,
        productionBranch: "main",
        wranglerVersion: "4.123.0",
        credentials: "os-keyring",
      }),
      wingRenderImpl: async ({
        projectRoot,
        cdnBaseUrl,
        identity,
      }) => {
        renderedCdnBases.push(cdnBaseUrl);
        await mkdir(path.join(identity.outputRoot, "assets"), {
          recursive: true,
        });
        const assetBytes = Buffer.from("server-integrated-webp");
        const filename = "section-01.webp";
        const cdnUrl = `${identity.cdnBaseUrl}/${filename}`;
        const manifest = {
          schema_version: "2.0",
          export_id: identity.exportId,
          project_key: identity.projectKey,
          cdn_base_url: identity.cdnBaseUrl,
          assets: [
            {
              filename,
              mime_type: "image/webp",
              bytes: assetBytes.length,
              sha256: createHash("sha256")
                .update(assetBytes)
                .digest("hex"),
              cdn_url: cdnUrl,
            },
          ],
          remote_verification: { status: "pending" },
        };
        const wingHtml =
          `<div align="center">\n  <img src="${cdnUrl}" width="780" alt="상품"><br>\n</div>\n`;
        await Promise.all([
          writeFile(
            path.join(identity.outputRoot, "assets", filename),
            assetBytes,
          ),
          writeFile(
            path.join(identity.outputRoot, "cdn-upload-manifest.json"),
            `${JSON.stringify(manifest, null, 2)}\n`,
          ),
          writeFile(
            path.join(
              identity.outputRoot,
              "coupang-wing-detail-780.html",
            ),
            wingHtml,
          ),
        ]);
        remoteAssets.set(cdnUrl, assetBytes);
        return {
          outputRoot: identity.outputRoot,
          relativeOutputRoot: path
            .relative(projectRoot, identity.outputRoot)
            .replaceAll("\\", "/"),
          previewUrl: `/${path
            .relative(projectRoot, identity.outputRoot)
            .replaceAll("\\", "/")}/preview-local-780.html`,
          wingHtmlUrl: `/${path
            .relative(projectRoot, identity.outputRoot)
            .replaceAll("\\", "/")}/coupang-wing-detail-780.html`,
          exportId: identity.exportId,
          projectKey: identity.projectKey,
          cdnBaseUrl: identity.cdnBaseUrl,
          assetCount: 1,
          staticCount: 1,
          animatedCount: 0,
          remoteVerification: "pending",
        };
      },
      cloudflareUploadImpl: async (input) => {
        uploaded.push(input);
        return {
          status: "completed",
          state: "completed",
          namespaceUrl:
            `${configuredBaseUrl}/${input.projectKey}/${input.exportId}`,
          verification: { assetCount: 1 },
        };
      },
      wingFetchImpl: async (url) =>
        new Response(remoteAssets.get(url), {
          status: remoteAssets.has(url) ? 200 : 404,
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control":
              "public, max-age=31536000, immutable",
          },
        }),
    });
    server = started.server;
    const baseUrl = new URL(started.url).origin;
    CAPABILITY_BY_ORIGIN.set(baseUrl, started.capabilityToken);
    const connectionStatus = await requestJson(
      baseUrl,
      "/api/v1/cloudflare-pages/status",
    );
    assert.equal(connectionStatus.response.status, 200);
    assert.equal(connectionStatus.payload.connected, true);
    assert.equal(
      connectionStatus.payload.connection.publicBaseUrl,
      configuredBaseUrl,
    );

    const blockedGate = await requestJson(baseUrl, "/api/v1/gate");
    assert.equal(blockedGate.response.status, 200);
    assert.equal(blockedGate.payload.exportAllowed, true);
    assert.equal(blockedGate.payload.coupangWingExportAllowed, false);
    assert.ok(blockedGate.payload.coupangWingBlockers.length >= 1);

    const blockedExport = await requestJson(
      baseUrl,
      "/api/v1/exports/coupang-wing",
      { cdnBaseUrl: "https://cdn.example.com/coupang/product-v1" },
    );
    assert.equal(blockedExport.response.status, 409);
    assert.equal(
      blockedExport.payload.error.code,
      "COUPANG_WING_EXPORT_BLOCKED",
    );

    const projectPath = path.join(created.projectRoot, "project.json");
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    project.finalQa = {
      status: "passed",
      score: 98,
      hardFailures: [],
      warnings: [],
      userApproved: true,
      reportPath: null,
    };
    project.inputDigest = "a".repeat(64);
    await writeFile(
      projectPath,
      `${JSON.stringify(project, null, 2)}\n`,
      "utf8",
    );

    const legacyOnlyGate = await requestJson(baseUrl, "/api/v1/gate");
    assert.equal(legacyOnlyGate.response.status, 200);
    assert.equal(legacyOnlyGate.payload.coupangWingExportAllowed, false);
    assert.equal(legacyOnlyGate.payload.legacyUserPublishApproved, true);
    assert.equal(legacyOnlyGate.payload.workflowPublishApproved, false);

    await requestJson(baseUrl, "/api/v1/workflow");
    const stateStore = createFileStateStore(created.projectRoot);
    const workflowState = await stateStore.load(project.id);
    await addVerifiedPublishApproval(
      workflowState,
      created.projectRoot,
    );
    await addCommittedStudioRevision(
      workflowState,
      created.projectRoot,
    );
    await stateStore.save(project.id, workflowState);

    const readyGate = await requestJson(baseUrl, "/api/v1/gate");
    assert.equal(readyGate.response.status, 200);
    assert.equal(readyGate.payload.coupangWingExportAllowed, true);
    assert.equal(readyGate.payload.finalQaScore, 98);
    assert.equal(readyGate.payload.userPublishApproved, true);

    const sourceBefore = await readFile(
      path.join(created.projectRoot, "output", "detail-page.html"),
    );
    const completed = await requestJson(
      baseUrl,
      "/api/v1/exports/coupang-wing",
      { cdnBaseUrl: "https://attacker.invalid/ignored" },
    );
    assert.equal(completed.response.status, 200);
    assert.equal(completed.payload.result.status, "completed");
    assert.equal(completed.payload.result.remoteVerification, "passed");
    assert.deepEqual(renderedCdnBases, [configuredBaseUrl]);
    assert.equal(uploaded.length, 1);
    assert.match(
      completed.payload.result.cdnBaseUrl,
      /^https:\/\/configured-assets\.pages\.dev\/123456\/wing-/,
    );
    assert.doesNotMatch(
      completed.payload.result.cdnBaseUrl,
      /attacker\.invalid/,
    );
    const job = JSON.parse(
      await readFile(
        path.join(
          created.projectRoot,
          ".detail-page",
          "workflow",
          "jobs",
          `${completed.payload.result.exportId}.json`,
        ),
        "utf8",
      ),
    );
    assert.equal(job.status, "completed");
    assert.deepEqual(
      job.history.map((entry) => entry.status),
      ["preparing", "generated", "uploading", "verifying", "completed"],
    );
    assert.deepEqual(
      await readFile(
        path.join(created.projectRoot, "output", "detail-page.html"),
      ),
      sourceBefore,
    );
    assert.match(
      await readFile(
        path.join(
          created.projectRoot,
          "output",
          "wing",
          completed.payload.result.exportId,
          "detail-page.html",
        ),
        "utf8",
      ),
      /configured-assets\.pages\.dev/,
    );
  } finally {
    if (server) await closeServer(server);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Cloudflare upload 실패는 typed job state만 남기고 기존 output을 바꾸지 않는다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-v1-wing-failure-"),
  );
  try {
    const created = await createProject({
      name: "실패 보존 상품",
      supplierUrl: "https://supplier.example/654321",
      root: temporaryRoot,
    });
    const outputPath = path.join(
      created.projectRoot,
      "output",
      "detail-page.html",
    );
    const before = await readFile(outputPath);
    await assert.rejects(
      publishCoupangWingToCloudflare({
        projectRoot: created.projectRoot,
        pageUrl: "http://127.0.0.1/authoring.html",
        productName: "실패 보존 상품",
        projectKey: "654321",
        preflightImpl: async () => ({
          pagesProject: "configured-assets",
          publicBaseUrl: "https://configured-assets.pages.dev",
        }),
        renderImpl: async ({ projectRoot, identity }) => ({
          exportId: identity.exportId,
          projectKey: identity.projectKey,
          cdnBaseUrl: identity.cdnBaseUrl,
          relativeOutputRoot: path
            .relative(projectRoot, identity.outputRoot)
            .replaceAll("\\", "/"),
          assetCount: 1,
          staticCount: 1,
          animatedCount: 0,
        }),
        uploadImpl: async () => {
          throw new CloudflarePagesUploaderError(
            "PAGES_DEPLOY_FAILED",
            "의도한 업로드 실패",
            { state: "upload_failed" },
          );
        },
        verifyImpl: async () => {
          throw new Error("verify must not run");
        },
      }),
      (error) => {
        assert.equal(error.code, "PAGES_DEPLOY_FAILED");
        assert.equal(error.state, "upload_failed");
        return true;
      },
    );
    assert.deepEqual(await readFile(outputPath), before);
    const jobs = await readdir(
      path.join(
        created.projectRoot,
        ".detail-page",
        "workflow",
        "jobs",
      ),
    );
    assert.equal(jobs.length, 1);
    const job = JSON.parse(
      await readFile(
        path.join(
          created.projectRoot,
          ".detail-page",
          "workflow",
          "jobs",
          jobs[0],
        ),
        "utf8",
      ),
    );
    assert.equal(job.status, "upload_failed");
    assert.equal(job.error.code, "PAGES_DEPLOY_FAILED");
    const project = JSON.parse(
      await readFile(
        path.join(created.projectRoot, "project.json"),
        "utf8",
      ),
    );
    assert.equal(project.wing_export_required, true);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
