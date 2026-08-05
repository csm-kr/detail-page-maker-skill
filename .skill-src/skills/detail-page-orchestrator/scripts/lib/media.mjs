// 미디어 발행. 포맷과 폭을 여기 한 곳에서 정한다.
//
// 2회차에 38 MB 를 발행했고 폭이 섞여 있었다. QA 는 미디어마다 폭 780 을 요구하고
// 사진 포맷은 정책값을 요구한다. 그러므로 발행은 항상 이 함수를 지나가고, 폭과 포맷을
// 인자로 받지 않는다 — 부르는 곳에서 780 이 아닌 값을 넣을 수 없게 한다.

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/** 계약 폭. 플랜이 뭐라 하든 발행물은 780 이다. */
export const OUTPUT_WIDTH = 780;

const CODEC = {
  "webp-q85": { ext: ".webp", args: ["-c:v", "libwebp", "-quality", "85"] },
  "jpeg-q88": { ext: ".jpg", args: ["-c:v", "mjpeg", "-q:v", "3"] },
  png: { ext: ".png", args: [] },
};

export function formatOf(format = "webp-q85") {
  return CODEC[format] ?? CODEC["webp-q85"];
}

/**
 * ffmpeg 인자. 순수 함수로 둔 이유는 테스트가 ffmpeg 없이 이것을 볼 수 있어야 하기
 * 때문이다 — 폭이 780 이 아니게 되는 회귀를 실행 없이 잡는다.
 */
export function convertArgs({ src, dest, format = "webp-q85" }) {
  const { args } = formatOf(format);
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    src,
    // 폭을 고정하고 높이는 비율로. 홀수 높이를 만들지 않는다.
    "-vf",
    `scale=${OUTPUT_WIDTH}:-2:flags=lanczos`,
    ...args,
    dest,
  ];
}

/** 확장자까지 정책이 정한다. 부르는 곳이 고르지 않는다. */
export function destFor({ dir, id, format = "webp-q85" }) {
  return path.join(dir, `${id}${formatOf(format).ext}`);
}

export async function publishImage({ src, dir, id, format = "webp-q85", ffmpeg = "ffmpeg" }) {
  await mkdir(dir, { recursive: true });
  const dest = destFor({ dir, id, format });
  await run(ffmpeg, convertArgs({ src, dest, format }));
  return dest;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(new Error(`FFMPEG_SPAWN_FAILED ${error.message}`)));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`FFMPEG_FAILED 종료 코드 ${code}${stderr ? `\n  ${stderr.trim()}` : ""}`)),
    );
  });
}
