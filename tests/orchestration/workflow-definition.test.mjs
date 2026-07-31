import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKFLOW_DEFINITION,
  validateWorkflowDefinition,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/workflow-definition.mjs";

test("G0부터 G5까지 모든 stage는 입력·출력·policy·consumer를 명시한다", () => {
  const report = validateWorkflowDefinition(WORKFLOW_DEFINITION);
  assert.deepEqual(report.errors, []);
  assert.equal(report.ok, true);
  for (const stage of WORKFLOW_DEFINITION.stages) {
    assert.ok(Array.isArray(stage.required_inputs));
    assert.ok(Array.isArray(stage.produces));
    assert.ok(stage.gate_policy_id);
    assert.ok(Array.isArray(stage.consumers));
  }
});

test("핵심 gate와 제작 stage가 전체 workflow에 존재한다", () => {
  const ids = new Set(WORKFLOW_DEFINITION.stages.map((stage) => stage.stage_id));
  for (const expected of [
    "S0_INTAKE",
    "G0A_SUPPLIER",
    "G0R_RIGHTS",
    "G0C_NORMALIZE",
    "G0Q_QA",
    "G0U_APPROVAL",
    "G1D_DISCOVERY",
    "G1DQ_SELECTION",
    "G1A_MARKET",
    "G1B_KNOWLEDGE",
    "G1C_PLAN",
    "G1Q_QA",
    "G1U_APPROVAL",
    "G2S_CONFIG_APPROVAL",
    "G2A_IMAGE",
    "G2Q_QA",
    "G2U_APPROVAL",
    "G3N_MOTION_DECISION",
    "G3P_PREVIEW",
    "G3V_PREVIEW_APPROVAL",
    "G3R_RENDER",
    "G3Q_QA",
    "G3U_APPROVAL",
    "G4A_ASSEMBLY",
    "G4Q0_PRE_STUDIO_QA",
    "S1_STUDIO_WORKING",
    "G4C_STUDIO_COMMIT",
    "G4Q_RUBRIC",
    "G4U_APPROVAL",
    "G5_PUBLISH_QA",
    "G5U_APPROVAL",
  ]) {
    assert.ok(ids.has(expected), `missing ${expected}`);
  }
});

test("G2와 G3는 사용자 승인과 별도 QA를 우회할 수 없다", () => {
  const byId = Object.fromEntries(
    WORKFLOW_DEFINITION.stages.map((stage) => [stage.stage_id, stage]),
  );
  assert.ok(
    byId.G2A_IMAGE.required_inputs.includes("decision.image_config_approval"),
  );
  assert.ok(
    byId.G3R_RENDER.required_inputs.includes("decision.motion_preview_approval"),
  );
  assert.deepEqual(byId.G3N_MOTION_DECISION.produces, [
    "decision.motion_required",
  ]);
  assert.deepEqual(byId.G3N_MOTION_DECISION.output_variants, []);
  assert.ok(
    byId.G4A_ASSEMBLY.required_inputs.includes("media.gif_approved"),
  );
  assert.ok(
    byId.G5_PUBLISH_QA.required_inputs.includes("decision.page_approval"),
  );
  assert.deepEqual(
    byId.G4Q_RUBRIC.repair_target_stages,
    ["G4A_ASSEMBLY"],
  );
  for (const stageId of ["G4Q_RUBRIC", "G5_PUBLISH_QA"]) {
    assert.deepEqual(byId[stageId].validation_policy, {
      receipt_required: true,
      min_score: 97,
      min_behance_quality_score: 90,
      min_critical_dimension_score: 85,
      max_deterministic_hard_failures: 0,
      reference_comparison_required: true,
      category_reference_comparison_required: true,
      post_export_validation_required: true,
    });
  }
});

test("모든 선언 consumer는 producer output을 required/any-of input으로 실제 소비한다", () => {
  const byId = new Map(
    WORKFLOW_DEFINITION.stages.map((stage) => [stage.stage_id, stage]),
  );
  for (const producer of WORKFLOW_DEFINITION.stages) {
    for (const consumerId of producer.consumers) {
      const consumer = byId.get(consumerId);
      const accepted = new Set([
        ...consumer.required_inputs,
        ...consumer.any_of_inputs.flat(),
      ]);
      assert.ok(
        producer.produces.some((type) => accepted.has(type)),
        `${producer.stage_id} → ${consumerId}에 실제 artifact type edge가 필요합니다.`,
      );
    }
  }
});

test("non-user stage는 실제 실행 skill과 adapter를 runner contract로 고정한다", () => {
  const byId = Object.fromEntries(
    WORKFLOW_DEFINITION.stages.map((stage) => [stage.stage_id, stage]),
  );
  const expected = {
    G0A_SUPPLIER: ["dmk-extractor", "DmkExtractorAdapter"],
    G0R_RIGHTS: ["detail-page-maker-skill", "RightsPolicyAdapter"],
    G1A_MARKET: ["coupang-extractor", "CoupangExtractorAdapter"],
    G1B_KNOWLEDGE: [
      "detail-page-maker-skill",
      "knowledge-freeze-adapter",
    ],
    G2A_IMAGE: [
      "god-tibo-gpt-image2-skill",
      "GodTiboImageAdapter",
    ],
    G3P_PREVIEW: ["hyperframes", "HyperFramesMotionAdapter"],
    G3R_RENDER: ["hyperframes", "HyperFramesMotionAdapter"],
    G4A_ASSEMBLY: [
      "design-taste-frontend",
      "HtmlAssemblyAdapter",
    ],
    G4Q0_PRE_STUDIO_QA: [
      "browser-harness",
      "BrowserCaptureAdapter",
    ],
    G4C_STUDIO_COMMIT: [
      "detail-page-maker-skill",
      "StudioCommitAdapter",
    ],
    G4Q_RUBRIC: ["browser-harness", "BrowserCaptureAdapter"],
  };
  for (const [stageId, [skillId, adapterId]] of Object.entries(expected)) {
    assert.deepEqual(byId[stageId].runner_contract, {
      skill_id: skillId,
      adapter_id: adapterId,
    });
  }
  for (const stage of WORKFLOW_DEFINITION.stages.filter(
    (item) => !item.user_gate,
  )) {
    assert.ok(stage.runner_contract?.skill_id);
    assert.ok(stage.runner_contract?.adapter_id);
  }
});
