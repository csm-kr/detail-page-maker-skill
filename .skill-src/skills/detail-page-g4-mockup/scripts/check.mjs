// G4 판정. templates.md 미개봉, 무드 레퍼런스 0장, 콜라주·중복을 잡는다.

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  headings,
  hexes,
  json,
  listFiles,
  policy,
  text,
  want,
} from "../../detail-page-orchestrator/scripts/lib/checkkit.mjs";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function check({ workspace, project }) {
  const reasons = [];
  const guide = await text(project, path.join("work", "design-ref", "DESIGN-GUIDE.md"));
  const harvest = await text(project, path.join("work", "design-ref", "harvest.md"));
  const index = await json(project, path.join("work", "design-ref", "mockup-index.json"));
  const plan = await json(project, path.join("work", "flow-plan.draft.json"));
  const { model_face: modelFace } = await policy(workspace);

  // 1. templates.md 의 블록이 보낸 프롬프트에 전량 반영됐는가.
  const template = await text(SKILL_ROOT, path.join("references", "templates.md"));
  const sentDir = path.join(project, "work", "design-ref", "prompts-sent");
  const sent = await listFiles(sentDir, /\.(md|txt)$/);
  let sentText = "";
  for (const file of sent) sentText += (await text(sentDir, file)) ?? "";

  want(reasons, sent.length > 0, "work/design-ref/prompts-sent/ 가 비어 있다. 보낸 프롬프트를 남긴다");

  if (template) {
    const blocks = headings(template, 2).map((title) => title.replace(/^\d+\.\s*/, ""));
    const missing = blocks.filter((block) => !sentText.includes(block));
    want(
      reasons,
      missing.length === 0,
      `templates.md 의 블록이 프롬프트에 빠졌다 (${missing.length}/${blocks.length}): ${missing.slice(0, 5).join(" · ")}`,
    );
  } else {
    reasons.push("references/templates.md 가 이 스킬 안에 없다. G4 는 이 문서를 전량 읽는다");
  }

  // 2. 무드 레퍼런스. identity 사진만으로는 톤이 나오지 않는다.
  const moods = await listFiles(
    path.join(project, "work", "design-ref", "mood"),
    /\.(png|jpe?g|webp)$/i,
  );
  want(
    reasons,
    moods.length > 0,
    "work/design-ref/mood/ 에 무드 레퍼런스가 없다. 컷마다 최소 1장을 붙인다",
  );

  // 3. 섹션↔파일 1:1. 개수만 세면 콜라주와 중복을 놓친다.
  if (!index) {
    reasons.push(
      "work/design-ref/mockup-index.json 이 없다. 섹션↔목업 파일 1:1 분류를 기록한다",
    );
  } else if (plan) {
    const wanted = (plan.sections ?? []).map((s) => s.id);
    const mapped = index.sections ?? {};
    const missing = wanted.filter((id) => !mapped[id]);
    want(reasons, missing.length === 0, `목업이 없는 섹션: ${missing.join(", ")}`);

    const files = Object.values(mapped).flat();
    const dupes = files.filter((file, i) => files.indexOf(file) !== i);
    want(reasons, dupes.length === 0, `한 목업 파일이 여러 섹션에 쓰였다: ${[...new Set(dupes)].join(", ")}`);

    const collages = Object.entries(mapped).filter(([, value]) => Array.isArray(value) && value.length > 1);
    for (const [id, value] of collages) {
      want(reasons, false, `섹션 ${id} 에 파일이 ${value.length}개다. 한 섹션은 한 파일이다 (콜라주 의심)`);
    }
  }

  // 4. 얼굴 정책 주입.
  if (modelFace) {
    want(
      reasons,
      sentText.includes(modelFace) || new RegExp(modelFace.replace(/-/g, ".?"), "i").test(sentText),
      `얼굴 정책 "${modelFace}" 이 보낸 프롬프트에 없다`,
    );
  } else {
    reasons.push("policy.model_face 가 없다. init 인터뷰에서 답한다");
  }

  // 5. 가이드에 실측이 있는가.
  if (guide) {
    want(
      reasons,
      hexes(guide).length >= 4,
      `DESIGN-GUIDE.md 의 실측 hex 가 ${hexes(guide).length}개다. 목업 픽셀에서 뽑는다`,
    );
    want(
      reasons,
      /##\s*구성 요소|##\s*컴포넌트/.test(guide),
      "DESIGN-GUIDE.md 에 구성 요소 절이 없다. 팔레트만 뽑으면 G7 이 옮길 것이 없다",
    );
  }

  // 6. 수확 계획. 무엇을 안 가져오는지도 적어야 한다.
  if (harvest) {
    want(
      reasons,
      /수확 금지|가져오지 않/.test(harvest),
      "harvest.md 에 수확 금지 항목이 없다. 한글 텍스트와 목업 비율은 가져오지 않는다",
    );
  }

  return { reasons };
}
