import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runLeanQa,
  startLeanStudioServer,
} from "../lean-studio-server.mjs";
import {
  runLeanWingExport,
} from "../lean-wing-export.mjs";

const OUTPUT_WIDTH = 780;

function detailHtml(label = "첫 번째 문장") {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><style>html,body,#detailPage{width:${OUTPUT_WIDTH}px;max-width:${OUTPUT_WIDTH}px;margin:0 auto}</style></head>
<body><main id="detailPage"><section><h1>${label}</h1><p>제품 설명</p></section></main></body>
</html>`;
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "lean-detail-page-"));
  await mkdir(path.join(root, "output"), { recursive: true });
  await writeFile(path.join(root, "output", "detail-page.html"), detailHtml(), "utf8");
  return root;
}

async function json(response) {
  const payload = await response.json();
  return { response, payload };
}

test("Lean Studio가 780px 정본을 저장·QA하고 최근 백업을 복구한다", async () => {
  const root = await fixture();
  const runtime = await startLeanStudioServer({ projectRoot: root });
  try {
    const shell = await (await fetch(runtime.url)).text();
    assert.match(shell, /780px canonical preview/);
    assert.match(shell, /iframe\{[^}]*width:780px/);

    const first = await json(await fetch(`${runtime.url}api/document`));
    assert.equal(first.response.status, 200);
    assert.equal(first.payload.qa.status, "PASS");

    const unauthorized = await fetch(`${runtime.url}api/document`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        html: detailHtml("권한 없는 변경"),
        expected_sha256: first.payload.sha256,
      }),
    });
    assert.equal(unauthorized.status, 403);

    const saved = await json(await fetch(`${runtime.url}api/document`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lean-studio-token": runtime.token,
      },
      body: JSON.stringify({
        html: detailHtml("문맥에 맞게<br>나눈 두 번째 문장"),
        expected_sha256: first.payload.sha256,
      }),
    }));
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.status, "saved");
    assert.equal(saved.payload.qa.status, "PASS");
    assert.ok(saved.payload.backup_id);

    const backups = await json(await fetch(`${runtime.url}api/backups`));
    assert.equal(backups.payload.backups.length, 1);
    assert.equal(backups.payload.backups[0].id, saved.payload.backup_id);

    const restored = await json(await fetch(`${runtime.url}api/restore`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lean-studio-token": runtime.token,
      },
      body: JSON.stringify({
        backup_id: saved.payload.backup_id,
        expected_sha256: saved.payload.sha256,
      }),
    }));
    assert.equal(restored.response.status, 200);
    assert.match(
      await readFile(path.join(root, "output", "detail-page.html"), "utf8"),
      /첫 번째 문장/,
    );
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Lean QA는 과거 축소 폭과 숫자·단위 분리를 차단한다", async () => {
  const root = await fixture();
  try {
    const retiredWidth = OUTPUT_WIDTH / 2;
    const qa = await runLeanQa(
      root,
      `<!doctype html><html><head><style>body{width:${retiredWidth}px}</style></head><body><h1>10<br>cm</h1></body></html>`,
    );
    assert.equal(qa.status, "FAIL");
    assert.ok(qa.errors.some((error) => error.code === "LEGACY_NARROW_WIDTH"));
    assert.ok(qa.errors.some((error) => error.code === "NUMBER_UNIT_SPLIT"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Lean QA는 고객 HTML의 내부 메타데이터와 로컬 경로를 차단한다", async () => {
  const root = await fixture();
  try {
    const exposed = await runLeanQa(
      root,
      detailHtml().replace(
        "<section>",
        '<section data-agent-id="worker"><!-- file:///Users/operator/.detail-page/qa.json -->',
      ),
    );
    assert.equal(exposed.status, "FAIL");
    assert.deepEqual(
      new Set(exposed.errors.map((error) => error.code)),
      new Set([
        "INTERNAL_DATA_ATTRIBUTE",
        "LOCAL_FILE_URL_EXPOSED",
        "LOCAL_USER_PATH_EXPOSED",
        "INTERNAL_PROJECT_PATH_EXPOSED",
      ]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Lean Studio·Wing 새 경로와 embedded renderer는 780px only이다", async () => {
  const [studioSource, wingSource, testSource] = await Promise.all([
    readFile(new URL("../lean-studio-server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lean-wing-export.mjs", import.meta.url), "utf8"),
    readFile(new URL(import.meta.url), "utf8"),
  ]);
  const retiredWidth = OUTPUT_WIDTH / 2;
  const retiredLiteral = new RegExp(String(retiredWidth));
  assert.doesNotMatch(studioSource, retiredLiteral);
  assert.doesNotMatch(wingSource, retiredLiteral);
  assert.doesNotMatch(testSource, retiredLiteral);

  const embedded = wingSource.match(
    /const LEAN_WING_RENDERER = String\.raw`([\s\S]*?)`;\n\nexport class/,
  );
  assert.ok(embedded, "embedded 780px renderer source");
  const compiled = spawnSync(
    "python3",
    ["-c", 'import sys; compile(sys.stdin.read(), "lean-wing-renderer.py", "exec")'],
    { input: embedded[1], encoding: "utf8" },
  );
  assert.equal(compiled.status, 0, compiled.stderr);
});

test("Wing dry-run은 versioned namespace manifest를 만들고 덮어쓰기를 거부한다", async () => {
  const root = await fixture();
  try {
    await mkdir(path.join(root, ".detail-page"), { recursive: true });
    await writeFile(
      path.join(root, ".detail-page", "cloudflare-pages.json"),
      `${JSON.stringify({
        schema_version: "1.0",
        provider: "cloudflare-pages",
        pages_project: "lean-detail-assets",
        public_base_url: "https://lean-detail-assets.pages.dev",
        production_branch: "main",
        wrangler_version: "4.123.0",
        wrangler_entry_sha256: "a".repeat(64),
        wrangler_runtime_tree_sha256: "b".repeat(64),
        publisher_id: "lean-studio",
        writer_owner_digest: "c".repeat(64),
      }, null, 2)}\n`,
      "utf8",
    );
    const options = {
      projectRoot: root,
      mode: "dry-run",
      projectKey: "sample-product",
      now: new Date("2026-08-02T09:10:11.123Z"),
      nonce: "abcd1234",
    };
    const planned = await runLeanWingExport(options);
    assert.equal(planned.status, "dry-run");
    assert.match(planned.export_id, /^wing-20260802T091011123Z-abcd1234$/);
    const manifest = JSON.parse(
      await readFile(path.join(root, planned.manifest_path), "utf8"),
    );
    assert.deepEqual(manifest.render_profile, {
      css_width: OUTPUT_WIDTH,
      device_scale_factor: 1,
    });
    assert.equal(manifest.namespace, `sample-product/${planned.export_id}`);

    await assert.rejects(
      runLeanWingExport(options),
      (error) => error.code === "EXPORT_NAMESPACE_EXISTS",
    );
    await assert.rejects(
      runLeanWingExport({ projectRoot: root, mode: "publish" }),
      (error) => error.code === "PUBLISH_CONFIRMATION_REQUIRED",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
