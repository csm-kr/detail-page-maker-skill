// QA 결과를 게이트가 읽는 형태로 편다.
//
// lean-html-qa 는 오류를 객체로 준다. check.mjs 는 그것을 `join(" · ")` 한다.
// 그대로 넘기면 거부 메시지가 `[object Object]` 가 된다 — 무엇이 틀렸는지 모르는
// 게이트는 게이트가 아니다.

/** `{code, file, width}` → `"CODE file width=1024"`. 코드를 앞에 둔다. */
export function describe(entry) {
  if (typeof entry === "string") return entry;
  const { code, ...rest } = entry ?? {};
  const parts = [code ?? "UNKNOWN"];
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(key === "file" || key === "detail" ? String(value) : `${key}=${value}`);
  }
  return parts.join(" ");
}

export function shapeReport(result, { strictMedia }) {
  return {
    ok: result.ok === true,
    strict_media: strictMedia === true,
    html: result.html ?? null,
    media: result.media ?? { images: 0, gifs: 0 },
    errors: (result.errors ?? []).map(describe),
    warnings: (result.warnings ?? []).map(describe),
    checked_at: new Date().toISOString(),
  };
}
