import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../skills/detail-page-maker-skill",
);

async function readSkill(relativePath) {
  return readFile(path.join(SKILL_ROOT, relativePath), "utf8");
}

test("detail-page-flow-v1은 확정된 390/780 문제-해결-motion 계약을 고정한다", async () => {
  const policy = JSON.parse(
    await readSkill("policies/detail-page-flow-v1.json"),
  );

  assert.equal(policy.policy_id, "detail-page-flow");
  assert.equal(policy.status, "required");
  assert.equal(policy.canvas.authoring_width_css_px, 390);
  assert.equal(policy.canvas.delivery_asset_width_px, 780);
  assert.equal(policy.inputs.actual_product_photos, "optional");
  assert.equal(policy.inputs.supplier_same_sku_media.required, true);
  assert.deepEqual(
    policy.inputs.image_generation_references.allowed_source_kinds,
    ["supplier_same_sku", "actual_product_photo"],
  );
  assert.equal(
    policy.inputs.image_generation_references.research_only_allowed,
    false,
  );
  assert.equal(
    policy.content.hero.product_visual_priority,
    "largest",
  );
  assert.equal(policy.content.hero.commercial_intensity, "high");
  assert.equal(
    policy.content.hero.product_identity_change_allowed,
    false,
  );
  assert.equal(
    policy.content.hero.output_assurance
      .minimum_product_section_area_ratio,
    0.35,
  );
  assert.equal(
    policy.content.hero.output_assurance
      .commercial_visual_minimum_score,
    90,
  );
  assert.deepEqual(
    policy.content.hero.output_assurance.required_checks,
    [
      "hero.identity_preserved",
      "hero.product_largest",
      "hero.commercial_intensity_high",
      "hero.static",
      "hero.single_primary_benefit",
    ],
  );
  assert.deepEqual(policy.content.pain.statement_count, {
    minimum: 3,
    maximum: 5,
  });
  assert.equal(policy.content.pain.motion_count_minimum, 2);
  assert.deepEqual(policy.content.solution_group.solution_count, {
    minimum: 3,
    maximum: 5,
  });
  assert.equal(
    policy.content.solution_group.pain_solution_mapping,
    "one_to_one_in_order",
  );
  assert.equal(policy.motion.total_count_minimum, 5);
  assert.equal(policy.motion.effective_minimum_from_required_roles, 7);
  assert.deepEqual(policy.motion.planning_default_range, {
    minimum: 7,
    maximum: 9,
  });
  assert.equal(policy.motion.total_count_maximum, null);
});

test("공개 출력과 Wing은 detail-page.html 및 export별 새 CDN 경로를 사용한다", async () => {
  const policy = JSON.parse(
    await readSkill("policies/detail-page-flow-v1.json"),
  );

  assert.equal(policy.output.customer_entry, "output/detail-page.html");
  assert.equal(policy.output.legacy_deliverables_allowed, false);
  assert.equal(policy.output.legacy_index_entry_allowed, false);
  assert.equal(policy.cdn.new_path_per_export, true);
  assert.equal(policy.cdn.overwrite_existing_export_path, false);
  assert.match(policy.cdn.path_template, /\{project_key\}\/\{export_id\}/);
  assert.equal(policy.public_output.allowed_internal_metadata_count, 0);
});

test("SKILL은 content-contract와 workflow를 항상 읽고 로컬 extractor를 사용한다", async () => {
  const [skill, contentContract] = await Promise.all([
    readSkill("SKILL.md"),
    readSkill("references/content-contract.md"),
  ]);

  assert.match(skill, /항상 \[`references\/content-contract\.md`\]/);
  assert.match(skill, /dmk-extractor/);
  assert.match(skill, /coupang-extractor/);
  assert.match(skill, /가용 sub-agent 수만큼/);
  assert.match(contentContract, /고객 불편 인용 말풍선 3~5개/);
  assert.match(contentContract, /핵심 불편 motion 2개 이상/);
  assert.match(contentContract, /Hero assurance bundle/);
  assert.match(contentContract, /최근 20개/);
});

test("doctor는 HyperFrames를 진단할 때 네트워크 설치를 허용하지 않는다", async () => {
  const cli = await readSkill("scripts/detail-page.mjs");

  assert.match(
    cli,
    /probe\("npx",\s*\[\s*"--no-install",\s*"hyperframes",\s*"--version"/,
  );
  assert.doesNotMatch(cli, /npx[^]*hyperframes@latest/);
});
