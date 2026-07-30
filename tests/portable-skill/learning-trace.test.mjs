import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildLearningStatus,
  renderLearningStatus,
} from "../../skills/detail-page-maker-skill/scripts/maintenance/learning-status.mjs";

const SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../skills/detail-page-maker-skill",
);

test("학습 상태는 Behance·GIF 조사·제작 피드백의 최종 규칙 위치를 구분한다", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "learning-status-"));
  try {
    const behanceRoot = path.join(
      workspace,
      ".workspace",
      "learning",
      "behance",
    );
    await mkdir(behanceRoot, { recursive: true });
    await writeFile(path.join(behanceRoot, "inbox.md"), "# inbox\n", "utf8");
    await writeFile(
      path.join(behanceRoot, "reviewed.md"),
      "### LEARN-BH-001\n",
      "utf8",
    );
    const gifRoot = path.join(workspace, ".workspace", "learning", "gif");
    await mkdir(gifRoot, { recursive: true });
    await writeFile(path.join(gifRoot, "inbox.md"), "# inbox\n", "utf8");
    await writeFile(
      path.join(gifRoot, "reviewed.md"),
      "### LEARN-GIF-001\n",
      "utf8",
    );
    const projectLearning = path.join(
      workspace,
      ".workspace",
      "projects",
      "product-a",
      ".detail-page",
      "planning",
    );
    await mkdir(projectLearning, { recursive: true });
    await writeFile(
      path.join(projectLearning, "LEARNINGS.md"),
      "### LEARN-PROJECT-001\n",
      "utf8",
    );

    const report = await buildLearningStatus({
      workspaceRoot: workspace,
      skillRoot: SKILL_ROOT,
    });
    assert.equal(report.files.behanceInbox.exists, true);
    assert.equal(report.files.behanceReviewed.exists, true);
    assert.equal(report.counts.reviewedBehanceLearnings, 1);
    assert.equal(report.counts.reviewedGifLearnings, 1);
    assert.equal(report.counts.projectFeedbackLearnings, 1);
    assert.ok(report.counts.commercialRules >= 1);
    assert.ok(report.counts.tasteRules >= 1);
    assert.ok(report.counts.motionRules >= 1);
    assert.deepEqual(report.flows.behance.slice(-2), [
      "commercialReference",
      "delete transient source",
    ]);
    assert.deepEqual(report.flows.feedback.slice(-2), [
      "tasteReference or motionReference by category",
      "delete promoted source block",
    ]);
    assert.deepEqual(report.flows.gifResearch.slice(-2), [
      "motionReference",
      "delete transient source",
    ]);

    const output = renderLearningStatus(report);
    assert.match(output, /Behance 검증 규칙의 실제 반영 위치/);
    assert.match(output, /일반 제작 피드백 규칙의 반영 위치/);
    assert.match(output, /GIF 조사·GIF 피드백 규칙의 반영 위치/);
    assert.match(output, /commercial\.md/);
    assert.match(output, /taste\.md/);
    assert.match(output, /motion\.md/);
    assert.match(output, /\.detail-page[\\/]planning[\\/]LEARNINGS\.md/);
    assert.doesNotMatch(
      output,
      /projects[\\/]\*[\\/]planning[\\/]LEARNINGS\.md/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Behance 수집기는 배경 Browser Harness를 쓰고 Markdown만 저장한다", async () => {
  const script = await readFile(
    path.join(
      SKILL_ROOT,
      "scripts",
      "maintenance",
      "refresh-behance-study.ps1",
    ),
    "utf8",
  );
  assert.match(script, /new_background_tab/);
  assert.match(script, /document\.hasFocus/);
  assert.match(script, /inbox\.md/);
  assert.match(script, /reviewed\.md/);
  assert.match(script, /promotion=references\/commercial\.md/);
  assert.doesNotMatch(script, /state\.json/);
  assert.doesNotMatch(script, /WriteAllText\([^)]*\.(?:png|jpe?g|gif)/i);
});

test("HyperFrames 수집기는 공식 저장소를 배경 조사하고 motion.md로만 승격한다", async () => {
  const script = await readFile(
    path.join(
      SKILL_ROOT,
      "scripts",
      "maintenance",
      "refresh-hyperframes-study.ps1",
    ),
    "utf8",
  );
  assert.match(script, /new_background_tab/);
  assert.match(script, /document\.hasFocus/);
  assert.match(script, /heygen-com\/hyperframes/);
  assert.match(script, /promotion=references\/motion\.md/);
  assert.doesNotMatch(script, /WriteAllText\([^)]*\.(?:png|jpe?g|gif)/i);
});

test("승격된 Behance 규칙은 적용 경계와 출처 게이트만 남긴다", async () => {
  const commercial = await readFile(
    path.join(SKILL_ROOT, "references", "commercial.md"),
    "utf8",
  );

  assert.match(commercial, /\| CR-008 \|[^]*호환 범위[^]*제외 조건/);
  assert.match(commercial, /\| CR-009 \|[^]*사용 장면·불편[^]*구성·규격/);
  assert.match(commercial, /\| CR-010 \|[^]*같은 SKU의 독립 출처/);
  assert.doesNotMatch(commercial, /behance\.net\/gallery\//i);
});

test("GIF 피드백 규칙은 미제공 소품과 제품 밖 치수선을 차단한다", async () => {
  const motion = await readFile(
    path.join(SKILL_ROOT, "references", "motion.md"),
    "utf8",
  );
  const template = await readFile(
    path.join(SKILL_ROOT, "assets", "project-template", "GIF.md"),
    "utf8",
  );

  assert.match(motion, /\| MR-002 \|[^]*제품 중앙 축[^]*자 옆이나 빈 배경/);
  assert.match(motion, /\| MR-007 \|[^]*파우치[^]*구성품/);
  assert.match(motion, /\| MR-008 \|[^]*안전영역[^]*문자 상자 교차 0건/);
  assert.match(template, /`included_prop_gate`: product-only \| verified-included/);
  assert.match(template, /`text_safe_regions`:/);
  assert.match(template, /`text_overlap`:/);
});
