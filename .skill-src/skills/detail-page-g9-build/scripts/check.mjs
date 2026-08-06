// G9 판정. 화면 문자열이 플랜 밖에 있는 것과 앵커 좌표가 조용히 깨지는 구조를 잡는다.

import path from "node:path";

import {
  hexes,
  json,
  koreanRuns,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { hashFile } from "../../detail-page-orchestrator/scripts/lib/hashchain.mjs";
import { measure, shortfalls } from "../../detail-page-orchestrator/scripts/lib/benchmark.mjs";
import { producerLanguage } from "../../detail-page-orchestrator/scripts/lib/copy.mjs";

/**
 * DESIGN-GUIDE 의 구성 요소가 HTML 에 실제로 있는지 볼 최소 클래스 집합.
 * `trace` 는 뺐다 — 섹션마다 출처 각주를 다는 구조가 1회차에 제작자 언어를 화면으로 실어 냈다.
 * 고지는 푸터 한 줄로 모은다.
 * `infocard` 도 뺐다 — 단계 카드가 없는 상품이 있다. 남은 넷은 모든 상품에 있어야 한다:
 * 표지(chip) · 강조 배지(callout) · 부제(dim) · 규격표(spec).
 */
const COMPONENTS = ["chip", "callout", "dim", "spec"];

export async function check({ project }) {
  const reasons = [];
  const html = await text(project, path.join("output", "detail-page.html"));
  const plan = await json(project, "flow-plan.json");
  const anchors = await json(project, path.join("work", "anchors.json"));

  if (!html) {
    reasons.push("output/detail-page.html 이 없다");
    return { reasons };
  }
  if (!plan) {
    reasons.push("flow-plan.json 을 읽을 수 없다");
    return { reasons };
  }

  // 1. 화면에 보이는 한글이 전부 플랜에서 왔는가. 빌더에 박힌 문자열을 이렇게 잡는다.
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "\n");
  const planBlob = JSON.stringify(plan);
  const stray = koreanRuns(visible, 3).filter((run) => !planBlob.includes(run));
  want(
    reasons,
    stray.length === 0,
    `HTML 에 플랜 밖의 문자열이 ${stray.length}건 있다: ${stray.slice(0, 5).join(" · ")}`,
  );

  // 1b. 반대 방향. 플랜의 화면 문자열이 HTML 에 **실제로 들어갔는가.**
  // 위의 검사만 있으면 빈 페이지가 통과한다 — 플랜 밖 문자열이 0건이기 때문이다.
  const flat = visible.replace(/\s+/g, "");
  const emptied = (plan.sections ?? [])
    .filter((s) => typeof s.headline === "string" && s.headline.trim() !== "")
    .filter((s) => !flat.includes(s.headline.replace(/<br\s*\/?>/gi, "").replace(/\s+/g, "")))
    .map((s) => s.id);
  want(
    reasons,
    emptied.length === 0,
    `플랜의 헤드라인이 HTML 에 없다: ${emptied.join(", ")}`,
  );

  // 2. 폭과 가로 스크롤의 전제.
  want(reasons, /width:\s*780px|max-width:\s*780px/.test(html), "폭 780px 선언이 없다");
  want(
    reasons,
    !/\[\[|TODO|자리표시|placeholder/i.test(html),
    "자리표시자가 남아 있다",
  );

  // 3. 색은 :root 에서만. 선택자 안에 hex 를 흘리면 다음 사람이 못 찾는다.
  const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(html)?.[1] ?? "";
  const rootHexes = new Set(hexes(rootBlock));
  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const outside = hexes(styleBlocks.replace(/:root\s*\{[\s\S]*?\}/g, "")).filter(
    (hex) => !rootHexes.has(hex),
  );
  want(
    reasons,
    outside.length === 0,
    `:root 밖에 hex 가 있다: ${outside.slice(0, 5).join(" · ")}`,
  );

  // 4. 가이드 구성 요소를 실제로 옮겼는가. 팔레트만 옮기고 끝내는 것을 막는다.
  const absent = COMPONENTS.filter((name) => !new RegExp(`class="[^"]*\\b${name}\\b`).test(html));
  want(
    reasons,
    absent.length === 0,
    `가이드 구성 요소가 HTML 에 없다: ${absent.join(", ")}`,
  );
  const svgCount = (html.match(/<svg\b/g) ?? []).length;
  want(reasons, svgCount > 0, "인라인 SVG 가 하나도 없다");
  want(reasons, /<footer[\s>]/i.test(html), "푸터가 없다. 한계 고지는 푸터 한 줄로 모은다");

  // 4b. 기준작 대비 상업 강도. `references/benchmark/` 두 파일이 이 하한의 근거다.
  // 이 검사가 없으면 흰 박스에 가운데 정렬한 문서가 완벽하게 통과한다 — 1회차가 그랬다.
  for (const gap of shortfalls(measure(html))) {
    reasons.push(`기준작 하한에 못 미친다: ${gap}`);
  }

  // 4c. 화면에 제작 과정이 새어 나가지 않았는가.
  for (const hit of producerLanguage(visible)) {
    reasons.push(`제작자 언어가 화면에 있다: "${hit.sample}"`);
  }

  // 5. 앵커. 좌표를 붙인 이미지가 바뀌면 좌표가 조용히 깨진다.
  if (!anchors) {
    reasons.push("work/anchors.json 이 없다. 좌표를 붙인 이미지의 해시를 남긴다");
  } else {
    for (const [rel, recorded] of Object.entries(anchors.images ?? {})) {
      const actual = await hashFile(path.join(project, rel));
      want(
        reasons,
        actual === recorded,
        `앵커 이미지가 바뀌었다: ${rel}. 좌표를 다시 잡는다`,
      );
    }
  }

  return { reasons };
}
