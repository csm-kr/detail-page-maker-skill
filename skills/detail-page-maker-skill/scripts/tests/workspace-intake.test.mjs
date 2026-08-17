import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  intakeWorkspaceInputs,
  listWorkspaceIntakeCandidates,
} from "../lib/workspace-intake.mjs";

const SKILL_FOLDER = "detail-page-maker-skill";

/** 최소 ZIP(deflate) 작성기 — 테스트 픽스처용. */
function buildZip(members) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of members) {
    const nameBuffer = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const localBuffer = Buffer.concat(locals);
  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(localBuffer.length, 16);
  return Buffer.concat([localBuffer, centralBuffer, eocd]);
}

async function workspaceFixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "detail-page-intake-"));
  const skillRoot = path.join(workspace, ".agents", "skills", SKILL_FOLDER);
  const projectRoot = path.join(workspace, "projects", "sample-123456");
  await mkdir(path.join(skillRoot, "scripts"), { recursive: true });
  await mkdir(path.join(projectRoot, "input", "product"), { recursive: true });
  return { workspace, skillRoot, projectRoot };
}

test("워크스페이스 루트의 이미지와 압축본만 후보로 잡는다", async () => {
  const { workspace, skillRoot } = await workspaceFixture();
  try {
    await writeFile(path.join(workspace, "photo-a.jpg"), Buffer.from("a"));
    await writeFile(path.join(workspace, "shots.zip"), Buffer.from("z"));
    await writeFile(path.join(workspace, "skills-lock.json"), "{}");
    await writeFile(path.join(workspace, "notes.md"), "#");
    await writeFile(path.join(workspace, ".hidden.png"), Buffer.from("h"));
    const candidates = await listWorkspaceIntakeCandidates({
      workspaceRoot: workspace,
    });
    assert.deepEqual(
      candidates.map((item) => `${item.name}:${item.kind}`),
      ["photo-a.jpg:image", "shots.zip:archive"],
    );
    assert.ok(skillRoot);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("이미지는 input/product로, 압축본은 풀고 input/source로 옮긴다", async () => {
  const { workspace, skillRoot, projectRoot } = await workspaceFixture();
  try {
    await writeFile(path.join(workspace, "loose.png"), Buffer.from("loose-photo"));
    await writeFile(
      path.join(workspace, "shots.zip"),
      buildZip([
        ["inner-1.jpg", Buffer.from("inner-one")],
        ["nested/inner-2.jpg", Buffer.from("inner-two")],
        ["readme.txt", Buffer.from("ignore me")],
      ]),
    );

    const report = await intakeWorkspaceInputs({ projectRoot, skillRoot });

    assert.equal(report.moved_photos.length, 1);
    assert.equal(report.extracted_photos.length, 2);
    assert.equal(report.moved_archives.length, 1);
    assert.deepEqual(report.failures, []);
    assert.deepEqual(report.workspace_root_remaining, []);

    const product = await readdir(path.join(projectRoot, "input", "product"));
    assert.deepEqual(product.sort(), ["inner-1.jpg", "inner-2.jpg", "loose.png"]);
    const source = await readdir(path.join(projectRoot, "input", "source"));
    assert.deepEqual(source, ["shots.zip"]);
    assert.equal(
      await readFile(path.join(projectRoot, "input", "product", "inner-2.jpg"), "utf8"),
      "inner-two",
    );
    // txt 멤버는 풀지 않는다.
    assert.ok(!product.includes("readme.txt"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("같은 bytes는 다시 풀지 않고 원본은 보존한다", async () => {
  const { workspace, skillRoot, projectRoot } = await workspaceFixture();
  try {
    await writeFile(
      path.join(projectRoot, "input", "product", "already.jpg"),
      Buffer.from("same-bytes"),
    );
    await writeFile(path.join(workspace, "copy.jpg"), Buffer.from("same-bytes"));
    await writeFile(
      path.join(workspace, "shots.zip"),
      buildZip([["already.jpg", Buffer.from("same-bytes")]]),
    );

    const report = await intakeWorkspaceInputs({ projectRoot, skillRoot });

    assert.equal(report.moved_photos.length, 0);
    assert.equal(report.extracted_photos.length, 0);
    assert.equal(report.duplicates_preserved.length, 2);
    const product = await readdir(path.join(projectRoot, "input", "product"));
    assert.deepEqual(product, ["already.jpg"]);
    const source = await readdir(path.join(projectRoot, "input", "source"));
    assert.deepEqual(source.sort(), ["copy.jpg", "shots.zip"]);
    assert.deepEqual(report.workspace_root_remaining, []);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("dry-run은 보고만 하고 파일을 옮기지 않는다", async () => {
  const { workspace, skillRoot, projectRoot } = await workspaceFixture();
  try {
    await writeFile(path.join(workspace, "loose.jpg"), Buffer.from("keep"));
    const report = await intakeWorkspaceInputs({
      projectRoot,
      skillRoot,
      dryRun: true,
    });
    assert.equal(report.dry_run, true);
    assert.equal(report.moved_photos.length, 1);
    assert.deepEqual(report.workspace_root_remaining, ["loose.jpg"]);
    assert.deepEqual(
      await readdir(path.join(projectRoot, "input", "product")),
      [],
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("projects 밖 경로는 intake 대상이 될 수 없다", async () => {
  const { workspace, skillRoot } = await workspaceFixture();
  try {
    await assert.rejects(
      () => intakeWorkspaceInputs({ projectRoot: workspace, skillRoot }),
      /intake 대상은/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("--file 지정 시 해당 파일만 흡수한다", async () => {
  const { workspace, skillRoot, projectRoot } = await workspaceFixture();
  try {
    await writeFile(path.join(workspace, "take.jpg"), Buffer.from("take"));
    await writeFile(path.join(workspace, "leave.jpg"), Buffer.from("leave"));
    const report = await intakeWorkspaceInputs({
      projectRoot,
      skillRoot,
      only: ["take.jpg"],
    });
    assert.equal(report.moved_photos.length, 1);
    assert.deepEqual(report.workspace_root_remaining, ["leave.jpg"]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("ZIP64 sentinel EOCD도 읽는다", async () => {
  const { workspace, skillRoot, projectRoot } = await workspaceFixture();
  try {
    const base = buildZip([["z64.jpg", Buffer.from("zip64-bytes")]]);
    // EOCD를 sentinel로 바꾸고 ZIP64 locator/record를 붙인다.
    const eocdStart = base.length - 22;
    const head = Buffer.from(base.subarray(0, eocdStart));
    const cdOffset = base.readUInt32LE(eocdStart + 16);
    const cdSize = base.readUInt32LE(eocdStart + 12);

    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE(45, 12);
    record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(1n, 24);
    record.writeBigUInt64LE(1n, 32);
    record.writeBigUInt64LE(BigInt(cdSize), 40);
    record.writeBigUInt64LE(BigInt(cdOffset), 48);

    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(head.length), 8);
    locator.writeUInt32LE(1, 16);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0xffff, 8);
    eocd.writeUInt16LE(0xffff, 10);
    eocd.writeUInt32LE(0xffffffff, 12);
    eocd.writeUInt32LE(0xffffffff, 16);

    await writeFile(
      path.join(workspace, "z64.zip"),
      Buffer.concat([head, record, locator, eocd]),
    );
    const report = await intakeWorkspaceInputs({ projectRoot, skillRoot });
    assert.deepEqual(report.failures, []);
    assert.equal(report.extracted_photos.length, 1);
    assert.equal(
      await readFile(path.join(projectRoot, "input", "product", "z64.jpg"), "utf8"),
      "zip64-bytes",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("이미지 멤버가 없는 압축본은 옮기지 않고 실패로 남긴다", async () => {
  const { workspace, skillRoot, projectRoot } = await workspaceFixture();
  try {
    await writeFile(
      path.join(workspace, "docs.zip"),
      buildZip([["a.txt", Buffer.from("text only")]]),
    );
    const report = await intakeWorkspaceInputs({ projectRoot, skillRoot });
    assert.equal(report.moved_archives.length, 0);
    assert.equal(report.failures.length, 1);
    assert.match(report.failures[0].error, /이미지 멤버를 찾지 못했습니다/);
    assert.deepEqual(report.workspace_root_remaining, ["docs.zip"]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("대체 projects 루트를 주면 그 상위만 스캔한다", async () => {
  const outer = await mkdtemp(path.join(os.tmpdir(), "detail-page-intake-outer-"));
  const { workspace, skillRoot } = await workspaceFixture();
  try {
    // 실제 워크스페이스 루트에는 후보를 두고, 대체 루트에는 두지 않는다.
    await writeFile(path.join(workspace, "must-not-move.jpg"), Buffer.from("stay"));
    const altProjects = path.join(outer, "projects");
    const altProject = path.join(altProjects, "alt-1");
    await mkdir(path.join(altProject, "input", "product"), { recursive: true });
    await writeFile(path.join(outer, "alt.jpg"), Buffer.from("alt-photo"));

    const report = await intakeWorkspaceInputs({
      projectRoot: altProject,
      projectsRoot: altProjects,
      skillRoot,
    });

    assert.equal(report.workspace_root, outer);
    assert.equal(report.moved_photos.length, 1);
    assert.deepEqual(
      await readdir(path.join(altProject, "input", "product")),
      ["alt.jpg"],
    );
    // 실제 워크스페이스 루트의 파일은 그대로 있어야 한다.
    assert.deepEqual(await readdir(workspace), [".agents", "must-not-move.jpg", "projects"]);
  } finally {
    await rm(outer, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});
