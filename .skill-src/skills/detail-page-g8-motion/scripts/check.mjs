// G8 판정. brief 를 고치고 컴포지션은 옛것을 재렌더한 것을 잡는다.

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  bytesUnder,
  json,
  mtime,
  policy,
  section,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";
import { readGifTiming } from "./lib/gifmeta.mjs";
import { compUsesStill } from "./lib/motion.mjs";
import { pacingFaults } from "./lib/pacing.mjs";
import { probeFaults } from "./lib/renderprobe.mjs";

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

export async function check({ workspace, project }) {
  const reasons = [];
  const index = await json(project, path.join("work", "comps", "index.json"));
  const plan = await json(project, "flow-plan.json");
  const page = await text(project, path.join("work", "page-plan.md"));

  if (!index) {
    reasons.push("work/comps/index.json 이 없다. brief↔컴포지션↔GIF 대응을 남긴다");
    return { reasons };
  }

  // 어느 경로로 구웠는지, 그 경로가 예산 안에 도는지. 3회차는 hyperframes 가
  // 240초에 타임아웃하자 조용히 Chrome 으로 갈아탔고 그 우회가 굳었다.
  reasons.push(
    ...probeFaults(await json(project, path.join("work", "comps", "render-probe.json"))),
  );

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

    // GIF 의 입력이 이미지인가. 1회차에 컴포지션 10개 전부 도형이었고, 그래서
    // "상업적 이미지가 생성되지 않은 느낌" 이 났다. 여기서만 잡을 수 있다.
    want(
      reasons,
      Boolean(brief.source_still) && entry.source_still === brief.source_still,
      `${entry.brief} 의 source_still 이 brief 와 다르다 (brief ${brief.source_still ?? "없음"} · 실제 ${entry.source_still ?? "없음"})`,
    );
    if (entry.method === "still-motion" && entry.comp && brief.source_still) {
      const html = await text(project, entry.comp);
      want(
        reasons,
        compUsesStill(html ?? "", brief.source_still),
        `${entry.brief} 의 컴포지션이 스틸 ${brief.source_still} 을 쓰지 않는다. 도형에 애니메이션을 걸지 않는다`,
      );
    }
    if (entry.method === "tibo-sequence") {
      want(
        reasons,
        (entry.frames ?? 0) >= 2,
        `${entry.brief} 의 생성 프레임이 ${entry.frames ?? 0}장이다. 2장 이상이어야 이어지는 GIF 다`,
      );
    }

    // 얼마나 오래 보이는가. **구운 파일을 연다.**
    // 3회차 brief 에는 "천천히 드러난다" 라고 적혀 있었고 실제 파일은 3프레임 0.48초였다.
    // 계획을 읽는 검사로는 못 잡는다.
    if (entry.gif) {
      let timing = null;
      try {
        timing = readGifTiming(await readFile(path.join(project, entry.gif)));
      } catch (error) {
        reasons.push(`${entry.brief} 의 GIF 를 읽을 수 없다: ${error.message.split("\n")[0]}`);
      }
      if (timing) {
        const faults = pacingFaults(timing, { scenes: entry.method === "tibo-sequence" });
        if (faults.length > 0) {
          reasons.push(`${entry.brief} 이 너무 빨리 지나간다 — ${faults.join(" · ")}`);
        }
      }
    }

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

  // 미디어 예산은 **만드는 자리에서** 본다. 5회차에 G10 이 12.6MB 로 거부했는데 그중
  // 84%가 GIF 였다. G10 은 스크립트 게이트라 스스로 줄이지 못하고, 여기까지 오면
  // 앞 게이트를 전부 되돌려야 한다. 숫자는 정책값 하나를 G10 과 같이 본다.
  const { media_budget_mb: budgetMb = 12 } = await policy(workspace);
  const mediaMb = (await bytesUnder(path.join(project, "output", "media"))) / (1024 * 1024);
  want(
    reasons,
    mediaMb <= budgetMb,
    `미디어 총량 ${mediaMb.toFixed(1)} MB 가 상한 ${budgetMb} MB 를 넘는다. GIF 가 대부분이면 여기서 줄인다`,
  );

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
