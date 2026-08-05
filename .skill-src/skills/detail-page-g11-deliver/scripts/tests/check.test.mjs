// G11 판정 단위 테스트.
//
// 2회차 결함: studio PID 7312 를 죽인 채 복구하지 않았고, Wing 산출물이 없는데
// "완료" 라고 보고했다. 말이 아니라 **파일의 존재**로 검사할 수 있는 것은 그렇게 한다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const KILLED = path.join("work", "killed.json");
const DELIVERY = path.join("work", "delivery.json");
const REPORT = path.join("work", "report.md");
const EXPORT_ID = "2026-08-05T12-00-00";

const DELIVERED = {
  studio_reviewed: true,
  wing_export_id: EXPORT_ID,
  authoring_applied: true,
};

async function bed({ delivery, killed, report = "# 보고\n\n전부 통과했다.\n", wingFiles = ["detail.html"] } = {}) {
  const b = await makeCheckbed();
  if (delivery !== null) await b.write(DELIVERY, { ...DELIVERED, ...delivery });
  if (killed) await b.write(KILLED, killed);
  if (report !== null) await b.write(REPORT, report);
  for (const name of wingFiles) {
    await b.write(path.join("output", "wing", EXPORT_ID, name), "산출물\n");
  }
  return b;
}

test("전부 갖추면 통과한다", async () => {
  const b = await bed();
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("delivery.json 이 없으면 거부한다", async () => {
  const b = await bed({ delivery: null });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /Studio 확인과 Wing 내보내기 결과를 남긴다/);
  } finally {
    await b.cleanup();
  }
});

test("죽인 프로세스를 되살리지 않으면 무엇을 죽였는지와 함께 낸다", async () => {
  const b = await bed({
    killed: { entries: [{ pid: 7312, cmd: "lean-studio-server", by_gate: "G9" }] },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /되살리지 않았다: lean-studio-server \(G9\)/);
  } finally {
    await b.cleanup();
  }
});

test("되살린 기록이 있으면 거부하지 않는다", async () => {
  const b = await bed({
    killed: {
      entries: [
        {
          pid: 7312,
          cmd: "lean-studio-server",
          by_gate: "G9",
          restored_at: "2026-08-05T12:10:00.000Z",
        },
      ],
    },
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("Studio 를 보지 않았으면 거부한다", async () => {
  const b = await bed({ delivery: { studio_reviewed: false } });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /Studio 를 열어 눈으로 보지 않았다/);
  } finally {
    await b.cleanup();
  }
});

test("Wing export id 가 없으면 거부한다", async () => {
  const b = await bed({ delivery: { wing_export_id: "" } });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /Wing export id 가 없다/);
  } finally {
    await b.cleanup();
  }
});

test("Wing 디렉터리가 비어 있으면 거부한다 — id 만으로는 산출물이 아니다", async () => {
  const b = await bed({ wingFiles: [] });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], new RegExp(`output/wing/${EXPORT_ID}/ 이 비어 있다`));
  } finally {
    await b.cleanup();
  }
});

test("authoring 반영이 없으면 거부한다", async () => {
  const b = await bed({ delivery: { authoring_applied: false } });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /authoring 세션 결과를 반영하지 않았다/);
  } finally {
    await b.cleanup();
  }
});

test("report.md 에 자리표시자가 남으면 거부한다", async () => {
  const b = await bed({ report: "# 보고\n\n- Wing: TODO\n" });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /report\.md 에 자리표시자가 남아 있다/);
  } finally {
    await b.cleanup();
  }
});
