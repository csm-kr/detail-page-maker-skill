(() => {
  const STATE_VERSION = 1;
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
  const sectionNodes = () =>
    [...page.querySelectorAll(":scope > section[data-section]")];

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
    });
  }

  ensureEditIds();

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
        assetId: image.dataset.assetId || image.dataset.imageId || "",
        src: image.getAttribute("src") || "",
        alt: image.getAttribute("alt") || "",
      },
      "*",
    );
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
    attributeFilter: ["class", "hidden", "src", "style"],
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
