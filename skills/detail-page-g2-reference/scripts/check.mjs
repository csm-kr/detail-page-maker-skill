// G2 판정. 2회차에 기준작을 한 번도 열지 않았다. 그 상태를 통과시키지 않는다.

import path from "node:path";

import {
  headings,
  hexes,
  json,
  listIds,
  section,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

const REQUIRED = ["섹션 순서", "고객 질문", "증명 방식", "디자인 분위기"];

export async function check({ project }) {
  const reasons = [];
  const map = await text(project, path.join("work", "flow-map.md"));
  const lock = await json(project, path.join("work", "inputs.lock.json"));

  if (!lock) {
    reasons.push("work/inputs.lock.json 을 읽을 수 없다");
    return { reasons };
  }

  const coupangHost = new URL(lock.coupang_url).host;
  const captured = Object.entries(lock.captures ?? {}).some(([, meta]) => {
    try {
      return meta.url && new URL(meta.url).host === coupangHost;
    } catch {
      return false;
    }
  });
  want(
    reasons,
    captured,
    `기준작 캡처가 inputs.lock.json 에 없다. 손으로 놓은 파일은 등록되지 않는다. orchestrate lock --read <캡처> --url ${lock.coupang_url}`,
  );

  if (!map) return { reasons };

  const present = headings(map);
  for (const title of REQUIRED) {
    want(reasons, present.includes(title), `flow-map.md 에 \`## ${title}\` 절이 없다`);
  }

  const order = listIds(section(map, "섹션 순서"));
  want(
    reasons,
    order.length >= 5,
    `\`## 섹션 순서\` 의 섹션이 ${order.length}개다. 기준작을 실제로 읽었다면 더 나온다`,
  );

  const mood = section(map, "디자인 분위기") ?? "";
  const measured = hexes(mood);
  want(
    reasons,
    measured.length >= 3,
    `\`## 디자인 분위기\` 의 실측 hex 가 ${measured.length}개다. 3개 이상 적는다 (눈대중은 쓰지 않는다)`,
  );

  return { reasons };
}
