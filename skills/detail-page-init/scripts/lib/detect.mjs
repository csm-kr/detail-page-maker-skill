// 탐지. 묻지 않고 알 수 있는 것을 모은다. 막힐 것을 앞에서 드러내는 것이 목적이다.

import { spawnSync } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const FONT_CANDIDATES = [
  "runtime/fonts/NotoSansKR-VF.ttf",
  "C:/Windows/Fonts/NotoSansKR-VF.ttf",
  "C:/Windows/Fonts/malgun.ttf",
  "/usr/share/fonts/truetype/noto/NotoSansKR-VF.ttf",
  "/System/Library/Fonts/AppleSDGothicNeo.ttc",
];

function probe(command, args) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 8000 });
    if (result.status !== 0) return null;
    return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n")[0];
  } catch {
    return null;
  }
}

async function present(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function findPython() {
  const candidates = [process.env.DETAIL_PAGE_PYTHON, "python3", "python", "py"].filter(Boolean);
  for (const candidate of candidates) {
    const version = probe(candidate, ["--version"]);
    // Windows Store 별칭은 exit 9009 로 죽고 버전을 내놓지 않는다.
    if (version && /Python \d/.test(version)) return { command: candidate, version };
  }
  return null;
}

function pythonModules(command) {
  const found = {};
  for (const [key, module] of [
    ["pil", "PIL"],
    ["fonttools", "fontTools"],
  ]) {
    found[key] = probe(command, ["-c", `import ${module}`]) !== null;
  }
  return found;
}

async function findCdp() {
  const candidates = [
    process.env.BU_CDP_URL,
    "http://127.0.0.1:9222",
    "http://127.0.0.1:9223",
  ].filter(Boolean);
  for (const url of candidates) {
    try {
      const response = await fetch(`${url}/json/version`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return url;
    } catch {
      // 다음 후보
    }
  }
  return null;
}

/** 호스트 홈 오염. 있으면 정리 대상이고, 남아 있으면 제작이 시작되지 않는다. */
export async function hostPollution() {
  const homes = [homedir()];
  if (process.env.DETAIL_PAGE_HOME) homes.push(process.env.DETAIL_PAGE_HOME);
  const found = [];
  for (const home of homes) {
    for (const rel of [".claude/skills", ".agents/skills", ".codex/skills"]) {
      const dir = path.join(home, rel);
      for (const name of await readdir(dir).catch(() => [])) {
        if (name.startsWith("detail-page")) found.push(path.join(dir, name));
      }
    }
  }
  return found;
}

export async function detect(workspace) {
  const python = findPython();
  const font = [];
  for (const candidate of FONT_CANDIDATES) {
    const full = path.isAbsolute(candidate) ? candidate : path.join(workspace, candidate);
    if (await present(full)) font.push(full);
  }

  const home = homedir();
  const auth = {
    // 존재 여부만 본다. 내용을 읽지도 출력하지도 않는다.
    codex_auth: await present(path.join(home, ".codex", "auth.json")),
    codex_installation_id: await present(path.join(home, ".codex", "installation_id")),
  };

  return {
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    nodeOk: Number(process.versions.node.split(".")[0]) >= 22,
    python: python?.command ?? null,
    pythonVersion: python?.version ?? null,
    pythonModules: python ? pythonModules(python.command) : { pil: false, fonttools: false },
    ffmpeg: probe("ffmpeg", ["-version"]),
    cdp: await findCdp(),
    fonts: font,
    auth,
    hosts: {
      "claude-code": await present(path.join(home, ".claude")),
      codex: await present(path.join(home, ".codex")),
    },
    pollution: await hostPollution(),
  };
}

/**
 * 제작을 끝까지 가려면 필요한 것들. 하나라도 없으면 env.lock 의 ready 가 false 가 되고
 * orchestrate start 가 거부한다. init 은 기록하고 크게 알려 준다.
 */
export function blockers(result) {
  const missing = [];
  if (!result.nodeOk) missing.push(`Node 22.15.0 이상이 필요하다 (현재 ${result.node})`);
  if (!result.python) missing.push("Python 을 찾지 못했다 (G10 미디어 검증)");
  else {
    if (!result.pythonModules.pil) missing.push("Python PIL 이 없다 (GIF 검증)");
    if (!result.pythonModules.fonttools) missing.push("Python fontTools 가 없다 (폰트 임베드)");
  }
  if (!result.ffmpeg) missing.push("ffmpeg 를 찾지 못했다 (모션 렌더)");
  if (result.fonts.length === 0) missing.push("한글 폰트를 찾지 못했다");
  if (!result.cdp) {
    missing.push(
      "브라우저 CDP 를 찾지 못했다 (목업 대화). `node scripts/open-browser.mjs` 로 연다 — 쓰던 창은 닫지 않는다",
    );
  }
  if (!result.auth.codex_auth) {
    missing.push("~/.codex/auth.json 이 없다. `codex login` 을 사용자가 실행한다 (이미지 생성)");
  }
  if (result.pollution.length > 0) {
    missing.push(`호스트 홈에 스킬이 있다 (${result.pollution.length}개). --prune 으로 치운다`);
  }
  return missing;
}

export async function diskFreeMb(target) {
  try {
    const info = await stat(target);
    return info ? null : null; // Node 는 여유 공간 API 가 없다. 보고만 생략한다.
  } catch {
    return null;
  }
}
