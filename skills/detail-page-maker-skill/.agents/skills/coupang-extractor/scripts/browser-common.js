(function (global) {
  "use strict";

  const VERSION = "1.1.0";
  const CDN_SUFFIX = "coupangcdn.com";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(predicate, timeoutMs = 5000, intervalMs = 100) {
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < timeoutMs) {
      try {
        const value = await predicate();
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      await sleep(intervalMs);
    }
    if (lastError) return null;
    return null;
  }

  function queryAll(selectors, root = document) {
    const seen = new Set();
    const nodes = [];
    for (const selector of selectors) {
      let matches = [];
      try {
        matches = root.querySelectorAll(selector);
      } catch (_) {
        matches = [];
      }
      for (const node of matches) {
        if (!seen.has(node)) {
          seen.add(node);
          nodes.push(node);
        }
      }
    }
    return nodes;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function visible(element) {
    if (!element || !(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
  }

  function pageY(element) {
    const rect = element.getBoundingClientRect();
    return Math.round(rect.top + window.scrollY);
  }

  function largestSrcsetUrl(value) {
    const entries = String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const bits = part.split(/\s+/);
        const descriptor = bits[1] || "0w";
        const weight = parseFloat(descriptor) || 0;
        return { url: bits[0], weight };
      })
      .sort((a, b) => b.weight - a.weight);
    return entries.length ? entries[0].url : "";
  }

  function normalizeCdnUrl(raw) {
    if (!raw) return null;
    try {
      const url = new URL(raw, location.href);
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      if (url.protocol !== "https:" || !(host === CDN_SUFFIX || host.endsWith("." + CDN_SUFFIX))) return null;
      if (url.username || url.password || (url.port && url.port !== "443")) return null;
      url.hash = "";
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function imageUrl(image) {
    if (!image) return null;
    const candidates = [
      image.currentSrc,
      image.getAttribute("src"),
      image.getAttribute("data-src"),
      image.getAttribute("data-original"),
      largestSrcsetUrl(image.getAttribute("srcset")),
      largestSrcsetUrl(image.getAttribute("data-srcset")),
    ];
    for (const candidate of candidates) {
      const normalized = normalizeCdnUrl(candidate);
      if (normalized) return normalized;
    }
    return null;
  }

  function productIdentity() {
    const current = new URL(location.href);
    let match = current.pathname.match(/^\/vp\/products\/(\d+)\/?$/);
    let itemId = current.searchParams.get("itemId");
    let vendorItemId = current.searchParams.get("vendorItemId");
    if (!match || !itemId) {
      const canonical = document.querySelector('link[rel="canonical"][href*="/vp/products/"]');
      if (canonical) {
        try {
          const url = new URL(canonical.href, location.href);
          match = match || url.pathname.match(/^\/vp\/products\/(\d+)\/?$/);
          itemId = itemId || url.searchParams.get("itemId");
          vendorItemId = vendorItemId || url.searchParams.get("vendorItemId");
        } catch (_) {}
      }
    }
    const title = normalizeText(
      document.querySelector("h1")?.textContent ||
        document.querySelector(".prod-buy-header__title")?.textContent ||
        document.title
    );
    return {
      final_url: location.href,
      product_id: match ? match[1] : null,
      item_id: itemId && /^\d+$/.test(itemId) ? itemId : null,
      vendor_item_id: vendorItemId && /^\d+$/.test(vendorItemId) ? vendorItemId : null,
      title: title || null,
    };
  }

  function accessState() {
    const text = normalizeText(document.body?.innerText || "").slice(0, 12000).toLowerCase();
    const url = location.href.toLowerCase();
    if (
      /access denied|request blocked|captcha|보안문자|비정상적인 접근|자동화된 요청|로봇이 아닙니다/.test(text)
    ) {
      return { blocked: true, status: "ACCESS_BLOCKED", stop_reason: "ACCESS_BLOCKED" };
    }
    if (/\/login|loginform|signin/.test(url) || (text.length < 2500 && /로그인이 필요|로그인 후 이용/.test(text))) {
      return { blocked: true, status: "LOGIN_REQUIRED", stop_reason: "LOGIN_REQUIRED" };
    }
    return { blocked: false, status: null, stop_reason: null };
  }

  function rights() {
    return {
      scope: "research_reference_only",
      production_use_allowed: false,
      reviewer_identity_stored: false,
    };
  }

  function fragment(kind, status, payload) {
    return {
      schema_version: "1.0",
      fragment_type: kind,
      captured_at: new Date().toISOString(),
      collector_version: VERSION,
      product: productIdentity(),
      status,
      ...payload,
      rights: rights(),
    };
  }

  function redactReviewText(value) {
    let text = normalizeText(value);
    let count = 0;
    const rules = [
      [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
      [/(?<!\d)(?:\+?82[-.\s]?)?(?:0?1[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g, "[REDACTED_PHONE]"],
      [/(?:주문\s*(?:번호|ID)|order\s*(?:number|no\.?|id))\s*[:#-]?\s*[A-Z0-9-]{5,}/gi, "[REDACTED_ORDER]"],
    ];
    for (const [pattern, replacement] of rules) {
      text = text.replace(pattern, () => {
        count += 1;
        return replacement;
      });
    }
    return { text, count };
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function reviewDedupeKey(rating, reviewText, optionName, reviewedAt, occurrence = null) {
    const parts = [rating == null ? "" : String(rating), normalizeText(reviewText), normalizeText(optionName), normalizeText(reviewedAt)];
    if (occurrence != null) parts.push(String(occurrence));
    const payload = parts.join(" | ");
    return "sha256:" + (await sha256(payload));
  }

  global.CoupangExtractorCommon = {
    VERSION,
    sleep,
    waitFor,
    queryAll,
    normalizeText,
    visible,
    pageY,
    normalizeCdnUrl,
    imageUrl,
    productIdentity,
    accessState,
    rights,
    fragment,
    redactReviewText,
    reviewDedupeKey,
  };
})(globalThis);
