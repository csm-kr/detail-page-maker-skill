// 게이트 정의의 유일한 출처. docs/ARCHITECTURE.md §3 이 이 파일과 짝이다.
//
// 다른 어떤 문서에도 순서를 다시 적지 않는다. 적으면 갈린다.
// 순서 목록 중복 기재는 tests/order.test.mjs 가 막는다.
//
// 경로 규칙
//   "ws:…"  워크스페이스 기준
//   그 외    프로젝트 기준
//
// actor
//   agent   판단이다. run.mjs 는 체크리스트만 출력하고 멈춘다
//   script  결정적이다. run.mjs 가 일을 한다
//   mixed   스크립트가 만들고 사람·에이전트가 판단한다
//
// reads
//   그 게이트를 도는 세션이 **읽어야 하는 정본**. 스킬 트리 기준 상대 경로다.
//   헤드리스 실행(`gate <id> --exec`)의 컨텍스트 팩이 이 목록을 본문으로 넣는다.
//   여기 없는 문서는 그 게이트에 안 들어간다 — 통째로 붓지 않는 것이 요점이다.
//   스크립트가 프로그램적으로 읽는 파일은 넣지 않는다. 그건 코드의 입력이지
//   판단의 근거가 아니다 (예: G4 의 templates.md 는 assemblePrompt 가 읽는다).

export const GATES = [
  {
    id: "INIT",
    skill: "detail-page-init",
    deps: [],
    actor: "mixed",
    budgetMin: null,
    title: "환경 잠금",
    summary: "인터뷰·로컬 세팅·정리. 워크스페이스 1회",
    reads: [],
    inputs: [],
    outputs: ["ws:work/env.lock.json"],
  },
  {
    id: "G0",
    skill: null, // 오케스트레이터의 start 명령이다
    deps: ["INIT"],
    actor: "script",
    budgetMin: 1,
    title: "진입",
    summary: "프로젝트 생성. 두 URL 과 사진을 잠근다",
    reads: [],
    inputs: ["ws:work/env.lock.json"],
    outputs: ["work/inputs.lock.json"],
  },
  {
    id: "G1",
    skill: "detail-page-g1-fact",
    deps: ["G0"],
    actor: "agent",
    budgetMin: 8,
    title: "사실 잠금",
    summary: "공급처와 사진에서 공개에 필요한 사실만 잠근다",
    reads: [
      "detail-page-g1-fact/references/commercial.md",
    ],
    inputs: ["work/inputs.lock.json"],
    outputs: ["work/SSOT.md"],
  },
  {
    id: "G2",
    skill: "detail-page-g2-reference",
    deps: ["G0"],
    actor: "agent",
    budgetMin: 10,
    title: "기준작 판독",
    summary: "쿠팡 기준작에서 흐름과 디자인 분위기를 뽑는다",
    reads: [
      "detail-page-g1-fact/references/commercial.md",
      "detail-page-orchestrator/references/sales-story.md",
    ],
    inputs: ["work/inputs.lock.json"],
    outputs: ["work/flow-map.md"],
  },
  {
    id: "G3",
    skill: "detail-page-g3-plan",
    deps: ["G1", "G2"],
    actor: "agent",
    budgetMin: 12,
    title: "플랜",
    summary: "화면 문자열을 전량 담은 Lean Page Plan 초안",
    reads: [
      "detail-page-orchestrator/references/sales-story.md",
      "detail-page-orchestrator/references/benchmark/BENCHMARK.md",
      "detail-page-g9-build/references/art-direction.md",
    ],
    inputs: ["work/SSOT.md", "work/flow-map.md"],
    outputs: ["work/flow-plan.draft.json"],
  },
  {
    id: "G4",
    skill: "detail-page-g4-mockup",
    deps: ["G3"],
    actor: "agent",
    budgetMin: 23,
    title: "목업",
    summary: "templates.md 전량 조립 → 목업 → 가이드와 수확 계획",
    reads: [
      "detail-page-g4-mockup/references/design-reference.md",
      "detail-page-orchestrator/references/benchmark/BENCHMARK.md",
    ],
    inputs: ["work/flow-plan.draft.json"],
    outputs: [
      "work/design-ref/DESIGN-GUIDE.md",
      "work/design-ref/harvest.md",
    ],
  },
  {
    id: "G5",
    skill: "detail-page-g5-inject",
    deps: ["G4"],
    actor: "mixed",
    budgetMin: 2,
    title: "무드 주입",
    summary: "가이드를 플랜에 주입해 발행 플랜을 만든다",
    reads: [
      "detail-page-g9-build/references/art-direction.md",
    ],
    inputs: [
      "work/design-ref/DESIGN-GUIDE.md",
      "work/flow-plan.draft.json",
    ],
    outputs: ["flow-plan.json"],
  },
  {
    id: "G6",
    skill: "detail-page-g6-stills",
    deps: ["G5"],
    actor: "mixed",
    budgetMin: 12,
    title: "스틸",
    summary: "스틸 생성 후 원본 해상도로 선별한다",
    reads: [
      "detail-page-g6-stills/references/assets.md",
    ],
    inputs: ["flow-plan.json"],
    outputs: ["work/selection.json"],
  },
  {
    id: "G7",
    skill: "detail-page-g7-layout",
    deps: ["G4", "G6"],
    actor: "agent",
    budgetMin: 8,
    title: "레이아웃",
    summary: "섹션별 레이아웃과 컴포넌트 구현 수단을 정한다",
    reads: [
      "detail-page-g11-deliver/references/studio.md",
      "detail-page-g9-build/references/pipeline.md",
    ],
    inputs: [
      "work/design-ref/harvest.md",
      "work/selection.json",
      "flow-plan.json",
    ],
    outputs: ["work/page-plan.md"],
  },
  {
    id: "G8",
    skill: "detail-page-g8-motion",
    deps: ["G7"],
    actor: "mixed",
    budgetMin: 10,
    title: "모션",
    summary: "brief 로 컴포지션을 다시 쓰고 GIF 를 굽는다",
    reads: [
      "detail-page-g8-motion/references/render-path.md",
    ],
    inputs: ["work/page-plan.md", "flow-plan.json"],
    outputs: ["work/comps/index.json"],
  },
  {
    id: "G9",
    skill: "detail-page-g9-build",
    deps: ["G7"],
    actor: "script",
    budgetMin: 6,
    title: "조립",
    summary: "폭 780px HTML 과 앵커 스냅샷",
    reads: [],
    inputs: ["work/page-plan.md", "flow-plan.json"],
    outputs: ["output/detail-page.html", "work/anchors.json"],
  },
  {
    id: "G10",
    skill: "detail-page-g10-qa",
    deps: ["G8", "G9"],
    actor: "script",
    budgetMin: 3,
    title: "QA",
    summary: "strict-media 와 포맷·용량",
    reads: [],
    inputs: [
      "output/detail-page.html",
      "work/anchors.json",
      "work/comps/index.json",
    ],
    outputs: ["work/qa-report.json"],
  },
  {
    id: "G11",
    skill: "detail-page-g11-deliver",
    deps: ["G10"],
    actor: "mixed",
    budgetMin: 5,
    title: "납품",
    summary: "authoring·Studio·Wing·보고. 죽인 서버를 되살린다",
    reads: [
      "detail-page-g11-deliver/references/studio.md",
    ],
    inputs: ["work/qa-report.json"],
    outputs: ["work/report.md"],
  },
];

/** 오케스트레이터가 관리하는 게이트. INIT 은 전제이므로 뺀다. */
export const RUN_GATES = GATES.filter((gate) => gate.id !== "INIT");

const BY_ID = new Map(GATES.map((gate) => [gate.id, gate]));

export function gate(id) {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`UNKNOWN_GATE ${id}`);
  return found;
}

/** id 가 정의 순서를 따르는지. 표 출력과 전파에 쓴다. */
export function order(id) {
  return GATES.findIndex((g) => g.id === id);
}

/** 이 게이트를 선행으로 삼는 게이트들 (직접 하류). */
export function children(id) {
  return GATES.filter((g) => g.deps.includes(id));
}

/** 하류 전체 (전이 폐쇄). 무효화 전파가 쓴다. */
export function descendants(id) {
  const out = new Set();
  const stack = [id];
  while (stack.length > 0) {
    for (const child of children(stack.pop())) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      stack.push(child.id);
    }
  }
  return [...out];
}

/** 병렬로 띄울 수 있는 묶음. 선행이 모두 끝난 것끼리 같은 층이 된다. */
export function layers() {
  const done = new Set();
  const result = [];
  const remaining = RUN_GATES.map((g) => g.id);
  while (remaining.length > 0) {
    const ready = remaining.filter((id) =>
      gate(id).deps.every((dep) => dep === "INIT" || done.has(dep)),
    );
    if (ready.length === 0) throw new Error("GATE_CYCLE");
    result.push(ready);
    for (const id of ready) {
      done.add(id);
      remaining.splice(remaining.indexOf(id), 1);
    }
  }
  return result;
}

/** 예산 합계. 같은 층은 최댓값만 센다 (병렬). */
export function budgetTotalMin() {
  return layers().reduce(
    (sum, layer) =>
      sum + Math.max(...layer.map((id) => gate(id).budgetMin ?? 0)),
    0,
  );
}
