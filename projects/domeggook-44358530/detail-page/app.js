(() => {
  const STORAGE_KEY = "detail-page-maker:domeggook-44358530:v2";
  const body = document.body;

  const editableNodes = () => [...document.querySelectorAll("[data-edit]")];
  const imageNodes = () => [...document.querySelectorAll("[data-edit-image]")];

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
      accent: getComputedStyle(document.documentElement).getPropertyValue("--orange").trim(),
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
    editableNodes().forEach((node, index) => {
      if (typeof state.texts?.[index] === "string") node.innerHTML = state.texts[index];
    });
    const imagesById = new Map((state.images || []).filter((image) => image.id).map((image) => [image.id, image]));
    imageNodes().forEach((node, index) => {
      const image = imagesById.get(node.dataset.assetId) || state.images?.[index];
      if (!image) return;
      if (image.src) node.setAttribute("src", image.src);
      node.setAttribute("alt", image.alt || "");
    });
    if (state.accent) document.documentElement.style.setProperty("--orange", state.accent);
  }

  function save() {
    const state = collectState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.parent.postMessage({ type: "DETAIL_SAVED", savedAt: state.savedAt }, "*");
  }

  try {
    applyState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  document.addEventListener("click", (event) => {
    if (!body.classList.contains("is-editing")) return;
    const image = event.target.closest("[data-edit-image]");
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
      document.documentElement.style.setProperty("--orange", message.value);
    }
    if (message.type === "DETAIL_SET_IMAGE") {
      const image = imageNodes()[Number(message.index)];
      if (!image) return;
      if (message.src) image.setAttribute("src", message.src);
      image.setAttribute("alt", message.alt || "");
      image.click();
    }
    if (message.type === "DETAIL_REPLAY_GIFS") {
      document.querySelectorAll('img[src*=".gif"]').forEach((image) => {
        const url = new URL(image.src);
        url.searchParams.set("replay", String(Date.now()));
        image.src = url.href;
      });
    }
  });

  window.parent.postMessage(
    {
      type: "DETAIL_READY",
      imageCount: imageNodes().length,
      editableCount: editableNodes().length,
      sectionCount: document.querySelectorAll("[data-section]").length,
    },
    "*",
  );
})();
