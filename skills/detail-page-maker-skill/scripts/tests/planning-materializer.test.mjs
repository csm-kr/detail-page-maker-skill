import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  materializePlanningDocuments,
} from "../orchestration/planning-materializer.mjs";

test("ProductionPlan 결정이 네 사람용 기획 문서에 실제로 물질화된다", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-plan-materialize-"),
  );
  try {
    const plan = {
      reference_artifact_set: {
        artifacts: [
          {
            reference_id: "reference-current-output",
            role: "current_output",
          },
        ],
        adoption_matrix: [
          {
            reference_id: "reference-current-output",
            trait: "motion 역할",
            decision: "adapt",
            reason: "poster-only 실패를 실제 animation으로 수정",
            target_section_ids: ["section-solution"],
          },
        ],
      },
      category_reference_profile: {
        library_id: "detail-page-category-reference-library",
        primary_archetype_id: "mechanism-structure",
        selected_reference_card_ids: [
          "behance-makeon-led-mask",
          "behance-replaceable-toothbrush",
        ],
        trait_bindings: [
          {
            trait_id: "trait-mechanism-chapter-motion",
            target_ids: [
              "section-solution",
              "image-solution",
              "gif-solution",
            ],
          },
        ],
      },
      commercial_flow: {
        section_role_order: [
          "hero",
          "pain",
          "product_answer",
          "solution_group",
          "usage",
          "comparison",
          "choice_and_fit",
          "specification_and_caution",
          "objection_and_faq",
          "decision_recap",
        ],
      },
      claim_graph: {
        claims: [
          {
            claim_id: "claim-observed-structure",
            claim_type: "observable_structure",
            observation_scope: "제품 하단의 실제 구멍",
          },
        ],
      },
      section_graph_draft: {
        sections: [
          {
            section_id: "section-solution",
            customer_question: "무엇이 다른가",
          },
        ],
      },
      image_job_set: {
        jobs: [
          {
            job_id: "image-solution",
            visual_contract: {
              role: "core_feature",
              scene_kind: "mechanism_macro",
            },
          },
        ],
      },
      gif_brief_set: {
        briefs: [
          {
            brief_id: "gif-solution",
            semantic_contract: {
              customer_question: "구조가 어떻게 보이는가",
              start_state: "전체 제품",
              mid_state: "구조 위치 추적",
              end_state: "구조 확대",
            },
          },
        ],
      },
      rubric_target: {
        target_score: 97,
        reference_comparison: {
          reference_ids: ["reference-current-output"],
        },
      },
      provenance: {
        applied_rules: {
          commercial: [
            {
              rule_id: "CR-015",
              target_ids: ["section-solution"],
              required_effect: "관찰 구조와 효능 분리",
              acceptance_check_ids: ["claim-boundary"],
            },
          ],
          taste: [],
          motion: [
            {
              rule_id: "MR-013",
              target_ids: ["gif-solution"],
              required_effect: "의미 상태 변화",
              acceptance_check_ids: ["semantic-delta"],
            },
          ],
        },
      },
    };
    const result = await materializePlanningDocuments({
      projectRoot: root,
      productionPlan: plan,
    });
    assert.equal(result.documents.length, 4);
    for (const document of result.documents) {
      assert.match(document.sha256, /^[a-f0-9]{64}$/);
      const text = await readFile(path.join(root, document.path), "utf8");
      assert.match(text, /production_plan_sha256/);
      assert.doesNotMatch(text, /\{\{[^}]+\}\}/);
    }
    assert.match(
      await readFile(
        path.join(
          root,
          ".detail-page",
          "planning",
          "GIF.md",
        ),
        "utf8",
      ),
      /구조가 어떻게 보이는가/,
    );
    assert.match(
      await readFile(
        path.join(
          root,
          ".detail-page",
          "planning",
          "DESIGN.md",
        ),
        "utf8",
      ),
      /mechanism-structure/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
