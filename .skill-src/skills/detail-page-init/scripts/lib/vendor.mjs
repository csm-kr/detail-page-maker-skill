// 런타임 벤더링. 호스트 홈 의존을 끊는다 — docs/adr/0004

import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const HYPERFRAMES_PIN = "0.7.90";

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * hyperframes 를 `motion/` 아래 프로젝트-로컬로 둔다.
 * 네트워크가 없거나 npm 이 없으면 설치를 건너뛰고 경로만 잠근다 —
 * 그러면 G8 이 거부한다. init 이 조용히 호스트 설치본을 가리키지는 않는다.
 */
export async function vendorHyperframes({ workspace, install = true }) {
  const dir = path.join(workspace, "motion");
  await mkdir(dir, { recursive: true });

  const manifest = path.join(dir, "package.json");
  if (!(await readJson(manifest))) {
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          name: "detail-page-motion",
          private: true,
          description: "프로젝트-로컬 모션 런타임. 호스트 홈을 쓰지 않는다",
          dependencies: { hyperframes: HYPERFRAMES_PIN },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  const installed = await readJson(
    path.join(dir, "node_modules", "hyperframes", "package.json"),
  );
  if (installed?.version === HYPERFRAMES_PIN) {
    return { mode: "project-local", path: "motion/", pin: HYPERFRAMES_PIN, installed: true };
  }

  if (!install) {
    return { mode: "project-local", path: "motion/", pin: HYPERFRAMES_PIN, installed: false };
  }

  // shell: true 로 인자를 넘기면 이스케이프되지 않는다. Windows 에서는 npm.cmd 를 직접 부른다.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 180000,
  });

  const after = await readJson(path.join(dir, "node_modules", "hyperframes", "package.json"));
  return {
    mode: "project-local",
    path: "motion/",
    pin: HYPERFRAMES_PIN,
    installed: after?.version === HYPERFRAMES_PIN,
    note: result.status === 0 ? null : "npm install 이 실패했다. G8 에서 막힌다",
  };
}

/**
 * 폰트를 워크스페이스 안으로 **복사한다.** 호스트 경로를 그대로 기록하면 다른 기계에서
 * 죽는다 — 런타임은 프로젝트-로컬이라는 방침이 폰트에도 적용된다.
 */
export async function vendorFont({ workspace, candidates }) {
  const fonts = path.join(workspace, "runtime", "fonts");
  await mkdir(fonts, { recursive: true });

  const relative = (file) => path.relative(workspace, file).split(path.sep).join("/");

  // 이미 워크스페이스 안에 있으면 그대로 쓴다.
  const inside = candidates.find((file) =>
    path.resolve(file).startsWith(path.resolve(workspace)),
  );
  if (inside) return relative(inside);

  for (const candidate of candidates) {
    const destination = path.join(fonts, path.basename(candidate));
    try {
      await copyFile(candidate, destination);
      return relative(destination);
    } catch {
      // 다음 후보. 시스템 폰트는 잠겨 있을 수 있다
    }
  }
  return null;
}
