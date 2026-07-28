import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../..");
const deliverableRoot = join(projectRoot, "deliverables", "rev021-commercial");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute)));
    } else if (entry.name !== "manifest.json") {
      files.push(absolute);
    }
  }
  return files;
}

const files = await walk(deliverableRoot);
const entries = [];
for (const absolute of files.sort()) {
  const bytes = await readFile(absolute);
  const info = await stat(absolute);
  entries.push({
    path: relative(deliverableRoot, absolute).replaceAll("\\", "/"),
    bytes: info.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

const manifest = {
  schema_version: 1,
  revision: "rev021-commercial",
  entrypoint: "index.html",
  output_contract: "deliverables/<revision>/index.html",
  generated_at: new Date().toISOString(),
  customer_media: {
    image_count: entries.filter((entry) => entry.path.startsWith("media/images/")).length,
    gif_count: entries.filter((entry) => entry.path.startsWith("media/gifs/")).length,
  },
  files: entries,
};

await writeFile(
  join(deliverableRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  `${manifest.customer_media.image_count} images, ${manifest.customer_media.gif_count} GIFs, ${entries.length} files\n`,
);
