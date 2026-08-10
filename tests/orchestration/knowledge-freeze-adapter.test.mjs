import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  freezeKnowledgeForWorkOrder,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/knowledge-freeze-adapter.mjs";

const HASH = "a".repeat(64);
const SKILL_ROOT = path.resolve("skills/detail-page-maker-skill");

function workOrder(session = "knowledge-agent") {
  return {
    work_order_id: "work-g1b",
    stage_id: "G1B_KNOWLEDGE",
    input_set_digest: HASH,
    assigned_agent_session_id: session,
    project_ref: {
      project_id: "project-56328525",
      input_digest: "b".repeat(64),
    },
  };
}

test("G1B adapter는 dependency closure와 knowledge snapshot을 한 immutable bundle로 동결한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "knowledge-freeze-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await freezeKnowledgeForWorkOrder({
    workOrder: workOrder(),
    skillRoot: SKILL_ROOT,
    outputRoot: root,
    workflowVersion: "2.0.0",
    createdAt: "2026-07-30T09:00:00.000Z",
  });

  assert.equal(result.output_artifacts.length, 2);
  assert.deepEqual(
    result.output_artifacts.map((artifact) => artifact.type).sort(),
    ["knowledge.snapshot", "receipt.dependency_closure"],
  );
  assert.equal(result.input_set_digest, HASH);
  assert.equal(result.producer_agent_session_id, "knowledge-agent");
  assert.equal(result.execution_receipt.status, "PASS");

  for (const artifact of result.output_artifacts) {
    assert.match(artifact.manifest_sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      JSON.parse(await readFile(artifact.locator, "utf8")).schema_version,
      "1.0",
    );
  }
});

test("같은 고정 입력은 같은 revision을 재사용하고 다른 세션·단계는 거부한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "knowledge-freeze-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = {
    workOrder: workOrder(),
    skillRoot: SKILL_ROOT,
    outputRoot: root,
    workflowVersion: "2.0.0",
    createdAt: "2026-07-30T09:00:00.000Z",
  };

  const first = await freezeKnowledgeForWorkOrder(options);
  const second = await freezeKnowledgeForWorkOrder(options);
  assert.deepEqual(second.output_artifacts, first.output_artifacts);
  assert.equal(second.execution_receipt.idempotent_reuse, true);

  await assert.rejects(
    freezeKnowledgeForWorkOrder({
      ...options,
      producerAgentSessionId: "other-agent",
    }),
    (error) => error.code === "AGENT_SESSION_MISMATCH",
  );
  await assert.rejects(
    freezeKnowledgeForWorkOrder({
      ...options,
      workOrder: { ...workOrder(), stage_id: "G1C_PLAN" },
    }),
    (error) => error.code === "INVALID_STAGE",
  );
});
