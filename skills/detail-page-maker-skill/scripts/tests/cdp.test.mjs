import assert from "node:assert/strict";
import test from "node:test";

import { probeCdp } from "../lib/cdp.mjs";

const version = (v) => ({
  ok: true,
  json: async () => ({ Browser: v, webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/browser/x" }),
});

test("첫 번째로 응답하는 endpoint 를 채택한다", async () => {
  const seen = [];
  const report = await probeCdp({
    endpoints: ["http://127.0.0.1:9222", "http://127.0.0.1:9223"],
    fetchImpl: async (url) => {
      seen.push(url);
      if (url.startsWith("http://127.0.0.1:9223")) return version("Chrome/151.0.0.0");
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(report.ok, true);
  assert.equal(report.endpoint, "http://127.0.0.1:9223");
  assert.equal(report.browser, "Chrome/151.0.0.0");
  assert.deepEqual(seen, [
    "http://127.0.0.1:9222/json/version",
    "http://127.0.0.1:9223/json/version",
  ]);
});

test("모두 실패하면 시도한 endpoint 를 남긴다", async () => {
  const report = await probeCdp({
    endpoints: ["http://127.0.0.1:9222"],
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.endpoint, null);
  assert.deepEqual(report.tried, ["http://127.0.0.1:9222"]);
  assert.match(report.hint, /9222/);
});

test("HTTP 오류 응답은 실패로 본다", async () => {
  const report = await probeCdp({
    endpoints: ["http://127.0.0.1:9223"],
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
  });
  assert.equal(report.ok, false);
});

test("BU_CDP_URL 환경변수를 가장 먼저 시도한다", async () => {
  const seen = [];
  const report = await probeCdp({
    environment: { BU_CDP_URL: "http://127.0.0.1:9333" },
    fetchImpl: async (url) => {
      seen.push(url);
      return version("Chrome/151.0.0.0");
    },
  });
  assert.equal(report.endpoint, "http://127.0.0.1:9333");
  assert.equal(seen[0], "http://127.0.0.1:9333/json/version");
});

test("타임아웃이 무한정 매달리지 않는다", async () => {
  const report = await probeCdp({
    endpoints: ["http://127.0.0.1:9223"],
    timeoutMs: 5,
    fetchImpl: (url, options) =>
      new Promise((resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  });
  assert.equal(report.ok, false);
});
