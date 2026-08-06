// 판매 서사 계약. `references/sales-story.md` 의 표가 이 파일과 짝이다.
//
// 기준작 v4 가 실제로 하는 것만 강제한다. 옛 정본은 "불편 3~5개를 인용 말풍선으로" 까지
// 요구했지만 v4 는 그렇게 하지 않고도 좋았다. 기준작이 못 지키는 규칙은 규칙이 아니다.

export const ROLES = [
  "hero",
  "pain",
  "solution",
  "compare",
  "usage",
  "spec",
  "caution",
  "closing",
];

const MIN_SOLUTIONS = 3;

/** 어긋난 것을 사람이 읽을 문장으로. 빈 배열이면 통과다. */
export function storyFaults(sections) {
  const list = sections ?? [];
  const faults = [];

  if (list.length === 0) return ["섹션이 없다"];

  for (const item of list) {
    if (!item?.role) {
      faults.push(`섹션 ${item?.id ?? "?"} 에 role 이 없다 (${ROLES.join(" / ")})`);
    } else if (!ROLES.includes(item.role)) {
      faults.push(`섹션 ${item.id ?? "?"} 의 role 이 모르는 값이다: ${item.role}`);
    }
  }

  const roles = list.map((item) => item?.role);
  const count = (role) => roles.filter((value) => value === role).length;

  if (roles[0] !== "hero") faults.push("첫 섹션의 role 이 hero 가 아니다");
  if (count("hero") !== 1) faults.push(`hero 가 ${count("hero")}개다. 정확히 하나여야 한다`);
  if (count("closing") !== 1) {
    faults.push(`closing 이 ${count("closing")}개다. 정확히 하나여야 한다`);
  } else if (roles[roles.length - 1] !== "closing") {
    faults.push("마지막 섹션의 role 이 closing 이 아니다");
  }
  if (count("spec") < 1) faults.push("규격 섹션(spec)이 없다");

  if (count("solution") < MIN_SOLUTIONS) {
    faults.push(
      `장점 섹션(solution)이 ${count("solution")}개다. ${MIN_SOLUTIONS}개 이상이어야 한다`,
    );
  }

  const firstPain = roles.indexOf("pain");
  const firstSolution = roles.indexOf("solution");
  if (firstPain === -1) {
    faults.push("문제 섹션(pain)이 없다. 장점부터 시작하지 않는다");
  } else if (firstSolution !== -1 && firstPain > firstSolution) {
    faults.push("문제 섹션(pain)이 첫 장점(solution)보다 앞에 있어야 한다");
  }

  return faults;
}
