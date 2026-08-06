// hyperframes 컴포지션 계약 — 프레임을 무엇으로 찍는가.
//
// 3회차: hyperframes 가 240초에 타임아웃 → Chrome `?f=N` 으로 우회 → 우회가 굳었다.
// 4회차 실측: CLI 는 살아 있고 `snapshot` 이 12프레임을 **7.1초**에 준다
// (Chrome 은 프로세스 12번, 약 11초). 240초는 Chrome 을 내려받은 시간이었다.
//
// 그래서 컴포지션을 hyperframes 계약으로 쓴다. 계약을 지켜야 48개 규칙을 쓸 수 있다.

import assert from "node:assert/strict";
import test from "node:test";

import {
  COMP_SIZE,
  STILL_MOTION_FRAMES,
  compUsesStill,
  compositionConfig,
  compositionAssets,
  scaffoldStillMotion,
  snapshotTimes,
  TIMELINE_SEC,
} from "../lib/motion.mjs";

const BRIEF = {
  id: "g01",
  pattern: "reveal",
  source_still: "c07",
  frames: ["접착면", "부착"],
};

const html = (overrides = {}) => scaffoldStillMotion({ brief: { ...BRIEF, ...overrides } });

test("샘플 시각은 0 부터 끝까지 **양 끝을 포함**한다", () => {
  // hyperframes 의 기본 --frames N 은 마지막을 9.7/10 에서 찍는다. 그러면 결과 상태에
  // 도달하지 못한 프레임이 마지막이 되고, "결과를 1초 유지한다"(MR-006)가 깨진다.
  const times = snapshotTimes(5, 1.2);
  assert.equal(times.length, 5);
  assert.equal(times[0], 0);
  assert.equal(times[4], 1.2);
  assert.deepEqual(times, [0, 0.3, 0.6, 0.9, 1.2]);
});

test("샘플 시각은 프레임이 하나여도 무너지지 않는다", () => {
  assert.deepEqual(snapshotTimes(1, 1.2), [0]);
});

test("컴포지션이 hyperframes 계약을 지킨다", () => {
  const out = html();
  assert.match(out, /data-composition-id="main"/);
  assert.match(out, new RegExp(`data-width="${COMP_SIZE.width}"`));
  assert.match(out, new RegExp(`data-height="${COMP_SIZE.height}"`));
  assert.match(out, new RegExp(`data-duration="${TIMELINE_SEC}"`));
  // 일시정지된 타임라인 하나. 자동 재생하지 않고 두 번째 타임라인을 만들지 않는다.
  assert.match(out, /window\.__timelines\["main"\]\s*=/);
  assert.match(out, /gsap\.timeline\(\{\s*paused:\s*true\s*\}\)/);
  assert.equal((out.match(/gsap\.timeline\(/g) ?? []).length, 1, "타임라인이 둘 이상이다");
});

test("클립이 최소 하나 있다", () => {
  // 계약: "At least one clip (any element with data-start, data-duration, data-track-index)".
  // 이걸 빠뜨렸더니 12프레임이 **전부 같은 그림**이었다. 타임라인이 아예 안 걸린다.
  const out = html();
  assert.match(out, /class="clip"/);
  assert.match(out, /data-track-index="1"/);
  const clip = /<div class="clip"[^>]*>/.exec(out)?.[0] ?? "";
  assert.match(clip, /data-start="0"/);
  assert.match(clip, new RegExp(`data-duration="${TIMELINE_SEC}"`));
});

test("결정론 — 시각의 순함수다", () => {
  const out = html();
  for (const banned of ["Math.random", "Date.now", "new Date", "setTimeout", "requestAnimationFrame"]) {
    assert.ok(!out.includes(banned), `결정론을 깨는 것이 있다: ${banned}`);
  }
  // `?f=N` 은 더 이상 안 쓴다. 시각은 스냅샷이 준다.
  assert.ok(!out.includes("location.search"), "아직 쿼리로 프레임을 받는다");
});

test("레이아웃 속성을 트윈하지 않는다", () => {
  // hyperframes 규칙이다. 옛 `measure` 패턴은 rule.style.height 를 트윈했다 —
  // 규칙을 안 읽어서 어겼다. 이제 scaleY 다.
  for (const pattern of ["reveal", "zoom", "sequence", "measure"]) {
    const out = html({ pattern });
    const script = out.split("<script>").pop();
    for (const property of ["height:", "width:", "top:", "left:"]) {
      assert.ok(
        !new RegExp(`(?:to|from|fromTo|set)\\([^)]*${property}`).test(script),
        `${pattern} 이 레이아웃 속성을 트윈한다: ${property}`,
      );
    }
  }
});

test("스틸이 여전히 들어간다 — 도형에 애니메이션을 걸지 않는다", () => {
  const out = html();
  assert.ok(compUsesStill(out, "c07"), "발행된 스틸이 컴포지션에 없다");
});

test("모르는 패턴은 거부한다", () => {
  assert.throws(() => html({ pattern: "쿵쾅" }), /UNKNOWN_PATTERN/);
  assert.throws(() => html({ pattern: undefined }), /UNKNOWN_PATTERN/);
});

test("source_still 이 없으면 거부한다", () => {
  assert.throws(() => html({ source_still: null }), /SOURCE_STILL_MISSING/);
});

test("gsap 은 로컬에서 해석한다 — 렌더가 인터넷을 타지 않는다", () => {
  // 회차 재현은 워크스페이스 안에서 닫혀야 한다 (ADR-0004: 런타임은 로컬).
  const out = html();
  assert.ok(!/https?:\/\/[^"']*gsap/.test(out), "gsap 을 CDN 에서 받는다");
  assert.match(out, /src="[^"]*gsap[^"]*\.js"/);
});

test("컴포지션 안의 경로는 밖으로 나가지 않는다", () => {
  // hyperframes 는 **컴포지션 디렉터리를 웹 루트로 서빙하고 `../` 를 거부한다.**
  //   [StaticGuard] Found 2 asset path(s) traversing above the project root with "../"
  //   ✗ 404 loading motion/node_modules/gsap/dist/gsap.min.js
  //   ✗ gsap is not defined
  // 그래서 12프레임이 전부 같은 그림이었는데 **렌더는 성공이라고 했다.**
  // 조용히 같은 그림이 나오는 실패다. 자산은 컴포지션 안으로 복사한다.
  const out = html();
  const refs = [...out.matchAll(/(?:src|href|url\()["']?([^"')\s]+)/g)].map((m) => m[1]);
  const escaping = refs.filter((ref) => ref.includes("../"));
  assert.deepEqual(escaping, [], "컴포지션 밖을 가리키는 경로가 있다");
});

test("컴포지션이 자기 자산 목록을 말한다", () => {
  // --scaffold 가 무엇을 복사해야 하는지 조립기가 안다. 두 곳에 적으면 갈린다.
  const assets = compositionAssets({ id: "g01", source_still: "c07" }, ".webp");
  assert.deepEqual(
    assets.map((a) => a.as),
    ["gsap.min.js", "font.ttf", "c07.webp"],
  );
  // 스틸 파일 이름에 컷 id 가 남는다 — comp↔컷 대응을 게이트가 이것으로 본다.
  assert.ok(compUsesStill(html(), "c07"));
});

test("한글 자막에 @font-face 가 붙는다", () => {
  // validate 경고: "Font families used without @font-face declaration: noto sans kr".
  // 없으면 렌더러가 일반 폰트로 떨어뜨린다 — 자막이 다른 글꼴로 나온다.
  const out = html();
  assert.match(out, /@font-face/);
  assert.match(out, /src:\s*url\("\.\/font\.ttf"\)/);
});

test("컴포지션 설정이 프레임 디렉터리를 가리킨다", () => {
  const config = compositionConfig();
  assert.equal(config.paths.blocks, ".");
  assert.ok(config.$schema, "스키마가 없으면 CLI 가 프로젝트로 인식하지 않는다");
});

test("자막은 타임라인 위에 놓인다", () => {
  const out = scaffoldStillMotion({ brief: BRIEF, subtitles: ["접착면", "부착"] });
  assert.match(out, /접착면/);
  assert.match(out, /부착/);
  // 자막 교체는 트윈이 아니라 set 이다. 글자가 흐려지며 바뀌면 못 읽는다.
  assert.match(out, /tl\.set\(/);
});

test("기본 프레임 수와 타임라인 길이가 짝이다", () => {
  assert.equal(STILL_MOTION_FRAMES, 12);
  assert.equal(snapshotTimes(STILL_MOTION_FRAMES, TIMELINE_SEC).length, STILL_MOTION_FRAMES);
});
