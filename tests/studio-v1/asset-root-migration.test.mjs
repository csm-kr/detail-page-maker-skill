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
import { migrate } from "../../skills/detail-page-maker-skill/scripts/migrate-legacy-asset-root.mjs";
import { validateProjectIsolation } from "../../skills/detail-page-maker-skill/scripts/project-manager.mjs";

async function write(root, relativePath, body) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

test("복수형 assets를 해시 보존 단일 asset 루트로 마이그레이션한다", async () => {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-asset-root-migration-"),
  );
  try {
    await write(
      projectRoot,
      "project.json",
      `${JSON.stringify({
        id: "migration-test",
        productId: "123456",
        phase: "published",
        workspace: {
          isolation: "self-contained",
          externalFileDependencies: false,
        },
        modelSsot: { status: "pending" },
      })}\n`,
    );
    await write(projectRoot, "README.md", "# test\n");
    await write(projectRoot, "planning/LEARNINGS.md", "# learnings\n");
    await write(
      projectRoot,
      "asset/asset-manifest.json",
      `${JSON.stringify({
        schemaVersion: 1,
        studioVersion: 1,
        assets: [],
      })}\n`,
    );
    await write(
      projectRoot,
      "detail-page/index.html",
      [
        '<main id="detailPage">',
        '<img src="../assets/commercial/current.png" data-asset-id="HERO">',
        '<img src="../assets/gifs/live.gif?v=1" data-asset-id="MOTION">',
        "</main>",
      ].join("\n"),
    );
    await write(
      projectRoot,
      "assets/commercial/asset-manifest.json",
      `${JSON.stringify({
        accepted: [{ file: "current.png" }],
        deprecated: [{ file: "old.png" }],
        reference_ssot: [
          "../product-ssot/source/real-product-raw/Flux2-Klein_00355_.png",
        ],
      })}\n`,
    );
    await write(projectRoot, "assets/commercial/current.png", Buffer.from("current"));
    await write(projectRoot, "assets/commercial/old.png", Buffer.from("old"));
    await write(
      projectRoot,
      "assets/gifs/gif-manifest.json",
      `${JSON.stringify({
        source_asset: "../commercial/current.png",
      })}\n`,
    );
    await write(projectRoot, "assets/gifs/README.md", "assets/gifs/live.gif\n");
    await write(projectRoot, "assets/gifs/live.gif", Buffer.from("live"));
    await write(projectRoot, "assets/gifs/old.gif", Buffer.from("old-gif"));
    await write(
      projectRoot,
      "assets/product-ssot/source/real-product-raw/Flux2-Klein_00355_.png",
      Buffer.from("authoritative"),
    );
    await write(
      projectRoot,
      "assets/product-ssot/source/real-product-raw/photo.jpg",
      Buffer.from("photo"),
    );
    await write(
      projectRoot,
      "assets/product-ssot/verified/actual-bottom-pair.webp",
      Buffer.from("verified"),
    );
    await write(
      projectRoot,
      "assets/product-ssot/cutout/actual-bottom-pair-v1.png",
      Buffer.from("cutout"),
    );
    await write(
      projectRoot,
      "assets/generated/asset-manifest.json",
      '{"legacy":true}\n',
    );
    await write(projectRoot, "assets/generated/background.png", Buffer.from("bg"));
    await write(projectRoot, "assets/posters/live.jpg", Buffer.from("poster"));

    const preview = await migrate({ project: projectRoot, apply: false });
    assert.equal(preview.fileCount, 14);
    assert.equal(preview.pageAssetCount, 2);

    const result = await migrate({ project: projectRoot, apply: true });
    assert.equal(result.legacyRootRemoved, true);
    await assert.rejects(access(path.join(projectRoot, "assets")));
    await access(
      path.join(projectRoot, "asset/generated/approved/image/current.png"),
    );
    await access(path.join(projectRoot, "asset/generated/approved/gif/live.gif"));
    await access(path.join(projectRoot, "asset/deprecated/image/old.png"));
    await access(path.join(projectRoot, "asset/deprecated/gif/old.gif"));
    await access(
      path.join(
        projectRoot,
        "asset/ssot/authoritative/Flux2-Klein_00355_.png",
      ),
    );

    const page = await readFile(
      path.join(projectRoot, "detail-page/index.html"),
      "utf8",
    );
    assert.match(page, /\.\.\/asset\/generated\/approved\/image\/current\.png/);
    assert.match(page, /\.\.\/asset\/generated\/approved\/gif\/live\.gif/);
    assert.doesNotMatch(page, /\.\.\/assets\//);

    const project = JSON.parse(
      await readFile(path.join(projectRoot, "project.json"), "utf8"),
    );
    assert.equal(project.modelSsot.status, "locked");
    assert.equal(
      project.modelSsot.path,
      "asset/ssot/authoritative/Flux2-Klein_00355_.png",
    );
    assert.equal(project.assets.HERO.path, "asset/generated/approved/image/current.png");
    assert.equal(project.assets.MOTION.path, "asset/generated/approved/gif/live.gif");

    const migration = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          "asset/manifests/legacy-root-migration.json",
        ),
        "utf8",
      ),
    );
    const current = migration.files.find(
      (item) => item.source === "assets/commercial/current.png",
    );
    assert.equal(current.sourceSha256, current.targetSha256);
    assert.equal(current.sourceBytes, current.targetBytes);

    const validation = await validateProjectIsolation(projectRoot);
    if (!validation.ok) {
      throw new Error(JSON.stringify(validation.issues));
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
