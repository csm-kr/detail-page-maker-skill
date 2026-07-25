import { randomUUID } from "node:crypto";

export class DomainError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const ASSET_EDIT_PHASES = new Set([
  "asset_production",
  "asset_review",
  "assembly_ready",
]);

function timestamp(value) {
  return value || new Date().toISOString();
}

function requireValue(value, code, message) {
  if (value === undefined || value === null || value === "") {
    throw new DomainError(code, message);
  }
  return value;
}

function activeRevision(state) {
  const revision = state.revisions.find(
    (item) => item.id === state.currentRevisionId,
  );
  if (!revision) {
    throw new DomainError(
      "ACTIVE_REVISION_MISSING",
      "현재 개정판을 찾을 수 없습니다.",
      500,
    );
  }
  return revision;
}

function assertAssetEditing(state) {
  if (!ASSET_EDIT_PHASES.has(state.phase)) {
    throw new DomainError(
      "ASSET_STAGE_LOCKED",
      "조립된 버전의 에셋은 읽기 전용입니다. 새 개정판을 만들어 주세요.",
      409,
    );
  }
}

function assetById(state, assetId) {
  const asset = state.assets[assetId];
  if (!asset) {
    throw new DomainError(
      "ASSET_NOT_FOUND",
      `에셋을 찾을 수 없습니다: ${assetId}`,
      404,
    );
  }
  return asset;
}

function assetVersion(asset, versionNumber) {
  const version = asset.versions.find(
    (item) => item.number === Number(versionNumber),
  );
  if (!version) {
    throw new DomainError(
      "ASSET_VERSION_NOT_FOUND",
      `${asset.id}의 v${versionNumber}을 찾을 수 없습니다.`,
      404,
    );
  }
  return version;
}

function selectedVersion(state, assetId) {
  const revision = activeRevision(state);
  const versionNumber = revision.assetSelections[assetId];
  if (!versionNumber) return null;
  return assetVersion(assetById(state, assetId), versionNumber);
}

function refreshAssemblyReadiness(state) {
  if (!ASSET_EDIT_PHASES.has(state.phase)) return;
  const revision = activeRevision(state);
  const requiredAssets = Object.values(state.assets).filter(
    (asset) => asset.required,
  );
  const ready =
    requiredAssets.length > 0 &&
    requiredAssets.every((asset) => {
      const versionNumber = revision.assetSelections[asset.id];
      if (!versionNumber) return false;
      const version = asset.versions.find(
        (item) => item.number === versionNumber,
      );
      return Boolean(version?.approval?.decision === "approved");
    });
  const pendingJobs = Object.values(state.jobs).some((job) =>
    ["queued", "running"].includes(job.status),
  );
  state.phase = ready && !pendingJobs ? "assembly_ready" : "asset_review";
}

export function createInitialProject({
  id = `project-${randomUUID()}`,
  name,
  supplierUrl,
  productId = "",
  createdAt,
}) {
  const now = timestamp(createdAt);
  const revisionId = "rev-001";
  return {
    schemaVersion: 1,
    id,
    name: requireValue(name, "PROJECT_NAME_REQUIRED", "상품명이 필요합니다."),
    supplierUrl: requireValue(
      supplierUrl,
      "SUPPLIER_URL_REQUIRED",
      "공급처 URL이 필요합니다.",
    ),
    productId,
    phase: "asset_production",
    currentRevisionId: revisionId,
    createdAt: now,
    updatedAt: now,
    assets: {},
    jobs: {},
    revisions: [
      {
        id: revisionId,
        number: 1,
        status: "working",
        parentRevisionId: null,
        reason: "초기 제작",
        createdAt: now,
        assetSelections: {},
        affectedAssetIds: [],
        affectedSectionIds: [],
        assembly: null,
      },
    ],
    html: {
      entry: "html/index.html",
      layerState: {},
      viewportOverrides: {},
      sections: [],
      checkpoints: [],
    },
    finalQa: {
      status: "not_requested",
      score: null,
      hardFailures: [],
      warnings: [],
      userApproved: false,
      reportPath: null,
    },
  };
}
export function registerAssetVersion(
  state,
  {
    assetId,
    name,
    role,
    kind = "image",
    required = true,
    approvalMode = "individual",
    dependencies = [],
    versionPath,
    sha256,
    mime,
    sourceRefs = [],
    prompt = "",
    layers = [],
    createdAt,
  },
) {
  assertAssetEditing(state);
  const now = timestamp(createdAt);
  const id = requireValue(
    assetId,
    "ASSET_ID_REQUIRED",
    "에셋 ID가 필요합니다.",
  );
  let asset = state.assets[id];
  if (!asset) {
    asset = {
      id,
      name: name || role || id,
      role: role || id,
      kind,
      required: Boolean(required),
      approvalMode,
      dependencies: [...new Set(dependencies)],
      createdAt: now,
      versions: [],
    };
    state.assets[id] = asset;
  }
  const number =
    asset.versions.reduce((max, version) => Math.max(max, version.number), 0) +
    1;
  const version = {
    number,
    status: "qa_pending",
    path: requireValue(
      versionPath,
      "ASSET_PATH_REQUIRED",
      "에셋 파일 경로가 필요합니다.",
    ),
    sha256: requireValue(
      sha256,
      "ASSET_HASH_REQUIRED",
      "에셋 SHA-256이 필요합니다.",
    ),
    mime: mime || "application/octet-stream",
    sourceRefs: [...new Set(sourceRefs)],
    prompt,
    lockedProductFields: [
      "shape",
      "ratio",
      "material",
      "logo",
      "part-position",
    ],
    layers,
    qa: {
      status: "pending",
      score: null,
      hardFailures: [],
      warnings: [],
      evidence: [],
      checkedAt: null,
      checkedBy: null,
    },
    approval: null,
    createdAt: now,
  };
  asset.versions.push(version);
  activeRevision(state).assetSelections[id] = number;
  state.phase = "asset_review";
  state.updatedAt = now;
  return { asset, version };
}

export function createJob(
  state,
  {
    id = `job-${randomUUID()}`,
    type,
    assetId = null,
    version = null,
    scope = "asset",
    prompt = "",
    sourceRefs = [],
    confirmedByUser,
    createdAt,
  },
) {
  assertAssetEditing(state);
  if (confirmedByUser !== true) {
    throw new DomainError(
      "USER_CONFIRMATION_REQUIRED",
      "사용자 확인 없이는 생성·재생성 작업을 등록할 수 없습니다.",
      409,
    );
  }
  if (assetId) assetById(state, assetId);
  const now = timestamp(createdAt);
  const job = {
    id,
    type: requireValue(type, "JOB_TYPE_REQUIRED", "작업 종류가 필요합니다."),
    assetId,
    version: version ? Number(version) : null,
    scope,
    prompt,
    sourceRefs: [...new Set(sourceRefs)],
    confirmedByUser: true,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    error: null,
    result: null,
  };
  state.jobs[id] = job;
  state.phase = "asset_review";
  state.updatedAt = now;
  return job;
}

export function updateJobState(
  state,
  { jobId, status, error = null, result = null, updatedAt },
) {
  const job = state.jobs[jobId];
  if (!job) {
    throw new DomainError(
      "JOB_NOT_FOUND",
      `작업을 찾을 수 없습니다: ${jobId}`,
      404,
    );
  }
  const allowed = new Set([
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
  ]);
  if (!allowed.has(status)) {
    throw new DomainError("JOB_STATUS_INVALID", "잘못된 작업 상태입니다.");
  }
  job.status = status;
  job.error = error;
  job.result = result;
  job.updatedAt = timestamp(updatedAt);
  state.updatedAt = job.updatedAt;
  refreshAssemblyReadiness(state);
  return job;
}

export function recordAssetQa(
  state,
  {
    assetId,
    version,
    status,
    score = null,
    hardFailures = [],
    warnings = [],
    evidence = [],
    checkedBy = "codex-visual-qa",
    checkedAt,
  },
) {
  assertAssetEditing(state);
  const asset = assetById(state, assetId);
  const target = assetVersion(asset, version);
  const now = timestamp(checkedAt);
  const failures = hardFailures.filter(Boolean);
  target.qa = {
    status: failures.length > 0 ? "failed" : status,
    score,
    hardFailures: failures,
    warnings: warnings.filter(Boolean),
    evidence,
    checkedAt: now,
    checkedBy,
  };
  target.status =
    target.qa.status === "passed" ? "review_ready" : "qa_pending";
  for (const job of Object.values(state.jobs)) {
    if (
      job.type === "qa.visual" &&
      job.assetId === assetId &&
      Number(job.version) === Number(version) &&
      ["queued", "running"].includes(job.status)
    ) {
      job.status = "completed";
      job.updatedAt = now;
      job.result = { qaStatus: target.qa.status };
    }
  }
  state.updatedAt = now;
  refreshAssemblyReadiness(state);
  return target;
}

export function approveAssetVersion(
  state,
  {
    assetId,
    version,
    decision,
    approvedBy = "local-user",
    note = "",
    decidedAt,
  },
) {
  assertAssetEditing(state);
  const asset = assetById(state, assetId);
  const target = assetVersion(asset, version);
  const allowed = new Set(["approved", "rejected", "held"]);
  if (!allowed.has(decision)) {
    throw new DomainError(
      "APPROVAL_DECISION_INVALID",
      "승인·반려·보류 중 하나를 선택해 주세요.",
    );
  }
  if (decision === "approved") {
    if (target.qa.status !== "passed") {
      throw new DomainError(
        "QA_NOT_PASSED",
        "Codex 시각 QA를 통과한 에셋만 승인할 수 있습니다.",
        409,
      );
    }
    if (target.qa.hardFailures.length > 0) {
      throw new DomainError(
        "IDENTITY_HARD_FAILURE",
        "제품 동일성 하드 실패가 있어 승인할 수 없습니다.",
        409,
        target.qa.hardFailures,
      );
    }
  }
  const now = timestamp(decidedAt);
  target.approval = {
    decision,
    approvedBy,
    note,
    decidedAt: now,
  };
  target.status =
    decision === "approved"
      ? "approved"
      : decision === "rejected"
        ? "rejected"
        : "review_ready";
  state.updatedAt = now;
  refreshAssemblyReadiness(state);
  return target;
}

export function calculateAffected(state, changedAssetIds) {
  const affected = new Set(changedAssetIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const asset of Object.values(state.assets)) {
      if (
        !affected.has(asset.id) &&
        asset.dependencies.some((dependency) => affected.has(dependency))
      ) {
        affected.add(asset.id);
        changed = true;
      }
    }
  }
  const sectionIds = state.html.sections
    .filter((section) =>
      (section.assetIds || []).some((assetId) => affected.has(assetId)),
    )
    .map((section) => section.id);
  return {
    assetIds: [...affected],
    sectionIds,
  };
}

export function lockAssembly(
  state,
  { approvedBy = "local-user", confirmedByUser, lockedAt },
) {
  if (confirmedByUser !== true) {
    throw new DomainError(
      "USER_CONFIRMATION_REQUIRED",
      "사용자가 조립 잠금을 확인해야 합니다.",
      409,
    );
  }
  if (!ASSET_EDIT_PHASES.has(state.phase)) {
    throw new DomainError(
      "ASSEMBLY_ALREADY_LOCKED",
      "현재 개정판은 이미 조립되어 있습니다.",
      409,
    );
  }
  const revision = activeRevision(state);
  const failures = [];
  for (const asset of Object.values(state.assets).filter(
    (item) => item.required,
  )) {
    const versionNumber = revision.assetSelections[asset.id];
    if (!versionNumber) {
      failures.push(`${asset.name}: 선택된 버전 없음`);
      continue;
    }
    const version = asset.versions.find(
      (item) => item.number === versionNumber,
    );
    if (version?.approval?.decision !== "approved") {
      failures.push(`${asset.name}: 사용자 미승인`);
    }
    if (version?.qa?.hardFailures?.length) {
      failures.push(`${asset.name}: 제품 동일성 하드 실패`);
    }
  }
  const activeJobs = Object.values(state.jobs).filter((job) =>
    ["queued", "running"].includes(job.status),
  );
  if (activeJobs.length) {
    failures.push(`미처리 작업 ${activeJobs.length}개`);
  }
  if (failures.length) {
    throw new DomainError(
      "ASSEMBLY_GATE_FAILED",
      "조립 조건을 충족하지 못했습니다.",
      409,
      failures,
    );
  }
  if (Object.keys(revision.assetSelections).length === 0) {
    throw new DomainError(
      "NO_ASSETS_SELECTED",
      "조립할 승인 에셋이 없습니다.",
      409,
    );
  }
  const now = timestamp(lockedAt);
  revision.assembly = {
    lockedAt: now,
    approvedBy,
    assets: Object.fromEntries(
      Object.entries(revision.assetSelections).map(([assetId, version]) => {
        const item = assetVersion(assetById(state, assetId), version);
        return [
          assetId,
          {
            version,
            sha256: item.sha256,
          },
        ];
      }),
    ),
  };
  revision.status = "assembled";
  state.phase = "html_editing";
  state.updatedAt = now;
  return revision.assembly;
}

export function createRevision(
  state,
  { changedAssetIds, reason, confirmedByUser, createdAt },
) {
  if (confirmedByUser !== true) {
    throw new DomainError(
      "USER_CONFIRMATION_REQUIRED",
      "사용자가 새 개정판 생성을 확인해야 합니다.",
      409,
    );
  }
  if (!["html_editing", "final_qa", "published"].includes(state.phase)) {
    throw new DomainError(
      "REVISION_SOURCE_NOT_LOCKED",
      "조립된 버전에서만 새 개정판을 만들 수 있습니다.",
      409,
    );
  }
  if (!Array.isArray(changedAssetIds) || changedAssetIds.length === 0) {
    throw new DomainError(
      "CHANGED_ASSET_REQUIRED",
      "교체할 에셋을 하나 이상 선택해 주세요.",
    );
  }
  changedAssetIds.forEach((assetId) => assetById(state, assetId));
  const parent = activeRevision(state);
  const impact = calculateAffected(state, changedAssetIds);
  const number =
    state.revisions.reduce(
      (max, revision) => Math.max(max, revision.number),
      0,
    ) + 1;
  const id = `rev-${String(number).padStart(3, "0")}`;
  const selections = { ...parent.assetSelections };
  impact.assetIds.forEach((assetId) => delete selections[assetId]);
  const now = timestamp(createdAt);
  const revision = {
    id,
    number,
    status: "working",
    parentRevisionId: parent.id,
    reason: requireValue(
      reason,
      "REVISION_REASON_REQUIRED",
      "새 개정판 사유가 필요합니다.",
    ),
    createdAt: now,
    assetSelections: selections,
    affectedAssetIds: impact.assetIds,
    affectedSectionIds: impact.sectionIds,
    assembly: null,
  };
  state.revisions.push(revision);
  state.currentRevisionId = id;
  state.phase = "asset_production";
  state.finalQa = {
    status: "not_requested",
    score: null,
    hardFailures: [],
    warnings: [],
    userApproved: false,
    reportPath: null,
  };
  state.updatedAt = now;
  return revision;
}

export function saveHtmlLayer(
  state,
  { layerId, patch, viewport = "global", savedAt },
) {
  if (!["html_editing", "final_qa"].includes(state.phase)) {
    throw new DomainError(
      "HTML_EDITING_LOCKED",
      "HTML 편집 단계에서만 레이어를 수정할 수 있습니다.",
      409,
    );
  }
  requireValue(layerId, "LAYER_ID_REQUIRED", "레이어 ID가 필요합니다.");
  const now = timestamp(savedAt);
  if (viewport === "global") {
    state.html.layerState[layerId] = {
      ...(state.html.layerState[layerId] || {}),
      ...patch,
      updatedAt: now,
    };
  } else {
    if (!["320", "390", "800"].includes(String(viewport))) {
      throw new DomainError(
        "VIEWPORT_INVALID",
        "화면별 오버라이드는 320·390·800px만 지원합니다.",
      );
    }
    state.html.viewportOverrides[viewport] ||= {};
    state.html.viewportOverrides[viewport][layerId] = {
      ...(state.html.viewportOverrides[viewport][layerId] || {}),
      ...patch,
      updatedAt: now,
    };
  }
  state.updatedAt = now;
  return {
    layerId,
    viewport,
    value:
      viewport === "global"
        ? state.html.layerState[layerId]
        : state.html.viewportOverrides[viewport][layerId],
  };
}

export function createCheckpoint(
  state,
  { name, createdBy = "local-user", createdAt },
) {
  if (!["html_editing", "final_qa"].includes(state.phase)) {
    throw new DomainError(
      "CHECKPOINT_STAGE_INVALID",
      "HTML 편집 단계에서만 체크포인트를 만들 수 있습니다.",
      409,
    );
  }
  const now = timestamp(createdAt);
  const checkpoint = {
    id: `checkpoint-${randomUUID()}`,
    name: requireValue(
      name,
      "CHECKPOINT_NAME_REQUIRED",
      "체크포인트 이름이 필요합니다.",
    ),
    createdBy,
    createdAt: now,
    layerState: structuredClone(state.html.layerState),
    viewportOverrides: structuredClone(state.html.viewportOverrides),
  };
  state.html.checkpoints.push(checkpoint);
  state.updatedAt = now;
  return checkpoint;
}

export function recordFinalQa(
  state,
  {
    score,
    hardFailures = [],
    warnings = [],
    reportPath = null,
    checkedAt,
  },
) {
  if (!["html_editing", "final_qa"].includes(state.phase)) {
    throw new DomainError(
      "FINAL_QA_STAGE_INVALID",
      "HTML 조립 뒤에만 최종 QA를 기록할 수 있습니다.",
      409,
    );
  }
  const now = timestamp(checkedAt);
  state.finalQa = {
    status:
      Number(score) >= 97 && hardFailures.length === 0 ? "passed" : "failed",
    score: Number(score),
    hardFailures: hardFailures.filter(Boolean),
    warnings: warnings.filter(Boolean),
    userApproved: false,
    reportPath,
    checkedAt: now,
  };
  state.phase = "final_qa";
  state.updatedAt = now;
  return state.finalQa;
}

export function approveFinalQa(
  state,
  { approvedBy = "local-user", confirmedByUser, approvedAt },
) {
  if (confirmedByUser !== true) {
    throw new DomainError(
      "USER_CONFIRMATION_REQUIRED",
      "사용자가 최종 게시 승인을 확인해야 합니다.",
      409,
    );
  }
  if (
    state.finalQa.status !== "passed" ||
    state.finalQa.score < 97 ||
    state.finalQa.hardFailures.length > 0
  ) {
    throw new DomainError(
      "PUBLISH_GATE_FAILED",
      "97점 이상·하드 실패 0건을 충족해야 게시 승인할 수 있습니다.",
      409,
    );
  }
  const now = timestamp(approvedAt);
  state.finalQa.userApproved = true;
  state.finalQa.approvedBy = approvedBy;
  state.finalQa.approvedAt = now;
  state.phase = "published";
  state.updatedAt = now;
  return state.finalQa;
}

export function projectSummary(state) {
  const revision = activeRevision(state);
  const assets = Object.values(state.assets).map((asset) => {
    const selected = revision.assetSelections[asset.id] || null;
    const version = selected
      ? asset.versions.find((item) => item.number === selected)
      : null;
    return {
      ...asset,
      selectedVersion: selected,
      selected,
      selectedData: version,
    };
  });
  return {
    ...state,
    activeRevision: revision,
    assetList: assets,
    permissions: {
      assetWrite: ASSET_EDIT_PHASES.has(state.phase),
      assetRead: true,
      htmlWrite: ["html_editing", "final_qa"].includes(state.phase),
      publish:
        state.finalQa.status === "passed" &&
        state.finalQa.score >= 97 &&
        state.finalQa.hardFailures.length === 0 &&
        state.finalQa.userApproved,
    },
  };
}
