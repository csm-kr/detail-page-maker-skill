import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateHtmlProject } from "../lean-html-qa.mjs";

async function fixture(html) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lean-html-qa-"));
  await mkdir(path.join(root, "output", "media", "images"), { recursive: true });
  await mkdir(path.join(root, "output", "media", "gifs"), { recursive: true });
  await writeFile(path.join(root, "output", "detail-page.html"), html, "utf8");
  return root;
}

test("accepts a clean 780px public page", async () => {
  const root = await fixture(`<!doctype html><meta name="viewport" content="width=780"><style>body{width:780px}</style><h1>끼우면 바로 사용</h1>`);
  assert.equal(validateHtmlProject(root).ok, true);
});

test("rejects legacy width, internal metadata, and number-unit split", async () => {
  const root = await fixture(`<!doctype html><style>body{width:${780 / 2}px}</style><h1 data-agent="x">넉넉한 30<br>cm 수납</h1>`);
  const report = validateHtmlProject(root);
  assert.equal(report.ok, false);
  assert.deepEqual(
    new Set(report.errors.map((error) => error.code)),
    new Set(["LEGACY_WIDTH_FOUND", "WIDTH_780_NOT_DECLARED", "INTERNAL_METADATA_EXPOSED", "NUMBER_UNIT_SPLIT"]),
  );
});
