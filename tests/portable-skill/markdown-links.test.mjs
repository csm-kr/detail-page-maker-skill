import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../skills/detail-page-maker-skill",
);

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".agents") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(target)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(target);
    }
  }
  return files;
}

test("스킬 Markdown의 내부 링크는 받은 폴더 안에서 모두 열린다", async () => {
  const missing = [];
  for (const file of await markdownFiles(SKILL_ROOT)) {
    const markdown = await readFile(file, "utf8");
    for (const match of markdown.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)) {
      const rawTarget = match[1].trim().replace(/^<|>$/g, "");
      if (
        !rawTarget ||
        rawTarget.startsWith("#") ||
        /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)
      ) {
        continue;
      }
      const relativeTarget = decodeURIComponent(rawTarget.split("#")[0]);
      const absoluteTarget = path.resolve(path.dirname(file), relativeTarget);
      try {
        await access(absoluteTarget);
      } catch {
        missing.push(
          `${path.relative(SKILL_ROOT, file)} -> ${relativeTarget}`,
        );
      }
    }
  }

  assert.deepEqual(missing, []);
});
