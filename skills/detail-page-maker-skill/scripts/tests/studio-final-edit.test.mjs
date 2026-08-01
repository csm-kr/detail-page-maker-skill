import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  injectLocalStudioLauncher,
} from "../runtime/studio-v1-server.mjs";

const runtimeRoot = new URL(
  "../../assets/studio-v1-runtime/",
  import.meta.url,
);

test("Studio UI는 중간 승인·워크플로를 숨기고 G4 working save를 사용한다", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("studio.html", runtimeRoot), "utf8"),
    readFile(new URL("studio-v1.js", runtimeRoot), "utf8"),
  ]);
  assert.match(html, /data-studio-view="approval" hidden/);
  assert.match(html, /data-studio-view="workflow" hidden/);
  assert.match(html, /최종 수정 저장/);
  assert.match(script, /\/api\/v1\/studio\/working\/state/);
  assert.match(script, /\/api\/v1\/studio\/working\/save/);
  assert.doesNotMatch(script, /\/api\/v1\/output\/save/);
});

test("완성 HTML의 로컬 Studio 버튼은 exact session으로 연결된다", () => {
  const html = injectLocalStudioLauncher(
    "<!doctype html><html><body><main>상품</main></body></html>",
    "studio-session-123",
  );
  assert.match(
    html,
    /href="\/studio\.html\?session_id=studio-session-123"/,
  );
  assert.match(html, /Studio에서 최종 수정/);
});
