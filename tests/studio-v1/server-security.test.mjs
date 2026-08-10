import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createProject } from "../../skills/detail-page-maker-skill/scripts/lib/new-project.mjs";
import { startStudioV1Server } from "../../skills/detail-page-maker-skill/scripts/runtime/studio-v1-server.mjs";

function rawRequest(
  origin,
  {
    requestPath = "/",
    method = "GET",
    headers = {},
    body = null,
  } = {},
) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: requestPath,
        method,
        headers: {
          Host: url.host,
          ...headers,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let payload = null;
          try {
            payload = JSON.parse(text);
          } catch {
            payload = text;
          }
          resolve({
            status: response.statusCode,
            headers: response.headers,
            payload,
          });
        });
      },
    );
    request.on("error", reject);
    if (body !== null) request.write(body);
    request.end();
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function createSecureStudio(t, options = {}) {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-security-"),
  );
  const created = await createProject({
    name: "Studio 보안 테스트",
    supplierUrl: "https://supplier.example/123456",
    root: temporaryRoot,
  });
  const started = await startStudioV1Server({
    projectRoot: created.projectRoot,
    port: 0,
    open: false,
    ...options,
  });
  t.after(async () => {
    await closeServer(started.server);
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  return {
    ...created,
    ...started,
    origin: new URL(started.url).origin,
  };
}

test("Studio 문서는 Strict HttpOnly 세션 쿠키를 발급하고 모든 API는 cookie 또는 capability header를 요구한다", async (t) => {
  const studio = await createSecureStudio(t);
  assert.match(studio.capabilityToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(
    studio.capabilityHeader,
    "x-detail-page-studio-capability",
  );
  assert.doesNotMatch(studio.url, new RegExp(studio.capabilityToken));

  const documentResponse = await rawRequest(studio.origin, {
    requestPath: "/studio.html",
  });
  assert.equal(documentResponse.status, 200);
  const setCookie = documentResponse.headers["set-cookie"]?.[0] || "";
  assert.match(
    setCookie,
    /^detail_page_studio_capability=[A-Za-z0-9_-]+;/,
  );
  assert.match(setCookie, /;\s*Path=\//i);
  assert.match(setCookie, /;\s*HttpOnly/i);
  assert.match(setCookie, /;\s*SameSite=Strict/i);
  assert.doesNotMatch(String(documentResponse.payload), /capabilityToken/);
  const cookie = setCookie.split(";", 1)[0];

  const missing = await rawRequest(studio.origin, {
    requestPath: "/api/v1/assets",
  });
  assert.equal(missing.status, 401);
  assert.equal(
    missing.payload.error.code,
    "STUDIO_CAPABILITY_REQUIRED",
  );
  for (const protectedPost of [
    "/api/v1/output/save",
    "/api/v1/workflow/decision",
  ]) {
    const blockedPost = await rawRequest(studio.origin, {
      requestPath: protectedPost,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(blockedPost.status, 401);
    assert.equal(
      blockedPost.payload.error.code,
      "STUDIO_CAPABILITY_REQUIRED",
    );
  }

  const withCookie = await rawRequest(studio.origin, {
    requestPath: "/api/v1/assets",
    headers: { Cookie: cookie },
  });
  assert.equal(withCookie.status, 200);

  const withHeader = await rawRequest(studio.origin, {
    requestPath: "/api/v1/assets",
    headers: {
      "X-Detail-Page-Studio-Capability": studio.capabilityToken,
    },
  });
  assert.equal(withHeader.status, 200);
});

test("Host·Origin·Sec-Fetch-Site는 정확한 bound origin만 허용한다", async (t) => {
  const studio = await createSecureStudio(t);
  const capability = {
    "X-Detail-Page-Studio-Capability": studio.capabilityToken,
  };

  const badHost = await rawRequest(studio.origin, {
    requestPath: "/api/v1/assets",
    headers: { ...capability, Host: "evil.example" },
  });
  assert.equal(badHost.status, 403);
  assert.equal(badHost.payload.error.code, "HOST_NOT_ALLOWED");

  const badOrigin = await rawRequest(studio.origin, {
    requestPath: "/api/v1/assets",
    headers: {
      ...capability,
      Origin: "https://evil.example",
      "Sec-Fetch-Site": "same-origin",
    },
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(
    badOrigin.payload.error.code,
    "CROSS_ORIGIN_REQUEST_BLOCKED",
  );

  const crossSite = await rawRequest(studio.origin, {
    requestPath: "/api/v1/assets",
    headers: {
      ...capability,
      Origin: studio.origin,
      "Sec-Fetch-Site": "cross-site",
    },
  });
  assert.equal(crossSite.status, 403);
  assert.equal(
    crossSite.payload.error.code,
    "CROSS_SITE_REQUEST_BLOCKED",
  );

  const exact = await rawRequest(studio.origin, {
    requestPath: "/api/v1/assets",
    headers: {
      ...capability,
      Origin: studio.origin,
      "Sec-Fetch-Site": "same-origin",
    },
  });
  assert.equal(exact.status, 200);
});

test("sandbox Origin:null child는 capability가 있어도 save·approval API를 호출할 수 없다", async (t) => {
  const studio = await createSecureStudio(t);
  for (const fetchSite of ["cross-site", "same-site"]) {
    const childBootstrap = await rawRequest(studio.origin, {
      requestPath: "/app.js",
      headers: {
        Origin: "null",
        "Sec-Fetch-Site": fetchSite,
        "Sec-Fetch-Dest": "script",
      },
    });
    assert.equal(childBootstrap.status, 200);
    assert.match(
      String(childBootstrap.payload),
      /DETAIL_SERIALIZE_REQUEST/,
    );
  }

  for (const [requestPath, body] of [
    ["/api/v1/output/save", { html: "<!doctype html><html></html>" }],
    [
      "/api/v1/assets/decision",
      {
        relativePath:
          ".detail-page/generation/pending/image/attack.png",
        decision: "approved",
        confirmedByUser: true,
      },
    ],
  ]) {
    const blocked = await rawRequest(studio.origin, {
      requestPath,
      method: "POST",
      headers: {
        Origin: "null",
        "Sec-Fetch-Site": "cross-site",
        "Content-Type": "application/json",
        "X-Detail-Page-Studio-Capability": studio.capabilityToken,
      },
      body: JSON.stringify(body),
    });
    assert.equal(blocked.status, 403);
    assert.equal(
      blocked.payload.error.code,
      "CROSS_ORIGIN_REQUEST_BLOCKED",
    );
  }
});

test("정적 파일은 pageDirectory 안으로 제한하고 encoded separator·dot traversal을 fail-closed한다", async (t) => {
  const studio = await createSecureStudio(t);

  const pageAsset = await rawRequest(studio.origin, {
    requestPath: "/studio-v1.js",
  });
  assert.equal(pageAsset.status, 200);

  const projectMetadata = await rawRequest(studio.origin, {
    requestPath: "/project.json",
  });
  assert.equal(projectMetadata.status, 404);

  for (const attackPath of [
    "/%2e%2e/project.json",
    "/assets%2f..%2fproject.json",
    "/assets%5c..%5cproject.json",
    "/assets%252f..%252fproject.json",
    "/..%252fproject.json",
  ]) {
    const blocked = await rawRequest(studio.origin, {
      requestPath: attackPath,
    });
    assert.equal(
      blocked.status,
      403,
      `${attackPath} must be blocked`,
    );
    assert.match(
      blocked.payload.error.code,
      /^(?:ENCODED_PATH_SEPARATOR|PATH_TRAVERSAL_BLOCKED)$/,
    );
  }
});

test("외부 coupang-wing verify 라우트는 비활성이고 내부 verifier를 호출하지 않는다", async (t) => {
  let verifyCalls = 0;
  const studio = await createSecureStudio(t, {
    wingVerifyImpl: async () => {
      verifyCalls += 1;
      return { status: "completed" };
    },
  });
  const response = await rawRequest(studio.origin, {
    requestPath: "/api/v1/exports/coupang-wing/verify",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Detail-Page-Studio-Capability": studio.capabilityToken,
    },
    body: JSON.stringify({ exportId: "attacker-controlled" }),
  });
  assert.equal(response.status, 405);
  assert.equal(response.payload.error.code, "METHOD_NOT_ALLOWED");
  assert.equal(verifyCalls, 0);
});
