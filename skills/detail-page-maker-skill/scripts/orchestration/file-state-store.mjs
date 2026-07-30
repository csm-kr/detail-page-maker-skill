import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveWorkflowStorage } from "./storage-paths.mjs";

const STATE_SEAL_FIELD = "_state_seal";
const STATE_SEAL_SCHEMA_VERSION = 2;
const LEGACY_SHA_SEAL_SCHEMA_VERSION = 1;
const SECURE_KEY_RECORD_SCHEMA_VERSION = 1;
const STATE_HMAC_KEY_BYTES = 32;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_LIMIT = 200;
const LOCK_RETRY_DELAY_MS = 10;
const LEGACY_LOCAL_KEY_FILENAME = ".state-hmac-key";

export class StateStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "StateStoreError";
    this.code = code;
    this.details = details;
  }
}

function assertProjectId(projectId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(projectId || ""))) {
    throw new StateStoreError(
      "INVALID_PROJECT_ID",
      "project_id에는 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.",
    );
  }
}

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

function statePayload(state) {
  const payload = JSON.parse(JSON.stringify(state));
  delete payload[STATE_SEAL_FIELD];
  return payload;
}

function canonicalBytes(payload) {
  return JSON.stringify(canonicalize(payload));
}

function payloadSha256(payload) {
  return createHash("sha256")
    .update(canonicalBytes(payload))
    .digest("hex");
}

function payloadHmacSha256(payload, key) {
  return createHmac("sha256", key)
    .update(canonicalBytes(payload))
    .digest("hex");
}

function persistedHmacSeal(payloadHmacSha256Value) {
  return {
    schema_version: STATE_SEAL_SCHEMA_VERSION,
    algorithm: "hmac-sha256",
    payload_hmac_sha256: payloadHmacSha256Value,
  };
}

function safeEqualHex(left, right) {
  if (
    !/^[a-f0-9]{64}$/.test(String(left ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(right ?? ""))
  ) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(left, "hex"),
    Buffer.from(right, "hex"),
  );
}

function secureKeyRoot() {
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || os.homedir(),
      "DetailPageMaker",
      "SecureStateKeys",
      "v1",
    );
  }
  return path.join(
    process.env.XDG_STATE_HOME ||
      path.join(os.homedir(), ".local", "state"),
    "detail-page-maker",
    "secure-state-keys",
    "v1",
  );
}

function assertProjectIdentity(projectIdentity) {
  if (!/^[a-f0-9]{64}$/.test(String(projectIdentity ?? ""))) {
    throw new StateStoreError(
      "INVALID_PROJECT_IDENTITY",
      "secure key project identity는 SHA-256이어야 합니다.",
    );
  }
}

function decodeSecureKeyRecord(raw, expectedIdentity) {
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    throw new StateStoreError(
      "SECURE_KEY_RECORD_INVALID",
      "secure key record JSON이 유효하지 않습니다.",
    );
  }
  if (
    record?.schema_version !== SECURE_KEY_RECORD_SCHEMA_VERSION ||
    record?.project_identity !== expectedIdentity ||
    !["new_state", "legacy_migration"].includes(
      record?.activation_kind,
    ) ||
    !Number.isFinite(Date.parse(record?.activated_at))
  ) {
    throw new StateStoreError(
      "SECURE_KEY_RECORD_INVALID",
      "secure key activation record 계약이 유효하지 않습니다.",
    );
  }
  const key = Buffer.from(String(record.key_base64 ?? ""), "base64");
  if (key.length !== STATE_HMAC_KEY_BYTES) {
    throw new StateStoreError(
      "SECURE_KEY_RECORD_INVALID",
      "secure state HMAC key 길이가 32바이트가 아닙니다.",
    );
  }
  return {
    ...record,
    key,
  };
}

export function createFileSecureKeyStore(
  rootDirectory = secureKeyRoot(),
) {
  const root = path.resolve(rootDirectory);

  function recordPath(projectIdentity) {
    assertProjectIdentity(projectIdentity);
    return path.join(root, `${projectIdentity}.json`);
  }

  async function read(projectIdentity) {
    const target = recordPath(projectIdentity);
    try {
      return decodeSecureKeyRecord(
        await readFile(target, "utf8"),
        projectIdentity,
      );
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async function activate(projectIdentity, activation) {
    assertProjectIdentity(projectIdentity);
    if (
      !Buffer.isBuffer(activation?.key) ||
      activation.key.length !== STATE_HMAC_KEY_BYTES ||
      !["new_state", "legacy_migration"].includes(
        activation?.activation_kind,
      )
    ) {
      throw new StateStoreError(
        "SECURE_KEY_ACTIVATION_INVALID",
        "secure key activation 입력이 유효하지 않습니다.",
      );
    }
    await mkdir(root, { recursive: true, mode: 0o700 });
    const target = recordPath(projectIdentity);
    const document = {
      schema_version: SECURE_KEY_RECORD_SCHEMA_VERSION,
      project_identity: projectIdentity,
      activation_kind: activation.activation_kind,
      activated_at:
        activation.activated_at ?? new Date().toISOString(),
      migration_receipt_sha256:
        activation.migration_receipt_sha256 ?? null,
      key_base64: activation.key.toString("base64"),
    };
    let handle;
    try {
      handle = await open(target, "wx", 0o600);
      await handle.writeFile(
        `${JSON.stringify(document, null, 2)}\n`,
        "utf8",
      );
      await handle.sync();
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = await read(projectIdentity);
      if (
        existing?.activation_kind ===
          document.activation_kind &&
        existing?.migration_receipt_sha256 ===
          document.migration_receipt_sha256 &&
        timingSafeEqual(existing.key, activation.key)
      ) {
        return existing;
      }
      throw new StateStoreError(
        "STATE_HMAC_ALREADY_ACTIVE",
        "project identity에는 이미 다른 secure HMAC activation이 있습니다.",
      );
    } finally {
      await handle?.close();
    }
    return decodeSecureKeyRecord(
      JSON.stringify(document),
      projectIdentity,
    );
  }

  return Object.freeze({
    root,
    read,
    activate,
  });
}

function projectIdentity(projectRoot, projectId) {
  const normalizedRoot =
    process.platform === "win32"
      ? path.resolve(projectRoot).toLowerCase()
      : path.resolve(projectRoot);
  return createHash("sha256")
    .update(
      `detail-page-workflow-state-v1\0${normalizedRoot}\0${projectId}`,
    )
    .digest("hex");
}

function loadStateDocument(raw, hmacKey = null) {
  const document = JSON.parse(raw);
  const seal = document?.[STATE_SEAL_FIELD];
  const payload = statePayload(document);
  const actualPayloadSha256 = payloadSha256(payload);
  if (seal === undefined) {
    return {
      ...payload,
      [STATE_SEAL_FIELD]: {
        schema_version: 0,
        algorithm: null,
        payload_sha256: null,
        status: "legacy_unsealed",
        cas_token: `legacy:${actualPayloadSha256}`,
      },
    };
  }
  if (
    seal?.schema_version === LEGACY_SHA_SEAL_SCHEMA_VERSION &&
    seal?.algorithm === "sha256"
  ) {
    if (!safeEqualHex(seal.payload_sha256, actualPayloadSha256)) {
      throw new StateStoreError(
        "STATE_INTEGRITY_MISMATCH",
        "기존 SHA-256 state seal과 현재 payload가 일치하지 않습니다.",
      );
    }
    return {
      ...payload,
      [STATE_SEAL_FIELD]: {
        ...seal,
        status: "legacy_sha256",
        cas_token: `sha256:${seal.payload_sha256}`,
      },
    };
  }
  if (
    seal?.schema_version !== STATE_SEAL_SCHEMA_VERSION ||
    seal?.algorithm !== "hmac-sha256"
  ) {
    throw new StateStoreError(
      "STATE_INTEGRITY_MISMATCH",
      "지원하지 않는 workflow state seal 형식입니다.",
    );
  }
  if (!hmacKey) {
    throw new StateStoreError(
      "LEGACY_HMAC_MIGRATION_REQUIRED",
      "project-local HMAC state는 명시적인 secure key migration이 필요합니다.",
    );
  }
  const actualPayloadHmac = payloadHmacSha256(payload, hmacKey);
  if (
    !safeEqualHex(
      seal.payload_hmac_sha256,
      actualPayloadHmac,
    )
  ) {
    throw new StateStoreError(
      "STATE_INTEGRITY_MISMATCH",
      "workflow state HMAC seal과 현재 payload가 일치하지 않습니다.",
    );
  }
  return {
    ...payload,
    [STATE_SEAL_FIELD]: {
      ...persistedHmacSeal(actualPayloadHmac),
      status: "verified",
      cas_token: `hmac:${actualPayloadHmac}`,
    },
  };
}

function assertSecureKeyStore(secureKeyStore) {
  if (
    typeof secureKeyStore?.read !== "function" ||
    typeof secureKeyStore?.activate !== "function"
  ) {
    throw new StateStoreError(
      "SECURE_KEY_STORE_REQUIRED",
      "secureKeyStore에는 read와 activate 함수가 필요합니다.",
    );
  }
}

function validateMigrationReceipt(
  receipt,
  {
    projectId,
    identity,
    sourceStateKind,
    sourcePayloadSha256,
  },
) {
  const exact = {
    receipt_type: "state-hmac-migration.v1",
    project_id: projectId,
    project_identity: identity,
    source_state_kind: sourceStateKind,
    source_payload_sha256: sourcePayloadSha256,
    decision: "approved",
  };
  const mismatch = Object.entries(exact).find(
    ([field, expected]) => receipt?.[field] !== expected,
  );
  if (mismatch) {
    throw new StateStoreError(
      "STATE_MIGRATION_RECEIPT_MISMATCH",
      "migration receipt가 exact project와 source state에 고정되지 않았습니다.",
      {
        field: mismatch[0],
        expected: mismatch[1],
        actual: receipt?.[mismatch[0]] ?? null,
      },
    );
  }
  if (
    !/^migration-[A-Za-z0-9._-]+$/.test(
      String(receipt?.receipt_id ?? ""),
    ) ||
    !/^[A-Za-z0-9._-]{16,}$/.test(
      String(receipt?.one_time_nonce ?? ""),
    ) ||
    !String(receipt?.authorized_by ?? "").trim() ||
    !Number.isFinite(Date.parse(receipt?.created_at))
  ) {
    throw new StateStoreError(
      "STATE_MIGRATION_RECEIPT_INVALID",
      "migration receipt의 ID·nonce·승인자·시각이 유효하지 않습니다.",
    );
  }
  return createHash("sha256")
    .update(canonicalBytes(receipt))
    .digest("hex");
}

export function createFileStateStore(
  projectRoot,
  {
    secureKeyStore = createFileSecureKeyStore(),
  } = {},
) {
  assertSecureKeyStore(secureKeyStore);
  const stateDirectory = resolveWorkflowStorage(projectRoot);
  const legacyLocalKeyPath = path.join(
    stateDirectory,
    LEGACY_LOCAL_KEY_FILENAME,
  );

  function statePath(projectId) {
    assertProjectId(projectId);
    return path.join(stateDirectory, `${projectId}.json`);
  }

  function lockPath(projectId) {
    assertProjectId(projectId);
    return path.join(stateDirectory, `.${projectId}.state.lock`);
  }

  function identity(projectId) {
    assertProjectId(projectId);
    return projectIdentity(projectRoot, projectId);
  }

  async function acquireLock(projectId) {
    await mkdir(stateDirectory, { recursive: true });
    const target = lockPath(projectId);
    for (
      let attempt = 0;
      attempt < LOCK_RETRY_LIMIT;
      attempt += 1
    ) {
      try {
        const handle = await open(target, "wx", 0o600);
        await handle.writeFile(
          `${JSON.stringify({
            pid: process.pid,
            acquired_at: new Date().toISOString(),
          })}\n`,
        );
        return { handle, target };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          const info = await stat(target);
          if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
            await rm(target, { force: true });
            continue;
          }
        } catch (statError) {
          if (statError.code === "ENOENT") continue;
          throw statError;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, LOCK_RETRY_DELAY_MS),
        );
      }
    }
    throw new StateStoreError(
      "STATE_LOCK_TIMEOUT",
      "project state lock을 제한 시간 안에 획득하지 못했습니다.",
    );
  }

  async function releaseLock(lock) {
    await lock.handle.close();
    await rm(lock.target, { force: true });
  }

  async function readRawState(target) {
    try {
      return await readFile(target, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  function assertActivatedDocument(raw, activation) {
    const parsed = JSON.parse(raw);
    if (
      parsed?._state_seal?.algorithm !== "hmac-sha256"
    ) {
      throw new StateStoreError(
        "STATE_SEAL_DOWNGRADE_FORBIDDEN",
        "HMAC이 활성화된 project state는 legacy/unsealed 상태로 되돌릴 수 없습니다.",
      );
    }
    return loadStateDocument(raw, activation.key);
  }

  async function load(projectId) {
    const target = statePath(projectId);
    const projectIdentityValue = identity(projectId);
    const activation = await secureKeyStore.read(
      projectIdentityValue,
    );
    const raw = await readRawState(target);
    if (raw === undefined) {
      if (activation) {
        throw new StateStoreError(
          "STATE_FILE_MISSING_AFTER_HMAC_ACTIVATION",
          "HMAC 활성화 기록이 있는 project의 state 파일이 누락되었습니다.",
        );
      }
      return undefined;
    }
    if (activation) {
      return assertActivatedDocument(raw, activation);
    }
    return loadStateDocument(raw);
  }

  async function writeHmacState(target, state, key) {
    const temporary =
      `${target}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
    const payload = statePayload(state);
    const payloadHmac = payloadHmacSha256(payload, key);
    const document = {
      ...payload,
      [STATE_SEAL_FIELD]: persistedHmacSeal(payloadHmac),
    };
    await writeFile(
      temporary,
      `${JSON.stringify(document, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporary, target);
    state[STATE_SEAL_FIELD] = {
      ...document[STATE_SEAL_FIELD],
      status: "verified",
      cas_token: `hmac:${payloadHmac}`,
    };
    return target;
  }

  async function save(projectId, state) {
    const target = statePath(projectId);
    const projectIdentityValue = identity(projectId);
    await mkdir(stateDirectory, { recursive: true });
    const lock = await acquireLock(projectId);
    try {
      let activation = await secureKeyStore.read(
        projectIdentityValue,
      );
      const currentRaw = await readRawState(target);
      let currentCasToken = null;
      if (currentRaw !== undefined) {
        if (!activation) {
          const current = loadStateDocument(currentRaw);
          const code =
            current._state_seal.algorithm === "hmac-sha256"
              ? "LEGACY_HMAC_MIGRATION_REQUIRED"
              : "LEGACY_MIGRATION_REQUIRED";
          throw new StateStoreError(
            code,
            "기존 state는 명시적인 one-time secure HMAC migration이 필요합니다.",
          );
        }
        currentCasToken = assertActivatedDocument(
          currentRaw,
          activation,
        )._state_seal.cas_token;
      } else if (activation) {
        throw new StateStoreError(
          "STATE_FILE_MISSING_AFTER_HMAC_ACTIVATION",
          "HMAC 활성화 이후 state 파일 누락 상태에서 새 state를 만들 수 없습니다.",
        );
      }
      const expectedCasToken =
        state?._state_seal?.cas_token ?? null;
      if (currentCasToken !== expectedCasToken) {
        throw new StateStoreError(
          "STATE_CAS_MISMATCH",
          "state가 load된 뒤 다른 프로세스가 갱신했습니다.",
        );
      }
      if (!activation) {
        activation = await secureKeyStore.activate(
          projectIdentityValue,
          {
            key: randomBytes(STATE_HMAC_KEY_BYTES),
            activation_kind: "new_state",
            activated_at: new Date().toISOString(),
          },
        );
      }
      return await writeHmacState(
        target,
        state,
        activation.key,
      );
    } finally {
      await releaseLock(lock);
    }
  }

  async function migrateLegacy(projectId, migrationReceipt) {
    const target = statePath(projectId);
    const projectIdentityValue = identity(projectId);
    await mkdir(stateDirectory, { recursive: true });
    const lock = await acquireLock(projectId);
    try {
      const raw = await readRawState(target);
      if (raw === undefined) {
        throw new StateStoreError(
          "LEGACY_STATE_NOT_FOUND",
          "migration할 legacy state를 찾을 수 없습니다.",
        );
      }
      const parsed = JSON.parse(raw);
      const existingActivation =
        await secureKeyStore.read(projectIdentityValue);
      if (
        existingActivation &&
        parsed?._state_seal?.algorithm === "hmac-sha256"
      ) {
        throw new StateStoreError(
          "STATE_HMAC_ALREADY_ACTIVE",
          "이 project identity의 secure HMAC migration은 이미 완료되었습니다.",
        );
      }
      let sourceState;
      let sourceStateKind;
      let sourceKey = null;
      if (
        parsed?._state_seal?.algorithm === "hmac-sha256"
      ) {
        try {
          sourceKey = await readFile(legacyLocalKeyPath);
        } catch (error) {
          if (error.code === "ENOENT") {
            throw new StateStoreError(
              "LEGACY_LOCAL_HMAC_KEY_MISSING",
              "project-local HMAC state migration에 필요한 기존 key가 없습니다.",
            );
          }
          throw error;
        }
        if (sourceKey.length !== STATE_HMAC_KEY_BYTES) {
          throw new StateStoreError(
            "LEGACY_LOCAL_HMAC_KEY_INVALID",
            "기존 project-local HMAC key가 32바이트가 아닙니다.",
          );
        }
        sourceState = loadStateDocument(raw, sourceKey);
        sourceStateKind = "project_local_hmac";
      } else {
        sourceState = loadStateDocument(raw);
        sourceStateKind =
          sourceState._state_seal.status === "legacy_sha256"
            ? "legacy_sha256"
            : "legacy_unsealed";
      }
      const sourcePayloadSha256 = payloadSha256(
        statePayload(sourceState),
      );
      const receiptSha256 = validateMigrationReceipt(
        migrationReceipt,
        {
          projectId,
          identity: projectIdentityValue,
          sourceStateKind,
          sourcePayloadSha256,
        },
      );
      let activation = existingActivation;
      if (activation) {
        if (
          activation.activation_kind !==
            "legacy_migration" ||
          activation.migration_receipt_sha256 !== receiptSha256
        ) {
          throw new StateStoreError(
            "STATE_HMAC_ALREADY_ACTIVE",
            "다른 activation 또는 migration receipt가 이미 사용되었습니다.",
          );
        }
      } else {
        activation = await secureKeyStore.activate(
          projectIdentityValue,
          {
            key:
              sourceKey ?? randomBytes(STATE_HMAC_KEY_BYTES),
            activation_kind: "legacy_migration",
            activated_at: new Date().toISOString(),
            migration_receipt_sha256: receiptSha256,
          },
        );
      }
      await writeHmacState(
        target,
        sourceState,
        activation.key,
      );
      if (sourceStateKind === "project_local_hmac") {
        await rm(legacyLocalKeyPath, { force: true });
      }
      return {
        status: "migrated",
        project_id: projectId,
        project_identity: projectIdentityValue,
        source_state_kind: sourceStateKind,
        migration_receipt_sha256: receiptSha256,
        state: await load(projectId),
      };
    } finally {
      await releaseLock(lock);
    }
  }

  return Object.freeze({
    load,
    save,
    migrateLegacy,
    projectIdentity: identity,
  });
}
