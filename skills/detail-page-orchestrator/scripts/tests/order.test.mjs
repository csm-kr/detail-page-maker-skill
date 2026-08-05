// 순서 강제 — docs/ARCHITECTURE.md §11.1
//
// 이 파일이 이 재구성의 성공 기준이다. 그래서 엔진보다 먼저 쓴다.
// 종료 코드만 보지 않고 사유 코드까지 확인한다. 스크립트가 없어도 node 는 exit 1 을
// 내므로 코드만 검사하면 거짓 GREEN 이 된다.

import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  COUPANG_URL,
  SKILLS_ROOT,
  SUPPLIER_URL,
  makePollutedHome,
  makeProject,
  makeWorkspace,
  orchestrate,
  runStage,
} from "./fixture.mjs";

const startArgs = [
  "start",
  "--name",
  "테스트",
  "--supplier-url",
  SUPPLIER_URL,
  "--coupang-url",
  COUPANG_URL,
];

/** gates.json 을 lib 로 직접 통과 기록한다 (픽스처 전용). */
async function markPassed(workspace, project, gateIds) {
  const { loadState, recordPass, saveState } = await import(
    "../lib/gates-state.mjs"
  );
  const state = await loadState(project);
  for (const id of gateIds) {
    await recordPass(state, id, { project, workspace, host: "test" });
  }
  await saveState(project, state);
}

test("env.lock.json 없이 start 하면 거부한다", async () => {
  const ws = await makeWorkspace({ envLock: false });
  try {
    const { code, out } = orchestrate(startArgs, { workspace: ws.root });
    assert.equal(code, 1);
    assert.match(out, /ENV_LOCK_MISSING/);
    assert.match(out, /detail-page-init/);
  } finally {
    await ws.cleanup();
  }
});

test("호스트 홈에 detail-page 스킬이 있으면 start 를 거부한다", async () => {
  const ws = await makeWorkspace();
  const home = await makePollutedHome();
  try {
    const { code, out } = orchestrate(startArgs, {
      workspace: ws.root,
      env: { DETAIL_PAGE_HOME: home.home },
    });
    assert.equal(code, 1);
    assert.match(out, /HOST_POLLUTED/);
    assert.match(out, /detail-page-g4-mockup/);
  } finally {
    await home.cleanup();
    await ws.cleanup();
  }
});

test("init 이 막히는 것을 찾았으면 start 를 거부한다", async () => {
  const ws = await makeWorkspace({
    ready: false,
    blocked: ["ffmpeg 를 찾지 못했다 (모션 렌더)"],
  });
  try {
    const { code, out } = orchestrate(startArgs, { workspace: ws.root });
    assert.equal(code, 1);
    assert.match(out, /ENV_NOT_READY/);
    assert.match(out, /ffmpeg/);
  } finally {
    await ws.cleanup();
  }
});

test("policy.model_face 가 없으면 start 를 거부한다", async () => {
  const ws = await makeWorkspace({ modelFace: null });
  try {
    const { code, out } = orchestrate(startArgs, { workspace: ws.root });
    assert.equal(code, 1);
    assert.match(out, /MODEL_FACE_MISSING/);
  } finally {
    await ws.cleanup();
  }
});

test("설치 사본 해시가 어긋나면 start 를 거부한다", async () => {
  const ws = await makeWorkspace({ installOk: false });
  try {
    const { code, out } = orchestrate(startArgs, { workspace: ws.root });
    assert.equal(code, 1);
    assert.match(out, /INSTALL_HASH_MISMATCH/);
  } finally {
    await ws.cleanup();
  }
});

test("G2 미통과에서 g3-plan 을 직접 부르면 거부한다", async () => {
  const p = await makeProject();
  try {
    const { code, out } = runStage("detail-page-g3-plan", [], {
      workspace: p.root,
    });
    assert.equal(code, 1);
    assert.match(out, /GATE_BLOCKED/);
    assert.match(out, /G2/);
  } finally {
    await p.cleanup();
  }
});

test("G5 미통과에서 g6-stills 를 직접 부르면 거부한다", async () => {
  const p = await makeProject();
  try {
    const { code, out } = runStage("detail-page-g6-stills", [], {
      workspace: p.root,
    });
    assert.equal(code, 1);
    assert.match(out, /GATE_BLOCKED/);
    assert.match(out, /G5/);
  } finally {
    await p.cleanup();
  }
});

test("flow-map.md 를 고치면 G3 부터 하류가 무효화된다", async () => {
  const p = await makeProject();
  try {
    const flowMap = path.join(p.project, "work", "flow-map.md");
    await writeFile(flowMap, "# 기준작\n## 섹션 순서\n", "utf8");
    await markPassed(p.root, p.project, ["G0", "G1", "G2", "G3"]);

    await writeFile(flowMap, "# 기준작\n## 섹션 순서\n## 고객 질문\n", "utf8");

    const { out } = orchestrate(["gates"], { workspace: p.root });
    assert.match(out, /G3\s+\S*\s*STALE/);
    assert.doesNotMatch(out, /G2\s+\S*\s*STALE/);
  } finally {
    await p.cleanup();
  }
});

test("DESIGN-GUIDE.md 를 고치면 G5 부터 하류가 무효화된다", async () => {
  const p = await makeProject();
  try {
    const guide = path.join(
      p.project,
      "work",
      "design-ref",
      "DESIGN-GUIDE.md",
    );
    await mkdir(path.dirname(guide), { recursive: true });
    await writeFile(guide, "# 가이드\n#3189FD\n", "utf8");
    await markPassed(p.root, p.project, ["G0", "G1", "G2", "G3", "G4", "G5"]);

    await writeFile(guide, "# 가이드\n#0F2642\n", "utf8");

    const { out } = orchestrate(["gates"], { workspace: p.root });
    assert.match(out, /G5\s+\S*\s*STALE/);
    assert.doesNotMatch(out, /G4\s+\S*\s*STALE/);
  } finally {
    await p.cleanup();
  }
});

test("env.lock.json 이 바뀌면 G0 부터 전부 무효화된다", async () => {
  const p = await makeProject();
  try {
    await markPassed(p.root, p.project, ["G0", "G1"]);

    const lock = path.join(p.root, "work", "env.lock.json");
    const parsed = JSON.parse(await readFile(lock, "utf8"));
    parsed.policy.wallclock_target_min = 120;
    await writeFile(lock, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    const { out } = orchestrate(["gates"], { workspace: p.root });
    assert.match(out, /G0\s+\S*\s*STALE/);
    assert.match(out, /G1\s+\S*\s*STALE/);
  } finally {
    await p.cleanup();
  }
});

test("gates.json 이 없으면 gate --pass 를 거부한다", async () => {
  const ws = await makeWorkspace();
  try {
    const { code, out } = orchestrate(["gate", "G1", "--pass"], {
      workspace: ws.root,
    });
    assert.equal(code, 1);
    assert.match(out, /NOT_STARTED/);
  } finally {
    await ws.cleanup();
  }
});

test("--start 없이 --pass 하면 거부한다", async () => {
  const p = await makeProject();
  try {
    const { code, out } = orchestrate(["gate", "G1", "--pass"], {
      workspace: p.root,
    });
    assert.equal(code, 1);
    assert.match(out, /NOT_TIMED/);
  } finally {
    await p.cleanup();
  }
});

test("--pass 는 언제나 check 를 다시 돌린다", async () => {
  const p = await makeProject();
  try {
    orchestrate(["gate", "G1", "--start"], { workspace: p.root });
    const { code, out } = orchestrate(["gate", "G1", "--pass"], {
      workspace: p.root,
    });
    // SSOT.md 가 없으므로 검사가 실패해야 한다. 검사를 건너뛰면 통과해 버린다.
    assert.equal(code, 1);
    assert.match(out, /CHECK_FAILED/);

    const state = JSON.parse(
      await readFile(path.join(p.project, "work", "gates.json"), "utf8"),
    );
    assert.notEqual(state.gates.G1.status, "passed");
  } finally {
    await p.cleanup();
  }
});

test("판단이 필요한 게이트에서 run 은 스킬 이름을 알려주고 멈춘다", async () => {
  const p = await makeProject();
  try {
    const { code, out } = orchestrate(["run"], { workspace: p.root });
    assert.equal(code, 0);
    assert.match(out, /AGENT_GATE_STOP/);
    assert.match(out, /detail-page-g1-fact/);

    // 판단 지점을 넘어선 산출물이 없어야 한다.
    const work = await readdir(path.join(p.project, "work"));
    assert.ok(!work.includes("SSOT.md"));
    assert.ok(!work.includes("flow-map.md"));
  } finally {
    await p.cleanup();
  }
});

test("✗ 가 남아 있으면 report 는 완료를 선언하지 않는다", async () => {
  const p = await makeProject();
  try {
    const { code, out } = orchestrate(["report"], { workspace: p.root });
    assert.equal(code, 1);
    assert.match(out, /REPORT_INCOMPLETE/);
    assert.doesNotMatch(out, /완료/);
  } finally {
    await p.cleanup();
  }
});

test("게이트 순서 목록이 gates.mjs 밖에 존재하지 않는다", async () => {
  // 자기 선행을 적는 것(예: "선행 G1, G2" 와 자기 "G3")은 목록이 아니다.
  // 연속하는 네 개가 문서에 나타난 순서대로 오르면 그것은 순서 목록이다.
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(md|mjs)$/.test(entry.name)) continue;
      if (entry.name === "gates.mjs") continue;
      // 테스트는 게이트 id 를 이름으로 부를 수밖에 없다. 검사 대상은 문서와 구현이다.
      if (dir.split(path.sep).includes("tests")) continue;
      const text = await readFile(full, "utf8");
      const seen = [...text.matchAll(/\bG(\d{1,2})\b/g)].map((m) => Number(m[1]));
      let run = 1;
      for (let i = 1; i < seen.length; i += 1) {
        run = seen[i] === seen[i - 1] + 1 ? run + 1 : 1;
        if (run >= 4) {
          offenders.push(path.relative(SKILLS_ROOT, full));
          break;
        }
      }
    }
  };
  await walk(SKILLS_ROOT);

  assert.deepEqual(offenders, []);
});
