import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/new-project.mjs";
import { startStudioV1Server } from "../../skills/detail-page-maker-skill/scripts/studio-v1-server.mjs";


async function closeServer(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}


test(
  "실제 브라우저 캡처로 780px WebP와 이미지 전용 Wing HTML을 만든다",
  { skip: process.env.RUN_BROWSER_INTEGRATION !== "1" },
  async () => {
    const temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), "detail-page-wing-browser-"),
    );
    let server;
    try {
      const created = await createProject({
        name: "브라우저 통합 테스트",
        supplierUrl: "https://supplier.example/123456",
        root: temporaryRoot,
      });
      const projectPath = path.join(created.projectRoot, "project.json");
      const project = JSON.parse(await readFile(projectPath, "utf8"));
      project.finalQa = {
        status: "passed",
        score: 98,
        hardFailures: [],
        warnings: [],
        userApproved: true,
        reportPath: null,
      };
      await writeFile(
        projectPath,
        `${JSON.stringify(project, null, 2)}\n`,
        "utf8",
      );

      const started = await startStudioV1Server({
        projectRoot: created.projectRoot,
        port: 0,
        open: false,
      });
      server = started.server;
      const response = await fetch(
        new URL("/api/v1/exports/coupang-wing", started.url),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cdnBaseUrl: "https://cdn.example.com/coupang/browser-test-v1",
          }),
        },
      );
      const payload = await response.json();
      let failureDetail = "";
      if (response.status !== 200) {
        const exportsRoot = path.join(created.projectRoot, "exports");
        const exportEntries = await readdir(exportsRoot, {
          withFileTypes: true,
        });
        const failedExport = exportEntries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .find((name) => name.startsWith("coupang-wing-780-webp-"));
        if (failedExport) {
          failureDetail = await readFile(
            path.join(exportsRoot, failedExport, "export-error.log"),
            "utf8",
          ).catch(() => "");
        }
      }
      assert.equal(
        response.status,
        200,
        `${JSON.stringify(payload, null, 2)}\n${failureDetail}`,
      );
      assert.equal(payload.result.assetCount, 3);
      assert.equal(payload.result.remoteVerification, "pending");

      const outputRoot = payload.result.outputRoot;
      const manifest = JSON.parse(
        await readFile(
          path.join(outputRoot, "cdn-upload-manifest.json"),
          "utf8",
        ),
      );
      assert.equal(manifest.local_qa.all_width_780, true);
      assert.equal(manifest.local_qa.all_under_10mb, true);
      assert.equal(manifest.local_qa.wing_disallowed_markup_count, 0);
      assert.equal(manifest.local_qa.wing_non_https_image_count, 0);
      assert.equal(manifest.remote_verification.status, "pending");

      const html = await readFile(
        path.join(outputRoot, "coupang-wing-detail-780.html"),
        "utf8",
      );
      assert.match(html, /^<div align="center">\r?\n/);
      assert.equal((html.match(/<img /g) || []).length, 3);
      assert.doesNotMatch(
        html,
        /<(?:style|script|svg|iframe|video|canvas)\b|\s(?:class|style)=/i,
      );

      const assets = await readdir(path.join(outputRoot, "assets"));
      assert.equal(assets.length, 3);
      assert.ok(assets.every((name) => name.endsWith(".webp")));
    } finally {
      if (server) await closeServer(server);
      const resolvedTemporaryRoot = path.resolve(temporaryRoot);
      const resolvedSystemTemp = `${path.resolve(os.tmpdir())}${path.sep}`;
      assert.ok(resolvedTemporaryRoot.startsWith(resolvedSystemTemp));
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  },
);
