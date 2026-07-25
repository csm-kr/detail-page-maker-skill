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
    "product/supplier",
    "product/ssot",
    "assets/source",
    "assets/candidates",
    "assets/approved",
    "hyperframes/projects",
    "hyperframes/renders",
    "html",
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
  const state = createInitialProject({
    name,
    supplierUrl,
    productId,
  });
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
  await writeFile(
    path.join(projectRoot, "html", "index.html"),
    template
      .replaceAll("{{PRODUCT_NAME}}", name)
      .replaceAll("{{SUPPLIER_URL}}", supplierUrl),
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, "assets", "asset-manifest.json"),
    '{\n  "schemaVersion": 1,\n  "assets": []\n}\n',
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, "product", "product-manifest.json"),
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
  return {
    projectRoot,
    state,
  };
}
