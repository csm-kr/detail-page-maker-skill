(function (global) {
  "use strict";
  const C = global.CoupangExtractorCommon;
  const ROOT_SELECTORS = [
    "#productDetail",
    "#productDetailDisplay",
    "#product-detail",
    ".product-detail",
    ".vendor-item-detail",
    ".prod-description",
    ".product-detail-content",
  ];
  const EXCLUDED_ANCESTORS = [
    ".prod-image",
    "#repImageContainer",
    '[class*="recommend"]',
    '[class*="related"]',
    '[class*="review"]',
    '[id*="review"]',
  ].join(",");

  function findRoot() {
    for (const selector of ROOT_SELECTORS) {
      const elements = C.queryAll([selector]);
      const candidate = elements.find((node) => node.querySelector("img") && node.getBoundingClientRect().height > 200);
      if (candidate) return { root: candidate, selector, fallback: false };
    }
    const broad = C.queryAll(['[class*="detail"]'])
      .filter((node) => node.querySelectorAll("img").length > 1 && node.getBoundingClientRect().height > 500)
      .sort((a, b) => b.querySelectorAll("img").length - a.querySelectorAll("img").length)[0];
    return broad
      ? { root: broad, selector: '[class*="detail"]', fallback: true }
      : { root: document, selector: "document", fallback: true };
  }

  function clickExpand() {
    const candidates = C.queryAll(["button", "a", '[role="button"]']).filter(C.visible);
    for (const node of candidates) {
      const text = C.normalizeText(node.textContent);
      if (/^(상품상세|상품정보|상세정보).*(더보기|펼쳐보기)$/.test(text) || /상품상세.*더보기/.test(text)) {
        node.click();
        return text;
      }
    }
    return null;
  }

  function classifyImages(rootInfo) {
    const selected = new Map();
    const excluded = [];
    const images = rootInfo.root === document ? Array.from(document.images) : Array.from(rootInfo.root.querySelectorAll("img"));
    for (const image of images) {
      const url = C.imageUrl(image);
      if (!url) {
        continue;
      }
      const reasons = [];
      const excludedReasons = [];
      if (image.closest(EXCLUDED_ANCESTORS)) excludedReasons.push("EXCLUDED_ANCESTOR");
      const width = image.naturalWidth || Number(image.getAttribute("width")) || 0;
      const height = image.naturalHeight || Number(image.getAttribute("height")) || 0;
      const vendor = /\/image\/vendor_inventory\//i.test(url);
      if (vendor) reasons.push("VENDOR_INVENTORY");
      if (rootInfo.root !== document) reasons.push("DETAIL_REGION");
      if (width >= 600 && height >= 600) reasons.push("LARGE_IMAGE");
      else if (width >= 300 || height >= 400) reasons.push("CONTENT_SIZE");
      if (excludedReasons.length) {
        excluded.push({ source_asset_url: url, exclusion_reasons: excludedReasons });
        continue;
      }
      if (!vendor && width < 300 && height < 400) {
        excluded.push({ source_asset_url: url, exclusion_reasons: ["TOO_SMALL"] });
        continue;
      }
      if (rootInfo.root === document && !vendor) {
        excluded.push({ source_asset_url: url, exclusion_reasons: ["DETAIL_REGION_UNCERTAIN"] });
        continue;
      }
      const confidence = rootInfo.fallback ? "probable" : vendor || reasons.includes("LARGE_IMAGE") ? "confirmed" : "probable";
      if (!selected.has(url)) {
        selected.set(url, {
          source_asset_url: url,
          natural_width: width || null,
          natural_height: height || null,
          document_y: C.pageY(image),
          confidence,
          selection_reasons: reasons,
          status: "READY",
        });
      }
    }
    return { selected, excluded };
  }

  function videoCount(root) {
    const media = C.queryAll(["video", "iframe", "embed", "object", "a[href]", "source"], root);
    for (const node of media) {
      const value = [node.currentSrc, node.src, node.href, node.getAttribute?.("data-src"), node.className, node.id].join(" ");
      if (/youtube|youtu\.be|video|\.mp4|\.m3u8|\.mov|\.webm/i.test(value)) return 1;
    }
    return root.querySelector?.('[class*="video"],[id*="video"]') ? 1 : 0;
  }

  async function collect(options = {}) {
    const access = C.accessState();
    if (access.blocked) {
      return C.fragment("detail", access.status, {
        assets: [],
        video_count: 0,
        diagnostics: { stop_reason: access.stop_reason, scroll_steps: 0 },
      });
    }
    const maxSteps = Math.max(5, Math.min(Number(options.maxSteps) || 75, 90));
    const maxMs = Math.max(5000, Math.min(Number(options.maxMs) || 60000, 75000));
    const rootInfo = findRoot();
    const expandText = clickExpand();
    if (expandText) await C.sleep(400);
    if (rootInfo.root !== document) {
      rootInfo.root.scrollIntoView({ block: "start" });
      await C.sleep(300);
    }
    const started = Date.now();
    const aggregate = new Map();
    const excludedMap = new Map();
    let stableCycles = 0;
    let previousHeight = -1;
    let previousCount = -1;
    let steps = 0;
    let stopReason = "LAZY_LOAD_INCOMPLETE";

    while (steps < maxSteps && Date.now() - started < maxMs) {
      const result = classifyImages(rootInfo);
      for (const [url, asset] of result.selected) if (!aggregate.has(url)) aggregate.set(url, asset);
      for (const item of result.excluded) if (!excludedMap.has(item.source_asset_url)) excludedMap.set(item.source_asset_url, item);
      const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
      const rootRect = rootInfo.root === document ? null : rootInfo.root.getBoundingClientRect();
      const atBottom =
        window.scrollY + window.innerHeight >= height - 4 ||
        (rootRect && rootRect.bottom <= window.innerHeight + 4);
      if (atBottom && height === previousHeight && aggregate.size === previousCount) stableCycles += 1;
      else stableCycles = 0;
      if (stableCycles >= 3) {
        stopReason = "HEIGHT_AND_ASSETS_STABLE";
        break;
      }
      previousHeight = height;
      previousCount = aggregate.size;
      window.scrollBy(0, Math.max(300, Math.round(window.innerHeight * 0.95)));
      steps += 1;
      await C.sleep(450);
      const state = C.accessState();
      if (state.blocked) {
        stopReason = state.stop_reason;
        break;
      }
    }
    const finalResult = classifyImages(rootInfo);
    for (const [url, asset] of finalResult.selected) if (!aggregate.has(url)) aggregate.set(url, asset);
    for (const item of finalResult.excluded) if (!excludedMap.has(item.source_asset_url)) excludedMap.set(item.source_asset_url, item);
    const assets = Array.from(aggregate.values()).map((asset, index) => ({ order: index + 1, ...asset }));
    const finalAccess = C.accessState();
    let status;
    if (finalAccess.blocked) status = finalAccess.status;
    else if (!assets.length) status = "DETAIL_ASSET_NOT_FOUND";
    else if (rootInfo.fallback || stopReason !== "HEIGHT_AND_ASSETS_STABLE") status = "PARTIAL";
    else status = "READY";
    if (rootInfo.fallback && assets.length && stopReason === "HEIGHT_AND_ASSETS_STABLE") stopReason = "DETAIL_REGION_UNCERTAIN";

    return C.fragment("detail", status, {
      assets,
      video_count: videoCount(rootInfo.root),
      diagnostics: {
        root_selector: rootInfo.selector,
        fallback_used: rootInfo.fallback,
        expand_control_clicked: expandText,
        scroll_steps: steps,
        height_stable_cycles: stableCycles,
        lazy_load_completed: stopReason === "HEIGHT_AND_ASSETS_STABLE",
        excluded_candidates: Array.from(excludedMap.values()).slice(0, 100),
        excluded_candidate_count: excludedMap.size,
        stop_reason: finalAccess.blocked ? finalAccess.stop_reason : stopReason,
      },
    });
  }

  global.CoupangExtractorDetail = { collect };
})(globalThis);
