// 컨텍스트 팩 — 헤드리스 세션 하나가 받는 전부.
//
// harness-framework 의 `_load_guardrails()` 는 `CLAUDE.md` + `docs/**/*.md` 를 통째로
// 넣는다. 우리가 그대로 하면 게이트마다 정본 전량을 읽는다. 그건 "컨텍스트가 너무 많아서
// 잘 못한다" 를 12번 반복하는 것이다. 그래서 **게이트가 읽을 것을 gates.mjs 가 선언하고**
// 여기서 그 목록만 조립한다.
//
// 무엇을 본문으로 넣고 무엇을 경로로 넘기는가 —
//   정본(reads)   본문. 크기가 고정이고, 읽히지 않아서 어긋난 것이 3회차의 실패다
//   지시서        본문. 그 게이트가 할 일 자체다
//   입력(inputs)  경로. 플랜 하나가 정본 전체보다 크다. 세션이 열어서 읽는다
//   앞 게이트     한 줄 요약. 대화 맥락은 넘기지 않는다
//   판정          지금 부족한 것. 무엇으로 판정되는지 미리 알려준다

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { runCheck } from "./check.mjs";
import { RUN_GATES, gate } from "./gates.mjs";
import { SKILLS_ROOT } from "./project.mjs";

/** 전량 주입 대비 허용 비율. ADR-0012 의 채택 기준이다. */
export const PACK_SHARE = 1 / 3;

const OURS = /^detail-page-/;

/** 세션을 띄우는 게이트. 결정적인 게이트는 세션이 판단할 것이 없다. */
export function packableGates() {
  return RUN_GATES.filter((g) => g.actor !== "script" && g.skill);
}

/**
 * 통째로 부었을 때의 크기 — 스킬 트리의 정본 전량과 지시서 전량.
 * 상한을 사람이 고르지 않는다. 낮춰 잡은 하한이 면제였던 것처럼 높게 잡은 상한도 면제다.
 */
export async function canonBytes(skillsRoot = SKILLS_ROOT) {
  let total = 0;
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".md")) total += (await stat(full)).size;
    }
  };
  for (const name of await readdir(skillsRoot).catch(() => [])) {
    if (!OURS.test(name)) continue;
    await walk(path.join(skillsRoot, name, "references"));
    total += await stat(path.join(skillsRoot, name, "SKILL.md"))
      .then((info) => info.size)
      .catch(() => 0);
  }
  return total;
}

async function readIfPresent(file) {
  return readFile(file, "utf8").catch(() => null);
}

/**
 * 세션의 Bash 는 Git Bash 다. 거기서 백슬래시는 경로 구분자가 아니라 **이스케이프**라
 * `C:\a\b` 가 `C:ab` 로 뭉개진다. 4회차 G1 이 그래서 검사를 한 번도 못 돌렸다.
 */
function posix(file) {
  return file.split(path.sep).join("/");
}

/**
 * 게이트 하나의 컨텍스트 팩.
 *   ctx  { workspace, project, state, skillsRoot? }
 */
export async function buildPack(id, ctx) {
  const g = gate(id);
  if (!packableGates().some((item) => item.id === id)) {
    throw new Error(`NOT_AN_AGENT_GATE ${id} 는 결정적인 게이트다. run 으로 돈다`);
  }
  const skillsRoot = ctx.skillsRoot ?? SKILLS_ROOT;
  const skillDir = path.join(skillsRoot, g.skill);

  const instructions = await readIfPresent(path.join(skillDir, "SKILL.md"));

  const canon = [];
  const missing = [];
  for (const rel of g.reads) {
    const body = await readIfPresent(path.join(skillsRoot, rel));
    if (body === null) missing.push(rel);
    else canon.push({ rel, body });
  }

  const inputs = [];
  for (const spec of g.inputs) {
    const full = spec.startsWith("ws:")
      ? path.join(ctx.workspace, spec.slice(3))
      : path.join(ctx.project, spec);
    const size = await stat(full).then((info) => info.size).catch(() => null);
    inputs.push({ spec, size });
  }

  const summaries = g.deps
    .filter((dep) => dep !== "INIT")
    .map((dep) => ({ id: dep, text: ctx.state?.gates?.[dep]?.summary ?? null }));

  const { reasons } = await runCheck(id, ctx);

  const lines = [
    `# ${g.id} · ${g.title} — 헤드리스 실행`,
    "",
    `${g.summary}`,
    "",
    "이 세션은 **이 게이트 하나만** 한다. 다른 게이트의 파일을 고치지 않는다.",
    "",
    "## 불변 규칙",
    "",
    "- 우회 플래그가 없다. `--force` 를 만들지 않는다. 게이트가 틀렸으면 게이트를 고친다",
    "- 통과를 판정하는 것은 이 세션이 아니라 `scripts/check.mjs` 다. **자기 보고는 통과가 아니다**",
    "- 코드를 제외한 설명과 주석은 한국어로 쓴다",
    "- 출처 없는 성능·효능·인증·수치를 만들지 않는다",
    "- 마지막 줄에 `SUMMARY: <한 줄>` 을 쓴다. 다음 게이트가 이 한 줄만 받는다",
    "- 쉘은 `node` 로 **시작하는 한 줄**만 쓸 수 있다. `cd`·`&&`·`;`·파이프를 붙이면 거부된다",
    "",
    "## 작업 위치",
    "",
    "```",
    `프로젝트  ${posix(ctx.project)}`,
    `스킬      ${posix(skillDir)}`,
    "```",
    "",
    `## 지시서 — ${g.skill}/SKILL.md`,
    "",
    instructions ?? "(SKILL.md 를 읽을 수 없다)",
  ];

  for (const doc of canon) {
    lines.push("", `## 정본 — ${doc.rel}`, "", doc.body);
  }
  if (missing.length > 0) {
    lines.push(
      "",
      "## 읽을 수 없다",
      "",
      ...missing.map((rel) => `- ${rel}`),
      "",
      "이 문서가 근거인 판단은 하지 않는다. 지어내지 말고 그대로 보고한다.",
    );
  }

  lines.push("", "## 입력 — 열어서 읽는다", "");
  lines.push(
    ...(inputs.length === 0
      ? ["(없다)"]
      : inputs.map((item) => `- ${item.spec} ${item.size === null ? "**없음**" : `(${item.size}B)`}`)),
  );

  lines.push("", "## 앞 게이트가 남긴 것", "");
  lines.push(
    ...(summaries.length === 0
      ? ["(없다)"]
      : summaries.map((item) => `- ${item.id}: ${item.text ?? "(요약 없음)"}`)),
  );

  lines.push("", "## 지금 부족한 것 — 이것이 통과 조건이다", "");
  lines.push(...(reasons.length === 0 ? ["(없다)"] : reasons.map((reason) => `- ${reason}`)));

  lines.push(
    "",
    "## 끝내는 법",
    "",
    "```bash",
    `node "${posix(path.join(skillsRoot, "detail-page-orchestrator", "scripts", "orchestrate.mjs"))}" gate ${g.id} --check`,
    "```",
    "",
    "이 명령이 통과할 때까지 고친다. 통과 기록은 부모가 남긴다.",
  );

  const text = `${lines.join("\n")}\n`;
  return {
    gate: g,
    text,
    bytes: Buffer.byteLength(text, "utf8"),
    canon,
    missing,
    inputs,
    summaries,
    shortfalls: reasons,
  };
}
