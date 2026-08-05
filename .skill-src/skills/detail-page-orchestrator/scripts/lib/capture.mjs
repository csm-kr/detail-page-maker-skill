// CDP 캡처. 브라우저 lane 은 오케스트레이터가 소유한다 — 한 lane 에서 직렬로 돈다.
//
// 캡처는 **수집 스크립트만** inputs.lock.json 에 등록할 수 있다. 손으로 놓은 파일로
// 게이트를 통과시킬 수 없게 만드는 곳이다.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** CDP 세션 하나. 요청·응답과 이벤트 대기만 있다. */
async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const waiters = [];
  let seq = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP_CONNECT_FAILED")), {
      once: true,
    });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message}`));
      else resolve(message.result);
      return;
    }
    for (const waiter of [...waiters]) {
      if (waiter.method === message.method) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message.params);
      }
    }
  });

  return {
    send(method, params = {}) {
      seq += 1;
      const id = seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    waitFor(method, timeoutMs = 30000) {
      return new Promise((resolve, reject) => {
        const waiter = { method, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) {
            waiters.splice(index, 1);
            reject(new Error(`TIMEOUT ${method}`));
          }
        }, timeoutMs);
      });
    },
    close: () => socket.close(),
  };
}

/**
 * 페이지를 열어 전체 화면과 본문 텍스트를 남긴다.
 * 새 탭에서 하므로 사용자가 보던 탭을 건드리지 않는다.
 */
export async function capturePage({
  cdp,
  url,
  outPng,
  outText,
  width = 1280,
  settleMs = 2500,
}) {
  const created = await fetch(`${cdp}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  }).then((r) => r.json());

  const session = await connect(created.webSocketDebuggerUrl);
  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 이미 열린 뒤일 수 있으므로 load 를 기다리다 실패해도 계속 간다.
    await session.waitFor("Page.loadEventFired", 20000).catch(() => null);

    // 지연 로딩을 끌어내려면 끝까지 내려야 한다.
    await session.send("Runtime.evaluate", {
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
    await new Promise((resolve) => setTimeout(resolve, settleMs));

    const metrics = await session.send("Page.getLayoutMetrics");
    const full = metrics.cssContentSize ?? metrics.contentSize;

    const shot = await session.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: full.width,
        height: Math.min(full.height, 30000),
        scale: 1,
      },
    });
    await mkdir(path.dirname(outPng), { recursive: true });
    await writeFile(outPng, Buffer.from(shot.data, "base64"));

    const text = await session.send("Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });
    if (outText) {
      await writeFile(outText, `${text.result.value ?? ""}\n`, "utf8");
    }

    const title = await session.send("Runtime.evaluate", {
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
      chars: (text.result.value ?? "").length,
    };
  } finally {
    session.close();
    await fetch(`${cdp}/json/close/${created.id}`).catch(() => null);
  }
}
