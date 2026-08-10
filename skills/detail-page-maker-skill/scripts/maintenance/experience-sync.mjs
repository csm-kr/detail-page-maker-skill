import { createHash, randomBytes } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildLearningStatus } from "./learning-status.mjs";

const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SHA256 = /^[a-f0-9]{64}$/;
const RULE_ID = /^(CR|TR|MR)-\d+$/;
const EXPERIENCE_ID = /^EXP-[A-Za-z0-9_-]+$/;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s"'`)]+/i;
const PATH_PATTERNS = [
  /\b[a-z]:[\\/][^\s"'`]+/i,
  /(?:^|[\s("'`])(?:\/Users\/|\/home\/|\/tmp\/|\.{0,2}\/)[^\s"'`)]+/i,
  /\b(?:file:\/\/|\\\\)[^\s"'`]+/i,
  /(?:^|[\s("'`])(?:[\w.-]+[\\/])+\w[\w.-]*\.(?:md|json|html?|png|jpe?g|gif|webp|svg|mp4|mov|mjs|js)\b/i,
];
const HEX_COLOR_PATTERN = /(?:^|[\s("'`])#[a-f0-9]{3,8}\b/i;
const SOURCE_KIND = new Set([
  "completed-result",
  "user-feedback",
  "commercial-research",
  "frame-production",
]);
const MOTION_CATEGORIES = new Set([
  "gif",
  "motion",
  "animation",
  "frame",
  "hyperframes",
]);
const TARGETS = Object.freeze({
  "references/commercial.md": Object.freeze({
    prefix: "CR",
    countKey: "commercialRules",
  }),
  "references/taste.md": Object.freeze({
    prefix: "TR",
    countKey: "tasteRules",
  }),
  "references/motion.md": Object.freeze({
    prefix: "MR",
    countKey: "motionRules",
  }),
});
const TABLE_HEADER =
  /^\|\s*ID\s*\|\s*계속 적용할 규칙\s*\|\s*검증 기준\s*\|\s*갱신일\s*\|\s*$/;
const TABLE_SEPARATOR =
  /^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*$/;
const README = `# Trusted experience drop

\`exps/\`는 완성 결과에서 추출한 공용 경험을 넣는 신뢰 경계다. 이 폴더의 일반
\`.md\` 파일은 다음 skill 실행의 \`experience-sync\`, \`new\`, \`start\`,
\`workflow-advance\`, \`workflow-resume\` 진입 때 자동 검사·승격된다.

파일을 이 폴더에 두는 행위는 그 파일 안의 안전한 공용 규칙에 대한 사전 승인을
뜻한다. 그러나 증거 hash, 독립 session, 품질 조건, 일반화 검사를 통과하지 못하면
active reference를 바꾸지 않고 \`.workspace/learning/exps/quarantine/\`에 기록한다.

폴더는 더 나누지 않는다. 한 조사 묶음이나 한 완성 run마다 Markdown 하나를 만들고,
그 안에 여러 \`EXP-*\` 블록을 둘 수 있다.

- Behance 반복 관찰: \`source_kind: commercial-research\` → \`commercial.md\`의 CR
- HeyGenFrame motion·frame: \`source_kind: frame-production\` → \`motion.md\`의 MR
- HeyGenFrame Studio 편집 UX: \`source_kind: completed-result\`, \`category: studio\`
  → \`taste.md\`의 TR
- 일반 사용자 전후 피드백: \`source_kind: user-feedback\` → category에 따라 TR/MR

Behance 검색 결과 페이지 자체는 승격 근거가 아니다. 서로 다른 프로젝트 세 개
이상을 열어 반복된 정보 구조만 기록한다. HeyGenFrame은 strict frame-check와
첫·중간·끝 프레임 근거를 남긴다.

## EXP-EXAMPLE-001

- \`source_kind\`: completed-result
- \`category\`: layout
- \`scope\`: shared
- \`promotion\`: auto
- \`rule_text\`: 한 화면의 핵심 메시지는 하나로 제한하고 보조 정보는 다음 위계로 낮춘다.
- \`validation_criterion\`: 390px과 780px에서 주요 초점이 하나이고 overflow가 없다.
- \`evidence_paths\`: projects/example/output/detail-page.html; projects/example/.detail-page/qa/reports/g5.json
- \`evidence_sha256\`: <첫 파일 sha256>; <둘째 파일 sha256>
- \`producer_session_id\`: producer-session
- \`reviewer_session_id\`: independent-reviewer-session
- \`case_count\`: 1
- \`quality_score\`: 97
- \`behance_quality_score\`: 90
- \`critical_dimension_min_score\`: 85
- \`hard_failure_count\`: 0
- \`frame_check\`: PASS
- \`public_output_qa\`: PASS
- \`reference_comparison\`: PASS
- \`user_approval\`: true
- \`producer_run_id\`: RUN-production
- \`qa_run_id\`: RUN-independent-public-output-qa
- \`before_after\`: 수정 전 문제와 수정 후 검증 결과
- \`sensitive_terms\`: 상품명; 고유 카피
- \`supersedes_rule_id\`:
- \`created_at\`: 2026-07-30T00:00:00.000Z
`;

export class ExperienceSyncError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ExperienceSyncError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new ExperienceSyncError(code, message, details);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) {
    fail("INVALID_EXPERIENCE", `${field}가 필요합니다.`, { field });
  }
  return text;
}

function integer(value, field, { minimum = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    fail(
      "INVALID_EXPERIENCE",
      `${field}는 ${minimum} 이상의 정수여야 합니다.`,
      { field, value },
    );
  }
  return parsed;
}

function number(value, field, { minimum = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    fail(
      "INVALID_EXPERIENCE",
      `${field}는 ${minimum} 이상의 수여야 합니다.`,
      { field, value },
    );
  }
  return parsed;
}

function splitValues(value) {
  return String(value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFields(block) {
  return Object.fromEntries(
    [...block.matchAll(/^- `([^`]+)`:[ \t]*(.*)$/gm)].map((match) => [
      match[1].trim(),
      match[2].trim(),
    ]),
  );
}

export function parseExperienceDocument(markdown, sourceFile = "exps/<file>.md") {
  const headings = [
    ...String(markdown).matchAll(
      /^#{2,3}\s+(EXP-[A-Za-z0-9_-]+)\s*$/gm,
    ),
  ];
  if (headings.length === 0) {
    fail(
      "EXPERIENCE_BLOCK_MISSING",
      "EXP-* 제목을 가진 경험 블록이 없습니다.",
      { source_file: sourceFile },
    );
  }
  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    return {
      experience_id: heading[1],
      source_file: sourceFile,
      ...parseFields(markdown.slice(start, end)),
    };
  });
}

function routeExperience(experience) {
  const sourceKind = required(
    experience.source_kind,
    "source_kind",
  ).toLowerCase();
  if (!SOURCE_KIND.has(sourceKind)) {
    fail(
      "UNSUPPORTED_EXPERIENCE_KIND",
      `지원하지 않는 source_kind입니다: ${sourceKind}`,
    );
  }
  const category = String(experience.category ?? "")
    .trim()
    .toLowerCase();
  if (sourceKind === "commercial-research") {
    return {
      sourceKind,
      category,
      targetReference: "references/commercial.md",
      prefix: "CR",
    };
  }
  if (
    sourceKind === "frame-production" ||
    MOTION_CATEGORIES.has(category)
  ) {
    return {
      sourceKind,
      category,
      targetReference: "references/motion.md",
      prefix: "MR",
    };
  }
  return {
    sourceKind,
    category,
    targetReference: "references/taste.md",
    prefix: "TR",
  };
}

function safeRuleCell(value, field, sensitiveTerms) {
  const text = required(value, field);
  if (
    text.includes("|") ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    fail(
      "UNSAFE_EXPERIENCE_RULE",
      `${field}에는 pipe나 줄바꿈을 넣을 수 없습니다.`,
      { field },
    );
  }
  if (
    URL_PATTERN.test(text) ||
    PATH_PATTERNS.some((pattern) => pattern.test(text)) ||
    HEX_COLOR_PATTERN.test(text)
  ) {
    fail(
      "UNSAFE_EXPERIENCE_RULE",
      `${field}에 URL·경로·고유 색상값이 남아 있습니다.`,
      { field },
    );
  }
  for (const term of sensitiveTerms) {
    if (
      text
        .toLocaleLowerCase("en")
        .includes(term.toLocaleLowerCase("en"))
    ) {
      fail(
        "UNSAFE_EXPERIENCE_RULE",
        `${field}에 상품명 또는 고유 카피가 남아 있습니다.`,
        {
          field,
          sensitive_term_fingerprint: sha256(term).slice(0, 16),
        },
      );
    }
  }
  return text;
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function verifiedEvidence(workspaceRoot, experience) {
  const locators = splitValues(experience.evidence_paths);
  const hashes = splitValues(experience.evidence_sha256).map((item) =>
    item.toLowerCase(),
  );
  if (locators.length !== hashes.length || locators.length === 0) {
    fail(
      "EXPERIENCE_EVIDENCE_MISMATCH",
      "evidence_paths와 evidence_sha256은 같은 개수로 필요합니다.",
      {
        evidence_paths: locators.length,
        evidence_sha256: hashes.length,
      },
    );
  }
  if (new Set(locators.map((item) => item.replaceAll("\\", "/"))).size !== locators.length) {
    fail(
      "DUPLICATE_EXPERIENCE_EVIDENCE",
      "같은 evidence 경로를 여러 사례로 중복 집계할 수 없습니다.",
    );
  }
  const evidence = [];
  for (let index = 0; index < locators.length; index += 1) {
    const locator = locators[index];
    if (path.isAbsolute(locator)) {
      fail(
        "UNSAFE_EXPERIENCE_EVIDENCE",
        "evidence 경로는 workspace 상대 경로여야 합니다.",
        { locator },
      );
    }
    const target = path.resolve(workspaceRoot, locator);
    if (!isWithin(workspaceRoot, target)) {
      fail(
        "UNSAFE_EXPERIENCE_EVIDENCE",
        "evidence 경로가 workspace를 벗어났습니다.",
        { locator },
      );
    }
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) {
      fail(
        "UNSAFE_EXPERIENCE_EVIDENCE",
        "evidence는 symlink가 아닌 일반 파일이어야 합니다.",
        { locator },
      );
    }
    if (!SHA256.test(hashes[index])) {
      fail(
        "INVALID_EXPERIENCE_EVIDENCE_HASH",
        "evidence_sha256 값이 올바르지 않습니다.",
        { locator, sha256: hashes[index] },
      );
    }
    const bytes = await readFile(target);
    const actualHash = sha256(bytes);
    if (actualHash !== hashes[index]) {
      fail(
        "EXPERIENCE_EVIDENCE_HASH_MISMATCH",
        "experience evidence bytes가 기록한 SHA-256과 다릅니다.",
        {
          locator,
          expected: hashes[index],
          actual: actualHash,
        },
      );
    }
    evidence.push({
      locator: locator.replaceAll("\\", "/"),
      size_bytes: bytes.length,
      sha256: actualHash,
    });
  }
  return evidence;
}

function assertExperienceQuality(experience, route, evidence) {
  if (!EXPERIENCE_ID.test(experience.experience_id)) {
    fail(
      "INVALID_EXPERIENCE_ID",
      "experience_id는 EXP-* 형식이어야 합니다.",
    );
  }
  if (required(experience.scope, "scope").toLowerCase() !== "shared") {
    fail(
      "EXPERIENCE_NOT_SHARED",
      "exps 자동 승격은 scope: shared만 처리합니다.",
    );
  }
  if (required(experience.promotion, "promotion").toLowerCase() !== "auto") {
    fail(
      "EXPERIENCE_AUTO_PROMOTION_NOT_AUTHORIZED",
      "exps 자동 승격은 promotion: auto가 필요합니다.",
    );
  }
  const producerSessionId = required(
    experience.producer_session_id,
    "producer_session_id",
  );
  const reviewerSessionId = required(
    experience.reviewer_session_id,
    "reviewer_session_id",
  );
  if (producerSessionId === reviewerSessionId) {
    fail(
      "EXPERIENCE_SELF_REVIEW_FORBIDDEN",
      "경험 생산자와 독립 검토자 session은 달라야 합니다.",
    );
  }
  const caseCount = integer(
    experience.case_count ?? 0,
    "case_count",
  );
  const beforeAfter = String(experience.before_after ?? "").trim();
  if (
    route.sourceKind === "completed-result" &&
    (number(experience.quality_score, "quality_score") < 97 ||
      number(
        experience.behance_quality_score,
        "behance_quality_score",
      ) < 90 ||
      number(
        experience.critical_dimension_min_score,
        "critical_dimension_min_score",
      ) < 85 ||
      integer(
        experience.hard_failure_count,
        "hard_failure_count",
      ) !== 0 ||
      evidence.length < 2)
  ) {
    fail(
      "COMPLETED_RESULT_QUALITY_INSUFFICIENT",
      "완성 결과 경험은 97/90/85/hard-0와 검증 evidence 2개 이상이 필요합니다.",
    );
  }
  if (
    ["completed-result", "frame-production"].includes(
      route.sourceKind,
    )
  ) {
    const publicOutputQa = String(
      experience.public_output_qa ?? "",
    ).toUpperCase();
    const referenceComparison = String(
      experience.reference_comparison ?? "",
    ).toUpperCase();
    const userApproval =
      String(experience.user_approval ?? "").toLowerCase() ===
      "true";
    const producerRunId = required(
      experience.producer_run_id,
      "producer_run_id",
    );
    const qaRunId = required(
      experience.qa_run_id,
      "qa_run_id",
    );
    if (
      publicOutputQa !== "PASS" ||
      (referenceComparison !== "PASS" && !userApproval) ||
      producerRunId === qaRunId
    ) {
      fail(
        "INDEPENDENT_PUBLIC_RESULT_EVIDENCE_REQUIRED",
        "완성·frame 경험은 export 후 public-output QA와 독립 run의 기준 비교 또는 사용자 승인이 필요합니다.",
      );
    }
  }
  if (
    route.sourceKind === "commercial-research" &&
    (caseCount < 3 || evidence.length < 3)
  ) {
    fail(
      "COMMERCIAL_RESEARCH_EVIDENCE_INSUFFICIENT",
      "commercial research 경험은 서로 다른 사례 3개 이상이 필요합니다.",
    );
  }
  if (
    route.sourceKind === "frame-production" &&
    (String(experience.frame_check ?? "").toUpperCase() !== "PASS" ||
      caseCount < 1 ||
      evidence.length < 2)
  ) {
    fail(
      "FRAME_EXPERIENCE_EVIDENCE_INSUFFICIENT",
      "frame 경험은 strict frame-check PASS와 evidence 2개 이상이 필요합니다.",
    );
  }
  if (
    route.sourceKind === "user-feedback" &&
    (!beforeAfter || evidence.length < 2)
  ) {
    fail(
      "USER_FEEDBACK_EVIDENCE_INSUFFICIENT",
      "사용자 피드백 경험은 before_after와 전후 evidence 2개 이상이 필요합니다.",
    );
  }
  return {
    producer_session_id: producerSessionId,
    reviewer_session_id: reviewerSessionId,
    case_count: caseCount,
  };
}

function splitTableRow(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) return null;
  const cells = line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
  return cells.length === 4 ? cells : null;
}

function parseRuleTable(referenceText, target) {
  const lines = referenceText.replaceAll("\r\n", "\n").split("\n");
  const headerIndex = lines.findIndex((line) =>
    TABLE_HEADER.test(line),
  );
  if (
    headerIndex < 0 ||
    !TABLE_SEPARATOR.test(lines[headerIndex + 1] ?? "")
  ) {
    fail(
      "RULE_TABLE_NOT_FOUND",
      "active reference의 규칙 표를 찾지 못했습니다.",
    );
  }
  const rows = [];
  let endIndex = headerIndex + 2;
  while (
    endIndex < lines.length &&
    lines[endIndex].startsWith("|")
  ) {
    const cells = splitTableRow(lines[endIndex]);
    if (!cells) {
      fail("INVALID_RULE_TABLE", "규칙 표는 네 열이어야 합니다.");
    }
    const [ruleId, ruleText, validationCriterion, updatedOn] = cells;
    if (
      !RULE_ID.test(ruleId) ||
      !ruleId.startsWith(`${target.prefix}-`)
    ) {
      fail(
        "INVALID_RULE_TABLE",
        "규칙 ID namespace가 active reference와 다릅니다.",
        { rule_id: ruleId },
      );
    }
    rows.push({
      line_index: endIndex,
      rule_id: ruleId,
      rule_text: ruleText,
      validation_criterion: validationCriterion,
      updated_on: updatedOn,
    });
    endIndex += 1;
  }
  return { lines, rows, end_index: endIndex };
}

function rowHash(row) {
  return sha256(
    canonicalJson({
      rule_id: row.rule_id,
      rule_text: row.rule_text,
      validation_criterion: row.validation_criterion,
      updated_on: row.updated_on,
    }),
  );
}

function nextRuleId(rows, prefix) {
  const max = rows.reduce((current, row) => {
    const numberPart = Number(row.rule_id.slice(prefix.length + 1));
    return Number.isInteger(numberPart)
      ? Math.max(current, numberPart)
      : current;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function chooseRuleId(experience, route, table, ruleText) {
  const supersedes = String(experience.supersedes_rule_id ?? "").trim();
  if (supersedes) {
    if (
      !RULE_ID.test(supersedes) ||
      !supersedes.startsWith(`${route.prefix}-`) ||
      !table.rows.some((row) => row.rule_id === supersedes)
    ) {
      fail(
        "INVALID_SUPERSEDES_RULE",
        "supersedes_rule_id가 대상 active reference의 기존 규칙이 아닙니다.",
        { supersedes_rule_id: supersedes },
      );
    }
    return { ruleId: supersedes, action: "update" };
  }
  const exact = table.rows.find((row) => row.rule_text === ruleText);
  if (exact) return { ruleId: exact.rule_id, action: "reuse" };
  return {
    ruleId: nextRuleId(table.rows, route.prefix),
    action: "insert",
  };
}

function applyRule(referenceText, table, row, action) {
  if (action === "reuse") {
    return { text: referenceText, changed: false };
  }
  const lines = [...table.lines];
  if (action === "update") {
    const existing = table.rows.find(
      (item) => item.rule_id === row.rule_id,
    );
    lines[existing.line_index] =
      `| ${row.rule_id} | ${row.rule_text} | ${row.validation_criterion} | ${row.updated_on} |`;
  } else {
    lines.splice(
      table.end_index,
      0,
      `| ${row.rule_id} | ${row.rule_text} | ${row.validation_criterion} | ${row.updated_on} |`,
    );
  }
  return { text: lines.join("\n"), changed: true };
}

async function atomicReplace(target, bytes, token) {
  const temporary = path.join(
    path.dirname(target),
    `.experience-${token}-${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeQuarantine(
  workspaceRoot,
  sourceFile,
  sourceSha256,
  experience,
  error,
) {
  const quarantineRoot = path.join(
    workspaceRoot,
    ".workspace",
    "learning",
    "exps",
    "quarantine",
  );
  await mkdir(quarantineRoot, { recursive: true });
  const key = sha256(
    canonicalJson({
      source_file: sourceFile,
      source_sha256: sourceSha256,
      experience_id: experience?.experience_id ?? null,
    }),
  );
  const receipt = {
    schema_version: "1.0",
    status: "QUARANTINED",
    source_file: sourceFile,
    source_sha256: sourceSha256,
    experience_id: experience?.experience_id ?? null,
    code: error?.code ?? "EXPERIENCE_SYNC_FAILED",
    message: error?.message ?? String(error),
    details: error?.details ?? {},
    quarantined_at: new Date().toISOString(),
  };
  await writeFile(
    path.join(quarantineRoot, `${key}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8",
  );
  return receipt;
}

async function promoteExperience({
  workspaceRoot,
  skillRoot,
  sourceFile,
  sourceSha256,
  experience,
}) {
  const route = routeExperience(experience);
  const declaredOwner = String(experience.owner_reference ?? "").trim();
  if (
    declaredOwner &&
    ![
      route.targetReference,
      path.basename(route.targetReference),
    ].includes(declaredOwner)
  ) {
    fail(
      "EXPERIENCE_ROUTE_MISMATCH",
      "owner_reference가 source_kind/category의 자동 route와 다릅니다.",
      {
        declared: declaredOwner,
        expected: route.targetReference,
      },
    );
  }
  const sensitiveTerms = splitValues(experience.sensitive_terms);
  const ruleText = safeRuleCell(
    experience.rule_text,
    "rule_text",
    sensitiveTerms,
  );
  const validationCriterion = safeRuleCell(
    experience.validation_criterion,
    "validation_criterion",
    sensitiveTerms,
  );
  const evidence = await verifiedEvidence(
    workspaceRoot,
    experience,
  );
  const quality = assertExperienceQuality(
    experience,
    route,
    evidence,
  );
  const createdAt = required(experience.created_at, "created_at");
  if (Number.isNaN(Date.parse(createdAt))) {
    fail(
      "INVALID_EXPERIENCE_DATE",
      "created_at은 ISO timestamp여야 합니다.",
    );
  }
  const itemHash = sha256(
    canonicalJson({
      source_sha256: sourceSha256,
      experience,
      evidence,
      target_reference: route.targetReference,
    }),
  );
  const promotionRoot = path.join(
    workspaceRoot,
    ".workspace",
    "learning",
    "exps",
    "promotions",
  );
  const receiptPath = path.join(
    promotionRoot,
    `${itemHash}.json`,
  );
  const snapshotPath = path.join(
    promotionRoot,
    `${itemHash}.md`,
  );
  const referencePath = path.resolve(
    skillRoot,
    route.targetReference,
  );
  if (!isWithin(skillRoot, referencePath)) {
    fail(
      "ACTIVE_REFERENCE_PATH_ESCAPE",
      "active reference가 skill root를 벗어났습니다.",
    );
  }
  const beforeBytes = await readFile(referencePath);
  const beforeText = beforeBytes.toString("utf8");
  const beforeSha256 = sha256(beforeBytes);
  const table = parseRuleTable(
    beforeText,
    TARGETS[route.targetReference],
  );
  if (await exists(receiptPath)) {
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    const currentRow = table.rows.find(
      (row) => row.rule_id === receipt.rule_row?.rule_id,
    );
    if (
      receipt.item_sha256 !== itemHash ||
      !currentRow ||
      rowHash(currentRow) !== receipt.rule_row?.rule_row_sha256
    ) {
      fail(
        "EXPERIENCE_PROMOTION_DRIFT",
        "기존 experience promotion receipt와 active rule이 다릅니다.",
        { receipt_path: receiptPath },
      );
    }
    return {
      status: "REUSED",
      experience_id: experience.experience_id,
      item_sha256: itemHash,
      target_reference: route.targetReference,
      rule_id: currentRow.rule_id,
      receipt_path: receiptPath,
    };
  }
  const selected = chooseRuleId(
    experience,
    route,
    table,
    ruleText,
  );
  const row = {
    rule_id: selected.ruleId,
    rule_text: ruleText,
    validation_criterion: validationCriterion,
    updated_on: createdAt.slice(0, 10),
  };
  const applied = applyRule(
    beforeText,
    table,
    row,
    selected.action,
  );
  const afterBytes = Buffer.from(applied.text, "utf8");
  const afterSha256 = sha256(afterBytes);
  const ruleRowSha256 = rowHash(row);
  const stagingRoot = promotionRoot;
  await mkdir(promotionRoot, { recursive: true });
  const staging = await mkdtemp(
    path.join(stagingRoot, `.staging-${itemHash}-`),
  );
  let referenceChanged = false;
  let committed = false;
  try {
    const statusBefore = await buildLearningStatus({
      workspaceRoot,
      skillRoot,
    });
    if (applied.changed) {
      const latestBytes = await readFile(referencePath);
      if (sha256(latestBytes) !== beforeSha256) {
        fail(
          "ACTIVE_REFERENCE_DRIFT",
          "experience 승격 직전 active reference가 변경됐습니다.",
        );
      }
      await atomicReplace(referencePath, afterBytes, itemHash);
      referenceChanged = true;
    }
    const statusAfter = await buildLearningStatus({
      workspaceRoot,
      skillRoot,
    });
    const countKey = TARGETS[route.targetReference].countKey;
    const expectedCount =
      statusBefore.counts[countKey] +
      (selected.action === "insert" ? 1 : 0);
    if (statusAfter.counts[countKey] !== expectedCount) {
      fail(
        "EXPERIENCE_RULE_COUNT_MISMATCH",
        "승격 뒤 active rule count가 예상과 다릅니다.",
        {
          count_key: countKey,
          expected: expectedCount,
          actual: statusAfter.counts[countKey],
        },
      );
    }
    const receiptBody = {
      schema_version: "1.0",
      receipt_type: "learning.experience.auto-promotion",
      authorization_kind: "trusted_exps_drop",
      status: "PROMOTED",
      experience_id: experience.experience_id,
      item_sha256: itemHash,
      source_file: sourceFile,
      source_sha256: sourceSha256,
      source_kind: route.sourceKind,
      category: route.category,
      producer_session_id: quality.producer_session_id,
      reviewer_session_id: quality.reviewer_session_id,
      case_count: quality.case_count,
      target_reference: route.targetReference,
      action: selected.action,
      rule_row: {
        ...row,
        rule_row_sha256: ruleRowSha256,
      },
      evidence,
      active_reference_sha256_before: beforeSha256,
      active_reference_sha256_after: afterSha256,
      learning_status_count_before:
        statusBefore.counts[countKey],
      learning_status_count_after:
        statusAfter.counts[countKey],
      promoted_at: new Date().toISOString(),
      raw_source_deleted: false,
    };
    const receipt = {
      ...receiptBody,
      receipt_id:
        `experience-promotion-${sha256(canonicalJson(receiptBody)).slice(0, 24)}`,
      receipt_sha256: sha256(canonicalJson(receiptBody)),
    };
    const stagedReference = path.join(staging, "reference.md");
    const stagedReceipt = path.join(staging, "promotion-receipt.json");
    await writeFile(stagedReference, afterBytes, { flag: "wx" });
    await writeFile(
      stagedReceipt,
      `${JSON.stringify(receipt, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(stagedReference, snapshotPath);
    await rename(stagedReceipt, receiptPath);
    await rm(staging, { recursive: true, force: true });
    committed = true;
    return {
      status: "PROMOTED",
      experience_id: experience.experience_id,
      item_sha256: itemHash,
      target_reference: route.targetReference,
      rule_id: row.rule_id,
      action: selected.action,
      receipt_path: receiptPath,
    };
  } catch (error) {
    if (referenceChanged && !committed) {
      await atomicReplace(
        referencePath,
        beforeBytes,
        `${itemHash}-rollback`,
      );
    }
    throw error;
  } finally {
    if (!committed) {
      await rm(staging, { recursive: true, force: true });
    }
  }
}

export async function ensureExperienceDrop({
  workspaceRoot = process.cwd(),
} = {}) {
  const workspace = path.resolve(workspaceRoot);
  const expsRoot = path.join(workspace, "exps");
  const readmePath = path.join(expsRoot, "README.md");
  await mkdir(expsRoot, { recursive: true });
  if (!(await exists(readmePath))) {
    await writeFile(readmePath, README, "utf8");
  }
  return { workspace_root: workspace, exps_root: expsRoot, readme_path: readmePath };
}

export async function syncTrustedExperiences({
  workspaceRoot = process.cwd(),
  skillRoot = SKILL_ROOT,
} = {}) {
  const drop = await ensureExperienceDrop({ workspaceRoot });
  const entries = await readdir(drop.exps_root, {
    withFileTypes: true,
  });
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".md") &&
        entry.name.toLowerCase() !== "readme.md" &&
        !entry.name.startsWith("_"),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
  const results = [];
  const quarantined = [];
  for (const fileName of files) {
    const absolute = path.join(drop.exps_root, fileName);
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink()) {
      const error = new ExperienceSyncError(
        "UNSAFE_EXPERIENCE_FILE",
        "exps 입력은 symlink가 아닌 일반 Markdown이어야 합니다.",
      );
      quarantined.push(
        await writeQuarantine(
          drop.workspace_root,
          `exps/${fileName}`,
          "unavailable",
          null,
          error,
        ),
      );
      continue;
    }
    const bytes = await readFile(absolute);
    const sourceSha256 = sha256(bytes);
    let experiences;
    try {
      experiences = parseExperienceDocument(
        bytes.toString("utf8"),
        `exps/${fileName}`,
      );
    } catch (error) {
      quarantined.push(
        await writeQuarantine(
          drop.workspace_root,
          `exps/${fileName}`,
          sourceSha256,
          null,
          error,
        ),
      );
      continue;
    }
    for (const experience of experiences) {
      try {
        results.push(
          await promoteExperience({
            workspaceRoot: drop.workspace_root,
            skillRoot: path.resolve(skillRoot),
            sourceFile: `exps/${fileName}`,
            sourceSha256,
            experience,
          }),
        );
      } catch (error) {
        quarantined.push(
          await writeQuarantine(
            drop.workspace_root,
            `exps/${fileName}`,
            sourceSha256,
            experience,
            error,
          ),
        );
      }
    }
  }
  return {
    schema_version: "1.0",
    workspace_root: drop.workspace_root,
    exps_root: drop.exps_root,
    scanned_files: files.length,
    promoted: results.filter((item) => item.status === "PROMOTED").length,
    reused: results.filter((item) => item.status === "REUSED").length,
    quarantined: quarantined.length,
    results,
    quarantine: quarantined,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let workspaceRoot = process.cwd();
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--workspace") {
      workspaceRoot = args[++index] || "";
    } else if (token === "--json") {
      json = true;
    } else {
      throw new Error(`알 수 없는 인자입니다: ${token}`);
    }
  }
  const report = await syncTrustedExperiences({ workspaceRoot });
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `exps=${report.scanned_files} promoted=${report.promoted} reused=${report.reused} quarantined=${report.quarantined}\n`,
    );
  }
  if (report.quarantined > 0) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    const code = error?.code ? `[${error.code}] ` : "";
    console.error(`ERROR ${code}${error.message || error}`);
    if (error?.details && Object.keys(error.details).length > 0) {
      console.error(JSON.stringify({ details: error.details }, null, 2));
    }
    process.exitCode = 1;
  });
}
