import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentCapacityError,
  inspectAgentCapacity,
  resolveWorkerAllocation,
} from "../orchestration/agent-capacity.mjs";

const GIB = 1024 ** 3;

test("8 CPU와 8 GiB 머신은 보수적으로 worker 3개를 권장한다", () => {
  const profile = inspectAgentCapacity({
    environment: {},
    availableParallelism: 8,
    totalMemoryBytes: 8 * GIB,
  });
  assert.equal(profile.machine.machine_worker_limit, 3);
  assert.equal(profile.recommended_worker_capacity, 3);
  assert.equal(profile.dispatch_ready, false);
});

test("작은 머신은 worker 1개로 축소한다", () => {
  const profile = inspectAgentCapacity({
    environment: {},
    availableParallelism: 2,
    totalMemoryBytes: 4 * GIB,
  });
  assert.equal(profile.machine.machine_worker_limit, 1);
  assert.equal(profile.recommended_worker_capacity, 1);
});

test("auto는 머신, 호스트 slot, 실제 session의 최솟값을 사용한다", () => {
  const allocation = resolveWorkerAllocation({
    requestedCapacity: "auto",
    cliSessionIds: ["worker-a", "worker-b", "worker-c"],
    environment: {
      DETAIL_PAGE_AGENT_TOTAL_SLOTS: "4",
    },
    availableParallelism: 8,
    totalMemoryBytes: 8 * GIB,
  });
  assert.equal(allocation.worker_capacity, 3);
  assert.deepEqual(allocation.worker_session_ids, [
    "worker-a",
    "worker-b",
    "worker-c",
  ]);
});

test("session 수가 적으면 auto가 실제 session 수로 줄어든다", () => {
  const allocation = resolveWorkerAllocation({
    requestedCapacity: "auto",
    cliSessionIds: ["worker-a", "worker-b"],
    environment: {
      DETAIL_PAGE_AGENT_TOTAL_SLOTS: "8",
    },
    availableParallelism: 16,
    totalMemoryBytes: 32 * GIB,
  });
  assert.equal(allocation.worker_capacity, 2);
});

test("명시 capacity가 실제 session 수를 넘으면 실패한다", () => {
  assert.throws(
    () =>
      resolveWorkerAllocation({
        requestedCapacity: 4,
        cliSessionIds: ["worker-a", "worker-b", "worker-c"],
        environment: {},
        availableParallelism: 16,
        totalMemoryBytes: 32 * GIB,
      }),
    (error) =>
      error instanceof AgentCapacityError &&
      error.code === "WORKER_SESSION_CAPACITY_INSUFFICIENT",
  );
});

test("session ID가 없으면 auto dispatch를 시작하지 않는다", () => {
  assert.throws(
    () =>
      resolveWorkerAllocation({
        requestedCapacity: "auto",
        cliSessionIds: [],
        environment: {},
        availableParallelism: 8,
        totalMemoryBytes: 8 * GIB,
      }),
    (error) =>
      error instanceof AgentCapacityError &&
      error.code === "AGENT_SESSIONS_REQUIRED",
  );
});
