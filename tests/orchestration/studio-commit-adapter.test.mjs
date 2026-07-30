import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  rubricDefinitionHash,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/rubric-loop.mjs";
import {
  commitStudioRevision,
  inspectStudioWorkingState,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/adapters/studio-commit-adapter.mjs";
import {
  verifyMaterializedHeroAssurance,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/materialized-hero-assurance.mjs";
import {
  attachValidHeroAssurance,
} from "../helpers/hero-assurance-fixture.mjs";

const H = Object.freeze({
  benchmark: "1".repeat(64),
  policy: "2".repeat(64),
  validator: "3".repeat(64),
  prompt: "4".repeat(64),
});

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

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function html(copy) {
  return `<!doctype html>
<html lang="ko"><body>
<main>
  <section data-section-id="section-hero">
    <h2 data-copy-id="copy-hero" data-claim-id="claim-fast">${copy}</h2>
    <figure data-slot-id="slot-hero" data-artifact-id="image-approved-001">
      <img src="assets/hero.bin" alt="">
    </figure>
  </section>
</main>
</body></html>`;
}

function editableContract(currentHtml, copy) {
  return attachValidHeroAssurance({
    resolved_section_graph: {
      graph_id: "resolved-graph-studio-commit",
      sections: [
        {
          section_id: "section-hero",
          role: "hero",
          html_copy: [copy],
          claims: [
            {
              claim_id: "claim-fast",
              html_copy: [copy],
            },
          ],
          media_slots: [
            {
              slot_id: "slot-hero",
              kind: "image",
              approved_artifact_id: "image-approved-001",
              embedded_text_policy: "none",
            },
          ],
        },
      ],
    },
    approved_artifacts: [
      {
        artifact_id: "image-approved-001",
        approval_status: "approved",
        copy_embedded: false,
      },
    ],
    html: currentHtml,
  }, {
    heroArtifactSha256: sha256(
      Buffer.from("approved-image-fixture\n", "utf8"),
    ),
  });
}

function rubricDefinition() {
  const definition = {
    schema_version: "1.0",
    rubric_id: "studio-commit-rubric",
    version: "1.0.0",
    source_snapshot: {
      snapshot_id: "benchmark-2026-07-30",
      sha256: H.benchmark,
    },
    policy: {
      policy_id: "policy.studio-commit.v1",
      sha256: H.policy,
    },
    dimensions: [
      {
        dimension_id: "technical-integrity",
        validator_kind: "deterministic",
        weight: 40,
        min_score: 100,
        hard_gate: true,
        evidence_requirement: ["dom-report"],
        applicable_section_types: ["all"],
        issue_to_repair_scope_code: {
          DOM_INVALID: "html.section-css",
        },
        hard_failure_codes: ["DOM_INVALID"],
      },
      {
        dimension_id: "visual-hierarchy",
        validator_kind: "model",
        weight: 60,
        min_score: 90,
        hard_gate: true,
        evidence_requirement: ["viewport-capture"],
        applicable_section_types: ["hero"],
        issue_to_repair_scope_code: {
          VISUAL_HIERARCHY: "section.layout-token-html",
        },
        hard_failure_codes: [],
      },
    ],
    stop_policy: {
      policy_id: "studio-repair-stop",
      version: "1.0.0",
      max_total_attempts: 3,
      max_section_attempts: 2,
      recurring_issue_limit: 2,
      plateau_window: 2,
      min_score_improvement: 2,
    },
  };
  return {
    ...definition,
    rubric_sha256: rubricDefinitionHash(definition),
  };
}

function rubricResult(snapshot, {
  score = 98,
  technicalStatus = "PASS",
  technicalSeverity = "info",
} = {}) {
  const rubric = rubricDefinition();
  return {
    schema_version: "1.0",
    result_id: `rubric-result-${snapshot.artifact_set_digest.slice(0, 12)}`,
    rubric_id: rubric.rubric_id,
    rubric_version: rubric.version,
    rubric_sha256: rubric.rubric_sha256,
    subject: {
      artifact_id: snapshot.working_id,
      manifest_sha256: snapshot.artifact_set_digest,
    },
    benchmark_sha256: H.benchmark,
    evaluators: [
      {
        evaluator_id: "dom-validator",
        validator_kind: "deterministic",
        code_sha256: H.validator,
        model_id: null,
        prompt_sha256: null,
      },
      {
        evaluator_id: "visual-validator",
        validator_kind: "model",
        code_sha256: H.validator,
        model_id: "visual-model-pinned",
        prompt_sha256: H.prompt,
      },
    ],
    viewport_capture_ids: ["capture-360", "capture-800"],
    score,
    checks: [
      {
        check_id: "dom-integrity",
        dimension_id: "technical-integrity",
        evaluator_kind: "deterministic",
        evaluator_id: "dom-validator",
        issue_code:
          technicalStatus === "PASS" ? null : "DOM_INVALID",
        section_id: "section-hero",
        status: technicalStatus,
        severity: technicalSeverity,
        score: technicalStatus === "PASS" ? 100 : 0,
        confidence: 1,
        evidence_artifact_ids: ["dom-report"],
        evidence_locators: ["artifact://dom-report"],
      },
      {
        check_id: "visual-hierarchy",
        dimension_id: "visual-hierarchy",
        evaluator_kind: "model",
        evaluator_id: "visual-validator",
        issue_code: null,
        section_id: "section-hero",
        status: "PASS",
        severity: "info",
        score: 98,
        confidence: 0.98,
        evidence_artifact_ids: ["capture-360", "capture-800"],
        evidence_locators: [
          "artifact://capture-360",
          "artifact://capture-800",
        ],
      },
    ],
    evaluated_at: "2026-07-30T12:00:00.000Z",
  };
}

function qaBundle(snapshot, {
  score = 98,
  verdict = "PASS",
  hardFailures = [],
} = {}) {
  const receipt = {
    validation_id: `validation-studio-${snapshot.artifact_set_digest.slice(0, 12)}`,
    subject: {
      artifact_set_digest: snapshot.artifact_set_digest,
      artifact_ids: [snapshot.working_id],
    },
    validator: {
      name: "StudioCommitQa",
      version: "1.0.0",
      code_sha256: H.validator,
      agent_id: "studio-qa-agent",
      agent_session_id: "studio-qa-session",
    },
    producer: {
      agent_session_ids: ["studio-editor-session"],
    },
    policy: {
      policy_id: "policy.studio-final-qa.v1",
      policy_sha256: H.policy,
    },
    validator_kind: "deterministic",
    checks: [
      {
        check_id: "studio-exact-input",
        status: verdict,
        severity: "hard",
        evidence_artifact_ids: ["dom-report"],
      },
    ],
    score,
    hard_failures: hardFailures,
    verdict,
    started_at: "2026-07-30T12:00:00.000Z",
    finished_at: "2026-07-30T12:01:00.000Z",
  };
  return {
    receipt,
    context: {
      expectedPolicyId: "policy.studio-final-qa.v1",
      validatorAgentSessionId: "studio-qa-session",
      producerAgentSessionIds: ["studio-editor-session"],
      availableEvidenceArtifactIds: [
        "dom-report",
        "capture-360",
        "capture-800",
      ],
    },
  };
}

async function createFixture() {
  const projectRoot = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "studio-commit-")),
  );
  const assemblyRoot = path.join(projectRoot, "html", "assembly-source");
  const workingRoot = path.join(projectRoot, "studio", "working", "working-1");
  const sourceHtmlPath = path.join(assemblyRoot, "index.html");
  const assemblyManifestPath = path.join(assemblyRoot, "manifest.json");
  const workingHtmlPath = path.join(workingRoot, "index.html");
  const assetManifestPath = path.join(workingRoot, "asset-manifest.json");
  const assetPath = path.join(workingRoot, "assets", "hero.bin");
  const sourceHtml = html("처음 문구");
  const currentCopy = "Studio에서 다듬은 문구";
  const currentHtml = html(currentCopy);
  const assetBytes = Buffer.from("approved-image-fixture\n", "utf8");
  const assetManifest = {
    schema_version: "1.0",
    assets: [
      {
        artifact_id: "image-approved-001",
        path: "assets/hero.bin",
        bytes: assetBytes.length,
        sha256: sha256(assetBytes),
        approval_status: "approved",
        production_use_allowed: true,
      },
    ],
  };
  const assetManifestBytes = `${JSON.stringify(assetManifest, null, 2)}\n`;
  const assemblyManifest = {
    schema_version: "1.0",
    artifact_id: "assembly-artifact-001",
    html_sha256: sha256(sourceHtml),
    asset_manifest_sha256: sha256(assetManifestBytes),
  };
  const assemblyManifestBytes = `${JSON.stringify(
    assemblyManifest,
    null,
    2,
  )}\n`;

  await mkdir(path.dirname(sourceHtmlPath), { recursive: true });
  await mkdir(path.dirname(assetPath), { recursive: true });
  await writeFile(sourceHtmlPath, sourceHtml, "utf8");
  await writeFile(assemblyManifestPath, assemblyManifestBytes, "utf8");
  await writeFile(workingHtmlPath, currentHtml, "utf8");
  await writeFile(assetManifestPath, assetManifestBytes, "utf8");
  await writeFile(assetPath, assetBytes);

  const assembly = {
    artifact_id: "assembly-artifact-001",
    manifest_path: assemblyManifestPath,
    manifest_sha256: sha256(assemblyManifestBytes),
    html_path: sourceHtmlPath,
    html_sha256: sha256(sourceHtml),
    asset_manifest_sha256: sha256(assetManifestBytes),
  };
  const workingState = {
    working_id: "studio-working-001",
    root: workingRoot,
    imported_assembly_artifact_id: assembly.artifact_id,
    imported_assembly_manifest_sha256: assembly.manifest_sha256,
    imported_html_sha256: assembly.html_sha256,
    producer_agent_session_id: "studio-editor-session",
  };
  return {
    projectRoot,
    workingRoot,
    workingHtmlPath,
    assetPath,
    assembly,
    workingState,
    currentHtml,
    currentCopy,
  };
}

async function inspectFixture(fixture) {
  return inspectStudioWorkingState({
    projectRoot: fixture.projectRoot,
    assembly: fixture.assembly,
    workingState: fixture.workingState,
    editableHtmlContract: editableContract(
      fixture.currentHtml,
      fixture.currentCopy,
    ),
  });
}

function commitInput(fixture, snapshot, overrides = {}) {
  const qa = qaBundle(snapshot);
  return {
    projectRoot: fixture.projectRoot,
    assembly: fixture.assembly,
    workingState: fixture.workingState,
    editableHtmlContract: editableContract(
      fixture.currentHtml,
      fixture.currentCopy,
    ),
    expectedWorkingSnapshot: snapshot,
    rubricDefinition: rubricDefinition(),
    rubricResult: rubricResult(snapshot),
    qaReceipt: qa.receipt,
    qaContext: qa.context,
    thresholds: {
      qa_score: 97,
      target_score: 97,
      behance_weighted_target: 90,
      critical_dimension_target: 85,
    },
    committedAt: "2026-07-30T12:02:00.000Z",
    ...overrides,
  };
}

function committedRevisionArtifact(result) {
  const revision = result.revision;
  return {
    artifact_id: revision.artifact_id,
    type: "studio.committed_revision",
    manifest_sha256: revision.commit_sha256,
    member_ids: [...result.member_ids],
    member_manifest: structuredClone(result.member_manifest),
    revision_id: revision.revision_id,
    revision_commit_sha256: revision.commit_sha256,
    html_sha256: revision.html_sha256,
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
    hero_assurance_member: structuredClone(
      result.member_manifest.members.find(
        (member) => member.member_id === "hero-assurance.json",
      ),
    ),
    revision: structuredClone(revision),
    mutable: false,
  };
}

test("mutable working state를 exact 검수 뒤 immutable deterministic revision으로 원자 commit한다", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await inspectFixture(fixture);
    assert.match(snapshot.artifact_set_digest, /^[a-f0-9]{64}$/);
    assert.equal(snapshot.semantic_dom_diff.changed_copy_ids.length, 1);
    assert.deepEqual(snapshot.semantic_dom_diff.changed_copy_ids, [
      "copy-hero",
    ]);
    assert.equal(snapshot.asset_files.length, 1);

    const result = await commitStudioRevision(
      commitInput(fixture, snapshot),
    );
    assert.equal(result.status, "committed");
    assert.match(result.revision.revision_id, /^studio-rev-[a-f0-9]{20}$/);
    assert.equal(result.revision.revision_kind, "committed");
    assert.equal(result.revision.mutable, false);
    assert.equal(
      result.revision.source_working_artifact_set_digest,
      snapshot.artifact_set_digest,
    );
    assert.equal(result.revision.parent_commit_sha256, null);
    assert.match(result.revision.artifact_sha256, /^[a-f0-9]{64}$/);
    assert.match(result.revision.commit_sha256, /^[a-f0-9]{64}$/);
    assert.match(
      result.revision.hero_assurance_bundle_sha256,
      /^[a-f0-9]{64}$/,
    );
    assert.equal(result.member_manifest.policy, "materialized");
    assert.equal(
      result.member_ids.includes("hero-assurance.json"),
      true,
    );
    assert.deepEqual(
      result.member_ids,
      result.member_manifest.members.map(
        (member) => member.member_id,
      ),
    );
    assert.equal(
      result.member_manifest.members.some(
        (member) =>
          member.member_id === "index.html" &&
          member.root_id === "project" &&
          member.locator.endsWith("/index.html") &&
          /^[a-f0-9]{64}$/.test(member.sha256) &&
          Number.isSafeInteger(member.size_bytes),
      ),
      true,
    );
    assert.equal(
      await readFile(path.join(result.revision_path, "index.html"), "utf8"),
      fixture.currentHtml,
    );
    assert.deepEqual(
      await readFile(path.join(result.revision_path, "assets", "hero.bin")),
      await readFile(fixture.assetPath),
    );
    const committedHeroAssurance = JSON.parse(
      await readFile(
        path.join(result.revision_path, "hero-assurance.json"),
        "utf8",
      ),
    );
    assert.equal(
      committedHeroAssurance.validation_receipt.verdict,
      "PASS",
    );
    assert.equal(
      path.relative(
        path.join(fixture.projectRoot, "studio", "revisions"),
        result.revision_path,
      ).startsWith(".."),
      false,
    );

    const revisionEntries = await readdir(
      path.join(fixture.projectRoot, "studio", "revisions"),
    );
    assert.deepEqual(revisionEntries, [result.revision.revision_id]);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("같은 exact inputs는 기존 revision을 재사용하고 중복·staging을 남기지 않는다", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await inspectFixture(fixture);
    const input = commitInput(fixture, snapshot);
    const first = await commitStudioRevision(input);
    const second = await commitStudioRevision(input);

    assert.equal(second.status, "committed");
    assert.equal(second.idempotent_reuse, true);
    assert.deepEqual(
      second.member_manifest,
      first.member_manifest,
    );
    assert.equal(
      second.revision.revision_id,
      first.revision.revision_id,
    );
    assert.equal(
      second.revision.commit_sha256,
      first.revision.commit_sha256,
    );
    const entries = await readdir(
      path.join(fixture.projectRoot, "studio", "revisions"),
    );
    assert.deepEqual(entries, [first.revision.revision_id]);
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("이후 working 수정은 기존 revision을 바꾸지 않고 parent가 있는 새 revision만 만든다", async () => {
  const fixture = await createFixture();
  try {
    const firstSnapshot = await inspectFixture(fixture);
    const first = await commitStudioRevision(
      commitInput(fixture, firstSnapshot),
    );
    const firstHtmlBefore = await readFile(
      path.join(first.revision_path, "index.html"),
      "utf8",
    );

    fixture.currentCopy = "두 번째 Studio 수정 문구";
    fixture.currentHtml = html(fixture.currentCopy);
    await writeFile(
      fixture.workingHtmlPath,
      fixture.currentHtml,
      "utf8",
    );
    const secondSnapshot = await inspectFixture(fixture);
    const second = await commitStudioRevision(
      commitInput(fixture, secondSnapshot, {
        previousRevision: {
          revision_id: first.revision.revision_id,
          commit_sha256: first.revision.commit_sha256,
        },
        committedAt: "2026-07-30T12:03:00.000Z",
      }),
    );

    assert.notEqual(
      second.revision.revision_id,
      first.revision.revision_id,
    );
    assert.equal(
      second.revision.parent_commit_sha256,
      first.revision.commit_sha256,
    );
    assert.equal(
      await readFile(path.join(first.revision_path, "index.html"), "utf8"),
      firstHtmlBefore,
    );
    assert.equal(
      await readFile(path.join(second.revision_path, "index.html"), "utf8"),
      fixture.currentHtml,
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("rubric 또는 QA subject가 현재 working exact digest와 다르면 commit하지 않는다", async (t) => {
  const fixture = await createFixture();
  try {
    const snapshot = await inspectFixture(fixture);
    await t.test("rubric subject mismatch", async () => {
      const invalidRubric = rubricResult(snapshot);
      invalidRubric.subject.manifest_sha256 = "f".repeat(64);
      await assert.rejects(
        commitStudioRevision(
          commitInput(fixture, snapshot, {
            rubricResult: invalidRubric,
          }),
        ),
        (error) => error.code === "RUBRIC_SUBJECT_DIGEST_MISMATCH",
      );
    });

    await t.test("QA subject mismatch", async () => {
      const qa = qaBundle(snapshot);
      qa.receipt.subject.artifact_set_digest = "f".repeat(64);
      await assert.rejects(
        commitStudioRevision(
          commitInput(fixture, snapshot, {
            qaReceipt: qa.receipt,
            qaContext: qa.context,
          }),
        ),
        (error) => error.code === "INVALID_VALIDATION_RECEIPT",
      );
    });

    assert.equal(
      await readdir(path.join(fixture.projectRoot, "studio")).then(
        (entries) => entries.includes("revisions"),
      ),
      false,
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("hard failure 또는 QA·rubric threshold 미달은 immutable commit을 차단한다", async (t) => {
  const fixture = await createFixture();
  try {
    const snapshot = await inspectFixture(fixture);
    await t.test("rubric hard failure", async () => {
      const failed = rubricResult(snapshot, {
        score: 100,
        technicalStatus: "FAIL",
        technicalSeverity: "hard",
      });
      await assert.rejects(
        commitStudioRevision(
          commitInput(fixture, snapshot, {
            rubricResult: failed,
          }),
        ),
        (error) => error.code === "RUBRIC_GATE_FAILED",
      );
    });

    await t.test("rubric score threshold", async () => {
      const low = rubricResult(snapshot, { score: 89 });
      await assert.rejects(
        commitStudioRevision(
          commitInput(fixture, snapshot, {
            rubricResult: low,
          }),
        ),
        (error) => error.code === "RUBRIC_GATE_FAILED",
      );
    });

    await t.test("QA score threshold", async () => {
      const qa = qaBundle(snapshot, { score: 96 });
      await assert.rejects(
        commitStudioRevision(
          commitInput(fixture, snapshot, {
            qaReceipt: qa.receipt,
            qaContext: qa.context,
          }),
        ),
        (error) => error.code === "QA_THRESHOLD_NOT_MET",
      );
    });
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("asset manifest hash·파일 bytes 또는 working snapshot 변경은 commit 전에 거부한다", async (t) => {
  const fixture = await createFixture();
  try {
    const snapshot = await inspectFixture(fixture);
    await t.test("asset bytes tampered", async () => {
      await writeFile(fixture.assetPath, "tampered asset\n", "utf8");
      await assert.rejects(
        commitStudioRevision(commitInput(fixture, snapshot)),
        (error) => error.code === "ASSET_INTEGRITY_MISMATCH",
      );
      await writeFile(
        fixture.assetPath,
        "approved-image-fixture\n",
        "utf8",
      );
    });

    await t.test("working HTML changed after QA", async () => {
      await writeFile(
        fixture.workingHtmlPath,
        html("검수 뒤 몰래 바뀐 문구"),
        "utf8",
      );
      await assert.rejects(
        commitStudioRevision(commitInput(fixture, snapshot)),
        (error) => error.code === "WORKING_SNAPSHOT_CHANGED",
      );
    });
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("previous revision parent hash는 실제 immutable revision과 일치해야 한다", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await inspectFixture(fixture);
    await assert.rejects(
      commitStudioRevision(
        commitInput(fixture, snapshot, {
          previousRevision: {
            revision_id: "studio-rev-does-not-exist",
            commit_sha256: "f".repeat(64),
          },
        }),
      ),
      (error) => error.code === "PARENT_REVISION_NOT_FOUND",
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("revision ID는 content·assembly·rubric·QA·parent exact digest의 canonical hash다", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await inspectFixture(fixture);
    const rubric = rubricResult(snapshot);
    const qa = qaBundle(snapshot);
    const result = await commitStudioRevision(
      commitInput(fixture, snapshot, {
        rubricResult: rubric,
        qaReceipt: qa.receipt,
        qaContext: qa.context,
      }),
    );
    const expectedInputs = {
      assembly_manifest_sha256: fixture.assembly.manifest_sha256,
      working_artifact_set_digest: snapshot.artifact_set_digest,
      rubric_result_sha256: canonicalSha256(rubric),
      qa_receipt_sha256: canonicalSha256(qa.receipt),
      hero_assurance_manifest_sha256:
        snapshot.hero_assurance_manifest_sha256,
      hero_assurance_validation_receipt_sha256:
        snapshot.hero_assurance_validation_receipt_sha256,
      hero_commercial_validation_receipt_sha256:
        snapshot.hero_commercial_validation_receipt_sha256,
      hero_identity_validation_receipt_sha256:
        snapshot.hero_identity_validation_receipt_sha256,
      hero_assurance_bundle_sha256:
        snapshot.hero_assurance_bundle_sha256,
      parent_commit_sha256: null,
    };
    assert.equal(
      result.revision.revision_id,
      `studio-rev-${canonicalSha256(expectedInputs).slice(0, 20)}`,
    );
  } finally {
    await rm(fixture.projectRoot, { recursive: true, force: true });
  }
});

test("G4Q/G5는 materialized Hero bundle과 모든 receipt bytes를 다시 검증한다", async (t) => {
  await t.test("valid materialized bundle", async () => {
    const fixture = await createFixture();
    try {
      const snapshot = await inspectFixture(fixture);
      const committed = await commitStudioRevision(
        commitInput(fixture, snapshot),
      );
      const artifact = committedRevisionArtifact(committed);
      const g4 = await verifyMaterializedHeroAssurance({
        projectRoot: fixture.projectRoot,
        revisionArtifact: artifact,
        consumerStage: "G4Q_RUBRIC",
      });
      const g5 = await verifyMaterializedHeroAssurance({
        projectRoot: fixture.projectRoot,
        revisionArtifact: artifact,
        consumerStage: "G5_PUBLISH_QA",
      });
      assert.equal(g4.status, "verified");
      assert.equal(g5.status, "verified");
    } finally {
      await rm(fixture.projectRoot, { recursive: true, force: true });
    }
  });

  await t.test("fake hash fields without bundle", async () => {
    const fake = {
      artifact_id: "fake-studio-artifact",
      type: "studio.committed_revision",
      manifest_sha256: "a".repeat(64),
      mutable: false,
      member_manifest: {
        schema_version: "1.0",
        policy: "materialized",
        members: [],
      },
    };
    await assert.rejects(
      verifyMaterializedHeroAssurance({
        projectRoot: os.tmpdir(),
        revisionArtifact: fake,
        consumerStage: "G5_PUBLISH_QA",
      }),
      (error) =>
        error.code === "HERO_ASSURANCE_MEMBER_REQUIRED",
    );
  });

  await t.test("artifact field removal", async () => {
    const fixture = await createFixture();
    try {
      const snapshot = await inspectFixture(fixture);
      const committed = await commitStudioRevision(
        commitInput(fixture, snapshot),
      );
      const artifact = committedRevisionArtifact(committed);
      delete artifact.hero_identity_validation_receipt_sha256;
      await assert.rejects(
        verifyMaterializedHeroAssurance({
          projectRoot: fixture.projectRoot,
          revisionArtifact: artifact,
          consumerStage: "G4Q_RUBRIC",
        }),
        (error) =>
          error.code ===
          "HERO_ASSURANCE_ARTIFACT_FIELD_MISMATCH",
      );
    } finally {
      await rm(fixture.projectRoot, { recursive: true, force: true });
    }
  });

  await t.test("materialized bundle bytes tamper", async () => {
    const fixture = await createFixture();
    try {
      const snapshot = await inspectFixture(fixture);
      const committed = await commitStudioRevision(
        commitInput(fixture, snapshot),
      );
      const artifact = committedRevisionArtifact(committed);
      await writeFile(
        path.join(committed.revision_path, "hero-assurance.json"),
        '{"tampered":true}\n',
        "utf8",
      );
      await assert.rejects(
        verifyMaterializedHeroAssurance({
          projectRoot: fixture.projectRoot,
          revisionArtifact: artifact,
          consumerStage: "G5_PUBLISH_QA",
        }),
        (error) =>
          error.code ===
          "HERO_ASSURANCE_MEMBER_INTEGRITY_MISMATCH",
      );
    } finally {
      await rm(fixture.projectRoot, { recursive: true, force: true });
    }
  });
});
