// 수집 경로 선택 — 예전에 검증된 추출기를 1급 경로로 쓴다.
//
// 3회차 실테스트에서 드러난 것: 내가 CDP 캡처를 새로 짜는 동안 이미 검증된
// `coupang-extractor` 와 `dmk-extractor` 가 번들에 들어 있었다. 내장 캡처에는
// ACCESS_BLOCKED 판정, 상품 ID 대조, 후기 수집, 개인정보 마스킹이 전부 없다.
// 그러므로 아는 호스트는 추출기로 보내고, 내장 캡처는 그 외 페이지용으로만 남긴다.

import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { EXTRACTORS, chooseExtractor } from "../lib/extract.mjs";
import { SKILLS_ROOT } from "./fixture.mjs";

test("도매꾹은 dmk-extractor 로 보낸다", () => {
  const picked = chooseExtractor("https://domeggook.com/55873582");
  assert.equal(picked?.skill, "dmk-extractor");
});

test("쿠팡은 coupang-extractor 로 보낸다", () => {
  const picked = chooseExtractor(
    "https://www.coupang.com/vp/products/9516545017?itemId=28375543183",
  );
  assert.equal(picked?.skill, "coupang-extractor");
});

test("www 접두사와 쿼리스트링이 선택을 흔들지 않는다", () => {
  const bare = chooseExtractor("https://domeggook.com/60851997");
  const dressed = chooseExtractor("https://www.domeggook.com/60851997?from=lstGen");
  assert.equal(bare?.skill, dressed?.skill);
});

test("모르는 호스트는 추출기가 없다 — 내장 캡처로 간다", () => {
  assert.equal(chooseExtractor("https://example.com/hello"), null);
});

test("호스트 문자열 포함만으로 속지 않는다", () => {
  // `coupang.com.evil.kr` 은 쿠팡이 아니다. 부분 일치로 고르면 남의 사이트에
  // 쿠팡 선택자를 들이댄다.
  assert.equal(chooseExtractor("https://coupang.com.evil.kr/vp/products/1"), null);
});

test("추출기가 지목한 스킬이 실제로 번들에 있다", async () => {
  // 번들에서 빠지면 조용히 내장 캡처로 떨어지는 대신 여기서 잡힌다.
  for (const entry of EXTRACTORS) {
    const dir = path.join(SKILLS_ROOT, "detail-page-orchestrator", ".agents", "skills", entry.skill);
    await access(path.join(dir, "SKILL.md"));
    await access(path.join(dir, "scripts", entry.entry));
  }
});

test("추출기는 browser-harness 명령을 요구한다고 밝힌다", () => {
  // 이 사실을 숨기면 다른 기계에서 이유 없이 실패한다.
  for (const entry of EXTRACTORS) {
    assert.equal(entry.requires, "browser-harness");
  }
});
