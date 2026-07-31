import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildReferenceArtifactSet,
} from "../orchestration/reference-artifact-set.mjs";

test("기존 output과 사용자 기준 HTML을 역할별 profile로 만든다", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-reference-set-"),
  );
  const project = path.join(root, "projects", "sample");
  const current = path.join(project, "output", "detail-page.html");
  const reference = path.join(root, "reference.html");
  try {
    await mkdir(path.dirname(current), { recursive: true });
    await writeFile(
      current,
      '<section data-section-role="hero"><h1>현재</h1><img src="media/current.png"></section>',
      "utf8",
    );
    await writeFile(
      reference,
      '<style>#detailPage{max-width:780px}</style><section data-section-role="hero"><h1>기준</h1><img src="media/hero.png"></section><section data-section-role="usage"><img src="media/usage.gif"></section>',
      "utf8",
    );
    const result = await buildReferenceArtifactSet({
      projectRoot: project,
      workspaceRoot: root,
      references: [
        {
          filePath: reference,
          role: "positive_reference",
        },
      ],
    });
    assert.equal(result.artifacts.length, 2);
    assert.match(result.profile_set_sha256, /^[a-f0-9]{64}$/);
    const baseline = result.artifacts.find(
      (artifact) => artifact.role === "current_output",
    );
    const positive = result.artifacts.find(
      (artifact) => artifact.role === "positive_reference",
    );
    assert.equal(baseline.profile.section_count, 1);
    assert.equal(positive.profile.section_count, 2);
    assert.equal(positive.profile.motion_reference_count, 1);
    assert.deepEqual(positive.profile.width_hints_px, [780]);
    assert.deepEqual(positive.profile.section_role_sequence, [
      "hero",
      "usage",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
