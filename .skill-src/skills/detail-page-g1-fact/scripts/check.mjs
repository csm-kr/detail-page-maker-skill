// G1 판정. 2회차에 공급처를 다시 받지 않은 것과 사진을 원본으로 열지 않은 것을 잡는다.

import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  json,
  policy,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

export async function check({ workspace, project }) {
  const reasons = [];
  const ssot = await text(project, path.join("work", "SSOT.md"));
  const lock = await json(project, path.join("work", "inputs.lock.json"));
  const { capture_max_age_days: maxAge = 7 } = await policy(workspace);

  if (!lock) {
    reasons.push("work/inputs.lock.json 을 읽을 수 없다");
    return { reasons };
  }

  const captures = Object.entries(lock.captures ?? {});
  const supplierHost = new URL(lock.supplier_url).host;
  const supplier = captures.filter(([, meta]) => {
    try {
      return meta.url && new URL(meta.url).host === supplierHost;
    } catch {
      return false;
    }
  });

  want(
    reasons,
    supplier.length > 0,
    `공급처 캡처가 inputs.lock.json 에 없다. orchestrate capture --url ${lock.supplier_url} --as supplier 로 다시 받는다
  아는 호스트는 검증된 추출기로 간다. 추출기가 없는 호스트만 orchestrate lock --read <캡처> --url ${lock.supplier_url}`,
  );

  for (const [rel, meta] of supplier) {
    const ageDays = (Date.now() - Date.parse(meta.locked_at)) / 86400000;
    want(
      reasons,
      ageDays <= maxAge,
      `공급처 캡처가 ${ageDays.toFixed(1)}일 지났다 (상한 ${maxAge}일): ${rel}`,
    );
  }

  for (const [rel] of captures) {
    want(
      reasons,
      !/scratchpad|prev-run|이전|backup/i.test(rel),
      `이전 회차 파생본을 입력으로 쓰지 않는다: ${rel}`,
    );
  }

  // 사진은 필수가 아니다 — 없으면 공급처 동일 SKU 로 간다 (docs/GUIDE.md §3).
  // 대신 있는 것이 전부 잠겨 있어야 한다. 손으로 놓은 사진은 해시 체인 밖이다.
  const locked = new Set((lock.photos?.entries ?? []).map((entry) => path.basename(entry.file)));
  const loose = (await readdir(path.join(project, "input", "photos")).catch(() => []))
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .filter((file) => !locked.has(file));
  want(
    reasons,
    loose.length === 0,
    `input/photos 에 잠기지 않은 사진이 ${loose.length}장 있다 (${loose.join(", ")}). orchestrate photos 로 잠근다`,
  );

  if (ssot) {
    want(
      reasons,
      (lock.photos?.count ?? 0) === 0 || /확인:\s*원본 해상도/.test(ssot),
      "SSOT.md 에 사진을 원본 해상도로 열었다는 기록(`확인: 원본 해상도`)이 없다",
    );
    want(
      reasons,
      /##\s*가동|##\s*제약|분리|결합/.test(ssot),
      "SSOT.md 에 부품의 가동 범위·분리·결합·자세 제약이 없다",
    );
  }

  return { reasons };
}
