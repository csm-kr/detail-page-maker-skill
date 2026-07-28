import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const htmlPath = path.join(projectRoot, "html", "index.html");
const source = await readFile(htmlPath, "utf8");
const normalized = source
  .replace(/^<!doctype html>/i, "<!DOCTYPE html>")
  .replace(
    /<(meta|link|br|img)(\b[^<>]*?)\s*\/>/gi,
    (_match, tagName, attributes) => `<${tagName}${attributes}>`,
  );

if (normalized === source) {
  console.log("HTML5 표기가 이미 정규화되어 있습니다.");
} else {
  await writeFile(htmlPath, normalized, "utf8");
  console.log("DOCTYPE과 HTML5 void element 표기를 정규화했습니다.");
}
