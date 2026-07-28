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
    assert.match(studio, /id="wingCdnBaseUrl"/);
    assert.match(studio, /id="exportCoupangWing"[^>]*disabled/);
    assert.match(studio, /쿠팡 Wing 포맷으로 내보내기/);
    assert.match(studio, /좌표·화살표로 정밀하게 옮길 수 있습니다/);
    assert.match(studio, /id="undo"[^>]*disabled/);
    assert.match(studio, /id="clearText"[^>]*disabled/);
    assert.match(studio, /id="elementFont"[^>]*disabled/);
    assert.match(studio, /Noto Sans KR/);
    assert.match(studio, /Gmarket Sans/);
    assert.match(studio, /S-Core Dream/);
    assert.match(studio, /Wanted Sans/);
    assert.match(studio, /Black Han Sans/);
    assert.match(studio, /Jalnan/);
    assert.match(studioScript, /\/api\/v1\/assets/);
    assert.match(studioScript, /\/api\/v1\/gate/);
    assert.match(studioScript, /\/api\/v1\/exports\/coupang-wing/);
    assert.match(studioScript, /confirmedByUser:\s*true/);
    assert.match(app, /DETAIL_READY/);
    assert.match(app, /DETAIL_EXPORT_HTML/);
    assert.match(app, /DETAIL_OBJECT_SELECTED/);
    assert.match(app, /DETAIL_OBJECT_CHANGED/);
    assert.match(app, /addEventListener\("pointerdown"/);
    assert.match(app, /addEventListener\(\s*"wheel"/);
    assert.match(app, /objects:\s*objectNodes\(\)/);
    assert.match(index, /id="detailPage"/);
    assert.match(index, /data-edit-object/);
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
  assert.match(studio, /id="wingCdnBaseUrl"/);
  assert.match(studio, /id="exportCoupangWing"[^>]*disabled/);
  assert.match(studio, /780px 완성형 정적·애니메이션 WebP/);
    assert.match(studio, /좌표·화살표로 정밀하게 옮길 수 있습니다/);
    assert.match(studio, /id="elementColor"/);
    assert.match(studio, /id="applyPosition"/);
});

test("Studio v1 요소 편집은 저장·복원·내보내기 계약을 포함한다", async () => {
  const app = await repositoryFile(
    "skills/detail-page-maker-skill/assets/studio-v1-runtime/app.js",
  );
  assert.match(app, /\[data-edit\].*\[data-edit-image\].*\[data-edit-object\].*\[data-studio-object\]/);
  assert.match(app, /style\.setProperty\("translate"/);
  assert.match(app, /style\.setProperty\("scale"/);
  assert.match(app, /style\.setProperty\("font-family"/);
  assert.match(app, /style\.setProperty\("color"/);
  assert.match(app, /DETAIL_NUDGE_OBJECT/);
  assert.match(app, /DETAIL_SET_OBJECT_POSITION/);
  assert.match(app, /DETAIL_SET_OBJECT_STYLE/);
  assert.match(app, /DETAIL_CLEAR_TEXT/);
  assert.match(app, /DETAIL_UNDO/);
  assert.match(app, /DETAIL_HISTORY_CHANGED/);
  assert.match(app, /state\.objects/);
  assert.match(app, /removeAttribute\("data-edit-object"\)/);
  assert.match(app, /removeAttribute\("data-object-id"\)/);
  assert.match(app, /removeAttribute\("data-studio-text"\)/);
});
