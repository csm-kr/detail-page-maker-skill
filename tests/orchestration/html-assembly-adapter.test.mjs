import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleEditableHtml,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/html-assembly-adapter.mjs";

function resolvedGraph() {
  return {
    graph_id: "resolved-cooling-shirt",
    plan_artifact_id: "plan-cooling-shirt",
    copy_category_policy: {
      required_categories: ["body"],
      not_applicable: [
        {
          category: "specification",
          decision_id: "decision-specification-not-applicable",
          reason: "이 fixture는 HTML 조합 최소 계약만 검증한다.",
        },
        {
          category: "test_condition",
          decision_id: "decision-test-condition-not-applicable",
          reason: "정량 시험 주장이 없는 fixture다.",
        },
        {
          category: "caution",
          decision_id: "decision-caution-not-applicable",
          reason: "별도 주의 문구가 없는 fixture다.",
        },
      ],
    },
    sections: [
      {
        section_id: "section-hero",
        intent: "identity",
        claim_ids: ["claim-cooling-contact"],
        copy_blocks: [
          {
            copy_id: "copy-hero-headline",
            kind: "headline",
            semantic_category: "headline",
            text: "닿는 순간 가볍게",
          },
          {
            copy_id: "copy-hero-body",
            kind: "body",
            semantic_category: "body",
            text: "검증된 원단 정보와 실제 구성만 설명합니다.",
          },
        ],
        media_slots: [
          {
            slot_id: "slot-hero-image",
            kind: "image",
            approved_artifact_id: "image-approved-hero",
            src: "assets/hero.webp",
            alt: "제품 앞면과 구성",
          },
          {
            slot_id: "slot-cooling-motion",
            kind: "gif",
            approved_artifact_id: "gif-approved-cooling",
            src: "assets/cooling.gif",
            fallback_src: "assets/cooling-poster.webp",
            alt: "원단 움직임의 전후 비교",
          },
        ],
      },
    ],
    theme: {
      background: "#f5f2ea",
      foreground: "#16201d",
      accent: "#37a38c",
    },
  };
}

test("resolved graph를 editable semantic HTML과 content hash로 조합한다", () => {
  const result = assembleEditableHtml(resolvedGraph());

  assert.match(result.html, /data-section-id="section-hero"/);
  assert.match(result.html, /data-claim-id="claim-cooling-contact"/);
  assert.match(result.html, /data-slot-id="slot-hero-image"/);
  assert.match(result.html, /data-artifact-id="image-approved-hero"/);
  assert.match(result.html, />닿는 순간 가볍게</);
  assert.match(result.html, /data-copy-category="body"/);
  assert.match(result.html, /prefers-reduced-motion: reduce/);
  assert.match(result.html, /assets\/cooling-poster\.webp/);
  assert.equal(result.manifest.copy_owner, "html");
  assert.equal(result.manifest.editable_text_ratio, 1);
  assert.match(result.manifest.html_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.manifest.copy_category_coverage, {
    present: ["body", "headline"],
    not_applicable: ["caution", "specification", "test_condition"],
  });
});

test("승인 artifact나 GIF fallback이 없는 media slot은 조합하지 않는다", () => {
  const graph = resolvedGraph();
  delete graph.sections[0].media_slots[0].approved_artifact_id;
  delete graph.sections[0].media_slots[1].fallback_src;

  assert.throws(
    () => assembleEditableHtml(graph),
    (error) =>
      error.code === "INVALID_RESOLVED_SECTION_GRAPH" &&
      error.details.errors.some(
        (item) => item.code === "APPROVED_ARTIFACT_REQUIRED",
      ) &&
      error.details.errors.some(
        (item) => item.code === "GIF_FALLBACK_REQUIRED",
      ),
  );
});

test("asset 경로와 사용자 카피를 HTML로 안전하게 escape한다", () => {
  const graph = resolvedGraph();
  graph.sections[0].copy_blocks[0].text = "<script>alert(1)</script>";
  graph.sections[0].media_slots[0].src =
    'assets/hero.webp" onerror="alert(1)';

  const result = assembleEditableHtml(graph);

  assert.doesNotMatch(result.html, /<script>alert/);
  assert.match(result.html, /&lt;script&gt;alert/);
  assert.doesNotMatch(result.html, /onerror=/);
});

test("본문·사양·시험조건·주의사항은 DOM copy 또는 명시적 not-applicable 결정이 필요하다", () => {
  const graph = resolvedGraph();
  graph.copy_category_policy.required_categories = [
    "body",
    "specification",
    "test_condition",
    "caution",
  ];
  graph.copy_category_policy.not_applicable = [];

  assert.throws(
    () => assembleEditableHtml(graph),
    (error) =>
      error.code === "INVALID_RESOLVED_SECTION_GRAPH" &&
      error.details.errors.some(
        (item) => item.code === "COPY_CATEGORY_COVERAGE_REQUIRED",
      ),
  );

  graph.sections[0].copy_blocks.push(
    {
      copy_id: "copy-spec",
      kind: "body",
      semantic_category: "specification",
      text: "구성: 반팔 티셔츠 1매",
    },
    {
      copy_id: "copy-test",
      kind: "body",
      semantic_category: "test_condition",
      text: "확인된 시험 조건은 제공되지 않았습니다.",
    },
    {
      copy_id: "copy-caution",
      kind: "body",
      semantic_category: "caution",
      text: "세탁 전 제품 라벨을 확인하세요.",
    },
  );
  const result = assembleEditableHtml(graph);
  for (const category of [
    "specification",
    "test_condition",
    "caution",
  ]) {
    assert.match(
      result.html,
      new RegExp(`data-copy-category="${category}"`),
    );
  }
});
