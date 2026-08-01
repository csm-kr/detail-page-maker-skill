import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildHyperframesCommandPlan,
} from "../orchestration/adapters/hyperframes-adapter.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

test("HyperFrames는 MP4를 한 번 렌더하고 FFmpeg로 GIF·WebP를 파생한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hyperframes-ffmpeg-"));
  try {
    const packageRoot = path.join(root, "node_modules", "hyperframes");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "hyperframes", version: "1.0.0-test", bin: { hyperframes: "cli.mjs" } }),
    );
    await writeFile(path.join(packageRoot, "cli.mjs"), "#!/usr/bin/env node\n");

    const semantic = {
      customer_question: "어디가 다른가",
      feature_part: "제품 중심 구조",
      start_state: "전체 제품",
      mid_state: "기능 위치 강조",
      end_state: "전체 제품과 기능 요약",
      visible_delta: "SVG 콜아웃이 기능 위치와 이유를 순차 설명",
      template_id: "T3_FEATURE_HOTSPOT",
      one_message: true,
      answer_within_seconds: 1,
      information_delivery_mode: "fixed_product_graphic_composite",
      decorative_overlay_only: false,
      product_geometry_locked: true,
      generative_product_morphing_allowed: false,
    };
    const appliedRuleIds = ["MR-013"];
    const briefText = [
      semantic.customer_question,
      semantic.feature_part,
      semantic.start_state,
      semantic.mid_state,
      semantic.end_state,
      semantic.visible_delta,
      ...appliedRuleIds,
    ].join("\n");
    const briefPath = path.join(root, "BRIEF.md");
    await writeFile(briefPath, briefText);
    const briefDigest = sha256(briefText);
    const identity = "a".repeat(64);
    const referenceDigest = "b".repeat(64);
    const knowledgeDigest = "c".repeat(64);
    const compiledContract = sha256(canonicalJson({
      semantic_contract: semantic,
      applied_rule_ids: appliedRuleIds,
      reference_profile_digest: referenceDigest,
      knowledge_rule_packet_digest: knowledgeDigest,
    }));
    const chain = {
      brief: {
        artifact_id: "brief-1",
        digest: briefDigest,
        source_identity_digest: identity,
        source_image_artifact_ids: ["image-1"],
        created_at: "2026-08-01T00:00:00.000Z",
        semantic_contract: semantic,
        applied_rule_ids: appliedRuleIds,
        reference_profile_digest: referenceDigest,
        knowledge_rule_packet_digest: knowledgeDigest,
        compiled_contract_sha256: compiledContract,
      },
      motion_project: {
        digest: "d".repeat(64),
        source_identity_digest: identity,
        brief_digest: briefDigest,
        created_at: "2026-08-01T00:01:00.000Z",
      },
      preview: {
        digest: "e".repeat(64),
        source_identity_digest: identity,
        motion_project_digest: "d".repeat(64),
        created_at: "2026-08-01T00:02:00.000Z",
      },
      preview_approval: {
        digest: "f".repeat(64),
        source_identity_digest: identity,
        subject_preview_digest: "e".repeat(64),
        decision: "approved",
        created_at: "2026-08-01T00:03:00.000Z",
      },
    };

    const plan = await buildHyperframesCommandPlan({
      mode: "render",
      projectRoot: root,
      briefPath,
      chain,
      expectedPreviewApprovalDigest: "f".repeat(64),
      allowedStagingRoot: root,
      stagingRoot: root,
      idempotencyKey: "9".repeat(64),
      previewPort: 4173,
      durationSec: 4,
      renderFps: 30,
      gifFps: 15,
      fallback: {
        static_artifact_id: "poster-1",
        reason: "reduced motion and offscreen poster",
        object_fit: "contain",
      },
    });

    assert.equal(plan.render_commands.length, 3);
    assert.equal(plan.render_commands[0].step_id, "final-render");
    assert.ok(plan.render_commands[0].argv.includes("mp4"));
    assert.equal(plan.render_commands[1].command, "ffmpeg");
    assert.equal(plan.render_commands[1].step_id, "ffmpeg-gif-derivative");
    assert.equal(plan.render_commands[2].command, "ffmpeg");
    assert.equal(plan.render_commands[2].step_id, "ffmpeg-animated-webp-derivative");
    assert.equal(
      plan.render_commands.some(
        (command) => command.command !== "ffmpeg" && command.argv.includes("gif"),
      ),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
