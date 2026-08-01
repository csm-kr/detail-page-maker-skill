const preview = document.querySelector("#preview");
const saveButton = document.querySelector("#save");
const toggleEdit = document.querySelector("#toggleEdit");
const statusNode = document.querySelector("#status");
const srcInput = document.querySelector("#imageSrc");
const altInput = document.querySelector("#imageAlt");
const selectedLabel = document.querySelector("#selectedLabel");
const selectionDepth = document.querySelector("#selectionDepth");
const editingStateNode = document.querySelector("#editingState");
const nestedStudioGuard = document.querySelector("#nestedStudioGuard");
const sectionSelect = document.querySelector("#sectionSelect");
const sectionCropHeight = document.querySelector("#sectionCropHeight");
const sectionCropMode = document.querySelector("#sectionCropMode");
const sectionCropMeasure = document.querySelector("#sectionCropMeasure");
const sectionCropApply = document.querySelector("#sectionCropApply");
const sectionCropClear = document.querySelector("#sectionCropClear");
const sectionCropMinus = document.querySelector("#sectionCropMinus");
const sectionCropPlus = document.querySelector("#sectionCropPlus");
const autoHeight = document.querySelector("#autoHeight");
const pageHeight = document.querySelector("#pageHeight");
const heightMeasure = document.querySelector("#heightMeasure");
const assetReviewGrid = document.querySelector("#assetReviewGrid");
const exportButton = document.querySelector("#exportHtml");
const outputGate = document.querySelector("#outputGate");
const outputSummary = document.querySelector("#outputSummary");
const wingExportButton = document.querySelector("#exportCoupangWing");
const wingExportGate = document.querySelector("#wingExportGate");
const wingConnectionStatus = document.querySelector("#wingConnectionStatus");
const wingExportResult = document.querySelector("#wingExportResult");
const workflowStageList = document.querySelector("#workflowStageList");
const workflowCurrentStage = document.querySelector("#workflowCurrentStage");
const workflowStageCount = document.querySelector("#workflowStageCount");
const workflowReadyCount = document.querySelector("#workflowReadyCount");
const workflowBlockedCount = document.querySelector("#workflowBlockedCount");
const workflowStaleCount = document.querySelector("#workflowStaleCount");
const workflowArtifactCount = document.querySelector("#workflowArtifactCount");
const workflowValidatorSummary = document.querySelector("#workflowValidatorSummary");
const workflowApprovalSummary = document.querySelector("#workflowApprovalSummary");
const workflowExportSummary = document.querySelector("#workflowExportSummary");
const workflowMessage = document.querySelector("#workflowMessage");
const workflowG5Gate = document.querySelector("#workflowG5Gate");
const workflowAdvanceButton = document.querySelector("#workflowAdvance");
const workflowResumeButton = document.querySelector("#workflowResume");
const workflowRefreshButton = document.querySelector("#workflowRefresh");
const workflowChallengeNode = document.querySelector("#workflowChallenge");
const workflowChallengeId = document.querySelector("#workflowChallengeId");
const workflowChallengeStage = document.querySelector("#workflowChallengeStage");
const workflowChallengeDigest = document.querySelector("#workflowChallengeDigest");
const workflowChallengeNonce = document.querySelector("#workflowChallengeNonce");
const workflowProofConfirmed = document.querySelector("#workflowProofConfirmed");
const workflowRejectReason = document.querySelector("#workflowRejectReason");
const workflowApproveButton = document.querySelector("#workflowApprove");
const workflowRejectButton = document.querySelector("#workflowReject");
const applyImageButton = document.querySelector("#applyImage");
const imageFileInput = document.querySelector("#imageFile");
const undoButton = document.querySelector("#undo");
const elementFont = document.querySelector("#elementFont");
const elementColor = document.querySelector("#elementColor");
const elementX = document.querySelector("#elementX");
const elementY = document.querySelector("#elementY");
const applyPositionButton = document.querySelector("#applyPosition");
const clearTextButton = document.querySelector("#clearText");
const deleteObjectButton = document.querySelector("#deleteObject");
const nudgeButtons = [...document.querySelectorAll("[data-nudge-x]")];
const modeButtons = [...document.querySelectorAll("[data-editor-mode]")];
const textAlignButtons = [...document.querySelectorAll("[data-text-align]")];
const nestedStudio = window.self !== window.top;

let editing = false;
let editorMode = "layout";
let selectedImageIndex = -1;
let selectedImageCurrentSrc = "";
let selectedObjectState = null;
let sections = [];
let measuredHeight = 1200;
let previewWidth = 390;
let activeAssetFilter = "pending";
let assets = [];
let gate = {
  pendingCount: 0,
  missingRequiredCount: 0,
  exportAllowed: false,
  htmlExportAllowed: false,
  coupangWingExportAllowed: false,
  coupangWingBlockers: [],
};
let wingExportBusy = false;
let cloudflareConnection = {
  connected: false,
  loading: true,
  error: null,
};
let workflow = null;
let workflowChallenge = null;
let workflowBusy = false;
let workflowApprovalNotice = {
  substitutesStageApproval: false,
  ledgerScope: "asset-file-only",
  requiredStages: [
    "G2U_APPROVAL",
    "G3U_APPROVAL",
    "G4U_APPROVAL",
    "G5U_APPROVAL",
  ],
};
let pendingSaveRequest = null;
const finalStudioSessionId = new URLSearchParams(
  window.location.search,
).get("session_id");
let finalStudioWorking = null;
const SAVE_SERIALIZATION_TIMEOUT_MS = 10_000;

function post(type, payload = {}) {
  preview.contentWindow.postMessage({ type, ...payload }, "*");
}

function setStatus(message) {
  statusNode.textContent = message;
}

function createSaveNonce() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function finishPendingSave(nonce) {
  if (!pendingSaveRequest || pendingSaveRequest.nonce !== nonce) {
    return null;
  }
  const request = pendingSaveRequest;
  pendingSaveRequest = null;
  clearTimeout(request.timeoutId);
  saveButton.disabled = false;
  return request;
}

function requestAuthoringSave() {
  if (pendingSaveRequest) {
    setStatus("현재 편집 내용을 직렬화하는 중입니다.");
    return;
  }
  const nonce = createSaveNonce();
  const timeoutId = setTimeout(() => {
    if (!finishPendingSave(nonce)) return;
    post("DETAIL_SAVE_RESULT", {
      nonce,
      ok: false,
      message: "편집 문서 응답 시간이 초과되었습니다.",
    });
    setStatus("저장 실패 · 편집 문서 응답 시간이 초과되었습니다.");
  }, SAVE_SERIALIZATION_TIMEOUT_MS);
  pendingSaveRequest = { nonce, timeoutId };
  saveButton.disabled = true;
  setStatus("현재 편집 내용을 안전하게 직렬화하는 중입니다.");
  post("DETAIL_SERIALIZE_REQUEST", { nonce });
}

async function saveSerializedAuthoring(message) {
  const request = finishPendingSave(message.nonce);
  if (!request) return;
  if (
    typeof message.html !== "string" ||
    !message.html.startsWith("<!doctype html>") ||
    message.html.length > 20_000_000
  ) {
    post("DETAIL_SAVE_RESULT", {
      nonce: request.nonce,
      ok: false,
      message: "직렬화된 편집 문서 형식이 올바르지 않습니다.",
    });
    setStatus("저장 실패 · 직렬화된 편집 문서 형식이 올바르지 않습니다.");
    return;
  }
  try {
    if (!finalStudioWorking || !finalStudioSessionId) {
      throw new Error(
        "최종 G4 working session이 없습니다. 제작을 완료한 뒤 Studio를 열어 주세요.",
      );
    }
    const editableHtmlContract = {
      ...finalStudioWorking.editable_html_contract,
      html: message.html,
    };
    const payload = await api("/api/v1/studio/working/save", {
      method: "POST",
      body: JSON.stringify({
        session_id: finalStudioSessionId,
        expected_working_snapshot_digest:
          finalStudioWorking.session.working_snapshot_digest,
        html: message.html,
        editable_html_contract: editableHtmlContract,
      }),
    });
    finalStudioWorking = {
      session: payload.session,
      editable_html_contract: editableHtmlContract,
    };
    post("DETAIL_SAVE_RESULT", {
      nonce: request.nonce,
      ok: true,
      savedAt: message.savedAt,
      backupId: null,
      wingExportRequired: true,
    });
    setStatus(
      `G4 최종 수정 저장 완료 · ${new Date(message.savedAt).toLocaleTimeString("ko-KR")} · 이후 QA와 commit을 자동 재개할 수 있습니다.`,
    );
  } catch (error) {
    post("DETAIL_SAVE_RESULT", {
      nonce: request.nonce,
      ok: false,
      message: error?.message || String(error),
    });
    setStatus(
      `저장 실패 · 이전 파일을 보존했습니다 · ${error?.message || "다시 시도해 주세요"}`,
    );
  }
}

async function initializeFinalStudioSession() {
  if (!finalStudioSessionId) {
    saveButton.disabled = true;
    setStatus(
      "최종 수정 세션이 아직 없습니다. URL-only 제작이 G4 조립과 QA까지 끝나면 자동으로 연결됩니다.",
    );
    return;
  }
  try {
    finalStudioWorking = await api(
      `/api/v1/studio/working/state?session_id=${encodeURIComponent(finalStudioSessionId)}`,
    );
    preview.src =
      `/studio-working.html?session_id=${encodeURIComponent(finalStudioSessionId)}`;
    saveButton.disabled = false;
    setStatus("완성된 G4 작업본을 불러왔습니다. 마지막 수정만 진행해 주세요.");
  } catch (error) {
    finalStudioWorking = null;
    saveButton.disabled = true;
    setStatus(`최종 수정 세션 연결 실패 · ${error.message}`);
  }
}

function renderEditingState() {
  editingStateNode.dataset.state = editing ? "editing" : "idle";
  editingStateNode.textContent = editing
    ? editorMode === "layout"
      ? "배치 편집 중"
      : "텍스트 편집 중"
    : "보기 모드";
  toggleEdit.textContent = editing ? "편집 종료" : "편집 시작";
  toggleEdit.classList.toggle("primary", !editing);
}

function stopEditing({ syncPreview = true, announce = true } = {}) {
  if (!editing && !syncPreview) return;
  editing = false;
  if (syncPreview) post("DETAIL_SET_EDITING", { enabled: false });
  selectedObjectState = null;
  selectedImageIndex = -1;
  selectedImageCurrentSrc = "";
  setElementControlsEnabled(false);
  setImageControlsEnabled(false);
  selectionDepth.innerHTML =
    "<span>선택 0</span><span>레이어 -</span><span>깊이 -</span>";
  selectedLabel.textContent = "편집 시작을 누른 뒤 요소를 선택해 주세요.";
  renderEditingState();
  if (announce) setStatus("편집을 종료했습니다. 다시 시작하려면 V 또는 T를 누르세요.");
}

function startEditing(mode = editorMode) {
  if (nestedStudio) {
    nestedStudioGuard.hidden = false;
    setStatus("중첩 Studio에서는 편집을 시작할 수 없습니다.");
    return false;
  }
  editing = true;
  post("DETAIL_SET_EDITING", { enabled: true });
  setEditorMode(mode);
  renderEditingState();
  return true;
}

function setImageControlsEnabled(enabled) {
  srcInput.disabled = !enabled;
  altInput.disabled = !enabled;
  imageFileInput.disabled = !enabled;
  applyImageButton.disabled = !enabled;
}

function colorToHex(value) {
  if (/^#[0-9a-f]{6}$/i.test(value || "")) return value.toLowerCase();
  const channels = String(value || "").match(/\d+(?:\.\d+)?/g);
  if (!channels || channels.length < 3) return "#111827";
  return `#${channels
    .slice(0, 3)
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(Number(channel))))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function setElementControlsEnabled(enabled, isText = false) {
  const layoutEnabled = enabled && editorMode === "layout";
  const textEnabled = enabled && isText && editorMode === "text";
  elementX.disabled = !layoutEnabled;
  elementY.disabled = !layoutEnabled;
  applyPositionButton.disabled = !layoutEnabled;
  elementFont.disabled = !textEnabled;
  elementColor.disabled = !textEnabled;
  clearTextButton.disabled = !textEnabled;
  deleteObjectButton.disabled = !layoutEnabled;
  nudgeButtons.forEach((button) => {
    button.disabled = !layoutEnabled;
  });
  textAlignButtons.forEach((button) => {
    button.disabled = !textEnabled;
  });
}

function setEditorMode(mode, announce = true, syncPreview = true) {
  if (!["layout", "text"].includes(mode)) return;
  editorMode = mode;
  modeButtons.forEach((button) => {
    const active = button.dataset.editorMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (syncPreview) post("DETAIL_SET_MODE", { mode });
  renderEditingState();
  setElementControlsEnabled(Boolean(selectedObjectState), Boolean(selectedObjectState?.isText));
  if (announce) {
    setStatus(
      mode === "layout"
        ? "요소 배치 · 드래그, 방향키, 좌표, 삭제만 사용할 수 있습니다."
        : "텍스트 변환 · 문구 수정, 글꼴, 색상, 정렬만 사용할 수 있습니다.",
    );
  }
}

function renderSelectedObject(message) {
  selectedObjectState = { ...(selectedObjectState || {}), ...message };
  const name =
    message.label ||
    message.objectId ||
    (message.isImage ? `이미지 #${message.imageIndex + 1}` : "요소");
  const selected = document.createElement("span");
  selected.className = "selected";
  selected.textContent = name;
  const detail = document.createTextNode(
    ` · ${message.isText ? "문구 편집" : "드래그 이동"} · ${Math.round(
      Number(message.scale || 1) * 100,
    )}% · (${Math.round(Number(message.x) || 0)}, ${Math.round(
      Number(message.y) || 0,
    )})`,
  );
  selectedLabel.replaceChildren(selected, detail);
  selectionDepth.replaceChildren(
    Object.assign(document.createElement("span"), {
      textContent: `선택 ${Number(message.selectedCount) || 1}`,
    }),
    Object.assign(document.createElement("span"), {
      textContent: `레이어 ${Number(message.layerIndex) || 1}/${Number(message.layerCount) || 1}`,
    }),
    Object.assign(document.createElement("span"), {
      textContent: `깊이 ${Number(message.domDepth) || 0} · z ${message.zIndex || "auto"}`,
    }),
  );
  elementX.value = String(Math.round(Number(message.x) || 0));
  elementY.value = String(Math.round(Number(message.y) || 0));
  const fontOption = [...elementFont.options].find(
    (option) => option.value && message.fontFamily?.includes(option.textContent),
  );
  elementFont.value = fontOption?.value || "";
  elementColor.value = colorToHex(message.color);
  textAlignButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.textAlign === (message.textAlign || "left"),
    );
  });
  setElementControlsEnabled(true, Boolean(message.isText));

  if (message.isImage) {
    selectedImageIndex = Number(message.imageIndex);
    selectedImageCurrentSrc = message.src || "";
    srcInput.value = message.src || "";
    altInput.value = message.alt || "";
    setImageControlsEnabled(true);
  } else {
    selectedImageIndex = -1;
    selectedImageCurrentSrc = "";
    srcInput.value = "";
    altInput.value = "";
    setImageControlsEnabled(false);
  }
}

async function api(pathname, options = {}) {
  const response = await fetch(pathname, {
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || "Studio 요청에 실패했습니다.",
    );
    error.code = payload?.error?.code;
    error.state = payload?.error?.state;
    throw error;
  }
  return payload;
}

function applyPreviewHeight(value, manual = false) {
  const next = Math.max(
    360,
    Math.min(100000, Math.round(Number(value) || measuredHeight)),
  );
  preview.style.height = `${next}px`;
  pageHeight.value = String(next);
  if (manual) autoHeight.checked = false;
  return next;
}

function fitPreviewHeight() {
  autoHeight.checked = true;
  applyPreviewHeight(measuredHeight);
  post("DETAIL_REQUEST_HEIGHT");
  setStatus(`내용 높이 ${measuredHeight.toLocaleString("ko-KR")}px에 맞췄습니다.`);
}

function cropModeForWidth(width = previewWidth) {
  return Number(width) <= 520 ? "mobile" : "desktop";
}

function refreshSectionCropControls() {
  const section = sections.find((item) => item.id === sectionSelect.value);
  const mode = cropModeForWidth();
  const controls = [
    sectionCropHeight,
    sectionCropApply,
    sectionCropClear,
    sectionCropMinus,
    sectionCropPlus,
  ];
  controls.forEach((control) => {
    control.disabled = !section;
  });
  sectionCropMode.textContent =
    mode === "mobile"
      ? `${previewWidth}px 모바일`
      : `${previewWidth}px 데스크톱`;
  if (!section) {
    sectionCropMeasure.textContent = "자를 섹션을 먼저 선택해 주세요.";
    return;
  }
  const cropHeight = Number(section.cropHeights?.[mode]) || null;
  const contentHeight = Math.max(
    Number(section.contentHeight) || 0,
    Number(section.renderedHeight) || 0,
  );
  if (document.activeElement !== sectionCropHeight) {
    sectionCropHeight.value = String(cropHeight || contentHeight || 900);
  }
  sectionCropMeasure.textContent = cropHeight
    ? `현재 ${cropHeight.toLocaleString("ko-KR")}px에서 하단 자름 · 전체 내용 ${contentHeight.toLocaleString("ko-KR")}px`
    : `현재 자동 높이 · 전체 내용 ${contentHeight.toLocaleString("ko-KR")}px`;
}

function refreshSectionSelect(nextId) {
  const current = nextId || sectionSelect.value;
  sectionSelect.replaceChildren(
    ...sections.map((section) => {
      const option = document.createElement("option");
      option.value = String(section.id || "");
      option.textContent = `${Number(section.index) + 1}. ${
        section.hidden ? "숨김 · " : ""
      }${String(section.label || "")}`;
      return option;
    }),
  );
  if (sections.some((section) => section.id === current)) {
    sectionSelect.value = current;
  }
  refreshSectionCropControls();
}

function setView(view) {
  document.querySelectorAll("[data-studio-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.studioView === view);
  });
  document.querySelectorAll("[data-side-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.sidePanel !== view;
  });
  document.querySelectorAll("[data-workspace]").forEach((workspace) => {
    workspace.hidden = workspace.dataset.workspace !== view;
  });
  if (view === "approval") refreshAssets();
  if (view === "workflow") {
    Promise.all([refreshWorkflow(), refreshGate()]);
  }
  if (view === "output") {
    Promise.all([refreshGate(), refreshCloudflareConnection()]);
  }
}

function updateCounts() {
  for (const state of ["pending", "approved", "rejected"]) {
    const node = document.querySelector(`#${state}AssetCount`);
    if (node) {
      node.textContent = String(
        assets.filter((asset) => asset.status === state).length,
      );
    }
  }
}

function assetCard(asset) {
  const article = document.createElement("article");
  article.className = "asset-card";
  const media = document.createElement("div");
  media.className = "asset-media";
  const image = document.createElement("img");
  image.src = asset.previewUrl;
  image.alt = `${asset.fileName} ${asset.kind === "gif" ? "GIF" : "이미지"} 검토본`;
  media.append(image);

  const copy = document.createElement("div");
  copy.className = "asset-copy";
  const top = document.createElement("div");
  top.className = "asset-topline";
  const kind = document.createElement("span");
  kind.className = "asset-kind";
  kind.textContent = asset.kind === "gif" ? "GIF" : "IMAGE";
  const state = document.createElement("span");
  state.className = `asset-status ${asset.status}`;
  state.textContent =
    asset.status === "pending"
      ? "승인 대기"
      : asset.status === "approved"
        ? "승인"
        : "반려";
  top.append(kind, state);

  const title = document.createElement("h2");
  title.textContent = asset.fileName;
  const path = document.createElement("p");
  path.textContent = asset.relativePath;
  copy.append(top, title, path);

  if (asset.status === "pending") {
    const actions = document.createElement("div");
    actions.className = "asset-actions";
    for (const decision of ["approved", "rejected"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = decision === "approved" ? "approve" : "reject";
      button.textContent = decision === "approved" ? "이 에셋 승인" : "반려";
      button.addEventListener("click", () => decideAsset(asset, decision));
      actions.append(button);
    }
    copy.append(actions);
  }
  article.append(media, copy);
  return article;
}

function renderAssets() {
  assetReviewGrid.replaceChildren();
  const filtered = assets.filter(
    (asset) => asset.status === activeAssetFilter,
  );
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      activeAssetFilter === "pending"
        ? "승인을 기다리는 에셋이 없습니다.<br>새 이미지와 GIF는 .detail-page/generation/pending에 먼저 저장하세요."
        : "이 상태의 에셋이 없습니다.";
    assetReviewGrid.append(empty);
    return;
  }
  filtered.forEach((asset) => assetReviewGrid.append(assetCard(asset)));
}

function workflowStatusLabel(status, ready = false) {
  if (ready && status === "pending") return "실행 가능";
  return (
    {
      pending: "선행 단계 대기",
      running: "실행 중",
      completed: "실행 완료",
      awaiting_user: "사용자 결정 대기",
      approved: "사용자 승인 완료",
      rejected: "사용자 반려",
      stale: "재검증 필요",
      failed: "실행 실패",
      blocked: "차단",
      blocked_external: "외부 요인 차단",
    }[status] || `알 수 없는 상태: ${status || "없음"}`
  );
}

function renderWorkflow() {
  if (!workflow) {
    workflowStageList.replaceChildren();
    workflowCurrentStage.textContent = "persistent workflow에 연결되지 않았습니다.";
    workflowStageCount.textContent = "단계 —";
    workflowReadyCount.textContent = "—";
    workflowBlockedCount.textContent = "—";
    workflowStaleCount.textContent = "—";
    workflowArtifactCount.textContent = "—";
    workflowValidatorSummary.textContent = "—";
    workflowApprovalSummary.textContent = "—";
    workflowMessage.textContent =
      "project.json의 id와 inputDigest를 확인한 뒤 다시 시도하세요.";
    return;
  }

  const entries = Object.entries(workflow.stages || {});
  const ready = new Set(workflow.ready_stages || []);
  const blocked = entries.filter(
    ([stageId, state]) =>
      (state.status === "pending" && !ready.has(stageId)) ||
      ["rejected", "failed", "blocked", "blocked_external", "stale"].includes(
        state.status,
      ),
  );
  const current =
    entries.find(([, state]) =>
      ["awaiting_user", "running"].includes(state.status),
    ) ||
    entries.find(([stageId]) => ready.has(stageId)) ||
    [...entries]
      .reverse()
      .find(([, state]) =>
        ["approved", "completed"].includes(state.status),
      );
  const qaStages = entries.filter(([stageId]) =>
    /(?:Q\d*|_QA|RUBRIC)/.test(stageId),
  );
  const completedQa = qaStages.filter(([, state]) =>
    ["completed", "approved"].includes(state.status),
  );
  const approvalStages = entries.filter(([stageId]) =>
    /(?:APPROVAL|SELECTION)$/.test(stageId),
  );
  const approvedStages = approvalStages.filter(
    ([, state]) => state.status === "approved",
  );

  workflowCurrentStage.textContent = current
    ? `현재 단계 · ${current[0]} · ${workflowStatusLabel(
        current[1].status,
        ready.has(current[0]),
      )}`
    : "현재 단계 · 전체 workflow 완료";
  workflowStageCount.textContent = `${entries.length} 단계`;
  workflowReadyCount.textContent = String(ready.size);
  workflowBlockedCount.textContent = String(blocked.length);
  workflowStaleCount.textContent = String(
    workflow.stale_artifact_count || 0,
  );
  workflowArtifactCount.textContent = String(workflow.artifact_count || 0);
  workflowValidatorSummary.textContent =
    `${completedQa.length} / ${qaStages.length}`;
  workflowApprovalSummary.textContent =
    `${approvedStages.length} / ${approvalStages.length}`;
  workflowMessage.textContent =
    ready.size > 0
      ? `실행 가능한 stage ${ready.size}개가 있습니다. 진행 버튼은 Orchestrator에 다음 작업 계산만 요청합니다.`
      : "실행 가능한 stage가 없습니다. 실행 중 작업, 사용자 challenge 또는 blocker를 확인하세요.";

  const cards = entries.map(([stageId, state], index) => {
    const isReady = ready.has(stageId);
    const card = document.createElement("article");
    card.className = "workflow-stage-card";
    card.dataset.state = isReady ? "ready" : state.status;
    card.setAttribute(
      "aria-label",
      `${index + 1}. ${stageId}, ${workflowStatusLabel(
        state.status,
        isReady,
      )}`,
    );

    const order = document.createElement("span");
    order.className = "workflow-stage-order";
    order.textContent = String(index + 1).padStart(2, "0");
    const title = document.createElement("strong");
    title.textContent = stageId;
    const status = document.createElement("span");
    status.className = "workflow-status-label";
    status.textContent =
      `상태: ${workflowStatusLabel(state.status, isReady)}`;
    const runs = document.createElement("small");
    runs.textContent = `실행 기록 ${(state.run_ids || []).length}개`;
    card.append(order, title, status, runs);
    return card;
  });
  workflowStageList.replaceChildren(...cards);
}

function renderWorkflowChallenge() {
  workflowChallengeNode.hidden = !workflowChallenge;
  if (!workflowChallenge) {
    workflowChallengeId.textContent = "";
    workflowChallengeStage.textContent = "";
    workflowChallengeDigest.textContent = "";
    workflowChallengeNonce.textContent = "";
    workflowProofConfirmed.checked = false;
    workflowRejectReason.value = "";
    workflowApproveButton.disabled = true;
    workflowRejectButton.disabled = true;
    return;
  }
  workflowChallengeId.textContent = workflowChallenge.challenge_id;
  workflowChallengeStage.textContent = workflowChallenge.stage_id;
  workflowChallengeDigest.textContent =
    workflowChallenge.subject_artifact_set_digest;
  workflowChallengeNonce.textContent = workflowChallenge.nonce;
  workflowProofConfirmed.checked = false;
  workflowRejectReason.value = "";
  workflowApproveButton.disabled = true;
  workflowRejectButton.disabled = true;
}

function renderWorkflowG5Gate() {
  const ready = Boolean(gate.coupangWingExportAllowed);
  workflowG5Gate.className = `gate-card ${ready ? "ready" : "blocked"}`;
  workflowG5Gate.textContent = ready
    ? "G5 export 가능 · G5U 사용자 승인 완료 · artifact fresh · QA 97 이상"
    : `G5 export 차단 · ${(gate.coupangWingBlockers || []).join(" · ") || "persistent workflow 상태를 확인하세요."}`;
  workflowExportSummary.textContent = ready ? "READY" : "LOCKED";
}

async function refreshWorkflow() {
  try {
    const payload = await api("/api/v1/workflow");
    workflow = payload.workflow;
    workflowApprovalNotice =
      payload.workflowApproval || workflowApprovalNotice;
    renderWorkflow();
    setStatus(
      `persistent workflow ${Object.keys(workflow.stages || {}).length}개 stage를 불러왔습니다.`,
    );
  } catch (error) {
    workflow = null;
    renderWorkflow();
    workflowMessage.textContent = `workflow 조회 실패 · ${error.message}`;
    setStatus(error.message);
  }
}

async function advanceWorkflow(resume = false) {
  if (workflowBusy) return;
  workflowBusy = true;
  workflowAdvanceButton.disabled = true;
  workflowResumeButton.disabled = true;
  workflowMessage.textContent = resume
    ? "중단 지점에서 재개 가능한 작업을 계산하는 중입니다."
    : "다음 실행 가능 작업을 계산하는 중입니다.";
  try {
    const payload = await api("/api/v1/workflow/advance", {
      method: "POST",
      body: JSON.stringify({
        until: resume ? "resume_to_next_user_gate" : "next_user_gate",
      }),
    });
    workflow = payload.workflow;
    let resultMessage;
    if (payload.result?.kind === "AwaitUser") {
      workflowChallenge = payload.result.challenge;
      renderWorkflowChallenge();
      resultMessage =
        `${payload.result.stage_id} exact 사용자 결정을 기다립니다.`;
    } else {
      resultMessage =
        payload.result?.kind === "WorkAvailable"
          ? `실행 가능한 작업: ${(payload.result.ready_stages || []).join(", ")}`
          : `Orchestrator 응답: ${payload.result?.kind || "Waiting"}`;
    }
    renderWorkflow();
    workflowMessage.textContent = resultMessage;
    await refreshGate();
  } catch (error) {
    workflowMessage.textContent = `진행 실패 · ${error.message}`;
    setStatus(error.message);
  } finally {
    workflowBusy = false;
    workflowAdvanceButton.disabled = false;
    workflowResumeButton.disabled = false;
  }
}

async function decideWorkflow(decision) {
  if (!workflowChallenge || !workflowProofConfirmed.checked) {
    workflowMessage.textContent =
      "challenge ID, exact digest와 nonce 확인에 체크해야 결정할 수 있습니다.";
    return;
  }
  const reason = workflowRejectReason.value.trim();
  if (decision === "rejected" && !reason) {
    workflowMessage.textContent =
      "반려 사유는 필수입니다. REJECTION_REASON_REQUIRED";
    workflowRejectReason.focus();
    return;
  }
  workflowApproveButton.disabled = true;
  workflowRejectButton.disabled = true;
  try {
    const payload = await api("/api/v1/workflow/decision", {
      method: "POST",
      body: JSON.stringify({
        challenge_id: workflowChallenge.challenge_id,
        nonce: workflowChallenge.nonce,
        subject_artifact_set_digest:
          workflowChallenge.subject_artifact_set_digest,
        decision,
        reason: decision === "rejected" ? reason : undefined,
      }),
    });
    workflow = payload.workflow;
    workflowChallenge = null;
    renderWorkflowChallenge();
    renderWorkflow();
    workflowMessage.textContent =
      `${payload.result.stage_id} ${decision === "approved" ? "승인" : "반려"} 완료`;
    await refreshGate();
  } catch (error) {
    workflowMessage.textContent = `결정 실패 · ${error.message}`;
    workflowApproveButton.disabled = !workflowProofConfirmed.checked;
    workflowRejectButton.disabled = !workflowProofConfirmed.checked;
  }
}

function absoluteAssetPath(source) {
  try {
    return decodeURIComponent(
      new URL(source, `${window.location.origin}/`).pathname,
    );
  } catch {
    return "";
  }
}

function isApprovedSource(source) {
  const target = absoluteAssetPath(source);
  return assets.some(
    (asset) =>
      asset.status === "approved" &&
      absoluteAssetPath(asset.previewUrl) === target,
  );
}

function renderGate() {
  const publishReady = Boolean(gate.coupangWingExportAllowed);
  exportButton.disabled = !publishReady;
  outputGate.className = `gate-card ${
    publishReady ? "ready" : "blocked"
  }`;
  outputGate.textContent = publishReady
    ? "G5 게시 게이트 통과 · 검증된 단일 HTML을 내보낼 수 있습니다."
    : `내보내기 잠김 · ${(gate.coupangWingBlockers || []).join(" · ") || "G5 승인·97/90/85·hard 0 상태를 확인해 주세요."}`;
  const approvedCount = assets.filter(
    (asset) => asset.status === "approved",
  ).length;
  outputSummary.replaceChildren(
    ...[
      ["승인 에셋", approvedCount],
      ["승인 대기", Number(gate.pendingCount) || 0],
      ["출력 상태", publishReady ? "READY" : "LOCKED"],
    ].map(([label, value]) => {
      const metric = document.createElement("div");
      metric.className = "summary-metric";
      const name = document.createElement("span");
      name.textContent = label;
      const result = document.createElement("strong");
      result.textContent = String(value);
      metric.append(name, result);
      return metric;
    }),
  );
  const wingReady = publishReady;
  wingExportGate.className = `gate-card ${wingReady ? "ready" : "blocked"}`;
  wingExportGate.textContent = wingReady
    ? `쿠팡 Wing 게이트 통과 · 상용 QA ${gate.finalQaScore}점 · 사용자 게시 승인 완료`
    : `쿠팡 Wing 내보내기 잠김 · ${(gate.coupangWingBlockers || []).join(" · ") || "G5 상태를 확인해 주세요."}`;
  wingExportButton.disabled =
    wingExportBusy || !wingReady || !cloudflareConnection.connected;
  wingExportButton.classList.toggle("busy", wingExportBusy);
  wingExportButton.textContent = wingExportBusy
    ? "Cloudflare 게시·검증 중…"
    : "쿠팡 Wing 포맷으로 내보내기";
  if (cloudflareConnection.loading) {
    wingConnectionStatus.className = "gate-card waiting";
    wingConnectionStatus.textContent =
      "프로젝트 로컬 Wrangler와 Cloudflare keyring 연결을 확인하는 중입니다.";
  } else if (cloudflareConnection.connected) {
    const connection = cloudflareConnection.connection;
    wingConnectionStatus.className = "gate-card ready";
    wingConnectionStatus.textContent =
      `Cloudflare Pages 연결됨 · ${connection.pagesProject} · ${connection.publicBaseUrl}`;
  } else {
    wingConnectionStatus.className = "gate-card blocked";
    wingConnectionStatus.textContent =
      `Cloudflare 연결 필요 · ${cloudflareConnection.error?.code || "CONFIG_REQUIRED"} · ${cloudflareConnection.error?.message || ".detail-page/cloudflare-pages.json과 OS keyring을 확인해 주세요."}`;
  }
  renderWorkflowG5Gate();
}

function renderWingExportResult(result) {
  wingExportResult.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = `완성형 WebP ${result.assetCount}개 게시 완료`;
  const path = document.createElement("p");
  path.textContent = result.relativeOutputRoot;
  const summary = document.createElement("p");
  summary.textContent =
    `정적 ${result.staticCount}개 · 애니메이션 ${result.animatedCount}개 · Cloudflare 원격 검증 통과`;
  const previewLink = document.createElement("a");
  previewLink.href = result.previewUrl;
  previewLink.target = "_blank";
  previewLink.rel = "noreferrer";
  previewLink.textContent = "780px 로컬 미리보기 열기";
  wingExportResult.append(title, path, summary, previewLink);
}

async function refreshCloudflareConnection() {
  cloudflareConnection = {
    connected: false,
    loading: true,
    error: null,
  };
  renderGate();
  try {
    const payload = await api("/api/v1/cloudflare-pages/status");
    cloudflareConnection = {
      ...payload,
      loading: false,
    };
  } catch (error) {
    cloudflareConnection = {
      connected: false,
      loading: false,
      error: {
        code: error.code || "CONNECTION_STATUS_FAILED",
        message: error.message,
        state: error.state,
      },
    };
  }
  renderGate();
}

async function refreshGate() {
  try {
    gate = await api("/api/v1/gate");
    workflowApprovalNotice =
      gate.workflowApproval || workflowApprovalNotice;
    renderGate();
  } catch (error) {
    gate = {
      ...gate,
      coupangWingExportAllowed: false,
      coupangWingBlockers: [`gate 조회 실패: ${error.message}`],
    };
    exportButton.disabled = true;
    outputGate.className = "gate-card blocked";
    outputGate.textContent =
      "승인 서버에 연결할 수 없습니다. detail-page.mjs start로 Studio v1을 실행하세요.";
    renderWorkflowG5Gate();
    setStatus(error.message);
  }
}

async function refreshAssets() {
  try {
    const payload = await api("/api/v1/assets");
    assets = payload.assets || [];
    workflowApprovalNotice =
      payload.workflowApproval || workflowApprovalNotice;
    updateCounts();
    renderAssets();
    await refreshGate();
    setStatus(`에셋 ${assets.length}개를 불러왔습니다.`);
  } catch (error) {
    assets = [];
    updateCounts();
    renderAssets();
    await refreshGate();
    setStatus(error.message);
  }
}

async function decideAsset(asset, decision) {
  const label = decision === "approved" ? "승인" : "반려";
  if (
    !confirm(
      `${asset.fileName}을 ${label}할까요?\n이 결정은 파일을 pending에서 ${decision} 폴더로 이동합니다.`,
    )
  ) {
    return;
  }
  try {
    await api("/api/v1/assets/decision", {
      method: "POST",
      body: JSON.stringify({
        relativePath: asset.relativePath,
        decision,
        confirmedByUser: true,
      }),
    });
    setStatus(`${asset.fileName} ${label} 완료`);
    await refreshAssets();
  } catch (error) {
    setStatus(`${label} 실패 · ${error.message}`);
  }
}

document.querySelectorAll("[data-studio-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.studioView));
});

document.querySelectorAll("[data-asset-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeAssetFilter = button.dataset.assetFilter;
    document.querySelectorAll("[data-asset-filter]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    renderAssets();
  });
});

workflowAdvanceButton.addEventListener("click", () =>
  advanceWorkflow(false),
);
workflowResumeButton.addEventListener("click", () =>
  advanceWorkflow(true),
);
workflowRefreshButton.addEventListener("click", async () => {
  await Promise.all([refreshWorkflow(), refreshGate()]);
});
workflowProofConfirmed.addEventListener("change", () => {
  const enabled =
    Boolean(workflowChallenge) && workflowProofConfirmed.checked;
  workflowApproveButton.disabled = !enabled;
  workflowRejectButton.disabled = !enabled;
});
workflowApproveButton.addEventListener("click", () =>
  decideWorkflow("approved"),
);
workflowRejectButton.addEventListener("click", () =>
  decideWorkflow("rejected"),
);

toggleEdit.addEventListener("click", () => {
  if (editing) {
    stopEditing();
    return;
  }
  if (startEditing(editorMode)) {
    setStatus(
      editorMode === "layout"
        ? "요소 배치 · 클릭하거나 Ctrl/Cmd+클릭으로 묶음을 선택하세요."
        : "텍스트 변환 · 클릭한 문구의 내용과 정렬을 바꾸세요.",
    );
  }
});
modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!editing) startEditing(button.dataset.editorMode);
    else setEditorMode(button.dataset.editorMode);
  });
});
saveButton.addEventListener("click", requestAuthoringSave);
undoButton.addEventListener("click", () => post("DETAIL_UNDO"));
document.querySelector("#replay").addEventListener("click", () => post("DETAIL_REPLAY_GIFS"));
document.querySelector("#reset").addEventListener("click", () => {
  if (confirm("로컬에 저장한 수정 내용을 모두 초기화할까요?")) {
    post("DETAIL_RESET");
  }
});
document.querySelector("#moveUp").addEventListener("click", () =>
  post("DETAIL_MOVE_SECTION", {
    id: sectionSelect.value,
    direction: "up",
  }),
);
document.querySelector("#moveDown").addEventListener("click", () =>
  post("DETAIL_MOVE_SECTION", {
    id: sectionSelect.value,
    direction: "down",
  }),
);
document.querySelector("#toggleSection").addEventListener("click", () => {
  const section = sections.find((item) => item.id === sectionSelect.value);
  if (section) {
    post("DETAIL_TOGGLE_SECTION", {
      id: section.id,
      hidden: !section.hidden,
    });
  }
});
sectionSelect.addEventListener("change", refreshSectionCropControls);
sectionCropMinus.addEventListener("click", () => {
  sectionCropHeight.value = String(
    Math.max(180, (Number(sectionCropHeight.value) || 900) - 100),
  );
});
sectionCropPlus.addEventListener("click", () => {
  sectionCropHeight.value = String(
    Math.min(100000, (Number(sectionCropHeight.value) || 900) + 100),
  );
});
sectionCropApply.addEventListener("click", () => {
  const section = sections.find((item) => item.id === sectionSelect.value);
  if (!section) return;
  const height = Math.max(
    180,
    Math.min(100000, Math.round(Number(sectionCropHeight.value) || 900)),
  );
  sectionCropHeight.value = String(height);
  post("DETAIL_SET_SECTION_CROP", {
    id: section.id,
    height,
    mode: cropModeForWidth(),
  });
  setStatus(
    `${previewWidth}px ${cropModeForWidth() === "mobile" ? "모바일" : "데스크톱"}에서 ‘${section.label}’ 하단을 ${height.toLocaleString("ko-KR")}px로 잘랐습니다. 상단 ‘최종 수정 저장’으로 보관할 수 있습니다.`,
  );
});
sectionCropClear.addEventListener("click", () => {
  const section = sections.find((item) => item.id === sectionSelect.value);
  if (!section) return;
  post("DETAIL_SET_SECTION_CROP", {
    id: section.id,
    height: null,
    mode: cropModeForWidth(),
  });
  setStatus(
    `${previewWidth}px ${cropModeForWidth() === "mobile" ? "모바일" : "데스크톱"}에서 ‘${section.label}’을 자동 높이로 복원했습니다.`,
  );
});
document.querySelector("#accent").addEventListener("input", (event) =>
  post("DETAIL_SET_ACCENT", { value: event.target.value }),
);
elementFont.addEventListener("change", () => {
  if (!selectedObjectState) return;
  post("DETAIL_SET_OBJECT_STYLE", {
    fontFamily: elementFont.value,
    color: elementColor.value,
  });
});
elementColor.addEventListener("input", () => {
  if (!selectedObjectState) return;
  post("DETAIL_SET_OBJECT_STYLE", {
    fontFamily: elementFont.value,
    color: elementColor.value,
  });
});
applyPositionButton.addEventListener("click", () => {
  if (!selectedObjectState) return;
  post("DETAIL_SET_OBJECT_POSITION", {
    x: Number(elementX.value) || 0,
    y: Number(elementY.value) || 0,
  });
});
nudgeButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    if (!selectedObjectState) return;
    const amount = event.shiftKey ? 10 : 1;
    post("DETAIL_NUDGE_OBJECT", {
      dx: Number(button.dataset.nudgeX) * amount,
      dy: Number(button.dataset.nudgeY) * amount,
    });
  });
});
clearTextButton.addEventListener("click", () => {
  if (!selectedObjectState?.isText) return;
  post("DETAIL_CLEAR_TEXT");
  setStatus("선택한 텍스트를 비웠습니다. 실행 취소로 되돌릴 수 있습니다.");
});
textAlignButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!selectedObjectState?.isText || editorMode !== "text") return;
    post("DETAIL_SET_TEXT_ALIGN", { value: button.dataset.textAlign });
  });
});
function confirmDelete() {
  if (!selectedObjectState || editorMode !== "layout") return false;
  const count = Number(selectedObjectState.selectedCount) || 1;
  return confirm(
    `${count > 1 ? `선택한 ${count}개 요소` : "선택한 요소"}를 삭제할까요?\n실행 취소(Ctrl/Cmd+Z)로 되돌릴 수 있습니다.`,
  );
}

deleteObjectButton.addEventListener("click", () => {
  if (!selectedObjectState || editorMode !== "layout") return;
  if (!confirmDelete()) {
    setStatus("삭제를 취소했습니다.");
    return;
  }
  post("DETAIL_DELETE_OBJECT");
  setStatus("확인한 요소를 삭제했습니다. 실행 취소로 되돌릴 수 있습니다.");
});
autoHeight.addEventListener("change", () => {
  if (autoHeight.checked) fitPreviewHeight();
  else setStatus("수동 높이 조절 모드입니다.");
});
pageHeight.addEventListener("input", () => {
  const next = applyPreviewHeight(pageHeight.value, true);
  setStatus(`미리보기 높이를 ${next.toLocaleString("ko-KR")}px로 조절했습니다.`);
});
document.querySelector("#heightMinus").addEventListener("click", () => {
  const next = applyPreviewHeight(
    preview.getBoundingClientRect().height - 100,
    true,
  );
  setStatus(`미리보기 높이를 ${next.toLocaleString("ko-KR")}px로 줄였습니다.`);
});
document.querySelector("#heightPlus").addEventListener("click", () => {
  const next = applyPreviewHeight(
    preview.getBoundingClientRect().height + 100,
    true,
  );
  setStatus(`미리보기 높이를 ${next.toLocaleString("ko-KR")}px로 늘렸습니다.`);
});
document.querySelector("#heightFit").addEventListener("click", fitPreviewHeight);
imageFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    srcInput.value = reader.result;
  };
  reader.readAsDataURL(file);
});
applyImageButton.addEventListener("click", async () => {
  if (selectedImageIndex < 0) {
    setStatus("먼저 수정 모드에서 이미지를 선택해 주세요.");
    return;
  }
  const nextSource = srcInput.value.trim();
  if (nextSource !== selectedImageCurrentSrc) {
    await refreshAssets();
    if (!isApprovedSource(nextSource)) {
      setStatus("교체할 이미지를 먼저 에셋 승인 화면에서 승인해 주세요.");
      return;
    }
  }
  post("DETAIL_SET_IMAGE", {
    index: selectedImageIndex,
    src: nextSource,
    alt: altInput.value.trim(),
  });
  selectedImageCurrentSrc = nextSource;
  setStatus(`이미지 ${selectedImageIndex + 1}번을 미리보기에 적용했습니다.`);
});
document.querySelectorAll("[data-width]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-width]").forEach((item) => {
      item.classList.toggle("primary", item === button);
    });
    previewWidth = Number(button.dataset.width);
    preview.style.width = `${previewWidth}px`;
    refreshSectionCropControls();
    setStatus(`${button.dataset.width}px 너비와 높이를 다시 계산하는 중입니다.`);
    requestAnimationFrame(() => post("DETAIL_REQUEST_HEIGHT"));
  });
});
document.querySelector("#refreshAssets").addEventListener("click", refreshAssets);
exportButton.addEventListener("click", async () => {
  try {
    await refreshGate();
    if (!gate.htmlExportAllowed) {
      setStatus("G5 게시 승인과 97/90/85·hard 0 검수를 먼저 통과해 주세요.");
      return;
    }
    exportButton.disabled = true;
    setStatus("서버가 sealed workflow와 immutable Studio revision을 다시 검증하는 중입니다.");
    const payload = await api("/api/v1/exports/html", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const anchor = document.createElement("a");
    anchor.href = payload.result.download_url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.click();
    setStatus(
      `일반 HTML 전달본 준비 완료 · ${payload.result.revision_id}`,
    );
  } catch (error) {
    setStatus(`일반 HTML 내보내기 실패 · ${error.message}`);
  } finally {
    exportButton.disabled = false;
  }
});
wingExportButton.addEventListener("click", async () => {
  await refreshGate();
  if (!gate.coupangWingExportAllowed) {
    setStatus("G5 게시 승인과 상용 QA 97점 이상이 필요합니다.");
    return;
  }
  await refreshCloudflareConnection();
  if (!cloudflareConnection.connected) {
    setStatus(
      cloudflareConnection.error?.message ||
        "Cloudflare Pages 프로젝트 config와 OS keyring 연결이 필요합니다.",
    );
    return;
  }
  wingExportBusy = true;
  wingExportResult.textContent =
    "새 namespace를 만들고 WebP 평면화·Cloudflare 업로드·원격 검증을 진행합니다.";
  renderGate();
  setStatus("쿠팡 Wing을 새 Cloudflare namespace에 게시하는 중입니다.");
  try {
    const payload = await api("/api/v1/exports/coupang-wing", {
      method: "POST",
      body: JSON.stringify({}),
    });
    renderWingExportResult(payload.result);
    setStatus(
      `쿠팡 Wing 게시 완료 · ${payload.result.assetCount}개 WebP · 원격 검증 통과`,
    );
  } catch (error) {
    wingExportResult.textContent =
      `게시 실패 · ${error.code || "EXPORT_FAILED"} · ${error.message}`;
    setStatus(`${error.state || "failed"} · ${error.message}`);
  } finally {
    wingExportBusy = false;
    renderGate();
  }
});

document.addEventListener("keydown", (event) => {
  const inControl = event.target.closest("input,select,textarea,[contenteditable]");
  if (event.key === "Escape" && editing) {
    event.preventDefault();
    stopEditing();
    return;
  }
  if (!inControl && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.key.toLowerCase() === "v") {
      event.preventDefault();
      if (!editing) startEditing("layout");
      else setEditorMode("layout");
      return;
    }
    if (event.key.toLowerCase() === "t") {
      event.preventDefault();
      if (!editing) startEditing("text");
      else setEditorMode("text");
      return;
    }
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "z" &&
    !inControl
  ) {
    event.preventDefault();
    post("DETAIL_UNDO");
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== preview.contentWindow) return;
  const message = event.data || {};
  if (message.type === "DETAIL_SERIALIZED") {
    void saveSerializedAuthoring(message);
    return;
  }
  if (message.type === "DETAIL_READY") {
    if (Number(message.height) > 0) {
      measuredHeight = Math.ceil(Number(message.height));
      heightMeasure.textContent = `실제 내용 높이 ${measuredHeight.toLocaleString("ko-KR")}px`;
      if (autoHeight.checked) applyPreviewHeight(measuredHeight);
    }
    sections = message.sections || [];
    refreshSectionSelect();
    if (!editing) {
      setStatus(
        `${message.sectionCount}개 섹션 · 수정 문구 ${message.editableCount}개 · 이미지 ${message.imageCount}개 준비됨`,
      );
    }
  }
  if (message.type === "DETAIL_HISTORY_CHANGED") {
    undoButton.disabled = !message.canUndo;
  }
  if (message.type === "DETAIL_EXPORT_PROGRESS") {
    setStatus(`단일 HTML 에셋 포함 중 · ${message.completed}/${message.total}`);
  }
  if (message.type === "DETAIL_EXPORTED") {
    setStatus(`${message.filename} 파일을 다운로드 폴더에 저장했습니다.`);
  }
  if (message.type === "DETAIL_EXPORT_ERROR") {
    setStatus(`다운로드 실패 · ${message.message || "다시 시도해 주세요."}`);
  }
  if (message.type === "DETAIL_IMAGE_SELECTED") {
    selectedImageIndex = message.index;
    selectedImageCurrentSrc = message.src;
    srcInput.value = message.src;
    altInput.value = message.alt;
    const selected = document.createElement("span");
    selected.className = "selected";
    selected.textContent = String(
      message.assetId || `이미지 #${Number(message.index) + 1}`,
    );
    selectedLabel.replaceChildren(
      selected,
      document.createTextNode(" 선택됨"),
    );
    setImageControlsEnabled(true);
  }
  if (message.type === "DETAIL_OBJECT_SELECTED") {
    renderSelectedObject(message);
  }
  if (message.type === "DETAIL_OBJECT_CHANGED") {
    renderSelectedObject({
      ...(selectedObjectState || {}),
      ...message,
      isImage: selectedImageIndex >= 0,
      imageIndex: selectedImageIndex,
      src: srcInput.value,
      alt: altInput.value,
    });
    setStatus(
      `${message.label || message.objectId || "요소"} · ${Math.round(
        Number(message.scale || 1) * 100,
      )}% · 위치 (${Math.round(Number(message.x) || 0)}, ${Math.round(
        Number(message.y) || 0,
      )})`,
    );
  }
  if (message.type === "DETAIL_SELECTION_CLEARED") {
    selectedObjectState = null;
    selectedImageIndex = -1;
    selectedImageCurrentSrc = "";
    selectedLabel.textContent =
      editorMode === "layout"
        ? "요소 배치 모드에서 옮길 요소를 선택해 주세요."
        : "텍스트 변환 모드에서 바꿀 문구를 선택해 주세요.";
    setElementControlsEnabled(false);
    setImageControlsEnabled(false);
    selectionDepth.innerHTML =
      "<span>선택 0</span><span>레이어 -</span><span>깊이 -</span>";
  }
  if (message.type === "DETAIL_EDITING_STOPPED") {
    stopEditing({ syncPreview: false });
  }
  if (message.type === "DETAIL_MODE_CHANGED") {
    setEditorMode(message.mode, false, false);
  }
});

setImageControlsEnabled(false);
setElementControlsEnabled(false);
renderEditingState();
if (nestedStudio) {
  nestedStudioGuard.hidden = false;
  const app = document.querySelector(".app");
  app.inert = true;
  app.setAttribute("aria-hidden", "true");
}
refreshGate();
refreshCloudflareConnection();
initializeFinalStudioSession();
