import { createHash } from "node:crypto";

export const ARTIFACT_EDGE_RELATIONS = Object.freeze([
  "evidence_for",
  "identity_reference_for",
  "claim_used_by",
  "media_fills_slot",
  "motion_derived_from",
  "section_contains",
  "revision_of",
  "evaluates",
  "repairs",
]);

export class ArtifactGraphError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ArtifactGraphError";
    this.code = code;
    this.details = details;
  }
}

function assertSha256(value, field) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ""))) {
    throw new ArtifactGraphError(
      "INVALID_ARTIFACT_HASH",
      `${field}는 SHA-256이어야 합니다.`,
      { field },
    );
  }
}

function canonicalInput(input) {
  return {
    artifact_id: String(input.artifact_id),
    manifest_sha256: String(input.manifest_sha256),
    member_ids: [...(input.member_ids ?? [])].map(String).sort(),
    relation: String(input.relation),
  };
}

export function artifactSetDigest(inputs) {
  const canonical = [...inputs]
    .map(canonicalInput)
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export class ArtifactGraph {
  #artifacts = new Map();

  #outgoing = new Map();

  constructor(snapshot = undefined) {
    for (const artifact of snapshot?.artifacts ?? []) {
      this.#artifacts.set(artifact.artifact_id, structuredClone(artifact));
    }
    for (const edge of snapshot?.edges ?? []) {
      const edges = this.#outgoing.get(edge.from) ?? [];
      edges.push(structuredClone(edge));
      this.#outgoing.set(edge.from, edges);
    }
  }

  addArtifact(artifact, inputEdges = []) {
    if (!artifact?.artifact_id || !artifact?.type) {
      throw new ArtifactGraphError(
        "INVALID_ARTIFACT",
        "artifact_id와 type이 필요합니다.",
      );
    }
    assertSha256(artifact.manifest_sha256, "manifest_sha256");
    if (this.#artifacts.has(artifact.artifact_id)) {
      throw new ArtifactGraphError(
        "ARTIFACT_ALREADY_EXISTS",
        "artifact_id는 immutable하며 재사용할 수 없습니다.",
        { artifact_id: artifact.artifact_id },
      );
    }

    const resolvedInputs = inputEdges.map((edge) => {
      if (!ARTIFACT_EDGE_RELATIONS.includes(edge.relation)) {
        throw new ArtifactGraphError(
          "INVALID_EDGE_RELATION",
          "허용되지 않은 artifact edge relation입니다.",
          { relation: edge.relation },
        );
      }
      const source = this.#artifacts.get(edge.from);
      if (!source) {
        throw new ArtifactGraphError(
          "INPUT_ARTIFACT_NOT_FOUND",
          "입력 artifact를 찾을 수 없습니다.",
          { artifact_id: edge.from },
        );
      }
      if (source.status === "stale") {
        throw new ArtifactGraphError(
          "STALE_INPUT_ARTIFACT",
          "stale artifact를 새 산출물의 입력으로 사용할 수 없습니다.",
          { artifact_id: edge.from },
        );
      }
      return {
        artifact_id: source.artifact_id,
        manifest_sha256: source.manifest_sha256,
        member_ids: source.member_ids ?? [],
        relation: edge.relation,
      };
    });

    const committed = {
      ...structuredClone(artifact),
      member_ids: [...(artifact.member_ids ?? [])].map(String).sort(),
      status: "fresh",
      input_set_digest: artifactSetDigest(resolvedInputs),
    };
    this.#artifacts.set(committed.artifact_id, committed);
    for (const edge of inputEdges) {
      const outgoing = this.#outgoing.get(edge.from) ?? [];
      outgoing.push({
        from: edge.from,
        to: committed.artifact_id,
        relation: edge.relation,
      });
      this.#outgoing.set(edge.from, outgoing);
    }
    return structuredClone(committed);
  }

  get(artifactId) {
    const artifact = this.#artifacts.get(artifactId);
    return artifact ? structuredClone(artifact) : undefined;
  }

  invalidateDescendants(rootArtifactIds, reason) {
    const queue = [...new Set(rootArtifactIds)];
    const visited = new Set(queue);
    const invalidated = [];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const edge of this.#outgoing.get(current) ?? []) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        queue.push(edge.to);
        const artifact = this.#artifacts.get(edge.to);
        artifact.status = "stale";
        artifact.stale_reason = reason;
        invalidated.push(edge.to);
      }
    }
    return invalidated;
  }

  snapshot() {
    return {
      artifacts: [...this.#artifacts.values()].map((artifact) =>
        structuredClone(artifact),
      ),
      edges: [...this.#outgoing.values()]
        .flat()
        .map((edge) => structuredClone(edge)),
    };
  }
}
