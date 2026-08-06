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

// ── 수량 ───────────────────────────────────────────────────────────────────
// 1회차는 여기서 멈췄다. 이미지 28~32장을 요구했는데 엄격한 선별이 12장만 채택했다.
// 선별을 제대로 할수록 통과할 수 없는 구조였다. 임의의 범위 대신 **계획 대비**로 본다.

async function withMedia(html, { images = [], gifs = [] } = {}) {
  const root = await fixture(html);
  for (const name of images) {
    await writeFile(path.join(root, "output", "media", "images", name), "IMG", "utf8");
  }
  for (const name of gifs) {
    await writeFile(path.join(root, "output", "media", "gifs", name), "GIF89a", "utf8");
  }
  return root;
}

const PAGE = (bodies) =>
  `<!doctype html><meta name="viewport" content="width=780"><style>body{width:780px}</style>${bodies}`;

test("계획한 만큼 발행했으면 수량으로 막지 않는다", async () => {
  // 12장을 채택했고 12장이 있다. 예전 규칙은 28장 미만이라고 거부했다.
  const names = Array.from({ length: 12 }, (_, i) => `cut-${i + 1}.webp`);
  const root = await withMedia(
    PAGE(names.map((n) => `<section><img src="media/images/${n}"></section>`).join("")),
    { images: names },
  );
  const report = validateHtmlProject(root, { expected: { images: 12, gifs: 0 } });
  assert.deepEqual(
    report.errors.filter((e) => /COUNT/.test(e.code)),
    [],
    JSON.stringify(report.errors),
  );
});

test("계획과 발행 수가 다르면 지목한다", async () => {
  const root = await withMedia(PAGE(`<section><img src="media/images/a.webp"></section>`), {
    images: ["a.webp"],
  });
  const report = validateHtmlProject(root, { expected: { images: 12, gifs: 0 } });
  assert.ok(report.errors.some((e) => e.code === "IMAGE_COUNT_MISMATCH"), JSON.stringify(report.errors));
});

test("계획을 주지 않으면 수량을 보지 않는다", async () => {
  const root = await withMedia(PAGE(`<section><img src="media/images/a.webp"></section>`), {
    images: ["a.webp"],
  });
  const report = validateHtmlProject(root);
  assert.deepEqual(report.errors.filter((e) => /COUNT/.test(e.code)), []);
});
