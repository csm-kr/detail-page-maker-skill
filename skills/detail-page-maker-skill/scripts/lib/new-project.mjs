import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizePublicHtml,
  saveProjectOutput,
} from "../runtime/project-output-runtime.mjs";

const WORKSPACE_CONFIG_RELATIVE_PATH = path.join("config", "workspace.json");

function safeSlug(value) {
  const slug = String(value)
    .normalize("NFKC")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "product";
}

function extractProductId(supplierUrl) {
  try {
    const url = new URL(supplierUrl);
    const match = `${url.pathname}${url.search}`.match(/\d{6,}/);
    return match?.[0] || "";
  } catch {
    return "";
  }
}

function skillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function workspaceConfig(startDirectory = process.cwd()) {
  let current = path.resolve(startDirectory);
  while (true) {
    const configPath = path.join(current, WORKSPACE_CONFIG_RELATIVE_PATH);
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.schemaVersion !== 1 || !config.projectsRoot) {
        throw new Error(
          `${WORKSPACE_CONFIG_RELATIVE_PATH}에는 schemaVersion 1과 projectsRoot가 필요합니다.`,
        );
      }
      return { workspaceRoot: current, configPath, config };
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function workspaceState() {
  return {
    schemaVersion: 1,
    isolation: "self-contained",
    externalFileDependencies: false,
    pathPolicy: "project-relative-only",
  };
}

function createInitialProject({
  id = `project-${randomUUID()}`,
  name,
  supplierUrl,
  productId = "",
  createdAt = new Date().toISOString(),
}) {
  if (!String(name || "").trim()) throw new Error("상품명이 필요합니다.");
  if (!String(supplierUrl || "").trim()) throw new Error("공급처 URL이 필요합니다.");
  return {
    schemaVersion: 1,
    studioVersion: 1,
    id,
    name,
    supplierUrl,
    productId,
    phase: "planning",
    createdAt,
    updatedAt: createdAt,
    html: {
      entry: ".detail-page/authoring/detail-page.html",
      publicEntry: "output/detail-page.html",
      layerState: {},
      viewportOverrides: {},
    },
    wing_export_required: true,
    finalQa: {
      status: "not_requested",
      score: null,
      hardFailures: [],
      warnings: [],
      userApproved: false,
      reportPath: null,
    },
  };
}

export function defaultProjectsRoot({
  startDirectory = process.cwd(),
  environment = process.env,
} = {}) {
  if (environment.DETAIL_PAGE_PROJECTS_ROOT) {
    return path.resolve(environment.DETAIL_PAGE_PROJECTS_ROOT);
  }
  const discovered = workspaceConfig(startDirectory);
  if (discovered) {
    return path.resolve(discovered.workspaceRoot, discovered.config.projectsRoot);
  }
  return path.join(
    os.homedir(),
    "Documents",
    "DetailPageStudio",
    "projects",
  );
}

export async function createProject({
  name,
  supplierUrl,
  root = defaultProjectsRoot(),
}) {
  const productId = extractProductId(supplierUrl);
  const folderName = safeSlug(
    productId ? `${name}-${productId}` : `${name}-${Date.now()}`,
  );
  const projectRoot = path.resolve(root, folderName);
  const directories = [
    "input/product",
    "output/media/images",
    "output/media/gifs",
    "output/wing",
    ".detail-page/backups",
    ".detail-page/evidence",
    ".detail-page/research",
    ".detail-page/generation/pending/image",
    ".detail-page/generation/pending/gif",
    ".detail-page/generation/approved/image",
    ".detail-page/generation/approved/gif",
    ".detail-page/generation/rejected/image",
    ".detail-page/generation/rejected/gif",
    ".detail-page/workflow/jobs",
    ".detail-page/qa/reports",
    ".detail-page/qa/captures",
    ".detail-page/authoring",
    ".detail-page/studio",
    ".detail-page/planning",
  ];
  await mkdir(path.resolve(root), { recursive: true });
  await mkdir(projectRoot, { recursive: false });
  await Promise.all(
    directories.map((directory) =>
      mkdir(path.join(projectRoot, directory), { recursive: true }),
    ),
  );
  const state = {
    ...createInitialProject({
      name,
      supplierUrl,
      productId,
    }),
    workspace: workspaceState(),
  };
  await writeFile(
    path.join(projectRoot, "project.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
  const templatePath = path.join(
    skillRoot(),
    "assets",
    "project-template",
    "detail-page.html",
  );
  const template = await readFile(templatePath, "utf8");
  const projectKey = safeSlug(productId ? `${name}-${productId}` : name);
  const exportFilename = `${projectKey}-standalone.html`;
  await writeFile(
    path.join(projectRoot, ".detail-page", "authoring", "detail-page.html"),
    template
      .replaceAll("{{PRODUCT_NAME}}", name)
      .replaceAll("{{SUPPLIER_URL}}", supplierUrl)
      .replaceAll("{{PROJECT_KEY}}", projectKey)
      .replaceAll("{{EXPORT_FILENAME}}", exportFilename),
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, "output", "detail-page.html"),
    sanitizePublicHtml(
      template
        .replaceAll("{{PRODUCT_NAME}}", name)
        .replaceAll("{{SUPPLIER_URL}}", supplierUrl)
        .replaceAll("{{PROJECT_KEY}}", projectKey)
        .replaceAll("{{EXPORT_FILENAME}}", exportFilename),
    ),
    "utf8",
  );
  const studioRuntimeRoot = path.join(
    skillRoot(),
    "assets",
    "studio-v1-runtime",
  );
  const studioFiles = ["studio.html", "studio-v1.css", "studio-v1.js", "app.js"];
  await Promise.all(
    studioFiles.map(async (fileName) => {
      const source = await readFile(
        path.join(studioRuntimeRoot, fileName),
        "utf8",
      );
      await writeFile(
        path.join(projectRoot, ".detail-page", "studio", fileName),
        source
          .replaceAll("{{PRODUCT_NAME}}", name)
          .replaceAll("{{PROJECT_KEY}}", projectKey),
        "utf8",
      );
    }),
  );
  await writeFile(
    path.join(projectRoot, ".detail-page", "generation", "asset-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        studioVersion: 1,
        defaultGifMethod: "hybrid",
        assets: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, ".detail-page", "evidence", "product-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        supplierUrl,
        productId,
        ssot: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, ".detail-page", "workflow", "output-state.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        wing_export_required: true,
        current_authoring_sha256: null,
        current_public_sha256: null,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const planningTemplateRoot = path.join(
    skillRoot(),
    "assets",
    "project-template",
  );
  const planningTemplates = [
    "COMMERCIAL.md",
    "DESIGN.md",
    "BUYER-JOURNEY.md",
    "GIF.md",
    "APPROVALS.md",
    "LEARNINGS.md",
  ];
  await Promise.all(
    planningTemplates.map(async (fileName) => {
      const source = await readFile(
        path.join(planningTemplateRoot, fileName),
        "utf8",
      );
      await writeFile(
        path.join(projectRoot, ".detail-page", "planning", fileName),
        source
          .replaceAll("{{PRODUCT_NAME}}", name)
          .replaceAll("{{SUPPLIER_URL}}", supplierUrl),
        "utf8",
      );
    }),
  );
  await writeFile(
    path.join(projectRoot, "README.md"),
    `# ${name}

- 공급처: ${supplierUrl}
- 프로젝트 격리: \`self-contained\`
- 외부 파일 의존성: 없음

프로젝트의 제품 근거, 생성 자산, HyperFrames 원본, QA, 승인 기록과 HTML은 이
폴더 안에서만 관리합니다. 다른 프로젝트나 저장소 공용 폴더를 파일 경로로
참조하지 않습니다.
`,
    "utf8",
  );
  return {
    projectRoot,
    state,
  };
}

export async function adoptProject({
  projectRoot,
  name,
  supplierUrl,
  productId = "",
  phase = "final_qa",
  score = null,
  htmlEntry = "detail-page/index.html",
}) {
  const root = path.resolve(projectRoot);
  const statePath = path.join(root, "project.json");
  if (!existsSync(root)) {
    throw new Error(`프로젝트 폴더를 찾을 수 없습니다: ${root}`);
  }
  if (existsSync(statePath)) {
    throw new Error(`project.json이 이미 있습니다: ${statePath}`);
  }
  const now = new Date().toISOString();
  const numericScore =
    score === null || score === undefined ? null : Number(score);
  const state = {
    ...createInitialProject({
      id: path.basename(root),
      name,
      supplierUrl,
      productId,
      createdAt: now,
    }),
    studioVersion: 1,
    phase,
    updatedAt: now,
    workspace: {
      ...workspaceState(),
      adoptedLegacyProject: true,
    },
    html: {
      entry: ".detail-page/authoring/detail-page.html",
      publicEntry: "output/detail-page.html",
      importedLegacyEntry: htmlEntry,
      layerState: {},
      viewportOverrides: {},
      sections: [],
      checkpoints: [],
    },
    finalQa: {
      status: numericScore === null ? "not_requested" : "passed",
      score: numericScore,
      hardFailures: [],
      warnings: [],
      userApproved: phase === "published",
      reportPath: null,
    },
  };
  const legacyHtmlPath = path.resolve(root, htmlEntry);
  const legacyRelative = path.relative(root, legacyHtmlPath);
  if (
    legacyRelative.startsWith("..") ||
    path.isAbsolute(legacyRelative) ||
    !existsSync(legacyHtmlPath)
  ) {
    throw new Error(`legacy HTML 입력을 찾을 수 없습니다: ${htmlEntry}`);
  }
  const adoptedDirectories = [
    "input/product",
    "output/media/images",
    "output/media/gifs",
    "output/wing",
    ".detail-page/backups",
    ".detail-page/evidence",
    ".detail-page/research",
    ".detail-page/generation/pending/image",
    ".detail-page/generation/pending/gif",
    ".detail-page/generation/approved/image",
    ".detail-page/generation/approved/gif",
    ".detail-page/generation/rejected/image",
    ".detail-page/generation/rejected/gif",
    ".detail-page/workflow/jobs",
    ".detail-page/qa/reports",
    ".detail-page/qa/captures",
    ".detail-page/authoring",
    ".detail-page/studio",
    ".detail-page/planning",
  ];
  await Promise.all(
    adoptedDirectories.map((directory) =>
      mkdir(path.join(root, directory), { recursive: true }),
    ),
  );
  const learningsPath = path.join(
    root,
    ".detail-page",
    "planning",
    "LEARNINGS.md",
  );
  if (!existsSync(learningsPath)) {
    const learningsTemplate = await readFile(
      path.join(
        skillRoot(),
        "assets",
        "project-template",
        "LEARNINGS.md",
      ),
      "utf8",
    );
    await writeFile(
      learningsPath,
      learningsTemplate
        .replaceAll("{{PRODUCT_NAME}}", name)
        .replaceAll("{{SUPPLIER_URL}}", supplierUrl),
      "utf8",
    );
  }
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const projectKey = safeSlug(productId || path.basename(root));
  const studioRuntimeRoot = path.join(
    skillRoot(),
    "assets",
    "studio-v1-runtime",
  );
  await Promise.all(
    ["studio.html", "studio-v1.css", "studio-v1.js", "app.js"].map(
      async (fileName) => {
        const source = await readFile(
          path.join(studioRuntimeRoot, fileName),
          "utf8",
        );
        await writeFile(
          path.join(root, ".detail-page", "studio", fileName),
          source
            .replaceAll("{{PRODUCT_NAME}}", name)
            .replaceAll("{{PROJECT_KEY}}", projectKey),
          "utf8",
        );
      },
    ),
  );
  await writeFile(
    path.join(root, ".detail-page", "generation", "asset-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        studioVersion: 1,
        defaultGifMethod: "hybrid",
        assets: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, ".detail-page", "evidence", "product-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        supplierUrl,
        productId,
        ssot: [],
        importedLegacyEntry: htmlEntry,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await saveProjectOutput(root, {
    html: await readFile(legacyHtmlPath, "utf8"),
    now: new Date(now),
  });
  return { projectRoot: root, state };
}
