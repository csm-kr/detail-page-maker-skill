import {
  SALES_MOTION_SHOT_TYPES,
  SALES_MOTION_TEMPLATE_IDS,
  validateSalesMotionPipeline,
} from "./sales-motion-pipeline-contract.mjs";

export const DEFAULT_IMAGE_GENERATION_COUNT = 32;
export const DEFAULT_IMAGE_PROVIDER_WORKERS = 32;

const REFERENCE_RELATIONS = new Set([
  "same_sku",
  "similar_product",
  "different_product",
]);
const PRIMARY_MEDIA = new Set(["image", "motion"]);
const MOTION_DIVERSITY_AXES = Object.freeze([
  "camera",
  "core_change",
  "transition",
  "emphasis_graphic",
]);
const LOOP_MODES = new Set([
  "ping_pong",
  "cyclic",
  "fixed_subject_callout",
  "accumulate_and_mask_reset",
  "continuous_slide",
]);
const SALES_SHOT_TYPES = new Set(SALES_MOTION_SHOT_TYPES);
const SALES_TEMPLATE_IDS = new Set(SALES_MOTION_TEMPLATE_IDS);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function add(errors, code, path, message, details = undefined) {
  errors.push({
    code,
    path,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function validateReferenceSalesLogic(plan, errors) {
  const artifacts = asArray(plan?.reference_artifact_set?.artifacts);
  artifacts.forEach((artifact, index) => {
    if (artifact?.role === "current_output") return;
    const path = `reference_artifact_set.artifacts[${index}]`;
    if (!REFERENCE_RELATIONS.has(artifact?.product_relation)) {
      add(
        errors,
        "REFERENCE_PRODUCT_RELATION_REQUIRED",
        `${path}.product_relation`,
        "기준작은 동일 상품·유사 상품·다른 상품 중 관계를 먼저 확정해야 합니다.",
      );
      return;
    }
    if (artifact.product_relation !== "same_sku") return;
    const logic = artifact?.sales_logic;
    const required = [
      "problem_entry",
      "first_benefit",
      "benefit_order",
      "proof_methods",
      "usage_placement",
      "closing_message",
    ];
    if (
      !isObject(logic) ||
      required.some((field) =>
        ["benefit_order", "proof_methods"].includes(field)
          ? asArray(logic?.[field]).length === 0
          : !isText(logic?.[field]),
      ) ||
      logic?.reuse_mode !== "recompose_without_copying_assets_or_copy"
    ) {
      add(
        errors,
        "SAME_SKU_SALES_LOGIC_REQUIRED",
        `${path}.sales_logic`,
        "동일 상품 기준작은 판매 논리·증명 순서를 추출하되 고유 이미지·카피를 복제하지 않는 재구성 계약이 필요합니다.",
      );
    }
  });
}

function validateImageBatch(plan, errors) {
  const jobs = asArray(plan?.image_job_set?.jobs);
  const batch = plan?.image_job_set?.generation_batch;
  const planned = jobs.reduce(
    (sum, job) => sum + (Number.isInteger(job?.candidate_count) ? job.candidate_count : 0),
    0,
  );
  if (
    !isObject(batch) ||
    batch?.strategy !== "single_concurrent_batch" ||
    batch?.planned_images !== DEFAULT_IMAGE_GENERATION_COUNT ||
    batch?.provider_workers !== DEFAULT_IMAGE_PROVIDER_WORKERS ||
    planned !== DEFAULT_IMAGE_GENERATION_COUNT
  ) {
    add(
      errors,
      "IMAGE_32_WORKER_BATCH_REQUIRED",
      "image_job_set.generation_batch",
      "기본 이미지 제작은 32개 candidate를 God Tibo 32 provider workers로 한 번에 생성해야 합니다.",
      { planned_candidate_total: planned },
    );
  }
  jobs.forEach((job, index) => {
    const conditions = asArray(job?.identity?.invariant_conditions);
    if (
      conditions.length < 4 ||
      !conditions.every(isText) ||
      job?.identity?.canonical_reference_required !== true
    ) {
      add(
        errors,
        "PRODUCT_IDENTITY_INVARIANTS_REQUIRED",
        `image_job_set.jobs[${index}].identity`,
        "각 이미지 job은 기준 제품 참조와 색·형태·부품·비율·구성의 상품별 불변 조건 4개 이상을 가져야 합니다.",
      );
    }
    if (
      !SALES_SHOT_TYPES.has(job?.shot_type) ||
      !SALES_TEMPLATE_IDS.has(job?.recommended_template)
    ) {
      add(
        errors,
        "IMAGE_SHOT_TEMPLATE_PAIR_REQUIRED",
        `image_job_set.jobs[${index}]`,
        "각 image job은 표준 shot_type과 연결할 HyperFrames T1~T10 추천 템플릿을 가져야 합니다.",
      );
    }
  });
}

function validateSectionMessages(plan, errors) {
  const sections = asArray(plan?.section_graph_draft?.sections);
  sections.forEach((section, index) => {
    const contract = section?.message_contract;
    const headlineLines = asArray(contract?.headline_lines);
    if (
      !isObject(contract) ||
      contract?.message_count !== 1 ||
      !isText(contract?.customer_sentence) ||
      headlineLines.length < 1 ||
      headlineLines.length > 3 ||
      !headlineLines.every(isText) ||
      !PRIMARY_MEDIA.has(contract?.primary_media) ||
      !isText(contract?.visual_proof) ||
      !isText(contract?.next_section_reason) ||
      contract?.alignment !== "center" ||
      !Number.isFinite(contract?.minimum_visual_occupancy_percent) ||
      contract.minimum_visual_occupancy_percent < 55
    ) {
      add(
        errors,
        "COUPANG_ONE_SECOND_SECTION_CONTRACT_REQUIRED",
        `section_graph_draft.sections[${index}].message_contract`,
        "각 쿠팡 section은 한 메시지, 직접 설계한 1~3줄 제목, 중앙축, 55% 이상 주 시각, 하나의 주매체와 다음 section 이유가 필요합니다.",
      );
    }
  });
}

function diversityDifference(previous, current) {
  return MOTION_DIVERSITY_AXES.reduce(
    (count, axis) => count + (previous?.[axis] !== current?.[axis] ? 1 : 0),
    0,
  );
}

export function validateMotionDiversity(briefs) {
  const errors = [];
  const items = asArray(briefs);
  items.forEach((brief, index) => {
    const semantic = brief?.semantic_contract;
    const first = semantic?.first_frame;
    const loop = semantic?.loop;
    if (
      !isText(semantic?.purpose) ||
      MOTION_DIVERSITY_AXES.some((axis) => !isText(semantic?.[axis])) ||
      !isObject(first) ||
      first?.product_or_problem_visible !== true ||
      !isText(first?.message) ||
      !isText(first?.visual_evidence) ||
      !isObject(loop) ||
      !LOOP_MODES.has(loop?.mode) ||
      loop?.pixel_boundary_pass_required !== true ||
      loop?.perceptual_continuity_pass_required !== true ||
      asArray(semantic?.identity_invariants).length < 4 ||
      semantic?.generative_morphing_allowed !== false ||
      semantic?.public_media_strategy !==
        "single_motion_surface_with_poster_fallback"
    ) {
      add(
        errors,
        "GIF_PURPOSE_FIRST_FRAME_LOOP_IDENTITY_REQUIRED",
        `gif_brief_set.briefs[${index}].semantic_contract`,
        "GIF는 목적·다양성 축·첫 프레임 메시지/근거·픽셀/지각 루프·제품 불변·단일 motion surface 계약을 가져야 합니다.",
      );
    }
    if (index > 0) {
      const previous = items[index - 1]?.semantic_contract;
      const difference = diversityDifference(previous, semantic);
      if (difference < 2) {
        add(
          errors,
          "ADJACENT_GIF_DIVERSITY_AXES_INSUFFICIENT",
          `gif_brief_set.briefs[${index}].semantic_contract`,
          "인접 GIF는 카메라·핵심 변화·전환·강조 그래픽 중 최소 두 축이 달라야 합니다.",
          { differing_axis_count: difference },
        );
      }
    }
  });
  return { ok: errors.length === 0, errors };
}

function validatePublicMediaStrategy(plan, errors) {
  asArray(plan?.commercial_flow?.solution_modules).forEach((solution, index) => {
    if (
      solution?.public_media_strategy !== "single_primary_surface" ||
      solution?.still_role !== "motion_poster_or_separate_evidence_section"
    ) {
      add(
        errors,
        "REDUNDANT_STILL_MOTION_STACK_FORBIDDEN",
        `commercial_flow.solution_modules[${index}]`,
        "같은 주장의 정지 이미지와 GIF를 겹쳐 쌓지 말고 한 주매체 surface와 poster fallback을 사용해야 합니다.",
      );
    }
  });
}

function validateScrollQaTarget(plan, errors) {
  const qa = plan?.rubric_target?.coupang_scroll_qa;
  if (
    !isObject(qa) ||
    qa?.first_second_message_required !== true ||
    qa?.fast_scroll_story_required !== true ||
    qa?.center_axis_max_offset_px !== 8 ||
    qa?.minimum_title_px_390 < 28 ||
    qa?.minimum_title_px_780 < 44 ||
    qa?.minimum_visual_density_percent < 55 ||
    qa?.lazy_loading_fast_scroll_pass_required !== true ||
    qa?.redundant_still_motion_allowed !== false
  ) {
    add(
      errors,
      "COUPANG_SCROLL_QA_TARGET_REQUIRED",
      "rubric_target.coupang_scroll_qa",
      "1초 메시지·빠른 스크롤 서사·중앙축·큰 제목·55% 시각 밀도·지연 로딩·중복 매체 금지 QA 목표가 필요합니다.",
    );
  }
}

export function validateCoupangConversionPlan(plan) {
  const errors = [];
  validateReferenceSalesLogic(plan, errors);
  validateImageBatch(plan, errors);
  validateSectionMessages(plan, errors);
  errors.push(...validateMotionDiversity(plan?.gif_brief_set?.briefs).errors);
  validatePublicMediaStrategy(plan, errors);
  validateScrollQaTarget(plan, errors);
  errors.push(...validateSalesMotionPipeline(plan).errors);
  return {
    ok: errors.length === 0,
    errors,
    defaults: {
      image_generation_count: DEFAULT_IMAGE_GENERATION_COUNT,
      image_provider_workers: DEFAULT_IMAGE_PROVIDER_WORKERS,
    },
  };
}

const INTERNAL_PUBLIC_PATTERN =
  /(?:claim[_-]?id|fact[_-]?id|evidence[_-]?id|agent[_-]?session|qa[_-]?score|approval[_-]?state|sha256|data-local-studio-launcher)/i;

export function validatePublicConversionHtml(html) {
  const source = String(html ?? "");
  const errors = [];
  if (INTERNAL_PUBLIC_PATTERN.test(source)) {
    add(
      errors,
      "PUBLIC_INTERNAL_METADATA_FORBIDDEN",
      "output/detail-page.html",
      "공개 HTML에는 내부 ID·세션·QA·해시·로컬 Studio 런처가 없어야 합니다.",
    );
  }
  if (/\bdata-[a-z0-9_-]+\s*=/i.test(source)) {
    add(
      errors,
      "PUBLIC_DATA_ATTRIBUTE_FORBIDDEN",
      "output/detail-page.html",
      "공개 HTML에는 저작용 data-* 속성을 남기지 않습니다.",
    );
  }
  return { ok: errors.length === 0, errors };
}
