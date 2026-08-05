// 정리. **삭제하지 않는다.** .trash/<타임스탬프>/ 로 원래 경로 구조를 유지해 옮긴다.
//
// 워크스페이스 루트는 git 저장소가 아니다. 되돌릴 지점이 없는 곳에서 지우면 복구가 없다.
// docs/adr/0010

import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";

export const AUTO = "A";
export const CONFIRM = "B";
export const PROTECTED = "C";

/** 절대 건드리지 않는 것. 판단하기 전에 먼저 걸러낸다. */
const PROTECT = [
  ".skill-src",
  "docs",
  "data",
  ".trash",
  path.join("work", "env.lock.json"),
  path.join("work", "env.answers.json"),
  path.join("work", "gates.history.json"),
];

function isProtected(rel) {
  const parts = rel.split(/[\\/]/);
  if (PROTECT.some((p) => rel === p || rel.startsWith(`${p}${path.sep}`) || rel.startsWith(`${p}/`))) {
    return true;
  }
  // 발행물과 근거는 프로젝트 안에서도 지키다.
  if (parts[0] === "projects" && parts.length >= 3) {
    if (parts[2] === "output") return true;
    if (parts[2] === "work") {
      const inner = parts[3];
      if (["SSOT.md", "flow-map.md", "design-ref", "gates.json", "inputs.lock.json"].includes(inner)) {
        return true;
      }
    }
    if (parts.length === 2) return false; // 프로젝트 디렉터리 자체는 B
  }
  return false;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * 정리 대상 분류.
 *   A 자동   재생성 가능하고 남으면 우회 경로가 되는 것
 *   B 확인   재생성 비용이 크거나 발행물을 포함하는 것
 */
export async function classify({ workspace, installedSkills = [], pollution = [] }) {
  const entries = [];
  const add = (grade, rel, why, absolute = null) =>
    entries.push({ grade, rel, why, absolute: absolute ?? path.join(workspace, rel) });

  // 워크스페이스 work/ 는 env.* 와 회차 이력만 있어야 한다. 그 밖은 전부 잔여물이다.
  // 아는 패턴만 치우면 "필요한 것만 둔다" 가 지켜지지 않는다.
  const WORK_KEEP = new Set(["env.lock.json", "env.answers.json", "gates.history.json"]);
  for (const name of await readdir(path.join(workspace, "work")).catch(() => [])) {
    if (WORK_KEEP.has(name)) continue;
    const rel = path.join("work", name);
    if (/^(build|publish|render|verify|crop|embed|run)[-_].*\.(mjs|py|sh)$/.test(name)) {
      add(AUTO, rel, "게이트를 거치지 않는 실행 스크립트");
    } else if (name === "tests") {
      add(AUTO, rel, "테스트는 단계 스킬 안으로 옮긴다");
    } else if (name === "gen") {
      add(CONFIRM, rel, "재생성 가능하나 비용이 크다");
    } else {
      add(CONFIRM, rel, "work/ 는 env.* 만 둔다. 확인 후 옮긴다");
    }
  }

  // A — 빈 스켈레톤.
  const authoring = path.join(workspace, ".detail-page", "authoring");
  if (await exists(authoring)) {
    const inner = await readdir(authoring).catch(() => []);
    if (inner.length === 0) add(AUTO, path.join(".detail-page", "authoring"), "빈 스켈레톤");
  }

  // A — 설치 대상에 남은, 원본에 없는 스킬 사본.
  for (const rel of [path.join(".claude", "skills"), path.join(".agents", "skills")]) {
    for (const name of await readdir(path.join(workspace, rel)).catch(() => [])) {
      if (name === "GENERATED.md") continue;
      if (!installedSkills.includes(name)) {
        add(AUTO, path.join(rel, name), "원본에 없는 사본");
      }
    }
  }

  // A — 호스트 홈 오염. 워크스페이스 밖이지만 같은 방식으로 옮긴다.
  for (const absolute of pollution) {
    add(AUTO, path.join("_host", path.basename(absolute)), "호스트 홈은 스킬을 두는 곳이 아니다", absolute);
  }

  // B — 재생성 비용이 크거나 발행물을 포함한다.
  for (const name of await readdir(path.join(workspace, "projects")).catch(() => [])) {
    add(CONFIRM, path.join("projects", name), "옛 회차. 발행물을 포함한다");
  }
  if (await exists(path.join(workspace, "motion", "out"))) {
    add(CONFIRM, path.join("motion", "out"), "재생성 가능하나 비용이 크다");
  }

  return entries.filter((entry) => !isProtected(entry.rel));
}

export function trashDir(workspace, stamp) {
  return path.join(workspace, ".trash", stamp);
}

/**
 * 옮긴다. 사용 중이면 건너뛰고 사유를 남긴다 — **프로세스를 죽이지 않는다.**
 * 2회차에 서버를 죽여 길을 연 전례가 있다.
 */
export async function moveToTrash({ workspace, entries, stamp }) {
  const base = trashDir(workspace, stamp);
  const moved = [];
  const skipped = [];
  for (const entry of entries) {
    const destination = path.join(base, entry.rel);
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await rename(entry.absolute, destination);
      moved.push(entry);
    } catch (error) {
      skipped.push({ ...entry, error: error.code ?? error.message });
    }
  }
  return { base, moved, skipped };
}
