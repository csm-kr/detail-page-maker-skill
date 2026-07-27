const ASSET_LABELS = {
  "background-car-interior": "정차 차량 실내",
  "background-neutral-proof": "중립 증거 배경",
  "background-studio": "웜화이트 스튜디오",
  "background-summer-walk": "여름 산책 배경",
  "background-window-daylight": "창가 자연광",
  "bicycle-scene": "자전거 사용 장면",
  "cafe-scene": "카페 착용 장면",
  "commute-scene": "출퇴근 착용 장면",
  "cuff-band-detail": "상단 밴딩 마감",
  "driving-scene": "운전 착용 장면",
  "gardening-scene": "가벼운 야외 활동",
  "handback-coverage-detail": "손등 커버 디테일",
  "hero-product": "히어로 제품",
  "label-position-macro": "손등 라벨 위치",
  "loosefit-elbow-detail": "팔꿈치 루즈핏",
  "material-detail": "플리츠 원단 매크로",
  "outdoor-scene": "산책 착용 장면",
  "pair-product": "화이트 한 쌍",
  "product-contact-sheet": "제품 뷰 시트",
  "single-back-view": "손등 방향",
  "single-front-view": "정면",
  "single-side-view": "측면",
  "structure-proof": "엄지홀·손등 구조",
  "wearing-scene": "전체 착용",
};

const GIF_LABELS = {
  "cool-wave-motion": "쿨 무드 변화",
  "handback-compare-motion": "일반형과 손등 커버 비교",
  "hand-turn-motion": "손바닥 → 손등 회전",
  "loose-ripple-motion": "루즈핏 원단 살랑임",
  "pair-unfold-motion": "화이트 한 쌍 펼침",
  "pleat-release-motion": "플리츠 집기 → 놓기",
  "put-on-motion": "착용 전 → 착용 완료",
  "size-reveal-motion": "47 × 14cm 크기 확인",
  "steering-turn-motion": "핸들 소폭 회전",
  "thumb-flex-motion": "안쪽 엄지홀 움직임",
};

const PAGE_EYEBROWS = {
  "configuration-size": "SIZE",
  "construction-details": "DETAIL",
  "cool-light-proof": "LIGHT FOR SUMMER",
  "decision-recap": "SALANG",
  "everyday-use": "EVERYDAY USE",
  "final-questions": "BEFORE YOU CHOOSE",
  "handback-coverage": "HAND COVER",
  "loosefit-proof": "LOOSE FIT",
  "pain-recognition": "살랑 · 루즈핏 쿨토시",
  "product-answer": "WHITE DAILY SLEEVE",
  "white-style": "WHITE STYLE",
};

const PAGE_BENEFITS = {
  "configuration-size": ["공급처 표기", "전체 길이 47cm", "폭 14cm"],
  "construction-details": ["플리츠 원단", "상단 밴딩", "손등 끝단"],
  "cool-light-proof": ["얇은 플리츠", "여유 있는 구조", "여름용 인상"],
  "decision-recap": ["시원하게", "조임 없이", "손등까지"],
  "everyday-use": ["산책", "출퇴근", "가벼운 야외 활동"],
  "handback-coverage": ["손등 커버", "안쪽 엄지홀", "손등 라벨"],
  "how-to-wear": [],
  "loosefit-proof": ["팔을 따라 흐르는 주름", "몸에 붙지 않는 여유"],
  "pain-recognition": ["화이트", "루즈핏", "손등 커버"],
  "product-answer": ["시원하게", "조임 없이", "손등까지"],
  "white-style": ["화이트 컬러", "여유 있는 실루엣", "데일리 스타일"],
};

const PAGE_FALLBACK_ROLES = {
  "pain-recognition": ["hero-product"],
  "product-answer": ["single-side-view"],
  "construction-details": [
    "cuff-band-detail",
    "structure-proof",
    "label-position-macro",
  ],
  "everyday-use": ["outdoor-scene", "bicycle-scene", "gardening-scene"],
  "loosefit-proof": ["loosefit-elbow-detail"],
  "white-style": ["commute-scene", "cafe-scene"],
};

const PAGE_ROLE_PRIORITY = {
  "pain-recognition": [
    "hero-product",
  ],
  "product-answer": [
    "single-side-view",
  ],
  "cool-light-proof": [
    "material-detail",
    "single-side-view",
    "background-studio",
  ],
  "loosefit-proof": [
    "loosefit-elbow-detail",
  ],
  "handback-coverage": [
    "structure-proof",
  ],
  "white-style": [
    "commute-scene",
    "cafe-scene",
  ],
  "how-to-wear": [],
  "everyday-use": ["outdoor-scene", "bicycle-scene", "gardening-scene"],
  "construction-details": [
    "cuff-band-detail",
    "handback-coverage-detail",
    "label-position-macro",
  ],
  "configuration-size": [
    "single-front-view",
  ],
  "final-questions": [
    "single-back-view",
  ],
  "decision-recap": [
    "wearing-scene",
  ],
};

const CONSUMER_CAPTIONS = {
  "cuff-band-detail": "상단 밴딩",
  "label-position-macro": "손등 라벨",
  "material-detail": "플리츠 원단",
  "pair-product": "화이트 한 쌍",
  "single-back-view": "손등 방향",
  "single-front-view": "정면",
  "single-side-view": "측면",
  "structure-proof": "엄지홀과 손등 커버",
};

const PUBLIC_HEADLINE_OVERRIDES = {
  "pain-recognition": "화이트 루즈핏 쿨토시.",
  "product-answer": "붙고 조이는 토시가 부담스러웠다면.",
};

const PUBLIC_LEAD_OVERRIDES = {
  "configuration-size": "제품 실루엣 위로 전체 길이와 폭을 한 번에 확인하세요.",
  "construction-details": "플리츠 원단부터 밴딩과 손등 끝단까지 가까이 살펴보세요.",
  "cool-light-proof": "얇은 플리츠와 여유 있는 구조가 만드는 가벼운 여름 인상.",
  "decision-recap": "시원하게, 조임 없이, 손등까지 이어지는 화이트 데일리 쿨토시.",
  "everyday-use": "산책과 출퇴근처럼 자주 마주하는 여름 일상에.",
  "final-questions": "방향과 엄지홀, 관리 방법을 마지막으로 확인하세요.",
  "handback-coverage":
    "손등을 덮고, 엄지홀은 안쪽에서 자연스럽게 이어집니다.",
  "how-to-wear": "",
  "loosefit-proof": "팔을 굽히고 펴도 여유 있게 흐르는 주름.",
  "pain-recognition":
    "살랑 루즈핏 쿨토시. 얇고 여유 있는 플리츠가 팔부터 손등까지 이어집니다.",
  "product-answer":
    "몸에 딱 붙는 스포츠형 대신, 옷처럼 여유 있게 흐르는 화이트 데일리 핏.",
  "white-style": "티셔츠와 원피스에 가볍게 더하는 화이트 데일리 아이템.",
};

const GIF_ASSETS = {
  "cool-wave-motion": { output: "gif-cool-wave-motion" },
  "handback-compare-motion": { output: "gif-handback-compare-motion" },
  "hand-turn-motion": { output: "gif-hand-turn-motion" },
  "loose-ripple-motion": { output: "gif-loose-ripple-motion" },
  "pair-unfold-motion": {
    frames: ["gif-pair-gathered", "gif-pair-flat"],
  },
  "pleat-release-motion": { output: "gif-pleat-release-motion" },
  "put-on-motion": { output: "gif-put-on-motion" },
  "size-reveal-motion": { output: "gif-size-reveal-motion" },
  "steering-turn-motion": {
    frames: ["gif-steering-center", "gif-steering-turned"],
  },
  "thumb-flex-motion": { output: "gif-thumb-flex-motion" },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const PUBLIC_OUTPUT_FORBIDDEN_TEXT = [
  "구매 질문",
  "확인 근거",
  "DESIGN RULE",
  "COMMERCIAL REVIEW",
  "DESIGN REVIEW",
  "DRAFT REVIEW",
  "검토본",
  "장면 레퍼런스 제작 예정",
  "렌더 승인 전",
  "SSOT",
  "REV-",
  "ImageGen",
  "HyperFrames",
];

export function publicOutputViolations(html) {
  const source = String(html || "");
  const visibleText = source
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const accessibilityText = [...source.matchAll(
    /\b(?:alt|title|aria-label)=(["'])(.*?)\1/gi,
  )]
    .map((match) => match[2])
    .join(" ");
  const publicText = `${visibleText} ${accessibilityText}`;
  return PUBLIC_OUTPUT_FORBIDDEN_TEXT.filter((term) =>
    publicText.toLowerCase().includes(term.toLowerCase()),
  );
}

function activeRevision(state) {
  return (
    state.revisions?.find((item) => item.id === state.currentRevisionId) || null
  );
}

function selectedVersion(state, assetId) {
  const revision = activeRevision(state);
  const asset = state.assets?.[assetId];
  const versionNumber = revision?.assetSelections?.[assetId];
  if (!asset || !versionNumber) return null;
  const version = asset.versions?.find(
    (item) => Number(item.number) === Number(versionNumber),
  );
  return version ? { asset, version } : null;
}

function selectedAssetByRole(state, role) {
  const revision = activeRevision(state);
  if (!revision) return null;
  return Object.values(state.assets || {})
    .filter((asset) => asset.role === role)
    .map((asset) => selectedVersion(state, asset.id))
    .find(
      (selection) =>
        selection?.version?.approval?.decision === "approved" &&
        selection.version.path,
    );
}

function pageVisualRoles(state, page) {
  const requested = Array.isArray(page.assetRoles) ? page.assetRoles : [];
  const fallbacks = PAGE_FALLBACK_ROLES[page.id] || [];
  const selected = [...new Set([...requested, ...fallbacks])].filter((role) =>
    selectedAssetByRole(state, role),
  );
  const available = selected.some((role) => !role.startsWith("background-"))
    ? selected.filter((role) => !role.startsWith("background-"))
    : selected;
  const preferred = PAGE_ROLE_PRIORITY[page.id] || [];
  return available.sort((left, right) => {
    const preferredIndex = (role) => {
      const index = preferred.indexOf(role);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    const preference = preferredIndex(left) - preferredIndex(right);
    if (preference !== 0) return preference;
    const backgroundPriority = (role) =>
      role.startsWith("background-") ? 1 : 0;
    return backgroundPriority(left) - backgroundPriority(right);
  });
}

function projectAssetUrl(version) {
  return `../${String(version.path).replaceAll("\\", "/")}`;
}

function visualTile(state, role, pageId, index) {
  const selection = selectedAssetByRole(state, role);
  const label = ASSET_LABELS[role] || role;
  const layerId = `${pageId}-visual-${index + 1}`;
  if (!selection) return "";
  const caption = CONSUMER_CAPTIONS[role];
  return `<figure class="visual-tile role-${escapeHtml(role)}" data-layer-id="${escapeHtml(layerId)}" data-asset-id="${escapeHtml(selection.asset.id)}">
    <img src="${escapeHtml(projectAssetUrl(selection.version))}" alt="${escapeHtml(label)}" loading="${pageId === "pain-recognition" ? "eager" : "lazy"}" />
    ${
      caption
        ? `<figcaption><strong>${escapeHtml(caption)}</strong></figcaption>`
        : ""
    }
  </figure>`;
}

function gifTile(state, gifId, pageId, index) {
  const definition = GIF_ASSETS[gifId] || {};
  const label = GIF_LABELS[gifId] || gifId;
  const output = definition.output
    ? selectedVersion(state, definition.output)
    : null;
  if (
    output?.version?.path &&
    output.version.approval?.decision === "approved"
  ) {
    return `<figure class="motion-tile" data-layer-id="${escapeHtml(`${pageId}-motion-${index + 1}`)}" data-asset-id="${escapeHtml(output.asset.id)}">
      <img src="${escapeHtml(projectAssetUrl(output.version))}" alt="${escapeHtml(label)}" />
      <figcaption><strong>${escapeHtml(label)}</strong></figcaption>
    </figure>`;
  }
  return "";
}

function faqBlock(pageId) {
  return `<div class="faq-grid" data-layer-id="${escapeHtml(`${pageId}-faq`)}">
    <article><span>Q</span><strong>엄지홀은 어디에 있나요?</strong><p>겉에서 크게 벌어지지 않도록 안쪽으로 이어집니다.</p></article>
    <article><span>Q</span><strong>손등 방향은?</strong><p>작은 라벨이 손등 쪽을 향하도록 착용합니다.</p></article>
    <article><span>Q</span><strong>크기는?</strong><p>공급처 표기 기준 47 × 14cm입니다.</p></article>
  </div>`;
}

function sizeInfoBlock(pageId) {
  return `<div class="product-info size-info" data-layer-id="${escapeHtml(`${pageId}-product-info`)}">
    <div><span>전체 길이</span><strong>47cm</strong></div>
    <div><span>폭</span><strong>14cm</strong></div>
    <p>공급처 표기 기준</p>
  </div>`;
}

function benefitBlock(pageId) {
  const benefits = PAGE_BENEFITS[pageId] || [];
  if (!benefits.length) return "";
  return `<div class="benefit-strip" data-layer-id="${escapeHtml(`${pageId}-benefits`)}">
    ${benefits
      .map(
        (benefit, index) =>
          `<span><b>${String(index + 1).padStart(2, "0")}</b>${escapeHtml(benefit)}</span>`,
      )
      .join("")}
  </div>`;
}

function renderPage(state, page, totalPages, allocation) {
  const number = String(page.number).padStart(2, "0");
  const roles = allocation.roles;
  const gifs = allocation.gifs;
  const visualClass =
    roles.length >= 4
      ? "visual-grid is-four"
      : roles.length === 1
        ? "visual-grid is-one"
        : `visual-grid has-${roles.length}`;
  const special =
    page.id === "final-questions"
      ? faqBlock(page.id)
      : page.id === "configuration-size"
        ? sizeInfoBlock(page.id)
        : "";
  const motionTiles = gifs
    .map((gifId, index) => gifTile(state, gifId, page.id, index))
    .filter(Boolean);
  const motion = motionTiles.length
    ? `<div class="motion-grid${page.id === "motion-proof" ? " is-featured" : ""}" data-layer-id="${escapeHtml(`${page.id}-motions`)}">${motionTiles.join("")}</div>`
    : "";
  const headline = PUBLIC_HEADLINE_OVERRIDES[page.id] || page.headline;
  const lead = PUBLIC_LEAD_OVERRIDES[page.id] || page.sellingPoint;
  const visualContent = `<div class="${visualClass}" data-layer-id="${escapeHtml(`${page.id}-visuals`)}">
      ${roles.map((role, index) => visualTile(state, role, page.id, index)).join("")}
    </div>
    ${motion}`;
  if (page.id === "how-to-wear") {
    return `<section id="page-${number}" class="detail-page page-${escapeHtml(page.kind || "explanation")} composition-how-to-wear is-motion-only" data-section-id="${escapeHtml(page.id)}" aria-label="착용 순서">
      ${motion}
    </section>`;
  }
  if (page.id === "pain-recognition") {
    const heroRole = roles[0];
    return `<section id="page-${number}" class="detail-page page-${escapeHtml(page.kind || "information")} composition-${escapeHtml(page.id)} is-hero" data-section-id="${escapeHtml(page.id)}">
      <div class="hero-visual" aria-hidden="true">
        ${heroRole ? visualTile(state, heroRole, page.id, 0) : ""}
      </div>
      <div class="hero-shade" aria-hidden="true"></div>
      <header class="page-header hero-copy">
        <p class="page-kicker" data-layer-id="${escapeHtml(`${page.id}-eyebrow`)}" data-edit>${escapeHtml(PAGE_EYEBROWS[page.id] || "SALANG")}</p>
        <h1 data-layer-id="${escapeHtml(`${page.id}-headline`)}" data-edit>${escapeHtml(headline)}</h1>
        <p class="hero-promise" data-layer-id="${escapeHtml(`${page.id}-promise`)}" data-edit>시원하게, 조임 없이, 손등까지.</p>
        <p class="page-lead" data-layer-id="${escapeHtml(`${page.id}-selling-point`)}" data-edit>${escapeHtml(lead)}</p>
      </header>
      <div class="hero-spec" data-layer-id="${escapeHtml(`${page.id}-spec`)}">
        <strong>WHITE</strong><span>LOOSE FIT</span>
      </div>
      ${benefitBlock(page.id)}
    </section>`;
  }
  return `<section id="page-${number}" class="detail-page page-${escapeHtml(page.kind || "information")} composition-${escapeHtml(page.id)}" data-section-id="${escapeHtml(page.id)}">
    <div class="pleat-signature" aria-hidden="true"></div>
    <header class="page-header">
      <p class="page-kicker" data-layer-id="${escapeHtml(`${page.id}-eyebrow`)}" data-edit>${escapeHtml(PAGE_EYEBROWS[page.id] || "SALANG")}</p>
      <h1 data-layer-id="${escapeHtml(`${page.id}-headline`)}" data-edit>${escapeHtml(headline)}</h1>
      <p class="page-lead" data-layer-id="${escapeHtml(`${page.id}-selling-point`)}" data-edit>${escapeHtml(lead)}</p>
    </header>
    ${visualContent}
    ${special}
    ${benefitBlock(page.id)}
  </section>`;
}

function sectionRecord(page, allocation) {
  const assetIds = allocation.roles
    .map((role) => allocation.roleAssets.get(role))
    .filter(Boolean);
  const gifAssetIds = allocation.gifs
    .map((gifId) => GIF_ASSETS[gifId]?.output)
    .filter(Boolean);
  return {
    id: page.id,
    number: page.number,
    name: page.name,
    assetIds: [...new Set([...assetIds, ...gifAssetIds])],
    claimId: `claim-${page.id}`,
  };
}

function allocateUniquePublicAssets(state, pages) {
  const usedAssetIds = new Set();
  return new Map(
    pages.map((page) => {
      const roleAssets = new Map();
      const roles = pageVisualRoles(state, page).filter((role) => {
        const assetId = selectedAssetByRole(state, role)?.asset?.id;
        if (!assetId || usedAssetIds.has(assetId)) return false;
        usedAssetIds.add(assetId);
        roleAssets.set(role, assetId);
        return true;
      });
      const gifs = (Array.isArray(page.gifIds) ? page.gifIds : []).filter(
        (gifId) => {
          const outputId = GIF_ASSETS[gifId]?.output;
          const output = outputId ? selectedVersion(state, outputId) : null;
          if (
            !output ||
            output.version.approval?.decision !== "approved" ||
            usedAssetIds.has(outputId)
          ) {
            return false;
          }
          usedAssetIds.add(outputId);
          return true;
        },
      );
      return [page.id, { roles, gifs, roleAssets }];
    }),
  );
}

export function buildDetailPageReview({
  state,
  roadmap,
  generatedAt = new Date().toISOString(),
}) {
  const pages = Array.isArray(roadmap?.pages) ? roadmap.pages : [];
  if (pages.length < 8 || pages.length > 14) {
    throw new Error(
      `상세페이지 검토본은 중복 없는 8~14개 섹션이 필요합니다. 현재 ${pages.length}개입니다.`,
    );
  }
  const allocations = allocateUniquePublicAssets(state, pages);
  const sections = pages.map((page) =>
    sectionRecord(page, allocations.get(page.id)),
  );
  const specs = {
    schemaVersion: 1,
    status: "DRAFT_REVIEW",
    generatedAt,
    projectId: state.id,
    revisionId: state.currentRevisionId,
    title: roadmap.title,
    summary: roadmap.summary,
    sourceDocuments: roadmap.strategy?.sourceDocuments || [],
    strategy: roadmap.strategy || {},
    pageCount: pages.length,
    pages: pages.map((page) => ({
      number: page.number,
      id: page.id,
      name: page.name,
      single_message: page.headline,
      selling_point: page.sellingPoint,
      visual_proof: page.evidence,
      non_overlap: page.purpose,
      one_second_read: page.headline,
      claim_id: `claim-${page.id}`,
      proof_asset: page.assetRoles || [],
      voice_provenance:
        page.id === "pain-recognition" ? "SYNTHETIC_PAIN" : "none",
      preview_layout: {
        pattern: `layout-${(Number(page.number) - 1) % 4}`,
        alignment: Number(page.number) % 2 ? "left" : "center",
        density: page.kind === "proof" ? "dense" : "balanced",
        zones: ["headline", "visual-proof", "evidence", "review-note"],
      },
      gif_ids: page.gifIds || [],
      design_rule: page.designRule,
    })),
  };
  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(state.name)}</title>
    <style>
      :root {
        --ink: #182326;
        --muted: #5c6a6d;
        --cream: #edf4f3;
        --paper: #fbfcfb;
        --white: #ffffff;
        --line: rgba(24, 35, 38, .13);
        --air: #5f9298;
        --shadow: 0 24px 64px rgba(38, 64, 68, .13);
        --radius: 28px;
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; background: #dce5e5; }
      body {
        width: min(100%, 800px);
        margin: 0 auto;
        color: var(--ink);
        background: var(--paper);
        font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif;
        word-break: keep-all;
      }
      img { display: block; width: 100%; height: 100%; object-fit: cover; }
      p, h1, strong, span, figure { margin: 0; }
      .detail-page {
        position: relative;
        display: grid;
        padding: 82px 58px 72px;
        overflow: hidden;
        gap: 34px;
        isolation: isolate;
        border-bottom: 1px solid rgba(35,61,68,.12);
        background: var(--paper);
      }
      .page-emotion { background: linear-gradient(160deg, #eef4f3, #fbfcfb 56%, #e6eeee); }
      .page-proof { background: linear-gradient(180deg, #edf4f3, #ffffff 68%); }
      .page-information, .page-explanation, .page-action { background: #fbfcfb; }
      .pleat-signature {
        position: absolute;
        z-index: -1;
        top: -6%;
        right: -22%;
        width: 64%;
        height: 46%;
        opacity: .3;
        transform: rotate(-8deg);
        background: repeating-linear-gradient(90deg, transparent 0 8px, rgba(76,126,136,.12) 9px 10px, transparent 11px 19px);
        mask-image: linear-gradient(to bottom, #000, transparent);
      }
      .page-header {
        position: relative;
        z-index: 2;
        display: grid;
        max-width: 650px;
        gap: 15px;
      }
      .page-kicker {
        color: var(--air);
        font-size: 14px;
        font-weight: 900;
        letter-spacing: .11em;
      }
      h1 {
        max-width: 680px;
        font-size: clamp(46px, 7.5vw, 62px);
        line-height: 1.11;
        letter-spacing: -.05em;
      }
      .page-lead {
        max-width: 590px;
        color: var(--muted);
        font-size: 20px;
        font-weight: 620;
        line-height: 1.58;
      }
      .visual-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .visual-tile {
        position: relative;
        min-height: 0;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        border: 1px solid rgba(35,61,68,.1);
        border-radius: var(--radius);
        background: #e4ecec;
        box-shadow: var(--shadow);
      }
      .visual-grid .visual-tile:first-child {
        grid-column: 1 / -1;
        aspect-ratio: 16 / 10;
      }
      .visual-grid.is-one .visual-tile { aspect-ratio: 4 / 3; }
      .visual-grid.has-2 .visual-tile:last-child {
        grid-column: 1 / -1;
        aspect-ratio: 16 / 8;
      }
      .visual-grid.is-four .visual-tile:last-child {
        grid-column: 1 / -1;
        aspect-ratio: 16 / 7;
      }
      .visual-tile.role-pair-product img,
      .visual-tile.role-single-front-view img,
      .visual-tile.role-single-side-view img,
      .visual-tile.role-single-back-view img {
        object-fit: contain;
        padding: 26px;
        background: #f6f7f5;
      }
      .visual-tile.role-hero-product img { object-position: center 36%; }
      .visual-tile.role-wearing-scene img { object-position: center 68%; }
      .visual-tile.role-outdoor-scene img { object-position: center 43%; }
      .visual-tile.role-driving-scene img { object-position: center 46%; }
      .visual-tile figcaption, .motion-tile figcaption {
        position: absolute;
        right: 16px;
        bottom: 16px;
        left: 16px;
        display: flex;
        padding: 12px 15px;
        align-items: center;
        gap: 12px;
        border: 1px solid rgba(255,255,255,.42);
        border-radius: 14px;
        color: #fff;
        background: rgba(23,35,42,.66);
        backdrop-filter: blur(14px);
      }
      figcaption strong { font-size: 14px; }
      .motion-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .motion-tile {
        position: relative;
        overflow: hidden;
        aspect-ratio: 1 / 1;
        border-radius: var(--radius);
        background: #e5eded;
        box-shadow: var(--shadow);
      }
      .benefit-strip {
        display: grid;
        padding: 21px 24px;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: rgba(255,255,255,.82);
        backdrop-filter: blur(15px);
      }
      .benefit-strip span {
        display: grid;
        gap: 6px;
        font-size: 15px;
        font-weight: 780;
        line-height: 1.35;
      }
      .benefit-strip b { color: var(--air); font-size: 10px; letter-spacing: .12em; }
      .faq-grid { display: grid; gap: 14px; }
      .faq-grid article {
        display: grid;
        padding: 24px 26px;
        grid-template-columns: 38px 1fr;
        gap: 7px 12px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: #fff;
      }
      .faq-grid article > span {
        grid-row: span 2;
        color: var(--air);
        font-size: 24px;
        font-weight: 900;
      }
      .faq-grid strong { font-size: 18px; }
      .faq-grid p { color: var(--muted); font-size: 15px; line-height: 1.55; }
      .product-info {
        display: grid;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: #fff;
      }
      .product-info div {
        display: grid;
        padding: 20px 24px;
        grid-template-columns: 170px 1fr;
        border-bottom: 1px solid var(--line);
      }
      .product-info div:last-child { border-bottom: 0; }
      .product-info span { color: var(--muted); font-size: 14px; }
      .product-info strong { overflow-wrap: anywhere; font-size: 16px; }
      .size-info p {
        padding: 14px 24px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 700;
        text-align: right;
      }
      .is-motion-only {
        min-height: 0;
        padding: 0;
        background: #e9f1f1;
      }
      .is-motion-only .motion-grid { display: block; }
      .is-motion-only .motion-tile {
        aspect-ratio: 4 / 3;
        border-radius: 0;
        box-shadow: none;
      }
      .is-motion-only .motion-tile figcaption { display: none; }
      .is-hero {
        display: block;
        min-height: 980px;
        padding: 0;
        color: var(--ink);
        background: #eaf1f2;
      }
      .hero-visual, .hero-shade {
        position: absolute;
        inset: 0;
      }
      .hero-visual .visual-tile {
        width: 100%;
        height: 100%;
        aspect-ratio: auto;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      .hero-visual img { object-position: center 38%; }
      .hero-shade {
        z-index: 1;
        background:
          linear-gradient(90deg, rgba(244,249,249,.98) 0%, rgba(244,249,249,.91) 38%, rgba(244,249,249,.15) 68%, transparent 82%),
          linear-gradient(0deg, rgba(17,32,36,.58) 0%, transparent 31%);
      }
      .hero-copy {
        position: relative;
        z-index: 2;
        width: min(62%, 480px);
        padding: 70px 0 0 54px;
      }
      .hero-copy h1 {
        max-width: 430px;
        font-size: 66px;
        line-height: 1.04;
      }
      .hero-promise {
        max-width: 410px;
        color: #315e65;
        font-size: 27px;
        font-weight: 900;
        line-height: 1.28;
        letter-spacing: -.035em;
      }
      .hero-copy .page-lead {
        max-width: 390px;
        color: #4f6063;
        font-size: 17px;
      }
      .hero-spec {
        position: absolute;
        z-index: 2;
        right: 46px;
        bottom: 126px;
        display: flex;
        padding: 12px 16px;
        align-items: center;
        gap: 10px;
        border: 1px solid rgba(255,255,255,.5);
        border-radius: 999px;
        color: #fff;
        background: rgba(20,34,38,.68);
        backdrop-filter: blur(12px);
      }
      .hero-spec strong { font-size: 13px; letter-spacing: .12em; }
      .hero-spec span { font-size: 14px; font-weight: 700; }
      .is-hero .benefit-strip {
        position: absolute;
        z-index: 2;
        right: 38px;
        bottom: 34px;
        left: 38px;
      }
      .composition-product-answer .visual-tile:first-child,
      .composition-configuration-size .visual-tile:first-child {
        aspect-ratio: 16 / 11;
      }
      .composition-loosefit-proof .visual-tile:first-child,
      .composition-white-style .visual-tile:first-child,
      .composition-everyday-use .visual-tile:first-child {
        aspect-ratio: 4 / 5;
      }
      .composition-handback-coverage .visual-tile:first-child,
      .composition-how-to-wear .visual-tile:first-child,
      .composition-driving-use .visual-tile:first-child {
        aspect-ratio: 4 / 3;
      }
      .composition-construction-details .visual-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .composition-construction-details .visual-tile,
      .composition-construction-details .visual-tile:first-child,
      .composition-construction-details .visual-tile:last-child {
        grid-column: auto;
        aspect-ratio: 1 / 1;
      }
      .composition-decision-recap {
        padding-bottom: 82px;
        background: linear-gradient(155deg, #e8f1f1, #ffffff 56%, #dce9e9);
      }
      [data-studio-selected="true"] { outline: 4px solid #176bff !important; outline-offset: 6px; }
      @media (max-width: 640px) {
        .detail-page { padding: 56px 24px 50px; gap: 26px; }
        h1 { font-size: clamp(38px, 11vw, 52px); }
        .page-lead { font-size: 17px; }
        .visual-grid,
        .composition-construction-details .visual-grid,
        .motion-grid {
          grid-template-columns: 1fr;
        }
        .visual-grid .visual-tile,
        .visual-grid .visual-tile:first-child,
        .visual-grid .visual-tile:last-child,
        .composition-construction-details .visual-tile,
        .composition-construction-details .visual-tile:first-child,
        .composition-construction-details .visual-tile:last-child {
          grid-column: auto;
          aspect-ratio: 4 / 3;
        }
        .visual-tile.role-pair-product {
          aspect-ratio: 4 / 5 !important;
        }
        .benefit-strip {
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .benefit-strip span {
          grid-template-columns: 28px 1fr;
          align-items: center;
        }
        .product-info div { grid-template-columns: 118px 1fr; }
        .is-hero { min-height: 900px; padding: 0; }
        .hero-visual img { object-position: 56% 36%; }
        .hero-shade {
          background:
            linear-gradient(180deg, rgba(244,249,249,.98) 0%, rgba(244,249,249,.72) 40%, transparent 68%),
            linear-gradient(0deg, rgba(17,32,36,.72) 0%, transparent 37%);
        }
        .hero-copy {
          width: auto;
          padding: 46px 24px 0;
        }
        .hero-copy h1 { max-width: 360px; font-size: 50px; }
        .hero-promise { max-width: 330px; font-size: 24px; }
        .hero-copy .page-lead { max-width: 350px; font-size: 16px; }
        .hero-spec { right: 24px; bottom: 180px; }
        .is-hero .benefit-strip { right: 18px; bottom: 18px; left: 18px; }
      }
      @media print {
        .detail-page { width: 800px; break-after: page; }
      }
    </style>
  </head>
  <body>
    <main>
      ${pages.map((page) => renderPage(state, page, pages.length, allocations.get(page.id))).join("\n")}
    </main>
  </body>
</html>
`;
  const violations = publicOutputViolations(html);
  if (violations.length) {
    throw new Error(
      `고객 화면에 제작자용 메타데이터가 남아 있습니다: ${violations.join(", ")}`,
    );
  }
  return { html, specs, sections };
}
