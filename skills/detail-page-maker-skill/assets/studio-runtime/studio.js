const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const PHASE_LABELS = {
  planning: "기획",
  asset_production: "이미지 제작",
  asset_review: "이미지 승인",
  assembly_ready: "상세페이지 시작 가능",
  html_editing: "상세페이지 편집 중",
  final_qa: "최종 QA",
  published: "게시 준비 완료",
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
  reference_only: "참조 전용",
  review_ready: "사용자 검수",
  running: "진행 중",
  superseded: "이전 버전",
};

const PRODUCT_ASSET_BATCH_PRESETS = [
  {
    name: "화이트 루즈핏 히어로",
    role: "hero-product",
    summary: "손등 라벨이 보이는 양손 착용 히어로",
    prompt:
      "광고 조립 전 제품 에셋. 양손의 손등이 카메라를 향하고 화이트 쿨토시를 착용한 스튜디오 히어로 사진. 실제품의 얇은 세로 플리츠 원단, 길고 여유 있는 루즈핏, 상단 밴딩, 자연스러운 엄지홀과 손등 커버를 유지. 작은 흰색 직조 라벨은 각 손등 중앙에 한 개씩 있고 검정 2단 문구 HELLO / CUTE SLEEVE를 정확히 표시. 이미지 안에 다른 문구, 로고, 워터마크 없음.",
  },
  {
    name: "화이트 한 쌍 플랫레이",
    role: "pair-product",
    summary: "한 쌍의 전체 길이·실루엣·앞뒷면 확인",
    prompt:
      "광고 조립 전 제품 에셋. 깨끗한 밝은 중성 배경에 화이트 쿨토시 한 쌍을 전체 길이가 잘리지 않게 나란히 펼친 프리미엄 플랫레이 제품 사진. 실제품의 얇은 세로 플리츠 원단, 길고 여유 있는 튜브 실루엣, 상단 밴딩, 엄지홀, 손등 커버를 그대로 유지. 작은 흰색 직조 라벨은 손등 면 중앙에 한 개씩, 검정 2단 HELLO / CUTE SLEEVE를 정확히 표시. 압박형 스포츠 토시처럼 바꾸지 말고 추가 제품·문구·워터마크 없음.",
  },
  {
    name: "화이트 루즈핏 착용",
    role: "wearing-scene",
    summary: "양팔 전체의 여유 있는 착용 실루엣",
    prompt:
      "광고 조립 전 제품 에셋. 성인 한국인 여성의 양팔에 화이트 쿨토시 한 쌍을 착용한 자연광 라이프스타일 사진, 팔꿈치 위부터 손등까지 전체 착용 길이와 여유 있는 루즈핏이 읽히는 구도. 손등이 보이도록 자연스럽게 두 손을 두며 엄지홀과 손등 커버가 정확해야 함. 실제품의 얇은 세로 플리츠와 작은 손등 라벨의 검정 2단 HELLO / CUTE SLEEVE를 정확히 유지. 과도한 보정, 추가 손가락, 광고 문구, 워터마크 없음.",
  },
  {
    name: "엄지홀·손등 커버 디테일",
    role: "structure-proof",
    summary: "손등 방향의 엄지홀·커버 구조 근접 증거",
    prompt:
      "광고 조립 전 제품 구조 에셋. 화이트 쿨토시를 실제 손에 착용한 손등 방향 클로즈업으로 엄지홀이 자연스럽게 엄지를 감싸고 원단이 손등에서 손가락 시작점까지 덮는 구조를 명확히 보여줌. 얇은 세로 플리츠, 봉제선, 여유 있는 핏을 실사진과 같게 유지. 작은 흰색 직조 라벨은 손등 중앙에 있고 검정 2단 HELLO / CUTE SLEEVE를 정확히 표시. 손바닥 쪽으로 라벨을 옮기지 말고 추가 손가락·텍스트·콜아웃·워터마크 없음.",
  },
  {
    name: "플리츠 원단 매크로",
    role: "material-detail",
    summary: "화이트 원단 결·봉제·실물 라벨 확인",
    prompt:
      "광고 조립 전 제품 소재 에셋. 화이트 쿨토시 실물 원단의 가늘고 불규칙한 세로 플리츠와 얇은 직물 결, 봉제 마감을 보여주는 사실적인 매크로 제품 사진. 라벨은 제품 동일성 확인용으로 화면 한쪽에 작게 포함하며 흰색 직조 바탕과 검정 2단 HELLO / CUTE SLEEVE를 정확히 유지하되 라벨을 과장하거나 구매 이유처럼 강조하지 않음. 기능 수치, 아이콘, 추가 문구, 워터마크 없음.",
  },
  {
    name: "화이트 운전 착용 장면",
    role: "driving-scene",
    summary: "핸들을 잡을 때 보이는 손등 커버",
    prompt:
      "광고 조립 전 라이프스타일 에셋. 정차된 밝은 차량 안에서 성인 한국인 여성이 양손으로 운전대를 자연스럽게 잡은 안전한 연출 사진. 화이트 쿨토시 한 쌍이 팔부터 손등까지 보이고 양손 손등의 작은 라벨이 카메라에서 읽히는 각도. 실제품의 얇은 세로 플리츠, 길고 여유 있는 핏, 엄지홀, 손등 커버와 검정 2단 HELLO / CUTE SLEEVE 라벨을 정확히 유지. 주행 위험 연출, 추가 손가락, 다른 로고, 광고 문구, 워터마크 없음.",
  },
  {
    name: "화이트 여름 야외 착용",
    role: "outdoor-scene",
    summary: "밝은 여름 일상에서의 자연스러운 착용",
    prompt:
      "광고 조립 전 라이프스타일 에셋. 밝고 부드러운 여름 낮 야외에서 성인 한국인 여성이 화이트 쿨토시 한 쌍을 착용하고 편안히 걷는 자연스러운 사진. 양팔의 전체 길이와 여유 있는 루즈핏, 엄지홀, 손등 커버가 선명하며 한 손의 손등 라벨이 자연스럽게 보임. 얇은 세로 플리츠와 검정 2단 HELLO / CUTE SLEEVE 라벨을 실제품처럼 유지. 자외선·냉감 효능을 암시하는 그래픽, 추가 문구, 워터마크 없음.",
  },
];

const state = {
  project: null,
  productionRoadmap: null,
  productSsot: [],
  productSsotLock: null,
  view: "source",
  initialViewSet: false,
  inspectorOpen: false,
  selectedAssetId: null,
  selectedLayerId: null,
  selectedHtmlLayerId: null,
  compareMode: "side",
  compareZoom: 100,
  htmlWidth: "390",
  htmlEditing: false,
  htmlHistory: [],
  htmlHistoryIndex: 0,
  htmlPendingBefore: null,
  htmlSaveTimer: null,
  promptMode: "asset",
  reviewVersion: null,
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

function reviewedVersion(asset = selectedAsset()) {
  if (!asset) return null;
  const number = Number(state.reviewVersion || asset.selectedVersion);
  return (
    asset.versions.find((version) => version.number === number) ||
    asset.selectedData ||
    null
  );
}

function isReferenceOnlyVersion(version) {
  return Boolean(
    version &&
      (version.allowedUse === "reference-only" ||
        version.provenance === "raw-upload-reference"),
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
  const [project, productSsot, productionRoadmap] = await Promise.all([
    api("/api/project"),
    api("/api/product/ssot"),
    api("/api/production-roadmap"),
  ]);
  state.project = project;
  state.productionRoadmap = productionRoadmap;
  state.productSsot = Array.isArray(productSsot.items)
    ? productSsot.items
    : [];
  state.productSsotLock = productSsot.lock || null;
  if (!state.initialViewSet) {
    if (["html_editing", "final_qa", "published"].includes(project.phase)) {
      state.view = "html";
    } else if (project.phase === "assembly_ready") {
      state.view = "assembly";
    } else if (["asset_production", "asset_review"].includes(project.phase)) {
      state.view = "assets";
    } else if (project.supplierUrl) {
      state.view = "planning";
    }
    state.initialViewSet = true;
  }
  if (
    state.selectedAssetId &&
    !state.project.assetList.some((asset) => asset.id === state.selectedAssetId)
  ) {
    state.selectedAssetId = null;
  }
  if (!state.selectedAssetId && state.project.assetList.length) {
    state.selectedAssetId = state.project.assetList[0].id;
  }
  const currentAsset = selectedAsset();
  if (
    currentAsset &&
    state.reviewVersion &&
    !currentAsset.versions.some(
      (version) => version.number === Number(state.reviewVersion),
    )
  ) {
    state.reviewVersion = null;
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
  $("#newRevision").hidden =
    !["html_editing", "final_qa", "published"].includes(project.phase);
  $("#assetReadOnlyNotice").hidden = isAssetWritable();
  $("#motionReadOnlyNotice").hidden = isAssetWritable();
  $("#uploadProductSsot").disabled =
    !isAssetWritable() || Boolean(state.productSsotLock);
  $("#uploadAsset").disabled = !isAssetWritable();
  if ($("#requestAssetGeneration")) {
    $("#requestAssetGeneration").disabled =
      !isAssetWritable() || !state.selectedAssetId;
  }
  const motionTarget = isMotionAsset(selectedAsset())
    ? selectedAsset()
    : project.assetList.find(isMotionAsset);
  $("#requestMotionRender").disabled =
    !isAssetWritable() ||
    !roadmapGateState().ready ||
    !motionTarget;
  document.body.classList.toggle("is-inspector-open", state.inspectorOpen);
  $("#toggleInspector").setAttribute(
    "aria-expanded",
    String(state.inspectorOpen),
  );
  updateStageStates();
  renderSource();
  renderProductionRoadmap();
  renderProductSsot();
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
  const assemblyLocked = Boolean(project.activeRevision.assembly);
  const detailPhase = ["html_editing", "final_qa", "published"].includes(
    project.phase,
  );
  $$(".stage-button").forEach((button) => {
    const view = button.dataset.view;
    button.classList.toggle("is-active", view === state.view);
    button.setAttribute("aria-selected", String(view === state.view));
    let disabled = false;
    let status = "pending";
    if (view === "source") {
      status = project.supplierUrl ? "ready" : "pending";
    }
    if (view === "planning") {
      status = state.productionRoadmap?.pages?.length ? "ready" : "pending";
    }
    if (view === "assets") {
      status = isAssetWritable()
        ? roadmapGateState().ready
          ? "ready"
          : "pending"
        : "locked";
    }
    if (view === "motion") {
      const motionAssets = project.assetList.filter(isMotionAsset);
      status = isAssetWritable()
        ? motionAssets.length
          ? "ready"
          : "pending"
        : "locked";
    }
    if (view === "assembly") {
      status = assemblyLocked
        ? "locked"
        : roadmapGateState().ready
          ? "ready"
          : "pending";
    }
    if (view === "html") {
      disabled = !detailPhase;
      status = project.phase === "published"
        ? "locked"
        : detailPhase
          ? "ready"
          : "pending";
    }
    if (view === "qa") {
      disabled = !detailPhase;
      status = project.phase === "published"
        ? "locked"
        : project.finalQa?.status === "passed"
          ? "ready"
          : "pending";
    }
    button.disabled = disabled;
    button.dataset.state = status;
  });
  $$("[data-view-panel]").forEach((panel) => {
    const panelView = panel.dataset.viewPanel;
    const active =
      panelView === state.view ||
      (panelView === "assets" && state.view === "motion") ||
      (panelView === "detail" &&
        ["assembly", "html", "qa"].includes(state.view));
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  const assetsView = $("#assetsView");
  assetsView.dataset.activePanel =
    state.view === "motion" ? "motion" : "assets";
  $(".motion-editor-panel").open = state.view === "motion";
  $("#assetViewKicker").textContent =
    state.view === "motion" ? "GIF · VIDEO WORKBENCH" : "실제품 기준으로 만들기";
  $("#assetViewTitle").textContent =
    state.view === "motion"
      ? "GIF 레이어와 타임라인을 독립 화면에서 편집하세요."
      : "사진을 등록하고, 필요한 이미지를 만들고 승인하세요.";
  const detailView = $("#detailView");
  detailView.dataset.activePanel = ["assembly", "html", "qa"].includes(
    state.view,
  )
    ? state.view
    : "assembly";
  const detailCopy = {
    assembly: ["승인 이미지로 조립", "승인된 에셋을 확정하고 중복 없는 검토본을 만드세요."],
    html: ["HTML EDITOR", "카피와 레이아웃을 전체 높이 캔버스에서 수정하세요."],
    qa: ["PUBLISH QA", "게시 전 기준을 확인하고 결과물을 내보내세요."],
  }[detailView.dataset.activePanel];
  $("#detailViewKicker").textContent = detailCopy[0];
  $("#detailViewTitle").textContent = detailCopy[1];
  $("#lockAssembly").hidden = detailView.dataset.activePanel !== "assembly";
}

function renderSource() {
  const project = state.project;
  if (!project) return;
  const input = $("#supplierUrlInput");
  const link = $("#openSupplierUrl");
  const button = $("#confirmSupplierUrl");
  const locked = !isAssetWritable();
  input.value = project.supplierUrl || "";
  input.disabled = locked;
  button.disabled = locked;
  button.textContent = locked ? "URL 확인 완료" : "URL 확인";
  link.href = project.supplierUrl || "#";
  link.setAttribute(
    "aria-disabled",
    String(!project.supplierUrl),
  );
  $("#sourceStatus").textContent = project.supplierUrl
    ? locked
      ? "이 공급처 URL로 상세페이지 제작이 시작되어 변경이 잠겼습니다."
      : "공급처 URL이 연결되었습니다. 다음 단계에서 소구점과 페이지 구성을 확인하세요."
    : "공급처 상품 URL을 입력해 주세요.";
}

function versionStatus(asset) {
  if (isReferenceOnlyVersion(asset.selectedData)) return "reference_only";
  return asset.selectedData?.status || (asset.selectedVersion ? "draft" : "draft");
}

function roadmapAssetRecord(item) {
  return state.project?.assetList?.find(
    (asset) => asset.role === item.role || asset.id === item.role,
  );
}

function assetUsesLockedModel(asset) {
  const modelPath = state.project?.modelSsot?.path;
  return Boolean(
    modelPath &&
      asset?.selectedData?.sourceRefs?.includes(modelPath),
  );
}

function roadmapAssetState(item) {
  if (item.sourceMode === "product-ssot-derived") {
    return state.productSsotLock ? "approved" : "blocked";
  }
  const asset = roadmapAssetRecord(item);
  if (!asset) {
    const active = activeJobs().find(
      (job) => job.target?.role === item.role,
    );
    if (active) return active.status;
    return item.requiresModel && state.project?.modelSsot?.status !== "locked"
      ? "blocked"
      : "planned";
  }
  if (item.requiresModel) {
    if (state.project?.modelSsot?.status !== "locked") return "blocked";
    if (!assetUsesLockedModel(asset)) return "model_stale";
  }
  return versionStatus(asset);
}

function roadmapGateState() {
  const roadmap = state.productionRoadmap;
  const project = state.project;
  if (!roadmap || !project) {
    return { ready: false, approved: 0, required: 0, modelReady: false };
  }
  const modelReady = project.modelSsot?.status === "locked";
  const requiredNonModel = roadmap.assets.filter(
    (item) => item.required && item.group !== "model-selection",
  );
  const approvedNonModel = requiredNonModel.filter(
    (item) => roadmapAssetState(item) === "approved",
  ).length;
  const approved = approvedNonModel + (modelReady ? 1 : 0);
  const required = Number(
    roadmap.gate?.requiredApprovedCount || requiredNonModel.length + 1,
  );
  return {
    ready: approved >= required && modelReady,
    approved,
    required,
    modelReady,
  };
}

function roadmapStatusLabel(status) {
  const labels = {
    approved: "승인 완료",
    blocked: "선행 승인 필요",
    draft: "초안",
    failed: "QA 실패",
    generating: "생성 중",
    model_stale: "승인 모델로 재제작",
    planned: "제작 예정",
    qa_pending: "QA 대기",
    review_ready: "사용자 검수",
    superseded: "이전 버전",
  };
  return labels[status] || STATUS_LABELS[status] || status;
}

function roadmapStatusClass(status) {
  if (status === "approved") return "is-ready";
  if (["qa_pending", "review_ready"].includes(status)) return "is-review";
  if (["generating", "queued", "running"].includes(status)) return "is-running";
  if (status === "blocked") return "is-blocked";
  if (status === "model_stale") return "is-review";
  if (status === "failed") return "is-failed";
  return "is-planned";
}

function renderProductionRoadmap() {
  const roadmap = state.productionRoadmap;
  if (!roadmap) return;
  $("#productionRoadmapHeading").textContent =
    `소구점과 ${roadmap.pages.length}장 구매 흐름`;
  $("#productionRoadmapSummary").textContent =
    roadmap.summary ||
    "불편함에서 시작해 제품의 답, 사용 장면, 디테일과 최종 선택까지 자연스럽게 이어집니다.";
  $("#detailRoadmapHeading").textContent =
    `상세페이지 ${roadmap.pages.length}장`;
  $("#gifRoadmapHeading").textContent =
    `움직임 예시 ${roadmap.gifs.length}개`;

  const strategy = roadmap.strategy || null;
  const strategyPanel = $("#commercialStrategy");
  const planningOverview = strategy?.planningOverview || [];
  strategyPanel.hidden = !strategy;
  strategyPanel.innerHTML = strategy
    ? `<div class="commercial-strategy-heading">
        <div>
          <span>한 문장 핵심</span>
          <strong>${escapeHtml(strategy.heroThesis || "프로젝트 소구 전략")}</strong>
          <p>${escapeHtml(strategy.singleJob || strategy.audience || "")}</p>
        </div>
      </div>
      <div class="commercial-appeal-grid">
        ${(strategy.primaryAppeals || [])
          .map(
            (appeal, index) => `<article>
              <span>선택 이유 ${String(appeal.order || index + 1).padStart(2, "0")}</span>
              <strong>${escapeHtml(appeal.name || appeal.headline || "")}</strong>
              <p>${escapeHtml(appeal.message || appeal.proof || "")}</p>
              ${appeal.proof ? `<small>보여줄 장면 · ${escapeHtml(appeal.proof)}</small>` : ""}
            </article>`,
          )
          .join("")}
      </div>
      ${
        planningOverview.length
          ? `<section class="commercial-planning">
              <div class="commercial-planning-heading">
                <span>상세페이지 기획 한눈에 보기</span>
                <strong>무엇을, 왜, 어떤 순서로 보여줄지</strong>
              </div>
              <div class="commercial-planning-grid">
                ${planningOverview
                  .map(
                    (item, index) => `<article>
                      <span>${String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>${escapeHtml(item.title || "")}</strong>
                        <p>${escapeHtml(item.body || "")}</p>
                      </div>
                    </article>`,
                  )
                  .join("")}
              </div>
            </section>`
          : ""
      }`
    : "";
  const gate = roadmapGateState();
  const assemblyLocked = Boolean(state.project.activeRevision.assembly);
  $("#roadmapGateSummary").textContent = assemblyLocked
    ? "이미지 승인 완료 · 상세페이지 편집 중"
    : gate.ready
      ? `이미지 ${gate.approved}/${gate.required} 승인 · 제작 준비 완료`
      : `이미지 ${gate.approved}/${gate.required} 승인됨`;
  $("#roadmapGateSummary").dataset.state =
    assemblyLocked || gate.ready ? "ready" : "locked";
  $("#createRoadmapAssets").disabled =
    !isAssetWritable() || !state.productSsotLock;
  $("#assetPlanSummary").textContent = assemblyLocked
    ? "현재 개정판의 이미지 승인이 끝났습니다. 결과 보드에서 승인된 버전을 확인할 수 있습니다."
    : gate.ready
      ? `필수 승인 ${gate.approved}/${gate.required} 완료. 상세페이지에 쓸 이미지와 GIF가 준비되었습니다.`
      : `필수 승인 ${gate.approved}/${gate.required}. 실제품, 모델, 제품 이미지와 사용 장면을 한 화면에서 확인하세요.`;

  const candidates = roadmap.assets.filter(
    (item) => item.group === "model-selection",
  );
  const selectedModelAsset = selectedAsset();
  const selectedModelVersion =
    selectedModelAsset?.role?.startsWith("model-candidate-")
      ? reviewedVersion(selectedModelAsset)
      : null;
  const canApproveSelectedModel =
    Boolean(selectedModelVersion) &&
    selectedModelVersion.qa?.status === "passed" &&
    (selectedModelVersion.qa?.hardFailures || []).length === 0;
  $("#modelApprovalPanel").innerHTML = `
    <div class="model-approval-copy">
      <span>필수 승인 게이트</span>
      <strong>${
        gate.modelReady
          ? `모델 SSOT 잠금 · ${escapeHtml(state.project.modelSsot.assetId)} v${state.project.modelSsot.version}`
          : "모델 후보 4명 중 한 명을 직접 선택하세요"
      }</strong>
      <p>모델 승인 전에는 얼굴·전신·손이 등장하는 착용 예시를 만들 수 없습니다. 선택한 얼굴·체형·헤어·피부톤·의상이 이후 장면에 고정됩니다.</p>
    </div>
    <div class="model-candidate-strip">
      ${candidates
        .map((item) => {
          const asset = roadmapAssetRecord(item);
          const version = asset?.selectedData;
          const preview = version?.path
            ? `<img src="${pathUrl(version.path)}" alt="${escapeHtml(item.name)}" />`
            : `<span>후보 생성 전</span>`;
          const isLocked =
            state.project.modelSsot?.assetId === asset?.id &&
            state.project.modelSsot?.version === asset?.selectedVersion;
          return `<button type="button" class="model-candidate-card${isLocked ? " is-locked" : ""}" data-model-candidate="${escapeHtml(item.role)}" ${asset ? "" : "disabled"}>
            <span class="model-candidate-preview">${preview}</span>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${asset ? roadmapStatusLabel(versionStatus(asset)) : "제작 예정"}${isLocked ? " · 모델 SSOT" : ""}</small>
          </button>`;
        })
        .join("")}
    </div>
    <div class="model-approval-actions">
      <button class="button button-secondary" type="button" data-roadmap-group-create="model-selection">모델 후보 4명 만들기</button>
      <button id="approveSelectedModel" class="button button-primary" type="button" ${canApproveSelectedModel && !gate.modelReady ? "" : "disabled"}>선택 버전을 모델 SSOT로 승인</button>
    </div>`;

  $("#roadmapAssetGroups").innerHTML = roadmap.groups
    .filter((group) => group.id !== "model-selection")
    .map((group) => {
      const items = roadmap.assets.filter((item) => item.group === group.id);
      const ready = items.filter(
        (item) => roadmapAssetState(item) === "approved",
      ).length;
      return `<section class="roadmap-asset-group">
        <div class="roadmap-group-heading">
          <div>
            <span>${escapeHtml(group.name)}</span>
            <p>${escapeHtml(group.description)}</p>
          </div>
          <div>
            <strong>${ready}/${items.length}</strong>
            <button class="text-button" type="button" data-roadmap-group-create="${escapeHtml(group.id)}">남은 항목 만들기</button>
          </div>
        </div>
        <div class="roadmap-asset-grid">
          ${items
            .map((item) => {
              const asset = roadmapAssetRecord(item);
              const status = roadmapAssetState(item);
              const pages = item.pageNumbers.length
                ? `상세 ${item.pageNumbers.join("·")}장`
                : "원장 전용";
              return `<article class="roadmap-asset-card ${roadmapStatusClass(status)}">
                <div class="roadmap-asset-card-top">
                  <span>${escapeHtml(pages)}</span>
                  <strong>${escapeHtml(roadmapStatusLabel(status))}</strong>
                </div>
                <h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.purpose)}</p>
                <div class="roadmap-asset-card-bottom">
                  <code>${escapeHtml(item.role)}</code>
                  ${
                    asset
                      ? `<button class="text-button" type="button" data-roadmap-review="${escapeHtml(asset.id)}">검수·비교</button>`
                      : item.requiresModel && !gate.modelReady
                        ? `<span>모델 승인 후</span>`
                        : `<span>제작 예정</span>`
                  }
                </div>
              </article>`;
            })
            .join("")}
        </div>
      </section>`;
    })
    .join("");

  $("#detailPageRoadmap").innerHTML = roadmap.pages
    .map((page) => {
      const readyAssets = page.assetRoles.filter((role) => {
        const item = roadmap.assets.find((asset) => asset.role === role);
        return item && roadmapAssetState(item) === "approved";
      }).length;
      const pageReady =
        gate.ready && readyAssets === page.assetRoles.length;
      return `<article class="downstream-card${pageReady ? " is-ready" : ""}">
        <span>${String(page.number).padStart(2, "0")} · ${escapeHtml(page.name)}</span>
        <div>
          <strong>${escapeHtml(page.headline || page.name)}</strong>
          <p>${escapeHtml(page.sellingPoint || page.purpose)}</p>
          <small>${escapeHtml(page.visualPlan || page.purpose)}</small>
        </div>
      </article>`;
    })
    .join("");
  $("#gifProductionRoadmap").innerHTML = roadmap.gifs
    .map((gif) => {
      const readyAssets = gif.sourceAssetRoles.filter((role) => {
        const item = roadmap.assets.find((asset) => asset.role === role);
        return item && roadmapAssetState(item) === "approved";
      }).length;
      const outputAsset = state.project?.assetList?.find(
        (asset) => asset.id === gif.outputAssetId,
      );
      const outputStatus = outputAsset ? versionStatus(outputAsset) : null;
      const previewReview = roadmap.previewReviews?.[gif.id] || {};
      const previewApproved = previewReview.status === "preview_approved";
      const previewChangesRequested =
        previewReview.status === "changes_requested";
      const gifReady =
        gate.ready && readyAssets === gif.sourceAssetRoles.length;
      const statusText = outputAsset
        ? roadmapStatusLabel(outputStatus)
        : previewApproved
          ? "프리뷰 승인 완료 · 최종 렌더 가능"
          : previewChangesRequested
            ? "변경 요청 저장됨"
        : gifReady
          ? "제작 가능"
          : "이미지 승인 후";
      const reviewAction = outputAsset
        ? `<button class="text-button" type="button" data-roadmap-review="${escapeHtml(outputAsset.id)}">검수·비교</button>`
        : "";
      const previewUrl = roadmap.previewUrls?.[gif.id] || "";
      const previewImage = roadmap.previewImages?.[gif.id] || "";
      const canReviewPreview = Boolean(previewUrl && previewImage && !outputAsset);
      const previewMedia = previewImage
        ? `<a class="roadmap-motion-preview" href="${escapeHtml(previewUrl || pathUrl(previewImage))}" ${previewUrl ? 'target="_blank" rel="noreferrer"' : ""}>
            <img src="${pathUrl(previewImage)}" alt="${escapeHtml(gif.name)} 검수 프리뷰" />
          </a>`
        : "";
      const previewAction = previewUrl
        ? `<a class="text-button" href="${escapeHtml(previewUrl)}" target="_blank" rel="noreferrer">프리뷰 열기</a>`
        : "";
      const previewApprovalAction = canReviewPreview
        ? `<button class="text-button${previewApproved ? " is-approved" : ""}" type="button" data-motion-preview-approve="${escapeHtml(gif.id)}" ${previewApproved ? "disabled" : ""}>${previewApproved ? "프리뷰 승인됨" : "이 프리뷰 승인"}</button>`
        : "";
      const previewFeedbackAction = canReviewPreview
        ? `<button class="text-button" type="button" data-motion-preview-feedback="${escapeHtml(gif.id)}">변경 요청</button>`
        : "";
      const previewFeedback = previewChangesRequested
        ? `<p class="roadmap-preview-feedback">요청: ${escapeHtml(previewReview.feedback || "")}</p>`
        : "";
      return `<article class="downstream-card${gifReady || outputStatus === "approved" ? " is-ready" : ""}">
        <span>움직임 ${gif.number}</span>
        <div>
          ${previewMedia}
          <strong>${escapeHtml(gif.name)}</strong>
          <p>${escapeHtml(gif.purpose)}</p>
          ${previewFeedback}
          <small>${escapeHtml(statusText)}</small>
          ${
            reviewAction ||
            previewAction ||
            previewApprovalAction ||
            previewFeedbackAction
              ? `<div class="roadmap-card-actions">${previewAction}${previewApprovalAction}${previewFeedbackAction}${reviewAction}</div>`
              : ""
          }
        </div>
      </article>`;
    })
    .join("");

  $$("[data-model-candidate]", $("#modelApprovalPanel")).forEach((button) =>
    button.addEventListener("click", () => {
      const item = candidates.find(
        (candidate) => candidate.role === button.dataset.modelCandidate,
      );
      const asset = item ? roadmapAssetRecord(item) : null;
      if (!asset) return;
      state.selectedAssetId = asset.id;
      state.reviewVersion = asset.selectedVersion;
      render();
      $(".asset-workbench")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }),
  );
  $("#approveSelectedModel")?.addEventListener("click", approveModelSsot);
  $$("[data-roadmap-group-create]").forEach((button) =>
    button.addEventListener("click", () =>
      openProductAssetBatchDialog({
        groupId: button.dataset.roadmapGroupCreate,
      }),
    ),
  );
  $$("[data-roadmap-review]").forEach((button) =>
    button.addEventListener("click", () => {
      state.selectedAssetId = button.dataset.roadmapReview;
      state.reviewVersion = null;
      render();
      $(".asset-workbench")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }),
  );
  $$("[data-motion-preview-approve]").forEach((button) =>
    button.addEventListener("click", async () => {
      const gif = roadmap.gifs.find(
        (item) => item.id === button.dataset.motionPreviewApprove,
      );
      if (
        !gif ||
        !window.confirm(
          `${gif.name} 프리뷰를 승인할까요?\n승인 뒤 최종 GIF 렌더를 진행할 수 있습니다.`,
        )
      ) {
        return;
      }
      try {
        setSaveState("GIF 프리뷰 승인 저장 중");
        await api(
          `/api/motion-previews/${encodeURIComponent(gif.id)}/approve`,
          {
            method: "POST",
            body: JSON.stringify({ confirmedByUser: true }),
          },
        );
        await refresh({ quiet: true });
        toast(`${gif.name} 프리뷰를 승인했습니다.`);
      } catch (error) {
        toast(error.message, "error");
      } finally {
        setSaveState("저장됨");
      }
    }),
  );
  $$("[data-motion-preview-feedback]").forEach((button) =>
    button.addEventListener("click", async () => {
      const gif = roadmap.gifs.find(
        (item) => item.id === button.dataset.motionPreviewFeedback,
      );
      if (!gif) return;
      const feedback = window.prompt(
        `${gif.name}에서 바꿀 내용을 적어 주세요.`,
        roadmap.previewReviews?.[gif.id]?.feedback || "",
      );
      if (feedback === null) return;
      try {
        setSaveState("GIF 변경 요청 저장 중");
        await api(
          `/api/motion-previews/${encodeURIComponent(gif.id)}/feedback`,
          {
            method: "POST",
            body: JSON.stringify({
              confirmedByUser: true,
              feedback,
            }),
          },
        );
        await refresh({ quiet: true });
        toast(`${gif.name} 변경 요청을 저장했습니다.`);
      } catch (error) {
        toast(error.message, "error");
      } finally {
        setSaveState("저장됨");
      }
    }),
  );
}

function renderProductSsot() {
  const items = state.productSsot;
  const lock = state.productSsotLock;
  $("#productSsotSummary").textContent = lock
    ? `${items.length}장 · ${escapeHtml(lock.revisionId.toUpperCase())} 잠금`
    : `${items.length}장 · 검수 대기`;
  $("#lockProductSsot").disabled =
    !isAssetWritable() || items.length === 0 || Boolean(lock);
  $("#lockProductSsot").textContent = lock ? "SSOT 잠금 완료" : "SSOT 잠금";
  $("#createProductAsset").disabled =
    !isAssetWritable() || !lock || items.length === 0;
  $("#createAllProductAssets").disabled =
    !isAssetWritable() || !lock || items.length === 0;
  $("#productSsotList").innerHTML =
    items.length === 0
      ? `<div class="product-ssot-empty">등록된 실제품 사진이 없습니다.<br />동일 SKU를 직접 촬영한 정면·측면·착용 사진을 여러 장 등록하세요.</div>`
      : items
          .map((item) => {
            const mime = String(item.mime || "");
            const previewable = [
              "image/jpeg",
              "image/png",
              "image/webp",
            ].includes(mime);
            const preview = previewable
              ? `<img src="${pathUrl(item.path)}" alt="${escapeHtml(item.originalFileName)}" />`
              : escapeHtml(mime.split("/")[1]?.toUpperCase() || "IMAGE");
            const identityStatus =
              item.identityStatus === "locked"
                ? `${escapeHtml(item.identityLabelText || "라벨 확인")} · 잠금`
                : "검수 대기";
            return `<article class="product-ssot-card">
              <div class="product-ssot-preview">${preview}</div>
              <div class="product-ssot-meta">
                <strong title="${escapeHtml(item.originalFileName)}">${escapeHtml(item.originalFileName)}</strong>
                <span>${escapeHtml(item.variantColor || "색상 미지정")} · ${identityStatus}</span>
                <span class="reference-only-badge">참조 전용 · ImageGen 파생 필요</span>
                <p>최종 이미지와 GIF에는 이 원본을 직접 넣지 않습니다.</p>
                <button class="button button-secondary" type="button" data-ssot-derive ${isAssetWritable() && lock ? "" : "disabled"}>ImageGen 파생 만들기</button>
              </div>
            </article>`;
          })
          .join("");
  $$("[data-ssot-derive]", $("#productSsotList")).forEach((button) =>
    button.addEventListener("click", () => $("#createProductAsset").click()),
  );
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
            const referenceOnly = isReferenceOnlyVersion(version);
            return `<button type="button" class="asset-card${asset.id === state.selectedAssetId ? " is-selected" : ""}" data-asset-id="${asset.id}">
              <span class="asset-thumb">${thumb}</span>
              <span class="asset-meta">
                <strong>${escapeHtml(asset.name)}</strong>
                <span>${escapeHtml(asset.role)} · v${asset.selectedVersion || "-"}</span>
                ${referenceOnly ? `<span class="reference-only-badge">참조 전용 · 파생 필요</span>` : ""}
                <span class="status-text" data-status="${status}">${STATUS_LABELS[status] || status}</span>
              </span>
            </button>`;
          })
          .join("");
  $$("[data-asset-id]", $("#assetList")).forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAssetId = button.dataset.assetId;
      state.selectedLayerId = null;
      state.reviewVersion = null;
      $(".asset-workbench")?.closest("details")?.setAttribute("open", "");
      render();
    });
  });
  renderAssetGallery();
  renderCompare();
}

function renderAssetGallery() {
  const gallery = $("#assetGallery");
  const assets = state.project.assetList;
  gallery.innerHTML =
    assets.length === 0
      ? `<div class="asset-gallery-empty">전체 제작을 시작하면 완성된 에셋이 이곳에 한꺼번에 표시됩니다.</div>`
      : assets
          .map((asset) => {
            const version = asset.selectedData;
            const media = version?.path
              ? asset.kind === "video"
                ? `<video src="${pathUrl(version.path)}" muted playsinline preload="metadata"></video>`
                : `<img src="${pathUrl(version.path)}" alt="${escapeHtml(asset.name)}" />`
              : escapeHtml(asset.kind.toUpperCase());
            const status = versionStatus(asset);
            const referenceOnly = isReferenceOnlyVersion(version);
            const viewLink = version?.path
              ? `<a class="button button-quiet" href="${pathUrl(version.path)}" target="_blank" rel="noreferrer">원본 보기</a>`
              : `<button class="button button-quiet" type="button" disabled>원본 없음</button>`;
            return `<article class="asset-gallery-card${asset.id === state.selectedAssetId ? " is-selected" : ""}" data-gallery-asset-id="${escapeHtml(asset.id)}">
              <div class="asset-gallery-preview">${media}</div>
              <div class="asset-gallery-body">
                <strong title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</strong>
                <span>${escapeHtml(asset.role)} · ${asset.versions.length}개 버전 · 현재 v${asset.selectedVersion || "-"}</span>
                ${referenceOnly ? `<span class="reference-only-badge">참조 전용 · ImageGen 파생 필요</span><p class="reference-only-copy">업로드 원본은 최종 에셋이나 GIF에서 직접 소비할 수 없습니다.</p>` : ""}
                <span class="status-text" data-status="${status}">${STATUS_LABELS[status] || status}</span>
                <div class="asset-gallery-actions">
                  ${viewLink}
                  ${
                    referenceOnly
                      ? `<button class="button button-secondary" type="button" data-asset-action="derive" data-asset-id="${escapeHtml(asset.id)}" ${isAssetWritable() ? "" : "disabled"}>ImageGen 파생</button>`
                      : `<button class="button button-secondary" type="button" data-asset-action="edit" data-asset-id="${escapeHtml(asset.id)}" ${isAssetWritable() ? "" : "disabled"}>수정</button>`
                  }
                  <button class="button button-primary" type="button" data-asset-action="review" data-asset-id="${escapeHtml(asset.id)}">검수·비교</button>
                </div>
              </div>
            </article>`;
          })
          .join("");
  $$('[data-asset-action="review"]', gallery).forEach((button) =>
    button.addEventListener("click", () => {
      state.selectedAssetId = button.dataset.assetId;
      state.selectedLayerId = null;
      state.reviewVersion = null;
      $(".asset-workbench")?.closest("details")?.setAttribute("open", "");
      render();
      $(".asset-workbench")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }),
  );
  $$('[data-asset-action="edit"]', gallery).forEach((button) =>
    button.addEventListener("click", () => {
      state.selectedAssetId = button.dataset.assetId;
      state.selectedLayerId = null;
      state.reviewVersion = null;
      render();
      openPromptDialog("asset");
    }),
  );
  $$('[data-asset-action="derive"]', gallery).forEach((button) =>
    button.addEventListener("click", () => {
      state.selectedAssetId = button.dataset.assetId;
      state.selectedLayerId = null;
      state.reviewVersion = null;
      render();
      openPromptDialog("generation");
    }),
  );
}

function renderCompare() {
  const asset = selectedAsset();
  const canvas = $("#compareCanvas");
  if (!asset || asset.versions.length === 0) {
    canvas.innerHTML = `<div class="empty-state"><strong>검수할 에셋을 선택하세요.</strong><p>원본과 현재 후보를 같은 확대율로 비교합니다.</p></div>`;
    return;
  }
  const original = asset.versions[0];
  const candidate = reviewedVersion(asset) || original;
  const versionStrip = `<div class="version-strip"><span>비교할 버전</span>${asset.versions
    .map(
      (version) =>
        `<button class="version-chip${version.number === candidate.number ? " is-selected" : ""}" type="button" data-review-version="${version.number}">v${version.number}${version.number === asset.selectedVersion ? " · 현재" : ""}</button>`,
    )
    .join("")}</div>`;
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
    canvas.innerHTML = `${versionStrip}${syncControls}<div class="compare-pair">
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
    bindVersionPicker();
    return;
  }
  const difference = state.compareMode === "difference";
  canvas.innerHTML = `${versionStrip}${syncControls}<div class="compare-overlay">
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
  bindVersionPicker();
}

function bindVersionPicker() {
  $$("[data-review-version]", $("#compareCanvas")).forEach((button) =>
    button.addEventListener("click", () => {
      state.reviewVersion = Number(button.dataset.reviewVersion);
      renderCompare();
      renderInspector();
    }),
  );
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
      ? `<div class="empty-inspector">상세페이지 제작 필수 에셋을 먼저 등록하세요.</div>`
      : assets
          .map((asset) => {
            const version = asset.selectedData;
            const pass = version?.approval?.decision === "approved";
            return `<div class="gate-row">
              <div><strong>${escapeHtml(asset.name)}</strong></div>
              <span class="gate-result ${pass ? "is-pass" : "is-fail"}">${pass ? "승인" : "미승인"}</span>
            </div>`;
          })
          .join("");
  $("#lockAssembly").disabled =
    state.project.phase !== "assembly_ready" ||
    assets.length === 0 ||
    pendingJobs.length > 0;
  $("#lockAssembly").textContent = state.project.activeRevision.assembly
    ? "에셋 확정 완료 · 상세페이지 편집 중"
    : `에셋 확정 · ${state.productionRoadmap?.pages?.length || ""}개 섹션 검토 시작`;
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
    ["에셋 확정 잠금", Boolean(state.project.activeRevision.assembly)],
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
  if (state.view === "html" && state.selectedHtmlLayerId) {
    renderHtmlInspector(inspector, title, dot);
    return;
  }
  if (state.view === "motion" && state.selectedLayerId) {
    renderMotionLayerInspector(inspector, title, dot);
    return;
  }
  if (state.view !== "assets") {
    title.textContent = "선택 없음";
    inspector.innerHTML = `<div class="empty-inspector">이미지 승인이나 상세페이지 편집에서 항목을 선택하면 고급 속성이 표시됩니다.</div>`;
    return;
  }
  const asset = selectedAsset();
  if (!asset) {
    title.textContent = "선택 없음";
    inspector.innerHTML = `<div class="empty-inspector">에셋이나 상세페이지 레이어를 선택하면 속성과 프롬프트 수정 범위가 표시됩니다.</div>`;
    return;
  }
  const version = reviewedVersion(asset);
  const qa = version?.qa;
  const referenceOnly = isReferenceOnlyVersion(version);
  const isModelCandidate = asset.role?.startsWith("model-candidate-");
  const modelSsotLocked = state.project?.modelSsot?.status === "locked";
  const isLockedModelVersion =
    modelSsotLocked &&
    state.project.modelSsot.assetId === asset.id &&
    state.project.modelSsot.version === version?.number;
  const canLockModelVersion =
    isModelCandidate &&
    !modelSsotLocked &&
    !referenceOnly &&
    qa?.status === "passed" &&
    !qa?.hardFailures?.length &&
    isAssetWritable();
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
        <div class="property-row"><span>검수 버전</span><strong>v${version?.number || "-"}${version?.number === asset.selectedVersion ? " · 현재 채택" : ""}</strong></div>
        <div class="property-row"><span>용도</span><strong>${referenceOnly ? "참조 전용" : "최종 소비 가능"}</strong></div>
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
      <p class="qa-message">${referenceOnly ? "업로드 원본은 직접 사용할 수 없습니다. 이 원본을 참조해 ImageGen 파생 버전을 만드세요." : "원본을 보존하고 후보 한 개를 새 버전으로 만듭니다."}</p>
      <div class="inspector-actions">
        <button id="inspectorPrompt" class="button button-secondary wide" type="button" ${isAssetWritable() ? "" : "disabled"}>${referenceOnly ? "ImageGen 파생 만들기" : "프롬프트로 수정"}</button>
        ${
          isModelCandidate
            ? `<button id="inspectorApproveModel" class="button button-primary wide" type="button" ${canLockModelVersion ? "" : "disabled"}>${isLockedModelVersion ? "이 버전이 모델 SSOT로 잠김" : "이 버전을 모델 SSOT로 승인·잠금"}</button>`
            : ""
        }
        <button id="approveAsset" class="button button-primary" type="button" ${!referenceOnly && qa?.status === "passed" && !qa?.hardFailures?.length && isAssetWritable() ? "" : "disabled"}>승인</button>
        ${
          !referenceOnly && (qa?.status !== "passed" || qa?.hardFailures?.length)
            ? `<button id="overrideAsset" class="button button-secondary wide" type="button" ${isAssetWritable() ? "" : "disabled"}>사용자 판단으로 채택</button>`
            : ""
        }
        <button id="holdAsset" class="button button-quiet" type="button" ${isAssetWritable() ? "" : "disabled"}>보류</button>
      </div>
    </section>`;
  $("#inspectorPrompt")?.addEventListener("click", () =>
    openPromptDialog(referenceOnly ? "generation" : "asset"),
  );
  $("#inspectorApproveModel")?.addEventListener("click", approveModelSsot);
  $("#approveAsset")?.addEventListener("click", () => approveSelected("approved"));
  $("#overrideAsset")?.addEventListener("click", () =>
    approveSelected("approved", { userOverride: true }),
  );
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
    title.textContent = "상세페이지 레이어 선택";
    inspector.innerHTML = `<div class="empty-inspector">편집 모드를 켜고 캔버스에서 텍스트나 박스를 선택하세요.</div>`;
    return;
  }
  title.textContent = layer.dataset.layerId;
  dot.classList.add("is-ready");
  const style = getComputedStyle(layer);
  inspector.innerHTML = `<section class="inspector-section">
    <h2>상세페이지 레이어</h2>
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
              <div><strong>${escapeHtml(job.type)}</strong><span>${escapeHtml(job.assetId || "프로젝트")} · ${escapeHtml(job.executor?.provider || "기본 실행기")}${job.executor?.concurrency ? ` × ${job.executor.concurrency}` : ""} · ${new Date(job.createdAt).toLocaleString("ko-KR")}</span></div>
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

async function approveSelected(
  decision,
  { userOverride = false } = {},
) {
  const asset = selectedAsset();
  const version = reviewedVersion(asset);
  if (!asset || !version) return;
  let overrideReason = "";
  if (userOverride) {
    overrideReason = prompt(
      "Codex QA와 다르게 이 버전을 채택하는 이유를 기록해 주세요.",
      "실물을 직접 확인한 사용자 판단으로 이 버전이 더 정확함",
    )?.trim();
    if (!overrideReason) return;
  }
  try {
    await api(`/api/assets/${encodeURIComponent(asset.id)}/approve`, {
      method: "POST",
      body: JSON.stringify({
        version: version.number,
        decision,
        approvedBy: "local-user",
        ...(userOverride
          ? { userOverride: true, overrideReason }
          : {}),
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
      : `${asset.name} · v${reviewedVersion(asset)?.number || asset.selectedVersion || "-"}`;
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
    render();
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

async function approveModelSsot() {
  const asset = selectedAsset();
  const version = reviewedVersion(asset);
  if (
    !asset?.role?.startsWith("model-candidate-") ||
    !version
  ) {
    toast("먼저 모델 후보 카드와 승인할 버전을 선택하세요.", "error");
    return;
  }
  if (
    !confirm(
      `${asset.name} v${version.number}의 얼굴·체형·헤어·피부톤·의상을 이후 모든 인간 장면의 모델 SSOT로 잠글까요?`,
    )
  ) {
    return;
  }
  try {
    await api("/api/model/ssot/approve", {
      method: "POST",
      body: JSON.stringify({
        assetId: asset.id,
        version: version.number,
        approvedBy: "local-user",
        confirmedByUser: true,
      }),
    });
    toast(`${asset.name} v${version.number}을 모델 SSOT로 승인했습니다.`);
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  }
}

function openProductAssetBatchDialog({ groupId = "" } = {}) {
  const roadmap = state.productionRoadmap;
  if (!roadmap) return;
  const existingRoles = new Set(
    state.project.assetList.map((asset) => asset.role),
  );
  const activeRoles = new Set(
    activeJobs()
      .map((job) => job.target?.role)
      .filter(Boolean),
  );
  const modelReady = state.project.modelSsot?.status === "locked";
  const targets = roadmap.assets.filter(
    (item) =>
      item.generatable !== false &&
      (!groupId || item.group === groupId),
  );
  $("#batchAssetTargets").innerHTML = targets
    .map((item) => {
      const asset = roadmapAssetRecord(item);
      const staleModelVersion =
        Boolean(asset) &&
        item.requiresModel &&
        modelReady &&
        !assetUsesLockedModel(asset);
      const existing = existingRoles.has(item.role) && !staleModelVersion;
      const active = activeRoles.has(item.role);
      const modelBlocked = item.requiresModel && !modelReady;
      const unavailable = existing || active || modelBlocked;
      const stateLabel = existing
        ? "생성됨 · 검수 필요"
        : active
          ? "제작 중"
          : modelBlocked
            ? "모델 승인 후"
            : staleModelVersion
              ? "승인 모델로 재제작"
            : "제작 대상";
      return `<label class="batch-asset-target">
        <input type="checkbox" name="targets" value="${escapeHtml(item.role)}" ${unavailable ? "disabled" : "checked"} />
        <span>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.purpose)} · ${escapeHtml(item.role)}</span>
        </span>
        <span class="batch-asset-state">${stateLabel}</span>
      </label>`;
    })
    .join("");
  $("#productAssetBatchDialog").dataset.groupId = groupId;
  $("#productAssetBatchDialog").querySelector(".dialog-copy").textContent =
    groupId === "model-selection"
      ? "모델 후보 4명을 먼저 만들고 각 결과를 비교하세요. 한 명을 모델 SSOT로 승인해야 착용·사용 예시가 열립니다."
      : modelReady
        ? `남은 선행 에셋 ${targets.length}개 중 새로 만들 항목을 선택하세요. 승인 모델과 제품 SSOT가 필요한 장면에는 두 원장이 함께 연결됩니다.`
        : "모델 후보·제품 뷰·배경처럼 지금 만들 수 있는 항목을 먼저 병렬 제작합니다. 사람 장면은 모델 승인 뒤 두 번째 묶음으로 엽니다.";
  const form = $("#productAssetBatchForm");
  form.elements.executor.value = "god-tibo-imagen";
  form.elements.concurrency.value = "4";
  form.elements.confirmed.checked = false;
  $("#productAssetBatchDialog").showModal();
}

function setupEvents() {
  $$(".stage-button").forEach((button) =>
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.view = button.dataset.view;
      render();
    }),
  );
  $$("[data-go-view]").forEach((button) =>
    button.addEventListener("click", () => {
      state.view = button.dataset.goView;
      render();
    }),
  );
  $("#toggleInspector").addEventListener("click", () => {
    state.inspectorOpen = !state.inspectorOpen;
    render();
  });
  $("#closeInspector").addEventListener("click", () => {
    state.inspectorOpen = false;
    render();
  });
  $("#supplierUrlForm").addEventListener("submit", handleSupplierUrl);
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
  $("#uploadProductSsot").addEventListener("click", () => {
    $("#ssotUploadForm").reset();
    updateProductSsotFileSummary();
    $("#ssotUploadDialog").showModal();
  });
  $("#lockProductSsot").addEventListener("click", () => {
    const form = $("#ssotLockForm");
    form.reset();
    form.elements.variantColor.value =
      state.productSsot[0]?.variantColor || "";
    form.elements.notes.value =
      "실제품 원본 전체에서 라벨 문구와 색상을 확인함";
    $("#ssotLockDialog").showModal();
  });
  $("#createProductAsset").addEventListener("click", () => {
    const form = $("#productAssetForm");
    form.reset();
    form.elements.name.value = "화이트 루즈핏 히어로";
    form.elements.prompt.value =
      "실제품의 화이트 플리츠 원단, 여유 있는 핏, 엄지홀, 손등 커버, HELLO CUTE SLEEVE 라벨을 정확히 유지한 광고용 히어로 비주얼. 이미지 안에는 광고 문구를 넣지 않음.";
    $("#productAssetDialog").showModal();
  });
  $("#createAllProductAssets").addEventListener(
    "click",
    () => openProductAssetBatchDialog(),
  );
  $("#createRoadmapAssets").addEventListener("click", () =>
    openProductAssetBatchDialog(),
  );
  $("#uploadAsset").addEventListener("click", () => $("#uploadDialog").showModal());
  $("#requestAssetGeneration")?.addEventListener("click", () =>
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
  $("#ssotUploadForm").elements.files.addEventListener(
    "change",
    updateProductSsotFileSummary,
  );
  $("#ssotUploadForm").addEventListener("submit", handleProductSsotUpload);
  $("#ssotLockForm").addEventListener("submit", handleProductSsotLock);
  $("#productAssetForm").addEventListener(
    "submit",
    handleProductAssetRequest,
  );
  $("#productAssetBatchForm").addEventListener(
    "submit",
    handleProductAssetBatchRequest,
  );
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
    toast(state.htmlEditing ? "상세페이지 레이어를 선택해 수정하세요." : "편집 모드를 종료했습니다.");
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
    const name = prompt("체크포인트 이름을 입력하세요.", "상세페이지 검토본 정렬 완료");
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

async function handleSupplierUrl(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $("#confirmSupplierUrl");
  const supplierUrl = form.elements.supplierUrl.value.trim();
  submit.disabled = true;
  submit.textContent = "확인 중";
  try {
    await api("/api/project/source", {
      method: "POST",
      body: JSON.stringify({
        supplierUrl,
        confirmedByUser: true,
      }),
    });
    state.view = "planning";
    toast("공급처 URL을 확인했습니다. 소구점과 상세페이지 흐름을 확인하세요.");
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "URL 확인";
  }
}

function updateProductSsotFileSummary() {
  const form = $("#ssotUploadForm");
  const files = [...form.elements.files.files];
  const summary = $("#ssotFileSummary");
  const submit = form.querySelector('[type="submit"]');
  if (files.length === 0) {
    summary.textContent = "선택된 사진이 없습니다.";
    submit.textContent = "선택한 사진 등록";
    return;
  }
  const totalMegabytes = files.reduce((sum, file) => sum + file.size, 0) /
    (1024 * 1024);
  const names = files
    .slice(0, 8)
    .map((file) => file.name)
    .join("\n");
  const remaining =
    files.length > 8 ? `\n외 ${files.length - 8}장` : "";
  summary.textContent = `${files.length}장 · ${totalMegabytes.toFixed(1)}MB\n${names}${remaining}`;
  submit.textContent = `${files.length}장 등록`;
}

async function handleProductSsotUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const files = [...form.elements.files.files];
  if (files.length === 0) return;
  if (files.length > 20) {
    toast("실제품 사진은 한 번에 최대 20장까지 등록할 수 있습니다.", "error");
    return;
  }
  if (files.some((file) => file.size > 25 * 1024 * 1024)) {
    toast("실제품 사진 한 장은 25MB 이하여야 합니다.", "error");
    return;
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > 80 * 1024 * 1024) {
    toast("실제품 사진 전체 용량은 한 번에 80MB 이하여야 합니다.", "error");
    return;
  }

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const payloadFiles = [];
    for (let index = 0; index < files.length; index += 1) {
      submit.textContent = `사진 읽는 중 ${index + 1}/${files.length}`;
      payloadFiles.push({
        fileName: files[index].name,
        dataUrl: await fileToDataUrl(files[index]),
      });
    }
    submit.textContent = `${files.length}장 저장 중`;
    const result = await api("/api/product/ssot/register", {
      method: "POST",
      body: JSON.stringify({ files: payloadFiles }),
    });
    form.reset();
    updateProductSsotFileSummary();
    $("#ssotUploadDialog").close();
    toast(`실제품 원본 ${result.count}장을 제품 사실 SSOT로 등록했습니다.`);
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
    if ($("#ssotUploadDialog").open) updateProductSsotFileSummary();
  }
}

async function handleProductSsotLock(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  if (!form.elements.confirmed.checked) {
    toast("실제품 동일성 확인이 필요합니다.", "error");
    return;
  }
  submit.disabled = true;
  submit.textContent = "원본 해시 확인 중";
  try {
    const result = await api("/api/product/ssot/lock", {
      method: "POST",
      body: JSON.stringify({
        labelText: form.elements.labelText.value.trim(),
        variantColor: form.elements.variantColor.value.trim(),
        revisionId: state.project.currentRevisionId,
        notes: form.elements.notes.value.trim(),
        confirmedByUser: true,
      }),
    });
    $("#ssotLockDialog").close();
    toast(
      `${result.items.length}장을 ${result.lock.labelText} 기준으로 ${result.lock.revisionId.toUpperCase()}에 잠갔습니다.`,
    );
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "현재 개정판에 잠금";
  }
}

async function handleProductAssetRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  if (!form.elements.confirmed.checked) {
    toast("잠긴 SSOT 사용 확인이 필요합니다.", "error");
    return;
  }
  submit.disabled = true;
  submit.textContent = "요청 등록 중";
  try {
    const job = await api("/api/product/ssot/generation-jobs", {
      method: "POST",
      body: JSON.stringify({
        name: form.elements.name.value.trim(),
        role: form.elements.role.value,
        prompt: form.elements.prompt.value.trim(),
        confirmedByUser: true,
      }),
    });
    $("#productAssetDialog").close();
    toast(`${job.target.name} 제작 요청을 작업 센터에 등록했습니다.`);
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "제작 요청 등록";
  }
}

async function handleProductAssetBatchRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const roles = $$('input[name="targets"]:checked', form).map(
    (input) => input.value,
  );
  if (roles.length === 0) {
    toast("새로 제작할 에셋을 하나 이상 선택하세요.", "error");
    return;
  }
  if (!form.elements.confirmed.checked) {
    toast("잠긴 SSOT 일괄 사용 확인이 필요합니다.", "error");
    return;
  }
  const targets = roles.map((role) =>
    state.productionRoadmap.assets.find((item) => item.role === role),
  );
  submit.disabled = true;
  submit.textContent = `${targets.length}개 요청 등록 중`;
  try {
    const result = await api("/api/product/ssot/batch-generation-jobs", {
      method: "POST",
      body: JSON.stringify({
        targets: targets.map(({
          id,
          name,
          role,
          prompt,
          group,
          purpose,
          pageNumbers,
          sourceMode,
          requiresModel,
          required,
        }) => ({
          roadmapId: id,
          name,
          role,
          prompt,
          group,
          purpose,
          pageNumbers,
          sourceMode,
          requiresModel,
          required,
        })),
        execution: {
          provider: form.elements.executor.value,
          concurrency: Number(form.elements.concurrency.value || 4),
          size: "1024x1536",
          autoStart: form.elements.executor.value === "god-tibo-imagen",
        },
        confirmedByUser: true,
      }),
    });
    $("#productAssetBatchDialog").close();
    toast(
      result.execution.autoStarted
        ? `에셋 ${result.count}개를 ${result.execution.concurrency}개씩 병렬 제작합니다. 결과는 전체 에셋 보드에 모입니다.`
        : `에셋 ${result.count}개를 한 번에 제작 대기열에 등록했습니다. 결과는 전체 에셋 보드에 모입니다.`,
    );
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "선택 에셋 전체 제작";
  }
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
      provenance: "raw-upload-reference",
    };
    const result = await api("/api/assets/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.selectedAssetId = result.asset.id;
    form.reset();
    $("#uploadDialog").close();
    toast("참조 원본을 등록했습니다. ImageGen 파생 버전을 만들어 사용하세요.");
    await refresh({ quiet: true });
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "참조 원본 등록";
  }
}

async function handlePrompt(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const asset = selectedAsset();
  const version = reviewedVersion(asset);
  if (!asset || !version) return;
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
        type:
          state.promptMode === "generation" || isReferenceOnlyVersion(version)
            ? "imagegen.edit"
            : isMotionAsset(asset)
              ? "hyperframes.edit"
              : "imagegen.edit",
        version: version.number,
        scope:
          state.promptMode === "motion" && state.selectedLayerId
            ? `${scope}:${state.selectedLayerId}`
            : scope,
        prompt: form.elements.prompt.value.trim(),
        sourceRefs: version.sourceRefs || [],
        executor: {
          provider: "god-tibo-imagen",
          concurrency: 1,
          size: "1024x1536",
          autoStart: true,
        },
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
      `승인된 에셋 버전과 해시를 잠그고 ${state.productionRoadmap?.pages?.length || ""}개 섹션의 카피·레이아웃 검토본을 생성할까요? 이후 에셋·GIF는 읽기 전용입니다.`,
    )
  ) {
    return;
  }
  try {
    await api("/api/detail-page/start", {
      method: "POST",
      body: JSON.stringify({
        approvedBy: "local-user",
        confirmedByUser: true,
      }),
    });
    state.view = "html";
    const cacheKey = Date.now();
    $("#htmlFrame").src = `/project/html/index.html?v=${cacheKey}`;
    $("#assemblyFrame").src = `/project/html/index.html?v=${cacheKey}`;
    toast("에셋을 확정하고 중복 없는 카피·레이아웃 검토본을 만들었습니다.");
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
