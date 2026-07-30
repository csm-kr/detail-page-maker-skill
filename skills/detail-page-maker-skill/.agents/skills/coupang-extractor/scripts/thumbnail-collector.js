(function (global) {
  "use strict";
  const C = global.CoupangExtractorCommon;

  const ITEM_SELECTORS = [
    ".product-image li",
    ".prod-image__item",
    ".prod-image__items > li",
    ".prod-image__items > div",
    '[class~="prod-image__item"]',
  ];
  const MAIN_SELECTORS = [
    ".product-image img",
    "img.prod-image__detail",
    ".prod-image__detail img",
    "#repImageContainer img",
    ".prod-image__detail-image img",
  ];

  function mainImage() {
    return C.queryAll(MAIN_SELECTORS)
      .filter((node) => node instanceof HTMLImageElement && C.visible(node))
      .map((image) => {
        const rect = image.getBoundingClientRect();
        return { image, area: Math.max(rect.width * rect.height, image.naturalWidth * image.naturalHeight) };
      })
      .sort((a, b) => b.area - a.area)[0]?.image || null;
  }

  function selectedOptionText() {
    const selectors = [
      ".prod-option__selected",
      '[class*="option"] [class*="selected"]',
      '#optionList [aria-selected="true"]',
      '[data-selected="true"]',
    ];
    for (const node of C.queryAll(selectors)) {
      const text = C.normalizeText(node.textContent);
      if (text && text.length <= 500) return text;
    }
    return null;
  }

  async function decoded(image) {
    if (!image) return false;
    try {
      if (typeof image.decode === "function") await image.decode();
    } catch (_) {}
    return image.naturalWidth > 0 && image.naturalHeight > 0;
  }

  async function collect(options = {}) {
    const access = C.accessState();
    if (access.blocked) {
      return C.fragment("thumbnails", access.status, {
        assets: [],
        diagnostics: { stop_reason: access.stop_reason, gallery_items_found: 0, gallery_items_completed: 0 },
      });
    }
    const timeoutMs = Math.max(1000, Math.min(Number(options.itemTimeoutMs) || 5000, 15000));
    const maxItems = Math.max(1, Math.min(Number(options.maxItems) || 50, 50));
    const items = C.queryAll(ITEM_SELECTORS)
      .filter((node) => node.querySelector("img"))
      .slice(0, maxItems);
    const assets = [];
    const failures = [];
    const seen = new Set();
    let duplicateCount = 0;

    if (!items.length) {
      const image = mainImage();
      const url = C.imageUrl(image);
      if (image && url && (await decoded(image))) {
        assets.push({
          order: 1,
          source_asset_url: url,
          natural_width: image.naturalWidth,
          natural_height: image.naturalHeight,
          selected_option_text: selectedOptionText(),
          selected_by: "main_image_fallback",
          status: "READY",
        });
        return C.fragment("thumbnails", "PARTIAL", {
          assets,
          diagnostics: {
            gallery_items_found: 0,
            gallery_items_completed: 0,
            duplicate_count: 0,
            stop_reason: "GALLERY_ITEMS_NOT_FOUND",
          },
        });
      }
      return C.fragment("thumbnails", "THUMBNAIL_NOT_FOUND", {
        assets: [],
        diagnostics: { gallery_items_found: 0, gallery_items_completed: 0, stop_reason: "THUMBNAIL_NOT_FOUND" },
      });
    }

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const before = C.imageUrl(mainImage());
      item.scrollIntoView({ block: "center", inline: "nearest" });
      item.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
      item.click();
      const changed = await C.waitFor(async () => {
        const image = mainImage();
        const url = C.imageUrl(image);
        if (!image || !url) return null;
        const isReady = await decoded(image);
        if (!isReady) return null;
        if (index === 0 || !before || url !== before) return { image, url };
        return null;
      }, timeoutMs, 100);
      if (!changed) {
        failures.push({ item_index: index + 1, code: "THUMBNAIL_ITEM_TIMEOUT" });
        continue;
      }
      if (seen.has(changed.url)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(changed.url);
      assets.push({
        order: assets.length + 1,
        source_asset_url: changed.url,
        natural_width: changed.image.naturalWidth,
        natural_height: changed.image.naturalHeight,
        selected_option_text: selectedOptionText(),
        selected_by: "gallery_click",
        status: "READY",
      });
    }

    const status = assets.length === 0 ? "THUMBNAIL_NOT_FOUND" : failures.length ? "PARTIAL" : "READY";
    return C.fragment("thumbnails", status, {
      assets,
      diagnostics: {
        gallery_items_found: items.length,
        gallery_items_completed: items.length - failures.length,
        duplicate_count: duplicateCount,
        item_failures: failures,
        stop_reason: failures.length ? "THUMBNAIL_ITEM_TIMEOUT" : "NO_MORE_ITEMS",
      },
    });
  }

  global.CoupangExtractorThumbnail = { collect };
})(globalThis);
