import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 산출물 폴더 규약 — 단일 정본.
 *
 * 1. 산출물은 프로젝트 폴더 하나에만 쌓인다.
 * 2. 워크스페이스 루트에는 `projects/` 외의 폴더를 만들지 않는다.
 * 3. 스킬 설치 폴더 안에는 어떤 산출물도 쓰지 않는다.
 * 4. 워크스페이스는 스킬 설치 위치로 결정하므로 cwd·실행 횟수와 무관하게 같은 경로가 나온다.
 */

const DEFAULT_SKILL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const AGENT_DIRECTORIES = new Set([".agents", ".claude"]);
const WORKSPACE_CONFIG_RELATIVE_PATH = path.join("config", "workspace.json");

/**
 * 설치된 스킬 위치에서 워크스페이스 루트를 결정한다.
 *
 * `<workspace>/.agents/skills/<skill>` 와 `<workspace>/.claude/skills/<skill>` 설치본,
 * 그리고 개발 저장소의 `<repo>/skills/<skill>` 배치를 모두 같은 규칙으로 푼다.
 * cwd를 위로 훑지 않으므로 어느 폴더에서 실행하든 결과가 같다.
 */
export function resolveWorkspaceRoot({
  skillRoot = DEFAULT_SKILL_ROOT,
  environment = process.env,
} = {}) {
  if (environment?.DETAIL_PAGE_WORKSPACE_ROOT) {
    return path.resolve(environment.DETAIL_PAGE_WORKSPACE_ROOT);
  }
  const skill = path.resolve(skillRoot);
  const skillsDirectory = path.dirname(skill);
  if (path.basename(skillsDirectory) === "skills") {
    const container = path.dirname(skillsDirectory);
    return AGENT_DIRECTORIES.has(path.basename(container))
      ? path.dirname(container)
      : container;
  }
  return path.dirname(skill);
}

function configuredProjectsRoot(workspaceRoot) {
  const configPath = path.join(workspaceRoot, WORKSPACE_CONFIG_RELATIVE_PATH);
  if (!existsSync(configPath)) return null;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (config?.schemaVersion !== 1 || !config?.projectsRoot) return null;
    return path.resolve(workspaceRoot, config.projectsRoot);
  } catch {
    return null;
  }
}

/**
 * 프로젝트가 생기는 유일한 루트. 워크스페이스 밖(홈 디렉터리 등)으로 떨어지지 않는다.
 */
export function resolveProjectsRoot({
  skillRoot = DEFAULT_SKILL_ROOT,
  environment = process.env,
} = {}) {
  if (environment?.DETAIL_PAGE_PROJECTS_ROOT) {
    return path.resolve(environment.DETAIL_PAGE_PROJECTS_ROOT);
  }
  const workspaceRoot = resolveWorkspaceRoot({ skillRoot, environment });
  return configuredProjectsRoot(workspaceRoot)
    ?? path.join(workspaceRoot, "projects");
}

/**
 * 프로젝트가 소유하는 산출 경로 전체. 여기에 없는 위치에는 쓰지 않는다.
 */
export function resolveOutputLocations({ projectRoot }) {
  if (!String(projectRoot || "").trim()) {
    throw new Error("projectRoot가 필요합니다.");
  }
  const root = path.resolve(projectRoot);
  const detailPage = path.join(root, ".detail-page");
  const learning = path.join(detailPage, "learning");
  return {
    inputProduct: path.join(root, "input", "product"),
    output: path.join(root, "output"),
    outputMedia: path.join(root, "output", "media"),
    outputWing: path.join(root, "output", "wing"),
    detailPage,
    authoring: path.join(detailPage, "authoring"),
    backups: path.join(detailPage, "backups"),
    evidence: path.join(detailPage, "evidence"),
    generation: path.join(detailPage, "generation"),
    planning: path.join(detailPage, "planning"),
    qa: path.join(detailPage, "qa"),
    research: path.join(detailPage, "research"),
    workflow: path.join(detailPage, "workflow"),
    experienceDrop: path.join(detailPage, "exps"),
    learning,
    learningPromotions: path.join(learning, "exps", "promotions"),
    learningQuarantine: path.join(learning, "exps", "quarantine"),
    learningRuns: path.join(learning, "runs"),
  };
}

/**
 * 주어진 경로가 프로젝트 안인지 검사한다. 규약 위반을 fail-closed로 잡는 데 쓴다.
 */
export function isInsideProject(projectRoot, target) {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(target);
  return resolved === root || resolved.startsWith(root + path.sep);
}
