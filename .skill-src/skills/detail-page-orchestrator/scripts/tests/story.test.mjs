// 판매 서사 계약. 기준작 v4 의 실제 구조를 따른다.
//
// 1회차 플랜에는 role 이 없었다. 그래서 스펙 나열 8섹션이 그대로 통과했다.
// 문제를 보여 준 뒤 장점으로 넘어가는 구조인지만 본다 — 그 이상은 상품마다 다르다.

import assert from "node:assert/strict";
import test from "node:test";

import { storyFaults } from "../lib/story.mjs";

/** v4 의 13섹션을 role 로 옮긴 것. 이것이 통과의 기준이다. */
const V4 = [
  { id: "hero", role: "hero" },
  { id: "problem", role: "pain" },
  { id: "capture-result", role: "compare" },
  { id: "adhesion", role: "solution" },
  { id: "water-resistant", role: "solution" },
  { id: "installation", role: "usage" },
  { id: "multi-point", role: "solution" },
  { id: "quantity", role: "solution" },
  { id: "size-guide", role: "solution" },
  { id: "visual-comparison", role: "compare" },
  { id: "usage-guide", role: "usage" },
  { id: "product-info", role: "spec" },
  { id: "closing", role: "closing" },
];

test("기준작 v4 의 구조는 통과한다", () => {
  assert.deepEqual(storyFaults(V4), []);
});

test("role 이 없으면 잡는다", () => {
  const faults = storyFaults([{ id: "hero" }, ...V4.slice(1)]);
  assert.ok(faults.some((f) => f.includes("hero")));
});

test("모르는 role 은 잡는다", () => {
  const faults = storyFaults([{ id: "x", role: "genuine" }, ...V4.slice(1)]);
  assert.ok(faults.some((f) => f.includes("genuine")));
});

test("장점이 3개 미만이면 잡는다", () => {
  const thin = V4.filter((s) => s.role !== "solution").concat([
    { id: "a", role: "solution" },
    { id: "b", role: "solution" },
  ]);
  // hero 를 앞으로, closing 을 뒤로 되돌린다
  const ordered = [
    thin.find((s) => s.role === "hero"),
    ...thin.filter((s) => s.role !== "hero" && s.role !== "closing"),
    thin.find((s) => s.role === "closing"),
  ];
  assert.ok(storyFaults(ordered).some((f) => f.includes("장점")));
});

test("문제 없이 장점부터 시작하면 잡는다", () => {
  const noPain = V4.filter((s) => s.role !== "pain");
  assert.ok(storyFaults(noPain).some((f) => f.includes("문제")));
});

test("장점 뒤에 문제가 오면 잡는다", () => {
  const swapped = V4.map((s) => ({ ...s }));
  const painAt = swapped.findIndex((s) => s.role === "pain");
  const solutionAt = swapped.findIndex((s) => s.role === "solution");
  [swapped[painAt], swapped[solutionAt]] = [swapped[solutionAt], swapped[painAt]];
  assert.ok(storyFaults(swapped).some((f) => f.includes("앞")));
});

test("hero 가 처음이 아니면 잡는다", () => {
  const moved = [V4[1], V4[0], ...V4.slice(2)];
  assert.ok(storyFaults(moved).some((f) => f.includes("hero")));
});

test("closing 이 마지막이 아니면 잡는다", () => {
  const moved = [...V4.slice(0, 12), V4[12], { id: "extra", role: "spec" }];
  assert.ok(storyFaults(moved).some((f) => f.includes("closing")));
});

test("1회차 8섹션 스펙 나열은 통과하지 못한다", () => {
  // hero·adhesion·genuine·targets·places·principle·spec·closing — role 이 아예 없었다
  const flat = ["hero", "adhesion", "genuine", "targets", "places", "principle", "spec", "closing"]
    .map((id) => ({ id }));
  assert.ok(storyFaults(flat).length >= 3);
});
