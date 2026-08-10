export class RunBudgetError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RunBudgetError";
    this.code = code;
    this.details = details;
  }
}

const FIELDS = [
  ["tokens", "max_tokens"],
  ["image_candidates", "max_image_candidates"],
  ["gif_previews", "max_gif_previews"],
  ["estimated_cost", "max_estimated_cost"],
];

function zeroUsage() {
  return {
    tokens: 0,
    image_candidates: 0,
    gif_previews: 0,
    estimated_cost: 0,
    actual_cost: 0,
  };
}

function normalizeEstimate(estimate) {
  const normalized = {
    provider: String(estimate?.provider || "other"),
    tokens: Number(estimate?.tokens || 0),
    image_candidates: Number(estimate?.image_candidates || 0),
    gif_previews: Number(estimate?.gif_previews || 0),
    estimated_cost: Number(estimate?.estimated_cost || 0),
  };
  for (const [field] of FIELDS) {
    if (!Number.isFinite(normalized[field]) || normalized[field] < 0) {
      throw new RunBudgetError(
        "INVALID_BUDGET_ESTIMATE",
        `${field} 예상치는 0 이상의 수여야 합니다.`,
      );
    }
  }
  return normalized;
}

export class RunBudgetLedger {
  #profile;

  #reservations = new Map();

  #actual = zeroUsage();

  #blocked = false;

  constructor(profile) {
    this.#profile = structuredClone(profile);
  }

  reserve(workOrderId, estimate) {
    if (!workOrderId) {
      throw new RunBudgetError(
        "WORK_ORDER_ID_REQUIRED",
        "workOrderId가 필요합니다.",
      );
    }
    const normalized = normalizeEstimate(estimate);
    const existing = this.#reservations.get(workOrderId);
    if (existing) {
      if (JSON.stringify(existing.estimate) !== JSON.stringify(normalized)) {
        throw new RunBudgetError(
          "RESERVATION_CONFLICT",
          "같은 WorkOrder의 예약 내용을 바꿀 수 없습니다.",
        );
      }
      return structuredClone(existing);
    }
    const providerActive = [...this.#reservations.values()].filter(
      (entry) =>
        entry.status === "reserved" &&
        entry.estimate.provider === normalized.provider,
    ).length;
    const concurrency =
      this.#profile.provider_concurrency?.[normalized.provider] ??
      Infinity;
    if (providerActive >= concurrency) {
      throw new RunBudgetError(
        "PROVIDER_CONCURRENCY_EXCEEDED",
        "provider 동시 실행 한도를 넘었습니다.",
        { provider: normalized.provider, concurrency },
      );
    }

    const reservedTotals = [...this.#reservations.values()]
      .filter((entry) => entry.status === "reserved")
      .reduce((totals, entry) => {
        for (const [field] of FIELDS) {
          totals[field] += entry.estimate[field];
        }
        return totals;
      }, zeroUsage());
    for (const [field, limitField] of FIELDS) {
      const committedField =
        field === "estimated_cost" ? "actual_cost" : field;
      const projected =
        this.#actual[committedField] +
        reservedTotals[field] +
        normalized[field];
      const limit = Number(this.#profile[limitField]);
      if (Number.isFinite(limit) && projected > limit) {
        this.#blocked = true;
        throw new RunBudgetError(
          "BUDGET_AWAITING_USER",
          `${limitField} 한도를 넘으므로 사용자 결정을 기다립니다.`,
          { field, projected, limit },
        );
      }
    }
    const reservation = {
      work_order_id: workOrderId,
      status: "reserved",
      estimate: normalized,
    };
    this.#reservations.set(workOrderId, reservation);
    return structuredClone(reservation);
  }

  commit(workOrderId, actual) {
    const reservation = this.#reservations.get(workOrderId);
    if (!reservation || reservation.status !== "reserved") {
      throw new RunBudgetError(
        "RESERVATION_NOT_ACTIVE",
        "활성 budget reservation을 찾을 수 없습니다.",
      );
    }
    const usage = {
      tokens: Number(actual?.tokens || 0),
      image_candidates: Number(actual?.image_candidates || 0),
      gif_previews: Number(actual?.gif_previews || 0),
      actual_cost: Number(actual?.actual_cost || 0),
    };
    for (const value of Object.values(usage)) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RunBudgetError(
          "INVALID_ACTUAL_USAGE",
          "실제 사용량은 0 이상의 수여야 합니다.",
        );
      }
    }
    for (const [field, value] of Object.entries(usage)) {
      this.#actual[field] += value;
    }
    reservation.status = "committed";
    reservation.actual = usage;
    return structuredClone(reservation);
  }

  release(workOrderId, reason = "cancelled") {
    const reservation = this.#reservations.get(workOrderId);
    if (!reservation || reservation.status !== "reserved") return false;
    reservation.status = "released";
    reservation.release_reason = reason;
    return true;
  }

  snapshot() {
    return {
      profile: structuredClone(this.#profile),
      actual: structuredClone(this.#actual),
      active_reservations: [...this.#reservations.values()].filter(
        (entry) => entry.status === "reserved",
      ).length,
      reservations: [...this.#reservations.values()].map((entry) =>
        structuredClone(entry),
      ),
      status: this.#blocked ? "BUDGET_AWAITING_USER" : "ACTIVE",
      publish_allowed: !this.#blocked,
    };
  }
}
