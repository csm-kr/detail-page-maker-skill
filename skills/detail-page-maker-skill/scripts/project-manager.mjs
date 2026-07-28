import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".txt",
]);
const LEGACY_ROOT_PATTERN =
  /(?:^|[("'`\s])((?:\.artifacts|projects|prototypes|videos|tests)\/[^\s"'`)]+)/g;
const RELATIVE_PATTERN = /(?:^|[("'`\s])((?:\.\.\/)+[^\s"'`)]+)/g;
const WINDOWS_ABSOLUTE_PATTERN =
  /(?<![A-Za-z])[A-Za-z]:[\\/][^\s"'`)]+/g;
const USER_ABSOLUTE_PATTERN = /\/Users\/[^\s"'`)]+/g;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkTextFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (
        entry.isFile() &&
        TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
        (await stat(entryPath)).size <= 2_000_000
      ) {
        files.push(entryPath);
      }
    }
  }
  await visit(root);
  return files;
}

function addMatches(issues, file, body, pattern, reason) {
  pattern.lastIndex = 0;
  for (const match of body.matchAll(pattern)) {
    issues.push({
      file,
      reference: match[1] || match[0],
      reason,
    });
  }
}

export async function listProjects(projectsRoot) {
  const root = path.resolve(projectsRoot);
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const projectRoot = path.join(root, entry.name);
    const statePath = path.join(projectRoot, "project.json");
    if (!(await exists(statePath))) continue;
    try {
      const state = JSON.parse(await readFile(statePath, "utf8"));
      projects.push({
        id: String(state.id || entry.name),
        name: String(state.name || entry.name),
        productId: String(state.productId || ""),
        phase: String(state.phase || "unknown"),
        isolation: String(state.workspace?.isolation || "unknown"),
        path: projectRoot,
      });
    } catch (error) {
      projects.push({
        id: entry.name,
        name: entry.name,
        productId: "",
        phase: "invalid",
        isolation: "unknown",
        path: projectRoot,
        error: error.message,
      });
    }
  }
  return projects.sort((left, right) => left.id.localeCompare(right.id, "ko"));
}

export async function validateProjectIsolation(projectRoot) {
  const root = path.resolve(projectRoot);
  const issues = [];
  if (await exists(path.join(root, "assets"))) {
    issues.push({
      file: "assets",
      reference: "project-root/assets",
      reason: "LEGACY_ASSET_ROOT_FORBIDDEN",
    });
  }
  const requiredProjectFiles = [
    ["README.md", "PROJECT_README_REQUIRED"],
    ["planning/LEARNINGS.md", "PROJECT_LEARNINGS_REQUIRED"],
  ];
  for (const [relativePath, reason] of requiredProjectFiles) {
    if (!(await exists(path.join(root, relativePath)))) {
      issues.push({
        file: relativePath,
        reference: "missing",
        reason,
      });
    }
  }

  const statePath = path.join(root, "project.json");
  if (!(await exists(statePath))) {
    issues.push({
      file: "project.json",
      reference: "missing",
      reason: "PROJECT_MANIFEST_REQUIRED",
    });
  } else {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    if (
      state.workspace?.isolation !== "self-contained" ||
      state.workspace?.externalFileDependencies !== false
    ) {
      issues.push({
        file: "project.json",
        reference: "workspace",
        reason: "SELF_CONTAINED_CONTRACT_REQUIRED",
      });
    }
  }

  for (const filePath of await walkTextFiles(root)) {
    const relativeFile = path.relative(root, filePath).split(path.sep).join("/");
    const body = await readFile(filePath, "utf8");
    addMatches(
      issues,
      relativeFile,
      body,
      LEGACY_ROOT_PATTERN,
      "LEGACY_SHARED_ROOT_REFERENCE",
    );
    addMatches(
      issues,
      relativeFile,
      body,
      WINDOWS_ABSOLUTE_PATTERN,
      "ABSOLUTE_USER_PATH",
    );
    addMatches(
      issues,
      relativeFile,
      body,
      USER_ABSOLUTE_PATTERN,
      "ABSOLUTE_USER_PATH",
    );
    RELATIVE_PATTERN.lastIndex = 0;
    for (const match of body.matchAll(RELATIVE_PATTERN)) {
      const reference = match[1].replace(/[.,;:]+$/, "");
      const target = path.resolve(path.dirname(filePath), reference);
      const relativeTarget = path.relative(root, target);
      if (
        relativeTarget.startsWith("..") ||
        path.isAbsolute(relativeTarget)
      ) {
        issues.push({
          file: relativeFile,
          reference,
          reason: "PATH_ESCAPES_PROJECT",
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    projectRoot: root,
    issues,
  };
}
