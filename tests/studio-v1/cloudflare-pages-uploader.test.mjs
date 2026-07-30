import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CloudflarePagesUploaderError,
  buildWranglerRuntimeIntegrityManifest,
  createCloudflarePagesNamespace,
  defaultCloudflareOwnerProvider,
  defaultWranglerRunner,
  preflightCloudflarePagesConnection,
  redactSecrets,
  signCloudflarePagesBootstrapReceipt,
  uploadCloudflarePagesExport,
} from "../../skills/detail-page-maker-skill/scripts/runtime/cloudflare-pages-uploader.mjs";

const WRANGLER_VERSION = "4.123.0";
const WRANGLER_ENTRY_BYTES = Buffer.from("#!/usr/bin/env node\n");
const PAGES_PROJECT = "detail-page-assets";
const PUBLIC_BASE_URL = `https://${PAGES_PROJECT}.pages.dev`;
const PUBLISHER_ID = "studio-publisher-test";
const TEST_WRITER_ID = "writer-test-machine-0001";
const TEST_OWNER_SECRET = Buffer.alloc(32, 0x5a);
const TEST_LOCK_ROOT = path.join(
  os.tmpdir(),
  `detail-page-maker-pages-lock-test-${process.pid}`,
);

const ownerProvider = async () => ({
  writerId: TEST_WRITER_ID,
  secret: Buffer.from(TEST_OWNER_SECRET),
  stateRoot: path.dirname(TEST_LOCK_ROOT),
});

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function ownerDigest({
  wranglerEntrySha256,
  wranglerRuntimeTreeSha256,
}) {
  const binding = {
    schema_version: "1.0",
    provider: "cloudflare-pages",
    pages_project: PAGES_PROJECT,
    public_base_url: PUBLIC_BASE_URL,
    production_branch: "main",
    publisher_id: PUBLISHER_ID,
    wrangler_version: WRANGLER_VERSION,
    wrangler_entry_sha256: wranglerEntrySha256,
    wrangler_runtime_tree_sha256: wranglerRuntimeTreeSha256,
    runtime_root: ".agents/runtime/cloudflare-pages",
    wrangler_runtime_lock: "wrangler-runtime-lock.json",
    bootstrap_receipt_path: ".detail-page/cloudflare-pages-bootstrap.json",
    execution_policy_id: "node-permission-register-hooks-memory-v1",
    writer_id: TEST_WRITER_ID,
  };
  return createHmac("sha256", TEST_OWNER_SECRET)
    .update("detail-page-maker/cloudflare-pages-owner/v1", "utf8")
    .update("\n", "utf8")
    .update(`${JSON.stringify(binding, null, 2)}\n`, "utf8")
    .digest("hex");
}

async function fixture({
  projectKey = "product-123",
  exportId = "wing-20260730-010203-aaaaaaaa",
  wranglerEntryBytes = WRANGLER_ENTRY_BYTES,
  extraRuntimeFiles = [],
} = {}) {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), "cloudflare-pages-uploader-"),
  );
  const runtimeRoot = path.join(
    projectRoot,
    ".agents",
    "runtime",
    "cloudflare-pages",
  );
  const wranglerRoot = path.join(runtimeRoot, "node_modules", "wrangler");
  await mkdir(path.join(wranglerRoot, "bin"), { recursive: true });
  await writeFile(
    path.join(wranglerRoot, "package.json"),
    `${JSON.stringify({
      name: "wrangler",
      version: WRANGLER_VERSION,
      bin: { wrangler: "bin/wrangler.js" },
    })}\n`,
  );
  await writeFile(
    path.join(wranglerRoot, "bin", "wrangler.js"),
    wranglerEntryBytes,
  );
  await mkdir(path.join(wranglerRoot, "dist"), { recursive: true });
  await writeFile(
    path.join(wranglerRoot, "dist", "imported.js"),
    "export const runtimeDependency = true;\n",
  );
  for (const extra of extraRuntimeFiles) {
    const extraRoot = extra.runtimeRelativePath
      ? path.join(runtimeRoot, "node_modules")
      : wranglerRoot;
    const destination = path.join(
      extraRoot,
      ...String(
        extra.runtimeRelativePath || extra.relativePath,
      ).split("/"),
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, extra.bytes);
  }
  const runtimeLock = await buildWranglerRuntimeIntegrityManifest({
    runtimeRoot,
  });
  const writerOwnerDigest = ownerDigest({
    wranglerEntrySha256: digest(wranglerEntryBytes),
    wranglerRuntimeTreeSha256: runtimeLock.tree_sha256,
  });
  await writeFile(
    path.join(runtimeRoot, "wrangler-runtime-lock.json"),
    `${JSON.stringify(runtimeLock, null, 2)}\n`,
  );
  await mkdir(path.join(projectRoot, ".detail-page"), { recursive: true });
  await writeFile(
    path.join(projectRoot, ".detail-page", "cloudflare-pages.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        provider: "cloudflare-pages",
        pages_project: PAGES_PROJECT,
        public_base_url: PUBLIC_BASE_URL,
        production_branch: "main",
        wrangler_version: WRANGLER_VERSION,
        wrangler_entry_sha256: digest(wranglerEntryBytes),
        wrangler_runtime_tree_sha256: runtimeLock.tree_sha256,
        publisher_id: PUBLISHER_ID,
        writer_owner_digest: writerOwnerDigest,
      },
      null,
      2,
    )}\n`,
  );
  const namespace = createCloudflarePagesNamespace({
    publicBaseUrl: PUBLIC_BASE_URL,
    projectKey,
    exportId,
  });
  const exportRoot = path.join(projectRoot, "output", "wing", exportId);
  await mkdir(path.join(exportRoot, "assets"), { recursive: true });
  const assetBytes = Buffer.from("new-webp-bytes");
  const filename = "section-01.webp";
  const asset = {
    filename,
    mime_type: "image/webp",
    bytes: assetBytes.length,
    sha256: digest(assetBytes),
    cdn_url: `${namespace.namespaceUrl}/${filename}`,
  };
  await writeFile(path.join(exportRoot, "assets", filename), assetBytes);
  await writeFile(
    path.join(exportRoot, "cdn-upload-manifest.json"),
    `${JSON.stringify(
      {
        schema_version: "2.0",
        export_id: exportId,
        project_key: projectKey,
        cdn_base_url: namespace.namespaceUrl,
        assets: [asset],
        remote_verification: { status: "pending" },
      },
      null,
      2,
    )}\n`,
  );
  const bootstrapReceipt = {
    schema_version: "1.0",
    receipt_type: "cloudflare-pages-bootstrap",
    pages_project: PAGES_PROJECT,
    public_base_url: PUBLIC_BASE_URL,
    publisher_id: PUBLISHER_ID,
    writer_owner_digest: writerOwnerDigest,
    expected_remote_index_status: 404,
    expected_generation: 0,
    expected_deployment_count: 0,
    authorized_by: "user:test-bootstrap-owner",
    authorized_at: "2026-07-30T00:00:00.000Z",
  };
  bootstrapReceipt.owner_hmac_sha256 =
    signCloudflarePagesBootstrapReceipt(
      bootstrapReceipt,
      TEST_OWNER_SECRET,
    );
  return {
    projectRoot,
    exportRoot,
    projectKey,
    exportId,
    namespace,
    asset,
    assetBytes,
    writerOwnerDigest,
    ownerProvider,
    bootstrapReceipt,
    lockOptions: { lockRoot: TEST_LOCK_ROOT },
  };
}

function response(bytes, {
  status = 200,
  mime = "image/webp",
  cache = "public, max-age=31536000, immutable",
} = {}) {
  return new Response(bytes, {
    status,
    headers: {
      "Content-Type": mime,
      "Cache-Control": cache,
    },
  });
}

function runnerFor(calls, { deployments = [] } = {}) {
  return async (invocation) => {
    calls.push(invocation);
    const args = invocation.args.slice(1);
    if (args[0] === "whoami") {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ authenticated: true }),
        stderr: "",
      };
    }
    if (args.join(" ").startsWith("pages project list")) {
      return {
        exitCode: 0,
        stdout: JSON.stringify([{ name: PAGES_PROJECT }]),
        stderr: "",
      };
    }
    if (args.join(" ").startsWith("pages deployment list")) {
      return {
        exitCode: 0,
        stdout: JSON.stringify(deployments),
        stderr: "",
      };
    }
    if (args.join(" ").startsWith("pages deploy")) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ deployment_id: "deployment-1" }),
        stderr: "",
      };
    }
    throw new Error(`unexpected command: ${args.join(" ")}`);
  };
}

function isPagesDeploy(invocation) {
  const args = invocation.args.slice(1);
  return args[0] === "pages" && args[1] === "deploy";
}

test("프로젝트 로컬 pinned Wrangler를 shell:false/keyring 강제로 실행하고 누적 검증한다", async () => {
  const item = await fixture();
  const calls = [];
  let deployedIndexBytes = null;
  let deployedAssetBytes = null;
  const fetchImpl = async (url) => {
    if (url === item.asset.cdn_url) {
      if (!deployedAssetBytes) return response("", { status: 404 });
      return response(deployedAssetBytes);
    }
    if (url === `${PUBLIC_BASE_URL}/deploy-index.json`) {
      if (!deployedIndexBytes) return response("", { status: 404 });
      return response(deployedIndexBytes, {
        mime: "application/json",
        cache: "no-store",
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  const baseRunner = runnerFor(calls);
  const runner = async (invocation) => {
    const result = await baseRunner(invocation);
    const args = invocation.args.slice(1);
    if (isPagesDeploy(invocation)) {
      const stagingRoot = args[2];
      deployedIndexBytes = await readFile(
        path.join(stagingRoot, "deploy-index.json"),
      );
      deployedAssetBytes = await readFile(
        path.join(
          stagingRoot,
          item.projectKey,
          item.exportId,
          item.asset.filename,
        ),
      );
    }
    return result;
  };
  try {
    const result = await uploadCloudflarePagesExport({
      ...item,
      runner,
      fetchImpl,
    });
    assert.equal(result.status, "completed");
    assert.equal(result.assetCount, 1);
    assert.equal(result.verification.assetCount, 1);
    assert.equal(result.publisherId, PUBLISHER_ID);
    assert.equal(result.generation, 1);
    assert.equal(result.verification.deployIndex.generation, 1);
    const deployedIndex = JSON.parse(deployedIndexBytes.toString("utf8"));
    assert.equal(deployedIndex.publisher_id, PUBLISHER_ID);
    assert.equal(
      deployedIndex.writer_owner_digest,
      item.writerOwnerDigest,
    );
    assert.equal(deployedIndex.generation, 1);
    assert.ok(calls.length >= 4);
    for (const call of calls) {
      assert.equal(call.command, process.execPath);
      assert.equal(call.shell, false);
      assert.equal(call.env.CLOUDFLARE_AUTH_USE_KEYRING, "true");
      assert.equal(call.env.CLOUDFLARE_API_TOKEN, undefined);
      assert.match(
        call.args[0],
        /[\\/]node_modules[\\/]wrangler[\\/]bin[\\/]wrangler\.js$/,
      );
    }
    const deployCall = calls.find((call) =>
      isPagesDeploy(call),
    );
    assert.ok(deployCall);
    assert.equal(
      deployCall.args.includes("--project-name"),
      true,
    );
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("원격 deploy-index의 과거 namespace를 staging에 보존하고 배포 후 함께 검증한다", async () => {
  const item = await fixture();
  const calls = [];
  const oldProjectKey = "old-product";
  const oldExportId = "wing-20260729-010203-bbbbbbbb";
  const oldFilename = "section-01.webp";
  const oldBytes = Buffer.from("old-webp-bytes");
  const oldUrl =
    `${PUBLIC_BASE_URL}/${oldProjectKey}/${oldExportId}/${oldFilename}`;
  const oldIndex = {
    schema_version: "1.0",
    provider: "cloudflare-pages",
    pages_project: PAGES_PROJECT,
    public_base_url: PUBLIC_BASE_URL,
    publisher_id: PUBLISHER_ID,
    writer_owner_digest: item.writerOwnerDigest,
    generation: 1,
    exports: [
      {
        project_key: oldProjectKey,
        export_id: oldExportId,
        namespace: `${oldProjectKey}/${oldExportId}`,
        assets: [
          {
            filename: oldFilename,
            mime_type: "image/webp",
            bytes: oldBytes.length,
            sha256: digest(oldBytes),
            url: oldUrl,
          },
        ],
      },
    ],
  };
  let deployedIndexBytes = null;
  let deployedNewBytes = null;
  const fetchImpl = async (url) => {
    if (url === item.asset.cdn_url) {
      if (!deployedNewBytes) return response("", { status: 404 });
      return response(deployedNewBytes);
    }
    if (url === oldUrl) return response(oldBytes);
    if (url === `${PUBLIC_BASE_URL}/deploy-index.json`) {
      return deployedIndexBytes
        ? response(deployedIndexBytes, {
            mime: "application/json",
            cache: "no-store",
          })
        : response(Buffer.from(JSON.stringify(oldIndex)), {
            mime: "application/json",
            cache: "no-store",
          });
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  const baseRunner = runnerFor(calls);
  const runner = async (invocation) => {
    const result = await baseRunner(invocation);
    const args = invocation.args.slice(1);
    if (isPagesDeploy(invocation)) {
      const stagingRoot = args[2];
      assert.deepEqual(
        await readFile(
          path.join(
            stagingRoot,
            oldProjectKey,
            oldExportId,
            oldFilename,
          ),
        ),
        oldBytes,
      );
      deployedIndexBytes = await readFile(
        path.join(stagingRoot, "deploy-index.json"),
      );
      deployedNewBytes = await readFile(
        path.join(
          stagingRoot,
          item.projectKey,
          item.exportId,
          item.asset.filename,
        ),
      );
    }
    return result;
  };
  try {
    const result = await uploadCloudflarePagesExport({
      ...item,
      runner,
      fetchImpl,
    });
    assert.equal(result.previousExportCount, 1);
    assert.equal(result.generation, 2);
    assert.equal(result.verification.assetCount, 2);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("새 namespace URL이 이미 200이면 deploy를 호출하지 않고 typed conflict를 반환한다", async () => {
  const item = await fixture();
  const calls = [];
  const runner = runnerFor(calls);
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner,
        fetchImpl: async (url) => {
          if (url === item.asset.cdn_url) return response(item.assetBytes);
          throw new Error(`unexpected URL: ${url}`);
        },
      }),
      (error) => {
        assert.ok(error instanceof CloudflarePagesUploaderError);
        assert.equal(error.code, "CDN_NAMESPACE_EXISTS");
        assert.equal(error.state, "namespace_conflict");
        return true;
      },
    );
    assert.equal(
      calls.some((call) => isPagesDeploy(call)),
      false,
    );
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("기존 deployment가 있는데 deploy-index가 없으면 과거 경로를 추측하지 않고 중단한다", async () => {
  const item = await fixture();
  const calls = [];
  const runner = runnerFor(calls, {
    deployments: [{ id: "existing-production" }],
  });
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner,
        fetchImpl: async (url) => {
          if (url === item.asset.cdn_url) return response("", { status: 404 });
          if (url === `${PUBLIC_BASE_URL}/deploy-index.json`) {
            return response("", { status: 404 });
          }
          throw new Error(`unexpected URL: ${url}`);
        },
      }),
      (error) => {
        assert.equal(error.code, "REMOTE_INDEX_MISSING");
        assert.equal(error.state, "preservation_failed");
        return true;
      },
    );
    assert.equal(
      calls.some((call) => isPagesDeploy(call)),
      false,
    );
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("배포 후 MIME·SHA·cache 중 하나라도 다르면 verification_failed이며 호출자가 current output을 유지할 수 있다", async () => {
  const item = await fixture();
  const calls = [];
  const currentOutput = path.join(
    item.projectRoot,
    "output",
    "detail-page.html",
  );
  await writeFile(currentOutput, "previous-current-output");
  let deployedIndexBytes = null;
  let deployed = false;
  const baseRunner = runnerFor(calls);
  const runner = async (invocation) => {
    const result = await baseRunner(invocation);
    const args = invocation.args.slice(1);
    if (isPagesDeploy(invocation)) {
      deployed = true;
      deployedIndexBytes = await readFile(
        path.join(args[2], "deploy-index.json"),
      );
    }
    return result;
  };
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner,
        fetchImpl: async (url) => {
          if (url === item.asset.cdn_url) {
            return deployed
              ? response(item.assetBytes, { mime: "application/octet-stream" })
              : response("", { status: 404 });
          }
          if (url === `${PUBLIC_BASE_URL}/deploy-index.json`) {
            return deployedIndexBytes
              ? response(deployedIndexBytes, {
                  mime: "application/json",
                  cache: "no-store",
                })
              : response("", { status: 404 });
          }
          throw new Error(`unexpected URL: ${url}`);
        },
      }),
      (error) => {
        assert.equal(error.code, "CDN_ASSET_VERIFICATION_FAILED");
        assert.equal(error.state, "verification_failed");
        return true;
      },
    );
    assert.equal(await readFile(currentOutput, "utf8"), "previous-current-output");
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("Wrangler entrypoint trust pin을 config에서 바꾸면 owner HMAC 불일치로 spawn 0이다", async () => {
  const item = await fixture();
  const configPath = path.join(
    item.projectRoot,
    ".detail-page",
    "cloudflare-pages.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.wrangler_entry_sha256 = "0".repeat(64);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  let spawnCount = 0;
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner: async () => {
          spawnCount += 1;
          throw new Error("runner must not be called");
        },
        fetchImpl: async () => {
          throw new Error("fetch must not be called");
        },
      }),
      (error) => {
        assert.equal(error.code, "WRITER_OWNER_CONFIG_MISMATCH");
        assert.equal(error.state, "config_invalid");
        return true;
      },
    );
    assert.equal(spawnCount, 0);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("runtime·lock·config tree pin을 함께 재작성해도 기존 machine HMAC trust pin을 재생할 수 없다", async () => {
  const item = await fixture();
  const runtimeRoot = path.join(
    item.projectRoot,
    ".agents",
    "runtime",
    "cloudflare-pages",
  );
  const importedPath = path.join(
    runtimeRoot,
    "node_modules",
    "wrangler",
    "dist",
    "imported.js",
  );
  await writeFile(
    importedPath,
    "export const runtimeDependency = 'rewritten-runtime';\n",
  );
  const rewrittenLock = await buildWranglerRuntimeIntegrityManifest({
    runtimeRoot,
  });
  await writeFile(
    path.join(runtimeRoot, "wrangler-runtime-lock.json"),
    `${JSON.stringify(rewrittenLock, null, 2)}\n`,
  );
  const configPath = path.join(
    item.projectRoot,
    ".detail-page",
    "cloudflare-pages.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.wrangler_runtime_tree_sha256 = rewrittenLock.tree_sha256;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  let spawnCount = 0;
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner: async () => {
          spawnCount += 1;
          throw new Error("runner must not be called");
        },
        fetchImpl: async () => {
          throw new Error("fetch must not be called");
        },
      }),
      (error) => {
        assert.equal(error.code, "WRITER_OWNER_CONFIG_MISMATCH");
        assert.equal(error.state, "config_invalid");
        return true;
      },
    );
    assert.equal(spawnCount, 0);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("config writer_owner_digest pin이 machine-local HMAC owner와 다르면 spawn 전에 차단한다", async () => {
  const item = await fixture();
  const configPath = path.join(
    item.projectRoot,
    ".detail-page",
    "cloudflare-pages.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.writer_owner_digest = "b".repeat(64);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  let spawnCount = 0;
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner: async () => {
          spawnCount += 1;
          throw new Error("runner must not be called");
        },
        fetchImpl: async () => {
          throw new Error("fetch must not be called");
        },
      }),
      (error) => {
        assert.equal(error.code, "WRITER_OWNER_CONFIG_MISMATCH");
        assert.equal(error.state, "config_invalid");
        return true;
      },
    );
    assert.equal(spawnCount, 0);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("config의 owner migration 경로는 normal uploader에서 금지한다", async () => {
  const item = await fixture();
  const configPath = path.join(
    item.projectRoot,
    ".detail-page",
    "cloudflare-pages.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.owner_migration_receipt_path =
    ".detail-page/cloudflare-pages-owner-migration.json";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  let spawnCount = 0;
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner: async () => {
          spawnCount += 1;
          throw new Error("runner must not be called");
        },
        fetchImpl: async () => {
          throw new Error("fetch must not be called");
        },
      }),
      (error) => {
        assert.equal(error.code, "PAGES_OWNER_MIGRATION_FORBIDDEN");
        assert.equal(error.state, "config_invalid");
        return true;
      },
    );
    assert.equal(spawnCount, 0);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("기존 deploy-index publisher owner가 다르면 배포를 차단한다", async () => {
  const item = await fixture();
  const calls = [];
  const foreignIndex = {
    schema_version: "1.0",
    provider: "cloudflare-pages",
    pages_project: PAGES_PROJECT,
    public_base_url: PUBLIC_BASE_URL,
    publisher_id: "foreign-publisher",
    writer_owner_digest: "f".repeat(64),
    generation: 7,
    exports: [],
  };
  const runner = runnerFor(calls);
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner,
        fetchImpl: async (url) => {
          if (url === item.asset.cdn_url) {
            return response("", { status: 404 });
          }
          if (url === `${PUBLIC_BASE_URL}/deploy-index.json`) {
            return response(Buffer.from(JSON.stringify(foreignIndex)), {
              mime: "application/json",
              cache: "no-store",
            });
          }
          throw new Error(`unexpected URL: ${url}`);
        },
      }),
      (error) => {
        assert.equal(error.code, "DEPLOY_INDEX_OWNER_MISMATCH");
        assert.equal(error.state, "preservation_failed");
        return true;
      },
    );
    assert.equal(calls.some((call) => isPagesDeploy(call)), false);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("배포 직전 remote index bytes/generation이 바뀌면 CAS conflict로 deploy하지 않는다", async () => {
  const item = await fixture();
  const calls = [];
  let indexReadCount = 0;
  const indexAtRead = {
    schema_version: "1.0",
    provider: "cloudflare-pages",
    pages_project: PAGES_PROJECT,
    public_base_url: PUBLIC_BASE_URL,
    publisher_id: PUBLISHER_ID,
    writer_owner_digest: item.writerOwnerDigest,
    generation: 1,
    exports: [],
  };
  const indexAtCas = {
    ...indexAtRead,
    generation: 2,
  };
  const runner = runnerFor(calls);
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner,
        fetchImpl: async (url) => {
          if (url === item.asset.cdn_url) {
            return response("", { status: 404 });
          }
          if (url === `${PUBLIC_BASE_URL}/deploy-index.json`) {
            indexReadCount += 1;
            return response(
              Buffer.from(
                JSON.stringify(
                  indexReadCount === 1 ? indexAtRead : indexAtCas,
                ),
              ),
              {
                mime: "application/json",
                cache: "no-store",
              },
            );
          }
          throw new Error(`unexpected URL: ${url}`);
        },
      }),
      (error) => {
        assert.equal(error.code, "DEPLOY_INDEX_CONFLICT");
        assert.equal(error.state, "concurrent_conflict");
        assert.equal(error.details.retryable, true);
        return true;
      },
    );
    assert.equal(indexReadCount, 2);
    assert.equal(calls.some((call) => isPagesDeploy(call)), false);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("동일 Pages 대상의 Promise.all 업로드는 공유 lock으로 직렬화되어 두 namespace를 보존한다", async () => {
  const first = await fixture({
    projectKey: "product-a",
    exportId: "wing-20260730-020301-aaaaaaaa",
  });
  const second = await fixture({
    projectKey: "product-b",
    exportId: "wing-20260730-020302-bbbbbbbb",
  });
  const calls = [];
  const remoteAssets = new Map();
  let remoteIndexBytes = null;
  const fetchImpl = async (url) => {
    if (url === `${PUBLIC_BASE_URL}/deploy-index.json`) {
      return remoteIndexBytes
        ? response(remoteIndexBytes, {
            mime: "application/json",
            cache: "no-store",
          })
        : response("", { status: 404 });
    }
    if (remoteAssets.has(url)) {
      return response(remoteAssets.get(url));
    }
    if (url === first.asset.cdn_url || url === second.asset.cdn_url) {
      return response("", { status: 404 });
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  const baseRunner = runnerFor(calls);
  let deployCount = 0;
  const runner = async (invocation) => {
    const result = await baseRunner(invocation);
    if (!isPagesDeploy(invocation)) return result;
    deployCount += 1;
    const stagingRoot = invocation.args[3];
    const nextIndexBytes = await readFile(
      path.join(stagingRoot, "deploy-index.json"),
    );
    const nextIndex = JSON.parse(nextIndexBytes.toString("utf8"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const entry of nextIndex.exports) {
      for (const asset of entry.assets) {
        remoteAssets.set(
          asset.url,
          await readFile(
            path.join(
              stagingRoot,
              entry.project_key,
              entry.export_id,
              asset.filename,
            ),
          ),
        );
      }
    }
    remoteIndexBytes = nextIndexBytes;
    return result;
  };
  try {
    const results = await Promise.all([
      uploadCloudflarePagesExport({
        ...first,
        runner,
        fetchImpl,
      }),
      uploadCloudflarePagesExport({
        ...second,
        runner,
        fetchImpl,
      }),
    ]);
    assert.equal(deployCount, 2);
    assert.deepEqual(
      results.map((result) => result.generation).sort((a, b) => a - b),
      [1, 2],
    );
    const finalIndex = JSON.parse(remoteIndexBytes.toString("utf8"));
    assert.equal(finalIndex.publisher_id, PUBLISHER_ID);
    assert.equal(
      finalIndex.writer_owner_digest,
      first.writerOwnerDigest,
    );
    assert.equal(finalIndex.generation, 2);
    assert.deepEqual(
      finalIndex.exports.map((entry) => entry.namespace).sort(),
      [first.namespace.namespace, second.namespace.namespace].sort(),
    );
    assert.equal(remoteAssets.has(first.asset.cdn_url), true);
    assert.equal(remoteAssets.has(second.asset.cdn_url), true);
  } finally {
    await Promise.all([
      rm(first.projectRoot, { recursive: true, force: true }),
      rm(second.projectRoot, { recursive: true, force: true }),
    ]);
  }
});

test("Wrangler 오류의 토큰은 typed error details에서도 redaction된다", async () => {
  const item = await fixture();
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner: async () => ({
          exitCode: 1,
          stdout: '{"access_token":"super-secret-token"}',
          stderr: "Authorization: Bearer abc.def.ghi",
        }),
        fetchImpl: async () => response("", { status: 404 }),
      }),
      (error) => {
        assert.equal(error.code, "CLOUDFLARE_AUTH_REQUIRED");
        const serialized = JSON.stringify(error.details);
        assert.doesNotMatch(serialized, /super-secret-token|abc\.def\.ghi/);
        assert.match(serialized, /\[REDACTED\]/);
        return true;
      },
    );
    assert.equal(
      redactSecrets("CLOUDFLARE_API_TOKEN=secret-value"),
      "CLOUDFLARE_API_TOKEN=[REDACTED]",
    );
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner: async () => {
          throw new Error("Authorization: Bearer thrown.secret.value");
        },
        fetchImpl: async () => response("", { status: 404 }),
      }),
      (error) => {
        assert.doesNotMatch(
          String(error.cause?.message || ""),
          /thrown\.secret\.value/,
        );
        assert.match(
          String(error.cause?.message || ""),
          /\[REDACTED\]/,
        );
        return true;
      },
    );
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("원격 deployment가 0이어도 typed bootstrap receipt가 없으면 첫 게시를 차단한다", async () => {
  const item = await fixture();
  const calls = [];
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        bootstrapReceipt: null,
        runner: runnerFor(calls),
        fetchImpl: async (url) => {
          if (
            url === item.asset.cdn_url ||
            url === `${PUBLIC_BASE_URL}/deploy-index.json`
          ) {
            return response("", { status: 404 });
          }
          throw new Error(`unexpected URL: ${url}`);
        },
      }),
      (error) => {
        assert.equal(
          error.code,
          "PAGES_BOOTSTRAP_AUTHORIZATION_REQUIRED",
        );
        assert.equal(error.state, "preservation_failed");
        return true;
      },
    );
    assert.equal(calls.some((call) => isPagesDeploy(call)), false);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("authorized_by만 있는 unsigned bootstrap receipt는 첫 게시 권한이 아니다", async () => {
  const item = await fixture();
  const calls = [];
  const unsignedReceipt = { ...item.bootstrapReceipt };
  delete unsignedReceipt.owner_hmac_sha256;
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        bootstrapReceipt: unsignedReceipt,
        runner: runnerFor(calls),
        fetchImpl: async (url) => {
          if (
            url === item.asset.cdn_url ||
            url === `${PUBLIC_BASE_URL}/deploy-index.json`
          ) {
            return response("", { status: 404 });
          }
          throw new Error(`unexpected URL: ${url}`);
        },
      }),
      (error) => {
        assert.equal(
          error.code,
          "PAGES_BOOTSTRAP_AUTHORIZATION_INVALID",
        );
        assert.equal(error.state, "preservation_failed");
        return true;
      },
    );
    assert.equal(calls.some((call) => isPagesDeploy(call)), false);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("Wrangler가 import할 수 있는 runtime JS 하나가 변조되면 runner spawn은 0이다", async () => {
  const item = await fixture();
  await writeFile(
    path.join(
      item.projectRoot,
      ".agents",
      "runtime",
      "cloudflare-pages",
      "node_modules",
      "wrangler",
      "dist",
      "imported.js",
    ),
    "export const runtimeDependency = 'tampered';\n",
  );
  let spawnCount = 0;
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner: async () => {
          spawnCount += 1;
          throw new Error("runner must not be called");
        },
        fetchImpl: async () => {
          throw new Error("fetch must not be called");
        },
      }),
      (error) => {
        assert.equal(
          error.code,
          "WRANGLER_RUNTIME_TREE_SHA256_MISMATCH",
        );
        assert.equal(error.state, "runtime_invalid");
        return true;
      },
    );
    assert.equal(spawnCount, 0);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("normal uploader는 exact migration receipt를 받아도 writer owner 이전을 금지한다", async () => {
  const item = await fixture();
  const calls = [];
  const foreignOwnerDigest = "e".repeat(64);
  const migrationReceipt = {
    schema_version: "1.0",
    receipt_type: "cloudflare-pages-owner-migration",
    pages_project: PAGES_PROJECT,
    public_base_url: PUBLIC_BASE_URL,
    from_publisher_id: "foreign-publisher",
    to_publisher_id: PUBLISHER_ID,
    from_writer_owner_digest: foreignOwnerDigest,
    to_writer_owner_digest: item.writerOwnerDigest,
    expected_generation: 3,
    expected_index_sha256: "a".repeat(64),
    authorized_by: "user:migration-owner",
    authorized_at: "2026-07-30T01:00:00.000Z",
  };
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        migrationReceipt,
        runner: runnerFor(calls),
        fetchImpl: async () => {
          throw new Error("fetch must not be called");
        },
      }),
      (error) => {
        assert.equal(error.code, "PAGES_OWNER_MIGRATION_FORBIDDEN");
        assert.equal(error.state, "config_invalid");
        return true;
      },
    );
    assert.equal(calls.length, 0);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("ownerless legacy index는 normal uploader가 인수하지 않는다", async () => {
  const item = await fixture();
  const calls = [];
  const ownerlessIndex = {
    schema_version: "1.0",
    provider: "cloudflare-pages",
    pages_project: PAGES_PROJECT,
    public_base_url: PUBLIC_BASE_URL,
    publisher_id: PUBLISHER_ID,
    generation: 2,
    exports: [],
  };
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner: runnerFor(calls),
        fetchImpl: async (url) => {
          if (url === item.asset.cdn_url) {
            return response("", { status: 404 });
          }
          if (url === `${PUBLIC_BASE_URL}/deploy-index.json`) {
            return response(Buffer.from(JSON.stringify(ownerlessIndex)), {
              mime: "application/json",
              cache: "no-store",
            });
          }
          throw new Error(`unexpected URL: ${url}`);
        },
      }),
      (error) => {
        assert.equal(error.code, "DEPLOY_INDEX_OWNER_MISSING");
        assert.equal(error.state, "preservation_failed");
        return true;
      },
    );
    assert.equal(calls.some((call) => isPagesDeploy(call)), false);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("초기 검증 뒤 runtime이 바뀌면 다음 Wrangler spawn 직전 재검증이 차단한다", async () => {
  const item = await fixture();
  let spawnCount = 0;
  const importedPath = path.join(
    item.projectRoot,
    ".agents",
    "runtime",
    "cloudflare-pages",
    "node_modules",
    "wrangler",
    "dist",
    "imported.js",
  );
  try {
    await assert.rejects(
      uploadCloudflarePagesExport({
        ...item,
        runner: async () => {
          spawnCount += 1;
          if (spawnCount === 1) {
            await writeFile(
              importedPath,
              "export const runtimeDependency = 'late-tamper';\n",
            );
            return {
              exitCode: 0,
              stdout: JSON.stringify({ authenticated: true }),
              stderr: "",
            };
          }
          throw new Error("second runner call must be blocked");
        },
        fetchImpl: async () => {
          throw new Error("fetch must not be called");
        },
      }),
      (error) => {
        assert.equal(
          error.code,
          "WRANGLER_RUNTIME_TREE_SHA256_MISMATCH",
        );
        return true;
      },
    );
    assert.equal(spawnCount, 1);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("permission memory launcher의 정상 pinned Wrangler preflight는 통과한다", async () => {
  const entryBytes = Buffer.from(
    [
      "#!/usr/bin/env node",
      'if (process.argv.includes("whoami")) console.log(JSON.stringify({ authenticated: true }));',
      'if (process.argv.includes("project")) console.log(JSON.stringify([{ name: "detail-page-assets" }]));',
      "",
    ].join("\n"),
  );
  const item = await fixture({ wranglerEntryBytes: entryBytes });
  try {
    const result = await preflightCloudflarePagesConnection({
      projectRoot: item.projectRoot,
      runner: defaultWranglerRunner,
      ownerProvider,
    });
    assert.equal(result.status, "connected");
    assert.equal(result.writerOwnerDigest, item.writerOwnerDigest);
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("memory package graph는 정상 bare exports와 relative module을 disk metadata 없이 해석한다", async () => {
  const entryBytes = Buffer.from(
    [
      "#!/usr/bin/env node",
      'const bare = require("sealed-package");',
      'const relative = require("../dist/relative.cjs");',
      'if (bare !== "bare-safe" || relative !== "relative-safe") throw new Error("sealed resolution mismatch");',
      'if (process.argv.includes("whoami")) console.log(JSON.stringify({ authenticated: true }));',
      'if (process.argv.includes("project")) console.log(JSON.stringify([{ name: "detail-page-assets" }]));',
      "",
    ].join("\n"),
  );
  const item = await fixture({
    wranglerEntryBytes: entryBytes,
    extraRuntimeFiles: [
      {
        runtimeRelativePath: "sealed-package/package.json",
        bytes: Buffer.from(
          `${JSON.stringify({
            name: "sealed-package",
            main: "./legacy.cjs",
            exports: { ".": "./safe.cjs" },
          })}\n`,
        ),
      },
      {
        runtimeRelativePath: "sealed-package/safe.cjs",
        bytes: Buffer.from('module.exports = "bare-safe";\n'),
      },
      {
        runtimeRelativePath: "sealed-package/legacy.cjs",
        bytes: Buffer.from('module.exports = "legacy-unsafe";\n'),
      },
      {
        relativePath: "dist/relative.cjs",
        bytes: Buffer.from('module.exports = "relative-safe";\n'),
      },
    ],
  });
  try {
    const result = await preflightCloudflarePagesConnection({
      projectRoot: item.projectRoot,
      runner: defaultWranglerRunner,
      ownerProvider,
    });
    assert.equal(result.status, "connected");
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("seal 뒤 package main·exports drift는 다른 pinned module 선택 전에 중단한다", async () => {
  const entryBytes = Buffer.from(
    [
      "#!/usr/bin/env node",
      'process.stderr.write("GRAPH_SEALED_READY\\n");',
      "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);",
      'require("graph-drift-package");',
      'process.stderr.write("ENTRY_AFTER_PACKAGE_RESOLVE\\n");',
      "",
    ].join("\n"),
  );
  const initialPackage = {
    name: "graph-drift-package",
    main: "./safe.cjs",
    exports: { ".": "./safe.cjs" },
  };
  const item = await fixture({
    wranglerEntryBytes: entryBytes,
    extraRuntimeFiles: [
      {
        runtimeRelativePath: "graph-drift-package/package.json",
        bytes: Buffer.from(`${JSON.stringify(initialPackage)}\n`),
      },
      {
        runtimeRelativePath: "graph-drift-package/safe.cjs",
        bytes: Buffer.from(
          'process.stderr.write("SAFE_MODULE_EXECUTED\\n");\n',
        ),
      },
      {
        runtimeRelativePath: "graph-drift-package/evil.cjs",
        bytes: Buffer.from(
          'process.stderr.write("EVIL_MODULE_EXECUTED\\n");\n',
        ),
      },
    ],
  });
  const packagePath = path.join(
    item.projectRoot,
    ".agents",
    "runtime",
    "cloudflare-pages",
    "node_modules",
    "graph-drift-package",
    "package.json",
  );
  const runtimeRoot = path.join(
    item.projectRoot,
    ".agents",
    "runtime",
    "cloudflare-pages",
  );
  const entrypoint = path.join(
    runtimeRoot,
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js",
  );
  const runtimeLockPath = path.join(
    runtimeRoot,
    "wrangler-runtime-lock.json",
  );
  const runtimeLock = JSON.parse(
    await readFile(runtimeLockPath, "utf8"),
  );
  try {
    let readyResolve;
    const ready = new Promise((resolve) => {
      readyResolve = resolve;
    });
    const pending = defaultWranglerRunner({
      command: process.execPath,
      args: [entrypoint, "whoami", "--json"],
      cwd: item.projectRoot,
      env: { ...process.env },
      timeoutMs: 10_000,
      secureRuntime: {
        runtimeRoot,
        runtimeLockPath,
        entrypoint,
        entrypointSha256: digest(entryBytes),
        runtimeTreeSha256: runtimeLock.tree_sha256,
      },
      onStderr(chunk) {
        if (chunk.includes("GRAPH_SEALED_READY")) readyResolve();
      },
    });
    const earlyResult = await Promise.race([
      ready.then(() => null),
      pending,
    ]);
    assert.equal(
      earlyResult,
      null,
      `sealed graph ready 신호 전에 runner가 종료되었습니다: ${JSON.stringify(earlyResult)}`,
    );
    await writeFile(
      packagePath,
      `${JSON.stringify({
        ...initialPackage,
        main: "./evil.cjs",
        exports: { ".": "./evil.cjs" },
      })}\n`,
    );
    const result = await pending;
    assert.notEqual(result.exitCode, 0, JSON.stringify(result));
    assert.match(
      result.stderr,
      /WRANGLER_SEALED_RUNTIME_INVALID|memory seal/,
    );
    assert.doesNotMatch(
      result.stderr,
      /SAFE_MODULE_EXECUTED|EVIL_MODULE_EXECUTED|ENTRY_AFTER_PACKAGE_RESOLVE/,
    );
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("permission launcher는 pinned child_process helper를 side effect 전에 차단한다", async () => {
  const markerRoot = await mkdtemp(
    path.join(os.tmpdir(), "wrangler-child-permission-"),
  );
  const markerPath = path.join(markerRoot, "child-executed");
  const childSource = `require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "executed")`;
  const entryBytes = Buffer.from(
    [
      "#!/usr/bin/env node",
      'const { spawnSync } = require("node:child_process");',
      `spawnSync(process.execPath, ["-e", ${JSON.stringify(childSource)}]);`,
      'process.stderr.write("CHILD_HELPER_RETURNED\\n");',
      "",
    ].join("\n"),
  );
  const item = await fixture({ wranglerEntryBytes: entryBytes });
  try {
    await assert.rejects(
      preflightCloudflarePagesConnection({
        projectRoot: item.projectRoot,
        runner: defaultWranglerRunner,
        ownerProvider,
      }),
      (error) => {
        assert.equal(error.code, "CLOUDFLARE_AUTH_REQUIRED");
        assert.match(JSON.stringify(error.details), /ERR_ACCESS_DENIED|ChildProcess/);
        assert.doesNotMatch(
          JSON.stringify(error.details),
          /CHILD_HELPER_RETURNED/,
        );
        return true;
      },
    );
    await assert.rejects(readFile(markerPath), { code: "ENOENT" });
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
    await rm(markerRoot, { recursive: true, force: true });
  }
});

test("permission launcher는 pinned native addon helper를 load 전에 차단한다", async () => {
  const entryBytes = Buffer.from(
    [
      "#!/usr/bin/env node",
      'const path = require("node:path");',
      'process.dlopen(module, path.join(__dirname, "../dist/helper.node"));',
      'process.stderr.write("NATIVE_HELPER_RETURNED\\n");',
      "",
    ].join("\n"),
  );
  const item = await fixture({
    wranglerEntryBytes: entryBytes,
    extraRuntimeFiles: [
      {
        relativePath: "dist/helper.node",
        bytes: Buffer.from("not-a-native-addon"),
      },
    ],
  });
  try {
    await assert.rejects(
      preflightCloudflarePagesConnection({
        projectRoot: item.projectRoot,
        runner: defaultWranglerRunner,
        ownerProvider,
      }),
      (error) => {
        assert.equal(error.code, "CLOUDFLARE_AUTH_REQUIRED");
        assert.match(JSON.stringify(error.details), /ERR_DLOPEN_DISABLED/);
        assert.doesNotMatch(
          JSON.stringify(error.details),
          /NATIVE_HELPER_RETURNED/,
        );
        return true;
      },
    );
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("sealed launcher는 preflight 뒤 import 직전 변조된 module을 실행하지 않는다", async () => {
  const continueRelative = ".detail-page/continue-runtime-race";
  const entryBytes = Buffer.from(
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      `while (!fs.existsSync(${JSON.stringify(continueRelative)})) {`,
      "  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);",
      "}",
      'require("../dist/imported.js");',
      'process.stderr.write("KEYRING_LOGIC_REACHED\\n");',
      'if (process.argv.includes("whoami")) console.log(JSON.stringify({ authenticated: true }));',
      'if (process.argv.includes("project")) console.log(JSON.stringify([{ name: "detail-page-assets" }]));',
      "",
    ].join("\n"),
  );
  const item = await fixture({ wranglerEntryBytes: entryBytes });
  const continuePath = path.join(item.projectRoot, ...continueRelative.split("/"));
  const importedPath = path.join(
    item.projectRoot,
    ".agents",
    "runtime",
    "cloudflare-pages",
    "node_modules",
    "wrangler",
    "dist",
    "imported.js",
  );
  try {
    const pending = preflightCloudflarePagesConnection({
      projectRoot: item.projectRoot,
      runner: defaultWranglerRunner,
      ownerProvider,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(
      importedPath,
      [
        'process.stderr.write("TAMPERED_MODULE_EXECUTED\\n");',
        "",
      ].join("\n"),
    );
    await writeFile(continuePath, "continue");
    await assert.rejects(
      pending,
      (error) => {
        assert.equal(error.code, "CLOUDFLARE_AUTH_REQUIRED");
        assert.match(
          JSON.stringify(error.details),
          /WRANGLER_SEALED_RUNTIME_INVALID|pinned manifest/,
        );
        assert.doesNotMatch(
          JSON.stringify(error.details),
          /TAMPERED_MODULE_EXECUTED|KEYRING_LOGIC_REACHED/,
        );
        return true;
      },
    );
  } finally {
    await rm(item.projectRoot, { recursive: true, force: true });
  }
});

test("기본 secure owner provider는 machine-local record를 wx로 만들고 안정적으로 재사용한다", async () => {
  const stateRoot = await mkdtemp(
    path.join(os.tmpdir(), "cloudflare-owner-provider-"),
  );
  try {
    const first = await defaultCloudflareOwnerProvider({ stateRoot });
    const second = await defaultCloudflareOwnerProvider({ stateRoot });
    assert.equal(first.writerId, second.writerId);
    assert.deepEqual(first.secret, second.secret);
    assert.equal(first.secret.length, 32);
    assert.equal(first.stateRoot, path.resolve(stateRoot));
    const ownerRecord = JSON.parse(
      await readFile(
        path.join(stateRoot, "cloudflare-pages-writer-v1.json"),
        "utf8",
      ),
    );
    assert.equal(ownerRecord.writer_id, first.writerId);
    assert.equal(
      Buffer.from(ownerRecord.secret, "base64url").length,
      32,
    );
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});
