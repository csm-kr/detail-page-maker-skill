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
import { createProject } from "./lib/new-project.mjs";
import { startStudioV1Server } from "./runtime/studio-v1-server.mjs";

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
  "LEARNINGS.md",
];

async function requestJson(baseUrl, pathname, body, capabilityToken) {
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

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
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

    const eagerPlanningFiles = [];
    for (const fileName of PLANNING_FILES) {
      if (
        await exists(
          path.join(
            created.projectRoot,
            ".detail-page",
            "planning",
            fileName,
          ),
        )
      ) {
        eagerPlanningFiles.push(fileName);
      }
    }
    if (eagerPlanningFiles.length > 0) {
      throw new Error(
        `G1 전에 planning 파일이 생성되었습니다: ${eagerPlanningFiles.join(", ")}`,
      );
    }
    report.checks.planningTemplatesLazy = true;
    await Promise.all([
      access(
        path.join(created.projectRoot, "input", "product"),
      ),
      access(
        path.join(created.projectRoot, "output", "detail-page.html"),
      ),
      access(
        path.join(
          created.projectRoot,
          ".detail-page",
          "authoring",
          "detail-page.html",
        ),
      ),
    ]);
    const lazyOutputDirectories = [
      path.join("output", "media"),
      path.join("output", "wing"),
      path.join(".detail-page", "backups"),
      path.join(".detail-page", "evidence"),
      path.join(".detail-page", "generation"),
      path.join(".detail-page", "planning"),
      path.join(".detail-page", "qa"),
      path.join(".detail-page", "workflow"),
    ];
    const eagerlyCreated = [];
    for (const relativePath of lazyOutputDirectories) {
      if (await exists(path.join(created.projectRoot, relativePath))) {
        eagerlyCreated.push(relativePath);
      }
    }
    if (eagerlyCreated.length > 0) {
      throw new Error(
        `lazy output 폴더가 미리 생성되었습니다: ${eagerlyCreated.join(", ")}`,
      );
    }
    report.checks.currentProjectContract = {
      input: "input/product",
      publicHtml: "output/detail-page.html",
      authoringHtml: ".detail-page/authoring/detail-page.html",
      lazyOutputDirectories,
      forbiddenProjectCopies: [".detail-page/studio"],
    };
    const forbiddenPublicRoots = [
      "index.html",
      "deliverables",
      path.join("html", "index.html"),
      path.join("planning", "COMMERCIAL.md"),
      path.join("asset", "asset-manifest.json"),
    ];
    const forbiddenFound = [];
    for (const relativePath of forbiddenPublicRoots) {
      if (await exists(path.join(created.projectRoot, relativePath))) {
        forbiddenFound.push(relativePath);
      }
    }
    report.checks.forbiddenPublicRoots = forbiddenFound;
    if (forbiddenFound.length > 0) {
      throw new Error(
        `legacy 공개 경로가 생성되었습니다: ${forbiddenFound.join(", ")}`,
      );
    }

    const pendingRelative =
      ".detail-page/generation/pending/image/01-e2e-hybrid-v01.png";
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
    const baseUrl = new URL(started.url).origin;

    const studioResponse = await fetch(new URL("/studio.html", baseUrl));
    report.checks.studioHttpStatus = studioResponse.status;
    if (studioResponse.status !== 200) {
      throw new Error(`Studio HTTP status: ${studioResponse.status}`);
    }
    const canonicalOutputPath = path.join(
      created.projectRoot,
      "output",
      "detail-page.html",
    );
    const canonicalBeforePreview = await readFile(canonicalOutputPath, "utf8");
    const outputPreviewResponse = await fetch(
      new URL("/output/detail-page.html", baseUrl),
    );
    const outputPreviewHtml = await outputPreviewResponse.text();
    report.checks.outputPreviewHidesStudioBeforeFinalSession =
      outputPreviewResponse.status === 200 &&
      !outputPreviewHtml.includes("data-local-studio-launcher");
    report.checks.canonicalOutputHasNoStudioLauncher =
      !canonicalBeforePreview.includes("data-local-studio-launcher") &&
      (await readFile(canonicalOutputPath, "utf8")) === canonicalBeforePreview;
    if (
      !report.checks.outputPreviewHidesStudioBeforeFinalSession ||
      !report.checks.canonicalOutputHasNoStudioLauncher
    ) {
      throw new Error(
        "최종 session 전 Studio 비노출 또는 공개 canonical 무오염 계약이 실패했습니다.",
      );
    }
    report.checks.projectStudioRuntimeCopied = await exists(
      path.join(created.projectRoot, ".detail-page", "studio"),
    );
    if (report.checks.projectStudioRuntimeCopied) {
      throw new Error(
        "공용 Studio runtime이 상품 프로젝트에 복제되었습니다.",
      );
    }

    const before = await requestJson(
      baseUrl,
      "/api/v1/gate",
      undefined,
      started.capabilityToken,
    );
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
      started.capabilityToken,
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
      started.capabilityToken,
    );
    report.checks.approvedDecisionStatus = approved.status;
    if (
      approved.status !== 200 ||
      !/^[a-f0-9]{64}$/.test(approved.payload?.asset?.sha256 || "")
    ) {
      throw new Error("승인 Asset의 이동 또는 SHA-256 기록이 실패했습니다.");
    }

    const after = await requestJson(
      baseUrl,
      "/api/v1/gate",
      undefined,
      started.capabilityToken,
    );
    report.checks.gateAfter = after.payload;
    if (after.status !== 200 || after.payload.exportAllowed !== true) {
      throw new Error("승인 뒤 최종 출력 게이트가 열리지 않았습니다.");
    }

    const manifest = JSON.parse(
      await readFile(
        path.join(
          created.projectRoot,
          ".detail-page",
          "generation",
          "asset-manifest.json",
        ),
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
  console.log("  project → autonomous asset gate → final-session-only Studio → READY");
  console.log("  temporary project cleaned");
} else {
  console.error(`FAIL detail-page-maker-skill portable E2E: ${report.error}`);
}
