import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function planDigest(plan) {
  return sha256(Buffer.from(canonicalJson(plan), "utf8"));
}

function jsonBlock(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function ruleEffectRows(plan) {
  return Object.entries(plan?.provenance?.applied_rules ?? {})
    .flatMap(([kind, bindings]) =>
      (Array.isArray(bindings) ? bindings : []).map((binding) => ({
        kind,
        rule_id: binding.rule_id,
        target_ids: binding.target_ids,
        required_effect: binding.required_effect,
        acceptance_check_ids: binding.acceptance_check_ids,
      })),
    );
}

function documentHeader(title, digest) {
  return [
    `# ${title}`,
    "",
    `- \`source\`: approved ProductionPlan`,
    `- \`production_plan_sha256\`: \`${digest}\``,
    "- `generated`: deterministic planning materialization",
    "",
  ].join("\n");
}

function renderCommercial(plan, digest) {
  return [
    documentHeader("Commercial Plan", digest),
    "## Reference decisions",
    "",
    jsonBlock(plan.reference_artifact_set),
    "",
    "## Category reference cohort",
    "",
    jsonBlock(plan.category_reference_profile),
    "",
    "## Purchase flow",
    "",
    jsonBlock(plan.commercial_flow),
    "",
    "## Claim boundary",
    "",
    jsonBlock(plan.claim_graph),
    "",
    "## Executable rule effects",
    "",
    jsonBlock(ruleEffectRows(plan)),
    "",
  ].join("\n");
}

function renderDesign(plan, digest) {
  return [
    documentHeader("Design Plan", digest),
    "## Reference adoption matrix",
    "",
    jsonBlock(plan.reference_artifact_set?.adoption_matrix ?? []),
    "",
    "## Category traits and visual ambition bindings",
    "",
    jsonBlock(plan.category_reference_profile),
    "",
    "## Image art direction and coverage",
    "",
    jsonBlock(plan.image_job_set),
    "",
    "## 32-candidate shot generation and asset selection",
    "",
    jsonBlock({
      image_generation: plan.sales_motion_pipeline?.image_generation,
      asset_selection: plan.sales_motion_pipeline?.asset_selection,
    }),
    "",
    "## 390 authoring / 780 delivery QA target",
    "",
    jsonBlock(plan.rubric_target),
    "",
  ].join("\n");
}

function renderBuyerJourney(plan, digest) {
  return [
    documentHeader("Buyer Journey", digest),
    "## Section graph",
    "",
    jsonBlock(plan.section_graph_draft),
    "",
    "## Commercial sequence",
    "",
    jsonBlock(plan.commercial_flow?.section_role_order ?? []),
    "",
  ].join("\n");
}

function renderGif(plan, digest) {
  return [
    documentHeader("GIF and Motion Plan", digest),
    "## Motion briefs",
    "",
    jsonBlock(plan.gif_brief_set),
    "",
    "## HyperFrames information-sales pipeline",
    "",
    jsonBlock(plan.sales_motion_pipeline),
    "",
    "## Applied motion rules",
    "",
    jsonBlock(plan.provenance?.applied_rules?.motion ?? []),
    "",
    "## Category motion pattern bindings",
    "",
    jsonBlock(
      plan.category_reference_profile
        ?.motion_pattern_family_bindings ?? [],
    ),
    "",
    "## Public-output acceptance",
    "",
    "- actual animation source in public DOM",
    "- exact DOM → manifest → output/media bytes closure",
    "- first/mid/last semantic state change",
    "- one message understood within one second",
    "- deterministic silent MP4 → FFmpeg GIF + animated WebP",
    "- verified dimension/pair inputs and confidence-routed callouts",
    "- poster is fallback only and never counts as delivered motion",
    "",
  ].join("\n");
}

async function atomicWrite(target, text) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, target);
}

export async function materializePlanningDocuments({
  projectRoot,
  productionPlan,
}) {
  const root = path.resolve(projectRoot);
  const digest = planDigest(productionPlan);
  const documents = [
    ["COMMERCIAL.md", renderCommercial(productionPlan, digest)],
    ["DESIGN.md", renderDesign(productionPlan, digest)],
    ["BUYER-JOURNEY.md", renderBuyerJourney(productionPlan, digest)],
    ["GIF.md", renderGif(productionPlan, digest)],
  ];
  const results = [];
  for (const [fileName, text] of documents) {
    if (text.includes("{{") || text.trim().length < 300) {
      throw new Error(
        `${fileName} planning materialization이 비어 있거나 template token을 포함합니다.`,
      );
    }
    const target = path.join(
      root,
      ".detail-page",
      "planning",
      fileName,
    );
    await atomicWrite(target, text);
    const bytes = Buffer.from(text, "utf8");
    results.push({
      path: path
        .relative(root, target)
        .split(path.sep)
        .join("/"),
      size_bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  return {
    schema_version: "1.0",
    production_plan_sha256: digest,
    documents: results,
  };
}

export { planDigest as planningProductionPlanDigest };
