import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/new-project.mjs";
import { startStudioServer } from "../../skills/detail-page-maker-skill/scripts/studio-server.mjs";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl2kAAAAASUVORK5CYII=";

async function requestJson(baseUrl, pathname, body) {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test("사용자가 촬영한 제품 SSOT 사진 여러 장을 한 번에 등록하고 다시 조회할 수 있다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-ssot-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "살랑 루즈핏 쿨토시",
      supplierUrl: "https://domeggook.com/66233973",
      root: path.join(temporaryRoot, "projects"),
    });
    let started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;

    const registered = await requestJson(
      started.url,
      "/api/product/ssot/register",
      {
        files: [
          { fileName: "화이트-정면.png", dataUrl: ONE_PIXEL_PNG },
          { fileName: "화이트-측면.png", dataUrl: ONE_PIXEL_PNG },
        ],
      },
    );
    assert.equal(registered.response.status, 201);
    assert.equal(registered.payload.count, 2);
    assert.equal(registered.payload.items.length, 2);
    assert.notEqual(
      registered.payload.items[0].id,
      registered.payload.items[1].id,
    );
    assert.deepEqual(
      registered.payload.items.map((item) => item.originalFileName),
      ["화이트-정면.png", "화이트-측면.png"],
    );
    assert.ok(
      registered.payload.items.every(
        (item) =>
          item.provenance === "user-captured-same-sku" &&
          item.role === "identity-primary" &&
          item.allowedUse === "reference-only" &&
          item.requiresDerivedAsset === true &&
          item.path.startsWith("product/ssot/user/"),
      ),
    );

    const commercialAssets = await requestJson(started.url, "/api/assets");
    assert.deepEqual(commercialAssets.payload, []);

    const firstPhotoUrl = `/project/${registered.payload.items[0].path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    const firstPhoto = await fetch(new URL(firstPhotoUrl, started.url));
    assert.equal(firstPhoto.status, 200);
    assert.equal(firstPhoto.headers.get("content-type"), "image/png");

    await closeServer(server);
    server = undefined;
    started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;

    const persisted = await requestJson(started.url, "/api/product/ssot");
    assert.equal(persisted.response.status, 200);
    assert.equal(persisted.payload.count, 2);
    assert.deepEqual(
      persisted.payload.items.map((item) => item.originalFileName),
      ["화이트-정면.png", "화이트-측면.png"],
    );
  } finally {
    await closeServer(server);
    const safeTempRoot = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (resolvedTemporaryRoot.startsWith(`${safeTempRoot}${path.sep}`)) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
});

test("사용자가 확인한 라벨과 색상으로 제품 SSOT를 REV-001에 잠글 수 있다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-ssot-lock-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "살랑 루즈핏 쿨토시",
      supplierUrl: "https://domeggook.com/66233973",
      root: path.join(temporaryRoot, "projects"),
    });
    const started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;

    const registered = await requestJson(
      started.url,
      "/api/product/ssot/register",
      {
        files: [
          { fileName: "화이트-라벨.png", dataUrl: ONE_PIXEL_PNG },
          { fileName: "화이트-착용.png", dataUrl: ONE_PIXEL_PNG },
        ],
      },
    );
    assert.equal(registered.response.status, 201);

    const locked = await requestJson(started.url, "/api/product/ssot/lock", {
      labelText: "HELLO CUTE SLEEVE",
      variantColor: "화이트",
      revisionId: "rev-001",
      confirmedByUser: true,
      notes: "실제품 원본에서 라벨 문구와 화이트 색상을 확인함",
    });
    assert.equal(locked.response.status, 201);
    assert.equal(locked.payload.lock.status, "locked");
    assert.equal(locked.payload.lock.labelText, "HELLO CUTE SLEEVE");
    assert.equal(locked.payload.lock.variantColor, "화이트");
    assert.equal(locked.payload.lock.revisionId, "rev-001");
    assert.equal(locked.payload.lock.itemIds.length, 2);
    assert.match(
      locked.payload.lock.qaReportPath,
      /^qa\/reports\/product-ssot-identity-review-rev-001\.json$/,
    );
    assert.ok(
      locked.payload.items.every(
        (item) =>
          item.identityStatus === "locked" &&
          item.identityLabelText === "HELLO CUTE SLEEVE" &&
          item.lockRevisionId === "rev-001",
      ),
    );

    const persisted = await requestJson(started.url, "/api/product/ssot");
    assert.equal(persisted.payload.lock.status, "locked");
    assert.equal(persisted.payload.items[0].identityStatus, "locked");

    const qaResponse = await fetch(
      new URL(`/project/${locked.payload.lock.qaReportPath}`, started.url),
    );
    const qaReport = await qaResponse.json();
    assert.equal(qaResponse.status, 200);
    assert.equal(qaReport.status, "passed");
    assert.equal(qaReport.hardFailures.length, 0);
    assert.equal(qaReport.decision.labelText, "HELLO CUTE SLEEVE");

    const generationJob = await requestJson(
      started.url,
      "/api/product/ssot/generation-jobs",
      {
        name: "화이트 루즈핏 히어로",
        role: "hero-product",
        prompt:
          "실제품 형태와 HELLO CUTE SLEEVE 라벨을 유지한 화이트 쿨토시 히어로 에셋",
        confirmedByUser: true,
      },
    );
    assert.equal(generationJob.response.status, 201);
    assert.equal(generationJob.payload.type, "imagegen.generate.product-ssot");
    assert.equal(generationJob.payload.status, "queued");
    assert.deepEqual(
      generationJob.payload.sourceRefs,
      registered.payload.items.map((item) => item.path),
    );
    assert.deepEqual(generationJob.payload.target, {
      name: "화이트 루즈핏 히어로",
      role: "hero-product",
      kind: "image",
      required: true,
    });

    const batchGeneration = await requestJson(
      started.url,
      "/api/product/ssot/batch-generation-jobs",
      {
        targets: [
          {
            name: "화이트 한 쌍 플랫레이",
            role: "pair-product",
            prompt:
              "실제품 한 쌍의 전체 비율과 손등 라벨 위치를 유지한 플랫레이",
          },
          {
            name: "화이트 루즈핏 착용",
            role: "wearing-scene",
            prompt:
              "양팔에 착용한 루즈핏과 엄지홀, 손등 커버를 보여주는 장면",
          },
        ],
        execution: {
          provider: "queue",
          size: "1024x1536",
        },
        confirmedByUser: true,
      },
    );
    assert.equal(batchGeneration.response.status, 201);
    assert.equal(batchGeneration.payload.count, 2);
    assert.equal(batchGeneration.payload.jobs.length, 2);
    assert.notEqual(
      batchGeneration.payload.jobs[0].id,
      batchGeneration.payload.jobs[1].id,
    );
    assert.deepEqual(
      batchGeneration.payload.jobs.map((job) => job.target.role),
      ["pair-product", "wearing-scene"],
    );
    assert.ok(
      batchGeneration.payload.jobs.every(
        (job) =>
          job.type === "imagegen.generate.product-ssot" &&
          job.status === "queued" &&
          job.executor.provider === "queue" &&
          job.executor.concurrency === 4 &&
          job.sourceRefs.length === registered.payload.items.length,
      ),
    );

    const registerAfterLock = await requestJson(
      started.url,
      "/api/product/ssot/register",
      {
        files: [{ fileName: "추가.png", dataUrl: ONE_PIXEL_PNG }],
      },
    );
    assert.equal(registerAfterLock.response.status, 409);
    assert.equal(
      registerAfterLock.payload.error.code,
      "PRODUCT_SSOT_LOCKED",
    );
  } finally {
    await closeServer(server);
    const safeTempRoot = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (resolvedTemporaryRoot.startsWith(`${safeTempRoot}${path.sep}`)) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
});

test("Studio는 실제품 SSOT 사진 여러 장을 고르는 전용 등록 UI를 제공한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-ssot-ui-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "살랑 루즈핏 쿨토시",
      supplierUrl: "https://domeggook.com/66233973",
      root: path.join(temporaryRoot, "projects"),
    });
    const started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;

    const response = await fetch(new URL("/studio.html", started.url));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(
      html,
      /<button[^>]*id="uploadProductSsot"[^>]*>실제품 사진 등록<\/button>/,
    );
    assert.match(html, /<form[^>]*id="ssotUploadForm"[^>]*>/);
    assert.match(
      html,
      /<input(?=[^>]*name="files")(?=[^>]*type="file")(?=[^>]*multiple)[^>]*>/,
    );
    assert.match(html, /<div[^>]*id="productSsotList"[^>]*>/);
    assert.match(
      html,
      /<button[^>]*id="lockProductSsot"[^>]*>SSOT 잠금<\/button>/,
    );
    assert.match(
      html,
      /<button[^>]*id="createProductAsset"[^>]*>SSOT로 에셋 제작<\/button>/,
    );
    assert.match(
      html,
      /<button[^>]*id="createAllProductAssets"[^>]*>전체 에셋 일괄 제작<\/button>/,
    );
    assert.match(html, /<div[^>]*id="assetGallery"[^>]*>/);
    assert.match(html, /<form[^>]*id="supplierUrlForm"[^>]*>/);
    assert.match(html, />상품 URL</);
    assert.match(html, />소구점·페이지 기획</);
    assert.match(html, />이미지 생성·승인</);
    assert.match(html, />GIF 편집</);
    assert.match(html, />상세페이지 조립</);
    assert.match(html, />상세페이지 편집</);
    assert.match(html, />QA·내보내기</);
    assert.match(html, /COMMERCIAL · DESIGN · BUYER JOURNEY/);
    assert.match(html, /<section[^>]*id="productionRoadmap"[^>]*>/);
    assert.match(html, /<div[^>]*id="commercialStrategy"[^>]*>/);
    assert.match(html, /<div[^>]*id="modelApprovalPanel"[^>]*>/);
    assert.match(html, /<div[^>]*id="roadmapAssetGroups"[^>]*>/);
    assert.match(html, /<div[^>]*id="detailPageRoadmap"[^>]*>/);
    assert.match(html, /<div[^>]*id="gifProductionRoadmap"[^>]*>/);
    assert.match(
      html,
      /<button[^>]*id="lockAssembly"[^>]*>에셋 확정 · 상세페이지 검토 시작<\/button>/,
    );
    assert.doesNotMatch(html, /상세페이지 조립 확정/);
    assert.match(html, /<form[^>]*id="ssotLockForm"[^>]*>/);
    assert.match(html, /<form[^>]*id="productAssetForm"[^>]*>/);
    assert.match(html, /<form[^>]*id="productAssetBatchForm"[^>]*>/);
    assert.match(html, /참조 원본 등록/);
    assert.match(
      html,
      /최종 이미지와 GIF에는 ImageGen으로 만든 파생 버전만 사용할 수 있습니다/,
    );
    assert.match(
      html,
      /<option[^>]*value="god-tibo-imagen"[^>]*selected[^>]*>god-tibo-imagen 병렬 실행<\/option>/,
    );
    assert.match(
      html,
      /<input(?=[^>]*name="concurrency")(?=[^>]*value="4")(?=[^>]*min="1")(?=[^>]*max="4")[^>]*>/,
    );
    assert.match(
      html,
      /<input(?=[^>]*name="labelText")(?=[^>]*required)[^>]*>/,
    );

    const scriptResponse = await fetch(
      new URL("/studio.js", started.url),
    );
    const script = await scriptResponse.text();
    assert.equal(scriptResponse.status, 200);
    assert.match(script, /data-asset-action="edit"/);
    assert.match(script, /data-asset-action="derive"/);
    assert.match(script, /참조 전용 · ImageGen 파생 필요/);
    assert.match(script, /ImageGen 파생 만들기/);
    assert.match(script, /\/api\/detail-page\/start/);
    assert.match(
      script,
      /에셋을 확정하고 중복 없는 카피·레이아웃 검토본을 만들었습니다/,
    );
    assert.match(script, /handleProductAssetBatchRequest/);
    assert.match(script, /handleSupplierUrl/);
    assert.match(script, /renderProductionRoadmap/);
    assert.match(script, /한 문장 핵심/);
    assert.match(script, /보여줄 장면/);
    assert.match(script, /sellingPoint/);
    assert.match(script, /approveModelSsot/);
    assert.match(script, /id="inspectorApproveModel"/);
    assert.match(script, /이 버전을 모델 SSOT로 승인·잠금/);
    assert.match(script, /사용자 판단으로 채택/);
    assert.match(script, /userOverride: true/);
    assert.match(script, /data-motion-preview-approve/);
    assert.match(script, /data-motion-preview-feedback/);
    assert.match(script, /이 프리뷰 승인/);
    assert.match(script, /변경 요청/);
  } finally {
    await closeServer(server);
    const safeTempRoot = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (resolvedTemporaryRoot.startsWith(`${safeTempRoot}${path.sep}`)) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
});

test("제작 로드맵은 선행 에셋과 중복 없는 12개 섹션·GIF 7종을 공개한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-roadmap-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "살랑 루즈핏 쿨토시",
      supplierUrl: "https://domeggook.com/55873582?affid=",
      root: path.join(temporaryRoot, "projects"),
    });
    const started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;

    const roadmap = await requestJson(
      started.url,
      "/api/production-roadmap",
    );
    assert.equal(roadmap.response.status, 200);
    assert.equal(roadmap.payload.assets.length, 21);
    assert.ok(roadmap.payload.assets.length >= 20);
    assert.equal(roadmap.payload.pages.length, 12);
    assert.equal(roadmap.payload.gifs.length, 7);
    assert.deepEqual(
      roadmap.payload.gifs.map((gif) => gif.id),
      [
        "cool-wave-motion",
        "loose-ripple-motion",
        "handback-compare-motion",
        "thumb-flex-motion",
        "put-on-motion",
        "pleat-release-motion",
        "size-reveal-motion",
      ],
    );
    assert.equal(
      new Set(roadmap.payload.gifs.map((gif) => gif.outputAssetId)).size,
      7,
    );
    assert.equal(
      roadmap.payload.gate.requiredApprovedCount,
      roadmap.payload.assets.filter((asset) => asset.required).length + 1,
    );
    assert.deepEqual(
      roadmap.payload.groups.map((group) => group.id),
      [
        "product-foundation",
        "model-selection",
        "use-example",
        "proof-detail",
      ],
    );
    assert.equal(
      roadmap.payload.assets.filter((asset) => asset.requiresModel).length,
      9,
    );
    assert.ok(
      roadmap.payload.assets.every(
        (asset) =>
          !["pair-product", "driving-scene", "background-car-interior"].includes(
            asset.id,
          ),
      ),
    );
    const modelCandidates = roadmap.payload.assets.filter(
      (asset) => asset.group === "model-selection",
    );
    assert.equal(modelCandidates.length, 4);
    assert.ok(
      modelCandidates.every(
        (asset) =>
          asset.sourceMode === "model-candidate" &&
          !/(제품|쿨토시|토시)/.test(asset.prompt),
      ),
    );
    assert.equal(
      roadmap.payload.assets.filter((asset) => asset.group === "background")
        .length,
      0,
    );
    const blockedPreviewApproval = await requestJson(
      started.url,
      "/api/motion-previews/size-reveal-motion/approve",
      {},
    );
    assert.equal(blockedPreviewApproval.response.status, 409);
    assert.equal(
      blockedPreviewApproval.payload.error.code,
      "USER_CONFIRMATION_REQUIRED",
    );
    const previewApproval = await requestJson(
      started.url,
      "/api/motion-previews/size-reveal-motion/approve",
      { confirmedByUser: true },
    );
    assert.equal(previewApproval.response.status, 200);
    assert.equal(previewApproval.payload.status, "preview_approved");
    const approvedRoadmap = await requestJson(
      started.url,
      "/api/production-roadmap",
    );
    assert.equal(
      approvedRoadmap.payload.previewReviews["size-reveal-motion"].status,
      "preview_approved",
    );
    const previewFeedback = await requestJson(
      started.url,
      "/api/motion-previews/size-reveal-motion/feedback",
      {
        confirmedByUser: true,
        feedback: "가로 치수선의 시작을 조금 늦춰 주세요.",
      },
    );
    assert.equal(previewFeedback.response.status, 200);
    assert.equal(previewFeedback.payload.status, "changes_requested");
    assert.equal(
      previewFeedback.payload.feedback,
      "가로 치수선의 시작을 조금 늦춰 주세요.",
    );
    assert.ok(
      roadmap.payload.assets.every(
        (asset) =>
          asset.id &&
          asset.role &&
          asset.purpose &&
          Array.isArray(asset.pageNumbers),
      ),
    );
  } finally {
    await closeServer(server);
    const safeTempRoot = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (resolvedTemporaryRoot.startsWith(`${safeTempRoot}${path.sep}`)) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
});

test("프로젝트별 COMMERCIAL·DESIGN 전략이 기본 에셋 지도와 병합된다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-commercial-roadmap-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "살랑 루즈핏 쿨토시",
      supplierUrl: "https://domeggook.com/55873582?affid=",
      root: path.join(temporaryRoot, "projects"),
    });
    const planningRoot = path.join(created.projectRoot, "planning");
    await mkdir(planningRoot, { recursive: true });
    await writeFile(
      path.join(planningRoot, "commercial-roadmap.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          summary: "COMMERCIAL.md와 DESIGN.md를 반영한 프로젝트별 로드맵",
          strategy: {
            heroThesis: "조이는 토시 말고, 살랑이는 쪽으로.",
            sourceDocuments: ["planning/COMMERCIAL.md", "planning/DESIGN.md"],
            primaryAppeals: [
              {
                id: "loose-fit",
                name: "여유 있게 떨어지는 루즈핏",
              },
            ],
          },
          pages: [
            {
              number: 1,
              id: "value-hook",
              name: "핵심 가치 훅",
              purpose: "제품과 가치를 즉시 인지",
              purchaseQuestion: "왜 이 토시인가?",
              headline: "조이는 토시 말고, 살랑이는 쪽으로.",
              sellingPoint: "여유 있게 떨어지는 화이트 플리츠",
              evidence: "승인된 착용 장면과 실제 제품 한 쌍",
              designRule: "히어로 카피는 두 줄 이내",
              assetRoles: ["wearing-scene", "hero-product"],
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;
    const roadmap = await requestJson(
      started.url,
      "/api/production-roadmap",
    );
    assert.equal(roadmap.response.status, 200);
    assert.equal(roadmap.payload.assets.length, 21);
    assert.equal(roadmap.payload.gifs.length, 7);
    assert.equal(roadmap.payload.pages.length, 1);
    assert.equal(
      roadmap.payload.strategy.heroThesis,
      "조이는 토시 말고, 살랑이는 쪽으로.",
    );
    assert.equal(roadmap.payload.pages[0].purchaseQuestion, "왜 이 토시인가?");
    assert.equal(
      roadmap.payload.pages[0].sellingPoint,
      "여유 있게 떨어지는 화이트 플리츠",
    );
  } finally {
    await closeServer(server);
    const safeTempRoot = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (resolvedTemporaryRoot.startsWith(`${safeTempRoot}${path.sep}`)) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
});

test("승인 모델이 없으면 인간 장면을 막고 선택한 모델 버전을 SSOT로 잠근다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-model-gate-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "살랑 루즈핏 쿨토시",
      supplierUrl: "https://domeggook.com/55873582?affid=",
      root: path.join(temporaryRoot, "projects"),
    });
    const started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;

    const registeredSsot = await requestJson(
      started.url,
      "/api/product/ssot/register",
      {
        files: [{ fileName: "화이트-실물.png", dataUrl: ONE_PIXEL_PNG }],
      },
    );
    await requestJson(started.url, "/api/product/ssot/lock", {
      labelText: "HELLO CUTE SLEEVE",
      variantColor: "화이트",
      revisionId: "rev-001",
      confirmedByUser: true,
    });

    const blocked = await requestJson(
      started.url,
      "/api/product/ssot/batch-generation-jobs",
      {
        targets: [
          {
            name: "화이트 루즈핏 착용",
            role: "wearing-scene",
            prompt: "승인된 모델이 화이트 쿨토시를 착용한 양팔 장면",
            requiresModel: true,
          },
        ],
        execution: { provider: "queue" },
        confirmedByUser: true,
      },
    );
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.payload.error.code, "MODEL_SSOT_REQUIRED");

    const candidate = await requestJson(
      started.url,
      "/api/assets/register",
      {
        assetId: "model-candidate-a",
        name: "모델 후보 A",
        role: "model-candidate-a",
        kind: "image",
        required: false,
        dataUrl: ONE_PIXEL_PNG,
        fileName: "model-candidate-a.png",
        provenance: "imagegen-derived",
      },
    );
    await requestJson(
      started.url,
      "/api/assets/model-candidate-a/qa",
      {
        version: candidate.payload.version.number,
        status: "passed",
        score: 98,
        hardFailures: [],
      },
    );

    const approvedModel = await requestJson(
      started.url,
      "/api/model/ssot/approve",
      {
        assetId: "model-candidate-a",
        version: 1,
        approvedBy: "local-user",
        confirmedByUser: true,
      },
    );
    assert.equal(approvedModel.response.status, 200);
    assert.equal(approvedModel.payload.status, "locked");
    assert.equal(approvedModel.payload.assetId, "model-candidate-a");
    assert.equal(approvedModel.payload.version, 1);
    assert.equal(
      approvedModel.payload.sha256,
      candidate.payload.version.sha256,
    );

    const accepted = await requestJson(
      started.url,
      "/api/product/ssot/batch-generation-jobs",
      {
        targets: [
          {
            name: "화이트 루즈핏 착용",
            role: "wearing-scene",
            prompt: "승인 모델과 실제 제품 SSOT를 함께 쓰는 양팔 착용 장면",
            sourceMode: "product-and-model-ssot",
            requiresModel: true,
          },
          {
            name: "중성 구조 증거 배경",
            role: "background-neutral-proof",
            prompt: "제품과 사람이 없는 밝은 무채색 배경",
            sourceMode: "scene-reference",
            requiresModel: false,
          },
          {
            name: "모델 후보 B",
            role: "model-candidate-b",
            prompt: "제품 없이 같은 사람의 모델 후보 시트",
            sourceMode: "model-candidate",
            requiresModel: false,
          },
        ],
        execution: { provider: "queue" },
        confirmedByUser: true,
      },
    );
    assert.equal(accepted.response.status, 201);
    assert.deepEqual(accepted.payload.jobs[0].sourceRefs, [
      registeredSsot.payload.items[0].path,
      candidate.payload.version.path,
    ]);
    assert.equal(accepted.payload.jobs[0].target.requiresModel, true);
    assert.equal(
      accepted.payload.jobs[0].target.sourceMode,
      "product-and-model-ssot",
    );
    assert.deepEqual(accepted.payload.jobs[1].sourceRefs, []);
    assert.equal(
      accepted.payload.jobs[1].target.sourceMode,
      "scene-reference",
    );
    assert.deepEqual(accepted.payload.jobs[2].sourceRefs, []);
    assert.equal(
      accepted.payload.jobs[2].target.sourceMode,
      "model-candidate",
    );

    const projectState = await requestJson(started.url, "/api/project");
    assert.equal(projectState.payload.modelSsot.status, "locked");
    assert.equal(
      projectState.payload.modelSsot.assetId,
      "model-candidate-a",
    );
  } finally {
    await closeServer(server);
    const safeTempRoot = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (resolvedTemporaryRoot.startsWith(`${safeTempRoot}${path.sep}`)) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
});
