// 단계 스킬의 check.mjs 가 함께 쓰는 도구. 판정 규칙은 각 단계가 소유한다.

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function text(base, rel) {
  try {
    return await readFile(path.join(base, rel), "utf8");
  } catch {
    return null;
  }
}

export async function json(base, rel) {
  const raw = await text(base, rel);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function policy(workspace) {
  return (await json(workspace, path.join("work", "env.lock.json")))?.policy ?? {};
}

/** 문자열에서 hex 색을 뽑는다. 대문자로 모아 중복을 없앤다. */
export function hexes(value) {
  return [...new Set((value.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toUpperCase()))];
}

/** 한글 덩어리. 화면 문자열이 플랜 안에 있는지 볼 때 쓴다. */
export function koreanRuns(value, minLength = 2) {
  return [
    ...new Set(
      (value.match(/[가-힣][가-힣0-9 ·]*[가-힣]/g) ?? [])
        .map((s) => s.trim())
        .filter((s) => s.replace(/\s/g, "").length >= minLength),
    ),
  ];
}

export async function listFiles(dir, pattern = /./) {
  try {
    return (await readdir(dir)).filter((name) => pattern.test(name)).sort();
  } catch {
    return [];
  }
}

/** 디렉터리 아래 파일 크기 합계 (바이트). */
export async function bytesUnder(dir) {
  let total = 0;
  const walk = async (current) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) total += (await stat(full)).size;
    }
  };
  await walk(dir);
  return total;
}

export async function mtime(target) {
  try {
    return (await stat(target)).mtimeMs;
  } catch {
    return null;
  }
}

/** 마크다운의 `## 제목` 목록. */
export function headings(markdown, level = 2) {
  const prefix = `${"#".repeat(level)} `;
  return markdown
    .split("\n")
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim());
}

/** `## 제목` 아래의 본문. */
export function section(markdown, title, level = 2) {
  const lines = markdown.split("\n");
  const prefix = `${"#".repeat(level)} `;
  const start = lines.findIndex(
    (line) => line.startsWith(prefix) && line.slice(prefix.length).trim() === title,
  );
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("#"));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** 목록 항목에서 식별자를 뽑는다. `1. hero` `- hero` 를 받는다. */
export function listIds(block) {
  if (!block) return [];
  return block
    .split("\n")
    .map((line) => /^\s*(?:\d+\.|[-*])\s*([A-Za-z0-9_-]+)\b/.exec(line))
    .filter(Boolean)
    .map((match) => match[1]);
}

export function want(reasons, ok, message) {
  if (!ok) reasons.push(message);
  return ok;
}
