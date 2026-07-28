const preview = document.querySelector("#preview");
const toggleEdit = document.querySelector("#toggleEdit");
const statusNode = document.querySelector("#status");
const srcInput = document.querySelector("#imageSrc");
const altInput = document.querySelector("#imageAlt");
const selectedLabel = document.querySelector("#selectedLabel");
const sectionSelect = document.querySelector("#sectionSelect");
const autoHeight = document.querySelector("#autoHeight");
const pageHeight = document.querySelector("#pageHeight");
const heightMeasure = document.querySelector("#heightMeasure");
const assetReviewGrid = document.querySelector("#assetReviewGrid");
const exportButton = document.querySelector("#exportHtml");
const outputGate = document.querySelector("#outputGate");
const outputSummary = document.querySelector("#outputSummary");
const wingExportButton = document.querySelector("#exportCoupangWing");
const wingCdnBaseUrl = document.querySelector("#wingCdnBaseUrl");
const wingExportGate = document.querySelector("#wingExportGate");
const wingExportResult = document.querySelector("#wingExportResult");
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
const wingCdnStorageKey = `detail-page-maker:wing-cdn:${location.pathname}`;

let editing = false;
let editorMode = "layout";
let selectedImageIndex = -1;
let selectedImageCurrentSrc = "";
let selectedObjectState = null;
let sections = [];
let measuredHeight = 1200;
let activeAssetFilter = "pending";
let assets = [];
let gate = {
  pendingCount: 0,
  missingRequiredCount: 0,
  exportAllowed: false,
  coupangWingExportAllowed: false,
  coupangWingBlockers: [],
};
let wingExportBusy = false;

function post(type, payload = {}) {
  preview.contentWindow.postMessage({ type, ...payload }, "*");
}

function setStatus(message) {
  statusNode.textContent = message;
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
    throw new Error(payload?.error?.message || "Studio 요청에 실패했습니다.");
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

function refreshSectionSelect(nextId) {
  const current = nextId || sectionSelect.value;
  sectionSelect.innerHTML = sections
    .map(
      (section) =>
        `<option value="${section.id}">${section.index + 1}. ${
          section.hidden ? "숨김 · " : ""
        }${section.label}</option>`,
    )
    .join("");
  if (sections.some((section) => section.id === current)) {
    sectionSelect.value = current;
  }
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
  if (view === "output") refreshGate();
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
        ? "승인을 기다리는 에셋이 없습니다.<br>새 이미지와 GIF는 asset/generated/pending에 먼저 저장하세요."
        : "이 상태의 에셋이 없습니다.";
    assetReviewGrid.append(empty);
    return;
  }
  filtered.forEach((asset) => assetReviewGrid.append(assetCard(asset)));
}

function absoluteAssetPath(source) {
  try {
    return decodeURIComponent(
      new URL(source, preview.contentWindow.location.href).pathname,
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
  exportButton.disabled = !gate.exportAllowed;
  outputGate.className = `gate-card ${
    gate.exportAllowed ? "ready" : "blocked"
  }`;
  outputGate.textContent = gate.exportAllowed
    ? "승인 게이트 통과 · 게시용 단일 HTML을 내보낼 수 있습니다."
    : `내보내기 잠김 · 승인 대기 ${gate.pendingCount}개 · 필수 미승인 ${gate.missingRequiredCount}개`;
  const approvedCount = assets.filter(
    (asset) => asset.status === "approved",
  ).length;
  outputSummary.innerHTML = `
    <div class="summary-metric"><span>승인 에셋</span><strong>${approvedCount}</strong></div>
    <div class="summary-metric"><span>승인 대기</span><strong>${gate.pendingCount}</strong></div>
    <div class="summary-metric"><span>출력 상태</span><strong>${gate.exportAllowed ? "READY" : "LOCKED"}</strong></div>
  `;
  const wingReady = Boolean(gate.coupangWingExportAllowed);
  wingExportGate.className = `gate-card ${wingReady ? "ready" : "blocked"}`;
  wingExportGate.textContent = wingReady
    ? `쿠팡 Wing 게이트 통과 · 상용 QA ${gate.finalQaScore}점 · 사용자 게시 승인 완료`
    : `쿠팡 Wing 내보내기 잠김 · ${(gate.coupangWingBlockers || []).join(" · ") || "G5 상태를 확인해 주세요."}`;
  wingExportButton.disabled =
    wingExportBusy || !wingReady || !isValidCdnBaseUrl(wingCdnBaseUrl.value);
  wingExportButton.classList.toggle("busy", wingExportBusy);
  wingExportButton.textContent = wingExportBusy
    ? "780px WebP 패키지 생성 중…"
    : "쿠팡 Wing 포맷으로 내보내기";
}

function isValidCdnBaseUrl(value) {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function renderWingExportResult(result) {
  wingExportResult.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = `완성형 WebP ${result.assetCount}개 생성 완료`;
  const path = document.createElement("p");
  path.textContent = result.relativeOutputRoot;
  const summary = document.createElement("p");
  summary.textContent =
    `정적 ${result.staticCount}개 · 애니메이션 ${result.animatedCount}개 · CDN 원격 검증 대기`;
  const previewLink = document.createElement("a");
  previewLink.href = result.previewUrl;
  previewLink.target = "_blank";
  previewLink.rel = "noreferrer";
  previewLink.textContent = "780px 로컬 미리보기 열기";
  wingExportResult.append(title, path, summary, previewLink);
}

async function refreshGate() {
  try {
    gate = await api("/api/v1/gate");
    renderGate();
  } catch (error) {
    exportButton.disabled = true;
    outputGate.className = "gate-card blocked";
    outputGate.textContent =
      "승인 서버에 연결할 수 없습니다. detail-page.mjs start로 Studio v1을 실행하세요.";
    setStatus(error.message);
  }
}

async function refreshAssets() {
  try {
    const payload = await api("/api/v1/assets");
    assets = payload.assets || [];
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

toggleEdit.addEventListener("click", () => {
  editing = !editing;
  toggleEdit.textContent = editing ? "편집 종료" : "편집 시작";
  toggleEdit.classList.toggle("primary", !editing);
  post("DETAIL_SET_EDITING", { enabled: editing });
  if (editing) post("DETAIL_SET_MODE", { mode: editorMode });
  setStatus(
    editing
      ? editorMode === "layout"
        ? "요소 배치 · 클릭한 요소를 이동하거나 크기를 조절하세요."
        : "텍스트 변환 · 클릭한 문구의 내용과 정렬을 바꾸세요."
      : "미리보기 모드입니다.",
  );
  if (!editing) {
    selectedObjectState = null;
    setElementControlsEnabled(false);
    setImageControlsEnabled(false);
  }
});
modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!editing) {
      editing = true;
      toggleEdit.textContent = "편집 종료";
      toggleEdit.classList.remove("primary");
      post("DETAIL_SET_EDITING", { enabled: true });
    }
    setEditorMode(button.dataset.editorMode);
  });
});
document.querySelector("#save").addEventListener("click", () => post("DETAIL_SAVE"));
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
deleteObjectButton.addEventListener("click", () => {
  if (!selectedObjectState || editorMode !== "layout") return;
  post("DETAIL_DELETE_OBJECT");
  setStatus("선택한 요소를 삭제했습니다. 실행 취소로 되돌릴 수 있습니다.");
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
    preview.style.width = `${button.dataset.width}px`;
    setStatus(`${button.dataset.width}px 너비와 높이를 다시 계산하는 중입니다.`);
    requestAnimationFrame(() => post("DETAIL_REQUEST_HEIGHT"));
  });
});
document.querySelector("#refreshAssets").addEventListener("click", refreshAssets);
exportButton.addEventListener("click", async () => {
  await refreshGate();
  if (!gate.exportAllowed) {
    setStatus("승인 대기 에셋을 먼저 결정해 주세요.");
    return;
  }
  post("DETAIL_EXPORT_HTML");
  setStatus("CSS와 승인 에셋을 포함한 단일 HTML을 준비하는 중입니다.");
});
wingCdnBaseUrl.value = localStorage.getItem(wingCdnStorageKey) || "";
wingCdnBaseUrl.addEventListener("input", () => {
  localStorage.setItem(wingCdnStorageKey, wingCdnBaseUrl.value.trim());
  renderGate();
});
wingExportButton.addEventListener("click", async () => {
  await refreshGate();
  if (!gate.coupangWingExportAllowed) {
    setStatus("G5 게시 승인과 상용 QA 97점 이상이 필요합니다.");
    return;
  }
  const cdnBaseUrl = wingCdnBaseUrl.value.trim().replace(/\/+$/, "");
  if (!isValidCdnBaseUrl(cdnBaseUrl)) {
    setStatus("새 revision이 포함된 HTTPS CDN 기본 주소를 입력해 주세요.");
    return;
  }
  wingExportBusy = true;
  wingExportResult.textContent =
    "섹션을 평면화하고 정적·애니메이션 WebP를 만드는 중입니다.";
  renderGate();
  setStatus("쿠팡 Wing 780px WebP 패키지를 생성하는 중입니다.");
  try {
    const payload = await api("/api/v1/exports/coupang-wing", {
      method: "POST",
      body: JSON.stringify({ cdnBaseUrl }),
    });
    renderWingExportResult(payload.result);
    setStatus(
      `쿠팡 Wing 패키지 생성 완료 · ${payload.result.assetCount}개 WebP · CDN 업로드 후 원격 검증 필요`,
    );
  } catch (error) {
    wingExportResult.textContent = `생성 실패 · ${error.message}`;
    setStatus(error.message);
  } finally {
    wingExportBusy = false;
    renderGate();
  }
});

document.addEventListener("keydown", (event) => {
  const inControl = event.target.closest("input,select,textarea,[contenteditable]");
  if (!inControl && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.key.toLowerCase() === "v") {
      event.preventDefault();
      if (!editing) {
        editing = true;
        toggleEdit.textContent = "편집 종료";
        toggleEdit.classList.remove("primary");
        post("DETAIL_SET_EDITING", { enabled: true });
      }
      setEditorMode("layout");
      return;
    }
    if (event.key.toLowerCase() === "t") {
      event.preventDefault();
      if (!editing) {
        editing = true;
        toggleEdit.textContent = "편집 종료";
        toggleEdit.classList.remove("primary");
        post("DETAIL_SET_EDITING", { enabled: true });
      }
      setEditorMode("text");
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
  const message = event.data || {};
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
  if (message.type === "DETAIL_SAVED") {
    setStatus(
      `로컬 저장 완료 · ${new Date(message.savedAt).toLocaleTimeString("ko-KR")}`,
    );
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
    selectedLabel.innerHTML = `<span class="selected">${
      message.assetId || `이미지 #${message.index + 1}`
    }</span> 선택됨`;
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
  }
  if (message.type === "DETAIL_MODE_CHANGED") {
    setEditorMode(message.mode, false, false);
  }
});

setImageControlsEnabled(false);
setElementControlsEnabled(false);
refreshGate();
