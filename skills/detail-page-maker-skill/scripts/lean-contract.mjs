#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = path.resolve(
  SCRIPT_DIR,
  "../policies/lean-page-plan-v1.json",
);

const ID_PATTERN = /^[a-z][a-z0-9_-]*$/;
const RAW_COPY_FIELDS = ["headline", "body", "emphasis", "copy_text"];
const PARTICLE_AT_CHUNK_START =
  /^(?:은|는|이|가|을|를|의|과|와|도|만|로|으로|에|에서|에게|에게서|께|께서|부터|까지|보다|처럼|밖에|조차|마저)(?:\s|$)/;
const NUMBER_AT_CHUNK_END = /[+-]?[\d,.]+\s*$/;
const UNIT_AT_CHUNK_START =
  /^(?:mm|cm|km|m|mg|kg|g|ml|l|mah|ah|v|w|hz|gb|tb|℃|%|개|장|매|세트|팩|입|쌍|켤레|명|회|배|박스|원|인치|시간|분|초|단계)(?:\s|$|[은는이가을를의과와도만로에부까보처])/i;
const MODIFIER_AT_CHUNK_END =
  /(?:한|할|된|될|없는|있는|넓은|좁은|큰|작은|넓넉한|간편한|강한|가벼운|빠른|편안한|깔끔한|튼튼한|쉬운|다양한)$/;

function issue(code, pathValue, message) {
  return { code, path: pathValue, message };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addError(errors, code, pathValue, message) {
  errors.push(issue(code, pathValue, message));
}

function requireObject(value, pathValue, errors) {
  if (!isPlainObject(value)) {
    addError(errors, "OBJECT_REQUIRED", pathValue, "객체가 필요합니다.");
    return false;
  }
  return true;
}

function requireNonEmptyString(value, pathValue, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    addError(
      errors,
      "NON_EMPTY_STRING_REQUIRED",
      pathValue,
      "빈 문자열이 아닌 값이 필요합니다.",
    );
    return false;
  }
  return true;
}

function requireId(value, pathValue, errors) {
  if (!requireNonEmptyString(value, pathValue, errors)) return false;
  if (!ID_PATTERN.test(value)) {
    addError(
      errors,
      "INVALID_ID",
      pathValue,
      "ID는 영문 소문자로 시작하고 영숫자, _, -만 사용해야 합니다.",
    );
    return false;
  }
  return true;
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function validateChunkArray({
  value,
  pathValue,
  minimum,
  maximum,
  errors,
  warnings,
}) {
  if (!Array.isArray(value)) {
    addError(
      errors,
      "COPY_CHUNKS_ARRAY_REQUIRED",
      pathValue,
      "AI 원문이 아니라 의미 단위 문자열 배열이어야 합니다.",
    );
    return;
  }
  if (value.length < minimum || value.length > maximum) {
    addError(
      errors,
      "COPY_CHUNK_COUNT_OUT_OF_RANGE",
      pathValue,
      `청크 수는 ${minimum}~${maximum}개여야 합니다.`,
    );
  }

  for (let index = 0; index < value.length; index += 1) {
    const chunkPath = `${pathValue}[${index}]`;
    const chunk = value[index];
    if (!requireNonEmptyString(chunk, chunkPath, errors)) continue;
    if (/\r|\n|<br\s*\/?\s*>/i.test(chunk)) {
      addError(
        errors,
        "EMBEDDED_LINE_BREAK_FORBIDDEN",
        chunkPath,
        "줄바꿈은 문자열 안이 아니라 청크 배열 경계로 표현해야 합니다.",
      );
    }
    if (chunk.trim().length === 1) {
      warnings.push(
        issue(
          "POSSIBLE_ORPHAN_CHUNK",
          chunkPath,
          "한 글자 청크가 독립해 보입니다. 실제 렌더에서 의미 완결성을 확인하세요.",
        ),
      );
    }
  }

  for (let index = 1; index < value.length; index += 1) {
    const previous = typeof value[index - 1] === "string" ? value[index - 1].trim() : "";
    const current = typeof value[index] === "string" ? value[index].trim() : "";
    if (!previous || !current) continue;

    if (PARTICLE_AT_CHUNK_START.test(current)) {
      addError(
        errors,
        "PARTICLE_SPLIT_ACROSS_CHUNKS",
        `${pathValue}[${index - 1}:${index}]`,
        "조사가 앞 말과 다른 줄로 분리되었습니다.",
      );
    }
    if (NUMBER_AT_CHUNK_END.test(previous) && UNIT_AT_CHUNK_START.test(current)) {
      addError(
        errors,
        "NUMBER_UNIT_SPLIT_ACROSS_CHUNKS",
        `${pathValue}[${index - 1}:${index}]`,
        "숫자와 단위를 같은 의미 청크에 두어야 합니다.",
      );
    }
    if (MODIFIER_AT_CHUNK_END.test(previous)) {
      warnings.push(
        issue(
          "POSSIBLE_MODIFIER_SPLIT",
          `${pathValue}[${index - 1}:${index}]`,
          "수식어와 피수식어가 분리되지 않았는지 실제 렌더에서 확인하세요.",
        ),
      );
    }
  }
}

function validateCopy(copy, pathValue, policy, errors, warnings) {
  if (!requireObject(copy, pathValue, errors)) return;
  for (const field of policy.sections.copy_fields) {
    const limits = policy.sections[field];
    validateChunkArray({
      value: copy[field],
      pathValue: `${pathValue}.${field}`,
      minimum: limits.minimum,
      maximum: limits.maximum,
      errors,
      warnings,
    });
  }
  for (const field of RAW_COPY_FIELDS) {
    if (Object.hasOwn(copy, field)) {
      addError(
        errors,
        "RAW_COPY_FIELD_FORBIDDEN",
        `${pathValue}.${field}`,
        `${field}를 그대로 배치하지 말고 의미 단위 청크 필드를 사용하세요.`,
      );
    }
  }
}

function findForbiddenHalfWidthProfile(value, policy, errors, pathValue = "$") {
  if (!policy.output.forbid_half_width_profile) return;
  const halfWidth = policy.output.width_px / 2;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findForbiddenHalfWidthProfile(item, policy, errors, `${pathValue}[${index}]`),
    );
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key.includes(String(halfWidth))) {
        addError(
          errors,
          "LEGACY_HALF_WIDTH_KEY_FORBIDDEN",
          `${pathValue}.${key}`,
          "단일 780px 출력 계약에서 과거 반폭 profile key를 사용할 수 없습니다.",
        );
      }
      findForbiddenHalfWidthProfile(child, policy, errors, `${pathValue}.${key}`);
    }
    return;
  }
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  if (
    normalized === halfWidth ||
    normalized === String(halfWidth) ||
    normalized === `${halfWidth}px` ||
    normalized === `${halfWidth} px`
  ) {
    addError(
      errors,
      "LEGACY_HALF_WIDTH_VALUE_FORBIDDEN",
      pathValue,
      "모든 출력·자산·렌더 폭은 780px 단일 profile을 사용해야 합니다.",
    );
  }
}

function validateInputs(inputs, policy, errors) {
  if (!requireObject(inputs, "$.inputs", errors)) return;
  for (const field of policy.inputs.required) {
    if (!isHttpUrl(inputs[field])) {
      addError(
        errors,
        "VALID_HTTP_URL_REQUIRED",
        `$.inputs.${field}`,
        `${field}에 http(s) URL이 필요합니다.`,
      );
    }
  }
  if (isHttpUrl(inputs.coupang_url)) {
    const hostname = new URL(inputs.coupang_url).hostname.toLowerCase();
    const suffix = policy.inputs.coupang_host_suffix;
    if (hostname !== suffix && !hostname.endsWith(`.${suffix}`)) {
      addError(
        errors,
        "COUPANG_URL_REQUIRED",
        "$.inputs.coupang_url",
        `coupang_url의 host는 ${suffix} 도메인이어야 합니다.`,
      );
    }
  }
  if (Object.hasOwn(inputs, "photo_paths")) {
    if (!Array.isArray(inputs.photo_paths)) {
      addError(
        errors,
        "PHOTO_PATHS_ARRAY_REQUIRED",
        "$.inputs.photo_paths",
        "photo_paths는 선택적 로컬 경로 배열이어야 합니다.",
      );
    } else {
      inputs.photo_paths.forEach((photoPath, index) => {
        const itemPath = `$.inputs.photo_paths[${index}]`;
        if (!requireNonEmptyString(photoPath, itemPath, errors)) return;
        if (isHttpUrl(photoPath)) {
          addError(
            errors,
            "LOCAL_PHOTO_PATH_REQUIRED",
            itemPath,
            "photo_paths에는 URL이 아닌 로컬 파일 경로를 사용하세요.",
          );
        }
      });
    }
  }
}

function validateOutput(output, policy, errors) {
  if (!requireObject(output, "$.output", errors)) return;
  if (output.width_px !== policy.output.width_px) {
    addError(
      errors,
      "OUTPUT_WIDTH_MUST_BE_780",
      "$.output.width_px",
      `output.width_px는 ${policy.output.width_px}이어야 합니다.`,
    );
  }
  if (output.html_path !== policy.output.html_path) {
    addError(
      errors,
      "OUTPUT_HTML_PATH_INVALID",
      "$.output.html_path",
      `html_path는 ${policy.output.html_path}이어야 합니다.`,
    );
  }
  if (!isPlainObject(output.studio) || output.studio.enabled !== true) {
    addError(
      errors,
      "STUDIO_MUST_BE_ENABLED",
      "$.output.studio.enabled",
      "Studio는 enabled: true여야 합니다.",
    );
  }
  if (!isPlainObject(output.wing) || output.wing.enabled !== true) {
    addError(
      errors,
      "WING_MUST_BE_ENABLED",
      "$.output.wing.enabled",
      "Wing export는 enabled: true여야 합니다.",
    );
  }
  if (
    !isPlainObject(output.wing) ||
    !isPlainObject(output.wing.cdn) ||
    output.wing.cdn.enabled !== true
  ) {
    addError(
      errors,
      "CDN_MUST_BE_ENABLED",
      "$.output.wing.cdn.enabled",
      "Wing CDN은 enabled: true여야 합니다.",
    );
  }
}

function validateSections(sections, policy, errors, warnings) {
  const sectionIds = new Set();
  if (!Array.isArray(sections)) {
    addError(errors, "SECTIONS_ARRAY_REQUIRED", "$.sections", "sections 배열이 필요합니다.");
    return sectionIds;
  }
  if (sections.length < policy.sections.minimum) {
    addError(
      errors,
      "SECTION_COUNT_TOO_LOW",
      "$.sections",
      `section은 최소 ${policy.sections.minimum}개여야 합니다.`,
    );
  }
  sections.forEach((section, index) => {
    const base = `$.sections[${index}]`;
    if (!requireObject(section, base, errors)) return;
    if (requireId(section.id, `${base}.id`, errors)) {
      if (sectionIds.has(section.id)) {
        addError(errors, "DUPLICATE_SECTION_ID", `${base}.id`, `중복 section ID: ${section.id}`);
      }
      sectionIds.add(section.id);
    }
    if (section.one_message !== true) {
      addError(
        errors,
        "SECTION_ONE_MESSAGE_REQUIRED",
        `${base}.one_message`,
        "각 section은 one_message: true여야 합니다.",
      );
    }
    requireNonEmptyString(section.message, `${base}.message`, errors);
    validateCopy(section.copy, `${base}.copy`, policy, errors, warnings);
  });
  return sectionIds;
}

function validateCountedJobs({
  jobs,
  pathValue,
  config,
  policy,
  sectionIds,
  errors,
  isGif,
}) {
  if (!Array.isArray(jobs)) {
    addError(errors, "JOBS_ARRAY_REQUIRED", pathValue, `${pathValue.slice(2)} 배열이 필요합니다.`);
    return;
  }
  if (jobs.length < config.minimum || jobs.length > config.maximum) {
    addError(
      errors,
      "JOB_COUNT_OUT_OF_RANGE",
      pathValue,
      `${pathValue.slice(2)} 수는 ${config.minimum}~${config.maximum}개여야 합니다.`,
    );
  }
  const ids = new Set();
  jobs.forEach((job, index) => {
    const base = `${pathValue}[${index}]`;
    if (!requireObject(job, base, errors)) return;
    for (const field of config.required_fields) {
      if (!Object.hasOwn(job, field)) {
        addError(errors, "REQUIRED_FIELD_MISSING", `${base}.${field}`, `${field} 필드가 필요합니다.`);
      }
    }
    if (requireId(job.id, `${base}.id`, errors)) {
      if (ids.has(job.id)) {
        addError(errors, "DUPLICATE_JOB_ID", `${base}.id`, `중복 job ID: ${job.id}`);
      }
      ids.add(job.id);
    }
    if (!sectionIds.has(job.section_id)) {
      addError(
        errors,
        "UNKNOWN_SECTION_REFERENCE",
        `${base}.section_id`,
        `존재하지 않는 section: ${String(job.section_id)}`,
      );
    }
    if (job.width_px !== policy.output.width_px) {
      addError(
        errors,
        "ASSET_WIDTH_MUST_BE_780",
        `${base}.width_px`,
        `자산 폭은 ${policy.output.width_px}px이어야 합니다.`,
      );
    }
    if (isGif) {
      for (const field of ["question", "start", "action", "result"]) {
        requireNonEmptyString(job[field], `${base}.${field}`, errors);
      }
    } else {
      requireNonEmptyString(job.purpose, `${base}.purpose`, errors);
      requireNonEmptyString(job.prompt, `${base}.prompt`, errors);
    }
  });
}

function validateQa(qa, policy, errors) {
  if (!requireObject(qa, "$.qa", errors)) return;
  for (const field of [
    "semantic_chunk_review_required",
    "final_render_review_required",
  ]) {
    if (qa[field] !== true) {
      addError(
        errors,
        "REQUIRED_QA_DISABLED",
        `$.qa.${field}`,
        `${field}는 true여야 합니다.`,
      );
    }
  }
  if (qa.final_render_width_px !== policy.qa.final_render_width_px) {
    addError(
      errors,
      "FINAL_RENDER_WIDTH_MUST_BE_780",
      "$.qa.final_render_width_px",
      `최종 렌더 QA 폭은 ${policy.qa.final_render_width_px}px이어야 합니다.`,
    );
  }
  if (!Array.isArray(qa.copy_checks)) {
    addError(
      errors,
      "COPY_CHECKS_ARRAY_REQUIRED",
      "$.qa.copy_checks",
      "최종 렌더에서 확인할 copy_checks 배열이 필요합니다.",
    );
    return;
  }
  for (const check of policy.qa.required_copy_checks) {
    if (!qa.copy_checks.includes(check)) {
      addError(
        errors,
        "REQUIRED_COPY_CHECK_MISSING",
        "$.qa.copy_checks",
        `필수 copy check 누락: ${check}`,
      );
    }
  }
}

export async function loadLeanPolicy() {
  return JSON.parse(await readFile(POLICY_PATH, "utf8"));
}

export async function validateLeanPlan(plan, suppliedPolicy) {
  const policy = suppliedPolicy || (await loadLeanPolicy());
  const errors = [];
  const warnings = [];

  if (!requireObject(plan, "$", errors)) {
    return { ok: false, errors, warnings, summary: null };
  }
  for (const field of policy.required_top_level) {
    if (!Object.hasOwn(plan, field)) {
      addError(errors, "REQUIRED_TOP_LEVEL_MISSING", `$.${field}`, `${field} 필드가 필요합니다.`);
    }
  }
  if (plan.contract_id !== policy.id) {
    addError(
      errors,
      "CONTRACT_ID_MISMATCH",
      "$.contract_id",
      `contract_id는 ${policy.id}이어야 합니다.`,
    );
  }

  findForbiddenHalfWidthProfile(plan, policy, errors);
  validateInputs(plan.inputs, policy, errors);
  validateOutput(plan.output, policy, errors);
  const sectionIds = validateSections(plan.sections, policy, errors, warnings);
  validateCountedJobs({
    jobs: plan.still_jobs,
    pathValue: "$.still_jobs",
    config: policy.still_jobs,
    policy,
    sectionIds,
    errors,
    isGif: false,
  });
  validateCountedJobs({
    jobs: plan.gif_briefs,
    pathValue: "$.gif_briefs",
    config: policy.gif_briefs,
    policy,
    sectionIds,
    errors,
    isGif: true,
  });
  validateQa(plan.qa, policy, errors);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      sections: Array.isArray(plan.sections) ? plan.sections.length : 0,
      still_jobs: Array.isArray(plan.still_jobs) ? plan.still_jobs.length : 0,
      gif_briefs: Array.isArray(plan.gif_briefs) ? plan.gif_briefs.length : 0,
      output_width_px: plan.output?.width_px ?? null,
      semantic_render_review_required: true,
    },
  };
}

export function buildExamplePlan() {
  const sections = [
    {
      id: "hero",
      one_message: true,
      message: "흐어진 물건을 한곳에 정리한다.",
      copy: {
        headline_lines: ["흐어진 물건,", "한 번에 정리"],
        body_chunks: ["보이는 수납 구조를 확인하세요."],
        emphasis_chunks: ["펼치고, 담으면 정리 끝"],
      },
    },
    {
      id: "problem",
      one_message: true,
      message: "필요한 물건을 매번 찾는 불편을 보여준다.",
      copy: {
        headline_lines: ["매번 찾고,", "다시 흐트러지나요?"],
        body_chunks: ["사용 전의 복잡한 상태를 한눈에 보여줍니다."],
        emphasis_chunks: [],
      },
    },
    {
      id: "solution",
      one_message: true,
      message: "제품의 넓은 내부 구조가 정리를 돕는다.",
      copy: {
        headline_lines: ["자주 쓰는 물건은", "한눈에 보고 바로 꺼내세요"],
        body_chunks: ["실제 제품에서 확인한 구조만 설명합니다."],
        emphasis_chunks: ["넓은 내부 공간", "손이 닿는 위치의 손잡이"],
      },
    },
  ];

  const stillJobs = Array.from({ length: 30 }, (_, index) => ({
    id: `still-${String(index + 1).padStart(2, "0")}`,
    section_id: sections[index % sections.length].id,
    purpose: index === 0 ? "메인 후킹" : `판매 메시지 증명 ${index + 1}`,
    prompt: `실제 제품 동일성을 유지한 780px 상업 이미지 ${index + 1}`,
    width_px: 780,
  }));
  const gifBriefs = Array.from({ length: 10 }, (_, index) => ({
    id: `gif-${String(index + 1).padStart(2, "0")}`,
    section_id: sections[index % sections.length].id,
    width_px: 780,
    question: `고객이 이 변화에서 알아야 할 장점 ${index + 1}은 무엇인가?`,
    start: "제품과 사용 전 상태가 첫 프레임부터 보인다.",
    action: "하나의 기능 변화만 순서대로 보여준다.",
    result: "완료 상태를 유지한 뒤 자연스럽게 처음으로 이어진다.",
  }));

  return {
    contract_id: "lean-page-plan-v1",
    inputs: {
      supplier_url: "https://supplier.example.com/products/sku-123",
      coupang_url: "https://www.coupang.com/vp/products/123456789",
      photo_paths: [],
    },
    output: {
      width_px: 780,
      html_path: "output/detail-page.html",
      studio: { enabled: true },
      wing: { enabled: true, cdn: { enabled: true } },
    },
    sections,
    still_jobs: stillJobs,
    gif_briefs: gifBriefs,
    qa: {
      semantic_chunk_review_required: true,
      final_render_review_required: true,
      final_render_width_px: 780,
      copy_checks: [
        "line_meaning_complete",
        "particle_binding",
        "number_unit_binding",
        "modifier_binding",
        "key_phrase_integrity",
      ],
    },
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/lean-contract.mjs validate --file <flow-plan.json>",
    "  node scripts/lean-contract.mjs example",
  ].join("\n");
}

function parseFileArg(args) {
  const index = args.indexOf("--file");
  if (index === -1 || !args[index + 1]) return null;
  return args[index + 1];
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "example") {
    process.stdout.write(`${JSON.stringify(buildExamplePlan(), null, 2)}\n`);
    return;
  }
  if (command === "validate") {
    const file = parseFileArg(args);
    if (!file) throw new Error(`--file <json> 필수\n${usage()}`);
    const source = await readFile(path.resolve(process.cwd(), file), "utf8");
    let plan;
    try {
      plan = JSON.parse(source);
    } catch (error) {
      throw new Error(`JSON 파싱 실패: ${error.message}`);
    }
    const result = await validateLeanPlan(plan);
    process.stdout.write(`${JSON.stringify({ file, ...result }, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new Error(usage());
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
