// G10 판정. 2회차에 38 MB 를 발행했다. 포맷과 용량을 통과 조건으로 만든다.

import path from "node:path";

import {
  bytesUnder,
  json,
  listFiles,
  policy,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

const EXT = { "webp-q85": ".webp", "jpeg-q88": ".jpg", png: ".png" };

export async function check({ workspace, project }) {
  const reasons = [];
  const report = await json(project, path.join("work", "qa-report.json"));
  const { media_budget_mb: budgetMb = 12, photo_format: format = "webp-q85" } =
    await policy(workspace);

  if (!report) {
    reasons.push("work/qa-report.json 이 없다");
    return { reasons };
  }

  want(
    reasons,
    report.strict_media === true,
    "QA 를 --strict-media 로 돌리지 않았다",
  );
  want(
    reasons,
    (report.errors ?? []).length === 0,
    `QA 오류 ${(report.errors ?? []).length}건: ${(report.errors ?? []).slice(0, 5).join(" · ")}`,
  );

  const imagesDir = path.join(project, "output", "media", "images");
  const wanted = EXT[format] ?? ".webp";
  const wrong = (await listFiles(imagesDir, /\.(png|jpe?g|webp|avif)$/i)).filter(
    (name) => path.extname(name).toLowerCase() !== wanted,
  );
  want(
    reasons,
    wrong.length === 0,
    `사진 포맷이 ${format} 이 아닌 파일 ${wrong.length}개: ${wrong.slice(0, 5).join(", ")}`,
  );

  const mediaBytes = await bytesUnder(path.join(project, "output", "media"));
  const mediaMb = mediaBytes / (1024 * 1024);
  want(
    reasons,
    mediaMb <= budgetMb,
    `미디어 총량 ${mediaMb.toFixed(1)} MB 가 상한 ${budgetMb} MB 를 넘는다`,
  );

  return { reasons, mediaMb };
}
