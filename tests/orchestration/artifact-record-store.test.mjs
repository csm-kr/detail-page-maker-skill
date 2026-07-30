import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createArtifactRecordStore,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/artifact-record-store.mjs";

const HASH = "c".repeat(64);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function materializedSubject({
  artifactId = "materialized-artifact",
  type = "media.image_approved",
  memberId = "hero.png",
  rootId = "project",
  locator = "asset/generated/approved/image/hero.png",
  bytes,
}) {
  return {
    project_id: "project",
    work_order_id: `work-${artifactId}`,
    stage_id: "G2A_IMAGE",
    input_set_digest: "1".repeat(64),
    producer_agent_session_id: "image-agent",
    artifact: {
      artifact_id: artifactId,
      type,
      manifest_sha256: "2".repeat(64),
      member_ids: [memberId],
      member_manifest: {
        schema_version: "1.0",
        policy: "materialized",
        members: [
          {
            member_id: memberId,
            root_id: rootId,
            locator,
            sha256: sha256(bytes),
            size_bytes: bytes.length,
          },
        ],
      },
    },
    execution_receipt: {
      execution_id: `execution-${artifactId}`,
      adapter_id: "fixture",
      adapter_version: "1.0.0",
      adapter_code_sha256: "3".repeat(64),
    },
  };
}

test("산출물마다 exact input·실행 receipt·실제 record 위치를 원자적으로 보존한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artifact-record-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createArtifactRecordStore(root);
  const subject = {
    project_id: "project-56328525",
    work_order_id: "work-g0a",
    stage_id: "G0A_SUPPLIER",
    input_set_digest: "a".repeat(64),
    producer_agent_session_id: "dmk-agent",
    artifact: {
      artifact_id: "supplier-56328525",
      type: "evidence.supplier_snapshot",
      manifest_sha256: HASH,
      member_ids: ["manifest.json", "thumbnail/thumbnail.png"],
      payload: { source_url: "https://domeggook.com/56328525" },
    },
    execution_receipt: {
      execution_id: "execution-work-g0a",
      adapter_id: "DmkExtractorAdapter",
      adapter_version: "1.0.0",
      adapter_code_sha256: "d".repeat(64),
    },
    commit_validation_receipt: {
      validation_id: "structural-work-g0a",
      verdict: "PASS",
    },
  };

  const first = await store.commit(subject);
  assert.match(first.record_sha256, /^[a-f0-9]{64}$/);
  assert.match(
    first.record_locator,
    /^\.detail-page\/workflow\/artifacts\//,
  );
  const record = JSON.parse(
    await readFile(path.join(root, ...first.record_locator.split("/")), "utf8"),
  );
  assert.equal(record.input_set_digest, "a".repeat(64));
  assert.equal(record.artifact.manifest_sha256, HASH);
  assert.equal(record.execution_receipt.adapter_id, "DmkExtractorAdapter");
  assert.equal(
    record.commit_validation_receipt.validation_id,
    "structural-work-g0a",
  );
  assert.deepEqual(record.artifact.member_manifest, {
    schema_version: "1.0",
    policy: "inline_or_virtual",
    members: [],
  });

  const verified = await store.verify({
    project_id: subject.project_id,
    artifact_id: subject.artifact.artifact_id,
    manifest_sha256: subject.artifact.manifest_sha256,
    record_locator: first.record_locator,
    record_sha256: first.record_sha256,
  });
  assert.equal(verified.status, "verified");
  assert.equal(verified.artifact_id, subject.artifact.artifact_id);

  const second = await store.commit(subject);
  assert.deepEqual(second, { ...first, idempotent_reuse: true });
});

test("record locator bytes 변조와 누락은 verify에서 fail-closed된다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artifact-record-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createArtifactRecordStore(root);
  const subject = {
    project_id: "project",
    work_order_id: "work",
    stage_id: "S0_INTAKE",
    input_set_digest: "1".repeat(64),
    producer_agent_session_id: "agent",
    artifact: {
      artifact_id: "artifact-one",
      type: "project.intake",
      manifest_sha256: "2".repeat(64),
      member_ids: ["intake.json"],
    },
    execution_receipt: {
      execution_id: "execution",
      adapter_id: "WorkflowOrchestratorInternalAdapter",
      adapter_version: "1.0.0",
      adapter_code_sha256: "3".repeat(64),
    },
    commit_validation_receipt: {
      validation_id: "structural-work",
      verdict: "PASS",
    },
  };
  const committed = await store.commit(subject);
  const recordPath = path.join(
    root,
    ...committed.record_locator.split("/"),
  );
  await writeFile(recordPath, "{}\n", "utf8");

  await assert.rejects(
    store.verify({
      project_id: subject.project_id,
      artifact_id: subject.artifact.artifact_id,
      manifest_sha256: subject.artifact.manifest_sha256,
      record_locator: committed.record_locator,
      record_sha256: committed.record_sha256,
    }),
    (error) => error.code === "ARTIFACT_RECORD_INTEGRITY_MISMATCH",
  );

  await rm(recordPath);
  await assert.rejects(
    store.verify({
      project_id: subject.project_id,
      artifact_id: subject.artifact.artifact_id,
      manifest_sha256: subject.artifact.manifest_sha256,
      record_locator: committed.record_locator,
      record_sha256: committed.record_sha256,
    }),
    (error) => error.code === "ARTIFACT_RECORD_MISSING",
  );
});

test("materialized member manifest를 canonical record로 고정하고 verify마다 실제 bytes를 재해시한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artifact-materialized-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const mediaPath = path.join(
    root,
    "asset",
    "generated",
    "approved",
    "image",
    "hero.png",
  );
  await mkdir(path.dirname(mediaPath), { recursive: true });
  const original = Buffer.from("verified-media-bytes");
  await writeFile(mediaPath, original);
  const store = createArtifactRecordStore(root);
  const subject = materializedSubject({ bytes: original });

  const committed = await store.commit(subject);
  assert.equal(
    committed.member_manifest.policy,
    "materialized",
  );
  const record = JSON.parse(
    await readFile(
      path.join(root, ...committed.record_locator.split("/")),
      "utf8",
    ),
  );
  assert.deepEqual(record.artifact.member_manifest.members, [
    {
      member_id: "hero.png",
      root_id: "project",
      locator: "asset/generated/approved/image/hero.png",
      sha256: sha256(original),
      size_bytes: original.length,
    },
  ]);

  await writeFile(
    path.join(root, "asset", "unrelated.txt"),
    "unrelated file may change",
    "utf8",
  );
  assert.equal(
    (
      await store.verify({
        project_id: subject.project_id,
        artifact_id: subject.artifact.artifact_id,
        manifest_sha256: subject.artifact.manifest_sha256,
        member_manifest: committed.member_manifest,
        record_locator: committed.record_locator,
        record_sha256: committed.record_sha256,
      })
    ).status,
    "verified",
  );

  await writeFile(
    mediaPath,
    Buffer.from("tampered-media-bytes"),
  );
  await assert.rejects(
    store.verify({
      project_id: subject.project_id,
      artifact_id: subject.artifact.artifact_id,
      manifest_sha256: subject.artifact.manifest_sha256,
      member_manifest: committed.member_manifest,
      record_locator: committed.record_locator,
      record_sha256: committed.record_sha256,
    }),
    (error) =>
      error.code === "MATERIALIZED_MEMBER_HASH_MISMATCH",
  );
  await rm(mediaPath);
  await assert.rejects(
    store.verify({
      project_id: subject.project_id,
      artifact_id: subject.artifact.artifact_id,
      manifest_sha256: subject.artifact.manifest_sha256,
      member_manifest: committed.member_manifest,
      record_locator: committed.record_locator,
      record_sha256: committed.record_sha256,
    }),
    (error) => error.code === "MATERIALIZED_MEMBER_MISSING",
  );
});

test("materialized commit은 누락·path traversal·허용되지 않은 root를 fail-closed한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artifact-materialized-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from("missing");
  const store = createArtifactRecordStore(root);

  await assert.rejects(
    store.commit(materializedSubject({ bytes })),
    (error) => error.code === "MATERIALIZED_MEMBER_MISSING",
  );
  const target = path.join(
    root,
    "asset",
    "generated",
    "approved",
    "image",
    "hero.png",
  );
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  const wrongHash = materializedSubject({
    artifactId: "wrong-hash",
    bytes,
  });
  wrongHash.artifact.member_manifest.members[0].sha256 =
    "f".repeat(64);
  await assert.rejects(
    store.commit(wrongHash),
    (error) =>
      error.code === "MATERIALIZED_MEMBER_HASH_MISMATCH",
  );
  const wrongSize = materializedSubject({
    artifactId: "wrong-size",
    bytes,
  });
  wrongSize.artifact.member_manifest.members[0].size_bytes += 1;
  await assert.rejects(
    store.commit(wrongSize),
    (error) =>
      error.code === "MATERIALIZED_MEMBER_SIZE_MISMATCH",
  );
  await assert.rejects(
    store.commit(
      materializedSubject({
        artifactId: "traversal",
        bytes,
        locator: "../outside.png",
      }),
    ),
    (error) =>
      error.code === "MATERIALIZED_MEMBER_LOCATOR_INVALID",
  );
  await assert.rejects(
    store.commit(
      materializedSubject({
        artifactId: "unknown-root",
        bytes,
        rootId: "external",
        locator: "outside.png",
      }),
    ),
    (error) =>
      error.code === "MATERIALIZED_MEMBER_ROOT_NOT_ALLOWED",
  );
  const bypass = materializedSubject({
    artifactId: "bypass",
    bytes,
  });
  bypass.artifact.materialized = true;
  bypass.artifact.member_manifest = {
    schema_version: "1.0",
    policy: "inline_or_virtual",
    members: [],
  };
  await assert.rejects(
    store.commit(bypass),
    (error) =>
      error.code === "MATERIALIZED_MEMBER_MANIFEST_REQUIRED",
  );
});

test("명시적 allowed root는 상대 locator만 허용하고 symlink escape를 거부한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artifact-project-"));
  const allowed = await mkdtemp(path.join(os.tmpdir(), "artifact-allowed-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "artifact-outside-"));
  t.after(() =>
    Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(allowed, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]),
  );
  const bytes = Buffer.from("allowed-root-media");
  await writeFile(path.join(allowed, "capture.png"), bytes);
  const store = createArtifactRecordStore(root, {
    allowedRoots: { capture_output: allowed },
  });
  const subject = materializedSubject({
    artifactId: "allowed-capture",
    type: "qa.render_capture_set",
    memberId: "capture.png",
    rootId: "capture_output",
    locator: "capture.png",
    bytes,
  });
  const committed = await store.commit(subject);
  assert.equal(
    (
      await store.verify({
        project_id: subject.project_id,
        artifact_id: subject.artifact.artifact_id,
        manifest_sha256: subject.artifact.manifest_sha256,
        record_locator: committed.record_locator,
        record_sha256: committed.record_sha256,
      })
    ).status,
    "verified",
  );

  await writeFile(path.join(outside, "escaped.png"), bytes);
  const linkPath = path.join(allowed, "linked-outside");
  try {
    await symlink(outside, linkPath, "junction");
  } catch (error) {
    if (error?.code === "EPERM") {
      t.diagnostic("symlink creation is not permitted on this host");
      return;
    }
    throw error;
  }
  await assert.rejects(
    store.commit(
      materializedSubject({
        artifactId: "symlink-escape",
        memberId: "escaped.png",
        rootId: "capture_output",
        locator: "linked-outside/escaped.png",
        bytes,
      }),
    ),
    (error) =>
      error.code === "MATERIALIZED_MEMBER_SYMLINK_FORBIDDEN" ||
      error.code === "MATERIALIZED_MEMBER_SYMLINK_ESCAPE",
  );
});

test("같은 artifact identity의 내용이 바뀌면 immutable conflict로 막는다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artifact-record-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createArtifactRecordStore(root);
  const base = {
    project_id: "project",
    work_order_id: "work",
    stage_id: "S0_INTAKE",
    input_set_digest: "1".repeat(64),
    producer_agent_session_id: "agent",
    artifact: {
      artifact_id: "artifact-one",
      type: "project.intake",
      manifest_sha256: "2".repeat(64),
      member_ids: ["intake.json"],
    },
    execution_receipt: {
      execution_id: "execution",
      adapter_id: "fixture",
      adapter_version: "1.0.0",
      adapter_code_sha256: "3".repeat(64),
    },
  };
  await store.commit(base);
  await assert.rejects(
    store.commit({
      ...base,
      artifact: {
        ...base.artifact,
        manifest_sha256: "4".repeat(64),
      },
    }),
    (error) => error.code === "IMMUTABLE_ARTIFACT_RECORD_CONFLICT",
  );
});
