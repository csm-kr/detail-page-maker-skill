import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/lib/new-project.mjs";

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

test("공개 runtime과 신규 template에는 deliverables/index.html 경로가 없다", async () => {
  const [server, newProject] = await Promise.all([
    repositoryFile(
      "skills/detail-page-maker-skill/scripts/runtime/studio-v1-server.mjs",
    ),
    repositoryFile(
      "skills/detail-page-maker-skill/scripts/lib/new-project.mjs",
    ),
  ]);
  assert.doesNotMatch(server, /["']deliverables["']/);
  assert.doesNotMatch(server, /output[\\/]+index\.html/);
  assert.doesNotMatch(
    newProject,
    /project-template["'),\s]+index\.html/,
  );
  await assert.rejects(
    repositoryFile(
      "skills/detail-page-maker-skill/assets/project-template/index.html",
    ),
  );
  assert.match(
    await repositoryFile(
      "skills/detail-page-maker-skill/assets/project-template/detail-page.html",
    ),
    /id="detailPage"/,
  );
});

test("새 프로젝트는 공용 Studio runtime을 복제하지 않고 편집 원본만 가진다", async () => {
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
      repositoryFile(
        "skills/detail-page-maker-skill/assets/studio-v1-runtime/studio.html",
      ),
      repositoryFile(
        "skills/detail-page-maker-skill/assets/studio-v1-runtime/studio-v1.js",
      ),
      repositoryFile(
        "skills/detail-page-maker-skill/assets/studio-v1-runtime/app.js",
      ),
      readFile(path.join(created.projectRoot, ".detail-page/authoring/detail-page.html"), "utf8"),
    ]);
    await assert.rejects(
      access(path.join(created.projectRoot, ".detail-page", "studio")),
    );

    assert.match(studio, /data-studio-view="edit"/);
    assert.match(studio, /data-studio-view="approval"/);
    assert.match(studio, /data-studio-view="output"/);
    assert.match(studio, /id="assetReviewGrid"/);
    assert.match(studio, /승인 대기 이미지·GIF/);
    assert.match(studio, /id="exportHtml"[^>]*disabled/);
    assert.match(studio, /id="wingConnectionStatus"/);
    assert.doesNotMatch(studio, /id="wingCdnBaseUrl"/);
    assert.match(studio, /id="exportCoupangWing"[^>]*disabled/);
    assert.match(studio, /쿠팡 Wing 포맷으로 내보내기/);
    assert.match(studio, /좌표·화살표로 정밀하게 옮길 수 있습니다/);
    assert.match(studio, /id="undo"[^>]*disabled/);
    assert.match(studio, /id="clearText"[^>]*disabled/);
    assert.match(studio, /data-editor-mode="layout"/);
    assert.match(studio, /data-editor-mode="text"/);
    assert.match(studio, /data-text-align="justify"/);
    assert.match(studio, /id="deleteObject"[^>]*disabled/);
    assert.match(studio, /id="editingState"/);
    assert.match(studio, /id="selectionDepth"/);
    assert.match(studio, /id="sectionCropHeight"/);
    assert.match(studio, /id="sectionCropApply"/);
    assert.match(studio, /id="sectionCropClear"/);
    assert.match(studio, /선택 섹션 아래 자르기/);
    assert.match(studio, /결과의 아래를 자르지 않습니다/);
    assert.match(studio, /aria-label="왼쪽 정렬"/);
    assert.match(studio, /aria-label="가운데 정렬"/);
    assert.match(studio, /aria-label="오른쪽 정렬"/);
    assert.match(studio, /aria-label="양쪽 정렬"/);
    assert.match(studio, /id="elementFont"[^>]*disabled/);
    assert.match(studio, /Noto Sans KR/);
    assert.match(studio, /Gmarket Sans/);
    assert.match(studio, /S-Core Dream/);
    assert.match(studio, /Wanted Sans/);
    assert.match(studio, /Black Han Sans/);
    assert.match(studio, /Jalnan/);
    assert.match(studioScript, /\/api\/v1\/assets/);
    assert.match(studioScript, /\/api\/v1\/gate/);
    assert.match(studioScript, /\/api\/v1\/exports\/html/);
    assert.match(studioScript, /\/api\/v1\/exports\/coupang-wing/);
    assert.match(studioScript, /\/api\/v1\/cloudflare-pages\/status/);
    assert.doesNotMatch(studioScript, /wingCdnStorageKey|localStorage/);
    assert.match(studio, /data-width="390"/);
    assert.doesNotMatch(studio, /data-width="(?:360|430|800)"/);
    assert.match(studio, /src="\/authoring\.html"/);
    assert.match(
      studio,
      /<iframe[^>]+id="preview"[^>]+sandbox="allow-scripts"/,
    );
    assert.doesNotMatch(studio, /sandbox="[^"]*allow-same-origin/);
    assert.match(studioScript, /DETAIL_SERIALIZE_REQUEST/);
    assert.match(studioScript, /DETAIL_SERIALIZED/);
    assert.match(studioScript, /DETAIL_SAVE_RESULT/);
    assert.match(
      studioScript,
      /event\.source !== preview\.contentWindow/,
    );
    assert.match(studioScript, /pendingSaveRequest/);
    assert.match(studioScript, /crypto\.getRandomValues/);
    assert.match(
      studioScript,
      /const request = finishPendingSave\(message\.nonce\);\s*if \(!request\) return;/,
    );
    assert.match(
      studioScript,
      /saveButton\.addEventListener\("click", requestAuthoringSave\)/,
    );
    assert.doesNotMatch(studioScript, /post\("DETAIL_SAVE"\)/);
    assert.match(studioScript, /\/api\/v1\/output\/save/);
    assert.doesNotMatch(studioScript, /contentWindow\.location/);
    assert.match(
      studioScript,
      /const publishReady = Boolean\(gate\.coupangWingExportAllowed\)/,
    );
    assert.match(
      studioScript,
      /if \(!gate\.coupangWingExportAllowed\)/,
    );
    assert.match(studioScript, /confirmedByUser:\s*true/);
    assert.match(studioScript, /DETAIL_SET_SECTION_CROP/);
    assert.match(studioScript, /cropModeForWidth/);
    assert.match(app, /DETAIL_READY/);
    assert.doesNotMatch(app, /DETAIL_EXPORT_HTML/);
    assert.match(app, /DETAIL_OBJECT_SELECTED/);
    assert.match(app, /DETAIL_OBJECT_CHANGED/);
    assert.match(app, /DETAIL_SET_MODE/);
    assert.match(app, /DETAIL_SET_TEXT_ALIGN/);
    assert.match(app, /DETAIL_DELETE_OBJECT/);
    assert.match(app, /const STATE_VERSION = 5/);
    assert.doesNotMatch(app, /\/api\/v1\/output\/save|localStorage/);
    assert.match(app, /DETAIL_SERIALIZE_REQUEST/);
    assert.match(app, /DETAIL_SERIALIZED/);
    assert.match(app, /DETAIL_SAVE_RESULT/);
    assert.match(app, /event\.source !== window\.parent/);
    assert.match(app, /sectionCrops/);
    assert.match(app, /DETAIL_SET_SECTION_CROP/);
    assert.match(app, /studio-section-crop-rules/);
    assert.match(app, /max-width: 520px/);
    assert.match(app, /min-width: 521px/);
    assert.match(app, /selectedObjects/);
    assert.match(app, /event\.(ctrlKey|metaKey)/);
    assert.match(app, /DETAIL_EDITING_STOPPED/);
    assert.match(app, /section-safe-top/);
    assert.match(app, /section-safe-bottom/);
    assert.match(app, /layerIndex/);
    assert.match(app, /layerCount/);
    assert.match(app, /domDepth/);
    assert.match(app, /section-center-y/);
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
  assert.match(studio, /id="wingConnectionStatus"/);
  assert.doesNotMatch(studio, /id="wingCdnBaseUrl"/);
  assert.match(studio, /id="exportCoupangWing"[^>]*disabled/);
  assert.match(studio, /780px 완성형 정적·애니메이션 WebP/);
    assert.match(studio, /좌표·화살표로 정밀하게 옮길 수 있습니다/);
    assert.match(studio, /id="elementColor"/);
    assert.match(studio, /id="applyPosition"/);
    assert.match(studio, /data-text-align="center"/);
    assert.match(studio, /선택 요소 삭제/);
    assert.match(studio, /id="editingState"/);
    assert.match(studio, /id="selectionDepth"/);
    assert.match(studio, /id="sectionCropHeight"/);
    assert.match(studio, /id="sectionCropApply"/);
    assert.match(studio, /id="sectionCropClear"/);
});

test("Studio v1 요소 편집은 저장·복원 계약을 포함하고 iframe export 우회를 갖지 않는다", async () => {
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
  assert.match(app, /DETAIL_SET_TEXT_ALIGN/);
  assert.match(app, /DETAIL_DELETE_OBJECT/);
  assert.match(app, /sectionCrops:\s*normalizeSectionCrops/);
  assert.match(app, /DETAIL_SET_SECTION_CROP/);
  assert.match(app, /renderSectionCropRules/);
  assert.match(app, /selectedObjects/);
  assert.match(app, /DETAIL_EDITING_STOPPED/);
  assert.match(app, /\[data-studio-launcher\]/);
  assert.match(app, /section-safe-top/);
  assert.match(app, /section-safe-bottom/);
  assert.match(app, /layerIndex/);
  assert.match(app, /layerCount/);
  assert.match(app, /domDepth/);
  assert.match(app, /dataset\.studioDeleted/);
  assert.match(app, /DETAIL_UNDO/);
  assert.match(app, /DETAIL_HISTORY_CHANGED/);
  assert.match(app, /state\.objects/);
  assert.doesNotMatch(app, /exportEditedHtml/);
  assert.doesNotMatch(app, /DETAIL_EXPORT_HTML/);
  assert.doesNotMatch(app, /URL\.createObjectURL/);
});

test("Studio v1은 중첩 실행과 확인 없는 삭제를 막는다", async () => {
  const [studioScript, app, template] = await Promise.all([
    repositoryFile(
      "skills/detail-page-maker-skill/assets/studio-v1-runtime/studio-v1.js",
    ),
    repositoryFile(
      "skills/detail-page-maker-skill/assets/studio-v1-runtime/app.js",
    ),
    repositoryFile(
      "skills/detail-page-maker-skill/assets/project-template/detail-page.html",
    ),
  ]);
  assert.match(studioScript, /window\.self\s*!==\s*window\.top/);
  assert.match(studioScript, /confirmDelete/);
  assert.match(app, /confirmDeletion/);
  assert.match(app, /\[data-studio-launcher\]/);
  assert.match(template, /id="detailPage"/);
});
