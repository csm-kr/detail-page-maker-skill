import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDependencyClosureReceipt,
} from "../dependency-closure.mjs";
import {
  createKnowledgeSnapshot,
} from "../knowledge-snapshot.mjs";

const ADAPTER_ID = "knowledge-freeze-adapter";
const ADAPTER_VERSION = "1.0.0";
const ADAPTER_FILE = fileURLToPath(import.meta.url);

export class KnowledgeFreezeAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "KnowledgeFreezeAdapterError";
    this.code = code;
    this.details = details;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function assertChildPath(root, target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new KnowledgeFreezeAdapterError(
      "OUTPUT_PATH_ESCAPE",
      "knowledge bundle은 지정 output root의 하위 폴더여야 합니다.",
      { root, target },
    );
  }
}

async function readFrozenFiles(finalDirectory, expected) {
  const snapshotPath = path.join(finalDirectory, "knowledge-snapshot.json");
  const receiptPath = path.join(finalDirectory, "dependency-closure.json");
  const [snapshotBytes, receiptBytes] = await Promise.all([
    readFile(snapshotPath),
    readFile(receiptPath),
  ]);
  if (
    sha256(snapshotBytes) !== expected.snapshotSha256 ||
    sha256(receiptBytes) !== expected.receiptSha256
  ) {
    throw new KnowledgeFreezeAdapterError(
      "IMMUTABLE_REVISION_CONFLICT",
      "같은 revision ID의 기존 knowledge bundle 내용이 다릅니다.",
      { final_directory: finalDirectory },
    );
  }
  return { snapshotPath, receiptPath };
}

function validateWorkOrder(workOrder, producerAgentSessionId) {
  if (workOrder?.stage_id !== "G1B_KNOWLEDGE") {
    throw new KnowledgeFreezeAdapterError(
      "INVALID_STAGE",
      "knowledge freeze adapter는 G1B_KNOWLEDGE WorkOrder만 받습니다.",
      { stage_id: workOrder?.stage_id ?? null },
    );
  }
  if (
    !/^[a-f0-9]{64}$/.test(String(workOrder?.input_set_digest || ""))
  ) {
    throw new KnowledgeFreezeAdapterError(
      "INVALID_INPUT_SET_DIGEST",
      "WorkOrder의 exact input_set_digest가 필요합니다.",
    );
  }
  if (
    !producerAgentSessionId ||
    producerAgentSessionId !== workOrder.assigned_agent_session_id
  ) {
    throw new KnowledgeFreezeAdapterError(
      "AGENT_SESSION_MISMATCH",
      "실행 세션은 WorkOrder에 배정된 agent session과 같아야 합니다.",
      {
        assigned: workOrder?.assigned_agent_session_id ?? null,
        actual: producerAgentSessionId ?? null,
      },
    );
  }
}

export async function freezeKnowledgeForWorkOrder({
  workOrder,
  skillRoot,
  outputRoot,
  workflowVersion,
  producerAgentSessionId = workOrder?.assigned_agent_session_id,
  createdAt = new Date().toISOString(),
}) {
  validateWorkOrder(workOrder, producerAgentSessionId);
  const root = path.resolve(outputRoot);
  await mkdir(root, { recursive: true });

  const dependencyClosureReceipt =
    await createDependencyClosureReceipt(skillRoot, { createdAt });
  const knowledgeSnapshot = await createKnowledgeSnapshot({
    skillRoot,
    workflowVersion,
    dependencyClosureReceipt,
    createdAt,
  });
  const snapshotBytes = jsonBytes(knowledgeSnapshot);
  const receiptBytes = jsonBytes(dependencyClosureReceipt);
  const snapshotSha256 = sha256(snapshotBytes);
  const receiptSha256 = sha256(receiptBytes);
  const revisionDigest = sha256(
    [
      workOrder.input_set_digest,
      knowledgeSnapshot.manifest_sha256,
      dependencyClosureReceipt.receipt_sha256,
    ].join("\n"),
  );
  const revisionId = `knowledge-revision-${revisionDigest.slice(0, 16)}`;
  const finalDirectory = path.join(root, revisionId);
  assertChildPath(root, finalDirectory);

  let idempotentReuse = await exists(finalDirectory);
  let paths;
  if (idempotentReuse) {
    paths = await readFrozenFiles(finalDirectory, {
      snapshotSha256,
      receiptSha256,
    });
  } else {
    const stagingDirectory = path.join(
      root,
      `.staging-${revisionId}-${randomUUID()}`,
    );
    assertChildPath(root, stagingDirectory);
    try {
      await mkdir(stagingDirectory);
      await Promise.all([
        writeFile(
          path.join(stagingDirectory, "knowledge-snapshot.json"),
          snapshotBytes,
          { flag: "wx" },
        ),
        writeFile(
          path.join(stagingDirectory, "dependency-closure.json"),
          receiptBytes,
          { flag: "wx" },
        ),
      ]);
      try {
        await rename(stagingDirectory, finalDirectory);
      } catch (error) {
        if (await exists(finalDirectory)) {
          idempotentReuse = true;
        } else {
          throw error;
        }
      }
    } finally {
      if (await exists(stagingDirectory)) {
        await rm(stagingDirectory, { recursive: true, force: true });
      }
    }
    paths = await readFrozenFiles(finalDirectory, {
      snapshotSha256,
      receiptSha256,
    });
  }

  const adapterCodeSha256 = sha256(await readFile(ADAPTER_FILE));
  return {
    project_ref: {
      ...structuredClone(workOrder.project_ref ?? {}),
      agent_session_id: producerAgentSessionId,
    },
    producer_agent_session_id: producerAgentSessionId,
    input_set_digest: workOrder.input_set_digest,
    fencing_token: workOrder.fencing_token,
    attempt: workOrder.attempt,
    output_artifacts: [
      {
        artifact_id: knowledgeSnapshot.knowledge_snapshot_id,
        type: "knowledge.snapshot",
        manifest_sha256: snapshotSha256,
        member_ids: ["knowledge-snapshot.json"],
        locator: paths.snapshotPath,
        immutable_revision_id: revisionId,
      },
      {
        artifact_id: dependencyClosureReceipt.receipt_id,
        type: "receipt.dependency_closure",
        manifest_sha256: receiptSha256,
        member_ids: ["dependency-closure.json"],
        locator: paths.receiptPath,
        immutable_revision_id: revisionId,
      },
    ],
    execution_receipt: {
      execution_id: `execution-${revisionDigest.slice(0, 20)}`,
      adapter_id: ADAPTER_ID,
      adapter_version: ADAPTER_VERSION,
      adapter_code_sha256: adapterCodeSha256,
      status: "PASS",
      revision_id: revisionId,
      final_directory: finalDirectory,
      idempotent_reuse: idempotentReuse,
    },
  };
}
