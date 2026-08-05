// 내장 CDP 캡처. 아는 호스트가 아닐 때만 쓰는 대체 경로다 — 1급 경로는 lib/extract.mjs 의
// 검증된 추출기다.
//
// 캡처는 **수집 스크립트만** inputs.lock.json 에 등록할 수 있다. 손으로 놓은 파일로
// 게이트를 통과시킬 수 없게 만드는 곳이다.
//
// 3회차 실테스트가 가르친 두 가지. 둘 다 진단으로 확인했고 추측이 아니다.
//
//   1. **페이지 소켓에 직접 붙으면 안 된다.** `PUT /json/new` 로 탭을 만들고 그 탭의
//      webSocketDebuggerUrl 에 붙으면, 쿠팡이 띄우는 shared_worker(blob:) 들이 죽을 때
//      연결이 함께 끊겼다. 진단에서 `Inspector.targetCrashed` 두 번과 그 워커들의
//      `Target.detachedFromTarget` 을 봤고, 페이지 타깃 자체는 멀쩡했다.
//      브라우저 소켓(`/json/version` 의 webSocketDebuggerUrl)에 붙어
//      `Target.attachToTarget {flatten:true}` 로 부착하면 남의 타깃이 죽어도 견딘다.
//      browser-harness 가 같은 방법을 쓴다.
//
//   2. **성공한 캡처가 쓰레기일 수 있다.** 없는 쿠팡 상품이 HTTP 200 에 스크린샷까지
//      성공으로 돌아왔다. 본문은 "상품을 찾을 수 없습니다" 였고 높이는 한 화면(1028px)
//      뿐이었다. 그대로 기준작으로 등록될 뻔했다. 상세페이지는 길다 — 높이로 막는다.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** 상세페이지라면 이보다는 길다. 공급처 실측은 9261px 이었고 오류 페이지는 1028px 였다. */
export const MIN_PAGE_HEIGHT = 2000;

/**
 * 브라우저 수준 CDP 세션. 타깃마다 sessionId 로 갈라 보낸다.
 * WebSocket 과 fetch 를 주입받는다 — 그러지 않으면 테스트가 실제 브라우저를 건드린다.
 */
async function connectBrowser({ cdp, fetchImpl, WebSocketImpl }) {
  const version = await fetchImpl(`${cdp}/json/version`).then((r) => r.json());
  if (!version.webSocketDebuggerUrl) {
    throw new Error("CDP_NO_BROWSER_WS /json/version 에 브라우저 소켓 주소가 없다");
  }

  const socket = new WebSocketImpl(version.webSocketDebuggerUrl);
  const pending = new Map();
  const waiters = [];
  let seq = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP_CONNECT_FAILED")), { once: true });
  });

  // 소켓이 닫히면 대기 중인 모든 것을 거부한다. 이것이 없으면 브라우저가 죽었을 때
  // promise 가 settle 되지 않고 그대로 매달린다 — 실제로 그렇게 멈췄다.
  const abort = (reason) => {
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
    for (const waiter of waiters.splice(0)) waiter.reject(new Error(reason));
  };
  socket.addEventListener("close", () => abort("CDP_CLOSED 브라우저와의 연결이 끊겼다"));
  socket.addEventListener("error", () => abort("CDP_ERROR 브라우저 연결 오류"));

  /** 내 세션이 떨어졌는지. 남의 타깃이 죽는 것과 구별해야 한다. */
  let mine = null;
  let gone = null;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }

    // 내 타깃이 떨어진 것만 문제다. 쿠팡의 shared_worker 크래시는 그냥 흘린다.
    if (message.method === "Target.detachedFromTarget" && message.params?.sessionId === mine) {
      gone = "CDP_TARGET_GONE 캡처하던 탭이 사라졌다";
      abort(gone);
      return;
    }

    for (const waiter of [...waiters]) {
      if (waiter.method === message.method && (!waiter.sessionId || waiter.sessionId === message.sessionId)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message.params);
      }
    }
  });

  return {
    setSession(sessionId) {
      mine = sessionId;
    },
    send(method, params = {}, sessionId, timeoutMs = 60000) {
      if (gone) return Promise.reject(new Error(gone));
      seq += 1;
      const id = seq;
      // 응답이 없으면 매달리지 않고 어느 호출이 문제인지 말한다.
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP_TIMEOUT ${method}`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (value) => (clearTimeout(timer), resolve(value)),
          reject: (error) => (clearTimeout(timer), reject(error)),
        });
        socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      });
    },
    waitFor(method, sessionId, timeoutMs = 30000) {
      return new Promise((resolve, reject) => {
        // 타이머를 지우지 않으면 이벤트가 먼저 와도 프로세스가 그만큼 살아 있는다.
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) waiters.splice(index, 1);
          reject(new Error(`TIMEOUT ${method}`));
        }, timeoutMs);
        const waiter = {
          method,
          sessionId,
          resolve: (value) => (clearTimeout(timer), resolve(value)),
          reject: (error) => (clearTimeout(timer), reject(error)),
        };
        waiters.push(waiter);
      });
    },
    close: () => socket.close(),
  };
}

/**
 * 페이지를 열어 전체 화면과 본문 텍스트를 남긴다.
 * 배경 탭에서 하므로 사용자가 보던 창에서 포커스를 빼앗지 않는다.
 */
export async function capturePage({
  cdp,
  url,
  outPng,
  outText,
  width = 1280,
  settleMs = 2500,
  minHeight = MIN_PAGE_HEIGHT,
  fetchImpl = fetch,
  WebSocketImpl = WebSocket,
}) {
  const browser = await connectBrowser({ cdp, fetchImpl, WebSocketImpl });
  let targetId = null;
  try {
    ({ targetId } = await browser.send("Target.createTarget", {
      url: "about:blank",
      background: true,
    }));
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    browser.setSession(sessionId);

    const page = (method, params, timeoutMs) => browser.send(method, params, sessionId, timeoutMs);

    await page("Page.enable");
    await page("Runtime.enable");
    await page("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const loaded = browser.waitFor("Page.loadEventFired", sessionId, 30000).catch(() => null);
    await page("Page.navigate", { url });
    await loaded;

    // 지연 로딩을 끌어내려면 끝까지 내려야 한다.
    await page("Runtime.evaluate", {
      expression: `(async () => {
        const step = () => new Promise(r => setTimeout(r, 250));
        let last = -1;
        for (let i = 0; i < 60; i += 1) {
          window.scrollTo(0, document.body.scrollHeight);
          await step();
          if (document.body.scrollHeight === last) break;
          last = document.body.scrollHeight;
        }
        window.scrollTo(0, 0);
      })()`,
      awaitPromise: true,
    });
    if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));

    const metrics = await page("Page.getLayoutMetrics");
    const full = metrics.cssContentSize ?? metrics.contentSize;

    const text = await page("Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });
    const bodyText = text.result.value ?? "";

    // 여기서 막는다. 200 으로 온 오류 페이지가 기준작으로 등록되면 이후 게이트가 전부
    // 잘못된 근거 위에서 판단한다.
    if (full.height < minHeight) {
      throw new Error(
        `CAPTURE_TOO_SHORT 높이 ${full.height}px 은 상세페이지가 아니다 (최소 ${minHeight}px).
  본문 앞부분: ${bodyText.replace(/\s+/g, " ").slice(0, 120)}
  URL 이 살아 있는지 확인한다. 짧은 페이지가 맞으면 --min-height 로 낮춘다.`,
      );
    }

    const shot = await page("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: full.width, height: Math.min(full.height, 30000), scale: 1 },
    });
    await mkdir(path.dirname(outPng), { recursive: true });
    await writeFile(outPng, Buffer.from(shot.data, "base64"));
    if (outText) await writeFile(outText, `${bodyText}\n`, "utf8");

    const title = await page("Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true,
    });

    return {
      url,
      title: title.result.value ?? "",
      width: full.width,
      height: full.height,
      png: outPng,
      text: outText ?? null,
      chars: bodyText.length,
    };
  } finally {
    // 내가 만든 배경 탭만 닫는다. 사용자가 보던 탭은 건드리지 않는다.
    if (targetId) {
      await browser.send("Target.closeTarget", { targetId }, undefined, 5000).catch(() => null);
    }
    browser.close();
  }
}
