import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildExamplePlan,
  validateLeanPlan,
} from "../lean-contract.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(ROOT, "scripts/lean-contract.mjs");

function clone(value) {
  return structuredClone(value);
}

test("example은 780px, still 30개, GIF 10개의 유효한 lean plan이다", async () => {
  const plan = buildExamplePlan();
  const result = await validateLeanPlan(plan);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(plan.output.width_px, 780);
  assert.equal(plan.still_jobs.length, 30);
  assert.equal(plan.gif_briefs.length, 10);
  assert.equal(plan.output.studio.enabled, true);
  assert.equal(plan.output.wing.enabled, true);
  assert.equal(plan.output.wing.cdn.enabled, true);
});

test("필수 URL과 쿠팡 도메인을 검증한다", async () => {
  const missingSupplier = clone(buildExamplePlan());
  delete missingSupplier.inputs.supplier_url;
  const missingResult = await validateLeanPlan(missingSupplier);
  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.errors.some((item) => item.path === "$.inputs.supplier_url"));

  const wrongCoupang = clone(buildExamplePlan());
  wrongCoupang.inputs.coupang_url = "https://example.com/product/1";
  const wrongResult = await validateLeanPlan(wrongCoupang);
  assert.ok(wrongResult.errors.some((item) => item.code === "COUPANG_URL_REQUIRED"));
});

test("이미지와 GIF 개수 범위를 강제한다", async () => {
  const tooFewStills = clone(buildExamplePlan());
  tooFewStills.still_jobs = tooFewStills.still_jobs.slice(0, 27);
  const stillResult = await validateLeanPlan(tooFewStills);
  assert.ok(stillResult.errors.some((item) => item.path === "$.still_jobs"));

  const tooManyGifs = clone(buildExamplePlan());
  tooManyGifs.gif_briefs.push(
    ...tooManyGifs.gif_briefs.slice(0, 3).map((item, index) => ({
      ...item,
      id: `extra-gif-${index + 1}`,
    })),
  );
  const gifResult = await validateLeanPlan(tooManyGifs);
  assert.ok(gifResult.errors.some((item) => item.path === "$.gif_briefs"));
});

test("단일 780px profile과 Studio·Wing/CDN enabled를 강제한다", async () => {
  const legacy = clone(buildExamplePlan());
  legacy.output[`mobile_${780 / 2}_width`] = 780 / 2;
  legacy.output.studio.enabled = false;
  legacy.output.wing.cdn.enabled = false;
  const result = await validateLeanPlan(legacy);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.equal(result.ok, false);
  assert.ok(codes.has("LEGACY_HALF_WIDTH_KEY_FORBIDDEN"));
  assert.ok(codes.has("LEGACY_HALF_WIDTH_VALUE_FORBIDDEN"));
  assert.ok(codes.has("STUDIO_MUST_BE_ENABLED"));
  assert.ok(codes.has("CDN_MUST_BE_ENABLED"));
});

test("각 section은 한 메시지와 명시적 copy chunk를 가져야 한다", async () => {
  const plan = clone(buildExamplePlan());
  plan.sections[0].one_message = false;
  plan.sections[0].copy.headline = "AI가 쓴 제목을 그대로 사용";
  plan.sections[0].copy.headline_lines = ["AI 제목<br>바로 사용"];
  const result = await validateLeanPlan(plan);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.ok(codes.has("SECTION_ONE_MESSAGE_REQUIRED"));
  assert.ok(codes.has("RAW_COPY_FIELD_FORBIDDEN"));
  assert.ok(codes.has("EMBEDDED_LINE_BREAK_FORBIDDEN"));
});

test("명백한 조사·숫자/단위 분리는 error, 수식어 분리 가능성은 warning이다", async () => {
  const plan = clone(buildExamplePlan());
  plan.sections[0].copy.headline_lines = ["수납함", "은 30", "개까지 정리"];
  const result = await validateLeanPlan(plan);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.ok(codes.has("PARTICLE_SPLIT_ACROSS_CHUNKS"));
  assert.ok(codes.has("NUMBER_UNIT_SPLIT_ACROSS_CHUNKS"));

  const modifier = clone(buildExamplePlan());
  modifier.sections[0].copy.headline_lines = ["넓넉한", "수납 공간을 한눈에"];
  const warningResult = await validateLeanPlan(modifier);
  assert.equal(warningResult.ok, true);
  assert.ok(warningResult.warnings.some((item) => item.code === "POSSIBLE_MODIFIER_SPLIT"));
});

test("CLI example과 validate를 지원한다", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "lean-contract-"));
  try {
    const exampleRun = await execFileAsync(process.execPath, [CLI, "example"], {
      cwd: ROOT,
    });
    const plan = JSON.parse(exampleRun.stdout);
    const planPath = path.join(temporary, "flow-plan.json");
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    const validateRun = await execFileAsync(
      process.execPath,
      [CLI, "validate", "--file", planPath],
      { cwd: ROOT },
    );
    const result = JSON.parse(validateRun.stdout);
    assert.equal(result.ok, true);
    assert.equal(result.summary.output_width_px, 780);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
