import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_KNOWLEDGE_SOURCES = Object.freeze([
  {
    path: "references/commercial.md",
    classification: "active_rule",
    rule_ids: ["CR"],
  },
  {
    path: "references/taste.md",
    classification: "active_rule",
    rule_ids: ["TR"],
  },
  {
    path: "references/motion.md",
    classification: "active_rule",
    rule_ids: ["MR"],
  },
  {
    path: "references/aisync-flow-comparison.md",
    classification: "research_only",
    rule_ids: ["FLOW"],
  },
  {
    path: "references/behance-rubric.md",
    classification: "research_only",
    rule_ids: ["BENCHMARK"],
  },
  {
    path: "policies/behance-commerce-v0.1.json",
    classification: "active_policy",
    rule_ids: ["R01-R11"],
  },
]);

export class KnowledgeSnapshotError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "KnowledgeSnapshotError";
    this.code = code;
    this.details = details;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function extractRuleIndex(body, sourcePath, sourceSha256) {
  const expectedPrefix =
    sourcePath.endsWith("/commercial.md")
      ? "CR"
      : sourcePath.endsWith("/taste.md")
        ? "TR"
        : sourcePath.endsWith("/motion.md")
          ? "MR"
          : null;
  if (!expectedPrefix) return [];
  const found = [];
  const pattern = new RegExp(`^\\|\\s*(${expectedPrefix}-\\d{3})\\s*\\|`);
  for (const line of body.toString("utf8").split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) continue;
    found.push({
      rule_id: match[1],
      rule_sha256: sha256(Buffer.from(`${line.trim()}\n`, "utf8")),
      source_path: sourcePath,
      source_sha256: sourceSha256,
    });
  }
  return found;
}

function resolveInside(root, relativePath) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\")
  ) {
    throw new KnowledgeSnapshotError(
      "INVALID_KNOWLEDGE_PATH",
      "knowledge source는 POSIX 상대 경로여야 합니다.",
      { path: relativePath },
    );
  }
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new KnowledgeSnapshotError(
      "INVALID_KNOWLEDGE_PATH",
      "knowledge source가 skill root 밖을 가리킵니다.",
      { path: relativePath },
    );
  }
  return target;
}

export async function createKnowledgeSnapshot({
  skillRoot,
  workflowVersion,
  dependencyClosureReceipt,
  sources = DEFAULT_KNOWLEDGE_SOURCES,
  createdAt = new Date().toISOString(),
}) {
  const root = path.resolve(skillRoot);
  if (
    !workflowVersion ||
    !dependencyClosureReceipt?.receipt_id ||
    !isSha256(dependencyClosureReceipt?.receipt_sha256) ||
    dependencyClosureReceipt?.frozen !== true
  ) {
    throw new KnowledgeSnapshotError(
      "INVALID_DEPENDENCY_CLOSURE_RECEIPT",
      "동결된 DependencyClosureReceipt와 workflowVersion이 필요합니다.",
    );
  }
  const references = [];
  const ruleIndex = [];
  for (const source of sources) {
    const bytes = await readFile(resolveInside(root, source.path));
    const sourceSha256 = sha256(bytes);
    references.push({
      path: source.path,
      sha256: sourceSha256,
      classification: source.classification,
      rule_ids: [...(source.rule_ids ?? [])],
      production_asset_allowed:
        source.classification !== "research_only",
    });
    ruleIndex.push(
      ...extractRuleIndex(bytes, source.path, sourceSha256),
    );
  }
  const duplicateRuleIds = ruleIndex
    .map((entry) => entry.rule_id)
    .filter((ruleId, index, all) => all.indexOf(ruleId) !== index);
  if (duplicateRuleIds.length > 0) {
    throw new KnowledgeSnapshotError(
      "DUPLICATE_RULE_ID",
      "active knowledge reference에 중복 rule ID가 있습니다.",
      { rule_ids: [...new Set(duplicateRuleIds)].sort() },
    );
  }
  ruleIndex.sort((left, right) =>
    left.rule_id.localeCompare(right.rule_id),
  );
  const skillLockSha256 = sha256(
    await readFile(path.join(root, "skills-lock.json")),
  );
  const unsigned = {
    schema_version: "1.0",
    workflow_version: workflowVersion,
    references,
    rule_index: ruleIndex,
    skill_lock_sha256: skillLockSha256,
    dependency_closure: structuredClone(dependencyClosureReceipt),
    created_at: createdAt,
  };
  const manifestSha256 = sha256(
    Buffer.from(JSON.stringify(unsigned), "utf8"),
  );
  return {
    ...unsigned,
    knowledge_snapshot_id: `knowledge-${manifestSha256.slice(0, 12)}`,
    manifest_sha256: manifestSha256,
  };
}

export async function assertKnowledgeSnapshotCurrent(
  snapshot,
  skillRoot,
) {
  const root = path.resolve(skillRoot);
  const changedPaths = [];
  for (const reference of snapshot?.references ?? []) {
    let current;
    try {
      current = sha256(
        await readFile(resolveInside(root, reference.path)),
      );
    } catch {
      current = null;
    }
    if (current !== reference.sha256) changedPaths.push(reference.path);
  }
  let currentSkillLock = null;
  try {
    currentSkillLock = sha256(
      await readFile(path.join(root, "skills-lock.json")),
    );
  } catch {
    currentSkillLock = null;
  }
  if (currentSkillLock !== snapshot?.skill_lock_sha256) {
    changedPaths.push("skills-lock.json");
  }
  if (changedPaths.length > 0) {
    throw new KnowledgeSnapshotError(
      "DEPENDENCY_DRIFT",
      "KnowledgeSnapshot 이후 reference 또는 skill lock이 변경되었습니다.",
      { changed_paths: [...new Set(changedPaths)].sort() },
    );
  }
  return {
    ok: true,
    knowledge_snapshot_id: snapshot.knowledge_snapshot_id,
    manifest_sha256: snapshot.manifest_sha256,
  };
}
