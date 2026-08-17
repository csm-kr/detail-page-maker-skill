import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  resolveOutputLocations,
  resolveProjectsRoot,
  resolveWorkspaceRoot,
} from "../lib/output-location.mjs";
import { createProject, defaultProjectsRoot } from "../lib/new-project.mjs";
import { ensureExperienceDrop } from "../maintenance/experience-sync.mjs";
import { resolveLearningPaths } from "../maintenance/learning-status.mjs";

const SKILL_FOLDER = "detail-page-maker-skill";

async function installedWorkspace(agentDirectory) {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-outloc-"),
  );
  const skillRoot = path.join(
    workspace,
    agentDirectory,
    "skills",
    SKILL_FOLDER,
  );
  await mkdir(path.join(skillRoot, "scripts"), { recursive: true });
  return { workspace, skillRoot };
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test("워크스페이스는 설치 위치로 결정되고 cwd에 영향받지 않는다", async () => {
  for (const agentDirectory of [".agents", ".claude"]) {
    const { workspace, skillRoot } = await installedWorkspace(agentDirectory);
    try {
      const deep = path.join(workspace, "projects", "a", "output", "media");
      await mkdir(deep, { recursive: true });
      const fromRoot = resolveWorkspaceRoot({
        skillRoot,
        startDirectory: workspace,
        environment: {},
      });
      const fromDeep = resolveWorkspaceRoot({
        skillRoot,
        startDirectory: deep,
        environment: {},
      });
      const fromElsewhere = resolveWorkspaceRoot({
        skillRoot,
        startDirectory: os.tmpdir(),
        environment: {},
      });
      assert.equal(fromRoot, path.resolve(workspace));
      assert.equal(fromDeep, fromRoot, "하위 폴더에서 실행해도 같아야 한다");
      assert.equal(fromElsewhere, fromRoot, "다른 cwd에서 실행해도 같아야 한다");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
});

test("산출물 루트는 워크스페이스 안이며 홈 디렉터리로 떨어지지 않는다", async () => {
  const { workspace, skillRoot } = await installedWorkspace(".agents");
  try {
    const projectsRoot = resolveProjectsRoot({
      skillRoot,
      startDirectory: os.tmpdir(),
      environment: {},
    });
    assert.equal(projectsRoot, path.join(path.resolve(workspace), "projects"));
    assert.ok(
      !projectsRoot.startsWith(path.resolve(os.homedir(), "Documents")),
      "홈 디렉터리 fallback을 쓰면 실행마다 위치가 달라진다",
    );
    assert.equal(
      defaultProjectsRoot({ skillRoot, startDirectory: os.tmpdir(), environment: {} }),
      projectsRoot,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("스킬 폴더 안에는 어떤 산출물 경로도 잡히지 않는다", async () => {
  const { workspace, skillRoot } = await installedWorkspace(".agents");
  try {
    const created = await createProject({
      name: "outloc",
      supplierUrl: "https://supplier.example/item/424242",
      root: resolveProjectsRoot({ skillRoot, startDirectory: workspace, environment: {} }),
    });
    const locations = resolveOutputLocations({
      projectRoot: created.projectRoot,
    });
    for (const [name, target] of Object.entries(locations)) {
      assert.ok(
        !path.resolve(target).startsWith(path.resolve(skillRoot) + path.sep),
        `${name}이 스킬 폴더 안을 가리킨다: ${target}`,
      );
      assert.ok(
        path.resolve(target).startsWith(path.resolve(created.projectRoot) + path.sep),
        `${name}이 프로젝트 밖을 가리킨다: ${target}`,
      );
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("경험 drop은 워크스페이스 루트가 아니라 프로젝트 안에 만들어진다", async () => {
  const { workspace, skillRoot } = await installedWorkspace(".agents");
  try {
    const projectsRoot = resolveProjectsRoot({
      skillRoot,
      startDirectory: workspace,
      environment: {},
    });
    const created = await createProject({
      name: "outloc-drop",
      supplierUrl: "https://supplier.example/item/515151",
      root: projectsRoot,
    });
    const drop = await ensureExperienceDrop({
      projectRoot: created.projectRoot,
    });
    assert.equal(
      drop.exps_root,
      path.join(created.projectRoot, ".detail-page", "exps"),
    );
    assert.equal(await exists(path.join(drop.exps_root, "README.md")), true);
    assert.equal(
      await exists(path.join(workspace, "exps")),
      false,
      "워크스페이스 루트에 exps/가 생기면 안 된다",
    );
    assert.equal(
      await exists(path.join(workspace, ".workspace")),
      false,
      "워크스페이스 루트에 .workspace/가 생기면 안 된다",
    );
    assert.deepEqual(
      (await readdir(workspace, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, "en")),
      [".agents", "projects"],
      "워크스페이스 루트에는 설치 폴더와 projects/만 있어야 한다",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("학습 산출 경로는 전부 프로젝트 .detail-page 아래에 있다", async () => {
  const { workspace, skillRoot } = await installedWorkspace(".agents");
  try {
    const created = await createProject({
      name: "outloc-learning",
      supplierUrl: "https://supplier.example/item/626262",
      root: resolveProjectsRoot({ skillRoot, startDirectory: workspace, environment: {} }),
    });
    const paths = resolveLearningPaths({
      projectRoot: created.projectRoot,
      skillRoot,
    });
    const projectOwned = [
      "behanceInbox",
      "behanceReviewed",
      "gifInbox",
      "gifReviewed",
      "candidateReport",
      "experienceRoot",
      "experiencePromotions",
      "experienceQuarantine",
      "runReceipts",
    ];
    for (const key of projectOwned) {
      assert.ok(paths[key], `${key} 경로가 없다`);
      assert.ok(
        path.resolve(paths[key]).startsWith(
          path.join(path.resolve(created.projectRoot), ".detail-page") + path.sep,
        ),
        `${key}가 프로젝트 .detail-page 밖이다: ${paths[key]}`,
      );
    }
    // 스킬 안 reference는 읽기 대상이므로 프로젝트 밖이어도 된다.
    assert.ok(paths.commercialReference.startsWith(path.resolve(skillRoot)));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("같은 워크스페이스에서 여러 번 실행해도 같은 경로가 나온다", async () => {
  const { workspace, skillRoot } = await installedWorkspace(".agents");
  try {
    const first = resolveProjectsRoot({
      skillRoot,
      startDirectory: workspace,
      environment: {},
    });
    await mkdir(path.join(workspace, "projects"), { recursive: true });
    await writeFile(path.join(workspace, "note.txt"), "x", "utf8");
    const second = resolveProjectsRoot({
      skillRoot,
      startDirectory: path.join(workspace, "projects"),
      environment: {},
    });
    const third = resolveProjectsRoot({
      skillRoot,
      startDirectory: os.homedir(),
      environment: {},
    });
    assert.equal(second, first);
    assert.equal(third, first);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
