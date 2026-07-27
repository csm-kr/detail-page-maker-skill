import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/new-project.mjs";

const REPOSITORY_ROOT = path.resolve(
  new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);

async function repositoryFile(relativePath) {
  return readFile(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

test("활성 CLI는 Studio v1 서버만 시작한다", async () => {
  const cli = await repositoryFile(
    "skills/detail-page-maker-skill/scripts/detail-page.mjs",
  );
  assert.match(cli, /studio-v1-server\.mjs/);
  assert.match(cli, /startStudioV1Server/);
  assert.doesNotMatch(cli, /from "\.\/studio-server\.mjs"/);
});

test("새 프로젝트에는 노바페이스 기반 Studio v1 편집기와 승인 작업면이 들어간다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-studio-v1-runtime-"),
  );
  try {
    const created = await createProject({
      name: "테스트 상품",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    const [studio, studioScript, app, index] = await Promise.all([
      readFile(path.join(created.projectRoot, "html/studio.html"), "utf8"),
      readFile(path.join(created.projectRoot, "html/studio-v1.js"), "utf8"),
      readFile(path.join(created.projectRoot, "html/app.js"), "utf8"),
      readFile(path.join(created.projectRoot, "html/index.html"), "utf8"),
    ]);

    assert.match(studio, /data-studio-view="edit"/);
    assert.match(studio, /data-studio-view="approval"/);
    assert.match(studio, /data-studio-view="output"/);
    assert.match(studio, /id="assetReviewGrid"/);
    assert.match(studio, /승인 대기 이미지·GIF/);
    assert.match(studio, /id="exportHtml"[^>]*disabled/);
    assert.match(studioScript, /\/api\/v1\/assets/);
    assert.match(studioScript, /\/api\/v1\/gate/);
    assert.match(studioScript, /confirmedByUser:\s*true/);
    assert.match(app, /DETAIL_READY/);
    assert.match(app, /DETAIL_EXPORT_HTML/);
    assert.match(index, /id="detailPage"/);
    assert.match(index, /<script src="app\.js"><\/script>/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("패키지 Studio v1에는 편집과 최종 출력 사이 승인 작업면이 있다", async () => {
  const studio = await repositoryFile(
    "skills/detail-page-maker-skill/assets/studio-v1-runtime/studio.html",
  );
  assert.match(studio, /data-studio-view="edit"/);
  assert.match(studio, /data-studio-view="approval"/);
  assert.match(studio, /data-studio-view="output"/);
  assert.match(studio, /id="assetReviewGrid"/);
  assert.match(studio, /승인 전에는 최종 출력에 사용할 수 없습니다/);
});
