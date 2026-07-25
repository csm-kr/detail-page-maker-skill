import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/new-project.mjs";
import { startStudioServer } from "../../skills/detail-page-maker-skill/scripts/studio-server.mjs";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl2kAAAAASUVORK5CYII=";

async function request(baseUrl, pathname, body) {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

test("새 프로젝트부터 승인·잠금·내보내기·개정판까지 실행된다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-v2-"),
  );
  const projectsRoot = path.join(temporaryRoot, "projects");
  let server;
  try {
    const created = await createProject({
      name: "노바페이스 발편한 기능성깔창",
      supplierUrl: "https://domeggook.com/60851997?from=lstGen",
      root: projectsRoot,
    });
    const started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;
    const baseUrl = started.url;

    const health = await request(baseUrl, "/api/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.payload.ok, true);

    const registered = await request(baseUrl, "/api/assets/register", {
      assetId: "hero",
      name: "히어로 제품 이미지",
      role: "hero",
      kind: "image",
      required: true,
      dataUrl: ONE_PIXEL_PNG,
      fileName: "hero.png",
      sourceRefs: ["product/ssot/source-01.png"],
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.payload.version.number, 1);

    const blockedApproval = await request(
      baseUrl,
      "/api/assets/hero/approve",
      { version: 1, decision: "approved" },
    );
    assert.equal(blockedApproval.response.status, 409);
    assert.equal(blockedApproval.payload.error.code, "QA_NOT_PASSED");

    const qa = await request(baseUrl, "/api/assets/hero/qa", {
      version: 1,
      status: "passed",
      score: 99,
      hardFailures: [],
      warnings: [],
      evidence: ["원본·후보 오버레이 비교"],
    });
    assert.equal(qa.response.status, 200);

    const approval = await request(baseUrl, "/api/assets/hero/approve", {
      version: 1,
      decision: "approved",
      note: "제품 동일성 확인",
    });
    assert.equal(approval.response.status, 200);

    const assembly = await request(baseUrl, "/api/assembly/lock", {
      confirmedByUser: true,
    });
    assert.equal(assembly.response.status, 200);

    const readOnlyRegister = await request(
      baseUrl,
      "/api/assets/register",
      {
        assetId: "hero",
        name: "직접 덮어쓰기 시도",
        dataUrl: ONE_PIXEL_PNG,
        fileName: "hero-v2.png",
      },
    );
    assert.equal(readOnlyRegister.response.status, 409);
    assert.equal(readOnlyRegister.payload.error.code, "ASSET_STAGE_LOCKED");

    const draft = await request(baseUrl, "/api/export/draft", {});
    assert.equal(draft.response.status, 201);
    await access(path.join(created.projectRoot, draft.payload.path));
    const draftHtml = await readFile(
      path.join(created.projectRoot, draft.payload.path),
      "utf8",
    );
    assert.match(draftHtml, /검토용 초안/);

    const qaFinal = await request(baseUrl, "/api/qa/final", {
      score: 97,
      hardFailures: [],
      warnings: [],
    });
    assert.equal(qaFinal.response.status, 200);

    const finalApproval = await request(baseUrl, "/api/qa/final/approve", {
      confirmedByUser: true,
    });
    assert.equal(finalApproval.response.status, 200);

    const published = await request(baseUrl, "/api/export/publish", {});
    assert.equal(published.response.status, 201);
    await access(path.join(created.projectRoot, published.payload.path));

    const bundle = await request(baseUrl, "/api/export/project", {});
    assert.equal(bundle.response.status, 201);
    await access(path.join(created.projectRoot, bundle.payload.path));

    const revision = await request(baseUrl, "/api/revisions", {
      changedAssetIds: ["hero"],
      reason: "제품 각도 후보 교체",
      confirmedByUser: true,
    });
    assert.equal(revision.response.status, 201);
    assert.equal(revision.payload.id, "rev-002");

    const projectState = await request(baseUrl, "/api/project");
    assert.equal(projectState.payload.phase, "asset_production");
    assert.equal(
      projectState.payload.activeRevision.assetSelections.hero,
      undefined,
    );
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    const safeTempRoot = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (resolvedTemporaryRoot.startsWith(`${safeTempRoot}${path.sep}`)) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
});
