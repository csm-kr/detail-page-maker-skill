import assert from "node:assert/strict";
import test from "node:test";
import {
  ProductionContractError,
  assertEditableHtmlContract,
  assertImageWorkOrder,
  assertMotionProductionChain,
  assertMotionWorkOrder,
  assertStudioDownstreamEligible,
  validateEditableHtmlContract,
  validateImageWorkOrder,
  validateMotionProductionChain,
  validateMotionWorkOrder,
  validateStudioDownstreamEligibility,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/production-contracts.mjs";
import {
  attachValidHeroAssurance,
} from "../helpers/hero-assurance-fixture.mjs";

const SHA = Object.freeze({
  inputA: "1".repeat(64),
  inputB: "2".repeat(64),
  outputA: "3".repeat(64),
  outputB: "4".repeat(64),
  identity: "5".repeat(64),
  brief: "6".repeat(64),
  project: "7".repeat(64),
  preview: "8".repeat(64),
  approval: "9".repeat(64),
  render: "a".repeat(64),
  gif: "b".repeat(64),
  qa: "c".repeat(64),
  html: "d".repeat(64),
  commit: "e".repeat(64),
});

function imageWorkOrder(overrides = {}) {
  return {
    stage_id: "G2A_IMAGE",
    execution_config: {
      items: 2,
      workers: 2,
      detail_level: "high",
      size_mode: "target",
      target_size: { width: 800, height: 2000 },
      size_confirmation_decision_id: "decision-image-size-001",
      gif: "forbidden",
      fan_out: [
        {
          candidate_id: "candidate-a",
          worker_id: "image-worker-a",
          input_sha256: SHA.inputA,
          output_sha256: SHA.outputA,
          status: "passed",
        },
        {
          candidate_id: "candidate-b",
          worker_id: "image-worker-b",
          input_sha256: SHA.inputB,
          output_sha256: SHA.outputB,
          status: "failed",
        },
      ],
      retry: {
        requested_candidate_ids: ["candidate-b"],
        previous_candidates: [
          {
            candidate_id: "candidate-a",
            input_sha256: SHA.inputA,
            output_sha256: SHA.outputA,
            status: "passed",
          },
          {
            candidate_id: "candidate-b",
            input_sha256: SHA.inputB,
            output_sha256: "f".repeat(64),
            status: "failed",
          },
        ],
      },
    },
    ...overrides,
  };
}

function motionChain(overrides = {}) {
  return {
    brief: {
      artifact_id: "gif-brief-001",
      digest: SHA.brief,
      source_image_artifact_ids: ["image-approved-001"],
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:00:00.000Z",
    },
    motion_project: {
      artifact_id: "motion-project-001",
      digest: SHA.project,
      brief_digest: SHA.brief,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:01:00.000Z",
    },
    preview: {
      artifact_id: "motion-preview-001",
      digest: SHA.preview,
      motion_project_digest: SHA.project,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:02:00.000Z",
    },
    preview_approval: {
      decision_id: "decision-preview-001",
      digest: SHA.approval,
      decision: "approved",
      subject_preview_digest: SHA.preview,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:03:00.000Z",
    },
    render: {
      artifact_id: "motion-render-001",
      digest: SHA.render,
      motion_project_digest: SHA.project,
      preview_approval_digest: SHA.approval,
      source_identity_digest: SHA.identity,
      output_format: "mp4",
      audio: "silent",
      created_at: "2026-07-30T01:04:00.000Z",
    },
    gif: {
      artifact_id: "gif-candidate-001",
      digest: SHA.gif,
      render_digest: SHA.render,
      source_identity_digest: SHA.identity,
      conversion_engine: "ffmpeg",
      source_format: "mp4",
      output_format: "gif",
      animated_webp_digest: "c".repeat(64),
      created_at: "2026-07-30T01:05:00.000Z",
    },
    final_qa: {
      validation_id: "validation-gif-001",
      digest: SHA.qa,
      subject_gif_digest: SHA.gif,
      source_identity_digest: SHA.identity,
      verdict: "PASS",
      hard_failures: [],
      semantic_motion_quality: {
        customer_question_answered: true,
        meaningful_state_change: true,
        static_superiority: true,
        pattern_distinct_from_adjacent: true,
        decorative_overlay_only: false,
        information_overlay_verified: true,
        visible_delta_observation:
          "제품 본체의 형태와 접촉 위치가 달라졌다.",
        answer_within_seconds: 1,
        first_frame_sha256: "1".repeat(64),
        mid_frame_sha256: "2".repeat(64),
        last_frame_sha256: "3".repeat(64),
      },
      created_at: "2026-07-30T01:06:00.000Z",
    },
    asset_approval: {
      decision_id: "decision-gif-001",
      decision: "approved",
      subject_gif_digest: SHA.gif,
      validation_digest: SHA.qa,
      source_identity_digest: SHA.identity,
      created_at: "2026-07-30T01:07:00.000Z",
    },
    ...overrides,
  };
}

function motionWorkOrder(overrides = {}) {
  return {
    stage_id: "G3P_PREVIEW",
    execution_config: {
      modules: 2,
      workers: 2,
      fan_out: [
        {
          motion_brief_id: "gif-problem-tightness",
          worker_id: "motion-worker-a",
          input_sha256: SHA.inputA,
          output_sha256: SHA.outputA,
          status: "passed",
          source: {
            kind: "product_reference",
            artifact_ids: ["identity-product-reference"],
          },
        },
        {
          motion_brief_id: "gif-benefit-stable-edge",
          worker_id: "motion-worker-b",
          input_sha256: SHA.inputB,
          output_sha256: SHA.outputB,
          status: "failed",
          source: {
            kind: "approved_image_job",
            artifact_ids: ["image-approved-stable-edge"],
            approval_receipt_sha256: SHA.qa,
          },
        },
      ],
      retry: {
        requested_motion_brief_ids: ["gif-benefit-stable-edge"],
        previous_modules: [
          {
            motion_brief_id: "gif-problem-tightness",
            input_sha256: SHA.inputA,
            output_sha256: SHA.outputA,
            status: "passed",
          },
          {
            motion_brief_id: "gif-benefit-stable-edge",
            input_sha256: SHA.inputB,
            output_sha256: SHA.gif,
            status: "failed",
          },
        ],
      },
    },
    ...overrides,
  };
}

function editableContract(overrides = {}) {
  return attachValidHeroAssurance({
    resolved_section_graph: {
      graph_id: "resolved-graph-production-contract",
      sections: [
        {
          section_id: "section-hero",
          role: "hero",
          html_copy: ["집에서도 빠르게 정돈하세요"],
          claims: [
            {
              claim_id: "claim-fast",
              html_copy: ["간편한 착용으로 준비 시간을 줄입니다"],
            },
          ],
          media_slots: [
            {
              slot_id: "slot-hero",
              approved_artifact_id: "image-approved-001",
              embedded_text_policy: "none",
            },
          ],
        },
      ],
    },
    approved_artifacts: [
      {
        artifact_id: "image-approved-001",
        approval_status: "approved",
        copy_embedded: false,
      },
    ],
    html: `
      <section data-section-id="section-hero">
        <h2>집에서도 빠르게 정돈하세요</h2>
        <p data-claim-id="claim-fast">간편한 착용으로 준비 시간을 줄입니다</p>
        <img data-slot-id="slot-hero" data-artifact-id="image-approved-001" alt="">
      </section>
    `,
    ...overrides,
  });
}

test("G2 WorkOrder는 명시적 설정과 후보별 hash를 가진 최대 8개의 one-cut fan-out만 허용한다", () => {
  assert.doesNotThrow(() => assertImageWorkOrder(imageWorkOrder()));

  const tooMany = imageWorkOrder();
  tooMany.execution_config.items = 9;
  assert.equal(validateImageWorkOrder(tooMany).ok, false);

  const reusedWorker = imageWorkOrder();
  reusedWorker.execution_config.fan_out[1].worker_id = "image-worker-a";
  assert.throws(
    () => assertImageWorkOrder(reusedWorker),
    (error) =>
      error instanceof ProductionContractError &&
      error.details.errors.some((item) => item.code === "WORKER_REUSED"),
  );

  const gifEnabled = imageWorkOrder();
  gifEnabled.execution_config.gif = "allowed";
  assert.equal(validateImageWorkOrder(gifEnabled).ok, false);
});

test("G2 size_mode는 target_size 또는 reference_size 중 하나와 사용자 크기 확인 결정을 강제한다", () => {
  const referenceMode = imageWorkOrder();
  referenceMode.execution_config.size_mode = "reference";
  delete referenceMode.execution_config.target_size;
  referenceMode.execution_config.reference_size = {
    width: 1200,
    height: 1800,
    reference_artifact_id: "photo-reference-001",
  };
  assert.equal(validateImageWorkOrder(referenceMode).ok, true);

  const ambiguous = imageWorkOrder();
  ambiguous.execution_config.reference_size = {
    width: 1200,
    height: 1800,
    reference_artifact_id: "photo-reference-001",
  };
  delete ambiguous.execution_config.size_confirmation_decision_id;
  assert.throws(
    () => assertImageWorkOrder(ambiguous),
    (error) =>
      error.code === "INVALID_IMAGE_WORK_ORDER" &&
      error.details.errors.some(
        (item) => item.code === "SIZE_CONFIRMATION_REQUIRED",
      ),
  );
});

test("G2 retry는 이전에 실패한 candidate만 같은 input hash로 다시 실행한다", () => {
  const passedRetry = imageWorkOrder();
  passedRetry.execution_config.retry.requested_candidate_ids = [
    "candidate-a",
  ];
  assert.throws(
    () => assertImageWorkOrder(passedRetry),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "RETRY_PASSED_CANDIDATE",
      ),
  );

  const changedInput = imageWorkOrder();
  changedInput.execution_config.retry.previous_candidates[1].input_sha256 =
    "0".repeat(64);
  assert.throws(
    () => assertImageWorkOrder(changedInput),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "RETRY_INPUT_HASH_CHANGED",
      ),
  );
});

test("G3는 brief→project→preview 승인 digest→render→GIF→QA→asset 승인 순서와 source identity를 보존한다", () => {
  assert.doesNotThrow(() => assertMotionProductionChain(motionChain()));

  const beforeApproval = motionChain();
  beforeApproval.render.created_at = "2026-07-30T01:02:30.000Z";
  assert.equal(validateMotionProductionChain(beforeApproval).ok, false);

  const wrongApprovalDigest = motionChain();
  wrongApprovalDigest.render.preview_approval_digest = "0".repeat(64);
  assert.throws(
    () => assertMotionProductionChain(wrongApprovalDigest),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "MOTION_CHAIN_DIGEST_MISMATCH",
      ),
  );

  const identityDrift = motionChain();
  identityDrift.gif.source_identity_digest = "0".repeat(64);
  assert.throws(
    () => assertMotionProductionChain(identityDrift),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "SOURCE_IMAGE_IDENTITY_DRIFT",
      ),
  );
});

test("G3 WorkOrder는 motion brief 하나당 서로 다른 worker 하나를 강제한다", () => {
  assert.doesNotThrow(() => assertMotionWorkOrder(motionWorkOrder()));

  const reused = motionWorkOrder();
  reused.execution_config.fan_out[1].worker_id = "motion-worker-a";
  assert.throws(
    () => assertMotionWorkOrder(reused),
    (error) =>
      error instanceof ProductionContractError &&
      error.details.errors.some(
        (item) => item.code === "MOTION_WORKER_REUSED",
      ),
  );

  const unapprovedSource = motionWorkOrder();
  delete unapprovedSource.execution_config.fan_out[1].source
    .approval_receipt_sha256;
  assert.equal(validateMotionWorkOrder(unapprovedSource).ok, false);
});

test("G3 부분 재시도는 실패한 motion member와 같은 exact input만 허용한다", () => {
  const passedRetry = motionWorkOrder();
  passedRetry.execution_config.retry.requested_motion_brief_ids = [
    "gif-problem-tightness",
  ];
  assert.throws(
    () => assertMotionWorkOrder(passedRetry),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "MOTION_RETRY_FAILED_MEMBER_ONLY",
      ),
  );

  const changedInput = motionWorkOrder();
  changedInput.execution_config.retry.previous_modules[1].input_sha256 =
    "0".repeat(64);
  assert.throws(
    () => assertMotionWorkOrder(changedInput),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "MOTION_RETRY_INPUT_HASH_CHANGED",
      ),
  );
});

test("G3 최종 asset 승인은 PASS QA receipt에 고정되어야 한다", () => {
  const failedQa = motionChain();
  failedQa.final_qa.verdict = "FAIL";
  failedQa.final_qa.hard_failures = ["identity.parts"];
  assert.throws(
    () => assertMotionProductionChain(failedQa),
    (error) =>
      error.details.errors.some((item) => item.code === "GIF_QA_NOT_PASSED"),
  );
});

test("G4 resolved section graph의 모든 media/claim/copy가 승인 artifact와 semantic HTML에 연결된다", () => {
  assert.doesNotThrow(() => assertEditableHtmlContract(editableContract()));

  const missingHeroAssurance = editableContract();
  delete missingHeroAssurance.hero_assurance;
  assert.throws(
    () => assertEditableHtmlContract(missingHeroAssurance),
    (error) =>
      error.details.errors.some(
        (item) =>
          item.code === "HERO_ASSURANCE_MANIFEST_REQUIRED",
      ),
  );

  const missingSlotBinding = editableContract();
  missingSlotBinding.html = missingSlotBinding.html.replace(
    'data-slot-id="slot-hero"',
    'data-slot-id="slot-other"',
  );
  assert.throws(
    () => assertEditableHtmlContract(missingSlotBinding),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "HTML_MEDIA_BINDING_MISSING",
      ),
  );

  const unapproved = editableContract();
  unapproved.approved_artifacts[0].approval_status = "pending";
  assert.equal(validateEditableHtmlContract(unapproved).ok, false);
});

test("G4 판매 카피는 이미지에 굽지 않고 HTML 텍스트가 정본이어야 한다", () => {
  const burnedCopy = editableContract();
  burnedCopy.resolved_section_graph.sections[0].media_slots[0].embedded_text_policy =
    "artistic_short";
  burnedCopy.approved_artifacts[0].copy_embedded = true;
  assert.throws(
    () => assertEditableHtmlContract(burnedCopy),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "COPY_MUST_REMAIN_HTML_CANONICAL",
      ),
  );

  const missingCopy = editableContract();
  missingCopy.html = missingCopy.html.replace(
    "간편한 착용으로 준비 시간을 줄입니다",
    "다른 문구",
  );
  assert.throws(
    () => assertEditableHtmlContract(missingCopy),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "CANONICAL_COPY_MISSING",
      ),
  );
});

test("Studio working revision은 downstream 불가하며 immutable commit만 rubric/publish 입력이 된다", () => {
  const working = {
    artifact_id: "studio-working-001",
    revision_kind: "working",
    mutable: true,
  };
  assert.equal(
    validateStudioDownstreamEligibility(working, "G4Q_RUBRIC").ok,
    false,
  );

  const committed = {
    artifact_id: "studio-commit-001",
    revision_kind: "committed",
    mutable: false,
    artifact_sha256: SHA.html,
    commit_sha256: SHA.commit,
    hero_assurance_manifest_sha256: SHA.identity,
    hero_assurance_validation_receipt_sha256: SHA.qa,
    hero_commercial_validation_receipt_sha256: SHA.approval,
    hero_identity_validation_receipt_sha256: SHA.identity,
    hero_assurance_bundle_sha256: SHA.project,
    hero_assurance_member_id: "hero-assurance.json",
    hero_assurance_member_locator:
      "studio/revisions/studio-rev-001/hero-assurance.json",
    hero_assurance_member_sha256: SHA.project,
    hero_assurance_member_size_bytes: 1024,
    committed_at: "2026-07-30T02:00:00.000Z",
  };
  assert.doesNotThrow(() =>
    assertStudioDownstreamEligible(committed, "G4Q_RUBRIC"),
  );
  assert.doesNotThrow(() =>
    assertStudioDownstreamEligible(committed, "G5_PUBLISH_QA"),
  );
  assert.throws(
    () => assertStudioDownstreamEligible(committed, "G2A_IMAGE"),
    (error) =>
      error.details.errors.some(
        (item) => item.code === "STUDIO_CONSUMER_NOT_ALLOWED",
      ),
  );
});
