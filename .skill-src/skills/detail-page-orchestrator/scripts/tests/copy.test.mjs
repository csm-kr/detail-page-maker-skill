// 고객 화면에 제작 과정이 새어 나가는 것을 막는다.
//
// 1회차 산출물에 이런 문장이 본문으로 나갔다.
//   "모르는 것은 모른다고 적었습니다"
//   "*유인 파장, 무독성은 공급처 표기가 없어 적지 않습니다"
//   "두 표기가 서로 달라 양쪽을 그대로 옮깁니다"
// 소비자에게 갈 문장이 아니다. AI 가 사용자에게 확인받으려는 말이다.

import assert from "node:assert/strict";
import test from "node:test";

import { producerLanguage } from "../lib/copy.mjs";

const hits = (value) => producerLanguage(value).map((hit) => hit.sample);

test("1회차에 실제로 나간 문장을 전부 잡는다", () => {
  const real = [
    "모르는 것은 모른다고 적었습니다",
    "유인 파장, 무독성, 어린이·반려동물 안전은 공급처 표기가 없어 적지 않습니다",
    "두 표기가 서로 달라 양쪽을 그대로 옮깁니다",
    "사진으로 확인되는 범위까지만 적었습니다",
    "확인되지 않은 성능·효능·인증은 적지 않았습니다",
    "공급처가 밝힌 대상 해충 범위 안에서만 적었습니다",
  ];
  for (const line of real) {
    assert.ok(producerLanguage(line).length > 0, `놓쳤다: ${line}`);
  }
});

test("제작 내부 용어를 잡는다", () => {
  for (const line of ["프롬프트로 생성", "SHA-256 해시", "QA 점수 97", "승인 상태: 대기"]) {
    assert.ok(producerLanguage(line).length > 0, `놓쳤다: ${line}`);
  }
});

test("정상 판매 카피는 잡지 않는다", () => {
  const fine = [
    "닿는 순간 끈끈하게 강력 접착력",
    "습기와 가벼운 비에도 생활방수",
    "구매 전에 사이즈를 확인하세요",
    "점착면 포획량과 먼지·이물 오염을 수시 확인",
    "실제 구매 옵션과 구성은 판매 페이지의 옵션명을 최종 확인해 주세요",
    "복잡한 조립 없이 벗기고 · 묶고 · 걸기",
    "어린이와 반려동물의 손발이 닿지 않는 위치에 설치하세요",
  ];
  for (const line of fine) {
    assert.deepEqual(hits(line), [], `잘못 잡았다: ${line}`);
  }
});

test("기준작 v4 의 본문은 한 건도 잡히지 않는다", async () => {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = await readFile(
    path.join(here, "..", "..", "references", "benchmark", "v4-reference.html"),
    "utf8",
  );
  const visible = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, "\n");
  assert.deepEqual(hits(visible), []);
});

test("찾은 위치를 문장으로 돌려준다", () => {
  const found = producerLanguage("가나다 공급처 표기가 없어 라마바");
  assert.equal(found.length, 1);
  assert.ok(found[0].sample.includes("공급처 표기가 없"));
});
