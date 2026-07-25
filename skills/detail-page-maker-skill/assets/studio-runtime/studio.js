const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const PHASE_LABELS = {
  planning: "기획",
  asset_production: "에셋 제작",
  asset_review: "에셋 검수",
  assembly_ready: "조립 준비",
  html_editing: "HTML 편집",
  final_qa: "최종 QA",
  published: "게시 승인",
};

const STATUS_LABELS = {
  approved: "승인",
  cancelled: "취소",
  completed: "완료",
  draft: "초안",
  failed: "실패",
  generating: "생성 중",
  held: "보류",
  qa_pending: "QA 대기",
  queued: "대기",
  rejected: "반려",
  review_ready: "사용자 검수",
  running: "진행 중",
  superseded: "이전 버전",
};

const state = {
  project: null,
  view: "assets",
  selectedAssetId: null,
  selectedLayerId: null,
  selectedHtmlLayerId: null,
  compareMode: "side",
  compareZoom: 100,
  htmlWidth: "800",
  htmlEditing: false,
  htmlHistory: [],
  htmlHistoryIndex: 0,
  htmlPendingBefore: null,
  htmlSaveTimer: null,
  promptMode: "asset",
  eventSource: null,
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || "요청을 처리하지 못했습니다.");
    error.code = payload.error?.code;
    error.details = payload.error?.details;
    throw error;
  }
  return payload;
}

function toast(message, kind = "success") {
  const item = document.createElement("div");
  item.className = `toast${kind === "error" ? " is-error" : ""}`;
  item.textContent = message;
  $("#toastRegion").append(item);
  setTimeout(() => item.remove(), 4200);
}

function setSaveState(message) {
  $("#saveState").textContent = message;
}

function pathUrl(relativePath) {
  return `/project/${String(relativePath || "")
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function selectedAsset() {
  return state.project?.assetList?.find(
    (asset) => asset.id === state.selectedAssetId,
  );
}

function activeJobs() {
  return Object.values(state.project?.jobs || {}).filter((job) =>
    ["queued", "running"].includes(job.status),
  );
}

function isAssetWritable() {
  return Boolean(state.project?.permissions?.assetWrite);
}

function isHtmlWritable() {
  return Boolean(state.project?.permissions?.htmlWrite);
}

async function refresh({ quiet = false } = {}) {
  if (!quiet) setSaveState("동기화 중");
  state.project = await api("/api/project");
  if (
    state.selectedAssetId &&
    !state.project.assetList.some((asset) => asset.id === state.selectedAssetId)
  ) {
    state.selectedAssetId = null;
  }
  if (!state.selectedAssetId && state.project.assetList.length) {
    state.selectedAssetId = state.project.assetList[0].id;
  }
  render();
  setSaveState("저장됨");
}

function render() {
  const project = state.project;
  if (!project) return;
  $("#projectName").textContent = project.name;
  $("#revisionBadge").textContent = project.currentRevisionId.toUpperCase();
  $("#phaseBadge").textContent = PHASE_LABELS[project.phase] || project.phase;
  $("#jobCount").textContent = activeJobs().length;
  $("#newRevision").hidden = !["html_editing", "final_qa", "published"].includes(
    project.phase,
  );
  $("#assetReadOnlyNotice").hidden = isAssetWritable();
  $("#motionReadOnlyNotice").hidden = isAssetWritable();
  $("#uploadAsset").disabled = !isAssetWritable();
  $("#requestAssetGeneration").disabled =
    !isAssetWritable() || !state.selectedAssetId;
  $("#requestMotionRender").disabled =
    !isAssetWritable() || !isMotionAsset(selectedAsset());
  updateStageStates();
  renderAssets();
  renderMotion();
  renderAssembly();
  renderHtml();
  renderQa();
  renderInspector();
  renderJobs();
}

function updateStageStates() {
  const project = state.project;
  $$(".stage-button").forEach((button) => {
    const view = button.dataset.view;
    button.classList.toggle("is-active", view === state.view);
    button.setAttribute("aria-selected", String(view === state.view));
    let disabled = false;
    let status = "pending";
    if (view === "assets") {
      status = isAssetWritable() ? "ready" : "locked";
    }
    if (view === "motion") {
      const hasMotion = project.assetList.some(isMotionAsset);
      status = isAssetWritable() && hasMotion ? "ready" : isAssetWritable() ? "pending" : "locked";
    }
    if (view === "assembly") {
      status = project.phase === "assembly_ready" ? "ready" : project.activeRevision.assembly ? "locked" : "pending";
    }
    if (view === "html") {
      disabled = !["html_editing", "final_qa", "published"].includes(project.phase);
      status = disabled ? "pending" : project.phase === "published" ? "locked" : "ready";
    }
    if (view === "qa") {
      disabled = !["html_editing", "final_qa", "published"].includes(project.phase);
      status = project.finalQa.status === "passed" ? "ready" : "pending";
    }
    button.disabled = disabled;
    button.dataset.state = status;
  });
  $$("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === state.view;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

function versionStatus(asset) {
  return asset.selectedData?.status || (asset.selectedVersion ? "draft" : "draft");
}

function renderAssets() {
  const assets = state.project.assetList;
  const approved = assets.filter(
    (asset) => asset.selectedData?.approval?.decision === "approved",
  ).length;
  $("#assetSummary").textContent = `${assets.length}개 · 승인 ${approved}개`;
  $("#assetList").innerHTML =
    assets.length === 0
      ? `<div class="empty-inspector">등록된 에셋이 없습니다.<br />제품 SSOT나 생성할 첫 이미지를 등록하세요.</div>`
      : assets
          .map((asset) => {
            const version = asset.selectedData;
            const thumb = version?.path
              ? `<img src="${pathUrl(version.path)}" alt="" />`
              : asset.kind.toUpperCase();
            const status = versionStatus(asset);
            return `<button type="button" class="asset-card${asset.id === state.selectedAssetId ? " is-selected" : ""}" data-asset-id="${asset.id}">
              <span class="asset-thumb">${thumb}</span>
              <span class="asset-meta">
                <strong>${escapeHtml(asset.name)}</strong>
                <span>${escapeHtml(asset.role)} · v${asset.selectedVersion || "-"}</span>
                <span class="status-text" data-status="${status}">${STATUS_LABELS[status] || status}</span>
              </span>
            </button>`;
          })
          .join("");
  $$("[data-asset-id]", $("#assetList")).forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAssetId = button.dataset.assetId;
      state.selectedLayerId = null;
      render();
    });
  });
  renderCompare();
}

function renderCompare() {
  const asset = selectedAsset();
  const canvas = $("#compareCanvas");
  if (!asset || asset.versions.length === 0) {
    canvas.innerHTML = `<div class="empty-state"><strong>검수할 에셋을 선택하세요.</strong><p>원본과 현재 후보를 같은 확대율로 비교합니다.</p></div>`;
    return;
  }
  const original = asset.versions[0];
  const candidate =
    asset.versions.find((version) => version.number === asset.selectedVersion) ||
    original;
  const zoom = state.compareZoom / 100;
  const isVideo = (version) =>
    asset.kind === "video" || String(version.mime || "").startsWith("video/");
  const media = (version, className = "") =>
    isVideo(version)
      ? `<video class="${className}" src="${pathUrl(version.path)}" muted playsinline preload="metadata" style="width:${Math.round(560 * zoom)}px"></video>`
      : `<img class="${className}" src="${pathUrl(version.path)}" alt="" style="width:${Math.round(560 * zoom)}px" />`;
  const syncControls = isMotionAsset(asset)
    ? `<div class="compare-sync">
        <button id="compareReplay" class="button button-quiet" type="button">${isVideo(original) ? "동시 재생" : "동시 재시작"}</button>
        ${
          isVideo(original) && isVideo(candidate)
            ? `<label>같은 시점<input id="compareTime" type="range" min="0" max="1000" value="0" /><span id="compareTimecode">00:00.00</span></label>`
            : `<span>GIF는 동시에 다시 시작하고, 정확한 프레임 비교는 QA MP4에서 수행합니다.</span>`
        }
      </div>`
    : "";
  if (state.compareMode === "side") {
    canvas.innerHTML = `${syncControls}<div class="compare-pair">
      <div class="compare-frame">
        <div class="compare-label"><span>원본</span><span>v${original.number}</span></div>
        <div class="compare-image-shell">${media(original)}</div>
      </div>
      <div class="compare-frame">
        <div class="compare-label"><span>현재 후보</span><span>v${candidate.number}</span></div>
        <div class="compare-image-shell">${media(candidate)}</div>
      </div>
    </div>`;
    bindCompareInteractions(asset);
    return;
  }
  const difference = state.compareMode === "difference";
  canvas.innerHTML = `${syncControls}<div class="compare-overlay">
    ${media(original)}
    ${media(candidate, difference ? "difference-image" : "candidate-overlay")}
    ${
      difference
        ? ""
        : `<label class="overlay-control">후보 투명도<input id="overlayOpacity" type="range" min="0" max="100" value="55" /></label>`
    }
  </div>`;
  if (!difference) {
    const overlay = $(".candidate-overlay", canvas);
    $("#overlayOpacity", canvas).addEventListener("input", (event) => {
      overlay.style.opacity = Number(event.target.value) / 100;
    });
    overlay.style.opacity = ".55";
  }
  bindCompareInteractions(asset);
}

function bindCompareInteractions(asset) {
  const shells = $$(".compare-image-shell", $("#compareCanvas"));
  let syncing = false;
  shells.forEach((shell) =>
    shell.addEventListener("scroll", () => {
      if (syncing) return;
      syncing = true;
      shells.forEach((other) => {
        if (other === shell) return;
        other.scrollLeft = shell.scrollLeft;
        other.scrollTop = shell.scrollTop;
      });
      requestAnimationFrame(() => {
        syncing = false;
      });
    }),
  );
  $("#compareReplay")?.addEventListener("click", async () => {
    const videos = $$("#compareCanvas video");
    if (videos.length) {
      videos.forEach((video) => {
        video.currentTime = 0;
      });
      await Promise.all(videos.map((video) => video.play().catch(() => undefined)));
      return;
    }
    const stamp = Date.now();
    $$("#compareCanvas img").forEach((image) => {
      const source = new URL(image.src);
      source.searchParams.set("sync", stamp);
      image.src = source;
    });
  });
  $("#compareTime")?.addEventListener("input", (event) => {
    const progress = Number(event.target.value) / 1000;
    const videos = $$("#compareCanvas video");
    videos.forEach((video) => {
      if (Number.isFinite(video.duration)) video.currentTime = progress * video.duration;
    });
    const first = videos.find((video) => Number.isFinite(video.duration));
    $("#compareTimecode").textContent = formatTime(first?.currentTime || 0);
  });
}

function isMotionAsset(asset) {
  return Boolean(asset && ["gif", "video", "hyperframes"].includes(asset.kind));
}

function selectedLayers() {
  return selectedAsset()?.selectedData?.layers || [];
}

function selectedMotionLayer() {
  return selectedLayers().find((layer) => layer.id === state.selectedLayerId) || null;
}

function renderMotion() {
  const motionAssets = state.project.assetList.filter(isMotionAsset);
  let asset = selectedAsset();
  if (!isMotionAsset(asset)) asset = motionAssets[0] || null;
  if (asset && asset.id !== state.selectedAssetId && state.view === "motion") {
    state.selectedAssetId = asset.id;
  }
  const layers = asset?.selectedData?.layers || [];
  $("#layerSummary").textContent = asset ? `${layers.length}개 · ${asset.name}` : "선택 없음";
  $("#layerList").innerHTML =
    layers.length === 0
      ? `<div class="empty-inspector">${asset ? "등록된 레이어 manifest가 없습니다." : "GIF 에셋이 없습니다."}</div>`
      : layers
          .map(
            (layer) => `<button type="button" class="layer-item${layer.id === state.selectedLayerId ? " is-selected" : ""}" data-layer="${escapeHtml(layer.id)}">
              <span class="layer-type">${escapeHtml((layer.type || "layer").slice(0, 3).toUpperCase())}</span>
              <span>${escapeHtml(layer.name || layer.id)}</span>
              <span class="layer-visibility">${layer.hidden ? "숨김" : layer.locked ? "잠금" : "표시"}</span>
            </button>`,
          )
          .join("");
  $$("[data-layer]", $("#layerList")).forEach((button) =>
    button.addEventListener("click", () => {
      state.selectedLayerId = button.dataset.layer;
      renderMotion();
      renderInspector();
    }),
  );
  $("#timelineTracks").innerHTML = layers
    .map(
      (layer, index) =>
        `<div class="timeline-track" style="margin-left:${Math.min(index * 8, 80)}px;width:${Math.max(32, 95 - index * 3)}%"></div>`,
    )
    .join("");
  const canvas = $("#motionCanvas");
  if (!asset?.selectedData?.path) {
    canvas.innerHTML = `<div class="empty-state"><strong>GIF 또는 HyperFrames 에셋을 선택하세요.</strong><p>제품·텍스트·도형·FX를 독립 레이어로 표시합니다.</p></div>`;
  } else {
    const tag = asset.kind === "video" ? "video" : "img";
    canvas.innerHTML =
      tag === "video"
        ? `<video id="motionMedia" class="motion-preview" src="${pathUrl(asset.selectedData.path)}" muted playsinline></video>`
        : `<img id="motionMedia" class="motion-preview" src="${pathUrl(asset.selectedData.path)}" alt="${escapeHtml(asset.name)}" />`;
  }
}

function renderAssembly() {
  const assets = state.project.assetList.filter((asset) => asset.required);
  const approved = assets.filter(
    (asset) => asset.selectedData?.approval?.decision === "approved",
  );
  const pendingJobs = activeJobs();
  $("#assemblySummary").textContent = `${approved.length}/${assets.length} 승인 · 작업 ${pendingJobs.length}개`;
  $("#assemblyAssets").innerHTML =
    assets.length === 0
      ? `<div class="empty-inspector">조립 필수 에셋을 먼저 등록하세요.</div>`
      : assets
          .map((asset) => {
            const version = asset.selectedData;
            const pass = version?.approval?.decision === "approved";
            return `<div class="gate-row">
              <div><strong>${escapeHtml(asset.name)}</strong><span>${escapeHtml(asset.role)} · v${asset.selectedVersion || "-"} · ${version?.sha256?.slice(0, 12) || "해시 없음"}</span></div>
              <span class="gate-result ${pass ? "is-pass" : "is-fail"}">${pass ? "승인" : "미승인"}</span>
            </div>`;
          })
          .join("");
  $("#lockAssembly").disabled =
    state.project.phase !== "assembly_ready" ||
    assets.length === 0 ||
    pendingJobs.length > 0;
}

function renderHtml() {
  $("#toggleHtmlEdit").disabled = !isHtmlWritable();
  $("#createCheckpoint").disabled = !isHtmlWritable();
  $("#undoHtml").disabled =
    !isHtmlWritable() || state.htmlHistoryIndex === 0;
  $("#redoHtml").disabled =
    !isHtmlWritable() ||
    state.htmlHistoryIndex >= state.htmlHistory.length;
  $("#htmlFrame").style.width = `${state.htmlWidth}px`;
  $$("[data-html-width]").forEach((button) =>
    button.classList.toggle("is-active", button.dataset.htmlWidth === state.htmlWidth),
  );
}

function renderQa() {
  const qa = state.project.finalQa;
  $("#qaScore").textContent = qa.score ?? "-";
  $("#qaStatus").textContent =
    qa.status === "passed"
      ? "게시 기준 통과"
      : qa.status === "failed"
        ? "수정 필요"
        : "아직 검사하지 않음";
  const gates = [
    ["상용 점수 97점 이상", Number(qa.score) >= 97],
    ["하드 실패 0건", qa.hardFailures.length === 0 && qa.status !== "not_requested"],
    ["사용자 최종 승인", qa.userApproved === true],
    ["조립 잠금 존재", Boolean(state.project.activeRevision.assembly)],
    ["미처리 작업 0개", activeJobs().length === 0],
  ];
  $("#qaGateList").innerHTML = gates
    .map(
      ([label, pass]) => `<div class="gate-row"><div><strong>${label}</strong></div><span class="gate-result ${pass ? "is-pass" : "is-fail"}">${pass ? "통과" : "대기"}</span></div>`,
    )
    .join("");
  $("#requestFinalQa").disabled = !["html_editing", "final_qa"].includes(
    state.project.phase,
  );
  $("#approveFinal").disabled =
    qa.status !== "passed" || qa.score < 97 || qa.hardFailures.length > 0;
  $("#exportPublish").disabled = !state.project.permissions.publish;
}

function renderInspector() {
  const inspector = $("#inspectorBody");
  const title = $("#inspectorTitle");
  const dot = $("#inspectorState");
  dot.className = "state-dot";
  if (state.view === "html") {
    renderHtmlInspector(inspector, title, dot);
    return;
  }
  if (state.view === "motion" && state.selectedLayerId) {
    renderMotionLayerInspector(inspector, title, dot);
    return;
  }
  const asset = selectedAsset();
  if (!asset) {
    title.textContent = "선택 없음";
    inspector.innerHTML = `<div class="empty-inspector">에셋이나 HTML 레이어를 선택하면 속성과 프롬프트 수정 범위가 표시됩니다.</div>`;
    return;
  }
  const version = asset.selectedData;
  const qa = version?.qa;
  title.textContent = asset.name;
  dot.classList.add(
    version?.approval?.decision === "approved"
      ? "is-ready"
      : qa?.hardFailures?.length
        ? "is-error"
        : "is-warning",
  );
  inspector.innerHTML = `
    <section class="inspector-section">
      <h2>선택 에셋</h2>
      <div class="property-list">
        <div class="property-row"><span>역할</span><strong>${escapeHtml(asset.role)}</strong></div>
        <div class="property-row"><span>종류</span><strong>${escapeHtml(asset.kind)}</strong></div>
        <div class="property-row"><span>버전</span><strong>v${asset.selectedVersion || "-"}</strong></div>
        <div class="property-row"><span>SHA-256</span><strong>${escapeHtml(version?.sha256?.slice(0, 18) || "-")}</strong></div>
        <div class="property-row"><span>권한</span><strong>${isAssetWritable() ? "수정 가능" : "읽기 전용"}</strong></div>
      </div>
    </section>
    <section class="inspector-section">
      <h2>Codex 시각 QA</h2>
      <p class="qa-message">${qa?.status === "passed" ? "제품 동일성 하드 실패 없이 QA를 통과했습니다." : qa?.status === "failed" ? "제품 동일성 오류를 수정해야 합니다." : "QA 작업 결과를 기다리고 있습니다."}</p>
      ${(qa?.hardFailures || []).length ? `<ul class="failure-list">${qa.hardFailures.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${(qa?.warnings || []).length ? `<ul class="warning-list">${qa.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </section>
    <section class="inspector-section">
      <h2>프롬프트 수정</h2>
      <p class="qa-message">원본을 보존하고 후보 한 개를 새 버전으로 만듭니다.</p>
      <div class="inspector-actions">
        <button id="inspectorPrompt" class="button button-secondary wide" type="button" ${isAssetWritable() ? "" : "disabled"}>프롬프트로 수정</button>
        <button id="approveAsset" class="button button-primary" type="button" ${qa?.status === "passed" && !qa?.hardFailures?.length && isAssetWritable() ? "" : "disabled"}>승인</button>
        <button id="holdAsset" class="button button-quiet" type="button" ${isAssetWritable() ? "" : "disabled"}>보류</button>
      </div>
    </section>`;
  $("#inspectorPrompt")?.addEventListener("click", () => openPromptDialog("asset"));
  $("#approveAsset")?.addEventListener("click", () => approveSelected("approved"));
  $("#holdAsset")?.addEventListener("click", () => approveSelected("held"));
}

function layerProperty(layer, name, fallback) {
  return layer?.properties?.[name] ?? layer?.[name] ?? fallback;
}

function renderMotionLayerInspector(inspector, title, dot) {
  const asset = selectedAsset();
  const layer = selectedMotionLayer();
  if (!asset || !layer) {
    state.selectedLayerId = null;
    renderInspector();
    return;
  }
  const textLayer =
    layer.type === "text" ||
    typeof layer.text === "string" ||
    typeof layer.properties?.text === "string";
  title.textContent = layer.name || layer.id;
  dot.classList.add(isAssetWritable() ? "is-ready" : "is-warning");
  inspector.innerHTML = `
    <section class="inspector-section">
      <h2>GIF 레이어</h2>
      <div class="property-list">
        <div class="property-row"><span>Layer ID</span><strong>${escapeHtml(layer.id)}</strong></div>
        <div class="property-row"><span>종류</span><strong>${escapeHtml(layer.type || "layer")}</strong></div>
        <div class="property-row"><span>그룹</span><strong>${escapeHtml(layer.group || "기본")}</strong></div>
        <div class="property-row"><span>구간</span><strong>${escapeHtml(layer.start ?? 0)}–${escapeHtml(layer.end ?? "끝")}</strong></div>
        <div class="property-row"><span>권한</span><strong>${isAssetWritable() ? "후보 렌더 가능" : "읽기 전용"}</strong></div>
      </div>
    </section>
    <section class="inspector-section html-properties">
      ${textLayer ? `<label>텍스트<textarea id="motionText" rows="4">${escapeHtml(layerProperty(layer, "text", ""))}</textarea></label>` : ""}
      <div class="two-fields">
        <label>X 위치<input id="motionX" type="number" step="1" value="${Number(layerProperty(layer, "x", 0))}" /></label>
        <label>Y 위치<input id="motionY" type="number" step="1" value="${Number(layerProperty(layer, "y", 0))}" /></label>
      </div>
      <div class="two-fields">
        <label>크기 %<input id="motionScale" type="number" min="1" max="500" step="1" value="${Number(layerProperty(layer, "scale", 100))}" /></label>
        <label>투명도 %<input id="motionOpacity" type="number" min="0" max="100" step="1" value="${Number(layerProperty(layer, "opacity", 100))}" /></label>
      </div>
      ${
        textLayer
          ? `<div class="two-fields">
              <label>글자 크기<input id="motionFontSize" type="number" min="8" max="220" step="1" value="${Number(layerProperty(layer, "fontSize", 32))}" /></label>
              <label>글자색<input id="motionColor" type="color" value="${escapeHtml(layerProperty(layer, "color", "#ffffff"))}" /></label>
            </div>`
          : ""
      }
      <button id="applyMotionLayer" class="button button-primary" type="button" ${isAssetWritable() ? "" : "disabled"}>변경 후보 렌더 요청</button>
      <button id="promptMotionLayer" class="button button-secondary" type="button" ${isAssetWritable() ? "" : "disabled"}>프롬프트로 수정</button>
    </section>`;
  $("#applyMotionLayer")?.addEventListener("click", queueMotionLayerEdit);
  $("#promptMotionLayer")?.addEventListener("click", () =>
    openPromptDialog("motion"),
  );
}

function renderHtmlInspector(inspector, title, dot) {
  const layer = selectedHtmlElement();
  if (!layer) {
    title.textContent = "HTML 레이어 선택";
    inspector.innerHTML = `<div class="empty-inspector">편집 모드를 켜고 캔버스에서 텍스트나 박스를 선택하세요.</div>`;
    return;
  }
  title.textContent = layer.dataset.layerId;
  dot.classList.add("is-ready");
  const style = getComputedStyle(layer);
  inspector.innerHTML = `<section class="inspector-section">
    <h2>HTML 레이어</h2>
    <div class="property-list">
      <div class="property-row"><span>Layer ID</span><strong>${escapeHtml(layer.dataset.layerId)}</strong></div>
      <div class="property-row"><span>적용 범위</span><strong>${$("#viewportOnly").checked ? `${state.htmlWidth}px` : "모든 화면"}</strong></div>
    </div>
  </section>
  <section class="inspector-section html-properties">
    <label>텍스트<textarea id="htmlText" rows="5">${escapeHtml(layer.innerHTML)}</textarea></label>
    <div class="two-fields">
      <label>글자 크기<input id="htmlFontSize" type="number" min="8" max="160" value="${Math.round(parseFloat(style.fontSize))}" /></label>
      <label>글자색<input id="htmlColor" type="color" value="${rgbToHex(style.color)}" /></label>
    </div>
    <label>정렬<select id="htmlAlign"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
    <button id="applyHtmlLayer" class="button button-primary" type="button" ${isHtmlWritable() ? "" : "disabled"}>레이어 적용</button>
  </section>`;
  $("#htmlAlign").value = ["center", "right"].includes(style.textAlign)
    ? style.textAlign
    : "left";
  $("#applyHtmlLayer").addEventListener("click", saveSelectedHtmlLayer);
  ["htmlText", "htmlFontSize", "htmlColor", "htmlAlign"].forEach((id) =>
    $(`#${id}`)?.addEventListener("input", scheduleHtmlAutosave),
  );
}

function renderJobs() {
  const jobs = Object.values(state.project.jobs || {}).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  $("#jobList").innerHTML =
    jobs.length === 0
      ? `<div class="empty-inspector">아직 생성·QA 작업이 없습니다.</div>`
      : jobs
          .map(
            (job) => `<div class="job-row">
              <div><strong>${escapeHtml(job.type)}</strong><span>${escapeHtml(job.assetId || "프로젝트")} · ${new Date(job.createdAt).toLocaleString("ko-KR")}</span></div>
              <span class="status-text" data-status="${job.status}">${STATUS_LABELS[job.status] || job.status}</span>
            </div>`,
          )
          .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rgbToHex(value) {
  const values = String(value).match(/\d+/g);
  if (!values || values.length < 3) return "#152034";
  return `#${values
    .slice(0, 3)
    .map((number) => Number(number).toString(16).padStart(2, "0"))
    .join("")}`;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function approveSelected(decision) {
  const asset = selectedAsset();
  if (!asset?.selectedVersion) return;
  try {
    await api(`/api/assets/${encodeURIComponent(asset.id)}/approve`, {
      method: "POST",
      body: JSON.stringify({
        version: asset.selectedVersion,
        decision,
        approvedBy: "local-user",
      }),
    });
    toast(decision === "approved" ? "에셋을 승인했습니다." : "에셋을 보류했습니다.");
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  }
}

function openPromptDialog(mode) {
  const asset = selectedAsset();
  if (!asset) {
    toast("먼저 에셋을 선택하세요.", "error");
    return;
  }
  state.promptMode = mode;
  const dialog = $("#promptDialog");
  const form = $("#promptForm");
  form.reset();
  const scope =
    mode === "motion"
      ? $("#promptScope").value
      : mode === "generation"
        ? "asset"
        : "asset";
  form.elements.scope.value = scope;
  $("#promptDialogTitle").textContent =
    mode === "generation" ? "ImageGen 후보 만들기" : "선택 범위를 프롬프트로 수정";
  $("#promptContextLabel").textContent =
    mode === "motion" && state.selectedLayerId
      ? `${asset.name} · ${state.selectedLayerId}`
      : asset.name;
  dialog.showModal();
}

function selectedHtmlElement() {
  const frame = $("#htmlFrame");
  if (!state.selectedHtmlLayerId || !frame.contentDocument) return null;
  return frame.contentDocument.querySelector(
    `[data-layer-id="${CSS.escape(state.selectedHtmlLayerId)}"]`,
  );
}

function bindHtmlFrame() {
  const frame = $("#htmlFrame");
  const doc = frame.contentDocument;
  if (!doc) return;
  applyProjectLayerState();
  doc.addEventListener("click", (event) => {
    if (!state.htmlEditing) return;
    const target = event.target.closest("[data-layer-id]");
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    doc
      .querySelectorAll('[data-studio-selected="true"]')
      .forEach((node) => node.removeAttribute("data-studio-selected"));
    target.dataset.studioSelected = "true";
    state.selectedHtmlLayerId = target.dataset.layerId;
    state.htmlPendingBefore = null;
    $("#selectedHtmlLayer").textContent = target.dataset.layerId;
    renderInspector();
  });
  doc.addEventListener("beforeinput", (event) => {
    if (!state.htmlEditing || state.htmlPendingBefore) return;
    const target = event.target.closest("[data-layer-id]");
    if (!target || target.dataset.layerId !== state.selectedHtmlLayerId) return;
    state.htmlPendingBefore = htmlLayerPatch(target);
  });
  doc.addEventListener("input", (event) => {
    if (!state.htmlEditing) return;
    const target = event.target.closest("[data-layer-id]");
    if (!target || target.dataset.layerId !== state.selectedHtmlLayerId) return;
    const textField = $("#htmlText");
    if (textField) textField.value = target.innerHTML;
    scheduleHtmlAutosave();
  });
}

function applyProjectLayerState() {
  const frame = $("#htmlFrame");
  const doc = frame.contentDocument;
  if (!doc || !state.project) return;
  const apply = (layerId, value) => {
    const target = doc.querySelector(`[data-layer-id="${CSS.escape(layerId)}"]`);
    if (!target) return;
    if (typeof value.text === "string") target.innerHTML = value.text;
    if (value.styles) Object.assign(target.style, value.styles);
  };
  Object.entries(state.project.html.layerState || {}).forEach(([id, value]) =>
    apply(id, value),
  );
  Object.entries(
    state.project.html.viewportOverrides?.[state.htmlWidth] || {},
  ).forEach(([id, value]) => apply(id, value));
}

function htmlLayerPatch(layer) {
  const style = getComputedStyle(layer);
  return {
    text: layer.innerHTML,
    styles: {
      fontSize: style.fontSize,
      color: rgbToHex(style.color),
      textAlign: style.textAlign || "left",
    },
  };
}

function inspectorHtmlPatch() {
  return {
    text: $("#htmlText").value,
    styles: {
      fontSize: `${Number($("#htmlFontSize").value)}px`,
      color: $("#htmlColor").value,
      textAlign: $("#htmlAlign").value,
    },
  };
}

function scheduleHtmlAutosave() {
  if (!isHtmlWritable()) return;
  clearTimeout(state.htmlSaveTimer);
  setSaveState("자동 저장 대기");
  state.htmlSaveTimer = setTimeout(
    () => saveSelectedHtmlLayer({ notify: false }),
    700,
  );
}

async function saveSelectedHtmlLayer({ notify = true, history = true } = {}) {
  const layer = selectedHtmlElement();
  if (!layer) return;
  clearTimeout(state.htmlSaveTimer);
  const before = state.htmlPendingBefore || htmlLayerPatch(layer);
  const patch = inspectorHtmlPatch();
  const viewport = $("#viewportOnly").checked ? state.htmlWidth : "global";
  layer.innerHTML = patch.text;
  Object.assign(layer.style, patch.styles);
  setSaveState("저장 중");
  try {
    await api("/api/html/layers", {
      method: "POST",
      body: JSON.stringify({
        layerId: layer.dataset.layerId,
        patch,
        viewport,
      }),
    });
    if (history && JSON.stringify(before) !== JSON.stringify(patch)) {
      state.htmlHistory.splice(state.htmlHistoryIndex);
      state.htmlHistory.push({
        layerId: layer.dataset.layerId,
        viewport,
        before,
        after: patch,
      });
      state.htmlHistoryIndex = state.htmlHistory.length;
    }
    state.htmlPendingBefore = null;
    await refresh({ quiet: true });
    if (notify) toast(`${layer.dataset.layerId} 레이어를 저장했습니다.`);
  } catch (error) {
    setSaveState("저장 실패");
    toast(error.message, "error");
  }
}

async function applyHtmlHistory(entry, patch, nextIndex, message) {
  setSaveState("저장 중");
  try {
    await api("/api/html/layers", {
      method: "POST",
      body: JSON.stringify({
        layerId: entry.layerId,
        patch,
        viewport: entry.viewport,
      }),
    });
    state.htmlHistoryIndex = nextIndex;
    state.selectedHtmlLayerId = entry.layerId;
    await refresh({ quiet: true });
    applyProjectLayerState();
    toast(message);
  } catch (error) {
    setSaveState("저장 실패");
    toast(error.message, "error");
  }
}

async function undoHtml() {
  if (state.htmlHistoryIndex === 0) return;
  const entry = state.htmlHistory[state.htmlHistoryIndex - 1];
  await applyHtmlHistory(
    entry,
    entry.before,
    state.htmlHistoryIndex - 1,
    "실행을 취소했습니다.",
  );
}

async function redoHtml() {
  if (state.htmlHistoryIndex >= state.htmlHistory.length) return;
  const entry = state.htmlHistory[state.htmlHistoryIndex];
  await applyHtmlHistory(
    entry,
    entry.after,
    state.htmlHistoryIndex + 1,
    "다시 실행했습니다.",
  );
}

async function queueMotionLayerEdit() {
  const asset = selectedAsset();
  const layer = selectedMotionLayer();
  if (!asset || !layer || !isAssetWritable()) return;
  const patch = {
    ...(layer.type === "text" || $("#motionText")
      ? { text: $("#motionText")?.value || "" }
      : {}),
    x: Number($("#motionX").value),
    y: Number($("#motionY").value),
    scale: Number($("#motionScale").value),
    opacity: Number($("#motionOpacity").value),
    ...($("#motionFontSize")
      ? {
          fontSize: Number($("#motionFontSize").value),
          color: $("#motionColor").value,
        }
      : {}),
  };
  if (
    !confirm(
      `${layer.name || layer.id} 레이어만 변경한 새 HyperFrames 후보를 렌더할까요?`,
    )
  ) {
    return;
  }
  try {
    await api(`/api/assets/${encodeURIComponent(asset.id)}/jobs`, {
      method: "POST",
      body: JSON.stringify({
        type: "hyperframes.edit",
        version: asset.selectedVersion,
        scope: `layer:${layer.id}`,
        prompt: `선택 레이어 속성만 변경하고 나머지 장면은 잠금: ${JSON.stringify(patch)}`,
        sourceRefs: asset.selectedData?.sourceRefs || [],
        confirmedByUser: true,
      }),
    });
    toast("레이어 변경 후보 렌더를 요청했습니다.");
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  }
}

function setupEvents() {
  $$(".stage-button").forEach((button) =>
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.view = button.dataset.view;
      render();
    }),
  );
  $$("[data-compare]").forEach((button) =>
    button.addEventListener("click", () => {
      state.compareMode = button.dataset.compare;
      $$("[data-compare]").forEach((item) =>
        item.classList.toggle("is-active", item === button),
      );
      renderCompare();
    }),
  );
  $("#compareZoom").addEventListener("input", (event) => {
    state.compareZoom = Number(event.target.value);
    renderCompare();
  });
  $("#uploadAsset").addEventListener("click", () => $("#uploadDialog").showModal());
  $("#requestAssetGeneration").addEventListener("click", () =>
    openPromptDialog("generation"),
  );
  $("#requestMotionRender").addEventListener("click", () =>
    openPromptDialog("motion"),
  );
  $("#openJobs").addEventListener("click", () => $("#jobsDialog").showModal());
  $("#refreshProject").addEventListener("click", () =>
    refresh().catch((error) => toast(error.message, "error")),
  );
  $("#newRevision").addEventListener("click", () => {
    $("#revisionAssetList").innerHTML = state.project.assetList
      .map(
        (asset) => `<label class="revision-asset"><input type="checkbox" name="assets" value="${asset.id}" /><span>${escapeHtml(asset.name)} · ${escapeHtml(asset.role)}</span></label>`,
      )
      .join("");
    $("#revisionForm").reset();
    $("#revisionDialog").showModal();
  });
  $$("[data-close-dialog]").forEach((button) =>
    button.addEventListener("click", () =>
      document.getElementById(button.dataset.closeDialog).close(),
    ),
  );
  $("#themeToggle").addEventListener("click", () => {
    const next =
      document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("detail-page-studio-theme", next);
  });
  $("#uploadForm").addEventListener("submit", handleUpload);
  $("#promptForm").addEventListener("submit", handlePrompt);
  $("#revisionForm").addEventListener("submit", handleRevision);
  $("#lockAssembly").addEventListener("click", handleAssemblyLock);
  $("#toggleHtmlEdit").addEventListener("click", () => {
    state.htmlEditing = !state.htmlEditing;
    $("#toggleHtmlEdit").textContent = state.htmlEditing ? "편집 종료" : "편집 모드";
    const doc = $("#htmlFrame").contentDocument;
    doc?.querySelectorAll("[data-edit]").forEach((node) => {
      node.contentEditable = state.htmlEditing ? "true" : "false";
    });
    toast(state.htmlEditing ? "HTML 레이어를 선택해 수정하세요." : "편집 모드를 종료했습니다.");
  });
  $("#undoHtml").addEventListener("click", undoHtml);
  $("#redoHtml").addEventListener("click", redoHtml);
  $$("[data-html-width]").forEach((button) =>
    button.addEventListener("click", () => {
      state.htmlWidth = button.dataset.htmlWidth;
      renderHtml();
      applyProjectLayerState();
      renderInspector();
    }),
  );
  $("#createCheckpoint").addEventListener("click", async () => {
    const name = prompt("체크포인트 이름을 입력하세요.", "HTML 정렬 완료");
    if (!name) return;
    try {
      await api("/api/checkpoints", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      toast("체크포인트를 만들었습니다.");
      await refresh({ quiet: true });
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#requestFinalQa").addEventListener("click", async () => {
    if (!confirm("현재 HTML 렌더를 Codex 최종 QA 대기열에 등록할까요?")) return;
    try {
      await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          type: "qa.final",
          scope: "project",
          confirmedByUser: true,
        }),
      });
      toast("최종 QA를 요청했습니다.");
      await refresh({ quiet: true });
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#approveFinal").addEventListener("click", async () => {
    if (!confirm("현재 QA 결과를 최종 승인할까요?")) return;
    try {
      await api("/api/qa/final/approve", {
        method: "POST",
        body: JSON.stringify({ confirmedByUser: true }),
      });
      toast("게시용 결과를 최종 승인했습니다.");
      await refresh({ quiet: true });
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#exportDraft").addEventListener("click", () => exportFile("draft"));
  $("#exportProject").addEventListener("click", () => exportFile("project"));
  $("#exportPublish").addEventListener("click", () => exportFile("publish"));
  $("#htmlFrame").addEventListener("load", bindHtmlFrame);
  $("#motionPlay").addEventListener("click", () => {
    const media = $("#motionMedia");
    if (!media) return;
    if (media.tagName === "VIDEO") {
      media.paused ? media.play() : media.pause();
    } else {
      const src = new URL(media.src);
      src.searchParams.set("replay", Date.now());
      media.src = src;
    }
  });
  $("#timelineScrubber").addEventListener("input", (event) => {
    const progress = Number(event.target.value) / 1000;
    const media = $("#motionMedia");
    if (media?.tagName === "VIDEO" && Number.isFinite(media.duration)) {
      media.currentTime = progress * media.duration;
      $("#timecode").textContent = formatTime(media.currentTime);
    }
  });
}

async function handleUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const file = form.elements.file.files[0];
  if (!file) return;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = "등록 중";
  try {
    const payload = {
      name: form.elements.name.value.trim(),
      role: form.elements.role.value.trim(),
      required: form.elements.required.checked,
      fileName: file.name,
      dataUrl: await fileToDataUrl(file),
    };
    const result = await api("/api/assets/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.selectedAssetId = result.asset.id;
    form.reset();
    $("#uploadDialog").close();
    toast("에셋을 등록하고 Codex 시각 QA를 요청했습니다.");
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "등록하고 QA 요청";
  }
}

async function handlePrompt(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const asset = selectedAsset();
  if (!asset) return;
  if (!form.elements.confirmed.checked) {
    toast("사용자 확인이 필요합니다.", "error");
    return;
  }
  const scope = form.elements.scope.value;
  if (scope === "scene" && !confirm("장면 전체 수정은 여러 레이어에 영향을 줍니다. 계속할까요?")) return;
  try {
    await api(`/api/assets/${encodeURIComponent(asset.id)}/jobs`, {
      method: "POST",
      body: JSON.stringify({
        type: isMotionAsset(asset) ? "hyperframes.edit" : "imagegen.edit",
        version: asset.selectedVersion,
        scope:
          state.promptMode === "motion" && state.selectedLayerId
            ? `${scope}:${state.selectedLayerId}`
            : scope,
        prompt: form.elements.prompt.value.trim(),
        sourceRefs: asset.selectedData?.sourceRefs || [],
        confirmedByUser: true,
      }),
    });
    $("#promptDialog").close();
    toast("원본을 보존한 새 후보 요청을 등록했습니다.");
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleRevision(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const changedAssetIds = $$('input[name="assets"]:checked', form).map(
    (input) => input.value,
  );
  if (changedAssetIds.length === 0) {
    toast("교체할 에셋을 하나 이상 선택하세요.", "error");
    return;
  }
  try {
    const revision = await api("/api/revisions", {
      method: "POST",
      body: JSON.stringify({
        changedAssetIds,
        reason: form.elements.reason.value.trim(),
        confirmedByUser: form.elements.confirmed.checked,
      }),
    });
    $("#revisionDialog").close();
    state.view = "assets";
    toast(`${revision.id}을 만들었습니다. 영향 에셋 ${revision.affectedAssetIds.length}개를 다시 검수합니다.`);
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  }
}

async function handleAssemblyLock() {
  if (
    !confirm(
      "승인된 에셋 버전과 해시를 잠그고 HTML 편집 단계로 이동할까요? 이후 에셋·GIF는 읽기 전용입니다.",
    )
  ) {
    return;
  }
  try {
    await api("/api/assembly/lock", {
      method: "POST",
      body: JSON.stringify({
        approvedBy: "local-user",
        confirmedByUser: true,
      }),
    });
    state.view = "html";
    toast("상세페이지 조립본을 잠갔습니다.");
    await refresh({ quiet: true });
  } catch (error) {
    const details = error.details?.length ? ` ${error.details.join(", ")}` : "";
    toast(`${error.message}${details}`, "error");
  }
}

async function exportFile(kind) {
  try {
    const result = await api(`/api/export/${kind}`, { method: "POST" });
    toast(`내보내기 완료: ${result.path}`);
  } catch (error) {
    toast(error.message, "error");
  }
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}

function connectEvents() {
  state.eventSource?.close();
  const source = new EventSource("/api/events");
  source.addEventListener("project", (event) => {
    const payload = JSON.parse(event.data);
    state.project = payload.project;
    render();
    setSaveState("자동 저장됨");
  });
  source.onerror = () => setSaveState("재연결 중");
  state.eventSource = source;
}

async function init() {
  const theme = localStorage.getItem("detail-page-studio-theme");
  if (theme) document.documentElement.dataset.theme = theme;
  setupEvents();
  connectEvents();
  try {
    await refresh();
  } catch (error) {
    setSaveState("연결 실패");
    toast(error.message, "error");
  }
}

init();
