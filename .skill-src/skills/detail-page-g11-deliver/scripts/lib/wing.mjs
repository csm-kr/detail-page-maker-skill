// Wing 로컬 내보내기의 순수 부분. 브라우저도 파일도 건드리지 않는다 —
// 그래야 회귀를 실행 없이 잡는다.
//
// **왜 로컬인가.** 오케스트레이터의 `lean-wing-export.mjs` 는 Cloudflare Pages config 를
// 먼저 읽고, 그 config 는 서명된 bootstrap receipt 와 실제 자격 증명을 요구한다. 이
// 워크스페이스에는 없고, 공개 CDN 게시는 사용자 승인이 있어야 하는 바깥 방향 행위다.
// 그래서 여기서는 **납품물만** 만든다 — 780px WebP 자산, `<img>` 를 세로로 이은 Wing HTML,
// manifest. 업로드 자리는 manifest 가 `not_configured` 로 비워 둔다. 있지도 않은 주소를
// 적어 두는 것보다 비어 있다고 적는 편이 정직하다.

/** 폭은 계약이다. 부르는 곳이 고르지 않는다. */
export const OUTPUT_WIDTH = 780;

/**
 * 블록을 내보낼 단위로 묶는다.
 *
 * 정지 블록은 **같은 섹션 안에서만** 연달아 붙여 한 장으로 굽고, 모션 블록은 혼자
 * 떨어뜨린다. 섹션을 통째로 한 장으로 구우면 GIF 가 정지 프레임이 되고, 반대로
 * 섹션 경계를 넘어 붙이면 한 장이 다섯 섹션을 덮어 그 장이 어디서 왔는지 말할 수 없다.
 */
export function groupBlocks(blocks) {
  const runs = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const kind = blocks[index].kind === "motion" ? "motion" : "static";
    const last = runs[runs.length - 1];
    const sameSection = last && blocks[last.from].section === blocks[index].section;
    if (kind === "static" && last?.kind === "static" && sameSection) last.to = index;
    else runs.push({ kind, from: index, to: index });
  }
  return runs;
}

/**
 * WebP 의 실제 캔버스 크기. **manifest 가 폭 780 이라고 말하려면 파일에서 재야 한다** —
 * CSS 박스 높이를 그대로 적었더니 ffmpeg 이 짝수로 맞춘 1px 과 GIF 의 실제 높이가
 * 어긋나 세로 합이 862px 늘어났다. WebP 가 아니면 null 이다. 지어내지 않는다.
 */
export function webpSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const tag = buffer.toString("ascii", 12, 16);
  if (tag === "VP8X") {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  if (tag === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (tag === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** 경로가 되는 값이다. 형식을 벗어나면 만들지 않는다. */
export function makeExportId(now, nonce) {
  if (!/^[a-z0-9]{4,24}$/.test(String(nonce))) {
    throw new Error("EXPORT_NONCE_INVALID nonce 는 소문자·숫자 4~24 자다");
  }
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, "$1Z");
  return `wing-${stamp}-${nonce}`;
}

const escapeAlt = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * 쿠팡 Wing 에 붙이는 형태. 이미지만 세로로 잇는다.
 * 주소는 상대 경로다 — CDN 이 없으므로 있지도 않은 https 주소를 쓰지 않는다.
 */
export function wingHtml(assets) {
  const lines = ['<div align="center">'];
  for (const asset of assets) {
    lines.push(`  <img src="assets/${asset.filename}" width="${OUTPUT_WIDTH}" alt="${escapeAlt(asset.alt)}"><br>`);
  }
  lines.push("</div>");
  return `${lines.join("\n")}\n`;
}

/** 자산을 세어 스스로 적는다. 사람이 적은 수를 믿지 않는다. */
export function manifestOf({ exportId, projectKey, source, assets, generatedAt }) {
  const animated = assets.filter((asset) => asset.kind === "motion" && asset.frames >= 2);
  return {
    schema_version: "1.0",
    export_id: exportId,
    project_key: projectKey,
    delivery_format: "coupang-wing-image-only-html",
    render_profile: { css_width: OUTPUT_WIDTH, device_scale_factor: 1 },
    source,
    generated_at: generatedAt,
    assets,
    local_qa: {
      asset_count: assets.length,
      animated_count: animated.length,
      motion_flattened: assets.filter((asset) => asset.kind === "motion" && asset.frames < 2).length,
      all_width_780: assets.every((asset) => asset.width === OUTPUT_WIDTH),
      total_bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    },
    cdn: {
      status: "not_configured",
      note: "Cloudflare Pages config 가 없어 업로드하지 않았다. 자산은 assets/ 에 그대로 있다.",
    },
  };
}
