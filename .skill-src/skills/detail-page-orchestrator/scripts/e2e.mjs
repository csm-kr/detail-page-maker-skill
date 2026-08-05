#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildExamplePlan, validateLeanPlan } from "./lean-contract.mjs";
import { validateHtmlProject } from "./lean-html-qa.mjs";
import { createProject } from "./lib/new-project.mjs";
import { startLeanStudioServer } from "./lean-studio-server.mjs";

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "detail-page-lean-e2e-"));
let studio;

try {
  const created = await createProject({
    name: "lean-e2e",
    supplierUrl: "https://supplier.example/item/123",
    coupangUrl: "https://www.coupang.com/vp/products/123",
    photoStatus: "no",
    root: temporaryRoot,
  });
  assert.equal(created.state.target.width_px, 780);
  assert.equal(created.state.target.still_count, 30);
  assert.equal(created.state.target.gif_count, 10);

  const planReport = await validateLeanPlan(await buildExamplePlan());
  assert.equal(planReport.ok, true);
  assert.equal(validateHtmlProject(created.projectRoot).ok, true);

  studio = await startLeanStudioServer({ projectRoot: created.projectRoot, port: 0 });
  const documentResponse = await fetch(new URL("/api/document", studio.url));
  assert.equal(documentResponse.status, 200);
  const document = await documentResponse.json();
  assert.equal(document.qa.width_css_px, 780);

  const revised = document.html.replace(
    "한 패널에는<br />하나의 메시지만",
    "문맥은 자연스럽게<br />핵심은 선명하게",
  );
  const saveResponse = await fetch(new URL("/api/document", studio.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lean-Studio-Token": studio.token,
    },
    body: JSON.stringify({ html: revised, expected_sha256: document.sha256 }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.status, "saved");
  assert.equal(saved.qa.status, "PASS");
  assert.match(
    await readFile(path.join(created.projectRoot, "output", "detail-page.html"), "utf8"),
    /문맥은 자연스럽게/,
  );

  console.log("PASS detail-page-maker lean E2E");
  console.log("  input → 780 project → lean plan → HTML QA → Studio save");
} finally {
  if (studio) await studio.close();
  await rm(temporaryRoot, { recursive: true, force: true });
}
