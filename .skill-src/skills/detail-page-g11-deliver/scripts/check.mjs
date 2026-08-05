// G11 판정. Studio·Wing 미실행과 죽인 서버 미복구를 잡는다.

import path from "node:path";

import {
  json,
  listFiles,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

export async function check({ project }) {
  const reasons = [];
  const report = await text(project, path.join("work", "report.md"));
  const killed = await json(project, path.join("work", "killed.json"));
  const delivery = await json(project, path.join("work", "delivery.json"));

  // 죽인 프로세스를 되살렸는가. 기록이 없으면 검사할 대상도 없다.
  for (const entry of killed?.entries ?? []) {
    want(
      reasons,
      entry.restored_at,
      `죽인 프로세스를 되살리지 않았다: ${entry.cmd ?? entry.pid} (${entry.by_gate ?? "?"})`,
    );
  }

  if (!delivery) {
    reasons.push(
      "work/delivery.json 이 없다. Studio 확인과 Wing 내보내기 결과를 남긴다",
    );
  } else {
    want(reasons, delivery.studio_reviewed === true, "Studio 를 열어 눈으로 보지 않았다");
    want(
      reasons,
      typeof delivery.wing_export_id === "string" && delivery.wing_export_id.length > 0,
      "Wing export id 가 없다",
    );
    if (typeof delivery.wing_export_id === "string") {
      const files = await listFiles(
        path.join(project, "output", "wing", delivery.wing_export_id),
      );
      want(
        reasons,
        files.length > 0,
        `output/wing/${delivery.wing_export_id}/ 이 비어 있다`,
      );
    }
    want(
      reasons,
      delivery.authoring_applied === true,
      "authoring 세션 결과를 반영하지 않았다",
    );
  }

  if (report) {
    want(
      reasons,
      !/자리표시|TODO/.test(report),
      "report.md 에 자리표시자가 남아 있다",
    );
  }

  return { reasons };
}
