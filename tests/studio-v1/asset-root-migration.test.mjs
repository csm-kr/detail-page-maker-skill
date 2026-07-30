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
  migrate,
} from "../../skills/detail-page-maker-skill/scripts/maintenance/migrate-legacy-asset-root.mjs";
import { validateProjectIsolation } from "../../skills/detail-page-maker-skill/scripts/lib/project-manager.mjs";

async function write(root, relativePath, body) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function createLegacyProject() {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-asset-root-migration-"),
  );
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
  await write(
    projectRoot,
    "assets/commercial/current.png",
    Buffer.from("current"),
  );
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
  return projectRoot;
}

function approvalFor(preview, decidedBy = "user:test-owner") {
  return {
    preview_digest: preview.preview_digest,
    nonce: preview.nonce,
    approved: true,
    decided_by: decidedBy,
  };
}

test("dry-run 승인 영수증으로 copy·검증 후 legacy root를 복구 archive로 보존한다", async () => {
  const projectRoot = await createLegacyProject();
  try {
    const preview = await migrate({ project: projectRoot, apply: false });
    assert.equal(preview.fileCount, 14);
    assert.equal(preview.pageAssetCount, 2);
    assert.match(preview.preview_digest, /^[a-f0-9]{64}$/);
    assert.match(preview.nonce, /^[a-f0-9]{48}$/);
    assert.equal(preview.files.length, 14);
    assert.deepEqual(
      Object.keys(preview.files[0]),
      ["source", "target", "bytes", "sha256"],
    );
    await access(path.join(projectRoot, preview.challenge_receipt));
    const repeatedPreview = await migrate({ project: projectRoot, apply: false });
    assert.equal(repeatedPreview.preview_digest, preview.preview_digest);
    assert.notEqual(repeatedPreview.nonce, preview.nonce);

    const approval = approvalFor(preview);
    const result = await migrate({
      project: projectRoot,
      apply: true,
      approval,
    });
    assert.equal(result.legacyRootArchived, true);
    assert.equal(result.legacyRootDeleted, false);
    assert.equal(await exists(path.join(projectRoot, "assets")), false);
    await access(
      path.join(
        projectRoot,
        ".migration-archive",
        preview.preview_digest,
        "assets/commercial/current.png",
      ),
    );
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
    assert.equal(project.modelSsot.approvedBy, approval.decided_by);
    assert.equal(
      project.modelSsot.path,
      "asset/ssot/authoritative/Flux2-Klein_00355_.png",
    );
    assert.equal(
      project.assets.HERO.path,
      "asset/generated/approved/image/current.png",
    );
    assert.equal(
      project.assets.MOTION.path,
      "asset/generated/approved/gif/live.gif",
    );

    const migration = JSON.parse(
      await readFile(
        path.join(projectRoot, "asset/manifests/legacy-root-migration.json"),
        "utf8",
      ),
    );
    assert.equal(migration.preview_digest, preview.preview_digest);
    assert.equal(migration.approval_receipt.decided_by, approval.decided_by);
    assert.equal(migration.approval_receipt.approved, true);
    const current = migration.files.find(
      (item) => item.source === "assets/commercial/current.png",
    );
    assert.equal(current.sourceSha256, current.copiedTargetSha256);
    assert.equal(current.sourceBytes, current.targetBytes);

    const rollback = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          ".migration-archive",
          preview.preview_digest,
          "rollback-manifest.json",
        ),
        "utf8",
      ),
    );
    assert.equal(rollback.status, "completed");
    assert.equal(rollback.preview_digest, preview.preview_digest);
    assert.equal(rollback.archive_root, "assets");
    assert.equal(rollback.files.length, 14);
    assert.equal(
      rollback.files.find(
        (item) => item.source === "assets/commercial/current.png",
      ).archiveSha256,
      current.sourceSha256,
    );
    assert.ok(rollback.restore.live_files.length >= 2);

    const ledger = await readFile(
      path.join(projectRoot, "asset/approval-ledger.ndjson"),
      "utf8",
    );
    assert.doesNotMatch(ledger, /confirmedByUser/);
    for (const line of ledger.trim().split("\n")) {
      const record = JSON.parse(line);
      assert.equal(record.approval_receipt.preview_digest, preview.preview_digest);
      assert.equal(record.approval_receipt.nonce, preview.nonce);
      assert.equal(record.approval_receipt.decided_by, approval.decided_by);
      assert.match(record.approval_receipt_sha256, /^[a-f0-9]{64}$/);
    }

    const validation = await validateProjectIsolation(projectRoot);
    if (!validation.ok) {
      throw new Error(JSON.stringify(validation.issues));
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("preview 이후 source 입력 drift를 거부하고 원본을 유지한다", async () => {
  const projectRoot = await createLegacyProject();
  try {
    const preview = await migrate({ project: projectRoot, apply: false });
    await write(
      projectRoot,
      "assets/commercial/current.png",
      Buffer.from("changed-after-preview"),
    );

    await assert.rejects(
      migrate({
        project: projectRoot,
        apply: true,
        approval: approvalFor(preview),
      }),
      /preview_digest.*변경|입력.*변경|drift/i,
    );
    await access(path.join(projectRoot, "assets/commercial/current.png"));
    assert.equal(
      await exists(
        path.join(projectRoot, "asset/generated/approved/image/current.png"),
      ),
      false,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("잘못된 nonce와 성공한 nonce 재사용을 거부한다", async () => {
  const projectRoot = await createLegacyProject();
  try {
    const preview = await migrate({ project: projectRoot, apply: false });
    await assert.rejects(
      migrate({
        project: projectRoot,
        apply: true,
        approval: {
          ...approvalFor(preview),
          approved: false,
        },
      }),
      /approved=true|명시적 승인/i,
    );
    await assert.rejects(
      migrate({
        project: projectRoot,
        apply: true,
        approval: {
          ...approvalFor(preview),
          decided_by: "",
        },
      }),
      /decided_by/i,
    );
    await assert.rejects(
      migrate({
        project: projectRoot,
        apply: true,
        approval: {
          ...approvalFor(preview),
          nonce: "0".repeat(48),
        },
      }),
      /nonce|challenge/i,
    );
    await access(path.join(projectRoot, "assets/commercial/current.png"));

    const approval = approvalFor(preview);
    await migrate({ project: projectRoot, apply: true, approval });
    await assert.rejects(
      migrate({ project: projectRoot, apply: true, approval }),
      /nonce.*재사용|이미.*소비|consumed/i,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("archive 복구 경로가 점유되면 적용 전 차단하고 원본을 보존한다", async () => {
  const projectRoot = await createLegacyProject();
  try {
    const preview = await migrate({ project: projectRoot, apply: false });
    await write(
      projectRoot,
      `.migration-archive/${preview.preview_digest}/assets/sentinel.txt`,
      "occupied",
    );

    await assert.rejects(
      migrate({
        project: projectRoot,
        apply: true,
        approval: approvalFor(preview),
      }),
      /archive|아카이브|점유/i,
    );
    await access(path.join(projectRoot, "assets/commercial/current.png"));
    assert.equal(
      await exists(
        path.join(projectRoot, "asset/generated/approved/image/current.png"),
      ),
      false,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
