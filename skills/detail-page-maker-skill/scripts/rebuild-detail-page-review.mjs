import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDetailPageReview } from "./studio-detail-page-review.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const projectRoot = path.resolve(argument("--project") || "");
if (!argument("--project")) {
  throw new Error("--project 경로가 필요합니다.");
}

const state = JSON.parse(
  await readFile(path.join(projectRoot, "project.json"), "utf8"),
);
const roadmap = JSON.parse(
  await readFile(
    path.join(projectRoot, "planning", "commercial-roadmap.json"),
    "utf8",
  ),
);
const review = buildDetailPageReview({ state, roadmap });

state.html.sections = review.sections;
state.updatedAt = new Date().toISOString();
await writeFile(
  path.join(projectRoot, "project.json"),
  `${JSON.stringify(state, null, 2)}\n`,
  "utf8",
);
await writeFile(path.join(projectRoot, "html", "index.html"), review.html, "utf8");
await writeFile(
  path.join(projectRoot, "planning", "commercial-max-page-specs.json"),
  `${JSON.stringify(review.specs, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  `${JSON.stringify({
    projectRoot,
    pageCount: review.sections.length,
    html: "html/index.html",
    specs: "planning/commercial-max-page-specs.json",
  })}\n`,
);
