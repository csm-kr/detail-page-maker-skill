import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_KNOWLEDGE_SOURCES,
  assertKnowledgeSnapshotCurrent,
  createKnowledgeSnapshot,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/knowledge-snapshot.mjs";

const SKILL_ROOT = path.resolve("skills/detail-page-maker-skill");

test("G1B snapshot은 상업·디자인·motion·외부 비교·rubric과 skill lock hash를 동결한다", async () => {
  const snapshot = await createKnowledgeSnapshot({
    skillRoot: SKILL_ROOT,
    workflowVersion: "2.0.0",
    dependencyClosureReceipt: {
      receipt_id: "dependency-closure-test",
      receipt_sha256: "1".repeat(64),
      frozen: true,
    },
  });

  assert.equal(snapshot.workflow_version, "2.0.0");
  assert.equal(snapshot.dependency_closure.frozen, true);
  assert.match(snapshot.skill_lock_sha256, /^[a-f0-9]{64}$/);
  assert.match(snapshot.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    snapshot.references.map((entry) => entry.path),
    DEFAULT_KNOWLEDGE_SOURCES.map((entry) => entry.path),
  );
  assert.ok(
    snapshot.references
      .filter((entry) => entry.classification === "research_only")
      .every((entry) => entry.production_asset_allowed === false),
  );
  assert.ok(snapshot.rule_index.length >= 20);
  for (const prefix of ["CR-", "TR-", "MR-"]) {
    const rule = snapshot.rule_index.find((entry) =>
      entry.rule_id.startsWith(prefix),
    );
    assert.ok(rule, `${prefix} rule index가 필요합니다.`);
    assert.match(rule.rule_sha256, /^[a-f0-9]{64}$/);
    assert.match(rule.source_sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(
    (await assertKnowledgeSnapshotCurrent(snapshot, SKILL_ROOT)).ok,
    true,
  );
});

test("snapshot 뒤 reference가 바뀌면 DEPENDENCY_DRIFT로 재개를 차단한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "knowledge-snapshot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(SKILL_ROOT, root, { recursive: true });
  const snapshot = await createKnowledgeSnapshot({
    skillRoot: root,
    workflowVersion: "2.0.0",
    dependencyClosureReceipt: {
      receipt_id: "dependency-closure-test",
      receipt_sha256: "2".repeat(64),
      frozen: true,
    },
  });
  await writeFile(
    path.join(root, "references", "commercial.md"),
    "# changed after snapshot\n",
    "utf8",
  );

  await assert.rejects(
    assertKnowledgeSnapshotCurrent(snapshot, root),
    (error) =>
      error.code === "DEPENDENCY_DRIFT" &&
      error.details.changed_paths.includes("references/commercial.md"),
  );
});
