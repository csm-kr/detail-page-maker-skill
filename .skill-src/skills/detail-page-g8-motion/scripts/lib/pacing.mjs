// GIF 의 속도 하한. 옛 `references/motion.md` 의 규칙을 잰다.
//
//   MR-006  결과 상태를 최소 1초 유지한다
//   MR-018  모든 GIF 첫 프레임은 단독으로 1초 안에 이해돼야 한다
//   MR-019  좋은 loop 는 픽셀 경계뿐 아니라 지각적 연속성을 통과해야 한다
//
// 12게이트 재작성에서 이 문서가 통째로 빠졌다. 그래서 3회차 GIF 는 3프레임 0.48초로
// 나왔고 "너무 빨리 변해서 정신이 없다" 는 말을 들었다.
// 규칙을 문서로 되돌리지 않고 **숫자로** 되돌린다 — 문서는 안 읽히지만 게이트는 돈다.

export const PACING = {
  /** 첫 프레임. 여기서 무엇을 보는지 못 읽으면 나머지는 의미가 없다 (MR-018). */
  firstHoldMs: 800,
  /** 마지막 프레임 = 결과 상태. 여기가 짧으면 결론 없이 되감긴다 (MR-006). */
  lastHoldMs: 1000,
  /** 한 바퀴. 이보다 짧으면 읽기 전에 다시 시작한다. */
  totalMs: 2500,
  /** 상한. 상세페이지에서 이보다 길면 스크롤이 먼저 지나간다. */
  maxTotalMs: 12000,
  /** 장면이 바뀌는 GIF 의 프레임 하나. 보간 프레임에는 적용하지 않는다. */
  sceneMs: 900,
};

/**
 * @param timing `readGifTiming()` 의 결과
 * @param scenes 프레임 하나가 장면 하나인가 (tibo-sequence). 보간이면 false.
 */
export function pacingFaults(timing, { scenes = false } = {}) {
  const faults = [];
  const { frames, delaysMs, totalMs, firstMs, lastMs } = timing;

  if (frames < 2) {
    faults.push(`프레임이 ${frames}장이다. 움직이지 않는다`);
    return faults;
  }

  if (firstMs < PACING.firstHoldMs) {
    faults.push(`첫 프레임이 ${firstMs}ms 만 보인다 (하한 ${PACING.firstHoldMs}ms). 무엇을 보는지 읽을 시간이 없다`);
  }
  if (lastMs < PACING.lastHoldMs) {
    faults.push(`마지막 프레임이 ${lastMs}ms 만 보인다 (하한 ${PACING.lastHoldMs}ms). 결과를 보여 주고 되감아야 한다`);
  }
  if (totalMs < PACING.totalMs) {
    faults.push(`한 바퀴가 ${totalMs}ms 다 (하한 ${PACING.totalMs}ms). 읽기 전에 다시 시작한다`);
  }
  if (totalMs > PACING.maxTotalMs) {
    faults.push(`한 바퀴가 ${totalMs}ms 로 너무 길다 (상한 ${PACING.maxTotalMs}ms)`);
  }
  if (scenes) {
    const quick = delaysMs.filter((ms) => ms < PACING.sceneMs).length;
    if (quick > 0) {
      faults.push(`장면 ${quick}개가 ${PACING.sceneMs}ms 미만이다. 장면이 바뀌면 읽을 시간을 준다`);
    }
  }
  return faults;
}
