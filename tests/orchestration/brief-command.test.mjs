import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const CLI = path.resolve(
  "skills/detail-page-maker-skill/scripts/detail-page.mjs",
);

function completeBrief(overrides = {}) {
  return {
    supplier_url: "https://www.domeggook.com/65698861?from=lstGen",
    coupang_url:
      "https://www.coupang.com/vp/products/9516545017?itemId=28375543183",
    photos: "",
    brand: "살랑",
    product_name: "루즈핏 팔토시",
    notes: "gif 적극 사용",
    ...overrides,
  };
}

async function workspaceFixture(brief) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "detail-page-brief-"));
  const briefPath = path.join(workspace, "brief.json");
  await writeFile(briefPath, JSON.stringify(brief, null, 2), "utf8");
  return { workspace, briefPath };
}

function runBrief(args) {
  return spawnSync(process.execPath, [CLI, "brief", ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
}

test("brief는 --input 없이는 실행되지 않는다", () => {
  const result = runBrief([]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /--input/u);
});

test("검증을 통과한 브리프는 완성 프롬프트를 표준출력으로 낸다", async () => {
  const brief = completeBrief();
  const { briefPath } = await workspaceFixture(brief);
  const result = runBrief([
    "--input",
    briefPath,
    "--install-section",
    "omit",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(brief.supplier_url));
  assert.ok(result.stdout.includes(brief.coupang_url));
  assert.ok(result.stdout.includes("루즈핏 팔토시"));
  assert.ok(result.stdout.includes("쿠팡 상세페이지 제작 핵심 팁"));
  assert.equal(result.stdout.includes("core.longpaths"), false);
});

test("--install-section include는 #1 설치 섹션을 붙인다", async () => {
  const { briefPath } = await workspaceFixture(completeBrief());
  const result = runBrief([
    "--input",
    briefPath,
    "--install-section",
    "include",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("core.longpaths"));
  assert.ok(result.stdout.includes("--agent claude"));
});

test("인라인 JSON도 --input으로 받는다", () => {
  const result = runBrief([
    "--input",
    JSON.stringify(completeBrief()),
    "--install-section",
    "omit",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("살랑"));
});

test("필수 항목이 비면 프롬프트 대신 재질문을 내고 실패한다", async () => {
  const { briefPath } = await workspaceFixture(
    completeBrief({ brand: "", product_name: "" }),
  );
  const result = runBrief(["--input", briefPath]);
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}${result.stderr}`;
  assert.ok(output.includes("브랜드명"));
  assert.ok(output.includes("제품명"));
  assert.equal(output.includes("쿠팡 상세페이지 제작 핵심 팁"), false);
});

test("쿠팡 검색 URL을 주면 상품 상세 URL을 다시 요구한다", async () => {
  const { briefPath } = await workspaceFixture(
    completeBrief({ coupang_url: "https://www.coupang.com/np/search?q=팔토시" }),
  );
  const result = runBrief(["--input", briefPath]);
  assert.notEqual(result.status, 0);
  assert.ok(`${result.stdout}${result.stderr}`.includes("/vp/products/"));
});

test("실제 사진 경로를 줬는데 파일이 없으면 진행하지 않는다", async () => {
  const { workspace, briefPath } = await workspaceFixture(
    completeBrief({ photos: "없는파일.zip" }),
  );
  const result = runBrief([
    "--input",
    briefPath,
    "--workspace",
    workspace,
  ]);
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}${result.stderr}`;
  assert.ok(output.includes("없는파일.zip"));
});

test("실제 사진 파일이 있으면 경로를 그대로 프롬프트에 싣는다", async () => {
  const { workspace, briefPath } = await workspaceFixture(
    completeBrief({ photos: "실사진.zip" }),
  );
  await writeFile(path.join(workspace, "실사진.zip"), "zip", "utf8");
  const result = runBrief([
    "--input",
    briefPath,
    "--workspace",
    workspace,
    "--install-section",
    "omit",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("실사진.zip"));
});

test("--output은 프롬프트를 파일로 남기고 경로를 알려준다", async () => {
  const { workspace, briefPath } = await workspaceFixture(completeBrief());
  const output = path.join(workspace, "prompt.md");
  const result = runBrief([
    "--input",
    briefPath,
    "--output",
    output,
    "--install-section",
    "omit",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(output));
  const written = await readFile(output, "utf8");
  assert.ok(written.includes("루즈핏 팔토시"));
  assert.ok(written.includes("/goal"));
});

test("--json은 기계가 읽을 리포트를 낸다", async () => {
  const { briefPath } = await workspaceFixture(completeBrief());
  const result = runBrief([
    "--input",
    briefPath,
    "--json",
    "--install-section",
    "omit",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.install_section, false);
  assert.equal(report.prompt_sha256.length, 64);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.issues, []);
});

test("--json은 실패할 때도 재질문을 구조화해 준다", async () => {
  const { briefPath } = await workspaceFixture(completeBrief({ brand: "" }));
  const result = runBrief(["--input", briefPath, "--json"]);
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.deepEqual(report.missing, ["brand"]);
  assert.equal(report.followups[0].key, "brand");
  assert.ok(report.followups[0].question.length > 0);
});
