// 미디어 발행 인자. 2회차의 실패가 폭과 포맷이었으므로 그 둘을 실행 없이 고정한다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { OUTPUT_WIDTH, convertArgs, destFor, formatOf } from "../lib/media.mjs";

test("폭을 780 으로 강제한다", () => {
  const args = convertArgs({ src: "a.png", dest: "a.webp" });
  assert.equal(OUTPUT_WIDTH, 780);
  assert.ok(args.includes(`scale=780:-2:flags=lanczos`), args.join(" "));
});

test("폭은 인자로 받지 않는다 — 부르는 곳이 바꿀 수 없다", () => {
  // 다른 폭을 넣어도 무시된다. 계약이 780 이다.
  const args = convertArgs({ src: "a.png", dest: "a.webp", width: 1024 });
  assert.ok(!args.join(" ").includes("1024"));
});

test("정책 포맷마다 코덱과 확장자가 따라온다", () => {
  assert.equal(formatOf("webp-q85").ext, ".webp");
  assert.ok(convertArgs({ src: "a", dest: "b", format: "webp-q85" }).includes("libwebp"));
  assert.equal(formatOf("jpeg-q88").ext, ".jpg");
  assert.equal(formatOf("png").ext, ".png");
});

test("모르는 포맷은 webp 로 떨어진다", () => {
  assert.equal(formatOf("무엇").ext, ".webp");
});

test("발행 경로는 정책이 정한다", () => {
  assert.equal(
    destFor({ dir: path.join("output", "media", "images"), id: "st-01", format: "webp-q85" }),
    path.join("output", "media", "images", "st-01.webp"),
  );
});

test("덮어쓰기를 켜 둔다 — 재발행이 막히지 않는다", () => {
  assert.ok(convertArgs({ src: "a", dest: "b" }).includes("-y"));
});
