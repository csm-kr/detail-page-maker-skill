import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

async function sha256(filePath) {
  const body = await readFile(filePath);
  return createHash("sha256").update(body).digest("hex");
}

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function inspectDependencyClosure(skillRoot) {
  const root = path.resolve(skillRoot);
  const [dependencies, lock] = await Promise.all([
    readFile(path.join(root, "dependencies.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "skills-lock.json"), "utf8").then(JSON.parse),
  ]);
  const declared = sorted(
    (dependencies.skills || []).map((skill) => String(skill.name)),
  );
  const locked = sorted(Object.keys(lock.skills || {}));
  const installed = [];
  const hashMismatches = [];

  for (const skillName of declared) {
    const skillFile = path.join(
      root,
      ".agents",
      "skills",
      skillName,
      "SKILL.md",
    );
    if (await exists(skillFile)) {
      installed.push(skillName);
      const expected = String(
        lock.skills?.[skillName]?.skillFileSha256 || "",
      ).toLowerCase();
      const actual = await sha256(skillFile);
      if (!expected || expected !== actual) {
        hashMismatches.push({
          skillName,
          expected: expected || null,
          actual,
        });
      }
    }
  }

  const declaredSet = new Set(declared);
  const lockedSet = new Set(locked);
  const installedSet = new Set(installed);
  const missingInstall = declared.filter(
    (skillName) => !installedSet.has(skillName),
  );
  const missingLock = declared.filter(
    (skillName) => !lockedSet.has(skillName),
  );
  const undeclaredLock = locked.filter(
    (skillName) => !declaredSet.has(skillName),
  );

  return {
    ok:
      missingInstall.length === 0 &&
      missingLock.length === 0 &&
      undeclaredLock.length === 0 &&
      hashMismatches.length === 0,
    declared,
    locked,
    installed: sorted(installed),
    declaredCount: declared.length,
    lockedCount: locked.length,
    installedCount: installed.length,
    missingInstall,
    missingLock,
    undeclaredLock,
    hashMismatches,
  };
}

export async function createDependencyClosureReceipt(
  skillRoot,
  { createdAt = new Date().toISOString() } = {},
) {
  const root = path.resolve(skillRoot);
  const report = await inspectDependencyClosure(root);
  if (!report.ok) {
    const error = new Error(
      "dependency closure가 PASS가 아니므로 동결할 수 없습니다.",
    );
    error.code = "DEPENDENCY_CLOSURE_FAILED";
    error.details = report;
    throw error;
  }
  const [
    dependenciesSha256,
    skillLockSha256,
    validatorCodeSha256,
  ] = await Promise.all([
    sha256(path.join(root, "dependencies.json")),
    sha256(path.join(root, "skills-lock.json")),
    sha256(new URL(import.meta.url)),
  ]);
  const unsigned = {
    schema_version: "1.0",
    status: "PASS",
    frozen: true,
    declared_count: report.declaredCount,
    locked_count: report.lockedCount,
    installed_count: report.installedCount,
    skills: report.declared,
    dependencies_sha256: dependenciesSha256,
    skill_lock_sha256: skillLockSha256,
    validator_code_sha256: validatorCodeSha256,
    created_at: createdAt,
  };
  const receiptSha256 = hashValue(JSON.stringify(unsigned));
  return {
    ...unsigned,
    receipt_id: `dependency-closure-${receiptSha256.slice(0, 12)}`,
    receipt_sha256: receiptSha256,
  };
}
