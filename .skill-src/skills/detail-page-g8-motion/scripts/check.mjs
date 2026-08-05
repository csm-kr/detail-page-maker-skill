// G8 판정. brief 를 고치고 컴포지션은 옛것을 재렌더한 것을 잡는다.

import path from "node:path";

import {
  json,
  mtime,
  section,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

/** page-plan 의 `## 용어 집합` 에 적힌 부위 용어. 자막은 이 집합에서만 고른다. */
function pageTerms(page) {
  const block = section(page ?? "", "용어 집합") ?? "";
  return block
    .split("\n")
    .map((line) => /^\s*(?:\d+\.|[-*])\s*(.+?)\s*$/.exec(line))
    .filter(Boolean)
    .map((match) => match[1].replace(/[`*]/g, "").trim())
    .filter(Boolean);
}

export async function check({ project }) {
  const reasons = [];
  const index = await json(project, path.join("work", "comps", "index.json"));
  const plan = await json(project, "flow-plan.json");
  const page = await text(project, path.join("work", "page-plan.md"));

  if (!index) {
    reasons.push("work/comps/index.json 이 없다. brief↔컴포지션↔GIF 대응을 남긴다");
    return { reasons };
  }

  const entries = index.entries ?? [];
  const briefs = plan?.gif_briefs ?? [];

  want(
    reasons,
    entries.length === briefs.length,
    `brief ${briefs.length}개 · 컴포지션 ${entries.length}개. 수가 다르다`,
  );

  const terms = pageTerms(page);
  if (terms.length === 0) {
    reasons.push("page-plan.md 의 `## 용어 집합` 을 읽을 수 없다");
  }

  for (const entry of entries) {
    const brief = briefs.find((b) => b.id === entry.brief);
    if (!brief) {
      reasons.push(`컴포지션 ${entry.brief} 에 대응하는 brief 가 없다`);
      continue;
    }

    want(
      reasons,
      Boolean(entry.method) && entry.method === brief.method,
      `${entry.brief} 의 method 가 brief 와 다르다 (brief ${brief.method} · 실제 ${entry.method ?? "없음"})`,
    );

    // 자막 용어가 페이지 용어 집합 밖이면 GIF 와 HTML 이 다른 이름을 쓴다.
    if (terms.length > 0) {
      const stray = (entry.subtitles ?? []).filter((subtitle) => !terms.includes(subtitle));
      want(
        reasons,
        stray.length === 0,
        `${entry.brief} 의 자막이 페이지 용어 집합 밖이다: ${stray.join(" · ")}`,
      );
    }

    // brief 의 핵심 명사가 컴포지션에 실제로 들어갔는가.
    const keywords = brief.keywords ?? [];
    const blob = JSON.stringify(entry);
    const absent = keywords.filter((word) => !blob.includes(word));
    want(
      reasons,
      absent.length === 0,
      `${entry.brief} 의 brief 핵심 명사가 컴포지션에 없다: ${absent.join(" · ")}`,
    );

    // GIF 가 컴포지션보다 오래되면 옛 설계를 재렌더한 것이다.
    if (entry.comp && entry.gif) {
      const compAt = await mtime(path.join(project, entry.comp));
      const gifAt = await mtime(path.join(project, entry.gif));
      if (compAt === null) reasons.push(`${entry.brief} 의 컴포지션 파일이 없다: ${entry.comp}`);
      else if (gifAt === null) reasons.push(`${entry.brief} 의 GIF 가 없다: ${entry.gif}`);
      else
        want(
          reasons,
          gifAt >= compAt,
          `${entry.brief} 의 GIF 가 컴포지션보다 오래됐다. 다시 굽는다`,
        );
    } else {
      reasons.push(`${entry.brief} 에 comp 와 gif 경로가 필요하다`);
    }
  }

  const counts = new Map();
  for (const entry of entries) counts.set(entry.method, (counts.get(entry.method) ?? 0) + 1);
  for (const [method, count] of counts) {
    want(
      reasons,
      count <= 8,
      `method ${method} 가 ${count}개다. 한 수단이 8개를 넘으면 편한 경로로 쏠린 것이다`,
    );
  }

  return { reasons };
}
