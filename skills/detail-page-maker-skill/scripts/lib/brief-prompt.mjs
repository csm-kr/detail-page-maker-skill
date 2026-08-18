import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "assets",
  "brief-prompt-template.md",
);

/**
 * 인터뷰가 받아내야 할 항목. 순서가 곧 질문 순서이고,
 * required 항목은 하나라도 비면 프롬프트를 만들지 않는다.
 */
export const BRIEF_FIELDS = [
  {
    key: "supplier_url",
    label: "공급처 URL",
    required: true,
    question:
      "공급처 URL을 그대로 붙여줘. 도매꾹·도매매처럼 이 SKU의 원문이 있는 상품 페이지여야 해.",
  },
  {
    key: "coupang_url",
    label: "쿠팡 URL",
    required: true,
    question:
      "따라갈 쿠팡 경쟁 상품의 상세 URL을 붙여줘. 검색 결과가 아니라 /vp/products/ 로 들어가는 상품 페이지여야 해.",
  },
  {
    key: "photos",
    label: "실제 사진",
    required: false,
    question:
      "실제 촬영본이 있으면 폴더나 .zip 경로를 알려줘. 없으면 '없음'이라고 답해도 돼.",
  },
  {
    key: "brand",
    label: "브랜드명",
    required: true,
    question: "상세페이지에 노출할 브랜드명을 정확히 알려줘.",
  },
  {
    key: "product_name",
    label: "제품명",
    required: true,
    question: "제품명을 알려줘. 카테고리 이름 말고 실제로 팔 이름이어야 해.",
  },
  {
    key: "notes",
    label: "추가 의견",
    required: false,
    question:
      "이 제품에서 꼭 강조할 것, 반대로 절대 하지 말 것이 있으면 알려줘. 없으면 '없음'이라고 답해도 돼.",
  },
];

const FIELD_KEYS = BRIEF_FIELDS.map((field) => field.key);
const FIELD_BY_KEY = new Map(BRIEF_FIELDS.map((field) => [field.key, field]));
const EMPTY_ANSWERS = new Set(["없음", "없어", "없다", "none", "n/a", "-"]);

const PHOTOS_FALLBACK =
  "없음 — 실제 촬영본이 없으니 같은 SKU의 공급처 이미지를 제품 동일성 SSOT로 삼고 진행해줘.";
const NOTES_FALLBACK = "없음 — 아래 기본 명령을 그대로 따라줘.";

let cachedTemplate = null;

/** 프롬프트 템플릿 원문. 불변 블록이라 매 run 같은 내용이어야 한다. */
export function loadBriefPromptTemplate() {
  if (cachedTemplate === null) {
    cachedTemplate = readFileSync(TEMPLATE_PATH, "utf8").replace(/\r\n?/gu, "\n");
  }
  return cachedTemplate;
}

// 붙여넣기로 섞여 들어오는 제어문자를 지운다. 줄바꿈과 탭만 남긴다.
function stripControlCharacters(value) {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === 0x0a || code === 0x09) {
      result += character;
      continue;
    }
    if (code < 0x20 || code === 0x7f) continue;
    result += character;
  }
  return result;
}

function cleanValue(value) {
  if (value === null || value === undefined) return "";
  return stripControlCharacters(String(value).replace(/\r\n?/gu, "\n")).trim();
}

/** 앞뒤 공백·제어문자·줄바꿈 표기를 정리한 브리프를 돌려준다. */
export function normalizeBrief(brief) {
  const source = brief && typeof brief === "object" ? brief : {};
  const result = {};
  for (const key of FIELD_KEYS) {
    const value = cleanValue(source[key]);
    result[key] = EMPTY_ANSWERS.has(value.toLowerCase()) ? "" : value;
  }
  return result;
}

function parseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function checkSupplierUrl(value, issues) {
  if (parseUrl(value)) return;
  issues.push({
    key: "supplier_url",
    code: "not_a_url",
    question: `"${value}"는 URL이 아니야. https:// 로 시작하는 공급처 상품 페이지 주소를 그대로 붙여줘.`,
  });
}

function checkCoupangUrl(value, issues) {
  const url = parseUrl(value);
  if (!url) {
    issues.push({
      key: "coupang_url",
      code: "not_a_url",
      question: `"${value}"는 URL이 아니야. https://www.coupang.com/vp/products/... 형태의 주소를 붙여줘.`,
    });
    return;
  }
  if (!/(^|\.)coupang\.com$/u.test(url.hostname)) {
    issues.push({
      key: "coupang_url",
      code: "not_coupang",
      question: `${url.hostname} 은 쿠팡이 아니야. 따라갈 기준은 쿠팡 상품 페이지여야 해. 쿠팡 URL을 다시 줘.`,
    });
    return;
  }
  if (!url.pathname.includes("/vp/products/")) {
    issues.push({
      key: "coupang_url",
      code: "not_product_page",
      question:
        "검색·목록 페이지라 판매 논리를 뜯을 수 없어. 상품 하나를 열고 /vp/products/ 가 들어간 주소를 줘.",
    });
  }
}

function checkProductName(value, issues) {
  if (value.split(/\s+/u).length >= 2) return;
  issues.push({
    key: "product_name",
    code: "too_generic",
    question: `"${value}"만으로는 카테고리 이름이랑 구분이 안 돼. 소재·핏·기능 중 하나를 붙여서 실제 판매명으로 다시 알려줘.`,
  });
}

function checkMarkers(key, value, issues) {
  if (!value.includes("<!--") && !value.includes("-->")) return false;
  issues.push({
    key,
    code: "unsafe_marker",
    question: `${FIELD_BY_KEY.get(key).label}에 템플릿 주석(<!-- -->)이 들어 있어. 그대로 두면 프롬프트가 깨져. 그 부분을 빼고 다시 알려줘.`,
  });
  return true;
}

/**
 * 인터뷰 답변을 검증한다. ok=false면 missing·issues에 적힌 항목만
 * 다시 물어보고, 통과할 때까지 프롬프트를 만들지 않는다.
 */
export function validateBrief(brief) {
  const normalized = normalizeBrief(brief);
  const missing = [];
  const issues = [];
  const notices = [];

  for (const field of BRIEF_FIELDS) {
    const value = normalized[field.key];
    if (!value) {
      if (field.required) missing.push(field.key);
      else notices.push({ key: field.key, message: `${field.label} 없이 진행한다.` });
      continue;
    }
    if (checkMarkers(field.key, value, issues)) continue;
    if (field.key === "supplier_url") checkSupplierUrl(value, issues);
    if (field.key === "coupang_url") checkCoupangUrl(value, issues);
    if (field.key === "product_name") checkProductName(value, issues);
  }

  return {
    ok: missing.length === 0 && issues.length === 0,
    brief: normalized,
    missing,
    issues,
    notices,
    followups: missing.map((key) => ({
      key,
      question: FIELD_BY_KEY.get(key).question,
    })),
  };
}

function applyInstallBlock(template, installed) {
  const block = /<!--BLOCK:install-->\n([\s\S]*?)<!--\/BLOCK:install-->\n/u;
  if (!block.test(template)) {
    throw new Error("프롬프트 템플릿에 install 블록 마커가 없습니다.");
  }
  return template.replace(block, (_match, body) => (installed ? "" : body));
}

/**
 * 검증을 통과한 브리프로 detail-page-maker-skill에 그대로 넘길 프롬프트를 만든다.
 * installed=true면 #1 설치 섹션을 빼고 제작 지시만 남긴다.
 */
export function renderBriefPrompt(brief, options = {}) {
  const report = validateBrief(brief);
  if (!report.ok) {
    const blocked = [...report.missing, ...report.issues.map((issue) => issue.key)];
    throw new Error(
      `인터뷰가 끝나지 않았습니다. 다시 확인할 항목: ${[...new Set(blocked)].join(", ")}`,
    );
  }

  const values = {
    ...report.brief,
    photos: report.brief.photos || PHOTOS_FALLBACK,
    notes: report.brief.notes || NOTES_FALLBACK,
  };

  const template = applyInstallBlock(
    loadBriefPromptTemplate(),
    options.installed !== false,
  );
  const unknown = [...template.matchAll(/\{\{(\w+)\}\}/gu)]
    .map((match) => match[1])
    .filter((key) => !FIELD_BY_KEY.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `프롬프트 템플릿에 알 수 없는 자리표시자가 있습니다: ${[...new Set(unknown)].join(", ")}`,
    );
  }

  return template.replace(/\{\{(\w+)\}\}/gu, (_match, key) => values[key]);
}
