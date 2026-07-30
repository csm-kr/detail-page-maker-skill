import assert from "node:assert/strict";
import {
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createFileStateStore,
  createFileSecureKeyStore,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/file-state-store.mjs";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function statePayloadSha256(state) {
  const payload = structuredClone(state);
  delete payload._state_seal;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

function migrationReceipt(
  store,
  projectId,
  state,
  sourceStateKind,
  suffix,
) {
  return {
    receipt_type: "state-hmac-migration.v1",
    receipt_id: `migration-${suffix}`,
    project_id: projectId,
    project_identity: store.projectIdentity(projectId),
    source_state_kind: sourceStateKind,
    source_payload_sha256: statePayloadSha256(state),
    decision: "approved",
    authorized_by: "test-security-migration",
    one_time_nonce: `nonce-${suffix}-0123456789`,
    created_at: "2026-07-30T15:00:00.000Z",
  };
}

test("상태는 원자적으로 저장되고 새 store 인스턴스에서 재개된다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = createFileStateStore(root);
  await first.save("project-56328525", {
    version: 1,
    project_id: "project-56328525",
    current_stage: "G0_QA",
  });

  const second = createFileStateStore(root);
  const loaded = await second.load("project-56328525");
  const { _state_seal: stateSeal, ...payload } = loaded;
  assert.deepEqual(payload, {
    version: 1,
    project_id: "project-56328525",
    current_stage: "G0_QA",
  });
  assert.equal(stateSeal.status, "verified");
  const raw = await readFile(
    path.join(root, ".detail-page", "workflow", "project-56328525.json"),
    "utf8",
  );
  assert.equal(JSON.parse(raw).current_stage, "G0_QA");
});

test("save는 프로젝트 밖 secure key store로 deterministic HMAC-SHA256 seal을 기록한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-state-"));
  const secureRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-secure-key-"),
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(secureRoot, { recursive: true, force: true });
  });
  const secureKeyStore = createFileSecureKeyStore(secureRoot);
  const store = createFileStateStore(root, { secureKeyStore });

  await store.save("project-56328525", {
    version: 1,
    project_id: "project-56328525",
    current_stage: "G0_QA",
  });

  const raw = JSON.parse(
    await readFile(
      path.join(
        root,
        ".detail-page",
        "workflow",
        "project-56328525.json",
      ),
      "utf8",
    ),
  );
  assert.equal(raw._state_seal.schema_version, 2);
  assert.equal(raw._state_seal.algorithm, "hmac-sha256");
  assert.match(
    raw._state_seal.payload_hmac_sha256,
    /^[a-f0-9]{64}$/,
  );
  const secureRecord = JSON.parse(
    await readFile(
      path.join(
        secureRoot,
        `${store.projectIdentity("project-56328525")}.json`,
      ),
      "utf8",
    ),
  );
  const key = Buffer.from(secureRecord.key_base64, "base64");
  assert.equal(key.length, 32);
  await assert.rejects(
    readFile(
      path.join(
        root,
        ".detail-page",
        "workflow",
        ".state-hmac-key",
      ),
    ),
    (error) => error.code === "ENOENT",
  );
  assert.equal(JSON.stringify(raw).includes(key.toString("hex")), false);
  assert.equal(
    (await store.load("project-56328525"))._state_seal.status,
    "verified",
  );
  const loaded = await store.load("project-56328525");
  await store.save("project-56328525", loaded);
  const resaved = JSON.parse(
    await readFile(
      path.join(
        root,
        ".detail-page",
        "workflow",
        "project-56328525.json",
      ),
      "utf8",
    ),
  );
  assert.equal(
    resaved._state_seal.payload_hmac_sha256,
    raw._state_seal.payload_hmac_sha256,
  );
});

test("sealed state를 JSON으로 직접 수정하면 load가 무결성 오류로 거부한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createFileStateStore(root);
  const target = await store.save("project-56328525", {
    version: 1,
    project_id: "project-56328525",
    stages: { G5U_APPROVAL: { status: "pending" } },
  });
  const raw = JSON.parse(await readFile(target, "utf8"));
  raw.stages.G5U_APPROVAL.status = "approved";
  await writeFile(target, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  await assert.rejects(
    store.load("project-56328525"),
    (error) => error.code === "STATE_INTEGRITY_MISMATCH",
  );
});

test("legacy unsealed state는 읽을 수 있지만 명시적 one-time receipt 없이는 migration되지 않는다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateDirectory = path.join(root, ".detail-page", "workflow");
  const target = path.join(stateDirectory, "project-legacy.json");
  await mkdir(stateDirectory, { recursive: true });
  await writeFile(
    target,
    `${JSON.stringify({
      version: 1,
      project_id: "project-legacy",
      stages: { G5U_APPROVAL: { status: "approved" } },
    }, null, 2)}\n`,
    "utf8",
  );
  const store = createFileStateStore(root);

  const legacy = await store.load("project-legacy");
  assert.equal(legacy._state_seal.status, "legacy_unsealed");
  assert.equal(legacy._state_seal.payload_sha256, null);

  await assert.rejects(
    store.save("project-legacy", legacy),
    (error) => error.code === "LEGACY_MIGRATION_REQUIRED",
  );
  const migratedReceipt = migrationReceipt(
    store,
    "project-legacy",
    legacy,
    "legacy_unsealed",
    "legacy-unsealed",
  );
  const migration = await store.migrateLegacy(
    "project-legacy",
    migratedReceipt,
  );
  assert.equal(migration.status, "migrated");
  await assert.rejects(
    store.migrateLegacy("project-legacy", {
      ...migratedReceipt,
      receipt_id: "migration-replay",
      one_time_nonce: "nonce-replay-0123456789",
    }),
    (error) => error.code === "STATE_HMAC_ALREADY_ACTIVE",
  );
  const sealed = await store.load("project-legacy");
  assert.equal(sealed._state_seal.status, "verified");
  assert.equal(sealed._state_seal.algorithm, "hmac-sha256");
  assert.match(
    sealed._state_seal.payload_hmac_sha256,
    /^[a-f0-9]{64}$/,
  );
});

test("기존 SHA seal은 exact source receipt로만 secure HMAC migration한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateDirectory = path.join(root, ".detail-page", "workflow");
  const target = path.join(stateDirectory, "project-sha.json");
  await mkdir(stateDirectory, { recursive: true });
  const payload = {
    current_stage: "G1",
    project_id: "project-sha",
    version: 1,
  };
  const payloadSha256 = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  await writeFile(
    target,
    `${JSON.stringify({
      ...payload,
      _state_seal: {
        schema_version: 1,
        algorithm: "sha256",
        payload_sha256: payloadSha256,
      },
    }, null, 2)}\n`,
    "utf8",
  );
  const store = createFileStateStore(root);
  const legacy = await store.load("project-sha");
  assert.equal(legacy._state_seal.status, "legacy_sha256");
  await assert.rejects(
    store.save("project-sha", legacy),
    (error) => error.code === "LEGACY_MIGRATION_REQUIRED",
  );
  await store.migrateLegacy(
    "project-sha",
    migrationReceipt(
      store,
      "project-sha",
      legacy,
      "legacy_sha256",
      "legacy-sha256",
    ),
  );
  const migrated = await store.load("project-sha");
  assert.equal(migrated._state_seal.status, "verified");
  assert.equal(migrated._state_seal.algorithm, "hmac-sha256");
});

test("기존 project-local HMAC은 명시 receipt로 검증한 뒤 외부 secure store로 한 번만 이동한다", async (t) => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-local-hmac-migration-"),
  );
  const root = path.join(sandbox, "project");
  const secureRoot = path.join(sandbox, "secure");
  const stateDirectory = path.join(
    root,
    ".detail-page",
    "workflow",
  );
  await mkdir(stateDirectory, { recursive: true });
  t.after(() =>
    rm(sandbox, { recursive: true, force: true }),
  );
  const projectId = "project-local-hmac";
  const payload = {
    version: 1,
    project_id: projectId,
    current_stage: "G2",
  };
  const localKey = randomBytes(32);
  const payloadHmac = createHmac("sha256", localKey)
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
  await writeFile(
    path.join(stateDirectory, `${projectId}.json`),
    `${JSON.stringify({
      ...payload,
      _state_seal: {
        schema_version: 2,
        algorithm: "hmac-sha256",
        payload_hmac_sha256: payloadHmac,
      },
    }, null, 2)}\n`,
    "utf8",
  );
  const localKeyPath = path.join(
    stateDirectory,
    ".state-hmac-key",
  );
  await writeFile(localKeyPath, localKey);
  const store = createFileStateStore(root, {
    secureKeyStore: createFileSecureKeyStore(secureRoot),
  });

  await assert.rejects(
    store.load(projectId),
    (error) =>
      error.code === "LEGACY_HMAC_MIGRATION_REQUIRED",
  );
  const sourceState = {
    ...payload,
    _state_seal: {
      status: "verified",
    },
  };
  await store.migrateLegacy(
    projectId,
    migrationReceipt(
      store,
      projectId,
      sourceState,
      "project_local_hmac",
      "project-local-hmac",
    ),
  );
  const migrated = await store.load(projectId);
  assert.equal(migrated._state_seal.status, "verified");
  assert.equal(migrated.current_stage, "G2");
  await assert.rejects(
    readFile(localKeyPath),
    (error) => error.code === "ENOENT",
  );
});

test("HMAC state를 payload와 plain SHA seal까지 함께 위조해도 downgrade로 거부한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createFileStateStore(root);
  const target = await store.save("project-forged", {
    version: 1,
    project_id: "project-forged",
    stages: { G5U_APPROVAL: { status: "pending" } },
  });
  const forged = JSON.parse(await readFile(target, "utf8"));
  forged.stages.G5U_APPROVAL.status = "approved";
  const { _state_seal: ignored, ...forgedPayload } = forged;
  forged._state_seal = {
    schema_version: 1,
    algorithm: "sha256",
    payload_sha256: createHash("sha256")
      .update(JSON.stringify(forgedPayload))
      .digest("hex"),
  };
  await writeFile(
    target,
    `${JSON.stringify(forged, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    store.load("project-forged"),
    (error) => error.code === "STATE_SEAL_DOWNGRADE_FORBIDDEN",
  );
});

test("project key와 seal을 함께 삭제하고 payload를 변조해도 load와 save가 모두 fail-closed한다", async (t) => {
  const sandbox = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-state-downgrade-"),
  );
  const root = path.join(sandbox, "project");
  const secureRoot = path.join(sandbox, "secure-user-store");
  await mkdir(root, { recursive: true });
  t.after(() =>
    rm(sandbox, { recursive: true, force: true }),
  );
  const secureKeyStore = createFileSecureKeyStore(secureRoot);
  const store = createFileStateStore(root, { secureKeyStore });
  const target = await store.save("project-key-seal-delete", {
    version: 1,
    project_id: "project-key-seal-delete",
    stages: { G5U_APPROVAL: { status: "pending" } },
  });
  const secureRecordPath = path.join(
    secureRoot,
    `${store.projectIdentity("project-key-seal-delete")}.json`,
  );
  const secureRecordBefore = await readFile(
    secureRecordPath,
    "utf8",
  );
  const forged = JSON.parse(await readFile(target, "utf8"));
  delete forged._state_seal;
  forged.stages.G5U_APPROVAL.status = "approved";
  await rm(
    path.join(
      root,
      ".detail-page",
      "workflow",
      ".state-hmac-key",
    ),
    { force: true },
  );
  await writeFile(
    target,
    `${JSON.stringify(forged, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    store.load("project-key-seal-delete"),
    (error) =>
      error.code === "STATE_SEAL_DOWNGRADE_FORBIDDEN",
  );
  await assert.rejects(
    store.save("project-key-seal-delete", forged),
    (error) =>
      error.code === "STATE_SEAL_DOWNGRADE_FORBIDDEN",
  );
  assert.equal(
    await readFile(secureRecordPath, "utf8"),
    secureRecordBefore,
  );
});

test("같은 state를 두 번 load한 뒤 stale writer가 저장하면 CAS가 거부한다", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createFileStateStore(root);
  await store.save("project-cas", {
    version: 1,
    project_id: "project-cas",
    value: 0,
  });
  const first = await store.load("project-cas");
  const stale = await store.load("project-cas");
  first.value = 1;
  stale.value = 2;
  await store.save("project-cas", first);
  await assert.rejects(
    store.save("project-cas", stale),
    (error) => error.code === "STATE_CAS_MISMATCH",
  );
  assert.equal((await store.load("project-cas")).value, 1);
});

test("project id 경로 탈출을 거부한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-page-state-"));
  const store = createFileStateStore(root);
  try {
    await assert.rejects(
      store.save("../outside", { version: 1 }),
      (error) => error.code === "INVALID_PROJECT_ID",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
