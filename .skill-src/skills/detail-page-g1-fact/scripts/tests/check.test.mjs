// G1 판정 단위 테스트.
//
// 2회차 결함: 하루 지난 공급처 캡처를 경고 없이 재사용했고, 사진을 원본 해상도로 열지
// 않았다. 존재 검사로는 둘 다 통과한다 — 파일은 있었기 때문이다. 그래서 나이와 기록
// **내용**을 본다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import {
  SUPPLIER_URL,
  capture,
  inputsLock,
  makeCheckbed,
} from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const LOCK = path.join("work", "inputs.lock.json");
const SSOT = path.join("work", "SSOT.md");

const GOOD_SSOT = `# SSOT

확인: 원본 해상도로 13장을 열었다.

## 가동 범위
팔꿈치까지 접힌다. 분리·결합은 벨크로다.
`;

/** 갖출 것을 다 갖춘 판정대. 테스트는 하나씩만 무너뜨린다. */
async function bed(options = {}) {
  const b = await makeCheckbed();
  await b.write(LOCK, inputsLock({ captures: { "input/captures/supplier.png": capture(SUPPLIER_URL) }, ...options }));
  await b.write(SSOT, GOOD_SSOT);
  return b;
}

test("전부 갖추면 통과한다", async () => {
  const b = await bed();
  try {
    const { reasons } = await check(b.ctx);
    assert.deepEqual(reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("공급처 캡처가 7일을 넘으면 거부한다", async () => {
  const b = await bed({
    captures: { "input/captures/supplier.png": capture(SUPPLIER_URL, { daysAgo: 8 }) },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /8\.0일 지났다 \(상한 7일\)/);
  } finally {
    await b.cleanup();
  }
});

test("6일 된 캡처는 나이로 거부하지 않는다", async () => {
  const b = await bed({
    captures: { "input/captures/supplier.png": capture(SUPPLIER_URL, { daysAgo: 6 }) },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.deepEqual(reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("공급처가 아닌 호스트의 캡처는 공급처 캡처로 세지 않는다", async () => {
  // 개수만 세면 기준작 캡처 하나로 G1 이 통과한다. host 를 대조해야 잡힌다.
  const b = await bed({
    captures: { "input/captures/coupang.png": capture("https://www.coupang.com/vp/products/1") },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /공급처 캡처가 inputs\.lock\.json 에 없다/);
  } finally {
    await b.cleanup();
  }
});

test("공급처 캡처를 요구할 때 추출기 경로를 알려준다", async () => {
  // 막힌 사람이 읽는 곳이 이 문장이다. `lock --read` 만 적어 두면 손으로 캡처해서
  // 등록하고, dmk-extractor 의 차단 판정·상품 ID 대조·후기 마스킹을 통째로 놓친다.
  const b = await bed({ captures: {} });
  try {
    const { reasons } = await check(b.ctx);
    const missing = reasons.find((reason) => /공급처 캡처가/.test(reason));
    assert.ok(missing, reasons.join(" / "));
    assert.match(missing, /orchestrate capture --url/);
  } finally {
    await b.cleanup();
  }
});

test("이전 회차 파생본을 입력으로 쓰면 거부한다", async () => {
  const b = await bed({
    captures: {
      "input/captures/supplier.png": capture(SUPPLIER_URL),
      "scratchpad/prev-run/supplier.png": capture(SUPPLIER_URL),
    },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /이전 회차 파생본/);
  } finally {
    await b.cleanup();
  }
});

test("사진이 0장이어도 거부하지 않는다", async () => {
  // 계약은 "없으면 공급처 동일 SKU로 진행" 이다 — docs/GUIDE.md §3. 검사가 사진을
  // 강제하면 공급처 근거만으로 도는 회차가 시작조차 못 한다.
  const b = await bed({ photos: { count: 0, entries: [] } });
  try {
    const { reasons } = await check(b.ctx);
    assert.deepEqual(reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("input/photos 에 잠기지 않은 사진이 있으면 거부한다", async () => {
  // 손으로 놓은 사진은 해시 체인 밖이다. 그것으로 만든 산출물은 재현되지 않는다.
  const b = await bed({ photos: { count: 0, entries: [] } });
  try {
    await b.write(path.join("input", "photos", "손으로놓음.jpg"), "사진 자리");
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /잠기지 않은 사진/);
  } finally {
    await b.cleanup();
  }
});

test("잠긴 사진만 있으면 통과한다", async () => {
  const b = await bed({
    photos: { count: 1, entries: [{ file: "input/photos/실물-1.jpg", sha256: `sha256:${"a".repeat(64)}` }] },
  });
  try {
    await b.write(path.join("input", "photos", "실물-1.jpg"), "사진 자리");
    const { reasons } = await check(b.ctx);
    assert.deepEqual(reasons, []);
  } finally {
    await b.cleanup();
  }
});

test("SSOT 에 원본 해상도 확인 기록이 없으면 거부한다", async () => {
  const b = await bed();
  try {
    await b.write(SSOT, "# SSOT\n\n## 가동 범위\n접힌다. 분리된다.\n");
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /원본 해상도/);
  } finally {
    await b.cleanup();
  }
});

test("SSOT 에 가동·제약 기록이 없으면 거부한다", async () => {
  const b = await bed();
  try {
    await b.write(SSOT, "# SSOT\n\n확인: 원본 해상도로 열었다.\n\n## 색\n검정\n");
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /가동 범위·분리·결합/);
  } finally {
    await b.cleanup();
  }
});

test("inputs.lock.json 이 없으면 그 사유 하나만 내고 멈춘다", async () => {
  // 뒤의 검사가 lock 을 읽으므로, 없을 때 사유가 쏟아지면 무엇이 원인인지 흐려진다.
  const b = await makeCheckbed();
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /inputs\.lock\.json 을 읽을 수 없다/);
  } finally {
    await b.cleanup();
  }
});
