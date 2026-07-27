import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/new-project.mjs";

const REQUIRED_DIRECTORIES = [
  "asset/input",
  "asset/ssot",
  "asset/generated/pending/image",
  "asset/generated/pending/gif",
  "asset/generated/approved/image",
  "asset/generated/approved/gif",
  "asset/generated/rejected/image",
  "asset/generated/rejected/gif",
  "asset/output/page",
  "asset/output/gif",
  "asset/deprecated",
  "evidence",
  "research",
  "hyperframes/projects",
  "hyperframes/renders",
];

test("Studio v1 새 프로젝트는 승인 상태별 Asset 폴더를 만든다", async () => {
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
      REQUIRED_DIRECTORIES.map((directory) =>
        access(path.join(created.projectRoot, directory)),
      ),
    );
    const state = JSON.parse(
      await readFile(path.join(created.projectRoot, "project.json"), "utf8"),
    );
    assert.equal(state.workspace.isolation, "self-contained");
    assert.equal(state.workspace.externalFileDependencies, false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
