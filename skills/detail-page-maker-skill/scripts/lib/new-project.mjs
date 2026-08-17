import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizePublicHtml,
  saveProjectOutput,
} from "../runtime/project-output-runtime.mjs";
import { resolveProjectsRoot } from "./output-location.mjs";

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
      entry: "output/detail-page.html",
      canonicalEntry: "output/detail-page.html",
      internalEditableRevision:
        ".detail-page/authoring/detail-page.html",
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
  skillRoot: skillRootOverride,
  environment = process.env,
} = {}) {
  // 산출물 폴더 규약: 프로젝트 루트는 설치 위치에서 결정하며 워크스페이스 밖으로 나가지 않는다.
  return resolveProjectsRoot({
    skillRoot: skillRootOverride ?? skillRoot(),
    environment,
  });
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
    "output",
    ".detail-page/authoring",
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
  const renderedTemplate = template
    .replaceAll("{{PRODUCT_NAME}}", name)
    .replaceAll("{{SUPPLIER_URL}}", supplierUrl)
    .replaceAll("{{PROJECT_KEY}}", projectKey)
    .replaceAll("{{EXPORT_FILENAME}}", exportFilename);
  const publicTemplate = sanitizePublicHtml(renderedTemplate);
  const sourceSha256 = sha256(renderedTemplate);
  const publicSha256 = sha256(publicTemplate);
  await writeFile(
    path.join(projectRoot, ".detail-page", "authoring", "detail-page.html"),
    renderedTemplate,
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, "output", "detail-page.html"),
    publicTemplate,
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, ".detail-page", "output-state.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        wing_export_required: true,
        canonical_entry: "output/detail-page.html",
        source_revision_id: `source-initial-${sourceSha256.slice(0, 12)}`,
        current_source_revision_sha256: sourceSha256,
        current_authoring_sha256: sourceSha256,
        current_public_sha256: publicSha256,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
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
      entry: "output/detail-page.html",
      canonicalEntry: "output/detail-page.html",
      internalEditableRevision:
        ".detail-page/authoring/detail-page.html",
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
    "output",
    ".detail-page/authoring",
  ];
  await Promise.all(
    adoptedDirectories.map((directory) =>
      mkdir(path.join(root, directory), { recursive: true }),
    ),
  );
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await saveProjectOutput(root, {
    html: await readFile(legacyHtmlPath, "utf8"),
    now: new Date(now),
  });
  return { projectRoot: root, state };
}
