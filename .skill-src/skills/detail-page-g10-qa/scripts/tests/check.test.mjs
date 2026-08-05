// G10 판정 단위 테스트.
//
// 2회차 결함: 사진 31장을 PNG 로 21.3 MB 발행했고 합계가 38 MB 였다. QA 는 통과했다 —
// 포맷과 용량이 통과 조건이 아니었기 때문이다. 정책 값과 대조한다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import {
  makeCheckbed,
  patchPolicy,
} from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const REPORT = path.join("work", "qa-report.json");
const IMAGES = path.join("output", "media", "images");

async function bed({ report, images = ["a.webp", "b.webp"] } = {}) {
  const b = await makeCheckbed();
  if (report !== null) {
    await b.write(REPORT, { strict_media: true, errors: [], ...report });
  }
  for (const name of images) await b.write(path.join(IMAGES, name), "이미지 자리\n");
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

test("qa-report.json 이 없으면 그 사유 하나만 낸다", async () => {
  const b = await bed({ report: null });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /qa-report\.json 이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("strict-media 로 돌리지 않았으면 거부한다", async () => {
  const b = await bed({ report: { strict_media: false } });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /--strict-media 로 돌리지 않았다/);
  } finally {
    await b.cleanup();
  }
});

test("strict_media 키가 아예 없어도 돌린 것으로 치지 않는다", async () => {
  const b = await makeCheckbed();
  try {
    await b.write(REPORT, { errors: [] });
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /--strict-media 로 돌리지 않았다/);
  } finally {
    await b.cleanup();
  }
});

test("QA 오류가 있으면 건수와 내용을 함께 낸다", async () => {
  const b = await bed({ report: { errors: ["ASSET_MISSING gifs/g01.gif", "WIDTH_MISMATCH"] } });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /QA 오류 2건/);
    assert.match(reasons[0], /ASSET_MISSING/);
  } finally {
    await b.cleanup();
  }
});

test("정책 포맷이 아닌 사진을 지목한다", async () => {
  const b = await bed({ images: ["a.webp", "b.png", "c.jpg"] });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /webp-q85 이 아닌 파일 2개/);
    assert.match(reasons[0], /b\.png/);
  } finally {
    await b.cleanup();
  }
});

test("정책을 png 로 바꾸면 png 가 정답이 된다 — 검사는 정책을 따른다", async () => {
  const b = await bed({ images: ["a.png", "b.png"] });
  try {
    await patchPolicy(b.root, { photo_format: "png" });
    assert.deepEqual((await check(b.ctx)).reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("미디어 총량이 상한을 넘으면 실측과 상한을 함께 낸다", async () => {
  const b = await bed();
  try {
    // 상한을 내려 실측이 넘게 만든다. 12 MB 파일을 만드는 대신 정책을 움직인다.
    await patchPolicy(b.root, { media_budget_mb: 0.00001 });
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /미디어 총량 .* 가 상한 0\.00001 MB 를 넘는다/);
  } finally {
    await b.cleanup();
  }
});

test("GIF 도 총량에 함께 센다 — 사진만 세면 예산이 뜻을 잃는다", async () => {
  const b = await bed();
  try {
    const { mediaMb: before } = await check(b.ctx);
    await b.write(path.join("output", "media", "gifs", "g01.gif"), "G".repeat(4096));
    const { mediaMb: after } = await check(b.ctx);
    assert.ok(after > before, `${after} > ${before}`);
  } finally {
    await b.cleanup();
  }
});
