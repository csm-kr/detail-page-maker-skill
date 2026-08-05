// 내장 CDP 캡처 — 아는 호스트가 아닐 때만 쓰는 대체 경로.
//
// 여기 적힌 규칙은 전부 3회차 실테스트에서 실제로 당한 것이다. 추측으로 넣은 것은 없다.
//   1. 페이지 소켓(`/json/new` 의 webSocketDebuggerUrl)에 직접 붙으면 쿠팡이 띄우는
//      shared_worker 들이 죽을 때 함께 끊긴다. 진단으로 `Inspector.targetCrashed` 두 번과
//      그 워커들의 `Target.detachedFromTarget` 을 확인했다 — 페이지 타깃은 살아 있었다.
//      브라우저 수준 소켓에 붙어 flatten 으로 부착하면 그 크래시를 견딘다.
//   2. 없는 상품도 HTTP 200 에 스크린샷 성공으로 돌아온다. 본문에는 "상품을 찾을 수
//      없습니다" 가 들어 있고 높이는 한 화면뿐이었다. 그대로 기준작으로 등록될 뻔했다.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { capturePage } from "../lib/capture.mjs";

const BROWSER_WS = "ws://127.0.0.1:9222/devtools/browser/abc";

/**
 * CDP 브라우저 흉내. 주고받은 것을 전부 기록한다.
 *   crashOther   다른 세션의 타깃이 죽는다 (쿠팡의 shared_worker)
 *   dropMine     내 세션이 떨어진다
 */
function fakeBrowser({ height = 9000, body = "본문".repeat(2000), crashOther = false, dropMine = false } = {}) {
  const log = [];
  const closed = [];
  const listeners = new Map();
  const socket = {
    addEventListener(type, fn, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, once: options?.once === true });
    },
    close() {
      emit("close", {});
    },
    send(raw) {
      const message = JSON.parse(raw);
      log.push(message);
      handle(message);
    },
  };

  function emit(type, event) {
    for (const entry of [...(listeners.get(type) ?? [])]) {
      if (entry.once) listeners.get(type).splice(listeners.get(type).indexOf(entry), 1);
      entry.fn(event);
    }
  }
  const post = (payload) =>
    setTimeout(() => emit("message", { data: JSON.stringify(payload) }), 0);

  function handle({ id, method, params, sessionId }) {
    const reply = (result) => post({ id, result, sessionId });
    switch (method) {
      case "Target.createTarget":
        return reply({ targetId: "T-mine" });
      case "Target.attachToTarget":
        return reply({ sessionId: "S-mine" });
      case "Target.closeTarget":
        closed.push(params.targetId);
        return reply({});
      case "Page.navigate":
        reply({ frameId: "F1" });
        if (crashOther) {
          // 남의 타깃이 죽는다. 내 캡처는 이것으로 멈추지 않아야 한다.
          post({ method: "Inspector.targetCrashed", params: {}, sessionId: "S-worker" });
          post({
            method: "Target.detachedFromTarget",
            params: { sessionId: "S-worker", targetId: "T-worker" },
          });
        }
        if (dropMine) {
          post({
            method: "Target.detachedFromTarget",
            params: { sessionId: "S-mine", targetId: "T-mine" },
          });
        }
        return post({ method: "Page.loadEventFired", params: {}, sessionId: "S-mine" });
      case "Page.getLayoutMetrics":
        return reply({ cssContentSize: { x: 0, y: 0, width: 1280, height } });
      case "Page.captureScreenshot":
        return reply({ data: Buffer.from("가짜 PNG").toString("base64") });
      case "Runtime.evaluate": {
        const expression = params.expression;
        if (expression.includes("document.body.innerText")) {
          return reply({ result: { value: body } });
        }
        if (expression.includes("document.title")) {
          return reply({ result: { value: "제목" } });
        }
        return reply({ result: {} });
      }
      default:
        return reply({});
    }
  }

  // open 은 소켓이 만들어진 뒤에 쏜다. 픽스처 생성 시점에 쏘면 capturePage 가 리스너를
  // 붙이기 전에 지나가 버려서 영원히 기다린다 — 실제로 그렇게 매달렸다.
  return { socket, log, closed, open: () => setTimeout(() => emit("open", {}), 0) };
}

/** capturePage 를 가짜 브라우저로 돌린다. */
async function run(options = {}, captureOptions = {}) {
  const fake = fakeBrowser(options);
  const dir = await mkdtemp(path.join(tmpdir(), "dp-cap-"));
  const asked = [];
  try {
    const result = await capturePage({
      cdp: "http://127.0.0.1:9222",
      url: "https://example.com/x",
      outPng: path.join(dir, "a.png"),
      outText: path.join(dir, "a.txt"),
      settleMs: 0,
      fetchImpl: async (url) => {
        asked.push(url);
        return { ok: true, json: async () => ({ webSocketDebuggerUrl: BROWSER_WS }) };
      },
      WebSocketImpl: function () {
        fake.open();
        return fake.socket;
      },
      ...captureOptions,
    });
    return { result, fake, asked };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("브라우저 수준 소켓에 붙는다 — 페이지 탭을 새로 열지 않는다", async () => {
  const { asked } = await run();
  assert.deepEqual(asked, ["http://127.0.0.1:9222/json/version"]);
  // `/json/new` 로 탭을 만들고 그 페이지 소켓에 붙는 것이 3회차의 실패 원인이었다.
  assert.ok(!asked.some((url) => url.includes("/json/new")));
});

test("배경 탭을 만들고 flatten 으로 부착한다", async () => {
  const { fake } = await run();
  const created = fake.log.find((m) => m.method === "Target.createTarget");
  const attached = fake.log.find((m) => m.method === "Target.attachToTarget");
  assert.equal(created.params.background, true, "사용자가 보던 탭에서 포커스를 빼앗지 않는다");
  assert.equal(created.params.url, "about:blank");
  assert.equal(attached.params.flatten, true);
});

test("페이지 명령에는 전부 sessionId 를 싣는다", async () => {
  const { fake } = await run();
  const pageCommands = fake.log.filter((m) => /^(Page|Runtime|Emulation)\./.test(m.method));
  assert.ok(pageCommands.length > 0);
  for (const message of pageCommands) {
    assert.equal(message.sessionId, "S-mine", `${message.method} 에 sessionId 가 없다`);
  }
});

test("다른 타깃이 죽어도 캡처는 끝난다", async () => {
  // 쿠팡의 shared_worker 크래시. 페이지 타깃은 멀쩡했다.
  const { result } = await run({ crashOther: true });
  assert.equal(result.height, 9000);
  assert.ok(result.chars > 0);
});

test("내가 만든 타깃만 닫는다", async () => {
  const { fake } = await run();
  assert.deepEqual(fake.closed, ["T-mine"]);
});

test("내 세션이 떨어지면 매달리지 않고 거부한다", async () => {
  await assert.rejects(() => run({ dropMine: true }), /CDP_TARGET_GONE/);
});

test("한 화면짜리 페이지는 거부한다", async () => {
  // 없는 쿠팡 상품이 200 으로 돌아와 스크린샷까지 성공했다. 상세페이지는 길다.
  await assert.rejects(
    () => run({ height: 1028, body: "상품을 찾을 수 없습니다." }),
    /CAPTURE_TOO_SHORT/,
  );
});

test("짧은 페이지도 최소 높이를 낮추면 받는다", async () => {
  const { result } = await run({ height: 400, body: "짧다" }, { minHeight: 0 });
  assert.equal(result.height, 400);
});
