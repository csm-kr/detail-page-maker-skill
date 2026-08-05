// doctor — 잠금에 적힌 것이 지금도 사실인지 본다.
//
// 잠금을 그대로 출력하는 것은 진단이 아니다. init 이 세팅한 것은 그 뒤에 사라질 수 있고
// (폰트를 지웠다, motion/ 을 비웠다, 다른 기계에서 clone 했다) 그때 doctor 가 ○ 를
// 출력하면 제작 도중에야 발견한다. **기록과 실측을 대조한다.**
//
// CDP 는 다르다. 브라우저는 제작할 때 띄우는 것이라 doctor 가 그것으로 막으면
// 진단할 때마다 브라우저를 띄워야 한다. 파일로 확인되는 것만 거부 사유로 쓴다.

import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { makeWorkspace, orchestrate } from "./fixture.mjs";

test("기록된 폰트가 실제로 없으면 거부한다", async () => {
  const ws = await makeWorkspace({ font: false });
  try {
    const result = orchestrate(["doctor"], { workspace: ws.root });
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /RUNTIME_MISSING/);
    assert.match(result.out, /NotoSansKR-VF\.ttf/);
  } finally {
    await ws.cleanup();
  }
});

test("hyperframes 로컬 런타임이 없으면 거부한다", async () => {
  const ws = await makeWorkspace({ motion: false });
  try {
    const result = orchestrate(["doctor"], { workspace: ws.root });
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /RUNTIME_MISSING/);
    assert.match(result.out, /motion/);
  } finally {
    await ws.cleanup();
  }
});

test("잠금의 경로가 워크스페이스 밖을 가리키면 거부한다", async () => {
  // 호스트 의존을 끊었다는 것이 이 검사로 고정된다. 폰트가 시스템 폰트를 가리키면
  // 다른 기계에서 같은 결과가 나오지 않는다.
  const outside = path.join(path.parse(process.cwd()).root, "Windows", "Fonts", "malgun.ttf");
  const ws = await makeWorkspace({ fontPath: outside });
  try {
    const result = orchestrate(["doctor"], { workspace: ws.root });
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /PATH_OUTSIDE_WORKSPACE/);
  } finally {
    await ws.cleanup();
  }
});

test("상위로 빠져나가는 상대 경로도 워크스페이스 밖이다", async () => {
  const ws = await makeWorkspace({ fontPath: "../shared/fonts/NotoSansKR-VF.ttf" });
  try {
    const result = orchestrate(["doctor"], { workspace: ws.root });
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /PATH_OUTSIDE_WORKSPACE/);
  } finally {
    await ws.cleanup();
  }
});

test("실측 node 메이저가 기록과 다르면 거부한다", async () => {
  const ws = await makeWorkspace({ nodeVersion: "18.0.0" });
  try {
    const result = orchestrate(["doctor"], { workspace: ws.root });
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /RUNTIME_DRIFT/);
    assert.match(result.out, /18\.0\.0/);
    assert.match(result.out, new RegExp(process.versions.node.replace(/\./g, "\\.")));
  } finally {
    await ws.cleanup();
  }
});

test("패치 버전 차이만으로는 거부하지 않는다", async () => {
  // 메이저가 같으면 같은 런타임이다. 패치까지 묶으면 node 를 올릴 때마다 제작이 막힌다.
  const [major] = process.versions.node.split(".");
  const ws = await makeWorkspace({ nodeVersion: `${major}.0.0` });
  try {
    const result = orchestrate(["doctor"], { workspace: ws.root });
    assert.equal(result.code, 0, result.out);
  } finally {
    await ws.cleanup();
  }
});

test("파일로 확인되는 것이 전부 성하면 통과한다 — CDP 응답은 요구하지 않는다", async () => {
  // 픽스처의 CDP(9223)는 떠 있지 않다. 그래도 통과해야 한다.
  const ws = await makeWorkspace();
  try {
    const result = orchestrate(["doctor"], { workspace: ws.root });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, new RegExp(process.versions.node.replace(/\./g, "\\.")));
  } finally {
    await ws.cleanup();
  }
});

test("폰트를 지우면 통과하던 워크스페이스가 거부로 바뀐다", async () => {
  // 잠금은 그대로인데 실측만 달라지는 경우. 잠금을 출력만 하면 이것을 못 잡는다.
  const ws = await makeWorkspace();
  try {
    assert.equal(orchestrate(["doctor"], { workspace: ws.root }).code, 0);
    await rm(path.join(ws.root, "runtime"), { recursive: true, force: true });
    const after = orchestrate(["doctor"], { workspace: ws.root });
    assert.equal(after.code, 1, after.out);
    assert.match(after.out, /RUNTIME_MISSING/);
  } finally {
    await ws.cleanup();
  }
});
