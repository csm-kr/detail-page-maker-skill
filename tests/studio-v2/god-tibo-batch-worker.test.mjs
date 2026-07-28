import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/new-project.mjs";
import { runGodTiboBatch } from "../../skills/detail-page-maker-skill/scripts/god-tibo-batch-worker.mjs";
import { startStudioServer } from "../../skills/detail-page-maker-skill/scripts/studio-server.mjs";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl2kAAAAASUVORK5CYII=";

async function post(baseUrl, pathname, body) {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test("god-tibo 실행기는 선택한 동시성으로 배치 작업을 병렬 생성하고 개별 에셋으로 등록한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-gti-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "살랑 루즈핏 쿨토시",
      supplierUrl: "https://domeggook.com/55873582",
      root: path.join(temporaryRoot, "projects"),
    });
    const started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;
    await post(started.url, "/api/product/ssot/register", {
      files: [
        { fileName: "화이트-정면.png", dataUrl: ONE_PIXEL_PNG },
        { fileName: "화이트-착용.png", dataUrl: ONE_PIXEL_PNG },
      ],
    });
    await post(started.url, "/api/product/ssot/lock", {
      labelText: "HELLO CUTE SLEEVE",
      variantColor: "화이트",
      revisionId: "rev-001",
      confirmedByUser: true,
    });
    const derivedReferenceDirectory = path.join(
      created.projectRoot,
      "product",
      "ssot",
      "derived",
      "imagegen-reference",
    );
    await mkdir(derivedReferenceDirectory, { recursive: true });
    await writeFile(
      path.join(derivedReferenceDirectory, "forced-product-reference.png"),
      Buffer.from(ONE_PIXEL_PNG.split(",")[1], "base64"),
    );
    const batch = await post(
      started.url,
      "/api/product/ssot/batch-generation-jobs",
      {
        targets: [
          { name: "한 쌍", role: "pair-product", prompt: "한 쌍 플랫레이" },
          { name: "착용", role: "wearing-scene", prompt: "양팔 착용" },
          { name: "구조", role: "structure-proof", prompt: "엄지홀 구조" },
          {
            name: "중성 배경",
            role: "background-neutral-proof",
            prompt: "제품과 사람이 없는 중성 배경",
            sourceMode: "scene-reference",
          },
        ],
        confirmedByUser: true,
      },
    );
    assert.equal(batch.response.status, 201);

    let active = 0;
    let maxActive = 0;
    const referenceCounts = new Map();
    const effectivePrompts = [];
    let releaseFourWorkers;
    const fourWorkersOrTimeout = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("네 God Tibo 워커가 시작되지 않았습니다.")),
        2000,
      );
      releaseFourWorkers = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    const result = await runGodTiboBatch({
      studioUrl: started.url,
      jobIds: batch.payload.jobs.map((job) => job.id),
      executeImage: async ({ imagePaths, job, prompt }) => {
        referenceCounts.set(job.target.role, imagePaths.length);
        effectivePrompts.push(prompt);
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (active === 4) releaseFourWorkers();
        await fourWorkersOrTimeout;
        active -= 1;
        return { dataUrl: ONE_PIXEL_PNG };
      },
    });

    assert.equal(result.completed.length, 4);
    assert.equal(result.failed.length, 0);
    assert.equal(result.concurrency, 8);
    assert.equal(result.batchSize, 8);
    assert.equal(maxActive, 4);
    assert.equal(effectivePrompts.length, 4);
    assert.ok(
      effectivePrompts.every(
        (prompt) =>
          prompt.includes("QUALITY_GATE:CLEAN_COMMERCIAL") &&
          prompt.includes("No film grain, no sensor noise"),
      ),
    );
    assert.ok(referenceCounts.get("pair-product") > 0);
    assert.equal(referenceCounts.get("background-neutral-proof"), 0);
    const assetsResponse = await fetch(new URL("/api/assets", started.url));
    const assets = await assetsResponse.json();
    assert.ok(
      assets.every(
        (asset) =>
          asset.selectedData.provenance === "imagegen-derived" &&
          asset.selectedData.allowedUse === "final-consumable",
      ),
    );
    assert.deepEqual(
      assets.map((asset) => asset.role).sort(),
      [
        "background-neutral-proof",
        "pair-product",
        "structure-proof",
        "wearing-scene",
      ],
    );
    const jobsResponse = await fetch(new URL("/api/jobs", started.url));
    const jobs = await jobsResponse.json();
    assert.ok(
      batch.payload.jobs.every(
        (queued) =>
          jobs.find((job) => job.id === queued.id)?.status === "completed",
      ),
    );

    const mixedReferences = await post(started.url, "/api/jobs", {
      type: "imagegen.generate.product-ssot",
      scope: "reference-routing-proof",
      prompt: "직접 참조와 제품 SSOT를 함께 유지",
      sourceRefs: [
        batch.payload.jobs[0].sourceRefs[0],
        "assets/source/pair-product/v1.png",
      ],
      target: {
        name: "참조 라우팅 증거",
        role: "reference-routing-proof",
        kind: "image",
        required: false,
      },
      confirmedByUser: true,
    });
    assert.equal(mixedReferences.response.status, 201);
    const routed = await runGodTiboBatch({
      studioUrl: started.url,
      jobIds: [mixedReferences.payload.id],
      concurrency: 2,
      executeImage: async ({ imagePaths }) => {
        assert.match(
          imagePaths[0],
          /assets[\\/]source[\\/]pair-product[\\/]v1\.png$/,
        );
        assert.match(
          imagePaths[1],
          /product[\\/]ssot[\\/]derived[\\/]imagegen-reference[\\/]/,
        );
        return { dataUrl: ONE_PIXEL_PNG };
      },
    });
    assert.equal(routed.completed.length, 1);

    const edit = await post(
      started.url,
      "/api/assets/pair-product/jobs",
      {
        type: "imagegen.edit",
        version: 1,
        scope: "asset",
        prompt: "배경만 밝게 변경",
        sourceRefs: [],
        confirmedByUser: true,
      },
    );
    assert.equal(edit.response.status, 201);
    const edited = await runGodTiboBatch({
      studioUrl: started.url,
      jobIds: [edit.payload.id],
      concurrency: 2,
      executeImage: async ({ imagePaths }) => {
        assert.match(
          imagePaths[0],
          /assets[\\/]candidates[\\/]pair-product[\\/]v1\.png$/,
        );
        return { dataUrl: ONE_PIXEL_PNG };
      },
    });
    assert.equal(edited.completed.length, 1);
    const updatedAssetsResponse = await fetch(
      new URL("/api/assets", started.url),
    );
    const updatedAssets = await updatedAssetsResponse.json();
    assert.equal(
      updatedAssets.find((asset) => asset.id === "pair-product").versions
        .length,
      2,
    );

    const eightPlusOneBatch = await post(
      started.url,
      "/api/product/ssot/batch-generation-jobs",
      {
        targets: Array.from({ length: 9 }, (_, index) => ({
          name: `배치 검증 ${index + 1}`,
          role: `batch-proof-${index + 1}`,
          prompt: `서로 다른 상업 장면 ${index + 1}`,
          sourceMode: "scene-reference",
          required: false,
        })),
        execution: { provider: "queue" },
        confirmedByUser: true,
      },
    );
    assert.equal(eightPlusOneBatch.response.status, 201);
    const observedBatchSizes = [];
    const observedWorkers = [];
    const chunked = await runGodTiboBatch({
      studioUrl: started.url,
      jobIds: eightPlusOneBatch.payload.jobs.map((job) => job.id),
      executeBatch: async ({
        items,
        outputDirectory,
        workers,
        sizeMode,
        targetSize,
      }) => {
        observedBatchSizes.push(items.length);
        observedWorkers.push(workers);
        assert.equal(sizeMode, "controllable");
        assert.equal(targetSize, "1024x1536");
        await mkdir(outputDirectory, { recursive: true });
        const images = await Promise.all(
          items.map(async (_, index) => {
            const savedPath = path.join(outputDirectory, `frame-${index}.png`);
            await writeFile(
              savedPath,
              Buffer.from(ONE_PIXEL_PNG.split(",")[1], "base64"),
            );
            return { savedPath };
          }),
        );
        return {
          manifestPath: path.join(outputDirectory, "manifest.json"),
          images,
        };
      },
    });
    assert.equal(chunked.completed.length, 9);
    assert.equal(chunked.failed.length, 0);
    assert.equal(chunked.concurrency, 8);
    assert.equal(chunked.batchSize, 8);
    assert.equal(chunked.chunksExecuted, 2);
    assert.deepEqual(observedBatchSizes, [8, 1]);
    assert.deepEqual(observedWorkers, [8, 8]);
  } finally {
    await closeServer(server);
    const safeTempRoot = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (resolvedTemporaryRoot.startsWith(`${safeTempRoot}${path.sep}`)) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
});
