// Active project discovery and self-containment checks.
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
const PROJECT_TOP_LEVEL_DIRECTORIES = new Set([
  ".detail-page",
  ".migration-archive",
  "input",
  "output",
]);
const LEGACY_PROJECT_TOP_LEVEL_DIRECTORIES = new Set([
  ...PROJECT_TOP_LEVEL_DIRECTORIES,
  "asset",
  "detail-page",
  "planning",
]);
const PROJECT_TOP_LEVEL_FILES = new Set([
  ".DS_Store",
  "README.md",
  "project.json",
]);
const GENERATED_AUDIT_PREFIXES = [
  ".detail-page/evidence/",
  ".detail-page/qa/",
  ".detail-page/workflow/",
];

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
  const statePath = path.join(root, "project.json");
  let state = null;
  if (await exists(statePath)) {
    state = JSON.parse(await readFile(statePath, "utf8"));
  }
  const currentLayout =
    state?.workspace?.pathPolicy === "project-relative-only";
  const allowedTopLevelDirectories = currentLayout
    ? PROJECT_TOP_LEVEL_DIRECTORIES
    : LEGACY_PROJECT_TOP_LEVEL_DIRECTORIES;
  const rootEntries = await readdir(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (
      entry.isDirectory() &&
      !allowedTopLevelDirectories.has(entry.name)
    ) {
      issues.push({
        file: entry.name,
        reference: `project-root/${entry.name}`,
        reason: "UNPLANNED_PROJECT_ROOT_DIRECTORY",
      });
    } else if (
      entry.isFile() &&
      !PROJECT_TOP_LEVEL_FILES.has(entry.name)
    ) {
      issues.push({
        file: entry.name,
        reference: `project-root/${entry.name}`,
        reason: "UNPLANNED_PROJECT_ROOT_FILE",
      });
    } else if (
      !entry.isDirectory() &&
      !entry.isFile()
    ) {
      issues.push({
        file: entry.name,
        reference: `project-root/${entry.name}`,
        reason: "UNSAFE_PROJECT_ROOT_ENTRY",
      });
    }
  }
  if (await exists(path.join(root, "assets"))) {
    issues.push({
      file: "assets",
      reference: "project-root/assets",
      reason: "LEGACY_ASSET_ROOT_FORBIDDEN",
    });
  }
  for (const legacyRoot of ["asset", "deliverables", "html"]) {
    if (currentLayout && (await exists(path.join(root, legacyRoot)))) {
      issues.push({
        file: legacyRoot,
        reference: `project-root/${legacyRoot}`,
        reason: "LEGACY_PROJECT_ROOT_FORBIDDEN",
      });
    }
  }
  const requiredProjectFiles = currentLayout
    ? [
        ["README.md", "PROJECT_README_REQUIRED"],
        ["output/detail-page.html", "PUBLIC_DETAIL_PAGE_REQUIRED"],
      ]
    : [
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

  if (!(await exists(statePath))) {
    issues.push({
      file: "project.json",
      reference: "missing",
      reason: "PROJECT_MANIFEST_REQUIRED",
    });
  } else {
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
    if (
      GENERATED_AUDIT_PREFIXES.some((prefix) =>
        relativeFile.startsWith(prefix),
      )
    ) {
      continue;
    }
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
    storagePolicy: {
      topLevelDirectoryBudget: PROJECT_TOP_LEVEL_DIRECTORIES.size,
      allowedTopLevelDirectories: [
        ...PROJECT_TOP_LEVEL_DIRECTORIES,
      ].sort(),
      actualTopLevelDirectories: rootEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    },
    issues,
  };
}
