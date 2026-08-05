// 인터뷰. 탐지로 알 수 없는 것만 묻는다.
//
// 프로젝트마다 달라지는 것(URL·사진)은 여기서 묻지 않는다. orchestrate start 의 입력이다.
// init 은 워크스페이스 1회이므로 프로젝트 질문을 섞으면 두 번째 프로젝트에서 옛 답이
// 조용히 재사용된다.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

export class InterviewError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.code = code;
  }
}

const FACE_VALUES = ["none", "crop-below-chin", "allow"];

/**
 * 질문 목록. `required: true` 는 기본값이 없다는 뜻이다.
 * 얼굴 정책이 그렇다 — 조용히 정해지면 그것이 내 판단이었는지 사용자 뜻이었는지
 * 구분할 수 없어진다.
 */
export const QUESTIONS = [
  {
    key: "hosts",
    prompt: "어느 호스트에 설치할까 (1 둘 다 / 2 Claude Code / 3 Codex)",
    fallback: ["claude-code", "codex"],
    parse: (raw) =>
      ({ 1: ["claude-code", "codex"], 2: ["claude-code"], 3: ["codex"] })[raw.trim()] ?? null,
  },
  {
    key: "project_root",
    prompt: "프로젝트 루트",
    fallback: "./projects",
    parse: (raw) => (raw.trim() === "" ? "./projects" : raw.trim()),
  },
  {
    key: "model_face",
    prompt: `모델 얼굴을 어떻게 하나 (${FACE_VALUES.join(" / ")})`,
    required: true,
    parse: (raw) => (FACE_VALUES.includes(raw.trim()) ? raw.trim() : null),
    help:
      "스킬 규칙이 아니라 선택이다. 2회차에 근거 없이 금지로 굳혀 히어로에 스크림을 깔았다.\n" +
      "  none            얼굴을 넣지 않는다\n" +
      "  crop-below-chin 턱 아래만 쓴다\n" +
      "  allow           허용한다 (동일 인물 유지를 선별에서 검사한다)",
  },
  {
    key: "chatgpt_login",
    prompt: "브라우저에 ChatGPT 로그인이 되어 있나 (y/n)",
    fallback: false,
    parse: (raw) => /^y/i.test(raw.trim()),
  },
  {
    key: "vendor_hyperframes",
    prompt: "hyperframes 를 프로젝트-로컬로 벤더링할까 (y/n)",
    fallback: true,
    parse: (raw) => (raw.trim() === "" ? true : /^y/i.test(raw.trim())),
  },
  {
    key: "media_budget_mb",
    prompt: "미디어 총량 상한 (MB)",
    fallback: 12,
    parse: (raw) => (raw.trim() === "" ? 12 : Number(raw.trim()) || null),
  },
  {
    key: "photo_format",
    prompt: "사진 포맷 (webp-q85 / jpeg-q88 / png)",
    fallback: "webp-q85",
    parse: (raw) =>
      raw.trim() === "" ? "webp-q85" : ["webp-q85", "jpeg-q88", "png"].includes(raw.trim()) ? raw.trim() : null,
  },
  {
    key: "capture_max_age_days",
    prompt: "공급처 캡처 유효기간 (일)",
    fallback: 7,
    parse: (raw) => (raw.trim() === "" ? 7 : Number(raw.trim()) || null),
  },
  {
    key: "wallclock_target_min",
    prompt: "벽시계 목표 (분)",
    fallback: 95,
    parse: (raw) => (raw.trim() === "" ? 95 : Number(raw.trim()) || null),
  },
];

export function answersPath(workspace) {
  return path.join(workspace, "work", "env.answers.json");
}

export async function readAnswers(workspace) {
  try {
    return JSON.parse(await readFile(answersPath(workspace), "utf8"));
  } catch {
    return {};
  }
}

export async function writeAnswers(workspace, answers) {
  await mkdir(path.dirname(answersPath(workspace)), { recursive: true });
  await writeFile(answersPath(workspace), `${JSON.stringify(answers, null, 2)}\n`, "utf8");
}

/** 필수 항목이 채워졌는지. 무인 실행에서 조용히 넘어가지 않게 만드는 곳이다. */
export function validate(answers) {
  for (const question of QUESTIONS) {
    const value = answers[question.key];
    if (question.required && (value === undefined || value === null || value === "")) {
      throw new InterviewError(
        question.key === "model_face" ? "MODEL_FACE_MISSING" : "ANSWER_MISSING",
        `${question.key} 에 답이 없다. 기본값을 두지 않는다.\n${question.help ?? ""}`,
      );
    }
  }
  if (answers.model_face && !FACE_VALUES.includes(answers.model_face)) {
    throw new InterviewError(
      "MODEL_FACE_MISSING",
      `model_face 가 ${FACE_VALUES.join(" / ")} 중 하나가 아니다: ${answers.model_face}`,
    );
  }
  return answers;
}

/** 대화형. 이미 답한 것은 다시 묻지 않는다. */
export async function ask(workspace, existing = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answers = { ...existing };
  try {
    for (const question of QUESTIONS) {
      if (answers[question.key] !== undefined && answers[question.key] !== null) continue;
      if (question.help) process.stdout.write(`\n${question.help}\n`);
      while (true) {
        const suffix =
          question.required
            ? " (필수)"
            : ` [${Array.isArray(question.fallback) ? "둘 다" : question.fallback}]`;
        const raw = await rl.question(`${question.prompt}${suffix}: `);
        const parsed = question.parse(raw);
        if (parsed !== null && parsed !== undefined) {
          answers[question.key] = parsed;
          break;
        }
        if (!question.required && raw.trim() === "") {
          answers[question.key] = question.fallback;
          break;
        }
        process.stdout.write("  다시 답한다.\n");
      }
    }
  } finally {
    rl.close();
  }
  return validate(answers);
}
