(() => {
  const STORAGE_KEY = "detail-page-maker:domeggook-60851997:novaface-v2";
  const body = document.body;
  const page = document.querySelector("#detailPage");
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const editableNodes = () => [...document.querySelectorAll("[data-edit]")];
  const imageNodes = () => [...document.querySelectorAll("[data-edit-image]")];
  const sectionNodes = () => [...page.querySelectorAll(":scope > section[data-section]")];

  function sectionPayload() {
    return sectionNodes().map((section, index) => ({
      id: section.dataset.section,
      index,
      hidden: section.hidden,
      label:
        section.querySelector("h1,h2")?.textContent.replace(/\s+/g, " ").trim() ||
        section.dataset.section,
    }));
  }

  function notifyReady() {
    window.parent.postMessage(
      {
        type: "DETAIL_READY",
        imageCount: imageNodes().length,
        editableCount: editableNodes().length,
        sectionCount: sectionNodes().length,
        sections: sectionPayload(),
        height: document.documentElement.scrollHeight,
      },
      "*",
    );
  }

  function setEditing(enabled) {
    body.classList.toggle("is-editing", enabled);
    editableNodes().forEach((node) => {
      node.contentEditable = enabled ? "true" : "false";
      node.spellcheck = false;
    });
    window.parent.postMessage({ type: "DETAIL_EDIT_STATE", enabled }, "*");
  }

  function collectState() {
    return {
      version: 2,
      savedAt: new Date().toISOString(),
      accent: getComputedStyle(document.documentElement).getPropertyValue("--blue").trim(),
      sectionOrder: sectionNodes().map((section) => section.dataset.section),
      hiddenSections: sectionNodes()
        .filter((section) => section.hidden)
        .map((section) => section.dataset.section),
      texts: editableNodes().map((node) => node.innerHTML),
      images: imageNodes().map((node) => ({
        id: node.dataset.assetId || "",
        src: node.getAttribute("src"),
        alt: node.getAttribute("alt") || "",
      })),
    };
  }

  function applyState(state) {
    if (!state || state.version !== 2) return;
    if (Array.isArray(state.sectionOrder)) {
      const sectionMap = new Map(sectionNodes().map((section) => [section.dataset.section, section]));
      state.sectionOrder.forEach((id) => {
        const section = sectionMap.get(id);
        if (section) page.append(section);
      });
    }
    const hidden = new Set(state.hiddenSections || []);
    sectionNodes().forEach((section) => {
      section.hidden = hidden.has(section.dataset.section);
    });
    editableNodes().forEach((node, index) => {
      if (typeof state.texts?.[index] === "string") node.innerHTML = state.texts[index];
    });
    const imagesById = new Map(
      (state.images || []).filter((image) => image.id).map((image) => [image.id, image]),
    );
    imageNodes().forEach((node, index) => {
      const image = imagesById.get(node.dataset.assetId) || state.images?.[index];
      if (!image) return;
      if (image.src) node.setAttribute("src", image.src);
      node.setAttribute("alt", image.alt || "");
    });
    if (state.accent) document.documentElement.style.setProperty("--blue", state.accent);
  }

  function save() {
    const state = collectState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.parent.postMessage({ type: "DETAIL_SAVED", savedAt: state.savedAt }, "*");
  }

  function moveSection(id, direction) {
    const sections = sectionNodes();
    const index = sections.findIndex((section) => section.dataset.section === id);
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
    applyState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  document.addEventListener("click", (event) => {
    if (!body.classList.contains("is-editing")) return;
    let image = event.target.closest("[data-edit-image]");
    if (!image && !event.target.closest("[data-edit]")) {
      image = event.target.closest("section[data-section]")?.querySelector("[data-edit-image]");
    }
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    const index = imageNodes().indexOf(image);
    window.parent.postMessage(
      {
        type: "DETAIL_IMAGE_SELECTED",
        index,
        assetId: image.dataset.assetId || "",
        src: image.getAttribute("src") || "",
        alt: image.getAttribute("alt") || "",
      },
      "*",
    );
  });

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "DETAIL_SET_EDITING") setEditing(Boolean(message.enabled));
    if (message.type === "DETAIL_SAVE") save();
    if (message.type === "DETAIL_RESET") {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
    if (message.type === "DETAIL_SET_ACCENT" && /^#[0-9a-f]{6}$/i.test(message.value || "")) {
      document.documentElement.style.setProperty("--blue", message.value);
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
      const section = sectionNodes().find((node) => node.dataset.section === message.id);
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
  });

  window.addEventListener("load", () => {
    if (!location.hash) window.scrollTo(0, 0);
    notifyReady();
  });
  requestAnimationFrame(notifyReady);
})();
