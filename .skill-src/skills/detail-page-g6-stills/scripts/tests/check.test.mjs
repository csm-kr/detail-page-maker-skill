// G6 판정 단위 테스트.
//
// 2회차 결함: 30장 만들어 30장 그대로 발행했다. 원본 해상도로 본 컷은 0장이었고
// 탈락도 0건이었다. 파일 개수는 맞았으므로 존재 검사는 전부 통과했다.
// **판정 기록**을 컷마다 대조하고, 얼굴 정책을 채택 목록에 적용한다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import { makeCheckbed } from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const PLAN = "flow-plan.json";
const SELECTION = path.join("work", "selection.json");
const IDS = ["c1", "c2", "c3"];
const BASE = path.join("work", "stills", "base", "frame-000.png");

const accepted = (cut, extra = {}) => ({
  cut,
  decision: "accept",
  reason: "선명하고 비율이 맞다",
  checked_at_full_res: true,
  ...extra,
});

async function bed({ entries, modelFace = "crop-below-chin", cuts = IDS, base = true } = {}) {
  const b = await makeCheckbed({ modelFace });
  await b.write(PLAN, { cuts: cuts.map((id) => ({ id })) });
  if (base) await b.write(BASE, "PNG 자리\n");
  if (entries !== null) {
    await b.write(SELECTION, { entries: entries ?? IDS.map((id) => accepted(id)) });
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

test("selection.json 이 없으면 그 사유 하나만 낸다", async () => {
  const b = await bed({ entries: null });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /컷마다 채택·탈락과 이유를 남긴다/);
  } finally {
    await b.cleanup();
  }
});

test("판정하지 않은 컷을 지목한다", async () => {
  const b = await bed({ entries: [accepted("c1"), accepted("c2")] });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /판정하지 않은 컷 1개: c3/);
  } finally {
    await b.cleanup();
  }
});

test("원본 해상도로 보지 않은 컷을 세어 거부한다 — 썸네일로 판정하지 않는다", async () => {
  const b = await bed({
    entries: [accepted("c1"), accepted("c2", { checked_at_full_res: false }), accepted("c3")],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /원본 해상도로 보지 않은 컷 1개/);
  } finally {
    await b.cleanup();
  }
});

test("checked_at_full_res 가 아예 없으면 본 것으로 치지 않는다", async () => {
  const entries = IDS.map((id) => accepted(id));
  delete entries[0].checked_at_full_res;
  const b = await bed({ entries });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /원본 해상도로 보지 않은 컷 1개/);
  } finally {
    await b.cleanup();
  }
});

test("이유 없는 판정을 거부한다", async () => {
  const b = await bed({
    entries: [accepted("c1"), { cut: "c2", decision: "accept", checked_at_full_res: true }, accepted("c3")],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /decision 또는 reason 이 없는 컷 1개/);
  } finally {
    await b.cleanup();
  }
});

test("탈락시켰는데 재생성 job 이 없으면 거부한다", async () => {
  const b = await bed({
    entries: [
      accepted("c1"),
      { cut: "c2", decision: "reject", reason: "손가락이 뭉갰다", checked_at_full_res: true },
      accepted("c3"),
    ],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /재생성 job 이 없는 컷 1개/);
  } finally {
    await b.cleanup();
  }
});

test("재생성 job 이 있으면 탈락을 거부하지 않는다", async () => {
  const b = await bed({
    entries: [
      accepted("c1"),
      {
        cut: "c2",
        decision: "reject",
        reason: "손가락이 뭉갰다",
        checked_at_full_res: true,
        regen_job: "c2-r1",
      },
      accepted("c3"),
    ],
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("전부 탈락시키면 거부한다", async () => {
  const b = await bed({
    entries: IDS.map((id) => ({
      cut: id,
      decision: "reject",
      reason: "전부 어긋났다",
      checked_at_full_res: true,
      regen_job: `${id}-r1`,
    })),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /채택된 컷이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("얼굴 정책이 crop-below-chin 인데 얼굴이 보이는 컷을 채택하면 거부한다", async () => {
  const b = await bed({
    entries: [accepted("c1"), accepted("c2", { face: "visible" }), accepted("c3")],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /얼굴 정책 crop-below-chin 인데 얼굴이 보이는 컷이 채택됐다: c2/);
  } finally {
    await b.cleanup();
  }
});

test("정책이 allow 면 얼굴은 허용하되 동일 인물 확인을 요구한다", async () => {
  const b = await bed({
    modelFace: "allow",
    entries: [accepted("c1"), accepted("c2", { face: "visible" }), accepted("c3")],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /동일 인물 확인\(same_person\)이 없다: c2/);
  } finally {
    await b.cleanup();
  }
});

test("allow + same_person 이면 통과한다", async () => {
  const b = await bed({
    modelFace: "allow",
    entries: [
      accepted("c1"),
      accepted("c2", { face: "visible", same_person: true }),
      accepted("c3"),
    ],
  });
  try {
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("no_product 컷에 레퍼런스가 붙어 있으면 거부한다 — 제품이 끼어든다", async () => {
  const b = await bed({
    entries: [
      accepted("c1"),
      accepted("c2", { no_product: true, references: ["착용1.jpg"] }),
      accepted("c3"),
    ],
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /no_product 컷에 레퍼런스가 붙어 있다: c2/);
  } finally {
    await b.cleanup();
  }
});

test("기준 컷이 없으면 거부한다 — 컷마다 따로 생성되면 같은 제품으로 보이지 않는다", async () => {
  const b = await bed({ base: false });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /기준 컷이 없다/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});
