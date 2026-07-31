import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const REFERENCE_ROLES = new Set([
  "current_output",
  "positive_reference",
  "negative_reference",
  "approved_exemplar",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function posix(value) {
  return String(value).split(path.sep).join("/");
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attributeValue(tag, attributeName) {
  const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag).match(
    new RegExp(
      `\\s+${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );
  return match
    ? decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "")
    : null;
}

function mediaReferences(html) {
  const refs = [];
  for (const match of String(html).matchAll(
    /<(?:img|source)\b[^>]*\s(?:src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi,
  )) {
    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    const first = raw.split(",")[0]?.trim().split(/\s+/)[0] ?? "";
    if (first) refs.push(decodeHtmlEntities(first));
  }
  for (const match of String(html).matchAll(
    /\sdata-motion-src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  )) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (value) refs.push(decodeHtmlEntities(value));
  }
  return [...new Set(refs)];
}

function isAnimatedWebp(bytes) {
  return (
    bytes.length >= 16 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP" &&
    bytes.includes(Buffer.from("ANIM", "ascii"))
  );
}

async function classifyMotionReference(htmlPath, reference) {
  if (/\.gif(?:[?#]|$)/i.test(reference)) return true;
  if (!/\.webp(?:[?#]|$)/i.test(reference)) return false;
  if (/^(?:data:|https?:|\/\/)/i.test(reference)) return false;
  let decoded;
  try {
    decoded = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  } catch {
    return false;
  }
  const candidate = path.resolve(path.dirname(htmlPath), decoded);
  if (!isWithin(path.dirname(htmlPath), candidate)) return false;
  try {
    return isAnimatedWebp(await readFile(candidate));
  } catch {
    return false;
  }
}

function sectionBlocks(html) {
  const matches = [
    ...String(html).matchAll(
      /<section\b([^>]*)>([\s\S]*?)<\/section\s*>/gi,
    ),
  ];
  return matches.map((match, index) => {
    const opening = `<section${match[1]}>`;
    const body = match[2];
    const role =
      attributeValue(opening, "data-section-role") ||
      attributeValue(opening, "data-role") ||
      "unclassified";
    return {
      position: index + 1,
      role,
      image_count: (body.match(/<img\b/gi) || []).length,
      motion_reference_count:
        (body.match(/\sdata-motion-src\s*=/gi) || []).length +
        (body.match(/\bsrc\s*=\s*["'][^"']+\.gif(?:[?#][^"']*)?["']/gi) || [])
          .length,
      heading_count: (body.match(/<h[1-6]\b/gi) || []).length,
      copy_block_count: (body.match(/<(?:p|li|blockquote)\b/gi) || []).length,
    };
  });
}

function widthHints(html) {
  const values = [];
  for (const match of String(html).matchAll(
    /(?:max-)?width\s*:\s*(\d{3,4})px/gi,
  )) {
    const value = Number(match[1]);
    if (value >= 320 && value <= 1200) values.push(value);
  }
  return [...new Set(values)].sort((left, right) => left - right);
}

export async function profileReferenceHtml({
  filePath,
  workspaceRoot,
  role,
  referenceId,
}) {
  if (!REFERENCE_ROLES.has(role)) {
    throw new Error(`지원하지 않는 reference role입니다: ${role}`);
  }
  const workspace = path.resolve(workspaceRoot);
  const resolved = path.resolve(filePath);
  if (!isWithin(workspace, resolved)) {
    throw new Error("reference HTML은 현재 workspace 안에 있어야 합니다.");
  }
  await access(resolved);
  const bytes = await readFile(resolved);
  const html = bytes.toString("utf8");
  const references = mediaReferences(html);
  const motionFlags = await Promise.all(
    references.map((reference) =>
      classifyMotionReference(resolved, reference),
    ),
  );
  const sections = sectionBlocks(html);
  return {
    reference_id: referenceId,
    role,
    rights: "research_only",
    artifact: {
      media_type: "text/html",
      locator: posix(path.relative(workspace, resolved)),
      size_bytes: bytes.length,
      sha256: sha256(bytes),
    },
    profile: {
      section_count: sections.length,
      image_reference_count: references.filter((reference) =>
        /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(reference),
      ).length,
      motion_reference_count: motionFlags.filter(Boolean).length,
      heading_count: (html.match(/<h[1-6]\b/gi) || []).length,
      section_density_curve: sections,
      section_role_sequence: sections.map((section) => section.role),
      width_hints_px: widthHints(html),
    },
  };
}

export async function buildReferenceArtifactSet({
  projectRoot,
  workspaceRoot,
  references = [],
}) {
  const workspace = path.resolve(workspaceRoot);
  const project = path.resolve(projectRoot);
  if (!isWithin(workspace, project)) {
    throw new Error("프로젝트는 현재 workspace 안에 있어야 합니다.");
  }
  const inputs = [];
  const currentOutput = path.join(project, "output", "detail-page.html");
  try {
    await access(currentOutput);
    inputs.push({
      filePath: currentOutput,
      role: "current_output",
      referenceId: "reference-current-output",
    });
  } catch {
    // A brand-new imported project may not have a baseline yet.
  }
  for (const [index, reference] of references.entries()) {
    inputs.push({
      filePath: reference.filePath,
      role: reference.role,
      referenceId:
        reference.referenceId ||
        `reference-${reference.role}-${String(index + 1).padStart(2, "0")}`,
    });
  }
  if (inputs.length === 0) {
    throw new Error(
      "current output 또는 사용자가 제공한 reference HTML이 하나 이상 필요합니다.",
    );
  }
  const artifacts = [];
  for (const input of inputs) {
    artifacts.push(
      await profileReferenceHtml({
        ...input,
        workspaceRoot: workspace,
      }),
    );
  }
  const body = {
    schema_version: "1.0",
    artifacts,
    adoption_matrix: [],
  };
  return {
    ...body,
    profile_set_sha256: sha256(
      Buffer.from(JSON.stringify(body), "utf8"),
    ),
  };
}

export async function writeReferenceArtifactSet(target, artifactSet) {
  const resolved = path.resolve(target);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify(artifactSet, null, 2)}\n`,
    "utf8",
  );
  await rename(temporary, resolved);
  return resolved;
}

export { REFERENCE_ROLES };
