// 수집 경로 선택. 아는 호스트는 검증된 추출기로 보내고, 내장 캡처는 그 외에만 쓴다.
//
// 왜 내장 캡처가 1급이 아닌가. 내장 캡처에는 ACCESS_BLOCKED 판정도, 상품 ID 대조도,
// 후기 개인정보 마스킹도, 자산별 원본 다운로드도 없다. 추출기에는 다 있고 이미 한 회차를
// 통과했다. 같은 것을 다시 짜는 대신 부른다.

import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 번들 스킬이 사는 곳. 오케스트레이터 안에 함께 설치된다. */
export const BUNDLE_ROOT = path.resolve(HERE, "..", "..", ".agents", "skills");

/**
 * 호스트별 추출기.
 *
 * `args` 는 요청을 최소로 두기 위한 것이다. 기본값으로 돌리면 후기 200개를
 * 최대 36페이지 넘겨 가며 긁는다 — 그러면 사이트가 막는다. 우리가 이 단계에서
 * 원하는 것은 레이아웃과 자산이다.
 */
export const EXTRACTORS = [
  {
    host: "domeggook.com",
    skill: "dmk-extractor",
    entry: "extract_dmk.py",
    requires: "browser-harness",
    // 공급처는 상세설명과 그 안의 GIF 프레임이 목적이다. 후기는 표본만 본다.
    args: ["--review-limit", "20"],
  },
  {
    host: "coupang.com",
    skill: "coupang-extractor",
    entry: "run_capture.py",
    requires: "browser-harness",
    // 기준작 판독은 구성과 이미지를 보는 일이다. 후기 단계를 아예 끈다.
    args: ["--sections", "thumbnails,detail"],
  },
];

/**
 * 이 URL 을 맡을 추출기. 없으면 null (내장 캡처로 간다).
 * 호스트는 정확히 일치해야 한다 — 부분 일치로 고르면 `coupang.com.evil.kr` 이 통과한다.
 */
export function chooseExtractor(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  return EXTRACTORS.find((entry) => entry.host === host) ?? null;
}

export function extractorDir(entry) {
  return path.join(BUNDLE_ROOT, entry.skill);
}

/** 번들에 실제로 들어 있는지. 빠졌으면 조용히 내려가지 않고 말한다. */
export async function extractorPresent(entry) {
  try {
    await access(path.join(extractorDir(entry), "scripts", entry.entry));
    return true;
  } catch {
    return false;
  }
}

/** `browser-harness` 명령. 추출기가 이것을 요구한다. */
export async function findHarness(environment = process.env) {
  const pathVar = environment.PATH ?? environment.Path ?? "";
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of pathVar.split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.join(dir, `browser-harness${ext}`);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // 다음 후보
      }
    }
  }
  return null;
}

/**
 * 추출기를 돌린다. 출력은 그대로 흘려보낸다 — 추출기의 상태 코드가 곧 우리의 근거다.
 * 성공하면 번들 디렉터리를 준다.
 */
export async function runExtractor({
  entry,
  url,
  outDir,
  python = process.platform === "win32" ? "python" : "python3",
  onLine = () => {},
}) {
  await mkdir(path.dirname(outDir), { recursive: true });
  const script = path.join(extractorDir(entry), "scripts", entry.entry);
  const argv = ["-X", "utf8", script, "--url", url, "--output", outDir, ...entry.args];

  return new Promise((resolve, reject) => {
    const child = spawn(python, argv, {
      cwd: extractorDir(entry),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let tail = "";
    const feed = (chunk) => {
      tail += chunk.toString();
      const lines = tail.split(/\r?\n/);
      tail = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", (error) => reject(new Error(`EXTRACTOR_SPAWN_FAILED ${error.message}`)));
    child.on("close", (code) => {
      if (tail) onLine(tail);
      if (code === 0) resolve({ bundle: outDir, skill: entry.skill });
      else reject(new Error(`EXTRACTOR_FAILED ${entry.skill} 종료 코드 ${code}`));
    });
  });
}
