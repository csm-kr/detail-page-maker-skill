import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createProject,
  defaultProjectsRoot,
} from "../../skills/detail-page-maker-skill/scripts/new-project.mjs";
import {
  listProjects,
  validateProjectIsolation,
} from "../../skills/detail-page-maker-skill/scripts/project-manager.mjs";

test("workspace 설정은 저장소 로컬 projects 루트를 선택한다", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-workspace-"),
  );
  try {
    const nested = path.join(workspace, "skills", "detail-page-maker-skill");
    await mkdir(path.join(workspace, "config"), { recursive: true });
    await writeFile(
      path.join(workspace, "config", "workspace.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        projectsRoot: "projects",
        projectIsolation: "self-contained",
      })}\n`,
      "utf8",
    );
    await mkdir(nested, { recursive: true });
    assert.equal(
      defaultProjectsRoot({ startDirectory: nested, environment: {} }),
      path.join(workspace, "projects"),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("새 프로젝트는 목록에 나타나고 외부 파일 의존성이 없다", async () => {
  const projectsRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-projects-"),
  );
  try {
    const created = await createProject({
      name: "격리 프로젝트",
      supplierUrl: "https://supplier.example/item/123456",
      root: projectsRoot,
    });
    const projects = await listProjects(projectsRoot);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].isolation, "self-contained");

    const report = await validateProjectIsolation(created.projectRoot);
    assert.equal(report.ok, true);

    await writeFile(
      path.join(created.projectRoot, "research", "bad-path.json"),
      '{"source":"../../../shared/file.json"}\n',
      "utf8",
    );
    const invalid = await validateProjectIsolation(created.projectRoot);
    assert.equal(invalid.ok, false);
    assert.equal(
      invalid.issues.some((issue) => issue.reason === "PATH_ESCAPES_PROJECT"),
      true,
    );

    await writeFile(
      path.join(created.projectRoot, "research", "legacy-root.json"),
      '{"bundle":".artifacts/capture","otherProject":"projects/other"}\n',
      "utf8",
    );
    const legacyRoot = await validateProjectIsolation(created.projectRoot);
    assert.equal(legacyRoot.ok, false);
    assert.equal(
      legacyRoot.issues.filter(
        (issue) => issue.reason === "LEGACY_SHARED_ROOT_REFERENCE",
      ).length,
      2,
    );
  } finally {
    await rm(projectsRoot, { recursive: true, force: true });
  }
});

test("저장소는 prototypes 또는 공유 videos 루트를 사용하지 않는다", async () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "../..");
  await assert.rejects(access(path.join(repositoryRoot, "prototypes")));
  await assert.rejects(access(path.join(repositoryRoot, "videos")));
  await access(path.join(repositoryRoot, "projects", "README.md"));
});
