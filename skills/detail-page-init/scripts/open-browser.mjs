#!/usr/bin/env node
// CDP 를 여는 유일한 방법. 사용자가 쓰던 창을 닫지 않는다.
//
// Chrome 136 부터 기본 프로필에서는 --remote-debugging-port 가 무시되므로 워크스페이스
// 안의 전용 프로필로 두 번째 인스턴스를 띄운다. ChatGPT 로그인은 그 프로필에 남아
// 다음 회차에도 그대로 쓰인다. **로그인은 사용자만 한다.**

import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_PORT, openBrowser, profileDir } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function resolveWorkspace() {
  if (process.env.DETAIL_PAGE_WORKSPACE) return path.resolve(process.env.DETAIL_PAGE_WORKSPACE);
  let current = path.resolve(HERE);
  while (true) {
    const parent = path.dirname(current);
    if (path.basename(current) === "skills" && path.basename(parent).startsWith(".")) {
      return path.dirname(parent);
    }
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

const workspace = resolveWorkspace();
const index = process.argv.indexOf("--port");
const port = index === -1 ? DEFAULT_PORT : Number(process.argv[index + 1]);

try {
  const result = await openBrowser({ workspace, port });
  const out = (text) => process.stdout.write(`${text}\n`);
  out(result.launched ? "브라우저를 띄웠다." : "이미 열려 있다.");
  out(`  CDP      ${result.url}`);
  out(`  프로필   ${path.relative(workspace, profileDir(workspace))}`);
  if (result.launched) {
    out("");
    out("  ChatGPT 로그인이 안 되어 있으면 이 창에서 한 번 로그인한다.");
    out("  로그인은 사용자만 한다. 프로필에 남아 다음 회차에도 쓰인다.");
  }
} catch (error) {
  process.stdout.write(`REFUSED ${error.message}\n`);
  process.exitCode = 1;
}
