import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  adoptProject,
  createProject,
} from "../../skills/detail-page-maker-skill/scripts/lib/new-project.mjs";

const INITIAL_DIRECTORIES = [
  "input/product",
  ".detail-page/authoring",
  "output",
];
const LAZY_OR_SHARED_DIRECTORIES = [
  "output/media",
  "output/wing",
  ".detail-page/backups",
  ".detail-page/evidence",
  ".detail-page/research",
  ".detail-page/generation",
  ".detail-page/workflow",
  ".detail-page/qa",
  ".detail-page/studio",
];

test("새 프로젝트는 최소 폴더만 만들고 단계별 Asset·Studio runtime은 지연한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-v1-folders-"),
  );
  try {
    const created = await createProject({
      name: "노바페이스 발편한 기능성깔창",
      supplierUrl: "https://domeggook.com/60851997",
      root: temporaryRoot,
    });

    await Promise.all(
      INITIAL_DIRECTORIES.map((directory) =>
        access(path.join(created.projectRoot, directory)),
      ),
    );
    await Promise.all(
      LAZY_OR_SHARED_DIRECTORIES.map((directory) =>
        assert.rejects(
          access(path.join(created.projectRoot, directory)),
        ),
      ),
    );
    const state = JSON.parse(
      await readFile(path.join(created.projectRoot, "project.json"), "utf8"),
    );
    assert.equal(state.workspace.isolation, "self-contained");
    assert.equal(state.workspace.externalFileDependencies, false);
    await access(path.join(created.projectRoot, "output/detail-page.html"));
    await access(
      path.join(
        created.projectRoot,
        ".detail-page/authoring/detail-page.html",
      ),
    );
    await assert.rejects(access(path.join(created.projectRoot, "deliverables")));
    await assert.rejects(access(path.join(created.projectRoot, "index.html")));
    await assert.rejects(access(path.join(created.projectRoot, "html/index.html")));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("legacy adopt는 index.html을 입력 locator로만 읽고 신규 output projection을 만든다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-v1-adopt-"),
  );
  const projectRoot = path.join(temporaryRoot, "legacy-product");
  try {
    await mkdir(path.join(projectRoot, "detail-page"), {
      recursive: true,
    });
    await writeFile(
      path.join(projectRoot, "detail-page", "index.html"),
      "<!doctype html><html><body><main id=\"detailPage\"><section data-claim-id=\"legacy\"><h1>기존 상세페이지</h1></section></main></body></html>",
      "utf8",
    );
    await adoptProject({
      projectRoot,
      name: "기존 상품",
      supplierUrl: "https://supplier.example/123456",
    });
    const state = JSON.parse(
      await readFile(path.join(projectRoot, "project.json"), "utf8"),
    );
    assert.equal(
      state.html.entry,
      "output/detail-page.html",
    );
    assert.equal(
      state.html.internalEditableRevision,
      ".detail-page/authoring/detail-page.html",
    );
    assert.equal(
      state.html.importedLegacyEntry,
      "detail-page/index.html",
    );
    assert.match(
      await readFile(path.join(projectRoot, "output/detail-page.html"), "utf8"),
      /기존 상세페이지/,
    );
    assert.doesNotMatch(
      await readFile(path.join(projectRoot, "output/detail-page.html"), "utf8"),
      /data-claim-id/,
    );
    await assert.rejects(access(path.join(projectRoot, ".studio")));
    await assert.rejects(access(path.join(projectRoot, "planning")));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
