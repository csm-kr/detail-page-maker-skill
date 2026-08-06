// GIF 조립을 G8 이 소유한다.
//
// 3회차에는 두 수단이 각자 자기 방식으로 GIF 를 만들었다 — hyperframes 가 한쪽,
// god-tibo 의 `gif` 옵션이 다른 쪽. 둘 다 **일정 fps** 로만 이어 붙일 수 있어서
// 프레임마다 머무는 시간을 줄 방법이 없었다. 그래서 3장이 0.48초에 지나갔다.
//
// 이제 두 수단 모두 **프레임 이미지까지만** 만들고 조립은 여기서 한다.
// ffmpeg concat demuxer 의 `duration` 이 프레임마다의 지연을 준다.

import { PACING } from "./pacing.mjs";

/** 보간 프레임 하나가 보이는 시간. 약 8fps — 움직임이 끊겨 보이지 않는 최소값. */
export const TWEEN_MS = 120;

/**
 * 프레임마다의 지연(ms). `lib/pacing.mjs` 의 하한을 스스로 만족한다.
 *
 * @param count 프레임 수
 * @param scenes 프레임 하나가 장면 하나인가 (tibo-sequence)
 */
export function framePacing(count, { scenes = false } = {}) {
  if (!Number.isInteger(count) || count < 2) {
    throw new Error(`TOO_FEW_FRAMES 프레임이 ${count}장이다. 2장 이상이어야 GIF 다`);
  }
  const middle = scenes ? PACING.sceneMs : TWEEN_MS;
  const ms = Array.from({ length: count }, () => middle);
  ms[0] = Math.max(ms[0], PACING.firstHoldMs);
  ms[count - 1] = Math.max(ms[count - 1], PACING.lastHoldMs);

  // 상한 안에 못 들어가면 여기서 멈춘다. 조용히 빨리 돌려서 맞추지 않는다 —
  // 그렇게 맞춘 것이 3회차의 0.48초짜리 GIF 였다. 장면 수는 기획이 줄인다.
  const floorTotal = ms.reduce((sum, value) => sum + value, 0);
  if (floorTotal > PACING.maxTotalMs) {
    throw new Error(
      `TOO_MANY_FRAMES ${count}장이면 최소 ${floorTotal}ms 다 (상한 ${PACING.maxTotalMs}ms). ` +
        `${scenes ? "장면" : "프레임"} 수를 줄인다`,
    );
  }

  // 한 바퀴가 하한에 못 미치면 **마지막 머무름**을 늘린다.
  // 프레임 수는 기획이 정한 것이므로 여기서 늘리지 않는다.
  const short = PACING.totalMs - ms.reduce((sum, value) => sum + value, 0);
  if (short > 0) ms[count - 1] += short;
  return ms;
}

/**
 * ffmpeg concat demuxer 스크립트.
 * 마지막 파일은 한 번 더 적는다 — 그러지 않으면 마지막 `duration` 이 무시된다.
 */
export function concatScript(frames) {
  const quote = (value) => `file '${String(value).replaceAll("'", "'\\''")}'`;
  const lines = [];
  for (const { path: file, ms } of frames) {
    lines.push(quote(file), `duration ${(ms / 1000).toFixed(3)}`);
  }
  if (frames.length > 0) lines.push(quote(frames[frames.length - 1].path));
  return `${lines.join("\n")}\n`;
}

/**
 * ffmpeg 인자. 팔레트를 먼저 만들고 그 팔레트로 칠한다 — 색이 뭉개지지 않는다.
 * `-r` 를 주지 않는다. 지연은 concat 스크립트의 `duration` 이 소유한다.
 */
export function ffmpegArgs({ concatPath, outputPath, width = 780 }) {
  return [
    "-y",
    "-v", "error",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-filter_complex",
    `[0:v]scale=${width}:-2:flags=lanczos,split[s0][s1];` +
      `[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`,
    "-loop", "0",
    outputPath,
  ];
}
