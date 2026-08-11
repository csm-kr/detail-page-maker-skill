import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeRoot = new URL("../../assets/studio-v1-runtime/", import.meta.url);

test("Studio preview keeps long authoring documents inside a bounded scroll viewport", async () => {
  const [html, css, script, app] = await Promise.all([
    readFile(new URL("studio.html", runtimeRoot), "utf8"),
    readFile(new URL("studio-v1.css", runtimeRoot), "utf8"),
    readFile(new URL("studio-v1.js", runtimeRoot), "utf8"),
    readFile(new URL("app.js", runtimeRoot), "utf8"),
  ]);

  assert.match(html, /<button id="save" type="button">저장<\/button>/);
  assert.match(html, /<button id="undo" type="button" disabled>되돌리기<\/button>/);
  assert.match(html, /편집 시작 \(E\)/);
  assert.match(html, /<span>V<\/span> 요소 수정/);
  assert.match(html, /<span>T<\/span> 텍스트 수정/);
  assert.doesNotMatch(html, /E로 편집을 시작한 뒤/);
  assert.doesNotMatch(html, /id="reset"|저장 전 변경 취소|초기화/);
  assert.doesNotMatch(html, /canvas-toolbar|data-width="780"|>780<\/button>/);
  assert.match(html, /id="pageMinimap"/);
  assert.match(html, /id="minimapViewport"/);
  assert.equal((html.match(/data-text-color=/g) || []).length, 7);
  assert.equal((html.match(/class="align-icon"/g) || []).length, 4);
  assert.doesNotMatch(html, /⬅️|↔️|➡️|☰/);
  assert.doesNotMatch(
    html,
    /섹션 순서|선택 섹션 아래 자르기|미리보기 창 높이|이미지 교체|<h2>테마<\/h2>|id="accent"|id="elementX"|id="elementY"|id="pageHeight"|id="autoHeight"|data-nudge-x/,
  );
  assert.match(css, /\.workspace\s*\{[^}]*overflow:\s*hidden[^}]*background:\s*#d8d5cc/s);
  assert.match(css, /\.canvas-shell\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*padding:\s*0/s);
  assert.match(css, /iframe\s*\{[^}]*flex:\s*0 0 780px[^}]*height:\s*100%[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.page-minimap\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.text-align-grid button:hover::after/);
  assert.match(script, /const PREVIEW_HEIGHT_MAX = 2400;/);
  assert.match(script, /preview\.closest\("\.workspace"\)\?\.clientHeight/);
  assert.match(script, /DETAIL_SCROLL_TO_RATIO/);
  assert.match(script, /DETAIL_SCROLL_POSITION/);
  assert.match(script, /DETAIL_SCROLL_BY/);
  assert.match(script, /canvasWorkspace\.addEventListener\([\s\S]*"wheel"/);
  assert.doesNotMatch(script, /canvasDrag|is-dragging/);
  assert.match(script, /DETAIL_SET_TEXT_RANGE_STYLE/);
  assert.match(script, /DETAIL_TEXT_SELECTION_CHANGED/);
  assert.match(script, /window\.name = "detail-page-studio"/);
  assert.doesNotMatch(script, /querySelectorAll\("\[data-width\]"\)/);
  assert.match(script, /saveButton\.addEventListener\("click", requestAuthoringSave\)/);
  assert.equal((script.match(/\/api\/v1\/output\/save/g) || []).length, 1);
  assert.match(script, /key === "s"[\s\S]+requestAuthoringSave\(\)/);
  assert.match(script, /key === "z"[\s\S]+DETAIL_UNDO/);
  assert.match(script, /key === "e"[\s\S]+startEditing\(editorMode\)/);
  assert.match(script, /event\.key === "Escape"[\s\S]+stopEditing\(\)/);
  assert.match(script, /applyPreviewHeight\(availablePreviewHeight\(\)\)/);
  assert.doesNotMatch(script, /DETAIL_RESET|#reset|저장 전 변경 취소/);
  assert.doesNotMatch(script, /applyPreviewHeight\(measuredHeight\)/);
  assert.doesNotMatch(
    script,
    /#accent|#elementX|#elementY|#pageHeight|#autoHeight|#imageSrc|#imageFile|#sectionSelect/,
  );
  assert.match(app, /document\.addEventListener\("selectionchange"/);
  assert.match(app, /rangeInsideSelectedText\(savedTextRange\)/);
  assert.match(app, /range\.extractContents\(\)/);
  assert.match(app, /message\.type === "DETAIL_SCROLL_BY"/);
  assert.doesNotMatch(app, /message\.type === "DETAIL_SET_OBJECT_STYLE"/);
});
