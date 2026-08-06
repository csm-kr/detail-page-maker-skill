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
 * concat demuxer 가 프레임을 올려놓는 격자(ms). **실측이다.**
 *
 * 900ms 를 요청하면 파일에는 920·880 이 번갈아 나온다 — 전부 40ms 의 배수다(25fps).
 * 그리고 880 은 장면 하한(900ms)을 깬다. 요청한 값을 그대로 믿으면
 * "계획에는 900ms 라고 적혀 있는데 파일은 880ms" 인 상태가 된다 — 4회차와 같은 종류의 실패다.
 * 그래서 조립기가 **미리 올림해서** 요청한 것과 구워진 것을 같게 만든다.
 */
export const GRID_MS = 40;

const onGrid = (ms) => Math.ceil(ms / GRID_MS) * GRID_MS;

/**
 * 디렉터리의 이미지 중 **무엇이 프레임인가.** 이름 순서가 곧 프레임 순서다.
 *
 * 렌더러는 프레임 옆에 자기 부산물을 같이 남긴다 —
 * `hyperframes snapshot` 은 `contact-sheet-1.jpg`, god-tibo 는 실패한 프레임의 `raw-000.png`.
 * "이미지면 프레임" 으로 세면 12장을 요청하고 14장을 받고(5회차 실측), 이름순 정렬이면
 * contact-sheet 가 **첫 프레임**이 된다. 두 렌더러 모두 프레임은 `frame-` 으로 시작한다.
 */
export function frameFiles(names) {
  return names.filter((name) => /^frame-.*\.(png|webp|jpe?g)$/i.test(name)).sort();
}

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
  const ms = Array.from({ length: count }, () => onGrid(middle));
  ms[0] = onGrid(Math.max(ms[0], PACING.firstHoldMs));
  ms[count - 1] = onGrid(Math.max(ms[count - 1], PACING.lastHoldMs));

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
  if (short > 0) ms[count - 1] += onGrid(short);
  return ms;
}

/**
 * ffmpeg concat demuxer 스크립트.
 *
 * 마지막 파일을 **한 번 더 적지 않는다.** 다시 적으면 마지막 `duration` 이 적용되기는
 * 하는데 그 줄 자체가 프레임이 된다 — 12장을 구웠는데 13장이 나왔고 13번째가 40ms 였다.
 * 마지막 머무는 시간은 `ffmpegArgs` 의 `-final_delay` 가 준다.
 */
export function concatScript(frames) {
  const quote = (value) => `file '${String(value).replaceAll("'", "'\\''")}'`;
  const lines = [];
  for (const { path: file, ms } of frames) {
    lines.push(quote(file), `duration ${(ms / 1000).toFixed(3)}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * 팔레트 색 수. **폭을 줄이는 대신 색을 줄인다.**
 *
 * 5회차에 미디어 총량이 12.6MB 로 상한 12MB 를 넘었고 그중 84%가 GIF 였다.
 * 같은 프레임으로 조립만 바꿔 다시 구워 봤다 (GIF 5개 합계):
 *
 *   c256 · bayer_scale=3  5734KB   지금 것
 *   c192 · bayer_scale=5  4800KB   -16%   base 와 눈으로 구분되지 않는다
 *   c160 · bayer_scale=5  4400KB          자막 스크림 그라데이션에 띠가 보인다
 *   c128 · sierra2_4a     4600KB          잎 가장자리에 색점이 생긴다
 *
 * 폭은 780px 그대로 둔다 — 페이지 폭이 780px 이라 줄이면 그만큼 흐려진다.
 * 색은 192개까지 줄여도 안 보이고, 그것이 띠가 보이기 전 마지막 값이다.
 */
export const MAX_COLORS = 192;

/**
 * bayer 디더 격자의 성김. 0~5 이고 클수록 무늬가 안 보인다.
 *
 * 디더는 평평한 면에 격자 무늬를 새긴다. 그 무늬가 LZW 가 이어 붙일 것을 끊어서
 * 색 수를 그대로 두고 격자만 성기게 해도 파일이 10% 작아진다 — 실측이다.
 */
export const BAYER_SCALE = 5;

/**
 * ffmpeg 인자. 팔레트를 먼저 만들고 그 팔레트로 칠한다 — 색이 뭉개지지 않는다.
 * `-r` 를 주지 않는다. 지연은 concat 스크립트의 `duration` 이 소유한다.
 *
 * `-final_delay` 는 마지막 프레임이 머무는 시간이고 단위가 **센티초**다. 이것이 없으면
 * 마지막 프레임이 기본값 40ms 로 나가고 결과를 못 본 채 되감긴다 (MR-006).
 *
 * `paletteuse=diff_mode=rectangle` 은 붙이지 않는다. 용량을 줄일 것처럼 생겼는데
 * 실측하면 **한 바이트도 줄지 않는다** — 우리 GIF 는 화면 전체가 밀리거나 확대돼서
 * "변한 사각형" 이 언제나 프레임 전체다.
 */
export function ffmpegArgs({ concatPath, outputPath, width = 780, finalDelayMs = PACING.lastHoldMs }) {
  return [
    "-y",
    "-v", "error",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-filter_complex",
    `[0:v]scale=${width}:-2:flags=lanczos,split[s0][s1];` +
      `[s0]palettegen=stats_mode=diff:max_colors=${MAX_COLORS}[p];` +
      `[s1][p]paletteuse=dither=bayer:bayer_scale=${BAYER_SCALE}`,
    "-final_delay", String(Math.round(finalDelayMs / 10)),
    "-loop", "0",
    outputPath,
  ];
}
