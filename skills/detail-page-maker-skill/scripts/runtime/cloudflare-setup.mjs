import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  buildWranglerRuntimeIntegrityManifest,
  defaultCloudflareOwnerProvider,
  deriveCloudflareWriterOwnerDigest,
  signCloudflarePagesBootstrapReceipt,
} from "./cloudflare-pages-uploader.mjs";

const EXECUTION_POLICY_ID = "node-permission-register-hooks-memory-v1";

function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      throw new Error(`지원하지 않는 인자입니다: ${token}`);
    }
    const key = token.slice(2);
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`값이 필요한 인자입니다: ${token}`);
    }
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, key) {
  const value = String(options[key] || "").trim();
  if (!value) throw new Error(`--${key}가 필요합니다.`);
  return value;
}

async function readJson(filename) {
  return JSON.parse(await readFile(path.resolve(filename), "utf8"));
}

async function runtimeLock(options) {
  const runtimeRoot = path.resolve(required(options, "runtime-root"));
  const output = path.resolve(
    options.output || path.join(runtimeRoot, "wrangler-runtime-lock.json"),
  );
  const manifest = await buildWranglerRuntimeIntegrityManifest({
    runtimeRoot,
  });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  console.log(manifest.tree_sha256);
}

async function entryHash(options) {
  const bytes = await readFile(path.resolve(required(options, "file")));
  console.log(createHash("sha256").update(bytes).digest("hex"));
}

async function ownerDigest(options) {
  const raw = await readJson(required(options, "config"));
  const owner = await defaultCloudflareOwnerProvider();
  try {
    console.log(
      deriveCloudflareWriterOwnerDigest({
        pagesProject: raw.pages_project,
        publicBaseUrl: raw.public_base_url,
        productionBranch: raw.production_branch || "main",
        publisherId: raw.publisher_id,
        wranglerVersion: raw.wrangler_version,
        wranglerEntrySha256: raw.wrangler_entry_sha256,
        wranglerRuntimeTreeSha256: raw.wrangler_runtime_tree_sha256,
        runtimeRootPin:
          raw.runtime_root || ".agents/runtime/cloudflare-pages",
        runtimeLockPin:
          raw.wrangler_runtime_lock || "wrangler-runtime-lock.json",
        bootstrapReceiptPathPin:
          raw.bootstrap_receipt_path ||
          ".detail-page/cloudflare-pages-bootstrap.json",
        executionPolicyId:
          raw.execution_policy_id || EXECUTION_POLICY_ID,
        writerId: owner.writerId,
        ownerSecret: owner.secret,
      }),
    );
  } finally {
    owner.secret.fill(0);
  }
}

async function signReceipt(options) {
  const filename = path.resolve(required(options, "receipt"));
  const receipt = await readJson(filename);
  const owner = await defaultCloudflareOwnerProvider();
  try {
    receipt.owner_hmac_sha256 =
      signCloudflarePagesBootstrapReceipt(receipt, owner.secret);
  } finally {
    owner.secret.fill(0);
  }
  await writeFile(
    filename,
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8",
  );
  console.log(receipt.owner_hmac_sha256);
}

const { command, options } = parseArgs(process.argv.slice(2));
if (command === "runtime-lock") {
  await runtimeLock(options);
} else if (command === "entry-hash") {
  await entryHash(options);
} else if (command === "owner-digest") {
  await ownerDigest(options);
} else if (command === "sign-receipt") {
  await signReceipt(options);
} else {
  throw new Error(
    "명령은 runtime-lock, entry-hash, owner-digest, sign-receipt 중 하나여야 합니다.",
  );
}
