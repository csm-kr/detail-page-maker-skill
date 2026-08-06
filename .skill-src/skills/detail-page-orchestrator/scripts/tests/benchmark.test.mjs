// 기준작 대비 상업 강도 측정. 이 파일이 "좋은 페이지" 의 정의다.
//
// 지금까지 모든 검사는 "단계를 했는가" 를 물었다. 그래서 밋밋한 페이지가 전부 통과했다.
// 여기서는 결과만 본다.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FLOOR, measure, shortfalls } from "../lib/benchmark.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BENCH = path.join(HERE, "..", "..", "references", "benchmark");

const read = (name) => readFile(path.join(BENCH, name), "utf8");

test("섹션 수를 센다", () => {
  const html = `<section>a</section><section>b</section>`;
  assert.equal(measure(html).sections, 2);
});

test("object-fit:cover 로 풀블리드 이미지를 센다", () => {
  const html = `<style>.a img{object-fit:cover}.b img{object-fit: cover}</style>`;
  assert.equal(measure(html).fullBleed, 2);
});

test("position:absolute 규칙으로 오버레이를 센다", () => {
  const html = `<style>.x{position:absolute}.y{position: absolute}.z{position:relative}</style>`;
  assert.equal(measure(html).overlays, 2);
});

test("고정 높이 300px 이상만 시각 무대로 센다", () => {
  const html = `<style>
    .a{height:1040px}.b{min-height:520px}
    .c{height:76px}.d{min-height:62px}
  </style>`;
  assert.equal(measure(html).visualStages, 2);
});

test("높이가 auto 면 시각 무대가 아니다", () => {
  const html = `<style>.shot{width:660px;height:auto}</style>`;
  assert.equal(measure(html).visualStages, 0);
});

test("가장 큰 글자 크기를 찾는다", () => {
  const html = `<style>.a{font-size:66px}.b{font-size:116px}.c{font-size:18px}</style>`;
  assert.equal(measure(html).maxTypePx, 116);
});

test("서로 다른 글자 크기의 가짓수를 센다", () => {
  // 평평한 위계가 여기서 드러난다. 1회차는 10가지, 기준작 v4 는 21가지였다.
  const html = `<style>.a{font-size:64px}.b{font-size:64px}.c{font-size:20px}.d{font-size:15px}</style>`;
  assert.equal(measure(html).typeScale, 3);
});

test("기준작 v4 는 하한을 전부 넘는다", async () => {
  const result = shortfalls(measure(await read("v4-reference.html")));
  assert.deepEqual(result, [], `기준작이 하한에 걸리면 하한이 틀린 것이다: ${result.join(" · ")}`);
});

test("기준작 쿠팡 윙은 하한을 전부 넘는다", async () => {
  const result = shortfalls(measure(await read("coupang-wing-780.html")));
  assert.deepEqual(result, [], `기준작이 하한에 걸리면 하한이 틀린 것이다: ${result.join(" · ")}`);
});

test("밋밋한 페이지는 하한에 걸린다", () => {
  // 1회차 산출물의 구조다. 흰 박스에 가운데 정렬, 이미지는 아래에 붙인다.
  const flat = `<style>
    .sec{padding:104px 60px;text-align:center;background:#FFFFFF}
    .sec.tinted{background:#F4F7EC}
    .head{font-size:60px}
    .shot{display:block;width:660px;margin:52px auto 0}
    .notes li::before{position:absolute}
  </style>
  <section class="sec"><h2 class="head">가</h2><img class="shot" src="a.webp"></section>
  <section class="sec tinted"><h2 class="head">나</h2><img class="shot" src="b.webp"></section>`;
  const result = shortfalls(measure(flat));
  assert.ok(result.length >= 3, `밋밋한 페이지가 ${result.length}건만 걸렸다`);
});

test("하한은 두 기준작의 실측 최솟값 **그 자체**다", async () => {
  // 이전에는 `<=` 였다. 그래서 안전하게 낮춰 잡은 값이 하한이 됐고, 기준작의 절반짜리
  // 페이지가 전부 통과했다 — 하한을 사람이 고른 것이 화려함이 빠진 직접 원인이다.
  // 하한은 고르는 값이 아니라 **유도되는 값**이다. 올리려면 기준작을 바꿔야 한다.
  const a = measure(await read("v4-reference.html"));
  const b = measure(await read("coupang-wing-780.html"));
  for (const key of Object.keys(FLOOR)) {
    assert.equal(
      FLOOR[key],
      Math.min(a[key], b[key]),
      `${key} 하한 ${FLOOR[key]} 이 기준작 실측 최솟값 ${Math.min(a[key], b[key])} 과 다르다`,
    );
  }
});

test("기준작이 재는 항목을 하나도 빠뜨리지 않는다", async () => {
  const keys = Object.keys(measure(await read("v4-reference.html")));
  assert.deepEqual(Object.keys(FLOOR).sort(), keys.sort(), "재기만 하고 하한이 없는 지표가 있다");
});
