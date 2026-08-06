// GIF 의 입력은 **이미지**다.
//
// 1회차: 컴포지션 10개 전부 `<img>` 가 0건이었다. CSS 사각형에 애니메이션을 걸었고,
// 그래서 "상업적 이미지" 가 아니라 도형이 움직이는 화면이 나왔다.
// god-tibo 는 스틸을 레퍼런스로 연속 프레임 GIF 를 만드는 경로를 이미 갖고 있었는데
// 한 번도 쓰이지 않았다.

import assert from "node:assert/strict";
import test from "node:test";

import {
  METHODS,
  compUsesStill,
  scaffoldStillMotion,
  stillHref,
  tiboSequenceJob,
} from "../lib/motion.mjs";

const BRIEF = {
  id: "gif-01",
  method: "still-motion",
  source_still: "cut-03",
  pattern: "reveal",
  question: "얼마나 붙나",
  frames: ["보호막을 벗긴다", "점착면이 드러난다", "벌레가 붙는다"],
};

test("수단은 두 가지뿐이다", () => {
  assert.deepEqual(METHODS, ["still-motion", "tibo-sequence"]);
});

test("컴포지션 안에서의 스틸 이름", () => {
  // hyperframes 는 컴포지션 디렉터리를 웹 루트로 서빙하고 `../` 를 거부한다.
  // 스틸은 --scaffold 가 안으로 복사하고, 파일 이름에 컷 id 를 남긴다.
  assert.equal(stillHref("cut-03", ".webp"), "./cut-03.webp");
});

test("scaffold 가 스틸을 실제 이미지로 넣는다", () => {
  const html = scaffoldStillMotion({ brief: BRIEF, imageExt: ".webp", subtitles: ["점착면"] });
  assert.match(html, /<img[^>]+src="\.\/cut-03\.webp"/);
});

test("scaffold 가 자막을 넣는다", () => {
  const html = scaffoldStillMotion({ brief: BRIEF, imageExt: ".webp", subtitles: ["점착면", "보호막"] });
  assert.match(html, /점착면/);
  assert.match(html, /보호막/);
});

test("모르는 패턴은 거부한다", () => {
  assert.throws(
    () => scaffoldStillMotion({ brief: { ...BRIEF, pattern: "번쩍" }, imageExt: ".webp" }),
    /UNKNOWN_PATTERN/,
  );
});

test("이미지가 없는 컴포지션을 잡는다", () => {
  // 1회차 컴포지션의 실제 모양이다.
  const shapesOnly = `<div style="width:150px;height:230px;background:#ECC623"></div>`;
  assert.equal(compUsesStill(shapesOnly, "cut-03"), false);
});

test("다른 컷을 쓴 컴포지션도 잡는다", () => {
  const wrong = `<img src="./cut-99.webp">`;
  assert.equal(compUsesStill(wrong, "cut-03"), false);
  assert.equal(compUsesStill(wrong, "cut-99"), true);
});

test("연속 프레임 작업은 스틸을 첫 레퍼런스로 쓴다", () => {
  const job = tiboSequenceJob({
    brief: { ...BRIEF, method: "tibo-sequence" },
    stillPath: "/p/output/media/images/cut-03.webp",
    outputDir: "/p/work/comps/gif-01",
    targetSize: "780x520",
  });
  assert.deepEqual(job.references, ["/p/output/media/images/cut-03.webp"]);
});

test("연속 프레임 작업은 프레임까지만 받고 조립은 요청하지 않는다", () => {
  // god-tibo 의 GIF 조립기는 일정 fps 로만 이어 붙인다. 프레임마다 머무는 시간을 줄 수 없어
  // 3회차에 3장이 0.48초에 지나갔다. 조립은 `lib/gifasm.mjs` 가 한다.
  const job = tiboSequenceJob({
    brief: { ...BRIEF, method: "tibo-sequence" },
    stillPath: "/p/still.webp",
    outputDir: "/p/out",
    targetSize: "780x520",
  });
  assert.equal(job.prompts.length, 3);
  assert.ok(!("gif" in job), "god-tibo 에게 GIF 조립을 맡기면 속도를 제어할 수 없다");
  assert.ok(job.prompts.every((p) => /No text/i.test(p)), "문자 금지가 빠졌다");
});

test("프레임 지시가 2개 미만이면 연속 프레임을 만들지 않는다", () => {
  assert.throws(
    () =>
      tiboSequenceJob({
        brief: { ...BRIEF, method: "tibo-sequence", frames: ["한 장"] },
        stillPath: "/p/still.webp",
        outputDir: "/p/out",
        targetSize: "780x520",
      }),
    /TOO_FEW_FRAMES/,
  );
});

test("reveal 은 첫 프레임을 통째로 가리지 않는다", () => {
  // 1회차 검증에서 gif-02 의 첫 프레임이 완전 검정으로 나왔다.
  // 모든 GIF 의 첫 프레임에는 제품이 보여야 한다.
  const html = scaffoldStillMotion({ brief: BRIEF, imageExt: ".webp" });
  const start = /tl\.set\(veil, \{ opacity: [\d.]+, xPercent: (\d+) \}/.exec(html);
  assert.ok(start, "reveal 의 시작 위치를 읽을 수 없다");
  assert.ok(Number(start[1]) > 0, "첫 프레임이 화면 전체를 덮는다");
});
