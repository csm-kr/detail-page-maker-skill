import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function safeSlug(value) {
  return String(value || "product")
    .normalize("NFKC")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "product";
}

function requireHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error(`${label} URL이 올바르지 않습니다.`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error(`${label} URL은 http 또는 https여야 합니다.`);
  }
  return parsed.toString();
}

function render(template, values) {
  return Object.entries(values).reduce(
    (body, [key, value]) => body.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

function publicHtml(authoringHtml) {
  return authoringHtml
    .replace(/\sdata-(?:studio-project|export-name|edit|edit-object)(?:="[^"]*")?/g, "")
    .replace(/\sdata-layer-id="[^"]*"/g, "");
}

function workspaceConfig(startDirectory = process.cwd()) {
  let current = path.resolve(startDirectory);
  while (true) {
    const candidate = path.join(current, "config", "workspace.json");
    if (existsSync(candidate)) {
      const config = JSON.parse(readFileSync(candidate, "utf8"));
      if (config.projectsRoot) return { root: current, config };
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function defaultProjectsRoot({
  startDirectory = process.cwd(),
  environment = process.env,
} = {}) {
  if (environment.DETAIL_PAGE_PROJECTS_ROOT) {
    return path.resolve(environment.DETAIL_PAGE_PROJECTS_ROOT);
  }
  const workspace = workspaceConfig(startDirectory);
  if (workspace) {
    return path.resolve(workspace.root, workspace.config.projectsRoot);
  }
  return path.join(os.homedir(), "Documents", "DetailPageStudio", "projects");
}

export async function createProject({
  name,
  supplierUrl,
  coupangUrl,
  photoStatus,
  root = defaultProjectsRoot(),
}) {
  if (!String(name || "").trim()) throw new Error("상품명이 필요합니다.");
  const supplier = requireHttpUrl(supplierUrl, "공급처");
  const coupang = requireHttpUrl(coupangUrl, "쿠팡 기준상품");
  if (!new Set(["yes", "no"]).has(photoStatus)) {
    throw new Error("실제 제품 사진 보유 여부는 yes 또는 no여야 합니다.");
  }

  const projectRoot = path.resolve(
    root,
    `${safeSlug(name)}-${Date.now()}`,
  );
  await mkdir(path.resolve(root), { recursive: true });
  await mkdir(projectRoot, { recursive: false });
  await Promise.all([
    "input/product",
    "output/media/images",
    "output/media/gifs",
    ".detail-page/authoring",
    ".detail-page/backups",
  ].map((entry) => mkdir(path.join(projectRoot, entry), { recursive: true })));

  const projectKey = safeSlug(name);
  const createdAt = new Date().toISOString();
  const request = {
    schema_version: "1.0",
    project_id: `detail-${randomUUID()}`,
    name: String(name).trim(),
    supplier_url: supplier,
    coupang_url: coupang,
    actual_product_photos: photoStatus,
    target: {
      width_px: 780,
      still_count: 30,
      gif_count: 10,
      studio: true,
      wing_cdn: true,
      elapsed_minutes_goal: 60,
    },
    status: photoStatus === "yes" ? "awaiting_photo_files" : "ready",
    created_at: createdAt,
  };

  const template = await readFile(
    path.join(SKILL_ROOT, "assets", "project-template", "detail-page.html"),
    "utf8",
  );
  const authoringHtml = render(template, {
    PRODUCT_NAME: request.name,
    PROJECT_KEY: projectKey,
    EXPORT_FILENAME: `${projectKey}-detail-page.html`,
  });
  await Promise.all([
    writeFile(
      path.join(projectRoot, "project.json"),
      `${JSON.stringify(request, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(projectRoot, ".detail-page", "request.json"),
      `${JSON.stringify(request, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(projectRoot, ".detail-page", "authoring", "detail-page.html"),
      authoringHtml,
      "utf8",
    ),
    writeFile(
      path.join(projectRoot, "output", "detail-page.html"),
      publicHtml(authoringHtml),
      "utf8",
    ),
  ]);

  return { projectRoot, state: request };
}
