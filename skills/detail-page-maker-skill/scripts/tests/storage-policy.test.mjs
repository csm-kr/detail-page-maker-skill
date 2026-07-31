import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createProject } from "../lib/new-project.mjs";
import { validateProjectIsolation } from "../lib/project-manager.mjs";
import { listProjectBackups } from "../runtime/project-output-runtime.mjs";

test("새 프로젝트는 단계별 빈 폴더를 미리 만들지 않는다", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-storage-test-"),
  );
  try {
    const created = await createProject({
      name: "storage-test",
      supplierUrl: "https://supplier.example/item/123456",
      root,
    });
    const report = await validateProjectIsolation(
      created.projectRoot,
    );
    assert.equal(report.ok, true);
    assert.deepEqual(
      report.storagePolicy.actualTopLevelDirectories,
      [".detail-page", "input", "output"],
    );
    for (const lazyDirectory of [
      ".detail-page/backups",
      ".detail-page/evidence",
      ".detail-page/generation",
      ".detail-page/planning",
      ".detail-page/research",
      ".detail-page/qa",
      ".detail-page/studio",
      ".detail-page/workflow",
      "output/media",
      "output/wing",
    ]) {
      await assert.rejects(
        () => import("node:fs/promises").then(({ access }) =>
          access(path.join(created.projectRoot, lazyDirectory)),
        ),
      );
    }
    assert.deepEqual(
      await listProjectBackups(created.projectRoot),
      [],
    );
    await assert.rejects(
      () => import("node:fs/promises").then(({ access }) =>
        access(path.join(created.projectRoot, ".detail-page/backups")),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("계획되지 않은 프로젝트 루트 폴더를 검출한다", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-storage-rogue-"),
  );
  try {
    const created = await createProject({
      name: "storage-rogue",
      supplierUrl: "https://supplier.example/item/123456",
      root,
    });
    await mkdir(path.join(created.projectRoot, "random-assets"));
    const report = await validateProjectIsolation(
      created.projectRoot,
    );
    assert.equal(report.ok, false);
    assert.ok(
      report.issues.some(
        (issue) =>
          issue.reason === "UNPLANNED_PROJECT_ROOT_DIRECTORY" &&
          issue.file === "random-assets",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime도 새 프로젝트 최상위 폴더를 만들 수 없다", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-storage-runtime-"),
  );
  try {
    const created = await createProject({
      name: "storage-runtime",
      supplierUrl: "https://supplier.example/item/123456",
      root,
    });
    await Promise.all(
      ["hyperframes", "orchestration", "studio"].map((name) =>
        mkdir(path.join(created.projectRoot, name)),
      ),
    );
    const report = await validateProjectIsolation(
      created.projectRoot,
    );
    assert.equal(report.ok, false);
    assert.deepEqual(
      report.issues
        .filter(
          (issue) =>
            issue.reason ===
            "UNPLANNED_PROJECT_ROOT_DIRECTORY",
        )
        .map((issue) => issue.file)
        .sort(),
      ["hyperframes", "orchestration", "studio"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
