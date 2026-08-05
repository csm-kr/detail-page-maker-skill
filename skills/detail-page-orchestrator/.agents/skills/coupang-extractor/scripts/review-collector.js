(function (global) {
  "use strict";
  const C = global.CoupangExtractorCommon;

  const CARD_SELECTORS = [
    "article.sdp-review__article__list__review",
    ".sdp-review__article__list__review",
    '[class*="review"] article',
  ];
  const CONTENT_SELECTORS = [
    ".sdp-review__article__list__review__content",
    '[class*="review__content"]',
    "[data-review-content]",
    '[class~="twc-break-all"]',
  ];

  function reviewRoot() {
    const roots = C.queryAll(["#sdpReview", ".sdp-review", '[class*="sdp-review"]', '[id*="review"]']);
    return roots.find((node) => CARD_SELECTORS.some((selector) => node.querySelector(selector))) || roots[0] || document;
  }

  function reviewCards(root = reviewRoot()) {
    const raw = C.queryAll(CARD_SELECTORS, root).filter((node) => C.normalizeText(node.textContent).length >= 20);
    return raw.filter((node) => !raw.some((other) => other !== node && node.contains(other)));
  }

  async function openReviewTab() {
    if (reviewCards().length) return { opened: false, found: true };
    const candidates = C.queryAll(['[role="tab"]', "button", "a", "li"])
      .filter(C.visible)
      .map((node) => ({ node, text: C.normalizeText(node.textContent), aria: C.normalizeText(node.getAttribute("aria-label")) }))
      .filter((item) => /상품평|구매후기|리뷰/.test(item.text + " " + item.aria))
      .sort((a, b) => {
        const aScore = /^(상품평|구매후기|리뷰)(\s*\(?.*\)?)?$/.test(a.text) ? 0 : 1;
        const bScore = /^(상품평|구매후기|리뷰)(\s*\(?.*\)?)?$/.test(b.text) ? 0 : 1;
        return aScore - bScore;
      });
    if (!candidates.length) return { opened: false, found: false };
    const target = candidates[0].node;
    target.scrollIntoView({ block: "center" });
    target.click();
    const loaded = await C.waitFor(() => reviewCards().length > 0, 7000, 150);
    return { opened: true, found: Boolean(loaded) };
  }

  function selectorText(card, selectors) {
    for (const selector of selectors) {
      const node = card.querySelector(selector);
      const text = C.normalizeText(node?.textContent);
      if (text) return text;
    }
    return null;
  }

  function parseRating(card) {
    const fullStars = card.querySelectorAll('[class*="bg-full-star"]').length;
    if (fullStars >= 1 && fullStars <= 5) return fullStars;
    const candidates = C.queryAll(
      ['[data-rating]', '[aria-label*="별"]', '[aria-label*="점"]', '[class*="star"]', '[class*="rating"]'],
      card
    );
    for (const node of candidates) {
      const data = node.getAttribute("data-rating");
      if (data && /^[1-5](?:\.0)?$/.test(data)) return Math.round(Number(data));
      const aria = C.normalizeText(node.getAttribute("aria-label"));
      const ariaMatch = aria.match(/(?:별점\s*)?([1-5](?:\.0)?)\s*(?:점|별)?/);
      if (ariaMatch) return Math.round(Number(ariaMatch[1]));
      const styleWidth = String(node.getAttribute("style") || "").match(/width\s*:\s*(\d+(?:\.\d+)?)%/i);
      if (styleWidth) {
        const rating = Math.round(Number(styleWidth[1]) / 20);
        if (rating >= 1 && rating <= 5) return rating;
      }
      const classMatch = String(node.className || "").match(/(?:star|rating)[^0-9]*([1-5])(?!\d)/i);
      if (classMatch) return Number(classMatch[1]);
    }
    return null;
  }

  function fallbackReviewText(card) {
    const clone = card.cloneNode(true);
    for (const node of clone.querySelectorAll(
      '[class*="author"],[class*="profile"],[class*="user"],[class*="writer"],[class*="name"],header,footer,time,button,img,video'
    )) {
      node.remove();
    }
    const candidates = Array.from(clone.querySelectorAll("p,div,span"))
      .map((node) => C.normalizeText(node.textContent))
      .filter((text) => text.length >= 20 && text.length <= 10000)
      .sort((a, b) => b.length - a.length);
    return candidates[0] || null;
  }

  function parseDate(card) {
    const known = selectorText(card, [
      ".sdp-review__article__list__info__product-info__reg-date",
      "time",
      '[class*="date"]',
    ]);
    const text = known || C.normalizeText(card.textContent);
    const match = text.match(/20\d{2}[.\/-]\s*\d{1,2}[.\/-]\s*\d{1,2}/);
    return match ? match[0].replace(/\s+/g, "") : null;
  }

  function parseHelpful(card) {
    const counted = card.querySelector("[data-review-id][data-count]");
    const dataCount = counted?.getAttribute("data-count");
    if (dataCount && /^\d+$/.test(dataCount)) return Number(dataCount);
    const known = selectorText(card, [
      ".sdp-review__article__list__help__count",
      '[class*="helpful"]',
      '[class*="help"] [class*="count"]',
    ]);
    const text = known || "";
    const match = text.match(/(\d[\d,]*)/);
    return match ? Number(match[1].replace(/,/g, "")) : null;
  }

  function mediaCount(card) {
    return C.queryAll(["img", "video"], card).filter((node) => {
      if (node.tagName === "VIDEO") return true;
      const source = String(node.currentSrc || node.src || "");
      if (!/\/PRODUCTREVIEW\//i.test(source)) return false;
      let parent = node.parentElement;
      for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
        const classes = String(parent.className || "").toLowerCase();
        if (classes.includes("profile") || classes.includes("author") || classes.includes("rounded-[50%]")) return false;
      }
      return true;
    }).length;
  }

  async function parseCard(card, sourcePage) {
    const direct = selectorText(card, CONTENT_SELECTORS);
    const rawText = direct || fallbackReviewText(card);
    if (!rawText) return null;
    const redacted = C.redactReviewText(rawText);
    if (!redacted.text) return null;
    const rating = parseRating(card);
    const optionName = selectorText(card, [
      ".sdp-review__article__list__info__product-info__name",
      '[class*="option"]',
      '[data-option-name]',
      '[class*="twc-line-clamp"][class*="twc-my-"]',
    ]);
    const reviewedAt = parseDate(card);
    const contentKey = await C.reviewDedupeKey(rating, redacted.text, optionName, reviewedAt);
    return {
      item: {
        rating,
        review_text: redacted.text,
        option_name: optionName,
        reviewed_at: reviewedAt,
        helpful_count: parseHelpful(card),
        source_page: sourcePage,
        content_key: contentKey,
        media_count: mediaCount(card),
      },
      redactionCount: redacted.count,
    };
  }

  async function withOccurrence(item, occurrence) {
    return {
      ...item,
      dedupe_occurrence: occurrence,
      dedupe_key: await C.reviewDedupeKey(
        item.rating,
        item.review_text,
        item.option_name,
        item.reviewed_at,
        occurrence
      ),
    };
  }

  function pageSignature(cards) {
    return cards
      .slice(0, 5)
      .map((card) => C.normalizeText(card.textContent).slice(0, 300))
      .join("||");
  }

  function nextButton(root, currentPage) {
    const containers = Array.from(root.querySelectorAll("div"));
    for (const container of containers) {
      const directButtons = Array.from(container.children).filter((node) => node.tagName === "BUTTON");
      const numericButtons = directButtons.filter((node) => /^\d+$/.test(C.normalizeText(node.textContent)));
      if (numericButtons.length < 2) continue;
      const wanted = numericButtons.find((node) => C.normalizeText(node.textContent) === String(currentPage + 1));
      if (wanted && !wanted.disabled) return wanted;
      const current = numericButtons.find((node) => C.normalizeText(node.textContent) === String(currentPage));
      const last = directButtons[directButtons.length - 1];
      if (current && last && last !== current && !last.disabled && !C.normalizeText(last.textContent)) return last;
    }
    const selectors = [
      ".sdp-review__article__page__next",
      'button[aria-label*="다음"]',
      'a[aria-label*="다음"]',
      '[class*="pagination"] button',
      '[class*="pagination"] a',
    ];
    const candidates = C.queryAll(selectors, root === document ? document : root.parentElement || document).filter(C.visible);
    for (const node of candidates) {
      const text = C.normalizeText(node.textContent) + " " + C.normalizeText(node.getAttribute("aria-label"));
      const isNext = /다음|next/i.test(text) || /next/i.test(String(node.className || ""));
      const disabled =
        node.disabled ||
        node.getAttribute("aria-disabled") === "true" ||
        /disabled/.test(String(node.className || "").toLowerCase());
      if (isNext && !disabled) return node;
    }
    return null;
  }

  function buildRatingPlan(maxReviews) {
    const lowTarget = Math.ceil((maxReviews * 2) / 3);
    const highTarget = maxReviews - lowTarget;
    return [
      { rating: 1, label: "나쁨", group: "low", groupTarget: lowTarget },
      { rating: 2, label: "별로", group: "low", groupTarget: lowTarget },
      { rating: 4, label: "좋음", group: "high", groupTarget: highTarget },
      { rating: 5, label: "최고", group: "high", groupTarget: highTarget },
    ];
  }

  function ratingCombo(root) {
    return Array.from(root.querySelectorAll('[role="combobox"]')).find((node) => {
      const text = C.normalizeText(node.textContent);
      return /모든 별점|별점|최고|좋음|보통|별로|나쁨/.test(text);
    });
  }

  async function selectAllRatings(root, timeoutMs) {
    const combo = ratingCombo(root);
    if (!combo) return { ok: false, code: "RATING_FILTER_NOT_FOUND" };
    if (C.normalizeText(combo.textContent).includes("모든 별점")) {
      return { ok: true, code: "ALL_RATINGS_SELECTED" };
    }
    combo.scrollIntoView({ block: "center" });
    combo.click();
    const option = await C.waitFor(() => {
      return Array.from(document.querySelectorAll('[role="option"]')).find((node) =>
        C.normalizeText(node.textContent).startsWith("모든 별점")
      );
    }, timeoutMs, 100);
    if (!option) return { ok: false, code: "ALL_RATINGS_OPTION_NOT_FOUND" };
    option.click();
    const ready = await C.waitFor(() => {
      const state = C.accessState();
      if (state.blocked) return { blocked: state };
      return C.normalizeText(combo.textContent).includes("모든 별점") && reviewCards(root).length
        ? { selected: true }
        : null;
    }, timeoutMs, 150);
    if (ready?.blocked) return { ok: false, code: ready.blocked.stop_reason, access: ready.blocked };
    return ready ? { ok: true, code: "ALL_RATINGS_SELECTED" } : { ok: false, code: "ALL_RATINGS_TIMEOUT" };
  }

  function latestSortSelected(root, latestButton) {
    if (latestButton.getAttribute("aria-pressed") === "true" || latestButton.getAttribute("aria-selected") === "true") {
      return true;
    }
    if (latestButton.classList.item(0) === "twc-font-bold") return true;
    const bestButton = Array.from(root.querySelectorAll("button")).find(
      (node) => C.visible(node) && C.normalizeText(node.textContent) === "베스트순"
    );
    const latestWeight = Number.parseInt(getComputedStyle(latestButton).fontWeight, 10) || 0;
    const bestWeight = bestButton ? Number.parseInt(getComputedStyle(bestButton).fontWeight, 10) || 0 : 0;
    return latestWeight >= 600 && latestWeight > bestWeight;
  }

  async function selectLatestSort(root, timeoutMs) {
    const button = Array.from(root.querySelectorAll("button")).find(
      (node) => C.visible(node) && C.normalizeText(node.textContent) === "최신순"
    );
    if (!button) return { ok: false, code: "LATEST_SORT_NOT_FOUND" };
    if (latestSortSelected(root, button)) return { ok: true, code: "LATEST_SORT_CONFIRMED" };
    const before = pageSignature(reviewCards(root));
    button.scrollIntoView({ block: "center" });
    button.click();
    const ready = await C.waitFor(() => {
      const state = C.accessState();
      if (state.blocked) return { blocked: state };
      const cards = reviewCards(root);
      if (!cards.length) return null;
      if (latestSortSelected(root, button) && pageSignature(cards) !== before) return { selected: true };
      return null;
    }, timeoutMs, 150);
    if (ready?.blocked) return { ok: false, code: ready.blocked.stop_reason, access: ready.blocked };
    return ready ? { ok: true, code: "LATEST_SORT_CONFIRMED" } : { ok: false, code: "LATEST_SORT_TIMEOUT" };
  }

  async function selectRatingFilter(root, bucket, timeoutMs) {
    const combo = ratingCombo(root);
    if (!combo) return { ok: false, code: "RATING_FILTER_NOT_FOUND" };
    const before = pageSignature(reviewCards(root));
    combo.scrollIntoView({ block: "center" });
    combo.click();
    const option = await C.waitFor(() => {
      return Array.from(document.querySelectorAll('[role="option"]')).find((node) =>
        C.normalizeText(node.textContent).startsWith(bucket.label)
      );
    }, timeoutMs, 100);
    if (!option) return { ok: false, code: "RATING_OPTION_NOT_FOUND" };
    option.click();
    const ready = await C.waitFor(() => {
      const state = C.accessState();
      if (state.blocked) return { blocked: state };
      const cards = reviewCards(root);
      if (!cards.length) return null;
      const comboText = C.normalizeText(combo.textContent);
      const ratings = cards.slice(0, 5).map(parseRating).filter((value) => value != null);
      const changed = pageSignature(cards) !== before;
      if (comboText.includes(bucket.label) && (changed || ratings.some((value) => value === bucket.rating))) {
        return { selected: true };
      }
      return null;
    }, timeoutMs, 150);
    if (ready?.blocked) return { ok: false, code: ready.blocked.stop_reason, access: ready.blocked };
    return ready ? { ok: true, code: "RATING_FILTER_SELECTED" } : { ok: false, code: "RATING_FILTER_TIMEOUT" };
  }

  async function collect(options = {}) {
    const maxLatestPages = Math.max(1, Math.min(Number(options.maxLatestPages || options.maxPages) || 12, 30));
    const maxSupplementPages = Math.max(1, Math.min(Number(options.maxSupplementPages || options.maxPages) || 24, 30));
    const latestReviews = Math.max(100, Math.min(Number(options.latestReviews) || 100, 299));
    const requestedSupplement = Math.max(1, Math.min(Number(options.supplementReviews || options.maxReviews) || 100, 200));
    const supplementReviews = Math.min(requestedSupplement, 300 - latestReviews);
    const maxReviews = latestReviews + supplementReviews;
    const pageTimeoutMs = Math.max(1000, Math.min(Number(options.pageTimeoutMs) || 7000, 15000));
    const access = C.accessState();
    const emptyScope = {
      requested_max_pages: maxLatestPages + maxSupplementPages,
      requested_latest_max_pages: maxLatestPages,
      requested_supplement_max_pages: maxSupplementPages,
      requested_max_reviews: maxReviews,
      requested_latest_reviews: latestReviews,
      requested_supplement_reviews: supplementReviews,
      pages_observed: 0,
      reviews_observed: 0,
      latest_reviews_observed: 0,
      supplement_reviews_observed: 0,
      complete_all_reviews: false,
      sampling_strategy: "latest_minimum_plus_rating_stratified_supplement",
      target_low_high_ratio: "2:1",
      target_low_count: Math.ceil((supplementReviews * 2) / 3),
      target_high_count: supplementReviews - Math.ceil((supplementReviews * 2) / 3),
      observed_low_count: 0,
      observed_high_count: 0,
      observed_neutral_count: 0,
      observed_low_high_ratio: null,
    };
    if (access.blocked) {
      return C.fragment("reviews", access.status, {
        scope: emptyScope,
        items: [],
        diagnostics: {
          stop_reason: access.stop_reason,
          duplicate_count: 0,
          redacted_pattern_count: 0,
          latest_observation: { sort_status: null },
          latest_minimum_met: false,
          supplement_contract_met: false,
          sampling_contract_met: false,
        },
      });
    }
    const tab = await openReviewTab();
    if (!tab.found) {
      return C.fragment("reviews", "REVIEW_TAB_NOT_FOUND", {
        scope: emptyScope,
        items: [],
        diagnostics: {
          stop_reason: "REVIEW_TAB_NOT_FOUND",
          duplicate_count: 0,
          redacted_pattern_count: 0,
          latest_observation: { sort_status: null },
          latest_minimum_met: false,
          supplement_contract_met: false,
          sampling_contract_met: false,
        },
      });
    }
    const root = reviewRoot();
    const items = [];
    const seen = new Set();
    const baselineContentCounts = new Map();
    const supplementEncounterCounts = new Map();
    const observedPages = new Set();
    const ratingPlan = buildRatingPlan(supplementReviews);
    const baselineRatingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const supplementRatingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const filterObservations = [];
    const latestObservation = {
      target: latestReviews,
      collected: 0,
      pages_observed: 0,
      rating_filter_status: null,
      sort_status: null,
      stop_reason: null,
    };
    let duplicateCount = 0;
    let redactedPatternCount = 0;
    let ratingMismatchCount = 0;
    let latestPagesRemaining = maxLatestPages;
    let supplementPagesRemaining = maxSupplementPages;
    let stopReason = "LATEST_AND_SUPPLEMENT_TARGETS_REACHED";
    let status = "PARTIAL";

    const allRatings = await selectAllRatings(root, pageTimeoutMs);
    latestObservation.rating_filter_status = allRatings.code;
    if (allRatings.access) {
      status = allRatings.access.status;
      stopReason = allRatings.access.stop_reason;
      latestObservation.stop_reason = stopReason;
    }
    let latestSort = { ok: false, code: "LATEST_SORT_NOT_ATTEMPTED" };
    if (allRatings.ok && status === "PARTIAL") {
      latestSort = await selectLatestSort(root, pageTimeoutMs);
      latestObservation.sort_status = latestSort.code;
      if (latestSort.access) {
        status = latestSort.access.status;
        stopReason = latestSort.access.stop_reason;
        latestObservation.stop_reason = stopReason;
      }
    } else {
      latestObservation.sort_status = latestSort.code;
    }

    if (allRatings.ok && latestSort.ok && status === "PARTIAL") {
      let currentPage = 1;
      let sameTransitions = 0;
      while (latestObservation.collected < latestReviews && latestPagesRemaining > 0) {
        const cards = reviewCards(root);
        if (!cards.length) {
          latestObservation.stop_reason = "REVIEW_CARD_NOT_FOUND";
          break;
        }
        const signature = pageSignature(cards);
        const pageKey = `latest:${signature}`;
        if (observedPages.has(pageKey)) {
          latestObservation.stop_reason = "STABLE_NO_NEW_REVIEWS";
          break;
        }
        observedPages.add(pageKey);
        latestObservation.pages_observed += 1;
        latestPagesRemaining -= 1;
        for (const card of cards) {
          const parsed = await parseCard(card, currentPage);
          if (!parsed) continue;
          const contentKey = parsed.item.content_key;
          const occurrence = (baselineContentCounts.get(contentKey) || 0) + 1;
          baselineContentCounts.set(contentKey, occurrence);
          const finalized = await withOccurrence(parsed.item, occurrence);
          seen.add(finalized.dedupe_key);
          redactedPatternCount += parsed.redactionCount;
          if (finalized.rating >= 1 && finalized.rating <= 5) {
            baselineRatingCounts[finalized.rating] += 1;
            ratingCounts[finalized.rating] += 1;
          }
          latestObservation.collected += 1;
          items.push({ position: items.length + 1, sample_group: "latest_baseline", ...finalized });
          if (latestObservation.collected >= latestReviews) break;
        }
        if (latestObservation.collected >= latestReviews) {
          latestObservation.stop_reason = "LATEST_TARGET_REACHED";
          break;
        }
        if (latestPagesRemaining <= 0) {
          latestObservation.stop_reason = "MAX_LATEST_PAGES";
          break;
        }
        const next = nextButton(root, currentPage);
        if (!next) {
          latestObservation.stop_reason = "NO_NEXT_PAGE";
          break;
        }
        next.scrollIntoView({ block: "center" });
        next.click();
        const changed = await C.waitFor(() => {
          const state = C.accessState();
          if (state.blocked) return { blocked: state };
          const nextCards = reviewCards(root);
          const nextSignature = pageSignature(nextCards);
          return nextCards.length && nextSignature !== signature ? { changed: true } : null;
        }, pageTimeoutMs, 150);
        if (changed?.blocked) {
          latestObservation.stop_reason = changed.blocked.stop_reason;
          stopReason = changed.blocked.stop_reason;
          status = changed.blocked.status;
          break;
        }
        if (!changed) {
          sameTransitions += 1;
          if (sameTransitions >= 2) {
            latestObservation.stop_reason = "STABLE_NO_NEW_REVIEWS";
            break;
          }
        } else {
          sameTransitions = 0;
          currentPage += 1;
        }
      }
    } else if (!latestObservation.stop_reason) {
      latestObservation.stop_reason = allRatings.ok ? latestSort.code : allRatings.code;
    }

    for (const bucket of ratingPlan) {
      const observation = {
        rating: bucket.rating,
        label: bucket.label,
        group: bucket.group,
        group_target: bucket.groupTarget,
        target: 0,
        collected: 0,
        pages_observed: 0,
        filter_status: null,
        stop_reason: null,
      };
      filterObservations.push(observation);
      const groupCollected =
        bucket.group === "low"
          ? supplementRatingCounts[1] + supplementRatingCounts[2]
          : supplementRatingCounts[4] + supplementRatingCounts[5];
      observation.target = Math.max(0, bucket.groupTarget - groupCollected);
      if (observation.target <= 0) {
        observation.filter_status = "SKIPPED";
        observation.stop_reason = "RATING_GROUP_TARGET_REACHED";
        continue;
      }
      if (supplementPagesRemaining <= 0 || items.length >= maxReviews || status !== "PARTIAL") {
        observation.filter_status = "SKIPPED";
        observation.stop_reason = supplementPagesRemaining <= 0 ? "MAX_SUPPLEMENT_PAGES" : status !== "PARTIAL" ? stopReason : "MAX_REVIEWS";
        continue;
      }
      const selected = await selectRatingFilter(root, bucket, pageTimeoutMs);
      observation.filter_status = selected.code;
      if (selected.access) {
        stopReason = selected.access.stop_reason;
        status = selected.access.status;
        observation.stop_reason = stopReason;
        break;
      }
      if (!selected.ok) {
        observation.stop_reason = selected.code;
        stopReason = "RATING_FILTER_INCOMPLETE";
        continue;
      }

      let currentPage = 1;
      let sameTransitions = 0;
      while (observation.collected < observation.target && supplementPagesRemaining > 0 && items.length < maxReviews) {
        const cards = reviewCards(root);
        if (!cards.length) {
          observation.stop_reason = "REVIEW_CARD_NOT_FOUND";
          break;
        }
        const signature = pageSignature(cards);
        const pageKey = `supplement:${bucket.rating}:${signature}`;
        if (observedPages.has(pageKey)) {
          observation.stop_reason = "STABLE_NO_NEW_REVIEWS";
          break;
        }
        observedPages.add(pageKey);
        observation.pages_observed += 1;
        supplementPagesRemaining -= 1;
        for (const card of cards) {
          const parsed = await parseCard(card, currentPage);
          if (!parsed) continue;
          if (parsed.item.rating !== bucket.rating) {
            ratingMismatchCount += 1;
            continue;
          }
          const contentKey = parsed.item.content_key;
          const encountered = (supplementEncounterCounts.get(contentKey) || 0) + 1;
          supplementEncounterCounts.set(contentKey, encountered);
          const baselineOccurrences = baselineContentCounts.get(contentKey) || 0;
          if (encountered <= baselineOccurrences) {
            duplicateCount += 1;
            continue;
          }
          const finalized = await withOccurrence(parsed.item, encountered);
          if (seen.has(finalized.dedupe_key)) {
            duplicateCount += 1;
            continue;
          }
          seen.add(finalized.dedupe_key);
          redactedPatternCount += parsed.redactionCount;
          supplementRatingCounts[bucket.rating] += 1;
          ratingCounts[bucket.rating] += 1;
          observation.collected += 1;
          items.push({
            position: items.length + 1,
            sample_group: "rating_stratified_supplement",
            rating_filter: bucket.rating,
            ...finalized,
          });
          if (observation.collected >= observation.target || items.length >= maxReviews) break;
        }
        if (observation.collected >= observation.target) {
          observation.stop_reason = "RATING_TARGET_REACHED";
          break;
        }
        if (supplementPagesRemaining <= 0) {
          observation.stop_reason = "MAX_SUPPLEMENT_PAGES";
          stopReason = "MAX_SUPPLEMENT_PAGES";
          break;
        }
        const next = nextButton(root, currentPage);
        if (!next) {
          observation.stop_reason = "NO_NEXT_PAGE";
          break;
        }
        next.scrollIntoView({ block: "center" });
        next.click();
        const changed = await C.waitFor(() => {
          const state = C.accessState();
          if (state.blocked) return { blocked: state };
          const nextCards = reviewCards(root);
          const nextSignature = pageSignature(nextCards);
          return nextCards.length && nextSignature !== signature ? { changed: true } : null;
        }, pageTimeoutMs, 150);
        if (changed?.blocked) {
          observation.stop_reason = changed.blocked.stop_reason;
          stopReason = changed.blocked.stop_reason;
          status = changed.blocked.status;
          break;
        }
        if (!changed) {
          sameTransitions += 1;
          if (sameTransitions >= 2) {
            observation.stop_reason = "STABLE_NO_NEW_REVIEWS";
            break;
          }
        } else {
          sameTransitions = 0;
          currentPage += 1;
        }
      }
      if (status === "ACCESS_BLOCKED" || status === "LOGIN_REQUIRED") break;
    }

    const lowCount = supplementRatingCounts[1] + supplementRatingCounts[2];
    const highCount = supplementRatingCounts[4] + supplementRatingCounts[5];
    const neutralCount = supplementRatingCounts[3];
    const ratio = highCount > 0 ? lowCount / highCount : null;
    const latestMinimumMet =
      allRatings.ok && latestSort.ok && latestObservation.collected >= latestReviews;
    const supplementContractMet =
      items.length - latestObservation.collected === supplementReviews &&
      lowCount === Math.ceil((supplementReviews * 2) / 3) &&
      highCount === supplementReviews - Math.ceil((supplementReviews * 2) / 3) &&
      neutralCount === 0;
    const samplingContractMet = latestMinimumMet && supplementContractMet;
    if (status !== "ACCESS_BLOCKED" && status !== "LOGIN_REQUIRED") {
      if (!items.length) {
        status = "REVIEW_CARD_NOT_FOUND";
        stopReason = "RATING_FILTER_INCOMPLETE";
      } else if (samplingContractMet) {
        status = "READY";
        stopReason = "LATEST_AND_SUPPLEMENT_TARGETS_REACHED";
      } else if (!latestMinimumMet) {
        status = "PARTIAL";
        stopReason = latestObservation.stop_reason || "LATEST_REVIEW_SHORTAGE";
      } else if (supplementPagesRemaining <= 0) {
        status = "PARTIAL";
        stopReason = "MAX_SUPPLEMENT_PAGES";
      } else {
        status = "PARTIAL";
        stopReason = "RATING_BUCKET_SHORTAGE";
      }
    }
    return C.fragment("reviews", status, {
      scope: {
        requested_max_pages: maxLatestPages + maxSupplementPages,
        requested_latest_max_pages: maxLatestPages,
        requested_supplement_max_pages: maxSupplementPages,
        requested_max_reviews: maxReviews,
        requested_latest_reviews: latestReviews,
        requested_supplement_reviews: supplementReviews,
        pages_observed: observedPages.size,
        reviews_observed: items.length,
        latest_reviews_observed: latestObservation.collected,
        supplement_reviews_observed: items.length - latestObservation.collected,
        complete_all_reviews: false,
        sampling_strategy: "latest_minimum_plus_rating_stratified_supplement",
        target_low_high_ratio: "2:1",
        target_low_count: Math.ceil((supplementReviews * 2) / 3),
        target_high_count: supplementReviews - Math.ceil((supplementReviews * 2) / 3),
        observed_low_count: lowCount,
        observed_high_count: highCount,
        observed_neutral_count: neutralCount,
        observed_low_high_ratio: ratio,
      },
      items,
      diagnostics: {
        review_tab_clicked: tab.opened,
        card_selector: CARD_SELECTORS.find((selector) => root.querySelector(selector)) || null,
        content_selector: CONTENT_SELECTORS.find((selector) => root.querySelector(selector)) || "sanitized_longest_text_fallback",
        duplicate_count: duplicateCount,
        redacted_pattern_count: redactedPatternCount,
        reviewer_identity_discarded_count: items.length,
        rating_counts: ratingCounts,
        latest_rating_counts: baselineRatingCounts,
        supplement_rating_counts: supplementRatingCounts,
        latest_observation: latestObservation,
        rating_filter_observations: filterObservations,
        rating_mismatch_count: ratingMismatchCount,
        latest_minimum_met: latestMinimumMet,
        supplement_contract_met: supplementContractMet,
        sampling_contract_met: samplingContractMet,
        stop_reason: stopReason,
      },
    });
  }

  global.CoupangExtractorReviews = { collect };
})(globalThis);
