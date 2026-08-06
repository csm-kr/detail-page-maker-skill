// G2 판정 단위 테스트.
//
// 2회차 최대 누락: 기준작을 한 번도 열지 않았다. 그런데 파일 존재만 보면 아무 캡처나
// 놓아도 통과한다. **host 대조**와 **절의 내용**을 본다.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { check } from "../check.mjs";
import {
  COUPANG_URL,
  SUPPLIER_URL,
  capture,
  inputsLock,
  makeCheckbed,
} from "../../../detail-page-orchestrator/scripts/tests/fixture.mjs";

const LOCK = path.join("work", "inputs.lock.json");
const MAP = path.join("work", "flow-map.md");

const GOOD_MAP = `# flow-map

## 섹션 순서
1. hero
2. problem
3. solution
4. proof
5. spec
6. faq

## 고객 질문
- 얼마나 시원한가
- 팔이 굵어도 맞나

## 증명 방식
- 실측 사진
- 소재 수치

## 소구점
| 표현 | 출처 |
| --- | --- |
| \`강력 점착\` | 공급처 |
| \`생활방수\` | 공급처 |
| \`50장 대용량\` | 공급처 |
| \`완벽 포획\` | 쿠팡 |
| \`끈적임 오래 지속\` | 쿠팡 |
| \`한 번 붙으면 끝\` | 쿠팡 |

## 디자인 분위기
배경 #F5F5F5 · 본문 #1A1A1A · 강조 #C8A96E
`;

async function bed({ map = GOOD_MAP, captures } = {}) {
  const b = await makeCheckbed();
  await b.write(
    LOCK,
    inputsLock({
      captures: captures ?? { "input/captures/coupang.png": capture(COUPANG_URL) },
    }),
  );
  if (map !== null) await b.write(MAP, map);
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

test("기준작 캡처가 lock 에 없으면 거부한다 — 손으로 놓은 파일은 등록되지 않는다", async () => {
  const b = await bed({ captures: {} });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /기준작 캡처가 inputs\.lock\.json 에 없다/);
  } finally {
    await b.cleanup();
  }
});

test("기준작 캡처를 요구할 때 추출기 경로를 알려준다", async () => {
  // coupang-extractor 는 ACCESS_BLOCKED 판정과 상품 ID 대조를 한다. 손 캡처에는 없다.
  const b = await bed({ captures: {} });
  try {
    const { reasons } = await check(b.ctx);
    const missing = reasons.find((reason) => /기준작 캡처가/.test(reason));
    assert.ok(missing, reasons.join(" / "));
    assert.match(missing, /orchestrate capture --url/);
  } finally {
    await b.cleanup();
  }
});

test("공급처 캡처만 있으면 기준작 캡처로 세지 않는다", async () => {
  const b = await bed({
    captures: { "input/captures/supplier.png": capture(SUPPLIER_URL) },
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /기준작 캡처/);
  } finally {
    await b.cleanup();
  }
});

test("디자인 분위기 절이 없으면 그 절을 지목해 거부한다", async () => {
  const b = await bed({ map: GOOD_MAP.split("## 디자인 분위기")[0] });
  try {
    const { reasons } = await check(b.ctx);
    // 절이 없으면 그 절의 hex 도 0개다. 두 사유가 같은 원인을 가리킨다.
    assert.match(reasons.join("\n"), /`## 디자인 분위기` 절이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("고객 질문 절이 없으면 거부한다", async () => {
  const b = await bed({ map: GOOD_MAP.replace("## 고객 질문", "## 잡담") });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /`## 고객 질문` 절이 없다/);
  } finally {
    await b.cleanup();
  }
});

test("실측 hex 가 3개 미만이면 거부한다", async () => {
  const b = await bed({
    map: GOOD_MAP.replace("배경 #F5F5F5 · 본문 #1A1A1A · 강조 #C8A96E", "배경 #F5F5F5 · 본문 #1A1A1A"),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /실측 hex 가 2개다/);
  } finally {
    await b.cleanup();
  }
});

test("같은 hex 를 세 번 적어도 실측 3개로 세지 않는다", async () => {
  // 중복을 세면 "눈대중은 쓰지 않는다" 가 뜻을 잃는다.
  const b = await bed({
    map: GOOD_MAP.replace(
      "배경 #F5F5F5 · 본문 #1A1A1A · 강조 #C8A96E",
      "배경 #F5F5F5 · 본문 #f5f5f5 · 강조 #F5F5F5",
    ),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /실측 hex 가 1개다/);
  } finally {
    await b.cleanup();
  }
});

test("섹션 순서가 5개 미만이면 기준작을 읽지 않은 것으로 본다", async () => {
  const b = await bed({
    map: GOOD_MAP.replace("5. spec\n6. faq\n", ""),
  });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
    assert.match(reasons[0], /섹션이 4개다/);
  } finally {
    await b.cleanup();
  }
});

test("flow-map 이 없으면 캡처 사유까지만 내고 절 검사로 넘어가지 않는다", async () => {
  const b = await bed({ map: null, captures: {} });
  try {
    const { reasons } = await check(b.ctx);
    assert.equal(reasons.length, 1, reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

// ── 소구점 ────────────────────────────────────────────────────────────────
// 같은 상품이다. 그 상품의 판매 언어를 안 가져오면 페이지가 아무 표현도 물려받지 못한다.
// 3회차 flow-map 은 `완벽 포획` `강력 접착` 을 전부 "옮겨 오지 않는 것" 으로 분류했다.

test("소구점 절이 없으면 거부한다", async () => {
  const b = await bed({ map: GOOD_MAP.replace(/## 소구점[\s\S]*?(?=## 디자인)/, "") });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /소구점/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});

test("표현이 너무 적으면 거부한다 — 훑기만 한 것이다", async () => {
  // 쿠팡에서 온 세 줄을 뺀다. 공급처 표현 3개만 남는다.
  const thin = GOOD_MAP.split("\n")
    .filter((line) => !line.endsWith("| 쿠팡 |"))
    .join("\n");
  const b = await bed({ map: thin });
  try {
    const { reasons } = await check(b.ctx);
    assert.ok(reasons.some((r) => /소구점이 3개다/.test(r)), reasons.join(" / "));
  } finally {
    await b.cleanup();
  }
});
