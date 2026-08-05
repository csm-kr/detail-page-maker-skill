// 워크스페이스와 프로젝트 경로 해석. 절대 경로 리터럴도, 프로젝트 이름 리터럴도 두지 않는다.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 이 스킬 트리의 뿌리. 형제 스킬을 찾을 때 쓴다. */
export const SKILLS_ROOT = path.resolve(HERE, "..", "..", "..");

function isDir(target) {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function hasMarker(dir) {
  return (
    isDir(path.join(dir, ".skill-src")) ||
    isDir(path.join(dir, ".claude", "skills")) ||
    isDir(path.join(dir, ".agents", "skills"))
  );
}

/**
 * 워크스페이스 루트.
 *   1. DETAIL_PAGE_WORKSPACE
 *   2. cwd 에서 위로
 *   3. 스킬 위치에서 위로 (스킬은 워크스페이스 안에 설치된다)
 */
export function resolveWorkspace() {
  if (process.env.DETAIL_PAGE_WORKSPACE) {
    return path.resolve(process.env.DETAIL_PAGE_WORKSPACE);
  }
  for (const start of [process.cwd(), SKILLS_ROOT]) {
    let current = path.resolve(start);
    while (true) {
      if (hasMarker(current)) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw new Error(
    "WORKSPACE_NOT_FOUND 워크스페이스를 찾지 못했다. DETAIL_PAGE_WORKSPACE 를 지정한다.",
  );
}

export function projectsRoot(workspace = resolveWorkspace()) {
  return path.join(workspace, "projects");
}

/**
 * 프로젝트 경로. 여러 개면 DETAIL_PAGE_PROJECT 로 고른다.
 * 이름을 기본값으로 박아 두면 다음 회차에 조용히 옛 프로젝트를 빌드한다.
 */
export function activePath(workspace = resolveWorkspace()) {
  return path.join(workspace, "work", "active.json");
}

/** start 가 기록한 활성 프로젝트. 옛 회차를 남겨 둬도 명령마다 고르지 않아도 된다. */
function readActive(workspace) {
  try {
    const parsed = JSON.parse(readFileSync(activePath(workspace), "utf8"));
    const dir = path.join(projectsRoot(workspace), parsed.project);
    return isDir(dir) ? dir : null;
  } catch {
    return null;
  }
}

export function resolveProject(workspace = resolveWorkspace()) {
  const base = projectsRoot(workspace);
  if (process.env.DETAIL_PAGE_PROJECT) {
    return path.join(base, process.env.DETAIL_PAGE_PROJECT);
  }
  const active = readActive(workspace);
  if (active) return active;

  let dirs = [];
  try {
    dirs = readdirSync(base).filter((name) => isDir(path.join(base, name)));
  } catch {
    throw new Error(`NOT_STARTED projects/ 가 없다. start 를 먼저 한다.`);
  }
  if (dirs.length === 0) {
    throw new Error("NOT_STARTED 프로젝트가 없다. start 를 먼저 한다.");
  }
  if (dirs.length > 1) {
    throw new Error(
      `AMBIGUOUS_PROJECT 프로젝트가 ${dirs.length}개다. DETAIL_PAGE_PROJECT 로 고른다: ${dirs.join(", ")}`,
    );
  }
  return path.join(base, dirs[0]);
}

/** 게이트가 선언한 경로를 실제 경로로. "ws:" 는 워크스페이스 기준이다. */
export function resolveArtifact(spec, { workspace, project }) {
  if (spec.startsWith("ws:")) return path.join(workspace, spec.slice(3));
  return path.join(project, spec);
}
