(() => {
  const STATE_VERSION = 5;
  const OBJECT_SELECTOR =
    "[data-edit],[data-edit-image],[data-edit-object],[data-studio-object]";
  const AUTO_SELECTABLE_SELECTOR =
    "h1,h2,h3,h4,p,span,strong,small,b,em,figcaption,figure,picture,img,article,li,th,td";
  const TEXT_SELECTOR = "[data-edit],[data-studio-text]";
  const MIN_OBJECT_SCALE = 0.25;
  const MAX_OBJECT_SCALE = 4;
  const FONT_STACKS = new Set([
    "",
    '"Noto Sans KR", "Malgun Gothic", sans-serif',
    '"Gmarket Sans", "GmarketSansMedium", sans-serif',
    '"S-Core Dream", "SCoreDream", sans-serif',
    '"Wanted Sans", "WantedSans", sans-serif',
    '"Black Han Sans", "Arial Black", sans-serif',
    '"Jalnan", "JalnanGothic", sans-serif',
  ]);
  const body = document.body;
  const page = document.querySelector("#detailPage");
  if (!page) return;
  if (window.self !== window.top) {
    document
      .querySelectorAll("[data-studio-launcher]")
      .forEach((launcher) => launcher.remove());
  }
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const editableNodes = () => [...document.querySelectorAll(TEXT_SELECTOR)];
  const imageNodes = () =>
    [...document.querySelectorAll("[data-edit-image]")];
  const objectNodes = () => [...document.querySelectorAll(OBJECT_SELECTOR)];
  const sectionNodes = () =>
    [...page.querySelectorAll(":scope > section[data-section]")];
  const objectTransforms = new WeakMap();
  let selectedObject = null;
  let selectedObjects = new Set();
  let dragState = null;
  let historyStack = [];
  let historyTimer = 0;
  let restoringHistory = false;
  let editorMode = "layout";
  let sectionCrops = { mobile: {}, desktop: {} };
  let pendingSerializationNonce = null;
  const SNAP_DISTANCE = 8;

  function ensureEditIds() {
    sectionNodes().forEach((section) => {
      [...section.querySelectorAll("[data-edit]")].forEach((node, index) => {
        if (!node.dataset.editId) {
          node.dataset.editId = `${section.dataset.section}:text-${index + 1}`;
        }
        node.dataset.studioObject = "";
      });
      [...section.querySelectorAll("[data-edit-image]")].forEach(
        (node, index) => {
          node.dataset.studioObject = "";
          if (!node.dataset.assetId && !node.dataset.imageId) {
            node.dataset.imageId = `${section.dataset.section}:image-${index + 1}`;
          }
        },
      );
      [...section.querySelectorAll("[data-edit-object]")].forEach(
        (node, index) => {
          node.dataset.studioObject = "";
          if (
            !node.dataset.assetId &&
            !node.dataset.imageId &&
            !node.dataset.objectId
          ) {
            node.dataset.objectId = `${section.dataset.section}:object-${index + 1}`;
          }
        },
      );
      [...section.querySelectorAll(AUTO_SELECTABLE_SELECTOR)].forEach(
        (node, index) => {
          node.dataset.studioObject = "";
          if (
            node.matches(
              "h1,h2,h3,h4,p,span,strong,small,b,em,figcaption,li,th,td",
            )
          ) {
            node.dataset.studioText = "";
          }
          if (
            !node.dataset.assetId &&
            !node.dataset.imageId &&
            !node.dataset.objectId &&
            !node.dataset.editId
          ) {
            node.dataset.objectId = `${section.dataset.section}:element-${index + 1}`;
          }
        },
      );
      [...section.querySelectorAll("[data-studio-text]")].forEach(
        (node, index) => {
          if (!node.dataset.editId) {
            node.dataset.editId = `${section.dataset.section}:auto-text-${index + 1}`;
          }
        },
      );
    });
  }

  ensureEditIds();
  body.dataset.editorMode = editorMode;

  const sectionCropStyle =
    document.querySelector("#studio-section-crop-rules") ||
    document.createElement("style");
  sectionCropStyle.id = "studio-section-crop-rules";
  if (!sectionCropStyle.isConnected) document.head.append(sectionCropStyle);

  function viewportMode() {
    return window.innerWidth <= 520 ? "mobile" : "desktop";
  }

  function normalizeSectionCrops(value = {}) {
    const ids = new Set(
      sectionNodes().map((section) => section.dataset.section),
    );
    const normalized = { mobile: {}, desktop: {} };
    for (const mode of ["mobile", "desktop"]) {
      for (const [id, rawHeight] of Object.entries(value?.[mode] || {})) {
        const height = Math.round(Number(rawHeight));
        if (ids.has(id) && Number.isFinite(height) && height >= 180) {
          normalized[mode][id] = Math.min(100000, height);
        }
      }
    }
    return normalized;
  }

  function renderSectionCropRules() {
    const rules = [];
    for (const [mode, media] of [
      ["mobile", "(max-width: 520px)"],
      ["desktop", "(min-width: 521px)"],
    ]) {
      const declarations = Object.entries(sectionCrops[mode] || {}).map(
        ([id, height]) =>
          `#detailPage > section[data-section="${CSS.escape(id)}"]{height:${height}px!important;min-height:0!important;overflow:hidden!important;}`,
      );
      if (declarations.length) {
        rules.push(`@media ${media}{${declarations.join("")}}`);
      }
    }
    sectionCropStyle.textContent = rules.join("\n");
  }

  function setSectionCrop(id, rawHeight, requestedMode) {
    const mode = ["mobile", "desktop"].includes(requestedMode)
      ? requestedMode
      : viewportMode();
    if (!sectionNodes().some((section) => section.dataset.section === id)) {
      return;
    }
    checkpointHistory();
    if (rawHeight === null || rawHeight === undefined || rawHeight === "") {
      delete sectionCrops[mode][id];
    } else {
      const height = Math.round(Number(rawHeight));
      if (!Number.isFinite(height) || height < 180) return;
      sectionCrops[mode][id] = Math.min(100000, height);
    }
    renderSectionCropRules();
    scheduleNotifyReady();
  }

  const interactionStyle = document.createElement("style");
  interactionStyle.dataset.studioInteraction = "";
  interactionStyle.textContent = `
    .is-editing[data-editor-mode="layout"] [data-studio-object] { cursor: grab !important; }
    .is-editing[data-editor-mode="text"] [data-studio-object] { cursor: default !important; }
    .is-editing [data-studio-object].studio-object-selected {
      outline: 2px solid #4b8df8 !important;
      outline-offset: 3px !important;
    }
    .is-editing [data-studio-object].studio-object-selected:not(.studio-object-active) {
      outline-style: dashed !important;
      outline-color: #22d3ee !important;
    }
    .is-editing [data-studio-object].studio-object-active {
      box-shadow: 0 0 0 2px rgba(255,255,255,.92), 0 0 0 5px rgba(75,141,248,.52) !important;
    }
    .is-editing[data-editor-mode="layout"] [data-studio-object].studio-object-dragging { cursor: grabbing !important; }
    .is-editing[data-editor-mode="text"] ${TEXT_SELECTOR} { cursor: text !important; }
    .studio-guide {
      position: absolute;
      z-index: 2147483646;
      pointer-events: none;
      opacity: 0;
      background: #22d3ee;
      box-shadow: 0 0 0 1px rgba(15,23,42,.2);
      transition: opacity 80ms ease;
    }
    .studio-guide.visible { opacity: .48; }
    .studio-guide.active { opacity: 1; background: #f43f5e; }
    .studio-guide.vertical { top: 0; width: 1px; min-height: 100%; }
    .studio-guide.horizontal { left: 0; height: 1px; width: 100%; }
  `;
  document.head.append(interactionStyle);

  const guideLayer = document.createElement("div");
  guideLayer.dataset.studioInteraction = "";
  guideLayer.setAttribute("aria-hidden", "true");
  const horizontalGuideNames = new Set([
    "section-safe-top",
    "section-center-y",
    "section-safe-bottom",
  ]);
  const guideNames = [
    "safe-left",
    "center-x",
    "safe-right",
    "section-safe-top",
    "section-center-y",
    "section-safe-bottom",
  ];
  const guides = new Map();
  guideNames.forEach((name) => {
    const guide = document.createElement("div");
    guide.className = `studio-guide ${
      horizontalGuideNames.has(name) ? "horizontal" : "vertical"
    }`;
    guide.dataset.guide = name;
    guideLayer.append(guide);
    guides.set(name, guide);
  });
  document.body.append(guideLayer);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function objectId(node) {
    return (
      node.dataset.assetId ||
      node.dataset.imageId ||
      node.dataset.objectId ||
      node.dataset.editId ||
      ""
    );
  }

  function objectLabel(node) {
    return (
      node.dataset.objectLabel ||
      node.getAttribute("alt") ||
      objectId(node) ||
      node.classList[0] ||
      node.tagName.toLowerCase()
    );
  }

  function objectLayerMetadata(node) {
    const section = node.closest("section[data-section]") || page;
    const layers = objectNodes().filter(
      (candidate) =>
        section.contains(candidate) &&
        !candidate.hasAttribute("data-studio-deleted"),
    );
    let domDepth = 0;
    let current = node;
    while (current && current !== section) {
      domDepth += 1;
      current = current.parentElement;
    }
    const computedZIndex = getComputedStyle(node).zIndex;
    return {
      layerIndex: Math.max(1, layers.indexOf(node) + 1),
      layerCount: layers.length,
      domDepth,
      zIndex: computedZIndex === "auto" ? "auto" : computedZIndex,
    };
  }

  function currentObjectTransform(node) {
    return (
      objectTransforms.get(node) || {
        x: 0,
        y: 0,
        scale: 1,
        fontFamily: "",
        color: "",
        textAlign: "",
        deleted: false,
      }
    );
  }

  function applyObjectTransform(node, transform) {
    const next = {
      x: clamp(Number(transform.x) || 0, -2000, 2000),
      y: clamp(Number(transform.y) || 0, -2000, 2000),
      scale: clamp(
        Number(transform.scale) || 1,
        MIN_OBJECT_SCALE,
        MAX_OBJECT_SCALE,
      ),
      fontFamily: String(transform.fontFamily || ""),
      color: /^#[0-9a-f]{6}$/i.test(transform.color || "")
        ? transform.color
        : "",
      textAlign: ["", "left", "center", "right", "justify"].includes(
        transform.textAlign,
      )
        ? transform.textAlign
        : "",
      deleted: Boolean(transform.deleted),
    };
    objectTransforms.set(node, next);
    node.style.setProperty("translate", `${next.x}px ${next.y}px`, "important");
    node.style.setProperty("scale", String(next.scale), "important");
    if (next.fontFamily) {
      node.style.setProperty("font-family", next.fontFamily, "important");
    } else {
      node.style.removeProperty("font-family");
    }
    if (next.color) {
      node.style.setProperty("color", next.color, "important");
    } else {
      node.style.removeProperty("color");
    }
    if (next.textAlign) {
      node.style.setProperty("text-align", next.textAlign, "important");
    } else {
      node.style.removeProperty("text-align");
    }
    if (next.deleted) {
      node.style.setProperty("display", "none", "important");
      node.dataset.studioDeleted = "";
    } else {
      node.style.removeProperty("display");
      delete node.dataset.studioDeleted;
    }
    return next;
  }

  function notifyObjectSelected(node) {
    const imageIndex = imageNodes().indexOf(node);
    const transform = currentObjectTransform(node);
    const computed = getComputedStyle(node);
    const isText = node.matches(TEXT_SELECTOR);
    if (imageIndex >= 0) {
      window.parent.postMessage(
        {
          type: "DETAIL_IMAGE_SELECTED",
          index: imageIndex,
          assetId: objectId(node),
          src: node.getAttribute("src") || "",
          alt: node.getAttribute("alt") || "",
        },
        "*",
      );
    }
    window.parent.postMessage(
      {
        type: "DETAIL_OBJECT_SELECTED",
        objectId: objectId(node),
        label: objectLabel(node),
        isImage: imageIndex >= 0,
        isText,
        imageIndex,
        src: imageIndex >= 0 ? node.getAttribute("src") || "" : "",
        alt: imageIndex >= 0 ? node.getAttribute("alt") || "" : "",
        text: isText ? node.textContent || "" : "",
        selectedCount: selectedObjects.size,
        selectedObjectIds: [...selectedObjects].map(objectId),
        ...objectLayerMetadata(node),
        ...transform,
        fontFamily: transform.fontFamily || computed.fontFamily,
        color: transform.color || computed.color,
        textAlign: transform.textAlign || computed.textAlign || "left",
      },
      "*",
    );
  }

  function notifyObjectChanged(node) {
    window.parent.postMessage(
      {
        type: "DETAIL_OBJECT_CHANGED",
        objectId: objectId(node),
        label: objectLabel(node),
        isText: node.matches(TEXT_SELECTOR),
        selectedCount: selectedObjects.size,
        ...objectLayerMetadata(node),
        ...currentObjectTransform(node),
      },
      "*",
    );
  }

  function syncSelectionClasses() {
    objectNodes().forEach((node) => {
      node.classList.toggle("studio-object-selected", selectedObjects.has(node));
      node.classList.toggle("studio-object-active", node === selectedObject);
    });
  }

  function selectObject(node, { additive = false, preserveGroup = false } = {}) {
    if (additive) {
      if (selectedObjects.has(node)) {
        selectedObjects.delete(node);
        if (selectedObject === node) {
          selectedObject = [...selectedObjects].at(-1) || null;
        }
      } else {
        selectedObjects.add(node);
        selectedObject = node;
      }
    } else if (!preserveGroup || !selectedObjects.has(node)) {
      selectedObjects = new Set([node]);
      selectedObject = node;
    } else {
      selectedObject = node;
    }
    syncSelectionClasses();
    if (selectedObject) {
      notifyObjectSelected(selectedObject);
    } else {
      hideGuides();
      window.parent.postMessage({ type: "DETAIL_SELECTION_CLEARED" }, "*");
    }
  }

  function clearObjectSelection() {
    selectedObjects.forEach((node) =>
      node.classList.remove(
        "studio-object-selected",
        "studio-object-active",
        "studio-object-dragging",
      ),
    );
    selectedObjects.clear();
    selectedObject = null;
    dragState = null;
    hideGuides();
    window.parent.postMessage({ type: "DETAIL_SELECTION_CLEARED" }, "*");
  }

  function setGuide(name, position, active = false) {
    const guide = guides.get(name);
    if (!guide) return;
    const vertical = !horizontalGuideNames.has(name);
    guide.style[vertical ? "left" : "top"] = `${Math.round(position)}px`;
    guide.classList.add("visible");
    guide.classList.toggle("active", active);
  }

  function hideGuides() {
    guides.forEach((guide) => {
      guide.classList.remove("visible", "active");
    });
  }

  function showLayoutGuides(active = new Set(), section = null) {
    if (!body.classList.contains("is-editing") || editorMode !== "layout") {
      hideGuides();
      return;
    }
    const pageRect = page.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    guideLayer.style.height = `${Math.max(document.documentElement.scrollHeight, page.scrollHeight)}px`;
    setGuide("safe-left", pageRect.left + scrollX + pageRect.width * 0.08, active.has("safe-left"));
    setGuide("center-x", pageRect.left + scrollX + pageRect.width / 2, active.has("center-x"));
    setGuide("safe-right", pageRect.right + scrollX - pageRect.width * 0.08, active.has("safe-right"));
    const sectionRect = (section || selectedObject?.closest("section[data-section]") || page).getBoundingClientRect();
    setGuide(
      "section-safe-top",
      sectionRect.top + scrollY + sectionRect.height * 0.08,
      active.has("section-safe-top"),
    );
    setGuide(
      "section-center-y",
      sectionRect.top + scrollY + sectionRect.height / 2,
      active.has("section-center-y"),
    );
    setGuide(
      "section-safe-bottom",
      sectionRect.bottom + scrollY - sectionRect.height * 0.08,
      active.has("section-safe-bottom"),
    );
  }

  function snappedTransform(node, x, y) {
    const current = currentObjectTransform(node);
    const nodeRect = node.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    const sectionRect = (node.closest("section[data-section]") || page).getBoundingClientRect();
    let nextX = x;
    let nextY = y;
    const active = new Set();
    const baseLeft = nodeRect.left - current.x;
    const baseTop = nodeRect.top - current.y;
    const width = nodeRect.width;
    const height = nodeRect.height;
    const centerTarget = pageRect.left + pageRect.width / 2;
    const leftTarget = pageRect.left + pageRect.width * 0.08;
    const rightTarget = pageRect.right - pageRect.width * 0.08;
    const xCandidates = [
      { name: "center-x", delta: centerTarget - (baseLeft + nextX + width / 2) },
      { name: "safe-left", delta: leftTarget - (baseLeft + nextX) },
      { name: "safe-right", delta: rightTarget - (baseLeft + nextX + width) },
    ].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
    if (Math.abs(xCandidates[0].delta) <= SNAP_DISTANCE) {
      nextX += xCandidates[0].delta;
      active.add(xCandidates[0].name);
    }
    const topTarget = sectionRect.top + sectionRect.height * 0.08;
    const centerYTarget = sectionRect.top + sectionRect.height / 2;
    const bottomTarget = sectionRect.bottom - sectionRect.height * 0.08;
    const yCandidates = [
      {
        name: "section-safe-top",
        delta: topTarget - (baseTop + nextY),
      },
      {
        name: "section-center-y",
        delta: centerYTarget - (baseTop + nextY + height / 2),
      },
      {
        name: "section-safe-bottom",
        delta: bottomTarget - (baseTop + nextY + height),
      },
    ].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
    if (Math.abs(yCandidates[0].delta) <= SNAP_DISTANCE) {
      nextY += yCandidates[0].delta;
      active.add(yCandidates[0].name);
    }
    showLayoutGuides(active, node.closest("section[data-section]"));
    return { x: nextX, y: nextY };
  }

  function notifyHistory() {
    window.parent.postMessage(
      { type: "DETAIL_HISTORY_CHANGED", canUndo: historyStack.length > 0 },
      "*",
    );
  }

  function checkpointHistory() {
    if (restoringHistory) return;
    const snapshot = collectState();
    snapshot.savedAt = null;
    const serialized = JSON.stringify(snapshot);
    if (historyStack.at(-1)?.serialized === serialized) return;
    historyStack.push({ serialized, state: snapshot });
    if (historyStack.length > 50) historyStack.shift();
    notifyHistory();
  }

  function checkpointHistoryOnce(delay = 240) {
    if (historyTimer) return;
    checkpointHistory();
    historyTimer = window.setTimeout(() => {
      historyTimer = 0;
    }, delay);
  }

  function undo() {
    const entry = historyStack.pop();
    if (!entry) return;
    restoringHistory = true;
    applyState(entry.state);
    restoringHistory = false;
    if (selectedObject) notifyObjectSelected(selectedObject);
    scheduleNotifyReady();
    notifyHistory();
  }

  function sectionPayload() {
    const mode = viewportMode();
    return sectionNodes().map((section, index) => {
      const id = section.dataset.section;
      return {
        id,
        index,
        hidden: section.hidden,
        viewportMode: mode,
        cropHeight: sectionCrops[mode]?.[id] || null,
        cropHeights: {
          mobile: sectionCrops.mobile[id] || null,
          desktop: sectionCrops.desktop[id] || null,
        },
        renderedHeight: Math.ceil(section.getBoundingClientRect().height),
        contentHeight: Math.ceil(section.scrollHeight),
        label:
          section
            .querySelector("h1,h2")
            ?.textContent.replace(/\s+/g, " ")
            .trim() || id,
      };
    });
  }

  function notifyReady() {
    const pageHeight = Math.ceil(
      Math.max(page.getBoundingClientRect().height, page.scrollHeight),
    );
    window.parent.postMessage(
      {
        type: "DETAIL_READY",
        imageCount: imageNodes().length,
        editableCount: editableNodes().length,
        sectionCount: sectionNodes().length,
        sections: sectionPayload(),
        height: pageHeight,
      },
      "*",
    );
  }

  let readyFrame = 0;
  let readyTimer = 0;
  function flushReadyNotification() {
    if (readyFrame) cancelAnimationFrame(readyFrame);
    if (readyTimer) clearTimeout(readyTimer);
    readyFrame = 0;
    readyTimer = 0;
    notifyReady();
  }
  function scheduleNotifyReady() {
    if (readyFrame) cancelAnimationFrame(readyFrame);
    if (readyTimer) clearTimeout(readyTimer);
    readyFrame = requestAnimationFrame(flushReadyNotification);
    readyTimer = setTimeout(flushReadyNotification, 80);
  }

  function setEditing(enabled) {
    body.classList.toggle("is-editing", enabled);
    body.dataset.editorMode = editorMode;
    editableNodes().forEach((node) => {
      node.contentEditable =
        enabled && editorMode === "text" ? "true" : "false";
      node.spellcheck = false;
    });
    if (!enabled) clearObjectSelection();
  }

  function setEditorMode(mode) {
    if (!["layout", "text"].includes(mode)) return;
    editorMode = mode;
    body.dataset.editorMode = mode;
    editableNodes().forEach((node) => {
      node.contentEditable =
        body.classList.contains("is-editing") && mode === "text"
          ? "true"
          : "false";
      node.spellcheck = false;
    });
    if (
      selectedObjects.size > 0 &&
      mode === "text" &&
      ([...selectedObjects].some((node) => !node.matches(TEXT_SELECTOR)) ||
        selectedObjects.size > 1)
    ) {
      clearObjectSelection();
    } else {
      hideGuides();
      if (selectedObject) notifyObjectSelected(selectedObject);
    }
    window.parent.postMessage({ type: "DETAIL_MODE_CHANGED", mode }, "*");
  }

  function collectState() {
    return {
      version: STATE_VERSION,
      savedAt: new Date().toISOString(),
      accent: getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim(),
      sectionOrder: sectionNodes().map(
        (section) => section.dataset.section,
      ),
      hiddenSections: sectionNodes()
        .filter((section) => section.hidden)
        .map((section) => section.dataset.section),
      sectionCrops: normalizeSectionCrops(sectionCrops),
      texts: editableNodes().map((node) => ({
        id: node.dataset.editId,
        html: node.innerHTML,
      })),
      images: imageNodes().map((node) => ({
        id: node.dataset.assetId || node.dataset.imageId || "",
        src: node.getAttribute("src"),
        alt: node.getAttribute("alt") || "",
      })),
      objects: objectNodes()
        .filter((node) => objectTransforms.has(node))
        .map((node) => ({
          id: objectId(node),
          ...currentObjectTransform(node),
        })),
    };
  }

  function migrateState(state) {
    if (!state || ![1, 2, 3, 4, STATE_VERSION].includes(state.version)) {
      return null;
    }
    return {
      ...state,
      version: STATE_VERSION,
      sectionCrops: normalizeSectionCrops(state.sectionCrops),
      objects: (state.objects || []).map((item) => ({
        ...item,
        fontFamily: item.fontFamily || "",
        color: item.color || "",
        textAlign: item.textAlign || "",
        deleted: Boolean(item.deleted),
      })),
    };
  }

  function applyState(state) {
    if (!state || state.version !== STATE_VERSION) return;
    const sectionMap = new Map(
      sectionNodes().map((section) => [
        section.dataset.section,
        section,
      ]),
    );
    (state.sectionOrder || []).forEach((id) => {
      const section = sectionMap.get(id);
      if (section) page.append(section);
    });
    const hidden = new Set(state.hiddenSections || []);
    sectionNodes().forEach((section) => {
      section.hidden = hidden.has(section.dataset.section);
    });
    sectionCrops = normalizeSectionCrops(state.sectionCrops);
    renderSectionCropRules();
    const texts = new Map(
      (state.texts || []).map((item) => [item.id, item.html]),
    );
    editableNodes().forEach((node) => {
      if (texts.has(node.dataset.editId)) {
        node.innerHTML = texts.get(node.dataset.editId);
      }
    });
    const images = new Map(
      (state.images || []).map((item) => [item.id, item]),
    );
    imageNodes().forEach((node) => {
      const image = images.get(node.dataset.assetId || node.dataset.imageId);
      if (!image) return;
      if (image.src) node.setAttribute("src", image.src);
      node.setAttribute("alt", image.alt || "");
    });
    const objects = new Map(
      (state.objects || []).map((item) => [item.id, item]),
    );
    objectNodes().forEach((node) => {
      const transform = objects.get(objectId(node));
      if (transform) {
        applyObjectTransform(node, transform);
      } else {
        objectTransforms.delete(node);
        node.style.removeProperty("translate");
        node.style.removeProperty("scale");
        node.style.removeProperty("font-family");
        node.style.removeProperty("color");
        node.style.removeProperty("text-align");
        node.style.removeProperty("display");
        delete node.dataset.studioDeleted;
      }
    });
    if (state.accent) {
      document.documentElement.style.setProperty("--accent", state.accent);
    }
  }

  function serializedAuthoringHtml() {
    const clone = document.documentElement.cloneNode(true);
    clone
      .querySelectorAll("[contenteditable]")
      .forEach((node) => node.removeAttribute("contenteditable"));
    clone
      .querySelectorAll("[data-studio-selected]")
      .forEach((node) => node.removeAttribute("data-studio-selected"));
    clone.querySelector("body")?.classList.remove("is-editing");
    return `<!doctype html>\n${clone.outerHTML}`;
  }

  function serializeForSave(nonce) {
    if (
      pendingSerializationNonce !== null ||
      !/^[a-f0-9]{48}$/.test(String(nonce || ""))
    ) {
      return;
    }
    pendingSerializationNonce = nonce;
    const state = collectState();
    window.parent.postMessage(
      {
        type: "DETAIL_SERIALIZED",
        nonce,
        savedAt: state.savedAt,
        html: serializedAuthoringHtml(),
      },
      "*",
    );
  }

  function acceptSaveResult(message) {
    if (
      pendingSerializationNonce === null ||
      message.nonce !== pendingSerializationNonce
    ) {
      return;
    }
    pendingSerializationNonce = null;
    body.dataset.saveState = message.ok ? "saved" : "failed";
  }

  function moveSection(id, direction) {
    const sections = sectionNodes();
    const index = sections.findIndex(
      (section) => section.dataset.section === id,
    );
    if (index < 0) return;
    const section = sections[index];
    if (direction === "up" && index > 0) {
      page.insertBefore(section, sections[index - 1]);
    }
    if (direction === "down" && index < sections.length - 1) {
      page.insertBefore(sections[index + 1], section);
    }
    notifyReady();
  }

  document.addEventListener("pointerdown", (event) => {
    if (!body.classList.contains("is-editing")) return;
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const object = event.target.closest(OBJECT_SELECTOR);
    if (!object) return;
    if (editorMode === "text" && !object.matches(TEXT_SELECTOR)) {
      clearObjectSelection();
      return;
    }
    const additive = event.ctrlKey || event.metaKey;
    selectObject(object, {
      additive: editorMode === "layout" && additive,
      preserveGroup:
        editorMode === "layout" &&
        !additive &&
        selectedObjects.size > 1 &&
        selectedObjects.has(object),
    });
    if (!selectedObjects.has(object)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (editorMode === "text") return;
    event.preventDefault();
    event.stopPropagation();
    if (additive) return;
    checkpointHistory();
    const members = [...selectedObjects].map((node) => ({
      node,
      transform: { ...currentObjectTransform(node) },
    }));
    const activeMember =
      members.find((member) => member.node === object) || members[0];
    dragState = {
      node: object,
      members,
      activeMember,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      objectX: activeMember.transform.x,
      objectY: activeMember.transform.y,
    };
    selectedObjects.forEach((node) =>
      node.classList.add("studio-object-dragging"),
    );
    object.setPointerCapture?.(event.pointerId);
  });

  document.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const snapped = snappedTransform(
      dragState.node,
      dragState.objectX + event.clientX - dragState.startX,
      dragState.objectY + event.clientY - dragState.startY,
    );
    const deltaX = snapped.x - dragState.activeMember.transform.x;
    const deltaY = snapped.y - dragState.activeMember.transform.y;
    dragState.members.forEach(({ node, transform }) => {
      applyObjectTransform(node, {
        ...transform,
        x: transform.x + deltaX,
        y: transform.y + deltaY,
      });
      notifyObjectChanged(node);
    });
  });

  function finishObjectDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const nodes = dragState.members.map(({ node }) => node);
    nodes.forEach((node) => node.classList.remove("studio-object-dragging"));
    dragState.node.releasePointerCapture?.(event.pointerId);
    dragState = null;
    hideGuides();
    if (selectedObject) notifyObjectSelected(selectedObject);
    scheduleNotifyReady();
  }

  document.addEventListener("pointerup", finishObjectDrag);
  document.addEventListener("pointercancel", finishObjectDrag);

  document.addEventListener(
    "wheel",
    (event) => {
      if (
        !body.classList.contains("is-editing") ||
        editorMode !== "layout" ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const object = event.target.closest(OBJECT_SELECTOR);
      if (!object || object !== selectedObject) return;
      event.preventDefault();
      event.stopPropagation();
      selectObject(object);
      checkpointHistoryOnce();
      const transform = currentObjectTransform(object);
      applyObjectTransform(object, {
        ...transform,
        scale: transform.scale * Math.exp(-event.deltaY * 0.0015),
      });
      notifyObjectChanged(object);
      scheduleNotifyReady();
    },
    { passive: false },
  );

  document.addEventListener("dragstart", (event) => {
    if (
      body.classList.contains("is-editing") &&
      editorMode === "layout" &&
      event.target instanceof Element &&
      event.target.closest(OBJECT_SELECTOR)
    ) {
      event.preventDefault();
    }
  });

  document.addEventListener("beforeinput", (event) => {
    if (
      body.classList.contains("is-editing") &&
      editorMode === "text" &&
      event.target instanceof Element &&
      event.target.closest(TEXT_SELECTOR)
    ) {
      checkpointHistoryOnce(450);
    }
  });

  function confirmDeletion() {
    const count = selectedObjects.size;
    if (!count) return false;
    const target =
      count > 1
        ? `선택한 ${count}개 요소`
        : `"${objectLabel(selectedObject)}" 요소`;
    return window.confirm(
      `${target}를 삭제할까요?\n실행 취소(Ctrl/Cmd+Z)로 되돌릴 수 있습니다.`,
    );
  }

  function deleteSelectedObjects() {
    if (!selectedObjects.size) return;
    checkpointHistory();
    [...selectedObjects].forEach((node) => {
      applyObjectTransform(node, {
        ...currentObjectTransform(node),
        deleted: true,
      });
    });
    clearObjectSelection();
    scheduleNotifyReady();
  }

  function moveSelectedObjects(dx, dy) {
    if (!selectedObjects.size) return;
    [...selectedObjects].forEach((node) => {
      const transform = currentObjectTransform(node);
      applyObjectTransform(node, {
        ...transform,
        x: transform.x + dx,
        y: transform.y + dy,
      });
      notifyObjectChanged(node);
    });
    if (selectedObject) notifyObjectSelected(selectedObject);
    scheduleNotifyReady();
  }

  document.addEventListener("keydown", (event) => {
    if (!body.classList.contains("is-editing")) return;
    const typing =
      event.target instanceof Element &&
      Boolean(event.target.closest("input,textarea,select,[contenteditable='true']"));
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
      window.parent.postMessage({ type: "DETAIL_EDITING_STOPPED" }, "*");
      return;
    }
    if (
      editorMode === "text" &&
      selectedObject?.matches(TEXT_SELECTOR) &&
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey
    ) {
      const alignment = {
        l: "left",
        e: "center",
        r: "right",
        j: "justify",
      }[event.key.toLowerCase()];
      if (alignment) {
        event.preventDefault();
        checkpointHistory();
        applyObjectTransform(selectedObject, {
          ...currentObjectTransform(selectedObject),
          textAlign: alignment,
        });
        notifyObjectSelected(selectedObject);
        scheduleNotifyReady();
        return;
      }
    }
    if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        setEditorMode("layout");
        return;
      }
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        setEditorMode("text");
        return;
      }
      if (
        editorMode === "layout" &&
        selectedObjects.size > 0 &&
        ["Delete", "Backspace"].includes(event.key)
      ) {
        event.preventDefault();
        if (confirmDeletion()) deleteSelectedObjects();
        return;
      }
    }
    if (
      editorMode !== "layout" ||
      !selectedObject ||
      typing
    ) return;
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    checkpointHistoryOnce();
    const amount = event.shiftKey ? 10 : 1;
    moveSelectedObjects(direction[0] * amount, direction[1] * amount);
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const message = event.data || {};
    if (message.type === "DETAIL_SET_EDITING") {
      setEditing(Boolean(message.enabled));
    }
    if (message.type === "DETAIL_SET_MODE") {
      setEditorMode(String(message.mode || ""));
    }
    if (message.type === "DETAIL_SERIALIZE_REQUEST") {
      serializeForSave(message.nonce);
    }
    if (message.type === "DETAIL_SAVE_RESULT") {
      acceptSaveResult(message);
    }
    if (message.type === "DETAIL_RESET") {
      location.reload();
    }
    if (
      message.type === "DETAIL_SET_ACCENT" &&
      /^#[0-9a-f]{6}$/i.test(message.value || "")
    ) {
      checkpointHistoryOnce();
      document.documentElement.style.setProperty(
        "--accent",
        message.value,
      );
    }
    if (message.type === "DETAIL_SET_IMAGE") {
      const image = imageNodes()[Number(message.index)];
      if (!image) return;
      checkpointHistory();
      if (message.src) image.setAttribute("src", message.src);
      image.setAttribute("alt", message.alt || "");
      selectObject(image);
    }
    if (message.type === "DETAIL_MOVE_SECTION") {
      checkpointHistory();
      moveSection(message.id, message.direction);
    }
    if (message.type === "DETAIL_TOGGLE_SECTION") {
      const section = sectionNodes().find(
        (node) => node.dataset.section === message.id,
      );
      if (section) {
        checkpointHistory();
        section.hidden = Boolean(message.hidden);
        notifyReady();
      }
    }
    if (message.type === "DETAIL_SET_SECTION_CROP") {
      setSectionCrop(message.id, message.height, message.mode);
    }
    if (
      message.type === "DETAIL_NUDGE_OBJECT" &&
      selectedObjects.size > 0 &&
      editorMode === "layout"
    ) {
      checkpointHistoryOnce();
      moveSelectedObjects(
        clamp(Number(message.dx) || 0, -100, 100),
        clamp(Number(message.dy) || 0, -100, 100),
      );
    }
    if (
      message.type === "DETAIL_SET_OBJECT_POSITION" &&
      selectedObject &&
      editorMode === "layout"
    ) {
      checkpointHistory();
      const transform = currentObjectTransform(selectedObject);
      moveSelectedObjects(
        (Number(message.x) || 0) - transform.x,
        (Number(message.y) || 0) - transform.y,
      );
    }
    if (
      message.type === "DETAIL_SET_OBJECT_STYLE" &&
      selectedObject?.matches(TEXT_SELECTOR) &&
      editorMode === "text"
    ) {
      const fontFamily = String(message.fontFamily || "");
      const color = String(message.color || "");
      if (!FONT_STACKS.has(fontFamily)) return;
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) return;
      checkpointHistory();
      applyObjectTransform(selectedObject, {
        ...currentObjectTransform(selectedObject),
        fontFamily,
        color,
      });
      notifyObjectSelected(selectedObject);
      scheduleNotifyReady();
    }
    if (
      message.type === "DETAIL_CLEAR_TEXT" &&
      selectedObject?.matches(TEXT_SELECTOR) &&
      editorMode === "text"
    ) {
      checkpointHistory();
      selectedObject.textContent = "";
      notifyObjectSelected(selectedObject);
      scheduleNotifyReady();
    }
    if (
      message.type === "DETAIL_SET_TEXT_ALIGN" &&
      selectedObject?.matches(TEXT_SELECTOR) &&
      editorMode === "text"
    ) {
      const textAlign = String(message.value || "");
      if (!["left", "center", "right", "justify"].includes(textAlign)) return;
      checkpointHistory();
      applyObjectTransform(selectedObject, {
        ...currentObjectTransform(selectedObject),
        textAlign,
      });
      notifyObjectSelected(selectedObject);
      scheduleNotifyReady();
    }
    if (
      message.type === "DETAIL_DELETE_OBJECT" &&
      selectedObjects.size > 0 &&
      editorMode === "layout"
    ) {
      deleteSelectedObjects();
    }
    if (message.type === "DETAIL_CLEAR_SELECTION") clearObjectSelection();
    if (message.type === "DETAIL_UNDO") undo();
    if (message.type === "DETAIL_REPLAY_GIFS") {
      document.querySelectorAll('img[src*=".gif"]').forEach((image) => {
        const url = new URL(image.src);
        url.searchParams.set("replay", String(Date.now()));
        image.src = url.href;
      });
    }
    if (message.type === "DETAIL_REQUEST_HEIGHT") scheduleNotifyReady();
  });

  const pageResizeObserver = new ResizeObserver(scheduleNotifyReady);
  pageResizeObserver.observe(page);
  const pageMutationObserver = new MutationObserver(scheduleNotifyReady);
  pageMutationObserver.observe(page, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "src"],
  });
  document.addEventListener("input", scheduleNotifyReady);
  imageNodes().forEach((image) => {
    image.addEventListener("load", scheduleNotifyReady);
    image.addEventListener("error", scheduleNotifyReady);
  });
  document.fonts?.ready.then(scheduleNotifyReady);
  window.addEventListener("resize", scheduleNotifyReady);
  window.addEventListener("load", notifyReady);
  notifyHistory();
  requestAnimationFrame(notifyReady);
})();
