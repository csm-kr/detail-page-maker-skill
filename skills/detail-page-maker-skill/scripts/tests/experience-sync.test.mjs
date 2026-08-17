import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseExperienceDocument,
  syncTrustedExperiences,
} from "../maintenance/experience-sync.mjs";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeReference(root, name, prefix) {
  const body = `# ${name}

## 누적 규칙

| ID | 계속 적용할 규칙 | 검증 기준 | 갱신일 |
| --- | --- | --- | --- |
| ${prefix}-001 | 기존 규칙 | 기존 검증 | 2026-07-01 |
`;
  const target = path.join(root, "references", name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body, "utf8");
}

test("빈 optional 필드는 다음 경험 필드를 삼키지 않는다", () => {
  const [experience] = parseExperienceDocument(`## EXP-PARSE-001

- \`sensitive_terms\`: sample
- \`supersedes_rule_id\`:
- \`created_at\`: 2026-07-30T00:00:00.000Z
`);
  assert.equal(experience.sensitive_terms, "sample");
  assert.equal(experience.supersedes_rule_id, "");
  assert.equal(
    experience.created_at,
    "2026-07-30T00:00:00.000Z",
  );
});

test("exps의 완성·리서치·frame 경험을 TR/CR/MR로 자동 승격하고 재실행을 재사용한다", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-exps-test-"),
  );
  const skill = path.join(root, "skill");
  try {
    await Promise.all([
      writeReference(skill, "taste.md", "TR"),
      writeReference(skill, "commercial.md", "CR"),
      writeReference(skill, "motion.md", "MR"),
    ]);
    const evidence = [];
    for (let index = 1; index <= 3; index += 1) {
      const relative = `projects/sample/evidence-${index}.json`;
      const bytes = Buffer.from(`{"case":${index}}\n`);
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      evidence.push({ relative, sha256: digest(bytes) });
    }
    const evidencePaths = evidence
      .map((item) => item.relative)
      .join("; ");
    const evidenceHashes = evidence
      .map((item) => item.sha256)
      .join("; ");
    await mkdir(path.join(root, ".detail-page", "exps"), { recursive: true });
    await writeFile(
      path.join(root, ".detail-page", "exps", "verified-experience.md"),
      `# Verified experiences

## EXP-COMPLETED-001

- \`source_kind\`: completed-result
- \`category\`: layout
- \`scope\`: shared
- \`promotion\`: auto
- \`rule_text\`: 모바일 화면의 핵심 메시지는 하나로 유지한다.
- \`validation_criterion\`: 390px과 780px에서 경쟁 초점이 없다.
- \`evidence_paths\`: ${evidence[0].relative}; ${evidence[1].relative}
- \`evidence_sha256\`: ${evidence[0].sha256}; ${evidence[1].sha256}
- \`producer_session_id\`: producer-a
- \`reviewer_session_id\`: reviewer-a
- \`case_count\`: 1
- \`quality_score\`: 97
- \`behance_quality_score\`: 90
- \`critical_dimension_min_score\`: 85
- \`hard_failure_count\`: 0
- \`frame_check\`: PASS
- \`public_output_qa\`: PASS
- \`reference_comparison\`: PASS
- \`user_approval\`: true
- \`producer_run_id\`: run-completed-production
- \`qa_run_id\`: run-completed-independent-qa
- \`before_after\`: 경쟁 제목 제거 전후 비교
- \`sensitive_terms\`:
- \`supersedes_rule_id\`:
- \`created_at\`: 2026-07-30T00:00:00.000Z

## EXP-BEHANCE-001

- \`source_kind\`: commercial-research
- \`category\`: buyer-journey
- \`scope\`: shared
- \`promotion\`: auto
- \`rule_text\`: 반복 관찰된 구매 질문은 문제와 해결을 분리해 순서대로 닫는다.
- \`validation_criterion\`: 서로 다른 세 사례와 다른 상품 회귀 검사를 통과한다.
- \`evidence_paths\`: ${evidencePaths}
- \`evidence_sha256\`: ${evidenceHashes}
- \`producer_session_id\`: producer-b
- \`reviewer_session_id\`: reviewer-b
- \`case_count\`: 3
- \`before_after\`: 작품별 표현을 제거하고 반복 구조만 남김
- \`sensitive_terms\`:
- \`supersedes_rule_id\`:
- \`created_at\`: 2026-07-30T00:00:00.000Z

## EXP-FRAME-001

- \`source_kind\`: frame-production
- \`category\`: motion
- \`scope\`: shared
- \`promotion\`: auto
- \`rule_text\`: 상태 변화 모션은 시작과 결과 프레임의 제품 기준점을 고정한다.
- \`validation_criterion\`: strict frame-check와 첫·중간·끝 프레임 검사가 통과한다.
- \`evidence_paths\`: ${evidence[0].relative}; ${evidence[1].relative}
- \`evidence_sha256\`: ${evidence[0].sha256}; ${evidence[1].sha256}
- \`producer_session_id\`: producer-c
- \`reviewer_session_id\`: reviewer-c
- \`case_count\`: 1
- \`frame_check\`: PASS
- \`public_output_qa\`: PASS
- \`reference_comparison\`: PASS
- \`user_approval\`: true
- \`producer_run_id\`: run-frame-production
- \`qa_run_id\`: run-frame-independent-qa
- \`before_after\`: 기준점 흔들림 제거 전후 비교
- \`sensitive_terms\`:
- \`supersedes_rule_id\`:
- \`created_at\`: 2026-07-30T00:00:00.000Z
`,
      "utf8",
    );

    const first = await syncTrustedExperiences({
      projectRoot: root,
      skillRoot: skill,
    });
    assert.equal(first.promoted, 3);
    assert.equal(first.quarantined, 0);
    assert.match(
      await readFile(path.join(skill, "references", "taste.md"), "utf8"),
      /\| TR-002 \| 모바일 화면의 핵심 메시지는 하나로 유지한다\./,
    );
    assert.match(
      await readFile(
        path.join(skill, "references", "commercial.md"),
        "utf8",
      ),
      /\| CR-002 \| 반복 관찰된 구매 질문은/,
    );
    assert.match(
      await readFile(path.join(skill, "references", "motion.md"), "utf8"),
      /\| MR-002 \| 상태 변화 모션은/,
    );

    const second = await syncTrustedExperiences({
      projectRoot: root,
      skillRoot: skill,
    });
    assert.equal(second.promoted, 0);
    assert.equal(second.reused, 3);
    assert.equal(second.quarantined, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("고유 URL이 남은 경험은 active reference를 바꾸지 않고 격리한다", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-exps-quarantine-"),
  );
  const skill = path.join(root, "skill");
  try {
    await Promise.all([
      writeReference(skill, "taste.md", "TR"),
      writeReference(skill, "commercial.md", "CR"),
      writeReference(skill, "motion.md", "MR"),
    ]);
    const evidenceBytes = Buffer.from("evidence\n");
    const evidenceRelative = "projects/sample/evidence.txt";
    await mkdir(
      path.dirname(path.join(root, evidenceRelative)),
      { recursive: true },
    );
    await writeFile(
      path.join(root, evidenceRelative),
      evidenceBytes,
    );
    await mkdir(path.join(root, ".detail-page", "exps"), { recursive: true });
    await writeFile(
      path.join(root, ".detail-page", "exps", "unsafe.md"),
      `## EXP-UNSAFE-001

- \`source_kind\`: user-feedback
- \`category\`: layout
- \`scope\`: shared
- \`promotion\`: auto
- \`rule_text\`: https://example.com의 레이아웃을 그대로 쓴다.
- \`validation_criterion\`: 전후 비교
- \`evidence_paths\`: ${evidenceRelative}; ${evidenceRelative}
- \`evidence_sha256\`: ${digest(evidenceBytes)}; ${digest(evidenceBytes)}
- \`producer_session_id\`: producer
- \`reviewer_session_id\`: reviewer
- \`case_count\`: 1
- \`before_after\`: 전후 비교
- \`created_at\`: 2026-07-30T00:00:00.000Z
`,
      "utf8",
    );
    const before = await readFile(
      path.join(skill, "references", "taste.md"),
    );
    const report = await syncTrustedExperiences({
      projectRoot: root,
      skillRoot: skill,
    });
    const after = await readFile(
      path.join(skill, "references", "taste.md"),
    );
    assert.equal(report.promoted, 0);
    assert.equal(report.quarantined, 1);
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
