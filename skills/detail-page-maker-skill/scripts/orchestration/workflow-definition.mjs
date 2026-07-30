const INTERNAL_RUNNER_CONTRACT = Object.freeze({
  skill_id: "detail-page-maker-skill",
  adapter_id: "WorkflowOrchestratorInternalAdapter",
});

const RUNNER_CONTRACTS = Object.freeze({
  G0A_SUPPLIER: Object.freeze({
    skill_id: "dmk-extractor",
    adapter_id: "DmkExtractorAdapter",
  }),
  G0R_RIGHTS: Object.freeze({
    skill_id: "detail-page-maker-skill",
    adapter_id: "RightsPolicyAdapter",
  }),
  G1A_MARKET: Object.freeze({
    skill_id: "coupang-extractor",
    adapter_id: "CoupangExtractorAdapter",
  }),
  G1B_KNOWLEDGE: Object.freeze({
    skill_id: "detail-page-maker-skill",
    adapter_id: "knowledge-freeze-adapter",
  }),
  G2A_IMAGE: Object.freeze({
    skill_id: "god-tibo-gpt-image2-skill",
    adapter_id: "GodTiboImageAdapter",
  }),
  G3P_PREVIEW: Object.freeze({
    skill_id: "hyperframes",
    adapter_id: "HyperFramesMotionAdapter",
  }),
  G3R_RENDER: Object.freeze({
    skill_id: "hyperframes",
    adapter_id: "HyperFramesMotionAdapter",
  }),
  G4A_ASSEMBLY: Object.freeze({
    skill_id: "design-taste-frontend",
    adapter_id: "HtmlAssemblyAdapter",
  }),
  G4Q0_PRE_STUDIO_QA: Object.freeze({
    skill_id: "browser-harness",
    adapter_id: "BrowserCaptureAdapter",
  }),
  G4C_STUDIO_COMMIT: Object.freeze({
    skill_id: "detail-page-maker-skill",
    adapter_id: "StudioCommitAdapter",
  }),
  G4Q_RUBRIC: Object.freeze({
    skill_id: "browser-harness",
    adapter_id: "BrowserCaptureAdapter",
  }),
});

function stage(
  stageId,
  requiredInputs,
  produces,
  gatePolicyId,
  consumers,
  options = {},
) {
  return Object.freeze({
    stage_id: stageId,
    required_inputs: Object.freeze(requiredInputs),
    produces: Object.freeze(produces),
    gate_policy_id: gatePolicyId,
    consumers: Object.freeze(consumers),
    input_producers: Object.freeze(options.inputProducers ?? {}),
    any_of_inputs: Object.freeze(options.anyOfInputs ?? []),
    output_variants: Object.freeze(options.outputVariants ?? []),
    repair_target_stages: Object.freeze(options.repairTargets ?? []),
    runner_contract:
      options.userGate === true
        ? null
        : RUNNER_CONTRACTS[stageId] ?? INTERNAL_RUNNER_CONTRACT,
    validation_policy: options.validationPolicy
      ? Object.freeze(structuredClone(options.validationPolicy))
      : null,
    fan_out_key: options.fanOutKey ?? null,
    user_gate: options.userGate === true,
    mutable_output: options.mutableOutput === true,
  });
}

export const WORKFLOW_DEFINITION = Object.freeze({
  workflow_id: "detail-page-maker",
  version: "3.0.0",
  stages: Object.freeze([
    stage(
      "S0_INTAKE",
      [],
      ["project.intake"],
      "policy.intake.v1",
      ["G0A_SUPPLIER", "G0B_PHOTO", "G1D_DISCOVERY", "G1B_KNOWLEDGE"],
    ),
    stage(
      "G0A_SUPPLIER",
      ["project.intake"],
      ["evidence.supplier_snapshot", "receipt.importer"],
      "policy.supplier.capture.v1",
      ["G0R_RIGHTS"],
    ),
    stage(
      "G0B_PHOTO",
      ["project.intake"],
      ["identity.photo_set"],
      "policy.identity.photo-intake.v1",
      ["G0C_NORMALIZE", "G2A_IMAGE"],
    ),
    stage(
      "G0R_RIGHTS",
      ["evidence.supplier_snapshot"],
      ["decision.rights_set"],
      "policy.rights.v1",
      ["G0C_NORMALIZE"],
    ),
    stage(
      "G0C_NORMALIZE",
      [
        "evidence.supplier_snapshot",
        "decision.rights_set",
        "identity.photo_set",
      ],
      ["product.ssot"],
      "policy.fact-normalization.v1",
      ["G0Q_QA"],
    ),
    stage(
      "G0Q_QA",
      ["product.ssot"],
      ["qa.validation_receipt"],
      "policy.qa.g0.v2",
      ["G0U_APPROVAL"],
    ),
    stage(
      "G0U_APPROVAL",
      ["product.ssot", "qa.validation_receipt"],
      ["decision.ssot_approval"],
      "policy.approval.exact-digest.v1",
      ["G1C_PLAN"],
      {
        userGate: true,
        inputProducers: {
          "product.ssot": ["G0C_NORMALIZE"],
          "qa.validation_receipt": ["G0Q_QA"],
        },
      },
    ),
    stage(
      "G1D_DISCOVERY",
      ["project.intake"],
      ["market.competitor_candidates"],
      "policy.market.discovery.v1",
      ["G1DQ_SELECTION"],
    ),
    stage(
      "G1DQ_SELECTION",
      ["market.competitor_candidates"],
      ["market.competitor_selection"],
      "policy.market.relevance.v1",
      ["G1A_MARKET"],
      { userGate: true },
    ),
    stage(
      "G1A_MARKET",
      ["market.competitor_selection"],
      ["evidence.market_snapshot", "receipt.importer"],
      "policy.market.capture.v1",
      ["G1C_PLAN"],
      { fanOutKey: "competitor_id" },
    ),
    stage(
      "G1B_KNOWLEDGE",
      ["project.intake"],
      ["knowledge.snapshot", "receipt.dependency_closure"],
      "policy.knowledge.freeze.v1",
      ["G1C_PLAN", "G2A_IMAGE", "G3P_PREVIEW", "G4A_ASSEMBLY"],
    ),
    stage(
      "G1C_PLAN",
      [
        "decision.ssot_approval",
        "evidence.market_snapshot",
        "knowledge.snapshot",
      ],
      ["production.plan"],
      "policy.production-plan.v2",
      ["G1Q_QA"],
    ),
    stage(
      "G1Q_QA",
      ["production.plan"],
      ["qa.validation_receipt"],
      "policy.qa.g1.v2",
      ["G1U_APPROVAL"],
    ),
    stage(
      "G1U_APPROVAL",
      ["production.plan", "qa.validation_receipt"],
      ["decision.plan_approval"],
      "policy.approval.exact-digest.v1",
      ["G2S_CONFIG_APPROVAL"],
      {
        userGate: true,
        inputProducers: {
          "production.plan": ["G1C_PLAN"],
          "qa.validation_receipt": ["G1Q_QA"],
        },
      },
    ),
    stage(
      "G2S_CONFIG_APPROVAL",
      ["decision.plan_approval"],
      ["decision.image_config_approval"],
      "policy.image.config.v1",
      ["G2A_IMAGE"],
      { userGate: true },
    ),
    stage(
      "G2A_IMAGE",
      [
        "decision.plan_approval",
        "decision.image_config_approval",
        "identity.photo_set",
        "knowledge.snapshot",
      ],
      ["media.image_candidate_set"],
      "policy.image.production.v1",
      ["G2Q_QA"],
      { fanOutKey: "image_job_id" },
    ),
    stage(
      "G2Q_QA",
      ["media.image_candidate_set", "product.ssot"],
      ["qa.image_contact_sheet", "qa.validation_receipt"],
      "policy.qa.image-identity.v1",
      ["G2U_APPROVAL"],
      { fanOutKey: "image_job_id" },
    ),
    stage(
      "G2U_APPROVAL",
      ["media.image_candidate_set", "qa.validation_receipt"],
      ["media.image_approved"],
      "policy.approval.image.v1",
      ["G3N_MOTION_DECISION"],
      {
        userGate: true,
        fanOutKey: "image_job_id",
        inputProducers: {
          "media.image_candidate_set": ["G2A_IMAGE"],
          "qa.validation_receipt": ["G2Q_QA"],
        },
      },
    ),
    stage(
      "G3N_MOTION_DECISION",
      ["media.image_approved", "production.plan"],
      ["decision.motion_required"],
      "policy.motion.necessity.v1",
      ["G3P_PREVIEW"],
    ),
    stage(
      "G3P_PREVIEW",
      [
        "media.image_approved",
        "production.plan",
        "knowledge.snapshot",
        "decision.motion_required",
      ],
      ["motion.project", "motion.preview"],
      "policy.motion.preview.v1",
      ["G3V_PREVIEW_APPROVAL"],
      { fanOutKey: "gif_brief_id" },
    ),
    stage(
      "G3V_PREVIEW_APPROVAL",
      ["motion.project", "motion.preview"],
      ["decision.motion_preview_approval"],
      "policy.approval.motion-preview.v1",
      ["G3R_RENDER"],
      { userGate: true, fanOutKey: "gif_brief_id" },
    ),
    stage(
      "G3R_RENDER",
      ["motion.project", "decision.motion_preview_approval"],
      ["media.gif_candidate"],
      "policy.motion.render.v1",
      ["G3Q_QA"],
      { fanOutKey: "gif_brief_id" },
    ),
    stage(
      "G3Q_QA",
      ["media.gif_candidate", "production.plan"],
      ["qa.motion_contact_sheet", "qa.validation_receipt"],
      "policy.qa.motion.v1",
      ["G3U_APPROVAL"],
      { fanOutKey: "gif_brief_id" },
    ),
    stage(
      "G3U_APPROVAL",
      ["media.gif_candidate", "qa.validation_receipt"],
      ["media.gif_approved"],
      "policy.approval.gif.v1",
      ["G4A_ASSEMBLY"],
      {
        userGate: true,
        fanOutKey: "gif_brief_id",
        inputProducers: {
          "media.gif_candidate": ["G3R_RENDER"],
          "qa.validation_receipt": ["G3Q_QA"],
        },
      },
    ),
    stage(
      "G4A_ASSEMBLY",
      [
        "decision.plan_approval",
        "media.image_approved",
        "media.gif_approved",
        "knowledge.snapshot",
      ],
      ["page.section_graph_resolved", "page.html_revision"],
      "policy.html.assembly.v1",
      ["G4Q0_PRE_STUDIO_QA"],
    ),
    stage(
      "G4Q0_PRE_STUDIO_QA",
      ["page.html_revision"],
      [
        "qa.render_capture_set",
        "qa.rubric_result",
        "qa.validation_receipt",
      ],
      "policy.qa.pre-studio.v1",
      ["S1_STUDIO_WORKING"],
    ),
    stage(
      "S1_STUDIO_WORKING",
      ["page.html_revision", "qa.rubric_result"],
      ["studio.working_revision"],
      "policy.studio.import.v1",
      ["G4C_STUDIO_COMMIT"],
      { mutableOutput: true },
    ),
    stage(
      "G4C_STUDIO_COMMIT",
      ["studio.working_revision"],
      ["studio.committed_revision", "page.html_revision"],
      "policy.studio.commit.v1",
      ["G4Q_RUBRIC"],
    ),
    stage(
      "G4Q_RUBRIC",
      ["studio.committed_revision", "page.html_revision"],
      ["qa.render_capture_set", "qa.rubric_result", "qa.rubric_delta"],
      "policy.qa.behance-rubric.v1",
      ["G4U_APPROVAL"],
      {
        repairTargets: ["G4A_ASSEMBLY"],
        validationPolicy: {
          receipt_required: true,
          min_score: 97,
          min_behance_quality_score: 90,
          min_critical_dimension_score: 85,
          max_deterministic_hard_failures: 0,
        },
        inputProducers: {
          "studio.committed_revision": ["G4C_STUDIO_COMMIT"],
          "page.html_revision": ["G4C_STUDIO_COMMIT"],
        },
      },
    ),
    stage(
      "G4U_APPROVAL",
      ["studio.committed_revision", "qa.rubric_result"],
      ["decision.page_approval"],
      "policy.approval.page.v1",
      ["G5_PUBLISH_QA"],
      {
        userGate: true,
        inputProducers: {
          "studio.committed_revision": ["G4C_STUDIO_COMMIT"],
          "qa.rubric_result": ["G4Q_RUBRIC"],
        },
      },
    ),
    stage(
      "G5_PUBLISH_QA",
      ["decision.page_approval", "studio.committed_revision"],
      ["page.publish_bundle", "qa.validation_receipt"],
      "policy.qa.publish-97.v1",
      ["G5U_APPROVAL"],
      {
        validationPolicy: {
          receipt_required: true,
          min_score: 97,
          min_behance_quality_score: 90,
          min_critical_dimension_score: 85,
          max_deterministic_hard_failures: 0,
        },
      },
    ),
    stage(
      "G5U_APPROVAL",
      ["page.publish_bundle", "qa.validation_receipt"],
      ["decision.publish_approval"],
      "policy.approval.publish.v1",
      [],
      {
        userGate: true,
        inputProducers: {
          "page.publish_bundle": ["G5_PUBLISH_QA"],
          "qa.validation_receipt": ["G5_PUBLISH_QA"],
        },
      },
    ),
  ]),
});

export function validateWorkflowDefinition(definition) {
  const errors = [];
  const stages = definition?.stages ?? [];
  const ids = new Set(stages.map((item) => item.stage_id));
  if (ids.size !== stages.length) errors.push("duplicate stage_id");
  for (const item of stages) {
    for (const field of [
      "stage_id",
      "required_inputs",
      "produces",
      "gate_policy_id",
      "consumers",
    ]) {
      if (item[field] === undefined || item[field] === null) {
        errors.push(`${item.stage_id ?? "unknown"}: missing ${field}`);
      }
    }
    if (!Array.isArray(item.required_inputs)) {
      errors.push(`${item.stage_id}: required_inputs must be an array`);
    }
    if (!Array.isArray(item.produces) || item.produces.length === 0) {
      errors.push(`${item.stage_id}: produces must be a non-empty array`);
    }
    for (const consumer of item.consumers ?? []) {
      if (!ids.has(consumer)) {
        errors.push(`${item.stage_id}: unknown consumer ${consumer}`);
      }
    }
    for (const target of item.repair_target_stages ?? []) {
      if (!ids.has(target)) {
        errors.push(`${item.stage_id}: unknown repair target ${target}`);
      }
    }
    for (const [type, producers] of Object.entries(
      item.input_producers ?? {},
    )) {
      if (!item.required_inputs.includes(type)) {
        errors.push(
          `${item.stage_id}: input producer declared for non-input ${type}`,
        );
      }
      for (const producer of producers) {
        if (!ids.has(producer)) {
          errors.push(`${item.stage_id}: unknown producer ${producer}`);
        }
      }
    }
    for (const group of item.any_of_inputs ?? []) {
      if (!Array.isArray(group) || group.length < 2) {
        errors.push(`${item.stage_id}: invalid any_of_inputs group`);
      }
    }
    for (const variant of item.output_variants ?? []) {
      if (
        !Array.isArray(variant) ||
        variant.length === 0 ||
        variant.some((type) => !item.produces.includes(type))
      ) {
        errors.push(`${item.stage_id}: invalid output variant`);
      }
    }
    if (item.validation_policy) {
      const policy = item.validation_policy;
      if (
        policy.receipt_required !== true ||
        !Number.isFinite(policy.min_score) ||
        policy.min_score < 0 ||
        policy.min_score > 100 ||
        !Number.isFinite(policy.min_behance_quality_score) ||
        !Number.isFinite(policy.min_critical_dimension_score) ||
        policy.max_deterministic_hard_failures !== 0
      ) {
        errors.push(`${item.stage_id}: invalid validation policy`);
      }
    }
    if (
      !item.user_gate &&
      (!item.runner_contract?.skill_id ||
        !item.runner_contract?.adapter_id)
    ) {
      errors.push(`${item.stage_id}: invalid runner contract`);
    }
  }
  return { ok: errors.length === 0, errors };
}
