import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertRubricDefinition } from "../../skills/detail-page-maker-skill/scripts/orchestration/rubric-loop.mjs";

const SKILL_ROOT = new URL(
  "../../skills/detail-page-maker-skill/",
  import.meta.url,
);
const POLICY_URL = new URL(
  "policies/behance-commerce-v0.1.json",
  SKILL_ROOT,
);
const BEHANCE_REFERENCE_URL = new URL(
  "references/behance-rubric.md",
  SKILL_ROOT,
);
const AISYNC_REFERENCE_URL = new URL(
  "references/aisync-flow-comparison.md",
  SKILL_ROOT,
);
const AISYNC_COMMIT = "afcfdf8d9de2b0f144d50a80e0e56e3a57c229f3";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalHash(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function loadAssets() {
  const policyBytes = readFileSync(POLICY_URL);
  const behanceBytes = readFileSync(BEHANCE_REFERENCE_URL);
  const aisyncBytes = readFileSync(AISYNC_REFERENCE_URL);
  return {
    policy: JSON.parse(policyBytes.toString("utf8")),
    behanceBytes,
    behance: behanceBytes.toString("utf8"),
    aisync: aisyncBytes.toString("utf8"),
  };
}

test("정본 rubric은 11개 기준과 가중치 100, validator·수정 scope 계약을 가진다", () => {
  const { policy } = loadAssets();

  assert.equal(policy.schema_version, "1.0");
  assert.equal(policy.rubric_id, "behance-commerce");
  assert.equal(policy.rubric_version, "behance-commerce-v0.1");
  assert.equal(policy.dimensions.length, 11);
  assert.deepEqual(
    policy.dimensions.map((item) => item.dimension_id),
    Array.from({ length: 11 }, (_, index) =>
      `R${String(index + 1).padStart(2, "0")}`,
    ),
  );
  assert.equal(
    policy.dimensions.reduce((sum, item) => sum + item.weight, 0),
    100,
  );

  for (const dimension of policy.dimensions) {
    assert.ok(["deterministic", "model", "human"].includes(dimension.validator_kind));
    assert.ok(dimension.validator_ownership.primary);
    assert.ok(Array.isArray(dimension.validator_ownership.independent_validators));
    assert.equal(typeof dimension.hard_gate, "boolean");
    assert.ok(Number.isFinite(dimension.minimum_score));
    assert.equal(dimension.min_score, dimension.minimum_score);
    assert.ok(dimension.minimum_score >= 0 && dimension.minimum_score <= 100);
    assert.ok(dimension.evidence_requirement.length > 0);
    assert.ok(Object.keys(dimension.issue_to_repair_scope_code).length > 0);
    assert.ok(Array.isArray(dimension.hard_failure_codes));
  }
  assert.equal(assertRubricDefinition(policy).rubric_sha256, policy.rubric_sha256);
});

test("benchmark snapshot은 조사일과 8개 primary URL, 실제 reference SHA-256을 고정한다", () => {
  const { policy, behance, behanceBytes } = loadAssets();
  const snapshot = policy.source_snapshot;

  assert.equal(snapshot.research_date, "2026-07-30");
  assert.equal(snapshot.reference_path, "references/behance-rubric.md");
  assert.equal(snapshot.sha256, sha256(behanceBytes));
  assert.equal(snapshot.primary_urls.length, 8);
  assert.equal(new Set(snapshot.primary_urls).size, 8);
  for (const url of snapshot.primary_urls) {
    assert.match(url, /^https:\/\/www\.behance\.net\/gallery\/\d+\//);
    assert.ok(behance.includes(url), `reference에서 source URL 누락: ${url}`);
  }
});

test("외부 flow 비교는 immutable commit·조사일·가져올 것과 버릴 것을 보존한다", () => {
  const { aisync } = loadAssets();

  assert.ok(aisync.includes("조사일: 2026-07-30"));
  assert.ok(aisync.includes(AISYNC_COMMIT));
  assert.ok(
    aisync.includes(
      `https://github.com/aisyncclub/detail_page_codex_skill/tree/${AISYNC_COMMIT}`,
    ),
  );
  assert.match(aisync, /한 컷.*한 worker|one-cut-per-worker/i);
  assert.match(aisync, /HTML.*카피.*정본|카피.*HTML.*정본/i);
  assert.match(aisync, /GIF/i);
  assert.match(aisync, /HyperFrames/i);
  assert.match(aisync, /한계/);
});

test("reference와 policy는 research-only·고유 표현 no-copy 경계를 명시한다", () => {
  const { policy, behance, aisync } = loadAssets();

  assert.equal(policy.usage_constraints.source_material_research_only, true);
  assert.equal(policy.usage_constraints.no_copy_of_unique_expression, true);
  assert.ok(policy.usage_constraints.prohibited_uses.includes("pixel_similarity"));
  assert.ok(
    policy.usage_constraints.prohibited_uses.includes(
      "production_asset_reuse",
    ),
  );
  assert.match(behance, /research-only/i);
  assert.match(behance, /복제하지|복제 금지|no-copy/i);
  assert.match(aisync, /복제하지|복사하지|no-copy/i);
});

test("publish gate는 97·Behance 90·critical 85와 deterministic hard fail 0을 강제한다", () => {
  const { policy } = loadAssets();

  assert.deepEqual(policy.publish_gate, {
    publish_qa_minimum: 97,
    behance_weighted_minimum: 90,
    critical_dimension_minimum: 85,
    hard_failure_maximum: 0,
    critical_dimension_ids: ["R01", "R04", "R10"],
  });
  const critical = policy.dimensions.filter((item) =>
    policy.publish_gate.critical_dimension_ids.includes(item.dimension_id),
  );
  assert.equal(critical.length, 3);
  assert.ok(critical.every((item) => item.minimum_score >= 85));
  assert.ok(critical.every((item) => item.hard_gate));
  assert.equal(policy.policy.sha256, canonicalHash(policy.publish_gate));
});

test("calibration fixture와 rubric 자체 hash는 canonical payload에서 실제 계산된다", () => {
  const { policy } = loadAssets();
  const fixture = policy.calibration_fixture;

  assert.ok(fixture.fixture_id);
  assert.deepEqual(fixture.canonical_payload.viewports, [
    {
      css_width: 320,
      device_scale_factor: 1,
      physical_width: 320,
      purpose: "hidden_overflow_qa",
    },
    {
      css_width: 360,
      device_scale_factor: 1,
      physical_width: 360,
      purpose: "hidden_overflow_qa",
    },
    {
      css_width: 390,
      device_scale_factor: 2,
      physical_width: 780,
      purpose: "authoring_and_delivery",
    },
  ]);
  const byId = Object.fromEntries(
    policy.dimensions.map((dimension) => [
      dimension.dimension_id,
      dimension,
    ]),
  );
  assert.match(byId.R03.evidence_requirement.join(" "), /390 CSS px/);
  assert.match(
    byId.R10.evidence_requirement.join(" "),
    /390 CSS px.*780 physical px/,
  );
  assert.match(
    byId.R10.evidence_requirement.join(" "),
    /320 CSS px.*360 CSS px/,
  );
  assert.equal(fixture.sha256, canonicalHash(fixture.canonical_payload));
  const rubricBody = structuredClone(policy);
  delete rubricBody.rubric_sha256;
  assert.equal(policy.rubric_sha256, canonicalHash(rubricBody));
});

test("versioned stop policy는 전체 3회·section 2회·재발·plateau·budget 중단을 고정한다", () => {
  const { policy } = loadAssets();

  assert.deepEqual(policy.stop_policy, {
    policy_id: "repair-stop.behance-commerce",
    version: "1.0.0",
    max_total_attempts: 3,
    max_section_attempts: 2,
    recurring_issue_limit: 2,
    plateau_window: 2,
    min_score_improvement: 2,
    plateau_action: "PLATEAU_AWAITING_USER",
    budget_exhausted_action: "BUDGET_AWAITING_USER",
  });
});
