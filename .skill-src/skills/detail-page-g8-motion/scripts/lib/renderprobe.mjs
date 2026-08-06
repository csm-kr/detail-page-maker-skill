// 렌더 경로 프로브 — 굽기 전에 경로가 예산 안에 도는지 실측하고, 그 결과를 한 줄로 넘긴다.
//
// 3회차: hyperframes CLI 가 240초에 타임아웃 → Chrome 스크린샷으로 우회 → **우회가 굳었다.**
// 의존성(3.3MB · 파일 259개)은 계속 벤더링돼 있었고 문서는 계속 hyperframes 를 가리켰다.
// 아무도 다시 재지 않았기 때문이다.
//
// 그래서 재는 것을 게이트로 만든다. 죽은 경로는 죽었다고, 느린 경로는 느리다고 적힌다.
// 우회 자체가 잘못이 아니다 — **우회했다는 사실이 안 적히는 것**이 잘못이다.

/** 3회차에 타임아웃한 값 그대로. 늘려서 통과시키지 않는다. */
export const RENDER_BUDGET_MS = 240_000;

/** 하루 지난 실측은 근거가 아니다. 런타임도 캐시도 그 사이에 바뀐다. */
export const PROBE_MAX_AGE_H = 24;

const sec = (ms) => `${(ms / 1000).toFixed(1)}초`;

/** 경로 하나의 판정. */
export function probeVerdict({ ok, elapsedMs, error }) {
  if (!ok) {
    return { status: "dead", line: `죽었다 (${sec(elapsedMs)}) — ${error ?? "이유 없음"}` };
  }
  if (elapsedMs > RENDER_BUDGET_MS) {
    return {
      status: "slow",
      line: `예산 초과 ${sec(elapsedMs)} > ${sec(RENDER_BUDGET_MS)} (${RENDER_BUDGET_MS / 1000}초)`,
    };
  }
  return { status: "alive", line: `${sec(elapsedMs)}` };
}

function verdicts(probe) {
  return (probe?.paths ?? []).map((path) => ({
    ...path,
    ...probeVerdict({ ok: path.ok, elapsedMs: path.elapsed_ms ?? 0, error: path.error }),
  }));
}

/** 게이트가 쓰는 사유. 살아 있는 경로가 하나라도 있으면 통과다. */
export function probeFaults(probe, nowMs = Date.now()) {
  if (!probe) {
    return [
      "렌더 경로를 재지 않았다. `run.mjs --probe` 로 예산 안에 도는지 먼저 확인한다 — 3회차에 안 재서 우회가 굳었다",
    ];
  }
  const ageH = (nowMs - Date.parse(probe.at)) / 3600000;
  if (!Number.isFinite(ageH) || ageH > PROBE_MAX_AGE_H) {
    return [`렌더 프로브가 오래됐다 (${Math.round(ageH)}시간). \`run.mjs --probe\` 로 다시 잰다`];
  }
  const rows = verdicts(probe);
  if (rows.some((row) => row.status === "alive")) return [];
  return [
    `살아 있는 렌더 경로가 없다 — ${rows.map((row) => `${row.name}: ${row.line}`).join(" · ")}`,
  ];
}

/** 컨텍스트 팩과 체크리스트가 같이 쓰는 한 줄. */
export function probeLine(probe, nowMs = Date.now()) {
  if (!probe) return "렌더 경로를 재지 않았다 (`run.mjs --probe`)";
  const ageH = Math.round((nowMs - Date.parse(probe.at)) / 3600000);
  const rows = verdicts(probe).map((row) => `${row.name} ${row.line}`);
  return `렌더 경로 (${ageH}시간 전 실측 · 예산 ${RENDER_BUDGET_MS / 1000}초): ${rows.join(" · ")}`;
}
