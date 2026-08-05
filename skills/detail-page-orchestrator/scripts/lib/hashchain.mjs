// 해시. 산출물이 바뀌었는지 판정하는 유일한 수단이다.

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const ABSENT = "absent";

export function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

/** 파일 해시. 없으면 ABSENT — 있었다가 없어진 것도 변경이다. */
export async function hashFile(file) {
  try {
    return sha256(await readFile(file));
  } catch {
    return ABSENT;
  }
}

/**
 * 디렉터리 해시. 경로와 내용을 함께 넣어 파일 이동도 잡는다.
 * 순서를 정렬해 플랫폼 간 결과를 같게 만든다.
 */
export async function hashTree(dir) {
  const files = [];
  const walk = async (current) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  };
  await walk(dir);

  if (files.length === 0) return ABSENT;

  const digest = createHash("sha256");
  for (const file of files.sort()) {
    digest.update(path.relative(dir, file).split(path.sep).join("/"));
    digest.update("\0");
    digest.update(await readFile(file));
    digest.update("\0");
  }
  return `sha256:${digest.digest("hex")}`;
}

/** 파일이 존재하나. */
export async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
