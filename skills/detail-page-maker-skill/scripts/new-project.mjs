import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialProject } from "./studio-domain.mjs";

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

export function defaultProjectsRoot() {
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
  return {
    projectRoot,
    state,
  };
}
