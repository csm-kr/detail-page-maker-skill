import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
import { startStudioV1Server } from "../../skills/detail-page-maker-skill/scripts/runtime/studio-v1-server.mjs";


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


test(
  "실제 브라우저 캡처로 780px WebP와 이미지 전용 Wing HTML을 만든다",
  { skip: process.env.RUN_BROWSER_INTEGRATION !== "1" },
  async () => {
    const temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), "detail-page-wing-browser-"),
    );
    let server;
    try {
      const created = await createProject({
        name: "브라우저 통합 테스트",
        supplierUrl: "https://supplier.example/123456",
        root: temporaryRoot,
      });
      const animatedGifRelative =
        ".detail-page/generation/approved/gif/wing-motion.gif";
      const animatedGifPath = path.join(
        created.projectRoot,
        ...animatedGifRelative.split("/"),
      );
      await mkdir(path.dirname(animatedGifPath), { recursive: true });
      await writeFile(
        animatedGifPath,
        Buffer.from(
          "R0lGODlhCAAIAIEAAAAAAP8AAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJDAAAACwAAAAACAAIAAAIGAABCBxIsCCAAAgDEEyocCDDhQkNSpQYEAAh+QQJDAAAACwEAAIABAAEAIEAAAD/AAAAAAAAAAAICQADCBxIsGCAgAA7",
          "base64",
        ),
      );
      const authoringPath = path.join(
        created.projectRoot,
        ".detail-page",
        "authoring",
        "detail-page.html",
      );
      const authoringHtml = await readFile(authoringPath, "utf8");
      await writeFile(
        authoringPath,
        authoringHtml.replace(
          '<div class="placeholder" data-layer-id="proof-media" data-edit-object data-object-label="승인 에셋 자리">승인 에셋 자리</div>',
          `<img src="/${animatedGifRelative}" alt="제품 사용 변화" style="display:block;width:100%;height:180px;object-fit:cover">`,
        ),
        "utf8",
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

      const remoteAssets = new Map();
      const started = await startStudioV1Server({
        projectRoot: created.projectRoot,
        port: 0,
        open: false,
        cloudflarePreflightImpl: async () => ({
          status: "connected",
          state: "connected",
          provider: "cloudflare-pages",
          pagesProject: "browser-test-assets",
          publicBaseUrl:
            "https://browser-test-assets.pages.dev",
          productionBranch: "main",
          wranglerVersion: "4.123.0",
          credentials: "os-keyring",
        }),
        cloudflareUploadImpl: async ({
          exportRoot,
          projectKey,
          exportId,
        }) => {
          const manifest = JSON.parse(
            await readFile(
              path.join(exportRoot, "cdn-upload-manifest.json"),
              "utf8",
            ),
          );
          for (const asset of manifest.assets) {
            remoteAssets.set(
              asset.cdn_url,
              await readFile(
                path.join(exportRoot, "assets", asset.filename),
              ),
            );
          }
          return {
            status: "completed",
            state: "completed",
            namespaceUrl:
              `https://browser-test-assets.pages.dev/${projectKey}/${exportId}`,
            verification: { assetCount: manifest.assets.length },
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
      await fetch(new URL("/api/v1/workflow", started.url), {
        headers: {
          "X-Detail-Page-Studio-Capability":
            started.capabilityToken,
        },
      });
      const stateStore = createFileStateStore(
        created.projectRoot,
      );
      const workflowState = await stateStore.load(project.id);
      await addVerifiedPublishApproval(
        workflowState,
        created.projectRoot,
      );
      await stateStore.save(project.id, workflowState);
      const response = await fetch(
        new URL("/api/v1/exports/coupang-wing", started.url),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Detail-Page-Studio-Capability":
              started.capabilityToken,
          },
          body: JSON.stringify({}),
        },
      );
      const payload = await response.json();
      let failureDetail = "";
      if (response.status !== 200) {
        const exportsRoot = path.join(created.projectRoot, "output", "wing");
        const exportEntries = await readdir(exportsRoot, {
          withFileTypes: true,
        });
        const failedExport = exportEntries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .find((name) => name.startsWith("wing-"));
        if (failedExport) {
          failureDetail = await readFile(
            path.join(exportsRoot, failedExport, "export-error.log"),
            "utf8",
          ).catch(() => "");
        }
      }
      assert.equal(
        response.status,
        200,
        `${JSON.stringify(payload, null, 2)}\n${failureDetail}`,
      );
      assert.equal(payload.result.assetCount, 3);
      assert.equal(payload.result.remoteVerification, "passed");

      const outputRoot = payload.result.outputRoot;
      const manifest = JSON.parse(
        await readFile(
          path.join(outputRoot, "cdn-upload-manifest.json"),
          "utf8",
        ),
      );
      assert.equal(manifest.local_qa.all_width_780, true);
      assert.equal(manifest.local_qa.all_under_10mb, true);
      assert.equal(manifest.local_qa.wing_disallowed_markup_count, 0);
      assert.equal(manifest.local_qa.wing_non_https_image_count, 0);
      assert.equal(manifest.remote_verification.status, "passed");
      const animatedAssets = manifest.assets.filter(
        (asset) => asset.kind === "animated",
      );
      assert.equal(animatedAssets.length, 1);
      assert.ok(animatedAssets[0].frames > 1);
      assert.ok(animatedAssets[0].duration_ms > 0);
      assert.equal(animatedAssets[0].loop_count, 0);

      const animatedWebpPath = path.join(
        outputRoot,
        "assets",
        animatedAssets[0].filename,
      );
      const inspected = spawnSync(
        "python",
        [
          "-X",
          "utf8",
          "-c",
          [
            "from PIL import Image",
            "import json, sys",
            "image = Image.open(sys.argv[1])",
            "print(json.dumps({",
            "  'format': image.format,",
            "  'frames': int(getattr(image, 'n_frames', 1)),",
            "  'animated': bool(getattr(image, 'is_animated', False)),",
            "  'loop': int(image.info.get('loop', -1))",
            "}))",
          ].join("\n"),
          animatedWebpPath,
        ],
        {
          encoding: "utf8",
          windowsHide: true,
        },
      );
      assert.equal(inspected.status, 0, inspected.stderr);
      const animatedWebp = JSON.parse(inspected.stdout);
      assert.equal(animatedWebp.format, "WEBP");
      assert.equal(animatedWebp.animated, true);
      assert.ok(animatedWebp.frames > 1);
      assert.equal(animatedWebp.loop, 0);

      const html = await readFile(
        path.join(outputRoot, "coupang-wing-detail-780.html"),
        "utf8",
      );
      assert.match(html, /^<div align="center">\r?\n/);
      assert.equal((html.match(/<img /g) || []).length, 3);
      assert.doesNotMatch(
        html,
        /<(?:style|script|svg|iframe|video|canvas)\b|\s(?:class|style)=/i,
      );

      const assets = await readdir(path.join(outputRoot, "assets"));
      assert.equal(assets.length, 3);
      assert.ok(assets.every((name) => name.endsWith(".webp")));
    } finally {
      if (server) await closeServer(server);
      const resolvedTemporaryRoot = path.resolve(temporaryRoot);
      const resolvedSystemTemp = `${path.resolve(os.tmpdir())}${path.sep}`;
      assert.ok(resolvedTemporaryRoot.startsWith(resolvedSystemTemp));
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  },
);
