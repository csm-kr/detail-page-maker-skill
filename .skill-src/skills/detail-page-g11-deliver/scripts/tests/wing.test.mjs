// Wing 로컬 내보내기의 순수 부분 단위 테스트.
//
// 4회차 실측이 만든 규칙 두 가지를 여기서 지킨다.
//
//   1. 모션 블록은 **따로 떼어** animated WebP 로 남긴다. 섹션을 통째로 한 장으로 구우면
//      GIF 가 정지 프레임이 된다 — G8 이 구운 10개가 조용히 사라진다.
//   2. namespace 는 덮어쓰지 않는다. 같은 id 를 두 번 쓰면 앞의 납품본이 없어진다.

import assert from "node:assert/strict";
import test from "node:test";

import { groupBlocks, makeExportId, manifestOf, webpSize, wingHtml } from "../lib/wing.mjs";

/** 애니메이션 WebP 의 VP8X 캔버스 헤더. 폭·높이를 1 뺀 24비트 리틀엔디안으로 담는다. */
function vp8x(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

/** 손실 압축 정지 WebP 의 프레임 헤더. 14비트씩 담는다. */
function vp8(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8 ", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

const B = (kind, section = "s-one") => ({ kind, section });

test("연속한 정지 블록은 한 장으로 묶는다", () => {
  const runs = groupBlocks([B("static"), B("static"), B("static")]);
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], { kind: "static", from: 0, to: 2 });
});

test("섹션이 바뀌면 묶지 않는다 — 한 장이 여러 섹션을 덮으면 그 장의 출처를 말할 수 없다", () => {
  const runs = groupBlocks([B("static", "s-spec"), B("static", "s-spec"), B("static", "s-caution")]);
  assert.deepEqual(runs, [
    { kind: "static", from: 0, to: 1 },
    { kind: "static", from: 2, to: 2 },
  ]);
});

test("모션 블록은 혼자 떨어져 나온다", () => {
  const runs = groupBlocks([B("static"), B("static"), B("motion"), B("static")]);
  assert.deepEqual(runs, [
    { kind: "static", from: 0, to: 1 },
    { kind: "motion", from: 2, to: 2 },
    { kind: "static", from: 3, to: 3 },
  ]);
});

test("모션이 연달아 있으면 각각 한 장이다 — 두 GIF 를 한 장에 담을 수 없다", () => {
  const runs = groupBlocks([B("motion"), B("motion")]);
  assert.deepEqual(runs, [
    { kind: "motion", from: 0, to: 0 },
    { kind: "motion", from: 1, to: 1 },
  ]);
});

test("블록이 없으면 아무 장도 만들지 않는다", () => {
  assert.deepEqual(groupBlocks([]), []);
});

test("export id 는 시각과 nonce 를 담고 경로로 쓸 수 있다", () => {
  const id = makeExportId(new Date("2026-08-06T11:22:33.000Z"), "ab12cd");
  assert.equal(id, "wing-20260806T112233000Z-ab12cd");
  // 경로 한 칸으로 안전한 글자만. ISO 의 T·Z 는 대문자로 남는다.
  assert.match(id, /^[A-Za-z0-9-]+$/);
});

test("nonce 가 형식을 벗어나면 거부한다 — 경로를 만드는 값이다", () => {
  assert.throws(() => makeExportId(new Date("2026-08-06T11:22:33.000Z"), "../evil"), /EXPORT_NONCE_INVALID/);
});

test("Wing HTML 은 780px img 를 세로로 잇고 상대 경로를 쓴다", () => {
  const html = wingHtml([
    { filename: "block-01.webp", alt: "걸어두면 완벽 포획" },
    { filename: "block-02.webp", alt: "붙으면 절대 안떨어짐" },
  ]);
  assert.match(html, /<img src="assets\/block-01\.webp" width="780" alt="걸어두면 완벽 포획">/);
  assert.equal((html.match(/<img /g) || []).length, 2);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("alt 의 따옴표와 꺾쇠는 이스케이프한다", () => {
  const html = wingHtml([{ filename: "a.webp", alt: '따옴표" 와 <꺾쇠>' }]);
  assert.match(html, /alt="따옴표&quot; 와 &lt;꺾쇠&gt;">/);
});

test("WebP 크기는 파일에서 읽는다 — 움직이는 것도 정지한 것도", () => {
  assert.deepEqual(webpSize(vp8x(780, 520)), { width: 780, height: 520 });
  assert.deepEqual(webpSize(vp8(780, 3606)), { width: 780, height: 3606 });
});

test("WebP 가 아니면 크기를 지어내지 않는다", () => {
  assert.equal(webpSize(Buffer.from("아무것도 아니다")), null);
});

test("manifest 는 폭·용량·모션 수를 스스로 센다", () => {
  const manifest = manifestOf({
    exportId: "wing-20260806T112233000Z-ab12cd",
    projectKey: "해충끈끈이",
    source: { path: "output/detail-page.html", sha256: "a".repeat(64), bytes: 100 },
    generatedAt: "2026-08-06T11:22:33Z",
    assets: [
      { filename: "block-01.webp", kind: "static", width: 780, bytes: 100, frames: 1 },
      { filename: "block-02.webp", kind: "motion", width: 780, bytes: 200, frames: 24 },
    ],
  });
  assert.equal(manifest.local_qa.asset_count, 2);
  assert.equal(manifest.local_qa.animated_count, 1);
  assert.equal(manifest.local_qa.all_width_780, true);
  assert.equal(manifest.local_qa.total_bytes, 300);
  assert.equal(manifest.cdn.status, "not_configured");
});

test("폭이 780 이 아닌 자산이 섞이면 manifest 가 그것을 참이라고 하지 않는다", () => {
  const manifest = manifestOf({
    exportId: "wing-20260806T112233000Z-ab12cd",
    projectKey: "p",
    source: { path: "output/detail-page.html", sha256: "a".repeat(64), bytes: 1 },
    generatedAt: "2026-08-06T11:22:33Z",
    assets: [{ filename: "a.webp", kind: "static", width: 390, bytes: 1, frames: 1 }],
  });
  assert.equal(manifest.local_qa.all_width_780, false);
});

test("모션 자산의 프레임이 2 미만이면 manifest 가 정지본이라고 말한다", () => {
  const manifest = manifestOf({
    exportId: "wing-20260806T112233000Z-ab12cd",
    projectKey: "p",
    source: { path: "output/detail-page.html", sha256: "a".repeat(64), bytes: 1 },
    generatedAt: "2026-08-06T11:22:33Z",
    assets: [{ filename: "a.webp", kind: "motion", width: 780, bytes: 1, frames: 1 }],
  });
  assert.equal(manifest.local_qa.animated_count, 0);
  assert.equal(manifest.local_qa.motion_flattened, 1);
});
