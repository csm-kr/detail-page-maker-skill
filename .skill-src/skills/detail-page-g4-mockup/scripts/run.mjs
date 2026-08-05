#!/usr/bin/env node
// G4 목업. 첫 줄이 선행 게이트 검사다.

import { checklist, guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";

try {
  const ctx = await guard("G4");
  checklist({
    gate: ctx.gate,
    items: [
          "`references/templates.md` 를 **전량** 읽고 블록을 빠뜨리지 않고 조립한다",
          "컷마다 **무드 레퍼런스를 최소 1장** 붙인다. identity 사진만으로는 톤이 나오지 않는다",
          "얼굴 정책(`policy.model_face`)을 프롬프트에 문자로 주입한다",
          "**한 대화에서 4장씩** 받는다. 병렬 탭은 다른 대화가 되어 톤이 갈린다",
          "받은 파일을 섹션과 **1:1로 분류해 기록**한다. 개수만 세면 콜라주와 중복을 놓친다",
          "목업 픽셀에서 팔레트·타이포·구성 요소를 실측해 `DESIGN-GUIDE.md` 를 쓴다",
          "`harvest.md` 에 **무엇을 가져오고 무엇을 안 가져오는지** 적는다"
    ],
    reading: [
          "references/templates.md",
          "references/design-reference.md"
    ],
  });
} catch (error) {
  refuse(error);
}
