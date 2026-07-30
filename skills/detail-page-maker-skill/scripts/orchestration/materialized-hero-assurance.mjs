import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  assertHeroOutputGate,
  canonicalHeroSha256,
} from "./hero-output-gate.mjs";
import {
  assertStudioDownstreamEligible,
} from "./production-contracts.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const HERO_ASSURANCE_FIELDS = Object.freeze([
  "hero_assurance_bundle_sha256",
  "hero_assurance_manifest_sha256",
  "hero_identity_validation_receipt_sha256",
  "hero_commercial_validation_receipt_sha256",
  "hero_assurance_validation_receipt_sha256",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export class MaterializedHeroAssuranceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MaterializedHeroAssuranceError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new MaterializedHeroAssuranceError(
    code,
    message,
    details,
  );
}

function parseJson(bytes, field) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(
      "HERO_ASSURANCE_JSON_INVALID",
      `${field} JSON을 해석할 수 없습니다.`,
      { field },
    );
  }
}

function assertArtifactPayload(revisionArtifact, revision) {
  if (
    revisionArtifact?.type !== "studio.committed_revision" ||
    revisionArtifact?.mutable !== false ||
    revisionArtifact?.artifact_id !== revision?.artifact_id ||
    revisionArtifact?.manifest_sha256 !==
      revision?.commit_sha256 ||
    revisionArtifact?.revision_id !== revision?.revision_id ||
    revisionArtifact?.revision_commit_sha256 !==
      revision?.commit_sha256 ||
    revisionArtifact?.html_sha256 !== revision?.html_sha256
  ) {
    fail(
      "STUDIO_REVISION_ARTIFACT_MISMATCH",
      "G4C studio.committed_revision payload가 실제 revision과 다릅니다.",
    );
  }
  if (
    !revisionArtifact?.revision ||
    canonicalSha256(revisionArtifact.revision) !==
      canonicalSha256(revision)
  ) {
    fail(
      "STUDIO_REVISION_PAYLOAD_MISMATCH",
      "G4C artifact의 revision payload가 materialized revision.json과 다릅니다.",
    );
  }
  for (const field of HERO_ASSURANCE_FIELDS) {
    if (
      !SHA256.test(String(revisionArtifact?.[field] ?? "")) ||
      revisionArtifact[field] !== revision[field]
    ) {
      fail(
        "HERO_ASSURANCE_ARTIFACT_FIELD_MISMATCH",
        `G4C artifact의 ${field}가 실제 revision과 다릅니다.`,
        { field },
      );
    }
  }
  const member = revisionArtifact?.hero_assurance_member;
  if (
    member?.member_id !== "hero-assurance.json" ||
    member?.root_id !== "project" ||
    member?.locator !==
      revision.hero_assurance_member_locator ||
    member?.sha256 !==
      revision.hero_assurance_member_sha256 ||
    member?.size_bytes !==
      revision.hero_assurance_member_size_bytes
  ) {
    fail(
      "HERO_ASSURANCE_ARTIFACT_MEMBER_MISMATCH",
      "G4C artifact의 private Hero assurance member binding이 revision과 다릅니다.",
    );
  }
}

function manifestMember(revisionArtifact, memberId) {
  const manifest = revisionArtifact?.member_manifest;
  if (
    manifest?.schema_version !== "1.0" ||
    manifest?.policy !== "materialized" ||
    !Array.isArray(manifest?.members)
  ) {
    fail(
      "HERO_ASSURANCE_MEMBER_MANIFEST_REQUIRED",
      "G4C artifact에는 materialized member manifest가 필요합니다.",
    );
  }
  const matches = manifest.members.filter(
    (member) => member?.member_id === memberId,
  );
  if (matches.length !== 1) {
    fail(
      "HERO_ASSURANCE_MEMBER_REQUIRED",
      `${memberId} materialized member가 정확히 하나 필요합니다.`,
      { member_id: memberId, count: matches.length },
    );
  }
  return matches[0];
}

async function readVerifiedMember(projectRoot, member) {
  if (
    member?.root_id !== "project" ||
    typeof member?.locator !== "string" ||
    !SHA256.test(String(member?.sha256 ?? "")) ||
    !Number.isSafeInteger(member?.size_bytes) ||
    member.size_bytes < 0
  ) {
    fail(
      "HERO_ASSURANCE_MEMBER_INVALID",
      "Hero assurance member locator/hash/size가 유효하지 않습니다.",
      { member_id: member?.member_id ?? null },
    );
  }
  const target = path.resolve(
    projectRoot,
    ...member.locator.split("/"),
  );
  if (!within(projectRoot, target)) {
    fail(
      "HERO_ASSURANCE_MEMBER_ESCAPE",
      "Hero assurance member가 project root 밖을 가리킵니다.",
      { locator: member.locator },
    );
  }
  let info;
  let bytes;
  try {
    [info, bytes] = await Promise.all([
      lstat(target),
      readFile(target),
    ]);
  } catch (error) {
    fail(
      "HERO_ASSURANCE_MEMBER_MISSING",
      "Hero assurance materialized member를 읽을 수 없습니다.",
      { locator: member.locator, cause: error?.code },
    );
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    fail(
      "HERO_ASSURANCE_MEMBER_INVALID",
      "Hero assurance member는 symlink가 아닌 regular file이어야 합니다.",
      { locator: member.locator },
    );
  }
  const actualRoot = await realpath(projectRoot);
  const actualTarget = await realpath(target);
  if (!within(actualRoot, actualTarget)) {
    fail(
      "HERO_ASSURANCE_MEMBER_ESCAPE",
      "Hero assurance member의 real path가 project root 밖입니다.",
      { locator: member.locator },
    );
  }
  const digest = sha256(bytes);
  if (
    bytes.length !== member.size_bytes ||
    digest !== member.sha256
  ) {
    fail(
      "HERO_ASSURANCE_MEMBER_INTEGRITY_MISMATCH",
      "Hero assurance member 실제 bytes가 member manifest와 다릅니다.",
      {
        member_id: member.member_id,
        expected_sha256: member.sha256,
        actual_sha256: digest,
      },
    );
  }
  return { bytes, target, sha256: digest };
}

export async function verifyMaterializedHeroAssurance({
  projectRoot,
  revisionArtifact,
  consumerStage,
} = {}) {
  const root = await realpath(path.resolve(String(projectRoot ?? "")));
  const revisionMember = manifestMember(
    revisionArtifact,
    "revision.json",
  );
  const htmlMember = manifestMember(
    revisionArtifact,
    "index.html",
  );
  const assuranceMember = manifestMember(
    revisionArtifact,
    "hero-assurance.json",
  );
  const [revisionFile, htmlFile, assuranceFile] =
    await Promise.all([
      readVerifiedMember(root, revisionMember),
      readVerifiedMember(root, htmlMember),
      readVerifiedMember(root, assuranceMember),
    ]);
  const revision = parseJson(
    revisionFile.bytes,
    "revision.json",
  );
  assertStudioDownstreamEligible(revision, consumerStage);
  const {
    commit_sha256: suppliedCommitSha256,
    committed_at: committedAt,
    ...revisionBody
  } = revision;
  if (
    !Number.isFinite(Date.parse(committedAt)) ||
    canonicalSha256(revisionBody) !== suppliedCommitSha256
  ) {
    fail(
      "STUDIO_REVISION_COMMIT_MISMATCH",
      "revision.json body와 commit SHA-256이 다릅니다.",
    );
  }
  assertArtifactPayload(revisionArtifact, revision);
  if (
    assuranceMember.locator !==
      revision.hero_assurance_member_locator ||
    assuranceMember.sha256 !==
      revision.hero_assurance_member_sha256 ||
    assuranceMember.size_bytes !==
      revision.hero_assurance_member_size_bytes ||
    assuranceFile.sha256 !==
      revision.hero_assurance_bundle_sha256 ||
    htmlFile.sha256 !== revision.html_sha256
  ) {
    fail(
      "HERO_ASSURANCE_REVISION_BINDING_MISMATCH",
      "revision의 Hero assurance/HTML binding이 materialized member와 다릅니다.",
    );
  }

  const bundle = parseJson(
    assuranceFile.bytes,
    "hero-assurance.json",
  );
  if (
    bundle?.schema_version !== "1.0" ||
    !bundle?.manifest ||
    !bundle?.validation_receipt ||
    !bundle?.commercial_validation_receipt ||
    !bundle?.resolved_section_graph ||
    !Array.isArray(bundle?.approved_artifacts) ||
    !Array.isArray(bundle?.identity_source_artifacts)
  ) {
    fail(
      "HERO_ASSURANCE_BUNDLE_INVALID",
      "materialized Hero assurance bundle의 근거 집합이 불완전합니다.",
    );
  }
  const identitySource = bundle.identity_source_artifacts.find(
    (artifact) =>
      artifact?.artifact_id ===
      bundle.manifest.identity_source?.artifact_id,
  );
  if (
    canonicalHeroSha256(bundle.manifest) !==
      revision.hero_assurance_manifest_sha256 ||
    canonicalHeroSha256(
      bundle.commercial_validation_receipt,
    ) !==
      revision.hero_commercial_validation_receipt_sha256 ||
    canonicalHeroSha256(bundle.validation_receipt) !==
      revision.hero_assurance_validation_receipt_sha256 ||
    canonicalHeroSha256(
      identitySource?.g2_identity_validation_receipt,
    ) !==
      revision.hero_identity_validation_receipt_sha256
  ) {
    fail(
      "HERO_ASSURANCE_RECEIPT_DIGEST_MISMATCH",
      "Hero manifest 또는 identity/commercial/final receipt bytes가 revision hash와 다릅니다.",
    );
  }
  const heroArtifactMember = manifestMember(
    revisionArtifact,
    bundle.manifest.hero_artifact?.artifact_id,
  );
  if (
    heroArtifactMember.sha256 !==
      bundle.manifest.hero_artifact?.sha256
  ) {
    fail(
      "HERO_PRODUCT_MEMBER_DIGEST_MISMATCH",
      "승인 Hero product artifact bytes가 assurance manifest와 다릅니다.",
    );
  }
  await readVerifiedMember(root, heroArtifactMember);

  try {
    assertHeroOutputGate({
      manifest: bundle.manifest,
      validationReceipt: bundle.validation_receipt,
      commercialValidationReceipt:
        bundle.commercial_validation_receipt,
      resolvedSectionGraph: bundle.resolved_section_graph,
      approvedArtifacts: bundle.approved_artifacts,
      identitySourceArtifacts:
        bundle.identity_source_artifacts,
      html: htmlFile.bytes.toString("utf8"),
    });
  } catch (error) {
    fail(
      "HERO_ASSURANCE_SEMANTIC_VALIDATION_FAILED",
      "materialized Hero assurance가 semantic gate를 통과하지 못했습니다.",
      { cause: error?.code, errors: error?.details?.errors },
    );
  }
  return Object.freeze({
    status: "verified",
    consumer_stage: consumerStage,
    revision_id: revision.revision_id,
    revision_commit_sha256: revision.commit_sha256,
    hero_assurance_bundle_sha256:
      revision.hero_assurance_bundle_sha256,
    hero_assurance_manifest_sha256:
      revision.hero_assurance_manifest_sha256,
    hero_identity_validation_receipt_sha256:
      revision.hero_identity_validation_receipt_sha256,
    hero_commercial_validation_receipt_sha256:
      revision.hero_commercial_validation_receipt_sha256,
    hero_assurance_validation_receipt_sha256:
      revision.hero_assurance_validation_receipt_sha256,
  });
}
