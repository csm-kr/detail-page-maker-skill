import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectLearningCandidates,
  renderCandidateReport,
} from "../../skills/detail-page-maker-skill/scripts/maintenance/distill-learnings.mjs";

async function writeLearning(root, projectId, markdown) {
  const planning = path.join(root, projectId, ".detail-page", "planning");
  await mkdir(planning, { recursive: true });
  await writeFile(path.join(planning, "LEARNINGS.md"), markdown, "utf8");
}

test("학습 증류는 candidate-shared Markdown만 모으고 바이너리를 복사하지 않는다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-learning-"));
  try {
    await writeLearning(
      root,
      "project-a",
      [
        "# A",
        "## LEARN-001",
        "- `category`: workflow",
        "- `scope`: candidate-shared",
        "- `source_type`: feedback",
        "- `observation`: 결과 진입점을 하나로 고정한다.",
        "- `evidence_paths`: qa/captures/final.png",
        "- `promotion_status`: validated",
        "## LEARN-002",
        "- `category`: product-fact",
        "- `scope`: project-only",
        "- `observation`: 이 상품의 길이는 47cm다.",
        "- `promotion_status`: local",
      ].join("\n"),
    );
    await writeFile(path.join(root, "project-a", "capture.png"), "binary", "utf8");

    const candidates = await collectLearningCandidates(root);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].learningId, "LEARN-001");
    assert.equal(candidates[0].scope, "candidate-shared");
    assert.equal(candidates[0].track, "feedback");
    assert.equal(candidates[0].ownerReference, "taste.md");
    assert.equal(
      candidates[0].sourceFile,
      "project-a/.detail-page/planning/LEARNINGS.md",
    );

    const report = renderCandidateReport(candidates, root);
    assert.match(report, /<projects-root>\/\*\/\.detail-page\/planning\/LEARNINGS\.md/);
    assert.match(report, /결과 진입점을 하나로 고정한다/);
    assert.doesNotMatch(report, /이 상품의 길이는 47cm/);
    assert.match(report, /바이너리 근거를 복사하지 않는다/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Behance 검토 Markdown은 commercial 트랙으로만 라우팅한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-learning-"));
  try {
    const reviewed = path.join(root, "learning", "behance", "reviewed.md");
    await mkdir(path.dirname(reviewed), { recursive: true });
    await writeFile(
      reviewed,
      [
        "# Behance review",
        "### LEARN-BH-001",
        "- `category`: commercial",
        "- `scope`: candidate-shared",
        "- `source_type`: behance",
        "- `observation`: 문제 다음 블록에서 시각 근거로 답한다.",
        "- `owner_reference`: taste.md",
        "- `promotion_status`: validated",
      ].join("\n"),
      "utf8",
    );

    const candidates = await collectLearningCandidates(
      path.join(root, "projects"),
      [reviewed],
    );
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].track, "behance");
    assert.equal(candidates[0].ownerReference, "commercial.md");

    const report = renderCandidateReport(candidates);
    assert.match(report, /\| behance \| commercial \| validated \| commercial\.md \|/);
    assert.match(report, /승격이 끝나면 원문과 후보 Markdown을 삭제한다/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HyperFrames 조사와 GIF 제작 피드백은 motion 트랙으로만 라우팅한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "detail-learning-"));
  try {
    const reviewed = path.join(root, "learning", "gif", "reviewed.md");
    await mkdir(path.dirname(reviewed), { recursive: true });
    await writeFile(
      reviewed,
      [
        "# GIF review",
        "### LEARN-GIF-001",
        "- `category`: motion",
        "- `scope`: candidate-shared",
        "- `source_type`: hyperframes",
        "- `observation`: 치수선은 실제 경로 길이로 그린다.",
        "- `owner_reference`: taste.md",
        "- `promotion_status`: validated",
      ].join("\n"),
      "utf8",
    );
    await writeLearning(
      path.join(root, "projects"),
      "project-gif",
      [
        "# feedback",
        "### LEARN-GIF-FB-001",
        "- `category`: gif",
        "- `scope`: candidate-shared",
        "- `source_type`: feedback",
        "- `observation`: 손 구조 GIF는 손끝을 자르지 않는다.",
        "- `owner_reference`: taste.md",
        "- `promotion_status`: validated",
      ].join("\n"),
    );

    const candidates = await collectLearningCandidates(
      path.join(root, "projects"),
      [reviewed],
    );
    assert.equal(candidates.length, 2);
    assert.deepEqual(
      candidates.map((item) => item.track).sort(),
      ["gif-feedback", "gif-research"],
    );
    assert.ok(candidates.every((item) => item.ownerReference === "motion.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
