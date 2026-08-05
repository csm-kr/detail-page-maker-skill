// 설치. 원본은 한 벌이고 두 호스트 경로는 연결이다 — docs/adr/0003
//
// junction 을 먼저 시도하고, 호스트가 인식하지 못하면 복사로 폴백한다.
// 두 호스트의 스킬 탐색이 junction 을 따르는지는 미검증이므로 폴백을 정상 경로로 둔다.

import { cp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const HOST_DIRS = {
  "claude-code": path.join(".claude", "skills"),
  codex: path.join(".agents", "skills"),
};

const GENERATED_NOTE = `# 생성물

이 디렉터리는 \`detail-page-init\` 이 만든다. **여기를 고치지 않는다.**
원본은 \`.skill-src/skills\` 이고 다음 init 에서 덮어써진다.
`;

async function skillNames(source) {
  const entries = await readdir(source, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("detail-page"))
    .map((entry) => entry.name)
    .sort();
}

/** Windows junction. 관리자 권한이 필요 없다. */
async function junction(target, link) {
  await symlink(target, link, "junction");
}

/** 연결이 실제로 읽히는지 확인한다. 만들어졌다고 인식되는 것은 아니다. */
async function readable(link) {
  try {
    const entries = await readdir(link);
    return entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * 두 호스트 경로에만 설치한다. 홈에는 아무것도 쓰지 않는다.
 * linker 를 주입할 수 있게 열어 둔 것은 폴백을 테스트하기 위한 것이다.
 */
export async function installSkills({
  workspace,
  source,
  hosts,
  mode = "auto",
  linker = junction,
}) {
  const names = await skillNames(source);
  if (names.length === 0) throw new Error(`INSTALL_SOURCE_EMPTY ${source}`);

  const targets = {};
  let used = mode === "copy" ? "copy" : "junction";

  for (const host of hosts) {
    const rel = HOST_DIRS[host];
    if (!rel) throw new Error(`UNKNOWN_HOST ${host}`);
    const dir = path.join(workspace, rel);
    await mkdir(dir, { recursive: true });
    targets[host] = rel.split(path.sep).join("/");

    for (const name of names) {
      const link = path.join(dir, name);
      const realSource = path.join(source, name);
      await rm(link, { recursive: true, force: true });

      if (used === "junction") {
        try {
          await linker(realSource, link);
          if (!(await readable(link))) throw new Error("연결이 읽히지 않는다");
        } catch {
          used = "copy";
        }
      }
      if (used === "copy") {
        await rm(link, { recursive: true, force: true });
        await cp(realSource, link, { recursive: true });
      }
    }
    await writeFile(path.join(dir, "GENERATED.md"), GENERATED_NOTE, "utf8");
  }

  // 한 호스트에서 폴백했으면 양쪽을 같은 모드로 맞춘다. 사본이 갈리면 해시가 어긋난다.
  if (used === "copy" && mode !== "copy") {
    return installSkills({ workspace, source, hosts, mode: "copy", linker });
  }

  return { mode: used, skills: names, targets };
}
