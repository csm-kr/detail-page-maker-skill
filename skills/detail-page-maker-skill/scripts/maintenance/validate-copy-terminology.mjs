import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_BANNED_PHRASES = [
  "주름이 살랑",
  "자연스럽게 스며",
  "어떤 스타일에도",
  "오늘 입은 옷의 분위기",
  "부담을 덜어",
  "더운 날도 가볍게",
  "손등까지 가볍게",
];

const DEFAULT_JARGON_REPLACEMENTS = [
  {
    phrase: "손등 커프",
    replacement: "손등·손등 덮임·손등 부분",
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function visibleTextFromHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&middot;|&#183;/gi, "·")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateCopyTerminology({
  html,
  brand = "",
  bannedPhrases = DEFAULT_BANNED_PHRASES,
  jargonReplacements = DEFAULT_JARGON_REPLACEMENTS,
}) {
  const text = visibleTextFromHtml(html);
  const errors = [];

  for (const phrase of bannedPhrases) {
    if (text.includes(phrase)) {
      errors.push(`검증 기준 없는 분위기 문구: ${phrase}`);
    }
  }

  for (const item of jargonReplacements) {
    if (text.includes(item.phrase)) {
      errors.push(
        `고객에게 낯선 부품어를 쉬운 표현으로 교체: ${item.phrase} → ${item.replacement}`,
      );
    }
  }

  if (brand) {
    const escapedBrand = escapeRegExp(brand);
    const brandAsSentenceSubject = new RegExp(
      `${escapedBrand}(?:은|는|이|가|처럼|으로)\\s`,
    );
    const brandAsPoeticEnding = new RegExp(`${escapedBrand}[.!?]`);
    if (brandAsSentenceSubject.test(text) || brandAsPoeticEnding.test(text)) {
      errors.push(`브랜드명은 제품·제조사 식별자로만 사용: ${brand}`);
    }
  }

  if (
    text.includes("루즈핏") &&
    !/(?:달라붙지 않는|밀착[^.]{0,30}|세로 플리츠[^.]{0,30}|여유[^.]{0,30})루즈핏|루즈핏[^.]{0,50}(?:세로 플리츠|여유|밀착|구조)/.test(
      text,
    )
  ) {
    errors.push("루즈핏을 구조·밀착 정도·플리츠 형태와 함께 정의해야 함");
  }

  return { ok: errors.length === 0, errors, text };
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith("--")) continue;
    values[args[index].slice(2)] = args[index + 1];
    index += 1;
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error("--file <html-path>가 필요합니다.");
  }
  const html = await readFile(args.file, "utf8");
  const result = validateCopyTerminology({ html, brand: args.brand || "" });
  process.stdout.write(
    `${JSON.stringify(
      {
        file: args.file,
        brand: args.brand || "",
        ok: result.ok,
        errors: result.errors,
      },
      null,
      2,
    )}\n`,
  );
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
