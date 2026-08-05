// 브라우저 CDP. 목업 대화(G4)와 캡처가 이것을 쓴다.
//
// Chrome 136 부터 **기본 프로필에서는 --remote-debugging-port 가 무시된다.** 그래서
// 별도 user-data-dir 이 필요하다. 그 덕에 사용자가 쓰던 창을 닫지 않아도 되고,
// 프로필이 워크스페이스 안에 있어 다른 기계에서도 같은 방법이 통한다.

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_PORT = Number(process.env.DETAIL_PAGE_CDP_PORT ?? 9222);

/** 워크스페이스 안의 자동화 전용 프로필. 사용자의 평소 프로필과 섞지 않는다. */
export function profileDir(workspace) {
  return path.join(workspace, "runtime", "chrome-profile");
}

async function present(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function findChrome() {
  const home = homedir();
  const candidates =
    process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
          path.join(home, "AppData/Local/Google/Chrome/Application/chrome.exe"),
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];

  for (const candidate of candidates) {
    if (await present(candidate)) return candidate;
  }
  return null;
}

export function launchArgs(workspace, port = DEFAULT_PORT) {
  return [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir(workspace)}`,
    "--no-first-run",
    "--no-default-browser-check",
  ];
}

/** 사람이 그대로 붙여 쓸 수 있는 한 줄. 막힘 메시지에 넣는다. */
export function launchCommand(workspace, port = DEFAULT_PORT) {
  return `node scripts/open-browser.mjs${port === DEFAULT_PORT ? "" : ` --port ${port}`}`;
}

export async function cdpAlive(port = DEFAULT_PORT) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok ? `http://127.0.0.1:${port}` : null;
  } catch {
    return null;
  }
}

/**
 * 띄운다. 이미 살아 있으면 아무것도 하지 않는다.
 * 사용자가 쓰던 창은 건드리지 않는다 — 프로필이 다르므로 나란히 돈다.
 */
export async function openBrowser({ workspace, port = DEFAULT_PORT, url = "https://chatgpt.com" }) {
  const already = await cdpAlive(port);
  if (already) return { url: already, launched: false };

  const chrome = await findChrome();
  if (!chrome) {
    throw new Error(
      "CHROME_NOT_FOUND Chrome 또는 Edge 를 찾지 못했다. 설치 후 다시 실행한다.",
    );
  }

  const child = spawn(chrome, [...launchArgs(workspace, port), url], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // 붙을 수 있을 때까지 기다린다. 고정 대기시간을 두지 않는다.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const alive = await cdpAlive(port);
    if (alive) return { url: alive, launched: true, chrome };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`CDP_NOT_READY ${port} 포트가 열리지 않았다. ${chrome}`);
}
