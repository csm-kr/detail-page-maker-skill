import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactGraph,
  artifactSetDigest,
} from "../../skills/detail-page-maker-skill/scripts/orchestration/artifact-graph.mjs";

const H = {
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
  d: "d".repeat(64),
};

function ref(artifactId, manifestSha256, memberIds = []) {
  return {
    artifact_id: artifactId,
    manifest_sha256: manifestSha256,
    member_ids: memberIds,
  };
}

test("artifact set digest는 입력 순서와 member 순서에 무관하다", () => {
  const first = artifactSetDigest([
    { ...ref("b", H.b, ["m2", "m1"]), relation: "evidence_for" },
    { ...ref("a", H.a, ["m3"]), relation: "identity_reference_for" },
  ]);
  const second = artifactSetDigest([
    { ...ref("a", H.a, ["m3"]), relation: "identity_reference_for" },
    { ...ref("b", H.b, ["m1", "m2"]), relation: "evidence_for" },
  ]);

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("허용되지 않은 edge relation은 commit 전에 거부한다", () => {
  const graph = new ArtifactGraph();
  graph.addArtifact({
    ...ref("supplier", H.a),
    type: "evidence.supplier_snapshot",
  });

  assert.throws(
    () =>
      graph.addArtifact(
        { ...ref("plan", H.b), type: "production.plan" },
        [{ from: "supplier", relation: "invented_relation" }],
      ),
    (error) => error.code === "INVALID_EDGE_RELATION",
  );
});

test("한 입력이 바뀌면 그 descendant만 stale되고 형제 산출물은 유지된다", () => {
  const graph = new ArtifactGraph();
  graph.addArtifact({
    ...ref("supplier", H.a),
    type: "evidence.supplier_snapshot",
  });
  graph.addArtifact(
    { ...ref("plan", H.b), type: "production.plan" },
    [{ from: "supplier", relation: "evidence_for" }],
  );
  graph.addArtifact(
    { ...ref("image", H.c), type: "media.image_approved" },
    [{ from: "plan", relation: "claim_used_by" }],
  );
  graph.addArtifact(
    { ...ref("html", H.d), type: "page.html_revision" },
    [{ from: "image", relation: "media_fills_slot" }],
  );
  graph.addArtifact({
    ...ref("benchmark", "1".repeat(64)),
    type: "research.benchmark_snapshot",
  });

  const invalidated = graph.invalidateDescendants(["plan"], "plan-revision");

  assert.deepEqual(invalidated, ["image", "html"]);
  assert.equal(graph.get("plan").status, "fresh");
  assert.equal(graph.get("image").status, "stale");
  assert.equal(graph.get("html").status, "stale");
  assert.equal(graph.get("supplier").status, "fresh");
  assert.equal(graph.get("benchmark").status, "fresh");
});

test("commit은 산출물과 입력 edge의 exact artifact-set digest를 기록한다", () => {
  const graph = new ArtifactGraph();
  graph.addArtifact({
    ...ref("supplier", H.a, ["page", "detail"]),
    type: "evidence.supplier_snapshot",
  });
  graph.addArtifact({
    ...ref("market", H.b, ["reviews"]),
    type: "evidence.market_snapshot",
  });
  const committed = graph.addArtifact(
    { ...ref("plan", H.c), type: "production.plan" },
    [
      { from: "supplier", relation: "evidence_for" },
      { from: "market", relation: "evidence_for" },
    ],
  );

  assert.equal(
    committed.input_set_digest,
    artifactSetDigest([
      {
        ...ref("supplier", H.a, ["page", "detail"]),
        relation: "evidence_for",
      },
      {
        ...ref("market", H.b, ["reviews"]),
        relation: "evidence_for",
      },
    ]),
  );
});
