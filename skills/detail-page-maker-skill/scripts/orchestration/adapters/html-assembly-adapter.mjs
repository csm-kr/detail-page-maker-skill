import { createHash } from "node:crypto";

const COPY_CATEGORIES = new Set([
  "headline",
  "body",
  "specification",
  "test_condition",
  "caution",
]);
const REQUIRED_POLICY_CATEGORIES = Object.freeze([
  "body",
  "specification",
  "test_condition",
  "caution",
]);

export class HtmlAssemblyError extends Error {
  constructor(errors) {
    super("Resolved SectionGraph를 HTML로 조합할 수 없습니다.");
    this.name = "HtmlAssemblyError";
    this.code = "INVALID_RESOLVED_SECTION_GRAPH";
    this.details = { errors };
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeAssetPath(value) {
  const text = String(value ?? "").replaceAll("\\", "/");
  return text
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function safeColor(value, fallback) {
  return /^#[a-f0-9]{3,8}$/i.test(String(value || ""))
    ? value
    : fallback;
}

function validate(graph) {
  const errors = [];
  const add = (code, path, message) =>
    errors.push({ code, path, message });
  if (!graph?.graph_id || !graph?.plan_artifact_id) {
    add(
      "GRAPH_ID_REQUIRED",
      "graph_id",
      "graph_id와 plan_artifact_id가 필요합니다.",
    );
  }
  if (!Array.isArray(graph?.sections) || graph.sections.length === 0) {
    add(
      "SECTION_REQUIRED",
      "sections",
      "section이 하나 이상 필요합니다.",
    );
  }
  const sectionIds = new Set();
  const slotIds = new Set();
  const copyIds = new Set();
  const presentCopyCategories = new Set();
  for (const [sectionIndex, section] of (
    graph?.sections ?? []
  ).entries()) {
    const sectionPath = `sections[${sectionIndex}]`;
    if (!section?.section_id || sectionIds.has(section.section_id)) {
      add(
        "INVALID_SECTION_ID",
        `${sectionPath}.section_id`,
        "고유한 section_id가 필요합니다.",
      );
    }
    sectionIds.add(section?.section_id);
    if (
      !Array.isArray(section?.claim_ids) ||
      section.claim_ids.length === 0
    ) {
      add(
        "CLAIM_REQUIRED",
        `${sectionPath}.claim_ids`,
        "section에는 claim_id가 하나 이상 필요합니다.",
      );
    }
    if (
      !Array.isArray(section?.copy_blocks) ||
      section.copy_blocks.length === 0
    ) {
      add(
        "EDITABLE_COPY_REQUIRED",
        `${sectionPath}.copy_blocks`,
        "HTML 정본 copy block이 하나 이상 필요합니다.",
      );
    }
    for (const [copyIndex, copy] of (
      section?.copy_blocks ?? []
    ).entries()) {
      if (
        !copy?.copy_id ||
        copyIds.has(copy.copy_id) ||
        !String(copy?.text || "").trim() ||
        !COPY_CATEGORIES.has(copy?.semantic_category)
      ) {
        add(
          "INVALID_COPY_BLOCK",
          `${sectionPath}.copy_blocks[${copyIndex}]`,
          "고유한 copy_id, semantic_category와 비어 있지 않은 text가 필요합니다.",
        );
      }
      copyIds.add(copy?.copy_id);
      if (COPY_CATEGORIES.has(copy?.semantic_category)) {
        presentCopyCategories.add(copy.semantic_category);
      }
    }
    for (const [slotIndex, slot] of (
      section?.media_slots ?? []
    ).entries()) {
      const slotPath = `${sectionPath}.media_slots[${slotIndex}]`;
      if (!slot?.slot_id || slotIds.has(slot.slot_id)) {
        add(
          "INVALID_SLOT_ID",
          `${slotPath}.slot_id`,
          "고유한 slot_id가 필요합니다.",
        );
      }
      slotIds.add(slot?.slot_id);
      if (!slot?.approved_artifact_id) {
        add(
          "APPROVED_ARTIFACT_REQUIRED",
          `${slotPath}.approved_artifact_id`,
          "승인된 media artifact만 조합할 수 있습니다.",
        );
      }
      if (!["image", "gif"].includes(slot?.kind) || !slot?.src) {
        add(
          "INVALID_MEDIA_SLOT",
          slotPath,
          "media slot에는 image/gif kind와 src가 필요합니다.",
        );
      }
      if (slot?.kind === "gif" && !slot?.fallback_src) {
        add(
          "GIF_FALLBACK_REQUIRED",
          `${slotPath}.fallback_src`,
          "GIF에는 reduced-motion용 정지 fallback이 필요합니다.",
        );
      }
    }
  }
  const copyPolicy = graph?.copy_category_policy;
  const requiredCategories = Array.isArray(
    copyPolicy?.required_categories,
  )
    ? copyPolicy.required_categories
    : [];
  const notApplicable = Array.isArray(copyPolicy?.not_applicable)
    ? copyPolicy.not_applicable
    : [];
  const notApplicableCategories = new Set();
  if (
    !copyPolicy ||
    requiredCategories.some(
      (category) =>
        !REQUIRED_POLICY_CATEGORIES.includes(category),
    ) ||
    new Set(requiredCategories).size !== requiredCategories.length
  ) {
    add(
      "COPY_CATEGORY_POLICY_INVALID",
      "copy_category_policy",
      "본문·사양·시험조건·주의사항의 required/not-applicable 정책이 필요합니다.",
    );
  }
  for (const [index, decision] of notApplicable.entries()) {
    const invalid =
      !REQUIRED_POLICY_CATEGORIES.includes(decision?.category) ||
      requiredCategories.includes(decision?.category) ||
      notApplicableCategories.has(decision?.category) ||
      !String(decision?.decision_id || "").trim() ||
      !String(decision?.reason || "").trim();
    if (invalid) {
      add(
        "COPY_CATEGORY_NOT_APPLICABLE_INVALID",
        `copy_category_policy.not_applicable[${index}]`,
        "not-applicable에는 비필수 category, decision_id, reason이 필요합니다.",
      );
    }
    notApplicableCategories.add(decision?.category);
  }
  const uncovered = REQUIRED_POLICY_CATEGORIES.filter(
    (category) =>
      !presentCopyCategories.has(category) &&
      !notApplicableCategories.has(category),
  );
  const requiredMissing = requiredCategories.filter(
    (category) => !presentCopyCategories.has(category),
  );
  if (uncovered.length > 0 || requiredMissing.length > 0) {
    add(
      "COPY_CATEGORY_COVERAGE_REQUIRED",
      "copy_category_policy",
      "본문·사양·시험조건·주의사항은 DOM copy 또는 명시적 not-applicable 결정으로 닫아야 합니다.",
    );
  }
  return errors;
}

function renderCopy(copy, claimId) {
  const tag =
    copy.kind === "headline"
      ? "h2"
      : copy.kind === "label"
        ? "strong"
        : "p";
  return `<${tag} data-copy-id="${escapeHtml(copy.copy_id)}" data-copy-category="${escapeHtml(copy.semantic_category)}" data-claim-id="${escapeHtml(claimId)}">${escapeHtml(copy.text)}</${tag}>`;
}

function renderMedia(slot) {
  const common = `data-slot-id="${escapeHtml(slot.slot_id)}" data-artifact-id="${escapeHtml(slot.approved_artifact_id)}"`;
  if (slot.kind === "gif") {
    return `<figure ${common} class="media media--motion"><img class="motion-source" src="${safeAssetPath(slot.src)}" alt="${escapeHtml(slot.alt)}"><img class="motion-fallback" src="${safeAssetPath(slot.fallback_src)}" alt="${escapeHtml(slot.alt)}"></figure>`;
  }
  return `<figure ${common} class="media"><img src="${safeAssetPath(slot.src)}" alt="${escapeHtml(slot.alt)}" loading="lazy"></figure>`;
}

export function assembleEditableHtml(graph) {
  const errors = validate(graph);
  if (errors.length > 0) throw new HtmlAssemblyError(errors);
  const theme = graph.theme ?? {};
  const sections = graph.sections
    .map((section) => {
      const claimId = section.claim_ids[0];
      const copy = section.copy_blocks
        .map((block) => renderCopy(block, claimId))
        .join("");
      const media = section.media_slots.map(renderMedia).join("");
      return `<section data-section-id="${escapeHtml(section.section_id)}" data-claim-id="${escapeHtml(claimId)}" data-intent="${escapeHtml(section.intent)}"><div class="copy">${copy}</div>${media}</section>`;
    })
    .join("");
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>상품 상세페이지</title>
<style>
:root{--bg:${safeColor(theme.background, "#ffffff")};--fg:${safeColor(theme.foreground, "#111111")};--accent:${safeColor(theme.accent, "#2563eb")}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}
main{width:min(800px,100%);margin:auto}section{padding:clamp(32px,8vw,80px) clamp(20px,5vw,48px)}
h2{font-size:clamp(30px,7vw,58px);line-height:1.08;margin:0 0 20px}p{font-size:clamp(16px,3vw,20px);line-height:1.65}
.media{margin:28px 0 0}.media img{display:block;width:100%;height:auto}.motion-fallback{display:none}
@media (prefers-reduced-motion: reduce){.motion-source{display:none}.motion-fallback{display:block}}
</style>
</head>
<body><main data-graph-id="${escapeHtml(graph.graph_id)}" data-plan-artifact-id="${escapeHtml(graph.plan_artifact_id)}">${sections}</main></body>
</html>`;
  const copyCount = graph.sections.reduce(
    (sum, section) => sum + section.copy_blocks.length,
    0,
  );
  return {
    html,
    manifest: {
      schema_version: "1.0",
      graph_id: graph.graph_id,
      plan_artifact_id: graph.plan_artifact_id,
      html_sha256: createHash("sha256").update(html).digest("hex"),
      copy_owner: "html",
      editable_text_ratio: copyCount > 0 ? 1 : 0,
      copy_category_coverage: {
        present: [
          ...new Set(
            graph.sections.flatMap((section) =>
              section.copy_blocks.map(
                (block) => block.semantic_category,
              ),
            ),
          ),
        ].sort(),
        not_applicable: graph.copy_category_policy.not_applicable
          .map((decision) => decision.category)
          .sort(),
      },
      section_ids: graph.sections.map((section) => section.section_id),
      media_artifact_ids: graph.sections.flatMap((section) =>
        section.media_slots.map((slot) => slot.approved_artifact_id),
      ),
    },
  };
}
