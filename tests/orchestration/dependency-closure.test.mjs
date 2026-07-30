import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createDependencyClosureReceipt,
  inspectDependencyClosure,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/dependency-closure.mjs";

const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../skills/detail-page-maker-skill",
);
const DECLARED_DEPENDENCY_COUNT = JSON.parse(
  readFileSync(
    path.join(SKILL_ROOT, "dependencies.json"),
    "utf8",
  ),
).skills.length;

test("dependency closure는 선언·잠금·프로젝트 로컬 설치가 모두 맞아야 통과한다", async () => {
  const result = await inspectDependencyClosure(SKILL_ROOT);

  assert.equal(result.ok, true);
  assert.equal(result.declaredCount, DECLARED_DEPENDENCY_COUNT);
  assert.equal(result.lockedCount, DECLARED_DEPENDENCY_COUNT);
  assert.equal(result.installedCount, DECLARED_DEPENDENCY_COUNT);
  assert.deepEqual(result.missingInstall, []);
  assert.deepEqual(result.missingLock, []);
  assert.deepEqual(result.undeclaredLock, []);
  assert.deepEqual(result.hashMismatches, []);
});

test("PASS closure는 lock·manifest·validator code hash가 있는 동결 receipt가 된다", async () => {
  const receipt = await createDependencyClosureReceipt(SKILL_ROOT, {
    createdAt: "2026-07-30T00:00:00.000Z",
  });

  assert.equal(receipt.frozen, true);
  assert.equal(receipt.status, "PASS");
  assert.equal(receipt.declared_count, DECLARED_DEPENDENCY_COUNT);
  assert.match(receipt.dependencies_sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.skill_lock_sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.validator_code_sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.receipt_sha256, /^[a-f0-9]{64}$/);
});
