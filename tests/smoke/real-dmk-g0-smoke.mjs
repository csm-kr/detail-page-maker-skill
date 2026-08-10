import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildDmkWorkflowEnvelope,
  materializeDmkBundle,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/dmk-bundle-adapter.mjs";
import {
  createWorkflowEngine,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-engine.mjs";

const hash = (value) =>
  createHash("sha256").update(value).digest("hex");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
if (!args.bundle || !args.out) {
  throw new Error("--bundle과 --out이 필요합니다.");
}

const projectRoot = path.resolve(args.out);
await mkdir(path.dirname(projectRoot), { recursive: true });
await mkdir(projectRoot, { recursive: false });
const projectRef = {
  project_id: "project-56328525-real-g0",
  input_digest: hash("https://domeggook.com/56328525?from=popular100"),
  agent_session_id: "real-smoke-coordinator",
};
const engine = createWorkflowEngine({ projectRoot });
const intake = await engine.lease(
  { ...projectRef, agent_session_id: "real-smoke-intake" },
  { stage_ids: ["S0_INTAKE"] },
);
const scriptSha256 = hash(
  await readFile(new URL(import.meta.url)),
);
await engine.submit(intake.work_order_id, {
  project_ref: {
    ...projectRef,
    agent_session_id: "real-smoke-intake",
  },
  producer_agent_session_id: "real-smoke-intake",
  input_set_digest: intake.input_set_digest,
  output_artifacts: [
    {
      artifact_id: "intake-domeggook-56328525",
      type: "project.intake",
      manifest_sha256: projectRef.input_digest,
      member_ids: ["supplier-url"],
    },
  ],
  execution_receipt: {
    execution_id: "execution-real-smoke-intake",
    adapter_id: "real-smoke-intake",
    adapter_version: "1.0.0",
    adapter_code_sha256: scriptSha256,
  },
});

const supplier = await engine.lease(
  { ...projectRef, agent_session_id: "real-smoke-dmk" },
  { stage_ids: ["G0A_SUPPLIER"] },
);
const imported = await materializeDmkBundle({
  bundleRoot: path.resolve(args.bundle),
  projectRoot,
  expectedProductId: "56328525",
  expectedSupplierUrl: "https://domeggook.com/56328525",
  captureId: "dmk-56328525-g0audit-20260730",
});
await engine.submit(
  supplier.work_order_id,
  buildDmkWorkflowEnvelope({
    imported,
    workOrder: supplier,
    projectRef: {
      ...projectRef,
      agent_session_id: "real-smoke-dmk",
    },
  }),
);

const status = await engine.inspect(projectRef);
process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      projectRoot,
      sourceManifestSha256:
        imported.importer_receipt.source_manifest_sha256,
      normalizedManifestSha256:
        imported.importer_receipt.normalized_manifest_sha256,
      providerStatus: imported.provider_status,
      providerWarnings:
        imported.importer_receipt.provider_warnings,
      fileCount: imported.outputs[0].files.length,
      sourceBundlePath: imported.outputs[0].source_bundle_path,
      workflow: status,
    },
    null,
    2,
  )}\n`,
);
