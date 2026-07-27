import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialProject } from "./studio-domain.mjs";

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
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
    "evidence",
    "research",
    "asset/input",
    "asset/ssot",
    "asset/generated/pending/image",
    "asset/generated/pending/gif",
    "asset/generated/approved/image",
    "asset/generated/approved/gif",
    "asset/generated/rejected/image",
    "asset/generated/rejected/gif",
    "asset/output/page",
    "asset/output/gif",
    "asset/deprecated",
    "product/supplier",
    "product/ssot/source",
    "product/ssot/derived/imagegen-reference",
    "assets/source",
    "assets/candidates",
    "assets/approved",
    "hyperframes/projects",
    "hyperframes/renders",
    "html",
    "planning",
    "qa/reports",
    "qa/captures",
    "revisions",
    "exports/drafts",
    "exports/published",
    ".studio/jobs",
    ".studio/checkpoints",
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
    studioVersion: 1,
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
    "index.html",
  );
  const template = await readFile(templatePath, "utf8");
  const projectKey = safeSlug(productId ? `${name}-${productId}` : name);
  const exportFilename = `${projectKey}-standalone.html`;
  await writeFile(
    path.join(projectRoot, "html", "index.html"),
    template
      .replaceAll("{{PRODUCT_NAME}}", name)
      .replaceAll("{{SUPPLIER_URL}}", supplierUrl)
      .replaceAll("{{PROJECT_KEY}}", projectKey)
      .replaceAll("{{EXPORT_FILENAME}}", exportFilename),
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
        path.join(projectRoot, "html", fileName),
        source
          .replaceAll("{{PRODUCT_NAME}}", name)
          .replaceAll("{{PROJECT_KEY}}", projectKey),
        "utf8",
      );
    }),
  );
  await writeFile(
    path.join(projectRoot, "asset", "asset-manifest.json"),
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
    path.join(projectRoot, "asset", "ssot", "product-manifest.json"),
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
    path.join(projectRoot, "product", "product-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        supplierUrl,
        productId,
        status: "draft",
        lockedAt: null,
        ssot: [],
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
        path.join(projectRoot, "planning", fileName),
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
      entry: htmlEntry,
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
  await mkdir(path.join(root, ".studio", "jobs"), { recursive: true });
  await mkdir(path.join(root, ".studio", "checkpoints"), { recursive: true });
  await mkdir(path.join(root, "planning"), { recursive: true });
  const learningsPath = path.join(root, "planning", "LEARNINGS.md");
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
  return { projectRoot: root, state };
}
