import { createHash, randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { resolveWorkflowStorage } from "./storage-paths.mjs";

export const ARTIFACT_MEMBER_STORAGE_POLICIES = Object.freeze({
  INLINE_OR_VIRTUAL: "inline_or_virtual",
  MATERIALIZED: "materialized",
});

const MEMBER_MANIFEST_SCHEMA_VERSION = "1.0";

export class ArtifactRecordStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ArtifactRecordStoreError";
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertSha256(value, field) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ""))) {
    throw new ArtifactRecordStoreError(
      "INVALID_RECORD_HASH",
      `${field}는 SHA-256이어야 합니다.`,
      { field },
    );
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function assertCanonicalRelativeLocator(locator, field) {
  const value = String(locator ?? "");
  if (
    !value ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("\0")
  ) {
    throw new ArtifactRecordStoreError(
      "MATERIALIZED_MEMBER_LOCATOR_INVALID",
      `${field}는 허용 root 내부 canonical POSIX 상대 경로여야 합니다.`,
      { field, locator: value },
    );
  }
  const parts = value.split("/");
  if (
    parts.some((part) => !part || part === "." || part === "..") ||
    path.posix.normalize(value) !== value
  ) {
    throw new ArtifactRecordStoreError(
      "MATERIALIZED_MEMBER_LOCATOR_INVALID",
      `${field}는 허용 root 내부 canonical POSIX 상대 경로여야 합니다.`,
      { field, locator: value },
    );
  }
  return value;
}

function normalizeMemberManifest(artifact) {
  const supplied = artifact?.member_manifest;
  const materializedSignal =
    artifact?.materialized === true ||
    artifact?.materialization_policy ===
      ARTIFACT_MEMBER_STORAGE_POLICIES.MATERIALIZED ||
    artifact?.materialized_members !== undefined;
  if (supplied === undefined || supplied === null) {
    if (materializedSignal) {
      throw new ArtifactRecordStoreError(
        "MATERIALIZED_MEMBER_MANIFEST_REQUIRED",
        "materialized artifact에는 canonical member_manifest가 필요합니다.",
        { artifact_id: artifact?.artifact_id ?? null },
      );
    }
    return {
      schema_version: MEMBER_MANIFEST_SCHEMA_VERSION,
      policy:
        ARTIFACT_MEMBER_STORAGE_POLICIES.INLINE_OR_VIRTUAL,
      members: [],
    };
  }
  if (
    typeof supplied !== "object" ||
    Array.isArray(supplied) ||
    supplied.schema_version !== MEMBER_MANIFEST_SCHEMA_VERSION
  ) {
    throw new ArtifactRecordStoreError(
      "INVALID_MEMBER_MANIFEST",
      "member_manifest schema_version 1.0이 필요합니다.",
      { artifact_id: artifact?.artifact_id ?? null },
    );
  }

  if (
    supplied.policy ===
    ARTIFACT_MEMBER_STORAGE_POLICIES.INLINE_OR_VIRTUAL
  ) {
    if (
      supplied.members !== undefined &&
      (!Array.isArray(supplied.members) ||
        supplied.members.length !== 0)
    ) {
      throw new ArtifactRecordStoreError(
        "INVALID_MEMBER_MANIFEST",
        "inline_or_virtual manifest에는 file locator를 넣을 수 없습니다.",
        { artifact_id: artifact?.artifact_id ?? null },
      );
    }
    if (materializedSignal) {
      throw new ArtifactRecordStoreError(
        "MATERIALIZED_MEMBER_MANIFEST_REQUIRED",
        "materialized 선언을 inline_or_virtual 정책으로 우회할 수 없습니다.",
        { artifact_id: artifact?.artifact_id ?? null },
      );
    }
    return {
      schema_version: MEMBER_MANIFEST_SCHEMA_VERSION,
      policy:
        ARTIFACT_MEMBER_STORAGE_POLICIES.INLINE_OR_VIRTUAL,
      members: [],
    };
  }

  if (
    supplied.policy !==
      ARTIFACT_MEMBER_STORAGE_POLICIES.MATERIALIZED ||
    !Array.isArray(supplied.members) ||
    supplied.members.length === 0
  ) {
    throw new ArtifactRecordStoreError(
      "INVALID_MEMBER_MANIFEST",
      "member_manifest policy는 inline_or_virtual 또는 non-empty materialized여야 합니다.",
      { artifact_id: artifact?.artifact_id ?? null },
    );
  }

  const members = supplied.members.map((member, index) => {
    const memberId = String(member?.member_id ?? "");
    const rootId = String(member?.root_id ?? "project");
    if (!memberId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rootId)) {
      throw new ArtifactRecordStoreError(
        "INVALID_MEMBER_MANIFEST",
        "materialized member에는 member_id와 유효한 root_id가 필요합니다.",
        {
          artifact_id: artifact?.artifact_id ?? null,
          member_index: index,
        },
      );
    }
    assertSha256(
      member?.sha256,
      `artifact.member_manifest.members[${index}].sha256`,
    );
    if (
      !Number.isSafeInteger(member?.size_bytes) ||
      member.size_bytes < 0
    ) {
      throw new ArtifactRecordStoreError(
        "INVALID_MEMBER_MANIFEST",
        "materialized member.size_bytes는 0 이상의 안전한 정수여야 합니다.",
        {
          artifact_id: artifact?.artifact_id ?? null,
          member_id: memberId,
        },
      );
    }
    return {
      member_id: memberId,
      root_id: rootId,
      locator: assertCanonicalRelativeLocator(
        member?.locator,
        `artifact.member_manifest.members[${index}].locator`,
      ),
      sha256: String(member.sha256),
      size_bytes: member.size_bytes,
    };
  });
  members.sort(
    (left, right) =>
      left.member_id.localeCompare(right.member_id) ||
      left.root_id.localeCompare(right.root_id) ||
      left.locator.localeCompare(right.locator),
  );

  const memberIds = members.map((member) => member.member_id);
  const locators = members.map(
    (member) => `${member.root_id}:${member.locator}`,
  );
  if (
    new Set(memberIds).size !== memberIds.length ||
    new Set(locators).size !== locators.length
  ) {
    throw new ArtifactRecordStoreError(
      "INVALID_MEMBER_MANIFEST",
      "materialized member_id와 root/locator는 각각 고유해야 합니다.",
      { artifact_id: artifact?.artifact_id ?? null },
    );
  }

  const artifactMemberIds = [...(artifact?.member_ids ?? [])]
    .map(String)
    .sort((left, right) => left.localeCompare(right));
  if (
    artifactMemberIds.length !== memberIds.length ||
    artifactMemberIds.some(
      (memberId, index) => memberId !== memberIds[index],
    )
  ) {
    throw new ArtifactRecordStoreError(
      "MATERIALIZED_MEMBER_SET_MISMATCH",
      "materialized manifest는 artifact.member_ids 전부를 정확히 1:1 열거해야 합니다.",
      {
        artifact_id: artifact?.artifact_id ?? null,
        artifact_member_ids: artifactMemberIds,
        manifest_member_ids: memberIds,
      },
    );
  }

  return {
    schema_version: MEMBER_MANIFEST_SCHEMA_VERSION,
    policy: ARTIFACT_MEMBER_STORAGE_POLICIES.MATERIALIZED,
    members,
  };
}

function normalizeAllowedRoots(projectRoot, options) {
  const roots = new Map([["project", path.resolve(projectRoot)]]);
  const supplied =
    options?.allowedRoots ??
    options?.allowedMaterializedRoots ??
    {};
  if (
    supplied === null ||
    typeof supplied !== "object" ||
    Array.isArray(supplied)
  ) {
    throw new ArtifactRecordStoreError(
      "INVALID_MATERIALIZED_ROOTS",
      "allowedRoots는 root_id와 절대 경로의 객체여야 합니다.",
    );
  }
  for (const [rootId, rootPath] of Object.entries(supplied)) {
    if (
      rootId === "project" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rootId) ||
      !path.isAbsolute(String(rootPath ?? ""))
    ) {
      throw new ArtifactRecordStoreError(
        "INVALID_MATERIALIZED_ROOTS",
        "allowedRoots는 project를 재정의하지 않는 root_id/절대 경로여야 합니다.",
        { root_id: rootId },
      );
    }
    roots.set(rootId, path.resolve(rootPath));
  }
  return roots;
}

function pathIsWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function readMaterializedMember(member, allowedRoots) {
  const root = allowedRoots.get(member.root_id);
  if (!root) {
    throw new ArtifactRecordStoreError(
      "MATERIALIZED_MEMBER_ROOT_NOT_ALLOWED",
      "member root_id가 ArtifactRecordStore 허용 root에 없습니다.",
      {
        member_id: member.member_id,
        root_id: member.root_id,
      },
    );
  }
  const target = path.resolve(root, ...member.locator.split("/"));
  if (!pathIsWithin(root, target) || target === root) {
    throw new ArtifactRecordStoreError(
      "MATERIALIZED_MEMBER_LOCATOR_INVALID",
      "materialized member locator가 허용 root 밖을 가리킵니다.",
      {
        member_id: member.member_id,
        root_id: member.root_id,
        locator: member.locator,
      },
    );
  }

  let current = root;
  try {
    for (const part of member.locator.split("/")) {
      current = path.join(current, part);
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new ArtifactRecordStoreError(
          "MATERIALIZED_MEMBER_SYMLINK_FORBIDDEN",
          "materialized member 경로에는 symlink를 사용할 수 없습니다.",
          {
            member_id: member.member_id,
            root_id: member.root_id,
            locator: member.locator,
          },
        );
      }
    }
  } catch (error) {
    if (error instanceof ArtifactRecordStoreError) throw error;
    if (error?.code === "ENOENT") {
      throw new ArtifactRecordStoreError(
        "MATERIALIZED_MEMBER_MISSING",
        "materialized member 파일을 찾을 수 없습니다.",
        {
          member_id: member.member_id,
          root_id: member.root_id,
          locator: member.locator,
        },
      );
    }
    throw error;
  }

  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new ArtifactRecordStoreError(
      "MATERIALIZED_MEMBER_INVALID_FILE",
      "materialized member는 symlink가 아닌 일반 파일이어야 합니다.",
      {
        member_id: member.member_id,
        locator: member.locator,
      },
    );
  }
  const [realRoot, realTarget] = await Promise.all([
    realpath(root),
    realpath(target),
  ]);
  if (!pathIsWithin(realRoot, realTarget) || realTarget === realRoot) {
    throw new ArtifactRecordStoreError(
      "MATERIALIZED_MEMBER_SYMLINK_ESCAPE",
      "materialized member의 실제 경로가 허용 root 밖입니다.",
      {
        member_id: member.member_id,
        root_id: member.root_id,
        locator: member.locator,
      },
    );
  }

  const bytes = await readFile(target);
  const actualSha256 = sha256(bytes);
  if (bytes.length !== member.size_bytes) {
    throw new ArtifactRecordStoreError(
      "MATERIALIZED_MEMBER_SIZE_MISMATCH",
      "materialized member bytes 크기가 manifest와 다릅니다.",
      {
        member_id: member.member_id,
        expected_size_bytes: member.size_bytes,
        actual_size_bytes: bytes.length,
      },
    );
  }
  if (actualSha256 !== member.sha256) {
    throw new ArtifactRecordStoreError(
      "MATERIALIZED_MEMBER_HASH_MISMATCH",
      "materialized member bytes SHA-256이 manifest와 다릅니다.",
      {
        member_id: member.member_id,
        expected_sha256: member.sha256,
        actual_sha256: actualSha256,
      },
    );
  }
}

async function verifyMaterializedMembers(artifact, allowedRoots) {
  const manifest = normalizeMemberManifest(artifact);
  if (
    manifest.policy ===
    ARTIFACT_MEMBER_STORAGE_POLICIES.MATERIALIZED
  ) {
    for (const member of manifest.members) {
      await readMaterializedMember(member, allowedRoots);
    }
  }
  return manifest;
}

function toPosixLocator(projectRoot, target) {
  const relative = path.relative(projectRoot, target);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new ArtifactRecordStoreError(
      "ARTIFACT_RECORD_PATH_ESCAPE",
      "artifact record가 project root 밖을 가리킵니다.",
    );
  }
  return relative.split(path.sep).join("/");
}

function resolveRecordLocator(projectRoot, locator) {
  const value = String(locator || "").replaceAll("\\", "/");
  if (
    !value ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((part) => part === "..")
  ) {
    throw new ArtifactRecordStoreError(
      "ARTIFACT_RECORD_PATH_ESCAPE",
      "artifact record locator는 project 내부 상대 경로여야 합니다.",
    );
  }
  const target = path.resolve(projectRoot, ...value.split("/"));
  const relative = path.relative(projectRoot, target);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new ArtifactRecordStoreError(
      "ARTIFACT_RECORD_PATH_ESCAPE",
      "artifact record locator가 project root 밖을 가리킵니다.",
    );
  }
  return target;
}

async function buildRecord(subject, allowedRoots) {
  if (
    !subject?.project_id ||
    !subject?.work_order_id ||
    !subject?.stage_id ||
    !subject?.producer_agent_session_id ||
    !subject?.artifact?.artifact_id ||
    !subject?.artifact?.type
  ) {
    throw new ArtifactRecordStoreError(
      "INVALID_ARTIFACT_RECORD",
      "project/work order/stage/producer/artifact identity가 필요합니다.",
    );
  }
  assertSha256(subject.input_set_digest, "input_set_digest");
  assertSha256(
    subject.artifact.manifest_sha256,
    "artifact.manifest_sha256",
  );
  assertSha256(
    subject.execution_receipt?.adapter_code_sha256,
    "execution_receipt.adapter_code_sha256",
  );
  const artifact = structuredClone(subject.artifact);
  artifact.member_manifest = await verifyMaterializedMembers(
    artifact,
    allowedRoots,
  );
  return {
    schema_version: "1.0",
    project_id: String(subject.project_id),
    work_order_id: String(subject.work_order_id),
    stage_id: String(subject.stage_id),
    input_set_digest: String(subject.input_set_digest),
    producer_agent_session_id: String(
      subject.producer_agent_session_id,
    ),
    artifact,
    execution_receipt: structuredClone(subject.execution_receipt),
    commit_validation_receipt: structuredClone(
      subject.commit_validation_receipt ?? null,
    ),
  };
}

export function createArtifactRecordStore(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const recordsRoot = resolveWorkflowStorage(root, "artifacts");
  const allowedRoots = normalizeAllowedRoots(root, options);

  async function commit(subject) {
    const record = await buildRecord(subject, allowedRoots);
    const projectKey = sha256(record.project_id).slice(0, 16);
    const artifactKey = sha256(record.artifact.artifact_id).slice(0, 24);
    const directory = path.join(recordsRoot, projectKey);
    const finalPath = path.join(directory, `${artifactKey}.json`);
    const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    const recordSha256 = sha256(bytes);
    await mkdir(directory, { recursive: true });

    if (await exists(finalPath)) {
      const existing = await readFile(finalPath);
      if (sha256(existing) !== recordSha256) {
        throw new ArtifactRecordStoreError(
          "IMMUTABLE_ARTIFACT_RECORD_CONFLICT",
          "같은 artifact identity의 기존 record 내용이 다릅니다.",
          {
            artifact_id: record.artifact.artifact_id,
            record_locator: toPosixLocator(root, finalPath),
          },
        );
      }
      return {
        record_locator: toPosixLocator(root, finalPath),
        record_sha256: recordSha256,
        member_manifest: structuredClone(
          record.artifact.member_manifest,
        ),
        idempotent_reuse: true,
      };
    }

    const stagingPath = path.join(
      directory,
      `.${artifactKey}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(stagingPath, bytes, { flag: "wx" });
      try {
        await rename(stagingPath, finalPath);
      } catch (error) {
        if (!(await exists(finalPath))) throw error;
        const existing = await readFile(finalPath);
        if (sha256(existing) !== recordSha256) {
          throw new ArtifactRecordStoreError(
            "IMMUTABLE_ARTIFACT_RECORD_CONFLICT",
            "동시 commit된 artifact record 내용이 다릅니다.",
            { artifact_id: record.artifact.artifact_id },
          );
        }
        return {
          record_locator: toPosixLocator(root, finalPath),
          record_sha256: recordSha256,
          member_manifest: structuredClone(
            record.artifact.member_manifest,
          ),
          idempotent_reuse: true,
        };
      }
    } finally {
      if (await exists(stagingPath)) {
        await rm(stagingPath, { force: true });
      }
    }
    return {
      record_locator: toPosixLocator(root, finalPath),
      record_sha256: recordSha256,
      member_manifest: structuredClone(
        record.artifact.member_manifest,
      ),
      idempotent_reuse: false,
    };
  }

  async function verify(expected) {
    assertSha256(expected?.record_sha256, "record_sha256");
    assertSha256(
      expected?.manifest_sha256,
      "artifact.manifest_sha256",
    );
    const target = resolveRecordLocator(
      root,
      expected?.record_locator,
    );
    let info;
    let bytes;
    try {
      info = await lstat(target);
      bytes = await readFile(target);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new ArtifactRecordStoreError(
          "ARTIFACT_RECORD_MISSING",
          "artifact record 파일을 찾을 수 없습니다.",
          { record_locator: expected?.record_locator },
        );
      }
      throw error;
    }
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new ArtifactRecordStoreError(
        "ARTIFACT_RECORD_INVALID_FILE",
        "artifact record는 symlink가 아닌 regular file이어야 합니다.",
      );
    }
    const actualRecordSha256 = sha256(bytes);
    if (actualRecordSha256 !== expected.record_sha256) {
      throw new ArtifactRecordStoreError(
        "ARTIFACT_RECORD_INTEGRITY_MISMATCH",
        "artifact record bytes hash가 graph record_sha256과 다릅니다.",
        {
          expected: expected.record_sha256,
          actual: actualRecordSha256,
          record_locator: expected.record_locator,
        },
      );
    }
    let record;
    try {
      record = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new ArtifactRecordStoreError(
        "ARTIFACT_RECORD_JSON_INVALID",
        "artifact record JSON을 읽을 수 없습니다.",
      );
    }
    if (
      record.project_id !== expected.project_id ||
      record.artifact?.artifact_id !== expected.artifact_id ||
      record.artifact?.manifest_sha256 !== expected.manifest_sha256
    ) {
      throw new ArtifactRecordStoreError(
        "ARTIFACT_RECORD_SUBJECT_MISMATCH",
        "artifact record subject가 graph artifact와 다릅니다.",
        {
          artifact_id: expected.artifact_id,
          record_locator: expected.record_locator,
        },
      );
    }
    const memberManifest = await verifyMaterializedMembers(
      record.artifact,
      allowedRoots,
    );
    if (
      expected.member_manifest !== undefined &&
      canonicalJson(memberManifest) !==
        canonicalJson(
          normalizeMemberManifest({
            artifact_id: expected.artifact_id,
            member_ids: record.artifact.member_ids,
            member_manifest: expected.member_manifest,
          }),
        )
    ) {
      throw new ArtifactRecordStoreError(
        "ARTIFACT_MEMBER_MANIFEST_MISMATCH",
        "graph와 immutable record의 member manifest가 다릅니다.",
        {
          artifact_id: expected.artifact_id,
          record_locator: expected.record_locator,
        },
      );
    }
    return {
      status: "verified",
      artifact_id: record.artifact.artifact_id,
      record_locator: expected.record_locator,
      record_sha256: actualRecordSha256,
      member_manifest: structuredClone(memberManifest),
      commit_validation_receipt:
        structuredClone(record.commit_validation_receipt ?? null),
    };
  }

  return Object.freeze({ commit, verify });
}
