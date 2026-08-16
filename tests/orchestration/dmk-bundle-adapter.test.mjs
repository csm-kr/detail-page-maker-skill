import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importDmkBundle } from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/dmk-bundle-adapter.mjs";
import {
  buildDmkWorkflowEnvelope,
  materializeDmkBundle,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/dmk-bundle-adapter.mjs";
import {
  createWorkflowEngine,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-engine.mjs";

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname,
  "../fixtures/orchestration/dmk-minimal",
);
const MANIFEST_SHA256 =
  "ba39610eb60017b566765f4236b1b67f035b5998ca12b822d3382f145ead5d7d";
const SUPPLIER_URL = "https://domeggook.com/56328525?from=popular100";
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
    project_id: "project-dmk-g0a-integration",
    input_digest: INPUT_DIGEST,
    agent_session_id: agentSessionId,
  };
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

async function submitIntake(engine) {
  const sessionId = "intake-worker";
  const workOrder = await engine.lease(project(sessionId), {
    stage_ids: ["S0_INTAKE"],
  });
  assert.equal(workOrder.stage_id, "S0_INTAKE");
  await engine.submit(
    workOrder.work_order_id,
    genericEnvelope(workOrder, ["project.intake"], sessionId),
  );
}

test("검증된 dmk portable bundle을 원본 변경 없이 G0 공급처 StageResult로 가져온다", async () => {
  const manifestPath = path.join(FIXTURE_ROOT, "manifest.json");
  const manifestBefore = await readFile(manifestPath);

  const result = await importDmkBundle({
    bundleRoot: FIXTURE_ROOT,
    expectedProductId: "56328525",
    expectedSupplierUrl: SUPPLIER_URL,
  });

  assert.equal(result.schema_version, "2.0-draft");
  assert.equal(result.stage_id, "G0_SUPPLIER");
  assert.equal(result.status, "completed");
  assert.equal(result.provider_status, "VALID");
  assert.equal(result.outputs.length, 1);
  assert.equal(result.outputs[0].artifact_type, "supplier.snapshot");
  assert.equal(result.outputs[0].manifest_sha256, MANIFEST_SHA256);
  assert.deepEqual(result.outputs[0].consumers, ["G0R_RIGHTS"]);
  assert.equal(
    result.outputs[0].files.every(
      (file) =>
        ["evidence_reference", "unknown"].includes(file.rights) &&
        file.production_use_allowed === false,
    ),
    true,
  );
  assert.equal(
    result.importer_receipt.source_manifest_sha256,
    MANIFEST_SHA256,
  );
  assert.equal(result.importer_receipt.provider, "dmk-extractor");
  assert.equal(
    result.importer_receipt.provider_warnings.some(
      (warning) => warning.code === "RIGHTS_NOT_PROVEN",
    ),
    true,
  );
  assert.deepEqual(await readFile(manifestPath), manifestBefore);
});

test("요청 상품번호와 bundle 상품번호가 다르면 가져오기를 거부한다", async () => {
  await assert.rejects(
    importDmkBundle({
      bundleRoot: FIXTURE_ROOT,
      expectedProductId: "99999999",
      expectedSupplierUrl: "https://domeggook.com/99999999",
    }),
    (error) => {
      assert.equal(error.code, "PRODUCT_ID_MISMATCH");
      assert.equal(error.details.expected_product_id, "99999999");
      assert.equal(error.details.actual_product_id, "56328525");
      return true;
    },
  );
});

test("canonical supplier URL이 null이면 same-SKU bundle로 승인하지 않는다", async (t) => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "dmk-url-required-"),
  );
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const bundleRoot = path.join(temporaryRoot, "bundle");
  await cp(FIXTURE_ROOT, bundleRoot, { recursive: true });
  const manifestPath = path.join(bundleRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.canonical_supplier_url = null;
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    importDmkBundle({
      bundleRoot,
      expectedProductId: "56328525",
      expectedSupplierUrl: SUPPLIER_URL,
    }),
    (error) => error.code === "SUPPLIER_URL_REQUIRED",
  );
});

test("요청 supplier URL과 다른 item URL을 가진 bundle은 거부한다", async (t) => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "dmk-url-mismatch-"),
  );
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const bundleRoot = path.join(temporaryRoot, "bundle");
  await cp(FIXTURE_ROOT, bundleRoot, { recursive: true });
  const manifestPath = path.join(bundleRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.canonical_supplier_url =
    "https://domeggook.com/99999999";
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    importDmkBundle({
      bundleRoot,
      expectedProductId: "56328525",
      expectedSupplierUrl: SUPPLIER_URL,
    }),
    (error) =>
      error.code === "SUPPLIER_URL_PRODUCT_MISMATCH",
  );
});

test("manifest에 기록된 SHA-256과 파일 bytes가 다르면 가져오기를 거부한다", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "dmk-bundle-"));
  const bundleRoot = path.join(temporaryRoot, "bundle");
  try {
    await cp(FIXTURE_ROOT, bundleRoot, { recursive: true });
    await writeFile(
      path.join(bundleRoot, "thumbnail", "thumbnail.txt"),
      "tampered supplier file\n",
      "utf8",
    );

    await assert.rejects(
      importDmkBundle({
        bundleRoot,
        expectedProductId: "56328525",
        expectedSupplierUrl: SUPPLIER_URL,
      }),
      (error) => {
        assert.equal(error.code, "ARTIFACT_INTEGRITY_MISMATCH");
        assert.equal(error.details.path, "thumbnail/thumbnail.txt");
        assert.match(error.details.expected_sha256, /^[a-f0-9]{64}$/);
        assert.match(error.details.actual_sha256, /^[a-f0-9]{64}$/);
        assert.notEqual(
          error.details.actual_sha256,
          error.details.expected_sha256,
        );
        return true;
      },
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("정상 manifest 없이 실패 흔적만 있는 partial bundle을 거부한다", async () => {
  const bundleRoot = await mkdtemp(
    path.join(os.tmpdir(), "dmk-partial-bundle-"),
  );
  try {
    await writeFile(
      path.join(bundleRoot, "capture-failure.json"),
      `${JSON.stringify({
        status: "failed",
        failure_code: "DETAIL_EXPAND_FAILED",
      })}\n`,
      "utf8",
    );

    await assert.rejects(
      importDmkBundle({
        bundleRoot,
        expectedProductId: "56328525",
        expectedSupplierUrl: SUPPLIER_URL,
      }),
      (error) => {
        assert.equal(error.code, "PARTIAL_BUNDLE");
        assert.equal(error.details.bundle_root, bundleRoot);
        return true;
      },
    );
  } finally {
    await rm(bundleRoot, { recursive: true, force: true });
  }
});

test("검증된 bundle을 프로젝트 안에 원자적으로 복사하고 상대 locator로 고정한다", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "dmk-project-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  const materialized = await materializeDmkBundle({
    bundleRoot: FIXTURE_ROOT,
    projectRoot,
    expectedProductId: "56328525",
    expectedSupplierUrl: SUPPLIER_URL,
    captureId: "capture-g0-001",
  });

  assert.equal(
    materialized.outputs[0].source_bundle_path,
    ".detail-page/evidence/supplier/dmk/capture-g0-001",
  );
  assert.equal(
    materialized.importer_receipt.source_bundle_path,
    ".detail-page/evidence/supplier/dmk/capture-g0-001",
  );
  assert.equal(
    JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          ".detail-page",
          "evidence",
          "supplier",
          "dmk",
          "capture-g0-001",
          "manifest.json",
        ),
        "utf8",
      ),
    ).product_id,
    "56328525",
  );
  const workOrder = {
    work_order_id: "work-g0a-materialized",
    project_id: "project-56328525",
    stage_id: "G0A_SUPPLIER",
    assigned_agent_session_id: "dmk-agent-session",
    input_set_digest: "9".repeat(64),
    fencing_token: "fence-g0a-materialized",
    attempt: 1,
    runner_contract: {
      skill_id: "dmk-extractor",
      adapter_id: "DmkExtractorAdapter",
    },
    input_artifacts: [
      {
        artifact_id: "project-intake",
        type: "project.intake",
        manifest_sha256: "8".repeat(64),
      },
    ],
    expected_output_types: [
      "evidence.supplier_snapshot",
      "receipt.importer",
    ],
  };
  const envelope = buildDmkWorkflowEnvelope({
    imported: materialized,
    workOrder,
    projectRef: {
      project_id: "project-56328525",
      input_digest: "8".repeat(64),
      agent_session_id: "dmk-agent-session",
    },
  });
  const evidence = envelope.output_artifacts.find(
    (artifact) =>
      artifact.type === "evidence.supplier_snapshot",
  );
  assert.equal(evidence.member_manifest.policy, "materialized");
  assert.equal(
    evidence.member_manifest.members.every(
      (member) =>
        member.root_id === "project" &&
        member.locator.startsWith(
          ".detail-page/evidence/supplier/dmk/capture-g0-001/",
        ) &&
        /^[a-f0-9]{64}$/.test(member.sha256) &&
        Number.isSafeInteger(member.size_bytes),
    ),
    true,
  );
});

test("materialized importer 결과를 G0A engine ResultEnvelope로 변환한다", async () => {
  const imported = await importDmkBundle({
    bundleRoot: FIXTURE_ROOT,
    expectedProductId: "56328525",
    expectedSupplierUrl: SUPPLIER_URL,
  });
  const workOrder = {
    work_order_id: "work-g0a-001",
    project_id: "project-56328525",
    stage_id: "G0A_SUPPLIER",
    assigned_agent_session_id: "dmk-agent-session",
    input_set_digest: "9".repeat(64),
    fencing_token: "fence-g0a-001",
    attempt: 1,
    runner_contract: {
      skill_id: "dmk-extractor",
      adapter_id: "DmkExtractorAdapter",
    },
    input_artifacts: [
      {
        artifact_id: "project-intake",
        type: "project.intake",
        manifest_sha256: "8".repeat(64),
      },
    ],
    expected_output_types: [
      "evidence.supplier_snapshot",
      "receipt.importer",
    ],
  };
  const result = buildDmkWorkflowEnvelope({
    imported,
    workOrder,
    projectRef: {
      project_id: "project-56328525",
      input_digest: "8".repeat(64),
      agent_session_id: "dmk-agent-session",
    },
  });

  assert.deepEqual(
    result.output_artifacts.map((artifact) => artifact.type).sort(),
    ["evidence.supplier_snapshot", "receipt.importer"],
  );
  assert.equal(
    result.output_artifacts[0].manifest_sha256,
    imported.importer_receipt.normalized_manifest_sha256,
  );
  assert.equal(
    result.execution_receipt.adapter_code_sha256,
    imported.importer_receipt.importer_code_sha256,
  );
  assert.deepEqual(
    result.output_artifacts[0].member_manifest,
    {
      schema_version: "1.0",
      policy: "inline_or_virtual",
      members: [],
    },
  );
  assert.equal(result.input_set_digest, workOrder.input_set_digest);
});

test("G0A lease→dmk portable import→CLI submit→새 process inspect가 materialized bytes를 재검증한다", async (t) => {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "dmk-g0a-project-"),
  );
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  const engine = createWorkflowEngine({ projectRoot });
  await submitIntake(engine);
  const sessionId = "dmk-worker-session";
  const workOrder = await engine.lease(project(sessionId), {
    stage_ids: ["G0A_SUPPLIER"],
  });
  assert.equal(workOrder.stage_id, "G0A_SUPPLIER");
  assert.deepEqual(workOrder.runner_contract, {
    skill_id: "dmk-extractor",
    adapter_id: "DmkExtractorAdapter",
  });
  assert.match(workOrder.fencing_token, /^fence-[a-f0-9-]+$/);
  assert.equal(workOrder.attempt, 1);

  const imported = await materializeDmkBundle({
    bundleRoot: FIXTURE_ROOT,
    projectRoot,
    expectedProductId: "56328525",
    expectedSupplierUrl: SUPPLIER_URL,
    captureId: "capture-g0a-integration",
  });
  const envelope = buildDmkWorkflowEnvelope({
    imported,
    workOrder,
    projectRef: project(sessionId),
  });
  assert.equal(
    envelope.producer_agent_session_id,
    workOrder.assigned_agent_session_id,
  );
  assert.equal(envelope.input_set_digest, workOrder.input_set_digest);
  assert.equal(envelope.fencing_token, workOrder.fencing_token);
  assert.equal(envelope.attempt, workOrder.attempt);

  const resultPath = path.join(projectRoot, "g0a-dmk-result.json");
  await writeFile(
    resultPath,
    `${JSON.stringify(envelope, null, 2)}\n`,
    "utf8",
  );
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
      resultPath,
    ],
    {
      cwd: path.dirname(CLI_PATH),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(submitted.status, 0, submitted.stderr);
  assert.equal(JSON.parse(submitted.stdout).kind, "Committed");

  const statusProcess = spawnSync(
    process.execPath,
    [
      CLI_PATH,
      "workflow-status",
      "--project",
      projectRoot,
      "--project-id",
      project().project_id,
      "--input-digest",
      INPUT_DIGEST,
    ],
    {
      cwd: path.dirname(CLI_PATH),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(statusProcess.status, 0, statusProcess.stderr);
  const status = JSON.parse(statusProcess.stdout);
  assert.equal(status.stages.G0A_SUPPLIER.status, "completed");
  const supplier = status.artifacts.find(
    (artifact) =>
      artifact.produced_by_stage === "G0A_SUPPLIER" &&
      artifact.type === "evidence.supplier_snapshot",
  );
  assert.ok(supplier);
  const record = JSON.parse(
    await readFile(
      path.join(
        projectRoot,
        ...supplier.record_locator.split("/"),
      ),
      "utf8",
    ),
  );
  assert.equal(record.artifact.member_manifest.policy, "materialized");
  assert.ok(
    record.artifact.member_manifest.members.every((member) =>
      member.locator.startsWith(
        ".detail-page/evidence/supplier/dmk/capture-g0a-integration/",
      ),
    ),
  );

  const targetMember = record.artifact.member_manifest.members[0];
  const targetPath = path.join(
    projectRoot,
    ...targetMember.locator.split("/"),
  );
  const original = await readFile(targetPath);
  const tampered = Buffer.from(original);
  tampered[0] ^= 0xff;
  await writeFile(targetPath, tampered);

  const rejected = spawnSync(
    process.execPath,
    [
      CLI_PATH,
      "workflow-status",
      "--project",
      projectRoot,
      "--project-id",
      project().project_id,
      "--input-digest",
      INPUT_DIGEST,
    ],
    {
      cwd: path.dirname(CLI_PATH),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.notEqual(rejected.status, 0);
  assert.match(
    `${rejected.stdout}\n${rejected.stderr}`,
    /MATERIALIZED_MEMBER_HASH_MISMATCH/,
  );
});
