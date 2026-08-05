// 테스트 픽스처. 임시 워크스페이스를 만들고 CLI 를 돌린다.
//
// 픽스처는 gates.json 을 lib 의 기록 함수로 직접 만든다. "검사를 다시 돌린 뒤에만
// 통과 기록을 쓴다"는 규칙은 CLI 의 --pass 가 지키는 것이고, lib 는 기록 도구다.
// 그 분리가 있어야 픽스처가 우회 경로가 되지 않는다.

import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ORCHESTRATE = path.resolve(HERE, "..", "orchestrate.mjs");
export const SKILLS_ROOT = path.resolve(HERE, "..", "..", "..");

export const SUPPLIER_URL = "https://domeggook.com/example-12345";
export const COUPANG_URL = "https://www.coupang.com/vp/products/example";

/** 오케스트레이터 CLI 실행. 종료 코드와 합친 출력을 준다. */
export function orchestrate(args, { workspace, env = {} } = {}) {
  const result = spawnSync(process.execPath, [ORCHESTRATE, ...args], {
    encoding: "utf8",
    env: { ...process.env, DETAIL_PAGE_WORKSPACE: workspace, ...env },
  });
  return {
    code: result.status,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/** 단계 스킬 run.mjs 실행. 선행 게이트 거부를 확인하는 데 쓴다. */
export function runStage(skill, args = [], { workspace, env = {} } = {}) {
  const entry = path.join(SKILLS_ROOT, skill, "scripts", "run.mjs");
  const result = spawnSync(process.execPath, [entry, ...args], {
    encoding: "utf8",
    env: { ...process.env, DETAIL_PAGE_WORKSPACE: workspace, ...env },
  });
  return {
    code: result.status,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/**
 * 임시 워크스페이스.
 *   envLock    false 면 env.lock.json 을 쓰지 않는다
 *   modelFace  null 이면 policy.model_face 를 비운다
 *   installOk  false 면 설치 해시를 어긋나게 만든다
 */
export async function makeWorkspace(options = {}) {
  const {
    envLock = true,
    modelFace = "crop-below-chin",
    installOk = true,
    installMode = "copy",
  } = options;

  const root = await mkdtemp(path.join(tmpdir(), "dp-ws-"));
  for (const dir of [
    "work",
    "data",
    "projects",
    path.join(".claude", "skills"),
    path.join(".agents", "skills"),
  ]) {
    await mkdir(path.join(root, dir), { recursive: true });
  }

  // 원본 한 벌 + 두 호스트 경로. 해시가 내용에서 나오므로 파일 하나로 충분하다.
  const installed = ["detail-page-orchestrator", "detail-page-g1-fact"];
  const source = path.join(root, ".skill-src", "skills");
  for (const skill of installed) {
    const dir = path.join(source, skill);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "SKILL.md"), `# ${skill}\n`, "utf8");
  }
  for (const host of [".claude", ".agents"]) {
    const hostDir = path.join(root, host, "skills");
    await mkdir(hostDir, { recursive: true });
    for (const skill of installed) {
      const link = path.join(hostDir, skill);
      if (installMode === "junction") {
        await symlink(path.join(source, skill), link, "junction");
      } else {
        await cp(path.join(source, skill), link, { recursive: true });
      }
    }
    // 실제 install 이 남기는 표지. 원본에는 없다 — 픽스처가 이걸 빼면
    // "사본과 원본을 통째로 비교" 하는 버그를 테스트가 놓친다.
    await writeFile(path.join(hostDir, "GENERATED.md"), "# 생성물\n", "utf8");
  }

  if (envLock) {
    const { hashTree } = await import("../lib/hashchain.mjs");
    const real = await hashTree(path.join(root, ".claude", "skills"));
    const policy = {
      host_install: "forbidden",
      project_root: "./projects",
      media_budget_mb: 12,
      photo_format: "webp-q85",
      capture_max_age_days: 7,
      wallclock_target_min: 95,
    };
    if (modelFace !== null) policy.model_face = modelFace;

    await writeFile(
      path.join(root, "work", "env.lock.json"),
      `${JSON.stringify(
        {
          schema_version: "1.0",
          initialized_at: "2026-08-05T00:00:00.000Z",
          ready: options.ready ?? true,
          blocked: options.blocked ?? [],
          hosts: ["claude-code", "codex"],
          install: {
            mode: installMode,
            source: ".skill-src/skills",
            targets: {
              "claude-code": ".claude/skills",
              codex: ".agents/skills",
            },
            skills: installed.length,
            skills_list: installed,
            sha256: installOk ? real : `sha256:${"0".repeat(64)}`,
          },
          runtimes: {
            node: process.versions.node,
            python: "python",
            ffmpeg: "7.1",
            hyperframes: { mode: "project-local", path: "motion/", pin: "0.7.90" },
            font: "runtime/fonts/NotoSansKR-VF.ttf",
          },
          browser: { cdp: "http://127.0.0.1:9223", chatgpt_login: true },
          auth: { god_tibo: { present: true, verified: "dry-run-ok" } },
          policy,
          relaxations: [],
          host_dirs_clean: true,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/** start 까지 끝낸 워크스페이스. 프로젝트 경로를 함께 준다. */
export async function makeProject(options = {}) {
  const ws = await makeWorkspace(options);
  const started = orchestrate(
    [
      "start",
      "--name",
      "테스트",
      "--supplier-url",
      SUPPLIER_URL,
      "--coupang-url",
      COUPANG_URL,
    ],
    { workspace: ws.root },
  );
  const { resolveProject } = await import("../lib/project.mjs");
  return { ...ws, started, project: resolveProject(ws.root) };
}

/** 오염된 가짜 홈. DETAIL_PAGE_HOME 은 검사 위치를 늘리기만 한다. */
export async function makePollutedHome() {
  const home = await mkdtemp(path.join(tmpdir(), "dp-home-"));
  const dir = path.join(home, ".claude", "skills", "detail-page-g4-mockup");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), "# 호스트에 깔린 스킬\n", "utf8");
  return { home, cleanup: () => rm(home, { recursive: true, force: true }) };
}
