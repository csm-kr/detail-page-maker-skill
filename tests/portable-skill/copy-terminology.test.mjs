import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCopyTerminology,
  visibleTextFromHtml,
} from "../../skills/detail-page-maker-skill/scripts/maintenance/validate-copy-terminology.mjs";

test("공개 카피 검사는 script와 style을 제외한 고객 텍스트만 읽는다", () => {
  const text = visibleTextFromHtml(
    "<style>.x{content:'어떤 스타일에도'}</style><h1>세로 플리츠</h1><script>const x='주름이 살랑';</script>",
  );
  assert.equal(text, "세로 플리츠");
});

test("브랜드를 감성 동사로 쓰거나 장점명을 설명 없이 반복하면 실패한다", () => {
  const result = validateCopyTerminology({
    brand: "살랑",
    html: "<h1>주름이 살랑.</h1><p>루즈핏 쿨토시</p>",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /분위기 문구/);
  assert.match(result.errors.join("\n"), /브랜드명/);
  assert.match(result.errors.join("\n"), /루즈핏/);
});

test("브랜드를 식별자로 두고 장점명을 구조 용어로 정의하면 통과한다", () => {
  const result = validateCopyTerminology({
    brand: "살랑",
    html: [
      "<title>살랑 루즈핏 쿨토시</title>",
      "<h1>팔에 달라붙지 않는 루즈핏</h1>",
      "<p>세로 플리츠가 팔을 따라 여유 있게 남는 구조입니다.</p>",
      "<dl><dt>제조사</dt><dd>살랑</dd></dl>",
    ].join(""),
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("손등 커프 같은 내부 부품어는 고객 용어로 교체한다", () => {
  const failed = validateCopyTerminology({
    html: "<h1>엄지홀 다음에 손등 커프가 이어집니다.</h1>",
  });
  assert.equal(failed.ok, false);
  assert.match(failed.errors.join("\n"), /손등 커프/);

  const passed = validateCopyTerminology({
    html: "<h1>엄지홀 다음에 손등까지 이어집니다.</h1>",
  });
  assert.equal(passed.ok, true);
});
