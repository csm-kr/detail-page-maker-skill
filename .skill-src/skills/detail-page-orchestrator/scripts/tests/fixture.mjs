// 테스트 픽스처. 임시 워크스페이스를 만들고 CLI 를 돌린다.
//
// 픽스처는 gates.json 을 lib 의 기록 함수로 직접 만든다. "검사를 다시 돌린 뒤에만
// 통과 기록을 쓴다"는 규칙은 CLI 의 --pass 가 지키는 것이고, lib 는 기록 도구다.
// 그 분리가 있어야 픽스처가 우회 경로가 되지 않는다.

import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
 *   font       false 면 기록된 폰트 파일을 만들지 않는다
 *   motion     false 면 hyperframes 로컬 런타임을 만들지 않는다
 *   fontPath   기록할 폰트 경로. 워크스페이스 밖을 가리키게 할 때 쓴다
 *   nodeVersion 기록할 node 버전. 실측과 어긋나게 할 때 쓴다
 */
export async function makeWorkspace(options = {}) {
  const {
    envLock = true,
    modelFace = "crop-below-chin",
    installOk = true,
    installMode = "copy",
    font = true,
    motion = true,
    fontPath = "runtime/fonts/NotoSansKR-VF.ttf",
    nodeVersion = process.versions.node,
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

  // init 이 세팅하는 로컬 런타임. doctor 가 잠금과 대조하는 대상이다.
  if (font && !path.isAbsolute(fontPath)) {
    await mkdir(path.dirname(path.join(root, fontPath)), { recursive: true });
    await writeFile(path.join(root, fontPath), "폰트 자리\n", "utf8");
  }
  if (motion) {
    // 빈 디렉터리는 런타임이 아니다. 실제로 해석되는 자리까지 만든다.
    const vendored = path.join(root, "motion", "node_modules", "hyperframes");
    await mkdir(vendored, { recursive: true });
    await writeFile(
      path.join(vendored, "package.json"),
      `${JSON.stringify({ name: "hyperframes", version: "0.7.90" }, null, 2)}\n`,
      "utf8",
    );
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
            node: nodeVersion,
            python: "python",
            ffmpeg: "7.1",
            hyperframes: { mode: "project-local", path: "motion/", pin: "0.7.90" },
            font: fontPath,
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

/**
 * 단계 스킬의 `check.mjs` 를 직접 부르기 위한 최소 구조. `start` 를 돌리지 않는다 —
 * 판정만 보는 테스트가 게이트 엔진 전체에 묶이면 무엇이 깨졌는지 흐려진다.
 *
 * `write` 는 산출물을 놓는다. 문자열은 그대로, 객체는 JSON 으로 쓴다.
 */
export async function makeCheckbed(options = {}) {
  const ws = await makeWorkspace(options);
  const project = path.join(ws.root, "projects", "판정대상");
  for (const dir of [
    "work",
    path.join("input", "photos"),
    path.join("output", "media"),
  ]) {
    await mkdir(path.join(project, dir), { recursive: true });
  }

  const write = async (rel, content) => {
    const full = path.join(project, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(
      full,
      typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`,
      "utf8",
    );
    return full;
  };

  return { ...ws, project, write, ctx: { workspace: ws.root, project } };
}

/** 잠긴 정책을 바꾼다. 예산·포맷처럼 인터뷰가 정한 값에 따라 판정이 갈리는 곳에 쓴다. */
export async function patchPolicy(root, patch) {
  const file = path.join(root, "work", "env.lock.json");
  const lock = JSON.parse(await readFile(file, "utf8"));
  lock.policy = { ...lock.policy, ...patch };
  await writeFile(file, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

/** `start` 가 만드는 모양의 inputs.lock.json. 테스트가 필요한 곳만 덮어쓴다. */
export function inputsLock(overrides = {}) {
  return {
    supplier_url: SUPPLIER_URL,
    coupang_url: COUPANG_URL,
    photos: { count: 3, files: [] },
    captures: {},
    ...overrides,
  };
}

/** 수집 스크립트가 남기는 모양의 캡처 항목. `by` 를 빼면 손으로 놓은 것이다. */
export function capture(url, { daysAgo = 0, by = "capture" } = {}) {
  return {
    sha256: `sha256:${"a".repeat(64)}`,
    locked_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    url,
    by,
  };
}

/** 오염된 가짜 홈. DETAIL_PAGE_HOME 은 검사 위치를 늘리기만 한다. */
export async function makePollutedHome() {
  const home = await mkdtemp(path.join(tmpdir(), "dp-home-"));
  const dir = path.join(home, ".claude", "skills", "detail-page-g4-mockup");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), "# 호스트에 깔린 스킬\n", "utf8");
  return { home, cleanup: () => rm(home, { recursive: true, force: true }) };
}
