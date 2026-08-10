import os from "node:os";

const GIB = 1024 ** 3;
const DEFAULT_RESERVED_COORDINATOR_SLOTS = 1;
const DEFAULT_MAX_LOCAL_WORKERS = 8;
const DEFAULT_MEMORY_PER_WORKER_GIB = 2;
const DEFAULT_RESERVED_MEMORY_GIB = 2;

export class AgentCapacityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AgentCapacityError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new AgentCapacityError(code, message, details);
}

function positiveInteger(value, field, { optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) {
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    fail("INVALID_AGENT_CAPACITY", `${field}는 1 이상의 정수여야 합니다.`, {
      field,
      value,
    });
  }
  return number;
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    fail("INVALID_AGENT_CAPACITY", `${field}는 0 이상의 정수여야 합니다.`, {
      field,
      value,
    });
  }
  return number;
}

export function normalizeAgentSessionIds(value) {
  const items = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map((item) => item.trim());
  return [
    ...new Set(
      items
        .map((item) => String(item).trim())
        .filter(Boolean),
    ),
  ];
}

function environmentInteger(environment, key) {
  return positiveInteger(environment?.[key], key, { optional: true });
}

export function inspectAgentCapacity({
  environment = process.env,
  availableParallelism = os.availableParallelism(),
  totalMemoryBytes = os.totalmem(),
  sessionIds = [],
  reservedCoordinatorSlots =
    DEFAULT_RESERVED_COORDINATOR_SLOTS,
} = {}) {
  const cpuThreads = positiveInteger(
    availableParallelism,
    "available_parallelism",
  );
  const memoryBytes = Number(totalMemoryBytes);
  if (!Number.isFinite(memoryBytes) || memoryBytes <= 0) {
    fail(
      "INVALID_MACHINE_MEMORY",
      "total_memory_bytes는 양수여야 합니다.",
      { total_memory_bytes: totalMemoryBytes },
    );
  }
  const reservedSlots = nonNegativeInteger(
    reservedCoordinatorSlots,
    "reserved_coordinator_slots",
  );
  const hostTotalSlots = environmentInteger(
    environment,
    "DETAIL_PAGE_AGENT_TOTAL_SLOTS",
  );
  const hostWorkerLimit = hostTotalSlots
    ? Math.max(0, hostTotalSlots - reservedSlots)
    : null;
  const configuredWorkerLimit = environmentInteger(
    environment,
    "DETAIL_PAGE_AGENT_MAX_WORKERS",
  );
  const maxLocalWorkers =
    configuredWorkerLimit ?? DEFAULT_MAX_LOCAL_WORKERS;
  const cpuWorkerLimit = Math.max(1, Math.floor(cpuThreads / 2));
  const totalMemoryGib = memoryBytes / GIB;
  const memoryWorkerLimit = Math.max(
    1,
    Math.floor(
      (totalMemoryGib - DEFAULT_RESERVED_MEMORY_GIB) /
        DEFAULT_MEMORY_PER_WORKER_GIB,
    ),
  );
  const machineWorkerLimit = Math.max(
    1,
    Math.min(
      maxLocalWorkers,
      cpuWorkerLimit,
      memoryWorkerLimit,
    ),
  );
  const normalizedSessions = normalizeAgentSessionIds(sessionIds);
  const actualSessionLimit =
    normalizedSessions.length > 0
      ? normalizedSessions.length
      : null;
  const knownLimits = [
    machineWorkerLimit,
    hostWorkerLimit,
    configuredWorkerLimit,
    actualSessionLimit,
  ].filter((value) => Number.isInteger(value));
  const recommendedWorkerCapacity = Math.max(
    0,
    Math.min(...knownLimits),
  );

  return Object.freeze({
    schema_version: "1.0",
    machine: Object.freeze({
      platform: process.platform,
      architecture: process.arch,
      available_parallelism: cpuThreads,
      total_memory_bytes: memoryBytes,
      total_memory_gib: Number(totalMemoryGib.toFixed(2)),
      cpu_worker_limit: cpuWorkerLimit,
      memory_worker_limit: memoryWorkerLimit,
      machine_worker_limit: machineWorkerLimit,
    }),
    host: Object.freeze({
      total_agent_slots: hostTotalSlots,
      reserved_coordinator_slots: reservedSlots,
      worker_slot_limit: hostWorkerLimit,
      source: hostTotalSlots
        ? "DETAIL_PAGE_AGENT_TOTAL_SLOTS"
        : "unknown",
    }),
    sessions: Object.freeze({
      supplied_session_ids: normalizedSessions,
      supplied_session_count: normalizedSessions.length,
      actual_session_limit: actualSessionLimit,
    }),
    configured_worker_limit: configuredWorkerLimit,
    recommended_worker_capacity: recommendedWorkerCapacity,
    dispatch_ready:
      recommendedWorkerCapacity > 0 &&
      normalizedSessions.length >= recommendedWorkerCapacity,
    notes: Object.freeze([
      "machine_worker_limit은 CPU/RAM 안전 권장치이며 실제 agent spawn 권한이 아니다.",
      "실제 동시 실행은 host slot과 서로 다른 worker session ID의 더 작은 값으로 제한한다.",
      hostTotalSlots
        ? "호스트 agent slot 상한이 환경에서 제공됐다."
        : "호스트 agent slot 상한을 알 수 없어 실제 session 수를 최종 상한으로 사용한다.",
    ]),
  });
}

export function resolveWorkerAllocation({
  requestedCapacity,
  cliSessionIds = [],
  environment = process.env,
  availableParallelism,
  totalMemoryBytes,
  reservedCoordinatorSlots =
    DEFAULT_RESERVED_COORDINATOR_SLOTS,
} = {}) {
  const commandSessions = normalizeAgentSessionIds(cliSessionIds);
  const environmentSessions = normalizeAgentSessionIds(
    environment?.DETAIL_PAGE_AGENT_SESSION_IDS,
  );
  const sessionIds =
    commandSessions.length > 0
      ? commandSessions
      : environmentSessions;
  const profile = inspectAgentCapacity({
    environment,
    availableParallelism,
    totalMemoryBytes,
    sessionIds,
    reservedCoordinatorSlots,
  });
  const auto =
    requestedCapacity === undefined ||
    requestedCapacity === null ||
    requestedCapacity === "" ||
    String(requestedCapacity).trim().toLowerCase() === "auto";
  const workerCapacity = auto
    ? profile.recommended_worker_capacity
    : positiveInteger(requestedCapacity, "worker_capacity");
  if (workerCapacity < 1 || sessionIds.length === 0) {
    fail(
      "AGENT_SESSIONS_REQUIRED",
      "자동 worker capacity를 계산하려면 실제 worker session ID가 하나 이상 필요합니다.",
      {
        recommended_machine_capacity:
          profile.machine.machine_worker_limit,
        host_worker_limit: profile.host.worker_slot_limit,
        supplied_session_count:
          profile.sessions.supplied_session_count,
      },
    );
  }
  if (sessionIds.length < workerCapacity) {
    fail(
      "WORKER_SESSION_CAPACITY_INSUFFICIENT",
      "선택된 worker capacity를 채울 실제 agent session이 부족합니다.",
      {
        worker_capacity: workerCapacity,
        available_sessions: sessionIds.length,
        mode: auto ? "auto" : "explicit",
      },
    );
  }
  if (
    auto &&
    profile.host.worker_slot_limit !== null &&
    workerCapacity > profile.host.worker_slot_limit
  ) {
    fail(
      "HOST_AGENT_CAPACITY_EXCEEDED",
      "자동 worker capacity가 호스트 agent slot 상한을 넘었습니다.",
      {
        worker_capacity: workerCapacity,
        host_worker_limit: profile.host.worker_slot_limit,
      },
    );
  }
  return Object.freeze({
    mode: auto ? "auto" : "explicit",
    worker_capacity: workerCapacity,
    worker_session_ids: sessionIds.slice(0, workerCapacity),
    profile,
  });
}
