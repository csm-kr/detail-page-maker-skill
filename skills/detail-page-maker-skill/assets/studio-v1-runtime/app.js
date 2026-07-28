(() => {
  const STATE_VERSION = 2;
  const OBJECT_SELECTOR = "[data-edit-image],[data-edit-object]";
  const MIN_OBJECT_SCALE = 0.25;
  const MAX_OBJECT_SCALE = 4;
  const projectKey =
    document.documentElement.dataset.studioProject ||
    location.pathname.replace(/[^a-z0-9가-힣]+/gi, "-");
  const STORAGE_KEY = `detail-page-maker:studio-v1:${projectKey}`;
  const body = document.body;
  const page = document.querySelector("#detailPage");
  if (!page) return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const editableNodes = () => [...document.querySelectorAll("[data-edit]")];
  const imageNodes = () =>
    [...document.querySelectorAll("[data-edit-image]")];
  const objectNodes = () => [...document.querySelectorAll(OBJECT_SELECTOR)];
  const sectionNodes = () =>
    [...page.querySelectorAll(":scope > section[data-section]")];
  const objectTransforms = new WeakMap();
  let selectedObject = null;
  let dragState = null;

  function ensureEditIds() {
    sectionNodes().forEach((section) => {
      [...section.querySelectorAll("[data-edit]")].forEach((node, index) => {
        if (!node.dataset.editId) {
          node.dataset.editId = `${section.dataset.section}:text-${index + 1}`;
        }
      });
      [...section.querySelectorAll("[data-edit-image]")].forEach(
        (node, index) => {
          if (!node.dataset.assetId && !node.dataset.imageId) {
            node.dataset.imageId = `${section.dataset.section}:image-${index + 1}`;
          }
        },
      );
      [...section.querySelectorAll("[data-edit-object]")].forEach(
        (node, index) => {
          if (
            !node.dataset.assetId &&
            !node.dataset.imageId &&
            !node.dataset.objectId
          ) {
            node.dataset.objectId = `${section.dataset.section}:object-${index + 1}`;
          }
        },
      );
    });
  }

  ensureEditIds();

  const interactionStyle = document.createElement("style");
  interactionStyle.dataset.studioInteraction = "";
  interactionStyle.textContent = `
    .is-editing [data-edit-image],
    .is-editing [data-edit-object] { cursor: grab !important; }
    .is-editing [data-edit-image].studio-object-selected,
    .is-editing [data-edit-object].studio-object-selected {
      outline: 3px solid #176bff !important;
      outline-offset: 3px !important;
    }
    .is-editing [data-edit-image].studio-object-dragging,
    .is-editing [data-edit-object].studio-object-dragging { cursor: grabbing !important; }
    .is-editing [data-edit] { cursor: text !important; }
  `;
  document.head.append(interactionStyle);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function objectId(node) {
    return (
      node.dataset.assetId ||
      node.dataset.imageId ||
      node.dataset.objectId ||
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

  function currentObjectTransform(node) {
    return objectTransforms.get(node) || { x: 0, y: 0, scale: 1 };
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
    };
    objectTransforms.set(node, next);
    node.style.setProperty("translate", `${next.x}px ${next.y}px`, "important");
    node.style.setProperty("scale", String(next.scale), "important");
    return next;
  }

  function notifyObjectSelected(node) {
    const imageIndex = imageNodes().indexOf(node);
    const transform = currentObjectTransform(node);
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
        imageIndex,
        src: imageIndex >= 0 ? node.getAttribute("src") || "" : "",
        alt: imageIndex >= 0 ? node.getAttribute("alt") || "" : "",
        ...transform,
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
        ...currentObjectTransform(node),
      },
      "*",
    );
  }

  function selectObject(node) {
    if (selectedObject !== node) {
      selectedObject?.classList.remove("studio-object-selected");
      selectedObject = node;
      selectedObject.classList.add("studio-object-selected");
    }
    notifyObjectSelected(node);
  }

  function clearObjectSelection() {
    selectedObject?.classList.remove(
      "studio-object-selected",
      "studio-object-dragging",
    );
    selectedObject = null;
    dragState = null;
  }

  function sectionPayload() {
    return sectionNodes().map((section, index) => ({
      id: section.dataset.section,
      index,
      hidden: section.hidden,
      label:
        section
          .querySelector("h1,h2")
          ?.textContent.replace(/\s+/g, " ")
          .trim() || section.dataset.section,
    }));
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

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(reader.error || new Error("에셋을 읽지 못했습니다."));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchAsDataUrl(source) {
    if (/^data:/i.test(source)) return source;
    const assetUrl = new URL(source, document.baseURI);
    const response = await fetch(assetUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `${assetUrl.pathname.split("/").pop()} 에셋을 불러오지 못했습니다.`,
      );
    }
    return blobToDataUrl(await response.blob());
  }

  function outputFileName() {
    const configured = document.body.dataset.exportName;
    if (configured) return configured;
    const slug = document.title
      .replace(/상세페이지|작업본/gi, "")
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, "-");
    return `${slug || "detail-page"}-standalone.html`;
  }

  async function exportEditedHtml() {
    if (location.protocol === "file:") {
      throw new Error(
        "에셋 포함 내보내기는 detail-page.mjs start로 연 Studio에서 사용해 주세요.",
      );
    }
    const documentCopy = document.documentElement.cloneNode(true);
    documentCopy.querySelector("body")?.classList.remove("is-editing");
    documentCopy
      .querySelectorAll("[data-studio-interaction]")
      .forEach((node) => node.remove());
    documentCopy
      .querySelectorAll(".studio-object-selected,.studio-object-dragging")
      .forEach((node) =>
        node.classList.remove(
          "studio-object-selected",
          "studio-object-dragging",
        ),
      );
    documentCopy.querySelectorAll("[contenteditable]").forEach((node) => {
      node.removeAttribute("contenteditable");
    });
    documentCopy.setAttribute("data-export", "self-contained");

    const sourceImages = [...document.querySelectorAll("img[src]")];
    const copiedImages = [...documentCopy.querySelectorAll("img[src]")];
    for (let index = 0; index < sourceImages.length; index += 1) {
      const source = sourceImages[index].getAttribute("src");
      copiedImages[index].setAttribute(
        "src",
        await fetchAsDataUrl(source),
      );
      copiedImages[index].removeAttribute("data-edit-image");
      window.parent.postMessage(
        {
          type: "DETAIL_EXPORT_PROGRESS",
          completed: index + 1,
          total: sourceImages.length,
        },
        "*",
      );
    }

    const sourceStylesheets = [
      ...document.querySelectorAll('link[rel="stylesheet"][href]'),
    ];
    const copiedStylesheets = [
      ...documentCopy.querySelectorAll('link[rel="stylesheet"][href]'),
    ];
    for (let index = 0; index < sourceStylesheets.length; index += 1) {
      const stylesheetUrl = new URL(
        sourceStylesheets[index].getAttribute("href"),
        document.baseURI,
      );
      const response = await fetch(stylesheetUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("상세페이지 스타일을 불러오지 못했습니다.");
      }
      const style = documentCopy.ownerDocument.createElement("style");
      style.textContent = await response.text();
      copiedStylesheets[index].replaceWith(style);
    }

    documentCopy.querySelectorAll("script").forEach((node) => node.remove());
    documentCopy
      .querySelectorAll("[data-edit]")
      .forEach((node) => node.removeAttribute("data-edit"));
    documentCopy
      .querySelectorAll("[data-edit-object]")
      .forEach((node) => node.removeAttribute("data-edit-object"));
    documentCopy
      .querySelectorAll("[data-object-id],[data-object-label]")
      .forEach((node) => {
        node.removeAttribute("data-object-id");
        node.removeAttribute("data-object-label");
      });
    const output = `<!doctype html>\n${documentCopy.outerHTML}`;
    const blob = new Blob([output], { type: "text/html;charset=utf-8" });
    const anchor = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    const filename = outputFileName();
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    window.parent.postMessage({ type: "DETAIL_EXPORTED", filename }, "*");
  }

  function setEditing(enabled) {
    body.classList.toggle("is-editing", enabled);
    editableNodes().forEach((node) => {
      node.contentEditable = enabled ? "true" : "false";
      node.spellcheck = false;
    });
    if (!enabled) clearObjectSelection();
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
    if (!state || ![1, STATE_VERSION].includes(state.version)) return null;
    if (state.version === STATE_VERSION) return state;
    return { ...state, version: STATE_VERSION, objects: [] };
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
      if (transform) applyObjectTransform(node, transform);
    });
    if (state.accent) {
      document.documentElement.style.setProperty("--accent", state.accent);
    }
  }

  function save() {
    const state = collectState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.parent.postMessage(
      { type: "DETAIL_SAVED", savedAt: state.savedAt },
      "*",
    );
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

  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const migratedState = migrateState(savedState);
    applyState(migratedState);
    if (migratedState && migratedState !== savedState) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedState));
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  document.addEventListener("pointerdown", (event) => {
    if (!body.classList.contains("is-editing")) return;
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (event.target.closest("[data-edit]")) return;
    const object = event.target.closest(OBJECT_SELECTOR);
    if (!object) return;
    event.preventDefault();
    event.stopPropagation();
    selectObject(object);
    const transform = currentObjectTransform(object);
    dragState = {
      node: object,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      objectX: transform.x,
      objectY: transform.y,
    };
    object.classList.add("studio-object-dragging");
    object.setPointerCapture?.(event.pointerId);
  });

  document.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    applyObjectTransform(dragState.node, {
      ...currentObjectTransform(dragState.node),
      x: dragState.objectX + event.clientX - dragState.startX,
      y: dragState.objectY + event.clientY - dragState.startY,
    });
    notifyObjectChanged(dragState.node);
  });

  function finishObjectDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const node = dragState.node;
    node.classList.remove("studio-object-dragging");
    node.releasePointerCapture?.(event.pointerId);
    dragState = null;
    notifyObjectChanged(node);
    scheduleNotifyReady();
  }

  document.addEventListener("pointerup", finishObjectDrag);
  document.addEventListener("pointercancel", finishObjectDrag);

  document.addEventListener(
    "wheel",
    (event) => {
      if (
        !body.classList.contains("is-editing") ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const object = event.target.closest(OBJECT_SELECTOR);
      if (!object || object !== selectedObject) return;
      event.preventDefault();
      event.stopPropagation();
      selectObject(object);
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
      event.target instanceof Element &&
      event.target.closest(OBJECT_SELECTOR)
    ) {
      event.preventDefault();
    }
  });

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "DETAIL_SET_EDITING") {
      setEditing(Boolean(message.enabled));
    }
    if (message.type === "DETAIL_SAVE") save();
    if (message.type === "DETAIL_RESET") {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
    if (
      message.type === "DETAIL_SET_ACCENT" &&
      /^#[0-9a-f]{6}$/i.test(message.value || "")
    ) {
      document.documentElement.style.setProperty(
        "--accent",
        message.value,
      );
    }
    if (message.type === "DETAIL_SET_IMAGE") {
      const image = imageNodes()[Number(message.index)];
      if (!image) return;
      if (message.src) image.setAttribute("src", message.src);
      image.setAttribute("alt", message.alt || "");
    }
    if (message.type === "DETAIL_MOVE_SECTION") {
      moveSection(message.id, message.direction);
    }
    if (message.type === "DETAIL_TOGGLE_SECTION") {
      const section = sectionNodes().find(
        (node) => node.dataset.section === message.id,
      );
      if (section) {
        section.hidden = Boolean(message.hidden);
        notifyReady();
      }
    }
    if (message.type === "DETAIL_REPLAY_GIFS") {
      document.querySelectorAll('img[src*=".gif"]').forEach((image) => {
        const url = new URL(image.src);
        url.searchParams.set("replay", String(Date.now()));
        image.src = url.href;
      });
    }
    if (message.type === "DETAIL_REQUEST_HEIGHT") scheduleNotifyReady();
    if (message.type === "DETAIL_EXPORT_HTML") {
      exportEditedHtml().catch((error) => {
        window.parent.postMessage(
          {
            type: "DETAIL_EXPORT_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "HTML 내보내기에 실패했습니다.",
          },
          "*",
        );
      });
    }
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
  requestAnimationFrame(notifyReady);
})();
