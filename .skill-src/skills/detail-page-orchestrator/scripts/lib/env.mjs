// env.lock.json 확인. init 없이 제작을 시작할 수 없게 만드는 곳이다.

import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { exists, hashTree } from "./hashchain.mjs";
import { resolveWorkspace } from "./project.mjs";

export class Refusal extends Error {
  constructor(code, message, detail = null) {
    super(`${code} ${message}`);
    this.name = "Refusal";
    this.code = code;
    this.detail = detail;
  }
}

export function envLockPath(workspace = resolveWorkspace()) {
  return path.join(workspace, "work", "env.lock.json");
}

export async function readEnvLock(workspace = resolveWorkspace()) {
  try {
    return JSON.parse(await readFile(envLockPath(workspace), "utf8"));
  } catch {
    return null;
  }
}

/**
 * 호스트 홈 오염. 스킬은 프로젝트-로컬에만 둔다는 방침을 게이트로 만든다.
 *
 * DETAIL_PAGE_HOME 은 검사 위치를 **늘리기만** 한다. 진짜 홈은 언제나 검사하므로
 * 이 변수로 오염을 숨길 수 없다.
 */
export async function findHostPollution() {
  const homes = [homedir()];
  if (process.env.DETAIL_PAGE_HOME) homes.push(process.env.DETAIL_PAGE_HOME);

  const found = [];
  for (const home of homes) {
    for (const rel of [
      path.join(".claude", "skills"),
      path.join(".agents", "skills"),
      path.join(".codex", "skills"),
    ]) {
      const dir = path.join(home, rel);
      let entries = [];
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (!name.startsWith("detail-page")) continue;
        found.push(path.join(dir, name));
      }
    }
  }
  return found;
}

/**
 * 제작을 시작할 수 있는 상태인지. 하나라도 어긋나면 Refusal 을 던진다.
 * 우회 플래그는 없다 — 게이트가 틀렸으면 게이트를 고친다.
 */
export async function requireEnv(workspace = resolveWorkspace()) {
  const lock = await readEnvLock(workspace);
  if (!lock) {
    throw new Refusal(
      "ENV_LOCK_MISSING",
      "work/env.lock.json 이 없다. detail-page-init 을 먼저 실행한다.",
    );
  }

  // init 이 막히는 것을 찾았으면 제작을 시작하지 않는다. 앞에서 막는다는 것이 이 뜻이다.
  if (lock.ready === false) {
    throw new Refusal(
      "ENV_NOT_READY",
      `환경이 준비되지 않았다. detail-page-init 이 찾은 것:\n  ${(lock.blocked ?? []).join("\n  ")}`,
      lock.blocked ?? [],
    );
  }

  if (!lock.policy?.model_face) {
    throw new Refusal(
      "MODEL_FACE_MISSING",
      "policy.model_face 가 없다. detail-page-init 의 인터뷰에서 얼굴 정책을 답한다 (none / crop-below-chin / allow).",
    );
  }

  const polluted = await findHostPollution();
  if (polluted.length > 0) {
    throw new Refusal(
      "HOST_POLLUTED",
      `호스트 홈에 detail-page 스킬이 있다. detail-page-init --prune 으로 치운다:\n  ${polluted.join("\n  ")}`,
      polluted,
    );
  }

  await requireInstallIntact(workspace, lock);
  return lock;
}

/** 잠금에 적힌 경로가 워크스페이스 안인가. 호스트 의존을 끊었다는 것이 여기서 고정된다. */
function insideWorkspace(workspace, spec) {
  if (path.isAbsolute(spec)) return false;
  const rel = path.relative(workspace, path.resolve(workspace, spec));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * 잠금에 적힌 것이 지금도 사실인지. `doctor` 가 쓴다.
 *
 * 잠금을 그대로 출력하는 것은 진단이 아니다. init 이 세팅한 것은 그 뒤에 사라질 수 있고
 * (폰트를 지웠다, motion/ 을 비웠다, 다른 기계에서 clone 했다) 그때 ○ 를 출력하면
 * 제작 도중에야 발견한다.
 *
 * **파일로 확인되는 것만 거부 사유로 쓴다.** ffmpeg·python 은 init 이 탐지해 `ready` 에
 * 반영하고, CDP 는 제작할 때 띄우는 것이라 진단이 그것으로 막으면 doctor 를 부를 때마다
 * 브라우저가 필요해진다.
 */
export async function checkRuntimes(workspace, lock) {
  const problems = [];

  const declared = [
    ["폰트", lock.runtimes?.font],
    ["hyperframes", lock.runtimes?.hyperframes?.path],
    ["설치 원본", lock.install?.source],
    ...Object.entries(lock.install?.targets ?? {}),
    ["프로젝트 루트", lock.policy?.project_root],
  ].filter(([, spec]) => typeof spec === "string" && spec.length > 0);

  for (const [label, spec] of declared) {
    if (!insideWorkspace(workspace, spec)) {
      problems.push({ code: "PATH_OUTSIDE_WORKSPACE", line: `${label} ${spec}` });
    }
  }
  // 경로가 밖이면 존재 검사는 뜻이 없다. 고칠 곳이 잠금이라는 것만 알리고 끝낸다.
  if (problems.length > 0) return problems;

  const font = lock.runtimes?.font;
  if (font && !(await exists(path.join(workspace, font)))) {
    problems.push({ code: "RUNTIME_MISSING", line: `폰트 ${font}` });
  }

  const hyper = lock.runtimes?.hyperframes;
  if (hyper?.mode === "project-local" && hyper.path) {
    const rel = path.join(hyper.path, "node_modules", "hyperframes");
    if (!(await exists(path.join(workspace, rel)))) {
      problems.push({ code: "RUNTIME_MISSING", line: `hyperframes ${rel}` });
    }
  }

  // 메이저만 본다. 패치까지 묶으면 node 를 올릴 때마다 제작이 막힌다.
  const recorded = lock.runtimes?.node;
  if (recorded && recorded.split(".")[0] !== process.versions.node.split(".")[0]) {
    problems.push({
      code: "RUNTIME_DRIFT",
      line: `node 기록 ${recorded} · 실측 ${process.versions.node} — detail-page-init --recheck`,
    });
  }

  return problems;
}

/**
 * 설치가 온전한지. 모드에 따라 비교 대상이 다르다.
 *
 * junction  사본이 아니라 원본 그 자체다. 저장된 해시 스냅샷과 비교하면 스킬을 고치는
 *           순간 제작이 막혀 junction 의 장점이 차단 사유가 된다. **원본과 비교한다.**
 * copy      사본이 낡았는지 봐야 하므로 **저장된 해시와 비교한다.**
 */
async function requireInstallIntact(workspace, lock) {
  const targets = Object.values(lock.install?.targets ?? {});
  if (targets.length === 0) return;

  if (lock.install?.mode === "junction") {
    // **스킬 단위로** 비교한다. 디렉터리를 통째로 비교하면 설치가 남기는
    // GENERATED.md 같은 표지 때문에 언제나 어긋난다.
    const source = path.join(workspace, lock.install.source ?? ".skill-src/skills");
    const names = lock.install.skills_list ?? [];
    for (const target of targets) {
      for (const name of names) {
        const expected = await hashTree(path.join(source, name));
        const actual = await hashTree(path.join(workspace, target, name));
        if (actual !== expected) {
          throw new Refusal(
            "INSTALL_HASH_MISMATCH",
            `연결된 사본이 원본과 다르다: ${name}\n  원본 ${path.relative(workspace, source)}\n  사본 ${target}\n  detail-page-init 을 다시 실행한다.`,
          );
        }
      }
    }
    return;
  }

  const actual = await hashTree(path.join(workspace, targets[0]));
  if (lock.install?.sha256 && lock.install.sha256 !== actual) {
    throw new Refusal(
      "INSTALL_HASH_MISMATCH",
      `설치 사본이 잠금과 다르다. detail-page-init 을 다시 실행해 맞춘다.\n  기록 ${lock.install.sha256}\n  실제 ${actual}`,
    );
  }
}
