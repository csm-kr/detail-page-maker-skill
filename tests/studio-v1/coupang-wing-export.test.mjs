import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/new-project.mjs";
import { startStudioV1Server } from "../../skills/detail-page-maker-skill/scripts/studio-v1-server.mjs";


async function requestJson(baseUrl, pathname, body) {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}


async function closeServer(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}


test("쿠팡 Wing 내보내기는 G5·97점·사용자 승인과 HTTPS CDN 주소를 강제한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-v1-wing-export-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "테스트 상품",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    const started = await startStudioV1Server({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;
    const baseUrl = new URL(started.url).origin;

    const blockedGate = await requestJson(baseUrl, "/api/v1/gate");
    assert.equal(blockedGate.response.status, 200);
    assert.equal(blockedGate.payload.exportAllowed, true);
    assert.equal(blockedGate.payload.coupangWingExportAllowed, false);
    assert.ok(blockedGate.payload.coupangWingBlockers.length >= 1);

    const blockedExport = await requestJson(
      baseUrl,
      "/api/v1/exports/coupang-wing",
      { cdnBaseUrl: "https://cdn.example.com/coupang/product-v1" },
    );
    assert.equal(blockedExport.response.status, 409);
    assert.equal(
      blockedExport.payload.error.code,
      "COUPANG_WING_EXPORT_BLOCKED",
    );

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

    const readyGate = await requestJson(baseUrl, "/api/v1/gate");
    assert.equal(readyGate.response.status, 200);
    assert.equal(readyGate.payload.coupangWingExportAllowed, true);
    assert.equal(readyGate.payload.finalQaScore, 98);
    assert.equal(readyGate.payload.userPublishApproved, true);

    const invalidUrl = await requestJson(
      baseUrl,
      "/api/v1/exports/coupang-wing",
      { cdnBaseUrl: "http://cdn.example.com/coupang/product-v1?draft=1" },
    );
    assert.equal(invalidUrl.response.status, 400);
    assert.equal(invalidUrl.payload.error.code, "CDN_BASE_URL_INVALID");
  } finally {
    if (server) await closeServer(server);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
