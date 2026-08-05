// G10 보고서 정형. check.mjs 가 errors 를 `join(" · ")` 하므로 문자열이어야 한다.
// 객체를 그대로 넣으면 거부 메시지가 `[object Object]` 가 되고, 그러면 무엇이 틀렸는지
// 알 수 없는 게이트가 된다 — 판정은 읽을 수 있어야 판정이다.

import assert from "node:assert/strict";
import test from "node:test";

import { shapeReport } from "../lib/report.mjs";

const result = {
  ok: false,
  html: "output/detail-page.html",
  media: { images: 30, gifs: 10 },
  errors: [
    { code: "MEDIA_WIDTH_NOT_780", file: "output/media/images/a.webp", width: 1024 },
    { code: "WIDTH_780_NOT_DECLARED" },
  ],
  warnings: [{ code: "SOMETHING_MINOR" }],
};

test("오류를 읽을 수 있는 문자열로 편다", () => {
  const report = shapeReport(result, { strictMedia: true });
  assert.deepEqual(report.errors, [
    "MEDIA_WIDTH_NOT_780 output/media/images/a.webp width=1024",
    "WIDTH_780_NOT_DECLARED",
  ]);
});

test("strict_media 를 기록한다 — check.mjs 가 이것을 본다", () => {
  assert.equal(shapeReport(result, { strictMedia: true }).strict_media, true);
  assert.equal(shapeReport(result, { strictMedia: false }).strict_media, false);
});

test("오류가 없으면 빈 배열이다 — 없는 필드로 두지 않는다", () => {
  const report = shapeReport({ ok: true, media: { images: 1, gifs: 0 } }, { strictMedia: true });
  assert.deepEqual(report.errors, []);
  assert.equal(report.ok, true);
});

test("경고는 남기지만 통과를 막지 않는다", () => {
  const report = shapeReport(result, { strictMedia: true });
  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0], /SOMETHING_MINOR/);
});

test("미디어 개수를 그대로 옮긴다", () => {
  const report = shapeReport(result, { strictMedia: true });
  assert.deepEqual(report.media, { images: 30, gifs: 10 });
});
