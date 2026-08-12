// 생성 전 게이트 — references/assets.md 의 배정 단계 규칙을 실행형으로 강제한다.
// 산문 규칙은 읽지 않으면 지켜지지 않으므로, 위반 시 규칙 원문을 함께 출력한다.
import { readFileSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";

const RULE = {
  ratio:
    "assets.md · 출력 비율 — 세로 긴 컷을 만들지 않는다\n" +
    "  생성 비율은 정방형 1:1 과 가로 4:3 두 가지로 고정한다.\n" +
    "  세로형(1080×1350 등)은 만들지 않는다. Hero 의 세로 임팩트는 이미지 비율이\n" +
    "  아니라 HTML 섹션 높이·배경 plate·겹침 레이어로 만든다.",
  motionBackground:
    "assets.md · 출력 비율\n" +
    "  motion 배경은 반드시 정방형이다. motion canvas 는 780×780 고정이고\n" +
    "  `.bg` 가 object-fit: cover 이므로 세로 소스를 넣으면 상하가 잘린다.\n" +
    "  잘림은 렌더 뒤 QA 가 아니라 배정 단계에서 막는다.",
  invariants:
    "assets.md · 생성 전에 상품별 제품 불변 조건을 적어도 네 개 고정한다.\n" +
    "  색, 외형과 비율, 부품 수와 위치, 실제 구성품 등이 이에 해당한다.\n" +
    "  모든 item 은 같은 canonical 제품 참조와 불변 조건을 공유한다.",
  negative:
    "제품 동일성 — 원하는 형태뿐 아니라 틀리기 쉬운 형태를 부정형으로 함께\n" +
    "  지정해야 모든 컷에서 같은 제품이 유지된다. 본체보다 부속품에서 먼저 무너진다.",
  chained:
    "제품 동일성 — 불변 조건은 생성 결과가 아니라 실물 사진이나 공급처 규격 같은\n" +
    "  외부 기준에 고정한다. 직전 생성물을 다음 생성의 기준 레퍼런스로 연쇄\n" +
    "  사용하면 라운드마다 형상 오차가 한 방향으로 누적된다.",
};

// 생성 산출물 경로로 간주하는 조각
const GENERATED_SEGMENTS = [
  "pending", "approved", "rejected", "renders", "cutout",
  "generation", "output",
];

const ALLOWED_RATIOS = [
  { label: "정방형 1:1", value: 1, tolerance: 0.02 },
  { label: "가로 4:3", value: 4 / 3, tolerance: 0.04 },
];

function ratioOf(width, height) {
  return width / height;
}

function classifyRatio(width, height) {
  const r = ratioOf(width, height);
  for (const allowed of ALLOWED_RATIOS) {
    if (Math.abs(r - allowed.value) <= allowed.tolerance) return allowed;
  }
  return null;
}

/** PNG · JPEG · WebP 헤더에서 픽셀 크기를 읽는다. 의존성 없이 최소 구현. */
export function imageSize(filePath) {
  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    return null;
  }
  // PNG
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // WebP (VP8X / VP8 / VP8L)
  if (
    buffer.length > 30 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 ") {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
  }
  // JPEG
  if (buffer.length > 4 && buffer.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function looksGenerated(referencePath) {
  const parts = referencePath.split(/[\\/]/).filter(Boolean);
  return parts.some((part) => GENERATED_SEGMENTS.includes(part.toLowerCase()));
}

function overrideReason(value) {
  if (!value) return null;
  if (typeof value === "object" && typeof value.reason === "string" && value.reason.trim()) {
    return value.reason.trim();
  }
  return null;
}

/**
 * 생성 직전 게이트. 위반이 있으면 규칙 원문과 함께 Error 를 던진다.
 * @param {object} job    validateJob 통과한 정규화 job
 * @param {object} source 원본 job JSON (계약 필드는 여기서 읽는다)
 */
export function preflightImageJob(job, source, baseDirectory = process.cwd()) {
  const failures = [];
  const notes = [];

  // ── 1. 제품 불변 조건 4개 이상 ─────────────────────────────────────────
  const invariants = Array.isArray(source.product_invariants)
    ? source.product_invariants.filter((x) => typeof x === "string" && x.trim())
    : [];
  if (invariants.length < 4) {
    failures.push({
      code: "PRODUCT_INVARIANTS_MISSING",
      message:
        `product_invariants 가 ${invariants.length}개입니다. 최소 4개를 선언해야 합니다.`,
      fix: '작업 JSON 최상위에 "product_invariants": ["색 …", "실루엣과 비율 …", ' +
        '"부품 수와 위치 …", "구성품 …"] 을 추가하세요.',
      rule: RULE.invariants,
    });
  }

  // ── 2. 부정형 제약 ────────────────────────────────────────────────────
  const negatives = Array.isArray(source.negative_constraints)
    ? source.negative_constraints.filter((x) => typeof x === "string" && x.trim())
    : [];
  if (negatives.length === 0) {
    failures.push({
      code: "NEGATIVE_CONSTRAINTS_MISSING",
      message: "negative_constraints 가 비어 있습니다.",
      fix: '작업 JSON 최상위에 "negative_constraints": ["… 금지", "… 추가 금지"] 를 ' +
        "추가하세요. 틀리기 쉬운 형태를 부정형으로 못박습니다.",
      rule: RULE.negative,
    });
  }

  // ── 3. 출력 비율 ──────────────────────────────────────────────────────
  const portraitOverride = overrideReason(source.allow_portrait);
  const sizes = [];
  if (job.size_mode === "controllable" && job.target_size) {
    sizes.push({ label: "target_size", ...job.target_size });
  } else if (job.size_mode === "invariant") {
    const firstRefs = job.mode === "per_item"
      ? job.items.map((item, index) => ({ index, ref: item.references?.[0] }))
      : [{ index: 0, ref: job.references?.[0] }];
    for (const { index, ref } of firstRefs) {
      if (!ref) continue;
      const absolute = resolve(baseDirectory, ref);
      const size = existsSync(absolute) ? imageSize(absolute) : null;
      if (size) sizes.push({ label: `items[${index}] Image 1`, ...size });
      else notes.push(`크기를 읽지 못해 비율 검사를 건너뜀: ${ref}`);
    }
  }
  for (const size of sizes) {
    if (!size.width || !size.height) continue;
    const allowed = classifyRatio(size.width, size.height);
    if (allowed) continue;
    const r = ratioOf(size.width, size.height);
    const isPortrait = r < 1;
    if (isPortrait && portraitOverride) {
      notes.push(`세로형 허용됨 (${size.label} ${size.width}×${size.height}) — 사유: ${portraitOverride}`);
      continue;
    }
    failures.push({
      code: isPortrait ? "PORTRAIT_OUTPUT" : "RATIO_NOT_ALLOWED",
      message:
        `${size.label} ${size.width}×${size.height} (비율 ${r.toFixed(3)}) 는 허용 비율이 아닙니다. ` +
        "정방형 1:1 또는 가로 4:3 만 허용합니다.",
      fix: isPortrait
        ? '세로 임팩트는 이미지가 아니라 HTML 섹션 높이로 만드세요. 꼭 필요하면 ' +
          '"allow_portrait": {"reason": "…"} 로 사유를 남기세요.'
        : "target_size 를 1:1 또는 4:3 으로 맞추세요.",
      rule: RULE.ratio,
    });
  }

  // ── 4. motion 배경은 정방형 ───────────────────────────────────────────
  const motionFlags = job.mode === "per_item"
    ? (source.items ?? []).map((item) => Boolean(item?.motion_background))
    : [Boolean(source.motion_background)];
  motionFlags.forEach((isMotion, index) => {
    if (!isMotion) return;
    const size = sizes[index] ?? sizes[0];
    if (!size) return;
    if (Math.abs(ratioOf(size.width, size.height) - 1) <= 0.02) return;
    failures.push({
      code: "MOTION_BACKGROUND_NOT_SQUARE",
      message:
        `motion 배경으로 지정된 컷(${size.label})이 ${size.width}×${size.height} 로 정방형이 아닙니다.`,
      fix: "motion 배경은 1:1 로 생성하세요. 배정 순서는 motion 확정 → 배경을 정방형으로 " +
        "못박음 → 남은 cut 배분 입니다.",
      rule: RULE.motionBackground,
    });
  });

  // ── 5. 생성물 연쇄 참조 차단 ──────────────────────────────────────────
  const chainOverride = overrideReason(source.identity_anchor_override);
  const allReferences = job.mode === "per_item"
    ? job.items.flatMap((item, index) =>
      (item.references ?? []).map((ref) => ({ ref, where: `items[${index}]` })))
    : (job.references ?? []).map((ref) => ({ ref, where: "references" }));
  const chained = allReferences.filter(({ ref }) => looksGenerated(ref));
  if (chained.length > 0) {
    if (chainOverride) {
      notes.push(
        `생성물 레퍼런스 ${chained.length}건 허용됨 — 사유: ${chainOverride}`,
      );
    } else {
      failures.push({
        code: "CHAINED_GENERATED_REFERENCE",
        message:
          `생성 산출물을 기준 레퍼런스로 사용했습니다 (${chained.length}건): ` +
          chained.slice(0, 3).map(({ ref, where }) => `${where} → ${ref}`).join(", ") +
          (chained.length > 3 ? " …" : ""),
        fix: "input/product 의 실물 사진이나 공급처 SSOT 를 Image 1 로 쓰세요. " +
          '의도적인 연쇄라면 "identity_anchor_override": {"reason": "…"} 로 사유를 남기세요.',
        rule: RULE.chained,
      });
    }
  }

  return { ok: failures.length === 0, failures, notes };
}

export function formatPreflight(result) {
  const lines = [];
  for (const note of result.notes) lines.push(`  · ${note}`);
  if (result.ok) {
    lines.unshift("생성 전 게이트 통과");
    return lines.join("\n");
  }
  lines.unshift(`생성 전 게이트 실패 — ${result.failures.length}건`);
  for (const failure of result.failures) {
    lines.push("");
    lines.push(`  [${failure.code}] ${failure.message}`);
    lines.push(`  고치는 법: ${failure.fix}`);
    lines.push("  근거 규칙:");
    for (const line of failure.rule.split("\n")) lines.push(`    ${line}`);
  }
  return lines.join("\n");
}
