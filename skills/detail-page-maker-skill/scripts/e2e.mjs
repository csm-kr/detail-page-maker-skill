import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProject } from "./new-project.mjs";
import { startStudioV1Server } from "./studio-v1-server.mjs";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl2kAAAAASUVORK5CYII=",
  "base64",
);
const PLANNING_FILES = [
  "COMMERCIAL.md",
  "DESIGN.md",
  "BUYER-JOURNEY.md",
  "GIF.md",
  "APPROVALS.md",
];

async function requestJson(baseUrl, pathname, body) {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json(),
  };
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function runE2E() {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-maker-e2e-"),
  );
  let server;
  const report = {
    ok: false,
    checks: {},
    cleaned: false,
  };

  try {
    const created = await createProject({
      name: "portable-e2e",
      supplierUrl: "https://domeggook.com/60851997",
      root: temporaryRoot,
    });
    report.checks.projectCreated = true;

    await Promise.all(
      PLANNING_FILES.map((fileName) =>
        access(path.join(created.projectRoot, "planning", fileName)),
      ),
    );
    report.checks.planningTemplates = [...PLANNING_FILES];

    const pendingRelative =
      "asset/generated/pending/image/01-e2e-hybrid-v01.png";
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
    const baseUrl = new URL(started.url).origin;

    const studioResponse = await fetch(new URL("/studio.html", baseUrl));
    report.checks.studioHttpStatus = studioResponse.status;
    if (studioResponse.status !== 200) {
      throw new Error(`Studio HTTP status: ${studioResponse.status}`);
    }

    const before = await requestJson(baseUrl, "/api/v1/gate");
    report.checks.gateBefore = before.payload;
    if (before.status !== 200 || before.payload.exportAllowed !== false) {
      throw new Error("pending Asset이 있는데 출력 게이트가 잠기지 않았습니다.");
    }

    const unconfirmed = await requestJson(
      baseUrl,
      "/api/v1/assets/decision",
      {
        relativePath: pendingRelative,
        decision: "approved",
        confirmedByUser: false,
      },
    );
    report.checks.unconfirmedDecisionStatus = unconfirmed.status;
    if (
      unconfirmed.status !== 409 ||
      unconfirmed.payload?.error?.code !== "USER_CONFIRMATION_REQUIRED"
    ) {
      throw new Error("사용자 확인 없는 승인이 거부되지 않았습니다.");
    }

    const approved = await requestJson(
      baseUrl,
      "/api/v1/assets/decision",
      {
        relativePath: pendingRelative,
        decision: "approved",
        confirmedByUser: true,
      },
    );
    report.checks.approvedDecisionStatus = approved.status;
    if (
      approved.status !== 200 ||
      !/^[a-f0-9]{64}$/.test(approved.payload?.asset?.sha256 || "")
    ) {
      throw new Error("승인 Asset의 이동 또는 SHA-256 기록이 실패했습니다.");
    }

    const after = await requestJson(baseUrl, "/api/v1/gate");
    report.checks.gateAfter = after.payload;
    if (after.status !== 200 || after.payload.exportAllowed !== true) {
      throw new Error("승인 뒤 최종 출력 게이트가 열리지 않았습니다.");
    }

    const manifest = JSON.parse(
      await readFile(
        path.join(created.projectRoot, "asset", "asset-manifest.json"),
        "utf8",
      ),
    );
    report.checks.approvalManifestRecorded =
      manifest.assets.length === 1 &&
      manifest.assets[0].status === "approved" &&
      manifest.assets[0].sourcePath === pendingRelative;
    if (!report.checks.approvalManifestRecorded) {
      throw new Error("Asset 승인 원장이 기록되지 않았습니다.");
    }

    report.ok = true;
  } finally {
    await closeServer(server);
    await rm(temporaryRoot, { recursive: true, force: true });
    report.cleaned = true;
  }

  return report;
}

let report;
try {
  report = await runE2E();
} catch (error) {
  report = {
    ok: false,
    checks: {},
    cleaned: false,
    error: error instanceof Error ? error.message : String(error),
  };
  process.exitCode = 1;
}

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
} else if (report.ok) {
  console.log("PASS detail-page-maker-skill portable E2E");
  console.log("  project → Studio v1 → pending lock → user approval → READY");
  console.log("  temporary project cleaned");
} else {
  console.error(`FAIL detail-page-maker-skill portable E2E: ${report.error}`);
}
