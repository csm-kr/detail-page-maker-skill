// G9 조립기. **플랜만 보고** HTML 을 만든다.
//
// 옛 build-page.mjs 는 한 상품 전용이었다. 문구·색·섹션이 코드에 박혀 있어서 다음 상품에
// 쓸 수 없었고, 그래서 옮기지 않고 새로 썼다. 이 파일에는 화면에 나갈 한글이 하나도 없다.
//
// 세 가지가 구조로 강제된다.
//   1. 화면 문자열은 전부 `say()` 를 지나간다. 플랜에 없는 한글은 **조립 시점에** 터진다.
//      게이트까지 미루면 무엇을 고쳐야 하는지가 흐려진다.
//   2. 색은 `:root` 의 커스텀 속성만 쓴다. 가이드의 무드 배경도 예외가 아니다 —
//      선택자에 hex 를 박으면 다음 사람이 색을 어디서 바꿔야 하는지 모른다.
//   3. 가이드 구성 요소 여섯 종은 섹션이 비어도 자리를 남긴다. 클래스가 사라지면
//      "팔레트만 옮기고 끝낸" 상태와 구별되지 않는다.

/** 플랜에 없는 문자열을 넣으려 할 때. */
export class PlanTextError extends Error {
  constructor(value) {
    super(`PLAN_TEXT_MISSING 플랜에 없는 문자열이다: ${String(value).slice(0, 60)}`);
    this.name = "PlanTextError";
  }
}

const HANGUL = /[가-힣]/;

/**
 * 화면에 나갈 값을 통과시킨다. 한글이 있으면 플랜 원문에 그대로 있어야 한다.
 * 한글이 없는 값(아이디·URL·숫자)은 그냥 지나간다.
 */
export function say(blob, value) {
  const text = String(value ?? "");
  if (HANGUL.test(text) && !blob.includes(text)) throw new PlanTextError(text);
  return text;
}

const esc = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 커스텀 속성 이름으로 쓸 수 있게 다듬는다. */
const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9-]/g, "-");

/** :root 블록. 플랜의 토큰과 무드 배경이 전부 여기로 모인다. */
function rootBlock(plan) {
  const lines = [];
  for (const [name, hex] of Object.entries(plan.tokens ?? {})) {
    lines.push(`    --${slug(name)}: ${hex};`);
  }
  (plan.mood?.background ?? []).forEach((hex, index) => {
    lines.push(`    --bg-${index + 1}: ${hex};`);
  });
  // 배경이 하나도 없으면 표면 색이 없다. 토큰에서 끌어오되 없으면 흰색 대신
  // 첫 토큰을 쓴다 — 여기서 새 hex 를 만들지 않는다.
  if (!(plan.mood?.background ?? []).length) {
    const first = Object.values(plan.tokens ?? {})[0];
    if (first) lines.push(`    --bg-1: ${first};`);
  }
  return lines.join("\n");
}

const STYLE = `
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg-1); }
    .page { max-width: 780px; width: 780px; margin: 0 auto; font-family: "Noto Sans KR", sans-serif; color: var(--ink, var(--bg-1)); }
    .sec { padding: 32px 24px; }
    .infocard { border: 1px solid var(--line, var(--bg-1)); border-radius: 16px; padding: 24px; background: var(--bg-2, var(--bg-1)); }
    .chip { display: inline-block; font-size: 12px; letter-spacing: .04em; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--brand, var(--line)); color: var(--brand, var(--ink)); }
    .head { font-size: 30px; line-height: 1.35; margin: 14px 0 12px; font-weight: 800; }
    .body { font-size: 16px; line-height: 1.75; margin: 0 0 10px; }
    .callout { border-left: 4px solid var(--brand, var(--line)); padding: 12px 16px; margin: 16px 0; background: var(--bg-1); border-radius: 0 10px 10px 0; }
    .callout p { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.6; }
    .spec { list-style: none; margin: 16px 0 0; padding: 0; }
    .spec li { display: flex; gap: 12px; padding: 9px 0; border-top: 1px solid var(--line, var(--bg-1)); font-size: 15px; }
    .dim { opacity: .6; }
    .rule { display: block; margin: 0 auto; }
    .shot, .motion { display: block; width: 780px; height: auto; margin: 16px 0 0; border-radius: 12px; }
    .trace { padding: 24px; font-size: 12px; line-height: 1.8; word-break: break-all; }
`.trim();

/** 섹션 사이 구분선. 인라인 SVG 는 이미지 없이도 형태를 주는 유일한 수단이다. */
const RULE = `<svg class="rule" width="120" height="8" viewBox="0 0 120 8" aria-hidden="true"><path d="M0 4 H120" stroke="currentColor" stroke-width="1" opacity=".35"/></svg>`;

/**
 * 스틸 목록. `still_jobs` 가 정본이고 없으면 `cuts` 를 쓴다.
 * 컷과 스틸은 같은 것이므로 id 도 같아야 한다 — G6 이 컷 id 로 발행한다.
 */
export function stillsOf(plan) {
  return plan.still_jobs?.length ? plan.still_jobs : (plan.cuts ?? []);
}

function mediaFor(plan, section, imageExt) {
  const parts = [];
  for (const job of stillsOf(plan)) {
    if (job.section_id !== section.id) continue;
    parts.push(
      `<img class="shot" src="output/media/images/${esc(job.id)}${imageExt}" width="780" alt="">`,
    );
  }
  for (const brief of plan.gif_briefs ?? []) {
    if (brief.section_id !== section.id) continue;
    parts.push(
      `<img class="motion" src="output/media/gifs/${esc(brief.id)}.gif" width="780" alt="">`,
    );
  }
  return parts.join("\n        ");
}

function sectionHtml(plan, section, blob, imageExt) {
  const line = (value) => esc(say(blob, value));
  const head = (section.headline_lines ?? []).map(line).join("<br>");
  const body = (section.body_chunks ?? [])
    .map((chunk) => `<p class="body">${line(chunk)}</p>`)
    .join("\n        ");
  const emphasis = (section.emphasis_chunks ?? [])
    .map((chunk) => `<p>${line(chunk)}</p>`)
    .join("\n          ");
  const specs = (section.specs ?? [])
    .map(
      (row) =>
        `<li><span class="dim">${line(row.label)}</span><span>${line(row.value)}</span></li>`,
    )
    .join("\n          ");

  // 비어도 자리는 남긴다. 클래스가 사라지면 게이트가 구별하지 못한다.
  return `      <section class="sec" id="s-${esc(slug(section.id))}">
        <div class="infocard">
          <span class="chip">${esc(section.id)}</span>
          <h2 class="head">${head}</h2>
          ${body}
          <div class="callout">
          ${emphasis}
          </div>
          <ul class="spec">
          ${specs}
          </ul>
        </div>
        ${mediaFor(plan, section, imageExt)}
      </section>`;
}

/**
 * 플랜을 HTML 로. 폭은 플랜의 `output.width_px` 가 아니라 780 고정이다 —
 * 계약이 780 이고 QA 도 780 을 본다.
 */
export function renderHtml(plan, { imageExt = ".webp" } = {}) {
  const blob = JSON.stringify(plan);
  const sections = (plan.sections ?? []).map((section) =>
    sectionHtml(plan, section, blob, imageExt),
  );

  const sources = [plan.inputs?.supplier_url, plan.inputs?.coupang_url].filter(Boolean);
  const trace = `      <footer class="trace">
        <span class="dim">${esc(plan.contract_id ?? "lean-page-plan-v1")}</span>
        ${sources.map((url) => `<div class="dim">${esc(url)}</div>`).join("\n        ")}
      </footer>`;

  return `<meta charset="utf-8">
<meta name="viewport" content="width=780">
<style>
  :root {
${rootBlock(plan)}
  }
  ${STYLE}
</style>
<div class="page">
${sections.join(`\n      ${RULE}\n`)}
      ${RULE}
${trace}
</div>
`;
}

/** HTML 이 참조한 미디어 상대 경로. 앵커 해시를 남길 대상이다. */
export function referencedMedia(html) {
  return [...html.matchAll(/src="(output\/media\/[^"]+)"/g)].map((match) => match[1]);
}
