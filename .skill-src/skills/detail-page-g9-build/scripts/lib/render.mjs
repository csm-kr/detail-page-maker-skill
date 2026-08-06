// G9 조립기. **플랜만 보고** HTML 을 만든다.
//
// 이 파일에는 화면에 나갈 한글이 하나도 없다. 상품 이름도, 문구도, 색도 없다.
//
// 네 가지가 구조로 강제된다.
//   1. 화면 문자열은 전부 `say()` 를 지나간다. 플랜에 없는 한글은 **조립 시점에** 터진다.
//   2. 색은 `:root` 의 커스텀 속성만 쓴다. 선택자에 hex 를 박지 않는다.
//   3. 레이아웃은 `section.role` 이 고른다. 모든 섹션을 같은 흰 박스로 찍지 않는다 —
//      1회차가 그렇게 해서 기준작 하한을 세 항목이나 못 넘겼다.
//   4. 한계 고지는 푸터 한 줄뿐이다. 섹션마다 각주를 달지 않는다.
//
// 레이아웃 사전은 `references/benchmark/v4-reference.html` 의 구조를 옮긴 것이다.

import { ROLES } from "../../../detail-page-orchestrator/scripts/lib/story.mjs";

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

/**
 * :root 블록. 플랜의 토큰과 무드 배경이 전부 여기로 모인다.
 * 뒤이어 `--c-*` 별칭을 둔다. 토큰 이름이 상품마다 달라도 레이아웃 CSS 는 별칭만 쓰므로
 * 스타일시트에 hex 가 새지 않는다.
 */
function rootBlock(plan) {
  const lines = [];
  for (const [name, hex] of Object.entries(plan.tokens ?? {})) {
    lines.push(`    --${slug(name)}: ${hex};`);
  }
  (plan.mood?.background ?? []).forEach((hex, index) => {
    lines.push(`    --bg-${index + 1}: ${hex};`);
  });
  if (!(plan.mood?.background ?? []).length) {
    const first = Object.values(plan.tokens ?? {})[0];
    if (first) lines.push(`    --bg-1: ${first};`);
  }
  lines.push(
    "    --c-ink: var(--ink, var(--deep, var(--bg-1)));",
    "    --c-paper: var(--paper, var(--bg-1));",
    "    --c-brand: var(--brand, var(--accent, var(--bg-1)));",
    "    --c-deep: var(--deep, var(--ink, var(--bg-1)));",
    "    --c-tint: var(--tint, var(--bg-2, var(--bg-1)));",
    "    --c-line: var(--line, var(--tint, var(--bg-1)));",
  );
  return lines.join("\n");
}

/**
 * 상업 레이아웃. `references/benchmark/v4-reference.html` 에서 옮겼고 색만 토큰으로 바꿨다.
 *
 * ## 타입 사다리
 *
 * 2회차 조립기는 `.headline` **하나로** 히어로도 규격표도 주의사항도 찍었다.
 * 서로 다른 크기가 10가지뿐이었고 (`typeScale 10`, 기준작은 21), 그래서
 * "쿠팡과 비교해 상업적이지 않다" 는 말을 들었다. 크기가 한 단이면 위계가 없다.
 *
 * 아래 사다리는 v4 의 실측을 옮긴 것이다. **역할마다 다른 단**을 쓴다.
 *
 *   116  .figure .big        v4 `.quantity .big` — 페이지에서 가장 큰 글자는 대개 숫자다
 *    88  .hero .headline     히어로·마감. v4 66, 쿠팡 윙 347
 *    66  .headline           장점 기본
 *    58  .pain .headline
 *    45  .compare .headline
 *    44  .spec-wrap .headline
 *    42  .figure .unit       v4 `.size-summary strong`
 *    38  .caution .headline
 *    36  .stat strong        v4 `.stat strong` 28 → cta 와 겹치지 않게 올렸다
 *    34  .steps b            v4 `.step .num`
 *    30  .overlay-bottom .dim
 *    28  .cta                v4 `.close .cta`
 *    27  .dim                v4 `.sub`
 *    26  .two-up figcaption  v4 `.two-up .tag` 24
 *    25  .callout
 *    24  .steps li
 *    22  .chip               v4 `.eyebrow`
 *    21  .spec 값
 *    20  .body               v4 `.spec-row dt,dd`
 *    19  .spec 라벨
 *    18  .caution li
 *    17  .stat span          v4 `.stat span`
 *    15  footer              v4 `footer`
 *
 * 여기 숫자를 낮추거나 단을 합치면 `lib/benchmark.mjs` 의 하한에 걸린다.
 * 그게 이 값들이 있는 이유다.
 */
const STYLE = `
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--c-paper); }
    .page { width: 780px; max-width: 780px; margin: 0 auto; word-break: keep-all;
            font-family: "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
            color: var(--c-ink); }
    section { position: relative; margin: 0; text-align: center; overflow: hidden; }
    img { display: block; width: 100%; height: auto; }
    h2, p, ul, ol { margin: 0; }

    .visual { position: relative; height: 780px; }
    .visual.tall { height: 1040px; }
    .visual.medium { height: 700px; }
    .visual > img { width: 100%; height: 100%; object-fit: cover; }
    .visual::after { content: ""; position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,.68) 0%, rgba(0,0,0,.05) 34%,
                  rgba(0,0,0,.2) 70%, rgba(0,0,0,.8) 100%); }
    .hero .visual { height: 1120px; }
    .closing .visual { height: 980px; }
    .closing .visual > img { width: 100%; height: 100%; object-fit: cover; }
    .overlay-top { position: absolute; z-index: 2; left: 44px; right: 44px; top: 54px;
                   color: var(--c-paper); }
    .overlay-bottom { position: absolute; z-index: 2; left: 44px; right: 44px; bottom: 54px;
                      color: var(--c-paper); }

    .chip { display: inline-flex; align-items: center; justify-content: center; min-height: 44px;
            padding: 8px 20px; border-radius: 999px; background: var(--c-brand);
            color: var(--c-paper); font-size: 22px; font-weight: 900; letter-spacing: -.04em; }
    .headline { font-size: 66px; line-height: 1.1; letter-spacing: -.06em; font-weight: 900;
                margin-top: 18px; }
    .hero .headline { font-size: 88px; letter-spacing: -.07em; }
    .closing .headline { font-size: 88px; letter-spacing: -.07em; }
    .pain .headline { font-size: 58px; }
    .compare .headline { font-size: 45px; }
    .dim { font-size: 27px; line-height: 1.48; font-weight: 700; margin-top: 18px; }
    .overlay-bottom .dim { font-size: 30px; }
    .body { font-size: 20px; line-height: 1.7; margin-top: 16px; }
    .callout { display: inline-block; margin-bottom: 18px; padding: 8px 18px;
               background: var(--c-brand); color: var(--c-paper); font-size: 25px;
               font-weight: 900; transform: rotate(-1.5deg); }

    .copy { padding: 72px 44px; background: var(--c-paper); }
    .copy.dark { background: var(--c-deep); color: var(--c-paper); }
    .copy.tint { background: var(--c-tint); }
    .copy.brand { background: var(--c-brand); color: var(--c-paper); }

    .motion { background: var(--c-deep); }
    .motion img { width: 100%; min-height: 560px; object-fit: cover; }
    .motion.lead img { min-height: 860px; }

    .two-up { display: grid; grid-template-columns: 1fr 1fr; background: var(--c-deep); }
    .two-up figure { position: relative; margin: 0; min-height: 620px; }
    .two-up img { width: 100%; height: 620px; object-fit: cover; }
    .two-up figcaption { position: absolute; left: 18px; right: 18px; bottom: 20px;
                         padding: 13px 10px; border-radius: 12px; background: var(--c-deep);
                         color: var(--c-paper); font-size: 26px; font-weight: 900; }

    .figure { display: flex; align-items: center; justify-content: center; gap: 26px;
              min-height: 340px; padding: 38px 28px 58px; background: var(--c-brand);
              color: var(--c-paper); }
    .figure .big { font-size: 116px; line-height: .9; font-weight: 900; letter-spacing: -.08em; }
    .figure .unit { text-align: left; font-size: 42px; line-height: 1.24; font-weight: 900; }

    .stat-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
                  background: var(--c-line); }
    .stat { padding: 30px 8px; background: var(--c-deep); color: var(--c-paper);
            text-align: center; }
    .stat strong { display: block; color: var(--c-brand); font-size: 36px; line-height: 1.2; }
    .stat span { display: block; margin-top: 8px; font-size: 17px; font-weight: 700; }

    .infocard { min-height: 420px; padding: 44px 44px 64px; background: var(--c-paper); }
    .steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px;
             list-style: none; padding: 0; }
    .steps li { font-size: 24px; line-height: 1.3; font-weight: 800; }
    .steps b { display: grid; width: 76px; height: 76px; margin: 0 auto 16px; place-items: center;
               border-radius: 50%; background: var(--c-deep); color: var(--c-brand);
               font-size: 34px; }

    .spec-wrap { min-height: 560px; padding: 70px 44px 76px; background: var(--c-tint); }
    .spec-wrap .headline { font-size: 44px; }
    .spec { list-style: none; margin-top: 38px; padding: 0; text-align: left;
            border-top: 4px solid var(--c-ink); }
    .spec li { display: grid; grid-template-columns: 190px 1fr; border-bottom: 1px solid var(--c-line); }
    .spec li span { padding: 22px 18px; font-size: 21px; line-height: 1.45; }
    .spec li span:first-child { background: var(--c-line); font-size: 19px; font-weight: 900; }

    .caution { padding: 54px 44px; background: var(--c-deep); color: var(--c-paper);
               text-align: left; }
    .caution .headline { font-size: 38px; }
    .caution ul { max-width: 650px; margin: 26px auto 0; padding-left: 25px; }
    .caution li { margin: 12px 0; font-size: 18px; line-height: 1.6; font-weight: 650; }

    .cta { display: inline-block; margin-top: 22px; padding: 18px 38px; border-radius: 999px;
           background: var(--c-brand); color: var(--c-paper); font-size: 28px; font-weight: 900; }
    .rule { display: block; margin: 0 auto; }
    footer { padding: 34px 30px; background: var(--c-deep); color: var(--c-paper);
             text-align: center; font-size: 15px; line-height: 1.6; }
`.trim();

/**
 * 화면 문자열의 이름. **플랜이 쓰는 이름 그대로** 읽는다.
 * 1회차에 조립기는 `headline_lines`, 판정기는 `headline` 을 봤다. 둘이 갈려 있어서
 * 조립기를 쓰지 못하고 사람이 HTML 을 손으로 만들었고, 판정기는 그것을 통과시켰다.
 */
function headline(section, line) {
  return String(section.headline ?? "")
    .split(/<br\s*\/?>/i)
    .filter(Boolean)
    .map(line)
    .join("<br>");
}

/** 규격표. `specs: [{label,value}]` 와 `table: [[label,value]]` 를 함께 받는다. */
function specRows(section) {
  if (Array.isArray(section.specs)) return section.specs.map((row) => [row.label, row.value]);
  return (section.table ?? []).map((row) => (Array.isArray(row) ? row : [row.label, row.value]));
}

/** 섹션 사이 구분선. 인라인 SVG 는 이미지 없이도 형태를 주는 유일한 수단이다. */
const RULE = `<svg class="rule" width="120" height="8" viewBox="0 0 120 8" aria-hidden="true"><path d="M0 4 H120" stroke="currentColor" stroke-width="1" opacity=".35"/></svg>`;

/**
 * 스틸 목록. `still_jobs` 가 정본이고 없으면 `cuts` 를 쓴다.
 * 컷과 스틸은 같은 것이므로 id 도 같아야 한다 — G6 이 컷 id 로 발행한다.
 */
export function stillsOf(plan) {
  return plan.still_jobs?.length ? plan.still_jobs : (plan.cuts ?? []);
}

/**
 * 컷·brief 가 어느 섹션인지. 플랜은 `section` 을 쓴다.
 * `accepted` 는 G6 가 실제로 발행한 컷이다. 이것이 없으면 **탈락한 컷까지 페이지에 실려**
 * G10 이 전부 ASSET_MISSING 으로 본다 — 플랜은 선별 결과를 모르기 때문이다.
 */
const stillsFor = (plan, id, accepted) =>
  stillsOf(plan)
    .filter((job) => job.section === id)
    .filter((job) => !accepted || accepted.has(job.id));
const gifsFor = (plan, id) => (plan.gif_briefs ?? []).filter((brief) => brief.section === id);

/** 경로는 HTML 이 있는 `output/` 기준이다. 앵커만 프로젝트 기준으로 되돌린다. */
const shot = (job, ext) => `media/images/${esc(job.id)}${ext}`;
const gif = (brief) => `media/gifs/${esc(brief.id)}.gif`;

/** 장점 섹션의 배경을 돌린다. 같은 색이 이어지면 스크롤이 한 덩어리로 보인다. */
const TONE = ["dark", "tint", "brand"];

function copyBlock(section, line, tone) {
  const badge = section.emphasis ? `<p class="callout">${line(section.emphasis)}</p>` : "";
  const body = section.body ? `<p class="body">${line(section.body)}</p>` : "";
  const head = headline(section, line);
  return `<div class="copy${tone ? ` ${tone}` : ""}">
          ${section.kicker ? `<span class="chip">${line(section.kicker)}</span>` : `<span class="chip">${esc(section.id)}</span>`}
          ${badge}
          <h2 class="headline">${head}</h2>
          ${section.subcopy ? `<p class="dim">${line(section.subcopy)}</p>` : ""}
          ${body}
        </div>`;
}

/**
 * 대형 숫자. 기준작 v4 의 `.quantity` 다 — 노란 판 위에 116px 숫자와 42px 단위.
 * 페이지에서 가장 큰 글자는 대개 제목이 아니라 숫자다. 수량·규격·기간에 쓴다.
 */
function figureBlock(section, line) {
  const item = section.figure;
  if (!item?.value) return "";
  return `<div class="figure">
          <div class="big">${line(item.value)}</div>
          ${item.unit ? `<div class="unit">${line(item.unit)}</div>` : ""}
        </div>`;
}

/** 숫자 스트립 3칸. 기준작 v4 의 `.stat-strip`. 근거 있는 수치만 넣는다. */
function statStrip(section, line) {
  const stats = section.stats ?? [];
  if (stats.length === 0) return "";
  const cells = stats.map(
    (stat) => `<div class="stat"><strong>${line(stat.value)}</strong><span>${line(stat.label)}</span></div>`,
  );
  return `<div class="stat-strip">
          ${cells.join("\n          ")}
        </div>`;
}

function overlayVisual(section, line, still, ext, { cta = false, medium = false } = {}) {
  const head = headline(section, line);
  const image = still ? `<img src="${shot(still, ext)}" alt="">` : "";
  return `<div class="visual${medium ? " medium" : ""}">
          ${image}
          <div class="overlay-top">
            ${section.kicker ? `<span class="chip">${line(section.kicker)}</span>` : `<span class="chip">${esc(section.id)}</span>`}
          </div>
          <div class="overlay-bottom">
            <h2 class="headline">${head}</h2>
            ${section.subcopy ? `<p class="dim">${line(section.subcopy)}</p>` : ""}
            ${cta && section.cta ? `<span class="cta">${line(section.cta)}</span>` : ""}
          </div>
        </div>`;
}

/**
 * 섹션의 시각 자산을 꽉 채워 놓는다. GIF 가 있으면 GIF, 없으면 스틸이다.
 * `skipFirstStill` 은 히어로·마감처럼 첫 스틸을 이미 배경으로 쓴 경우다 — 같은 컷을
 * 두 번 싣지 않는다.
 */
function mediaBlocks(plan, section, ext, accepted, { skipFirstStill = false } = {}) {
  // 스틸을 먼저, GIF 를 나중에. 둘 중 하나만 쓰면 발행한 스틸이 페이지에 안 실려
  // G10 이 ORPHAN_MEDIA 로 본다 — 굽고 버린 것이다.
  const sources = [
    ...stillsFor(plan, section.id, accepted)
      .slice(skipFirstStill ? 1 : 0)
      .map((still) => shot(still, ext)),
    ...gifsFor(plan, section.id).map((brief) => gif(brief)),
  ];
  // 첫 미디어는 크게 (`lead`). 같은 크기로 이어 붙이면 스크롤이 한 덩어리로 보인다.
  return sources
    .map(
      (src, index) =>
        `<div class="motion${index === 0 ? " lead" : ""}"><img src="${src}" alt=""></div>`,
    )
    .join("\n        ");
}

function twoUp(plan, section, line, ext, accepted) {
  const stills = stillsFor(plan, section.id, accepted).slice(0, 2);
  if (stills.length < 2) return "";
  const captions = section.captions ?? [];
  const cells = stills.map(
    (still, index) => `<figure>
            <img src="${shot(still, ext)}" alt="">
            ${captions[index] ? `<figcaption>${line(captions[index])}</figcaption>` : ""}
          </figure>`,
  );
  return `<div class="two-up">
          ${cells.join("\n          ")}
        </div>`;
}

function specBlock(section, line) {
  const rows = specRows(section)
    .map(([label, value]) => `<li><span>${line(label)}</span><span>${line(value)}</span></li>`)
    .join("\n            ");
  const head = headline(section, line);
  return `<div class="spec-wrap">
          ${section.kicker ? `<span class="chip">${line(section.kicker)}</span>` : `<span class="chip">${esc(section.id)}</span>`}
          <h2 class="headline">${head}</h2>
          <ul class="spec">
            ${rows}
          </ul>
        </div>`;
}

function stepsBlock(section, line) {
  const items = (section.steps ?? []).map(
    (step, index) =>
      `<li><b>${index + 1}</b>${line(typeof step === "string" ? step : step.title)}</li>`,
  );
  if (items.length === 0) return "";
  return `<div class="infocard">
          <ol class="steps">
            ${items.join("\n            ")}
          </ol>
        </div>`;
}

function cautionBlock(section, line) {
  const items = (section.cautions ?? []).map((item) => `<li>${line(item)}</li>`);
  const head = headline(section, line);
  return `<div class="caution">
          <h2 class="headline">${head}</h2>
          <ul>
            ${items.join("\n            ")}
          </ul>
        </div>`;
}

/** role 마다 다른 레이아웃. 없는 role 은 카피 + 미디어의 기본형으로 낸다. */
function sectionHtml(plan, section, blob, ext, toneIndex, accepted) {
  const line = (value) => esc(say(blob, value));
  const stills = stillsFor(plan, section.id, accepted);
  const parts = [];

  switch (section.role) {
    case "hero":
      parts.push(overlayVisual(section, line, stills[0], ext));
      parts.push(statStrip(section, line));
      parts.push(mediaBlocks(plan, section, ext, accepted, { skipFirstStill: true }));
      break;
    case "closing":
      parts.push(overlayVisual(section, line, stills[0], ext, { cta: true }));
      break;
    case "pain":
      parts.push(copyBlock(section, line, "dark"));
      parts.push(mediaBlocks(plan, section, ext, accepted));
      break;
    case "compare":
      parts.push(twoUp(plan, section, line, ext, accepted));
      parts.push(copyBlock(section, line, "brand"));
      break;
    case "usage":
      parts.push(copyBlock(section, line, "tint"));
      parts.push(mediaBlocks(plan, section, ext, accepted));
      parts.push(stepsBlock(section, line));
      break;
    case "spec":
      parts.push(specBlock(section, line));
      parts.push(figureBlock(section, line));
      break;
    case "caution":
      parts.push(cautionBlock(section, line));
      break;
    default:
      // solution 과 role 이 없는 섹션. 배경을 돌려 가며 카피 → 강조 장치 → 미디어.
      parts.push(copyBlock(section, line, TONE[toneIndex % TONE.length]));
      parts.push(figureBlock(section, line));
      parts.push(statStrip(section, line));
      parts.push(mediaBlocks(plan, section, ext, accepted));
  }

  // role 을 클래스로 내보낸다. 역할별 타입 사다리(`.hero .headline` 88 · `.pain .headline` 58)
  // 가 이 클래스로 걸린다. 2회차에는 이것이 없어 모든 제목이 한 크기였다.
  const role = ROLES.includes(section.role) ? section.role : "solution";
  return `      <section id="s-${esc(slug(section.id))}" class="${role}">
        ${parts.filter(Boolean).join("\n        ")}
      </section>`;
}

/**
 * 플랜을 HTML 로. 폭은 780 고정이다 — 계약이 780 이고 QA 도 780 을 본다.
 * 푸터에는 `plan.footer_notice` 한 줄만 넣는다. 내부 식별자와 공급처 URL 은 고객 화면에
 * 나가지 않는다 (1회차에 `contract_id` 와 공급처 주소가 그대로 실렸다).
 */
export function renderHtml(plan, { imageExt = ".webp", accepted = null } = {}) {
  const blob = JSON.stringify(plan);
  let tone = 0;
  const sections = (plan.sections ?? []).map((section) => {
    const html = sectionHtml(plan, section, blob, imageExt, tone, accepted);
    if (!section.role || section.role === "solution") tone += 1;
    return html;
  });

  const notice = plan.footer_notice ? esc(say(blob, plan.footer_notice)) : "";

  return `<meta charset="utf-8">
<meta name="viewport" content="width=780">
<style>
  :root {
${rootBlock(plan)}
  }
  ${STYLE}
</style>
<div class="page">
${sections.join("\n")}
      ${RULE}
</div>
<footer>${notice}</footer>
`;
}

/** HTML 이 참조한 미디어. 앵커는 프로젝트 기준 경로로 남긴다. */
export function referencedMedia(html) {
  return [...html.matchAll(/src="(media\/[^"]+)"/g)].map((match) => `output/${match[1]}`);
}
