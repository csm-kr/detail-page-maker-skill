import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const sourcePath = path.join(
  projectRoot,
  "deliverables",
  "rev021-commercial",
  "index.html",
);
const outputPath = path.join(projectRoot, "html", "index.html");

const sectionIds = [
  "hero",
  "pain-intro",
  "pain-stack",
  "answer",
  "loose-fit",
  "hand-cover",
  "cool-material",
  "daily-style",
  "how-to",
  "customer-voice",
  "composition",
  "spec",
  "finale",
];

let html = await readFile(sourcePath, "utf8");

html = html
  .replace(
    '<html lang="ko">',
    '<html lang="ko" data-studio-project="sallang-coolsleeve-rev021">',
  )
  .replace("<main>", '<main id="detailPage">')
  .replaceAll(
    'src="media/',
    'src="../deliverables/rev021-commercial/media/',
  );

let sectionIndex = 0;
html = html.replace(/<section\b([^>]*)>/g, (match, attributes) => {
  const sectionId = sectionIds[sectionIndex];
  sectionIndex += 1;
  if (!sectionId) {
    throw new Error(`예상보다 많은 section을 발견했습니다: ${sectionIndex}`);
  }
  return `<section data-section="${sectionId}"${attributes}>`;
});

if (sectionIndex !== sectionIds.length) {
  throw new Error(
    `section 수가 다릅니다: expected ${sectionIds.length}, actual ${sectionIndex}`,
  );
}

let imageIndex = 0;
html = html.replace(/<img\b(?![^>]*\bdata-edit-image\b)/g, () => {
  imageIndex += 1;
  return `<img data-edit-image data-asset-id="rev021-media-${String(
    imageIndex,
  ).padStart(2, "0")}"`;
});

html = html.replace(
  /<(h1|h2|p|th|td|span)\b(?![^>]*\bdata-edit\b)/g,
  "<$1 data-edit",
);

html = html.replace(
  "</body>",
  '    <script src="app.js"></script>\n  </body>',
);

await writeFile(outputPath, html, "utf8");
console.log(
  `Studio rev021 synced: ${sectionIndex} sections, ${imageIndex} media`,
);
