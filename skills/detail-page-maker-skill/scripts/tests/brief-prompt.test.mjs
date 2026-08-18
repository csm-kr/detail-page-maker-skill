import assert from "node:assert/strict";
import test from "node:test";

import {
  BRIEF_FIELDS,
  loadBriefPromptTemplate,
  normalizeBrief,
  renderBriefPrompt,
  validateBrief,
} from "../lib/brief-prompt.mjs";

/** 인터뷰를 통과한 정상 브리프. */
function completeBrief(overrides = {}) {
  return {
    supplier_url: "https://www.domeggook.com/65698861?from=lstGen",
    coupang_url:
      "https://www.coupang.com/vp/products/9516545017?itemId=28375543183&vendorItemId=95327801456",
    photos: "끈끈이.zip",
    brand: "살랑",
    product_name: "루즈핏 팔토시",
    notes: "gif 적극 사용, 자외선 차단 강조",
    ...overrides,
  };
}

test("BRIEF_FIELDS는 인터뷰가 받아내야 할 6개 항목을 고정한다", () => {
  const keys = BRIEF_FIELDS.map((field) => field.key);
  assert.deepEqual(keys, [
    "supplier_url",
    "coupang_url",
    "photos",
    "brand",
    "product_name",
    "notes",
  ]);
  const required = BRIEF_FIELDS.filter((field) => field.required).map(
    (field) => field.key,
  );
  assert.deepEqual(required, [
    "supplier_url",
    "coupang_url",
    "brand",
    "product_name",
  ]);
});

test("필수 항목이 비면 어떤 항목을 다시 물어야 하는지 알려준다", () => {
  const report = validateBrief({ photos: "", notes: "" });
  assert.equal(report.ok, false);
  assert.deepEqual(report.missing, [
    "supplier_url",
    "coupang_url",
    "brand",
    "product_name",
  ]);
  for (const item of report.missing) {
    const question = report.followups.find((entry) => entry.key === item);
    assert.ok(question, `${item} 재질문이 없다`);
    assert.ok(question.question.length > 0);
  }
});

test("공백만 넣은 답은 안 받은 것으로 처리한다", () => {
  const report = validateBrief(completeBrief({ brand: "   " }));
  assert.equal(report.ok, false);
  assert.ok(report.missing.includes("brand"));
});

test("공급처 URL이 http(s)가 아니면 되묻는다", () => {
  const report = validateBrief(completeBrief({ supplier_url: "도매꾹에서 봤음" }));
  assert.equal(report.ok, false);
  const issue = report.issues.find((entry) => entry.key === "supplier_url");
  assert.ok(issue);
  assert.equal(issue.code, "not_a_url");
});

test("쿠팡 URL이 coupang.com이 아니면 되묻는다", () => {
  const report = validateBrief(
    completeBrief({ coupang_url: "https://smartstore.naver.com/x/123" }),
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((entry) => entry.key === "coupang_url");
  assert.equal(issue.code, "not_coupang");
});

test("쿠팡 URL이 상품 상세(/vp/products/)가 아니면 되묻는다", () => {
  const report = validateBrief(
    completeBrief({ coupang_url: "https://www.coupang.com/np/search?q=팔토시" }),
  );
  assert.equal(report.ok, false);
  const issue = report.issues.find((entry) => entry.key === "coupang_url");
  assert.equal(issue.code, "not_product_page");
});

test("제품명이 일반명사 한 덩어리면 더 구체적으로 되묻는다", () => {
  const report = validateBrief(completeBrief({ product_name: "팔토시" }));
  assert.equal(report.ok, false);
  const issue = report.issues.find((entry) => entry.key === "product_name");
  assert.equal(issue.code, "too_generic");
  assert.ok(issue.question.includes("팔토시"));
});

test("제품명이 수식어를 포함하면 통과한다", () => {
  const report = validateBrief(completeBrief());
  assert.equal(report.ok, true);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.issues, []);
});

test("실제 사진과 추가 의견은 없어도 통과하고 각각 확인 안내만 남긴다", () => {
  const report = validateBrief(completeBrief({ photos: "", notes: "" }));
  assert.equal(report.ok, true);
  const keys = report.notices.map((entry) => entry.key);
  assert.ok(keys.includes("photos"));
  assert.ok(keys.includes("notes"));
});

test("템플릿 주석 마커를 값에 넣으면 거부한다", () => {
  const report = validateBrief(completeBrief({ notes: "정상 <!--BLOCK:install--> 주입" }));
  assert.equal(report.ok, false);
  const issue = report.issues.find((entry) => entry.key === "notes");
  assert.equal(issue.code, "unsafe_marker");
});

test("normalizeBrief는 앞뒤 공백과 제어문자를 정리한다", () => {
  const brief = normalizeBrief(
    completeBrief({ brand: "  살랑\u0000  ", notes: "첫줄\r\n둘째줄" }),
  );
  assert.equal(brief.brand, "살랑");
  assert.equal(brief.notes, "첫줄\n둘째줄");
});

test("완성 프롬프트에 인터뷰에서 받은 값이 모두 들어간다", () => {
  const brief = completeBrief();
  const prompt = renderBriefPrompt(brief, { installed: true });
  for (const value of [
    brief.supplier_url,
    brief.coupang_url,
    brief.photos,
    brief.brand,
    brief.product_name,
    brief.notes,
  ]) {
    assert.ok(prompt.includes(value), `프롬프트에 ${value}가 없다`);
  }
});

test("치환되지 않은 자리표시자가 남지 않는다", () => {
  const prompt = renderBriefPrompt(completeBrief(), { installed: true });
  assert.equal(/\{\{[^}]+\}\}/u.test(prompt), false);
  assert.equal(prompt.includes("<!--BLOCK:"), false);
});

test("설치가 끝난 환경이면 #1 설치 섹션을 빼고, 아니면 넣는다", () => {
  const installed = renderBriefPrompt(completeBrief(), { installed: true });
  const notInstalled = renderBriefPrompt(completeBrief(), { installed: false });
  assert.equal(installed.includes("core.longpaths"), false);
  assert.ok(notInstalled.includes("core.longpaths"));
  assert.ok(notInstalled.includes("--agent claude"));
  assert.ok(installed.includes("doctor"));
});

test("쿠팡 상세페이지 제작 핵심 팁 10개는 입력과 무관하게 항상 그대로 들어간다", () => {
  const headings = [
    "한 화면에는 하나의 핵심 메시지만 전달한다",
    "경쟁 페이지에서는 문구가 아니라 판매 논리를 참고한다",
    "한글 문장은 의미 단위로 청킹한다",
    "중앙 정렬과 시각적 밀도를 실제 화면에서 검수한다",
    "이미지는 결과를, GIF는 변화를 보여준다",
    "GIF는 첫 프레임과 루프까지 검수한다",
    "생성 이미지에서는 제품 정체성을 고정한다",
    "썸네일은 각각 독립적인 광고로 만든다",
    "모바일 우선 구성",
    "상세페이지 제작 순서를 반드시 지킨다",
  ];
  for (const installed of [true, false]) {
    const prompt = renderBriefPrompt(completeBrief(), { installed });
    for (const heading of headings) {
      assert.ok(prompt.includes(heading), `${heading} 누락 (installed=${installed})`);
    }
    assert.ok(prompt.includes("안티패턴"));
    assert.ok(prompt.includes("HTML부터 먼저 만들지 않는다"));
    assert.ok(prompt.includes("/goal"));
  }
});

test("사용자 값 안의 자리표시자는 2차 치환되지 않는다", () => {
  const prompt = renderBriefPrompt(
    completeBrief({ notes: "{{supplier_url}} 그대로 남아야 한다" }),
    { installed: true },
  );
  assert.ok(prompt.includes("{{supplier_url}} 그대로 남아야 한다"));
});

test("실제 사진이 없으면 프롬프트가 공급처 이미지 기준임을 명시한다", () => {
  const prompt = renderBriefPrompt(completeBrief({ photos: "" }), {
    installed: true,
  });
  assert.ok(prompt.includes("실제 사진:"));
  assert.ok(prompt.includes("없음"));
  assert.ok(prompt.includes("공급처 이미지"));
});

test("추가 의견이 없으면 기본 명령만 남고 빈 항목을 만들지 않는다", () => {
  const prompt = renderBriefPrompt(completeBrief({ notes: "" }), {
    installed: true,
  });
  assert.equal(prompt.includes("추가 의견:\n\n\n"), false);
  assert.ok(prompt.includes("기본 명령"));
});

test("필수 항목이 빠진 브리프로는 프롬프트를 만들지 않는다", () => {
  assert.throws(
    () => renderBriefPrompt(completeBrief({ brand: "" }), { installed: true }),
    /brand/u,
  );
});

test("템플릿 원문은 자리표시자와 블록 마커를 모두 가진다", () => {
  const template = loadBriefPromptTemplate();
  for (const key of BRIEF_FIELDS.map((field) => field.key)) {
    assert.ok(template.includes(`{{${key}}}`), `{{${key}}} 자리표시자가 없다`);
  }
  assert.ok(template.includes("<!--BLOCK:install-->"));
  assert.ok(template.includes("<!--/BLOCK:install-->"));
});
