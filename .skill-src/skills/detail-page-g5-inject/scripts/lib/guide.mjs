// DESIGN-GUIDE.md 읽기. run.mjs 와 check.mjs 가 **같은 정의**를 쓴다.
//
// 무엇을 주입할지의 정의가 둘로 갈리면 "주입했다고 하는데 검사는 못 찾는" 상태가 된다.
// 검사의 독립성은 산출물을 읽는 데서 오고, 정의를 공유하는 것과는 별개다.

import path from "node:path";

import {
  hexes,
  section,
  text,
} from "../../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

export const GUIDE_REL = path.join("work", "design-ref", "DESIGN-GUIDE.md");

/** `- brand \`#3189FD\`` 형태의 이름 붙은 팔레트. 이름이 없으면 토큰을 만들 수 없다. */
export function parsePalette(block) {
  if (!block) return {};
  const tokens = {};
  for (const line of block.split("\n")) {
    const match = /^\s*[-*]\s*([A-Za-z][A-Za-z0-9_-]*)\s*[`:]?\s*`?(#[0-9a-fA-F]{6})`?/.exec(line);
    if (match) tokens[match[1]] = match[2].toUpperCase();
  }
  return tokens;
}

/**
 * 배경·장식 키워드. `## 배경` 의 **첫 줄만** 읽는다.
 *
 * 절 전체를 훑으면 아래 설명 문단에서 `줄이다`·`못하므로` 같은 활용형이 함께 뽑힌다.
 * 그것들은 프롬프트에 주입되지는 않지만(주입은 앞의 넷) 발행 플랜의 `mood.background`
 * 에 그대로 실려 G6 까지 흘러간다. 뽑기가 조사를 떼지 못하므로 **경계는 첫 줄이다.**
 */
export function parseBackground(block) {
  if (!block) return [];
  const line = block.split("\n").find((row) => row.trim() !== "");
  if (!line) return [];
  return [
    ...new Set(
      line
        .split(/[\s,·、]+/)
        .map((word) => word.replace(/[`*_()[\]:.]/g, "").trim())
        .filter((word) => /^[가-힣]{2,}$/.test(word)),
    ),
  ];
}

export async function readGuide(project) {
  const raw = await text(project, GUIDE_REL);
  if (raw === null) {
    return { ok: false, reason: `${GUIDE_REL} 이 없다` };
  }
  const palette = parsePalette(section(raw, "팔레트"));
  const background = parseBackground(
    section(raw, "배경") ?? section(raw, "배경과 장식"),
  );
  const measured = hexes(raw);

  const reasons = [];
  if (Object.keys(palette).length < 3) {
    reasons.push(
      "`## 팔레트` 에 이름 붙은 색이 3개 미만이다. `- brand `#3189FD`` 형태로 적는다",
    );
  }
  if (!palette.brand) {
    reasons.push("팔레트에 `brand` 가 없다. 주입할 브랜드 색을 이름으로 정한다");
  }
  if (background.length === 0) {
    reasons.push(
      "`## 배경` 첫 줄에서 주입할 키워드를 찾을 수 없다. 조사 없는 낱말만 첫 줄에 둔다",
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    palette,
    background,
    measured,
  };
}

/** 컷 프롬프트에 붙일 무드 블록. 검사가 찾는 것과 정확히 같은 것을 만든다. */
export function moodBlock({ palette, background }, cut) {
  const keywords = background.slice(0, 4).join(", ");
  const accents = [palette.brand, palette.navy].filter(Boolean).join(" ");
  // 빈 줄로 시작해야 원문 프롬프트의 마지막 마침표와 붙지 않는다.
  // `.filter(Boolean)` 이 선행 빈 줄까지 지워 `daylight.배경과` 가 한 낱말이 됐었다.
  const lines = [
    `배경과 장식: ${keywords}`,
    `강조 색: ${accents}`,
    cut.no_product ? "제품을 넣지 않는다." : "",
  ].filter(Boolean);
  return `\n\n${lines.join("\n")}`;
}
