import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/lib/new-project.mjs";
import { startStudioV1Server } from "../../skills/detail-page-maker-skill/scripts/runtime/studio-v1-server.mjs";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl2kAAAAASUVORK5CYII=",
  "base64",
);
const CAPABILITY_BY_ORIGIN = new Map();

function registerStudio(started) {
  const origin = new URL(started.url).origin;
  CAPABILITY_BY_ORIGIN.set(origin, started.capabilityToken);
  return origin;
}

async function requestJson(baseUrl, pathname, body) {
  const capabilityToken = CAPABILITY_BY_ORIGIN.get(
    new URL(baseUrl).origin,
  );
  const response = await fetch(new URL(pathname, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-Detail-Page-Studio-Capability": capabilityToken,
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

async function closeServer(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test("사용자 확인이 있는 Studio v1 결정만 pending 파일을 승인 폴더로 이동한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-v1-approval-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "노바페이스 발편한 기능성깔창",
      supplierUrl: "https://domeggook.com/60851997",
      root: temporaryRoot,
    });
    const pendingRelative =
      ".detail-page/generation/pending/image/03-flex-hybrid-v01.png";
    await mkdir(
      path.dirname(path.join(created.projectRoot, pendingRelative)),
      { recursive: true },
    );
    await writeFile(
      path.join(created.projectRoot, pendingRelative),
      ONE_PIXEL_PNG,
    );

    const started = await startStudioV1Server({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;
    const baseUrl = registerStudio(started);

    const listed = await requestJson(baseUrl, "/api/v1/assets");
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.assets.length, 1);
    assert.equal(listed.payload.assets[0].status, "pending");
    assert.equal(listed.payload.assets[0].kind, "image");

    const blocked = await requestJson(
      baseUrl,
      "/api/v1/assets/decision",
      {
        relativePath: pendingRelative,
        decision: "approved",
        confirmedByUser: false,
      },
    );
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.payload.error.code, "USER_CONFIRMATION_REQUIRED");

    const approved = await requestJson(
      baseUrl,
      "/api/v1/assets/decision",
      {
        relativePath: pendingRelative,
        decision: "approved",
        confirmedByUser: true,
      },
    );
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload.asset.status, "approved");
    assert.match(approved.payload.asset.sha256, /^[a-f0-9]{64}$/);

    const approvedPath = path.join(
      created.projectRoot,
      ".detail-page/generation/approved/image/03-flex-hybrid-v01.png",
    );
    await access(approvedPath);
    await assert.rejects(access(path.join(created.projectRoot, pendingRelative)));

    const manifest = JSON.parse(
      await readFile(
        path.join(
          created.projectRoot,
          ".detail-page/generation/asset-manifest.json",
        ),
        "utf8",
      ),
    );
    assert.equal(manifest.assets.length, 1);
    assert.equal(manifest.assets[0].status, "approved");
    assert.equal(manifest.assets[0].approvedBy, "local-user");

    const gate = await requestJson(baseUrl, "/api/v1/gate");
    assert.equal(gate.response.status, 200);
    assert.equal(gate.payload.pendingCount, 0);
    assert.equal(gate.payload.exportAllowed, true);
  } finally {
    if (server) await closeServer(server);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("반려 파일은 rejected로 이동하고 기존 대상 파일은 덮어쓰지 않는다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-v1-rejection-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "테스트 상품",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    const pendingRelative =
      ".detail-page/generation/pending/gif/03-flex-hybrid-v01.gif";
    await mkdir(
      path.dirname(path.join(created.projectRoot, pendingRelative)),
      { recursive: true },
    );
    await writeFile(
      path.join(created.projectRoot, pendingRelative),
      ONE_PIXEL_PNG,
    );
    await mkdir(
      path.join(
        created.projectRoot,
        ".detail-page/generation/approved/gif",
      ),
      { recursive: true },
    );
    const started = await startStudioV1Server({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;
    const baseUrl = registerStudio(started);

    const rejected = await requestJson(
      baseUrl,
      "/api/v1/assets/decision",
      {
        relativePath: pendingRelative,
        decision: "rejected",
        confirmedByUser: true,
      },
    );
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.payload.asset.status, "rejected");
    await access(
      path.join(
        created.projectRoot,
        ".detail-page/generation/rejected/gif/03-flex-hybrid-v01.gif",
      ),
    );

    await writeFile(
      path.join(created.projectRoot, pendingRelative),
      ONE_PIXEL_PNG,
    );
    await writeFile(
      path.join(
        created.projectRoot,
        ".detail-page/generation/approved/gif/03-flex-hybrid-v01.gif",
      ),
      Buffer.from("do-not-overwrite"),
    );
    const conflict = await requestJson(
      baseUrl,
      "/api/v1/assets/decision",
      {
        relativePath: pendingRelative,
        decision: "approved",
        confirmedByUser: true,
      },
    );
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.payload.error.code, "TARGET_EXISTS");
  } finally {
    if (server) await closeServer(server);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
